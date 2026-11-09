import { describe, expect, it } from 'vitest';

import { normalizeToolSettings } from './brushes';

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
