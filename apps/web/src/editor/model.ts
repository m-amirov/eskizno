/** Serializable document model. The editor and persistence layer share this contract. */

export const DOCUMENT_SCHEMA_VERSION = 3 as const;
export const MAX_LAYERS = 16;
export const MAX_PALETTE_COLORS = 32;

export type BrushId = 'pencil' | 'liner' | 'marker' | 'soft'
  | 'watercolor' | 'charcoal' | 'dry' | 'airbrush' | 'calligraphy' | 'pastel';
export type Point = { x: number; y: number };
export type StrokePoint = Point & { pressure?: number; tiltX?: number; tiltY?: number };
export type ReferenceTransform = { x: number; y: number; scale: number; rotation: number };

export interface Stroke {
  id: string;
  kind: 'ink' | 'erase';
  brushId: BrushId;
  color: string;
  width: number;
  opacity: number;
  points: StrokePoint[];
  dynamics?: { pressureSize: number; tiltAngle: boolean };
  step?: number;
}

export type ShapeKind = 'rectangle' | 'ellipse' | 'triangle' | 'line' | 'arrow';
export type ShapeStyle = 'outline' | 'fill' | 'both';
export interface Shape {
  id: string;
  kind: ShapeKind;
  from: Point;
  to: Point;
  color: string;
  width: number;
  style: ShapeStyle;
  opacity: number;
}

/** Flood fill is replayed at its position in the paint command stream. */
export interface BucketFill {
  id: string;
  point: Point;
  color: string;
}

export type PaintOperation =
  | { type: 'stroke'; strokeId: string }
  | { type: 'shape'; shape: Shape }
  | { type: 'fill'; fill: BucketFill };

interface LayerBase {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
}

export interface PaintLayer extends LayerBase {
  kind: 'paint';
  strokes: Stroke[];
  /** Absent in legacy v2 documents; those render strokes in array order. */
  operations?: PaintOperation[];
}

export interface ReferenceLayer extends LayerBase {
  kind: 'reference';
  assetId: string;
  placement: 'overlay' | 'side';
  transform: ReferenceTransform;
}

export type Layer = PaintLayer | ReferenceLayer;

export interface LessonContext {
  id: string;
  audience: 'adult' | 'child';
  mode: 'trace' | 'construct' | 'free';
  step: number;
}

export interface DrawingProject {
  schemaVersion: typeof DOCUMENT_SCHEMA_VERSION;
  id: string;
  title: string;
  width: number;
  height: number;
  layers: Layer[];
  activeLayerId: string;
  palette: string[];
  createdAt: number;
  updatedAt: number;
  lesson?: LessonContext;
}

export type ProjectAction =
  | { type: 'addStroke'; layerId: string; stroke: Stroke }
  | { type: 'addShape'; layerId: string; shape: Shape }
  | { type: 'updateShape'; layerId: string; shapeId: string; from: Point; to: Point }
  | { type: 'transformItems'; layerId: string; ids: string[]; origin: Point;
    scaleX: number; scaleY: number; translateX: number; translateY: number }
  | { type: 'addFill'; layerId: string; fill: BucketFill }
  | { type: 'clearDrawing' }
  | { type: 'addLayer'; layer: Layer; index?: number }
  | { type: 'removeLayer'; layerId: string }
  | { type: 'reorderLayer'; layerId: string; toIndex: number }
  | { type: 'renameLayer'; layerId: string; name: string }
  | { type: 'setLayerVisibility'; layerId: string; visible: boolean }
  | { type: 'setLayerLock'; layerId: string; locked: boolean }
  | { type: 'setLayerOpacity'; layerId: string; opacity: number }
  | { type: 'setActiveLayer'; layerId: string }
  | { type: 'setReferenceTransform'; layerId: string; transform: ReferenceTransform }
  | { type: 'setPalette'; palette: string[] }
  | { type: 'setLessonStep'; step: number }
  | { type: 'setLessonMode'; mode: LessonContext['mode'] };

export interface CreateProjectOptions {
  title?: string;
  width?: number;
  height?: number;
  lesson?: LessonContext;
}

