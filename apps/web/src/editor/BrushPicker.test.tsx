import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { BrushPicker } from './BrushPicker';

afterEach(cleanup);

describe('выбор кисти', () => {
  it('показывает 10 доступных кистей с названиями и описаниями', () => {
    render(<BrushPicker value="pencil" onChange={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Кисти, выбран Карандаш' }));
    expect(screen.getByRole('dialog', { name: 'Выбор кисти' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /^Выбрать / })).toHaveLength(10);
    expect(screen.getByText('Прозрачные слои цвета')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Выбрать Карандаш' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('передаёт выбранную кисть и закрывает панель; Escape возвращает фокус', () => {
    const onChange = vi.fn();
    render(<BrushPicker value="pencil" onChange={onChange} />);
    const trigger = screen.getByRole('button', { name: 'Кисти, выбран Карандаш' });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('button', { name: 'Выбрать Аэрограф' }));
    expect(onChange).toHaveBeenCalledWith('airbrush');
    expect(screen.queryByRole('dialog', { name: 'Выбор кисти' })).toBeNull();
    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Выбор кисти' })).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
