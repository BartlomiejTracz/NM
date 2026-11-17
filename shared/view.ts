import type { GameState, GameView, PlayerId, ViewUnit } from './types';

export function playerView(state: GameState, playerId: PlayerId, ready: GameView['ready'], connected: GameView['connected']): GameView {
  const units: ViewUnit[] = state.units
    .filter(u => (state.phase !== 'setup' && state.phase !== 'lobby') || u.ownerId === playerId)
    .map(u => ({ ...u, position: { ...u.position }, type: u.ownerId === playerId || u.revealed || state.phase === 'finished' ? u.type : 'unknown' }));
  // Avoid leaking the original fleet submission/placement order.
  units.sort((a, b) => a.id.localeCompare(b.id));
  return { ...state, board: { ...state.board, tiles: state.board.tiles.map(r => [...r]) }, units, logs: [...state.logs], ready: { ...ready }, connected: { ...connected } };
}
