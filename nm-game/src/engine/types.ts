// src/engine/types.ts

export type UnitType =
  | 'pancernik'
  | 'okret_rakietowy'
  | 'krazownik'
  | 'niszczyciel'
  | 'okret_podwodny'
  | 'eskortowiec'
  | 'tralowiec'
  | 'okret_desantowy'
  | 'bateria_nadbrzezna'
  | 'mina';

export interface Position {
  col: number;
  row: number;
}

export interface Unit {
  id: string;
  ownerId: string;
  type: UnitType;
  position: Position;
  alive: boolean;
  revealed: boolean;
  turnsInNeutralZone: number;
}

export type TileKind = 'sea' | 'neutral' | 'island' | 'port_a' | 'port_a_wall' | 'port_b' | 'port_b_wall';

export interface BoardConfig {
  columns: number;
  rows: number;
  tiles: TileKind[][];
}

export type MoveAction =
  | { kind: 'move'; unitId: string; to: Position }
  | { kind: 'attack'; unitId: string; targetUnitId: string }
  | { kind: 'move_and_attack'; unitId: string; to: Position; targetUnitId: string }
  | { kind: 'lay_mine'; unitId: string; at: Position }
  | { kind: 'clear_mine'; unitId: string; at: Position };

export interface GameState {
  roomId: string;
  board: BoardConfig;
  units: Unit[];
  turn: number;
  activePlayerId: string;
  phase: 'setup' | 'lobby' | 'playing' | 'finished';
  winnerId: string | null;
  setupInventory?: Record<UnitType, number>;
  logs: string[]; // <-- DODANE POLE NA DEPESZE
}