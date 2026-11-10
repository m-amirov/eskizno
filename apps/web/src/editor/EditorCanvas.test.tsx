import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import { applyAction, createProject } from './model';
import { createProjectHistory } from './history';
import { EditorCanvas } from './EditorCanvas';
import { renderProject } from './render';
import type { ToolAvailabilityContext } from './toolAccess';

vi.mock('./render', () => ({ renderProject: vi.fn() }));
afterEach(() => { cleanup(); vi.useRealTimers(); });

const waitForLongPress = () => act(() => { vi.advanceTimersByTime(500); });

describe('связь выбранной кисти и штриха', () => {
  it('показывает иконку выделения только как рабочий инструмент профессионального режима', () => {
    const history = createProjectHistory(createProject());
    const learning: ToolAvailabilityContext = { mode: 'learning', permanentlyUnlockedToolIds: new Set(['ink']) };
    const { rerender } = render(<EditorCanvas history={history}
      onAction={() => {}} onUndo={() => {}} onRedo={() => {}} toolAccess={learning} />);
    expect(screen.getByRole('button', { name: 'Выделение' }).hasAttribute('disabled')).toBe(true);
    rerender(<EditorCanvas history={history} onAction={() => {}} onUndo={() => {}} onRedo={() => {}} />);
    const button = screen.getByRole('button', { name: 'Выделение' });
    expect(button.hasAttribute('disabled')).toBe(false);
    expect(button.textContent).toBe('');
    expect(button.querySelector('svg')).not.toBeNull();
  });

  it('рамкой выбирает штрих и фигуру, переносит набор одним действием и показывает предварительный результат', () => {
    const base = createProject();
    const withStroke = applyAction(base, { type: 'addStroke', layerId: base.activeLayerId,
      stroke: { id: 'line-r2', kind: 'ink', brushId: 'pencil', color: '#112233', width: 5,
        opacity: 1, points: [{ x: .1, y: .2 }, { x: .3, y: .2 }] } });
    const withShape = applyAction(withStroke, { type: 'addShape', layerId: base.activeLayerId,
      shape: { id: 'rect-r2', kind: 'rectangle', from: { x: .6, y: .5 }, to: { x: .8, y: .7 },
        color: '#112233', width: 3, opacity: 1, style: 'both' } });
    const onAction = vi.fn();
    render(<EditorCanvas history={createProjectHistory(withShape)} onAction={onAction}
      onUndo={() => {}} onRedo={() => {}} />);
    const canvas = screen.getByRole('img', { name: 'Холст для рисования' }) as HTMLCanvasElement;
    canvas.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, width: 400, height: 300,
      right: 400, bottom: 300, toJSON: () => ({}) });
    fireEvent.click(screen.getByRole('button', { name: 'Выделение' }));
    fireEvent.pointerDown(canvas, { pointerId: 1, button: 0, clientX: 5, clientY: 5 });
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 350, clientY: 240 });
    expect(vi.mocked(renderProject).mock.lastCall?.[3].marquee).toBeTruthy();
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 350, clientY: 240 });
    expect(screen.getByText('Выбрано: 2')).toBeTruthy();
    fireEvent.pointerDown(canvas, { pointerId: 2, button: 0, clientX: 275, clientY: 180 });
    fireEvent.pointerMove(canvas, { pointerId: 2, clientX: 290, clientY: 185 });
    expect(vi.mocked(renderProject).mock.lastCall?.[3].selectionFrame).toBeTruthy();
    expect(onAction).not.toHaveBeenCalled();
    fireEvent.pointerUp(canvas, { pointerId: 2, clientX: 290, clientY: 185 });
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'transformItems',
      layerId: base.activeLayerId, ids: ['line-r2', 'rect-r2'], scaleX: 1, scaleY: 1 }));
  });

  it('масштабирует выделение за угловой маркер и отменяет жест по pointercancel', () => {
    const base = createProject();
    const project = applyAction(base, { type: 'addShape', layerId: base.activeLayerId,
      shape: { id: 'shape-r2', kind: 'rectangle', from: { x: .2, y: .2 }, to: { x: .5, y: .5 },
        color: '#112233', width: 3, opacity: 1, style: 'both' } });
    const onAction = vi.fn();
    render(<EditorCanvas history={createProjectHistory(project)} onAction={onAction}
      onUndo={() => {}} onRedo={() => {}} />);
    const canvas = screen.getByRole('img', { name: 'Холст для рисования' }) as HTMLCanvasElement;
    canvas.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, width: 400, height: 300,
      right: 400, bottom: 300, toJSON: () => ({}) });
    fireEvent.click(screen.getByRole('button', { name: 'Выделение' }));
    fireEvent.pointerDown(canvas, { pointerId: 1, button: 0, clientX: 140, clientY: 105 });
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 140, clientY: 105 });
    fireEvent.pointerDown(canvas, { pointerId: 2, button: 0, clientX: 200, clientY: 150 });
    fireEvent.pointerMove(canvas, { pointerId: 2, clientX: 240, clientY: 180 });
    fireEvent.pointerCancel(canvas, { pointerId: 2 });
    expect(onAction).not.toHaveBeenCalled();
    fireEvent.pointerDown(canvas, { pointerId: 3, button: 0, clientX: 200, clientY: 150 });
    fireEvent.pointerMove(canvas, { pointerId: 3, clientX: 240, clientY: 180 });
    fireEvent.pointerUp(canvas, { pointerId: 3, clientX: 240, clientY: 180 });
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'transformItems',
      ids: ['shape-r2'], scaleX: expect.closeTo(1.333333, 5), scaleY: expect.closeTo(1.333333, 5) }));
  });

  it('клик по угловой ручке без перетаскивания не изменяет размер и историю', () => {
    const base = createProject();
    const project = applyAction(base, { type: 'addShape', layerId: base.activeLayerId,
      shape: { id: 'shape-click', kind: 'rectangle', from: { x: .2, y: .2 }, to: { x: .5, y: .5 },
        color: '#112233', width: 3, opacity: 1, style: 'both' } });
    const onAction = vi.fn();
    render(<EditorCanvas history={createProjectHistory(project)} onAction={onAction}
      onUndo={() => {}} onRedo={() => {}} />);
    const canvas = screen.getByRole('img', { name: 'Холст для рисования' }) as HTMLCanvasElement;
    canvas.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, width: 400, height: 300,
      right: 400, bottom: 300, toJSON: () => ({}) });
    fireEvent.click(screen.getByRole('button', { name: 'Выделение' }));
    fireEvent.pointerDown(canvas, { pointerId: 1, button: 0, clientX: 140, clientY: 105 });
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 140, clientY: 105 });
    fireEvent.pointerDown(canvas, { pointerId: 2, button: 0, clientX: 84, clientY: 63 });
    fireEvent.pointerUp(canvas, { pointerId: 2, clientX: 84, clientY: 63 });
    expect(onAction).not.toHaveBeenCalled();
  });

  it('перемещает точечный штрих, даже когда все четыре маркера его рамки пересекаются', () => {
    const base = createProject();
    const project = applyAction(base, { type: 'addStroke', layerId: base.activeLayerId,
      stroke: { id: 'dot', kind: 'ink', brushId: 'pencil', color: '#112233', width: 8,
        opacity: 1, points: [{ x: .4, y: .4 }] } });
    const onAction = vi.fn();
    render(<EditorCanvas history={createProjectHistory(project)} onAction={onAction}
      onUndo={() => {}} onRedo={() => {}} />);
    const canvas = screen.getByRole('img', { name: 'Холст для рисования' }) as HTMLCanvasElement;
    canvas.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, width: 400, height: 300,
      right: 400, bottom: 300, toJSON: () => ({}) });
    fireEvent.click(screen.getByRole('button', { name: 'Выделение' }));
    fireEvent.pointerDown(canvas, { pointerId: 1, button: 0, clientX: 160, clientY: 120 });
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 160, clientY: 120 });
    fireEvent.pointerDown(canvas, { pointerId: 2, button: 0, clientX: 160, clientY: 120 });
    fireEvent.pointerMove(canvas, { pointerId: 2, clientX: 240, clientY: 120 });
    fireEvent.pointerUp(canvas, { pointerId: 2, clientX: 240, clientY: 120 });
    expect(onAction).toHaveBeenCalledOnce();
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ type: 'transformItems', ids: ['dot'],
      scaleX: 1, scaleY: 1, translateX: .2, translateY: 0 }));
  });

  it('не оставляет фиктивный выбор после Undo, удалившего выбранный объект', () => {
    const base = createProject();
    const withShape = applyAction(base, { type: 'addShape', layerId: base.activeLayerId,
      shape: { id: 'temporary-r2', kind: 'rectangle', from: { x: .2, y: .2 }, to: { x: .5, y: .5 },
        color: '#112233', width: 3, opacity: 1, style: 'both' } });
    const onAction = vi.fn();
    const { rerender } = render(<EditorCanvas history={createProjectHistory(withShape)}
      onAction={onAction} onUndo={() => {}} onRedo={() => {}} />);
    const canvas = screen.getByRole('img', { name: 'Холст для рисования' }) as HTMLCanvasElement;
    canvas.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, width: 400, height: 300,
      right: 400, bottom: 300, toJSON: () => ({}) });
    fireEvent.click(screen.getByRole('button', { name: 'Выделение' }));
    fireEvent.pointerDown(canvas, { pointerId: 1, button: 0, clientX: 140, clientY: 105 });
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 140, clientY: 105 });
    expect(screen.getByText('Выбрано: 1')).toBeTruthy();
    rerender(<EditorCanvas history={createProjectHistory(base)} onAction={onAction}
      onUndo={() => {}} onRedo={() => {}} />);
    expect(screen.queryByText('Выбрано: 1')).toBeNull();
    expect(vi.mocked(renderProject).mock.lastCall?.[3].selectionFrame).toBeUndefined();
  });
  it('аварийный PNG рендерит весь документ без зума и рамки выделения', () => {
    const contexts = new WeakMap<HTMLCanvasElement, CanvasRenderingContext2D>();
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
      if (!contexts.has(this)) contexts.set(this, { canvas: this, fillRect: vi.fn(), drawImage: vi.fn() } as unknown as CanvasRenderingContext2D);
      return contexts.get(this)!;
    } as unknown as typeof HTMLCanvasElement.prototype.getContext);
    const dataUrl = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,abc');
    const download = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    try {
      render(<EditorCanvas history={createProjectHistory(createProject())}
        onAction={() => {}} onUndo={() => {}} onRedo={() => {}}
        saveStatus="error" storageMessage="Проверьте свободное место" onRetry={() => {}} />);
      const original = screen.getByRole('img', { name: 'Холст для рисования' });
      fireEvent.click(screen.getByRole('button', { name: 'Увеличить' }));
      vi.mocked(renderProject).mockClear();
      fireEvent.click(screen.getByRole('button', { name: 'Скачать PNG' }));
      expect(renderProject).toHaveBeenCalledTimes(1);
      const [context, , , options] = vi.mocked(renderProject).mock.calls[0];
      expect(context.canvas).not.toBe(original);
      expect([context.canvas.width, context.canvas.height]).toEqual([1024, 768]);
      expect(options).toMatchObject({ zoom: 1, panX: 0, panY: 0 });
      expect(options.selection).toBeUndefined();
      expect(dataUrl).toHaveBeenCalled();
      expect(download).toHaveBeenCalledOnce();
    } finally { getContext.mockRestore(); dataUrl.mockRestore(); download.mockRestore(); }
  });
  it('показывает компактный заголовок слоёв и честное предупреждение о несохранённом рисунке', () => {
    render(<EditorCanvas history={createProjectHistory(createProject())}
      onAction={() => {}} onUndo={() => {}} onRedo={() => {}} />);
    const toggle = screen.getByRole('button', { name: 'Слои (1) · развернуть' });
    expect(toggle.textContent?.trim()).toBe('Слои (1)');
    expect(toggle.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    expect(screen.getByRole('note').textContent).toMatch(/после перезагрузки.*исчезнет/);
    expect(screen.queryByText('Удерживайте фигуру 0,5 с, чтобы переместить')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Фигуры' }));
    expect(screen.getByText('Удерживайте фигуру 0,5 с, чтобы переместить')).toBeTruthy();
  });

  it('объединяет инструменты, действия и настройки в устойчивые группы', () => {
    render(<EditorCanvas history={createProjectHistory(createProject())}
      onAction={() => {}} onUndo={() => {}} onRedo={() => {}} />);
    const toolbar = screen.getByLabelText('Инструменты рисования');
    const tools = toolbar.querySelector('.toolbar-drawing-tools');
    const settings = toolbar.querySelector('.toolbar-brush-settings');
    const actions = toolbar.querySelector('.toolbar-actions');
    for (const name of ['Кисти, выбран Карандаш', 'Ластик', 'Заливка ведром', 'Фигуры', 'Палитра, выбран #254332']) {
      expect(tools?.contains(screen.getByRole('button', { name }))).toBe(true);
    }
    for (const name of ['Отменить', 'Повторить', 'Очистить', 'Полный экран']) {
      expect(actions?.contains(screen.getByRole('button', { name }))).toBe(true);
    }
    for (const name of ['Толщина линии', 'Прозрачность кисти']) {
      expect(settings?.contains(screen.getByRole('slider', { name }))).toBe(true);
    }
  });

  it('размещает два списка фигур в отдельной группе и сохраняет настройки при смене инструмента', () => {
    render(<EditorCanvas history={createProjectHistory(createProject())}
      onAction={() => {}} onUndo={() => {}} onRedo={() => {}} />);
    fireEvent.change(screen.getByRole('slider', { name: 'Толщина линии' }), { target: { value: '18' } });
    fireEvent.change(screen.getByRole('slider', { name: 'Прозрачность кисти' }), { target: { value: '65' } });
    fireEvent.click(screen.getByRole('button', { name: 'Фигуры' }));
    const shapeOptions = screen.getByLabelText('Инструменты рисования').querySelector('.toolbar-shape-options');
    expect(shapeOptions?.contains(screen.getByRole('combobox', { name: 'Тип фигуры' }))).toBe(true);
    expect(shapeOptions?.contains(screen.getByRole('combobox', { name: 'Стиль фигуры' }))).toBe(true);
    fireEvent.change(screen.getByRole('combobox', { name: 'Тип фигуры' }), { target: { value: 'triangle' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ластик' }));
    fireEvent.click(screen.getByRole('button', { name: 'Фигуры' }));
    expect((screen.getByRole('combobox', { name: 'Тип фигуры' }) as HTMLSelectElement).value).toBe('triangle');
    expect((screen.getByRole('slider', { name: 'Толщина линии' }) as HTMLInputElement).value).toBe('18');
    expect((screen.getByRole('slider', { name: 'Прозрачность кисти' }) as HTMLInputElement).value).toBe('65');
  });

  it('показывает пиктограммы вместо текста на основных кнопках инструментов', () => {
    render(<EditorCanvas history={createProjectHistory(createProject())}
      onAction={() => {}} onUndo={() => {}} onRedo={() => {}} />);
    for (const name of ['Кисти, выбран Карандаш', 'Ластик', 'Заливка ведром', 'Фигуры',
      'Отменить', 'Повторить', 'Очистить', 'Полный экран']) {
      const button = screen.getByRole('button', { name });
      expect(button.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
      expect(button.textContent?.trim()).toBe('');
      expect(button.getAttribute('title')).toBeTruthy();
    }
    expect(screen.queryByRole('button', { name: 'Переместить фигуру' })).toBeNull();
    for (const name of ['Уменьшить', 'Увеличить', 'Сброс масштаба']) {
      const button = screen.getByRole('button', { name });
      expect(button.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
      expect(button.textContent?.trim()).toBe('');
    }
  });
  it('сбрасывает preview, если Undo во время drag удалил фигуру из документа', () => {
    vi.useFakeTimers();
    const base = createProject();
    const withShape = applyAction(base, { type: 'addShape', layerId: base.activeLayerId,
      shape: { id: 'existing', kind: 'rectangle', from: { x: .1, y: .1 }, to: { x: .4, y: .4 },
        color: '#FF0000', width: 3, style: 'both', opacity: 1 } });
    const onAction = vi.fn();
    const { rerender } = render(<EditorCanvas history={createProjectHistory(withShape)}
      onAction={onAction} onUndo={() => {}} onRedo={() => {}} />);
    const canvas = screen.getByRole('img', { name: 'Холст для рисования' }) as HTMLCanvasElement;
    canvas.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, width: 400, height: 300, right: 400, bottom: 300, toJSON: () => ({}) });
    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 100, clientY: 80, button: 0 });
    waitForLongPress();
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
    vi.useFakeTimers();
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
    fireEvent.pointerDown(canvas, { pointerId: 2, clientX: 80, clientY: 60, button: 0 });
    waitForLongPress();
    fireEvent.pointerMove(canvas, { pointerId: 2, clientX: 120, clientY: 90 });
    fireEvent.pointerUp(canvas, { pointerId: 2, clientX: 120, clientY: 90, button: 0 });
    expect(onAction).toHaveBeenLastCalledWith(expect.objectContaining({
      type: 'updateShape', shapeId: 'existing', from: { x: .2, y: .2 }, to: { x: .4, y: .4 },
    }));
  });
  it('даёт изменить размер фигуры маркером после долгого нажатия на узком холсте', () => {
    vi.useFakeTimers();
    const base = createProject();
    const withShape = applyAction(base, { type: 'addShape', layerId: base.activeLayerId,
      shape: { id: 'small', kind: 'rectangle', from: { x: .1, y: .1 }, to: { x: .4, y: .4 },
        color: '#123456', width: 4, style: 'both', opacity: 1 } });
    const onAction = vi.fn();
    render(<EditorCanvas history={createProjectHistory(withShape)} onAction={onAction} onUndo={() => {}} onRedo={() => {}} />);
    const canvas = screen.getByRole('img', { name: 'Холст для рисования' }) as HTMLCanvasElement;
    canvas.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, width: 320, height: 240, right: 320, bottom: 240, toJSON: () => ({}) });
    fireEvent.pointerDown(canvas, { pointerId: 1, button: 0, clientX: 80, clientY: 60 });
    waitForLongPress();
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 80, clientY: 60 });
    expect(vi.mocked(renderProject).mock.lastCall?.[3].selection?.shapeId).toBe('small');
    fireEvent.pointerDown(canvas, { pointerId: 2, button: 0, clientX: 32, clientY: 24 });
    fireEvent.pointerMove(canvas, { pointerId: 2, clientX: 16, clientY: 12 });
    fireEvent.pointerUp(canvas, { pointerId: 2, clientX: 16, clientY: 12 });
    expect(onAction).toHaveBeenLastCalledWith(expect.objectContaining({
      type: 'updateShape', shapeId: 'small', from: { x: .05, y: .05 }, to: { x: .4, y: .4 },
    }));
    fireEvent.pointerDown(canvas, { pointerId: 3, button: 0, clientX: 300, clientY: 220 });
    expect(vi.mocked(renderProject).mock.lastCall?.[3].selection).toBeUndefined();
  });

  it('быстрый мазок кистью поверх существующей фигуры рисует штрих, а не перемещает фигуру', () => {
    vi.useFakeTimers();
    const base = createProject();
    const project = applyAction(base, { type: 'addShape', layerId: base.activeLayerId,
      shape: { id: 'shape-1', kind: 'rectangle', from: { x: .1, y: .1 }, to: { x: .5, y: .5 },
        color: '#444444', width: 3, style: 'both', opacity: 1 } });
    const onAction = vi.fn();
    render(<EditorCanvas history={createProjectHistory(project)} onAction={onAction} onUndo={() => {}} onRedo={() => {}} />);
    const canvas = screen.getByRole('img', { name: 'Холст для рисования' }) as HTMLCanvasElement;
    canvas.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, width: 400, height: 300, right: 400, bottom: 300, toJSON: () => ({}) });
    fireEvent.pointerDown(canvas, { pointerId: 1, button: 0, clientX: 100, clientY: 90 });
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 103, clientY: 93 });
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 130, clientY: 120 });
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 140, clientY: 130 });
    act(() => { vi.advanceTimersByTime(700); });
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ type: 'addStroke',
      stroke: expect.objectContaining({ points: expect.arrayContaining([{ x: .25, y: .3 }, { x: .2575, y: .31 }, { x: .325, y: .4 }]) }) }));
  });

  it('сохраняет маленький замкнутый мазок поверх фигуры без выхода за порог удержания', () => {
    vi.useFakeTimers();
    const base = createProject();
    const project = applyAction(base, { type: 'addShape', layerId: base.activeLayerId,
      shape: { id: 'shape-1', kind: 'rectangle', from: { x: .1, y: .1 }, to: { x: .5, y: .5 },
        color: '#444444', width: 3, style: 'both', opacity: 1 } });
    const onAction = vi.fn();
    render(<EditorCanvas history={createProjectHistory(project)} onAction={onAction} onUndo={() => {}} onRedo={() => {}} />);
    const canvas = screen.getByRole('img', { name: 'Холст для рисования' }) as HTMLCanvasElement;
    canvas.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, width: 400, height: 300, right: 400, bottom: 300, toJSON: () => ({}) });
    fireEvent.pointerDown(canvas, { pointerId: 1, button: 0, clientX: 100, clientY: 90 });
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 103, clientY: 92 });
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 105, clientY: 90 });
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 100, clientY: 90 });
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 100, clientY: 90 });
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ type: 'addStroke',
      stroke: expect.objectContaining({ points: [
        { x: .25, y: .3 }, { x: .2575, y: .30666666666666664 }, { x: .2625, y: .3 }, { x: .25, y: .3 },
      ] }) }));
  });

  it('маленькое движение ластиком по фигуре не теряет точки', () => {
    vi.useFakeTimers();
    const base = createProject();
    const project = applyAction(base, { type: 'addShape', layerId: base.activeLayerId,
      shape: { id: 'shape-1', kind: 'rectangle', from: { x: .1, y: .1 }, to: { x: .5, y: .5 },
        color: '#444444', width: 3, style: 'both', opacity: 1 } });
    const onAction = vi.fn();
    render(<EditorCanvas history={createProjectHistory(project)} onAction={onAction} onUndo={() => {}} onRedo={() => {}} />);
    const canvas = screen.getByRole('img', { name: 'Холст для рисования' }) as HTMLCanvasElement;
    canvas.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, width: 400, height: 300, right: 400, bottom: 300, toJSON: () => ({}) });
    fireEvent.click(screen.getByRole('button', { name: 'Ластик' }));
    fireEvent.pointerDown(canvas, { pointerId: 1, button: 0, clientX: 100, clientY: 90 });
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 104, clientY: 93 });
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 100, clientY: 90 });
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ type: 'addStroke',
      stroke: expect.objectContaining({ kind: 'erase', points: [
        { x: .25, y: .3 }, { x: .26, y: .31 }, { x: .25, y: .3 },
      ] }) }));
  });

  it('короткое касание ведром существующей фигуры выполняет заливку', () => {
    vi.useFakeTimers();
    const base = createProject();
    const project = applyAction(base, { type: 'addShape', layerId: base.activeLayerId,
      shape: { id: 'shape-1', kind: 'rectangle', from: { x: .1, y: .1 }, to: { x: .5, y: .5 },
        color: '#444444', width: 3, style: 'both', opacity: 1 } });
    const onAction = vi.fn();
    render(<EditorCanvas history={createProjectHistory(project)} onAction={onAction} onUndo={() => {}} onRedo={() => {}} />);
    const canvas = screen.getByRole('img', { name: 'Холст для рисования' }) as HTMLCanvasElement;
    canvas.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, width: 400, height: 300, right: 400, bottom: 300, toJSON: () => ({}) });
    fireEvent.click(screen.getByRole('button', { name: 'Заливка ведром' }));
    fireEvent.pointerDown(canvas, { pointerId: 1, button: 0, clientX: 100, clientY: 90 });
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 100, clientY: 90 });
    act(() => { vi.advanceTimersByTime(700); });
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ type: 'addFill' }));
  });

  it('второй палец отменяет отложенное перемещение фигуры', () => {
    vi.useFakeTimers();
    const base = createProject();
    const project = applyAction(base, { type: 'addShape', layerId: base.activeLayerId,
      shape: { id: 'shape-1', kind: 'rectangle', from: { x: .1, y: .1 }, to: { x: .5, y: .5 },
        color: '#444444', width: 3, style: 'both', opacity: 1 } });
    const onAction = vi.fn();
    render(<EditorCanvas history={createProjectHistory(project)} onAction={onAction} onUndo={() => {}} onRedo={() => {}} />);
    const canvas = screen.getByRole('img', { name: 'Холст для рисования' }) as HTMLCanvasElement;
    canvas.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, width: 400, height: 300, right: 400, bottom: 300, toJSON: () => ({}) });
    fireEvent.pointerDown(canvas, { pointerId: 1, pointerType: 'touch', button: 0, clientX: 100, clientY: 90 });
    fireEvent.pointerDown(canvas, { pointerId: 2, pointerType: 'touch', button: 0, clientX: 200, clientY: 90 });
    waitForLongPress();
    fireEvent.pointerUp(canvas, { pointerId: 2, pointerType: 'touch', clientX: 200, clientY: 90 });
    fireEvent.pointerUp(canvas, { pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 90 });
    expect(onAction).not.toHaveBeenCalled();
    expect(vi.mocked(renderProject).mock.lastCall?.[3].selection).toBeUndefined();
  });

  it('простое удержание фигуры выделяет её, но не добавляет действие в историю', () => {
    vi.useFakeTimers();
    const base = createProject();
    const project = applyAction(base, { type: 'addShape', layerId: base.activeLayerId,
      shape: { id: 'shape-1', kind: 'ellipse', from: { x: .123456789, y: .123456789 }, to: { x: .51346789, y: .51346789 },
        color: '#444444', width: 3, style: 'both', opacity: 1 } });
    const onAction = vi.fn();
    render(<EditorCanvas history={createProjectHistory(project)} onAction={onAction} onUndo={() => {}} onRedo={() => {}} />);
    const canvas = screen.getByRole('img', { name: 'Холст для рисования' }) as HTMLCanvasElement;
    canvas.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, width: 400, height: 300, right: 400, bottom: 300, toJSON: () => ({}) });
    fireEvent.pointerDown(canvas, { pointerId: 1, button: 0, clientX: 100, clientY: 90 });
    act(() => { vi.advanceTimersByTime(499); });
    expect(vi.mocked(renderProject).mock.lastCall?.[3].selection).toBeUndefined();
    act(() => { vi.advanceTimersByTime(1); });
    expect(vi.mocked(renderProject).mock.lastCall?.[3].selection?.shapeId).toBe('shape-1');
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 100, clientY: 90 });
    expect(onAction).not.toHaveBeenCalled();
  });

  it('отмена указателя до истечения таймера не оставляет скрытого редактирования', () => {
    vi.useFakeTimers();
    const base = createProject();
    const project = applyAction(base, { type: 'addShape', layerId: base.activeLayerId,
      shape: { id: 'shape-1', kind: 'rectangle', from: { x: .1, y: .1 }, to: { x: .5, y: .5 },
        color: '#444444', width: 3, style: 'both', opacity: 1 } });
    const onAction = vi.fn();
    render(<EditorCanvas history={createProjectHistory(project)} onAction={onAction} onUndo={() => {}} onRedo={() => {}} />);
    const canvas = screen.getByRole('img', { name: 'Холст для рисования' }) as HTMLCanvasElement;
    canvas.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, width: 400, height: 300, right: 400, bottom: 300, toJSON: () => ({}) });
    fireEvent.pointerDown(canvas, { pointerId: 1, button: 0, clientX: 100, clientY: 90 });
    fireEvent.pointerCancel(canvas, { pointerId: 1, clientX: 100, clientY: 90 });
    act(() => { vi.advanceTimersByTime(700); });
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 150, clientY: 150 });
    expect(onAction).not.toHaveBeenCalled();
    expect(vi.mocked(renderProject).mock.lastCall?.[3].selection).toBeUndefined();
  });

  it('удаление слоя с фигурой отменяет ожидание долгого нажатия', () => {
    vi.useFakeTimers();
    const base = createProject();
    const project = applyAction(base, { type: 'addShape', layerId: base.activeLayerId,
      shape: { id: 'shape-1', kind: 'rectangle', from: { x: .1, y: .1 }, to: { x: .5, y: .5 },
        color: '#444444', width: 3, style: 'both', opacity: 1 } });
    const onAction = vi.fn();
    const { rerender } = render(<EditorCanvas history={createProjectHistory(project)}
      onAction={onAction} onUndo={() => {}} onRedo={() => {}} />);
    const canvas = screen.getByRole('img', { name: 'Холст для рисования' }) as HTMLCanvasElement;
    canvas.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, width: 400, height: 300, right: 400, bottom: 300, toJSON: () => ({}) });
    fireEvent.pointerDown(canvas, { pointerId: 1, button: 0, clientX: 100, clientY: 90 });
    rerender(<EditorCanvas history={createProjectHistory(base)} onAction={onAction} onUndo={() => {}} onRedo={() => {}} />);
    waitForLongPress();
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 150, clientY: 150 });
    expect(onAction).not.toHaveBeenCalled();
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

  it('сохраняет независимую толщину кисти и ластика при переключении инструментов', () => {
    const onAction = vi.fn();
    render(<EditorCanvas history={createProjectHistory(createProject())}
      onAction={onAction} onUndo={() => {}} onRedo={() => {}} />);
    const canvas = screen.getByRole('img', { name: 'Холст для рисования' }) as HTMLCanvasElement;
    canvas.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, width: 400, height: 300, right: 400, bottom: 300, toJSON: () => ({}) });
    const thickness = screen.getByRole('slider', { name: 'Толщина линии' }) as HTMLInputElement;
    fireEvent.change(thickness, { target: { value: '18' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ластик' }));
    const eraserThickness = screen.getByRole('slider', { name: 'Толщина ластика' }) as HTMLInputElement;
    expect(eraserThickness.value).toBe('8');
    fireEvent.change(eraserThickness, { target: { value: '31' } });
    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 100, clientY: 100, button: 0 });
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 120, clientY: 120 });
    expect(onAction).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'addStroke',
      stroke: expect.objectContaining({ kind: 'erase', width: 31 }) }));

    fireEvent.click(screen.getByRole('button', { name: 'Кисти, выбран Карандаш' }));
    fireEvent.click(screen.getByRole('button', { name: 'Выбрать Карандаш' }));
    expect(thickness.value).toBe('18');
    fireEvent.pointerDown(canvas, { pointerId: 2, clientX: 100, clientY: 100, button: 0 });
    fireEvent.pointerUp(canvas, { pointerId: 2, clientX: 120, clientY: 120 });
    expect(onAction).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'addStroke',
      stroke: expect.objectContaining({ kind: 'ink', width: 18 }) }));
  });

  it('включает промежуточные coalesced-точки в один штрих пера без повторения последней точки', () => {
    const onAction = vi.fn();
    render(<EditorCanvas history={createProjectHistory(createProject())}
      onAction={onAction} onUndo={() => {}} onRedo={() => {}} />);
    const canvas = screen.getByRole('img', { name: 'Холст для рисования' }) as HTMLCanvasElement;
    canvas.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, width: 400, height: 300, right: 400, bottom: 300, toJSON: () => ({}) });
    fireEvent.pointerDown(canvas, { pointerId: 7, pointerType: 'pen', clientX: 100, clientY: 90, button: 0 });
    const move = new Event('pointermove', { bubbles: true });
    Object.assign(move, { pointerId: 7, pointerType: 'pen', clientX: 160, clientY: 120,
      getCoalescedEvents: () => [
        { pointerId: 7, clientX: 120, clientY: 100 },
        { pointerId: 7, clientX: 140, clientY: 110 },
        { pointerId: 7, clientX: 160, clientY: 120 },
      ] });
    fireEvent(canvas, move);
    fireEvent.pointerUp(canvas, { pointerId: 7, pointerType: 'pen', clientX: 180, clientY: 130 });
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'addStroke',
      stroke: expect.objectContaining({ points: [
        { x: .25, y: .3 }, { x: .3, y: 1 / 3 }, { x: .35, y: 110 / 300 },
        { x: .4, y: .4 }, { x: .45, y: 130 / 300 },
      ] }) }));
  });

  it('даёт перу приоритет перед касаниями ладони, не прерывая штрих и не меняя масштаб', () => {
    const onAction = vi.fn();
    render(<EditorCanvas history={createProjectHistory(createProject())}
      onAction={onAction} onUndo={() => {}} onRedo={() => {}} />);
    const canvas = screen.getByRole('img', { name: 'Холст для рисования' }) as HTMLCanvasElement;
    canvas.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, width: 400, height: 300, right: 400, bottom: 300, toJSON: () => ({}) });
    fireEvent.pointerDown(canvas, { pointerId: 1, pointerType: 'touch', clientX: 85, clientY: 90, button: 0 });
    fireEvent.pointerDown(canvas, { pointerId: 7, pointerType: 'pen', clientX: 100, clientY: 100, button: 0 });
    fireEvent.pointerDown(canvas, { pointerId: 2, pointerType: 'touch', clientX: 200, clientY: 90, button: 0 });
    fireEvent.pointerMove(canvas, { pointerId: 2, pointerType: 'touch', clientX: 250, clientY: 90 });
    fireEvent.pointerMove(canvas, { pointerId: 7, pointerType: 'pen', clientX: 130, clientY: 110 });
    fireEvent.pointerUp(canvas, { pointerId: 1, pointerType: 'touch', clientX: 85, clientY: 90 });
    fireEvent.pointerUp(canvas, { pointerId: 2, pointerType: 'touch', clientX: 250, clientY: 90 });
    fireEvent.pointerUp(canvas, { pointerId: 7, pointerType: 'pen', clientX: 150, clientY: 120 });
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'addStroke',
      stroke: expect.objectContaining({ points: [{ x: .25, y: 1 / 3 }, { x: .325, y: 110 / 300 }, { x: .375, y: .4 }] }) }));
    expect(document.querySelector('.zoom-controls > span')?.textContent).toBe('100%');
  });

  it('не повторяет coalesced-точки при начале мазка поверх существующей фигуры', () => {
    const base = createProject();
    const project = applyAction(base, { type: 'addShape', layerId: base.activeLayerId,
      shape: { id: 'figure', kind: 'rectangle', from: { x: .1, y: .1 }, to: { x: .5, y: .5 },
        color: '#444444', width: 3, style: 'both', opacity: 1 } });
    const onAction = vi.fn();
    render(<EditorCanvas history={createProjectHistory(project)}
      onAction={onAction} onUndo={() => {}} onRedo={() => {}} />);
    const canvas = screen.getByRole('img', { name: 'Холст для рисования' }) as HTMLCanvasElement;
    canvas.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, width: 400, height: 300, right: 400, bottom: 300, toJSON: () => ({}) });
    fireEvent.pointerDown(canvas, { pointerId: 7, pointerType: 'pen', clientX: 100, clientY: 90, button: 0 });
    const move = new Event('pointermove', { bubbles: true });
    Object.assign(move, { pointerId: 7, pointerType: 'pen', clientX: 130, clientY: 105,
      getCoalescedEvents: () => [
        { pointerId: 7, clientX: 110, clientY: 95 },
        { pointerId: 7, clientX: 120, clientY: 100 },
        { pointerId: 7, clientX: 130, clientY: 105 },
      ] });
    fireEvent(canvas, move);
    fireEvent.pointerUp(canvas, { pointerId: 7, pointerType: 'pen', clientX: 140, clientY: 110 });
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'addStroke',
      stroke: expect.objectContaining({ points: [
        { x: .25, y: .3 }, { x: .275, y: 95 / 300 }, { x: .3, y: 1 / 3 },
        { x: .325, y: .35 }, { x: .35, y: 110 / 300 },
      ] }),
    }));
  });

  it('освобождает блокировку касаний при потере захвата пера без pointerup', () => {
    const onAction = vi.fn();
    render(<EditorCanvas history={createProjectHistory(createProject())}
      onAction={onAction} onUndo={() => {}} onRedo={() => {}} />);
    const canvas = screen.getByRole('img', { name: 'Холст для рисования' }) as HTMLCanvasElement;
    canvas.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, width: 400, height: 300, right: 400, bottom: 300, toJSON: () => ({}) });
    fireEvent.pointerDown(canvas, { pointerId: 7, pointerType: 'pen', clientX: 100, clientY: 90, button: 0 });
    fireEvent.lostPointerCapture(canvas, { pointerId: 7, pointerType: 'pen' });
    fireEvent.pointerDown(canvas, { pointerId: 8, pointerType: 'touch', clientX: 120, clientY: 120, button: 0 });
    fireEvent.pointerUp(canvas, { pointerId: 8, pointerType: 'touch', clientX: 140, clientY: 140 });
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ type: 'addStroke',
      stroke: expect.objectContaining({ points: [{ x: .3, y: .4 }, { x: .35, y: 140 / 300 }] }) }));
  });

  it('не сбрасывает активное перо при потере захвата чужого указателя', () => {
    const onAction = vi.fn();
    render(<EditorCanvas history={createProjectHistory(createProject())}
      onAction={onAction} onUndo={() => {}} onRedo={() => {}} />);
    const canvas = screen.getByRole('img', { name: 'Холст для рисования' }) as HTMLCanvasElement;
    canvas.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, width: 400, height: 300, right: 400, bottom: 300, toJSON: () => ({}) });
    fireEvent.pointerDown(canvas, { pointerId: 7, pointerType: 'pen', clientX: 100, clientY: 90, button: 0 });
    fireEvent.lostPointerCapture(canvas, { pointerId: 8, pointerType: 'touch' });
    fireEvent.pointerUp(canvas, { pointerId: 7, pointerType: 'pen', clientX: 130, clientY: 110 });
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('фиксирует кисть, размер и прозрачность при начале штриха', () => {
    const onAction = vi.fn();
    render(<EditorCanvas history={createProjectHistory(createProject())}
      onAction={onAction} onUndo={() => {}} onRedo={() => {}} />);
    const canvas = screen.getByRole('img', { name: 'Холст для рисования' }) as HTMLCanvasElement;
    canvas.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, width: 400, height: 300, right: 400, bottom: 300, toJSON: () => ({}) });
    fireEvent.pointerDown(canvas, { pointerId: 7, pointerType: 'pen', clientX: 100, clientY: 90, button: 0 });
    fireEvent.change(screen.getByRole('slider', { name: 'Толщина линии' }), { target: { value: '30' } });
    fireEvent.change(screen.getByRole('slider', { name: 'Прозрачность кисти' }), { target: { value: '35' } });
    fireEvent.click(screen.getByRole('button', { name: 'Кисти, выбран Карандаш' }));
    fireEvent.click(screen.getByRole('button', { name: 'Выбрать Уголь' }));
    fireEvent.pointerUp(canvas, { pointerId: 7, pointerType: 'pen', clientX: 130, clientY: 110 });
    expect(onAction).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'addStroke',
      stroke: expect.objectContaining({ width: 8, opacity: 1, brushId: 'pencil' }) }));
    fireEvent.pointerDown(canvas, { pointerId: 8, pointerType: 'pen', clientX: 140, clientY: 120, button: 0 });
    fireEvent.pointerUp(canvas, { pointerId: 8, pointerType: 'pen', clientX: 160, clientY: 140 });
    expect(onAction).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'addStroke',
      stroke: expect.objectContaining({ width: 30, opacity: .35, brushId: 'charcoal' }) }));
  });

  it('сохраняет начальную толщину при переходе удержания фигуры в обычный мазок', () => {
    const base = createProject();
    const project = applyAction(base, { type: 'addShape', layerId: base.activeLayerId,
      shape: { id: 'figure', kind: 'rectangle', from: { x: .1, y: .1 }, to: { x: .5, y: .5 },
        color: '#444444', width: 3, style: 'both', opacity: 1 } });
    const onAction = vi.fn();
    render(<EditorCanvas history={createProjectHistory(project)}
      onAction={onAction} onUndo={() => {}} onRedo={() => {}} />);
    const canvas = screen.getByRole('img', { name: 'Холст для рисования' }) as HTMLCanvasElement;
    canvas.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, width: 400, height: 300, right: 400, bottom: 300, toJSON: () => ({}) });
    fireEvent.pointerDown(canvas, { pointerId: 7, pointerType: 'pen', clientX: 100, clientY: 90, button: 0 });
    fireEvent.change(screen.getByRole('slider', { name: 'Толщина линии' }), { target: { value: '30' } });
    fireEvent.pointerMove(canvas, { pointerId: 7, pointerType: 'pen', clientX: 130, clientY: 110 });
    fireEvent.pointerUp(canvas, { pointerId: 7, pointerType: 'pen', clientX: 140, clientY: 120 });
    expect(onAction).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'addStroke',
      stroke: expect.objectContaining({ width: 8 }) }));
  });
});
