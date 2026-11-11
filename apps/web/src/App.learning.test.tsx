import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { DrawingProject } from './editor/model';

const memory = vi.hoisted(() => ({
  projects: new Map<string, DrawingProject>(),
  savedProgress: { schemaVersion: 1 as const, completedLessonIds: [] as string[], unlockedToolIds: [] as string[] },
  failProgress: false,
  failCopy: false,
}));

vi.mock('./editor/persistence', () => ({
  LEGACY_STORAGE_KEY: 'eskizno:prototype:botanical-branch:v1',
  openProjectDb: async () => ({ close: vi.fn(), onversionchange: null }),
  migrateLegacyV1: async () => null,
  loadLearningProgress: async () => structuredClone(memory.savedProgress),
  saveLearningProgress: async (_db: unknown, progress: typeof memory.savedProgress) => {
    if (memory.failProgress) throw new Error('QuotaExceededError');
    memory.savedProgress = structuredClone(progress);
  },
  saveProject: async (_db: unknown, project: DrawingProject) => {
    if (memory.failCopy && project.title.includes('свободная копия')) throw new Error('QuotaExceededError');
    memory.projects.set(project.id, structuredClone(project));
  },
  listProjects: async () => [...memory.projects.values()].map((project) => ({
    id: project.id, title: project.title, createdAt: project.createdAt, updatedAt: project.updatedAt,
    ...(project.lesson ? { lessonId: project.lesson.id } : {}),
  })),
  loadProject: async (_db: unknown, id: string) => {
    const project = memory.projects.get(id);
    return project ? { project: structuredClone(project), assets: new Map() } : null;
  },
  deleteProject: async (_db: unknown, id: string) => { memory.projects.delete(id); },
}));

import { App } from './App';

beforeEach(() => {
  memory.projects.clear();
  memory.savedProgress = { schemaVersion: 1, completedLessonIds: [], unlockedToolIds: [] };
  memory.failProgress = false;
  memory.failCopy = false;
});
afterEach(() => { cleanup(); localStorage.clear(); });

const draw = () => {
  const canvas = screen.getByRole('img', { name: 'Холст для рисования' });
  fireEvent.pointerDown(canvas, { pointerId: 1, pointerType: 'mouse', button: 0, clientX: 180, clientY: 180 });
  fireEvent.pointerMove(canvas, { pointerId: 1, pointerType: 'mouse', clientX: 240, clientY: 240 });
  fireEvent.pointerMove(canvas, { pointerId: 1, pointerType: 'mouse', clientX: 300, clientY: 300 });
  fireEvent.pointerUp(canvas, { pointerId: 1, pointerType: 'mouse', clientX: 300, clientY: 300 });
};

describe('R1 — ошибки при сохранении обучения', () => {
  it('не отмечает урок завершённым при отказе записи прогресса, позволяет повторить', async () => {
    const originalRect = HTMLCanvasElement.prototype.getBoundingClientRect;
    HTMLCanvasElement.prototype.getBoundingClientRect = () => ({ x: 0, y: 0, top: 0, left: 0,
      width: 1024, height: 768, right: 1024, bottom: 768, toJSON: () => ({}) });
    try {
      render(<App />);
      await waitFor(() => expect(screen.getByRole('button', { name: 'Начать урок линий' }).hasAttribute('disabled')).toBe(false));
      fireEvent.click(screen.getByRole('button', { name: 'Начать урок линий' }));
      await screen.findByRole('heading', { name: 'Линия и уверенность' });
      // Flush the freshly mounted editor's gesture-reset effects before drawing.
      await act(async () => {});
      draw();
      await waitFor(() => expect(screen.getByText('Штрихов: 1')).toBeTruthy());
      const next = screen.getByRole('button', { name: 'Следующий шаг' });
      await waitFor(() => expect(next.hasAttribute('disabled')).toBe(false));
      fireEvent.click(next);
      await screen.findByText('Шаг 2 из 3');
      draw();
      await waitFor(() => expect(screen.getByText('Штрихов: 2')).toBeTruthy());
      await waitFor(() => expect(next.hasAttribute('disabled')).toBe(false));
      fireEvent.click(next);
      await screen.findByText('Шаг 3 из 3');
      draw();
      draw();
      await waitFor(() => expect(screen.getByText('Штрихов: 4')).toBeTruthy());
      fireEvent.click(screen.getByRole('button', { name: 'Закончить три шага' }));
      await screen.findByRole('button', { name: 'Завершить урок' });
      memory.failProgress = true;
      fireEvent.click(screen.getByRole('button', { name: 'Завершить урок' }));
      await screen.findByRole('alert');
      expect(screen.queryByText('Урок завершён')).toBeNull();
      expect(screen.getByRole('button', { name: 'Ластик' }).hasAttribute('disabled')).toBe(true);
      expect(memory.savedProgress.unlockedToolIds).toEqual([]);
      memory.failProgress = false;
      fireEvent.click(screen.getByRole('button', { name: 'Завершить урок' }));
      await screen.findByText('Урок завершён');
      expect(screen.getByRole('button', { name: 'Ластик' }).hasAttribute('disabled')).toBe(false);
    } finally { HTMLCanvasElement.prototype.getBoundingClientRect = originalRect; }
  });

  it('отказ записи копии не заменяет урок и не стирает его содержимое', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Начать урок линий' }).hasAttribute('disabled')).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Начать урок линий' }));
    await screen.findByRole('heading', { name: 'Линия и уверенность' });
    memory.failCopy = true;
    fireEvent.click(screen.getByRole('button', { name: 'Продолжить копию в свободной студии' }));
    await screen.findByText(/Не удалось создать копию/);
    expect(screen.getByRole('heading', { name: 'Линия и уверенность' })).toBeTruthy();
    expect([...memory.projects.values()].filter((project) => !!project.lesson)).toHaveLength(1);
  });
});

describe('E2 — каталог уроков', () => {
  it('открывает выбранный урок и восстанавливает самостоятельный проект после возврата', async () => {
    render(<App />);
    await screen.findByRole('button', { name: 'Начать урок линий' });
    fireEvent.click(screen.getByRole('button', { name: 'Ветка с листьями' }));
    await screen.findByRole('heading', { name: 'Ветка с листьями' });
    expect(screen.getByText('Шаг 1 из 6')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Нарисуй сам' }));
    expect(screen.getByRole('button', { name: 'Нарисуй сам' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.queryByRole('img', { name: 'Пошаговая схема рисунка' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Повтори' }));
    expect(screen.getByRole('img', { name: 'Пошаговая схема рисунка' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'К обучению' }));
    fireEvent.click(screen.getByRole('button', { name: 'Чашка кофе' }));
    await screen.findByRole('heading', { name: 'Чашка кофе' });
    fireEvent.click(screen.getByRole('button', { name: 'К обучению' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ветка с листьями' }));
    await screen.findByRole('heading', { name: 'Ветка с листьями' });
    expect([...memory.projects.values()].filter((project) => project.lesson?.id === 'e2a-botanical-branch')).toHaveLength(1);
  });
});
