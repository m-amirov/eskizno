import { createCanvas } from '@napi-rs/canvas';
import { describe, expect, it, vi } from 'vitest';

import { applyAction, createProject, type BrushId, type DrawingProject, type Stroke, type Shape } from './model';
import { pickCompositedColor, renderProject } from './render';
import { sampleStrokePoints } from './brushes';

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

const brushNames = ['pencil', 'liner', 'marker', 'soft', 'watercolor', 'charcoal', 'dry', 'airbrush', 'calligraphy', 'pastel'] as BrushId[];

describe('пиксельная заливка и геометрия', () => {
  const shape: Shape = {
    id: 'rectangle', kind: 'rectangle', from: { x: .25, y: .25 }, to: { x: .75, y: .75 },
    color: '#000000', width: 3, style: 'outline', opacity: 1,
  };
  it('ведро заливает только связную область внутри замкнутого контура', () => {
    const base = createProject({ width: 64, height: 64 });
    const outlined = applyAction(base, { type: 'addShape', layerId: base.activeLayerId, shape });
    const filled = applyAction(outlined, { type: 'addFill', layerId: base.activeLayerId,
      fill: { id: 'bucket', point: { x: .5, y: .5 }, color: '#FF6600' } });
    expect(pixel(render(filled), 32, 32)).toEqual([255, 102, 0, 255]);
    expect(pixel(render(filled), 5, 5)).toEqual([0, 0, 0, 0]);
    expect(pixel(render(filled), 16, 32)[3]).toBeGreaterThan(0);
    expect(pixel(render(outlined), 32, 32)).toEqual([0, 0, 0, 0]);
  });
  it('заливка фона происходит на активном слое, не затрагивая нижний', () => {
    const base = createProject({ width: 64, height: 64 });
    const lower = paint(base, base.activeLayerId, makeStroke('base', '#0000FF', 'ink', 60));
    const withTop = applyAction(lower, { type: 'addLayer', layer: {
      id: 'top', kind: 'paint', name: 'верх', strokes: [], visible: true, locked: false, opacity: 1,
    } });
    const filled = applyAction(withTop, { type: 'addFill', layerId: 'top',
      fill: { id: 'f', point: { x: .5, y: .5 }, color: '#00FF00' } });
    expect(pixel(render(filled), 32, 32)).toEqual([0, 255, 0, 255]);
    const hidden = applyAction(filled, { type: 'setLayerVisibility', layerId: 'top', visible: false });
    expect(pixel(render(hidden), 32, 32)).toEqual([0, 0, 255, 255]);
  });
  it('сохраняет порядок заливка → штрих → ластик и заливка фигуры', () => {
    const base = createProject({ width: 64, height: 64 });
    const filled = applyAction(base, { type: 'addFill', layerId: base.activeLayerId,
      fill: { id: 'fill', point: { x: .5, y: .5 }, color: '#FF0000' } });
    const drawn = paint(filled, base.activeLayerId, makeStroke('blue', '#0000FF'));
    expect(pixel(render(drawn), 32, 32)).toEqual([0, 0, 255, 255]);
    const erased = paint(drawn, base.activeLayerId, makeStroke('erase', '#000000', 'erase', 16));
    expect(pixel(render(erased), 32, 32)).toEqual([0, 0, 0, 0]);
    const shaped = applyAction(erased, { type: 'addShape', layerId: base.activeLayerId,
      shape: { ...shape, id: 'new', style: 'fill', color: '#00FF00' } });
    expect(pixel(render(shaped), 32, 32)).toEqual([0, 255, 0, 255]);
  });
  it('меняет растровый результат после перемещения векторной фигуры', () => {
    const base = createProject({ width: 64, height: 64 });
    const added = applyAction(base, { type: 'addShape', layerId: base.activeLayerId,
      shape: { ...shape, style: 'fill', color: '#FF0000' } });
    const moved = applyAction(added, { type: 'updateShape', layerId: base.activeLayerId,
      shapeId: shape.id, from: { x: 0, y: 0 }, to: { x: .2, y: .2 } });
    expect(pixel(render(added), 32, 32)).toEqual([255, 0, 0, 255]);
    expect(pixel(render(moved), 32, 32)).toEqual([0, 0, 0, 0]);
    expect(pixel(render(moved), 4, 4)).toEqual([255, 0, 0, 255]);
  });
  it('применяет записанную прозрачность к мазку', () => {
    const base = createProject({ width: 64, height: 64 });
    const drawn = paint(base, base.activeLayerId, { ...makeStroke('half', '#FF0000'), opacity: .5 });
    expect(pixel(render(drawn), 32, 32)[3]).toBeGreaterThanOrEqual(125);
    expect(pixel(render(drawn), 32, 32)[3]).toBeLessThanOrEqual(130);
  });
  it('рисует маркеры выделения поверх других слоёв, даже если фигура на нижнем', () => {
    const base = createProject({ width: 64, height: 64 });
    const lower = applyAction(base, { type: 'addShape', layerId: base.activeLayerId,
      shape: { ...shape, style: 'fill', color: '#FF0000' } });
    const second = applyAction(lower, { type: 'addLayer', layer: {
      id: 'top', kind: 'paint', name: 'верх', strokes: [], visible: true, locked: false, opacity: 1,
    } });
    const upper = applyAction(second, { type: 'addFill', layerId: 'top',
      fill: { id: 'blue', color: '#0000FF', point: { x: .5, y: .5 } } });
    const canvas = createCanvas(64, 64);
    renderProject(canvas.getContext('2d') as unknown as CanvasRenderingContext2D, upper, new Map(), {
      zoom: 1, panX: 0, panY: 0, includeReferences: true,
      createSurface: (w, h) => createCanvas(w, h) as unknown as HTMLCanvasElement,
      selection: { layerId: base.activeLayerId, shapeId: shape.id },
    });
    expect(pixel(canvas.getContext('2d'), 16, 16)).not.toEqual([0, 0, 255, 255]);
  });
  it('кэширует заливки до перемещаемой фигуры между кадрами preview', () => {
    const base = createProject({ width: 64, height: 64 });
    let drawn = base;
    for (let i = 0; i < 5; i += 1) drawn = applyAction(drawn, {
      type: 'addFill', layerId: base.activeLayerId,
      fill: { id: `fill-${i}`, color: i % 2 ? '#AABBCC' : '#DDEEFF', point: { x: .5, y: .5 } },
    });
    drawn = applyAction(drawn, { type: 'addShape', layerId: base.activeLayerId, shape: { ...shape, style: 'fill' } });
    const layer = drawn.layers[0];
    if (layer.kind !== 'paint') throw new Error('paint layer required');
    const canvas = createCanvas(64, 64);
    let readCount = 0;
    const options = {
      zoom: 1, panX: 0, panY: 0, includeReferences: true,
      createSurface: (w: number, h: number) => {
        const c = createCanvas(w, h);
        const ctx = c.getContext('2d');
        const original = ctx.getImageData.bind(ctx);
        ctx.getImageData = ((...args: Parameters<typeof original>) => {
          readCount += 1;
          return original(...args);
        }) as typeof ctx.getImageData;
        return c as unknown as HTMLCanvasElement;
      },
      paintCache: new WeakMap(),
      shapePrefixCache: new WeakMap(),
    };
    const ctx = canvas.getContext('2d') as unknown as CanvasRenderingContext2D;
    renderProject(ctx, drawn, new Map(), options);
    readCount = 0;
    renderProject(ctx, drawn, new Map(), { ...options, previewShape: {
      layerId: layer.id, shape: { ...shape, from: { x: 0, y: 0 } },
      existing: true,
    } });
    const afterFirstPreview = readCount;
    renderProject(ctx, drawn, new Map(), { ...options, previewShape: {
      layerId: layer.id, shape: { ...shape, from: { x: .1, y: .1 } },
      existing: true,
    } });
    expect(afterFirstPreview).toBeGreaterThan(0);
    expect(readCount).toBe(afterFirstPreview);
  });
  it('не добавляет удалённую фигуру обратно в preview существующего объекта', () => {
    const base = createProject({ width: 64, height: 64 });
    const canvas = createCanvas(64, 64);
    renderProject(canvas.getContext('2d') as unknown as CanvasRenderingContext2D, base, new Map(), {
      zoom: 1, panX: 0, panY: 0, includeReferences: true,
      createSurface: (w, h) => createCanvas(w, h) as unknown as HTMLCanvasElement,
      previewShape: { layerId: base.activeLayerId, shape: { ...shape, style: 'fill' }, existing: true },
    });
    expect(pixel(canvas.getContext('2d'), 32, 32)).toEqual([0, 0, 0, 0]);
  });
});

