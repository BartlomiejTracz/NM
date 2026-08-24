// src/engine/winCondition.ts

import type { GameState } from './types';
import { getTile } from './board';

export function checkWinCondition(state: GameState): string | null {
  const players = ['a', 'b'];

  for (const playerId of players) {
    const opponentId = playerId === 'a' ? 'b' : 'a';
    const opponentPortPrefix = playerId === 'a' ? 'port_b' : 'port_a';

    const myLandingCraft = state.units.find(u => u.ownerId === playerId && u.type === 'okret_desantowy');
    const opponentLandingCraft = state.units.find(u => u.ownerId === opponentId && u.type === 'okret_desantowy');

    // WARUNEK 1: Desant w dowolnym miejscu wrogiego portu[cite: 1]
    if (myLandingCraft && myLandingCraft.alive) {
      const tile = getTile(state.board, myLandingCraft.position);
      if (tile && tile.startsWith(opponentPortPrefix)) {
        return playerId;
      }
    }

    // WARUNEK 2: Zniszczenie desantu wroga[cite: 1]
    if (opponentLandingCraft && !opponentLandingCraft.alive) {
      return playerId;
    }
  }

  return null; 
}