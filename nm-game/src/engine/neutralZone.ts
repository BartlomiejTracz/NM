// src/engine/neutralZone.ts

import type { GameState, Unit } from './types';
import { getTile } from './board';

/**
 * Aktualizuje liczniki tur dla jednostek przebywających na wodach neutralnych.
 * Zdejmuje z planszy jednostki, które przekroczyły limit czasu (3 tury).
 */
export function tickNeutralZoneTimers(state: GameState): GameState {
  const MAX_TURNS = 3; // Jednostka musi opuścić wody neutralne po upływie trzech tur[cite: 1].

  const updatedUnits: Unit[] = state.units.map(unit => {
    // Ignorujemy zniszczone jednostki
    if (!unit.alive) return unit;

    const tile = getTile(state.board, unit.position);
    
    if (tile === 'neutral') {
      const newTurns = unit.turnsInNeutralZone + 1;
      
      // Jeżeli jednostka przebywa tam dłużej, zostaje zdjęta z planszy[cite: 1].
      if (newTurns > MAX_TURNS) {
        return { ...unit, turnsInNeutralZone: newTurns, alive: false };
      }
      return { ...unit, turnsInNeutralZone: newTurns };
    } else {
      // Wyzerowanie licznika, jeśli jednostka znajduje się na innym akwenie (np. na morzu lub w porcie)
      return { ...unit, turnsInNeutralZone: 0 };
    }
  });

  // Funkcja czysta – zwracamy nową kopię stanu z podmienionymi jednostkami[cite: 3].
  return {
    ...state,
    units: updatedUnits
  };
}