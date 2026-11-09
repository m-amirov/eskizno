import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from 'react';

import { clientToNormalized, INITIAL_VIEW, normalizedWheelDelta, pinchView, screenToArtboard, wheelZoom, zoomView, type ViewState } from './geometry';
import type { ProjectHistory } from './history';
import { MAX_LAYERS, type DrawingProject, type PaintLayer, type Point, type ProjectAction, type Stroke } from './model';
import { renderProject } from './render';
import { PalettePopover } from './PalettePopover';
import { LayerList } from './LayerList';
import { recentAndCanvasColors } from './paletteHistory';

type Tool = 'ink' | 'erase';
type Gesture = { pointerId: number; layerId: string; points: Point[] };

interface EditorCanvasProps {
  history: ProjectHistory;
  onAction: (action: ProjectAction) => void;
  onUndo: () => void;
  onRedo: () => void;
}

function newId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `stroke-${Date.now()}-${Math.random()}`;
}

function layerWithPreview(project: DrawingProject, preview: Stroke | null, layerId: string | null): DrawingProject {
  if (!preview || !layerId) return project;
  return {
    ...project,
    layers: project.layers.map((layer) => layer.id === layerId && layer.kind === 'paint'
      ? { ...layer, strokes: [...layer.strokes, preview] }
      : layer),
  };
}

