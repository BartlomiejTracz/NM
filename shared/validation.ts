import type { MoveAction, Position } from './types';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export function isPosition(value: unknown): value is Position {
  return isRecord(value) && Number.isInteger(value.col) && Number.isInteger(value.row);
}
export function isMoveAction(value: unknown): value is MoveAction {
  if (!isRecord(value) || typeof value.unitId !== 'string' || value.unitId.length > 100) return false;
  switch (value.kind) {
    case 'move': return isPosition(value.to);
    case 'attack': return typeof value.targetUnitId === 'string' && value.targetUnitId.length <= 100;
    case 'lay_mine':
    case 'clear_mine': return isPosition(value.at);
    default: return false;
  }
}
