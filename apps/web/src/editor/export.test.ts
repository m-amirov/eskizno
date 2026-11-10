import { createCanvas, loadImage } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';

import { exportPng } from './export';
import { applyAction, createProject } from './model';

function makeCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = createCanvas(width, height);
  (canvas as unknown as HTMLCanvasElement).toBlob = (callback) => {
    callback(new Blob([new Uint8Array(canvas.toBuffer('image/png'))], { type: 'image/png' }));
  };
  return canvas as unknown as HTMLCanvasElement;
}

async function decodedPixel(blob: Blob, x: number, y: number) {
  expect(blob.type).toBe('image/png');
  const image = await loadImage(new Uint8Array(await blob.arrayBuffer()));
  const canvas = createCanvas(image.width, image.height);
  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0);
  return { width: image.width, height: image.height, rgba: [...context.getImageData(x, y, 1, 1).data] };
}

describe('экспорт PNG', () => {
  it('выводит нативный размер, прозрачный фон и опциональный референс, без зума и UI', async () => {
    const project = createProject({ width: 64, height: 64 });
    const image = createCanvas(64, 64);
    const paint = image.getContext('2d');
    paint.fillStyle = '#00FF00';
    paint.fillRect(0, 0, 64, 64);
    const withReference = applyAction(project, { type: 'addLayer', index: 0, layer: {
      id: 'ref', kind: 'reference', assetId: 'reference', placement: 'overlay',
      name: 'Оригинал', visible: true, locked: true, opacity: 1,
      transform: { x: 0, y: 0, scale: 1, rotation: 0 },
    } });
    const drawn = applyAction(withReference, { type: 'addFill', layerId: project.activeLayerId,
      fill: { id: 'paint', color: '#FF0000', point: { x: .5, y: .5 } } });
    const assets = new Map([['reference', image as unknown as CanvasImageSource]]);
    const opts = { createCanvas: makeCanvas, createSurface: makeCanvas };
    const clean = await exportPng(withReference, assets, { ...opts, includeReferences: false });
    const withSketch = await exportPng(withReference, assets, { ...opts, includeReferences: true });
    const withInk = await exportPng(drawn, assets, { ...opts, includeReferences: true });

    expect(await decodedPixel(clean, 20, 20)).toEqual({ width: 64, height: 64, rgba: [0, 0, 0, 0] });
    expect((await decodedPixel(withSketch, 20, 20)).rgba).toEqual([0, 255, 0, 255]);
    expect((await decodedPixel(withInk, 20, 20)).rgba).toEqual([255, 0, 0, 255]);
  });
});
