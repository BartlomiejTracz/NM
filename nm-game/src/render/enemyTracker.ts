import type { PlayerId } from '../engine/types';
import { EnemyLosses, ENEMY_UNITS } from '../store/enemyLosses';

export function installEnemyTracker(container: HTMLElement) {
  const losses = new EnemyLosses();
  let active = false;
  const rows = ENEMY_UNITS.map((unit, index) => {
    const row = document.createElement('div'); row.className = 'enemy-tracker-row';
    const name = document.createElement('span'); name.textContent = unit.name;
    const controls = document.createElement('div');
    const minus = document.createElement('button'); minus.type = 'button'; minus.textContent = '−';
    minus.setAttribute('aria-label', `Zmniejsz straty: ${unit.name}`);
    const count = document.createElement('span'); count.setAttribute('aria-live', 'polite');
    const plus = document.createElement('button'); plus.type = 'button'; plus.textContent = '+';
    plus.setAttribute('aria-label', `Zwiększ straty: ${unit.name}`);
    minus.addEventListener('click', () => { losses.change(index, -1); render(); });
    plus.addEventListener('click', () => { losses.change(index, 1); render(); });
    controls.append(minus, count, plus); row.append(name, controls); container.append(row);
    return {minus, plus, count};
  });
  function render() {
    losses.values().forEach((value, index) => {
      const row = rows[index]!;
      row.count.textContent = `${value} / ${ENEMY_UNITS[index]!.max}`;
      row.minus.disabled = !active || value === 0;
      row.plus.disabled = !active || value === ENEMY_UNITS[index]!.max;
    });
  }
  return (gameId: string | null, player: PlayerId | null) => {
    active = !!gameId && !!player;
    losses.bind(gameId, player); render();
  };
}
