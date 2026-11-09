import type { BrushId, Point, Stroke } from './model';

type Context = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type PixelPoint = { x: number; y: number };

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
