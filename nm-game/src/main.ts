// src/main.ts

import { store } from './store/store';
import { BoardRenderer, TILE_SIZE } from './render/boardRenderer';
import { UnitRenderer } from './render/unitRenderer';
import { InputHandler } from './render/inputHandler';
import type { Unit, GameState } from './engine/types';
import { getLegalMoves } from './engine/movement';
import { INITIAL_INVENTORY, isValidPlacement } from './engine/setup';
import { createInitialBoard, isExitTile } from './engine/board';

// ==========================================
// 0. SOCKET.IO – POŁĄCZENIE Z SERWEREM
// ==========================================
import { io } from 'socket.io-client';
const socket = io('http://localhost:3000');
(window as any).socket = socket;

// ==========================================
// 1. POBIERANIE ELEMENTÓW Z DOM
// ==========================================
const gameCanvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const setupCanvas = document.getElementById('setup-canvas') as HTMLCanvasElement;
const turnIndicator = document.getElementById('turn-indicator') as HTMLHeadingElement;
const inventoryList = document.getElementById('inventory-list') as HTMLDivElement;
const gameCtx = gameCanvas.getContext('2d')!;

const gameBoardRenderer = new BoardRenderer(gameCanvas);
const gameUnitRenderer = new UnitRenderer(gameCanvas);
const gameInputHandler = new InputHandler(gameCanvas);
const setupBoardRenderer = new BoardRenderer(setupCanvas);
const setupUnitRenderer = new UnitRenderer(setupCanvas);

const rulesPanel = document.getElementById('rules-panel') as HTMLDivElement;
const btnToggleRules = document.getElementById('btn-toggle-rules') as HTMLButtonElement;
const btnCloseRules = document.getElementById('btn-close-rules') as HTMLButtonElement;
const dispatchConsole = document.getElementById('dispatch-console') as HTMLDivElement;
const specialActionsPanel = document.getElementById('special-actions') as HTMLDivElement;
const btnLayMine = document.getElementById('btn-lay-mine') as HTMLButtonElement;
const btnClearMine = document.getElementById('btn-clear-mine') as HTMLButtonElement;
const mineCountText = document.getElementById('mine-count') as HTMLSpanElement;
const btnCreateRoom = document.getElementById('btn-create-room') as HTMLButtonElement;
const btnJoinRoom = document.getElementById('btn-join-room') as HTMLButtonElement;
const inputRoomCode = document.getElementById('input-room-code') as HTMLInputElement;
const roomCodeDisplay = document.getElementById('room-code-display') as HTMLDivElement;

btnLayMine.addEventListener('click', () => { gameInputHandler.actionMode = 'lay_mine'; btnLayMine.textContent = '💣 Wybierz pole na wodzie...'; });
btnClearMine.addEventListener('click', () => { gameInputHandler.actionMode = 'clear_mine'; btnClearMine.textContent = '✂️ Wybierz minę na planszy...'; });
btnToggleRules.addEventListener('click', () => rulesPanel.classList.add('open'));
btnCloseRules.addEventListener('click', () => rulesPanel.classList.remove('open'));
document.getElementById('btn-reset-view')?.addEventListener('click', () => { gameInputHandler.resetView(); });

function showScreen(screenId: 'screen-menu' | 'screen-setup' | 'screen-game') {
  document.querySelectorAll('.screen').forEach(screen => screen.classList.remove('active'));
  document.getElementById(screenId)?.classList.add('active');
}

// ==========================================
// 3. MULTIPLAYER – LOBBY I MAPA
// ==========================================
let myNetworkRole: 'a' | 'b' | null = null;
let currentRoomId: string | null = null;

btnCreateRoom?.addEventListener('click', () => {
  socket.emit('create_room', { board: store.getState().board });
});

socket.on('room_created', (data: { roomId: string; playerId: 'a' }) => {
  myNetworkRole = data.playerId;
  (window as any).myNetworkRole = data.playerId; 
  currentRoomId = data.roomId;
  if (roomCodeDisplay) {
    roomCodeDisplay.style.display = 'block';
    roomCodeDisplay.innerHTML = `OPERACJA UTWORZONA!<br/>Twój kod to: <span style="font-size: 2rem;">${data.roomId}</span><br/>Czekam na drugiego gracza...`;
  }
});

