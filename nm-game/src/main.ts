// src/main.ts

import { store } from './store/store';
import { BoardRenderer, TILE_SIZE } from './render/boardRenderer';
import { UnitRenderer } from './render/unitRenderer';
import { InputHandler } from './render/inputHandler';
import type { Unit, GameState } from './engine/types';
import { getLegalMoves } from './engine/movement';
import { INITIAL_INVENTORY, isValidPlacement } from './engine/setup';
import { createInitialBoard } from './engine/board';
// ==========================================
// 0. SOCKET.IO – POŁĄCZENIE Z SERWEREM
// ==========================================
import { io } from 'socket.io-client';
const serverUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:3000' 
  : 'https://manewry-morskie-serwer.onrender.com/'; 

const socket = io(serverUrl);
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
const btnMenuFleetCreator = document.getElementById('btn-menu-fleet-creator') as HTMLButtonElement;
const btnBackToMenu = document.getElementById('btn-back-to-menu') as HTMLButtonElement;
const btnGameToMenu = document.getElementById('btn-game-to-menu') as HTMLButtonElement;
const btnResetSetup = document.getElementById('btn-reset-setup') as HTMLButtonElement;
const btnDownloadSetup = document.getElementById('btn-download-setup') as HTMLButtonElement;
const btnLoadSetup = document.getElementById('btn-load-setup') as HTMLButtonElement;
const inputLoadSetup = document.getElementById('input-load-setup') as HTMLInputElement;
const btnResetView = document.getElementById('btn-reset-view') as HTMLButtonElement;

btnLayMine.addEventListener('click', () => { gameInputHandler.actionMode = 'lay_mine'; btnLayMine.textContent = '💣 Wybierz pole na wodzie...'; });
btnClearMine.addEventListener('click', () => { gameInputHandler.actionMode = 'clear_mine'; btnClearMine.textContent = '✂️ Wybierz minę na planszy...'; });
btnToggleRules.addEventListener('click', () => rulesPanel.classList.add('open'));
btnCloseRules.addEventListener('click', () => rulesPanel.classList.remove('open'));
btnResetView?.addEventListener('click', () => { gameInputHandler.resetView(); });

// ==========================================
// GLOBALE SIECIOWE (Zabezpieczone)
// ==========================================
let myNetworkRole: 'a' | 'b' | null = null;
let currentRoomId: string | null = null;

// =====================================================================
// 2. FUNKCJA WCZYTUJĄCA FLOTĘ Z DYSKU (PANCERNA WERSJA)
// =====================================================================
function loadDefaultFleetFromStorage(myRole: 'a' | 'b') {
  const savedFleetJson = localStorage.getItem('nm_default_fleet');
  if (!savedFleetJson) return; 

  try {
    const savedUnits = JSON.parse(savedFleetJson);
    
    // Ładujemy flotę do kreatora z poprawną korektą pozycjonowania
    setupUnits = savedUnits.map((unit: any) => {
      let col = unit.position.col;
      let row = unit.position.row;

      if (myRole === 'b') {
        // Odbicie lustrzane dla gracza B (pozostaje bez zmian)
        col = 19 - col;
        row = 11 - row;
      } else {
        // KOREKTA DLA GRACZA A: cofamy to nieszczęsne przesunięcie o 1 w prawo (-1)
        col = col - 2; 
      }

      return {
        ...unit,
        id: `${myRole}_${Math.random()}`, 
        ownerId: myRole, 
        position: { col, row }
      };
    });

    // Aktualizujemy inwentarz, żeby statki zniknęły z panelu bocznego
    currentInventory = { ...INITIAL_INVENTORY };
    setupUnits.forEach((u) => {
      if (currentInventory[u.type] !== undefined) currentInventory[u.type]--;
    });
    
    console.log(`✅ Flota gracza ${myRole} załadowana z korektą pozycji!`);
  } catch (error) {
    console.error('❌ Błąd podczas ładowania floty:', error);
  }
}

// ==========================================
// 3. MULTIPLAYER – LOBBY I MAPA
// ==========================================
btnCreateRoom?.addEventListener('click', () => {
  socket.emit('create_room', { board: store.getState().board });
});

socket.on('room_created', (data: { roomId: string; playerId: 'a' }) => {
  myNetworkRole = data.playerId;
  (window as any).myNetworkRole = data.playerId; 
  currentRoomId = data.roomId; // ZAPISUJEMY ROOM ID!
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
  currentRoomId = data.roomId; // ZAPISUJEMY ROOM ID!
  store.setState({ ...store.getState(), board: data.board });
});

