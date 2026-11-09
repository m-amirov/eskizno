import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';

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

function EyeIcon({ visible }: { visible: boolean }) {
  return <svg aria-hidden="true" className="layer-eye-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
    <circle cx="12" cy="12" r="2.9" />
    {!visible && <path className="layer-eye-slash" d="M3 21 21 3" />}
  </svg>;
}

export function LayerList({ layers, activeLayerId, onAction }: LayerListProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<DragGesture | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [renamingLayerId, setRenamingLayerId] = useState<string | null>(null);
  const [draftLayerName, setDraftLayerName] = useState('');
  const [menuPosition, setMenuPosition] = useState({ top: 12, left: 12 });
  const menuRef = useRef<HTMLDivElement>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const confirmDeleteButtonRef = useRef<HTMLButtonElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const focusAfterRename = useRef(false);
  const paintLayerCount = layers.filter((layer) => layer.kind === 'paint').length;
  const deletingLayer = layers.find((layer) => layer.id === confirmDeleteId);
  // Portal stays within the fullscreen root (including CSS fallback) so the menu
  // is not hidden behind the studio's z-index stacking context.
  const overlayHost = listRef.current?.closest('.studio-layout') ?? document.body;

  useEffect(() => {
    if (!openMenuId) return;
    menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    const onOutside = (event: globalThis.PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node) && !menuTriggerRef.current?.contains(event.target as Node)) setOpenMenuId(null);
    };
    const onEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') { setOpenMenuId(null); menuTriggerRef.current?.focus(); }
    };
    const closeOnScroll = () => setOpenMenuId(null);
    document.addEventListener('pointerdown', onOutside);
    document.addEventListener('keydown', onEscape);
    window.addEventListener('scroll', closeOnScroll, true);
    return () => {
      document.removeEventListener('pointerdown', onOutside);
      document.removeEventListener('keydown', onEscape);
      window.removeEventListener('scroll', closeOnScroll, true);
    };
  }, [openMenuId]);

  useEffect(() => { if (confirmDeleteId) confirmDeleteButtonRef.current?.focus(); }, [confirmDeleteId]);

  useEffect(() => {
    if (!renamingLayerId) return;
    renameInputRef.current?.focus();
    renameInputRef.current?.select();
  }, [renamingLayerId]);

  useEffect(() => {
    if (renamingLayerId || !focusAfterRename.current) return;
    focusAfterRename.current = false;
    menuTriggerRef.current?.focus();
  }, [renamingLayerId]);

  const finishRename = (commit: boolean, restoreFocus = false) => {
    const name = draftLayerName.trim();
    if (commit && !name) return;
    if (commit && renamingLayerId) onAction({ type: 'renameLayer', layerId: renamingLayerId, name });
    focusAfterRename.current = restoreFocus;
    setRenamingLayerId(null);
  };

  const openMenu = (layer: Layer, trigger: HTMLButtonElement) => {
    if (openMenuId === layer.id) { setOpenMenuId(null); return; }
    menuTriggerRef.current = trigger;
    const rect = trigger.getBoundingClientRect();
    setMenuPosition({
      top: Math.max(12, Math.min(rect.bottom + 6, window.innerHeight - 110)),
      left: Math.max(12, Math.min(rect.right - 196, window.innerWidth - 208)),
    });
    setOpenMenuId(layer.id);
  };

  const deleteLayer = (layer: Layer) => {
    setOpenMenuId(null);
    if (layer.kind === 'paint' && layer.strokes.length > 0) setConfirmDeleteId(layer.id);
    else onAction({ type: 'removeLayer', layerId: layer.id });
  };

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
          {renamingLayerId === layer.id ? (
            <input
              ref={renameInputRef}
              className="layer-rename-input"
              type="text"
              aria-label={`Название слоя ${layer.name}`}
              value={draftLayerName}
              maxLength={120}
              onChange={(event) => setDraftLayerName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); finishRename(false, true); }
                if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); finishRename(true, true); }
              }}
              onBlur={() => { if (draftLayerName.trim()) finishRename(true); else finishRename(false); }}
            />
          ) : (
            <button type="button" onClick={() => onAction({ type: 'setActiveLayer', layerId: layer.id })} disabled={layer.kind !== 'paint'} aria-pressed={layer.id === activeLayerId}>
              {layer.name}{layer.id === activeLayerId ? ' · выбран' : ''}
            </button>
          )}
          <button type="button" className="layer-visibility-button" aria-label={`${layer.visible ? 'Скрыть' : 'Показать'} ${layer.name}`} aria-pressed={layer.visible} onClick={() => onAction({ type: 'setLayerVisibility', layerId: layer.id, visible: !layer.visible })}><EyeIcon visible={layer.visible} /></button>
          <button type="button" className="layer-menu-trigger" aria-label={`Действия со слоем ${layer.name}`} aria-haspopup="menu" aria-expanded={openMenuId === layer.id} onClick={(event) => openMenu(layer, event.currentTarget)}>
            <span aria-hidden="true">⋯</span>
          </button>
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
      {openMenuId && (() => {
        const layer = layers.find((entry) => entry.id === openMenuId);
        if (!layer) return null;
        const canDelete = !layer.locked && !(layer.kind === 'paint' && paintLayerCount <= 1);
        return createPortal(<div ref={menuRef} className="layer-actions-menu" role="menu" aria-label={`Действия слоя ${layer.name}`} style={menuPosition}>
          <p className="layer-actions-title">{layer.name}</p>
          <button type="button" role="menuitem" onClick={() => {
            setOpenMenuId(null);
            setDraftLayerName(layer.name);
            setRenamingLayerId(layer.id);
          }}>Переименовать</button>
          <button type="button" role="menuitem" onClick={() => {
            onAction({ type: 'setLayerLock', layerId: layer.id, locked: !layer.locked });
            setOpenMenuId(null);
            menuTriggerRef.current?.focus();
          }}>{layer.locked ? 'Разблокировать' : 'Заблокировать'}</button>
          <button type="button" role="menuitem" className="layer-delete-action" disabled={!canDelete} title={!canDelete ? 'Заблокированный или последний рисовальный слой удалить нельзя' : undefined} onClick={() => deleteLayer(layer)}>Удалить слой</button>
        </div>, overlayHost);
      })()}
      {deletingLayer && createPortal(<div className="clear-dialog-backdrop">
        <div className="clear-dialog" role="alertdialog" aria-modal="true" aria-labelledby="layer-delete-title" aria-describedby="layer-delete-description" onKeyDown={(event) => {
          if (event.key === 'Escape') { event.stopPropagation(); setConfirmDeleteId(null); menuTriggerRef.current?.focus(); }
        }}>
          <h3 id="layer-delete-title">Удалить слой «{deletingLayer.name}»?</h3>
          <p id="layer-delete-description">Штрихи этого слоя будут удалены вместе с ним. Действие можно отменить кнопкой «Отменить».</p>
          <div className="clear-dialog-actions">
            <button type="button" onClick={() => { setConfirmDeleteId(null); menuTriggerRef.current?.focus(); }}>Отмена удаления</button>
            <button type="button" ref={confirmDeleteButtonRef} className="clear-confirm-button" onClick={() => {
              onAction({ type: 'removeLayer', layerId: deletingLayer.id });
              setConfirmDeleteId(null);
            }}>Подтвердить удаление</button>
          </div>
        </div>
      </div>, overlayHost)}
    </div>
  );
}
