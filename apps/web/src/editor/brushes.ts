import type { BrushId, Point, Stroke, StrokePoint } from './model';

type Context = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type PixelPoint = { x: number; y: number };

export interface ToolSettings {
  brushSize: number;
  eraserSize: number;
  opacity: number;
}

/** The two tools retain distinct widths; opacity is stored as a unit interval. */
export function normalizeToolSettings(settings: ToolSettings): ToolSettings {
  const bounded = (value: number, minimum: number, maximum: number, fallback: number) =>
    Number.isFinite(value) ? Math.max(minimum, Math.min(maximum, value)) : fallback;
  return {
    brushSize: bounded(settings.brushSize, 1, 48, 8),
    eraserSize: bounded(settings.eraserSize, 1, 48, 8),
    opacity: bounded(settings.opacity, 0, 1, 1),
  };
}

export const BRUSH_PRESETS: ReadonlyArray<{
  id: BrushId;
  label: string;
  description: string;
}> = [
  { id: 'pencil', label: 'Карандаш', description: 'Тонкий графитовый след' },
  { id: 'liner', label: 'Линер', description: 'Чёткая плотная линия' },
  { id: 'marker', label: 'Маркер', description: 'Полупрозрачный широкий след' },
  { id: 'soft', label: 'Мягкая кисть', description: 'Плавные размытые края' },
  { id: 'watercolor', label: 'Акварель', description: 'Прозрачные слои цвета' },
  { id: 'charcoal', label: 'Уголь', description: 'Зернистый насыщенный штрих' },
  { id: 'dry', label: 'Сухая кисть', description: 'Прерывистые волокна' },
  { id: 'airbrush', label: 'Аэрограф', description: 'Мягкое распыление' },
  { id: 'calligraphy', label: 'Каллиграфия', description: 'Плоское наклонное перо' },
  { id: 'pastel', label: 'Пастель', description: 'Бархатистый зернистый цвет' },
];

const MAX_STAMPS = 2600;

type DynamicPoint = PixelPoint & { pressure: number; tiltX?: number; tiltY?: number };

export function hasDynamicBrush(stroke: Stroke): boolean {
  return stroke.kind === 'ink' && (stroke.brushId === 'pencil' || stroke.brushId === 'liner' || stroke.brushId === 'calligraphy')
    && !!stroke.dynamics && Number.isFinite(stroke.dynamics.pressureSize)
    && stroke.dynamics.pressureSize >= 0 && stroke.dynamics.pressureSize <= 1
    && typeof stroke.dynamics.tiltAngle === 'boolean';
}

export function dynamicBrushWidth(width: number, strength: number, pressure?: number): number {
  const p = Number.isFinite(pressure) ? Math.max(0, Math.min(1, pressure!)) : .5;
  return Math.max(.01, Math.min(width, 1e6) * (1 + strength * (p - .5)));
}

