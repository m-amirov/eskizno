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
});
