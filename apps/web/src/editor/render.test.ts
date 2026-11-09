import { createCanvas } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';

import { applyAction, createProject, type DrawingProject, type Stroke } from './model';
import { renderProject } from './render';

const makeStroke = (
  id: string, color: string, kind: 'ink' | 'erase' = 'ink', width = 16,
): Stroke => ({
  id,
  kind,
  brushId: 'liner',
  color,
  width,
  opacity: 1,
  points: [{ x: 0.2, y: 0.5 }, { x: 0.8, y: 0.5 }],
});

function paint(project: DrawingProject, layerId: string, stroke: Stroke): DrawingProject {
  return applyAction(project, { type: 'addStroke', layerId, stroke });
}

function render(
  project: DrawingProject,
  assets = new Map<string, CanvasImageSource>(),
  options: { zoom?: number; panX?: number; panY?: number; includeReferences?: boolean } = {},
) {
  const canvas = createCanvas(project.width, project.height);
  const ctx = canvas.getContext('2d');
  renderProject(ctx as unknown as CanvasRenderingContext2D, project, assets, {
    zoom: options.zoom ?? 1,
    panX: options.panX ?? 0,
    panY: options.panY ?? 0,
    includeReferences: options.includeReferences ?? true,
    createSurface: (width, height) => createCanvas(width, height) as unknown as HTMLCanvasElement,
  });
  return ctx;
}

const pixel = (ctx: ReturnType<typeof render>, x = 32, y = 32) =>
  Array.from(ctx.getImageData(x, y, 1, 1).data);

describe('пиксельный рендер независимых слоёв', () => {
  it('стирание в верхнем слое раскрывает нижний, не стирая его', () => {
    const first = createProject({ width: 64, height: 64 });
    const red = paint(first, first.activeLayerId, makeStroke('red', '#FF0000'));
    const stacked = applyAction(red, {
      type: 'addLayer',
      layer: { id: 'top', kind: 'paint', name: 'Верхний', strokes: [], visible: true, locked: false, opacity: 1 },
    });
    const blue = paint(stacked, 'top', makeStroke('blue', '#0000FF'));
    const erased = paint(blue, 'top', makeStroke('erase', '#FFFFFF', 'erase', 20));

    expect(pixel(render(blue))).toEqual([0, 0, 255, 255]);
    expect(pixel(render(erased))).toEqual([255, 0, 0, 255]);
    expect(pixel(render(red))).toEqual([255, 0, 0, 255]);
  });

  it('заблокированный reference-слой остаётся видимым после ластика сверху', () => {
    const base = createProject({ width: 64, height: 64 });
    const image = createCanvas(64, 64);
    const imageContext = image.getContext('2d');
    imageContext.fillStyle = '#00FF00';
    imageContext.fillRect(0, 0, 64, 64);
    const withReference = applyAction(base, {
      type: 'addLayer', index: 0,
      layer: {
        id: 'ref', name: 'Референс', kind: 'reference', assetId: 'image',
        visible: true, locked: true, opacity: 1, placement: 'overlay',
        transform: { x: 0, y: 0, scale: 1, rotation: 0 },
      },
    });
    const ink = paint(withReference, base.activeLayerId, makeStroke('blue', '#0000FF'));
    const erased = paint(ink, base.activeLayerId, makeStroke('erase', '#FFFFFF', 'erase', 20));
    const assets = new Map([['image', image as unknown as CanvasImageSource]]);

    expect(pixel(render(erased, assets))).toEqual([0, 255, 0, 255]);
    expect(pixel(render(erased, assets, { includeReferences: false }))).toEqual([0, 0, 0, 0]);
  });

  it('пропускает скрытый слой без изменения документа', () => {
    const base = createProject({ width: 64, height: 64 });
    const drawn = paint(base, base.activeLayerId, makeStroke('ink', '#FF0000'));
    const hidden = applyAction(drawn, {
      type: 'setLayerVisibility', layerId: base.activeLayerId, visible: false,
    });

    expect(pixel(render(hidden))).toEqual([0, 0, 0, 0]);
    expect(drawn.layers[0]).toMatchObject({ visible: true });
  });

  it('применяет прозрачность слоя при композиции, не меняя его пиксели', () => {
    const base = createProject({ width: 64, height: 64 });
    const lower = paint(base, base.activeLayerId, makeStroke('green', '#00FF00'));
    const second = applyAction(lower, {
      type: 'addLayer',
      layer: { id: 'top', name: 'Полутон', kind: 'paint', strokes: [], visible: true, locked: false, opacity: 0.5 },
    });
    const upper = paint(second, 'top', makeStroke('red', '#FF0000'));
    const [r, g, b, a] = pixel(render(upper));

    expect(r).toBeGreaterThanOrEqual(126);
    expect(r).toBeLessThanOrEqual(129);
    expect(g).toBeGreaterThanOrEqual(126);
    expect(g).toBeLessThanOrEqual(129);
    expect([b, a]).toEqual([0, 255]);
  });

  it('масштабирует пиксельный рисунок внутри исходного размера canvas', () => {
    const base = createProject({ width: 64, height: 64 });
    const drawn = paint(base, base.activeLayerId, {
      ...makeStroke('dot', '#222222', 'ink', 4),
      points: [{ x: 0.5, y: 0.5 }],
    });
    const normal = render(drawn);
    const zoomed = render(drawn, new Map(), { zoom: 3 });

    expect(normal.canvas.width).toBe(64);
    expect(zoomed.canvas.width).toBe(64);
    expect(pixel(normal, 37, 32)[3]).toBe(0);
    expect(pixel(zoomed, 37, 32)[3]).toBeGreaterThan(100);
  });
});
