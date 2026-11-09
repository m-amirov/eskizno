import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { applyAction, createProject, type DrawingProject } from './editor/model';

const memory = vi.hoisted(() => ({
  projects: new Map<string, unknown>(),
  failSave: false,
  saveCount: 0,
  saveLayers: [] as number[],
  migrationCount: 0,
  failMigration: false,
  holdSave: null as null | Promise<void>,
  releaseSave: null as null | (() => void),
  opens: 0,
  db: null as null | { onversionchange: null | (() => void); close: () => void },
}));

vi.mock('./editor/persistence', () => ({
  LEGACY_STORAGE_KEY: 'eskizno:prototype:botanical-branch:v1',
  openProjectDb: async () => {
    memory.opens += 1;
    const db = { onversionchange: null as null | (() => void), close: vi.fn() };
    memory.db = db;
    return db;
  },
  saveProject: async (_db: unknown, project: DrawingProject) => {
    memory.saveCount += 1;
    memory.saveLayers.push(project.layers.length);
    if (memory.holdSave) await memory.holdSave;
    if (memory.failSave) throw new Error('QuotaExceededError');
    memory.projects.set(project.id, structuredClone(project));
  },
  loadProject: async (_db: unknown, id: string) => {
    const project = memory.projects.get(id) as DrawingProject | undefined;
    return project ? { project: structuredClone(project), assets: new Map() } : null;
  },
  listProjects: async () => [...memory.projects.values()].map((raw) => {
    const project = raw as DrawingProject;
    return { id: project.id, title: project.title, createdAt: project.createdAt, updatedAt: project.updatedAt };
  }).sort((a, b) => b.updatedAt - a.updatedAt),
  deleteProject: async (_db: unknown, id: string) => { memory.projects.delete(id); },
  migrateLegacyV1: async () => {
    memory.migrationCount += 1;
    if (memory.failMigration) throw new Error('Legacy quota error');
    return null;
  },
}));

import { App } from './App';

beforeEach(() => {
  memory.projects.clear();
  memory.failSave = false;
  memory.saveCount = 0;
  memory.saveLayers = [];
  memory.migrationCount = 0;
  memory.failMigration = false;
  memory.holdSave = null;
  memory.releaseSave = null;
  memory.opens = 0;
  memory.db = null;
});
afterEach(() => { cleanup(); localStorage.clear(); });

