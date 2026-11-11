import type { DrawingProject, Stroke } from '../editor/model';

export const FIRST_LESSON_ID = 'line-confidence-v1';

export interface LessonStep { title: string; instruction: string; detail: string }
export interface DrawingLesson {
  id: string;
  title: string;
  skill: string;
  practice: string;
  steps: readonly LessonStep[];
}

export const E2_LESSONS: readonly DrawingLesson[] = [
  {
    id: 'e2a-botanical-branch', title: 'Ветка с листьями', skill: 'Линия, ритм и пропорции',
    practice: 'Веточка розмарина', steps: [
      { title: 'Ось ветки', instruction: 'Наметьте длинную, слегка изогнутую ось.', detail: 'Ось задаёт направление роста и помогает не потерять пропорции.' },
      { title: 'Расположение листьев', instruction: 'Отметьте пары листьев вдоль оси.', detail: 'Сравнивайте расстояния между парами: живой ритм не требует абсолютной симметрии.' },
      { title: 'Форма листа', instruction: 'Нарисуйте несколько листьев вытянутыми контурами.', detail: 'Сначала крупная форма, затем уточнение кончика и основания.' },
      { title: 'Разные повороты', instruction: 'Добавьте листья, смотрящие в разные стороны.', detail: 'Поворот можно показать изменением ширины видимого листа.' },
      { title: 'Уточнение рисунка', instruction: 'Выделите основные контуры и уберите лишнее.', detail: 'Не стремитесь обводить каждую линию одинаково сильно.' },
      { title: 'Самопроверка', instruction: 'Сравните пропорции, ритм и направление ветки.', detail: 'Практика после урока: самостоятельно нарисуйте веточку розмарина.' },
    ],
  },
  {
    id: 'e2b-coffee-cup', title: 'Чашка кофе', skill: 'Объём через простые формы',
    practice: 'Стакан для карандашей', steps: [
      { title: 'Простая форма', instruction: 'Определите общую ширину и высоту чашки.', detail: 'Сначала ищите отношение размеров, не детали.' },
      { title: 'Верхний эллипс', instruction: 'Нарисуйте овальный край чашки.', detail: 'Две половины эллипса должны плавно соединяться.' },
      { title: 'Корпус чашки', instruction: 'Соедините края плавными боковыми линиями.', detail: 'Сравните ширину дна и верхнего края.' },
      { title: 'Ручка', instruction: 'Постройте ручку двумя связанными дугами.', detail: 'Проверьте, где ручка крепится к чашке.' },
      { title: 'Чистый контур', instruction: 'Подчеркните видимые линии и исправьте лишние.', detail: 'Перекрытые части не должны спорить с передним контуром.' },
      { title: 'Самопроверка', instruction: 'Проверьте эллипс, пропорции и соединение ручки.', detail: 'Практика после урока: нарисуйте стакан для карандашей.' },
    ],
  },
  {
    id: 'e2c-houseplant', title: 'Комнатное растение', skill: 'Составная форма и пространство',
    practice: 'Кактус в горшке', steps: [
      { title: 'Общая композиция', instruction: 'Наметьте высоту растения и место горшка.', detail: 'Оставьте пространство вокруг листьев; начните с крупных масс.' },
      { title: 'Форма горшка', instruction: 'Постройте верхний эллипс и сужающиеся стенки.', detail: 'Проверьте вертикальную ось и ширину основания.' },
      { title: 'Стебли', instruction: 'Проведите основные направления роста стеблей.', detail: 'Стебли связывают листья с центром композиции.' },
      { title: 'Листья', instruction: 'Добавьте крупные листья, учитывая их повороты.', detail: 'Ближние формы могут перекрывать дальние.' },
      { title: 'Глубина и контур', instruction: 'Уточните пересечения и выразительность контуров.', detail: 'Не прорисовывайте скрытые за листьями части стеблей.' },
      { title: 'Самопроверка', instruction: 'Проверьте устойчивость горшка и читаемость силуэта.', detail: 'Практика после урока: самостоятельно нарисуйте кактус в горшке.' },
    ],
  },
] as const;

export function getLesson(id: string): DrawingLesson | undefined {
  return E2_LESSONS.find((lesson) => lesson.id === id);
}

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
  const isIntro = project.lesson?.id === FIRST_LESSON_ID;
  const totalSteps = isIntro ? learningLessonSteps.length : getLesson(project.lesson?.id ?? '')?.steps.length;
  if (!totalSteps || !Number.isInteger(step) || step < 0 || step >= totalSteps) return false;
  const strokes = project.layers.flatMap((layer) => layer.kind === 'paint' ? layer.strokes : []);
  const valid = strokes.filter((stroke: Stroke) => stroke.kind === 'ink' && stroke.step === step
    && stroke.points.length >= (step === 0 ? 2 : 3));
  return valid.length >= (isIntro && step === 2 ? 2 : 1);
}
