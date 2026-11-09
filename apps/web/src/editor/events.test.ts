import { describe, expect, it } from 'vitest';

import { applyAction, createProject, type ProjectAction, type Stroke } from './model';
import { commitAction, createProjectHistory, undoAction } from './history';
import { createActionEvent } from './events';

const stroke: Stroke = {
  id: 'stroke-1',
  kind: 'ink',
  brushId: 'marker',
  color: '#003344',
  width: 9,
  opacity: 0.75,
  points: [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }, { x: 0.3, y: 0.3 }],
};

describe('семантические события действий', () => {
  it('создаёт одно событие strokeCommitted только для завершённого штриха', () => {
    const before = createProject({});
    const action: ProjectAction = { type: 'addStroke', layerId: before.activeLayerId, stroke };
    const after = applyAction(before, action);

    expect(createActionEvent(action, before, after)).toEqual({
      type: 'strokeCommitted',
      projectId: before.id,
      layerId: before.activeLayerId,
      strokeId: 'stroke-1',
      kind: 'ink',
      brushId: 'marker',
      pointCount: 3,
    });
    expect(createActionEvent(action, before, after)).not.toHaveProperty('points');
  });

  it('отклонённое действие не даёт событие и не меняет состояние', () => {
    const before = createProject({});
    const action: ProjectAction = {
      type: 'addStroke', layerId: 'missing', stroke,
    };
    const after = applyAction(before, action);

    expect(after).toBe(before);
    expect(createActionEvent(action, before, after)).toBeNull();
  });

  it('pointercancel не выдаёт strokeCommitted даже при чужом изменении объекта', () => {
    const before = createProject({});
    const after = applyAction(before, {
      type: 'addStroke', layerId: before.activeLayerId, stroke,
    });

    expect(createActionEvent({ type: 'pointercancel' }, before, after)).toBeNull();
  });

  it('выполненный выбор нового слоя порождает layerAdded', () => {
    const before = createProject({});
    const action: ProjectAction = {
      type: 'addLayer',
      layer: { id: 'ink-top', kind: 'paint', name: 'Контур', visible: true, locked: false, opacity: 1, strokes: [] },
    };
    const after = applyAction(before, action);

    expect(createActionEvent(action, before, after)).toEqual({
      type: 'layerAdded', projectId: before.id, layerId: 'ink-top', kind: 'paint',
    });
  });

  it('смена видимости референса порождает referenceToggled', () => {
    const initial = createProject({});
    const before = applyAction(initial, {
      type: 'addLayer',
      layer: {
        id: 'ref', kind: 'reference', name: 'Эскиз', visible: true, locked: true, opacity: 1,
        assetId: 'asset', placement: 'overlay', transform: { x: 0, y: 0, scale: 1, rotation: 0 },
      },
    });
    const action: ProjectAction = { type: 'setLayerVisibility', layerId: 'ref', visible: false };
    const after = applyAction(before, action);

    expect(createActionEvent(action, before, after)).toEqual({
      type: 'referenceToggled', projectId: before.id, layerId: 'ref', visible: false,
    });
  });

  it('сохраняет тип действия при изменении слоя или палитры', () => {
    const before = createProject({});
    const layerAction: ProjectAction = {
      type: 'setLayerOpacity', layerId: before.activeLayerId, opacity: 0.4,
    };
    const afterLayer = applyAction(before, layerAction);
    const paletteAction: ProjectAction = { type: 'setPalette', palette: ['#123456'] };
    const afterPalette = applyAction(afterLayer, paletteAction);

    expect(createActionEvent(layerAction, before, afterLayer)).toEqual({
      type: 'layerChanged',
      projectId: before.id,
      layerId: before.activeLayerId,
      operation: 'setLayerOpacity',
    });
    expect(createActionEvent(paletteAction, afterLayer, afterPalette)).toEqual({
      type: 'paletteChanged', projectId: before.id, colors: ['#123456'],
    });
  });

  it('undo возвращает фактическое состояние без нового события о выполнении', () => {
    const initial = createProjectHistory(createProject({}));
    const action: ProjectAction = {
      type: 'addStroke', layerId: initial.present.activeLayerId, stroke,
    };
    const painted = commitAction(initial, action);
    const undone = undoAction(painted);

    expect(undone.present.layers[0]).toMatchObject({ strokes: [] });
    expect(createActionEvent(action, painted.present, undone.present)).toBeNull();
  });

  it('не создаёт событие, если несвязанный документ изменён другим действием', () => {
    const before = createProject({});
    const action: ProjectAction = {
      type: 'renameLayer', layerId: before.activeLayerId, name: 'Контур',
    };
    const after = applyAction(before, { type: 'setPalette', palette: ['#123456'] });

    expect(createActionEvent(action, before, after)).toBeNull();
  });
});
