import { installBoardViewport } from './render/viewport';
import { store, emptyState } from './store/store';
import { BoardRenderer, TILE_SIZE, BOARD_MARGIN } from './render/boardRenderer';
import { UnitRenderer } from './render/unitRenderer';
import { InputHandler } from './render/inputHandler';
import { pointerTile } from './render/coordinates';
import { installUnitLabels } from './render/unitLabels';
import { installEnemyTracker } from './render/enemyTracker';
import { createMenuPreview } from './render/menuPreview';
import { NetworkClient } from './network';
import type { Unit, GameView, PlayerId } from './engine/types';
import { getLegalMoves } from './engine/movement';
import { INITIAL_INVENTORY, isValidPlacement, isUnitType, validateFleet, encodeFleet, decodeFleet } from './engine/setup';

const themeSelectors = ['menu-theme', 'mode-selector'].map(id => document.getElementById(id) as HTMLSelectElement);
function applyTheme(theme: string) {
  const selected = ['ocean', 'paper', 'radar'].includes(theme) ? theme : 'ocean';
  document.documentElement.dataset.theme = selected;
  themeSelectors.forEach(select => { select.value = selected; });
  try { localStorage.setItem('nm_theme', selected); } catch { /* Optional preference. */ }
}
let savedTheme = 'ocean';
try { savedTheme = localStorage.getItem('nm_theme') ?? savedTheme; } catch { /* Storage may be disabled. */ }
applyTheme(savedTheme);
themeSelectors.forEach(select => select.addEventListener('change', () => applyTheme(select.value)));

const atmosphereButtons = document.querySelectorAll<HTMLButtonElement>('[data-atmosphere-toggle]');
let atmospherePaused = false;
try { atmospherePaused = localStorage.getItem('nm_atmosphere_paused') === 'true'; } catch { /* Optional preference. */ }
function renderAtmosphere() {
  document.documentElement.classList.toggle('atmosphere-paused', atmospherePaused);
  atmosphereButtons.forEach(button => {
    button.setAttribute('aria-pressed', String(atmospherePaused));
    button.textContent = atmospherePaused ? 'Wznów animację radaru' : 'Wstrzymaj animację radaru';
  });
}
atmosphereButtons.forEach(button => button.addEventListener('click', () => {
  atmospherePaused = !atmospherePaused;
  renderAtmosphere();
  try { localStorage.setItem('nm_atmosphere_paused', String(atmospherePaused)); } catch { /* Optional preference. */ }
}));
renderAtmosphere();

const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const button = (id: string) => element<HTMLButtonElement>(id);
const gameCanvas = element<HTMLCanvasElement>('game-canvas');
const renderMenuPreview = createMenuPreview(element<HTMLCanvasElement>('menu-canvas'));
const setupCanvas = element<HTMLCanvasElement>('setup-canvas');
const gameCtx = gameCanvas.getContext('2d')!;
const inventoryList = element<HTMLDivElement>('inventory-list');
const dispatchConsole = element<HTMLDivElement>('dispatch-console');
const turnBanner = element<HTMLDivElement>('turn-banner');
const specialActions = element<HTMLDivElement>('special-actions');
const roomDisplay = element<HTMLDivElement>('room-code-display');
const fileInput = element<HTMLInputElement>('input-load-setup');
const saveButton = button('btn-save-setup');
const serverUrl = import.meta.env.VITE_SERVER_URL || (['localhost', '127.0.0.1'].includes(location.hostname)
  ? 'http://localhost:3000' : 'https://manewry-morskie-serwer.onrender.com');
