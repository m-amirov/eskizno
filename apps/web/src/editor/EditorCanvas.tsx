import { useEffect, useId, useLayoutEffect, useRef, useState, type PointerEvent } from 'react';

import { clientToNormalized, INITIAL_VIEW, normalizedWheelDelta, pinchView, screenToArtboard, wheelZoom, zoomView, type ViewState } from './geometry';
import type { ProjectHistory } from './history';
import { applyAction, getPaintOperations, getShapes, MAX_LAYERS, type BrushId, type PaintLayer, type Point, type ProjectAction, type Shape, type ShapeKind, type ShapeStyle, type Stroke } from './model';
import { pickCompositedColor, renderProject } from './render';
import { hitTestShape, moveShape, resizeShape, shapeHandleAt, type ShapeHandle } from './shapeGeometry';
import { PalettePopover } from './PalettePopover';
import { BrushPicker } from './BrushPicker';
import { ToolIcon } from './ToolIcon';
import { LayerList } from './LayerList';
import { recentAndCanvasColors } from './paletteHistory';
import { fitCanvasWidth } from './canvasFit';
import { normalizeToolSettings } from './brushes';
import { exportPng } from './export';
import type { SaveStatus } from '../studio/useLocalProjects';
import { isToolAvailable, PROFESSIONAL_TOOL_ACCESS, type ToolAvailabilityContext } from './toolAccess';
import { handleAt, handleFrame, hitTestSelectable, itemsInMarquee, moveSelectionFrame, normalizeFrame,
  resizeSelectionDrag, selectionBounds, transformationForFrame, type SelectionBounds,
  type SelectionTransform } from './selection';

type Tool = 'ink' | 'erase' | 'fill' | 'shape' | 'eyedropper' | 'select';
type StrokeGesture = { kind: 'stroke'; pointerId: number; layerId: string; stroke: Stroke };
type FillGesture = { kind: 'fill'; pointerId: number; layerId: string; point: Point };
type ShapeGesture = { kind: 'shape'; pointerId: number; layerId: string; shape: Shape };
type EditGesture = { kind: 'edit'; pointerId: number; layerId: string; shapeId: string;
  original: Shape; start: Point; current: Shape; handle: ShapeHandle | 'move' };
type PendingGesture = { kind: 'pending'; pointerId: number; layerId: string; shape: Shape;
  start: Point; points: Point[]; strokeSnapshot: Stroke;
  clientX: number; clientY: number; timer: ReturnType<typeof setTimeout> };
type MarqueeGesture = { kind: 'marquee'; pointerId: number; layerId: string; start: Point };
type TransformGesture = { kind: 'transform'; pointerId: number; layerId: string;
  start: Point; frame: SelectionBounds; ids: string[]; handle: ShapeHandle | 'move' };
type Gesture = StrokeGesture | FillGesture | ShapeGesture | EditGesture | PendingGesture | MarqueeGesture | TransformGesture;
const SHAPE_HOLD_MS = 500;
const DRAW_MOVEMENT_THRESHOLD_PX = 8;

function appendDistinctPoints(existing: readonly Point[], incoming: readonly Point[]): Point[] {
  const result = [...existing];
  for (const point of incoming) {
    const last = result.at(-1);
    if (!last || last.x !== point.x || last.y !== point.y) result.push(point);
  }
  return result;
}

interface EditorCanvasProps {
  history: ProjectHistory;
  referenceImages?: ReadonlyMap<string, CanvasImageSource>;
  onAction: (action: ProjectAction) => void;
  onUndo: () => void;
  onRedo: () => void;
  saveStatus?: SaveStatus;
  storageMessage?: string | null;
  onRetry?: () => void;
  toolAccess?: ToolAvailabilityContext;
  lessonStep?: number;
}

function newId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `stroke-${Date.now()}-${Math.random()}`;
}

