import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { App } from './App';

afterEach(cleanup);

describe('Эскизно — оболочка приложения', () => {
  it('показывает название и доступные разделы', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: 'Эскизно', level: 1 })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Свободная студия' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Мои работы' })).toBeTruthy();
  });

  it('переходит в студию, затем в список работ без перезагрузки страницы', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Свободная студия' }));
    expect(screen.getByRole('heading', { name: 'Свободная студия', level: 2 })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Мои работы' }));
    expect(screen.getByRole('heading', { name: 'Мои работы', level: 2 })).toBeTruthy();
  });

  it('рисует штрих мышью, отменяет/возвращает его и сохраняет черновик при переключении разделов', () => {
    const originalRect = HTMLCanvasElement.prototype.getBoundingClientRect;
    HTMLCanvasElement.prototype.getBoundingClientRect = () => ({
      x: 0, y: 0, top: 0, left: 0, width: 1024, height: 768,
      right: 1024, bottom: 768, toJSON: () => ({}),
    });
    try {
      render(<App />);
      fireEvent.click(screen.getByRole('button', { name: 'Свободная студия' }));
      const canvas = screen.getByRole('img', { name: 'Холст для рисования' });
      expect((canvas as HTMLCanvasElement).width).toBe(1024);
      expect((canvas as HTMLCanvasElement).height).toBe(768);

      fireEvent.pointerDown(canvas, { pointerId: 1, pointerType: 'mouse', button: 0, clientX: 180, clientY: 180 });
      fireEvent.pointerMove(canvas, { pointerId: 1, pointerType: 'mouse', clientX: 300, clientY: 300 });
      fireEvent.pointerUp(canvas, { pointerId: 1, pointerType: 'mouse', clientX: 300, clientY: 300 });

      expect(screen.getByText('Штрихов: 1')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Отменить' }));
      expect(screen.getByText('Штрихов: 0')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Повторить' }));
      expect(screen.getByText('Штрихов: 1')).toBeTruthy();

      fireEvent.click(screen.getByRole('button', { name: 'Мои работы' }));
      fireEvent.click(screen.getByRole('button', { name: 'Свободная студия' }));
      expect(screen.getByText('Штрихов: 1')).toBeTruthy();
    } finally {
      HTMLCanvasElement.prototype.getBoundingClientRect = originalRect;
    }
  });

  it('создаёт второй слой и не меняет размер пиксельного холста при увеличении', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Свободная студия' }));
    fireEvent.click(screen.getByRole('button', { name: 'Добавить слой' }));
    expect(screen.getByRole('button', { name: /^Слой 2 · выбран$/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Увеличить' }));
    expect(screen.getByText('125%')).toBeTruthy();
    const canvas = screen.getByRole('img', { name: 'Холст для рисования' }) as HTMLCanvasElement;
    expect(canvas.width).toBe(1024);
    expect(canvas.height).toBe(768);
  });

  it('не сохраняет незавершённый штрих после pointercancel', () => {
    const originalRect = HTMLCanvasElement.prototype.getBoundingClientRect;
    HTMLCanvasElement.prototype.getBoundingClientRect = () => ({
      x: 0, y: 0, top: 0, left: 0, width: 1024, height: 768,
      right: 1024, bottom: 768, toJSON: () => ({}),
    });
    try {
      render(<App />);
      fireEvent.click(screen.getByRole('button', { name: 'Свободная студия' }));
      const canvas = screen.getByRole('img', { name: 'Холст для рисования' });
      fireEvent.pointerDown(canvas, { pointerId: 7, button: 0, clientX: 180, clientY: 180 });
      fireEvent.pointerMove(canvas, { pointerId: 7, clientX: 240, clientY: 240 });
      fireEvent.pointerCancel(canvas, { pointerId: 7 });
      fireEvent.pointerUp(canvas, { pointerId: 7, clientX: 240, clientY: 240 });
      expect(screen.getByText('Штрихов: 0')).toBeTruthy();
      expect((screen.getByRole('button', { name: 'Отменить' }) as HTMLButtonElement).disabled).toBe(true);
    } finally {
      HTMLCanvasElement.prototype.getBoundingClientRect = originalRect;
    }
  });
});
