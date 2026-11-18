import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { once as nodeOnce } from 'node:events';
import { randomUUID } from 'node:crypto';
import { io, type Socket } from 'socket.io-client';
import { createGameServer } from '../gameServer';
import type { GameView, Reply, Session } from '../../shared/types';
import { getLegalMoves } from '../../shared/movement';
import { fleet } from './fixtures';
import { NetworkClient } from '../../nm-game/src/network';

function socketOnce(socket: Socket, event: string): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { cleanup(); reject(new Error(`Timed out waiting for ${event}`)); }, 3000);
    const done = (...args: unknown[]) => { cleanup(); resolve(args); };
    const failed = (error: Error) => { cleanup(); reject(error); };
    const cleanup = () => { clearTimeout(timer); socket.off(event, done); socket.off('connect_error', failed); };
    socket.once(event, done); socket.once('connect_error', failed);
  });
}

type Joined = { session: Session; state: GameView };
type Identity = { roomId: string; gameId: string };
function request<T>(socket: Socket, event: string, payload: unknown): Promise<Reply<T>> {
  return new Promise((resolve, reject) => socket.timeout(2000).emit(event, payload, (error: Error | null, result: Reply<T>) => error ? reject(error) : resolve(result)));
}
async function ok<T>(socket: Socket, event: string, payload: unknown): Promise<T> {
  const result = await request<T>(socket, event, payload); assert.ok(result.ok, result.ok ? '' : result.error); return result.data;
}
const identity = (s: Session): Identity => ({ roomId: s.roomId, gameId: s.gameId });
async function harness(t: TestContext, options: Parameters<typeof createGameServer>[0] = {}, settings: {trailsEnabled?: boolean} = {}) {
  const server = createGameServer(options);
  server.httpServer.listen(0, '127.0.0.1'); await nodeOnce(server.httpServer, 'listening');
  const address = server.httpServer.address(); assert.ok(address && typeof address === 'object');
  const url = `http://127.0.0.1:${address.port}`;
  const sockets: Socket[] = [];
  t.after(async () => { for (const socket of sockets) socket.disconnect(); await server.close(); });
  const connect = async () => {
    const socket = io(url, { transports: ['websocket'], reconnection: false }); sockets.push(socket);
    await socketOnce(socket, 'connect'); return socket;
  };
  const a = await connect(); const b = await connect();
  const joinedA = await ok<Joined>(a, 'create_room', settings);
  const joinedB = await ok<Joined>(b, 'join_room', { roomId: joinedA.session.roomId });
  const room = identity(joinedA.session);
  const start = async () => {
    await ok(a, 'submit_fleet', { ...room, fleet: fleet('a') });
    await ok(b, 'submit_fleet', { ...room, fleet: fleet('b') });
    return await ok<GameView>(a, 'sync_state', room);
  };
  return { server, url, sockets, a, b, joinedA, joinedB, room, connect, start };
}
function legalAction(state: GameView) {
  for (const unit of state.units.filter(u => u.alive && u.ownerId === state.activePlayerId)) {
    const to = getLegalMoves(state, unit.id)[0];
    if (to) return { kind: 'move' as const, unitId: unit.id, to };
  }
  throw new Error('Fixture has no legal move');
}
async function until(predicate: () => boolean, timeout = 2000) {
  const deadline = Date.now() + timeout;
  while (!predicate()) { if (Date.now() > deadline) throw new Error('Condition timed out'); await new Promise(r => setTimeout(r, 10)); }
}

test('malformed network packets cannot crash the service', async t => {
  const h = await harness(t); const outsider = await h.connect();
  for (const [event, data] of [ ['create_room', null], ['create_room', { board: {} }], ['join_room', 'toString'], ['join_room', { roomId: '__proto__' }], ['submit_fleet', null], ['game_action', null], ['resume_session', null] ] as const) {
    const result = await request(outsider, event, data); assert.equal(result.ok, false);
  }
  assert.equal((await ok<GameView>(h.a, 'sync_state', h.room)).phase, 'setup');
});

