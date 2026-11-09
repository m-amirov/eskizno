import type { DrawingProject, Layer, ProjectAction } from './model';

/** A small semantic signal; no pointermove stream or image data is recorded. */
export type DrawingEvent =
  | {
    type: 'strokeCommitted';
    projectId: string;
    layerId: string;
    strokeId: string;
    kind: 'ink' | 'erase';
    brushId: string;
    pointCount: number;
  }
  | {
    type: 'layerAdded';
    projectId: string;
    layerId: string;
    kind: Layer['kind'];
  }
  | {
    type: 'layerChanged';
    projectId: string;
    layerId: string;
    operation: Exclude<ProjectAction['type'], 'addStroke' | 'addLayer' | 'setPalette'>;
  }
  | {
    type: 'referenceToggled';
    projectId: string;
    layerId: string;
    visible: boolean;
  }
  | {
    type: 'paletteChanged';
    projectId: string;
    colors: string[];
  };

type CanceledPointerAction = { type: 'pointercancel' };
type EventSourceAction = ProjectAction | CanceledPointerAction;

function layerIn(project: DrawingProject, layerId: string): Layer | undefined {
  return project.layers.find((layer) => layer.id === layerId);
}

/** Called once for an accepted document command, never during an unfinished gesture. */
export function createActionEvent(
  action: EventSourceAction,
  before: DrawingProject,
  after: DrawingProject,
): DrawingEvent | null {
  if (action.type === 'pointercancel' || before === after || before.id !== after.id) {
    return null;
  }

  const projectId = before.id;

  switch (action.type) {
    case 'addStroke': {
      const oldLayer = layerIn(before, action.layerId);
      const newLayer = layerIn(after, action.layerId);
      if (oldLayer?.kind !== 'paint' || newLayer?.kind !== 'paint'
        || newLayer.strokes.length !== oldLayer.strokes.length + 1) return null;
      const added = newLayer.strokes.at(-1);
      if (!added || added.id !== action.stroke.id
        || oldLayer.strokes.some((stroke) => stroke.id === added.id)) return null;
      return {
        type: 'strokeCommitted',
        projectId,
        layerId: action.layerId,
        strokeId: added.id,
        kind: added.kind,
        brushId: added.brushId,
        pointCount: added.points.length,
      };
    }
    case 'addLayer': {
      const layer = layerIn(after, action.layer.id);
      if (!layer || layerIn(before, action.layer.id)) return null;
      return { type: 'layerAdded', projectId, layerId: layer.id, kind: layer.kind };
    }
    case 'removeLayer': {
      if (!layerIn(before, action.layerId) || layerIn(after, action.layerId)) return null;
      return { type: 'layerChanged', projectId, layerId: action.layerId, operation: action.type };
    }
    case 'reorderLayer': {
      const priorIndex = before.layers.findIndex((layer) => layer.id === action.layerId);
      const afterIndex = after.layers.findIndex((layer) => layer.id === action.layerId);
      if (priorIndex < 0 || afterIndex < 0 || priorIndex === afterIndex) return null;
      return { type: 'layerChanged', projectId, layerId: action.layerId, operation: action.type };
    }
    case 'renameLayer':
    case 'setLayerLock':
    case 'setLayerOpacity': {
      const oldLayer = layerIn(before, action.layerId);
      const newLayer = layerIn(after, action.layerId);
      if (!oldLayer || !newLayer) return null;
      const property = action.type === 'renameLayer' ? 'name'
        : action.type === 'setLayerLock' ? 'locked' : 'opacity';
      if (oldLayer[property] === newLayer[property]) return null;
      return { type: 'layerChanged', projectId, layerId: action.layerId, operation: action.type };
    }
    case 'setLayerVisibility': {
      const oldLayer = layerIn(before, action.layerId);
      const newLayer = layerIn(after, action.layerId);
      if (!oldLayer || !newLayer || oldLayer.visible === newLayer.visible) return null;
      if (newLayer.kind === 'reference') {
        return { type: 'referenceToggled', projectId, layerId: action.layerId, visible: newLayer.visible };
      }
      return { type: 'layerChanged', projectId, layerId: action.layerId, operation: action.type };
    }
    case 'setActiveLayer': {
      if (before.activeLayerId === after.activeLayerId || after.activeLayerId !== action.layerId) {
        return null;
      }
      return { type: 'layerChanged', projectId, layerId: action.layerId, operation: action.type };
    }
    case 'setReferenceTransform': {
      const oldLayer = layerIn(before, action.layerId);
      const newLayer = layerIn(after, action.layerId);
      if (oldLayer?.kind !== 'reference' || newLayer?.kind !== 'reference') return null;
      const old = oldLayer.transform;
      const updated = newLayer.transform;
      if (old.x === updated.x && old.y === updated.y
        && old.scale === updated.scale && old.rotation === updated.rotation) return null;
      return { type: 'layerChanged', projectId, layerId: action.layerId, operation: action.type };
    }
    case 'setPalette': {
      if (before.palette.length === after.palette.length
        && before.palette.every((color, index) => color === after.palette[index])) return null;
      return { type: 'paletteChanged', projectId, colors: [...after.palette] };
    }
    default:
      return null;
  }
}
