import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ReferencePanel } from './ReferencePanel';
import type { ReferenceLayer } from '../editor/model';

const layer: ReferenceLayer = {
  id: 'guide', name: 'Референс', kind: 'reference', assetId: 'file-1', placement: 'overlay',
  locked: true, visible: true, opacity: .55,
  transform: { x: 0, y: 0, scale: 1, rotation: 0 },
};
afterEach(cleanup);

describe('E1.6 — настройки референса', () => {
  it('даёт скрыть заблокированный эскиз и изменить прозрачность без изменения рисунка', () => {
    const action = vi.fn();
    render(<ReferencePanel layer={layer} onAction={action} />);
    fireEvent.click(screen.getByRole('button', { name: 'Показать без эскиза' }));
    expect(action).toHaveBeenCalledWith({ type: 'setLayerVisibility', layerId: 'guide', visible: false });
    fireEvent.change(screen.getByRole('slider', { name: 'Непрозрачность референса' }), { target: { value: '40' } });
    expect(action).toHaveBeenCalledWith({ type: 'setLayerOpacity', layerId: 'guide', opacity: .4 });
    expect(screen.getByRole('slider', { name: 'Масштаб референса' })).toHaveProperty('disabled', true);
  });

  it('передаёт масштаб/поворот/позицию после разблокировки с неизменным отношением сторон', () => {
    const action = vi.fn();
    render(<ReferencePanel layer={{ ...layer, locked: false }} onAction={action} />);
    fireEvent.change(screen.getByRole('slider', { name: 'Масштаб референса' }), { target: { value: '150' } });
    expect(action).toHaveBeenCalledWith({ type: 'setReferenceTransform', layerId: 'guide',
      transform: { x: 0, y: 0, scale: 1.5, rotation: 0 } });
    fireEvent.change(screen.getByRole('slider', { name: 'Поворот референса' }), { target: { value: '45' } });
    expect(action).toHaveBeenCalledWith({ type: 'setReferenceTransform', layerId: 'guide',
      transform: { x: 0, y: 0, scale: 1, rotation: Math.PI / 4 } });
    fireEvent.change(screen.getByRole('slider', { name: 'Смещение референса по X' }), { target: { value: '25' } });
    expect(action).toHaveBeenCalledWith({ type: 'setReferenceTransform', layerId: 'guide',
      transform: { x: .25, y: 0, scale: 1, rotation: 0 } });
  });

  it('размещает side-изображение отдельно от холста', () => {
    render(<ReferencePanel layer={{ ...layer, placement: 'side' }} url="blob:sample" onAction={vi.fn()} />);
    expect(screen.getByRole('region', { name: 'Референс рядом с холстом' })).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Загруженный референс' }).getAttribute('src')).toBe('blob:sample');
    expect((screen.getByRole('img', { name: 'Загруженный референс' }) as HTMLImageElement).style.opacity).toBe('0.55');
  });
});
