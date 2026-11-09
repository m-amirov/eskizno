import { describe, expect, it } from 'vitest';

import { applyAction, createProject } from './model';
import { recentAndCanvasColors } from './paletteHistory';

const stroke = (id: string, color: string, kind: 'ink' | 'erase' = 'ink') => ({
  id, kind, color, width: 4, opacity: 1, brushId: 'pencil' as const, points: [{ x: .2, y: .3 }],
});

describe('недавние цвета и оттенки рисунка', () => {
  it('сначала возвращает MRU без дубликатов, затем цвета видимых штрихов, не берёт ластик', () => {
    const initial = createProject();
    const first = initial.activeLayerId;
    const one = applyAction(initial, { type: 'addStroke', layerId: first, stroke: stroke('a', '#ff0000') });
    const two = applyAction(one, { type: 'addStroke', layerId: first, stroke: stroke('b', '#0088ff') });
    const three = applyAction(two, { type: 'addStroke', layerId: first, stroke: stroke('erase', '#123456', 'erase') });
    const selected = ['#112233', '#0088FF', '#112233'];
    expect(recentAndCanvasColors(selected, three, '#ffffff')).toEqual(['#112233', '#0088ff', '#ff0000']);
    const hidden = applyAction(three, { type: 'setLayerVisibility', layerId: first, visible: false });
    expect(recentAndCanvasColors([], hidden, '#123456')).toEqual(['#123456']);
  });

  it('оставляет не больше 8 различных оттенков и не показывает удалённые штрихи без MRU', () => {
    const initial = createProject();
    const many = Array.from({ length: 12 }, (_, i) => `#${i.toString(16).padStart(6, '0')}`);
    expect(recentAndCanvasColors(many, initial, '#ffffff')).toEqual(many.slice(0, 8));
    const added = applyAction(initial, { type: 'addStroke', layerId: initial.activeLayerId, stroke: stroke('a', '#abcdef') });
    expect(recentAndCanvasColors([], added, '#ffffff')).toEqual(['#abcdef']);
    const cleared = applyAction(added, { type: 'clearDrawing' });
    expect(recentAndCanvasColors([], cleared, '#ffffff')).toEqual(['#ffffff']);
  });
});
