import { describe, expect, it } from 'vitest';

import { applyAction, createProject, type Layer, type Stroke } from './model';

const paintLayer = (id: string): Layer => ({
  id,
  kind: 'paint',
  name: id,
  visible: true,
  locked: false,
  opacity: 1,
  strokes: [],
});

const referenceLayer = (id: string): Layer => ({
  id,
  kind: 'reference',
  name: id,
  visible: true,
  locked: true,
  opacity: 0.6,
  assetId: 'local-asset',
  placement: 'overlay',
  transform: { x: 0, y: 0, scale: 1, rotation: 0 },
});

const stroke: Stroke = {
  id: 'ink-1',
  kind: 'ink',
  brushId: 'pencil',
  color: '#254332',
  width: 8,
  opacity: 1,
  points: [{ x: 0.1, y: 0.2 }, { x: 0.3, y: 0.4 }],
};

describe('модель рисунка', () => {
  it('принимает шесть дополнительных кистей, сохраняя старые типы без миграции', () => {
    const project = createProject({});
    const brushIds = ['watercolor', 'charcoal', 'dry', 'airbrush', 'calligraphy', 'pastel'] as const;
    let result = project;
    for (const brushId of brushIds) {
      result = applyAction(result, {
        type: 'addStroke', layerId: project.activeLayerId,
        stroke: { ...stroke, id: `stroke-${brushId}`, brushId: brushId as Stroke['brushId'] },
      });
    }
    expect(result.layers[0]).toMatchObject({ kind: 'paint', strokes: brushIds.map((brushId) => ({ brushId })) });
  });
  it('создаёт проект с редактируемым активным paint-слоем', () => {
    const project = createProject({ title: 'Ветка', width: 1200, height: 900 });

    expect(project.schemaVersion).toBe(2);
    expect(project.title).toBe('Ветка');
    expect([project.width, project.height]).toEqual([1200, 900]);
    expect(project.layers).toHaveLength(1);
    expect(project.layers[0]).toMatchObject({ kind: 'paint', locked: false, visible: true });
    expect(project.activeLayerId).toBe(project.layers[0].id);
    expect(project.layers[0].id).toBeTruthy();
  });

  it('запрещает некорректный размер холста', () => {
    expect(() => createProject({ width: 0 })).toThrow();
    expect(() => createProject({ height: 5000 })).toThrow();
    expect(() => createProject({ width: 1.5 })).toThrow();
  });

  it('добавляет штрих только в указанный слой, не мутируя прежнюю модель', () => {
    const original = createProject({});
    const second = applyAction(original, { type: 'addLayer', layer: paintLayer('paint-2') });
    const result = applyAction(second, { type: 'addStroke', layerId: 'paint-2', stroke });

    expect(result.layers[0]).toEqual(original.layers[0]);
    expect(result.layers[1]).toMatchObject({ kind: 'paint', strokes: [stroke] });
    expect(second.layers[1]).toMatchObject({ kind: 'paint', strokes: [] });
    expect(result).not.toBe(second);
  });

  it('отклоняет рисование в заблокированный, скрытый и reference-слой', () => {
    const initial = createProject({});
    const active = initial.activeLayerId;
    const locked = applyAction(initial, { type: 'setLayerLock', layerId: active, locked: true });
    const hidden = applyAction(initial, { type: 'setLayerVisibility', layerId: active, visible: false });
    const withReference = applyAction(initial, { type: 'addLayer', layer: referenceLayer('ref') });

    expect(applyAction(locked, { type: 'addStroke', layerId: active, stroke })).toBe(locked);
    expect(applyAction(hidden, { type: 'addStroke', layerId: active, stroke })).toBe(hidden);
    expect(applyAction(withReference, { type: 'addStroke', layerId: 'ref', stroke })).toBe(withReference);
  });

  it('отклоняет повреждённый штрих и повторный ID без изменения документа', () => {
    const initial = createProject({});
    const active = initial.activeLayerId;
    const valid = applyAction(initial, { type: 'addStroke', layerId: active, stroke });

    expect(applyAction(initial, {
      type: 'addStroke',
      layerId: active,
      stroke: { ...stroke, points: [{ x: -0.2, y: 1.5 }] },
    })).toBe(initial);
    expect(applyAction(valid, { type: 'addStroke', layerId: active, stroke })).toBe(valid);
  });

  it('не падает на некорректных точках из восстановленных данных', () => {
    const project = createProject({});
    const invalidStroke = { ...stroke, points: [undefined] } as unknown as Stroke;

    expect(applyAction(project, {
      type: 'addStroke', layerId: project.activeLayerId, stroke: invalidStroke,
    })).toBe(project);
  });

  it('не позволяет удалить последний paint-слой и выбирает оставшийся после удаления активного', () => {
    const initial = createProject({});
    const withReference = applyAction(initial, { type: 'addLayer', layer: referenceLayer('ref') });
    expect(applyAction(withReference, { type: 'removeLayer', layerId: initial.activeLayerId })).toBe(withReference);

    const withSecond = applyAction(withReference, { type: 'addLayer', layer: paintLayer('second') });
    const selected = applyAction(withSecond, { type: 'setActiveLayer', layerId: 'second' });
    const removed = applyAction(selected, { type: 'removeLayer', layerId: 'second' });

    expect(removed.activeLayerId).toBe(initial.activeLayerId);
    expect(removed.layers.map((layer) => layer.id)).toEqual([initial.activeLayerId, 'ref']);
  });

  it('соблюдает максимум 16 слоёв и игнорирует дублирующиеся ID', () => {
    let project = createProject({});

    for (let i = 1; i < 16; i += 1) {
      project = applyAction(project, { type: 'addLayer', layer: paintLayer(`layer-${i}`) });
    }

    expect(project.layers).toHaveLength(16);
    expect(applyAction(project, { type: 'addLayer', layer: paintLayer('overflow') })).toBe(project);
    expect(applyAction(project, { type: 'addLayer', layer: paintLayer('layer-1') })).toBe(project);
  });

  it('переименовывает, переставляет и изменяет слой обратимыми действиями', () => {
    const initial = createProject({});
    const second = applyAction(initial, { type: 'addLayer', layer: paintLayer('paint-2') });
    const renamed = applyAction(second, { type: 'renameLayer', layerId: 'paint-2', name: 'Чистовой контур' });
    const transparent = applyAction(renamed, { type: 'setLayerOpacity', layerId: 'paint-2', opacity: 0.25 });
    const reordered = applyAction(transparent, { type: 'reorderLayer', layerId: 'paint-2', toIndex: 0 });

    expect(reordered.layers[0]).toMatchObject({ name: 'Чистовой контур', opacity: 0.25 });
    expect(reordered.layers[1].id).toBe(initial.activeLayerId);
    expect(initial.layers).toHaveLength(1);
  });

  it('очищает штрихи всех paint-слоёв, не удаляя слои и референсы', () => {
    const first = createProject();
    const withStroke = applyAction(first, {
      type: 'addStroke', layerId: first.activeLayerId,
      stroke: { id: 'first', kind: 'ink', brushId: 'pencil', color: '#123456', width: 5, opacity: 1, points: [{ x: 0.2, y: 0.2 }] },
    });
    const withReference = applyAction(withStroke, { type: 'addLayer', layer: referenceLayer('ref') });
    const withSecond = applyAction(withReference, { type: 'addLayer', layer: paintLayer('second') });
    const withSecondStroke = applyAction(withSecond, {
      type: 'addStroke', layerId: 'second',
      stroke: { id: 'second-stroke', kind: 'ink', brushId: 'pencil', color: '#654321', width: 5, opacity: 1, points: [{ x: 0.8, y: 0.8 }] },
    });

    const cleared = applyAction(withSecondStroke, { type: 'clearDrawing' });
    expect(cleared.layers.map((layer) => layer.id)).toEqual(withSecondStroke.layers.map((layer) => layer.id));
    expect(cleared.layers.filter((layer) => layer.kind === 'paint').every((layer) => layer.kind === 'paint' && layer.strokes.length === 0)).toBe(true);
    expect(cleared.layers[1]).toEqual(withSecondStroke.layers[1]);
    expect(cleared.activeLayerId).toBe(withSecondStroke.activeLayerId);
    expect(applyAction(cleared, { type: 'clearDrawing' })).toBe(cleared);
  });

  it('меняет трансформацию только reference-слоя и хранит собственную палитру', () => {
    const initial = createProject({});
    const withReference = applyAction(initial, { type: 'addLayer', layer: referenceLayer('ref') });
    const unlocked = applyAction(withReference, { type: 'setLayerLock', layerId: 'ref', locked: false });
    const transform = { x: 0.2, y: -0.1, scale: 1.5, rotation: 0.3 };
    const moved = applyAction(unlocked, { type: 'setReferenceTransform', layerId: 'ref', transform });
    const recolored = applyAction(moved, { type: 'setPalette', palette: ['#FFAA00', '#102030'] });

    expect(recolored.layers[1]).toMatchObject({ transform });
    expect(recolored.palette).toEqual(['#FFAA00', '#102030']);
    expect(applyAction(recolored, {
      type: 'setReferenceTransform', layerId: initial.activeLayerId, transform,
    })).toBe(recolored);
  });

  it('не удаляет и не перемещает заблокированный референс', () => {
    const initial = createProject({});
    const project = applyAction(initial, { type: 'addLayer', layer: referenceLayer('ref') });
    const transform = { x: 0.4, y: 0.4, scale: 1.2, rotation: 0 };

    expect(applyAction(project, { type: 'removeLayer', layerId: 'ref' })).toBe(project);
    expect(applyAction(project, { type: 'setReferenceTransform', layerId: 'ref', transform })).toBe(project);
    expect(applyAction(project, { type: 'reorderLayer', layerId: 'ref', toIndex: 0 })).toBe(project);
  });

  it('игнорирует отсутствующие слои и некорректные настройки', () => {
    const project = createProject({});
    expect(applyAction(project, { type: 'setLayerOpacity', layerId: 'missing', opacity: 0.5 })).toBe(project);
    expect(applyAction(project, {
      type: 'setLayerOpacity', layerId: project.activeLayerId, opacity: Number.NaN,
    })).toBe(project);
    expect(applyAction(project, { type: 'setPalette', palette: ['not-a-color'] })).toBe(project);
    expect(applyAction(project, { type: 'setActiveLayer', layerId: 'missing' })).toBe(project);
  });
});
