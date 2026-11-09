import { EditorCanvas } from '../editor/EditorCanvas';
import type { ProjectHistory } from '../editor/history';
import type { ProjectAction } from '../editor/model';
import type { SaveStatus } from './useLocalProjects';

interface StudioProps {
  history: ProjectHistory;
  saveStatus: SaveStatus;
  storageMessage: string | null;
  onAction: (action: ProjectAction) => void;
  onUndo: () => void;
  onRedo: () => void;
  onRetry: () => void;
}

export function Studio({ history, saveStatus, storageMessage, onAction, onUndo, onRedo, onRetry }: StudioProps) {
  return (
    <section className="workspace-page" aria-labelledby="studio-heading">
      <div className="workspace-heading">
        <p className="section-kicker">Практика без ограничений</p>
        <h2 id="studio-heading">Свободная студия</h2>
        <p>Рисуйте мышью на холсте и работайте с несколькими независимыми слоями.</p>
      </div>
      <EditorCanvas history={history} onAction={onAction} onUndo={onUndo} onRedo={onRedo}
        saveStatus={saveStatus} storageMessage={storageMessage} onRetry={onRetry} />
    </section>
  );
}