/** Arc-length interpolation without an auxiliary array proportional to pointer input. */
export function sampleDynamicStrokePoints(
  points: readonly StrokePoint[], width: number, height: number, spacing: number, maxSamples = MAX_STAMPS,
): DynamicPoint[] {
  const limit = Number.isFinite(maxSamples) ? Math.min(MAX_STAMPS, Math.floor(maxSamples)) : MAX_STAMPS;
  if (limit < 1 || !Number.isFinite(width) || !Number.isFinite(height)) return [];
  const convert = (point: StrokePoint): DynamicPoint | undefined => {
    const rawX = point.x * width; const rawY = point.y * height;
    if (!Number.isFinite(rawX) || !Number.isFinite(rawY)) return undefined;
    const x = Math.max(-1e7, Math.min(1e7, rawX)); const y = Math.max(-1e7, Math.min(1e7, rawY));
    const pressure = Number.isFinite(point.pressure) ? Math.max(0, Math.min(1, point.pressure!)) : .5;
    const tilt = (v: number | undefined) => Number.isFinite(v) ? Math.max(-90, Math.min(90, v!)) : undefined;
    const tiltX = tilt(point.tiltX); const tiltY = tilt(point.tiltY);
    return { x, y, pressure, ...(tiltX === undefined ? {} : { tiltX }), ...(tiltY === undefined ? {} : { tiltY }) };
  };
  let first: DynamicPoint | undefined; let previous: DynamicPoint | undefined; let length = 0;
  for (const point of points) {
    const next = convert(point); if (!next) continue;
    first ??= next;
    if (previous) length += Math.hypot(next.x - previous.x, next.y - previous.y);
    previous = next;
  }
  if (!first || !previous || !Number.isFinite(length)) return [];
  if (length === 0) return [previous];
  if (limit === 1) return [first];
  const step = Math.max(.25, Number.isFinite(spacing) ? spacing : .25, length / (limit - 1));
  const sampled: DynamicPoint[] = [first];
  let target = step; let travelled = 0; let from: DynamicPoint | undefined;
  for (const point of points) {
    const to = convert(point); if (!to) continue;
    if (!from) { from = to; continue; }
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    while (distance > 0 && target < length && target <= travelled + distance && sampled.length < limit - 1) {
      const t = (target - travelled) / distance;
      const mix = (a: number, b: number) => a + (b - a) * t;
      const tiltX = from.tiltX !== undefined && to.tiltX !== undefined ? mix(from.tiltX, to.tiltX) : undefined;
      const tiltY = from.tiltY !== undefined && to.tiltY !== undefined ? mix(from.tiltY, to.tiltY) : undefined;
      sampled.push({ x: mix(from.x, to.x), y: mix(from.y, to.y), pressure: mix(from.pressure, to.pressure),
        ...(tiltX === undefined ? {} : { tiltX }), ...(tiltY === undefined ? {} : { tiltY }) });
      target += step;
    }
    travelled += distance; from = to;
  }
  sampled.push(previous);
  return sampled;
}

export function calligraphyAngle(tiltX?: number, tiltY?: number): number {
  if (!Number.isFinite(tiltX) || !Number.isFinite(tiltY) || (tiltX === 0 && tiltY === 0)) return -Math.PI / 4;
  return Math.atan2(tiltY!, tiltX!);
}

function paintDynamicStroke(ctx: Context, stroke: Stroke, width: number, height: number): void {
  if (!Number.isFinite(stroke.width) || stroke.width <= 0 || !Number.isFinite(stroke.opacity)) return;
  const w = Math.min(stroke.width, 1e6);
  const samples = sampleDynamicStrokePoints(stroke.points, width, height, Math.max(.5, w * .085));
  if (!samples.length) return;
  const strength = stroke.dynamics!.pressureSize;
  const size = (p: number) => dynamicBrushWidth(w, strength, p);
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  // Fill each layer once: overlapping interpolated dabs must not compound opacity.
  const layer = (scale: number, minimum: number, alpha: number) => {
    ctx.globalAlpha = alpha; ctx.fillStyle = stroke.color; ctx.beginPath();
    for (let i = 0; i < samples.length; i += 1) {
      const p = samples[i]; const radius = Math.max(minimum, size(p.pressure) * scale) / 2;
      ctx.moveTo(p.x + radius, p.y); ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      if (!i) continue;
      const a = samples[i - 1]; const dx = p.x - a.x; const dy = p.y - a.y; const d = Math.hypot(dx, dy);
      if (!d) continue;
      const nx = -dy / d; const ny = dx / d;
      const r = Math.max(minimum, size(a.pressure) * scale) / 2;
      ctx.moveTo(a.x - nx * r, a.y - ny * r);
      ctx.lineTo(p.x - nx * radius, p.y - ny * radius);
      ctx.lineTo(p.x + nx * radius, p.y + ny * radius);
      ctx.lineTo(a.x + nx * r, a.y + ny * r); ctx.closePath();
    }
    ctx.fill();
  };
  if (stroke.brushId === 'calligraphy') {
    // A continuous core prevents gaps when the sampling cap is reached.
    layer(.24, .8, stroke.opacity * .86);
    for (let i = 0; i < samples.length; i += 1) {
      const p = samples[i];
      ctx.globalAlpha = stroke.opacity; ctx.fillStyle = stroke.color; ctx.beginPath();
      ctx.ellipse(p.x, p.y, Math.max(.35, size(p.pressure) * .53), Math.max(.24, size(p.pressure) * .11),
        stroke.dynamics!.tiltAngle ? calligraphyAngle(p.tiltX, p.tiltY) : -Math.PI / 4, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    if (stroke.brushId === 'pencil') {
      layer(.4, .7, stroke.opacity * .64); layer(.16, .4, stroke.opacity * .35);
    } else layer(1, .35, stroke.opacity);
  }
  ctx.restore();
}

/** Bounded arc-length sampling; its limit prevents dense pointer data from exploding brush work. */
export function sampleStrokePoints(
  points: readonly Point[], width: number, height: number, spacing: number,
  maxSamples = MAX_STAMPS,
): PixelPoint[] {
  if (!points.length || maxSamples < 1) return [];
  const pixels = points.map((point) => ({ x: point.x * width, y: point.y * height }));
  if (pixels.length === 1 || maxSamples === 1) return [pixels[0]];
  const distances: number[] = [];
  let length = 0;
  for (let i = 1; i < pixels.length; i += 1) {
    const dist = Math.hypot(pixels[i].x - pixels[i - 1].x, pixels[i].y - pixels[i - 1].y);
    distances.push(dist);
    length += dist;
  }
  if (length === 0) return [pixels[0]];

  // Keep the sampling grid anchored to stroke start. For normal-length strokes
  // extending the path must not shift earlier stamps and their seeded grain.
  const step = Math.max(0.25, spacing, length / (maxSamples - 1));
  const sampled: PixelPoint[] = [];
  let segment = 0;
  let travelled = 0;
  for (let i = 0; i < maxSamples - 1 && i * step < length; i += 1) {
    const target = i * step;
    while (segment < distances.length - 1 && travelled + distances[segment] < target) {
      travelled += distances[segment];
      segment += 1;
    }
    const amount = distances[segment] > 0
      ? Math.max(0, Math.min(1, (target - travelled) / distances[segment])) : 0;
    sampled.push({
      x: pixels[segment].x + (pixels[segment + 1].x - pixels[segment].x) * amount,
      y: pixels[segment].y + (pixels[segment + 1].y - pixels[segment].y) * amount,
    });
  }
  sampled.push(pixels[pixels.length - 1]);
  return sampled;
}

function path(ctx: Context, points: readonly PixelPoint[]) {
  const [first] = points;
  ctx.beginPath();
  ctx.moveTo(first.x, first.y);
  if (points.length === 1) ctx.lineTo(first.x + 0.001, first.y);
  else for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i].x, points[i].y);
}

