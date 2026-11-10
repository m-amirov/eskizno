import { expect, test, type Page } from '@playwright/test';

async function drawLine(page: Page, from: [number, number], to: [number, number]) {
  const canvas = page.getByRole('img', { name: 'Холст для рисования' });
  const rect = await canvas.boundingBox();
  if (!rect) throw new Error('Холст не виден');
  await page.mouse.move(rect.x + rect.width * from[0], rect.y + rect.height * from[1]);
  await page.mouse.down();
  await page.mouse.move(rect.x + rect.width * to[0], rect.y + rect.height * to[1], { steps: 8 });
  await page.mouse.up();
}

test('урок открывает ластик навсегда, копия редактируется отдельно, свободная студия без ограничений', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Начать урок линий' }).click();
  await expect(page.getByRole('heading', { name: 'Линия и уверенность' })).toBeVisible();
  await expect(page.getByText('Шаг 1 из 3')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ластик' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Заливка ведром' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Фигуры' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Следующий шаг' })).toBeDisabled();

  await drawLine(page, [.15, .2], [.65, .2]);
  await expect(page.getByText('Штрихов: 1')).toBeVisible();
  await page.getByRole('button', { name: 'Следующий шаг' }).click();
  await expect(page.getByText('Шаг 2 из 3')).toBeVisible();
  await drawLine(page, [.16, .4], [.65, .55]);
  await page.getByRole('button', { name: 'Следующий шаг' }).click();
  await expect(page.getByText('Шаг 3 из 3')).toBeVisible();
  await drawLine(page, [.2, .7], [.4, .8]);
  await expect(page.getByRole('button', { name: 'Закончить три шага' })).toBeDisabled();
  await drawLine(page, [.5, .7], [.7, .8]);
  await page.getByRole('button', { name: 'Закончить три шага' }).click();
  await expect(page.getByRole('button', { name: 'Завершить урок' })).toBeVisible();
  await page.getByRole('button', { name: 'Завершить урок' }).click();
  await expect(page.getByText('Урок завершён')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ластик' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Заливка ведром' })).toBeDisabled();
  await expect(page.getByText('Сохранено')).toBeVisible();

  await page.reload();
  await page.getByRole('button', { name: 'Вернуться к уроку' }).click();
  await expect(page.getByText('Урок завершён')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ластик' })).toBeEnabled();
  await expect(page.getByText('Штрихов: 4')).toBeVisible();
  await page.getByRole('button', { name: 'Продолжить копию в свободной студии' }).click();
  await expect(page.getByRole('heading', { name: 'Свободная студия' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Заливка ведром' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Фигуры' })).toBeEnabled();
  await expect(page.getByText('Штрихов: 4')).toBeVisible();
  await drawLine(page, [.1, .9], [.8, .9]);
  await expect(page.getByText('Штрихов: 5')).toBeVisible();

  await page.getByRole('button', { name: 'Обучение' }).click();
  await page.getByRole('button', { name: 'Вернуться к уроку' }).click();
  await expect(page.getByText('Штрихов: 4')).toBeVisible();
  await expect(page.getByText('Урок завершён')).toBeVisible();
});
