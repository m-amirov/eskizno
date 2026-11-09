import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { LayerList } from './LayerList';
import { createProjectHistory, commitAction, undoAction } from './history';
import { applyAction, createProject, type DrawingProject } from './model';

afterEach(cleanup);

function makeProject({ locked = false } = {}): DrawingProject {
  const first = createProject();
  return applyAction(first, {
    type: 'addLayer',
    layer: { kind: 'paint', id: 'second', name: 'Верхний', strokes: [], visible: true, locked, opacity: 1 },
  });
}

function Harness({ locked = false }: { locked?: boolean }) {
  const [history, setHistory] = useState(() => createProjectHistory(makeProject({ locked })));
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
});
