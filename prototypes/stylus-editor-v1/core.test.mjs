import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createDocument,
  clientToNormalized,
  createHistory,
  addStroke,
  eraseAt,
  undo,
  redo,
  changeMode,
  changeStep,
  changeAudience,
  restoreDocument,
} from './core.mjs';

const segment = {
  id: 'line-one',
  step: 0,
  color: '#202321',
  width: 3,
  points: [{ x: 0.1, y: 0.2 }, { x: 0.6, y: 0.2 }],
};

test('translates positioned canvas coordinates to a normalized artboard', () => {
  assert.deepEqual(clientToNormalized(310, 220, { left: 110, top: 70, width: 400, height: 300 }), { x: 0.5, y: 0.5 });
  assert.deepEqual(clientToNormalized(5, 1000, { left: 110, top: 70, width: 400, height: 300 }), { x: 0, y: 1 });
  assert.equal(clientToNormalized(20, 20, { left: 0, top: 0, width: 0, height: 50 }), null);
});

test('stroke history supports undo redo and clears redo after new work', () => {
  const first = addStroke(createHistory([]), segment);
  assert.equal(first.present.length, 1);
  const undone = undo(first);
  assert.equal(undone.present.length, 0);
  assert.deepEqual(redo(undone).present, [segment]);
  const afterNewStroke = addStroke(undone, { ...segment, id: 'line-two' });
  assert.equal(afterNewStroke.future.length, 0);
  assert.equal(redo(afterNewStroke).present[0].id, 'line-two');
});

test('eraser removes a nearby stroke and undo restores it', () => {
  const first = addStroke(createHistory([]), segment);
  const erased = eraseAt(first, { x: 0.35, y: 0.21 }, 0.03);
  assert.equal(erased.present.length, 0);
  assert.equal(undo(erased).present[0].id, 'line-one');
  assert.equal(eraseAt(first, { x: 0.35, y: 0.8 }, 0.03), first);
});

test('mode, step and age group changes preserve user strokes', () => {
  const withWork = { ...createDocument(), strokes: [segment] };
  const changed = changeAudience(changeStep(changeMode(withWork, 'free'), 4), 'child');
  assert.equal(changed.mode, 'free');
  assert.equal(changed.step, 4);
  assert.equal(changed.audience, 'child');
  assert.deepEqual(changed.strokes, [segment]);
  assert.deepEqual(changeStep(changed, 99).step, 5);
  assert.deepEqual(changeStep(changed, -4).step, 0);
});

test('rejects invalid or mismatched local documents', () => {
  assert.equal(restoreDocument('garbled'), null);
  assert.equal(restoreDocument(JSON.stringify({ version: 2 })), null);
  assert.equal(restoreDocument(JSON.stringify({ ...createDocument(), lessonId: 'elsewhere' })), null);
  assert.deepEqual(restoreDocument(JSON.stringify({ ...createDocument(), strokes: [segment] })).strokes, [segment]);
  assert.equal(restoreDocument(JSON.stringify({ ...createDocument(), strokes: [{ ...segment, points: [{ x: 7, y: 0 }] }] })), null);
});
