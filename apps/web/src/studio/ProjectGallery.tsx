import { useEffect, useRef, useState } from 'react';
import type { ProjectSummary } from '../editor/persistence';
import type { SavedProject } from '../editor/persistence';
import { ProjectThumbnail } from './ProjectThumbnail';

interface ProjectGalleryProps {
  ready: boolean;
  projects: ProjectSummary[];
  activeId: string;
  onNew: () => void;
  onOpen: (id: string) => void;
  onDelete: (id: string) => Promise<boolean>;
  onLoadPreview: (id: string) => Promise<SavedProject | null>;
}

function dateLabel(timestamp: number): string {
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(timestamp);
}

export function ProjectGallery({ ready, projects, activeId, onNew, onOpen, onDelete, onLoadPreview }: ProjectGalleryProps) {
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const priorFocus = useRef<HTMLElement | null>(null);
  const selected = projects.find(({ id }) => id === deleteId);

  useEffect(() => {
    if (deleteId) dialogRef.current?.focus();
    else if (priorFocus.current) {
      const fallback = document.querySelector<HTMLElement>('.projects-topline button');
      (priorFocus.current.isConnected ? priorFocus.current : fallback)?.focus();
      priorFocus.current = null;
    }
  }, [deleteId]);

  const askToDelete = (id: string) => {
    priorFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setDeleteId(id);
  };

  const confirmDelete = async () => {
    if (!deleteId || deleting) return;
    setDeleting(true);
    try {
      const removed = await onDelete(deleteId);
      if (removed) setDeleteId(null);
    } finally { setDeleting(false); }
  };

  return (
    <section className="projects-page" aria-labelledby="projects-heading">
      <div className="projects-topline">
        <div>
          <p className="section-kicker">Ваше пространство</p>
          <h2 id="projects-heading">Мои работы</h2>
        </div>
        {ready && <button className="primary-button" type="button" onClick={onNew}>Новая работа</button>}
      </div>
      {!ready ? <p role="status">Загружаем сохранённые работы…</p>
        : projects.length === 0 ? (
          <section className="empty-projects" aria-labelledby="empty-projects-heading">
            <div className="empty-projects-art"><div className="empty-projects-paper" aria-hidden="true" /></div>
            <div className="empty-projects-copy">
              <h3 id="empty-projects-heading">Здесь пока нет работ</h3>
              <p>Ваши рисунки появятся здесь после сохранения в этом браузере.</p>
              <button className="secondary-button" type="button" onClick={onNew}>Перейти в студию</button>
            </div>
          </section>
        ) : (
          <div className="project-grid" aria-label="Сохранённые работы">
            {projects.map((project) => (
              <article className="project-card" key={project.id}>
                <div className="project-card-art"><ProjectThumbnail id={project.id} revision={project.updatedAt} load={onLoadPreview} /></div>
                <div className="project-card-content">
                  <h3>{project.title}</h3>
                  <p>Изменено {dateLabel(project.updatedAt)}{project.id === activeId && <span> · открыта</span>}</p>
                  <div className="project-card-actions">
                    <button className="secondary-button" type="button" onClick={() => onOpen(project.id)} aria-label={`Открыть работу «${project.title}»`}>Открыть</button>
                    <button className="project-delete" type="button" onClick={() => askToDelete(project.id)} aria-label={`Удалить работу «${project.title}»`}>Удалить</button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      {selected && (
        <div className="delete-dialog-backdrop">
          <div ref={dialogRef} className="delete-dialog" role="alertdialog" tabIndex={-1} aria-modal="true" aria-labelledby="delete-project-title" aria-describedby="delete-project-copy"
            onKeyDown={(event) => {
              if (event.key === 'Escape' && !deleting) { event.preventDefault(); setDeleteId(null); }
              if (event.key !== 'Tab') return;
              const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
              const first = buttons[0], last = buttons.at(-1);
              if (!first || !last) return;
              if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
              else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
              else if (document.activeElement === dialogRef.current) { event.preventDefault(); first.focus(); }
            }}>
            <h3 id="delete-project-title">Удалить работу?</h3>
            <p id="delete-project-copy">«{selected.title}» будет удалена из этого браузера без возможности восстановления.</p>
            <div className="delete-dialog-actions">
              <button className="secondary-button" type="button" disabled={deleting} onClick={() => setDeleteId(null)}>Отмена удаления</button>
              <button className="delete-confirm" type="button" disabled={deleting} onClick={() => { void confirmDelete(); }}>Удалить безвозвратно</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
