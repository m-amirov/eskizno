import { describe, expect, it } from 'vitest';

import {
  clientToNormalized, normalizedWheelDelta, panView, pinchView, screenToArtboard, wheelZoom, zoomView, type ViewState,
} from './geometry';

const base: ViewState = { zoom: 1, panX: 0, panY: 0 };

describe('геометрия холста', () => {
  it('переводит координаты DOM-прямоугольника в нормализованную точку', () => {
    expect(clientToNormalized(150, 80, {
      left: 100, top: 20, width: 200, height: 120,
    })).toEqual({ x: 0.25, y: 0.5 });
    expect(clientToNormalized(500, -100, {
      left: 100, top: 20, width: 200, height: 120,
    })).toEqual({ x: 1, y: 0 });
    expect(clientToNormalized(100, 100, {
      left: 0, top: 0, width: 0, height: 300,
    })).toBeNull();
  });

  it('ограничивает масштаб от 1 до 4 и не допускает бесконечных координат', () => {
    expect(zoomView(base, 0.1).zoom).toBe(1);
    expect(zoomView(base, 999).zoom).toBe(4);
    expect(zoomView(base, Number.NaN)).toBe(base);
    expect(screenToArtboard({ x: Number.NaN, y: 0.5 }, base)).toBeNull();
  });

  it('удерживает точку под курсором на том же месте при zoom', () => {
    const original = { x: 0.7, y: 0.3 };
    const afterZoom = zoomView(base, 2.25, original);

    expect(screenToArtboard(original, afterZoom)?.x).toBeCloseTo(original.x, 5);
    expect(screenToArtboard(original, afterZoom)?.y).toBeCloseTo(original.y, 5);
  });

  it('ограничивает перемещение в зависимости от масштаба', () => {
    const enlarged = zoomView(base, 3);
    expect(panView(enlarged, 100, -100)).toEqual({ zoom: 3, panX: 1, panY: -1 });
    expect(panView(base, 100, 100)).toEqual(base);
  });

  it('преобразует точку экрана обратно в координаты рисунка', () => {
    const view = { zoom: 2, panX: -0.2, panY: 0.1 };
    const point = screenToArtboard({ x: 0.3, y: 0.7 }, view);
    expect(point?.x).toBeCloseTo(0.5);
    expect(point?.y).toBeCloseTo(0.55);
    expect(screenToArtboard({ x: -0.1, y: 0 }, view)).toBeNull();
  });

  it('двумя пальцами масштабирует и перемещает рисунок относительно середины', () => {
    const result = pinchView(base,
      [{ x: 0.3, y: 0.5 }, { x: 0.5, y: 0.5 }],
      [{ x: 0.3, y: 0.6 }, { x: 0.7, y: 0.6 }],
    );
    expect(result.zoom).toBeCloseTo(2);
    expect(result.panY).toBeCloseTo(0.1);
  });

  it('колёсико масштабирует относительно курсора и не выходит за диапазон 1…4', () => {
    const anchor = { x: 0.64, y: 0.35 };
    const zoomed = wheelZoom(base, -100, anchor);
    expect(zoomed.zoom).toBeCloseTo(Math.exp(0.2));
    expect(screenToArtboard(anchor, zoomed)?.x).toBeCloseTo(0.64, 5);
    expect(screenToArtboard(anchor, zoomed)?.y).toBeCloseTo(0.35, 5);
    expect(wheelZoom(base, Number.NaN, anchor)).toBe(base);
    expect(wheelZoom(base, -5000, anchor).zoom).toBe(4);
    expect(wheelZoom(base, 5000, anchor).zoom).toBe(1);
  });

  it('переводит колёсико со строк/страниц в пиксели', () => {
    expect(normalizedWheelDelta(-3, 0, 800)).toBe(-3);
    expect(normalizedWheelDelta(-3, 1, 800)).toBe(-48);
    expect(normalizedWheelDelta(-1, 2, 800)).toBe(-800);
    expect(normalizedWheelDelta(Number.POSITIVE_INFINITY, 0, 800)).toBeNull();
  });
});