const network = new NetworkClient(serverUrl);
let localEditor = false;
let setupGame: string | null = null;
let setupUnits: Unit[] = [];
let inventory = { ...INITIAL_INVENTORY };
let draggedId: string | null = null;
let selectedPlacement: Unit['type'] | null = null;
let selectedSetupId: string | null = null;
const role = (): PlayerId => network.session?.playerId ?? 'a';
const gameBoard = new BoardRenderer(gameCanvas);
const setupBoard = new BoardRenderer(setupCanvas);
const gameUnits = new UnitRenderer(gameCanvas, role);
const setupRenderer = new UnitRenderer(setupCanvas, role);
installBoardViewport(gameCanvas, element('crt-container'), element('world-layer'));
const input = new InputHandler(gameCanvas, () => network.session?.playerId ?? null, () => network.canAct, action => network.action(action));
const resetUnitLabels = installUnitLabels(gameCanvas, element('unit-inspection'), () => store.getState(), role);
const bindEnemyTracker = installEnemyTracker(element('manual-tracker'));

function showScreen(id: 'screen-menu' | 'screen-setup' | 'screen-game') {
  const changed = !document.getElementById(id)!.classList.contains('active');
  document.querySelectorAll('.screen').forEach(screen => screen.classList.toggle('active', screen.id === id));
  if (changed) window.scrollTo({top:0,behavior:'instant'});
}
function report(error: unknown) { alert(error instanceof Error ? error.message : 'Nie udało się wykonać operacji.'); }
function task(operation: () => Promise<unknown>) { void operation().catch(report); }
function resetMenu() {
  localEditor = false; setupGame = null; setupUnits = []; draggedId = null;
  selectedPlacement = null; selectedSetupId = null;
  input.reset(); store.setState(emptyState()); showScreen('screen-menu');
  roomDisplay.style.display = 'none'; dispatchConsole.replaceChildren(); renderControls();
}
async function leave() { try { await network.leave(); } finally { resetMenu(); } }
function recalculateInventory() {
  inventory = { ...INITIAL_INVENTORY };
  for (const unit of setupUnits) inventory[unit.type]--;
}
function loadDefault() {
  try {
    const saved = localStorage.getItem('nm_default_fleet');
    if (!saved) return;
    const result = decodeFleet(JSON.parse(saved), store.getState().board, role());
    if (!result.ok) throw new Error(`Zapisana flota wymaga poprawy: ${result.error}`);
    setupUnits = result.units;
  } catch (error) { report(error); }
}
function setupLocked() {
  return !localEditor && (!network.connected || !network.synced || network.busy || !!network.state?.ready[role()]);
}
function renderControls() {
  const player = network.session?.playerId;
  bindEnemyTracker(network.session?.gameId ?? null, player ?? null);
  for (const label of document.querySelectorAll<HTMLElement>('[data-game-options]')) {
    label.hidden = !player || localEditor;
    label.textContent = `Linie trasy: ${network.state?.trailsEnabled === false ? 'wyłączone' : 'włączone'}`;
  }
  for (const label of document.querySelectorAll<HTMLElement>('[data-player-identity]')) {
    label.hidden = !player || localEditor;
    label.textContent = player ? `Jesteś graczem ${player.toUpperCase()} · Twój port: ${player === 'a' ? 'lewa' : 'prawa'} strona` : '';
  }
  element('connection-status').textContent = !network.connected
    ? 'Łączenie z serwerem… Pierwsze uruchomienie może potrwać około minuty.'
    : network.busy ? 'Czekamy na odpowiedź serwera…'
    : network.session ? 'Pokój aktywny — przekaż kod drugiej osobie.' : 'Połączono z serwerem. Możecie rozpocząć grę.';
  const unavailable = !network.connected || network.busy || !!network.session;
  button('btn-create-room').disabled = unavailable;
  element<HTMLInputElement>('create-trails').disabled = network.busy || !!network.session;
  button('btn-join-room').disabled = unavailable;
  button('btn-menu-fleet-creator').disabled = network.busy;
  saveButton.disabled = setupLocked();
  saveButton.textContent = network.state?.ready[role()] && !localEditor ? 'FLOTA ZATWIERDZONA — CZEKAM' : 'ZATWIERDŹ FLOTĘ';
  button('btn-reset-setup').disabled = setupLocked();
  button('btn-load-setup').disabled = setupLocked();
  button('btn-back-to-menu').disabled = network.busy;
  button('btn-game-to-menu').disabled = network.busy;
  const state = store.getState();
  if (state.phase === 'playing' || state.phase === 'finished') {
    let text: string;
    if (state.phase === 'finished') text = `ZWYCIĘSTWO GRACZA ${state.winnerId?.toUpperCase()}!`;
    else if (!network.connected || !network.synced) text = 'UTRACONO ŁĄCZNOŚĆ — ŁĄCZĘ PONOWNIE…';
    else if (!state.connected.a || !state.connected.b) text = 'OCZEKIWANIE NA POŁĄCZENIE PRZECIWNIKA…';
    else if (network.busy) text = 'OCZEKIWANIE NA POTWIERDZENIE…';
    else text = network.canAct ? 'Twój ruch' : 'Ruch przeciwnika…';
    turnBanner.textContent = text;
    turnBanner.classList.toggle('turn-active', network.canAct);
    const selected = state.units.find(u => u.id === input.getSelectedUnitId());
    specialActions.style.display = network.canAct && selected?.type === 'tralowiec' ? 'flex' : 'none';
  }
}
function renderSetup() {
  recalculateInventory();
  const mock: GameView = { ...store.getState(), phase: 'setup', activePlayerId: role(), units: setupUnits, logs: [] };
  setupBoard.render(mock); setupRenderer.render(mock);
  if (selectedSetupId && !setupUnits.some(u => u.id === selectedSetupId)) selectedSetupId = null;
  const selected = setupUnits.find(u => u.id === selectedSetupId);
  if (selected) {
    const ctx = setupCanvas.getContext('2d')!;
    ctx.strokeStyle = '#ffe39b'; ctx.lineWidth = 3;
    ctx.strokeRect(BOARD_MARGIN + selected.position.col * TILE_SIZE + 2, BOARD_MARGIN + selected.position.row * TILE_SIZE + 2, TILE_SIZE - 4, TILE_SIZE - 4);
  }
  element('setup-selection').textContent = selected ? 'Wybrano okręt. Dotknij nowego pola lub cofnij do magazynu.'
    : selectedPlacement ? `Wybrano: ${selectedPlacement.replaceAll('_', ' ')}. Dotknij wolnego pola portu.` : 'Wybierz jednostkę z magazynu, a potem dotknij pola portu.';
  button('btn-remove-unit').disabled = setupLocked() || !selected;
  const inventoryScroll = inventoryList.scrollLeft;
  inventoryList.replaceChildren();
  for (const [name, count] of Object.entries(inventory)) {
    if (name === 'mina' || count <= 0) continue;
    const row = document.createElement('button');
    row.type = 'button'; row.className = 'fleet-choice'; row.disabled = setupLocked();
    row.setAttribute('aria-pressed', String(selectedPlacement === name));
    row.addEventListener('click', () => { if (!setupLocked() && isUnitType(name)) { selectedPlacement = name; selectedSetupId = null; renderSetup(); } });
    row.style.cssText = 'display:flex;align-items:center;gap:10px';
    const label = document.createElement('span');
    label.textContent = `${name.toUpperCase().replaceAll('_', ' ')} (x${count})`;
    label.style.minWidth = '150px';
    const token = document.createElement('div');
    token.draggable = true;
    token.style.cssText = `width:32px;height:32px;background:var(--text-glow);mask:url('./sprites/${name}.png') center/contain no-repeat;cursor:grab`;
    token.addEventListener('dragstart', event => {
      if (setupLocked()) { event.preventDefault(); return; }
      event.dataTransfer?.setData('text/plain', name);
    });
    row.append(label, token); inventoryList.append(row);
  }
  inventoryList.scrollLeft = inventoryScroll;
  renderControls();
}