const DEFAULT_PALETTE = ['#254332', '#F0C886', '#B67C66', '#6D8CA0', '#FFFFFF'];
const BRUSH_IDS: BrushId[] = [
  'pencil', 'liner', 'marker', 'soft', 'watercolor', 'charcoal', 'dry',
  'airbrush', 'calligraphy', 'pastel',
];

const isFiniteNumber = (value: number): boolean => Number.isFinite(value);
const isUnit = (value: number): boolean => isFiniteNumber(value) && value >= 0 && value <= 1;
const isHexColor = (value: string): boolean => typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
const isId = (id: string): boolean => typeof id === 'string' && id.trim().length > 0;
const isPoint = (point: Point): boolean => point !== null && typeof point === 'object'
  && isUnit(point.x) && isUnit(point.y);

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function isValidTransform(value: ReferenceTransform): boolean {
  return value !== null && typeof value === 'object'
    && isFiniteNumber(value.x) && isFiniteNumber(value.y)
    && isFiniteNumber(value.scale) && value.scale > 0 && value.scale <= 100
    && isFiniteNumber(value.rotation);
}

function isValidStroke(value: Stroke, legacy = false): boolean {
  return value !== null && typeof value === 'object'
    && isId(value.id)
    && (value.kind === 'ink' || value.kind === 'erase')
    && BRUSH_IDS.includes(value.brushId)
    && isHexColor(value.color)
    && isFiniteNumber(value.width) && value.width > 0 && value.width <= 256
    && isUnit(value.opacity)
    && Array.isArray(value.points) && value.points.length > 0
    && value.points.every((point) => point !== null && typeof point === 'object'
      && isUnit(point.x) && isUnit(point.y)
      && (legacy || (point.pressure === undefined || isUnit(point.pressure))
      && (point.tiltX === undefined || isFiniteNumber(point.tiltX) && point.tiltX >= -90 && point.tiltX <= 90)
      && (point.tiltY === undefined || isFiniteNumber(point.tiltY) && point.tiltY >= -90 && point.tiltY <= 90)))
    && (legacy || value.dynamics === undefined || value.dynamics !== null && typeof value.dynamics === 'object'
      && isUnit(value.dynamics.pressureSize) && typeof value.dynamics.tiltAngle === 'boolean')
    && (value.step === undefined || Number.isInteger(value.step) && value.step >= 0);
}

function isValidShape(shape: Shape): boolean {
  return shape !== null && typeof shape === 'object'
    && isId(shape.id) && ['rectangle', 'ellipse', 'triangle', 'line', 'arrow'].includes(shape.kind)
    && isPoint(shape.from) && isPoint(shape.to)
    && isHexColor(shape.color) && isFiniteNumber(shape.width)
    && shape.width > 0 && shape.width <= 256
    && ['outline', 'fill', 'both'].includes(shape.style) && isUnit(shape.opacity);
}

function isValidFill(fill: BucketFill): boolean {
  return fill !== null && typeof fill === 'object'
    && isId(fill.id) && isPoint(fill.point) && isHexColor(fill.color);
}

export function getPaintOperations(layer: PaintLayer): PaintOperation[] {
  return layer.operations ?? layer.strokes.map(({ id }) => ({ type: 'stroke', strokeId: id }));
}

export function getShapes(layer: PaintLayer): Shape[] {
  return getPaintOperations(layer).flatMap((op) => op.type === 'shape' ? [op.shape] : []);
}

function copyOperation(operation: PaintOperation): PaintOperation {
  if (operation.type === 'stroke') return { type: 'stroke', strokeId: operation.strokeId };
  if (operation.type === 'fill') return { type: 'fill', fill: { ...operation.fill, point: { ...operation.fill.point } } };
  return { type: 'shape', shape: { ...operation.shape, from: { ...operation.shape.from }, to: { ...operation.shape.to } } };
}

function operationId(operation: PaintOperation): string {
  return operation.type === 'stroke' ? operation.strokeId
    : operation.type === 'fill' ? operation.fill.id : operation.shape.id;
}

