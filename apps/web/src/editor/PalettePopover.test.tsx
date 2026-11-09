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

  it('поддерживает произвольный цвет и не сохраняет дубликаты в проект', () => {
    render(<PaletteHarness />);
    fireEvent.click(screen.getByRole('button', { name: /Палитра/ }));
    fireEvent.change(screen.getByLabelText('Произвольный цвет'), { target: { value: '#aabbcc' } });
    expect(screen.getByRole('status', { name: 'Выбранный цвет' }).textContent).toBe('#aabbcc');
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить цвет' }));
    expect(screen.getByRole('status', { name: 'Количество цветов' }).textContent).toBe('3');
    expect((screen.getByRole('button', { name: 'Сохранить цвет' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('не предлагает добавить 33-й цвет', () => {
    const thirtyTwo = Array.from({ length: 32 }, (_, index) => `#${index.toString(16).padStart(6, '0')}`);
    render(<PaletteHarness initialColors={thirtyTwo} />);
    fireEvent.click(screen.getByRole('button', { name: /Палитра/ }));
    expect((screen.getByRole('button', { name: 'Сохранить цвет' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
