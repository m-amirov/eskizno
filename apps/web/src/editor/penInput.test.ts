import { describe, expect, it } from 'vitest';

import { INITIAL_VIEW, type CanvasRect } from './geometry';
import type { StrokePoint } from './model';
import { appendDistinctStrokePoints, collectStrokePoints, finishStrokePoints } from './penInput';

const rect: CanvasRect = { left: 100, top: 20, width: 200, height: 100 };

// The unit runner has no native PointerEvent; supply only the consumed event data.
function sample(values: Partial<PointerEvent> = {}): PointerEvent {
  return {
    pointerId: 7, pointerType: 'pen', clientX: 150, clientY: 70,
    pressure: 0.5, tiltX: 0, tiltY: 0, ...values,
  } as PointerEvent;
}

describe('collectStrokePoints', () => {
  it('preserves coalesced order, pressure and tilt before the parent sample', () => {
    const event = sample({
      clientX: 250, pressure: 0, tiltX: 15, tiltY: -25,
      getCoalescedEvents: () => [
        sample({ pressure: 0.1, tiltX: -10, tiltY: 20 }),
        sample({ clientX: 200, pressure: 0.9, tiltX: 30, tiltY: -40 }),
      ],
    });
    expect(collectStrokePoints(event, rect, INITIAL_VIEW)).toEqual([
      { x: 0.25, y: 0.5, pressure: 0.1, tiltX: -10, tiltY: 20 },
      { x: 0.5, y: 0.5, pressure: 0.9, tiltX: 30, tiltY: -40 },
      { x: 0.75, y: 0.5, pressure: 0, tiltX: 15, tiltY: -25 },
    ]);
  });

  it.each(['mouse', 'touch', '', 'unknown'])('keeps %s coordinate-only despite sensor fields', (pointerType) => {
    expect(collectStrokePoints(sample({ pointerType }), rect, INITIAL_VIEW))
      .toEqual([{ x: 0.25, y: 0.5 }]);
  });

  it('excludes coalesced samples from other pointer IDs', () => {
    const event = sample({
      clientX: 200,
      getCoalescedEvents: () => [sample({ pointerId: 8 }), sample({ pressure: 0.1 })],
    });
    expect(collectStrokePoints(event, rect, INITIAL_VIEW)).toEqual([
      { x: 0.25, y: 0.5, pressure: 0.1, tiltX: 0, tiltY: 0 },
      { x: 0.5, y: 0.5, pressure: 0.5, tiltX: 0, tiltY: 0 },
    ]);
  });

  it('uses each sample pointer type rather than inferring pen sensors from the parent', () => {
    const event = sample({ clientX: 200, getCoalescedEvents: () => [sample({ pointerType: '' })] });
    expect(collectStrokePoints(event, rect, INITIAL_VIEW)[0]).toEqual({ x: 0.25, y: 0.5 });
  });

  it('clamps finite sensor values to the serializable model ranges', () => {
    expect(collectStrokePoints(sample({ pressure: 2, tiltX: -120, tiltY: 120 }), rect, INITIAL_VIEW))
      .toEqual([{ x: 0.25, y: 0.5, pressure: 1, tiltX: -90, tiltY: 90 }]);
    expect(collectStrokePoints(sample({ pressure: -1 }), rect, INITIAL_VIEW)[0].pressure).toBe(0);
  });

  it('omits nonfinite and absent sensors without dropping valid coordinates', () => {
    expect(collectStrokePoints(sample({ pressure: NaN, tiltX: Infinity, tiltY: -Infinity }), rect, INITIAL_VIEW))
      .toEqual([{ x: 0.25, y: 0.5 }]);
    expect(collectStrokePoints(sample({ pressure: undefined, tiltX: undefined, tiltY: 22 }), rect, INITIAL_VIEW))
      .toEqual([{ x: 0.25, y: 0.5, tiltY: 22 }]);
  });

  it('maps through the canvas rectangle and zoom/pan into artboard space', () => {
    const points = collectStrokePoints(sample({ clientX: 160, clientY: 90 }), rect,
      { zoom: 2, panX: -0.2, panY: 0.1 });
    expect(points[0].x).toBeCloseTo(0.5);
    expect(points[0].y).toBeCloseTo(0.55);
  });

  it('drops invalid coordinates and invalid geometry', () => {
    const event = sample({ getCoalescedEvents: () => [sample({ clientX: NaN }), sample({ clientY: Infinity })] });
    expect(collectStrokePoints(event, rect, INITIAL_VIEW)).toHaveLength(1);
    expect(collectStrokePoints(event, { ...rect, width: 0 }, INITIAL_VIEW)).toEqual([]);
    expect(collectStrokePoints(event, rect, { ...INITIAL_VIEW, zoom: NaN })).toEqual([]);
    expect(collectStrokePoints(event, rect, { zoom: 1, panX: 2, panY: 0 })).toEqual([]);
  });

  it('keeps the parent when coalesced events are empty', () => {
    expect(collectStrokePoints(sample({ getCoalescedEvents: () => [] }), rect, INITIAL_VIEW))
      .toEqual([{ x: 0.25, y: 0.5, pressure: 0.5, tiltX: 0, tiltY: 0 }]);
  });

  it('bounds coalesced processing to 256 entries while always retaining the parent', () => {
    const coalesced = Array.from({ length: 300 }, (_, index) => sample({ clientX: 100 + index / 2 }));
    const points = collectStrokePoints(sample({ clientX: 300, getCoalescedEvents: () => coalesced }), rect, INITIAL_VIEW);
    expect(points).toHaveLength(257);
    expect(points[0].x).toBe(0);
    expect(points[255].x).toBe(0.6375);
    expect(points[256].x).toBe(1);
  });

  it('retains the latest stationary attributes instead of accumulating duplicate samples', () => {
    const event = sample({ pressure: 0.9, tiltX: 30, getCoalescedEvents: () => [sample({ pressure: 0.1 })] });
    expect(collectStrokePoints(event, rect, INITIAL_VIEW))
      .toEqual([{ x: 0.25, y: 0.5, pressure: 0.9, tiltX: 30, tiltY: 0 }]);
  });
});

