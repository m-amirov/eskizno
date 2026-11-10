import { expect, test } from '@playwright/test';

async function openStudio(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Свободная студия' }).click();
}

test('свой цвет сохраняется в проекте, пипетка берёт цвет итогового пикселя', async ({ page }) => {
  await openStudio(page);
  await page.getByRole('button', { name: /Палитра, выбран/ }).click();
  await page.getByRole('textbox', { name: 'HEX' }).fill('#EE4422');
  await page.getByRole('button', { name: 'Применить' }).click();
  await page.getByRole('button', { name: 'Сохранить цвет' }).click();
  await page.getByRole('button', { name: 'Закрыть палитру' }).click();

  const canvas = page.getByRole('img', { name: 'Холст для рисования' });
  await page.getByRole('button', { name: 'Заливка ведром' }).click();
  await canvas.click({ position: { x: 60, y: 60 } });
  await expect(page.getByText('Фигур и заливок: 1')).toBeVisible();

  await page.getByRole('button', { name: /Палитра, выбран/ }).click();
  await page.getByRole('button', { name: 'Выбрать #254332' }).click();
  await page.getByRole('button', { name: 'Пипетка' }).click();
  await canvas.click({ position: { x: 60, y: 60 } });
  await expect(page.getByRole('button', { name: 'Палитра, выбран #EE4422' })).toBeVisible();

  await expect(page.getByText('Сохранено')).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Свободная студия' }).click();
  await page.getByRole('button', { name: /Палитра, выбран/ }).click();
  await expect(page.getByRole('button', { name: 'Выбрать #EE4422' })).toBeVisible();
});

test('слои можно переименовать, менять порядок, скрывать, блокировать и задавать прозрачность', async ({ page }) => {
  await openStudio(page);
  await page.getByRole('button', { name: 'Добавить слой' }).click();
  await page.getByRole('button', { name: 'Действия со слоем Слой 2' }).click();
  await page.getByRole('menuitem', { name: 'Переименовать' }).click();
  await page.getByRole('textbox', { name: 'Название слоя Слой 2' }).fill('Чистовой');
  await page.getByRole('textbox', { name: 'Название слоя Слой 2' }).press('Enter');
  await expect(page.getByRole('button', { name: 'Чистовой · выбран' })).toBeVisible();

  await page.getByRole('slider', { name: 'Непрозрачность слоя Чистовой' }).fill('35');
  await expect(page.getByRole('slider', { name: 'Непрозрачность слоя Чистовой' })).toHaveValue('35');
  await page.getByRole('button', { name: 'Перетащить Чистовой' }).press('ArrowDown');
  await expect(page.locator('.layer-row').first()).toHaveAttribute('data-layer-id', /.+/);
  await expect(page.locator('.layer-row').last().getByRole('button', { name: 'Чистовой · выбран' })).toBeVisible();

  await page.getByRole('button', { name: 'Скрыть Чистовой' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Выбранный слой скрыт или заблокирован' })).toBeVisible();
  await page.getByRole('button', { name: 'Показать Чистовой' }).click();
  await page.getByRole('button', { name: 'Действия со слоем Чистовой' }).click();
  await page.getByRole('menuitem', { name: 'Заблокировать' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Выбранный слой скрыт или заблокирован' })).toBeVisible();
  const canvas = page.getByRole('img', { name: 'Холст для рисования' });
  await canvas.click({ position: { x: 40, y: 40 } });
  await expect(page.getByText('Штрихов: 0')).toBeVisible();
});
