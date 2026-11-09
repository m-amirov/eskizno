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
