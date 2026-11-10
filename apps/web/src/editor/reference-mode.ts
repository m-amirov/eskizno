import { applyAction, MAX_LAYERS, type DrawingProject, type ReferenceLayer } from './model';

/** Keeps imported artwork below editable paint and outside the eraser's target layer. */
export function addReferenceLayer(
  project: DrawingProject, assetId: string, placement: ReferenceLayer['placement'],
): DrawingProject {
  if (!assetId.trim() || project.layers.length >= MAX_LAYERS) return project;
  const reference: ReferenceLayer = {
    id: crypto.randomUUID(),
    name: 'Референс',
    kind: 'reference',
    assetId,
    placement,
    transform: { x: 0, y: 0, scale: 1, rotation: 0 },
    visible: true,
    locked: true,
    opacity: placement === 'overlay' ? 0.55 : 1,
  };
  const withReference = applyAction(project, { type: 'addLayer', layer: reference, index: 0 });
  if (withReference === project) return project;
  return applyAction(withReference, { type: 'renameLayer', layerId: project.activeLayerId, name: 'Мой рисунок' });
}
