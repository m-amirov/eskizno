import { describe, expect, it } from 'vitest';

import { applyAction, createProject, parseDrawingProject, type Layer, type Stroke, type Shape } from './model';
import { commitAction, createProjectHistory, redoAction, undoAction } from './history';

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
  it('атомарно перемещает и масштабирует штрих и фигуру, сохраняя структуру v2 и Undo/Redo', () => {
    const base = createProject();
    const withStroke = applyAction(base, { type: 'addStroke', layerId: base.activeLayerId, stroke });
    const shape: Shape = { id: 'shape-selected', kind: 'rectangle', from: { x: .3, y: .5 },
      to: { x: .4, y: .7 }, color: '#AABBCC', width: 4, style: 'outline', opacity: 1 };
    const withShape = applyAction(withStroke, { type: 'addShape', layerId: base.activeLayerId, shape });
    const action = { type: 'transformItems' as const, layerId: base.activeLayerId,
      ids: ['ink-1', 'shape-selected'], origin: { x: .1, y: .2 },
      scaleX: 2, scaleY: .5, translateX: .1, translateY: .2 };
    const history = commitAction(createProjectHistory(withShape), action);
    expect(history.present.layers[0]).toMatchObject({
      strokes: [{ id: 'ink-1', width: 8, points: [{ x: .2, y: .4 }, { x: .6, y: .5 }] }],
      operations: [{ type: 'stroke', strokeId: 'ink-1' },
        { type: 'shape', shape: { id: 'shape-selected', width: 4,
          from: { x: .6, y: .55 }, to: { x: .8, y: .65 } } }],
    });
    expect(history.present.schemaVersion).toBe(2);
    expect(parseDrawingProject(history.present)).not.toBeNull();
    expect(undoAction(history).present).toEqual(withShape);
    expect(redoAction(undoAction(history)).present).toEqual(history.present);
    expect(withShape.layers[0]).toMatchObject({ strokes: [{ points: stroke.points }] });
  });

  it('отклоняет целиком трансформацию с неверным ID, точкой вне холста или заблокированным слоем', () => {
    const base = createProject();
    const project = applyAction(base, { type: 'addStroke', layerId: base.activeLayerId, stroke });
    const command = { type: 'transformItems' as const, layerId: base.activeLayerId,
      ids: ['ink-1'], origin: { x: 0, y: 0 }, scaleX: 1,
      scaleY: 1, translateX: .2, translateY: 0 };
    expect(applyAction(project, { ...command, ids: ['ink-1', 'not-found'] })).toBe(project);
    expect(applyAction(project, { ...command, translateX: .9 })).toBe(project);
    expect(applyAction(project, { ...command, scaleX: Number.NaN })).toBe(project);
    expect(applyAction(project, { ...command, ids: ['ink-1', 'ink-1'] })).toBe(project);
    expect(applyAction(project, { ...command, translateX: 0 })).toBe(project);
    for (const kind of ['setLayerLock', 'setLayerVisibility'] as const) {
      const protectedProject = kind === 'setLayerLock'
        ? applyAction(project, { type: kind, layerId: base.activeLayerId, locked: true })
        : applyAction(project, { type: kind, layerId: base.activeLayerId, visible: false });
      expect(applyAction(protectedProject, command)).toBe(protectedProject);
    }
  });
  it('сохраняет увеличение объектов при достижении максимальной толщины 256 px', () => {
    const base = createProject();
    const drawn = applyAction(base, { type: 'addStroke', layerId: base.activeLayerId,
      stroke: { ...stroke, width: 48, points: [{ x: .1, y: .1 }, { x: .2, y: .2 }] } });
    const scaled = applyAction(drawn, { type: 'transformItems', layerId: base.activeLayerId,
      ids: ['ink-1'], origin: { x: .1, y: .1 }, scaleX: 8, scaleY: 8,
      translateX: 0, translateY: 0 });
    expect(scaled).not.toBe(drawn);
    expect(scaled.layers[0]).toMatchObject({ strokes: [{ width: 256,
      points: [{ x: .1, y: .1 }, { x: .9, y: .9 }] }] });
    expect(parseDrawingProject(scaled)).not.toBeNull();
  });
  it('продвижение шага урока — обратимое действие без смены схемы v2', () => {
    const lesson = createProject({ lesson: { id: 'line-confidence-v1', audience: 'adult', mode: 'construct', step: 0 } });
    const advanced = applyAction(lesson, { type: 'setLessonStep', step: 1 });
    expect(advanced.lesson?.step).toBe(1);
    expect(advanced.schemaVersion).toBe(2);
    expect(applyAction(advanced, { type: 'setLessonStep', step: -1 })).toBe(advanced);
    expect(applyAction(createProject(), { type: 'setLessonStep', step: 1 })).not.toHaveProperty('lesson');
    expect(lesson.lesson?.step).toBe(0);
  });
  it('хранит операции в порядке штрих → заливка → фигура → штрих, сохраняя прежнее поле strokes', () => {
    const original = createProject();
    const first = applyAction(original, { type: 'addStroke', layerId: original.activeLayerId, stroke });
    const filled = applyAction(first, {
      type: 'addFill', layerId: original.activeLayerId,
      fill: { id: 'bucket-1', point: { x: .5, y: .5 }, color: '#FF0000' },
    });
    const shape: Shape = {
      id: 'shape-1', kind: 'rectangle', from: { x: .2, y: .2 }, to: { x: .8, y: .8 },
      color: '#0000FF', width: 3, style: 'both', opacity: 1,
    };
    const shaped = applyAction(filled, { type: 'addShape', layerId: original.activeLayerId, shape });
    const result = applyAction(shaped, {
      type: 'addStroke', layerId: original.activeLayerId, stroke: { ...stroke, id: 'ink-2' },
    });
    expect(result.layers[0]).toMatchObject({
      strokes: [{ id: 'ink-1' }, { id: 'ink-2' }],
      operations: [
        { type: 'stroke', strokeId: 'ink-1' },
        { type: 'fill', fill: { id: 'bucket-1' } },
        { type: 'shape', shape: { id: 'shape-1' } },
        { type: 'stroke', strokeId: 'ink-2' },
      ],
    });
    expect(first.layers[0]).not.toHaveProperty('operations');
    expect(original.layers[0]).not.toHaveProperty('operations');
  });

  it('перемещает фигуру без изменения порядка и старых версий документа', () => {
    const base = createProject();
    const shape: Shape = {
      id: 'shape-1', kind: 'ellipse', from: { x: .2, y: .3 }, to: { x: .4, y: .5 },
      color: '#123456', width: 4, style: 'outline', opacity: .4,
    };
    const withShape = applyAction(base, { type: 'addShape', layerId: base.activeLayerId, shape });
    const moved = applyAction(withShape, {
      type: 'updateShape', layerId: base.activeLayerId, shapeId: 'shape-1',
      from: { x: .4, y: .4 }, to: { x: .6, y: .6 },
    });
    expect(moved.layers[0]).toMatchObject({ operations: [{ type: 'shape', shape: {
      from: { x: .4, y: .4 }, to: { x: .6, y: .6 },
    } }] });
    expect(withShape.layers[0]).toMatchObject({ operations: [{ type: 'shape', shape: {
      from: { x: .2, y: .3 },
    } }] });
    expect(applyAction(moved, { type: 'updateShape', layerId: base.activeLayerId, shapeId: 'shape-1', from: { x: .4, y: .4 }, to: { x: .6, y: .6 } })).toBe(moved);
  });

  it('отказывает заливке и фигурам на скрытом/заблокированном слое и отклоняет повреждённые данные', () => {
    const base = createProject();
    const id = base.activeLayerId;
    const hidden = applyAction(base, { type: 'setLayerVisibility', layerId: id, visible: false });
    const locked = applyAction(base, { type: 'setLayerLock', layerId: id, locked: true });
    const fill = { id: 'f', point: { x: .2, y: .2 }, color: '#00FF00' };
    const shape: Shape = { id: 's', kind: 'triangle', from: { x: .2, y: .2 }, to: { x: .7, y: .7 }, color: '#FFFFFF', width: 4, style: 'both', opacity: 1 };
    expect(applyAction(hidden, { type: 'addFill', layerId: id, fill })).toBe(hidden);
    expect(applyAction(locked, { type: 'addShape', layerId: id, shape })).toBe(locked);
    expect(applyAction(base, { type: 'addFill', layerId: id, fill: { ...fill, point: { x: 2, y: .2 } } })).toBe(base);
    expect(applyAction(base, { type: 'addShape', layerId: id, shape: { ...shape, width: 0 } })).toBe(base);
    const filled = applyAction(base, { type: 'addFill', layerId: id, fill });
    expect(applyAction(filled, { type: 'addFill', layerId: id, fill })).toBe(filled);
    expect(applyAction(filled, { type: 'addShape', layerId: id, shape: { ...shape, id: 'f' } })).toBe(filled);
  });

  it('очистка удаляет заливки и фигуры даже без штрихов', () => {
    const base = createProject();
    const withFill = applyAction(base, { type: 'addFill', layerId: base.activeLayerId,
      fill: { id: 'f', point: { x: .5, y: .5 }, color: '#AABBCC' } });
    const cleared = applyAction(withFill, { type: 'clearDrawing' });
    expect(cleared.layers[0]).toMatchObject({ strokes: [], operations: [] });
    expect(applyAction(cleared, { type: 'clearDrawing' })).toBe(cleared);
  });
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