describe('E1.5 — восстановление рисунка и галерея', () => {
  it('автоматически сохраняет изменения и восстанавливает слои после перезагрузки', async () => {
    const first = render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Свободная студия' }));
    await screen.findByRole('button', { name: 'Добавить слой' });
    fireEvent.click(screen.getByRole('button', { name: 'Добавить слой' }));
    expect(screen.getByText('Сохранение…')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('Сохранено')).toBeTruthy(), { timeout: 3000 });
    expect(memory.projects.size).toBe(1);
    first.unmount();

    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Свободная студия' }));
    await screen.findByRole('button', { name: /^Слой 2 · выбран$/ });
    fireEvent.click(screen.getByRole('button', { name: 'Мои работы' }));
    expect(screen.getByRole('button', { name: /Открыть работу/i })).toBeTruthy();
  });

  it('создаёт новую работу, открывает предыдущую из галереи и удаляет с подтверждением', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Свободная студия' }));
    await screen.findByRole('button', { name: 'Добавить слой' });
    fireEvent.click(screen.getByRole('button', { name: 'Добавить слой' }));
    await waitFor(() => expect(screen.getByText('Сохранено')).toBeTruthy(), { timeout: 3000 });
    fireEvent.click(screen.getByRole('button', { name: 'Мои работы' }));
    await screen.findByRole('button', { name: 'Новая работа' });
    fireEvent.click(screen.getByRole('button', { name: 'Новая работа' }));
    await waitFor(() => expect(memory.projects.size).toBe(2), { timeout: 3000 });
    fireEvent.click(screen.getByRole('button', { name: 'Мои работы' }));
    expect(screen.getAllByRole('button', { name: /Открыть работу/i })).toHaveLength(2);
    fireEvent.click(screen.getAllByRole('button', { name: /Открыть работу/i })[1]);
    await screen.findByRole('button', { name: /^Слой 2 · выбран$/ });
    fireEvent.click(screen.getByRole('button', { name: 'Мои работы' }));
    fireEvent.click(screen.getAllByRole('button', { name: /Удалить работу/i })[0]);
    const dialog = screen.getByRole('alertdialog');
    expect(dialog.contains(document.activeElement)).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Отмена удаления' }));
    expect(memory.projects.size).toBe(2);
    fireEvent.click(screen.getAllByRole('button', { name: /Удалить работу/i })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Удалить безвозвратно' }));
    await waitFor(() => expect(memory.projects.size).toBe(1));
  });

  it('честно сообщает об ошибке записи и не показывает ложный статус «Сохранено»', async () => {
    memory.failSave = true;
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Свободная студия' }));
    await screen.findByRole('button', { name: 'Добавить слой' });
    fireEvent.click(screen.getByRole('button', { name: 'Добавить слой' }));
    await screen.findByText('Не удалось сохранить', {}, { timeout: 3000 });
    expect(memory.projects.size).toBe(0);
    expect(screen.queryByText('Сохранено')).toBeNull();
    expect(screen.getByRole('button', { name: 'Скачать PNG' })).toBeTruthy();
    memory.failSave = false;
    fireEvent.click(screen.getByRole('button', { name: 'Повторить сохранение' }));
    await waitFor(() => expect(screen.getByText('Сохранено')).toBeTruthy(), { timeout: 3000 });
  });

  it('после перезапуска открывает выбранную старую работу, даже если другая сохранена позже', async () => {
    const session = render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Свободная студия' }));
    fireEvent.click(screen.getByRole('button', { name: 'Добавить слой' }));
    await waitFor(() => expect(memory.projects.size).toBe(1), { timeout: 3000 });
    const olderId = [...memory.projects.keys()][0];
    fireEvent.click(screen.getByRole('button', { name: 'Мои работы' }));
    fireEvent.click(screen.getByRole('button', { name: 'Новая работа' }));
    await waitFor(() => expect(memory.projects.size).toBe(2), { timeout: 3000 });
    fireEvent.click(screen.getByRole('button', { name: 'Мои работы' }));
    const oldCard = screen.getAllByRole('button', { name: /Открыть работу/i }).find((button) =>
      button.closest('article')?.querySelector('p')?.textContent?.includes('открыта') === false);
    expect(oldCard).toBeTruthy();
    fireEvent.click(oldCard!);
    await screen.findByRole('button', { name: /^Слой 2 · выбран$/ });
    expect(localStorage.getItem('eskizno:active-project:v1')).toBe(olderId);
    session.unmount();
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Свободная студия' }));
    await screen.findByRole('button', { name: /^Слой 2 · выбран$/ });
  });

  it('не оставляет в базе устаревшую запись после Undo во время сохранения', async () => {
    const session = render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Свободная студия' }));
    fireEvent.click(screen.getByRole('button', { name: 'Добавить слой' }));
    await waitFor(() => expect(screen.getByText('Сохранено')).toBeTruthy(), { timeout: 3000 });

    memory.holdSave = new Promise<void>((resolve) => { memory.releaseSave = resolve; });
    fireEvent.click(screen.getByRole('button', { name: 'Добавить слой' }));
    await waitFor(() => expect(memory.saveCount).toBeGreaterThanOrEqual(2), { timeout: 3000 });
    fireEvent.click(screen.getByRole('button', { name: 'Отменить' }));
    fireEvent.click(screen.getByRole('button', { name: 'Отменить' }));
    expect(screen.getByRole('button', { name: /^Слой 2 · выбран$/ })).toBeTruthy();
    memory.releaseSave!();
    memory.holdSave = null;

    await waitFor(() => expect(memory.saveCount).toBeGreaterThanOrEqual(3), { timeout: 3000 });
    expect(memory.saveLayers).toEqual([2, 3, 2]);
    await waitFor(() => expect(screen.getByText('Сохранено')).toBeTruthy(), { timeout: 3000 });
    await waitFor(() => expect(([...memory.projects.values()][0] as DrawingProject).layers).toHaveLength(2));
    session.unmount();
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Свободная студия' }));
    await screen.findByRole('button', { name: /^Слой 2 · выбран$/ });
    expect(screen.queryByRole('button', { name: /^Слой 3/ })).toBeNull();
  });

  it('предупреждает при reload, если очистка или Undo до пустого холста ещё не записаны', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Свободная студия' }));
    fireEvent.click(screen.getByRole('button', { name: 'Добавить слой' }));
    await waitFor(() => expect(screen.getByText('Сохранено')).toBeTruthy(), { timeout: 3000 });
    fireEvent.click(screen.getByRole('button', { name: 'Отменить' }));
    fireEvent.click(screen.getByRole('button', { name: 'Отменить' }));
    expect(screen.getByRole('button', { name: 'Слои (1) · развернуть' })).toBeTruthy();
    const unload = new Event('beforeunload', { cancelable: true });
    fireEvent(window, unload);
    expect(unload.defaultPrevented).toBe(true);
    await waitFor(() => expect(screen.getByText('Сохранено')).toBeTruthy(), { timeout: 3000 });
    const laterUnload = new Event('beforeunload', { cancelable: true });
    fireEvent(window, laterUnload);
    expect(laterUnload.defaultPrevented).toBe(false);
  });

  it('запускает миграцию прежнего рисунка при загрузке', async () => {
    localStorage.setItem('eskizno:prototype:botanical-branch:v1', '{"version":1}');
    render(<App />);
    await waitFor(() => expect(memory.migrationCount).toBe(1));
  });

  it('ошибка миграции не блокирует открытие уже сохранённых работ', async () => {
    const project = createProject();
    const restored = applyAction(project, { type: 'addLayer', layer: {
      id: 'layer-2', name: 'Слой 2', kind: 'paint', strokes: [], visible: true, locked: false, opacity: 1,
    } });
    memory.projects.set(project.id, restored);
    memory.failMigration = true;
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Свободная студия' }));
    await screen.findByRole('button', { name: 'Слои (2) · развернуть' });
    fireEvent.click(screen.getByRole('button', { name: 'Мои работы' }));
    expect(screen.getByRole('button', { name: /Открыть работу/ })).toBeTruthy();
  });

  it('после versionchange переподключает IndexedDB при повторе сохранения', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Свободная студия' }));
    fireEvent.click(screen.getByRole('button', { name: 'Добавить слой' }));
    await waitFor(() => expect(screen.getByText('Сохранено')).toBeTruthy(), { timeout: 3000 });
    expect(memory.db?.onversionchange).toBeTypeOf('function');
    memory.db?.onversionchange?.();
    await screen.findByText('Не удалось сохранить');
    fireEvent.click(screen.getByRole('button', { name: 'Повторить сохранение' }));
    await waitFor(() => expect(memory.opens).toBe(2));
    await waitFor(() => expect(screen.getByText('Сохранено')).toBeTruthy(), { timeout: 3000 });
  });
});