btnJoinRoom?.addEventListener('click', () => {
  const code = inputRoomCode.value.trim().toUpperCase();
  if (code) socket.emit('join_room', code);
  else alert('Wpisz kod operacyjny!');
});

socket.on('room_joined', (data: { roomId: string; playerId: 'b'; board: any }) => {
  myNetworkRole = data.playerId;
  (window as any).myNetworkRole = data.playerId; 
  currentRoomId = data.roomId;
  store.setState({ ...store.getState(), board: data.board });
});

socket.on('game_ready', () => {
  if (roomCodeDisplay) roomCodeDisplay.style.display = 'none';
  alert('Połączenie nawiązane! Przechodzimy do rozstawiania floty.');
  showScreen('screen-setup');
  renderSetup(); 
});

socket.on('error', (msg: string) => { alert(`BŁĄD KOMUNIKACJI: ${msg}`); });

socket.on('sync_action', (action: any) => {
  store.dispatch(action, store.getState().activePlayerId);
});

document.getElementById('btn-back-to-menu')?.addEventListener('click', () => showScreen('screen-menu'));
document.getElementById('btn-game-to-menu')?.addEventListener('click', () => {
  store.setState({ roomId: 'local', board: createInitialBoard(), units: [], turn: 1, activePlayerId: 'a', phase: 'lobby', winnerId: null, logs: [] });
  if (currentRoomId) { socket.emit('leave_room', currentRoomId); currentRoomId = null; myNetworkRole = null; (window as any).myNetworkRole = null; }
  showScreen('screen-menu');
  dispatchConsole.innerHTML = '<p class="dispatch-msg">> Oczekiwanie na rozkazy...</p>';
  printedLogsCount = 0;
});

// ==========================================
// 4. LOGIKA KREATORA FLOTY (SETUP)
// ==========================================
let setupUnits: Unit[] = [];
let currentInventory = { ...INITIAL_INVENTORY };

function renderSetup() {
  const mockState: GameState = { ...store.getState(), phase: 'setup', units: setupUnits, logs: [] };
  setupBoardRenderer.render(mockState);
  setupUnitRenderer.render(mockState);
  renderInventory();
}

function renderInventory() {
  inventoryList.innerHTML = '';
  Object.entries(currentInventory).forEach(([type, count]) => {
    if (type === 'mina') return;
    if (count > 0) {
      const row = document.createElement('div');
      row.style.display = 'flex'; row.style.alignItems = 'center'; row.style.gap = '10px';
      row.innerHTML = `<span style="min-width: 150px; font-weight: bold; color: var(--text-normal);">${type.toUpperCase().replace('_', ' ')} (x${count})</span>`;
      const token = document.createElement('div');
      token.draggable = true; token.style.width = '32px'; token.style.height = '32px';
      token.style.backgroundColor = 'var(--text-glow)';
      token.style.webkitMask = `url('./sprites/${type}.png') center/contain no-repeat`; token.style.mask = `url('./sprites/${type}.png') center/contain no-repeat`;
      token.style.cursor = 'grab';
      token.addEventListener('dragstart', (e) => { e.dataTransfer?.setData('text/plain', type); });
      row.appendChild(token); inventoryList.appendChild(row);
    }
  });
}

setupCanvas.addEventListener('dragover', (e) => e.preventDefault());
setupCanvas.addEventListener('drop', (e) => {
  e.preventDefault();
  const type = e.dataTransfer?.getData('text/plain') as Unit['type'];
  if (!type || currentInventory[type] <= 0) return;
  const rect = setupCanvas.getBoundingClientRect();
  const col = Math.floor((e.clientX - rect.left) / TILE_SIZE); const row = Math.floor((e.clientY - rect.top) / TILE_SIZE);
  const mockState: GameState = { ...store.getState(), units: setupUnits, logs: [] };
  const role = myNetworkRole || 'a';
  if (isValidPlacement(mockState, type, { col, row }, role)) {
    setupUnits.push({ id: `${role}_${Date.now()}`, ownerId: role, type, position: { col, row }, alive: true, revealed: type === 'bateria_nadbrzezna', turnsInNeutralZone: 0 });
    currentInventory[type]--; renderSetup();
  }
});