network.onState = state => {
  localEditor = false;
  const previous = store.getState();
  if (state.gameId !== previous.gameId || state.revision !== previous.revision) input.reset();
  store.setState(state);
  if (state.phase === 'lobby') {
    showScreen('screen-menu');
    roomDisplay.style.display = 'block';
    const text = document.createElement('p'); text.textContent = `Kod pokoju: ${state.roomId}. Linie trasy: ${state.trailsEnabled === false ? 'wyłączone' : 'włączone'}. Oczekiwanie na drugiego gracza.`;
    const exit = document.createElement('button'); exit.textContent = 'OPUŚĆ POKÓJ'; exit.addEventListener('click', () => task(leave));
    roomDisplay.replaceChildren(text, exit);
  } else if (state.phase === 'setup') {
    roomDisplay.style.display = 'none';
    if (setupGame !== state.gameId) { setupGame = state.gameId; setupUnits = []; loadDefault(); }
    if (state.ready[role()]) {
      setupUnits = state.units.filter((u): u is Unit => u.ownerId === role() && u.type !== 'unknown').map(u => ({ ...u, position: { ...u.position } }));
    }
    showScreen('screen-setup'); renderSetup();
  } else { roomDisplay.style.display = 'none'; showScreen('screen-game'); }
};
network.onStatus = renderControls;
network.onEnded = reason => { resetMenu(); alert(reason); };

