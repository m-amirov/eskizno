import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import { createProject } from '../editor/model';
import { renderProject } from '../editor/render';
import { ProjectThumbnail } from './ProjectThumbnail';

vi.mock('../editor/render', () => ({ renderProject: vi.fn() }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it('перерисовывает превью при новой сохранённой ревизии того же проекта', async () => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
    return { canvas: this, clearRect: vi.fn(), drawImage: vi.fn() } as unknown as CanvasRenderingContext2D;
  } as unknown as typeof HTMLCanvasElement.prototype.getContext);
  const project = createProject();
  const load = vi.fn(async () => ({ project, assets: new Map<string, Blob>() }));
  const preview = render(<ProjectThumbnail id={project.id} revision={1} load={load} />);
  await waitFor(() => expect(renderProject).toHaveBeenCalledTimes(1));
  const firstRenderedProject = vi.mocked(renderProject).mock.calls[0][1];
  expect(firstRenderedProject.width).toBeLessThanOrEqual(256);
  expect(firstRenderedProject.height).toBeLessThanOrEqual(192);
  preview.rerender(<ProjectThumbnail id={project.id} revision={2} load={load} />);
  await waitFor(() => expect(renderProject).toHaveBeenCalledTimes(2));
  expect(load).toHaveBeenCalledTimes(2);
});
