// src/store/store.ts

import type { GameState, MoveAction } from '../engine/types';
import { applyMove } from '../engine/gameState';
import { createInitialBoard } from '../engine/board';

// Typ funkcji nasłuchującej zmian
type Subscriber = (state: GameState) => void;

export class GameStore {
  private state: GameState;
  private subscribers: Subscriber[] = [];

  constructor() {
    // Inicjalizacja domyślnego stanu gry dla lokalnego prototypu
    this.state = {
      roomId: 'local-room',
      board: createInitialBoard(),
      units: [], 
      turn: 1,
      activePlayerId: 'a', 
      phase: 'playing',
      winnerId: null,
      logs: [] // <-- DODANA TABLICA NA DEPESZE
    };
  }

  // Zwraca aktualny stan
  getState(): GameState {
    return this.state;
  }

  // Zapisuje funkcję, która ma się wywołać po każdej zmianie stanu
  subscribe(callback: Subscriber) {
    this.subscribers.push(callback);
    callback(this.state); // Wywołanie natychmiastowe dla pierwszego renderu
  }

  // Próbuje wykonać ruch i powiadamia subskrybentów o ewentualnym nowym stanie
  dispatch(action: MoveAction, playerId: string) {
    try {
      const { newState, error } = applyMove(this.state, action, playerId);
      
      if (error) {
        console.warn('Nieudany ruch:', error);
        return false; // Ruch się nie udał
      }

      this.state = newState;
      this.notify();
      return true; // Ruch wykonany pomyślnie
    } catch (criticalError) {
      // PANCERNE ZABEZPIECZENIE: Zamiast wieszać grę, łapiemy błąd z silnika!
      console.error('❌ BŁĄD KRYTYCZNY W SILNIKU GRY (applyMove):', criticalError);
      alert('Wykryto awarię silnika gry przy przetwarzaniu ruchu! Sprawdź konsolę (F12).');
      return false;
    }
  }

  // Ustawia stan bezpośrednio (przydatne np. do rozstawienia początkowego)
  setState(newState: GameState) {
    this.state = newState;
    this.notify();
  }

  private notify() {
    this.subscribers.forEach(sub => sub(this.state));
  }
}

// Eksportujemy jedną, globalną instancję (Singleton) dla naszej gry
export const store = new GameStore();