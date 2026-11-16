import type { GameState, GameView, Position } from './types';
import { UNIT_RULES } from './rules.config';
import { canCrossWall, getTile } from './board';

const DIRECTIONS = [ [-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1] ];
const key = (p: Position) => `${p.row},${p.col}`;
export const samePosition = (a: Position, b: Position) => a.row === b.row && a.col === b.col;
export const distance = (a: Position, b: Position) => Math.max(Math.abs(a.row - b.row), Math.abs(a.col - b.col));

// Paths are chosen without knowledge of hidden mines. The server resolves contact
// with the first mine on that path, so a mine can neither leak nor be skipped.
export function getMovementPaths(state: GameState | GameView, unitId: string): Map<string, Position[]> {
  const result = new Map<string, Position[]>();
  const unit = state.units.find(u => u.id === unitId);
  if (!unit?.alive || unit.type === 'unknown' || state.phase !== 'playing' || state.activePlayerId !== unit.ownerId) return result;
  const stats = UNIT_RULES[unit.type];
  if (stats.isStationary || !getTile(state.board, unit.position)) return result;
  const queue = [{ pos: unit.position, path: [] as Position[] }];
  const visited = new Set([key(unit.position)]);
  for (let i = 0; i < queue.length; i++) {
    const { pos, path } = queue[i];
    if (path.length >= stats.range) continue;
    for (const [r, c] of DIRECTIONS) {
      const next = { row: pos.row + r, col: pos.col + c };
      const tile = getTile(state.board, next);
      if (visited.has(key(next)) || !tile || tile === 'island' || tile.endsWith('_wall') || !canCrossWall(pos, next, state.board)) continue;
      if (tile === `port_${unit.ownerId === 'a' ? 'b' : 'a'}` && unit.type !== 'okret_desantowy') continue;
      if (state.units.some(u => u.alive && samePosition(u.position, next) && !(u.type === 'mina' && u.ownerId !== unit.ownerId))) continue;
      visited.add(key(next));
      const nextPath = [...path, next];
      result.set(key(next), nextPath);
      queue.push({ pos: next, path: nextPath });
    }
  }
  return result;
}
export function getLegalMoves(state: GameState | GameView, unitId: string): Position[] {
  return [...getMovementPaths(state, unitId).values()].map(path => path[path.length - 1]);
}
export function getMovementPath(state: GameState | GameView, unitId: string, to: Position): Position[] | undefined {
  return getMovementPaths(state, unitId).get(key(to));
}