describe('видимые особенности кистей', () => {
  it('не разрывает тонкий аэрограф и каллиграфию после лимита отпечатков', () => {
    const project = createProject({ width: 4096, height: 32 });
    for (const brushId of ['airbrush', 'calligraphy'] as const) {
      const stroke = { ...makeStroke(`long-${brushId}`, '#315B46', 'ink', 1), brushId,
        points: [{ x: 0, y: .5 }, { x: 1, y: .5 }, { x: 0, y: .1 },
          { x: 1, y: .1 }, { x: 0, y: .9 }, { x: 1, y: .9 }] };
      const image = render(paint(project, project.activeLayerId, stroke)).getImageData(0, 16, 4096, 1).data;
      for (let x = 100; x < 3996; x += 1) expect(image[x * 4 + 3]).toBeGreaterThan(0);
    }
  });
  it('ограничивает число отпечатков на длинной линии, сохраняя обе конечные точки', () => {
    const points = Array.from({ length: 15_000 }, (_, i) => ({ x: i / 14_999, y: .5 }));
    const sampled = sampleStrokePoints(points, 4096, 4096, .1);
    expect(sampled.length).toBeLessThanOrEqual(2600);
    expect(sampled[0]).toEqual({ x: 0, y: 2048 });
    expect(sampled.at(-1)).toEqual({ x: 4096, y: 2048 });
  });

  it('не перемещает существующие отпечатки, когда рисование продолжается', () => {
    const previous = sampleStrokePoints([{ x: 0, y: .5 }, { x: .4, y: .5 }], 100, 100, 3);
    const extended = sampleStrokePoints([{ x: 0, y: .5 }, { x: .8, y: .5 }], 100, 100, 3);
    expect(previous.slice(0, 10)).toEqual(extended.slice(0, 10));
  });
  it('отображает десять разных характеров мазка, а не десять названий линера', () => {
    const project = createProject({ width: 96, height: 96 });
    const images = brushNames.map((brushId) => {
      const stroke = { ...makeStroke(brushId, '#315B46', 'ink', 18), brushId };
      const canvas = render(paint(project, project.activeLayerId, stroke));
      expect(pixel(canvas, 48, 48)[3]).toBeGreaterThan(0);
      return Array.from(canvas.getImageData(0, 0, 96, 96).data).join(',');
    });
    expect(new Set(images).size).toBe(brushNames.length);
  });

  it('все кисти оставляют видимую точку при коротком касании', () => {
    const project = createProject({ width: 64, height: 64 });
    for (const brushId of brushNames) {
      const stroke = { ...makeStroke(`dot-${brushId}`, '#315B46', 'ink', 18), brushId, points: [{ x: .5, y: .5 }] };
      expect(pixel(render(paint(project, project.activeLayerId, stroke)))[3]).toBeGreaterThan(0);
    }
  });

  it('маркер полупрозрачный, а линер непрозрачный', () => {
    const project = createProject({ width: 64, height: 64 });
    const liner = pixel(render(paint(project, project.activeLayerId, makeStroke('liner', '#315B46'))));
    const marker = pixel(render(paint(project, project.activeLayerId, { ...makeStroke('marker', '#315B46'), brushId: 'marker' })));
    expect(liner[3]).toBe(255);
    expect(marker[3]).toBeGreaterThan(0);
    expect(marker[3]).toBeLessThan(230);
  });

  it('текстуры воспроизводятся пиксель-в-пиксель при повторном рендере', () => {
    const project = createProject({ width: 96, height: 96 });
    for (const brushId of brushNames) {
      const stroke = { ...makeStroke(`stable-${brushId}`, '#315B46', 'ink', 18), brushId };
      const painted = paint(project, project.activeLayerId, stroke);
      expect(render(painted).canvas.toBuffer('image/png')).toEqual(render(painted).canvas.toBuffer('image/png'));
    }
  });

  it('ластик остаётся полностью непрозрачным даже с выбранным аэрографом', () => {
    const project = createProject({ width: 64, height: 64 });
    const base = paint(project, project.activeLayerId, makeStroke('base', '#ff0000'));
    const erased = paint(base, project.activeLayerId, { ...makeStroke('erase', '#000000', 'erase', 20), brushId: 'airbrush' });
    expect(pixel(render(erased))).toEqual([0, 0, 0, 0]);
  });
});

