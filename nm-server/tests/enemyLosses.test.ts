import test from 'node:test';
import assert from 'node:assert/strict';
import { EnemyLosses } from '../../nm-game/src/store/enemyLosses';

test('enemy loss notes survive refresh/reconnect and are isolated by game and player', () => {
  const saved = new Map<string, string>();
  const storage = () => ({ getItem: (key: string) => saved.get(key) ?? null, setItem: (key: string, value: string) => {saved.set(key, value);} });
  const notes = new EnemyLosses(storage);
  notes.bind('game-one', 'a'); notes.change(0, 1); notes.change(0, 1);
  notes.bind('game-one', 'a'); assert.equal(notes.values()[0], 2);
  const reloaded = new EnemyLosses(storage);
  reloaded.bind('game-one', 'a'); assert.equal(reloaded.values()[0], 2);
  reloaded.bind('game-one', 'b'); assert.equal(reloaded.values()[0], 0);
  reloaded.bind('game-two', 'a'); assert.equal(reloaded.values()[0], 0);
  reloaded.bind(null, null); reloaded.change(0, 1);
  reloaded.bind('game-one', 'a'); assert.equal(reloaded.values()[0], 2);
});

test('enemy notes validate saved counts, clamp limits and work when storage is blocked', () => {
  const notes = new EnemyLosses(() => ({getItem: () => '[99,-1,"2",2,1.5,null]', setItem: () => {throw new Error('quota');}}));
  notes.bind('game', 'a'); assert.deepEqual(notes.values(), [0,0,0,2,0,0,0,0,0]);
  for (let i = 0; i < 5; i++) notes.change(0, 1);
  assert.equal(notes.values()[0], 3);
  for (let i = 0; i < 5; i++) notes.change(0, -1);
  assert.equal(notes.values()[0], 0);
  const unavailable = new EnemyLosses(() => {throw new Error('blocked');});
  unavailable.bind('game', 'a'); unavailable.change(0, 1); unavailable.bind('game', 'a');
  assert.equal(unavailable.values()[0], 1);
});
