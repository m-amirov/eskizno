import { describe, expect, it } from 'vitest';
import { addReferenceLayer } from './reference-mode';
import { applyAction, createProject } from './model';

describe('E1.6 — независимый референс', () => {
  it.each(['overlay', 'side'] as const)('создаёт %s ниже активного paint-слоя, без смешивания данных', (placement) => {
    const original = createProject();
    const withReference = addReferenceLayer(original, 'asset-1', placement);
    expect(withReference.layers).toHaveLength(2);
    expect(withReference.layers[0]).toMatchObject({
      kind: 'reference', placement, assetId: 'asset-1', locked: true, visible: true,
      transform: { x: 0, y: 0, scale: 1, rotation: 0 },
    });
    expect(withReference.layers[1]).toMatchObject({ kind: 'paint', name: 'Мой рисунок' });
    expect(withReference.activeLayerId).toBe(withReference.layers[1].id);
    expect(original.layers).toHaveLength(1);
  });

  it('не меняет locked-референс ластиком или трансформацией, но позволяет скрыть и настроить после разблокировки', () => {
    const base = addReferenceLayer(createProject(), 'asset-2', 'overlay');
    const referenceId = base.layers[0].id;
    expect(applyAction(base, { type: 'setReferenceTransform', layerId: referenceId,
      transform: { x: 0.1, y: 0, scale: 1.1, rotation: 0 } })).toBe(base);
    const hidden = applyAction(base, { type: 'setLayerVisibility', layerId: referenceId, visible: false });
    expect(hidden.layers[0]).toMatchObject({ visible: false, assetId: 'asset-2' });
    const unlocked = applyAction(base, { type: 'setLayerLock', layerId: referenceId, locked: false });
    const transformed = applyAction(unlocked, { type: 'setReferenceTransform', layerId: referenceId,
      transform: { x: 0.1, y: -0.2, scale: 1.5, rotation: Math.PI / 4 } });
    expect(transformed.layers[0]).toMatchObject({ assetId: 'asset-2', transform: {
      x: 0.1, y: -0.2, scale: 1.5, rotation: Math.PI / 4,
    } });
    expect(applyAction(transformed, { type: 'removeLayer', layerId: referenceId }).layers).toHaveLength(1);
  });
});
