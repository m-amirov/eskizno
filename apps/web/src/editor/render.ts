import { getPaintOperations, type BucketFill, type DrawingProject, type PaintLayer, type ReferenceLayer, type Shape, type Stroke } from './model';
import { paintBrushStroke } from './brushes';
import { shapeBounds, shapeCorners } from './shapeGeometry';

type Surface = HTMLCanvasElement | OffscreenCanvas;
type SurfaceContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface RenderOptions {
  zoom: number;
  panX: number;
  panY: number;
  includeReferences: boolean;
  /** Supplies real Canvas2D surfaces in pixel tests and browser surfaces at runtime. */
  createSurface?: (width: number, height: number) => Surface;
  /** Cached rasters are keyed by immutable layer objects and survive preview frames. */
  paintCache?: WeakMap<PaintLayer, Surface>;
  /** An uncommitted stroke is composited onto a disposable copy of its layer. */
  preview?: { layerId: string; stroke: Stroke };
  /** Draft geometry is replayed in place of the original shape, or at end for new shapes. */
  previewShape?: { layerId: string; shape: Shape; existing?: boolean };
  /** Reuses the unmodified prefix before the actively edited shape. */
  shapePrefixCache?: WeakMap<PaintLayer, { shapeId: string; surface: Surface }>;
  selection?: { layerId: string; shapeId: string };
}

