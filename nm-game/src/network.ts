import { io, type Socket } from 'socket.io-client';
import type { ClientEvents, ServerEvents, Session, GameView, MoveAction, Reply } from '../../shared/types';

class ServerError extends Error {}
const SESSION_KEY = 'nm_session_v2';
export class NetworkClient {
  readonly socket: Socket<ServerEvents, ClientEvents>;
  session: Session | null = null;
  state: GameView | null = null;
  busy = false;
  synced = false;
  private epoch = 0;
  private ackTimeoutMs: number;
  onState: (state: GameView) => void = () => {};
  onStatus: () => void = () => {};
  onEnded: (reason: string) => void = () => {};

  constructor(url: string, options: { ackTimeoutMs?: number } = {}) {
    this.ackTimeoutMs = options.ackTimeoutMs ?? 8000;
    try {
      const saved = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null');
      if (saved && typeof saved.roomId === 'string' && typeof saved.gameId === 'string' && typeof saved.token === 'string' && (saved.playerId === 'a' || saved.playerId === 'b')) this.session = saved;
    } catch { /* Storage can be disabled; the live in-memory session still works. */ }
    this.socket = io(url, { autoConnect: false });
    this.socket.on('state', state => this.accept(state));
    this.socket.on('room_closed', data => {
      if (data.roomId !== this.session?.roomId || data.gameId !== this.session.gameId) return;
      this.clear();
      this.onEnded(data.reason);
    });
    this.socket.on('disconnect', () => {
      this.epoch++; this.busy = false; this.synced = false;
      // Do not replay pre-disconnect intentions after acquiring a new session revision.
      this.socket.sendBuffer.length = 0;
      this.onStatus();
    });
    this.socket.on('connect_error', () => this.onStatus());
    this.socket.on('connect', () => {
      if (!this.session) { this.onStatus(); return; }
      void this.run(async () => {
        try {
          const result = await this.request<{ session: Session; state: GameView }>('resume_session', this.session);
          this.establish(result);
        } catch (error) {
          if (error instanceof ServerError) { this.clear(); this.onEnded(error.message); }
          else if (this.socket.connected) { this.socket.disconnect(); this.socket.connect(); }
        }
      }).catch(() => {});
    });
  }
  get connected() { return this.socket.connected; }
  get canAct() {
    return this.connected && this.synced && !this.busy && !!this.session && this.state?.phase === 'playing'
      && this.state.activePlayerId === this.session.playerId && this.state.connected.a && this.state.connected.b;
  }
  private save() {
    try { if (this.session) sessionStorage.setItem(SESSION_KEY, JSON.stringify(this.session)); else sessionStorage.removeItem(SESSION_KEY); } catch { /* Optional persistence. */ }
  }
  private clear() {
    this.epoch++; this.session = null; this.state = null; this.synced = false; this.busy = false; this.save(); this.onStatus();
  }
  private accept(state: GameView) {
    if (state.roomId !== this.session?.roomId || state.gameId !== this.session.gameId) return;
    if (this.state && this.state.gameId === state.gameId && state.revision < this.state.revision) return;
    this.state = state;
    this.synced = true;
    this.onState(state);
    this.onStatus();
  }
  private establish(result: { session: Session; state: GameView }) {
    this.session = result.session; this.save(); this.accept(result.state);
  }
  private request<T>(event: keyof ClientEvents, data: unknown): Promise<T> {
    if (!this.connected) return Promise.reject(new Error('Brak połączenia z serwerem.'));
    const epoch = this.epoch;
    return new Promise((resolve, reject) => {
      // A connected polling transport may still be flushing its handshake. Reliable
      // delivery queues that write; disconnect explicitly clears any offline buffer.
      (this.socket as Socket).timeout(this.ackTimeoutMs).emit(event, data, (error: Error | null, reply: Reply<T>) => {
        if (epoch !== this.epoch) { reject(new Error('Połączenie uległo zmianie.')); return; }
        if (error) { reject(new Error('Nie otrzymano potwierdzenia. Synchronizuję partię.')); return; }
        if (!reply?.ok) { reject(new ServerError(reply?.error ?? 'Nieprawidłowa odpowiedź serwera.')); return; }
        resolve(reply.data);
      });
    });
  }
  private async run<T>(operation: () => Promise<T>): Promise<T> {
    if (this.busy) throw new Error('Poczekaj na potwierdzenie poprzedniej operacji.');
    const epoch = this.epoch;
    this.busy = true; this.onStatus();
    try { return await operation(); }
    finally { if (epoch === this.epoch) { this.busy = false; this.onStatus(); } }
  }
  async create() {
    return this.enter('create_room', {});
  }
  async join(roomId: string) {
    return this.enter('join_room', { roomId });
  }
  private async enter(event: 'create_room' | 'join_room', data: unknown) {
    return this.run(async () => {
      const epoch = this.epoch;
      try { this.establish(await this.request(event, data)); }
      catch (error) {
        // If the initial acknowledgement was lost, we have no resume token yet.
        // Drop that transport so it cannot leave this client stuck in an unknown seat.
        if (!(error instanceof ServerError) && epoch === this.epoch && this.connected) {
          this.socket.disconnect(); this.socket.connect();
        }
        throw error;
      }
    });
  }
  private identity() {
    if (!this.session) throw new Error('Brak aktywnej sesji.');
    return { roomId: this.session.roomId, gameId: this.session.gameId };
  }
  private async recover(epoch: number) {
    if (epoch !== this.epoch || !this.session || !this.connected) return;
    this.synced = false;
    try { this.accept(await this.request<GameView>('sync_state', this.identity())); }
    catch { if (epoch === this.epoch && this.connected) { this.socket.disconnect(); this.socket.connect(); } }
  }
  async submitFleet(fleet: unknown) {
    return this.run(async () => {
      const epoch = this.epoch;
      try { this.accept(await this.request<GameView>('submit_fleet', { ...this.identity(), fleet })); }
      catch (error) { await this.recover(epoch); throw error; }
    });
  }
  async action(action: MoveAction) {
    if (!this.canAct || !this.state) throw new Error('Nie możesz teraz wykonać ruchu.');
    const request = { ...this.identity(), actionId: crypto.randomUUID(), expectedRevision: this.state.revision, action };
    return this.run(async () => {
      const epoch = this.epoch;
      try { this.accept(await this.request<GameView>('game_action', request)); }
      catch (error) { await this.recover(epoch); throw error; }
    });
  }
  async leave() {
    const identity = this.session ? this.identity() : null;
    try { if (identity && this.connected) await this.request('leave_room', identity); }
    finally {
      // Also revoke the old transport if its acknowledgement was lost.
      this.socket.disconnect(); this.clear(); this.socket.connect();
    }
  }
}
