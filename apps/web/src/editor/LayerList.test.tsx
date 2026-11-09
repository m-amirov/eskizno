import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { LayerList } from './LayerList';
import { createProjectHistory, commitAction, undoAction } from './history';
import { applyAction, createProject, type DrawingProject } from './model';

afterEach(cleanup);

function makeProject({ locked = false, withStroke = false } = {}): DrawingProject {
  const first = createProject();
  const two = applyAction(first, {
    type: 'addLayer',
    layer: { kind: 'paint', id: 'second', name: 'Верхний', strokes: [], visible: true, locked, opacity: 1 },
  });
  if (!withStroke) return two;
  return applyAction(two, { type: 'addStroke', layerId: 'second', stroke: {
    id: 'ink-1', kind: 'ink', brushId: 'pencil', color: '#ff0000', width: 5, opacity: 1,
    points: [{ x: .5, y: .5 }],
  } });
}

function Harness({ locked = false, withStroke = false }: { locked?: boolean; withStroke?: boolean }) {
  const [history, setHistory] = useState(() => createProjectHistory(makeProject({ locked, withStroke })));
  return <>
    <LayerList layers={history.present.layers} activeLayerId={history.present.activeLayerId} onAction={(action) => setHistory((current) => commitAction(current, action))} />
    <output aria-label="Порядок слоёв">{history.present.layers.map((layer) => layer.id).join(',')}</output>
    <output aria-label="Активный слой">{history.present.activeLayerId}</output>
    <button onClick={() => setHistory(undoAction)}>Отменить</button>
  </>;
}

function layoutRows() {
  const rows = Array.from(document.querySelectorAll('.layer-row')) as HTMLDivElement[];
  rows.forEach((row, index) => {
    row.getBoundingClientRect = () => ({ x: 0, y: index * 50, left: 0, top: index * 50, width: 220, height: 42, right: 220, bottom: index * 50 + 42, toJSON: () => ({}) });
  });
  const list = document.querySelector('.layers-list') as HTMLDivElement;
  list.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, width: 220, height: 100, right: 220, bottom: 100, toJSON: () => ({}) });
}

