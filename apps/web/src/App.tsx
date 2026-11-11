import { useEffect, useState } from 'react';
import { ProjectGallery } from './studio/ProjectGallery';
import { Studio } from './studio/Studio';
import { useLocalProjects } from './studio/useLocalProjects';
import { LearningWorkspace } from './learning/LearningWorkspace';
import { E2_LESSONS } from './learning/lessons';

type View = 'start' | 'learning' | 'studio' | 'projects';

const navigation: ReadonlyArray<{ id: View; label: string }> = [
  { id: 'start', label: 'Обучение' },
  { id: 'studio', label: 'Свободная студия' },
  { id: 'projects', label: 'Мои работы' },
];

export function App() {
  const [view, setView] = useState<View>('start');
  const [navigating, setNavigating] = useState(false);
  const storage = useLocalProjects();
  const navigate = (next: View) => {
    if (navigating) return;
    if (next === 'studio') {
      // The professional canvas can be entered synchronously unless a lesson is active.
      // Preserve immediate pointer interaction during the asynchronous first boot.
      if (!storage.history.present.lesson) { setView('studio'); return; }
      setNavigating(true);
      void storage.openProfessionalWorkspace().then((okay) => { if (okay) setView('studio'); })
        .finally(() => setNavigating(false));
    } else {
      if (next !== view) void storage.flush();
      setView(next);
    }
  };

  const enterLesson = (lessonId?: string) => {
    setNavigating(true);
    void storage.startLesson(lessonId).then((okay) => { if (okay) setView('learning'); })
      .finally(() => setNavigating(false));
  };

  // A returning user can click Studio before IndexedDB finishes restoring a lesson.
  // Never expose that restored lesson with the unrestricted professional toolbar.
  useEffect(() => {
    if (view !== 'studio' || !storage.ready || !storage.history.present.lesson || navigating) return;
    setNavigating(true);
    void storage.openProfessionalWorkspace().then((okay) => {
      if (!okay) setView('learning');
    }).finally(() => setNavigating(false));
  }, [view, storage.ready, storage.history.present.lesson, navigating]);

  return (
    <div className={view === 'studio' || view === 'learning' ? 'app-shell app-shell-studio' : 'app-shell'}>
      <header className="site-header">
        <div className="header-inner">
          <div className="brand">
            <span className="brand-mark" aria-hidden="true">✳</span>
            <h1>Эскизно</h1>
          </div>
          <nav className="main-nav" aria-label="Разделы приложения">
            {navigation.map(({ id, label }) => (
              <button
                type="button"
                key={id}
                onClick={() => navigate(id)}
                className={id === view || (id === 'start' && view === 'learning') ? 'nav-button nav-button-active' : 'nav-button'}
                aria-current={id === view || (id === 'start' && view === 'learning') ? 'page' : undefined}
                disabled={navigating}
              >
                {label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="main-content">
        {view !== 'start' && storage.migrationMessage && <p className="migration-notice" role="alert">{storage.migrationMessage}</p>}
        {view === 'start' && (
          <section className="intro-page" aria-labelledby="intro-heading">
            <div className="intro-copy">
              <p className="section-kicker">Цифровое рисование для взрослых</p>
              <h2 id="intro-heading">Рисовать можно научиться.</h2>
              <p className="lead-text">
                Начните с трёх простых упражнений. Инструменты открываются по мере обучения,
                а в свободной студии всё доступно сразу.
              </p>
              <button className="primary-button" type="button" onClick={() => enterLesson()} disabled={!storage.ready || navigating}>
                {storage.learningProgress.completedLessonIds.includes('line-confidence-v1') ? 'Вернуться к уроку' : 'Начать урок линий'}
              </button>
              <div className="lesson-catalog" aria-label="Уроки рисования">
                {E2_LESSONS.map((lesson) => <button key={lesson.id} className="secondary-button" type="button"
                  disabled={!storage.ready || navigating} onClick={() => enterLesson(lesson.id)}>{lesson.title}</button>)}
              </div>
              <button className="secondary-button intro-studio-button" type="button" onClick={() => navigate('studio')} disabled={navigating}>
                Открыть свободную студию
              </button>
              {storage.learningMessage && <p className="import-error" role="alert">{storage.learningMessage}</p>}
            </div>
            <div className="intro-preview">
              <div className="intro-preview-paper" role="img" aria-label="Линейный этюд шара с направляющими и штриховкой">
                <svg className="intro-study" viewBox="0 0 720 540" aria-hidden="true" focusable="false">
                  <path className="intro-study-baseline" d="M111 416 C253 408 479 410 622 416" />
                  <path className="intro-study-shadow" d="M262 416 C303 434 447 435 502 418" />
                  <circle className="intro-study-outline" cx="379" cy="258" r="144" />
                  <path className="intro-study-guide" d="M379 97 V421 M217 258 H541" />
                  <path className="intro-study-contour" d="M293 143 C324 130 343 127 364 125 M506 284 C497 325 468 354 429 377" />
                  <g className="intro-study-hatch">
                    <path d="M288 345 L277 363 M305 355 L288 380 M323 362 L306 388 M342 369 L326 394 M361 374 L348 399" />
                    <path d="M379 375 L370 401 M398 374 L391 400 M417 370 L413 395 M436 363 L433 386" />
                  </g>
                </svg>
              </div>
              <p>Линейный этюд: форма, оси, светотень.</p>
            </div>
          </section>
        )}

        {view === 'learning' && <LearningWorkspace history={storage.history} progress={storage.learningProgress}
          saveStatus={storage.saveStatus} storageMessage={storage.storageMessage} learningMessage={storage.learningMessage}
          onAction={storage.apply} onUndo={storage.undo} onRedo={storage.redo} onRetry={() => { void storage.retry(); }}
          onComplete={storage.finishLesson} onCopy={storage.copyLessonToStudio} onCopied={() => setView('studio')}
          onPractice={storage.startPractice} onPracticing={() => setView('studio')}
          onBack={() => navigate('start')} />}

        {view === 'studio' && storage.history.present.lesson && <p className="migration-notice" role="status">Подготавливаем свободную студию…</p>}
        {view === 'studio' && !storage.history.present.lesson && <Studio history={storage.history} assets={storage.assets} saveStatus={storage.saveStatus}
          storageMessage={storage.storageMessage} onAction={storage.apply} onUndo={storage.undo} onRedo={storage.redo}
          onRetry={() => { void storage.retry(); }} onNewBlank={storage.createNew}
          onNewWithReference={storage.createWithReference} />}

        {view === 'projects' && <>
          {storage.storageMessage && <div className="gallery-storage-error" role="alert">{storage.storageMessage}
            <button className="secondary-button" type="button" onClick={() => { void storage.retry(); }}>Повторить сохранение</button>
          </div>}
          <ProjectGallery ready={storage.ready} projects={storage.projects} activeId={storage.history.present.id}
            onNew={() => { void storage.createNew().then((created) => { if (created) setView('studio'); }); }}
            onOpen={(id) => { void storage.open(id).then((okay) => { if (okay) {
              setView(storage.projects.find((item) => item.id === id)?.lessonId ? 'learning' : 'studio');
            } }); }}
            onDelete={storage.remove} onLoadPreview={storage.loadPreview} />
        </>}
      </main>
    </div>
  );
}
