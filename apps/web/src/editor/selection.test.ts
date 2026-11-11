import { describe, expect, it } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';

import { applyAction, createProject, type PaintLayer, type Shape, type Stroke } from './model';
import { paintBrushStroke } from './brushes';
import { handleAt, handleFrame, hitTestSelectable, itemsInMarquee, selectionBounds, moveSelectionFrame,
  resizeSelectionDrag, resizeSelectionFrame, transformationForFrame } from './selection';

const line: Stroke = { id: 'line', kind: 'ink', brushId: 'pencil', color: '#112233',
  width: 6, opacity: 1, points: [{ x: .1, y: .2 }, { x: .3, y: .2 }] };
const shape: Shape = { id: 'square', kind: 'rectangle', from: { x: .6, y: .5 },
  to: { x: .8, y: .7 }, color: '#112233', width: 2, opacity: 1, style: 'both' };

function layerWithObjects(): PaintLayer {
  const base = createProject();
  const withStroke = applyAction(base, { type: 'addStroke', layerId: base.activeLayerId, stroke: line });
  const withShape = applyAction(withStroke, { type: 'addShape', layerId: base.activeLayerId, shape });
  return withShape.layers[0] as PaintLayer;
}

describe('выделение объектов', () => {
  it.each(['liner', 'calligraphy'] as const)('выбирает край динамической кисти %s с учётом нажима и масштаба', (brushId) => {
    const base = createProject();
    const stroke: Stroke = { ...line, id: 'dynamic', brushId, width: 48,
      dynamics: { pressureSize: .8, tiltAngle: true },
      points: [{ x: .1, y: .2, pressure: 0 }, { x: .3, y: .2, pressure: 1 }] };
    const project = applyAction(base, { type: 'addStroke', layerId: base.activeLayerId, stroke });
    for (const scale of [1, 4, 8]) {
      expect(hitTestSelectable(project.layers[0] as PaintLayer, { x: .29, y: .231 }, 1000, 1000, scale)).toBe('dynamic');
    }
    const transformed = applyAction(project, { type: 'transformItems', layerId: base.activeLayerId, ids: ['dynamic'],
      origin: { x: 0, y: 0 }, scaleX: 2, scaleY: 2, translateX: 0, translateY: 0 });
    expect(hitTestSelectable(transformed.layers[0] as PaintLayer, { x: .58, y: .462 }, 1000, 1000, 8)).toBe('dynamic');
  });

  it('выбирает непрозрачный пиксель за пределом прежнего допуска liner', () => {
    const base = createProject();
    const stroke: Stroke = { ...line, brushId: 'liner', width: 48, dynamics: { pressureSize: .8, tiltAngle: true },
      points: [{ x: .1, y: .2, pressure: 1 }, { x: .3, y: .2, pressure: 1 }] };
    const canvas = createCanvas(1000, 1000); const ctx = canvas.getContext('2d');
    paintBrushStroke(ctx as unknown as CanvasRenderingContext2D, stroke, 1000, 1000);
    expect(ctx.getImageData(200, 230, 1, 1).data[3]).toBe(255);
    const project = applyAction(base, { type: 'addStroke', layerId: base.activeLayerId, stroke });
    expect(hitTestSelectable(project.layers[0] as PaintLayer, { x: .2, y: .23 }, 1000, 1000, 4)).toBe('line');
  });

  it('сохраняет прежний допуск legacy и выбирает верхний динамический штрих', () => {
    const base = createProject();
    const legacy: Stroke = { ...line, width: 48 };
    const dynamic: Stroke = { ...legacy, id: 'top', brushId: 'liner', dynamics: { pressureSize: .8, tiltAngle: true },
      points: legacy.points.map((point) => ({ ...point, pressure: 1 })) };
    const one = applyAction(base, { type: 'addStroke', layerId: base.activeLayerId, stroke: legacy });
    expect(hitTestSelectable(one.layers[0] as PaintLayer, { x: .2, y: .23 }, 1000, 1000, 8)).toBeNull();
    const two = applyAction(one, { type: 'addStroke', layerId: base.activeLayerId, stroke: dynamic });
    expect(hitTestSelectable(two.layers[0] as PaintLayer, { x: .2, y: .23 }, 1000, 1000, 8)).toBe('top');
  });
  it('выбирает верхнюю фигуру и штрих по реальной траектории, игнорируя пустое место', () => {
    const layer = layerWithObjects();
    expect(hitTestSelectable(layer, { x: .7, y: .6 }, 1000, 800, 1)).toBe('square');
    expect(hitTestSelectable(layer, { x: .2, y: .2 }, 1000, 800, 1)).toBe('line');
    expect(hitTestSelectable(layer, { x: .2, y: .6 }, 1000, 800, 1)).toBeNull();
  });

  it('рамка собирает только пересечённые объекты в порядке операций', () => {
    const layer = layerWithObjects();
    expect(itemsInMarquee(layer, { left: .15, top: .15, right: .65, bottom: .6 })).toEqual(['line', 'square']);
    expect(itemsInMarquee(layer, { left: .35, top: .1, right: .5, bottom: .4 })).toEqual([]);
    expect(selectionBounds(layer, ['line', 'square'])).toEqual({ left: .1, top: .2, right: .8, bottom: .7 });
  });

  it('перенос и масштабирование рамки ограничены границами холста', () => {
    const frame = { left: .1, top: .2, right: .5, bottom: .6 };
    expect(moveSelectionFrame(frame, { x: 1, y: -.8 })).toEqual({ left: .6, top: 0, right: 1, bottom: .4 });
    expect(resizeSelectionFrame(frame, 'se', { x: 1.2, y: .85 })).toEqual({ left: .1, top: .2, right: 1, bottom: .85 });
    expect(transformationForFrame(frame, { left: .2, top: .3, right: .6, bottom: .7 })).toEqual({
      origin: { x: .1, y: .2 }, scaleX: 1, scaleY: 1, translateX: .1, translateY: .1,
    });
  });

  it('у короткого штриха пересекающиеся угловые ручки не перехватывают перенос за центр', () => {
    const frame = handleFrame({ left: .4, top: .4, right: .4, bottom: .4 });
    expect(handleAt(frame, { x: .4, y: .4 }, 400, 300, 1)).toBeNull();
    expect(handleAt({ left: .2, top: .2, right: .6, bottom: .6 },
      { x: .2, y: .2 }, 400, 300, 1)).toBe('nw');
  });

  it('не сдвигает угол при захвате внутри допуска маркера, пока курсор не переместился', () => {
    const frame = { left: .2, top: .2, right: .5, bottom: .5 };
    const start = { x: .21, y: .21 };
    expect(resizeSelectionDrag(frame, 'nw', start, start)).toEqual(frame);
    expect(resizeSelectionDrag(frame, 'nw', start, { x: .26, y: .26 })).toEqual({
      left: .25, top: .25, right: .5, bottom: .5,
    });
  });
  it('не округляет рамку высокоточного рисунка, если перенос или resize не начинались', () => {
    const frame = { left: .20000049, top: .20000049, right: .50000049, bottom: .50000049 };
    expect(moveSelectionFrame(frame, { x: 0, y: 0 })).toEqual(frame);
    expect(resizeSelectionDrag(frame, 'se', { x: .51, y: .51 }, { x: .51, y: .51 })).toEqual(frame);
  });
});
