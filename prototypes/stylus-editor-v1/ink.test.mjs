import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as ink from './ink.mjs';
import { addStroke, createHistory, undo, redo } from './core.mjs';

let createCanvas;
try {
  const root = process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES;
  const require = createRequire(root ? `${root}/package.json` : import.meta.url);
  ({ createCanvas } = require('@napi-rs/canvas'));
} catch { /* Optional local pixel checks; browser.test.mjs covers the real browser. */ }

const brush = { id: 'ink', step: 0, color: '#111111', width: 12, points: [{ x: .1, y: .5 }, { x: .9, y: .5 }] };
const eraser = { id: 'erased-center', kind: 'erase', step: 0, color: '#111111', width: 20, points: [{ x: .5, y: .3 }, { x: .5, y: .7 }] };
const view = { zoom: 1, panX: 0, panY: 0 };

function pixel(canvas, x, y) {
  return [...canvas.getContext('2d').getImageData(x, y, 1, 1).data];
}

test('eraser removes only the crossed pixels of an ink stroke', { skip: !createCanvas && 'Pixel renderer not installed' }, () => {
  const canvas = createCanvas(120, 80);
  ink.renderInk(canvas.getContext('2d'), 120, 80, [brush, eraser], view, 0);
  assert.ok(pixel(canvas, 20, 40)[3] > 240, 'the left segment remains');
  assert.ok(pixel(canvas, 100, 40)[3] > 240, 'the right segment remains');
  assert.equal(pixel(canvas, 60, 40)[3], 0, 'only the crossing is erased');
});

test('undo restores the pixels under the eraser and redo erases them again', { skip: !createCanvas && 'Pixel renderer not installed' }, () => {
  const canvas = createCanvas(120, 80);
  const full = addStroke(addStroke(createHistory(), brush), eraser);
  const draw = (history) => ink.renderInk(canvas.getContext('2d'), 120, 80, history.present, view, 0);
  draw(full);
  assert.equal(pixel(canvas, 60, 40)[3], 0);
  draw(undo(full));
  assert.ok(pixel(canvas, 60, 40)[3] > 240);
  draw(redo(undo(full)));
  assert.equal(pixel(canvas, 60, 40)[3], 0);
});

test('eraser width changes the erased area without deleting the rest of the stroke', { skip: !createCanvas && 'Pixel renderer not installed' }, () => {
  const canvas = createCanvas(120, 80);
  const erase = (width) => ink.renderInk(canvas.getContext('2d'), 120, 80, [
    brush, { ...eraser, width },
  ], view, 0);
  erase(4);
  assert.ok(pixel(canvas, 49, 40)[3] > 240, 'narrow eraser leaves nearby ink');
  erase(40);
  assert.equal(pixel(canvas, 49, 40)[3], 0, 'wide eraser clears nearby ink');
  assert.ok(pixel(canvas, 20, 40)[3] > 240, 'distant ink is never deleted');
});
