import { describe, expect, it } from 'vitest';
import { clampPreviewZoom, constrainPreview, panPreview, resetPreview, zoomPreviewAt } from './referenceViewport';

const frame = { width: 400, height: 300 };
const image = { width: 800, height: 600 };

describe('reference preview viewport', () => {
  it('clamps zoom to 25–400% and rejects non-finite input', () => {
    expect(clampPreviewZoom(-20)).toBe(.25);
    expect(clampPreviewZoom(40)).toBe(4);
    expect(clampPreviewZoom(Number.NaN)).toBe(1);
  });

  it('keeps the point under the cursor stable while zooming', () => {
    const start = resetPreview();
    const next = zoomPreviewAt(start, 2, { x: 70, y: -30 }, frame, image);
    expect(next).toEqual({ zoom: 2, panX: -70, panY: 30 });
  });

  it('constrains panning so a zoomed image cannot leave the viewport', () => {
    const next = panPreview({ zoom: 2, panX: 0, panY: 0 }, 1000, -1000, frame, image);
    expect(next).toEqual({ zoom: 2, panX: 200, panY: -150 });
  });

  it('does not pan when the image is smaller than the frame', () => {
    const tallImage = { width: 100, height: 300 };
    expect(panPreview({ zoom: 2, panX: 0, panY: 0 }, 60, 60, frame, tallImage))
      .toEqual({ zoom: 2, panX: 0, panY: 60 });
  });

  it('resets pan when zooming out to fit and on explicit reset', () => {
    expect(constrainPreview({ zoom: 1, panX: 40, panY: -30 }, frame, image)).toEqual(resetPreview());
    expect(resetPreview()).toEqual({ zoom: 1, panX: 0, panY: 0 });
  });
});
