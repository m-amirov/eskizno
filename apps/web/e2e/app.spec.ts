import { expect, test } from '@playwright/test';

test('shows the two entry points and switches between them without a runtime error', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Эскизно', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Свободная студия' }).click();
  await expect(page.getByRole('heading', { name: 'Свободная студия' })).toBeVisible();

  await page.getByRole('button', { name: 'Мои работы' }).click();
  await expect(page.getByRole('heading', { name: 'Мои работы' })).toBeVisible();

  expect(errors).toEqual([]);
});

test('E2 catalogue opens three lessons and guidance modes without discarding the lesson', async ({ page }) => {
  await page.goto('/');
  for (const title of ['Ветка с листьями', 'Чашка кофе', 'Комнатное растение']) {
    await page.getByRole('button', { name: title }).click();
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
    await expect(page.getByText('Шаг 1 из 6')).toBeVisible();
    await page.getByRole('button', { name: 'Повтори' }).click();
    await expect(page.getByRole('img', { name: 'Пошаговая схема рисунка' })).toBeVisible();
    await page.getByRole('button', { name: 'Нарисуй сам' }).click();
    await expect(page.getByRole('img', { name: 'Пошаговая схема рисунка' })).toHaveCount(0);
    await page.getByRole('button', { name: 'К обучению' }).click();
  }
});

test('пустая галерея остаётся компактной на телефоне и честно описывает сохранение', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Мои работы' }).click();

  const gallery = page.getByRole('region', { name: 'Здесь пока нет работ' });
  await expect(gallery).toBeVisible();
  await expect(gallery.getByText(/рисунки появятся здесь после сохранения/i)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Перейти в студию' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('главная страница с этюдом не переполняет телефон и планшет', async ({ page }) => {
  for (const viewport of [{ width: 390, height: 844 }, { width: 820, height: 1180 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Рисовать можно научиться.' })).toBeVisible();
    await expect(page.getByRole('img', { name: 'Линейный этюд шара с направляющими и штриховкой' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Открыть свободную студию' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});
