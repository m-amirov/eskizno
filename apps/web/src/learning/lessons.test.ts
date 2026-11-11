import { describe, expect, it } from 'vitest';
import { applyAction, createProject, type DrawingProject, type Stroke } from '../editor/model';
import { isLessonStepSatisfied, learningLessonSteps, getLesson, E2_LESSONS } from './lessons';

const newLesson = () => createProject({ lesson: { id: 'line-confidence-v1', audience: 'adult', mode: 'construct', step: 0 } });
function addInk(project: DrawingProject, step: number, count = 3): DrawingProject {
  const stroke: Stroke = { id: crypto.randomUUID(), kind: 'ink', brushId: 'pencil', color: '#254332',
    width: 8, opacity: 1, points: Array.from({ length: count }, (_, i) => ({ x: .1 + i * .1, y: .3 })), step };
  return applyAction(project, { type: 'addStroke', layerId: project.activeLayerId, stroke });
}

describe('трёхшаговый урок для взрослых', () => {
  it('не принимает пустой, одиночный и чужой штрих на первом шаге', () => {
    expect(learningLessonSteps).toHaveLength(3);
    expect(isLessonStepSatisfied(newLesson(), 0)).toBe(false);
    expect(isLessonStepSatisfied(addInk(newLesson(), 0, 1), 0)).toBe(false);
    expect(isLessonStepSatisfied(addInk(newLesson(), 1), 0)).toBe(false);
    expect(isLessonStepSatisfied(addInk(newLesson(), 0), 0)).toBe(true);
  });

  it('шаги независимы, а финальный требует два отдельных штриха', () => {
    let project = addInk(newLesson(), 0);
    expect(isLessonStepSatisfied(project, 1)).toBe(false);
    project = addInk(project, 1);
    expect(isLessonStepSatisfied(project, 1)).toBe(true);
    project = addInk(project, 2);
    expect(isLessonStepSatisfied(project, 2)).toBe(false);
    project = addInk(project, 2);
    expect(isLessonStepSatisfied(project, 2)).toBe(true);
    const removed = applyAction(project, { type: 'clearDrawing' });
    expect(isLessonStepSatisfied(removed, 2)).toBe(false);
  });

  it('не принимает произвольную чужую учебную работу', () => {
    const other = createProject();
    expect(isLessonStepSatisfied(addInk(other, 0), 0)).toBe(false);
  });
});

describe('E2 — три учебных рисунка', () => {
  it('содержит три самостоятельных урока по шесть шагов с честными подсказками', () => {
    expect(E2_LESSONS.map((lesson) => lesson.title)).toEqual([
      'Ветка с листьями', 'Чашка кофе', 'Комнатное растение',
    ]);
    expect(E2_LESSONS.map((lesson) => lesson.practice)).toEqual([
      'Веточка розмарина', 'Стакан для карандашей', 'Кактус в горшке',
    ]);
    for (const lesson of E2_LESSONS) {
      expect(lesson.steps).toHaveLength(6);
      expect(lesson.steps.every((step) => !!step.title && !!step.instruction && !!step.detail)).toBe(true);
      expect(getLesson(lesson.id)).toBe(lesson);
    }
  });

  it('проверяет только реальные штрихи соответствующего шага и урока', () => {
    const id = 'e2a-botanical-branch';
    const project = createProject({ lesson: { id, audience: 'adult', mode: 'trace', step: 0 } });
    expect(isLessonStepSatisfied(project, 0)).toBe(false);
    expect(isLessonStepSatisfied(addInk(project, 1), 0)).toBe(false);
    expect(isLessonStepSatisfied(addInk(project, 0), 0)).toBe(true);
    const other = createProject({ lesson: { id: 'unknown', audience: 'adult', mode: 'trace', step: 0 } });
    expect(isLessonStepSatisfied(addInk(other, 0), 0)).toBe(false);
  });
});
