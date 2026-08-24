// src/render/unitRenderer.ts

import type { GameState } from '../engine/types';
import { TILE_SIZE } from './boardRenderer';

const sprites: Record<string, HTMLCanvasElement> = {};
const spriteNames = [
  'pancernik', 'okret_rakietowy', 'krazownik', 'niszczyciel', 
  'okret_podwodny', 'eskortowiec', 'tralowiec', 'okret_desantowy', 
  'bateria_nadbrzezna', 'mina'
];

spriteNames.forEach(name => {
  const img = new Image();
  img.src = `./sprites/${name}.png`; 
  img.onload = () => {
    const tintCanvas = document.createElement('canvas');
    tintCanvas.width = img.width;
    tintCanvas.height = img.height;
    const tCtx = tintCanvas.getContext('2d')!;
    tCtx.drawImage(img, 0, 0);
    tCtx.globalCompositeOperation = 'source-in';
    tCtx.fillStyle = '#62d83b'; 
    tCtx.fillRect(0, 0, tintCanvas.width, tintCanvas.height);
    sprites[name] = tintCanvas;
  };
});

export class UnitRenderer {
  private ctx: CanvasRenderingContext2D;
  constructor(canvas: HTMLCanvasElement) { this.ctx = canvas.getContext('2d')!; }

  public render(state: GameState) {
    if (!state || !state.units) return;
    const time = Date.now();
    const pulse = (Math.sin(time / 318.3) + 1) / 2; 

    // SPRAWDZAMY KIM JEST LOKALNY GRACZ (jeśli gramy offline, używamy activePlayerId)
    const localPlayer = (window as any).myNetworkRole || state.activePlayerId;

    state.units.forEach(unit => {
      if (!unit.position || unit.position.col < 0) return;
      const cx = unit.position.col * TILE_SIZE + TILE_SIZE / 2;
      const cy = unit.position.row * TILE_SIZE + TILE_SIZE / 2;
      
      if (!unit.alive) {
        this.ctx.strokeStyle = 'rgba(239, 68, 68, 0.6)'; 
        this.ctx.lineWidth = 3; this.ctx.shadowBlur = 5; this.ctx.shadowColor = 'rgba(239, 68, 68, 0.4)';
        this.ctx.beginPath();
        this.ctx.moveTo(cx - 10, cy - 10); this.ctx.lineTo(cx + 10, cy + 10);
        this.ctx.moveTo(cx + 10, cy - 10); this.ctx.lineTo(cx - 10, cy + 10);
        this.ctx.stroke(); this.ctx.shadowBlur = 0;
        return; 
      }

      // WIDZISZ TYLKO SWOJE STATKI (lub te ujawnione)
      let isVisible = unit.revealed || unit.ownerId === localPlayer || state.phase === 'finished';
      
      if (unit.type === 'mina' && unit.ownerId !== localPlayer && state.phase !== 'finished') {
        isVisible = false;
      }

      if (!isVisible) {
        this.ctx.fillStyle = '#62d83b'; 
        this.ctx.shadowBlur = 15 * pulse; this.ctx.shadowColor = '#62d83b';
        this.ctx.globalAlpha = 0.2 + (0.8 * pulse); 
        this.ctx.beginPath(); this.ctx.arc(cx, cy, 3, 0, Math.PI * 2); this.ctx.fill();
        this.ctx.globalAlpha = 1.0; this.ctx.shadowBlur = 0;
        return;
      }

      const size = 32; 
      if (sprites[unit.type]) { 
        this.ctx.shadowBlur = 8; this.ctx.shadowColor = '#62d83b';
        this.ctx.drawImage(sprites[unit.type], cx - size / 2, cy - size / 2, size, size);
        this.ctx.shadowBlur = 0;
      } else {
        this.ctx.fillStyle = '#62d83b';
        this.ctx.beginPath(); this.ctx.arc(cx, cy, 10, 0, Math.PI * 2); this.ctx.fill();
      }
    });
  }

  public renderDragged(type: string, x: number, y: number) {
    const size = 32;
    if (sprites[type]) {
      this.ctx.shadowBlur = 15; this.ctx.shadowColor = '#62d83b';
      this.ctx.drawImage(sprites[type], x - size / 2, y - size / 2, size, size);
      this.ctx.shadowBlur = 0;
    }
  }
}