function defaultSurface(width: number, height: number): Surface {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  if (typeof document === 'undefined') throw new Error('Canvas2D недоступен');
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function surfaceContext(surface: Surface): SurfaceContext {
  const context = surface.getContext('2d');
  if (!context || !('stroke' in context)) throw new Error('Не удалось получить Canvas2D');
  return context as SurfaceContext;
}

function paintStroke(
  context: SurfaceContext,
  stroke: Stroke,
  width: number,
  height: number,
): void {
  if (!stroke.points.length) return;
  if (stroke.kind === 'ink') {
    paintBrushStroke(context, stroke, width, height);
    return;
  }
  context.save();
  context.globalCompositeOperation = 'destination-out';
  context.globalAlpha = 1;
  context.strokeStyle = '#000000';
  context.fillStyle = context.strokeStyle;
  context.lineWidth = stroke.width;
  context.lineCap = 'round';
  context.lineJoin = 'round';

  const [first, ...rest] = stroke.points;
  if (rest.length === 0) {
    context.beginPath();
    context.arc(first.x * width, first.y * height, stroke.width / 2, 0, Math.PI * 2);
    context.fill();
  } else {
    context.beginPath();
    context.moveTo(first.x * width, first.y * height);
    for (const point of rest) context.lineTo(point.x * width, point.y * height);
    context.stroke();
  }
  context.restore();
}

function paintShape(context: SurfaceContext, shape: Shape, width: number, height: number): void {
  const bounds = shapeBounds(shape);
  const left = bounds.left * width;
  const right = bounds.right * width;
  const top = bounds.top * height;
  const bottom = bounds.bottom * height;
  context.save();
  context.globalAlpha = shape.opacity;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.lineWidth = shape.width;
  context.fillStyle = shape.color;
  context.strokeStyle = shape.color;
  context.beginPath();
  switch (shape.kind) {
    case 'rectangle':
      context.rect(left, top, right - left, bottom - top);
      break;
    case 'ellipse':
      context.ellipse((left + right) / 2, (top + bottom) / 2,
        Math.max(.001, (right - left) / 2), Math.max(.001, (bottom - top) / 2),
        0, 0, Math.PI * 2);
      break;
    case 'triangle':
      context.moveTo((left + right) / 2, top);
      context.lineTo(left, bottom);
      context.lineTo(right, bottom);
      context.closePath();
      break;
    case 'line':
    case 'arrow': {
      const ax = shape.from.x * width, ay = shape.from.y * height;
      const bx = shape.to.x * width, by = shape.to.y * height;
      context.moveTo(ax, ay);
      context.lineTo(bx, by);
      if (shape.kind === 'arrow' && Math.hypot(bx - ax, by - ay) > 2) {
        const angle = Math.atan2(by - ay, bx - ax);
        const length = Math.max(10, shape.width * 3);
        context.moveTo(bx - length * Math.cos(angle - Math.PI / 6),
          by - length * Math.sin(angle - Math.PI / 6));
        context.lineTo(bx, by);
        context.lineTo(bx - length * Math.cos(angle + Math.PI / 6),
          by - length * Math.sin(angle + Math.PI / 6));
      }
      break;
    }
  }
  if (shape.kind !== 'line' && shape.kind !== 'arrow' && shape.style !== 'outline') context.fill();
  if (shape.style !== 'fill' || shape.kind === 'line' || shape.kind === 'arrow') context.stroke();
  context.restore();
}

/** Exact RGBA flood fill on the current layer; queue and visited bounded by pixel count. */
function paintBucketFill(context: SurfaceContext, fill: BucketFill, width: number, height: number): void {
  const image = context.getImageData(0, 0, width, height);
  const data = image.data;
  const pixelCount = width * height;
  const startX = Math.max(0, Math.min(width - 1, Math.floor(fill.point.x * width)));
  const startY = Math.max(0, Math.min(height - 1, Math.floor(fill.point.y * height)));
  const seed = startY * width + startX;
  const offset = seed * 4;
  const old = [data[offset], data[offset + 1], data[offset + 2], data[offset + 3]];
  const next = [
    parseInt(fill.color.slice(1, 3), 16),
    parseInt(fill.color.slice(3, 5), 16),
    parseInt(fill.color.slice(5, 7), 16),
    255,
  ];
  if (old.every((channel, index) => channel === next[index])) return;
  const queue = new Int32Array(pixelCount);
  const visited = new Uint8Array(pixelCount);
  let head = 0, tail = 1;
  queue[0] = seed;
  visited[seed] = 1;
  const enqueue = (index: number) => {
    if (visited[index]) return;
    visited[index] = 1;
    const i = index * 4;
    if (data[i] === old[0] && data[i + 1] === old[1]
      && data[i + 2] === old[2] && data[i + 3] === old[3]) queue[tail++] = index;
  };
  while (head < tail) {
    const index = queue[head++];
    const i = index * 4;
    data[i] = next[0];
    data[i + 1] = next[1];
    data[i + 2] = next[2];
    data[i + 3] = next[3];
    const x = index % width;
    if (x > 0) enqueue(index - 1);
    if (x < width - 1) enqueue(index + 1);
    if (index >= width) enqueue(index - width);
    if (index + width < pixelCount) enqueue(index + width);
  }
  context.putImageData(image, 0, 0);
}

function paintLayerContents(
  context: SurfaceContext, layer: PaintLayer, width: number, height: number, start = 0, end?: number,
): void {
  const strokes = new Map(layer.strokes.map((stroke) => [stroke.id, stroke]));
  const operations = getPaintOperations(layer);
  for (let index = start; index < (end ?? operations.length); index += 1) {
    const operation = operations[index];
    if (operation.type === 'stroke') {
      const stroke = strokes.get(operation.strokeId);
      if (stroke) paintStroke(context, stroke, width, height);
    } else if (operation.type === 'fill') {
      paintBucketFill(context, operation.fill, width, height);
    } else {
      paintShape(context, operation.shape, width, height);
    }
  }
}

function paintSelection(
  context: CanvasRenderingContext2D, shape: Shape, displayScale: number, width: number, height: number,
): void {
  const { left, right, top, bottom } = shapeBounds(shape);
  context.save();
  const safeZoom = Math.max(.001, displayScale);
  context.strokeStyle = '#17734c';
  context.lineWidth = 1.5 / safeZoom;
  context.setLineDash([5 / safeZoom, 4 / safeZoom]);
  context.strokeRect(left * width, top * height, (right - left) * width, (bottom - top) * height);
  context.setLineDash([]);
  const handles = shape.kind === 'line' || shape.kind === 'arrow'
    ? [shape.from, shape.to] : Object.values(shapeCorners(shape));
  for (const point of handles) {
    const h = 8 / safeZoom;
    context.fillStyle = '#FFFFFF';
    context.fillRect(point.x * width - h / 2, point.y * height - h / 2, h, h);
    context.strokeRect(point.x * width - h / 2, point.y * height - h / 2, h, h);
  }
  context.restore();
}

function paintReference(
  context: CanvasRenderingContext2D,
  layer: ReferenceLayer,
  asset: CanvasImageSource,
  project: DrawingProject,
): void {
  const size = asset as { width?: number; height?: number; naturalWidth?: number; naturalHeight?: number };
  const sourceWidth = size.naturalWidth || size.width || 0;
  const sourceHeight = size.naturalHeight || size.height || 0;
  if (!Number.isFinite(sourceWidth) || !Number.isFinite(sourceHeight)
    || sourceWidth <= 0 || sourceHeight <= 0) return;
  const fit = Math.min(project.width / sourceWidth, project.height / sourceHeight);
  const transform = layer.transform;
  const width = sourceWidth * fit * transform.scale;
  const height = sourceHeight * fit * transform.scale;

  context.save();
  context.globalAlpha = layer.opacity;
  context.translate(
    project.width / 2 + transform.x * project.width,
    project.height / 2 + transform.y * project.height,
  );
  context.rotate(transform.rotation);
  context.drawImage(asset, -width / 2, -height / 2, width, height);
  context.restore();
}

/** Composites bottom-to-top, rendering every paint layer on its own transparent surface. */
export function renderProject(
  context: CanvasRenderingContext2D,
  project: DrawingProject,
  assets: ReadonlyMap<string, CanvasImageSource>,
  options: RenderOptions,
): void {
  const canvas = context.canvas;
  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.translate(
    project.width * (0.5 + options.panX),
    project.height * (0.5 + options.panY),
  );
  context.scale(options.zoom, options.zoom);
  context.translate(-project.width / 2, -project.height / 2);

  const createSurface = options.createSurface || defaultSurface;
  for (const layer of project.layers) {
    if (!layer.visible || layer.opacity <= 0) continue;
    if (layer.kind === 'reference') {
      if (!options.includeReferences || layer.placement === 'side') continue;
      const asset = assets.get(layer.assetId);
      if (asset) paintReference(context, layer, asset, project);
      continue;
    }

    let surface = options.paintCache?.get(layer);
    if (!surface) {
      surface = createSurface(project.width, project.height);
      const paintContext = surfaceContext(surface);
      paintLayerContents(paintContext, layer, project.width, project.height);
      options.paintCache?.set(layer, surface);
    }

    if (options.preview?.layerId === layer.id || options.previewShape?.layerId === layer.id) {
      const previewSurface = createSurface(project.width, project.height);
      const previewContext = surfaceContext(previewSurface);
      if (options.previewShape?.layerId === layer.id) {
        const draft = options.previewShape;
        const index = getPaintOperations(layer).findIndex((op) =>
          op.type === 'shape' && op.shape.id === draft.shape.id);
        if (index < 0) {
          previewContext.drawImage(surface, 0, 0);
          // A removed shape must never reappear via a stale edit gesture.
          if (!draft.existing) paintShape(previewContext, draft.shape, project.width, project.height);
        } else {
          let prefix = options.shapePrefixCache?.get(layer);
          if (!prefix || prefix.shapeId !== draft.shape.id) {
            const prefixSurface = createSurface(project.width, project.height);
            paintLayerContents(surfaceContext(prefixSurface), layer, project.width, project.height, 0, index);
            prefix = { shapeId: draft.shape.id, surface: prefixSurface };
            options.shapePrefixCache?.set(layer, prefix);
          }
          previewContext.drawImage(prefix.surface, 0, 0);
          paintShape(previewContext, draft.shape, project.width, project.height);
          paintLayerContents(previewContext, layer, project.width, project.height, index + 1);
        }
      } else {
        previewContext.drawImage(surface, 0, 0);
      }
      if (options.preview?.layerId === layer.id) {
        paintStroke(previewContext, options.preview.stroke, project.width, project.height);
      }
      surface = previewSurface;
    }

    context.save();
    context.globalAlpha = layer.opacity;
    context.drawImage(surface, 0, 0, project.width, project.height);
    context.restore();
  }
  // The edit overlay belongs to the viewport and must sit above even upper layers.
  const selectedLayer = project.layers.find((layer) => layer.id === options.selection?.layerId);
  if (selectedLayer?.kind === 'paint' && selectedLayer.visible) {
    const selected = getPaintOperations(selectedLayer).find((op) =>
      op.type === 'shape' && op.shape.id === options.selection?.shapeId);
    if (selected?.type === 'shape') {
      const cssWidth = 'getBoundingClientRect' in canvas
        ? (canvas as HTMLCanvasElement).getBoundingClientRect().width : 0;
      const cssScale = cssWidth > 0 ? cssWidth / project.width : 1;
      paintSelection(context, options.previewShape?.shape.id === selected.shape.id
        ? options.previewShape.shape : selected.shape, options.zoom * cssScale, project.width, project.height);
    }
  }
  context.restore();
}
