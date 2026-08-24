// src/engine/rules.config.ts

// Naprawa błędu: dodano słówko 'type'
import type { UnitType } from './types';

export interface UnitStats {
  range: number;
  destroys: UnitType[];
  destroyedBy: UnitType[];
  isStationary?: boolean; // Określa, czy jednostka może się poruszać (np. bateria, mina)
}

export const BOARD_CONFIG = {
  columns: 20,
  rows: 12
};

// Pełna konfiguracja na podstawie "Karta ruchów pionów.txt"
export const UNIT_RULES: Record<UnitType, UnitStats> = {
  pancernik: {
    range: 2,
    destroys: ['pancernik', 'okret_rakietowy', 'krazownik', 'niszczyciel', 'eskortowiec', 'tralowiec', 'okret_desantowy'],
    destroyedBy: ['pancernik', 'okret_podwodny', 'bateria_nadbrzezna', 'mina']
  },
  
  okret_rakietowy: {
    range: 1,
    destroys: ['okret_rakietowy', 'krazownik', 'niszczyciel', 'eskortowiec', 'tralowiec', 'okret_desantowy', 'bateria_nadbrzezna'],
    destroyedBy: ['okret_rakietowy', 'pancernik', 'okret_podwodny', 'mina']
  },
  
  krazownik: {
    range: 2,
    destroys: ['krazownik', 'niszczyciel', 'eskortowiec', 'tralowiec', 'okret_desantowy'],
    destroyedBy: ['krazownik', 'pancernik', 'okret_rakietowy', 'okret_podwodny', 'bateria_nadbrzezna', 'mina']
  },
  
  niszczyciel: {
    range: 4,
    // UWAGA: Niszczy okręt podwodny tylko gdy atakuje pierwszy. Zostanie to obsłużone w logice walki (combat.ts).
    destroys: ['niszczyciel', 'okret_podwodny', 'eskortowiec', 'tralowiec', 'okret_desantowy'],
    destroyedBy: ['niszczyciel', 'pancernik', 'okret_rakietowy', 'krazownik', 'okret_podwodny', 'bateria_nadbrzezna', 'mina']
  },
  
  okret_podwodny: {
    range: 2,
    // UWAGA: Niszczy niszczyciel tylko gdy atakuje pierwszy. Zostanie to obsłużone w logice walki.
    destroys: ['okret_podwodny', 'pancernik', 'okret_rakietowy', 'krazownik', 'niszczyciel', 'tralowiec', 'okret_desantowy'],
    destroyedBy: ['okret_podwodny', 'eskortowiec', 'niszczyciel', 'bateria_nadbrzezna', 'mina']
  },
  
  eskortowiec: {
    range: 3,
    destroys: ['eskortowiec', 'okret_podwodny', 'tralowiec', 'okret_desantowy'],
    destroyedBy: ['eskortowiec', 'pancernik', 'okret_rakietowy', 'krazownik', 'niszczyciel', 'bateria_nadbrzezna', 'mina']
  },
  
  tralowiec: {
    range: 2,
    // UWAGA: Może zdejmować miny. Traktujemy to jako atak z wynikiem usunięcia miny w logice.
    destroys: ['tralowiec', 'okret_desantowy', 'mina'],
    destroyedBy: ['tralowiec', 'pancernik', 'okret_rakietowy', 'krazownik', 'niszczyciel', 'okret_podwodny', 'eskortowiec', 'bateria_nadbrzezna', 'mina']
  },
  
  okret_desantowy: {
    range: 1,
    destroys: [], // Nie atakuje
    destroyedBy: ['pancernik', 'okret_rakietowy', 'krazownik', 'niszczyciel', 'okret_podwodny', 'eskortowiec', 'tralowiec', 'bateria_nadbrzezna', 'mina']
  },
  
  bateria_nadbrzezna: {
    range: 1, // Bije w zasięgu jednego pola
    isStationary: true,
    destroys: ['pancernik', 'krazownik', 'niszczyciel', 'okret_podwodny', 'eskortowiec', 'tralowiec', 'okret_desantowy', 'bateria_nadbrzezna', 'mina'],
    destroyedBy: ['okret_rakietowy']
  },
  
  mina: {
    range: 0, 
    isStationary: true,
    destroys: ['pancernik', 'okret_rakietowy', 'krazownik', 'niszczyciel', 'okret_podwodny', 'eskortowiec', 'okret_desantowy', 'bateria_nadbrzezna'], // Wszystkie oprócz trałowca, który robi "Zdejmuję minę"
    destroyedBy: ['tralowiec']
  }
};