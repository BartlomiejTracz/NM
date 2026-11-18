import { emptyState } from '../store/store';
import type { UnitType } from '../engine/types';
import { BoardRenderer } from './boardRenderer';
import { UnitRenderer } from './unitRenderer';

export function createMenuPreview(canvas: HTMLCanvasElement) {
  const board = new BoardRenderer(canvas), units = new UnitRenderer(canvas, () => 'a');
  const state = emptyState();
  const types: UnitType[] = ['pancernik','okret_rakietowy','krazownik','niszczyciel','okret_podwodny','eskortowiec','tralowiec','okret_desantowy','bateria_nadbrzezna'];
  state.phase = 'playing';
  types.forEach((type, index) => {
    const col = index % 3, row = Math.floor(index / 3);
    state.units.push({id:`preview-a-${index}`,type,ownerId:'a',position:{col,row},alive:true,revealed:false,turnsInNeutralZone:0});
    state.units.push({id:`preview-b-${index}`,type:'unknown',ownerId:'b',position:{col:17-col,row:11-row},alive:true,revealed:false,turnsInNeutralZone:0});
  });
  return () => { board.render(state); units.render(state); };
}
