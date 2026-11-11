import { expect, test, type Page } from '@playwright/test';

async function dragOnCanvas(page: Page, from: [number, number], to: [number, number]) {
  const box = await page.getByRole('img', { name: 'Холст для рисования' }).boundingBox();
  if (!box) throw new Error('Холст не виден');
  await page.mouse.move(box.x + box.width * from[0], box.y + box.height * from[1]);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * to[0], box.y + box.height * to[1], { steps: 6 });
  await page.mouse.up();
}

async function colorAt(page: Page, x: number, y: number): Promise<number> {
  return page.getByRole('img', { name: 'Холст для рисования' }).evaluate((canvas: HTMLCanvasElement, point) => {
    const ctx = canvas.getContext('2d');
    return ctx?.getImageData(Math.floor(point.x * canvas.width), Math.floor(point.y * canvas.height), 1, 1).data[3] ?? 0;
  }, { x, y });
}

test('свободная студия: выбор, перенос, Undo/Redo и автосохранение сохраняют рисунок', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Свободная студия' }).click();
  await page.getByRole('button', { name: 'Фигуры' }).click();
  await dragOnCanvas(page, [.2, .2], [.4, .4]);
  expect(await colorAt(page, .3, .3)).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Выделение' }).click();
  await dragOnCanvas(page, [.3, .3], [.5, .3]);
  await expect(page.getByText('Выбрано: 1')).toBeVisible();
  expect(await colorAt(page, .3, .3)).toBe(0);
  expect(await colorAt(page, .5, .3)).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Отменить' }).click();
  expect(await colorAt(page, .3, .3)).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Повторить' }).click();
  expect(await colorAt(page, .5, .3)).toBeGreaterThan(0);
  await expect(page.getByText('Сохранено')).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Свободная студия' }).click();
  expect(await colorAt(page, .3, .3)).toBe(0);
  expect(await colorAt(page, .5, .3)).toBeGreaterThan(0);
});

test('учебный урок не даёт выбрать инструмент до его введения', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Начать урок линий' }).click();
  await expect(page.getByRole('button', { name: 'Выделение' })).toBeDisabled();
});

test('точечный штрих переносится без захвата перекрывающихся углов рамки', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Свободная студия' }).click();
  const canvas = page.getByRole('img', { name: 'Холст для рисования' });
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Холст не виден');
  await page.mouse.click(box.x + box.width * .4, box.y + box.height * .4);
  expect(await colorAt(page, .4, .4)).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Выделение' }).click();
  // Pen controls disappear when selecting; use the current artboard geometry.
  const selectBox = await canvas.boundingBox();
  if (!selectBox) throw new Error('Холст не виден после смены инструмента');
  await page.mouse.click(selectBox.x + selectBox.width * .4, selectBox.y + selectBox.height * .4);
  await expect(page.getByText('Выбрано: 1')).toBeVisible();
  await dragOnCanvas(page, [.4, .4], [.6, .4]);
  await page.getByRole('button', { name: /Кисти, выбран/ }).click();
  await page.getByRole('button', { name: 'Выбрать Карандаш' }).click();
  // A deselected canvas shows only persisted paint, without green selection handles.
  expect(await colorAt(page, .4, .4)).toBe(0);
  expect(await colorAt(page, .6, .4)).toBeGreaterThan(0);
});
