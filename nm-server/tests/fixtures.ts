import { randomUUID } from 'node:crypto';
import type { GameState, PlayerId, Unit, UnitType } from '../../shared/types';
import { createInitialBoard } from '../../shared/board';
import { INITIAL_INVENTORY, isValidPlacement } from '../../shared/setup';

export const unit = (id: string, ownerId: PlayerId, type: UnitType, col: number, row: number): Unit => ({
  id, ownerId, type, position: { col, row }, alive: true, revealed: false, turnsInNeutralZone: 0,
});
export function state(units: Unit[] = []): GameState {
  return { roomId: 'ABCDEF12', gameId: randomUUID(), revision: 0, board: createInitialBoard(),
    units: [unit('landing-a', 'a', 'okret_desantowy', 0, 0), unit('landing-b', 'b', 'okret_desantowy', 17, 11), ...units],
    turn: 1, activePlayerId: 'a', phase: 'playing', winnerId: null, logs: [] };
}
export function fleet(role: PlayerId): Unit[] {
  const board = createInitialBoard();
  const units: Unit[] = [];
  const types = Object.keys(INITIAL_INVENTORY) as UnitType[];
  types.sort((a, b) => Number(b === 'bateria_nadbrzezna') - Number(a === 'bateria_nadbrzezna'));
  for (const type of types) {
    if (type === 'mina') continue;
    for (let n = 0; n < INITIAL_INVENTORY[type]; n++) {
      let placed = false;
      for (let row = 0; row < board.rows && !placed; row++) {
        for (let col = 0; col < board.columns && !placed; col++) {
          if (isValidPlacement({ board, units }, type, { col, row }, role)) {
            units.push(unit(randomUUID(), role, type, col, row)); placed = true;
          }
        }
      }
      if (!placed) throw new Error('No fleet placement available');
    }
  }
  return units;
}
