export const LESSON_ID = 'botanical-branch';
export const MODES = ['trace', 'construct', 'free'];
export const AUDIENCES = ['adult', 'child'];

export function createDocument() {
  return { version: 1, lessonId: LESSON_ID, audience: 'adult', mode: 'trace', step: 0, strokes: [] };
}

export function clientToNormalized(clientX, clientY, rect) {
  if (!rect || rect.width <= 0 || rect.height <= 0) return null;
  const clamp = (value) => Math.max(0, Math.min(1, value));
  return {
    x: clamp((clientX - rect.left) / rect.width),
    y: clamp((clientY - rect.top) / rect.height),
  };
}

export function createHistory(strokes = []) {
  return { past: [], present: strokes, future: [] };
}

function update(history, strokes) {
  if (strokes === history.present) return history;
  return { past: [...history.past.slice(-79), history.present], present: strokes, future: [] };
}

export function addStroke(history, stroke) {
  if (!stroke?.points?.length) return history;
  return update(history, [...history.present, stroke]);
}

function distanceToSegment(point, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const denominator = dx * dx + dy * dy;
  const t = denominator ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / denominator)) : 0;
  const x = a.x + t * dx;
  const y = a.y + t * dy;
  return Math.hypot(point.x - x, point.y - y);
}

export function eraseAt(history, point, radius = 0.02, step) {
  const index = history.present.findLastIndex((stroke) => {
    if (step !== undefined && stroke.step !== step) return false;
    const points = stroke.points;
    return points.some((p, i) => distanceToSegment(point, p, points[Math.min(i + 1, points.length - 1)]) <= radius);
  });
  if (index === -1) return history;
  return update(history, history.present.filter((_, i) => i !== index));
}

export function undo(history) {
  if (!history.past.length) return history;
  const previous = history.past.at(-1);
  return { past: history.past.slice(0, -1), present: previous, future: [history.present, ...history.future] };
}

export function redo(history) {
  if (!history.future.length) return history;
  return { past: [...history.past, history.present], present: history.future[0], future: history.future.slice(1) };
}

export function changeMode(doc, mode) {
  return MODES.includes(mode) ? { ...doc, mode } : doc;
}

export function changeAudience(doc, audience) {
  return AUDIENCES.includes(audience) ? { ...doc, audience } : doc;
}

export function changeStep(doc, step) {
  return { ...doc, step: Math.max(0, Math.min(5, Math.trunc(step || 0))) };
}

export function restoreDocument(raw) {
  try {
    const doc = JSON.parse(raw);
    if (!doc || doc.version !== 1 || doc.lessonId !== LESSON_ID || !AUDIENCES.includes(doc.audience) || !MODES.includes(doc.mode)) return null;
    if (!Number.isInteger(doc.step) || doc.step < 0 || doc.step > 5 || !Array.isArray(doc.strokes) || doc.strokes.length > 500) return null;
    for (const stroke of doc.strokes) {
      if (typeof stroke.id !== 'string' || !Number.isInteger(stroke.step) || stroke.step < 0 || stroke.step > 5 || !Array.isArray(stroke.points) || stroke.points.length < 1 || stroke.points.length > 2000) return null;
      if (typeof stroke.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(stroke.color) || !Number.isFinite(stroke.width) || stroke.width <= 0 || stroke.width > 50) return null;
      if (stroke.points.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1)) return null;
    }
    return doc;
  } catch {
    return null;
  }
}
