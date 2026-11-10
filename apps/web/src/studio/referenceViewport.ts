export type PreviewView = { zoom: number; panX: number; panY: number };
export type PreviewDimensions = { width: number; height: number };
export type PreviewPoint = { x: number; y: number };

export const resetPreview = (): PreviewView => ({ zoom: 1, panX: 0, panY: 0 });

export function clampPreviewZoom(value: number): number {
  return Number.isFinite(value) ? Math.max(.25, Math.min(4, value)) : 1;
}

function positiveDimensions(value: PreviewDimensions): boolean {
  return Number.isFinite(value.width) && Number.isFinite(value.height)
    && value.width > 0 && value.height > 0;
}

export function constrainPreview(
  view: PreviewView, frame: PreviewDimensions, image: PreviewDimensions,
): PreviewView {
  if (!positiveDimensions(frame) || !positiveDimensions(image)) return resetPreview();
  const zoom = clampPreviewZoom(view.zoom);
  const fit = Math.min(frame.width / image.width, frame.height / image.height);
  const maxX = Math.max(0, (image.width * fit * zoom - frame.width) / 2);
  const maxY = Math.max(0, (image.height * fit * zoom - frame.height) / 2);
  const panX = maxX && Number.isFinite(view.panX) ? Math.max(-maxX, Math.min(maxX, view.panX)) : 0;
  const panY = maxY && Number.isFinite(view.panY) ? Math.max(-maxY, Math.min(maxY, view.panY)) : 0;
  return { zoom, panX, panY };
}

export function panPreview(
  view: PreviewView, dx: number, dy: number,
  frame: PreviewDimensions, image: PreviewDimensions,
): PreviewView {
  return constrainPreview({
    ...view,
    panX: view.panX + (Number.isFinite(dx) ? dx : 0),
    panY: view.panY + (Number.isFinite(dy) ? dy : 0),
  }, frame, image);
}

/** `point` is measured from the center of the preview frame in CSS pixels. */
export function zoomPreviewAt(
  view: PreviewView, nextZoom: number, point: PreviewPoint,
  frame: PreviewDimensions, image: PreviewDimensions,
): PreviewView {
  const current = constrainPreview(view, frame, image);
  const zoom = clampPreviewZoom(nextZoom);
  const ratio = zoom / current.zoom;
  return constrainPreview({
    zoom,
    panX: point.x - (point.x - current.panX) * ratio,
    panY: point.y - (point.y - current.panY) * ratio,
  }, frame, image);
}