describe('перетаскивание слоёв', () => {
  it('показывает название активного слоя без лишнего слова и рисует иконки действий', () => {
    render(<Harness />);
    const selected = screen.getByRole('button', { name: 'Слой 1 · выбран' });
    expect(selected.textContent).toBe('Слой 1');
    expect(selected.getAttribute('aria-pressed')).toBe('true');
    for (const name of ['Действия со слоем Верхний', 'Перетащить Верхний']) {
      const button = screen.getByRole('button', { name });
      expect(button.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
      expect(button.textContent?.trim()).toBe('');
    }
  });

  it('переименовывает слой из меню, выделяет исходное имя и поддерживает отмену', () => {
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Действия со слоем Верхний' });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Переименовать' }));
    const input = screen.getByRole('textbox', { name: 'Название слоя Верхний' }) as HTMLInputElement;
    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe('Верхний'.length);
    fireEvent.change(input, { target: { value: '  Набросок лица  ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByRole('button', { name: 'Действия со слоем Набросок лица' })).toBeTruthy();
    expect(document.activeElement).toBe(trigger);
    fireEvent.click(screen.getByRole('button', { name: 'Отменить' }));
    expect(screen.getByRole('button', { name: 'Действия со слоем Верхний' })).toBeTruthy();
  });

  it('не сохраняет пустое имя, а Escape отменяет редактирование', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Действия со слоем Верхний' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Переименовать' }));
    const input = screen.getByRole('textbox', { name: 'Название слоя Верхний' });
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByRole('textbox', { name: 'Название слоя Верхний' })).toBeTruthy();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.getByRole('button', { name: 'Действия со слоем Верхний' })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Действия со слоем Верхний' }));
  });

  it('разрешает переименовать заблокированный слой, не снимая блокировку', () => {
    render(<Harness locked />);
    fireEvent.click(screen.getByRole('button', { name: 'Действия со слоем Верхний' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Переименовать' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Название слоя Верхний' }), { target: { value: 'Фон' } });
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Название слоя Верхний' }), { key: 'Enter' });
    expect((screen.getByRole('button', { name: 'Перетащить Фон' }) as HTMLButtonElement).disabled).toBe(true);
  });
  it('касанием поднимает нижний слой наверх и позволяет отменить перестановку', () => {
    render(<Harness />);
    layoutRows();
    const firstId = screen.getByRole('status', { name: 'Активный слой' }).textContent;
    const bottomHandle = screen.getByRole('button', { name: /Перетащить Слой 1/ });
    fireEvent.pointerDown(bottomHandle, { pointerId: 4, pointerType: 'touch', clientY: 70, clientX: 15, button: 0 });
    fireEvent.pointerMove(bottomHandle, { pointerId: 4, pointerType: 'touch', clientY: 20, clientX: 15 });
    expect(document.querySelector('.layer-row.drag-target')).not.toBeNull();
    fireEvent.pointerUp(bottomHandle, { pointerId: 4, pointerType: 'touch', clientY: 20, clientX: 15 });
    expect(screen.getByRole('status', { name: 'Порядок слоёв' }).textContent).toBe(`second,${firstId}`);
    expect(screen.getByRole('status', { name: 'Активный слой' }).textContent).toBe(firstId);
    fireEvent.click(screen.getByRole('button', { name: 'Отменить' }));
    expect(screen.getByRole('status', { name: 'Порядок слоёв' }).textContent).toBe(`${firstId},second`);
  });

  it('не перемещает слой при коротком касании и при отпускании вне списка', () => {
    render(<Harness />);
    layoutRows();
    const initial = screen.getByRole('status', { name: 'Порядок слоёв' }).textContent;
    const handle = screen.getByRole('button', { name: /Перетащить Слой 1/ });
    fireEvent.pointerDown(handle, { pointerId: 7, pointerType: 'touch', clientY: 70, button: 0 });
    fireEvent.pointerUp(handle, { pointerId: 7, pointerType: 'touch', clientY: 70 });
    fireEvent.pointerDown(handle, { pointerId: 8, pointerType: 'touch', clientY: 70, button: 0 });
    fireEvent.pointerMove(handle, { pointerId: 8, pointerType: 'touch', clientY: -40 });
    fireEvent.pointerUp(handle, { pointerId: 8, pointerType: 'touch', clientY: -40 });
    expect(screen.getByRole('status', { name: 'Порядок слоёв' }).textContent).toBe(initial);
  });

  it('блокирует перенос заблокированного слоя и поддерживает клавиатурное перемещение', () => {
    render(<Harness locked />);
    layoutRows();
    const lockedHandle = screen.getByRole('button', { name: 'Перетащить Верхний' }) as HTMLButtonElement;
    expect(lockedHandle.disabled).toBe(true);
    const handle = screen.getByRole('button', { name: /Перетащить Слой 1/ });
    fireEvent.keyDown(handle, { key: 'ArrowUp' });
    const firstId = screen.getByRole('status', { name: 'Активный слой' }).textContent;
    expect(screen.getByRole('status', { name: 'Порядок слоёв' }).textContent).toBe(`second,${firstId}`);
  });

  it('показывает глазик, меняет видимость и переносит блокировку в меню', () => {
    render(<Harness />);
    const visible = screen.getByRole('button', { name: 'Скрыть Верхний' });
    expect(visible.querySelector('svg')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Заблокировать Верхний' })).toBeNull();
    fireEvent.click(visible);
    expect(screen.getByRole('button', { name: 'Показать Верхний' }).querySelector('svg')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Действия со слоем Верхний' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Заблокировать' }));
    expect((screen.getByRole('button', { name: 'Перетащить Верхний' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Действия со слоем Верхний' }));
    expect(screen.getByRole('menuitem', { name: 'Разблокировать' })).toBeTruthy();
    expect((screen.getByRole('menuitem', { name: 'Удалить слой' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('просит подтвердить удаление слоя с рисунком, отменяет и восстанавливает удаление через Undo', () => {
    render(<Harness withStroke />);
    const trigger = screen.getByRole('button', { name: 'Действия со слоем Верхний' });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Удалить слой' }));
    expect(screen.getByRole('alertdialog', { name: 'Удалить слой «Верхний»?' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Отмена удаления' }));
    expect(document.activeElement).toBe(trigger);
    expect(screen.getByRole('button', { name: 'Действия со слоем Верхний' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Действия со слоем Верхний' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Удалить слой' }));
    fireEvent.click(screen.getByRole('button', { name: 'Подтвердить удаление' }));
    expect(screen.queryByRole('button', { name: 'Действия со слоем Верхний' })).toBeNull();
    expect((screen.getByRole('button', { name: 'Действия со слоем Слой 1' }) as HTMLButtonElement)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Действия со слоем Слой 1' }));
    expect((screen.getByRole('menuitem', { name: 'Удалить слой' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Отменить' }));
    expect(screen.getByRole('button', { name: 'Действия со слоем Верхний' })).toBeTruthy();
  });

  it('удаляет пустой слой сразу и закрывает меню при клике снаружи', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Действия со слоем Верхний' }));
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('menu')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Действия со слоем Верхний' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Удалить слой' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Действия со слоем Верхний' })).toBeNull();
  });

  it('в резервном полном экране размещает меню внутри студии и фокусирует его пункты', () => {
    render(<div className="studio-layout focus-mode"><Harness /></div>);
    const trigger = screen.getByRole('button', { name: 'Действия со слоем Верхний' });
    fireEvent.click(trigger);
    const menu = screen.getByRole('menu');
    expect(menu.parentElement?.classList.contains('studio-layout')).toBe(true);
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Переименовать' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(document.activeElement).toBe(trigger);
  });
});
