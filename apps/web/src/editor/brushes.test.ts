import { describe, expect, it } from 'vitest';

import { calligraphyAngle, normalizeToolSettings, sampleDynamicStrokePoints } from './brushes';

describe('динамические образцы', () => {
  it('интерполирует координаты, нажим и наклон по длине пути', () => {
    const result = sampleDynamicStrokePoints([{ x: 0, y: 0, pressure: 0, tiltX: 0, tiltY: 10 },
      { x: 1, y: 0, pressure: 1, tiltX: 20, tiltY: 30 }], 10, 10, 5);
    expect(result).toEqual([{ x: 0, y: 0, pressure: 0, tiltX: 0, tiltY: 10 },
      { x: 5, y: 0, pressure: .5, tiltX: 10, tiltY: 20 },
      { x: 10, y: 0, pressure: 1, tiltX: 20, tiltY: 30 }]);
  });
  it('ограничивает количество и нормализует некорректные сенсоры', () => {
    const points = [{ x: 0, y: .5, pressure: NaN, tiltX: Infinity },
      { x: 1, y: .5, pressure: 5, tiltY: -Infinity }];
    const samples = sampleDynamicStrokePoints(points, 4096, 4096, .01);
    expect(samples.length).toBeLessThanOrEqual(2600);
    expect(samples[0]).toEqual({ x: 0, y: 2048, pressure: .5 });
    expect(samples.at(-1)).toEqual({ x: 4096, y: 2048, pressure: 1 });
    expect(calligraphyAngle()).toBe(-Math.PI / 4);
    expect(calligraphyAngle(0, 0)).toBe(-Math.PI / 4);
    expect(calligraphyAngle(0, 30)).toBeCloseTo(Math.PI / 2);
  });
});

describe('параметры инструментов', () => {
  it('ограничивает размеры кисти и ластика независимо друг от друга и прозрачность диапазоном 0…1', () => {
    expect(normalizeToolSettings({ brushSize: 99, eraserSize: -5, opacity: 3 })).toEqual({
      brushSize: 48, eraserSize: 1, opacity: 1,
    });
    expect(normalizeToolSettings({ brushSize: 3, eraserSize: 27, opacity: -2 })).toEqual({
      brushSize: 3, eraserSize: 27, opacity: 0,
    });
  });

  it('не пропускает NaN и бесконечность в параметры сохраняемого штриха', () => {
    expect(normalizeToolSettings({ brushSize: NaN, eraserSize: Infinity, opacity: NaN })).toEqual({
      brushSize: 8, eraserSize: 8, opacity: 1,
    });
  });
});
