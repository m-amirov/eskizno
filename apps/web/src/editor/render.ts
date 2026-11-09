import type { DrawingProject, PaintLayer, ReferenceLayer, Stroke } from './model';
import { paintBrushStroke } from './brushes';

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
      for (const stroke of layer.strokes) {
        paintStroke(paintContext, stroke, project.width, project.height);
      }
      options.paintCache?.set(layer, surface);
    }

    if (options.preview?.layerId === layer.id) {
      const previewSurface = createSurface(project.width, project.height);
      const previewContext = surfaceContext(previewSurface);
      previewContext.drawImage(surface, 0, 0);
      paintStroke(previewContext, options.preview.stroke, project.width, project.height);
      surface = previewSurface;
    }

    context.save();
    context.globalAlpha = layer.opacity;
    context.drawImage(surface, 0, 0, project.width, project.height);
    context.restore();
  }
  context.restore();
}