describe('кэширование слоёв в интерактивном просмотре', () => {
  it('не перерисовывает законченные штрихи на каждом кадре и не изменяет кэш ластиком', () => {
    const base = createProject({ width: 64, height: 64 });
    const red = paint(base, base.activeLayerId, makeStroke('red', '#FF0000'));
    const second = applyAction(red, { type: 'addLayer', layer: {
      kind: 'paint', id: 'top', name: 'Синий', visible: true, locked: false, opacity: 1, strokes: [],
    } });
    const blue = paint(second, 'top', makeStroke('blue', '#0000FF'));
    const canvas = createCanvas(64, 64);
    const ctx = canvas.getContext('2d') as unknown as CanvasRenderingContext2D;
    const cache = new WeakMap();
    const createSurface = vi.fn((width: number, height: number) => createCanvas(width, height) as unknown as HTMLCanvasElement);
    const options = { zoom: 1, panX: 0, panY: 0, includeReferences: true, createSurface, paintCache: cache };
    renderProject(ctx, blue, new Map(), options);
    expect(createSurface).toHaveBeenCalledTimes(2);
    expect(pixel(canvas.getContext('2d'))).toEqual([0, 0, 255, 255]);

    renderProject(ctx, blue, new Map(), {
      ...options, preview: { layerId: 'top', stroke: makeStroke('erasing-preview', '#000000', 'erase', 20) },
    });
    expect(createSurface).toHaveBeenCalledTimes(3);
    expect(pixel(canvas.getContext('2d'))).toEqual([255, 0, 0, 255]);

    renderProject(ctx, blue, new Map(), options);
    expect(createSurface).toHaveBeenCalledTimes(3);
    expect(pixel(canvas.getContext('2d'))).toEqual([0, 0, 255, 255]);
  });
});

