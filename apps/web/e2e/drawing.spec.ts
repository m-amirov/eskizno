import { expect, test } from '@playwright/test';

test('мышь: штрих, масштаб, отмена и повтор, слои без потери пикселей', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Свободная студия' }).click();
  const canvas = page.getByRole('img', { name: 'Холст для рисования' });
  const rect = await canvas.boundingBox();
  expect(rect).not.toBeNull();
  if (!rect) return;
  const x = rect.x + rect.width * 0.25;
  const y = rect.y + rect.height * 0.25;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + rect.width * 0.15, y + rect.height * 0.15, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByText('Штрихов: 1')).toBeVisible();

  const painted = await canvas.evaluate((node: HTMLCanvasElement) => {
    const ctx = node.getContext('2d');
    const pixel = ctx?.getImageData(256, 192, 1, 1).data;
    return pixel ? [...pixel] : null;
  });
  expect(painted).not.toBeNull();
  expect(painted?.[3]).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Увеличить' }).click();
  await expect(page.getByText('125%')).toBeVisible();
  expect(await canvas.evaluate((node: HTMLCanvasElement) => [node.width, node.height])).toEqual([1024, 768]);
  await page.getByRole('button', { name: 'Сброс масштаба' }).click();

  await page.getByRole('button', { name: 'Отменить' }).click();
  await expect(page.getByText('Штрихов: 0')).toBeVisible();
  await page.getByRole('button', { name: 'Повторить' }).click();
  await expect(page.getByText('Штрихов: 1')).toBeVisible();

  await page.getByRole('button', { name: 'Добавить слой' }).click();
  await expect(page.getByRole('button', { name: /^Слой 2 · выбран$/ })).toBeVisible();
  await page.getByRole('button', { name: 'Мои работы' }).click();
  await page.getByRole('button', { name: 'Свободная студия' }).click();
  await expect(page.getByText('Штрихов: 1')).toBeVisible();
  expect(errors).toEqual([]);
});

test('на узком экране холст остаётся видимым, а слои свёрнуты', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Свободная студия' }).click();
  const canvas = page.getByRole('img', { name: 'Холст для рисования' });
  await expect(canvas).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  const toggle = page.getByRole('button', { name: /Слои \(1\).*развернуть/ });
  await expect(toggle).toBeVisible();
  await expect(page.getByRole('button', { name: 'Добавить слой' })).toBeHidden();
  await toggle.click();
  await expect(page.getByRole('button', { name: 'Добавить слой' })).toBeVisible();
});
