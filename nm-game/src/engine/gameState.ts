// src/engine/gameState.ts

import type { GameState, MoveAction, UnitType } from './types';
import { checkWinCondition } from './winCondition';
import { getTile } from './board';

const DESTROYS: Record<UnitType, UnitType[]> = {
  pancernik: ['pancernik', 'okret_rakietowy', 'krazownik', 'niszczyciel', 'eskortowiec', 'tralowiec', 'okret_desantowy'],
  okret_rakietowy: ['okret_rakietowy', 'krazownik', 'niszczyciel', 'eskortowiec', 'tralowiec', 'okret_desantowy', 'bateria_nadbrzezna'],
  krazownik: ['krazownik', 'niszczyciel', 'eskortowiec', 'tralowiec', 'okret_desantowy'],
  niszczyciel: ['niszczyciel', 'okret_podwodny', 'eskortowiec', 'tralowiec', 'okret_desantowy'], 
  okret_podwodny: ['okret_podwodny', 'pancernik', 'okret_rakietowy', 'krazownik', 'niszczyciel', 'tralowiec', 'okret_desantowy'], 
  eskortowiec: ['eskortowiec', 'okret_podwodny', 'tralowiec', 'okret_desantowy'],
  tralowiec: ['tralowiec', 'okret_desantowy'],
  okret_desantowy: [], 
  bateria_nadbrzezna: ['pancernik', 'krazownik', 'niszczyciel', 'okret_podwodny', 'eskortowiec', 'tralowiec', 'okret_desantowy', 'mina'],
  mina: ['pancernik', 'okret_rakietowy', 'krazownik', 'niszczyciel', 'okret_podwodny', 'eskortowiec', 'okret_desantowy', 'bateria_nadbrzezna']
};

export function applyMove(state: GameState, action: MoveAction, playerId: string): { newState: GameState, error?: string } {
  if (state.activePlayerId !== playerId) return { newState: state, error: 'Nie twoja tura' };
  
  const newState = { 
    ...state, 
    units: state.units.map(u => ({ ...u, position: { ...u.position } })), 
    logs: [...state.logs] 
  };
  
  const unit = newState.units.find(u => u.id === action.unitId);
  if (!unit || !unit.alive) return { newState: state, error: 'Jednostka nie żyje' };

  const formatName = (type: string) => type.toUpperCase().replace('_', ' ');
  const playerPrefix = `[Gracz ${playerId.toUpperCase()}]`;

  // === RUCH ===
  if (action.kind === 'move') {
    unit.position = action.to;
    newState.logs.push(`${playerPrefix} ${formatName(unit.type)} przemieścił się na koordynaty (${action.to.col}, ${action.to.row}).`);
  } 
 // === STAWIANIE MINY ===
  else if (action.kind === 'lay_mine') {
    if (unit.type !== 'tralowiec') return { newState: state, error: 'Tylko trałowiec może stawiać miny' };
    
    // Sprawdzanie fizyczności terenu (nie stawiamy na murach i lądzie)
    const targetTile = getTile(newState.board, action.at);
    if (!targetTile || targetTile === 'island' || targetTile.includes('wall')) {
      return { newState: state, error: 'Miny można stawiać tylko na wodzie' };
    }

    const mineCount = newState.units.filter(u => u.ownerId === playerId && u.type === 'mina' && u.alive).length;
    if (mineCount >= 6) return { newState: state, error: 'Brak min w magazynie' };

    newState.units.push({
      id: `mina_${Date.now()}`, 
      ownerId: playerId, 
      type: 'mina', 
      position: action.at, 
      alive: true, 
      revealed: true, // Zmienione na "true" dla ułatwienia testów
      turnsInNeutralZone: 0
    });
    newState.logs.push(`${playerPrefix} TRAŁOWIEC postawił ładunek na koordynatach (${action.at.col}, ${action.at.row}).`);
  }
  // === ROZBRAJANIE MINY ===
  else if (action.kind === 'clear_mine') {
    if (unit.type !== 'tralowiec') return { newState: state, error: 'Tylko trałowiec może rozbrajać miny' };
    const targetMine = newState.units.find(u => u.alive && u.position.col === action.at.col && u.position.row === action.at.row && u.type === 'mina');
    if (!targetMine) return { newState: state, error: 'Brak miny na tym polu' };

    targetMine.alive = false;
    targetMine.revealed = true;
    newState.logs.push(`${playerPrefix} TRAŁOWIEC pomyślnie rozbroił minę wroga na koordynatach (${action.at.col}, ${action.at.row}).`);
  }
  // === ATAK ===
  else if (action.kind === 'attack') {
    const target = newState.units.find(u => u.id === action.targetUnitId);
    if (!target || !target.alive) return { newState: state, error: 'Cel nie istnieje' };

    target.revealed = true;
    unit.revealed = true;

    if (target.type === 'mina') {
      // Jeśli wpadniesz na minę (lub ją zaatakujesz nie będąc trałowcem używającym akcji Zdejmij Minę), wybuchacie oboje!
      unit.alive = false;
      target.alive = false;
      newState.logs.push(`${playerPrefix} ${formatName(unit.type)} natrafił na MINĘ! Jednostka zatonęła wraz z ładunkiem.`);
    } else {
      const canKill = DESTROYS[unit.type].includes(target.type);
      if (canKill) {
        target.alive = false; 
        newState.logs.push(`${playerPrefix} ${formatName(unit.type)} zaatakował i zniszczył ${formatName(target.type)}!`);
      } else {
        unit.alive = false; 
        newState.logs.push(`${playerPrefix} ${formatName(unit.type)} zaatakował ${formatName(target.type)}, ale atak się nie powiódł. Atakujący zatonął!`);
      }
    }
  }

  // Wody neutralne
  newState.units.forEach(u => {
    if (u.ownerId === playerId && u.alive) {
      const tile = getTile(newState.board, u.position);
      if (tile === 'neutral') {
        u.turnsInNeutralZone += 1;
        if (u.turnsInNeutralZone >= 4) {
          u.alive = false;
          newState.logs.push(`${playerPrefix} ${formatName(u.type)} przebywał za długo na wodach neutralnych i został internowany!`);
        }
      } else {
        u.turnsInNeutralZone = 0;
      }
    }
  });

  newState.activePlayerId = newState.activePlayerId === 'a' ? 'b' : 'a';
  newState.turn += 1;

  const winner = checkWinCondition(newState);
  if (winner) {
    newState.phase = 'finished';
    newState.winnerId = winner;
    newState.logs.push(`>>> KONIEC GRY: GRACZ ${winner.toUpperCase()} ODNIÓSŁ ZWYCIĘSTWO! <<<`);
  }

  return { newState };
}