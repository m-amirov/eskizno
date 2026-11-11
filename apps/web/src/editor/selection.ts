import { getPaintOperations, type PaintLayer, type Point, type Stroke } from './model';
import { hitTestShape, shapeBounds, type ShapeHandle } from './shapeGeometry';
import { dynamicBrushWidth, hasDynamicBrush } from './brushes';

export type SelectionBounds = { left: number; top: number; right: number; bottom: number };
export type SelectionTransform = { origin: Point; scaleX: number; scaleY: number; translateX: number; translateY: number };

const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const round = (value: number) => Math.round(value * 1_000_000) / 1_000_000;

export function strokeBounds(stroke: Stroke): SelectionBounds {
  return stroke.points.reduce<SelectionBounds>((bounds, point) => ({
    left: Math.min(bounds.left, point.x), top: Math.min(bounds.top, point.y),
    right: Math.max(bounds.right, point.x), bottom: Math.max(bounds.bottom, point.y),
  }), { left: 1, top: 1, right: 0, bottom: 0 });
}

function overlaps(a: SelectionBounds, b: SelectionBounds): boolean {
  return a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top;
}

function segmentDistance(point: Point, a: Point, b: Point, width: number, height: number): number {
  const ax = a.x * width, ay = a.y * height;
  const dx = (b.x - a.x) * width, dy = (b.y - a.y) * height;
  const projection = dx * dx + dy * dy;
  const t = projection ? clamp(((point.x * width - ax) * dx + (point.y * height - ay) * dy) / projection) : 0;
  return Math.hypot(point.x * width - ax - t * dx, point.y * height - ay - t * dy);
}

function hitTestStroke(stroke: Stroke, point: Point, width: number, height: number, scale: number): boolean {
  const points = stroke.points;
  for (let index = 0; index < points.length; index += 1) {
    const previous = points[Math.max(0, index - 1)];
    let radius = stroke.width / 2;
    if (hasDynamicBrush(stroke)) {
      const strength = stroke.dynamics!.pressureSize;
      const maxWidth = Math.max(dynamicBrushWidth(stroke.width, strength, previous.pressure),
        dynamicBrushWidth(stroke.width, strength, points[index].pressure));
      radius = Math.max(radius, maxWidth * (stroke.brushId === 'calligraphy' ? .53 : .5));
    }
    if (segmentDistance(point, previous, points[index], width, height) <= radius + 7 / Math.max(.001, scale)) return true;
  }
  return false;
}

/** Returns the topmost selectable object; bucket fills are deliberately excluded. */
export function hitTestSelectable(layer: PaintLayer, point: Point, width: number, height: number, scale: number): string | null {
  const strokes = new Map(layer.strokes.map((entry) => [entry.id, entry]));
  for (const operation of [...getPaintOperations(layer)].reverse()) {
    if (operation.type === 'shape' && hitTestShape(operation.shape, point, width, height, scale)) return operation.shape.id;
    if (operation.type === 'stroke') {
      const entry = strokes.get(operation.strokeId);
      if (entry && hitTestStroke(entry, point, width, height, scale)) return entry.id;
    }
  }
  return null;
}

export function itemsInMarquee(layer: PaintLayer, frame: SelectionBounds): string[] {
  const strokes = new Map(layer.strokes.map((entry) => [entry.id, entry]));
  return getPaintOperations(layer).flatMap((operation) => {
    if (operation.type === 'shape') return overlaps(shapeBounds(operation.shape), frame) ? [operation.shape.id] : [];
    if (operation.type === 'stroke') {
      const entry = strokes.get(operation.strokeId);
      return entry && overlaps(strokeBounds(entry), frame) ? [entry.id] : [];
    }
    return [];
  });
}

