import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type KeyboardEvent } from 'react';

import type { ProjectAction, ReferenceLayer, ReferenceTransform } from '../editor/model';
import { constrainPreview, panPreview, resetPreview, zoomPreviewAt, type PreviewView } from './referenceViewport';

interface ReferencePanelProps {
  layer: ReferenceLayer;
  url?: string;
  failed?: boolean;
  onAction: (action: ProjectAction) => void;
}

export function ReferencePanel({ layer, url, failed, onAction }: ReferencePanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [view, setView] = useState<PreviewView>(resetPreview);
  const viewRef = useRef(view);
  const viewportRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const dimensions = () => ({
    frame: { width: viewportRef.current?.clientWidth ?? 0, height: viewportRef.current?.clientHeight ?? 0 },
    image: { width: imageRef.current?.naturalWidth ?? 0, height: imageRef.current?.naturalHeight ?? 0 },
  });
  const updateView = (next: (current: PreviewView) => PreviewView) => {
    const updated = next(viewRef.current);
    viewRef.current = updated;
    setView(updated);
  };
  const resetView = () => updateView(() => resetPreview());
  const zoomTo = (zoom: number, x = 0, y = 0) => {
    const { frame, image } = dimensions();
    updateView((current) => zoomPreviewAt(current, zoom, { x, y }, frame, image));
  };
  const pointerPosition = (event: ReactPointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - bounds.left - bounds.width / 2, y: event.clientY - bounds.top - bounds.height / 2 };
  };
  const endPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  // Preview navigation is transient; it never changes the imported reference layer or the drawing.
  useEffect(() => {
    viewRef.current = resetPreview();
    setView(viewRef.current);
    pointers.current.clear();
    setCollapsed(false);
  }, [layer.assetId]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !url || failed) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const bounds = viewport.getBoundingClientRect();
      const { frame, image } = dimensions();
      const amount = Math.exp(-event.deltaY * .0016);
      updateView((current) => zoomPreviewAt(current, current.zoom * amount,
        { x: event.clientX - bounds.left - bounds.width / 2,
          y: event.clientY - bounds.top - bounds.height / 2 }, frame, image));
    };
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => {
      const { frame, image } = dimensions();
      if (frame.width > 0 && frame.height > 0 && image.width > 0 && image.height > 0) {
        updateView((current) => constrainPreview(current, frame, image));
      }
    });
    viewport.addEventListener('wheel', wheel, { passive: false });
    resize?.observe(viewport);
    return () => { viewport.removeEventListener('wheel', wheel); resize?.disconnect(); };
  }, [url, failed, collapsed]);

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
        {layer.placement === 'side' && <button type="button" className="reference-collapse"
          aria-expanded={!collapsed} onClick={() => setCollapsed((value) => !value)}>
          {collapsed ? 'Развернуть референс' : 'Свернуть референс'}
        </button>}
      </div>
      {layer.placement === 'side' && !collapsed && (
        <>
          {layer.visible && <div className="reference-side-preview" role="region" aria-label="Референс рядом с холстом"
            ref={viewportRef} tabIndex={url && !failed ? 0 : -1}
            onPointerDown={(event) => {
              if (!url || failed || event.button !== 0 && event.pointerType === 'mouse') return;
              event.currentTarget.setPointerCapture(event.pointerId);
              pointers.current.set(event.pointerId, pointerPosition(event));
            }}
            onPointerMove={(event) => {
              const previous = pointers.current.get(event.pointerId);
              if (!previous) return;
              const current = pointerPosition(event);
              const before = [...pointers.current.values()];
              pointers.current.set(event.pointerId, current);
              const after = [...pointers.current.values()];
              const { frame, image } = dimensions();
              if (before.length === 2 && after.length === 2) {
                const distance = (items: typeof before) => Math.hypot(items[0].x - items[1].x, items[0].y - items[1].y);
                const midpoint = (items: typeof before) => ({ x: (items[0].x + items[1].x) / 2,
                  y: (items[0].y + items[1].y) / 2 });
                const ratio = distance(before) > 0 ? distance(after) / distance(before) : 1;
                const origin = midpoint(before), target = midpoint(after);
                updateView((viewBefore) => panPreview(
                  zoomPreviewAt(viewBefore, viewBefore.zoom * ratio, origin, frame, image),
                  target.x - origin.x, target.y - origin.y, frame, image));
              } else if (before.length === 1) {
                updateView((viewBefore) => panPreview(viewBefore, current.x - previous.x, current.y - previous.y, frame, image));
              }
            }}
            onPointerUp={endPointer} onPointerCancel={endPointer} onLostPointerCapture={(event) => pointers.current.delete(event.pointerId)}
            onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
              const displacement = ({ ArrowLeft: [-24, 0], ArrowRight: [24, 0], ArrowUp: [0, -24], ArrowDown: [0, 24] } as Record<string, number[]>)[event.key];
              if (!displacement) return;
              event.preventDefault();
              const { frame, image } = dimensions();
              updateView((current) => panPreview(current, displacement[0], displacement[1], frame, image));
            }}>
            {failed ? <p>Не удалось загрузить изображение.</p>
              : url ? <img ref={imageRef} src={url} alt="Загруженный референс" draggable={false}
                style={{ opacity: layer.opacity, transform: `translate(${view.panX}px, ${view.panY}px) scale(${view.zoom})` }}
                onLoad={resetView} />
                : <p>Загрузка изображения…</p>}
          </div>}
          {layer.visible && url && !failed && <div className="reference-zoom-controls" aria-label="Масштаб просмотра">
            <button type="button" aria-label="Уменьшить референс" title="Уменьшить референс"
              onClick={() => zoomTo(view.zoom - .25)} disabled={view.zoom <= .25}>−</button>
            <label>
              <input type="range" aria-label="Масштаб просмотра референса" min="25" max="400" step="1"
                value={Math.round(view.zoom * 100)} onChange={(event) => zoomTo(Number(event.target.value) / 100)} />
              <output>{Math.round(view.zoom * 100)}%</output>
            </label>
            <button type="button" aria-label="Увеличить референс" title="Увеличить референс"
              onClick={() => zoomTo(view.zoom + .25)} disabled={view.zoom >= 4}>+</button>
            <button type="button" className="reference-fit-button" aria-label="Вписать референс" onClick={resetView}>Вписать</button>
          </div>}
        </>
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
