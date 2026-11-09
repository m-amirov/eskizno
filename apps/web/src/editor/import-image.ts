/** Uploaded sketches remain on the device; only the validated Blob enters IndexedDB. */
export interface ImportedImage {
  blob: Blob;
  width: number;
  height: number;
  mime: 'image/png' | 'image/jpeg' | 'image/webp';
}

const ALLOWED_MIME = ['image/png', 'image/jpeg', 'image/webp'] as const;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_SIDE = 4096;
const MAX_PIXELS = 16_000_000;

export interface DecodedLocalImage {
  source: CanvasImageSource;
  width: number;
  height: number;
  dispose: () => void;
}

/** Share the bitmap/Safari decoder with both validation and the studio renderer. */
export async function decodeLocalImage(image: Blob): Promise<DecodedLocalImage> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(image);
    return { source: bitmap, width: bitmap.width, height: bitmap.height,
      dispose: () => bitmap.close() };
  }

  // Keep the object URL alive until the image is no longer used for drawing.
  const url = URL.createObjectURL(image);
  try {
    const element = new Image();
    element.src = url;
    await element.decode();
    return { source: element, width: element.naturalWidth, height: element.naturalHeight,
      dispose: () => URL.revokeObjectURL(url) };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

export async function importReference(file: File): Promise<ImportedImage> {
  if (!ALLOWED_MIME.includes(file.type as ImportedImage['mime'])) {
    throw new Error('Выберите изображение PNG, JPEG или WebP.');
  }
  if (file.size === 0) throw new Error('Файл пуст. Выберите другое изображение.');
  if (file.size > MAX_FILE_BYTES) throw new Error('Файл больше 10 МБ. Уменьшите его перед импортом.');
  let size: { width: number; height: number };
  try {
    const decoded = await decodeLocalImage(file);
    try { size = { width: decoded.width, height: decoded.height }; }
    finally { decoded.dispose(); }
  }
  catch { throw new Error('Не удалось открыть изображение: файл повреждён или не поддерживается.'); }
  const { width, height } = size;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error('Изображение имеет некорректный размер.');
  }
  if (width > MAX_SIDE || height > MAX_SIDE) {
    throw new Error('Сторона изображения не должна превышать 4096 пикселей.');
  }
  if (width * height > MAX_PIXELS) {
    throw new Error('Изображение не должно превышать 16 Мп.');
  }
  return { blob: file, width, height, mime: file.type as ImportedImage['mime'] };
}
