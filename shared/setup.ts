import type { BoardConfig, PlayerId, Position, Unit, UnitType } from './types';
import { getTile, isExitTile } from './board';
import { isPosition, isRecord } from './validation';

export const INITIAL_INVENTORY: Record<UnitType, number> = {
  pancernik: 3, okret_rakietowy: 3, krazownik: 3, niszczyciel: 4,
  okret_podwodny: 4, eskortowiec: 4, tralowiec: 4, okret_desantowy: 1,
  bateria_nadbrzezna: 4, mina: 6,
};
export const FLEET_SIZE = Object.entries(INITIAL_INVENTORY)
  .reduce((n, [type, count]) => n + (type === 'mina' ? 0 : count), 0);
export function isUnitType(type: unknown): type is UnitType {
  return typeof type === 'string' && Object.hasOwn(INITIAL_INVENTORY, type);
}
type PlacementState = { board: BoardConfig; units: Pick<Unit, 'id' | 'position'>[] };
export function isValidPlacement(state: PlacementState, type: string, pos: Position, playerId: string, ignoreUnitId?: string): boolean {
  if (!isUnitType(type) || type === 'mina' || (playerId !== 'a' && playerId !== 'b')) return false;
  const tile = getTile(state.board, pos);
  if (tile !== `port_${playerId}` || (type === 'bateria_nadbrzezna' && isExitTile(pos))) return false;
  return !state.units.some(u => u.id !== ignoreUnitId && u.position.row === pos.row && u.position.col === pos.col);
}
export type FleetResult = { ok: true; units: Unit[] } | { ok: false; error: string };
export function validateFleet(input: unknown, board: BoardConfig, ownerId: PlayerId): FleetResult {
  if (!Array.isArray(input) || input.length !== FLEET_SIZE) return { ok: false, error: `Flota musi zawierać dokładnie ${FLEET_SIZE} jednostek.` };
  const remaining = { ...INITIAL_INVENTORY };
  const units: Unit[] = [];
  for (const item of input) {
    if (!isRecord(item) || !isUnitType(item.type) || item.type === 'mina' || !isPosition(item.position)) {
      return { ok: false, error: 'Nieprawidłowy typ lub pozycja jednostki.' };
    }
    if (remaining[item.type] <= 0 || !isValidPlacement({ board, units }, item.type, item.position, ownerId)) {
      return { ok: false, error: 'Nieprawidłowy skład floty lub rozmieszczenie w porcie.' };
    }
    remaining[item.type]--;
    // Untrusted IDs, ownership and flags are deliberately not imported.
    units.push({ id: `${ownerId}_${units.length}`, ownerId, type: item.type,
      position: { col: item.position.col, row: item.position.row }, alive: true,
      revealed: item.type === 'bateria_nadbrzezna', turnsInNeutralZone: 0 });
  }
  return { ok: true, units };
}
export const rotatePosition = (pos: Position, board: BoardConfig): Position => ({
  col: board.columns - 1 - pos.col, row: board.rows - 1 - pos.row,
});
export function encodeFleet(units: Unit[], board: BoardConfig, role: PlayerId) {
  const checked = validateFleet(units, board, role);
  if (!checked.ok) throw new Error(checked.error);
  return { version: 2, board: { columns: board.columns, rows: board.rows },
    units: checked.units.map(u => ({ type: u.type, position: role === 'b' ? rotatePosition(u.position, board) : { ...u.position } })) };
}
export function decodeFleet(input: unknown, board: BoardConfig, role: PlayerId): FleetResult {
  let canonical: Unit[];
  if (Array.isArray(input)) {
    // Legacy exports are migrated only when their complete original layout is valid.
    const sourceRole = isRecord(input[0]) ? input[0].ownerId : undefined;
    if ((sourceRole !== 'a' && sourceRole !== 'b') || input.some(u => !isRecord(u) || u.ownerId !== sourceRole)) {
      return { ok: false, error: 'Stary zapis nie ma jednoznacznego właściciela floty.' };
    }
    const checked = validateFleet(input, board, sourceRole);
    if (!checked.ok) return checked;
    canonical = checked.units.map(u => ({ ...u, position: sourceRole === 'b' ? rotatePosition(u.position, board) : u.position }));
  } else {
    if (!isRecord(input) || input.version !== 2 || !isRecord(input.board) || input.board.columns !== board.columns || input.board.rows !== board.rows) {
      return { ok: false, error: 'Nieobsługiwana wersja zapisu lub rozmiar planszy.' };
    }
    const checked = validateFleet(input.units, board, 'a');
    if (!checked.ok) return checked;
    canonical = checked.units;
  }
  return validateFleet(canonical.map(u => ({ ...u, position: role === 'b' ? rotatePosition(u.position, board) : u.position })), board, role);
}
