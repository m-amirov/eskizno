import { useMemo, useState } from 'react';

import { EditorCanvas } from '../editor/EditorCanvas';
import type { ProjectHistory } from '../editor/history';
import type { ProjectAction } from '../editor/model';
import type { ToolAvailabilityContext } from '../editor/toolAccess';
import { FIRST_LESSON_ID, getLesson, isLessonStepSatisfied, learningLessonSteps } from './lessons';
import type { LearningProgress } from './progress';
import type { SaveStatus } from '../studio/useLocalProjects';
import { LessonGuide } from './LessonGuide';

interface LearningWorkspaceProps {
  history: ProjectHistory;
  progress: LearningProgress;
  saveStatus: SaveStatus;
  storageMessage: string | null;
  learningMessage: string | null;
  onAction: (action: ProjectAction, access: ToolAvailabilityContext) => void;
  onUndo: () => void;
  onRedo: () => void;
  onRetry: () => void;
  onComplete: () => Promise<boolean>;
  onCopy: () => Promise<boolean>;
  onCopied: () => void;
  onBack: () => void;
}

export function LearningWorkspace({ history, progress, saveStatus, storageMessage, learningMessage,
  onAction, onUndo, onRedo, onRetry, onComplete, onCopy, onCopied, onBack }: LearningWorkspaceProps) {
  const [busy, setBusy] = useState(false);
  const project = history.present;
  const definition = getLesson(project.lesson?.id ?? '');
  const steps = definition?.steps ?? learningLessonSteps;
  const step = Math.min(project.lesson?.step ?? 0, steps.length);
  const completed = progress.completedLessonIds.includes(project.lesson?.id ?? FIRST_LESSON_ID);
  const lesson = steps[step];
  const satisfied = step < steps.length && isLessonStepSatisfied(project, step);
  const allEvidence = steps.every((_, i) => isLessonStepSatisfied(project, i));
  const access = useMemo<ToolAvailabilityContext>(() => ({
    mode: 'learning', permanentlyUnlockedToolIds: new Set(progress.unlockedToolIds),
    lessonIntroducedToolIds: new Set(['ink']),
    lessonAllowedToolIds: new Set(['ink', 'erase']),
  }), [progress]);

  const copy = async () => {
    setBusy(true);
    try { if (await onCopy()) onCopied(); }
    finally { setBusy(false); }
  };
  const finish = async () => {
    setBusy(true);
    try { await onComplete(); }
    finally { setBusy(false); }
  };

  return <section className="learning-workspace" aria-labelledby="lesson-heading">
    <aside className="lesson-guide" aria-label="План урока">
      <p className="section-kicker">Практика · для взрослых</p>
      <h2 id="lesson-heading">{definition?.title ?? 'Линия и уверенность'}</h2>
      {definition && <div className="lesson-modes" role="group" aria-label="Режим помощи">
        {([['trace', 'Повтори'], ['construct', 'Пойми'], ['free', 'Нарисуй сам']] as const).map(([mode, label]) =>
          <button key={mode} type="button" className="secondary-button" aria-pressed={project.lesson?.mode === mode}
            onClick={() => onAction({ type: 'setLessonMode', mode }, access)}>{label}</button>)}
      </div>}
      {definition && <LessonGuide lesson={definition} step={step} mode={project.lesson?.mode ?? 'construct'} />}
      <p className="lesson-progress">{completed ? 'Урок завершён' : `Шаг ${Math.min(step + 1, steps.length)} из ${steps.length}`}</p>
      <ol className="lesson-step-list" aria-label="Этапы урока">
        {steps.map((entry, index) => <li key={entry.title}
          className={index === step && !completed ? 'lesson-step-active' : ''}>
          <span>{String(index + 1).padStart(2, '0')}</span>{entry.title}
        </li>)}
      </ol>
      {lesson && <div className="lesson-instruction" aria-live="polite">
        <h3>{lesson.title}</h3>
        <p>{lesson.instruction}</p>
        <p className="lesson-hint">{lesson.detail}</p>
      </div>}
      {!lesson && <div className="lesson-instruction" aria-live="polite">
        <h3>{completed ? 'Урок пройден' : 'Все задания выполнены'}</h3>
        <p>{completed ? 'Ластик открыт навсегда в учебной практике. Рисунок остаётся вашим.'
          : 'Нажмите «Завершить урок», чтобы сохранить прогресс и открыть ластик.'}</p>
      </div>}
      {lesson ? <button className="primary-button" type="button" disabled={!satisfied || busy}
        onClick={() => onAction({ type: 'setLessonStep', step: step + 1 }, access)}>
        {step === steps.length - 1 ? (definition ? 'Закончить урок' : 'Закончить три шага') : 'Следующий шаг'}
      </button> : !completed ? <button className="primary-button" type="button" disabled={!allEvidence || busy}
        onClick={() => { void finish(); }}>Завершить урок</button> : null}
      {lesson && <p className="lesson-hint" role="status">{satisfied ? 'Штрих принят. Можно продолжать.'
        : 'Следующий шаг откроется после рисования на холсте.'}</p>}
      {definition && <p className="lesson-hint">Самостоятельная практика: {definition.practice}.</p>}
      {learningMessage && <p className="import-error" role="alert">{learningMessage}</p>}
      <p className="lesson-access-note">В обучении инструменты открываются постепенно. Пока доступны кисти
        {progress.unlockedToolIds.includes('erase') ? ' и ластик' : '; ластик откроется после урока'}.
        В свободной студии доступны все инструменты.</p>
      <div className="lesson-commands">
        <button className="secondary-button" type="button" onClick={() => { void copy(); }} disabled={busy}>Продолжить копию в свободной студии</button>
        <button className="lesson-back" type="button" onClick={onBack}>К обучению</button>
      </div>
    </aside>
    <div className="learning-canvas">
      <EditorCanvas history={history} onAction={(action) => onAction(action, access)}
        onUndo={onUndo} onRedo={onRedo} onRetry={onRetry} saveStatus={saveStatus}
        storageMessage={storageMessage} toolAccess={access} lessonStep={step < steps.length ? step : undefined} />
    </div>
  </section>;
}