socket.on('game_ready', () => {
  if (roomCodeDisplay) roomCodeDisplay.style.display = 'none';
  alert('Połączenie nawiązane! Przechodzimy do rozstawiania floty.');
  
  if (myNetworkRole) {
    loadDefaultFleetFromStorage(myNetworkRole);
  }

  showScreen('screen-setup');
  renderSetup(); 
});

// NIEKTÓRE SERWERY UŻYWAJĄ TEGO ZDARZENIA (Teraz jest bezpieczne i wpisuje roomID!)
socket.on('game_started', (data: any) => {
  myNetworkRole = data.role;
  (window as any).myNetworkRole = data.role;
  currentRoomId = data.roomId; // <- KLUCZOWA POPRAWKA ZAPOBIEGAJĄCA WYRZUCANIU!
  
  store.setState({ ...data.state, roomId: data.roomId });
  
  loadDefaultFleetFromStorage(data.role);

  showScreen('screen-setup');
  renderSetup();
});

socket.on('error', (msg: string) => { alert(`BŁĄD KOMUNIKACJI: ${msg}`); });

socket.on('sync_action', (action: any) => {
  const success = store.dispatch(action, store.getState().activePlayerId);
  if (!success) {
    console.warn('⚠️ Uwaga: Zsynchronizowana akcja wroga została odrzucona przez lokalny silnik!', action);
  }
});

// ==========================================
// 4. LOGIKA KREATORA FLOTY (SETUP)
// ==========================================
let setupUnits: Unit[] = [];
let currentInventory = { ...INITIAL_INVENTORY };

function showScreen(screenId: 'screen-menu' | 'screen-setup' | 'screen-game') {
  document.querySelectorAll('.screen').forEach(screen => screen.classList.remove('active'));
  document.getElementById(screenId)?.classList.add('active');
}

btnMenuFleetCreator?.addEventListener('click', () => {
  showScreen('screen-setup');
  store.setState({ ...store.getState(), phase: 'setup', activePlayerId: 'a', units: [], roomId: 'local' });
  myNetworkRole = 'a';
  (window as any).myNetworkRole = 'a';
  currentRoomId = 'local';
  
  setupUnits = [];
  currentInventory = { ...INITIAL_INVENTORY };
  renderSetup();
});

btnBackToMenu?.addEventListener('click', () => {
  showScreen('screen-menu');
  if (currentRoomId && currentRoomId !== 'local') {
    socket.emit('leave_room', currentRoomId);
  }
  currentRoomId = null;
  myNetworkRole = null;
  (window as any).myNetworkRole = null;
});

btnGameToMenu?.addEventListener('click', () => {
  store.setState({ roomId: 'local', board: createInitialBoard(), units: [], turn: 1, activePlayerId: 'a', phase: 'lobby', winnerId: null, logs: [] });
  if (currentRoomId && currentRoomId !== 'local') { 
    socket.emit('leave_room', currentRoomId); 
  }
  currentRoomId = null; 
  myNetworkRole = null; 
  (window as any).myNetworkRole = null; 
  showScreen('screen-menu');
  dispatchConsole.innerHTML = '<p class="dispatch-msg">> Oczekiwanie na rozkazy...</p>';
  printedLogsCount = 0;
});

// NAPRAWA KROPEK W KREATORZE: Wymuszamy, by renderer wiedział, kim jesteśmy
function renderSetup() {
  const role = myNetworkRole || (window as any).myNetworkRole || 'a';
  const mockState: GameState = { 
    ...store.getState(), 
    activePlayerId: role, // TO ZABIERA KROPKI WROGA 
    phase: 'setup', 
    units: setupUnits, 
    logs: [] 
  };
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
      token.style.webkitMask = `url('./sprites/${type}.png') center/contain no-repeat`; 
      token.style.mask = `url('./sprites/${type}.png') center/contain no-repeat`;
      token.style.cursor = 'grab';
      token.addEventListener('dragstart', (e) => { 
        e.dataTransfer?.setData('text/plain', type); 
      });
      row.appendChild(token); 
      inventoryList.appendChild(row);
    }
  });
}

