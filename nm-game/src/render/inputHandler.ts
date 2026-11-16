import { store } from '../store/store';
import type { MoveAction, PlayerId } from '../engine/types';
import { getTile } from '../engine/board';
import { getLegalMoves, distance } from '../engine/movement';
import { UNIT_RULES } from '../engine/rules.config';
import { pointerTile } from './coordinates';

export class InputHandler {
  private selectedUnitId: string | null = null;
  public actionMode: 'default' | 'lay_mine' | 'clear_mine' = 'default';
  constructor(canvas: HTMLCanvasElement, getPlayer: () => PlayerId | null, canAct: () => boolean, send: (action: MoveAction) => Promise<void>) {
    canvas.addEventListener('click', event => {
      if (event.button !== 0 || !canAct()) return;
      const state = store.getState();
      const pos = pointerTile(canvas, event);
      const role = getPlayer();
      if (!pos || !role || state.phase !== 'playing' || state.activePlayerId !== role) return;
      const clicked = state.units.find(u => u.alive && u.position.col === pos.col && u.position.row === pos.row);
      if (clicked?.ownerId === role) {
        this.selectedUnitId = clicked.id; this.actionMode = 'default'; store.refresh(); return;
      }
      const selected = state.units.find(u => u.id === this.selectedUnitId && u.alive && u.ownerId === role);
      if (!selected || selected.type === 'unknown') { this.reset(); return; }
      let action: MoveAction | undefined;
      if (this.actionMode !== 'default') {
        if (selected.type !== 'tralowiec' || distance(selected.position, pos) > 2 || distance(selected.position, pos) === 0 || getTile(state.board, pos) === 'neutral' || getTile(state.board, selected.position) === 'neutral' || clicked) {
          alert('Wybierz wolne pole w zasięgu 2 pól, poza strefą neutralną.'); return;
        }
        action = { kind: this.actionMode, unitId: selected.id, at: pos };
      } else if (clicked) {
        if (selected.type === 'okret_desantowy' || selected.type === 'mina') { alert('Ta jednostka nie może atakować.'); return; }
        if (getTile(state.board, selected.position) === 'neutral' || getTile(state.board, pos) === 'neutral') { alert('Zakaz walki w strefie neutralnej.'); return; }
        if (distance(selected.position, pos) > UNIT_RULES[selected.type].range) { alert('Cel poza zasięgiem.'); return; }
        action = { kind: 'attack', unitId: selected.id, targetUnitId: clicked.id };
      } else if (getLegalMoves(state, selected.id).some(p => p.col === pos.col && p.row === pos.row)) {
        action = { kind: 'move', unitId: selected.id, to: pos };
      }
      if (action) { this.reset(); void send(action).catch(error => alert(error instanceof Error ? error.message : 'Nie wykonano ruchu.')); }
    });
  }
  getSelectedUnitId() { return this.selectedUnitId; }
  reset() { this.selectedUnitId = null; this.actionMode = 'default'; store.refresh(); }
}
