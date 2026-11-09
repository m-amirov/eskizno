import { applyAction, type DrawingProject, type ProjectAction } from './model';

const MAX_UNDO_STEPS = 80;

export interface ProjectHistory {
  past: DrawingProject[];
  present: DrawingProject;
  future: DrawingProject[];
}

export function createProjectHistory(initial: DrawingProject): ProjectHistory {
  return { past: [], present: initial, future: [] };
}

export function commitAction(history: ProjectHistory, action: ProjectAction): ProjectHistory {
  const next = applyAction(history.present, action);
  if (next === history.present) return history;

  return {
    past: [...history.past.slice(-(MAX_UNDO_STEPS - 1)), history.present],
    present: next,
    future: [],
  };
}

export function undoAction(history: ProjectHistory): ProjectHistory {
  if (!history.past.length) return history;
  const previous = history.past[history.past.length - 1];
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
  };
}

export function redoAction(history: ProjectHistory): ProjectHistory {
  if (!history.future.length) return history;
  return {
    past: [...history.past, history.present].slice(-MAX_UNDO_STEPS),
    present: history.future[0],
    future: history.future.slice(1),
  };
}
