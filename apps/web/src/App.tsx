import { useEffect, useState } from 'react';
import { EditorCanvas } from './editor/EditorCanvas';
import { createProjectHistory, commitAction, redoAction, undoAction } from './editor/history';
import { createProject, type ProjectAction } from './editor/model';

type View = 'start' | 'studio' | 'projects';

const navigation: ReadonlyArray<{ id: View; label: string }> = [
  { id: 'start', label: 'Обучение' },
  { id: 'studio', label: 'Свободная студия' },
  { id: 'projects', label: 'Мои работы' },
];

export function App() {
  const [view, setView] = useState<View>('start');
  const [history, setHistory] = useState(() => createProjectHistory(createProject()));
  const apply = (action: ProjectAction) => setHistory((current) => commitAction(current, action));

  useEffect(() => {
    const hasUnsavedWork = [history.present, ...history.past, ...history.future].some((project) => (
      project.layers.length > 1 || project.layers.some((layer) => layer.kind === 'paint' && layer.strokes.length > 0)
    ));
    if (!hasUnsavedWork) return;
    const warnOnExit = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnOnExit);
    return () => window.removeEventListener('beforeunload', warnOnExit);
  }, [history]);

  return (
    <div className={view === 'studio' ? 'app-shell app-shell-studio' : 'app-shell'}>
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
                onClick={() => setView(id)}
                className={id === view ? 'nav-button nav-button-active' : 'nav-button'}
                aria-current={id === view ? 'page' : undefined}
              >
                {label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="main-content">
        {view === 'start' && (
          <section className="intro-page" aria-labelledby="intro-heading">
            <div className="intro-copy">
              <p className="section-kicker">Цифровое рисование для взрослых</p>
              <h2 id="intro-heading">Рисовать можно научиться.</h2>
              <p className="lead-text">
                Начните со свободной практики: пробуйте кисти, формы и слои.
                Пошаговые уроки появятся позже.
              </p>
              <button className="primary-button" type="button" onClick={() => setView('studio')}>
                Открыть свободную студию
              </button>
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

        {view === 'studio' && (
          <section className="workspace-page" aria-labelledby="studio-heading">
            <div className="workspace-heading">
              <p className="section-kicker">Практика без ограничений</p>
              <h2 id="studio-heading">Свободная студия</h2>
              <p>Рисуйте мышью на холсте и работайте с несколькими независимыми слоями.</p>
            </div>
            <EditorCanvas history={history} onAction={apply} onUndo={() => setHistory(undoAction)} onRedo={() => setHistory(redoAction)} />
          </section>
        )}

        {view === 'projects' && (
          <section className="projects-page" aria-labelledby="projects-heading">
            <h2 id="projects-heading">Мои работы</h2>
            <section className="empty-projects" aria-labelledby="empty-projects-heading">
              <div className="empty-projects-art">
                <div className="empty-projects-paper" aria-hidden="true" />
              </div>
              <div className="empty-projects-copy">
                <h3 id="empty-projects-heading">Здесь пока нет работ</h3>
                <p>Сохранение рисунков появится позже. Сейчас черновик доступен в студии, но после перезагрузки рисунок исчезнет.</p>
                <button className="primary-button" type="button" onClick={() => setView('studio')}>
                  Перейти в студию
                </button>
              </div>
            </section>
          </section>
        )}
      </main>
    </div>
  );
}