function usedPaintIds(project: DrawingProject): Set<string> {
  return new Set(project.layers.flatMap((layer) => layer.kind === 'paint'
    ? [...layer.strokes.map(({ id }) => id), ...getPaintOperations(layer).map(operationId)] : []));
}

function copyLayer(layer: Layer, legacy = false): Layer | null {
  if (!layer || !isId(layer.id) || typeof layer.name !== 'string' || !layer.name.trim()
    || typeof layer.visible !== 'boolean' || typeof layer.locked !== 'boolean'
    || !isUnit(layer.opacity)) {
    return null;
  }

  const common = {
    id: layer.id,
    name: layer.name.trim(),
    visible: layer.visible,
    locked: layer.locked,
    opacity: layer.opacity,
  };

  if (layer.kind === 'paint') {
    if (!Array.isArray(layer.strokes) || !layer.strokes.every((stroke) => isValidStroke(stroke, legacy))) return null;
    const ids = layer.strokes.map((stroke) => stroke.id);
    if (new Set(ids).size !== ids.length) return null;
    if (layer.operations !== undefined) {
      if (!Array.isArray(layer.operations)) return null;
      const seenIds = new Set<string>();
      for (const op of layer.operations) {
        if (!op || (op.type === 'stroke' && (!isId(op.strokeId) || !ids.includes(op.strokeId)))
          || (op.type === 'shape' && !isValidShape(op.shape))
          || (op.type === 'fill' && !isValidFill(op.fill))
          || !['stroke', 'shape', 'fill'].includes(op.type)) return null;
        const id = operationId(op);
        if (seenIds.has(id)) return null;
        seenIds.add(id);
      }
      if (ids.length !== layer.operations.filter((op) => op.type === 'stroke').length
        || ids.some((id) => !seenIds.has(id))) return null;
    }
    return { ...common, kind: 'paint', strokes: layer.strokes.map((stroke) => {
      if (!legacy) return copyStroke(stroke);
      const { dynamics: _dynamics, ...rest } = stroke;
      return { ...rest, points: stroke.points.map(({ x, y }) => ({ x, y })) };
    }),
      ...(layer.operations ? { operations: layer.operations.map(copyOperation) } : {}) };
  }

  if (layer.kind === 'reference') {
    if (!isId(layer.assetId) || !['overlay', 'side'].includes(layer.placement)
      || !isValidTransform(layer.transform)) return null;
    return {
      ...common,
      kind: 'reference',
      assetId: layer.assetId,
      placement: layer.placement,
      transform: { ...layer.transform },
    };
  }

  return null;
}

function copyStroke(stroke: Stroke): Stroke {
  return {
    ...stroke,
    points: stroke.points.map((point) => ({ ...point })),
    ...(stroke.dynamics ? { dynamics: { ...stroke.dynamics } } : {}),
  };
}

function nextProject(project: DrawingProject, patch: Partial<DrawingProject>): DrawingProject {
  return {
    ...project,
    ...patch,
    updatedAt: Math.max(Date.now(), project.updatedAt + 1),
  };
}

function updateLayer(
  project: DrawingProject,
  layerId: string,
  change: (layer: Layer) => Layer | null,
): DrawingProject {
  const index = project.layers.findIndex((layer) => layer.id === layerId);
  if (index === -1) return project;
  const updated = change(project.layers[index]);
  if (!updated || updated === project.layers[index]) return project;
  const layers = project.layers.slice();
  layers[index] = updated;
  return nextProject(project, { layers });
}

