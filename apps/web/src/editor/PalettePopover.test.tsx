import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { PalettePopover } from './PalettePopover';

afterEach(cleanup);

function PaletteHarness({ initialColors = ['#254332', '#F0C886'] }: { initialColors?: string[] }) {
  const [color, setColor] = useState('#254332');
  const [colors, setColors] = useState(initialColors);
  return (
    <>
      <PalettePopover
        color={color}
        colors={colors}
        onSelect={setColor}
        onSaveColor={(next) => setColors((current) => current.includes(next) ? current : [...current, next])}
      />
      <output aria-label="Выбранный цвет">{color}</output>
      <output aria-label="Количество цветов">{colors.length}</output>
    </>
  );
}

describe('всплывающая палитра', () => {
  it('показывает текущий цвет и выбирает цвет проекта, затем закрывается', () => {
    render(<PaletteHarness />);
    const toggle = screen.getByRole('button', { name: /Палитра/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(toggle);
    expect(screen.getByRole('dialog', { name: 'Палитра цветов' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Выбрать #F0C886' }));
    expect(screen.getByRole('status', { name: 'Выбранный цвет' }).textContent).toBe('#F0C886');
    expect(screen.queryByRole('dialog', { name: 'Палитра цветов' })).toBeNull();
  });

  it('закрывается по Escape и по клику вне панели, не меняя цвет', () => {
    render(<PaletteHarness />);
    const toggle = screen.getByRole('button', { name: /Палитра/ });
    fireEvent.click(toggle);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(toggle);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('status', { name: 'Выбранный цвет' }).textContent).toBe('#254332');
  });

  it('открывает редактор цвета, применяет HEX и позволяет сохранить без дубликата', () => {
    render(<PaletteHarness />);
    fireEvent.click(screen.getByRole('button', { name: /Палитра/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Свой цвет' }));
    expect(screen.getByRole('slider', { name: 'Выбор насыщенности и яркости' })).toBeTruthy();
    expect(screen.getByRole('slider', { name: 'Оттенок' })).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox', { name: 'HEX' }), { target: { value: '#aabbcc' } });
    expect(screen.getByRole('status', { name: 'Выбранный цвет' }).textContent).toBe('#254332');
    fireEvent.click(screen.getByRole('button', { name: 'Применить' }));
    expect(screen.getByRole('status', { name: 'Выбранный цвет' }).textContent).toBe('#aabbcc');
    fireEvent.click(screen.getByRole('button', { name: /Палитра/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить цвет' }));
    expect(screen.getByRole('status', { name: 'Количество цветов' }).textContent).toBe('3');
    expect((screen.getByRole('button', { name: 'Сохранить цвет' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('передаёт цвет после изменения оттенка и касания квадрата', () => {
    render(<PaletteHarness />);
    fireEvent.click(screen.getByRole('button', { name: /Палитра/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Свой цвет' }));
    const hue = screen.getByRole('slider', { name: 'Оттенок' });
    const square = screen.getByRole('slider', { name: 'Выбор насыщенности и яркости' });
    hue.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, width: 20, height: 200, right: 20, bottom: 200, toJSON: () => ({}) });
    square.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100, toJSON: () => ({}) });
    fireEvent.pointerDown(hue, { pointerId: 3, pointerType: 'touch', clientX: 10, clientY: 100 });
    fireEvent.pointerDown(square, { pointerId: 4, pointerType: 'touch', clientX: 200, clientY: 0 });
    expect((screen.getByRole('textbox', { name: 'HEX' }) as HTMLInputElement).value).toBe('#00ffff');
    fireEvent.click(screen.getByRole('button', { name: 'Применить' }));
    expect(screen.getByRole('status', { name: 'Выбранный цвет' }).textContent).toBe('#00ffff');
  });

  it('не применяет некорректный HEX и позволяет отменить настройку', () => {
    render(<PaletteHarness />);
    fireEvent.click(screen.getByRole('button', { name: /Палитра/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Свой цвет' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'HEX' }), { target: { value: '#zzzzzz' } });
    expect((screen.getByRole('button', { name: 'Применить' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));
    expect(screen.getByRole('status', { name: 'Выбранный цвет' }).textContent).toBe('#254332');
  });

  it('не предлагает добавить 33-й цвет', () => {
    const thirtyTwo = Array.from({ length: 32 }, (_, index) => `#${index.toString(16).padStart(6, '0')}`);
    render(<PaletteHarness initialColors={thirtyTwo} />);
    fireEvent.click(screen.getByRole('button', { name: /Палитра/ }));
    expect((screen.getByRole('button', { name: 'Сохранить цвет' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('оставляет расширенный редактор внутри узкого окна браузера', () => {
    const previousHeight = window.innerHeight;
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 480 });
    try {
      render(<PaletteHarness />);
      const toggle = screen.getByRole('button', { name: /Палитра/ });
      toggle.getBoundingClientRect = () => ({ x: 0, y: 360, top: 360, left: 0, right: 150, bottom: 400, width: 150, height: 40, toJSON: () => ({}) });
      fireEvent.click(toggle);
      fireEvent.click(screen.getByRole('button', { name: 'Свой цвет' }));
      const dialog = screen.getByRole('dialog', { name: 'Палитра цветов' }) as HTMLDivElement;
      expect(parseFloat(dialog.style.top) + parseFloat(dialog.style.maxHeight)).toBeLessThanOrEqual(468);
    } finally {
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: previousHeight });
    }
  });
});
