// src/engine/setup.ts

import type { GameState, Position, UnitType } from './types';
//import { getTile } from './board';

export const INITIAL_INVENTORY: Record<UnitType, number> = {
  pancernik: 3,
  okret_rakietowy: 3,
  krazownik: 3,
  niszczyciel: 4,
  okret_podwodny: 4,
  eskortowiec: 4,
  tralowiec: 4,
  okret_desantowy: 1,
  bateria_nadbrzezna: 4,
  mina: 6
};

export function isValidPlacement(state: GameState, type: string, pos: Position, playerId: string): boolean {
  const tile = state.board.tiles[pos.row][pos.col];

  // 1. Sprawdzenie, czy to bateria nadbrzeżna
  if (type === 'bateria_nadbrzezna') {
    // Bateria gracza A może stać na dowolnym kafelku portu A (zwykłym lub na murze)
    if (playerId === 'a' && !tile.startsWith('port_a')) return false;
    // Bateria gracza B może stać na dowolnym kafelku portu B
    if (playerId === 'b' && !tile.startsWith('port_b')) return false;
    
    return true; // Jeśli warunki są spełnione, pozwalamy na postawienie
  }
  
  // Gracz może stawiać tylko w obrębie swojego portu
  const myPortPrefix = playerId === 'a' ? 'port_a' : 'port_b';
  if (!tile.startsWith(myPortPrefix)) return false;

  const isOccupied = state.units.some(u => u.position.row === pos.row && u.position.col === pos.col);
  if (isOccupied) return false;

  // Bateria nadbrzeżna wymusza kafel ze ścianą
  if (type === 'bateria_nadbrzezna') {
    return tile === 'port_a_wall' || tile === 'port_b_wall';
  }

  return true;
}
