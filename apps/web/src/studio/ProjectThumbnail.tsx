import { useEffect, useRef } from 'react';
import type { SavedProject } from '../editor/persistence';
import { renderProject } from '../editor/render';
import type { DrawingProject } from '../editor/model';

function reducedDocument(project: DrawingProject): DrawingProject {
  const scale = Math.min(1, 256 / project.width, 192 / project.height);
  return {
    ...project,
    width: Math.max(1, Math.round(project.width * scale)),
    height: Math.max(1, Math.round(project.height * scale)),
    layers: project.layers.map((layer) => layer.kind === 'paint' ? {
      ...layer,
      strokes: layer.strokes.map((stroke) => ({ ...stroke, width: stroke.width * scale })),
      ...(layer.operations ? { operations: layer.operations.map((op) => op.type === 'shape'
        ? { type: 'shape' as const, shape: { ...op.shape, width: op.shape.width * scale } }
        : op) } : {}),
    } : layer),
  };
}

interface ProjectThumbnailProps {
  id: string;
  revision: number;
  load: (id: string) => Promise<SavedProject | null>;
}

/** Actual artwork preview, never a decorative drawing unrelated to the saved project. */
export function ProjectThumbnail({ id, revision, load }: ProjectThumbnailProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let cancelled = false;
    const draw = async () => {
      const saved = await load(id);
      if (!saved || cancelled) return;
      const target = canvasRef.current;
      const targetContext = target?.getContext('2d');
      if (!target || !targetContext) return;
      const previewProject = reducedDocument(saved.project);
      const source = document.createElement('canvas');
      source.width = previewProject.width;
      source.height = previewProject.height;
      const context = source.getContext('2d');
      if (!context) return;
      const images = new Map<string, ImageBitmap>();
      try {
        for (const [assetId, blob] of saved.assets) {
          try { images.set(assetId, await createImageBitmap(blob)); } catch { /* invalid attachment */ }
          if (cancelled) return;
        }
        renderProject(context, previewProject, images, {
          zoom: 1, panX: 0, panY: 0, includeReferences: true,
        });
        if (cancelled) return;
        targetContext.clearRect(0, 0, target.width, target.height);
        targetContext.drawImage(source, (target.width - source.width) / 2,
          (target.height - source.height) / 2, source.width, source.height);
      } finally {
        images.forEach((bitmap) => bitmap.close());
      }
    };
    void draw().catch(() => { /* Broken preview never blocks access to the original file. */ });
    return () => { cancelled = true; };
  }, [id, revision, load]);
  return <canvas ref={canvasRef} className="project-card-paper" width={256} height={192} aria-hidden="true" />;
}
