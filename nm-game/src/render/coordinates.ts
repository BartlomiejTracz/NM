import type { Position } from '../engine/types';
import { TILE_SIZE } from './boardRenderer';

export function pointerTile(canvas: HTMLCanvasElement, event: { clientX: number; clientY: number }): Position | null {
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  const x = (event.clientX - rect.left) * canvas.width / rect.width;
  const y = (event.clientY - rect.top) * canvas.height / rect.height;
  if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return null;
  return { col: Math.floor(x / TILE_SIZE), row: Math.floor(y / TILE_SIZE) };
}
