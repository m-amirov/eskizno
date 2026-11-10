import type { DrawingProject, Stroke } from '../editor/model';

export const FIRST_LESSON_ID = 'line-confidence-v1';

export const learningLessonSteps = [
  {
    title: 'Найти свою линию',
    instruction: 'Проведите одну свободную линию без линейки. Попробуйте вести руку от плеча, а не только пальцами.',
    detail: 'Не нужно делать её идеально прямой — почувствуйте движение.',
  },
  {
    title: 'Мягкий поворот',
    instruction: 'Нарисуйте плавную дугу из нескольких движений пера. Сохраняйте комфортный темп.',
    detail: 'Мы проверяем наличие практики, а не красоту кривой.',
  },
  {
    title: 'Свой маленький знак',
    instruction: 'Придумайте знак из двух или более линий: веточку, волну или простую букву.',
    detail: 'Завершите композицию на этом же холсте.',
  },
] as const;

export function isLessonStepSatisfied(project: DrawingProject, step: number): boolean {
  if (project.lesson?.id !== FIRST_LESSON_ID || !Number.isInteger(step)
    || step < 0 || step >= learningLessonSteps.length) return false;
  const strokes = project.layers.flatMap((layer) => layer.kind === 'paint' ? layer.strokes : []);
  const valid = strokes.filter((stroke: Stroke) => stroke.kind === 'ink' && stroke.step === step
    && stroke.points.length >= (step === 0 ? 2 : 3));
  return valid.length >= (step === 2 ? 2 : 1);
}
