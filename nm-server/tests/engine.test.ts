import test from 'node:test';
import assert from 'node:assert/strict';
import { applyMove } from '../../shared/gameState';
import { getTile, canCrossWall, createInitialBoard } from '../../shared/board';
import { getLegalMoves } from '../../shared/movement';
import { validateFleet, encodeFleet, decodeFleet, isValidPlacement } from '../../shared/setup';
import { playerView } from '../../shared/view';
import { unit, state, fleet } from './fixtures';
import type { GameState, MoveAction } from '../../shared/types';
import { GameStore } from '../../nm-game/src/store/store';
import { pointerTile } from '../../nm-game/src/render/coordinates';

const move = (unitId: string, col: number, row: number): MoveAction => ({ kind: 'move', unitId, to: { col, row } });
const base = () => state([unit('ship-a', 'a', 'pancernik', 5, 0), unit('ship-b', 'b', 'pancernik', 6, 0), unit('sweeper', 'a', 'tralowiec', 5, 1)]);
function rejected(s: GameState, action: unknown, player: 'a' | 'b' = 'a') {
  const before = structuredClone(s);
  const result = applyMove(s, action, player);
  assert.ok(result.error); assert.equal(result.newState, s); assert.deepEqual(s, before);
}
for (const [name, action] of [
  ['null payload', null], ['unknown kind', { kind: 'teleport', unitId: 'ship-a' }],
  ['unsupported move_and_attack', { kind: 'move_and_attack', unitId: 'ship-a', to: { col: 5, row: 1 }, targetUnitId: 'ship-b' }],
  ['enemy ownership', move('ship-b', 7, 0)], ['outside board', move('ship-a', 999, 999)],
  ['fractional coordinate', move('ship-a', 5.2, 1)], ['NaN coordinate', move('ship-a', NaN, 1)],
  ['occupied square', move('ship-a', 6, 0)], ['excess range', move('ship-a', 12, 0)],
  ['self attack', { kind: 'attack', unitId: 'ship-a', targetUnitId: 'ship-a' }],
  ['friendly fire', { kind: 'attack', unitId: 'ship-a', targetUnitId: 'sweeper' }],
  ['non-sweeper mine', { kind: 'lay_mine', unitId: 'ship-a', at: { col: 5, row: 2 } }],
  ['distant mine', { kind: 'lay_mine', unitId: 'sweeper', at: { col: 12, row: 10 } }],
  ['occupied mine', { kind: 'lay_mine', unitId: 'sweeper', at: { col: 5, row: 0 } }],
] as const) test(`reject ${name} without modifying state`, () => rejected(base(), action));
for (const phase of ['lobby', 'setup', 'finished'] as const) test(`reject action in ${phase}`, () => rejected({ ...base(), phase }, move('ship-a', 5, 2)));
test('reject wrong turn, dead unit and stationary movement', () => {
  rejected(base(), move('ship-b', 7, 0), 'b');
  const s = base(); s.units.find(u => u.id === 'ship-a')!.alive = false; rejected(s, move('ship-a', 5, 2));
  rejected(state([unit('battery', 'a', 'bateria_nadbrzezna', 5, 0)]), move('battery', 5, 1));
  rejected(state([unit('mine', 'a', 'mina', 5, 0)]), move('mine', 5, 1));
});
test('port walls and enemy ports constrain legal movement', () => {
  const s = state([unit('ship', 'a', 'pancernik', 3, 0)]);
  rejected(s, move('ship', 4, 0));
  rejected(state([unit('ship', 'a', 'pancernik', 15, 2)]), move('ship', 16, 2));
});
test('same-type combat destroys both with destruction timestamps', () => {
  const s = base(); const before = structuredClone(s);
  const result = applyMove(s, { kind: 'attack', unitId: 'ship-a', targetUnitId: 'ship-b' }, 'a');
  assert.equal(result.error, undefined);
  for (const id of ['ship-a', 'ship-b']) { const u = result.newState.units.find(u => u.id === id)!; assert.equal(u.alive, false); assert.equal(u.destroyedAtTurn, 1); }
  assert.deepEqual(s, before);
});
for (const [a, b] of [['niszczyciel', 'okret_podwodny'], ['okret_podwodny', 'niszczyciel']] as const) test(`${a} wins initiative against ${b}`, () => {
  const result = applyMove(state([unit('a', 'a', a, 5, 0), unit('b', 'b', b, 6, 0)]), { kind: 'attack', unitId: 'a', targetUnitId: 'b' }, 'a');
  assert.equal(result.newState.units.find(u => u.id === 'a')!.alive, true);
  assert.equal(result.newState.units.find(u => u.id === 'b')!.alive, false);
});
test('landing craft cannot attack, but entering enemy exit wins', () => {
  const s = base(); s.units.find(u => u.id === 'landing-a')!.position = { col: 5, row: 0 }; s.units = s.units.filter(u => u.id !== 'ship-a');
  rejected(s, { kind: 'attack', unitId: 'landing-a', targetUnitId: 'ship-b' });
  s.units.find(u => u.id === 'landing-a')!.position = { col: 15, row: 2 };
  const result = applyMove(s, move('landing-a', 16, 2), 'a');
  assert.equal(result.error, undefined); assert.equal(result.newState.winnerId, 'a'); assert.equal(result.newState.phase, 'finished');
});
test('out-of-range and neutral attacks are rejected', () => {
  const s = base(); s.units.find(u => u.id === 'ship-b')!.position = { col: 15, row: 0 };
  rejected(s, { kind: 'attack', unitId: 'ship-a', targetUnitId: 'ship-b' });
  s.units.find(u => u.id === 'ship-a')!.position = { col: 7, row: 3 };
  s.units.find(u => u.id === 'ship-b')!.position = { col: 8, row: 3 };
  rejected(s, { kind: 'attack', unitId: 'ship-a', targetUnitId: 'ship-b' });
  s.activePlayerId = 'b'; rejected(s, { kind: 'attack', unitId: 'ship-b', targetUnitId: 'ship-a' }, 'b');
});
test('neutral mines and distant clearing rejected', () => {
  const s = state([unit('sweeper', 'a', 'tralowiec', 7, 3)]);
  for (const kind of ['lay_mine', 'clear_mine'] as const) rejected(s, { kind, unitId: 'sweeper', at: { col: 8, row: 3 } });
  rejected(s, { kind: 'clear_mine', unitId: 'sweeper', at: { col: 12, row: 0 } });
});
test('neutral counter counts own turns and interns on fourth, retaining timestamp', () => {
  const s = state([unit('waiting', 'a', 'pancernik', 8, 3), unit('b-waiting', 'b', 'pancernik', 8, 4), unit('moving', 'a', 'pancernik', 5, 0)]);
  s.units.find(u => u.id === 'waiting')!.turnsInNeutralZone = 3;
  const result = applyMove(s, move('moving', 5, 1), 'a').newState;
  assert.equal(result.units.find(u => u.id === 'waiting')!.alive, false);
  assert.equal(result.units.find(u => u.id === 'waiting')!.destroyedAtTurn, 1);
  assert.equal(result.units.find(u => u.id === 'b-waiting')!.turnsInNeutralZone, 0);
});
test('mine contacts block movement consistently and an attack destroys both', () => {
  const s = state([unit('ship', 'a', 'pancernik', 5, 0), unit('secret-mine', 'b', 'mina', 6, 0)]);
  const v = playerView(s, 'a', { a: true, b: true }, { a: true, b: true });
  assert.deepEqual(getLegalMoves(s, 'ship'), getLegalMoves(v, 'ship'));
  assert.equal(getLegalMoves(v, 'ship').some(p => p.col === 6 && p.row === 0), false);
  const result = applyMove(s, { kind: 'attack', unitId: 'ship', targetUnitId: 'secret-mine' }, 'a');
  assert.equal(result.error, undefined);
  assert.equal(result.newState.units.find(u => u.id === 'ship')!.alive, false);
  assert.equal(v.units.find(u => u.id === 'secret-mine')!.type, 'unknown');
  assert.equal(result.newState.units.find(u => u.id === 'secret-mine')!.alive, false);
});
test('clearing unknown and empty squares both consumes one turn', () => {
  const s = state([unit('sweeper', 'a', 'tralowiec', 5, 0), unit('mine', 'b', 'mina', 6, 0)]);
  for (const col of [6, 7]) {
    const r = applyMove(s, { kind: 'clear_mine', unitId: 'sweeper', at: { col, row: 0 } }, 'a');
    assert.equal(r.error, undefined); assert.equal(r.newState.turn, 2);
    assert.equal(r.newState.units.find(u => u.id === 'sweeper')!.alive, true);
    assert.equal(r.newState.units.find(u => u.id === 'mine')!.alive, col !== 6);
  }
});
test('mine contact exposes its position but not its type or laying unit in logs', () => {
  const s = state([unit('sweeper-secret', 'a', 'tralowiec', 5, 0)]);
  const result = applyMove(s, { kind: 'lay_mine', unitId: 'sweeper-secret', at: { col: 6, row: 0 } }, 'a').newState;
  const view = playerView(result, 'b', { a: true, b: true }, { a: true, b: true });
  assert.equal(view.units.find(u => u.id === 'sweeper-secret')!.type, 'unknown');
  assert.equal(view.units.some(u => u.type === 'mina'), false);
  assert.deepEqual(view.units.find(u => u.id === 'mine_a_1')?.position, {col:6,row:0});
  assert.equal(view.units.find(u => u.id === 'mine_a_1')?.type, 'unknown');
  assert.ok(view.logs.every(log => !log.includes('6') && !log.includes('sweeper-secret')));
});
test('six active mines limit is enforced; pure reducer is deterministic', () => {
  const s = state([unit('sweeper', 'a', 'tralowiec', 5, 0), ...Array.from({ length: 6 }, (_, i) => unit(`m${i}`, 'a', 'mina', 5 + i, 10))]);
  rejected(s, { kind: 'lay_mine', unitId: 'sweeper', at: { col: 6, row: 0 } });
  s.units.find(u => u.id === 'm0')!.alive = false;
  const action = { kind: 'lay_mine', unitId: 'sweeper', at: { col: 6, row: 0 } };
  assert.deepEqual(applyMove(s, action, 'a'), applyMove(s, action, 'a'));
});
for (const role of ['a', 'b'] as const) test(`fleet save/load is lossless for ${role}, including cross-side import`, () => {
  const s = state(); const initial = fleet(role); const encoded = encodeFleet(initial, s.board, role);
  const result = decodeFleet(encoded, s.board, role); assert.ok(result.ok);
  assert.deepEqual(result.units.map(u => [u.type, u.position]), initial.map(u => [u.type, u.position]));
  const opposite = decodeFleet(encoded, s.board, role === 'a' ? 'b' : 'a'); assert.ok(opposite.ok);
  const legacy = decodeFleet(initial, s.board, role); assert.ok(legacy.ok);
});
test('fleet rejects empty, overfull, wrong composition, collisions and out-of-bounds', () => {
  const board = state().board; const good = fleet('a');
  assert.equal(validateFleet([], board, 'a').ok, false);
  assert.equal(validateFleet([...good, good[0]], board, 'a').ok, false);
  assert.equal(validateFleet(good.map(u => ({ ...u, type: 'pancernik' })), board, 'a').ok, false);
  const bad = structuredClone(good); bad[1].position = bad[0].position; assert.equal(validateFleet(bad, board, 'a').ok, false);
  bad[1].position = { col: -2, row: 0 }; assert.equal(validateFleet(bad, board, 'a').ok, false);
  bad[1].position = { col: 0, row: 100 }; assert.equal(validateFleet(bad, board, 'a').ok, false);
  assert.equal(validateFleet(good, board, 'b').ok, false);
  assert.equal(validateFleet(good.map(u => ({ ...u, type: 'toString' })), board, 'a').ok, false);
});
test('fleet assigns ownership and flags, and rejects battery at exit', () => {
  const board = state().board; const good = fleet('a');
  const normalized = validateFleet(good.map(u => ({ ...u, ownerId: 'b', alive: false, revealed: true, destroyedAtTurn: -9 })), board, 'a');
  assert.ok(normalized.ok); assert.ok(normalized.units.every(u => u.ownerId === 'a' && u.alive && u.destroyedAtTurn === undefined));
  assert.equal(isValidPlacement({ board, units: [] }, 'bateria_nadbrzezna', { col: 3, row: 2 }, 'a'), false);
  assert.equal(isValidPlacement({ board, units: [] }, 'pancernik', { col: 0, row: 999 }, 'a'), false);
  assert.equal(getTile(board, { col: 0, row: .5 }), null);
});
test('subscriber failures cannot undo an authoritative snapshot or block others', () => {
  const store = new GameStore(); let notified = 0;
  const old = console.error; console.error = () => {};
  try {
    store.subscribe(() => { throw new Error('UI failed'); });
    store.subscribe(() => notified++);
    const snapshot = playerView(base(), 'a', { a: true, b: true }, { a: true, b: true });
    store.setState(snapshot);
    assert.equal(store.getState().gameId, snapshot.gameId); assert.equal(notified, 2);
    assert.throws(() => { store.getState().units.length = 0; });
    snapshot.units.length = 0; assert.notEqual(store.getState().units.length, 0);
  } finally { console.error = old; }
});
test('scaled canvas maps the clicked pixel to the correct tile and rejects boundaries', () => {
  const canvas = { width: 768, height: 528, getBoundingClientRect: () => ({ left: 10, top: 20, width: 384, height: 264 }) } as HTMLCanvasElement;
  assert.deepEqual(pointerTile(canvas, { clientX: 72, clientY: 82 }), { col: 2, row: 2 });
  assert.equal(pointerTile(canvas, { clientX: 394, clientY: 32 }), null);
  assert.equal(pointerTile(canvas, { clientX: 0, clientY: 20 }), null);
});


