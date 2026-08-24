// src/engine/board.ts

import type { BoardConfig, TileKind, Position } from './types';

// Twój dokładny plan mapy (18 kolumn x 12 wierszy)
const RAW_LAYOUT = [
  "PPPP~~~~~~~~~~~PPP", // 0
  "PPPP~~~~~~~~~~~PPP", // 1
  "PPPE~~~~~~~~~~~~EP", // 2
  "PPPP~~~~N~~~~~~~PP", // 3
  "PPPP~~~~NNN~~~~~PP", // 4
  "PP~~~~~NNNN~~~~~PP", // 5
  "PP~~~~~NNNN~~~~~PP", // 6
  "PP~~~~~NNN~~~~PPPP", // 7
  "PP~~~~~~~N~~~~PPPP", // 8
  "PE~~~~~~~~~~~~EPPP", // 9
  "PPP~~~~~~~~~~~PPPP", // 10
  "PPP~~~~~~~~~~~PPPP"  // 11
];

export function createInitialBoard(): BoardConfig {
  const rows = RAW_LAYOUT.length;
  const columns = RAW_LAYOUT[0].length; 
  const tiles: TileKind[][] = [];

  for (let r = 0; r < rows; r++) {
    const row: TileKind[] = [];
    for (let c = 0; c < columns; c++) {
      const char = RAW_LAYOUT[r][c];
      
      if (char === 'N') {
        row.push('neutral');
      } else if (char === '~') {
        row.push('sea');
      } else {
        // Zwykłe kafelki portu (silnik sam zarysuje wokół nich granice)
        row.push(c < columns / 2 ? 'port_a' : 'port_b');
      }
    }
    tiles.push(row);
  }

  return { columns, rows, tiles };
}

export function getTile(board: BoardConfig, pos: Position): TileKind | null {
  if (pos.row < 0 || pos.row >= board.rows || pos.col < 0 || pos.col >= board.columns) return null;
  return board.tiles[pos.row][pos.col];
}

// Sprawdza, czy pole jest żółtym wyjściem z portu
export function isExitTile(pos: Position): boolean {
  if (pos.row < 0 || pos.row >= RAW_LAYOUT.length || pos.col < 0 || pos.col >= RAW_LAYOUT[0].length) return false;
  return RAW_LAYOUT[pos.row][pos.col] === 'E';
}

// POPRAWKA: Dodano "?? false", aby uciszyć błąd TypeScript o zwracaniu "undefined"
function hasWallBetween(p1: Position, p2: Position, board: BoardConfig): boolean {
  const t1 = getTile(board, p1);
  const t2 = getTile(board, p2);
  
  const isP1Port = (t1?.startsWith('port') ?? false) && !isExitTile(p1);
  const isP2Port = (t2?.startsWith('port') ?? false) && !isExitTile(p2);
  const isP1Outside = t1 === 'sea' || t1 === 'neutral';
  const isP2Outside = t2 === 'sea' || t2 === 'neutral';

  return (isP1Port && isP2Outside) || (isP2Port && isP1Outside);
}

/**
 * Zablokowanie ruchu przez dynamicznie generowane ściany
 */
export function canCrossWall(from: Position, to: Position, board: BoardConfig): boolean {
  // Ruch w poziomie i pionie
  if (from.row === to.row || from.col === to.col) {
    return !hasWallBetween(from, to, board);
  }
  
  // Ruch na ukos (blokuje, jeśli jakakolwiek ścieżka brzegowa przecina mur)
  const corner1 = { col: from.col, row: to.row };
  const corner2 = { col: to.col, row: from.row };
  
  const crossesWall1 = hasWallBetween(from, corner1, board) || hasWallBetween(corner1, to, board);
  const crossesWall2 = hasWallBetween(from, corner2, board) || hasWallBetween(corner2, to, board);
  
  return !(crossesWall1 || crossesWall2);
}