for (const trailsEnabled of [true, false]) {
  test(`lobby trail setting ${trailsEnabled} is shared, enforced and restored on reconnect`, async t => {
    const h = await harness(t, {}, {trailsEnabled});
    assert.equal(h.joinedA.state.trailsEnabled, trailsEnabled);
    assert.equal(h.joinedB.state.trailsEnabled, trailsEnabled);
    const initial = await h.start();
    const moved = await ok<GameView>(h.a, 'game_action', {...h.room, actionId: randomUUID(), expectedRevision: initial.revision, action: legalAction(initial), trailsEnabled: !trailsEnabled});
    assert.equal(moved.trailsEnabled, trailsEnabled);
    assert.equal(moved.moveTrails?.length, trailsEnabled ? 1 : 0);
    const opponent = await ok<GameView>(h.b, 'sync_state', h.room);
    assert.deepEqual(opponent.moveTrails, moved.moveTrails);
    const reconnected = await h.connect();
    const resumed = await ok<Joined>(reconnected, 'resume_session', h.joinedA.session);
    assert.equal(resumed.state.trailsEnabled, trailsEnabled);
    assert.deepEqual(resumed.state.moveTrails, moved.moveTrails);
  });
}

test('lobby trail option rejects malformed values and defaults to enabled', async t => {
  const h = await harness(t);
  assert.equal(h.joinedA.state.trailsEnabled, true);
  const outsider = await h.connect();
  for (const trailsEnabled of ['false', 0, null, {}, []]) {
    assert.equal((await request(outsider, 'create_room', {trailsEnabled})).ok, false);
  }
});
test('outsiders cannot act, submit either fleet or retrieve another player state', async t => {
  const h = await harness(t); const outsider = await h.connect();
  for (const event of ['game_action', 'submit_fleet', 'sync_state', 'leave_room']) {
    assert.equal((await request(outsider, event, { ...h.room, role: 'a', fleet: fleet('a'), action: { kind: 'move' } })).ok, false);
  }
  assert.equal((await request(h.a, 'submit_fleet', { ...h.room, role: 'b', fleet: fleet('b') })).ok, false);
  assert.equal((await request(h.a, 'join_room', { roomId: h.room.roomId })).ok, false);
  assert.equal((await request(h.a, 'create_room', {})).ok, false);
});
test('fleet validation runs on server, setup is private, readiness cannot restart play', async t => {
  const h = await harness(t);
  for (const bad of [[], {}, fleet('a').map(u => ({ ...u, type: 'pancernik' }))]) {
    assert.equal((await request(h.a, 'submit_fleet', { ...h.room, fleet: bad })).ok, false);
  }
  const submitted = fleet('a');
  await ok(h.a, 'submit_fleet', { ...h.room, fleet: submitted });
  const bSetup = await ok<GameView>(h.b, 'sync_state', h.room);
  assert.equal(bSetup.units.length, 0); assert.equal(bSetup.ready.a, true);
  await ok(h.b, 'submit_fleet', { ...h.room, fleet: fleet('b') });
  let aView = await ok<GameView>(h.a, 'sync_state', h.room);
  assert.equal(aView.units.length, 60);
  assert.equal(aView.units.filter(u => u.ownerId === 'b' && u.type === 'unknown').length, 26);
  assert.equal(aView.units.filter(u => u.ownerId === 'b' && u.type === 'bateria_nadbrzezna').length, 4);
  assert.ok(aView.units.every(u => !submitted.some(original => original.id === u.id)));
  aView = await ok<GameView>(h.a, 'game_action', { ...h.room, actionId: randomUUID(), expectedRevision: aView.revision, action: legalAction(aView) });
  const repeated = await ok<GameView>(h.a, 'submit_fleet', { ...h.room, fleet: [] });
  assert.equal(repeated.turn, 2); assert.equal(repeated.revision, aView.revision);
});
test('actions are serialized, deduplicated, bound to actor, game and revision', async t => {
  const h = await harness(t); const initial = await h.start();
  const payload = { ...h.room, actionId: randomUUID(), expectedRevision: initial.revision, action: legalAction(initial) };
  assert.equal((await request(h.b, 'game_action', payload)).ok, false);
  assert.equal((await request(h.a, 'game_action', { ...payload, gameId: randomUUID() })).ok, false);
  const [first, racing] = await Promise.all([
    request<GameView>(h.a, 'game_action', payload),
    request<GameView>(h.a, 'game_action', { ...payload, actionId: randomUUID() }),
  ]);
  assert.ok(first.ok); assert.equal(racing.ok, false); assert.equal(first.data.turn, 2);
  const replay = await ok<GameView>(h.a, 'game_action', payload);
  assert.equal(replay.turn, 2); assert.equal(replay.revision, first.data.revision);
  assert.equal((await request(h.a, 'game_action', { ...payload, action: { ...payload.action, to: { col: 99, row: 99 } } })).ok, false);
  const bState = await ok<GameView>(h.b, 'sync_state', h.room);
  assert.equal(bState.revision, replay.revision); assert.equal(bState.activePlayerId, 'b');
  assert.deepEqual(bState.moveTrails, first.data.moveTrails);
  assert.equal(bState.moveTrails?.length, 1);
  assert.deepEqual(bState.moveTrails?.[0]?.path.at(-1), payload.action.to);
  assert.deepEqual(replay.moveTrails, first.data.moveTrails);
  const bAction = legalAction(bState);
  assert.equal((await request(h.b, 'game_action', { ...h.room, actionId: randomUUID(), expectedRevision: bState.revision - 1, action: bAction })).ok, false);
  const next = await ok<GameView>(h.b, 'game_action', { ...h.room, actionId: randomUUID(), expectedRevision: bState.revision, action: bAction });
  assert.equal(next.turn, 3);
});
test('mines appear as unidentified contacts with opaque IDs in live snapshots and sync', async t => {
  const h = await harness(t); let aState = await h.start();
  const sweeper = aState.units.find(u => u.type === 'tralowiec' && u.ownerId === 'a'); assert.ok(sweeper);
  // Pick a visible empty water/port square in range of a sweeper in the setup fixture.
  let at: { col: number; row: number } | undefined;
  for (let row = 0; row < 12; row++) for (let col = 0; col < 18; col++) {
    const tile = aState.board.tiles[row][col];
    if (Math.max(Math.abs(row - sweeper.position.row), Math.abs(col - sweeper.position.col)) <= 2 && tile !== 'neutral' && !aState.units.some(u => u.alive && u.position.col === col && u.position.row === row)) at = { col, row };
  }
  assert.ok(at);
  const pushed = socketOnce(h.b, 'state');
  aState = await ok<GameView>(h.a, 'game_action', { ...h.room, actionId: randomUUID(), expectedRevision: aState.revision, action: { kind: 'lay_mine', unitId: sweeper.id, at } });
  const [bState] = await pushed as [GameView];
  const mine = aState.units.find(u => u.type === 'mina'); assert.ok(mine);
  assert.equal(bState.units.find(u => u.id === mine.id)?.type, 'unknown');
  assert.deepEqual(bState.units.find(u => u.id === mine.id)?.position, at);
  assert.match(mine.id, /^[0-9a-f-]{36}$/);
  const synced = await ok<GameView>(h.b, 'sync_state', h.room);
  assert.deepEqual(synced.units.find(u => u.id === mine.id), bState.units.find(u => u.id === mine.id));
  assert.equal(bState.logs.some(log => log.includes(`(${at.col}, ${at.row})`)), false);
  assert.equal(JSON.stringify(bState).includes(h.joinedA.session.token), false);
});
test('disconnect pauses play; token restores correct role and state', async t => {
  const h = await harness(t); await h.start();
  const disconnected = socketOnce(h.a, 'state'); h.b.disconnect(); await disconnected;
  const paused = await ok<GameView>(h.a, 'sync_state', h.room);
  assert.equal(paused.connected.b, false);
  assert.equal((await request(h.a, 'game_action', { ...h.room, actionId: randomUUID(), expectedRevision: paused.revision, action: legalAction(paused) })).ok, false);
  const reconnect = await h.connect();
  assert.equal((await request(reconnect, 'resume_session', { ...h.joinedB.session, token: '0'.repeat(64) })).ok, false);
  const resumed = await ok<Joined>(reconnect, 'resume_session', h.joinedB.session);
  assert.equal(resumed.session.playerId, 'b'); assert.equal(resumed.state.turn, paused.turn); assert.equal(resumed.state.connected.b, true);
  assert.deepEqual(resumed.state.units.filter(u => u.ownerId === 'b').map(u => u.id).sort(), paused.units.filter(u => u.ownerId === 'b').map(u => u.id).sort());
});
test('session replacement revokes old socket and leave cannot leak old-room events', async t => {
  const h = await harness(t); await h.start();
  const replacement = await h.connect(); const oldClosed = socketOnce(h.a, 'room_closed');
  const resumed = await ok<Joined>(replacement, 'resume_session', h.joinedA.session); await oldClosed;
  assert.equal(resumed.state.connected.a, true);
  await ok(replacement, 'leave_room', h.room);
  const finished = await ok<GameView>(h.b, 'sync_state', h.room);
  assert.equal(finished.phase, 'finished'); assert.equal(finished.winnerId, 'b');
  const next = await ok<Joined>(replacement, 'create_room', {});
  assert.notEqual(next.session.roomId, h.room.roomId);
  assert.equal((await request(replacement, 'sync_state', h.room)).ok, false);
});
test('disconnect grace expires and invalidates resume token', async t => {
  const h = await harness(t, { graceMs: 50, sweepMs: 10 }); await h.start();
  const finished = new Promise<GameView>(resolve => h.a.on('state', s => { if (s.phase === 'finished') resolve(s); }));
  h.b.disconnect(); const result = await finished;
  assert.equal(result.winnerId, 'a');
  const replacement = await h.connect();
  assert.equal((await request(replacement, 'resume_session', h.joinedB.session)).ok, false);
});
test('leaving setup closes the room and clears remaining membership', async t => {
  const h = await harness(t); const closed = socketOnce(h.b, 'room_closed');
  await ok(h.a, 'leave_room', h.room); await closed;
  assert.equal((await request(h.b, 'sync_state', h.room)).ok, false);
  assert.ok((await request(h.b, 'create_room', {})).ok);
});
test('request floods are rejected without losing the game state', async t => {
  const h = await harness(t); const outsider = await h.connect();
  let last: Reply<unknown> = { ok: true, data: null };
  for (let i = 0; i < 81; i++) last = await request(outsider, 'sync_state', h.room);
  assert.ok(!last.ok); assert.match(last.error, /Zbyt wiele/);
  assert.equal((await ok<GameView>(h.a, 'sync_state', h.room)).phase, 'setup');
});
test('actual client waits for authoritative state and resumes after a transport reconnect', async t => {
  const server = createGameServer(); server.httpServer.listen(0, '127.0.0.1'); await nodeOnce(server.httpServer, 'listening');
  const address = server.httpServer.address(); assert.ok(address && typeof address === 'object');
  const a = new NetworkClient(`http://127.0.0.1:${address.port}`);
  const b = new NetworkClient(`http://127.0.0.1:${address.port}`);
  t.after(async () => { a.socket.disconnect(); b.socket.disconnect(); await server.close(); });
  const connected = [new Promise<void>(resolve => a.socket.once('connect', () => resolve())), new Promise<void>(resolve => b.socket.once('connect', () => resolve()))];
  a.socket.connect(); b.socket.connect(); await Promise.all(connected);
  await a.create(); await b.join(a.session!.roomId);
  await a.submitFleet(fleet('a')); await b.submitFleet(fleet('b'));
  await until(() => a.state?.phase === 'playing');
  const turn = a.state!.turn;
  const action = a.action(legalAction(a.state!));
  assert.equal(a.state!.turn, turn); assert.equal(a.canAct, false);
  await action; await until(() => b.state?.turn === turn + 1);
  assert.equal(a.state!.revision, b.state!.revision);
  b.socket.disconnect(); await until(() => !a.state!.connected.b);
  b.socket.connect(); await until(() => b.synced && !b.busy && !!a.state!.connected.b);
  assert.equal(b.state!.turn, turn + 1); assert.equal(b.canAct, true);
  await b.action(legalAction(b.state!)); await until(() => a.state?.turn === turn + 2);
});