test('sweeping a non-mine contact consumes the turn without harming either unit', () => {
  const s = state([unit('sweeper', 'a', 'tralowiec', 5, 0), unit('contact', 'b', 'pancernik', 6, 0)]);
  const r = applyMove(s, {kind:'clear_mine',unitId:'sweeper',at:{col:6,row:0}}, 'a');
  assert.equal(r.error, undefined);
  assert.equal(r.newState.turn, 2);
  assert.ok(r.newState.units.every(u => u.alive));
  assert.equal(r.newState.units.find(u => u.id === 'contact')!.revealed, false);
});


test('open port corner stays traversable even beside a mine, symmetrically for both sides', () => {
  const board = createInitialBoard();
  for (const mirror of [false, true]) {
    const p = (col:number,row:number) => mirror ? {col:17-col,row:11-row} : {col,row};
    const from=p(4,4), to=p(3,5), adjacent=p(4,5);
    assert.equal(canCrossWall(from,to,board),true);
    assert.equal(canCrossWall(to,from,board),true);
    assert.equal(canCrossWall(p(3,4),p(4,4),board),false);
    const s=state([unit('ship','a','okret_rakietowy',from.col,from.row),unit('mine','b','mina',adjacent.col,adjacent.row)]);
    const v=playerView(s,'a',{a:true,b:true},{a:true,b:true});
    assert.deepEqual(getLegalMoves(s,'ship'),getLegalMoves(v,'ship'));
    assert.equal(applyMove(s,{kind:'move',unitId:'ship',to},'a').error,undefined);
  }
});

