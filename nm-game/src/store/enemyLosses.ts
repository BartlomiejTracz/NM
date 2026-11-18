import type { PlayerId } from '../engine/types';

export const ENEMY_UNITS = [
  { name: 'Pancernik', max: 3 }, { name: 'Okręt rakietowy', max: 3 }, { name: 'Krążownik', max: 3 },
  { name: 'Niszczyciel', max: 4 }, { name: 'Okręt podwodny', max: 4 }, { name: 'Eskortowiec', max: 4 },
  { name: 'Trałowiec', max: 4 }, { name: 'Okręt desantowy', max: 1 }, { name: 'Bat. nadbrzeżna', max: 4 },
];
type SavedStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** Private notes: scoped to a game and seat, never inferred from hidden enemy types. */
export class EnemyLosses {
  private key: string | null = null;
  private memory = new Map<string, number[]>();
  constructor(privateStorage: () => SavedStorage = () => localStorage) { this.storage = privateStorage; }
  private storage: () => SavedStorage;

  bind(gameId: string | null, player: PlayerId | null) {
    this.key = gameId && player ? `nm_enemy_losses_v1:${gameId}:${player}` : null;
    if (!this.key || this.memory.has(this.key)) return;
    let saved: unknown;
    try { saved = JSON.parse(this.storage().getItem(this.key) ?? 'null'); } catch { /* Retain in memory when storage is unavailable. */ }
    this.memory.set(this.key, ENEMY_UNITS.map((unit, index) => {
      const value = Array.isArray(saved) ? saved[index] : 0;
      return Number.isInteger(value) && value >= 0 && value <= unit.max ? value : 0;
    }));
  }
  values() { return [...(this.key ? this.memory.get(this.key)! : ENEMY_UNITS.map(() => 0))]; }
  change(index: number, delta: number) {
    if (!this.key || !Number.isInteger(index) || !ENEMY_UNITS[index] || (delta !== 1 && delta !== -1)) return;
    const values = this.memory.get(this.key)!;
    values[index] = Math.max(0, Math.min(ENEMY_UNITS[index]!.max, values[index]! + delta));
    try { this.storage().setItem(this.key, JSON.stringify(values)); } catch { /* The live notes still work. */ }
  }
}
