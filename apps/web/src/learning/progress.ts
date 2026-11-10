import { createProject, parseDrawingProject, type DrawingProject } from '../editor/model';
import { TOOL_REGISTRY, type EditorToolId } from '../editor/toolAccess';

export interface LearningProgress {
  schemaVersion: 1;
  completedLessonIds: string[];
  unlockedToolIds: EditorToolId[];
}

const UNLOCKS_BY_LESSON: Readonly<Record<string, readonly EditorToolId[]>> = {
  'line-confidence-v1': ['ink', 'erase'],
};

const EMPTY_PROGRESS = (): LearningProgress => ({
  schemaVersion: 1, completedLessonIds: [], unlockedToolIds: [],
});

export function normalizeLearningProgress(value: unknown): LearningProgress {
  if (!value || typeof value !== 'object') return EMPTY_PROGRESS();
  const record = value as Partial<LearningProgress>;
  if (record.schemaVersion !== 1 || !Array.isArray(record.completedLessonIds)
    || !Array.isArray(record.unlockedToolIds)) return EMPTY_PROGRESS();
  const knownTools = new Set<string>(TOOL_REGISTRY.map((tool) => tool.id));
  return {
    schemaVersion: 1,
    completedLessonIds: [...new Set(record.completedLessonIds.filter(
      (id): id is string => typeof id === 'string' && id in UNLOCKS_BY_LESSON))],
    unlockedToolIds: [...new Set(record.unlockedToolIds.filter(
      (id): id is EditorToolId => typeof id === 'string' && knownTools.has(id)))],
  };
}

export function completeLearningLesson(progress: LearningProgress, lessonId: string): LearningProgress {
  const unlocks = UNLOCKS_BY_LESSON[lessonId];
  if (!unlocks) return progress;
  const validated = normalizeLearningProgress(progress);
  return {
    schemaVersion: 1,
    completedLessonIds: [...new Set([...validated.completedLessonIds, lessonId])],
    unlockedToolIds: [...new Set([...validated.unlockedToolIds, ...unlocks])],
  };
}

export function duplicateLessonProject(source: DrawingProject, createdAt = Date.now()): DrawingProject {
  const valid = parseDrawingProject(source);
  if (!valid || !valid.lesson) throw new Error('Можно копировать только корректную учебную работу');
  const { lesson: _lesson, ...document } = valid;
  return {
    ...document,
    id: createProject().id,
    title: `${valid.title} · свободная копия`,
    createdAt,
    updatedAt: createdAt,
  };
}
