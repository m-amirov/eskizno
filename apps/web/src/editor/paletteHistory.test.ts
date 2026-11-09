import { describe, expect, it } from 'vitest';

import { applyAction, createProject } from './model';
import { recentAndCanvasColors } from './paletteHistory';

const stroke = (id: string, color: string, kind: 'ink' | 'erase' = 'ink') => ({
  id, kind, color, width: 4, opacity: 1, brushId: 'pencil' as const, points: [{ x: .2, y: .3 }],
});

describe('недавние цвета и оттенки рисунка', () => {
  it('сортирует цвета фигур, заливок и штрихов по реальному порядку рисования', () => {
    const base = createProject();
    const id = base.activeLayerId;
    const ink = applyAction(base, { type: 'addStroke', layerId: id, stroke: stroke('ink', '#110000') });
    const fill = applyAction(ink, { type: 'addFill', layerId: id,
      fill: { id: 'bucket', point: { x: .5, y: .5 }, color: '#220000' } });
    const shaped = applyAction(fill, { type: 'addShape', layerId: id,
      shape: { id: 'shape', kind: 'rectangle', from: { x: .2, y: .2 }, to: { x: .4, y: .4 },
        color: '#330000', width: 3, style: 'both', opacity: 1 } });
    const laterInk = applyAction(shaped, { type: 'addStroke', layerId: id, stroke: stroke('later', '#440000') });
    expect(recentAndCanvasColors([], laterInk, '#ffffff')).toEqual(['#440000', '#330000', '#220000', '#110000']);
  });
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