setupCanvas.addEventListener('dragover', (e) => e.preventDefault());
setupCanvas.addEventListener('drop', (e) => {
  e.preventDefault();
  const type = e.dataTransfer?.getData('text/plain') as Unit['type'];
  if (!type || currentInventory[type] <= 0) return;
  
  const rect = setupCanvas.getBoundingClientRect();
  const col = Math.floor((e.clientX - rect.left) / TILE_SIZE); 
  const row = Math.floor((e.clientY - rect.top) / TILE_SIZE);
  const role = myNetworkRole || (window as any).myNetworkRole || 'a';
  const mockState: GameState = { ...store.getState(), activePlayerId: role, units: setupUnits, logs: [] };
  
  if (isValidPlacement(mockState, type, { col, row }, role)) {
    setupUnits.push({ 
      id: `${role}_${Date.now()}`, 
      ownerId: role, 
      type, 
      position: { col, row }, 
      alive: true, 
      revealed: type === 'bateria_nadbrzezna', 
      turnsInNeutralZone: 0 
    });
    currentInventory[type]--; 
    renderSetup();
  }
});

setupCanvas.addEventListener('mousedown', (e) => {
  const rect = setupCanvas.getBoundingClientRect();
  const col = Math.floor((e.clientX - rect.left) / TILE_SIZE); 
  const row = Math.floor((e.clientY - rect.top) / TILE_SIZE);
  const clickedIndex = setupUnits.findIndex((u) => u.position.col === col && u.position.row === row);
  
  if (clickedIndex !== -1) {
    const unitType = setupUnits[clickedIndex].type;
    setupUnits.splice(clickedIndex, 1); 
    currentInventory[unitType]++; 
    renderSetup();
  }
});

/// =====================================================================
// 5. PANCERNA OBSŁUGA PRZYCISKU "ZATWIERDŹ FLOTĘ"
// =====================================================================
const btnSaveSetupOriginal = document.getElementById('btn-save-setup');

if (btnSaveSetupOriginal) {
  const btnSaveSetup = btnSaveSetupOriginal.cloneNode(true) as HTMLButtonElement;
  btnSaveSetupOriginal.parentNode?.replaceChild(btnSaveSetup, btnSaveSetupOriginal);

  btnSaveSetup.addEventListener('click', () => {
    const localRole = myNetworkRole || (window as any).myNetworkRole || 'a';
    const myUnits = setupUnits.filter(u => u.ownerId === localRole); 
    
    // Walidacja kompletu statków
    if (myUnits.length < 30) {
      alert(`Rozstaw wszystkie jednostki w dokach! (Obecnie masz: ${myUnits.length}/30)`);
      return;
    }

    // ZAPIS DO LOCAL STORAGE (Obracamy Gracza B na A dla bezpiecznego zapisu)
    const unitsToSave = myUnits.map(u => ({
      ...u,
      ownerId: 'a',
      position: localRole === 'b' 
        ? { col: 19 - u.position.col, row: 11 - u.position.row } 
        : { ...u.position }
    }));
    localStorage.setItem('nm_default_fleet', JSON.stringify(unitsToSave));

    // KIEROWANIE RUCHU
    const isMultiplayer = currentRoomId && currentRoomId !== 'local';

    if (!isMultiplayer) {
      // JESTEŚMY W LOKALNYM KREATORZE
      alert('Schemat floty został pomyślnie zapisany w pamięci komputera!');
      document.getElementById('screen-setup')?.classList.remove('active');
      document.getElementById('screen-menu')?.classList.add('active');
      
    } else {
      // JESTEŚMY W GRZE SIECIOWEJ
      btnSaveSetup.innerText = 'OCZEKIWANIE NA WROGA...';
      btnSaveSetup.disabled = true;
      btnSaveSetup.style.opacity = '0.5';
      btnSaveSetup.style.borderColor = '#fbbf24';
      btnSaveSetup.style.color = '#fbbf24';

      // WYSYŁAMY DOKŁADNIE TO, CZEGO OCZEKUJE SERWER W server.ts (submit_fleet)
      if ((window as any).socket) {
        (window as any).socket.emit('submit_fleet', { 
          roomId: currentRoomId, 
          role: localRole,
          fleet: myUnits 
        });
      }
    }
  });
}

btnResetSetup?.addEventListener('click', () => {
  setupUnits = []; 
  currentInventory = { ...INITIAL_INVENTORY }; 
  renderSetup();
});

btnDownloadSetup?.addEventListener('click', () => {
  const isFleetComplete = Object.entries(currentInventory).every(([type, count]) => type === 'mina' || count === 0);
  if (!isFleetComplete) { 
    alert('Musisz rozstawić wszystkie okręty i baterie nadbrzeżne przed pobraniem pliku!'); 
    return; 
  }
  
  const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(setupUnits, null, 2));
  const downloadAnchorNode = document.createElement('a'); 
  downloadAnchorNode.setAttribute('href', dataStr); 
  downloadAnchorNode.setAttribute('download', `flota_${new Date().getTime()}.json`);
  document.body.appendChild(downloadAnchorNode); 
  downloadAnchorNode.click(); 
  downloadAnchorNode.remove();
});

