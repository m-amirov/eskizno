import type { DrawingProject } from './model';
import { parseHexColor } from './color';

/** MRU is local editor state; stroke colors are rebuilt from the current visible drawing after Undo/Delete/Clear. */
export function recentAndCanvasColors(recent: readonly string[], project: DrawingProject, current: string, limit = 8): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  const add = (raw: string) => {
    const color = parseHexColor(raw);
    if (!color || seen.has(color) || result.length >= limit) return;
    result.push(color);
    seen.add(color);
  };
  recent.forEach(add);
  for (const layer of [...project.layers].reverse()) {
    if (layer.kind !== 'paint' || !layer.visible) continue;
    for (const stroke of [...layer.strokes].reverse()) {
      if (stroke.kind === 'ink') add(stroke.color);
    }
  }
  if (!result.length) add(current);
  return result;
}
