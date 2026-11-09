import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';

import type { Layer, ProjectAction } from './model';

interface LayerListProps {
  layers: readonly Layer[];
  activeLayerId: string;
  onAction: (action: ProjectAction) => void;
}

interface DragGesture {
  pointerId: number;
  layerId: string;
  startY: number;
  started: boolean;
}

export function LayerList({ layers, activeLayerId, onAction }: LayerListProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<DragGesture | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [targetId, setTargetId] = useState<string | null>(null);

  const targetAt = (y: number): string | null => {
    const list = listRef.current;
    if (!list) return null;
    const bounds = list.getBoundingClientRect();
    if (y < bounds.top || y > bounds.bottom) return null;
    const rows = Array.from(list.querySelectorAll<HTMLElement>('.layer-row'));
    if (!rows.length) return null;
    return rows.reduce((nearest, row) => {
      const rect = row.getBoundingClientRect();
      const currentDistance = Math.abs(y - (rect.top + rect.height / 2));
      const nearestRect = nearest.getBoundingClientRect();
      const nearestDistance = Math.abs(y - (nearestRect.top + nearestRect.height / 2));
      return currentDistance < nearestDistance ? row : nearest;
    }).dataset.layerId ?? null;
  };

  const resetDrag = () => {
    dragging.current = null;
    setDraggedId(null);
    setTargetId(null);
  };

  const pointerDown = (layer: Layer) => (event: PointerEvent<HTMLButtonElement>) => {
    if (layer.locked || event.button !== 0) return;
    dragging.current = { pointerId: event.pointerId, layerId: layer.id, startY: event.clientY, started: false };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const pointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const current = dragging.current;
    if (!current || current.pointerId !== event.pointerId) return;
    if (!current.started && Math.abs(event.clientY - current.startY) < 6) return;
    current.started = true;
    setDraggedId(current.layerId);
    setTargetId(targetAt(event.clientY));
  };

  const pointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    const current = dragging.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const target = current.started ? targetAt(event.clientY) : null;
    resetDrag();
    if (!target || target === current.layerId) return;
    const index = layers.findIndex((layer) => layer.id === target);
    if (index !== -1) onAction({ type: 'reorderLayer', layerId: current.layerId, toIndex: index });
  };

  const keyDown = (layer: Layer) => (event: KeyboardEvent<HTMLButtonElement>) => {
    if (layer.locked || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const index = layers.findIndex((entry) => entry.id === layer.id);
    const next = index + (event.key === 'ArrowUp' ? 1 : -1);
    if (next >= 0 && next < layers.length) onAction({ type: 'reorderLayer', layerId: layer.id, toIndex: next });
  };

  return (
    <div className="layers-list" ref={listRef}>
      {[...layers].reverse().map((layer) => (
        <div
          key={layer.id}
          data-layer-id={layer.id}
          className={[
            'layer-row', layer.id === activeLayerId ? 'selected' : '',
            layer.id === draggedId ? 'dragging' : '', layer.id === targetId && draggedId !== targetId ? 'drag-target' : '',
          ].filter(Boolean).join(' ')}
        >
          <button type="button" onClick={() => onAction({ type: 'setActiveLayer', layerId: layer.id })} disabled={layer.kind !== 'paint'} aria-pressed={layer.id === activeLayerId}>
            {layer.name}{layer.id === activeLayerId ? ' · выбран' : ''}
          </button>
          <button type="button" aria-label={`${layer.visible ? 'Скрыть' : 'Показать'} ${layer.name}`} onClick={() => onAction({ type: 'setLayerVisibility', layerId: layer.id, visible: !layer.visible })}>{layer.visible ? '◉' : '○'}</button>
          <button type="button" aria-label={`${layer.locked ? 'Разблокировать' : 'Заблокировать'} ${layer.name}`} onClick={() => onAction({ type: 'setLayerLock', layerId: layer.id, locked: !layer.locked })}>{layer.locked ? '🔒' : '○'}</button>
          <button
            type="button"
            className="layer-drag-handle"
            aria-label={`Перетащить ${layer.name}`}
            aria-keyshortcuts="ArrowUp ArrowDown"
            title="Перетащите слой или используйте стрелки ↑↓"
            disabled={layer.locked}
            onPointerDown={pointerDown(layer)}
            onPointerMove={pointerMove}
            onPointerUp={pointerUp}
            onPointerCancel={resetDrag}
            onKeyDown={keyDown(layer)}
          >
            <span aria-hidden="true">⠿</span>
          </button>
        </div>
      ))}
    </div>
  );
}
