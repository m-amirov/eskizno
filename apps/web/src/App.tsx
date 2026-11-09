import { useState } from 'react';

type View = 'start' | 'studio' | 'projects';

const navigation: ReadonlyArray<{ id: View; label: string }> = [
  { id: 'start', label: 'Обучение' },
  { id: 'studio', label: 'Свободная студия' },
  { id: 'projects', label: 'Мои работы' },
];

export function App() {
  const [view, setView] = useState<View>('start');

  return (
    <div className="app-shell">
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
              <p>Здесь будет редактор для рисунков и загруженных эскизов.</p>
            </div>
            <div className="empty-workspace">
              <div className="empty-workspace-content">
                <span className="empty-workspace-symbol" aria-hidden="true">✎</span>
                <strong>Место для вашего рисунка</strong>
                <span>Холст, кисти, палитра и слои появятся в следующих этапах.</span>
              </div>
            </div>
          </section>
        )}

        {view === 'projects' && (
          <section className="projects-page" aria-labelledby="projects-heading">
            <p className="section-kicker">Ваше пространство</p>
            <h2 id="projects-heading">Мои работы</h2>
            <div className="empty-projects">
              <div>
                <strong>Здесь пока нет работ</strong>
                <p>Сохранение и открытие проектов добавим вместе с редактором.</p>
              </div>
              <button className="secondary-button" type="button" onClick={() => setView('studio')}>
                Перейти в студию
              </button>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