setupCanvas.addEventListener('mousedown', (e) => {
  const rect = setupCanvas.getBoundingClientRect();
  const col = Math.floor((e.clientX - rect.left) / TILE_SIZE); const row = Math.floor((e.clientY - rect.top) / TILE_SIZE);
  const clickedIndex = setupUnits.findIndex((u) => u.position.col === col && u.position.row === row);
  if (clickedIndex !== -1) {
    const unitType = setupUnits[clickedIndex].type;
    setupUnits.splice(clickedIndex, 1); currentInventory[unitType]++; renderSetup();
  }
});

document.getElementById('btn-save-setup')?.addEventListener('click', () => {
  const isFleetComplete = Object.entries(currentInventory).every(([type, count]) => type === 'mina' || count === 0);
  if (!isFleetComplete) { alert('Musisz rozstawić wszystkie okręty i baterie nadbrzeżne przed zatwierdzeniem floty!'); return; }
  localStorage.setItem('nm-fleet-setup', JSON.stringify(setupUnits));

  if (currentRoomId && myNetworkRole) {
    socket.emit('submit_fleet', { roomId: currentRoomId, role: myNetworkRole, fleet: setupUnits });
    alert('Flota zatwierdzona! Oczekuję na rozkazy przeciwnika...');
  } else { startGameLocal(); }
});

document.getElementById('btn-reset-setup')?.addEventListener('click', () => {
  setupUnits = []; currentInventory = { ...INITIAL_INVENTORY }; renderSetup();
});

const btnDownloadSetup = document.getElementById('btn-download-setup') as HTMLButtonElement;
const btnLoadSetup = document.getElementById('btn-load-setup') as HTMLButtonElement;
const inputLoadSetup = document.getElementById('input-load-setup') as HTMLInputElement;

btnDownloadSetup?.addEventListener('click', () => {
  const isFleetComplete = Object.entries(currentInventory).every(([type, count]) => type === 'mina' || count === 0);
  if (!isFleetComplete) { alert('Musisz rozstawić wszystkie okręty i baterie nadbrzeżne przed pobraniem pliku!'); return; }
  const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(setupUnits, null, 2));
  const downloadAnchorNode = document.createElement('a'); downloadAnchorNode.setAttribute('href', dataStr); downloadAnchorNode.setAttribute('download', `flota_${new Date().getTime()}.json`);
  document.body.appendChild(downloadAnchorNode); downloadAnchorNode.click(); downloadAnchorNode.remove();
});

btnLoadSetup?.addEventListener('click', () => { inputLoadSetup.click(); });

inputLoadSetup?.addEventListener('change', (event) => {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const loadedUnits = JSON.parse(e.target?.result as string);
      if (Array.isArray(loadedUnits)) {
        const role = myNetworkRole || 'a';
        const board = store.getState().board;
        const maxCol = board.columns - 1;
        const maxRow = board.rows - 1;
        
        setupUnits = loadedUnits.map(u => {
          let c = u.position.col;
          let r = u.position.row;
          
          if (role === 'b' && c < board.columns / 2) {
            c = maxCol - c; 
            r = maxRow - r; 
          } else if (role === 'a' && c >= board.columns / 2) {
            c = maxCol - c;
            r = maxRow - r;
          }
          
          return { ...u, ownerId: role, id: `${role}_${Math.random()}`, position: { ...u.position, col: c, row: r } };
        });

        currentInventory = { ...INITIAL_INVENTORY };
        setupUnits.forEach((u) => { if (currentInventory[u.type] !== undefined) currentInventory[u.type]--; });
        renderSetup();
        alert('Flota pomyślnie wczytana i zaadaptowana do Twojej strony!');
      } else { throw new Error('Nieprawidłowy format pliku.'); }
    } catch (error) { alert('Błąd podczas wczytywania! Upewnij się, że to poprawny plik .json z flotą.'); }
    inputLoadSetup.value = '';
  };
  reader.readAsText(file);
});

