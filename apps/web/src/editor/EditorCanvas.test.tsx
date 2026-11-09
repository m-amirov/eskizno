import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { applyAction, createProject } from './model';
import { createProjectHistory } from './history';
import { EditorCanvas } from './EditorCanvas';
import { renderProject } from './render';

vi.mock('./render', () => ({ renderProject: vi.fn() }));
afterEach(cleanup);

describe('связь выбранной кисти и штриха', () => {
  it('сбрасывает preview, если Undo во время drag удалил фигуру из документа', () => {
    const base = createProject();
    const withShape = applyAction(base, { type: 'addShape', layerId: base.activeLayerId,
      shape: { id: 'existing', kind: 'rectangle', from: { x: .1, y: .1 }, to: { x: .4, y: .4 },
        color: '#FF0000', width: 3, style: 'both', opacity: 1 } });
    const onAction = vi.fn();
    const { rerender } = render(<EditorCanvas history={createProjectHistory(withShape)}
      onAction={onAction} onUndo={() => {}} onRedo={() => {}} />);
    const canvas = screen.getByRole('img', { name: 'Холст для рисования' }) as HTMLCanvasElement;
    canvas.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, width: 400, height: 300, right: 400, bottom: 300, toJSON: () => ({}) });
    fireEvent.click(screen.getByRole('button', { name: 'Переместить фигуру' }));
    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 100, clientY: 80, button: 0 });
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 180, clientY: 110 });
    expect(vi.mocked(renderProject).mock.lastCall?.[3].previewShape).toBeTruthy();
    rerender(<EditorCanvas history={createProjectHistory(base)}
      onAction={onAction} onUndo={() => {}} onRedo={() => {}} />);
    expect(vi.mocked(renderProject).mock.lastCall?.[3].previewShape).toBeUndefined();
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 180, clientY: 110 });
    expect(onAction).not.toHaveBeenCalled();
  });
  it('применяет прозрачность к кисти, но не ослабляет ластик', () => {
    const onAction = vi.fn();
    render(<EditorCanvas history={createProjectHistory(createProject())} onAction={onAction} onUndo={() => {}} onRedo={() => {}} />);
    const canvas = screen.getByRole('img', { name: 'Холст для рисования' }) as HTMLCanvasElement;
    canvas.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, width: 400, height: 300, right: 400, bottom: 300, toJSON: () => ({}) });
    fireEvent.change(screen.getByRole('slider', { name: 'Прозрачность кисти' }), { target: { value: '35' } });
    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 100, clientY: 100, button: 0 });
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 120, clientY: 120, button: 0 });
    expect(onAction).toHaveBeenLastCalledWith(expect.objectContaining({
      type: 'addStroke', stroke: expect.objectContaining({ opacity: .35, kind: 'ink' }),
    }));
    fireEvent.click(screen.getByRole('button', { name: 'Ластик' }));
    fireEvent.pointerDown(canvas, { pointerId: 2, clientX: 100, clientY: 100, button: 0 });
    fireEvent.pointerUp(canvas, { pointerId: 2, clientX: 120, clientY: 120, button: 0 });
    expect(onAction).toHaveBeenLastCalledWith(expect.objectContaining({
      type: 'addStroke', stroke: expect.objectContaining({ opacity: 1, kind: 'erase' }),
    }));
  });

  it('ведро добавляет одну заливку при касании, не создавая штрих', () => {
    const onAction = vi.fn();
    render(<EditorCanvas history={createProjectHistory(createProject())} onAction={onAction} onUndo={() => {}} onRedo={() => {}} />);
    const canvas = screen.getByRole('img', { name: 'Холст для рисования' }) as HTMLCanvasElement;
    canvas.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, width: 400, height: 300, right: 400, bottom: 300, toJSON: () => ({}) });
    fireEvent.click(screen.getByRole('button', { name: 'Заливка ведром' }));
    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 200, clientY: 150, button: 0 });
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 200, clientY: 150, button: 0 });
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({
      type: 'addFill', fill: expect.objectContaining({ point: { x: .5, y: .5 } }),
    }));
  });
  it('не заливает холст при начале двухпальцевого масштабирования', () => {
    const onAction = vi.fn();
    render(<EditorCanvas history={createProjectHistory(createProject())} onAction={onAction} onUndo={() => {}} onRedo={() => {}} />);
    const canvas = screen.getByRole('img', { name: 'Холст для рисования' }) as HTMLCanvasElement;
    canvas.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, width: 400, height: 300, right: 400, bottom: 300, toJSON: () => ({}) });
    fireEvent.click(screen.getByRole('button', { name: 'Заливка ведром' }));
    fireEvent.pointerDown(canvas, { pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 100, button: 0 });
    fireEvent.pointerDown(canvas, { pointerId: 2, pointerType: 'touch', clientX: 200, clientY: 100, button: 0 });
    fireEvent.pointerMove(canvas, { pointerId: 2, pointerType: 'touch', clientX: 240, clientY: 100 });
    fireEvent.pointerUp(canvas, { pointerId: 2, pointerType: 'touch', clientX: 240, clientY: 100 });
    fireEvent.pointerUp(canvas, { pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 100 });
    expect(onAction).not.toHaveBeenCalled();
  });

  it('создаёт треугольник с заливкой и перемещает существующую фигуру одним действием', () => {
    const base = createProject();
    const onAction = vi.fn();
    const withShape = applyAction(base, { type: 'addShape', layerId: base.activeLayerId,
      shape: { id: 'existing', kind: 'rectangle', from: { x: .1, y: .1 }, to: { x: .3, y: .3 },
        color: '#123456', width: 4, style: 'both', opacity: 1 } });
    render(<EditorCanvas history={createProjectHistory(withShape)} onAction={onAction} onUndo={() => {}} onRedo={() => {}} />);
    const canvas = screen.getByRole('img', { name: 'Холст для рисования' }) as HTMLCanvasElement;
    canvas.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, width: 400, height: 300, right: 400, bottom: 300, toJSON: () => ({}) });
    fireEvent.click(screen.getByRole('button', { name: 'Фигуры' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Тип фигуры' }), { target: { value: 'triangle' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Стиль фигуры' }), { target: { value: 'fill' } });
    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 200, clientY: 60, button: 0 });
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 320, clientY: 240 });
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 320, clientY: 240, button: 0 });
    expect(onAction).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'addShape',
      shape: expect.objectContaining({ kind: 'triangle', style: 'fill', from: { x: .5, y: .2 },
        to: { x: .8, y: .8 } }) }));
    fireEvent.click(screen.getByRole('button', { name: 'Переместить фигуру' }));
    fireEvent.pointerDown(canvas, { pointerId: 2, clientX: 80, clientY: 60, button: 0 });
    fireEvent.pointerMove(canvas, { pointerId: 2, clientX: 120, clientY: 90 });
    fireEvent.pointerUp(canvas, { pointerId: 2, clientX: 120, clientY: 90, button: 0 });
    expect(onAction).toHaveBeenLastCalledWith(expect.objectContaining({
      type: 'updateShape', shapeId: 'existing', from: { x: .2, y: .2 }, to: { x: .4, y: .4 },
    }));
  });
  it('даёт изменить размер фигуры маркером на узком холсте и прячет выделение при выборе кисти', () => {
    const base = createProject();
    const withShape = applyAction(base, { type: 'addShape', layerId: base.activeLayerId,
      shape: { id: 'small', kind: 'rectangle', from: { x: .1, y: .1 }, to: { x: .4, y: .4 },
        color: '#123456', width: 4, style: 'both', opacity: 1 } });
    const onAction = vi.fn();
    render(<EditorCanvas history={createProjectHistory(withShape)} onAction={onAction} onUndo={() => {}} onRedo={() => {}} />);
    const canvas = screen.getByRole('img', { name: 'Холст для рисования' }) as HTMLCanvasElement;
    canvas.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, width: 320, height: 240, right: 320, bottom: 240, toJSON: () => ({}) });
    fireEvent.click(screen.getByRole('button', { name: 'Переместить фигуру' }));
    fireEvent.pointerDown(canvas, { pointerId: 1, button: 0, clientX: 80, clientY: 60 });
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 80, clientY: 60 });
    expect(vi.mocked(renderProject).mock.lastCall?.[3].selection?.shapeId).toBe('small');
    fireEvent.pointerDown(canvas, { pointerId: 2, button: 0, clientX: 32, clientY: 24 });
    fireEvent.pointerMove(canvas, { pointerId: 2, clientX: 16, clientY: 12 });
    fireEvent.pointerUp(canvas, { pointerId: 2, clientX: 16, clientY: 12 });
    expect(onAction).toHaveBeenLastCalledWith(expect.objectContaining({
      type: 'updateShape', shapeId: 'small', from: { x: .05, y: .05 }, to: { x: .4, y: .4 },
    }));
    fireEvent.click(screen.getByRole('button', { name: 'Кисти, выбран Карандаш' }));
    fireEvent.click(screen.getByRole('button', { name: 'Выбрать Карандаш' }));
    expect(vi.mocked(renderProject).mock.lastCall?.[3].selection).toBeUndefined();
  });
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
