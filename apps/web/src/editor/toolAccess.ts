import { commitAction, type ProjectHistory } from './history';
import type { ProjectAction } from './model';

export type EditorToolId = 'ink' | 'erase' | 'fill' | 'shape' | 'eyedropper' | 'select';
export type WorkspaceMode = 'professional' | 'learning';

export interface ToolAvailabilityContext {
  mode: WorkspaceMode;
  permanentlyUnlockedToolIds: ReadonlySet<string>;
  lessonIntroducedToolIds?: ReadonlySet<string>;
  lessonAllowedToolIds?: ReadonlySet<string>;
}

export const TOOL_REGISTRY: ReadonlyArray<{ id: EditorToolId; label: string }> = [
  { id: 'ink', label: 'Кисти' },
  { id: 'erase', label: 'Ластик' },
  { id: 'fill', label: 'Заливка' },
  { id: 'shape', label: 'Фигуры' },
  { id: 'eyedropper', label: 'Пипетка' },
  { id: 'select', label: 'Выделение' },
];

export const PROFESSIONAL_TOOL_ACCESS: ToolAvailabilityContext = {
  mode: 'professional', permanentlyUnlockedToolIds: new Set(),
};

export function getAvailableToolIds(context: ToolAvailabilityContext): ReadonlySet<EditorToolId> {
  const available = new Set<EditorToolId>();
  for (const tool of TOOL_REGISTRY) {
    if (context.mode === 'professional' || (
      (context.permanentlyUnlockedToolIds.has(tool.id)
        || context.lessonIntroducedToolIds?.has(tool.id))
      && (!context.lessonAllowedToolIds || context.lessonAllowedToolIds.has(tool.id))
    )) available.add(tool.id);
  }
  return available;
}

export function isToolAvailable(tool: string, context: ToolAvailabilityContext): boolean {
  return getAvailableToolIds(context).has(tool as EditorToolId);
}

function requiredTool(action: ProjectAction): EditorToolId | null {
  switch (action.type) {
    case 'addStroke': return action.stroke.kind === 'erase' ? 'erase' : 'ink';
    case 'addFill': return 'fill';
    case 'addShape':
    case 'updateShape': return 'shape';
    case 'transformItems': return 'select';
    default: return null;
  }
}

export function guardedCommitAction(
  history: ProjectHistory, action: ProjectAction, context: ToolAvailabilityContext,
): ProjectHistory {
  const tool = requiredTool(action);
  if (tool && !isToolAvailable(tool, context)) return history;
  return commitAction(history, action);
}
