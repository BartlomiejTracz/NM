import type { GameState, PlayerId } from './types';
import { getTile } from './board';

export function tickNeutralZoneTimers(state: GameState, playerId: PlayerId = state.activePlayerId): GameState {
  const logs = [...state.logs];
  const units = state.units.map(unit => {
    if (!unit.alive || unit.ownerId !== playerId) return unit;
    const turnsInNeutralZone = getTile(state.board, unit.position) === 'neutral' ? unit.turnsInNeutralZone + 1 : 0;
    if (turnsInNeutralZone < 4) return { ...unit, turnsInNeutralZone };
    logs.push(`[Gracz ${playerId.toUpperCase()}] Jednostka została internowana.`);
    return { ...unit, turnsInNeutralZone, alive: false, revealed: true, destroyedAtTurn: state.turn };
  });
  return { ...state, units, logs };
}
