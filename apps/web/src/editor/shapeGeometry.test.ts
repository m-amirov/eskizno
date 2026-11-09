import { describe, expect, it } from 'vitest';
import { hitTestShape, moveShape, resizeShape, shapeHandleAt } from './shapeGeometry';
import type { Shape } from './model';

const rectangle: Shape = {
  id: 'r', kind: 'rectangle', from: { x: .2, y: .2 }, to: { x: .6, y: .6 },
  color: '#112233', width: 3, style: 'both', opacity: 1,
};

describe('перемещение, масштабирование и выбор фигуры', () => {
  it('перемещает целиком с сохранением размера и не выпускает за холст', () => {
    expect(moveShape(rectangle, { x: .1, y: -.1 })).toMatchObject({
      from: { x: .3, y: .1 }, to: { x: .7, y: .5 },
    });
    expect(moveShape(rectangle, { x: 1, y: 1 })).toMatchObject({
      from: { x: .6, y: .6 }, to: { x: 1, y: 1 },
    });
  });
  it('растягивает четырьмя маркерами, не меняя противоположный угол', () => {
    expect(resizeShape(rectangle, 'nw', { x: .1, y: .15 })).toMatchObject({
      from: { x: .1, y: .15 }, to: { x: .6, y: .6 },
    });
    expect(resizeShape(rectangle, 'se', { x: .8, y: .9 })).toMatchObject({
      from: { x: .2, y: .2 }, to: { x: .8, y: .9 },
    });
  });
  it('проверяет границу, внутренность залитой фигуры и попадание на маркер', () => {
    expect(hitTestShape(rectangle, { x: .4, y: .4 }, 1024, 768)).toBe(true);
    expect(hitTestShape({ ...rectangle, style: 'outline' }, { x: .4, y: .4 }, 1024, 768)).toBe(false);
    expect(hitTestShape(rectangle, { x: .9, y: .9 }, 1024, 768)).toBe(false);
    expect(shapeHandleAt(rectangle, { x: .2, y: .2 }, 1024, 768)).toBe('nw');
    expect(shapeHandleAt(rectangle, { x: .5, y: .5 }, 1024, 768)).toBeNull();
  });
  it('позволяет выбрать диагональную линию по расстоянию, а не по площади рамки', () => {
    const line: Shape = { ...rectangle, kind: 'line', style: 'outline' };
    expect(hitTestShape(line, { x: .4, y: .4 }, 1000, 1000)).toBe(true);
    expect(hitTestShape(line, { x: .4, y: .23 }, 1000, 1000)).toBe(false);
  });
  it('при изменении конца стрелки не переворачивает её направление', () => {
    const arrow: Shape = { ...rectangle, kind: 'arrow',
      from: { x: .8, y: .8 }, to: { x: .2, y: .2 }, style: 'outline' };
    expect(shapeHandleAt(arrow, { x: .8, y: .8 }, 1000, 1000)).toBe('nw');
    expect(shapeHandleAt(arrow, { x: .2, y: .2 }, 1000, 1000)).toBe('se');
    expect(resizeShape(arrow, 'nw', { x: .9, y: .7 })).toMatchObject({
      from: { x: .9, y: .7 }, to: { x: .2, y: .2 },
    });
  });
  it('попадает в видимую толстую линию при zoom 4 и на маркер при сжатом CSS-холсте', () => {
    const line: Shape = { ...rectangle, kind: 'line', style: 'outline', width: 48 };
    expect(hitTestShape(line, { x: .4, y: .42 }, 1024, 768, 4)).toBe(true);
    expect(hitTestShape(line, { x: .4, y: .6 }, 1024, 768, 4)).toBe(false);
    expect(shapeHandleAt(rectangle, { x: .22, y: .2 }, 1024, 768, .3)).toBe('nw');
  });
});
