import { describe, expect, it } from 'vitest';
import { applyAction, createProject, type DrawingProject, type Stroke } from '../editor/model';
import { isLessonStepSatisfied, learningLessonSteps } from './lessons';

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
