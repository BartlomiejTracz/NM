import type { GameState } from '../engine/types';
import { TILE_SIZE } from './boardRenderer';

const sprites: Record<string, HTMLCanvasElement> = {};
const spritesEnemy: Record<string, HTMLCanvasElement> = {}; // <-- NOWY BAZOR TEKSTUR DLA WROGA

const spriteNames = [
  'pancernik', 'okret_rakietowy', 'krazownik', 'niszczyciel', 
  'okret_podwodny', 'eskortowiec', 'tralowiec', 'okret_desantowy', 
  'bateria_nadbrzezna', 'mina'
];

spriteNames.forEach(name => {
  const img = new Image();
  img.src = `./sprites/${name}.png`; 
  img.onload = () => {
    // 1. ZIELONE SPRITE'Y (SOJUSZNICZE)
    const tintCanvas = document.createElement('canvas');
    tintCanvas.width = img.width;
    tintCanvas.height = img.height;
    const tCtx = tintCanvas.getContext('2d')!;
    tCtx.drawImage(img, 0, 0);
    tCtx.globalCompositeOperation = 'source-in';
    tCtx.fillStyle = '#62d83b'; 
    tCtx.fillRect(0, 0, tintCanvas.width, tintCanvas.height);
    sprites[name] = tintCanvas;

    // 2. CZERWONE SPRITE'Y (WROGIE)
    const tintCanvasEnemy = document.createElement('canvas');
    tintCanvasEnemy.width = img.width;
    tintCanvasEnemy.height = img.height;
    const eCtx = tintCanvasEnemy.getContext('2d')!;
    eCtx.drawImage(img, 0, 0);
    eCtx.globalCompositeOperation = 'source-in';
    eCtx.fillStyle = '#ef4444'; // Agresywny, radarowy czerwony
    eCtx.fillRect(0, 0, tintCanvasEnemy.width, tintCanvasEnemy.height);
    spritesEnemy[name] = tintCanvasEnemy;
  };
});

export class UnitRenderer {
  private ctx: CanvasRenderingContext2D;
  constructor(canvas: HTMLCanvasElement) { this.ctx = canvas.getContext('2d')!; }

  public render(state: GameState) {
    if (!state || !state.units) return;
    const time = Date.now();
    const pulse = (Math.sin(time / 318.3) + 1) / 2; 

    const localPlayer = (window as any).myNetworkRole || state.activePlayerId;

    state.units.forEach(unit => {
      if (!unit.position || unit.position.col < 0) return;
      const cx = unit.position.col * TILE_SIZE + TILE_SIZE / 2;
      const cy = unit.position.row * TILE_SIZE + TILE_SIZE / 2;
      
      const isEnemy = unit.ownerId !== localPlayer;
      
      // === LOGIKA ZNISZCZONYCH JEDNOSTEK (Znikający X) ===
      if (!unit.alive) {
        const destroyedAt = unit.destroyedAtTurn ?? state.turn; // Kiedy zatonął?
        const age = state.turn - destroyedAt; // Ile tur temu?
        
        // 3 rundy to 6 tur. Po 6 turach wrak znika bezpowrotnie z radaru.
        if (age > 6) return; 

        // Płynne zanikanie - im starszy wrak, tym mniejsze opacity
        const opacity = Math.max(0, 1 - (age / 6));

        this.ctx.strokeStyle = `rgba(239, 68, 68, ${0.6 * opacity})`; 
        this.ctx.lineWidth = 3; 
        this.ctx.shadowBlur = 5; 
        this.ctx.shadowColor = `rgba(239, 68, 68, ${0.4 * opacity})`;
        this.ctx.beginPath();
        this.ctx.moveTo(cx - 10, cy - 10); this.ctx.lineTo(cx + 10, cy + 10);
        this.ctx.moveTo(cx + 10, cy - 10); this.ctx.lineTo(cx - 10, cy + 10);
        this.ctx.stroke(); 
        this.ctx.shadowBlur = 0;
        return; 
      }

      // === LOGIKA WIDOCZNOŚCI I KROPEK ===
      let isVisible = unit.revealed || unit.ownerId === localPlayer || state.phase === 'finished';
      
      if (unit.type === 'mina' && isEnemy && state.phase !== 'finished') {
        isVisible = false;
      }

      // Jeśli jednostka jest wroga i ukryta, wyświetlamy niezidentyfikowaną ZIELONĄ kropkę. 
      // Wróg ujawnia swój kolor dopiero, gdy zostanie trafiony/wykryty!
      if (!isVisible) {
        this.ctx.fillStyle = '#62d83b'; 
        this.ctx.shadowBlur = 15 * pulse; 
        this.ctx.shadowColor = '#62d83b';
        this.ctx.globalAlpha = 0.2 + (0.8 * pulse); 
        this.ctx.beginPath(); this.ctx.arc(cx, cy, 3, 0, Math.PI * 2); this.ctx.fill();
        this.ctx.globalAlpha = 1.0; 
        this.ctx.shadowBlur = 0;
        return;
      }

      // === RYSOWANIE ODKRYTYCH JEDNOSTEK ===
      const size = 32; 
      const activeSprites = isEnemy ? spritesEnemy : sprites; // Wybór bazy kolorów
      const glowColor = isEnemy ? '#ef4444' : '#62d83b'; // Czerwony lub zielony blask

      if (activeSprites[unit.type]) { 
        this.ctx.shadowBlur = 8; 
        this.ctx.shadowColor = glowColor;
        this.ctx.drawImage(activeSprites[unit.type], cx - size / 2, cy - size / 2, size, size);
        this.ctx.shadowBlur = 0;
      } else {
        // Fallback w razie braku pliku graficznego
        this.ctx.fillStyle = glowColor;
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