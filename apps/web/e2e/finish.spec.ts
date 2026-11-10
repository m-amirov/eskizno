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

  await page.getByRole('slider', { name: 'Непрозрачность слоя Чистовой' }).evaluate((element) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(element, '35');
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  });
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

test('экспорт PNG скачивается с нативным размером и не требует сохранения проекта', async ({ page }) => {
  await openStudio(page);
  await page.getByRole('button', { name: 'Экспортировать PNG' }).click();
  const dialog = page.getByRole('dialog', { name: 'Экспорт PNG' });
  await expect(dialog).toContainText('1024 × 768');
  await expect(dialog.getByRole('checkbox', { name: 'Включить эскиз-референс в PNG' })).toBeDisabled();
  const downloadReady = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Скачать PNG' }).click();
  const download = await downloadReady;
  expect(download.suggestedFilename()).toMatch(/\.png$/);
  await expect(dialog).toHaveCount(0);
});

test('новые инструменты доступны без горизонтальной прокрутки на трёх экранах', async ({ page }) => {
  for (const viewport of [{ width: 1280, height: 800 }, { width: 768, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await openStudio(page);
    const canvas = page.getByRole('img', { name: 'Холст для рисования' });
    await expect(canvas).toBeVisible();
    await expect(page.getByRole('button', { name: 'Кисти, выбран Карандаш' })).toBeVisible();
    await page.getByRole('button', { name: 'Ластик' }).click();
    await expect(page.getByRole('slider', { name: 'Толщина ластика' })).toBeVisible();
    const eyedropper = page.getByRole('button', { name: 'Пипетка' });
    await eyedropper.focus();
    await expect(eyedropper).toBeFocused();
    await expect(page.getByRole('button', { name: 'Экспортировать PNG' })).toBeVisible();
    if (viewport.width <= 850) {
      await page.getByRole('button', { name: /Слои \(1\) · развернуть/ }).click();
    }
    await expect(page.getByRole('slider', { name: 'Непрозрачность слоя Слой 1' })).toBeVisible();
    const canvasBounds = await canvas.boundingBox();
    const minimumWidth = viewport.width <= 520 ? 250 : viewport.width <= 850 ? 380 : 300;
    const minimumHeight = viewport.width <= 520 ? 180 : viewport.width <= 850 ? 260 : 220;
    expect(canvasBounds?.width, `drawable width with layers open at ${viewport.width}x${viewport.height}`).toBeGreaterThanOrEqual(minimumWidth);
    expect(canvasBounds?.height, `drawable height with layers open at ${viewport.width}x${viewport.height}`).toBeGreaterThanOrEqual(minimumHeight);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, JSON.stringify(viewport)).toBeLessThanOrEqual(1);
    await page.screenshot({
      path: test.info().outputPath(`studio-${viewport.width}x${viewport.height}.png`),
      fullPage: true,
      animations: 'disabled',
    });
  }
});