function line(ctx: Context, points: readonly PixelPoint[], color: string, width: number, alpha: number) {
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(0.35, width);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  path(ctx, points);
  ctx.stroke();
}

function dot(ctx: Context, x: number, y: number, radius: number, color: string, alpha: number) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0.15, radius), 0, Math.PI * 2);
  ctx.fill();
}

function seedFromId(id: string): number {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i += 1) {
    hash = Math.imul(hash ^ id.charCodeAt(i), 16777619);
  }
  return hash >>> 0;
}

function noise(seed: number, index: number): number {
  let value = (seed + Math.imul(index + 1, 0x9e3779b1)) | 0;
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

function normal(points: readonly PixelPoint[], index: number): PixelPoint {
  const before = points[Math.max(0, index - 1)];
  const after = points[Math.min(points.length - 1, index + 1)];
  const dx = after.x - before.x;
  const dy = after.y - before.y;
  const length = Math.hypot(dx, dy);
  return length === 0 ? { x: 0, y: 1 } : { x: -dy / length, y: dx / length };
}

function radialStamp(ctx: Context, x: number, y: number, radius: number, color: string, alpha: number) {
  const rgb = [1, 3, 5].map((offset) => parseInt(color.slice(offset, offset + 2), 16));
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`);
  gradient.addColorStop(0.5, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha * .42})`);
  gradient.addColorStop(1, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`);
  ctx.globalAlpha = 1;
  ctx.fillStyle = gradient;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

/** One deterministic raster implementation for both in-progress preview and final strokes. */
export function paintBrushStroke(ctx: Context, stroke: Stroke, canvasWidth: number, canvasHeight: number): void {
  if (!stroke.points.length || stroke.kind !== 'ink') return;
  if (hasDynamicBrush(stroke)) {
    paintDynamicStroke(ctx, stroke, canvasWidth, canvasHeight);
    return;
  }
  const points = stroke.points.map((point) => ({ x: point.x * canvasWidth, y: point.y * canvasHeight }));
  const w = stroke.width;
  const color = stroke.color;
  const alpha = stroke.opacity;
  const seed = seedFromId(stroke.id);
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  switch (stroke.brushId) {
    case 'pencil': {
      line(ctx, points, color, Math.max(.7, w * .4), alpha * .64);
      line(ctx, points, color, Math.max(.4, w * .16), alpha * .35);
      break;
    }
    case 'liner':
      line(ctx, points, color, w, alpha);
      break;
    case 'marker':
      line(ctx, points, color, w * 1.25, alpha * .49);
      break;
    case 'soft': {
      line(ctx, points, color, w * 1.75, alpha * .08);
      line(ctx, points, color, w * 1.3, alpha * .12);
      line(ctx, points, color, w * .75, alpha * .23);
      line(ctx, points, color, w * .3, alpha * .24);
      break;
    }
    case 'watercolor': {
      line(ctx, points, color, w * 1.4, alpha * .14);
      ctx.save();
      ctx.translate(w * .08, -w * .12);
      line(ctx, points, color, w, alpha * .19);
      ctx.restore();
      ctx.save();
      ctx.translate(-w * .12, w * .06);
      line(ctx, points, color, w * .85, alpha * .18);
      ctx.restore();
      line(ctx, points, color, w * .36, alpha * .18);
      break;
    }
    case 'charcoal': {
      line(ctx, points, color, w * .58, alpha * .67);
      const samples = sampleStrokePoints(stroke.points, canvasWidth, canvasHeight, Math.max(.6, w * .14));
      for (let i = 0; i < samples.length; i += 1) {
        const n = normal(samples, i);
        const spread = (noise(seed, i * 3) - .5) * w * 1.1;
        dot(ctx, samples[i].x + n.x * spread, samples[i].y + n.y * spread,
          w * (.045 + noise(seed, i * 3 + 1) * .12), color, alpha * (.15 + noise(seed, i * 3 + 2) * .55));
      }
      break;
    }
    case 'dry': {
      line(ctx, points, color, w * .21, alpha * .55);
      const samples = sampleStrokePoints(stroke.points, canvasWidth, canvasHeight, Math.max(.75, w * .14));
      for (let i = 0; i < samples.length; i += 1) {
        for (let strand = 0; strand < 4; strand += 1) {
          if (noise(seed, i * 17 + strand) < .38) continue;
          const n = normal(samples, i);
          const offset = (strand - 1.5) * w * .23;
          dot(ctx, samples[i].x + n.x * offset, samples[i].y + n.y * offset,
            w * .042, color, alpha * .69);
        }
      }
      break;
    }
    case 'airbrush': {
      // Keep a faint continuous core even when long paths hit the stamp cap.
      line(ctx, points, color, Math.max(.8, w * .32), alpha * .08);
      const samples = sampleStrokePoints(stroke.points, canvasWidth, canvasHeight, Math.max(.7, w * .28));
      for (const point of samples) radialStamp(ctx, point.x, point.y, Math.max(1, w * .85), color, alpha * .115);
      break;
    }
    case 'calligraphy': {
      line(ctx, points, color, Math.max(.8, w * .24), alpha * .86);
      const samples = sampleStrokePoints(stroke.points, canvasWidth, canvasHeight, Math.max(.5, w * .085));
      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      for (const point of samples) {
        ctx.beginPath();
        ctx.ellipse(point.x, point.y, Math.max(.35, w * .53), Math.max(.24, w * .11), -Math.PI / 4, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'pastel': {
      line(ctx, points, color, w * .83, alpha * .22);
      const samples = sampleStrokePoints(stroke.points, canvasWidth, canvasHeight, Math.max(.6, w * .11));
      for (let i = 0; i < samples.length; i += 1) {
        const n = normal(samples, i);
        for (let layer = 0; layer < 3; layer += 1) {
          const offset = (noise(seed, i * 13 + layer * 3) - .5) * w * 1.05;
          dot(ctx, samples[i].x + n.x * offset, samples[i].y + n.y * offset,
            w * (.075 + noise(seed, i * 13 + layer * 3 + 1) * .07),
            color, alpha * (.15 + noise(seed, i * 13 + layer * 3 + 2) * .35));
        }
      }
      break;
    }
    default:
      line(ctx, points, color, w, alpha);
  }
  ctx.restore();
}
