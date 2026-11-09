import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createDocument,
  clientToNormalized,
  createHistory,
  addStroke,
  undo,
  redo,
  changeMode,
  changeStep,
  changeAudience,
  restoreDocument,
} from './core.mjs';
import * as core from './core.mjs';

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

test('eraser is a reversible drawing operation and survives local save', () => {
  const eraser = { ...segment, id: 'erase-one', kind: 'erase', color: '#000000', width: 24, points: [{ x: .35, y: .1 }, { x: .35, y: .3 }] };
  const ink = addStroke(createHistory([]), segment);
  const withEraser = addStroke(ink, eraser);
  assert.deepEqual(withEraser.present, [segment, eraser]);
  assert.deepEqual(undo(withEraser).present, [segment]);
  assert.deepEqual(redo(undo(withEraser)).present, [segment, eraser]);
  assert.deepEqual(restoreDocument(JSON.stringify({ ...createDocument(), strokes: withEraser.present })).strokes, [segment, eraser]);
  assert.equal(restoreDocument(JSON.stringify({ ...createDocument(), strokes: [{ ...eraser, kind: 'unknown' }] })), null);
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

test('zoom keeps the artboard point beneath the pointer stationary', () => {
  const next = core.zoomView({ zoom: 1, panX: 0, panY: 0 }, 2, { x: 0.25, y: 0.75 });
  assert.deepEqual(next, { zoom: 2, panX: 0.25, panY: -0.25 });
  assert.deepEqual(core.screenToArtboard({ x: 0.25, y: 0.75 }, next), { x: 0.25, y: 0.75 });
  assert.deepEqual(core.screenToArtboard({ x: 0.5, y: 0.5 }, next), { x: 0.375, y: 0.625 });
});

test('canvas zoom and pan remain bounded to the artboard', () => {
  const original = { zoom: 1, panX: 0, panY: 0 };
  assert.deepEqual(core.zoomView(original, 0.2), original);
  assert.deepEqual(core.zoomView(original, 20), { zoom: 4, panX: 0, panY: 0 });
  assert.deepEqual(core.panView({ zoom: 2, panX: 0, panY: 0 }, 1, -1), { zoom: 2, panX: 0.5, panY: -0.5 });
  assert.deepEqual(core.panView({ zoom: 2, panX: 0.25, panY: -0.25 }, -0.1, 0.1), { zoom: 2, panX: 0.15, panY: -0.15 });
  assert.equal(core.screenToArtboard({ x: -0.2, y: 0.4 }, original), null);
});

test('two-finger movement scales about its midpoint and pans without moving the page', () => {
  const initial = { zoom: 2, panX: 0, panY: 0 };
  const scaled = core.pinchView(initial, [{ x: .3, y: .5 }, { x: .7, y: .5 }], [{ x: .2, y: .5 }, { x: .8, y: .5 }]);
  assert.ok(Math.abs(scaled.zoom - 3) < 1e-10);
  assert.ok(Math.abs(scaled.panX) < 1e-10);
  assert.ok(Math.abs(scaled.panY) < 1e-10);
  const moved = core.pinchView(initial, [{ x: .3, y: .5 }, { x: .7, y: .5 }], [{ x: .4, y: .6 }, { x: .8, y: .6 }]);
  assert.ok(Math.abs(moved.zoom - 2) < 1e-10);
  assert.ok(Math.abs(moved.panX - .1) < 1e-10);
  assert.ok(Math.abs(moved.panY - .1) < 1e-10);
});
