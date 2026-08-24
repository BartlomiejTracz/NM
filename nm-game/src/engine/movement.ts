// src/engine/movement.ts

import type { GameState, Position } from './types';
import { UNIT_RULES } from './rules.config';
import { getTile, canCrossWall } from './board';

const DIRECTIONS = [
  { r: -1, c: 0 }, { r: 1, c: 0 }, { r: 0, c: -1 }, { r: 0, c: 1 },
  { r: -1, c: -1 }, { r: -1, c: 1 }, { r: 1, c: -1 }, { r: 1, c: 1 }
];

export function getLegalMoves(state: GameState, unitId: string): Position[] {
  const unit = state.units.find(u => u.id === unitId);
  if (!unit || !unit.alive) return [];

  const stats = UNIT_RULES[unit.type];
  if (stats.isStationary || stats.range === 0) return [];

  const legalMoves: Position[] = [];
  const visited = new Set<string>();
  
  const queue: { pos: Position, steps: number }[] = [];
  queue.push({ pos: unit.position, steps: 0 });
  visited.add(`${unit.position.row},${unit.position.col}`);

  while (queue.length > 0) {
    const { pos, steps } = queue.shift()!;

    if (steps > 0) legalMoves.push(pos);
    if (steps >= stats.range) continue;

    for (const dir of DIRECTIONS) {
      const nextPos = { row: pos.row + dir.r, col: pos.col + dir.c };
      const posKey = `${nextPos.row},${nextPos.col}`;

      if (visited.has(posKey)) continue;

      const nextTile = getTile(state.board, nextPos);
      if (!nextTile || nextTile === 'island') continue;
      if (!canCrossWall(pos, nextPos, state.board)) continue;

      const isEnemyPort = 
        (unit.ownerId === 'a' && nextTile.startsWith('port_b')) || 
        (unit.ownerId === 'b' && nextTile.startsWith('port_a'));
        
      if (isEnemyPort && unit.type !== 'okret_desantowy') continue; 

      const isOccupied = state.units.some(u => u.alive && u.position.row === nextPos.row && u.position.col === nextPos.col);
      if (isOccupied) continue;

      // USUNIĘTO sztuczną blokadę baterii nadbrzeżnej! 
      // Gracze mogą swobodnie wchodzić w zasięg rażenia na własne ryzyko.

      visited.add(posKey);
      queue.push({ pos: nextPos, steps: steps + 1 });
    }
  }

  return legalMoves;
}