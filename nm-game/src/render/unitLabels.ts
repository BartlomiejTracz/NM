import type { GameView, PlayerId, ViewUnit } from '../engine/types';
import { pointerTile } from './coordinates';

const names: Record<ViewUnit['type'], string> = {
  pancernik: 'Pancernik', okret_rakietowy: 'Okręt rakietowy', krazownik: 'Krążownik',
  niszczyciel: 'Niszczyciel', okret_podwodny: 'Okręt podwodny', eskortowiec: 'Eskortowiec',
  tralowiec: 'Trałowiec', okret_desantowy: 'Okręt desantowy',
  bateria_nadbrzezna: 'Bateria nadbrzeżna', mina: 'Mina', unknown: 'Nieznana jednostka',
};

export function unitLabel(unit: ViewUnit, player: PlayerId): string {
  const side = unit.ownerId === player ? 'Twoja jednostka' : 'Przeciwnik';
  return `${names[unit.type]} · ${side} · ${String.fromCharCode(65 + unit.position.col)}${unit.position.row + 1}`;
}

export function installUnitLabels(canvas: HTMLCanvasElement, status: HTMLElement,
  getState: () => GameView, getPlayer: () => PlayerId) {
  const tooltip = document.createElement('div');
  tooltip.className = 'unit-tooltip'; tooltip.id = 'unit-tooltip';
  tooltip.setAttribute('role', 'tooltip'); tooltip.hidden = true;
  document.body.append(tooltip);
  const hint = 'Najedź na jednostkę lub dotknij własnego okrętu, aby poznać jego nazwę.';
  const hide = () => { tooltip.hidden = true; canvas.removeAttribute('aria-describedby'); };
  const reset = () => { hide(); status.textContent = hint; };
  const atPointer = (event: MouseEvent) => {
    const state = getState();
    if (state.phase !== 'playing' && state.phase !== 'finished') return;
    const pos = pointerTile(canvas, event);
    return pos && state.units.find(u => u.alive && u.position.col === pos.col && u.position.row === pos.row);
  };
  const show = (unit: ViewUnit, event: MouseEvent) => {
    tooltip.textContent = unitLabel(unit, getPlayer()); tooltip.hidden = false;
    canvas.setAttribute('aria-describedby', tooltip.id);
    tooltip.style.left = `${Math.max(8, Math.min(event.clientX + 14, window.innerWidth - tooltip.offsetWidth - 8))}px`;
    tooltip.style.top = `${Math.max(8, Math.min(event.clientY + 18, window.innerHeight - tooltip.offsetHeight - 8))}px`;
  };
  canvas.addEventListener('pointermove', event => {
    if (event.pointerType === 'touch' || event.buttons) { hide(); return; }
    const unit = atPointer(event);
    if (!unit) { hide(); return; }
    show(unit, event);
  });
  canvas.addEventListener('click', event => {
    const unit = atPointer(event);
    status.textContent = unit ? unitLabel(unit, getPlayer()) : hint;
    if (unit) show(unit, event); else hide();
  });
  canvas.addEventListener('pointerleave', hide);
  canvas.addEventListener('pointerdown', hide);
  window.addEventListener('scroll', hide, true);
  window.addEventListener('resize', hide);
  window.addEventListener('blur', hide);
  document.addEventListener('keydown', event => { if (event.key === 'Escape') hide(); });
  reset();
  return reset;
}
