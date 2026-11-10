import { describe, expect, it } from 'vitest';

import { applyAction, createProject, type PaintLayer, type Shape, type Stroke } from './model';
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
