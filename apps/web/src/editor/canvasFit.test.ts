import { describe, expect, it } from 'vitest';

import { fitCanvasWidth } from './canvasFit';

describe('вписывание холста в свободную студию', () => {
  it('ограничивает холст по высоте, если по ширине он вышел бы за область', () => {
    expect(fitCanvasWidth(974, 480, 1024, 768)).toBe(640);
    expect(fitCanvasWidth(700, 375, 1024, 768)).toBe(500);
  });

  it('занимает доступную ширину, если высоты достаточно', () => {
    expect(fitCanvasWidth(700, 900, 1024, 768)).toBe(700);
    expect(fitCanvasWidth(320, 300, 1024, 768)).toBe(320);
  });

  it('не задаёт размер для невалидной или нулевой рабочей области', () => {
    expect(fitCanvasWidth(0, 400, 1024, 768)).toBeNull();
    expect(fitCanvasWidth(800, 0, 1024, 768)).toBeNull();
    expect(fitCanvasWidth(800, 400, 1024, 0)).toBeNull();
    expect(fitCanvasWidth(Number.NaN, 400, 1024, 768)).toBeNull();
  });
});
