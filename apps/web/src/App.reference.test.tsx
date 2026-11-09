import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createCanvas } from '@napi-rs/canvas';
import type { DrawingProject } from './editor/model';

const memory = vi.hoisted(() => ({
  projects: new Map<string, { project: DrawingProject; assets: Map<string, Blob> }>(),
  holdSave: null as Promise<void> | null,
  releaseSave: null as (() => void) | null,
}));

vi.mock('./editor/persistence', () => ({
  LEGACY_STORAGE_KEY: 'eskizno:prototype:botanical-branch:v1',
  openProjectDb: async () => ({ close: vi.fn(), onversionchange: null }),
  saveProject: async (_db: unknown, project: DrawingProject, assets: Map<string, Blob>) => {
    if (memory.holdSave) await memory.holdSave;
    memory.projects.set(project.id, { project: structuredClone(project), assets: new Map(assets) });
  },
  loadProject: async (_db: unknown, id: string) => {
    const found = memory.projects.get(id);
    return found ? { project: structuredClone(found.project), assets: new Map(found.assets) } : null;
  },
  listProjects: async () => [...memory.projects.values()].map(({ project }) => ({
    id: project.id, title: project.title, createdAt: project.createdAt, updatedAt: project.updatedAt,
  })),
  deleteProject: async (_db: unknown, id: string) => { memory.projects.delete(id); },
  migrateLegacyV1: async () => null,
}));

import { App } from './App';

function png() { return new File(['png'], 'пример.png', { type: 'image/png' }); }

