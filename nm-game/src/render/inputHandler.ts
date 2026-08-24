import { store } from '../store/store';
import type { Position } from '../engine/types';
import { TILE_SIZE } from './boardRenderer';
import { getLegalMoves } from '../engine/movement';
import { UNIT_RULES } from '../engine/rules.config';
import { isValidPlacement } from '../engine/setup';
import { isExitTile } from '../engine/board';

export class InputHandler {
  private selectedUnitId: string | null = null;
  private canvas: HTMLCanvasElement;
  private draggedUnitId: string | null = null;
  public dragX: number = 0; public dragY: number = 0;
  public actionMode: 'default' | 'lay_mine' | 'clear_mine' = 'default';
  public scale: number = 1; public offsetX: number = 0; public offsetY: number = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.canvas.addEventListener('mousedown', this.onMouseDown.bind(this));
    this.canvas.addEventListener('mousemove', this.onMouseMove.bind(this));
    this.canvas.addEventListener('mouseup', this.onMouseUp.bind(this));
    this.canvas.addEventListener('mouseleave', this.onMouseLeave.bind(this)); 
    this.canvas.addEventListener('contextmenu', this.onContextMenu.bind(this)); // Dodano PPM
  }

  private getMousePos(event: MouseEvent) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width; const scaleY = this.canvas.height / rect.height;
    return { x: (event.clientX - rect.left) * scaleX, y: (event.clientY - rect.top) * scaleY };
  }

  // Obsługa prawego przycisku myszy (Usuwanie do magazynu)
  private onContextMenu(event: MouseEvent) {
    event.preventDefault(); 
    const state = store.getState();
    if (state.phase !== 'setup') return;

    const localPlayer = (window as any).myNetworkRole || state.activePlayerId;

    if (this.draggedUnitId) {
      const newUnits = state.units.filter(u => u.id !== this.draggedUnitId);
      this.draggedUnitId = null; 
      store.setState({ ...state, units: newUnits });
      return; 
    }

    const { x, y } = this.getMousePos(event);
    const col = Math.floor(x / TILE_SIZE); 
    const row = Math.floor(y / TILE_SIZE);

    const clickedUnit = state.units.find(u => u.position.col === col && u.position.row === row && u.ownerId === localPlayer);
    
    if (clickedUnit) {
      const newUnits = state.units.filter(u => u.id !== clickedUnit.id);
      store.setState({ ...state, units: newUnits });
    }
  }

  private onMouseLeave(_event: MouseEvent) {
    if (this.draggedUnitId) { this.draggedUnitId = null; store.setState(store.getState()); }
  }

  private onMouseDown(event: MouseEvent) {
    if (event.button !== 0) return; // Tylko Lewy Przycisk Myszy

    const state = store.getState();
    const { x, y } = this.getMousePos(event);
    const col = Math.floor(x / TILE_SIZE); const row = Math.floor(y / TILE_SIZE);
    const localPlayer = (window as any).myNetworkRole || state.activePlayerId;
    const clickedUnit = state.units.find(u => u.position.col === col && u.position.row === row && u.alive);

    if (state.phase === 'setup' && clickedUnit && clickedUnit.ownerId === localPlayer) {
      this.draggedUnitId = clickedUnit.id; this.dragX = x; this.dragY = y;
    }
  }

  private onMouseMove(event: MouseEvent) {
    if (this.draggedUnitId) {
      const { x, y } = this.getMousePos(event);
      this.dragX = x; this.dragY = y; store.setState(store.getState()); 
    }
  }

  private onMouseUp(event: MouseEvent) {
    if (event.button !== 0) return; // Ignoruj jeśli to nie LPM

    const state = store.getState();
    const { x, y } = this.getMousePos(event);
    const col = Math.floor(x / TILE_SIZE); const row = Math.floor(y / TILE_SIZE);
    const targetPos: Position = { col, row };
    const localPlayer = (window as any).myNetworkRole || state.activePlayerId;

    if (state.phase === 'setup' && this.draggedUnitId) {
      const draggedUnit = state.units.find(u => u.id === this.draggedUnitId);
      
      if (draggedUnit) {
        const targetUnit = state.units.find(u => u.position.col === targetPos.col && u.position.row === targetPos.row && u.id !== draggedUnit.id);

        // PANCERNA BLOKADA: Bateria na wyjściu
        if (draggedUnit.type === 'bateria_nadbrzezna' && isExitTile(targetPos)) {
            alert('Dowództwo zabrania! Bateria nadbrzeżna zablokowałaby wyjście z portu.');
            this.draggedUnitId = null; store.setState(state); return;
        }
        if (targetUnit && targetUnit.type === 'bateria_nadbrzezna' && isExitTile(draggedUnit.position)) {
            alert('Dowództwo zabrania! Bateria nadbrzeżna zablokowałaby wyjście z portu.');
            this.draggedUnitId = null; store.setState(state); return;
        }

        // MECHANIKA ZAMIANY
        if (targetUnit && targetUnit.ownerId === localPlayer) {
          const originalPos = { ...draggedUnit.position };
          
          draggedUnit.position = targetPos;
          targetUnit.position = originalPos;
          
        } else {
          // ZWYKŁE POSTAWIENIE
          if (isValidPlacement(state, draggedUnit.type, targetPos, localPlayer, draggedUnit.id)) { 
            draggedUnit.position = targetPos; 
          }
        }
      }
      this.draggedUnitId = null; store.setState(state); return;
    }
    
    this.draggedUnitId = null;

    if (state.phase === 'playing') {
      if (state.roomId !== 'local' && localPlayer !== state.activePlayerId) return; 

      const clickedUnit = state.units.find(u => u.position.col === col && u.position.row === row && u.alive);
      
      if (clickedUnit && clickedUnit.ownerId === localPlayer) {
        this.selectedUnitId = clickedUnit.id; this.actionMode = 'default'; store.setState(state); return; 
      }

      if (this.selectedUnitId) {
        const selectedUnit = state.units.find(u => u.id === this.selectedUnitId);
        if (!selectedUnit) return;
        
        let action: any = null;
        const dist = Math.max(Math.abs(selectedUnit.position.row - targetPos.row), Math.abs(selectedUnit.position.col - targetPos.col));

        const attackerTile = state.board.tiles[selectedUnit.position.row][selectedUnit.position.col];
        const targetTile = state.board.tiles[targetPos.row][targetPos.col];

        if (this.actionMode === 'lay_mine') {
          if (clickedUnit) alert('Nie możesz postawić miny na zajętym polu!');
          else if (targetTile === 'neutral') alert('Zakaz stawiania min w strefie neutralnej!');
          else if (dist > 2) alert('Trałowiec stawia miny maksymalnie w zasięgu 2 pól!');
          else action = { kind: 'lay_mine', unitId: this.selectedUnitId, at: targetPos };
        } 
        else if (this.actionMode === 'clear_mine') {
          if (!clickedUnit || clickedUnit.type !== 'mina') alert('Kliknij bezpośrednio na wrogą minę, aby ją rozbroić!');
          else if (dist > 2) alert('Trałowiec rozbraja miny maksymalnie w zasięgu 2 pól!');
          else action = { kind: 'clear_mine', unitId: this.selectedUnitId, at: targetPos };
        }
        else if (this.actionMode === 'default' && clickedUnit && clickedUnit.ownerId !== localPlayer) {
          if (attackerTile === 'neutral' || targetTile === 'neutral') {
            alert('ZŁAMANIE ZASAD: Walka w strefie neutralnej jest surowo zabroniona!');
          } else if (dist <= UNIT_RULES[selectedUnit.type].range) {
            action = { kind: 'attack', unitId: this.selectedUnitId, targetUnitId: clickedUnit.id };
          } else {
            alert('Cel poza zasięgiem ostrzału!');
          }
        } 
        else if (this.actionMode === 'default' && !clickedUnit) {
          const legalMoves = getLegalMoves(state, this.selectedUnitId);
          if (legalMoves.some(m => m.col === col && m.row === row)) action = { kind: 'move', unitId: this.selectedUnitId, to: targetPos };
        }

        if (action) {
          const success = store.dispatch(action, state.activePlayerId);
          if (success) {
            if (state.roomId !== 'local' && (window as any).socket) {
              (window as any).socket.emit('game_action', { roomId: state.roomId, action });
            }
          } else if (action.kind === 'lay_mine') {
            alert('Zły manewr! (Miny stawiamy tylko na wodzie i mamy ich max 6).');
          }
        }

        this.selectedUnitId = null; this.actionMode = 'default'; store.setState(store.getState()); 
      }
    }
  }

  public getSelectedUnitId(): string | null { return this.selectedUnitId; }
  public getDraggedUnit() { return { id: this.draggedUnitId, x: this.dragX, y: this.dragY }; }
  public resetView() { this.scale = 1; this.offsetX = 0; this.offsetY = 0; }
}