export function EditorCanvas({ history, referenceImages, onAction, onUndo, onRedo, saveStatus, storageMessage, onRetry,
  toolAccess = PROFESSIONAL_TOOL_ACCESS, lessonStep }: EditorCanvasProps) {
  const project = history.present;
  const layoutRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const downloadEmergencyPng = () => {
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = project.width;
    exportCanvas.height = project.height;
    const context = exportCanvas.getContext('2d');
    if (!context) return;
    renderProject(context, project, referenceImages ?? new Map(), {
      zoom: 1, panX: 0, panY: 0, includeReferences: true,
    });
    context.globalCompositeOperation = 'destination-over';
    context.fillStyle = '#fffcf6';
    context.fillRect(0, 0, project.width, project.height);
    const link = document.createElement('a');
    link.href = exportCanvas.toDataURL('image/png');
    link.download = `${project.title.replace(/[\\/:*?"<>|]/g, '_').trim().slice(0, 70) || 'eskizno'}.png`;
    link.click();
  };
  const stageRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const gestureProject = useRef(project);
  const touchPointers = useRef(new Map<number, Point>());
  const pinchPrevious = useRef<[Point, Point] | null>(null);
  const penPointer = useRef<number | null>(null);
  const paintCache = useRef(new WeakMap<PaintLayer, HTMLCanvasElement | OffscreenCanvas>());
  const shapePrefixCache = useRef(new WeakMap<PaintLayer, { shapeId: string; surface: HTMLCanvasElement | OffscreenCanvas }>());
  const transformPrefixCache = useRef(new WeakMap<PaintLayer, { firstChangedIndex: number; surface: HTMLCanvasElement | OffscreenCanvas }>());
  const [preview, setPreview] = useState<Stroke | null>(null);
  const [previewShape, setPreviewShape] = useState<Shape | null>(null);
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [marquee, setMarquee] = useState<SelectionBounds | null>(null);
  const [transformPreview, setTransformPreview] = useState<({ layerId: string; ids: string[] } & SelectionTransform) | null>(null);
  const [view, setView] = useState<ViewState>(INITIAL_VIEW);
  const [tool, setTool] = useState<Tool>('ink');
  const canUseTool = (candidate: Tool) => isToolAvailable(candidate, toolAccess);
  const [brushId, setBrushId] = useState<BrushId>('pencil');
  const [layersExpanded, setLayersExpanded] = useState(false);
  const [color, setColor] = useState(project.palette[0]);
  const [recentColors, setRecentColors] = useState<string[]>([]);
  const [brushSize, setBrushSize] = useState(8);
  const [eraserSize, setEraserSize] = useState(8);
  const [brushOpacity, setBrushOpacity] = useState(100);
  const [shapeKind, setShapeKind] = useState<ShapeKind>('rectangle');
  const [shapeStyle, setShapeStyle] = useState<ShapeStyle>('both');
  const [nativeFullscreen, setNativeFullscreen] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [canvasDisplayWidth, setCanvasDisplayWidth] = useState<number | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportWithReference, setExportWithReference] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const layersBodyId = useId();
  const confirmClearButtonRef = useRef<HTMLButtonElement>(null);
  const immersive = nativeFullscreen || focusMode;
  const settings = normalizeToolSettings({ brushSize, eraserSize, opacity: brushOpacity / 100 });
  const size = tool === 'erase' ? settings.eraserSize : settings.brushSize;
  const changeSize = (next: number) => {
    const normalized = normalizeToolSettings({ brushSize: next, eraserSize: next, opacity: settings.opacity });
    if (tool === 'erase') setEraserSize(normalized.eraserSize);
    else setBrushSize(normalized.brushSize);
  };
  const active = project.layers.find((layer) => layer.id === project.activeLayerId);
  const canDraw = active?.kind === 'paint' && active.visible && !active.locked;
  const pointCount = project.layers.reduce((sum, layer) => sum + (layer.kind === 'paint' ? layer.strokes.length : 0), 0);
  const contentCount = project.layers.reduce((sum, layer) => sum + (layer.kind === 'paint'
    ? getPaintOperations(layer).length : 0), 0);
  const selectedShape = active?.kind === 'paint'
    ? getShapes(active).find((shape) => shape.id === selectedShapeId) : undefined;
  const displayedRecentColors = recentAndCanvasColors(recentColors, project, color);
  const hasOverlayReference = project.layers.some((layer) => layer.kind === 'reference' && layer.placement === 'overlay');
  const selectColor = (next: string) => {
    setColor(next);
    setRecentColors((previous) => [next, ...previous.filter((entry) => entry.toLowerCase() !== next.toLowerCase())].slice(0, 8));
  };

  const downloadPng = async () => {
    setExportError(null);
    try {
      const blob = await exportPng(project, referenceImages ?? new Map(), { includeReferences: exportWithReference });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${project.title.replace(/[\\/:*?"<>|]/g, '_').trim().slice(0, 70) || 'eskizno'}.png`;
      anchor.click();
      // Leave one event-loop turn for the browser to accept the download URL.
      setTimeout(() => URL.revokeObjectURL(url), 0);
      setExportOpen(false);
    } catch {
      setExportError('Не удалось подготовить PNG. Попробуйте ещё раз.');
    }
  };

  useEffect(() => { if (confirmClear) confirmClearButtonRef.current?.focus(); }, [confirmClear]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    const displayedProject = transformPreview ? applyAction(project, { type: 'transformItems',
      ...transformPreview }) : project;
    const selectedLayer = displayedProject.layers.find((layer) => layer.id === project.activeLayerId);
    const bounds = selectedLayer?.kind === 'paint' && selectedLayer.visible && !selectedLayer.locked
      && tool === 'select' ? selectionBounds(selectedLayer, selectedIds) : null;
    renderProject(context, displayedProject, referenceImages ?? new Map(), {
      ...view,
      includeReferences: true,
      paintCache: paintCache.current,
      shapePrefixCache: shapePrefixCache.current,
      transformPrefixCache: transformPrefixCache.current,
      ...(transformPreview && active?.kind === 'paint' ? { previewTransform: {
        layerId: active.id, sourceLayer: active, ids: transformPreview.ids,
      } } : {}),
      ...(preview && gesture.current ? { preview: { layerId: gesture.current.layerId, stroke: preview } } : {}),
      ...(previewShape && gesture.current ? { previewShape: {
        layerId: gesture.current.layerId, shape: previewShape, existing: gesture.current.kind === 'edit',
      } } : {}),
      ...(selectedShape && active?.kind === 'paint'
        ? { selection: { layerId: active.id, shapeId: selectedShape.id } } : {}),
      ...(bounds ? { selectionFrame: handleFrame(bounds) } : {}),
      ...(marquee ? { marquee } : {}),
    });
  }, [project, referenceImages, preview, previewShape, view, selectedShapeId, selectedIds, marquee, transformPreview, tool]);

  // Undo, layer deletion, lock toggles and tool switches invalidate an in-progress gesture.
  useEffect(() => {
    if (gesture.current && gestureProject.current !== project) {
      if (gesture.current.kind === 'pending') clearTimeout(gesture.current.timer);
      gesture.current = null;
      setPreview(null);
      setPreviewShape(null);
      setMarquee(null);
      setTransformPreview(null);
      touchPointers.current.clear();
      pinchPrevious.current = null;
      penPointer.current = null;
    }
  }, [project]);
  useEffect(() => {
    if (gesture.current) {
      if (gesture.current.kind === 'pending') clearTimeout(gesture.current.timer);
      gesture.current = null;
      setPreview(null);
      setPreviewShape(null);
      setMarquee(null);
      setTransformPreview(null);
      penPointer.current = null;
    }
  }, [tool]);

  useEffect(() => { setSelectedIds([]); setMarquee(null); setTransformPreview(null); }, [project.id, project.activeLayerId]);

  useEffect(() => {
    if (!selectedIds.length) return;
    const layer = project.layers.find((entry) => entry.id === project.activeLayerId);
    if (layer?.kind !== 'paint' || layer.locked || !layer.visible) {
      setSelectedIds([]);
      return;
    }
    const existing = new Set([...layer.strokes.map((entry) => entry.id),
      ...getShapes(layer).map((entry) => entry.id)]);
    const valid = selectedIds.filter((id) => existing.has(id));
    if (valid.length !== selectedIds.length) setSelectedIds(valid);
  }, [project, selectedIds]);

  useEffect(() => {
    if (!canUseTool(tool)) {
      if (gesture.current?.kind === 'pending') clearTimeout(gesture.current.timer);
      gesture.current = null;
      setPreview(null);
      setPreviewShape(null);
      setMarquee(null);
      setTransformPreview(null);
      setSelectedIds([]);
      setTool('ink');
    }
  }, [toolAccess, tool]);

  useEffect(() => () => {
    if (gesture.current?.kind === 'pending') clearTimeout(gesture.current.timer);
  }, []);

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
    const syncFullscreen = () => setNativeFullscreen(document.fullscreenElement === fullscreenTarget());
    const handleEscape = (event: KeyboardEvent) => {
      // An open tool panel owns the first Escape; the second exits focus mode.
      if (event.key === 'Escape' && !document.querySelector(
        '.brush-picker-popup, .palette-popover, .layer-actions-menu, .clear-dialog-backdrop',
      )) setFocusMode(false);
    };
    document.addEventListener('fullscreenchange', syncFullscreen);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('fullscreenchange', syncFullscreen);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  // The side reference and the overlay controls must remain inside immersive mode.
  const fullscreenTarget = (): HTMLElement | null => {
    const layout = layoutRef.current;
    const workspace = layout?.closest<HTMLElement>('.workspace-page');
    return workspace?.querySelector('.reference-panel') ? workspace : layout;
  };

  useEffect(() => {
    const workspace = layoutRef.current?.closest<HTMLElement>('.workspace-page');
    if (!focusMode || !workspace?.querySelector('.reference-panel')) return;
    workspace.classList.add('reference-focus-mode');
    return () => workspace.classList.remove('reference-focus-mode');
  }, [focusMode, project.layers]);

  useEffect(() => {
    if (!focusMode) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [focusMode]);

  useLayoutEffect(() => {
    if (!stageRef.current) return;
    const stage = stageRef.current;
    const resize = () => {
      const style = getComputedStyle(stage);
      const availableWidth = stage.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const availableHeight = stage.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
      setCanvasDisplayWidth(fitCanvasWidth(availableWidth, availableHeight, project.width, project.height));
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
    const layout = fullscreenTarget();
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

  const sampleDrawingColor = (point: Point) => {
    // Render to an untransformed scratch surface so zoom/pan and selection handles
    // never contaminate the sampled color.
    const surface = document.createElement('canvas');
    surface.width = project.width;
    surface.height = project.height;
    const context = surface.getContext('2d');
    if (!context) return;
    renderProject(context, project, referenceImages ?? new Map(), {
      zoom: 1, panX: 0, panY: 0, includeReferences: true,
      paintCache: paintCache.current,
    });
    selectColor(pickCompositedColor(context, point));
    setTool('ink');
  };

  const pointerSamples = (event: PointerEvent<HTMLCanvasElement>): Point[] => {
    const rect = event.currentTarget.getBoundingClientRect();
    const native = event.nativeEvent;
    const coalesced = native.getCoalescedEvents?.() ?? [];
    const samples = [...coalesced.slice(-256), event];
    const points: Point[] = [];
    for (const sample of samples) {
      if ('pointerId' in sample && sample.pointerId !== (event.pointerId ?? 1)) continue;
      const normalized = clientToNormalized(sample.clientX, sample.clientY, rect);
      const point = normalized ? screenToArtboard(normalized, view) : null;
      if (point) points.push(point);
    }
    return appendDistinctPoints([], points);
  };

  const previewStroke = (points: Point[], strokeId: string): Stroke => ({
    id: strokeId, kind: tool === 'erase' ? 'erase' : 'ink', brushId, color, width: size,
    opacity: tool === 'erase' ? 1 : settings.opacity, points,
    ...(lessonStep === undefined ? {} : { step: lessonStep }),
  });

  const beginDrawing = (pointerId: number, layerId: string, point: Point,
    strokeSnapshot?: Stroke): Exclude<Gesture, EditGesture | PendingGesture> => {
    if (tool === 'fill') return { kind: 'fill', pointerId, layerId, point };
    if (tool === 'shape') {
      const shape: Shape = {
        id: newId(), kind: shapeKind, from: point, to: point, color, width: size,
        style: (shapeKind === 'line' || shapeKind === 'arrow') ? 'outline' : shapeStyle,
        opacity: 1,
      };
      setPreviewShape(shape);
      return { kind: 'shape', pointerId, layerId, shape };
    }
    const stroke = strokeSnapshot ?? previewStroke([point], newId());
    setPreview(stroke);
    return { kind: 'stroke', pointerId, layerId, stroke };
  };

  const startStroke = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!canUseTool(tool)) return;
    if (event.button !== 0) return;
    const pointerId = event.pointerId ?? 1;
    if (event.pointerType === 'touch' && penPointer.current !== null) return;
    if (event.pointerType === 'pen') {
      if (penPointer.current !== null && penPointer.current !== pointerId) return;
      if (gesture.current && touchPointers.current.has(gesture.current.pointerId)) cancelStroke();
      touchPointers.current.clear();
      pinchPrevious.current = null;
    }
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
    if (tool === 'eyedropper') {
      const point = pointerPoint(event);
      if (point && !gesture.current) sampleDrawingColor(point);
      return;
    }
    if (!canDraw || gesture.current) return;
    const point = pointerPoint(event);
    if (!point) return;
    if (event.pointerType === 'pen') penPointer.current = pointerId;
    gestureProject.current = project;
    if (active?.kind === 'paint') {
      if (tool === 'select') {
        const rect = event.currentTarget.getBoundingClientRect();
        const scale = Math.max(.001, rect.width / project.width * view.zoom);
        const bounds = selectionBounds(active, selectedIds);
        const frame = bounds ? handleFrame(bounds) : null;
        const selectedHandle = frame ? handleAt(frame, point, project.width, project.height, scale) : null;
        if (frame && selectedHandle) {
          gesture.current = { kind: 'transform', pointerId, layerId: active.id,
            start: point, frame, ids: [...selectedIds], handle: selectedHandle };
        } else {
          const hit = hitTestSelectable(active, point, project.width, project.height, scale);
          if (hit) {
            const ids = selectedIds.includes(hit) ? selectedIds : [hit];
            const nextBounds = selectionBounds(active, ids);
            setSelectedIds(ids);
            gesture.current = { kind: 'transform', pointerId, layerId: active.id,
              start: point, frame: handleFrame(nextBounds!), ids: [...ids], handle: 'move' };
          } else {
            setSelectedIds([]);
            const next = normalizeFrame(point, point);
            setMarquee(next);
            gesture.current = { kind: 'marquee', pointerId, layerId: active.id, start: point };
          }
        }
        setSelectedShapeId(null);
        event.currentTarget.setPointerCapture?.(pointerId);
        return;
      }
      const shapes = getShapes(active);
      const rect = event.currentTarget.getBoundingClientRect();
      const scale = Math.max(.001, rect.width / project.width * view.zoom);
      const handle = selectedShape
        ? shapeHandleAt(selectedShape, point, project.width, project.height, scale) : null;
      const target = handle ? selectedShape : [...shapes].reverse().find((shape) =>
        hitTestShape(shape, point, project.width, project.height, scale));
      if (handle && target) {
        gesture.current = { kind: 'edit', pointerId, layerId: active.id, shapeId: target.id,
          original: target, start: point, current: target, handle };
        event.currentTarget.setPointerCapture?.(pointerId);
        return;
      }
      if (target) {
        const timer = setTimeout(() => {
          const current = gesture.current;
          if (current?.kind !== 'pending' || current.pointerId !== pointerId ||
            current.shape.id !== target.id || touchPointers.current.size > 1) return;
          gesture.current = { kind: 'edit', pointerId, layerId: active.id, shapeId: target.id,
            original: target, start: point, current: target, handle: 'move' };
          setSelectedShapeId(target.id);
          setPreviewShape(target);
        }, SHAPE_HOLD_MS);
        gesture.current = { kind: 'pending', pointerId, layerId: active.id, shape: target,
          start: point, points: [point], strokeSnapshot: previewStroke([point], newId()),
          clientX: event.clientX, clientY: event.clientY, timer };
        event.currentTarget.setPointerCapture?.(pointerId);
        return;
      }
    }
    setSelectedShapeId(null);
    gesture.current = beginDrawing(pointerId, project.activeLayerId, point);
    event.currentTarget.setPointerCapture?.(pointerId);
  };

  const moveStroke = (event: PointerEvent<HTMLCanvasElement>) => {
    if (event.pointerType === 'touch' && penPointer.current !== null) return;
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
    if (gesture.current.kind === 'marquee') {
      setMarquee(normalizeFrame(gesture.current.start, point));
      return;
    }
    if (gesture.current.kind === 'transform') {
      const current = gesture.current;
      const next = current.handle === 'move'
        ? moveSelectionFrame(current.frame, { x: point.x - current.start.x, y: point.y - current.start.y })
        : resizeSelectionDrag(current.frame, current.handle, current.start, point);
      setTransformPreview({ layerId: current.layerId, ids: current.ids,
        ...transformationForFrame(current.frame, next) });
      return;
    }
    if (gesture.current.kind === 'pending') {
      const current = gesture.current;
      current.points = appendDistinctPoints(current.points, pointerSamples(event));
      if (Math.hypot(event.clientX - current.clientX, event.clientY - current.clientY) < DRAW_MOVEMENT_THRESHOLD_PX) return;
      clearTimeout(current.timer);
      gesture.current = beginDrawing(current.pointerId, current.layerId, current.start, current.strokeSnapshot);
      if (gesture.current.kind === 'stroke') {
        gesture.current.stroke = { ...gesture.current.stroke, points: current.points };
        setPreview(gesture.current.stroke);
        setSelectedShapeId(null);
        return; // The current coalesced packet was already added to pending points.
      }
      setSelectedShapeId(null);
    }
    if (gesture.current.kind === 'fill') return;
    if (gesture.current.kind === 'shape') {
      const updated = { ...gesture.current.shape, to: point };
      gesture.current.shape = updated;
      setPreviewShape(updated);
      return;
    }
    if (gesture.current.kind === 'edit') {
      const current = gesture.current;
      const updated = current.handle === 'move'
        ? moveShape(current.original, { x: point.x - current.start.x, y: point.y - current.start.y })
        : resizeShape(current.original, current.handle, point);
      current.current = updated;
      setPreviewShape(updated);
      return;
    }
    if (gesture.current.kind !== 'stroke') return;
    const points = appendDistinctPoints(gesture.current.stroke.points, pointerSamples(event));
    if (points.length === gesture.current.stroke.points.length) return;
    gesture.current.stroke = { ...gesture.current.stroke, points };
    setPreview(gesture.current.stroke);
  };

  const finishStroke = (event: PointerEvent<HTMLCanvasElement>) => {
    if (event.pointerType === 'touch' && penPointer.current !== null) return;
    if (event.pointerType === 'pen' && penPointer.current === (event.pointerId ?? 1)) penPointer.current = null;
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
    if (current.kind === 'pending') {
      clearTimeout(current.timer);
      gesture.current = beginDrawing(current.pointerId, current.layerId, current.start, current.strokeSnapshot);
      if (gesture.current.kind === 'stroke') {
        gesture.current.stroke = { ...gesture.current.stroke, points: current.points };
      }
    }
    const committed = gesture.current!;
    gesture.current = null;
    setPreview(null);
    setPreviewShape(null);
    setMarquee(null);
    setTransformPreview(null);
    if (event.currentTarget.hasPointerCapture?.(current.pointerId)) {
      event.currentTarget.releasePointerCapture(current.pointerId);
    }
    if (committed.kind === 'marquee') {
      const layer = project.layers.find((entry) => entry.id === committed.layerId);
      if (layer?.kind === 'paint' && end) setSelectedIds(itemsInMarquee(layer, normalizeFrame(committed.start, end)));
    } else if (committed.kind === 'transform') {
      if (end) {
        const frame = committed.handle === 'move'
          ? moveSelectionFrame(committed.frame, { x: end.x - committed.start.x, y: end.y - committed.start.y })
          : resizeSelectionDrag(committed.frame, committed.handle, committed.start, end);
        const transform = transformationForFrame(committed.frame, frame);
        if (transform.scaleX !== 1 || transform.scaleY !== 1
          || transform.translateX !== 0 || transform.translateY !== 0) {
          onAction({ type: 'transformItems', layerId: committed.layerId, ids: committed.ids, ...transform });
        }
      }
    } else if (committed.kind === 'fill') {
      if (end) onAction({ type: 'addFill', layerId: committed.layerId,
        fill: { id: newId(), point: committed.point, color } });
    } else if (committed.kind === 'shape') {
      const shape = end ? { ...committed.shape, to: end } : committed.shape;
      const distance = Math.hypot(
        (shape.to.x - shape.from.x) * project.width,
        (shape.to.y - shape.from.y) * project.height,
      );
      if (distance >= 2) {
        onAction({ type: 'addShape', layerId: committed.layerId, shape });
        setSelectedShapeId(shape.id);
      }
    } else if (committed.kind === 'edit') {
      const shape = end && end.x === committed.start.x && end.y === committed.start.y
        ? committed.original : end
        ? committed.handle === 'move'
          ? moveShape(committed.original, { x: end.x - committed.start.x, y: end.y - committed.start.y })
          : resizeShape(committed.original, committed.handle, end)
        : committed.current;
      if (shape.from.x !== committed.original.from.x || shape.from.y !== committed.original.from.y ||
        shape.to.x !== committed.original.to.x || shape.to.y !== committed.original.to.y) {
        onAction({ type: 'updateShape', layerId: committed.layerId, shapeId: committed.shapeId,
          from: shape.from, to: shape.to });
      }
    } else if (committed.kind === 'stroke') {
      const points = appendDistinctPoints(committed.stroke.points, pointerSamples(event));
      onAction({ type: 'addStroke', layerId: committed.layerId,
        stroke: { ...committed.stroke, points } });
    }
  };

  const cancelStroke = () => {
    if (gesture.current?.kind === 'pending') clearTimeout(gesture.current.timer);
    gesture.current = null; setPreview(null); setPreviewShape(null);
    setMarquee(null); setTransformPreview(null);
    penPointer.current = null;
  };
  const cancelPointer = (event: PointerEvent<HTMLCanvasElement>) => {
    if (event.pointerType === 'touch' && penPointer.current !== null) return;
    if (event.pointerType === 'pen' && penPointer.current === (event.pointerId ?? 1)) penPointer.current = null;
    if (event.pointerType === 'touch') {
      touchPointers.current.delete(event.pointerId ?? 1);
      pinchPrevious.current = null;
    }
    if (gesture.current?.pointerId === (event.pointerId ?? 1)) cancelStroke();
  };
  const lostPointerCapture = (event: PointerEvent<HTMLCanvasElement>) => {
    const pointerId = event.pointerId ?? 1;
    if (gesture.current?.pointerId === pointerId) cancelStroke();
    if (penPointer.current === pointerId) penPointer.current = null;
    if (touchPointers.current.delete(pointerId)) pinchPrevious.current = null;
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
        <div className={tool === 'shape' ? 'studio-toolbar toolbar-has-shapes' : 'studio-toolbar'} aria-label="Инструменты рисования">
          <div className="toolbar-drawing-tools">
            {canUseTool('ink') && <BrushPicker value={brushId} active={tool === 'ink'} onChange={(next) => { setBrushId(next); setTool('ink'); }} />}
            <button type="button" className={tool === 'erase' ? 'tool-active' : ''} aria-label="Ластик" title={canUseTool('erase') ? 'Ластик' : 'Откроется после урока'} disabled={!canUseTool('erase')} aria-pressed={tool === 'erase'} onClick={() => setTool('erase')}><ToolIcon name="eraser" /></button>
            <button type="button" className={tool === 'fill' ? 'tool-active' : ''} aria-label="Заливка ведром" title={canUseTool('fill') ? 'Заливка ведром' : 'Откроется в следующих уроках'} disabled={!canUseTool('fill')} aria-pressed={tool === 'fill'} onClick={() => setTool('fill')}><ToolIcon name="bucket" /></button>
            <button type="button" className={tool === 'shape' ? 'tool-active' : ''} aria-label="Фигуры" title={canUseTool('shape') ? 'Фигуры' : 'Откроется в следующих уроках'} disabled={!canUseTool('shape')} aria-pressed={tool === 'shape'} onClick={() => setTool('shape')}><ToolIcon name="shapes" /></button>
            <button type="button" className={tool === 'select' ? 'tool-active' : ''} aria-label="Выделение" title={canUseTool('select') ? 'Выделение объектов' : 'Откроется в следующих уроках'} disabled={!canUseTool('select')} aria-pressed={tool === 'select'} onClick={() => { setSelectedShapeId(null); setTool('select'); }}><ToolIcon name="select" /></button>
            <button type="button" className={tool === 'eyedropper' ? 'tool-active' : ''} aria-label="Пипетка" title={canUseTool('eyedropper') ? 'Пипетка' : 'Откроется в следующих уроках'} disabled={!canUseTool('eyedropper')} aria-pressed={tool === 'eyedropper'} onClick={() => setTool('eyedropper')}><ToolIcon name="eyedropper" /></button>
            <PalettePopover color={color} colors={project.palette} recentColors={displayedRecentColors} onSelect={selectColor} onSaveColor={(next) => {
              if (!project.palette.some((entry) => entry.toLowerCase() === next.toLowerCase())) {
                onAction({ type: 'setPalette', palette: [...project.palette, next] });
              }
            }} />
          </div>
          {tool === 'shape' && <div className="toolbar-shape-options">
            <label className="studio-control">Фигура
              <select aria-label="Тип фигуры" value={shapeKind} onChange={(event) => setShapeKind(event.target.value as ShapeKind)}>
                <option value="rectangle">Прямоугольник</option>
                <option value="ellipse">Эллипс / круг</option>
                <option value="triangle">Треугольник</option>
                <option value="line">Линия</option>
                <option value="arrow">Стрелка</option>
              </select>
            </label>
            <label className="studio-control">Заполнение
              <select aria-label="Стиль фигуры" value={shapeStyle} disabled={shapeKind === 'line' || shapeKind === 'arrow'} onChange={(event) => setShapeStyle(event.target.value as ShapeStyle)}>
                <option value="outline">Контур</option>
                <option value="fill">С заливкой</option>
                <option value="both">Контур и заливка</option>
              </select>
            </label>
          </div>}
          <div className="toolbar-brush-settings">
            <label className="studio-control"><span className="toolbar-control-name">{tool === 'erase' ? 'Ластик' : 'Толщина'}</span><input type="range" aria-label={tool === 'erase' ? 'Толщина ластика' : 'Толщина линии'} min="1" max="48" value={size} onChange={(event) => changeSize(Number(event.target.value))} /><span className="toolbar-control-value">{size} px</span></label>
            <label className="studio-control"><span className="toolbar-control-name">Прозрачность</span><input type="range" aria-label="Прозрачность кисти" min="0" max="100" value={brushOpacity} onChange={(event) => setBrushOpacity(Math.round(normalizeToolSettings({ ...settings, opacity: Number(event.target.value) / 100 }).opacity * 100))} /><span className="toolbar-control-value">{brushOpacity}<span>%</span><span className="toolbar-value-detail"> кисти</span></span></label>
          </div>
          <div className="toolbar-actions">
            <button type="button" aria-label="Отменить" title="Отменить" onClick={onUndo} disabled={!history.past.length}><ToolIcon name="undo" /></button>
            <button type="button" aria-label="Повторить" title="Повторить" onClick={onRedo} disabled={!history.future.length}><ToolIcon name="redo" /></button>
            <button type="button" className="clear-trigger" aria-label="Очистить" title="Очистить" onClick={() => { cancelStroke(); setConfirmClear(true); }} disabled={contentCount === 0}><ToolIcon name="trash" /></button>
            <button type="button" aria-label="Экспортировать PNG" title="Экспортировать PNG" onClick={() => { setExportError(null); setExportOpen(true); }}><ToolIcon name="download" /></button>
            <button type="button" className="fullscreen-toggle" aria-label={immersive ? 'Выйти из полного экрана' : 'Полный экран'} title={immersive ? 'Выйти из полного экрана' : 'Полный экран'} aria-pressed={immersive} onClick={toggleFullscreen}><ToolIcon name={immersive ? 'minimize' : 'maximize'} /></button>
          </div>
        </div>
        <div className="artboard-stage" ref={stageRef}>
          <canvas
            ref={canvasRef}
            className="drawing-canvas"
            data-tool={tool}
            width={project.width}
            height={project.height}
            role="img"
            aria-label="Холст для рисования"
            style={canvasDisplayWidth ? { width: `${canvasDisplayWidth}px` } : undefined}
            onPointerDown={startStroke}
            onPointerMove={moveStroke}
            onPointerUp={finishStroke}
            onPointerCancel={cancelPointer}
            onLostPointerCapture={lostPointerCapture}
          />
        </div>
        {focusMode && <p className="fullscreen-fallback-note" role="status">Полный экран недоступен. Включён режим без элементов сайта.</p>}
        <div className="canvas-footer">
          <span>Штрихов: {pointCount}</span>
          <span>Фигур и заливок: {contentCount - pointCount}</span>
          {tool === 'select' && <span className="interaction-hint">{selectedIds.length ? `Выбрано: ${selectedIds.length}` : 'Нажмите на объект или обведите рамкой'}</span>}
          {(tool === 'shape' || selectedShape) && <span className="interaction-hint">Удерживайте фигуру 0,5 с, чтобы переместить</span>}
          <div className="zoom-controls">
            <button type="button" aria-label="Уменьшить" title="Уменьшить" onClick={() => setView((current) => zoomView(current, current.zoom - 0.25))}><ToolIcon name="minus" /></button>
            <span aria-live="polite">{Math.round(view.zoom * 100)}%</span>
            <button type="button" aria-label="Увеличить" title="Увеличить" onClick={() => setView((current) => zoomView(current, current.zoom + 0.25))}><ToolIcon name="plus" /></button>
            <button type="button" aria-label="Сброс масштаба" title="Сброс масштаба" onClick={() => setView(INITIAL_VIEW)}><ToolIcon name="reset" /></button>
          </div>
        </div>
      </div>
      <aside className="layers-panel" aria-label="Слои рисунка">
        <button className="layers-toggle" type="button" aria-expanded={layersExpanded} aria-controls={layersBodyId} aria-label={`Слои (${project.layers.length}) · ${layersExpanded ? 'свернуть' : 'развернуть'}`} onClick={() => setLayersExpanded((value) => !value)}>
          <span>Слои ({project.layers.length})</span><ToolIcon name="chevron" />
        </button>
        <div id={layersBodyId} className={layersExpanded ? 'layers-body open' : 'layers-body'}>
          <div className="layers-panel-heading"><h3>Слои</h3><span className="layers-total">{project.layers.length} / {MAX_LAYERS}</span></div>
          <p className="layers-hint">Выберите слой для рисования. Верхний перекрывает нижний.</p>
          <LayerList layers={project.layers} activeLayerId={project.activeLayerId} onAction={onAction} />
          <button className="secondary-button add-layer" type="button" onClick={addLayer} disabled={project.layers.length >= MAX_LAYERS}>Добавить слой</button>
          {!canDraw && <p className="layers-hint" role="status">Выбранный слой скрыт или заблокирован.</p>}
          {!saveStatus && <p className="draft-warning" role="note">Рисунок пока не сохраняется: после перезагрузки он исчезнет.</p>}
        </div>
        {saveStatus && (
          <div className={saveStatus === 'error' ? 'save-state save-state-error' : 'save-state'} role="status" aria-live="polite">
            <span>{saveStatus === 'loading' ? 'Проверяем сохранённые работы…'
              : saveStatus === 'saving' ? 'Сохранение…'
                : saveStatus === 'saved' ? 'Сохранено'
                  : saveStatus === 'error' ? 'Не удалось сохранить' : 'Новый рисунок'}</span>
            {storageMessage && <p>{storageMessage}</p>}
            {saveStatus === 'error' && <div className="save-error-actions">
              {onRetry && <button className="save-retry" type="button" onClick={onRetry}>Повторить сохранение</button>}
              <button className="save-retry" type="button" onClick={downloadEmergencyPng}>Скачать PNG</button>
            </div>}
          </div>
        )}
      </aside>
      {confirmClear && (
        <div className="clear-dialog-backdrop">
          <div className="clear-dialog" role="alertdialog" aria-modal="true" aria-labelledby="clear-dialog-title" aria-describedby="clear-dialog-description" onKeyDown={(event) => {
            if (event.key === 'Escape') { event.stopPropagation(); setConfirmClear(false); }
          }}>
            <h3 id="clear-dialog-title">Очистить рисунок?</h3>
            <p id="clear-dialog-description">Штрихи, фигуры и заливки со всех слоёв будут удалены. Сами слои останутся, а рисунок можно будет вернуть кнопкой «Отменить».</p>
            <div className="clear-dialog-actions">
              <button type="button" onClick={() => setConfirmClear(false)}>Отмена очистки</button>
              <button type="button" ref={confirmClearButtonRef} className="clear-confirm-button" onClick={() => {
                cancelStroke();
                touchPointers.current.clear();
                pinchPrevious.current = null;
                onAction({ type: 'clearDrawing' });
                setSelectedShapeId(null);
                setConfirmClear(false);
              }}>Очистить рисунок</button>
            </div>
          </div>
        </div>
      )}
      {exportOpen && <div className="clear-dialog-backdrop" onKeyDown={(event) => {
        if (event.key === 'Escape') { event.stopPropagation(); setExportOpen(false); }
      }}>
        <div className="clear-dialog export-dialog" role="dialog" aria-modal="true" aria-labelledby="export-dialog-title">
          <h3 id="export-dialog-title">Экспорт PNG</h3>
          <p>Размер файла: {project.width} × {project.height} пикселей. Масштаб холста и элементы редактора не попадут в изображение.</p>
          <label className="export-reference-option"><input type="checkbox" checked={exportWithReference}
            disabled={!hasOverlayReference} onChange={(event) => setExportWithReference(event.target.checked)} />
            Включить эскиз-референс в PNG</label>
          {exportError && <p role="alert">{exportError}</p>}
          <div className="clear-dialog-actions">
            <button type="button" onClick={() => setExportOpen(false)}>Отмена</button>
            <button type="button" className="export-confirm-button" onClick={downloadPng}>Скачать PNG</button>
          </div>
        </div>
      </div>}
    </div>
  );
}
