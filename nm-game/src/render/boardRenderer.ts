import type { GameState } from '../engine/types';
import { isExitTile } from '../engine/board';

export const TILE_SIZE = 40;

const RADAR_COLORS = {
  sea: 'transparent',       
  port: '#0a300c',          
  portExitBg: 'rgba(251, 191, 36, 0.2)', // Żółte tło wyjścia
  portExitBorder: '#fbbf24',             // Żółta ramka     
  wall: '#39B52A',          
  grid: '#075518',          
  dots: '#39B52A'           
};

export class BoardRenderer {
  private ctx: CanvasRenderingContext2D;

  constructor(canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
  }

  public render(state: GameState) {
    if (!state || !state.board) return;

    const { board } = state;
    const canvas = this.ctx.canvas;
    
    const newWidth = board.columns * TILE_SIZE;
    const newHeight = board.rows * TILE_SIZE;
    if (canvas.width !== newWidth) canvas.width = newWidth;
    if (canvas.height !== newHeight) canvas.height = newHeight;

    this.ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let r = 0; r < board.rows; r++) {
      for (let c = 0; c < board.columns; c++) {
        const tile = board.tiles[r][c];
        const x = c * TILE_SIZE;
        const y = r * TILE_SIZE;

        // Rysowanie portów
        if (tile.startsWith('port')) {
          if (isExitTile({ col: c, row: r })) {
            // NOWY STYL WYJŚCIA Z PORTU (Bez X)
            this.ctx.fillStyle = RADAR_COLORS.portExitBg;
            this.ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
            
            this.ctx.strokeStyle = RADAR_COLORS.portExitBorder;
            this.ctx.lineWidth = 1;
            this.ctx.setLineDash([4, 4]); // Przerywana linia dla oznaczenia strefy
            this.ctx.strokeRect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2);
            this.ctx.setLineDash([]); // Reset
          } else {
            // Zamknięty port
            this.ctx.fillStyle = RADAR_COLORS.port;
            this.ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
            
            // INTELIGENTNE RYSOWANIE OBWÓDKI PORTU
            this.ctx.strokeStyle = RADAR_COLORS.wall;
            this.ctx.lineWidth = 4;

            const tileAbove = r > 0 ? board.tiles[r-1][c] : null;
            const tileBelow = r < board.rows - 1 ? board.tiles[r+1][c] : null;
            const tileLeft = c > 0 ? board.tiles[r][c-1] : null;
            const tileRight = c < board.columns - 1 ? board.tiles[r][c+1] : null;

            const isOutside = (t: string | null) => t === 'sea' || t === 'neutral';

            if (isOutside(tileAbove)) {
              this.ctx.beginPath(); this.ctx.moveTo(x, y + 2); this.ctx.lineTo(x + TILE_SIZE, y + 2); this.ctx.stroke();
            }
            if (isOutside(tileBelow)) {
              this.ctx.beginPath(); this.ctx.moveTo(x, y + TILE_SIZE - 2); this.ctx.lineTo(x + TILE_SIZE, y + TILE_SIZE - 2); this.ctx.stroke();
            }
            if (isOutside(tileLeft)) {
              this.ctx.beginPath(); this.ctx.moveTo(x + 2, y); this.ctx.lineTo(x + 2, y + TILE_SIZE); this.ctx.stroke();
            }
            if (isOutside(tileRight)) {
              this.ctx.beginPath(); this.ctx.moveTo(x + TILE_SIZE - 2, y); this.ctx.lineTo(x + TILE_SIZE - 2, y + TILE_SIZE); this.ctx.stroke();
            }
          }
        }

        // Rysowanie strefy neutralnej
        if (tile === 'neutral') {
          this.ctx.fillStyle = RADAR_COLORS.dots;
          for (let dx = 8; dx < TILE_SIZE; dx += 12) {
            for (let dy = 8; dy < TILE_SIZE; dy += 12) {
              this.ctx.fillRect(x + dx, y + dy, 2, 2);
            }
          }
        }
      }
    }

    // Rysowanie siatki
    this.ctx.strokeStyle = RADAR_COLORS.grid;
    this.ctx.lineWidth = 1;
    for (let r = 0; r <= board.rows; r++) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, r * TILE_SIZE);
      this.ctx.lineTo(board.columns * TILE_SIZE, r * TILE_SIZE);
      this.ctx.stroke();
    }
    for (let c = 0; c <= board.columns; c++) {
      this.ctx.beginPath();
      this.ctx.moveTo(c * TILE_SIZE, 0);
      this.ctx.lineTo(c * TILE_SIZE, board.rows * TILE_SIZE);
      this.ctx.stroke();
    }
  }
}