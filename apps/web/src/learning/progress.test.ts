import { describe, expect, it } from 'vitest';

import { applyAction, createProject, type PaintLayer, type ReferenceLayer } from '../editor/model';
import { completeLearningLesson, duplicateLessonProject,
  normalizeLearningProgress } from './progress';

describe('прогресс обучения и безопасная копия', () => {
  it('открывает инструмент навсегда и не меняет результат при повторном завершении', () => {
    const initial = normalizeLearningProgress(undefined);
    expect(initial).toEqual({ schemaVersion: 1, completedLessonIds: [], unlockedToolIds: [] });
    const completed = completeLearningLesson(initial, 'line-confidence-v1');
    expect(completed).toEqual({ schemaVersion: 1,
      completedLessonIds: ['line-confidence-v1'], unlockedToolIds: ['ink', 'erase'] });
    expect(completeLearningLesson(completed, 'line-confidence-v1')).toEqual(completed);
    expect(completeLearningLesson(completed, 'made-up-lesson')).toEqual(completed);
  });

  it('исключает неизвестные инструменты, неверную схему и повторяющиеся ID без выдачи доступа', () => {
    expect(normalizeLearningProgress({ schemaVersion: 1,
      completedLessonIds: ['line-confidence-v1', 'line-confidence-v1', 'unknown'],
      unlockedToolIds: ['ink', 'erase', 'made-up', 'erase'] })).toEqual({ schemaVersion: 1,
      completedLessonIds: ['line-confidence-v1'], unlockedToolIds: ['ink', 'erase'] });
    expect(normalizeLearningProgress({ schemaVersion: 8,
      completedLessonIds: ['line-confidence-v1'], unlockedToolIds: ['erase'] })).toEqual({
      schemaVersion: 1, completedLessonIds: [], unlockedToolIds: [],
    });
  });

  it('копирует учебный рисунок с теми же слоями и референсом, новым ID и без ограничений урока', () => {
    const base = createProject({ title: 'Урок линий', lesson: {
      id: 'line-confidence-v1', audience: 'adult', mode: 'construct', step: 2,
    } });
    const stroked = applyAction(base, { type: 'addStroke', layerId: base.activeLayerId,
      stroke: { id: 'ink-line', kind: 'ink', brushId: 'pencil', color: '#112233',
        width: 5, opacity: 1, points: [{ x: .1, y: .2 }, { x: .4, y: .4 }], step: 2 } });
    const reference: ReferenceLayer = { kind: 'reference', id: 'ref', name: 'Эскиз',
      visible: true, locked: false, opacity: .7, assetId: 'blob-ref', placement: 'side',
      transform: { x: 0, y: 0, scale: 1, rotation: 0 } };
    const source = applyAction(stroked, { type: 'addLayer', layer: reference });
    const copy = duplicateLessonProject(source, 1_800_000_000_000);
    expect(copy.id).not.toBe(source.id);
    expect(copy.title).toBe('Урок линий · свободная копия');
    expect(copy.lesson).toBeUndefined();
    expect(copy.createdAt).toBe(1_800_000_000_000);
    expect(copy.layers).toEqual(source.layers);
    expect(copy.layers).not.toBe(source.layers);
    expect((copy.layers[0] as PaintLayer).strokes).not.toBe((source.layers[0] as PaintLayer).strokes);
    expect(source.lesson?.step).toBe(2);
  });
});