describe('пиксельный рендер независимых слоёв', () => {
  it('меняет видимый верхний цвет после перестановки слоёв', () => {
    const base = createProject({ width: 64, height: 64 });
    const red = paint(base, base.activeLayerId, makeStroke('red', '#FF0000'));
    const withTop = applyAction(red, {
      type: 'addLayer',
      layer: { id: 'top', kind: 'paint', name: 'Синий', strokes: [], visible: true, locked: false, opacity: 1 },
    });
    const blue = paint(withTop, 'top', makeStroke('blue', '#0000FF'));
    const moved = applyAction(blue, { type: 'reorderLayer', layerId: base.activeLayerId, toIndex: 1 });
    expect(pixel(render(blue))).toEqual([0, 0, 255, 255]);
    expect(pixel(render(moved))).toEqual([255, 0, 0, 255]);
  });

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

  it('пипетка учитывает порядок и opacity слоёв, но не параметры масштаба просмотра', () => {
    const first = createProject({ width: 64, height: 64 });
    const red = applyAction(first, { type: 'addFill', layerId: first.activeLayerId,
      fill: { id: 'red', point: { x: .5, y: .5 }, color: '#FF0000' } });
    const stacked = applyAction(red, { type: 'addLayer', layer: {
      id: 'top', kind: 'paint', name: 'Полупрозрачный', strokes: [], visible: true, locked: false, opacity: .5,
    } });
    const blue = applyAction(stacked, { type: 'addFill', layerId: 'top',
      fill: { id: 'blue', point: { x: .5, y: .5 }, color: '#0000FF' } });
    const context = render(blue);
    const [r, g, b] = pixel(context);
    expect(pickCompositedColor(context as unknown as CanvasRenderingContext2D, { x: .5, y: .5 }))
      .toBe(`#${[r, g, b].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`.toUpperCase());
    expect(pickCompositedColor(render(first) as unknown as CanvasRenderingContext2D, { x: .5, y: .5 }))
      .toBe('#FFFFFF');
  });
});
