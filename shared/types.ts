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

export type PlayerId = 'a' | 'b';

export interface Position {
  col: number;
  row: number;
}

export interface Unit {
  id: string;
  ownerId: PlayerId;
  type: UnitType;
  position: Position;
  alive: boolean;
  revealed: boolean;
  turnsInNeutralZone: number;
  destroyedAtTurn?: number; // <-- NOWE POLE (śledzenie czasu zatonięcia)
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
  | { kind: 'lay_mine'; unitId: string; at: Position }
  | { kind: 'clear_mine'; unitId: string; at: Position };

export interface GameState {
  roomId: string;
  gameId: string;
  revision: number;
  board: BoardConfig;
  units: Unit[];
  turn: number;
  activePlayerId: PlayerId;
  phase: 'setup' | 'lobby' | 'playing' | 'finished';
  winnerId: PlayerId | null;
  setupInventory?: Record<UnitType, number>;
  logs: string[];
  trailsEnabled?: boolean;
  moveTrails?: { playerId: PlayerId; turn: number; path: Position[] }[];
}

export type ViewUnit = Omit<Unit, 'type'> & { type: UnitType | 'unknown' };
export interface GameView extends Omit<GameState, 'units'> {
  units: ViewUnit[];
  ready: Record<PlayerId, boolean>;
  connected: Record<PlayerId, boolean>;
}

export interface Session {
  roomId: string;
  gameId: string;
  playerId: PlayerId;
  token: string;
}
export type Reply<T = undefined> = { ok: true; data: T } | { ok: false; error: string };
export interface ActionRequest {
  roomId: string;
  gameId: string;
  actionId: string;
  expectedRevision: number;
  action: MoveAction;
}
export interface ServerEvents {
  state: (state: GameView) => void;
  room_closed: (data: { roomId: string; gameId: string; reason: string }) => void;
}
export interface ClientEvents {
  create_room: (data: { trailsEnabled?: boolean }, ack: (r: Reply<{ session: Session; state: GameView }>) => void) => void;
  join_room: (data: { roomId: string }, ack: (r: Reply<{ session: Session; state: GameView }>) => void) => void;
  resume_session: (data: Session, ack: (r: Reply<{ session: Session; state: GameView }>) => void) => void;
  submit_fleet: (data: { roomId: string; gameId: string; fleet: unknown }, ack: (r: Reply<GameView>) => void) => void;
  game_action: (data: ActionRequest, ack: (r: Reply<GameView>) => void) => void;
  sync_state: (data: { roomId: string; gameId: string }, ack: (r: Reply<GameView>) => void) => void;
  leave_room: (data: { roomId: string; gameId: string }, ack: (r: Reply) => void) => void;
}
