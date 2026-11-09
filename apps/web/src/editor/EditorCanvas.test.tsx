import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { createProject } from './model';
import { createProjectHistory } from './history';
import { EditorCanvas } from './EditorCanvas';

vi.mock('./render', () => ({ renderProject: () => {} }));
afterEach(cleanup);

describe('связь выбранной кисти и штриха', () => {
  it('Escape сначала закрывает кисти, не выключая резервный полноэкранный режим', () => {
    const history = createProjectHistory(createProject());
    render(<EditorCanvas history={history} onAction={() => {}} onUndo={() => {}} onRedo={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Полный экран' }));
    expect(screen.getByRole('button', { name: 'Выйти из полного экрана' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Кисти, выбран Карандаш' }));
    expect(screen.getByRole('dialog', { name: 'Выбор кисти' })).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Выбор кисти' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Выйти из полного экрана' })).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('button', { name: 'Полный экран' })).toBeTruthy();
  });
  it('записывает ID выбранной кисти и сохраняет её при временном использовании ластика', () => {
    const onAction = vi.fn();
    const history = createProjectHistory(createProject());
    render(<EditorCanvas history={history} onAction={onAction} onUndo={() => {}} onRedo={() => {}} />);
    const canvas = screen.getByRole('img', { name: 'Холст для рисования' }) as HTMLCanvasElement;
    canvas.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, width: 400, height: 300, right: 400, bottom: 300, toJSON: () => ({}) });

    fireEvent.click(screen.getByRole('button', { name: 'Кисти, выбран Карандаш' }));
    fireEvent.click(screen.getByRole('button', { name: 'Выбрать Уголь' }));
    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 100, clientY: 100, button: 0 });
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 120, clientY: 120, button: 0 });
    expect(onAction).toHaveBeenLastCalledWith(expect.objectContaining({
      type: 'addStroke', stroke: expect.objectContaining({ brushId: 'charcoal', kind: 'ink' }),
    }));

    fireEvent.click(screen.getByRole('button', { name: 'Ластик' }));
    fireEvent.pointerDown(canvas, { pointerId: 2, clientX: 100, clientY: 100, button: 0 });
    fireEvent.pointerUp(canvas, { pointerId: 2, clientX: 120, clientY: 120, button: 0 });
    expect(onAction).toHaveBeenLastCalledWith(expect.objectContaining({
      type: 'addStroke', stroke: expect.objectContaining({ kind: 'erase' }),
    }));
    expect(screen.getByRole('button', { name: 'Кисти, выбран Уголь' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Кисти, выбран Уголь' }));
    fireEvent.click(screen.getByRole('button', { name: 'Выбрать Уголь' }));
    fireEvent.pointerDown(canvas, { pointerId: 3, clientX: 100, clientY: 100, button: 0 });
    fireEvent.pointerUp(canvas, { pointerId: 3, clientX: 120, clientY: 120, button: 0 });
    expect(onAction).toHaveBeenLastCalledWith(expect.objectContaining({
      type: 'addStroke', stroke: expect.objectContaining({ brushId: 'charcoal', kind: 'ink' }),
    }));
  });
});
