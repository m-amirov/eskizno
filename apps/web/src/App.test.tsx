import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

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

  it('масштабирует колёсиком над холстом без прокрутки страницы', () => {
    const originalRect = HTMLCanvasElement.prototype.getBoundingClientRect;
    HTMLCanvasElement.prototype.getBoundingClientRect = () => ({
      x: 0, y: 0, top: 0, left: 0, width: 1024, height: 768,
      right: 1024, bottom: 768, toJSON: () => ({}),
    });
    try {
      render(<App />);
      fireEvent.click(screen.getByRole('button', { name: 'Свободная студия' }));
      const canvas = screen.getByRole('img', { name: 'Холст для рисования' });
      const wheel = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -100, clientX: 600, clientY: 350 });
      fireEvent(canvas, wheel);
      expect(wheel.defaultPrevented).toBe(true);
      expect(screen.getByText('122%')).toBeTruthy();
      expect((canvas as HTMLCanvasElement).width).toBe(1024);
      expect((canvas as HTMLCanvasElement).height).toBe(768);
    } finally {
      HTMLCanvasElement.prototype.getBoundingClientRect = originalRect;
    }
  });

  it('второй палец отменяет текущий штрих и выполняет pinch без случайной линии', () => {
    const originalRect = HTMLCanvasElement.prototype.getBoundingClientRect;
    HTMLCanvasElement.prototype.getBoundingClientRect = () => ({
      x: 0, y: 0, top: 0, left: 0, width: 1024, height: 768,
      right: 1024, bottom: 768, toJSON: () => ({}),
    });
    try {
      render(<App />);
      fireEvent.click(screen.getByRole('button', { name: 'Свободная студия' }));
      const canvas = screen.getByRole('img', { name: 'Холст для рисования' });
      fireEvent.pointerDown(canvas, { pointerId: 1, pointerType: 'touch', button: 0, clientX: 256, clientY: 384 });
      fireEvent.pointerMove(canvas, { pointerId: 1, pointerType: 'touch', clientX: 270, clientY: 384 });
      fireEvent.pointerDown(canvas, { pointerId: 2, pointerType: 'touch', button: 0, clientX: 512, clientY: 384 });
      fireEvent.pointerMove(canvas, { pointerId: 2, pointerType: 'touch', clientX: 640, clientY: 384 });
      fireEvent.pointerUp(canvas, { pointerId: 2, pointerType: 'touch', clientX: 640, clientY: 384 });
      fireEvent.pointerUp(canvas, { pointerId: 1, pointerType: 'touch', clientX: 270, clientY: 384 });
      expect(screen.getByText('Штрихов: 0')).toBeTruthy();
      expect(screen.queryByText('100%')).toBeNull();
      fireEvent.pointerDown(canvas, { pointerId: 3, pointerType: 'touch', button: 0, clientX: 350, clientY: 384 });
      fireEvent.pointerUp(canvas, { pointerId: 3, pointerType: 'touch', clientX: 350, clientY: 384 });
      expect(screen.getByText('Штрихов: 1')).toBeTruthy();
    } finally {
      HTMLCanvasElement.prototype.getBoundingClientRect = originalRect;
    }
  });

  it('в режиме фокуса скрывает окружение редактора и выходит по Escape, если Fullscreen API недоступен', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Свободная студия' }));
    fireEvent.click(screen.getByRole('button', { name: 'Полный экран' }));
    const canvas = screen.getByRole('img', { name: 'Холст для рисования' });
    const layout = canvas.closest('.studio-layout');
    expect(layout?.classList.contains('focus-mode')).toBe(true);
    expect(screen.getByText(/Полный экран недоступен/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Выйти из полного экрана' })).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(layout?.classList.contains('focus-mode')).toBe(false);
    expect(screen.getByRole('button', { name: 'Полный экран' })).toBeTruthy();
  });

  it('помещает в native fullscreen только студию и восстанавливает состояние после fullscreenchange', async () => {
    const originalRequest = Element.prototype.requestFullscreen;
    const originalExit = document.exitFullscreen;
    const originalDescriptor = Object.getOwnPropertyDescriptor(document, 'fullscreenElement');
    let nativeFullscreen: Element | null = null;
    Element.prototype.requestFullscreen = async function () {
      nativeFullscreen = this;
      document.dispatchEvent(new Event('fullscreenchange'));
    };
    document.exitFullscreen = async () => {
      nativeFullscreen = null;
      document.dispatchEvent(new Event('fullscreenchange'));
    };
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => nativeFullscreen });
    try {
      render(<App />);
      fireEvent.click(screen.getByRole('button', { name: 'Свободная студия' }));
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Полный экран' })); });
      const layout = screen.getByRole('img', { name: 'Холст для рисования' }).closest('.studio-layout');
      expect(nativeFullscreen).toBe(layout);
      expect(screen.getByRole('button', { name: 'Карандаш' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Выйти из полного экрана' })).toBeTruthy();

      nativeFullscreen = null;
      await act(async () => { document.dispatchEvent(new Event('fullscreenchange')); });
      await waitFor(() => expect(screen.getByRole('button', { name: 'Полный экран' })).toBeTruthy());
      expect((screen.getByRole('img', { name: 'Холст для рисования' }) as HTMLCanvasElement).width).toBe(1024);
    } finally {
      if (originalRequest) Element.prototype.requestFullscreen = originalRequest;
      else delete (Element.prototype as { requestFullscreen?: Element['requestFullscreen'] }).requestFullscreen;
      if (originalExit) document.exitFullscreen = originalExit;
      else delete (document as { exitFullscreen?: Document['exitFullscreen'] }).exitFullscreen;
      if (originalDescriptor) Object.defineProperty(document, 'fullscreenElement', originalDescriptor);
      else delete (document as { fullscreenElement?: Element | null }).fullscreenElement;
    }
  });
});