btnLoadSetup?.addEventListener('click', () => { 
  inputLoadSetup.click(); 
});

inputLoadSetup?.addEventListener('change', (event) => {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const loadedUnits = JSON.parse(e.target?.result as string);
      if (Array.isArray(loadedUnits)) {
        const role = myNetworkRole || (window as any).myNetworkRole || 'a';
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
        setupUnits.forEach((u) => { 
          if (currentInventory[u.type] !== undefined) currentInventory[u.type]--; 
        });
        renderSetup();
        alert('Flota pomyślnie wczytana i zaadaptowana do Twojej strony!');
      } else { 
        throw new Error('Nieprawidłowy format pliku.'); 
      }
    } catch (error) { 
      alert('Błąd podczas wczytywania! Upewnij się, że to poprawny plik .json z flotą.'); 
    }
    inputLoadSetup.value = '';
  };
  reader.readAsText(file);
});

// ==========================================
// 6. OBSŁUGA STARTU GRY Z SERWERA (PO ZATWIERDZENIU PRZEZ OBU)
// ==========================================
socket.on('game_start', (combinedUnits: Unit[]) => {
  alert('Przeciwnik zameldował gotowość! Zaczynamy bitwę!');
  store.setState({
    roomId: currentRoomId || 'local',
    board: store.getState().board, 
    units: combinedUnits, // <- Wrzucamy statki obu graczy prosto na planszę
    turn: 1,
    activePlayerId: 'a',
    phase: 'playing',
    winnerId: null,
    logs: ['Wojna wypowiedziana. Obydwie floty weszły do sektora!'],
  });
  showScreen('screen-game');
});

// ==========================================
// 8. RENDEROWANIE I PĘTLA GRY
// ==========================================
let printedLogsCount = 0;

store.subscribe((state: GameState) => {
  if (state.phase !== 'playing' && state.phase !== 'finished') return;
  
  const selectedId = gameInputHandler.getSelectedUnitId();
  if (selectedId && state.phase === 'playing') {
    const selectedUnit = state.units.find((u) => u.id === selectedId);
    if (selectedUnit && selectedUnit.type === 'tralowiec') {
      specialActionsPanel.style.display = 'flex';
      btnLayMine.textContent = 'POSTAW MINĘ'; 
      btnClearMine.textContent = 'ROZBROJ MINĘ';
      const laidMines = state.units.filter((u) => u.ownerId === state.activePlayerId && u.type === 'mina' && u.alive).length;
      mineCountText.textContent = `Miny: ${6 - laidMines}/6`;
    } else { 
      specialActionsPanel.style.display = 'none'; 
    }
  } else { 
    specialActionsPanel.style.display = 'none'; 
  }

  if (state.logs && state.logs.length > printedLogsCount) {
    for (let i = printedLogsCount; i < state.logs.length; i++) {
      let msgText = state.logs[i];
      const myRole = myNetworkRole || (window as any).myNetworkRole || 'a';
      const enemyRoleText = myRole === 'a' ? '[Gracz B]' : '[Gracz A]';

      if (msgText.includes(enemyRoleText) && msgText.includes('przemieścił')) {
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
  const myRole = myNetworkRole || (window as any).myNetworkRole;
  
  if (state.phase === 'finished') {
    turnIndicator.textContent = `KONIEC GRY! Wygrał Gracz ${state.winnerId?.toUpperCase()} (Runda ${currentRound})`; 
    turnIndicator.style.color = '#fbbf24';
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
          legalMoves.forEach((pos) => { 
            gameCtx.fillRect(pos.col * TILE_SIZE, pos.row * TILE_SIZE, TILE_SIZE, TILE_SIZE); 
          });
        }
        gameCtx.strokeStyle = '#62d83b'; 
        gameCtx.lineWidth = 2;
        gameCtx.strokeRect(
          selectedUnit.position.col * TILE_SIZE, 
          selectedUnit.position.row * TILE_SIZE, 
          TILE_SIZE, 
          TILE_SIZE
        );
      }
    }
    gameUnitRenderer.render(state);
  }
  requestAnimationFrame(renderLoop);
}

requestAnimationFrame(renderLoop);