button('btn-create-room').addEventListener('click', () => task(() => network.create(element<HTMLInputElement>('create-trails').checked)));
button('btn-join-room').addEventListener('click', () => {
  const code = element<HTMLInputElement>('input-room-code').value.trim().toUpperCase();
  if (!/^[A-F0-9]{8}$/.test(code)) { alert('Wpisz ośmioznakowy kod pokoju.'); return; }
  task(() => network.join(code));
});
button('btn-menu-fleet-creator').addEventListener('click', () => task(async () => {
  if (network.session) await leave();
  localEditor = true; setupGame = 'local'; setupUnits = [];
  store.setState({ ...emptyState(), phase: 'setup' }); loadDefault(); showScreen('screen-setup'); renderSetup();
}));
button('btn-back-to-menu').addEventListener('click', () => task(leave));
button('btn-game-to-menu').addEventListener('click', () => task(leave));
button('btn-reset-setup').addEventListener('click', () => { if (!setupLocked()) { setupUnits = []; renderSetup(); } });
button('btn-lay-mine').addEventListener('click', () => { if (network.canAct) { input.actionMode = 'lay_mine'; button('btn-lay-mine').textContent = 'WYBIERZ POLE'; } });
button('btn-clear-mine').addEventListener('click', () => { if (network.canAct) { input.actionMode = 'clear_mine'; button('btn-clear-mine').textContent = 'WYBIERZ POLE DO PRZESZUKANIA'; } });