test('client recovers a committed action after losing its acknowledgement and ignores other games', async t => {
  const h = await harness(t);
  const a = new NetworkClient(h.url, { ackTimeoutMs: 200 });
  t.after(() => a.socket.disconnect());
  // Resume the existing A session through the real application client.
  a.session = h.joinedA.session;
  a.socket.connect(); await until(() => a.synced && !a.busy);
  await a.submitFleet(fleet('a'));
  await ok(h.b, 'submit_fleet', { ...h.room, fleet: fleet('b') });
  await until(() => a.state?.phase === 'playing');
  const serverSocket = h.server.io.sockets.sockets.get(a.socket.id!); assert.ok(serverSocket);
  const original = serverSocket.listeners('game_action')[0]; assert.ok(original);
  serverSocket.removeAllListeners('game_action');
  serverSocket.on('game_action', (data: unknown) => original(data, () => {}));
  await assert.rejects(a.action(legalAction(a.state!)), /potwierdzenia/);
  assert.equal(a.state!.turn, 2); assert.equal(a.synced, true); assert.equal(a.busy, false);
  assert.equal((await ok<GameView>(h.b, 'sync_state', h.room)).revision, a.state!.revision);
  const before = structuredClone(a.state);
  serverSocket.emit('state', { ...a.state, roomId: 'OTHER123', revision: 9999 });
  serverSocket.emit('state', { ...a.state, gameId: randomUUID(), revision: 9999 });
  serverSocket.emit('state', { ...a.state, revision: 0, turn: 100 });
  // Acknowledgement round trip guarantees the earlier packets have been processed.
  await ok(a.socket as unknown as Socket, 'sync_state', h.room);
  assert.deepEqual(a.state, before);
});