describe('appendDistinctStrokePoints', () => {
  it('retains contact sensors at release, including coalesced zero-pressure contact and endpoint geometry', () => {
    const existing = [{ x: .25, y: .5, pressure: .8, tiltX: 20, tiltY: -10 }];
    const release = sample({ type: 'pointerup', buttons: 0, pressure: 0, clientX: 250,
      getCoalescedEvents: () => [sample({ clientX: 200, pressure: 0, buttons: 1, tiltX: 30 })] });
    expect(finishStrokePoints(existing, release, rect, INITIAL_VIEW)).toEqual([
      existing[0], { x: .5, y: .5, pressure: 0, tiltX: 30, tiltY: 0 },
      { x: .75, y: .5, pressure: 0, tiltX: 30, tiltY: 0 },
    ]);
    expect(finishStrokePoints(existing, sample({ type: 'pointerup', buttons: 0, pressure: 0 }), rect, INITIAL_VIEW))
      .toEqual(existing);
  });
  it('replaces boundary and incoming duplicates without mutating either input', () => {
    const existing: readonly StrokePoint[] = Object.freeze([
      Object.freeze({ x: 0, y: 0 }), Object.freeze({ x: 0.25, y: 0.5, pressure: 0.1 }),
    ]);
    const incoming: readonly StrokePoint[] = Object.freeze([
      Object.freeze({ x: 0.25, y: 0.5, pressure: 0.9, tiltX: 10 }),
      Object.freeze({ x: 0.75, y: 0.5, pressure: 0.2 }),
      Object.freeze({ x: 0.75, y: 0.5, pressure: 0.8 }),
    ]);
    expect(appendDistinctStrokePoints(existing, incoming)).toEqual([
      { x: 0, y: 0 }, { x: 0.25, y: 0.5, pressure: 0.9, tiltX: 10 },
      { x: 0.75, y: 0.5, pressure: 0.8 },
    ]);
    expect(existing[1].pressure).toBe(0.1);
    expect(incoming).toHaveLength(3);
  });

  it('does not remove a nonadjacent return to an earlier coordinate', () => {
    expect(appendDistinctStrokePoints([{ x: 0, y: 0 }], [{ x: 1, y: 1 }, { x: 0, y: 0 }]))
      .toEqual([{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 0 }]);
  });

  it('supports empty inputs and replaces rather than retaining stale optional fields', () => {
    expect(appendDistinctStrokePoints([], [])).toEqual([]);
    expect(appendDistinctStrokePoints([], [{ x: 0, y: 0 }, { x: 0, y: 0, pressure: 0.5 }]))
      .toEqual([{ x: 0, y: 0, pressure: 0.5 }]);
    expect(appendDistinctStrokePoints([{ x: 0, y: 0, pressure: 0.5 }], [{ x: 0, y: 0 }]))
      .toEqual([{ x: 0, y: 0 }]);
    const existing = [{ x: 0, y: 0 }];
    const result = appendDistinctStrokePoints(existing, []);
    expect(result).toEqual(existing);
    expect(result).not.toBe(existing);
  });
});
