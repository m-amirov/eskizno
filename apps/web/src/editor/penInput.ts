import { clientToNormalized, screenToArtboard, type CanvasRect, type ViewState } from './geometry';
import type { StrokePoint } from './model';

const MAX_COALESCED_EVENTS = 256;

function appendPoint(points: StrokePoint[], point: StrokePoint): void {
  const last = points[points.length - 1];
  if (last && last.x === point.x && last.y === point.y) {
    points[points.length - 1] = point;
  } else {
    points.push(point);
  }
}

/** Keeps the latest attributes at stationary coordinates without changing either input. */
export function appendDistinctStrokePoints(
  existing: readonly StrokePoint[],
  incoming: readonly StrokePoint[],
): StrokePoint[] {
  const points = [...existing];
  for (const point of incoming) appendPoint(points, point);
  return points;
}

function collectPoint(event: PointerEvent, rect: CanvasRect, view: ViewState): StrokePoint | null {
  const screen = clientToNormalized(event.clientX, event.clientY, rect);
  const point: StrokePoint | null = screen && screenToArtboard(screen, view);
  if (!point || event.pointerType !== 'pen') return point;

  for (const key of ['pressure', 'tiltX', 'tiltY'] as const) {
    const value = event[key];
    if (!Number.isFinite(value)) continue;
    const minimum = key === 'pressure' ? 0 : -90;
    const maximum = key === 'pressure' ? 1 : 90;
    point[key] = Math.max(minimum, Math.min(maximum, value));
  }
  return point;
}

/** Samples one pointer packet in browser order, bounded independently of its reported size. */
export function collectStrokePoints(event: PointerEvent, rect: CanvasRect, view: ViewState, includeParent = true): StrokePoint[] {
  const points: StrokePoint[] = [];
  const coalesced = typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : [];
  for (let index = 0; index < Math.min(coalesced.length, MAX_COALESCED_EVENTS); index += 1) {
    const sample = coalesced[index];
    if (sample.pointerId !== event.pointerId) continue;
    const point = collectPoint(sample, rect, view);
    if (point) appendPoint(points, point);
  }
  const parent = includeParent ? collectPoint(event, rect, view) : null;
  if (parent) appendPoint(points, parent);
  return points;
}

/** A pen-up zero is a release sentinel, not a contact pressure sample. */
export function finishStrokePoints(existing: readonly StrokePoint[], event: PointerEvent, rect: CanvasRect, view: ViewState): StrokePoint[] {
  if (event.pointerType !== 'pen' || event.type !== 'pointerup' || event.buttons !== 0 || event.pressure !== 0) {
    return appendDistinctStrokePoints(existing, collectStrokePoints(event, rect, view));
  }
  const points = appendDistinctStrokePoints(existing, collectStrokePoints(event, rect, view, false));
  const end = collectPoint(event, rect, view);
  const last = points[points.length - 1];
  if (end && last && (end.x !== last.x || end.y !== last.y)) {
    points.push({ ...last, x: end.x, y: end.y });
  }
  return points;
}