// ==========================================
// 5. OBSŁUGA STARTU GRY Z SERWERA
// ==========================================
socket.on('game_start', (combinedUnits: Unit[]) => {
  alert('Przeciwnik zameldował gotowość! Zaczynamy bitwę!');
  store.setState({
    roomId: currentRoomId || 'local',
    board: store.getState().board, 
    units: combinedUnits,
    turn: 1,
    activePlayerId: 'a',
    phase: 'playing',
    winnerId: null,
    logs: ['Wojna wypowiedziana. Obydwie floty weszły do sektora!'],
  });
  showScreen('screen-game');
});

// ==========================================
// 6. GENERATOR I TRYB LOKALNY
// ==========================================
function generateRandomEnemyFleet(board: any): Unit[] {
  const units: Unit[] = [];
  const enemyInventory = { pancernik: 3, okret_rakietowy: 3, krazownik: 3, niszczyciel: 4, okret_podwodny: 4, eskortowiec: 4, tralowiec: 4, okret_desantowy: 1, bateria_nadbrzezna: 4 };
  const availablePortTiles: { col: number; row: number }[] = [];
  const wallTiles: { col: number; row: number }[] = [];
  for (let r = 0; r < board.rows; r++) {
    for (let c = 0; c < board.columns; c++) {
      if (board.tiles[r][c] === 'port_b') {
        availablePortTiles.push({ col: c, row: r });
        const left = c > 0 ? board.tiles[r][c - 1] : null; const above = r > 0 ? board.tiles[r - 1][c] : null;
        const below = r < board.rows - 1 ? board.tiles[r + 1][c] : null; const right = c < board.columns - 1 ? board.tiles[r][c + 1] : null;
        const isOutside = (t: string | null) => t === 'sea' || t === 'neutral';
        if ((isOutside(left) || isOutside(above) || isOutside(below) || isOutside(right)) && !isExitTile({ col: c, row: r })) { wallTiles.push({ col: c, row: r }); }
      }
    }
  }
  const popRandomPos = (arr: { col: number; row: number }[]) => {
    if (arr.length === 0) return null;
    return arr.splice(Math.floor(Math.random() * arr.length), 1)[0];
  };
  let unitIdCounter = 0;
  for (let i = 0; i < enemyInventory['bateria_nadbrzezna']; i++) {
    const pos = popRandomPos(wallTiles);
    if (pos) { units.push({ id: `b_bat_${unitIdCounter++}`, ownerId: 'b', type: 'bateria_nadbrzezna', position: pos, alive: true, revealed: true, turnsInNeutralZone: 0 }); const generalIdx = availablePortTiles.findIndex((p) => p.col === pos.col && p.row === pos.row); if (generalIdx !== -1) availablePortTiles.splice(generalIdx, 1); }
  }
  for (const [type, count] of Object.entries(enemyInventory)) {
    if (type === 'bateria_nadbrzezna') continue;
    for (let i = 0; i < count; i++) {
      const pos = popRandomPos(availablePortTiles);
      if (pos) units.push({ id: `b_${type}_${unitIdCounter++}`, ownerId: 'b', type: type as any, position: pos, alive: true, revealed: false, turnsInNeutralZone: 0 });
    }
  }
  return units;
}

function startGameLocal() {
  const savedSetup = localStorage.getItem('nm-fleet-setup');
  const playerAUnits: Unit[] = savedSetup ? JSON.parse(savedSetup) : setupUnits;
  const initialBoard = createInitialBoard();
  const enemyUnits = generateRandomEnemyFleet(initialBoard);
  store.setState({
    roomId: 'local', board: initialBoard, units: [...playerAUnits, ...enemyUnits], turn: 1, activePlayerId: 'a', phase: 'playing', winnerId: null, logs: ['Trening offline rozpoczęty!'],
  });
  showScreen('screen-game');
}

// ==========================================
// 7. RENDEROWANIE I PĘTLA GRY
// ==========================================
let printedLogsCount = 0;

