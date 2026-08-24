// src/engine/combat.ts

import type { Unit } from './types';
import { UNIT_RULES } from './rules.config';

export interface CombatResult {
  attackerSurvived: boolean;
  defenderSurvived: boolean;
}

/**
 * Rozwiązuje starcie pomiędzy atakującym a obrońcą.
 * @param attacker Jednostka inicjująca atak
 * @param defender Jednostka zaatakowana
 * @param isClearMineAction Prawda, jeśli gracz zadeklarował akcję "Zdejmuję minę" (tylko dla trałowca)
 */
export function resolveCombat(
  attacker: Unit,
  defender: Unit,
  isClearMineAction: boolean = false
): CombatResult {
  
  // 1. Specjalna zasada: Zdejmowanie miny przez trałowca
  // Jeśli trałowiec używa akcji "Zdejmuję minę", mina ginie, a trałowiec przeżywa.
  if (attacker.type === 'tralowiec' && defender.type === 'mina') {
    if (isClearMineAction) {
      return { attackerSurvived: true, defenderSurvived: false };
    } else {
      // Jeśli trałowiec tylko "atakuje" minę (zwykły ruch ataku), giną obaj.
      return { attackerSurvived: false, defenderSurvived: false };
    }
  }

  // 2. Wpadnięcie na minę przez inny okręt
  // Mina niszczy napastnika, ale sama też jest usuwana z planszy po ataku[cite: 1].
  if (defender.type === 'mina') {
    return { attackerSurvived: false, defenderSurvived: false };
  }

  // 3. Remis: jednostki tego samego rodzaju niszczą się nawzajem[cite: 1].
  if (attacker.type === defender.type) {
    return { attackerSurvived: false, defenderSurvived: false };
  }

  // 4. Specjalna zasada: Niszczyciel vs Okręt podwodny
  // Wygrywa ten, kto zaatakuje jako pierwszy.
  if (
    (attacker.type === 'niszczyciel' && defender.type === 'okret_podwodny') ||
    (attacker.type === 'okret_podwodny' && defender.type === 'niszczyciel')
  ) {
    return { attackerSurvived: true, defenderSurvived: false };
  }

  // 5. Standardowe rozpatrzenie walki na podstawie rules.config.ts
  const attackerStats = UNIT_RULES[attacker.type];
  const attackerWins = attackerStats.destroys.includes(defender.type);
  
  if (attackerWins) {
    // Atakujący znajduje obrońcę na swojej liście "kogo niszczy"
    return { attackerSurvived: true, defenderSurvived: false };
  } else {
    // W przeciwnym razie silniejszy okazuje się obrońca i niszczy atakującego[cite: 1]
    return { attackerSurvived: false, defenderSurvived: true };
  }
}