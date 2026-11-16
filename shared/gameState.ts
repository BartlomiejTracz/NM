import type { GameState, PlayerId, Unit } from './types';
import { getTile } from './board';
import { checkWinCondition } from './winCondition';
import { resolveCombat } from './combat';
import { distance, getMovementPath, samePosition } from './movement';
import { UNIT_RULES } from './rules.config';
import { isMoveAction } from './validation';
import { tickNeutralZoneTimers } from './neutralZone';

export function applyMove(state: GameState, input: unknown, playerId: PlayerId): { newState: GameState; error?: string } {
  const fail = (error: string) => ({ newState: state, error });
  if (state.phase !== 'playing') return fail('Partia nie jest w trakcie gry.');
  if (playerId !== state.activePlayerId) return fail('Nie twoja tura.');
  if (!isMoveAction(input)) return fail('Nieprawidłowa akcja.');
  const action = input;
  const original = state.units.find(u => u.id === action.unitId);
  if (!original?.alive || original.ownerId !== playerId) return fail('Nie możesz użyć tej jednostki.');
  let path;
  if (action.kind === 'move') {
    if (!getTile(state.board, action.to)) return fail('Pole poza planszą.');
    path = getMovementPath(state, original.id, action.to);
    if (!path) return fail('Niedozwolony ruch.');
  } else if (action.kind === 'attack') {
    const target = state.units.find(u => u.id === action.targetUnitId);
    if (original.type === 'okret_desantowy' || original.type === 'mina') return fail('Ta jednostka nie może atakować.');
    // Mines are never selectable by their secret ID; use a movement or clearing intent.
    if (!target?.alive || target.ownerId === playerId || target.type === 'mina') return fail('Niedozwolony cel.');
    if (distance(original.position, target.position) > UNIT_RULES[original.type].range) return fail('Cel poza zasięgiem.');
    if (getTile(state.board, original.position) === 'neutral' || getTile(state.board, target.position) === 'neutral') return fail('Zakaz walki w strefie neutralnej.');
  } else {
    const tile = getTile(state.board, action.at);
    if (original.type !== 'tralowiec' || !tile || tile === 'neutral' || tile === 'island' || tile.endsWith('_wall') || getTile(state.board, original.position) === 'neutral' || distance(original.position, action.at) > 2 || distance(original.position, action.at) === 0) return fail('Niedozwolona operacja minowa.');
    const occupant = state.units.find(u => u.alive && samePosition(u.position, action.at));
    if (occupant && !(occupant.type === 'mina' && occupant.ownerId !== playerId)) return fail('Pole jest zajęte.');
    if (action.kind === 'lay_mine' && state.units.filter(u => u.alive && u.ownerId === playerId && u.type === 'mina').length >= 6) return fail('Brak min w magazynie.');
  }

  let next: GameState = { ...state, units: state.units.map(u => ({ ...u, position: { ...u.position } })), logs: [...state.logs] };
  const unit = next.units.find(u => u.id === original.id)!;
  const destroy = (u: Unit) => { u.alive = false; u.destroyedAtTurn = state.turn; u.revealed = true; };
  const battle = (target: Unit) => {
    const result = resolveCombat(unit, target);
    unit.revealed = target.revealed = true;
    if (!result.attackerSurvived) destroy(unit);
    if (!result.defenderSurvived) destroy(target);
    next.logs.push(`[Gracz ${playerId.toUpperCase()}] Starcie: ${unit.type} / ${target.type}. ${unit.alive ? 'Atakujący przetrwał.' : 'Atakujący zatonął.'} ${target.alive ? 'Obrońca przetrwał.' : 'Obrońca zatonął.'}`);
  };
  switch (action.kind) {
    case 'move': {
      for (const step of path!) {
        unit.position = { ...step };
        const mine = next.units.find(u => u.alive && u.type === 'mina' && u.ownerId !== playerId && samePosition(u.position, step));
        if (mine) { battle(mine); break; }
      }
      // Public messages never disclose an unrevealed unit's type.
      next.logs.push(`[Gracz ${playerId.toUpperCase()}] Jednostka przemieściła się na (${unit.position.col}, ${unit.position.row}).`);
      break;
    }
    case 'attack': battle(next.units.find(u => u.id === action.targetUnitId)!); break;
    case 'lay_mine': {
      const mine = next.units.find(u => u.alive && samePosition(u.position, action.at));
      if (!mine) next.units.push({ id: `mine_${playerId}_${state.turn}`, ownerId: playerId, type: 'mina', position: { ...action.at }, alive: true, revealed: false, turnsInNeutralZone: 0 });
      // An occupied hidden mine also consumes the action, without a free probing oracle.
      next.logs.push(`[Gracz ${playerId.toUpperCase()}] Wykonano operację minową.`);
      break;
    }
    case 'clear_mine': {
      const mine = next.units.find(u => u.alive && u.type === 'mina' && u.ownerId !== playerId && samePosition(u.position, action.at));
      if (mine) destroy(mine);
      // Searching an empty square has exactly the same cost as a successful sweep.
      next.logs.push(`[Gracz ${playerId.toUpperCase()}] Wykonano operację minową.`);
      break;
    }
  }
  next = tickNeutralZoneTimers(next, playerId);
  next.turn++;
  next.revision++;
  next.activePlayerId = playerId === 'a' ? 'b' : 'a';
  next.winnerId = checkWinCondition(next);
  if (next.winnerId) {
    next.phase = 'finished';
    next.logs.push(`Koniec gry. Zwycięża gracz ${next.winnerId.toUpperCase()}.`);
  }
  // Mine wrecks vanish after the renderer's six-turn window; original ships remain
  // available for victory checks and the final reveal. Keep public history bounded.
  next.units = next.units.filter(u => u.alive || u.type !== 'mina' || next.turn - (u.destroyedAtTurn ?? next.turn) <= 6);
  next.logs = next.logs.slice(-200);
  return { newState: next };
}