store.subscribe((state: GameState) => {
  if (state.phase !== 'playing' && state.phase !== 'finished') return;
  const selectedId = gameInputHandler.getSelectedUnitId();
  if (selectedId && state.phase === 'playing') {
    const selectedUnit = state.units.find((u) => u.id === selectedId);
    if (selectedUnit && selectedUnit.type === 'tralowiec') {
      specialActionsPanel.style.display = 'flex';
      btnLayMine.textContent = 'POSTAW MINĘ'; btnClearMine.textContent = 'ROZBROJ MINĘ';
      const laidMines = state.units.filter((u) => u.ownerId === state.activePlayerId && u.type === 'mina' && u.alive).length;
      mineCountText.textContent = `Miny: ${6 - laidMines}/6`;
    } else { specialActionsPanel.style.display = 'none'; }
  } else { specialActionsPanel.style.display = 'none'; }

  if (state.logs && state.logs.length > printedLogsCount) {
    for (let i = printedLogsCount; i < state.logs.length; i++) {
      let msgText = state.logs[i];
      const myRole = (window as any).myNetworkRole || 'a';
      const enemyRoleText = myRole === 'a' ? '[Gracz B]' : '[Gracz A]';

      // --- POPRAWKA: Prawidłowa Mgła Wojny z użyciem wyrażenia regularnego ---
      if (msgText.includes(enemyRoleText) && msgText.includes('przemieścił')) {
        // Regex złapie wszystko (niezależnie od polskich znaków) co jest między [Gracz X] a słowem "przemieścił"
        const regex = new RegExp(`(\\[Gracz [AB]\\])\\s+(.*?)\\s+przemieścił`, 'i');
        msgText = msgText.replace(regex, '$1 NIEZNANY OBIEKT przemieścił');
      }

      const msg = document.createElement('div'); 
      msg.className = 'dispatch-msg'; 
      msg.textContent = `> ${msgText}`;
      dispatchConsole.appendChild(msg); 
      dispatchConsole.scrollTop = dispatchConsole.scrollHeight;
    }
    printedLogsCount = state.logs.length;
  }

  const currentRound = Math.ceil(state.turn / 2);
  const myRole = (window as any).myNetworkRole;
  
  if (state.phase === 'finished') {
    turnIndicator.textContent = `KONIEC GRY! Wygrał Gracz ${state.winnerId?.toUpperCase()} (Runda ${currentRound})`; turnIndicator.style.color = '#fbbf24';
  } else {
    const isMyTurn = myRole === state.activePlayerId;
    turnIndicator.textContent = `Runda ${currentRound} | Tura: ${state.activePlayerId.toUpperCase()} ${isMyTurn ? '(TWÓJ RUCH)' : '(CZEKAJ)'}`;
    turnIndicator.style.color = isMyTurn ? '#62d83b' : '#fff';
  }
});

function renderLoop() {
  const state = store.getState();
  if (state.phase === 'playing' || state.phase === 'finished') {
    gameBoardRenderer.render(state);
    const selectedId = gameInputHandler.getSelectedUnitId();
    if (selectedId && state.phase === 'playing') {
      const selectedUnit = state.units.find((u) => u.id === selectedId);
      if (selectedUnit) {
        if (gameInputHandler.actionMode === 'default') {
          const legalMoves = getLegalMoves(state, selectedId);
          gameCtx.fillStyle = 'rgba(98, 216, 59, 0.2)';
          legalMoves.forEach((pos) => { gameCtx.fillRect(pos.col * TILE_SIZE, pos.row * TILE_SIZE, TILE_SIZE, TILE_SIZE); });
        }
        gameCtx.strokeStyle = '#62d83b'; gameCtx.lineWidth = 2;
        gameCtx.strokeRect(selectedUnit.position.col * TILE_SIZE, selectedUnit.position.row * TILE_SIZE, TILE_SIZE, TILE_SIZE);
      }
    }
    gameUnitRenderer.render(state);
  }
  requestAnimationFrame(renderLoop);
}
requestAnimationFrame(renderLoop);