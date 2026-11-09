import type { ProjectAction, ReferenceLayer, ReferenceTransform } from '../editor/model';

interface ReferencePanelProps {
  layer: ReferenceLayer;
  url?: string;
  failed?: boolean;
  onAction: (action: ProjectAction) => void;
}

export function ReferencePanel({ layer, url, failed, onAction }: ReferencePanelProps) {
  const update = (patch: Partial<ReferenceTransform>) => {
    onAction({ type: 'setReferenceTransform', layerId: layer.id,
      transform: { ...layer.transform, ...patch } });
  };
  const degree = Math.round(layer.transform.rotation * 180 / Math.PI);
  return (
    <section className="reference-panel" aria-label="Настройки референса">
      <div className="reference-panel-heading">
        <strong>Референс</strong>
        <button type="button" className="secondary-button" onClick={() => onAction({
          type: 'setLayerVisibility', layerId: layer.id, visible: !layer.visible,
        })}>{layer.visible ? 'Показать без эскиза' : 'Показать эскиз'}</button>
      </div>
      {layer.placement === 'side' && layer.visible && (
        <div className="reference-side-preview" role="region" aria-label="Референс рядом с холстом">
          {failed ? <p>Не удалось загрузить изображение.</p>
            : url ? <img src={url} alt="Загруженный референс" style={{ opacity: layer.opacity }} />
              : <p>Загрузка изображения…</p>}
        </div>
      )}
      <div className="reference-controls">
        <label>Непрозрачность референса
          <input type="range" aria-label="Непрозрачность референса" min="0" max="100"
            value={Math.round(layer.opacity * 100)} onChange={(event) => onAction({
              type: 'setLayerOpacity', layerId: layer.id, opacity: Number(event.target.value) / 100,
            })} />
          <span>{Math.round(layer.opacity * 100)}%</span>
        </label>
        <button type="button" className="reference-lock" aria-pressed={layer.locked}
          onClick={() => onAction({ type: 'setLayerLock', layerId: layer.id, locked: !layer.locked })}>
          {layer.locked ? 'Разблокировать для изменения' : 'Заблокировать референс'}
        </button>
        {layer.placement === 'overlay' && (
          <div className="reference-transform-controls">
            <label>Масштаб
              <input type="range" aria-label="Масштаб референса" min="20" max="400"
                value={Math.round(layer.transform.scale * 100)} disabled={layer.locked}
                onChange={(event) => update({ scale: Number(event.target.value) / 100 })} />
              <span>{Math.round(layer.transform.scale * 100)}%</span>
            </label>
            <label>Поворот
              <input type="range" aria-label="Поворот референса" min="-180" max="180"
                value={degree} disabled={layer.locked}
                onChange={(event) => update({ rotation: Number(event.target.value) * Math.PI / 180 })} />
              <span>{degree}°</span>
            </label>
            <label>По горизонтали
              <input type="range" aria-label="Смещение референса по X" min="-100" max="100"
                value={Math.round(layer.transform.x * 100)} disabled={layer.locked}
                onChange={(event) => update({ x: Number(event.target.value) / 100 })} />
            </label>
            <label>По вертикали
              <input type="range" aria-label="Смещение референса по Y" min="-100" max="100"
                value={Math.round(layer.transform.y * 100)} disabled={layer.locked}
                onChange={(event) => update({ y: Number(event.target.value) / 100 })} />
            </label>
            {layer.locked && <p className="reference-help">Разблокируйте референс, чтобы перемещать, вращать и масштабировать его.</p>}
          </div>
        )}
      </div>
    </section>
  );
}
