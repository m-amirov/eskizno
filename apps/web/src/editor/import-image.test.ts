import { createCanvas, loadImage } from '@napi-rs/canvas';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { decodeLocalImage, importReference } from './import-image';

function imageFile(type: 'image/png' | 'image/jpeg' | 'image/webp', width = 12, height = 8): File {
  const canvas = createCanvas(width, height);
  const bytes = type === 'image/png' ? canvas.toBuffer('image/png')
    : type === 'image/jpeg' ? canvas.toBuffer('image/jpeg') : canvas.toBuffer('image/webp');
  return new File([bytes], `пример.${type.split('/')[1]}`, { type });
}

describe('E1.6 — приватный импорт референса', () => {
  const original = globalThis.createImageBitmap;

  beforeEach(() => {
    globalThis.createImageBitmap = vi.fn(async (blob: Blob) => {
      const image = await loadImage(new Uint8Array(await blob.arrayBuffer()));
      return { width: image.width, height: image.height, close: vi.fn() } as unknown as ImageBitmap;
    }) as unknown as typeof createImageBitmap;
  });
  afterEach(() => { globalThis.createImageBitmap = original; });

  it.each(['image/png', 'image/jpeg', 'image/webp'] as const)('декодирует %s и возвращает Blob с размерами', async (mime) => {
    const file = imageFile(mime);
    const result = await importReference(file);
    expect(result).toMatchObject({ width: 12, height: 8, mime });
    expect(result.blob).toBe(file);
    expect(result.blob.size).toBeGreaterThan(0);
    expect(vi.mocked(globalThis.createImageBitmap).mock.results).toHaveLength(1);
  });

  it.each(['', 'application/octet-stream'])('импортирует PNG с MIME «%s» от Android-провайдера по сигнатуре', async (type) => {
    const png = imageFile('image/png');
    const supplied = new File([await png.arrayBuffer()], 'эскиз.png', { type });
    const result = await importReference(supplied);
    expect(result).toMatchObject({ width: 12, height: 8, mime: 'image/png' });
    expect(result.blob).toBe(supplied);
  });

  it('не принимает неподдерживаемый файл с пустым MIME даже при расширении .png', async () => {
    await expect(importReference(new File(['not a png'], 'фото.png', { type: '' })))
      .rejects.toThrow(/PNG|JPEG|WebP/);
    expect(globalThis.createImageBitmap).not.toHaveBeenCalled();
  });

  it('отказывает неизвестному MIME без попытки декодирования', async () => {
    await expect(importReference(new File(['<svg/>'], 'bad.svg', { type: 'image/svg+xml' })))
      .rejects.toThrow(/PNG|JPEG|WebP/);
    expect(globalThis.createImageBitmap).not.toHaveBeenCalled();
  });

  it('отказывает пустому и слишком большому файлу до декодирования', async () => {
    await expect(importReference(new File([], 'empty.png', { type: 'image/png' }))).rejects.toThrow(/пуст/i);
    await expect(importReference(new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'huge.png', { type: 'image/png' })))
      .rejects.toThrow(/10 МБ/);
    expect(globalThis.createImageBitmap).not.toHaveBeenCalled();
  });

  it('не принимает испорченное изображение даже с разрешённым MIME', async () => {
    await expect(importReference(new File(['wrong bytes'], 'corrupt.png', { type: 'image/png' })))
      .rejects.toThrow(/поврежден|открыть|прочитать/i);
  });

  it('отказывает ширине более 4096 и суммарной площади более 16 мегапикселей', async () => {
    const file = imageFile('image/png');
    globalThis.createImageBitmap = vi.fn(async () => ({ width: 4097, height: 5, close: vi.fn() }) as unknown as ImageBitmap);
    await expect(importReference(file)).rejects.toThrow(/4096/);
    globalThis.createImageBitmap = vi.fn(async () => ({ width: 4096, height: 4096, close: vi.fn() }) as unknown as ImageBitmap);
    await expect(importReference(file)).rejects.toThrow(/16 Мп/);
  });

  it('декодирует растр через Image.decode при отсутствии createImageBitmap и освобождает objectURL', async () => {
    globalThis.createImageBitmap = undefined as unknown as typeof createImageBitmap;
    const oldImage = globalThis.Image;
    const oldCreate = URL.createObjectURL;
    const oldRevoke = URL.revokeObjectURL;
    const decode = vi.fn().mockResolvedValue(undefined);
    const createUrl = vi.fn(() => 'blob:fallback');
    const revokeUrl = vi.fn();
    globalThis.Image = class {
      src = '';
      naturalWidth = 20;
      naturalHeight = 10;
      decode = decode;
    } as unknown as typeof Image;
    URL.createObjectURL = createUrl;
    URL.revokeObjectURL = revokeUrl;
    try {
      const decoded = await decodeLocalImage(imageFile('image/png'));
      expect(decoded.width).toBe(20);
      expect(decoded.height).toBe(10);
      expect(decode).toHaveBeenCalledOnce();
      expect((decoded.source as HTMLImageElement).src).toBe('blob:fallback');
      decoded.dispose();
      expect(revokeUrl).toHaveBeenCalledWith('blob:fallback');
    } finally {
      globalThis.Image = oldImage;
      URL.createObjectURL = oldCreate;
      URL.revokeObjectURL = oldRevoke;
    }
  });

  it('пробует Image.decode, если createImageBitmap существует, но отклоняет файл', async () => {
    globalThis.createImageBitmap = vi.fn().mockRejectedValue(new Error('bitmap unavailable')) as unknown as typeof createImageBitmap;
    const oldImage = globalThis.Image;
    const oldCreate = URL.createObjectURL;
    const oldRevoke = URL.revokeObjectURL;
    const decode = vi.fn().mockResolvedValue(undefined);
    const revokeUrl = vi.fn();
    globalThis.Image = class {
      src = '';
      naturalWidth = 12;
      naturalHeight = 8;
      decode = decode;
    } as unknown as typeof Image;
    URL.createObjectURL = vi.fn(() => 'blob:mobile-fallback');
    URL.revokeObjectURL = revokeUrl;
    try {
      const image = await decodeLocalImage(imageFile('image/png'));
      expect(image.width).toBe(12);
      expect(decode).toHaveBeenCalledOnce();
      image.dispose();
      expect(revokeUrl).toHaveBeenCalledWith('blob:mobile-fallback');
    } finally {
      globalThis.Image = oldImage;
      URL.createObjectURL = oldCreate;
      URL.revokeObjectURL = oldRevoke;
    }
  });
});
