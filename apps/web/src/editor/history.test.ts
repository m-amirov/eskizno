import { describe, expect, it } from 'vitest';

import { createProject, type Stroke } from './model';
import { commitAction, createProjectHistory, redoAction, undoAction } from './history';

const stroke: Stroke = {
  id: 'stroke-1',
  kind: 'ink',
  brushId: 'liner',
  color: '#203040',
  width: 4,
  opacity: 1,
  points: [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.5 }],
};

describe('история редактора', () => {
  it('возвращает нанесённый штрих через undo и redo', () => {
    const initial = createProjectHistory(createProject({}));
    const painted = commitAction(initial, {
      type: 'addStroke', layerId: initial.present.activeLayerId, stroke,
    });

    expect(painted.present.layers[0]).toMatchObject({ strokes: [stroke] });
    const undone = undoAction(painted);
    expect(undone.present.layers[0]).toMatchObject({ strokes: [] });
    expect(redoAction(undone).present.layers[0]).toMatchObject({ strokes: [stroke] });
    expect(initial.present.layers[0]).toMatchObject({ strokes: [] });
  });

  it('восстанавливает рисунок после очистки всех штрихов', () => {
    const initial = createProjectHistory(createProject());
    const painted = commitAction(initial, { type: 'addStroke', layerId: initial.present.activeLayerId, stroke });
    const cleared = commitAction(painted, { type: 'clearDrawing' });
    expect(cleared.present.layers[0]).toMatchObject({ strokes: [] });
    expect(undoAction(cleared).present.layers[0]).toMatchObject({ strokes: [stroke] });
    expect(redoAction(undoAction(cleared)).present.layers[0]).toMatchObject({ strokes: [] });
  });

  it('восстанавливает слои и настройки, а не только штрихи', () => {
    const initial = createProjectHistory(createProject({}));
    const added = commitAction(initial, {
      type: 'addLayer',
      layer: { id: 'second', kind: 'paint', name: 'Чистовой', strokes: [], visible: true, locked: false, opacity: 1 },
    });
    const dimmed = commitAction(added, { type: 'setLayerOpacity', layerId: 'second', opacity: 0.4 });
    const recolored = commitAction(dimmed, { type: 'setPalette', palette: ['#ABCDEF'] });

    expect(recolored.present.palette).toEqual(['#ABCDEF']);
    const undoPalette = undoAction(recolored);
    expect(undoPalette.present.palette).toEqual(initial.present.palette);
    expect(undoPalette.present.layers[1].opacity).toBe(0.4);
    const undoOpacity = undoAction(undoPalette);
    expect(undoOpacity.present.layers[1].opacity).toBe(1);
    const undoLayer = undoAction(undoOpacity);
    expect(undoLayer.present.layers).toHaveLength(1);
    expect(redoAction(undoLayer).present.layers).toHaveLength(2);
  });

  it('новое принятое действие после undo сбрасывает redo', () => {
    const initial = createProjectHistory(createProject({}));
    const first = commitAction(initial, {
      type: 'renameLayer', layerId: initial.present.activeLayerId, name: 'Набросок',
    });
    const second = commitAction(first, {
      type: 'renameLayer', layerId: initial.present.activeLayerId, name: 'Контур',
    });
    const undone = undoAction(second);
    const branched = commitAction(undone, {
      type: 'setPalette', palette: ['#123456'],
    });

    expect(branched.future).toHaveLength(0);
    expect(redoAction(branched)).toBe(branched);
    expect(branched.present.layers[0].name).toBe('Набросок');
  });

  it('отклонённое действие сохраняет историю и возможность redo', () => {
    const initial = createProjectHistory(createProject({}));
    const changed = commitAction(initial, {
      type: 'renameLayer', layerId: initial.present.activeLayerId, name: 'Слой с именем',
    });
    const undone = undoAction(changed);
    const rejected = commitAction(undone, {
      type: 'setLayerOpacity', layerId: 'missing', opacity: 0.5,
    });

    expect(rejected).toBe(undone);
    expect(redoAction(rejected).present.layers[0].name).toBe('Слой с именем');
  });

  it('удерживает не более 80 доступных шагов undo', () => {
    const initial = createProjectHistory(createProject({}));
    let history = initial;
    for (let i = 1; i <= 90; i += 1) {
      history = commitAction(history, {
        type: 'renameLayer', layerId: initial.present.activeLayerId, name: `Версия ${i}`,
      });
    }

    expect(history.past).toHaveLength(80);
    for (let i = 0; i < 80; i += 1) history = undoAction(history);
    expect(history.present.layers[0].name).toBe('Версия 10');
    expect(undoAction(history)).toBe(history);
  });
});