let suppressSetupClick = false;
button('btn-remove-unit').addEventListener('click', () => {
  if (setupLocked() || !selectedSetupId) return;
  setupUnits = setupUnits.filter(u => u.id !== selectedSetupId); selectedSetupId = null; renderSetup();
});
button('btn-cancel-placement').addEventListener('click', () => { selectedPlacement = null; selectedSetupId = null; renderSetup(); });
button('btn-setup-zoom').addEventListener('click', () => {
  const enlarged = setupCanvas.closest('.crt-screen')!.classList.toggle('setup-enlarged');
  button('btn-setup-zoom').textContent = enlarged ? 'Pokaż cały port' : 'Powiększ port';
  button('btn-setup-zoom').setAttribute('aria-pressed', String(enlarged));
});
setupCanvas.addEventListener('click', event => {
  if (suppressSetupClick) { suppressSetupClick = false; return; }
  if (setupLocked()) return;
  const pos = pointerTile(setupCanvas, event); if (!pos) return;
  const target = setupUnits.find(u => u.position.col === pos.col && u.position.row === pos.row);
  const selected = setupUnits.find(u => u.id === selectedSetupId);
  if (selected && target?.id !== selected.id) {
    const remaining = setupUnits.filter(u => u.id !== selected.id && u.id !== target?.id);
    const state = { board: store.getState().board, units: remaining };
    if (isValidPlacement(state, selected.type, pos, role()) && (!target || isValidPlacement(state, target.type, selected.position, role()))) {
      const origin = selected.position; selected.position = pos; if (target) target.position = origin;
      selectedSetupId = null; renderSetup(); return;
    }
    element('setup-selection').textContent = 'Nie można przenieść jednostki na to pole.'; return;
  }
  if (target) { selectedSetupId = target.id; selectedPlacement = null; renderSetup(); return; }
  if (selectedPlacement && inventory[selectedPlacement] > 0) {
    if (!isValidPlacement({board:store.getState().board,units:setupUnits}, selectedPlacement, pos, role())) {
      element('setup-selection').textContent = 'Niedozwolone pole. Wybierz wolne pole swojego portu.'; return;
    }
    setupUnits.push({id:crypto.randomUUID(),ownerId:role(),type:selectedPlacement,position:pos,alive:true,revealed:selectedPlacement==='bateria_nadbrzezna',turnsInNeutralZone:0});
    renderSetup();
    if (inventory[selectedPlacement] === 0) { selectedPlacement = null; renderSetup(); }
  }
});
setupCanvas.addEventListener('dragover', event => event.preventDefault());
setupCanvas.addEventListener('drop', event => {
  event.preventDefault(); if (setupLocked()) return;
  const type = event.dataTransfer?.getData('text/plain');
  const pos = pointerTile(setupCanvas, event);
  if (!isUnitType(type) || type === 'mina' || inventory[type] <= 0 || !pos) return;
  if (!isValidPlacement({ board: store.getState().board, units: setupUnits }, type, pos, role())) return;
  setupUnits.push({ id: crypto.randomUUID(), ownerId: role(), type, position: pos, alive: true, revealed: type === 'bateria_nadbrzezna', turnsInNeutralZone: 0 });
  renderSetup();
});
setupCanvas.addEventListener('pointerdown', event => {
  if (event.pointerType !== 'mouse' || event.button !== 0 || setupLocked()) return;
  const pos = pointerTile(setupCanvas, event);
  const unit = pos && setupUnits.find(u => u.position.col === pos.col && u.position.row === pos.row);
  if (unit) { draggedId = unit.id; setupCanvas.setPointerCapture(event.pointerId); }
});
setupCanvas.addEventListener('pointerup', event => {
  const id = draggedId; draggedId = null;
  if (setupCanvas.hasPointerCapture(event.pointerId)) setupCanvas.releasePointerCapture(event.pointerId);
  if (!id || setupLocked()) return;
  const pos = pointerTile(setupCanvas, event);
  const unit = setupUnits.find(u => u.id === id);
  if (!unit || !pos) return;
  const target = setupUnits.find(u => u.id !== id && u.position.col === pos.col && u.position.row === pos.row);
  const remaining = setupUnits.filter(u => u.id !== id && u.id !== target?.id);
  const state = { board: store.getState().board, units: remaining };
  if (!isValidPlacement(state, unit.type, pos, role()) || target && !isValidPlacement(state, target.type, unit.position, role())) return;
  const origin = { ...unit.position };
  if (unit.position.col !== pos.col || unit.position.row !== pos.row) suppressSetupClick = true;
  unit.position = pos;
  if (target) target.position = origin;
  renderSetup();
});
setupCanvas.addEventListener('pointercancel', () => { draggedId = null; });
setupCanvas.addEventListener('contextmenu', event => {
  event.preventDefault(); if (setupLocked()) return;
  const pos = pointerTile(setupCanvas, event);
  if (!pos) return;
  setupUnits = setupUnits.filter(u => u.position.col !== pos.col || u.position.row !== pos.row);
  renderSetup();
});