export function EditorCanvas({ history, onAction, onUndo, onRedo }: EditorCanvasProps) {
  const project = history.present;
  const layoutRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const touchPointers = useRef(new Map<number, Point>());
  const pinchPrevious = useRef<[Point, Point] | null>(null);
  const [preview, setPreview] = useState<Stroke | null>(null);
  const [view, setView] = useState<ViewState>(INITIAL_VIEW);
  const [tool, setTool] = useState<Tool>('ink');
  const [layersExpanded, setLayersExpanded] = useState(false);
  const [color, setColor] = useState(project.palette[0]);
  const [recentColors, setRecentColors] = useState<string[]>([]);
  const [size, setSize] = useState(8);
  const [nativeFullscreen, setNativeFullscreen] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [canvasDisplayWidth, setCanvasDisplayWidth] = useState<number | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const confirmClearButtonRef = useRef<HTMLButtonElement>(null);
  const immersive = nativeFullscreen || focusMode;
  const active = project.layers.find((layer) => layer.id === project.activeLayerId);
  const canDraw = active?.kind === 'paint' && active.visible && !active.locked;
  const pointCount = project.layers.reduce((sum, layer) => sum + (layer.kind === 'paint' ? layer.strokes.length : 0), 0);
  const displayedRecentColors = recentAndCanvasColors(recentColors, project, color);
  const selectColor = (next: string) => {
    setColor(next);
    setRecentColors((previous) => [next, ...previous.filter((entry) => entry.toLowerCase() !== next.toLowerCase())].slice(0, 8));
  };

  useEffect(() => { if (confirmClear) confirmClearButtonRef.current?.focus(); }, [confirmClear]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    renderProject(context, layerWithPreview(project, preview, gesture.current?.layerId ?? null), new Map(), {
      ...view,
      includeReferences: true,
    });
  }, [project, preview, view]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handleWheel = (event: WheelEvent) => {
      const rect = canvas.getBoundingClientRect();
      const anchor = clientToNormalized(event.clientX, event.clientY, rect);
      const delta = normalizedWheelDelta(event.deltaY, event.deltaMode, rect.height);
      if (!anchor || delta === null) return;
      event.preventDefault();
      setView((current) => wheelZoom(current, delta, anchor));
    };
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheel);
  }, []);

  useEffect(() => {
    const syncFullscreen = () => setNativeFullscreen(document.fullscreenElement === layoutRef.current);
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFocusMode(false);
    };
    document.addEventListener('fullscreenchange', syncFullscreen);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('fullscreenchange', syncFullscreen);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  useEffect(() => {
    if (!focusMode) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [focusMode]);

  useLayoutEffect(() => {
    if (!immersive || !stageRef.current) return;
    const stage = stageRef.current;
    const resize = () => {
      const style = getComputedStyle(stage);
      const availableWidth = stage.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const availableHeight = stage.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
      if (availableWidth > 0 && availableHeight > 0) {
        setCanvasDisplayWidth(Math.min(availableWidth, availableHeight * project.width / project.height));
      }
    };
    resize();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
    observer?.observe(stage);
    window.addEventListener('resize', resize);
    return () => { observer?.disconnect(); window.removeEventListener('resize', resize); };
  }, [immersive, project.width, project.height]);

  const toggleFullscreen = async () => {
    if (nativeFullscreen) {
      try { await document.exitFullscreen(); }
      catch { setNativeFullscreen(false); }
      return;
    }
    if (focusMode) { setFocusMode(false); return; }
    const layout = layoutRef.current;
    if (!layout?.requestFullscreen) { setFocusMode(true); return; }
    try {
      await layout.requestFullscreen();
      setNativeFullscreen(document.fullscreenElement === layout);
    } catch {
      setFocusMode(true);
    }
  };

  const pointerPoint = (event: PointerEvent<HTMLCanvasElement>): Point | null => {
    const rect = event.currentTarget.getBoundingClientRect();
    const normalized = clientToNormalized(event.clientX, event.clientY, rect);
    return normalized ? screenToArtboard(normalized, view) : null;
  };

  const previewStroke = (points: Point[]): Stroke => ({
    id: 'live-preview', kind: tool, brushId: 'pencil', color, width: size,
    opacity: 1, points,
  });

  const startStroke = (event: PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0) return;
    const pointerId = event.pointerId ?? 1;
    if (event.pointerType === 'touch') {
      const rect = event.currentTarget.getBoundingClientRect();
      const normalized = clientToNormalized(event.clientX, event.clientY, rect);
      if (!normalized) return;
      touchPointers.current.set(pointerId, normalized);
      event.currentTarget.setPointerCapture?.(pointerId);
      if (touchPointers.current.size >= 2) {
        cancelStroke();
        pinchPrevious.current = [...touchPointers.current.values()].slice(0, 2) as [Point, Point];
        return;
      }
    }
    if (!canDraw || gesture.current) return;
    const point = pointerPoint(event);
    if (!point) return;
    gesture.current = { pointerId, layerId: project.activeLayerId, points: [point] };
    setPreview(previewStroke([point]));
    event.currentTarget.setPointerCapture?.(pointerId);
  };

  const moveStroke = (event: PointerEvent<HTMLCanvasElement>) => {
    if (event.pointerType === 'touch' && touchPointers.current.has(event.pointerId ?? 1)) {
      const rect = event.currentTarget.getBoundingClientRect();
      const normalized = clientToNormalized(event.clientX, event.clientY, rect);
      if (!normalized) return;
      touchPointers.current.set(event.pointerId ?? 1, normalized);
      if (touchPointers.current.size >= 2) {
        const next = [...touchPointers.current.values()].slice(0, 2) as [Point, Point];
        if (pinchPrevious.current) {
          const previous = pinchPrevious.current;
          setView((current) => pinchView(current, previous, next));
        }
        pinchPrevious.current = next;
        return;
      }
    }
    if (!gesture.current || gesture.current.pointerId !== (event.pointerId ?? 1)) return;
    const point = pointerPoint(event);
    if (!point) return;
    const points = gesture.current.points;
    const last = points.at(-1);
    if (last && last.x === point.x && last.y === point.y) return;
    gesture.current.points = [...points, point];
    setPreview(previewStroke(gesture.current.points));
  };

  const finishStroke = (event: PointerEvent<HTMLCanvasElement>) => {
    if (event.pointerType === 'touch') {
      touchPointers.current.delete(event.pointerId ?? 1);
      if (pinchPrevious.current) {
        pinchPrevious.current = null;
        return;
      }
    }
    const current = gesture.current;
    if (!current || current.pointerId !== (event.pointerId ?? 1)) return;
    const end = pointerPoint(event);
    const last = current.points.at(-1);
    const points = end && (!last || last.x !== end.x || last.y !== end.y)
      ? [...current.points, end] : current.points;
    const stroke = { ...previewStroke(points), id: newId() };
    gesture.current = null;
    setPreview(null);
    if (event.currentTarget.hasPointerCapture?.(current.pointerId)) {
      event.currentTarget.releasePointerCapture(current.pointerId);
    }
    onAction({ type: 'addStroke', layerId: current.layerId, stroke });
  };

  const cancelStroke = () => { gesture.current = null; setPreview(null); };
  const cancelPointer = (event: PointerEvent<HTMLCanvasElement>) => {
    if (event.pointerType === 'touch') {
      touchPointers.current.delete(event.pointerId ?? 1);
      pinchPrevious.current = null;
    }
    if (gesture.current?.pointerId === (event.pointerId ?? 1)) cancelStroke();
  };

  const addLayer = () => {
    if (project.layers.length >= MAX_LAYERS) return;
    const layer: PaintLayer = {
      kind: 'paint', id: newId(), name: `Слой ${project.layers.filter((entry) => entry.kind === 'paint').length + 1}`,
      visible: true, locked: false, opacity: 1, strokes: [],
    };
    onAction({ type: 'addLayer', layer });
    onAction({ type: 'setActiveLayer', layerId: layer.id });
  };

  return (
    <div ref={layoutRef} className={focusMode ? 'studio-layout focus-mode' : 'studio-layout'}>
      <div className="studio-main">
        <div className="studio-toolbar" aria-label="Инструменты рисования">
          <button type="button" className={tool === 'ink' ? 'tool-active' : ''} onClick={() => setTool('ink')}>Карандаш</button>
          <button type="button" className={tool === 'erase' ? 'tool-active' : ''} onClick={() => setTool('erase')}>Ластик</button>
          <PalettePopover color={color} colors={project.palette} recentColors={displayedRecentColors} onSelect={selectColor} onSaveColor={(next) => {
            if (!project.palette.some((entry) => entry.toLowerCase() === next.toLowerCase())) {
              onAction({ type: 'setPalette', palette: [...project.palette, next] });
            }
          }} />
          <label className="studio-control">Толщина <input type="range" aria-label="Толщина линии" min="1" max="48" value={size} onChange={(event) => setSize(Number(event.target.value))} /> <span>{size} px</span></label>
          <span className="toolbar-divider" aria-hidden="true" />
          <button type="button" onClick={onUndo} disabled={!history.past.length}>Отменить</button>
          <button type="button" onClick={onRedo} disabled={!history.future.length}>Повторить</button>
          <button type="button" className="clear-trigger" onClick={() => { cancelStroke(); setConfirmClear(true); }} disabled={pointCount === 0}>Очистить</button>
          <button type="button" className="fullscreen-toggle" aria-pressed={immersive} onClick={toggleFullscreen}>{immersive ? 'Выйти из полного экрана' : 'Полный экран'}</button>
        </div>
        <div className="artboard-stage" ref={stageRef}>
          <canvas
            ref={canvasRef}
            className="drawing-canvas"
            width={project.width}
            height={project.height}
            role="img"
            aria-label="Холст для рисования"
            style={immersive && canvasDisplayWidth ? { width: `${canvasDisplayWidth}px` } : undefined}
            onPointerDown={startStroke}
            onPointerMove={moveStroke}
            onPointerUp={finishStroke}
            onPointerCancel={cancelPointer}
          />
        </div>
        {focusMode && <p className="fullscreen-fallback-note" role="status">Полный экран недоступен. Включён режим без элементов сайта.</p>}
        <div className="canvas-footer">
          <span>Штрихов: {pointCount}</span>
          <div className="zoom-controls">
            <button type="button" aria-label="Уменьшить" onClick={() => setView((current) => zoomView(current, current.zoom - 0.25))}>−</button>
            <span aria-live="polite">{Math.round(view.zoom * 100)}%</span>
            <button type="button" aria-label="Увеличить" onClick={() => setView((current) => zoomView(current, current.zoom + 0.25))}>+</button>
            <button type="button" onClick={() => setView(INITIAL_VIEW)}>Сброс масштаба</button>
          </div>
        </div>
      </div>
      <aside className="layers-panel" aria-label="Слои рисунка">
        <button className="layers-toggle" type="button" aria-expanded={layersExpanded} onClick={() => setLayersExpanded((value) => !value)}>
          Слои ({project.layers.length}) · {layersExpanded ? 'свернуть' : 'развернуть'}
        </button>
        <div className={layersExpanded ? 'layers-body open' : 'layers-body'}>
          <h3>Слои</h3>
          <p className="layers-hint">Верхний слой перекрывает нижний. Ластик действует только на выбранный слой.</p>
          <LayerList layers={project.layers} activeLayerId={project.activeLayerId} onAction={onAction} />
          <button className="secondary-button add-layer" type="button" onClick={addLayer} disabled={project.layers.length >= MAX_LAYERS}>Добавить слой</button>
          {!canDraw && <p className="layers-hint" role="status">Выбранный слой скрыт или заблокирован.</p>}
          <p className="draft-warning" role="note">Черновик пока хранится только до перезагрузки страницы. Сохранение появится на следующем этапе.</p>
        </div>
      </aside>
      {confirmClear && (
        <div className="clear-dialog-backdrop">
          <div className="clear-dialog" role="alertdialog" aria-modal="true" aria-labelledby="clear-dialog-title" aria-describedby="clear-dialog-description" onKeyDown={(event) => {
            if (event.key === 'Escape') { event.stopPropagation(); setConfirmClear(false); }
          }}>
            <h3 id="clear-dialog-title">Очистить рисунок?</h3>
            <p id="clear-dialog-description">Штрихи со всех слоёв будут удалены. Сами слои останутся, а рисунок можно будет вернуть кнопкой «Отменить».</p>
            <div className="clear-dialog-actions">
              <button type="button" onClick={() => setConfirmClear(false)}>Отмена очистки</button>
              <button type="button" ref={confirmClearButtonRef} className="clear-confirm-button" onClick={() => {
                cancelStroke();
                touchPointers.current.clear();
                pinchPrevious.current = null;
                onAction({ type: 'clearDrawing' });
                setConfirmClear(false);
              }}>Очистить рисунок</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
