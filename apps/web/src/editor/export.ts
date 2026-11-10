import type { DrawingProject } from './model';
import { renderProject, type RenderOptions } from './render';

export interface ExportPngOptions {
  includeReferences: boolean;
  /** Optional canvas adapters make PNG encoding testable without a browser window. */
  createCanvas?: (width: number, height: number) => HTMLCanvasElement;
  createSurface?: RenderOptions['createSurface'];
}

/** Encodes the project at its intrinsic resolution, without zoom, pan or editor overlays. */
export function exportPng(
  project: DrawingProject,
  assets: ReadonlyMap<string, CanvasImageSource>,
  options: ExportPngOptions,
): Promise<Blob> {
  const canvas = options.createCanvas?.(project.width, project.height) ?? document.createElement('canvas');
  canvas.width = project.width;
  canvas.height = project.height;
  const context = canvas.getContext('2d');
  if (!context) return Promise.reject(new Error('Canvas2D недоступен для экспорта'));
  renderProject(context, project, assets, {
    zoom: 1, panX: 0, panY: 0, includeReferences: options.includeReferences,
    ...(options.createSurface && { createSurface: options.createSurface }),
  });
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => {
    if (blob) resolve(blob);
    else reject(new Error('Не удалось закодировать PNG'));
  }, 'image/png'));
}