export function selectionBounds(layer: PaintLayer, ids: readonly string[]): SelectionBounds | null {
  const selected = new Set(ids);
  const strokes = new Map(layer.strokes.map((entry) => [entry.id, entry]));
  const frames: SelectionBounds[] = [];
  for (const operation of getPaintOperations(layer)) {
    if (operation.type === 'shape' && selected.has(operation.shape.id)) frames.push(shapeBounds(operation.shape));
    if (operation.type === 'stroke' && selected.has(operation.strokeId)) {
      const entry = strokes.get(operation.strokeId);
      if (entry) frames.push(strokeBounds(entry));
    }
  }
  if (!frames.length) return null;
  return { left: Math.min(...frames.map((entry) => entry.left)),
    top: Math.min(...frames.map((entry) => entry.top)),
    right: Math.max(...frames.map((entry) => entry.right)),
    bottom: Math.max(...frames.map((entry) => entry.bottom)) };
}

export function normalizeFrame(start: Point, end: Point): SelectionBounds {
  return { left: Math.min(start.x, end.x), top: Math.min(start.y, end.y),
    right: Math.max(start.x, end.x), bottom: Math.max(start.y, end.y) };
}

/** A visible handle frame even for one-point and perfectly straight strokes. */
export function handleFrame(bounds: SelectionBounds): SelectionBounds {
  const width = Math.max(.01, bounds.right - bounds.left);
  const height = Math.max(.01, bounds.bottom - bounds.top);
  const left = clamp((bounds.left + bounds.right - width) / 2, 0, 1 - width);
  const top = clamp((bounds.top + bounds.bottom - height) / 2, 0, 1 - height);
  return { left, top, right: left + width, bottom: top + height };
}

export function moveSelectionFrame(frame: SelectionBounds, delta: Point): SelectionBounds {
  if (delta.x === 0 && delta.y === 0) return frame;
  const dx = clamp(delta.x, -frame.left, 1 - frame.right);
  const dy = clamp(delta.y, -frame.top, 1 - frame.bottom);
  return { left: round(frame.left + dx), top: round(frame.top + dy),
    right: round(frame.right + dx), bottom: round(frame.bottom + dy) };
}

export function resizeSelectionFrame(frame: SelectionBounds, handle: ShapeHandle, point: Point): SelectionBounds {
  const min = .01;
  return { left: handle.includes('w') ? round(clamp(point.x, 0, frame.right - min)) : frame.left,
    right: handle.includes('e') ? round(clamp(point.x, frame.left + min)) : frame.right,
    top: handle.includes('n') ? round(clamp(point.y, 0, frame.bottom - min)) : frame.top,
    bottom: handle.includes('s') ? round(clamp(point.y, frame.top + min)) : frame.bottom };
}

/** Resize by pointer displacement, preserving the initial grab offset within a handle. */
export function resizeSelectionDrag(frame: SelectionBounds, handle: ShapeHandle, start: Point, end: Point): SelectionBounds {
  if (end.x === start.x && end.y === start.y) return frame;
  return resizeSelectionFrame(frame, handle, {
    x: (handle.includes('w') ? frame.left : frame.right) + end.x - start.x,
    y: (handle.includes('n') ? frame.top : frame.bottom) + end.y - start.y,
  });
}

export function handleAt(frame: SelectionBounds, point: Point, width: number, height: number, scale: number): ShapeHandle | null {
  const corners: Record<ShapeHandle, Point> = {
    nw: { x: frame.left, y: frame.top }, ne: { x: frame.right, y: frame.top },
    sw: { x: frame.left, y: frame.bottom }, se: { x: frame.right, y: frame.bottom },
  };
  let match: ShapeHandle | null = null;
  for (const handle of ['nw', 'ne', 'sw', 'se'] as const) {
    const corner = corners[handle];
    if (Math.hypot((point.x - corner.x) * width, (point.y - corner.y) * height) * scale <= 10) {
      // At small zoom levels several handles may overlap. Treat the ambiguous
      // area as the object body so a tiny stroke can still be dragged.
      if (match) return null;
      match = handle;
    }
  }
  return match;
}

export function transformationForFrame(before: SelectionBounds, after: SelectionBounds): SelectionTransform {
  return { origin: { x: before.left, y: before.top },
    scaleX: round((after.right - after.left) / Math.max(.000001, before.right - before.left)),
    scaleY: round((after.bottom - after.top) / Math.max(.000001, before.bottom - before.top)),
    translateX: round(after.left - before.left), translateY: round(after.top - before.top) };
}
