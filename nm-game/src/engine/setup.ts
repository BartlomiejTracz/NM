import type { GameState, Position, UnitType } from './types';
import { isExitTile } from './board';

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

// Dodano ignoreUnitId dla logiki zamiany i nakładania
export function isValidPlacement(state: GameState, type: string, pos: Position, playerId: string, ignoreUnitId?: string): boolean {  
  const tile = state.board.tiles[pos.row][pos.col];
  
  // Teraz TypeScript bez problemu rozpozna, czym jest "type"
  if (type === 'bateria_nadbrzezna' && isExitTile(pos)) {
    return false;
  }
  
  const myPortPrefix = playerId === 'a' ? 'port_a' : 'port_b';

  // 1. Gracz może stawiać tylko w obrębie swojego portu (obojętnie czy mur, czy woda)
  if (!tile.startsWith(myPortPrefix)) return false;

  // 2. Sprawdzenie, czy pole jest wolne
  const isOccupied = state.units.some(u => 
    u.position.row === pos.row && 
    u.position.col === pos.col && 
    u.id !== ignoreUnitId
  );
  
  if (isOccupied) return false;

  // Bateria i inne jednostki mogą stać wszędzie w strefie portu
  return true;
}