test('authoritative movement trail includes start and intermediate tiles and expires after two player turns', () => {
  const s=state([unit('ship','a','pancernik',5,0),unit('other','b','pancernik',10,0)]);
  const first=applyMove(s,move('ship',7,0),'a').newState;
  assert.deepEqual(first.moveTrails?.[0]?.path,[{col:5,row:0},{col:6,row:0},{col:7,row:0}]);
  const second=applyMove(first,move('other',10,1),'b').newState;
  assert.equal(second.moveTrails?.length,2);
  const third=applyMove(second,move('ship',7,1),'a').newState;
  assert.equal(third.moveTrails?.length,2);
  assert.ok(third.moveTrails?.every(t=>t.turn>1));
  const view=playerView(second,'b',{a:true,b:true},{a:true,b:true});
  assert.deepEqual(view.moveTrails,second.moveTrails);
  view.moveTrails![0]!.path[0]!.col=999;
  assert.equal(second.moveTrails![0]!.path[0]!.col,5);
  const invalid=applyMove(first,move('ship',17,11),'a');
  assert.ok(invalid.error);assert.deepEqual(invalid.newState.moveTrails,first.moveTrails);
});

test('coordinate labels around all four board edges never select a tile', () => {
  const canvas={width:768,height:528,getBoundingClientRect:()=>({left:0,top:0,width:768,height:528})} as HTMLCanvasElement;
  for(const [clientX,clientY] of [[12,80],[756,80],[80,12],[80,516]]) assert.equal(pointerTile(canvas,{clientX,clientY}),null);
  assert.deepEqual(pointerTile(canvas,{clientX:24,clientY:24}),{col:0,row:0});
  assert.deepEqual(pointerTile(canvas,{clientX:743,clientY:503}),{col:17,row:11});
});