beforeEach(() => {
  memory.projects.clear();
  memory.holdSave = null;
  memory.releaseSave = null;
  globalThis.createImageBitmap = vi.fn(async () => Object.assign(createCanvas(300, 200), {
    close: vi.fn(),
  })) as unknown as typeof createImageBitmap;
  URL.createObjectURL = vi.fn(() => 'blob:reference-preview');
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => { cleanup(); localStorage.clear(); });

describe('E1.6 — три входа в свободную студию', () => {
  it('создаёт документ для обводки, показывает размеры и сохраняет вложенный Blob', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Свободная студия' }));
    expect(screen.getByRole('button', { name: 'Новый холст' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Загрузить эскиз для обводки'), { target: { files: [png()] } });
    await screen.findByRole('dialog', { name: 'Размер нового документа' });
    expect(screen.getByText('Загруженное изображение: 300 × 200 пикселей.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Создать с эскизом' }));
    await screen.findByRole('button', { name: 'Показать без эскиза' });
    const data = [...memory.projects.values()].at(-1);
    await waitFor(() => expect(data ?? [...memory.projects.values()].at(-1)).toBeTruthy());
    await waitFor(() => expect([...memory.projects.values()].at(-1)?.assets.size).toBe(1));
    expect([...memory.projects.values()].at(-1)?.project.layers[0]).toMatchObject({
      kind: 'reference', placement: 'overlay', locked: true,
    });
    expect(screen.getByRole('button', { name: 'Мой рисунок · выбран' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Показать без эскиза' }));
    expect(screen.getByRole('button', { name: 'Показать эскиз' })).toBeTruthy();
  });

  it('располагает референс отдельно и возвращает его после нового открытия работы', async () => {
    const view = render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Свободная студия' }));
    fireEvent.change(screen.getByLabelText('Загрузить референс рядом'), { target: { files: [png()] } });
    await screen.findByRole('dialog', { name: 'Размер нового документа' });
    fireEvent.click(screen.getByRole('button', { name: 'Создать с референсом' }));
    await screen.findByRole('region', { name: 'Референс рядом с холстом' });
    await waitFor(() => expect([...memory.projects.values()].at(-1)?.project.layers[0]).toMatchObject({
      kind: 'reference', placement: 'side',
    }));
    view.unmount();
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Свободная студия' }));
    await screen.findByRole('region', { name: 'Референс рядом с холстом' });
  });

  it('ошибка чтения не заменяет существующий рисунок и показывает русское сообщение', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Свободная студия' }));
    fireEvent.click(screen.getByRole('button', { name: 'Добавить слой' }));
    await screen.findByRole('button', { name: /^Слой 2 · выбран$/ });
    globalThis.createImageBitmap = vi.fn(async () => { throw new Error('broken'); }) as unknown as typeof createImageBitmap;
    fireEvent.change(screen.getByLabelText('Загрузить эскиз для обводки'), { target: { files: [png()] } });
    await screen.findByRole('alert');
    expect(screen.getByRole('button', { name: /^Слой 2 · выбран$/ })).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: 'Размер нового документа' })).toBeNull();
  });

  it('закрывает диалог выбора размера по Escape, не заменяя работу', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Свободная студия' }));
    fireEvent.click(screen.getByRole('button', { name: 'Добавить слой' }));
    fireEvent.change(screen.getByLabelText('Загрузить эскиз для обводки'), { target: { files: [png()] } });
    const dialog = await screen.findByRole('dialog', { name: 'Размер нового документа' });
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Размер нового документа' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Слой 2 · выбран' })).toBeTruthy();
  });

  it('освобождает ImageBitmap, если декодирование завершается после ухода из студии', async () => {
    const bitmap = Object.assign(createCanvas(300, 200), { close: vi.fn() });
    let finish!: (image: typeof bitmap) => void;
    const delayed = new Promise<typeof bitmap>((resolve) => { finish = resolve; });
    globalThis.createImageBitmap = vi.fn()
      .mockResolvedValueOnce(Object.assign(createCanvas(300, 200), { close: vi.fn() }))
      .mockReturnValueOnce(delayed) as unknown as typeof createImageBitmap;
    const view = render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Свободная студия' }));
    fireEvent.change(screen.getByLabelText('Загрузить эскиз для обводки'), { target: { files: [png()] } });
    await screen.findByRole('dialog', { name: 'Размер нового документа' });
    fireEvent.click(screen.getByRole('button', { name: 'Создать с эскизом' }));
    await waitFor(() => expect(globalThis.createImageBitmap).toHaveBeenCalledTimes(2));
    view.unmount();
    finish(bitmap);
    await waitFor(() => expect(bitmap.close).toHaveBeenCalledTimes(1));
  });

  it('не теряет новые слои, нарисованные пока «Новый холст» ждёт медленную запись', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Свободная студия' }));
    await screen.findByRole('button', { name: 'Добавить слой' });
    memory.holdSave = new Promise<void>((resolve) => { memory.releaseSave = resolve; });
    fireEvent.click(screen.getByRole('button', { name: 'Добавить слой' }));
    fireEvent.click(screen.getByRole('button', { name: 'Новый холст' }));
    fireEvent.click(screen.getByRole('button', { name: 'Добавить слой' }));
    await act(async () => {
      memory.releaseSave!();
      memory.holdSave = null;
      await new Promise((resolve) => setTimeout(resolve, 25));
    });
    expect(screen.getByRole('button', { name: 'Слои (3) · развернуть' })).toBeTruthy();
  });

  it('не подменяет рисунок импортом, если во время записи добавили ещё один слой', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Свободная студия' }));
    await screen.findByRole('button', { name: 'Добавить слой' });
    fireEvent.click(screen.getByRole('button', { name: 'Добавить слой' }));
    memory.holdSave = new Promise<void>((resolve) => { memory.releaseSave = resolve; });
    fireEvent.change(screen.getByLabelText('Загрузить референс рядом'), { target: { files: [png()] } });
    await screen.findByRole('dialog', { name: 'Размер нового документа' });
    fireEvent.click(screen.getByRole('button', { name: 'Создать с референсом' }));
    fireEvent.click(screen.getByRole('button', { name: 'Добавить слой' }));
    await act(async () => {
      memory.releaseSave!();
      memory.holdSave = null;
      await new Promise((resolve) => setTimeout(resolve, 25));
    });
    expect(screen.getByRole('button', { name: 'Слои (3) · развернуть' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Референс рядом с холстом' })).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Размер нового документа' })).toBeTruthy();
  });

  it('расширяет native fullscreen на панель референса, а не только на внутренний редактор', async () => {
    const originalRequest = Element.prototype.requestFullscreen;
    const originalDescriptor = Object.getOwnPropertyDescriptor(document, 'fullscreenElement');
    let current: Element | null = null;
    Element.prototype.requestFullscreen = async function () {
      current = this;
      document.dispatchEvent(new Event('fullscreenchange'));
    };
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => current });
    try {
      render(<App />);
      fireEvent.click(screen.getByRole('button', { name: 'Свободная студия' }));
      fireEvent.change(screen.getByLabelText('Загрузить референс рядом'), { target: { files: [png()] } });
      await screen.findByRole('dialog', { name: 'Размер нового документа' });
      fireEvent.click(screen.getByRole('button', { name: 'Создать с референсом' }));
      await screen.findByRole('region', { name: 'Референс рядом с холстом' });
      fireEvent.click(screen.getByRole('button', { name: 'Полный экран' }));
      await waitFor(() => expect(current).not.toBeNull());
      const region = screen.getByRole('region', { name: 'Референс рядом с холстом' });
      expect((current as Element | null)?.contains(region)).toBe(true);
    } finally {
      if (originalRequest) Element.prototype.requestFullscreen = originalRequest;
      else delete (Element.prototype as { requestFullscreen?: Element['requestFullscreen'] }).requestFullscreen;
      if (originalDescriptor) Object.defineProperty(document, 'fullscreenElement', originalDescriptor);
      else delete (document as { fullscreenElement?: Element | null }).fullscreenElement;
    }
  });
  it('сохраняет side-референс при fallback полноэкранного режима', async () => {
    const previousRequest = Element.prototype.requestFullscreen;
    delete (Element.prototype as { requestFullscreen?: Element['requestFullscreen'] }).requestFullscreen;
    try {
      render(<App />);
      fireEvent.click(screen.getByRole('button', { name: 'Свободная студия' }));
      fireEvent.change(screen.getByLabelText('Загрузить референс рядом'), { target: { files: [png()] } });
      await screen.findByRole('dialog', { name: 'Размер нового документа' });
      fireEvent.click(screen.getByRole('button', { name: 'Создать с референсом' }));
      const region = await screen.findByRole('region', { name: 'Референс рядом с холстом' });
      fireEvent.click(screen.getByRole('button', { name: 'Полный экран' }));
      const workspace = region.closest('.workspace-page');
      expect(workspace?.classList.contains('reference-focus-mode')).toBe(true);
      fireEvent.click(screen.getByRole('button', { name: 'Выйти из полного экрана' }));
      expect(workspace?.classList.contains('reference-focus-mode')).toBe(false);
    } finally {
      if (previousRequest) Element.prototype.requestFullscreen = previousRequest;
    }
  });
});