saveButton.addEventListener('click', () => task(async () => {
  if (setupLocked()) return;
  const result = validateFleet(setupUnits, store.getState().board, role());
  if (!result.ok) throw new Error(result.error);
  const saved = encodeFleet(result.units, store.getState().board, role());
  try { localStorage.setItem('nm_default_fleet', JSON.stringify(saved)); }
  catch { alert('Przeglądarka nie pozwala zapisać floty. Możesz pobrać schemat do pliku.'); }
  if (localEditor) { resetMenu(); alert('Flota została zatwierdzona.'); }
  else await network.submitFleet(result.units);
}));
button('btn-download-setup').addEventListener('click', () => {
  try {
    const data = encodeFleet(setupUnits, store.getState().board, role());
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'flota-v2.json'; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) { report(error); }
});
button('btn-load-setup').addEventListener('click', () => { if (!setupLocked()) fileInput.click(); });
fileInput.addEventListener('change', () => task(async () => {
  const file = fileInput.files?.[0]; fileInput.value = '';
  if (!file || setupLocked()) return;
  if (file.size > 32_768) throw new Error('Plik floty jest zbyt duży.');
  const gameId = setupGame;
  const data: unknown = JSON.parse(await file.text());
  if (gameId !== setupGame || setupLocked()) return;
  const result = decodeFleet(data, store.getState().board, role());
  if (!result.ok) throw new Error(result.error);
  setupUnits = result.units; renderSetup();
}));

store.subscribe(state => {
  resetUnitLabels();
  if (state.phase !== 'playing' && state.phase !== 'finished') return;
  element<HTMLSpanElement>('round-number').textContent = String(Math.ceil(state.turn / 2));
  element<HTMLSpanElement>('mine-count').textContent = `Miny: ${6 - state.units.filter(u => u.alive && u.ownerId === role() && u.type === 'mina').length}/6`;
  button('btn-lay-mine').textContent = 'POSTAW MINĘ'; button('btn-clear-mine').textContent = 'ROZBROJ MINĘ';
  dispatchConsole.replaceChildren(...state.logs.map(text => { const line = document.createElement('div'); line.className = 'dispatch-msg'; line.textContent = `> ${text}`; return line; }));
  dispatchConsole.scrollTop = dispatchConsole.scrollHeight;
  renderControls();
});
let moveCache = { revision: -1, gameId: '', selected: '', moves: [] as { row: number; col: number }[] };
function renderLoop() {
  const state = store.getState();
  if (element('screen-menu').classList.contains('active')) renderMenuPreview();
  if (state.phase === 'playing' || state.phase === 'finished') {
    gameBoard.render(state);
    const id = input.getSelectedUnitId();
    if (id && network.canAct) {
      if (moveCache.revision !== state.revision || moveCache.gameId !== state.gameId || moveCache.selected !== id) {
        moveCache = { revision: state.revision, gameId: state.gameId, selected: id, moves: getLegalMoves(state, id) };
      }
      if (input.actionMode === 'default') {
        gameCtx.fillStyle = 'rgba(98,216,59,0.2)';
        for (const pos of moveCache.moves) gameCtx.fillRect(BOARD_MARGIN + pos.col * TILE_SIZE, BOARD_MARGIN + pos.row * TILE_SIZE, TILE_SIZE, TILE_SIZE);
      }
      const unit = state.units.find(u => u.id === id);
      if (unit) { gameCtx.strokeStyle = '#62d83b'; gameCtx.strokeRect(BOARD_MARGIN + unit.position.col * TILE_SIZE, BOARD_MARGIN + unit.position.row * TILE_SIZE, TILE_SIZE, TILE_SIZE); }
    }
    gameUnits.render(state);
  }
  requestAnimationFrame(renderLoop);
}
renderControls(); network.socket.connect(); requestAnimationFrame(renderLoop);
