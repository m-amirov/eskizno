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

test('колёсико масштабирует холст и не меняет размер пиксельного буфера', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Свободная студия' }).click();
  const canvas = page.getByRole('img', { name: 'Холст для рисования' });
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error('Холст не виден');
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.wheel(0, -140);
  await expect(page.getByText('100%')).toBeHidden();
  expect(await canvas.evaluate((node: HTMLCanvasElement) => [node.width, node.height])).toEqual([1024, 768]);
});

test('полноэкранная студия сохраняет инструменты и позволяет выйти', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Свободная студия' }).click();
  await page.getByRole('button', { name: 'Полный экран' }).click();
  await expect(page.getByRole('button', { name: 'Выйти из полного экрана' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Карандаш' })).toBeVisible();
  const fullscreenSupported = await page.evaluate(() => Boolean(document.fullscreenElement));
  if (fullscreenSupported) {
    await expect(page.getByRole('heading', { name: 'Эскизно' })).toBeHidden();
  }
  await page.getByRole('button', { name: 'Выйти из полного экрана' }).click();
  await expect(page.getByRole('button', { name: 'Полный экран' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Эскизно' })).toBeVisible();
});

test('свой цвет открывает HSV редактор, а очистка рисунка обратима', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Свободная студия' }).click();
  await page.getByRole('button', { name: /Палитра, выбран/ }).click();
  await page.getByRole('button', { name: 'Свой цвет' }).click();
  await page.getByRole('textbox', { name: 'HEX' }).fill('#ff0000');
  await page.getByRole('button', { name: 'Применить' }).click();
  await expect(page.getByRole('button', { name: /Палитра, выбран #FF0000/ })).toBeVisible();

  const canvas = page.getByRole('img', { name: 'Холст для рисования' });
  const rect = await canvas.boundingBox();
  if (!rect) throw new Error('Холст не виден');
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await page.mouse.down();
  await page.mouse.move(rect.x + rect.width * .6, rect.y + rect.height * .6, { steps: 6 });
  await page.mouse.up();
  await expect(page.getByText('Штрихов: 1')).toBeVisible();
  await page.getByRole('button', { name: 'Очистить', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.getByRole('button', { name: 'Очистить рисунок' }).click();
  await expect(page.getByText('Штрихов: 0')).toBeVisible();
  await page.getByRole('button', { name: 'Отменить' }).click();
  await expect(page.getByText('Штрихов: 1')).toBeVisible();
});

test('перетаскивание меняет порядок слоёв и отменяется', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Свободная студия' }).click();
  await page.getByRole('button', { name: 'Добавить слой' }).click();
  const list = page.locator('.layers-list');
  await expect(list.locator('.layer-row').first()).toContainText('Слой 2');
  await page.getByRole('button', { name: 'Перетащить Слой 1' }).dragTo(page.getByRole('button', { name: 'Перетащить Слой 2' }));
  await expect(list.locator('.layer-row').first()).toContainText('Слой 1');
  await page.getByRole('button', { name: 'Отменить' }).click();
  await expect(list.locator('.layer-row').first()).toContainText('Слой 2');
});
