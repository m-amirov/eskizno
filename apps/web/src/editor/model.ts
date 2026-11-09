/** Serializable document model. The editor and persistence layer share this contract. */

export const DOCUMENT_SCHEMA_VERSION = 2 as const;
export const MAX_LAYERS = 16;
export const MAX_PALETTE_COLORS = 32;

export type BrushId = 'pencil' | 'liner' | 'marker' | 'soft';
export type Point = { x: number; y: number };
export type ReferenceTransform = { x: number; y: number; scale: number; rotation: number };

export interface Stroke {
  id: string;
  kind: 'ink' | 'erase';
  brushId: BrushId;
  color: string;
  width: number;
  opacity: number;
  points: Point[];
  step?: number;
}

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
  | { type: 'addLayer'; layer: Layer; index?: number }
  | { type: 'removeLayer'; layerId: string }
  | { type: 'reorderLayer'; layerId: string; toIndex: number }
  | { type: 'renameLayer'; layerId: string; name: string }
  | { type: 'setLayerVisibility'; layerId: string; visible: boolean }
  | { type: 'setLayerLock'; layerId: string; locked: boolean }
  | { type: 'setLayerOpacity'; layerId: string; opacity: number }
  | { type: 'setActiveLayer'; layerId: string }
  | { type: 'setReferenceTransform'; layerId: string; transform: ReferenceTransform }
  | { type: 'setPalette'; palette: string[] };

export interface CreateProjectOptions {
  title?: string;
  width?: number;
  height?: number;
  lesson?: LessonContext;
}

const DEFAULT_PALETTE = ['#254332', '#F0C886', '#B67C66', '#6D8CA0', '#FFFFFF'];
const BRUSH_IDS: BrushId[] = ['pencil', 'liner', 'marker', 'soft'];

const isFiniteNumber = (value: number): boolean => Number.isFinite(value);
const isUnit = (value: number): boolean => isFiniteNumber(value) && value >= 0 && value <= 1;
const isHexColor = (value: string): boolean => typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
const isId = (id: string): boolean => typeof id === 'string' && id.trim().length > 0;

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

function isValidStroke(value: Stroke): boolean {
  return value !== null && typeof value === 'object'
    && isId(value.id)
    && (value.kind === 'ink' || value.kind === 'erase')
    && BRUSH_IDS.includes(value.brushId)
    && isHexColor(value.color)
    && isFiniteNumber(value.width) && value.width > 0 && value.width <= 256
    && isUnit(value.opacity)
    && Array.isArray(value.points) && value.points.length > 0
    && value.points.every((point) => point !== null && typeof point === 'object'
      && isUnit(point.x) && isUnit(point.y))
    && (value.step === undefined || Number.isInteger(value.step) && value.step >= 0);
}

function copyLayer(layer: Layer): Layer | null {
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
    if (!Array.isArray(layer.strokes) || !layer.strokes.every(isValidStroke)) return null;
    const ids = layer.strokes.map((stroke) => stroke.id);
    if (new Set(ids).size !== ids.length) return null;
    return { ...common, kind: 'paint', strokes: layer.strokes.map(copyStroke) };
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
    points: stroke.points.map(({ x, y }) => ({ x, y })),
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

export function applyAction(project: DrawingProject, action: ProjectAction): DrawingProject {
  switch (action.type) {
    case 'addStroke': {
      if (!isValidStroke(action.stroke)) return project;
      if (project.layers.some((layer) => layer.kind === 'paint'
        && layer.strokes.some((item) => item.id === action.stroke.id))) return project;
      return updateLayer(project, action.layerId, (layer) => {
        if (layer.kind !== 'paint' || layer.locked || !layer.visible) return null;
        return { ...layer, strokes: [...layer.strokes, copyStroke(action.stroke)] };
      });
    }
    case 'addLayer': {
      if (project.layers.length >= MAX_LAYERS
        || project.layers.some((layer) => layer.id === action.layer?.id)) return project;
      const layer = copyLayer(action.layer);
      if (!layer) return project;
      const allStrokeIds = new Set(project.layers.flatMap((item) => item.kind === 'paint'
        ? item.strokes.map((stroke) => stroke.id) : []));
      if (layer.kind === 'paint' && layer.strokes.some((stroke) => allStrokeIds.has(stroke.id))) {
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
