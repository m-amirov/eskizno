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
                Осваивайте линии, форму, цвет и работу со слоями шаг за шагом.
                Навыки пригодятся в любом графическом редакторе.
              </p>
              <button className="primary-button" type="button" onClick={() => setView('studio')}>
                Открыть свободную студию
              </button>
            </div>
            <div className="intro-preview" aria-label="Область будущего редактора">
              <div className="intro-preview-paper">
                <span className="preview-line preview-line-one" aria-hidden="true" />
                <span className="preview-line preview-line-two" aria-hidden="true" />
                <span className="preview-circle" aria-hidden="true" />
              </div>
              <p>Учебный холст и первые упражнения появятся здесь.</p>
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