export function createProject(options: CreateProjectOptions = {}): DrawingProject {
  const width = options.width ?? 1024;
  const height = options.height ?? 768;
  if (!Number.isInteger(width) || !Number.isInteger(height)
    || width < 1 || height < 1 || width > 4096 || height > 4096) {
    throw new RangeError('Размер холста должен быть целым числом от 1 до 4096');
  }
  if (options.lesson && (!isId(options.lesson.id)
    || !['adult', 'child'].includes(options.lesson.audience)
    || !['trace', 'construct', 'free'].includes(options.lesson.mode)
    || !Number.isInteger(options.lesson.step) || options.lesson.step < 0)) {
    throw new TypeError('Некорректные данные урока');
  }
  const now = Date.now();
  const firstLayer: PaintLayer = {
    id: generateId(),
    kind: 'paint',
    name: 'Слой 1',
    visible: true,
    locked: false,
    opacity: 1,
    strokes: [],
  };
  return {
    schemaVersion: DOCUMENT_SCHEMA_VERSION,
    id: generateId(),
    title: typeof options.title === 'string' && options.title.trim() ? options.title.trim() : 'Без названия',
    width,
    height,
    layers: [firstLayer],
    activeLayerId: firstLayer.id,
    palette: [...DEFAULT_PALETTE],
    createdAt: now,
    updatedAt: now,
    ...(options.lesson ? { lesson: { ...options.lesson } } : {}),
  };
}

/** Validate stored data before passing it to the renderer; never trust IndexedDB contents. */
export function parseDrawingProject(value: unknown): DrawingProject | null {
  if (!value || typeof value !== 'object') return null;
  const project = value as Omit<DrawingProject, 'schemaVersion'> & { schemaVersion: number };
  if ((project.schemaVersion !== 2 && project.schemaVersion !== DOCUMENT_SCHEMA_VERSION) || !isId(project.id)
    || typeof project.title !== 'string' || !project.title.trim()
    || !Number.isInteger(project.width) || !Number.isInteger(project.height)
    || project.width < 1 || project.width > 4096 || project.height < 1 || project.height > 4096
    || !Number.isFinite(project.createdAt) || !Number.isFinite(project.updatedAt)
    || !Array.isArray(project.layers) || !project.layers.length || project.layers.length > MAX_LAYERS
    || !Array.isArray(project.palette) || project.palette.length > MAX_PALETTE_COLORS
    || !project.palette.every(isHexColor)) return null;
  const layers = project.layers.map((layer) => copyLayer(layer, project.schemaVersion === 2));
  if (layers.some((layer) => !layer)) return null;
  const validLayers = layers as Layer[];
  if (new Set(validLayers.map((layer) => layer.id)).size !== validLayers.length
    || !validLayers.some((layer) => layer.id === project.activeLayerId)) return null;
  if (project.lesson && (!isId(project.lesson.id)
    || !['adult', 'child'].includes(project.lesson.audience)
    || !['trace', 'construct', 'free'].includes(project.lesson.mode)
    || !Number.isInteger(project.lesson.step) || project.lesson.step < 0)) return null;
  return { ...project, schemaVersion: DOCUMENT_SCHEMA_VERSION, title: project.title.trim(), layers: validLayers,
    palette: [...project.palette], ...(project.lesson ? { lesson: { ...project.lesson } } : {}) };
}

