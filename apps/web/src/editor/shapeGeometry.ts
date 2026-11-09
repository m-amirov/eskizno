import type { Point, Shape } from './model';

export type ShapeHandle = 'nw' | 'ne' | 'sw' | 'se';

const clamp = (value: number) => Math.max(0, Math.min(1, value));
const rounded = (value: number) => Math.round(clamp(value) * 1_000_000) / 1_000_000;

export function shapeBounds(shape: Shape) {
  return {
    left: Math.min(shape.from.x, shape.to.x),
    right: Math.max(shape.from.x, shape.to.x),
    top: Math.min(shape.from.y, shape.to.y),
    bottom: Math.max(shape.from.y, shape.to.y),
  };
}

/** Delta is normalized to the artboard, not viewport pixels. */
export function moveShape(shape: Shape, delta: Point): Shape {
  const bounds = shapeBounds(shape);
  const dx = Math.max(-bounds.left, Math.min(1 - bounds.right, delta.x));
  const dy = Math.max(-bounds.top, Math.min(1 - bounds.bottom, delta.y));
  return { ...shape,
    from: { x: rounded(shape.from.x + dx), y: rounded(shape.from.y + dy) },
    to: { x: rounded(shape.to.x + dx), y: rounded(shape.to.y + dy) },
  };
}

export function resizeShape(shape: Shape, handle: ShapeHandle, point: Point): Shape {
  if (shape.kind === 'line' || shape.kind === 'arrow') {
    if (handle === 'nw') return { ...shape, from: { x: rounded(point.x), y: rounded(point.y) } };
    if (handle === 'se') return { ...shape, to: { x: rounded(point.x), y: rounded(point.y) } };
    return shape;
  }
  const { left, right, top, bottom } = shapeBounds(shape);
  const x = rounded(point.x);
  const y = rounded(point.y);
  const minSpan = .001;
  const nextLeft = handle.includes('w') ? Math.min(x, right - minSpan) : left;
  const nextRight = handle.includes('e') ? Math.max(x, left + minSpan) : right;
  const nextTop = handle.includes('n') ? Math.min(y, bottom - minSpan) : top;
  const nextBottom = handle.includes('s') ? Math.max(y, top + minSpan) : bottom;
  return { ...shape,
    from: { x: rounded(nextLeft), y: rounded(nextTop) },
    to: { x: rounded(nextRight), y: rounded(nextBottom) },
  };
}

function nearestSegmentDistance(point: Point, a: Point, b: Point, width: number, height: number): number {
  const ax = a.x * width;
  const ay = a.y * height;
  const dx = (b.x - a.x) * width;
  const dy = (b.y - a.y) * height;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared ? Math.max(0, Math.min(1,
    ((point.x * width - ax) * dx + (point.y * height - ay) * dy) / lengthSquared)) : 0;
  return Math.hypot(point.x * width - ax - dx * t, point.y * height - ay - dy * t);
}

export function shapeCorners(shape: Shape): Record<ShapeHandle, Point> {
  const { left, right, top, bottom } = shapeBounds(shape);
  return {
    nw: { x: left, y: top },
    ne: { x: right, y: top },
    sw: { x: left, y: bottom },
    se: { x: right, y: bottom },
  };
}

export function shapeHandleAt(shape: Shape, point: Point, width: number, height: number, displayScale = 1): ShapeHandle | null {
  const scale = Math.max(.001, displayScale);
  if (shape.kind === 'line' || shape.kind === 'arrow') {
    if (Math.hypot((shape.from.x - point.x) * width, (shape.from.y - point.y) * height) * scale <= 9) return 'nw';
    if (Math.hypot((shape.to.x - point.x) * width, (shape.to.y - point.y) * height) * scale <= 9) return 'se';
    return null;
  }
  const corners = shapeCorners(shape);
  for (const key of ['nw', 'ne', 'sw', 'se'] as const) {
    const target = corners[key];
    if (Math.hypot((target.x - point.x) * width, (target.y - point.y) * height) * scale <= 9) return key;
  }
  return null;
}

export function hitTestShape(shape: Shape, point: Point, width: number, height: number, displayScale = 1): boolean {
  const { left, right, top, bottom } = shapeBounds(shape);
  const tolerance = shape.width / 2 + 6 / Math.max(.001, displayScale);
  const marginX = tolerance / width;
  const marginY = tolerance / height;
  if (point.x < left - marginX || point.x > right + marginX
    || point.y < top - marginY || point.y > bottom + marginY) return false;

  const filled = shape.style !== 'outline' && shape.kind !== 'line' && shape.kind !== 'arrow';
  const nearLine = (a: Point, b: Point) => nearestSegmentDistance(point, a, b, width, height)
    <= tolerance;
  if (shape.kind === 'line' || shape.kind === 'arrow') return nearLine(shape.from, shape.to);
  const { nw, ne, sw, se } = shapeCorners(shape);
  if (shape.kind === 'rectangle') {
    if (filled && point.x >= left && point.x <= right && point.y >= top && point.y <= bottom) return true;
    return nearLine(nw, ne) || nearLine(ne, se) || nearLine(se, sw) || nearLine(sw, nw);
  }
  if (shape.kind === 'triangle') {
    const topPoint = { x: (left + right) / 2, y: top };
    const a = topPoint, b = sw, c = se;
    const denominator = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
    if (filled && Math.abs(denominator) > 1e-9) {
      const u = ((b.y - c.y) * (point.x - c.x) + (c.x - b.x) * (point.y - c.y)) / denominator;
      const v = ((c.y - a.y) * (point.x - c.x) + (a.x - c.x) * (point.y - c.y)) / denominator;
      if (u >= 0 && v >= 0 && u + v <= 1) return true;
    }
    return nearLine(a, b) || nearLine(b, c) || nearLine(c, a);
  }
  const rx = (right - left) / 2;
  const ry = (bottom - top) / 2;
  if (!rx || !ry) return false;
  const nx = (point.x - (left + right) / 2) / rx;
  const ny = (point.y - (top + bottom) / 2) / ry;
  const radius = Math.sqrt(nx * nx + ny * ny);
  if (filled && radius <= 1) return true;
  const rim = tolerance / Math.min(rx * width, ry * height);
  return Math.abs(radius - 1) <= rim;
}
