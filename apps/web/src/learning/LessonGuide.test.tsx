import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { LessonGuide } from './LessonGuide';
import { getLesson } from './lessons';

afterEach(cleanup);

const botanical = getLesson('e2a-botanical-branch')!;
const coffee = getLesson('e2b-coffee-cup')!;
const plant = getLesson('e2c-houseplant')!;

describe('E2A — four progressive botanical guide states', () => {
  it('adds useful visual construction details without showing future layers', () => {
    const expected = [1, 2, 3, 3, 4, 4];
    for (let step = 0; step < 6; step += 1) {
      const { container, unmount } = render(<LessonGuide lesson={botanical} step={step} mode="trace" />);
      expect(container.querySelectorAll('[data-guide-part]')).toHaveLength(expected[step]!);
      expect(screen.getByText(`Состояние ${expected[step]} из 4`)).toBeTruthy();
      unmount();
    }
  });

  it('keeps only the construction axis in understand mode and hides help in free mode', () => {
    const { container, rerender } = render(<LessonGuide lesson={botanical} step={5} mode="construct" />);
    expect(container.querySelectorAll('[data-guide-part]')).toHaveLength(1);
    rerender(<LessonGuide lesson={botanical} step={5} mode="free" />);
    expect(screen.queryByRole('img', { name: 'Пошаговая схема рисунка' })).toBeNull();
  });
});

describe('E2C — four progressive plant construction states', () => {
  it('reveals composition, pot, stems and leaves in the lesson order', () => {
    const expected = [1, 2, 3, 4, 4, 4];
    for (let step = 0; step < 6; step += 1) {
      const { container, unmount } = render(<LessonGuide lesson={plant} step={step} mode="trace" />);
      expect(container.querySelectorAll('[data-guide-part]')).toHaveLength(expected[step]!);
      expect(screen.getByText(`Состояние ${expected[step]} из 4`)).toBeTruthy();
      unmount();
    }
  });

  it('shows just compositional frame when understanding and hides when drawing alone', () => {
    const { container, rerender } = render(<LessonGuide lesson={plant} step={5} mode="construct" />);
    expect(container.querySelectorAll('[data-guide-part]')).toHaveLength(1);
    rerender(<LessonGuide lesson={plant} step={5} mode="free" />);
    expect(screen.queryByRole('img', { name: 'Пошаговая схема рисунка' })).toBeNull();
  });
});

describe('E2B — four progressive cup construction states', () => {
  it('reveals bounding proportions, ellipse, body and handle in order', () => {
    const expected = [1, 2, 3, 4, 4, 4];
    for (let step = 0; step < 6; step += 1) {
      const { container, unmount } = render(<LessonGuide lesson={coffee} step={step} mode="trace" />);
      expect(container.querySelectorAll('[data-guide-part]')).toHaveLength(expected[step]!);
      expect(screen.getByText(`Состояние ${expected[step]} из 4`)).toBeTruthy();
      unmount();
    }
  });

  it('leaves proportion scaffold only in construct mode and no image in free mode', () => {
    const { container, rerender } = render(<LessonGuide lesson={coffee} step={5} mode="construct" />);
    expect(container.querySelectorAll('[data-guide-part]')).toHaveLength(1);
    rerender(<LessonGuide lesson={coffee} step={5} mode="free" />);
    expect(screen.queryByRole('img', { name: 'Пошаговая схема рисунка' })).toBeNull();
  });
});