export function applyAction(project: DrawingProject, action: ProjectAction): DrawingProject {
  switch (action.type) {
    case 'transformItems': {
      const { ids, origin, scaleX, scaleY, translateX, translateY } = action;
      if (!Array.isArray(ids) || ids.length === 0 || ids.length > 100_000
        || ids.some((id) => !isId(id)) || new Set(ids).size !== ids.length
        || !isPoint(origin) || ![scaleX, scaleY, translateX, translateY].every(Number.isFinite)
        || scaleX <= 0 || scaleY <= 0 || scaleX > 100 || scaleY > 100
        || Math.abs(translateX) > 1 || Math.abs(translateY) > 1
        || (scaleX === 1 && scaleY === 1 && translateX === 0 && translateY === 0)) return project;
      return updateLayer(project, action.layerId, (layer) => {
        if (layer.kind !== 'paint' || layer.locked || !layer.visible) return null;
        const known = new Set([...layer.strokes.map((entry) => entry.id),
          ...getPaintOperations(layer).flatMap((op) => op.type === 'shape' ? [op.shape.id] : [])]);
        if (ids.some((id) => !known.has(id))) return null;
        const wanted = new Set(ids);
        const scaleWidth = Math.sqrt(scaleX * scaleY);
        const point = <T extends Point>(entry: T): T => ({
          ...entry,
          x: Math.round((origin.x + (entry.x - origin.x) * scaleX + translateX) * 1_000_000) / 1_000_000,
          y: Math.round((origin.y + (entry.y - origin.y) * scaleY + translateY) * 1_000_000) / 1_000_000,
        });
        const nextStrokes = layer.strokes.map((entry) => wanted.has(entry.id)
          ? { ...entry, width: Math.min(256, entry.width * scaleWidth), points: entry.points.map(point) } : entry);
        const nextOperations = getPaintOperations(layer).map((operation) =>
          operation.type === 'shape' && wanted.has(operation.shape.id)
            ? { type: 'shape' as const, shape: { ...operation.shape, width: Math.min(256, operation.shape.width * scaleWidth),
              from: point(operation.shape.from), to: point(operation.shape.to) } } : operation);
        if (!nextStrokes.every((stroke) => isValidStroke(stroke))
          || !nextOperations.every((operation) => operation.type !== 'shape' || isValidShape(operation.shape))) return null;
        return { ...layer, strokes: nextStrokes, operations: nextOperations };
      });
    }
    case 'setLessonMode': {
      if (!project.lesson || !['trace', 'construct', 'free'].includes(action.mode)
        || project.lesson.mode === action.mode) return project;
      return nextProject(project, { lesson: { ...project.lesson, mode: action.mode } });
    }
    case 'setLessonStep': {
      if (!project.lesson || !Number.isInteger(action.step) || action.step < 0
        || action.step === project.lesson.step) return project;
      return nextProject(project, { lesson: { ...project.lesson, step: action.step } });
    }
    case 'clearDrawing': {
      if (!project.layers.some((layer) => layer.kind === 'paint'
        && (layer.strokes.length > 0 || (layer.operations?.length ?? 0) > 0))) return project;
      return nextProject(project, {
        layers: project.layers.map((layer) => layer.kind === 'paint'
          && (layer.strokes.length > 0 || (layer.operations?.length ?? 0) > 0)
          ? { ...layer, strokes: [], ...(layer.operations ? { operations: [] } : {}) } : layer),
      });
    }
    case 'addStroke': {
      if (!isValidStroke(action.stroke)) return project;
      if (usedPaintIds(project).has(action.stroke.id)) return project;
      return updateLayer(project, action.layerId, (layer) => {
        if (layer.kind !== 'paint' || layer.locked || !layer.visible) return null;
        return { ...layer, strokes: [...layer.strokes, copyStroke(action.stroke)],
          ...(layer.operations ? { operations: [...layer.operations, { type: 'stroke' as const, strokeId: action.stroke.id }] } : {}) };
      });
    }
    case 'addShape': {
      if (!isValidShape(action.shape) || usedPaintIds(project).has(action.shape.id)) return project;
      return updateLayer(project, action.layerId, (layer) => {
        if (layer.kind !== 'paint' || layer.locked || !layer.visible) return null;
        return { ...layer, operations: [...getPaintOperations(layer),
          { type: 'shape', shape: { ...action.shape, from: { ...action.shape.from }, to: { ...action.shape.to } } }] };
      });
    }
    case 'updateShape': {
      if (!isId(action.shapeId) || !isPoint(action.from) || !isPoint(action.to)) return project;
      return updateLayer(project, action.layerId, (layer) => {
        if (layer.kind !== 'paint' || layer.locked || !layer.visible || !layer.operations) return null;
        const target = layer.operations.find((op) => op.type === 'shape' && op.shape.id === action.shapeId);
        if (!target || target.type !== 'shape') return null;
        if (target.shape.from.x === action.from.x && target.shape.from.y === action.from.y
          && target.shape.to.x === action.to.x && target.shape.to.y === action.to.y) return layer;
        return { ...layer, operations: layer.operations.map((op) =>
          op === target ? { type: 'shape' as const,
            shape: { ...target.shape, from: { ...action.from }, to: { ...action.to } } } : op) };
      });
    }
    case 'addFill': {
      if (!isValidFill(action.fill) || usedPaintIds(project).has(action.fill.id)) return project;
      return updateLayer(project, action.layerId, (layer) => {
        if (layer.kind !== 'paint' || layer.locked || !layer.visible) return null;
        return { ...layer, operations: [...getPaintOperations(layer),
          { type: 'fill', fill: { ...action.fill, point: { ...action.fill.point } } }] };
      });
    }
    case 'addLayer': {
      if (project.layers.length >= MAX_LAYERS
        || project.layers.some((layer) => layer.id === action.layer?.id)) return project;
      const layer = copyLayer(action.layer);
      if (!layer) return project;
      const allStrokeIds = usedPaintIds(project);
      if (layer.kind === 'paint' && getPaintOperations(layer).some((op) => allStrokeIds.has(operationId(op)))) {
        return project;
      }
      const index = action.index === undefined ? project.layers.length
        : Number.isInteger(action.index) ? Math.max(0, Math.min(project.layers.length, action.index)) : -1;
      if (index === -1) return project;
      const layers = project.layers.slice();
      layers.splice(index, 0, layer);
      return nextProject(project, { layers });
    }
    case 'removeLayer': {
      const removed = project.layers.find((layer) => layer.id === action.layerId);
      if (!removed || removed.locked) return project;
      if (removed.kind === 'paint'
        && project.layers.filter((layer) => layer.kind === 'paint').length <= 1) return project;
      const layers = project.layers.filter((layer) => layer.id !== action.layerId);
      const activeLayerId = project.activeLayerId === action.layerId
        ? layers.find((layer) => layer.kind === 'paint')!.id
        : project.activeLayerId;
      return nextProject(project, { layers, activeLayerId });
    }
    case 'reorderLayer': {
      const currentIndex = project.layers.findIndex((layer) => layer.id === action.layerId);
      if (currentIndex === -1 || !Number.isInteger(action.toIndex)) return project;
      if (project.layers[currentIndex].locked) return project;
      const index = Math.max(0, Math.min(project.layers.length - 1, action.toIndex));
      if (index === currentIndex) return project;
      const layers = project.layers.slice();
      const [layer] = layers.splice(currentIndex, 1);
      layers.splice(index, 0, layer);
      return nextProject(project, { layers });
    }
    case 'renameLayer': {
      const name = typeof action.name === 'string' ? action.name.trim() : '';
      if (!name) return project;
      return updateLayer(project, action.layerId, (layer) => (
        layer.name === name ? layer : { ...layer, name }
      ));
    }
    case 'setLayerVisibility':
      if (typeof action.visible !== 'boolean') return project;
      return updateLayer(project, action.layerId, (layer) => (
        layer.visible === action.visible ? layer : { ...layer, visible: action.visible }
      ));
    case 'setLayerLock':
      if (typeof action.locked !== 'boolean') return project;
      return updateLayer(project, action.layerId, (layer) => (
        layer.locked === action.locked ? layer : { ...layer, locked: action.locked }
      ));
    case 'setLayerOpacity':
      if (!isUnit(action.opacity)) return project;
      return updateLayer(project, action.layerId, (layer) => (
        layer.opacity === action.opacity ? layer : { ...layer, opacity: action.opacity }
      ));
    case 'setActiveLayer': {
      const target = project.layers.find((layer) => layer.id === action.layerId);
      if (project.activeLayerId === action.layerId || !target || target.kind !== 'paint') return project;
      return nextProject(project, { activeLayerId: action.layerId });
    }
    case 'setReferenceTransform':
      if (!isValidTransform(action.transform)) return project;
      return updateLayer(project, action.layerId, (layer) => {
        if (layer.kind !== 'reference' || layer.locked) return null;
        const current = layer.transform;
        const incoming = action.transform;
        if (current.x === incoming.x && current.y === incoming.y
          && current.scale === incoming.scale && current.rotation === incoming.rotation) return layer;
        return { ...layer, transform: { ...incoming } };
      });
    case 'setPalette': {
      const colors = action.palette;
      if (!Array.isArray(colors) || colors.length > MAX_PALETTE_COLORS
        || !colors.every(isHexColor)) return project;
      const palette = colors.map((color) => color.toUpperCase());
      if (palette.length === project.palette.length
        && palette.every((color, index) => color === project.palette[index])) return project;
      return nextProject(project, { palette });
    }
    default:
      return project;
  }
}
