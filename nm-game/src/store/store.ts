import type { GameView } from '../engine/types';
import { createInitialBoard } from '../engine/board';

type Subscriber = (state: GameView) => void;
export function emptyState(): GameView {
  return { roomId: 'local', gameId: 'local', revision: 0, board: createInitialBoard(), units: [], turn: 1,
    activePlayerId: 'a', phase: 'lobby', winnerId: null, logs: [],
    ready: { a: false, b: false }, connected: { a: false, b: false } };
}
function freeze(value: object) {
  Object.freeze(value);
  for (const child of Object.values(value)) if (child && typeof child === 'object' && !Object.isFrozen(child)) freeze(child);
}
export class GameStore {
  private state: GameView = emptyState();
  private subscribers = new Set<Subscriber>();
  getState(): GameView { return this.state; }
  subscribe(callback: Subscriber) {
    this.subscribers.add(callback);
    this.invoke(callback);
    return () => this.subscribers.delete(callback);
  }
  setState(newState: GameView) {
    this.state = structuredClone(newState);
    freeze(this.state);
    this.refresh();
  }
  refresh() { for (const sub of this.subscribers) this.invoke(sub); }
  private invoke(sub: Subscriber) {
    try { sub(this.state); } catch (error) { console.error('Błąd aktualizacji interfejsu:', error); }
  }
}
export const store = new GameStore();
