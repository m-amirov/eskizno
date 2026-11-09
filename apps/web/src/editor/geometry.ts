import type { Point } from './model';

export interface ViewState {
  zoom: number;
  panX: number;
  panY: number;
}

export interface CanvasRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export const INITIAL_VIEW: ViewState = { zoom: 1, panX: 0, panY: 0 };

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.max(minimum, Math.min(maximum, value));

function finitePoint(point: Point): boolean {
  return point !== null && typeof point === 'object'
    && Number.isFinite(point.x) && Number.isFinite(point.y);
}

function boundedView(zoom: number, panX: number, panY: number): ViewState {
  const boundedZoom = clamp(zoom, 1, 4);
  const limit = (boundedZoom - 1) / 2;
  return {
    zoom: boundedZoom,
    panX: clamp(panX, -limit, limit),
    panY: clamp(panY, -limit, limit),
  };
}

export function clientToNormalized(
  clientX: number,
  clientY: number,
  rect: CanvasRect,
): Point | null {
  if (!rect || !Number.isFinite(clientX) || !Number.isFinite(clientY)
    || !Number.isFinite(rect.left) || !Number.isFinite(rect.top)
    || !Number.isFinite(rect.width) || !Number.isFinite(rect.height)
    || rect.width <= 0 || rect.height <= 0) return null;
  return {
    x: clamp((clientX - rect.left) / rect.width, 0, 1),
    y: clamp((clientY - rect.top) / rect.height, 0, 1),
  };
}

export function screenToArtboard(point: Point, view: ViewState): Point | null {
  if (!finitePoint(point) || point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1
    || !Number.isFinite(view.zoom) || view.zoom <= 0
    || !Number.isFinite(view.panX) || !Number.isFinite(view.panY)) return null;
  const x = (point.x - 0.5 - view.panX) / view.zoom + 0.5;
  const y = (point.y - 0.5 - view.panY) / view.zoom + 0.5;
  return x >= 0 && x <= 1 && y >= 0 && y <= 1 ? { x, y } : null;
}

export function zoomView(view: ViewState, zoom: number, anchor: Point = { x: 0.5, y: 0.5 }): ViewState {
  if (!Number.isFinite(zoom)) return view;
  const nextZoom = clamp(zoom, 1, 4);
  const anchorOnArtboard = screenToArtboard(anchor, view);
  if (!anchorOnArtboard) return view;
  return boundedView(
    nextZoom,
    anchor.x - 0.5 - (anchorOnArtboard.x - 0.5) * nextZoom,
    anchor.y - 0.5 - (anchorOnArtboard.y - 0.5) * nextZoom,
  );
}

export function panView(view: ViewState, deltaX: number, deltaY: number): ViewState {
  if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY)) return view;
  return boundedView(view.zoom, view.panX + deltaX, view.panY + deltaY);
}

/** Normalizes WheelEvent deltaMode without trusting unbounded or malformed input. */
export function normalizedWheelDelta(deltaY: number, deltaMode: number, pageHeight: number): number | null {
  if (!Number.isFinite(deltaY) || !Number.isFinite(pageHeight) || pageHeight <= 0) return null;
  const factor = deltaMode === 0 ? 1 : deltaMode === 1 ? 16 : deltaMode === 2 ? pageHeight : null;
  return factor === null ? null : deltaY * factor;
}

/** Zooms around the cursor, with comfortable exponential wheel sensitivity. */
export function wheelZoom(view: ViewState, deltaY: number, anchor: Point): ViewState {
  if (!Number.isFinite(deltaY)) return view;
  const boundedDelta = clamp(deltaY, -2000, 2000);
  return zoomView(view, view.zoom * Math.exp(-boundedDelta * 0.002), anchor);
}

export function pinchView(
  view: ViewState,
  previous: [Point, Point],
  next: [Point, Point],
): ViewState {
  if (![...previous, ...next].every(finitePoint)) return view;
  const midpoint = (points: [Point, Point]): Point => ({
    x: (points[0].x + points[1].x) / 2,
    y: (points[0].y + points[1].y) / 2,
  });
  const distance = (points: [Point, Point]): number =>
    Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
  const beforeCenter = midpoint(previous);
  const afterCenter = midpoint(next);
  const beforeDistance = distance(previous);
  const scaled = beforeDistance > 0.001
    ? zoomView(view, view.zoom * distance(next) / beforeDistance, beforeCenter)
    : view;
  return panView(scaled, afterCenter.x - beforeCenter.x, afterCenter.y - beforeCenter.y);
}
