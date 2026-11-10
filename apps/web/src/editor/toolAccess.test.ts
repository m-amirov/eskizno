import { describe, expect, it } from 'vitest';

import { createProjectHistory } from './history';
import { applyAction, createProject } from './model';
import { getAvailableToolIds, guardedCommitAction, isToolAvailable,
  type ToolAvailabilityContext } from './toolAccess';

const professional: ToolAvailabilityContext = {
  mode: 'professional', permanentlyUnlockedToolIds: new Set(),
};

describe('доступ к общим инструментам', () => {
  it('в профессиональном режиме доступны все реализованные инструменты без обучения', () => {
    expect([...getAvailableToolIds(professional)]).toEqual([
      'ink', 'erase', 'fill', 'shape', 'eyedropper', 'select',
    ]);
  });

  it('в обучении объединяет изученные и вводимые инструменты, затем применяет ограничение урока', () => {
    const learning: ToolAvailabilityContext = {
      mode: 'learning',
      permanentlyUnlockedToolIds: new Set(['erase', 'not-implemented']),
      lessonIntroducedToolIds: new Set(['ink', 'not-implemented']),
      lessonAllowedToolIds: new Set(['ink']),
    };
    expect([...getAvailableToolIds(learning)]).toEqual(['ink']);
    expect(isToolAvailable('erase', learning)).toBe(false);
    expect(isToolAvailable('not-implemented', learning)).toBe(false);
    expect([...getAvailableToolIds({ ...learning, lessonAllowedToolIds: undefined })]).toEqual(['ink', 'erase']);
  });

  it('не применяет заблокированный ластик даже при прямой отправке команды в историю', () => {
    const project = createProject();
    const history = createProjectHistory(project);
    const learning: ToolAvailabilityContext = {
      mode: 'learning', permanentlyUnlockedToolIds: new Set(), lessonIntroducedToolIds: new Set(['ink']),
    };
    const erase = { type: 'addStroke' as const, layerId: project.activeLayerId, stroke: {
      id: 'erase-1', kind: 'erase' as const, brushId: 'pencil' as const,
      width: 10, opacity: 1, color: '#123456', points: [{ x: .2, y: .3 }],
    } };

    expect(guardedCommitAction(history, erase, learning)).toBe(history);
    const allowed = guardedCommitAction(history, erase, professional);
    expect(allowed.present.layers[0]).toMatchObject({ kind: 'paint', strokes: [{ id: 'erase-1' }] });
    expect(guardedCommitAction(history, erase, { ...learning,
      permanentlyUnlockedToolIds: new Set(['erase']) }).present.layers[0]).toMatchObject({
        kind: 'paint', strokes: [{ id: 'erase-1' }],
      });
  });

  it('служебные команды и переключение слоя не блокируются учебной политикой', () => {
    const project = createProject();
    const history = createProjectHistory(project);
    const context: ToolAvailabilityContext = { mode: 'learning', permanentlyUnlockedToolIds: new Set() };
    expect(guardedCommitAction(history, { type: 'setLayerLock', layerId: project.activeLayerId,
      locked: true }, context).present.layers[0].locked).toBe(true);
  });
  it('не разрешает трансформацию в уроке даже при прямой команде', () => {
    const base = createProject();
    const project = applyAction(base, { type: 'addStroke', layerId: base.activeLayerId,
      stroke: { id: 'x', kind: 'ink', brushId: 'pencil', color: '#123456', width: 4,
        opacity: 1, points: [{ x: .2, y: .2 }] } });
    const history = createProjectHistory(project);
    const context: ToolAvailabilityContext = { mode: 'learning',
      permanentlyUnlockedToolIds: new Set(['ink']) };
    const action = { type: 'transformItems' as const, layerId: base.activeLayerId,
      ids: ['x'], origin: { x: 0, y: 0 }, scaleX: 1, scaleY: 1,
      translateX: .1, translateY: 0 };
    expect(guardedCommitAction(history, action, context)).toBe(history);
    expect(guardedCommitAction(history, action, professional).present).not.toBe(project);
    expect(isToolAvailable('select', professional)).toBe(true);
    expect(isToolAvailable('select', context)).toBe(false);
  });
});
