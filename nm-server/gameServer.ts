import express from 'express';
import { createServer } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { Server } from 'socket.io';
import type { GameState, GameView, PlayerId, Session } from '../shared/types';
import { createInitialBoard } from '../shared/board';
import { validateFleet } from '../shared/setup';
import { applyMove } from '../shared/gameState';
import { playerView } from '../shared/view';
import { isMoveAction, isRecord } from '../shared/validation';

type Member = { token: string; socketId: string | null; disconnectedAt: number | null };
type Room = { state: GameState; players: Partial<Record<PlayerId, Member>>;
  ready: Record<PlayerId, boolean>; actions: Map<string, string>; touchedAt: number };
type Options = { graceMs?: number; idleMs?: number; maxRooms?: number; sweepMs?: number };
const other = (role: PlayerId): PlayerId => role === 'a' ? 'b' : 'a';
const requireObject = (value: unknown) => {
  if (!isRecord(value)) throw new Error('Nieprawidłowy komunikat.');
  return value;
};

export function createGameServer(options: Options = {}) {
  const app = express();
  app.get('/health', (_req, res) => res.json({ ok: true }));
  const httpServer = createServer(app);
  const origins = process.env.ALLOWED_ORIGINS?.split(',').map(s => s.trim()).filter(Boolean);
  const io = new Server(httpServer, { cors: { origin: origins?.length ? origins : '*', methods: ['GET', 'POST'] }, maxHttpBufferSize: 32_768 });
  const rooms = new Map<string, Room>();
  const membership = new Map<string, { roomId: string; role: PlayerId }>();
  const addresses = new Map<string, { sockets: number; created: number; window: number }>();
  const graceMs = options.graceMs ?? 120_000;
  const idleMs = options.idleMs ?? 60 * 60_000;
  const connected = (room: Room): GameView['connected'] => ({ a: !!room.players.a?.socketId, b: !!room.players.b?.socketId });
  const view = (room: Room, role: PlayerId) => playerView(room.state, role, room.ready, connected(room));
  const publish = (room: Room) => {
    for (const role of ['a', 'b'] as const) {
      const id = room.players[role]?.socketId;
      if (id) io.to(id).emit('state', view(room, role));
    }
  };
  const closeRoom = (room: Room, reason: string) => {
    for (const member of Object.values(room.players)) {
      if (member?.socketId) {
        io.to(member.socketId).emit('room_closed', { roomId: room.state.roomId, gameId: room.state.gameId, reason });
        membership.delete(member.socketId);
      }
    }
    rooms.delete(room.state.roomId);
  };
  const depart = (room: Room, role: PlayerId) => {
    const member = room.players[role];
    if (member?.socketId) membership.delete(member.socketId);
    delete room.players[role];
    if (room.state.phase === 'lobby' || room.state.phase === 'setup') {
      closeRoom(room, 'Gracz opuścił przygotowania. Utwórz nowy pokój.');
      return;
    }
    if (room.state.phase === 'playing') {
      room.state.phase = 'finished';
      room.state.winnerId = other(role);
      room.state.logs.push(`Gracz ${role.toUpperCase()} opuścił partię. Zwycięża ${other(role).toUpperCase()}.`);
    }
    room.state.revision++;
    room.touchedAt = Date.now();
    if (!room.players.a && !room.players.b) rooms.delete(room.state.roomId);
    else publish(room);
  };
  const sweep = () => {
    const now = Date.now();
    for (const room of rooms.values()) {
      if (now - room.touchedAt > idleMs) { closeRoom(room, 'Pokój wygasł z powodu bezczynności.'); continue; }
      const expired = (['a', 'b'] as const).filter(role => {
        const p = room.players[role];
        return p?.disconnectedAt != null && now - p.disconnectedAt >= graceMs;
      });
      if (expired.length === 2) { closeRoom(room, 'Obaj gracze utracili połączenie.'); continue; }
      for (const role of expired) depart(room, role);
    }
    for (const [address, bucket] of addresses) if (bucket.sockets === 0 && now - bucket.window > 60_000) addresses.delete(address);
  };
  const timer = setInterval(sweep, options.sweepMs ?? 10_000);
  timer.unref();
  io.use((socket, next) => {
    const address = socket.handshake.address;
    const bucket = addresses.get(address) ?? { sockets: 0, created: 0, window: Date.now() };
    if (bucket.sockets >= 20 || addresses.size >= 10_000 && !addresses.has(address)) return next(new Error('Zbyt wiele połączeń.'));
    bucket.sockets++;
    addresses.set(address, bucket);
    next();
  });
  io.on('connection', socket => {
    let calls = 0;
    let windowStart = Date.now();
    const getRoom = (input: unknown) => {
      const data = requireObject(input);
      const seat = membership.get(socket.id);
      if (!seat || data.roomId !== seat.roomId) throw new Error('Nie jesteś uczestnikiem tego pokoju.');
      const room = rooms.get(seat.roomId);
      if (!room || data.gameId !== room.state.gameId || room.players[seat.role]?.socketId !== socket.id) throw new Error('Sesja partii jest nieaktualna.');
      return { room, role: seat.role, data };
    };
    const enter = (room: Room, role: PlayerId) => {
      const member: Member = { token: randomBytes(32).toString('hex'), socketId: socket.id, disconnectedAt: null };
      room.players[role] = member;
      membership.set(socket.id, { roomId: room.state.roomId, role });
      const session: Session = { roomId: room.state.roomId, gameId: room.state.gameId, playerId: role, token: member.token };
      room.state.revision++;
      room.touchedAt = Date.now();
      publish(room);
      return { session, state: view(room, role) };
    };
    const handlers: Record<string, (data: unknown) => unknown> = {
      create_room(input) {
        const data = requireObject(input);
        if (Object.keys(data).some(key => key !== 'trailsEnabled') || ('trailsEnabled' in data && typeof data.trailsEnabled !== 'boolean')) throw new Error('Nieprawidłowe ustawienia pokoju.');
        if (membership.has(socket.id)) throw new Error('Najpierw opuść obecny pokój.');
        sweep();
        if (rooms.size >= (options.maxRooms ?? 1000)) throw new Error('Serwer osiągnął limit pokoi.');
        const bucket = addresses.get(socket.handshake.address)!;
        if (Date.now() - bucket.window > 60_000) { bucket.window = Date.now(); bucket.created = 0; }
        if (++bucket.created > 5) throw new Error('Zbyt wiele nowych pokoi. Spróbuj za minutę.');
        let roomId: string;
        do { roomId = randomBytes(4).toString('hex').toUpperCase(); } while (rooms.has(roomId));
        const room: Room = { state: { roomId, gameId: randomUUID(), revision: 0, board: createInitialBoard(), units: [], turn: 1, activePlayerId: 'a', phase: 'lobby', winnerId: null, logs: [] }, players: {}, ready: { a: false, b: false }, actions: new Map(), touchedAt: Date.now() };
        room.state.trailsEnabled = data.trailsEnabled !== false;
        rooms.set(roomId, room);
        return enter(room, 'a');
      },
      join_room(input) {
        const data = requireObject(input);
        if (typeof data.roomId !== 'string' || !/^[A-F0-9]{8}$/.test(data.roomId)) throw new Error('Nieprawidłowy kod pokoju.');
        if (membership.has(socket.id)) throw new Error('Najpierw opuść obecny pokój.');
        const room = rooms.get(data.roomId);
        if (!room || room.state.phase !== 'lobby' || room.players.b || !room.players.a?.socketId) throw new Error('Pokój nie istnieje lub nie jest dostępny.');
        room.state.phase = 'setup';
        return enter(room, 'b');
      },
      resume_session(input) {
        const data = requireObject(input);
        if (typeof data.roomId !== 'string' || typeof data.token !== 'string' || !/^[a-f0-9]{64}$/.test(data.token) || (data.playerId !== 'a' && data.playerId !== 'b')) throw new Error('Nieprawidłowa sesja.');
        if (membership.has(socket.id)) throw new Error('Połączenie ma już aktywną sesję.');
        const room = rooms.get(data.roomId);
        const role = data.playerId;
        const member = room?.players[role];
        if (!room || room.state.gameId !== data.gameId || !member || member.token !== data.token || (member.disconnectedAt !== null && Date.now() - member.disconnectedAt >= graceMs)) throw new Error('Sesja wygasła.');
        // A refresh can precede the old transport's disconnect notification.
        if (member.socketId) {
          const previous = member.socketId;
          membership.delete(previous);
          io.to(previous).emit('room_closed', { roomId: room.state.roomId, gameId: room.state.gameId, reason: 'Sesję wznowiono w innym połączeniu.' });
          io.sockets.sockets.get(previous)?.disconnect(true);
        }
        member.socketId = socket.id;
        member.disconnectedAt = null;
        membership.set(socket.id, { roomId: room.state.roomId, role });
        room.state.revision++;
        room.touchedAt = Date.now();
        publish(room);
        return { session: { roomId: room.state.roomId, gameId: room.state.gameId, playerId: role, token: member.token }, state: view(room, role) };
      },
      submit_fleet(input) {
        const { room, role, data } = getRoom(input);
        if (room.ready[role]) return view(room, role);
        if (room.state.phase !== 'setup') throw new Error('Nie można teraz zgłosić floty.');
        if (data.role !== undefined && data.role !== role) throw new Error('Nieprawidłowy właściciel floty.');
        const result = validateFleet(data.fleet, room.state.board, role);
        if (!result.ok) throw new Error(result.error);
        room.state.units.push(...result.units.map(u => ({ ...u, id: randomUUID() })));
        room.ready[role] = true;
        room.state.revision++;
        room.touchedAt = Date.now();
        if (room.ready.a && room.ready.b) { room.state.phase = 'playing'; room.state.logs.push('Rozpoczęto partię.'); }
        publish(room);
        return view(room, role);
      },
      game_action(input) {
        const { room, role, data } = getRoom(input);
        if (typeof data.actionId !== 'string' || !/^[\w-]{16,80}$/.test(data.actionId) || !Number.isSafeInteger(data.expectedRevision) || !isMoveAction(data.action)) throw new Error('Nieprawidłowa akcja.');
        const key = `${role}:${data.actionId}`;
        const fingerprint = JSON.stringify({ revision: data.expectedRevision, action: data.action });
        if (room.actions.has(key)) {
          if (room.actions.get(key) !== fingerprint) throw new Error('Identyfikator akcji został już użyty.');
          return view(room, role);
        }
        if (!room.players.a?.socketId || !room.players.b?.socketId) throw new Error('Oczekiwanie na ponowne połączenie przeciwnika.');
        if (data.expectedRevision !== room.state.revision) { socket.emit('state', view(room, role)); throw new Error('Stan partii uległ zmianie. Wybierz ruch ponownie.'); }
        // Synchronous validation and commit serialize actions for this room.
        const result = applyMove(room.state, data.action, role);
        if (result.error) throw new Error(result.error);
        // Assign opaque IDs at the authoritative boundary, including newly laid mines.
        const existingIds = new Set(room.state.units.map(u => u.id));
        for (const unit of result.newState.units) if (!existingIds.has(unit.id)) unit.id = randomUUID();
        room.state = result.newState;
        room.touchedAt = Date.now();
        room.actions.set(key, fingerprint);
        if (room.actions.size > 256) room.actions.delete(room.actions.keys().next().value!);
        publish(room);
        return view(room, role);
      },
      sync_state(input) { const { room, role } = getRoom(input); return view(room, role); },
      leave_room(input) { const { room, role } = getRoom(input); depart(room, role); },
    };
    for (const [event, handler] of Object.entries(handlers)) {
      socket.on(event, (data: unknown, ack: unknown) => {
        if (typeof ack !== 'function') return;
        try {
          if (Date.now() - windowStart >= 10_000) { calls = 0; windowStart = Date.now(); }
          if (++calls > 80) throw new Error('Zbyt wiele żądań. Spróbuj ponownie za chwilę.');
          ack({ ok: true, data: handler(data) });
        } catch (error) { ack({ ok: false, error: error instanceof Error ? error.message : 'Nie można wykonać operacji.' }); }
      });
    }
    socket.on('disconnect', () => {
      const bucket = addresses.get(socket.handshake.address);
      if (bucket) bucket.sockets = Math.max(0, bucket.sockets - 1);
      const seat = membership.get(socket.id);
      membership.delete(socket.id);
      if (!seat) return;
      const room = rooms.get(seat.roomId);
      const member = room?.players[seat.role];
      if (!room || !member || member.socketId !== socket.id) return;
      member.socketId = null;
      member.disconnectedAt = Date.now();
      room.state.revision++;
      publish(room);
    });
  });
  return { httpServer, io, close: () => new Promise<void>(resolve => { clearInterval(timer); io.close(() => resolve()); }) };
}
