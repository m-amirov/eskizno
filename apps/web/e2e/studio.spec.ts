import { createCanvas } from '@napi-rs/canvas';
import { expect, test } from '@playwright/test';

const fixtureCanvas = createCanvas(32, 24);
const fixtureContext = fixtureCanvas.getContext('2d');
fixtureContext.fillStyle = '#ed7453';
fixtureContext.fillRect(0, 0, 32, 24);
const image = fixtureCanvas.toBuffer('image/png');
const upload = { name: 'эскиз.png', mimeType: 'image/png', buffer: image };

async function goToStudio(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Свободная студия' }).click();
}

async function setRange(page: import('@playwright/test').Page, name: string, value: string) {
  await page.getByRole('slider', { name }).evaluate((element, next) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(element, next);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

test('три входа: холст, обводка, side; референс сохраняется и восстанавливается', async ({ page }) => {
  await goToStudio(page);
  await page.getByRole('button', { name: 'Новый холст' }).click();
  await expect(page.getByRole('img', { name: 'Холст для рисования' })).toBeVisible();
  await page.getByLabel('Загрузить эскиз для обводки').setInputFiles(upload);
  await expect(page.getByRole('dialog', { name: 'Размер нового документа' })).toBeVisible();
  await expect(page.getByText('Загруженное изображение: 32 × 24 пикселей.')).toBeVisible();
  await page.getByLabel(/Размер изображения: 32 × 24/).check();
  await page.getByRole('button', { name: 'Создать с эскизом' }).click();
  await expect(page.getByRole('button', { name: 'Показать без эскиза' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Мой рисунок · выбран' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Холст для рисования' })).toHaveAttribute('width', '32');
  await expect(page.getByText('Сохранено')).toBeVisible();
  await expect.poll(() => page.getByRole('img', { name: 'Холст для рисования' })
    .evaluate((element: HTMLCanvasElement) => element.getContext('2d')?.getImageData(1, 1, 1, 1).data[3] ?? 0))
    .toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Разблокировать для изменения' }).click();
  await setRange(page, 'Непрозрачность референса', '33');
  await setRange(page, 'Масштаб референса', '150');
  await setRange(page, 'Поворот референса', '30');
  await setRange(page, 'Смещение референса по X', '20');
  await page.getByRole('button', { name: 'Заблокировать референс' }).click();
  const canvas = page.getByRole('img', { name: 'Холст для рисования' });
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  if (box) {
    await page.mouse.move(box.x + box.width * .2, box.y + box.height * .2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * .8, box.y + box.height * .8, { steps: 5 });
    await page.mouse.up();
  }
  await expect(page.getByText('Штрихов: 1')).toBeVisible();
  await page.getByRole('button', { name: 'Ластик' }).click();
  const eraserBox = await canvas.boundingBox();
  if (eraserBox) {
    await page.mouse.move(eraserBox.x + eraserBox.width * .3, eraserBox.y + eraserBox.height * .3);
    await page.mouse.down();
    await page.mouse.move(eraserBox.x + eraserBox.width * .6, eraserBox.y + eraserBox.height * .6, { steps: 5 });
    await page.mouse.up();
  }
  await expect(page.getByText('Штрихов: 2')).toBeVisible();
  await expect.poll(() => canvas.evaluate((element: HTMLCanvasElement) =>
    element.getContext('2d')?.getImageData(14, 10, 1, 1).data[3] ?? 0)).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Показать без эскиза' }).click();
  await expect(page.getByRole('button', { name: 'Показать эскиз' })).toBeVisible();
  // On the erased center of the paint stroke, hiding the reference reveals transparency.
  await expect.poll(() => canvas.evaluate((element: HTMLCanvasElement) =>
    element.getContext('2d')?.getImageData(14, 10, 1, 1).data[3] ?? 255)).toBe(0);
  await expect(page.getByText('Сохранено')).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Свободная студия' }).click();
  await expect(page.getByRole('button', { name: 'Показать эскиз' })).toBeVisible();
  await expect(page.getByText('Штрихов: 2')).toBeVisible();
  await expect(page.getByRole('slider', { name: 'Масштаб референса' })).toHaveValue('150');

  await page.getByLabel('Загрузить референс рядом').setInputFiles(upload);
  await page.getByRole('button', { name: 'Создать с референсом' }).click();
  await expect(page.getByRole('region', { name: 'Референс рядом с холстом' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Загруженный референс' })).toBeVisible();
  await expect(page.getByText('Сохранено')).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Свободная студия' }).click();
  await expect(page.getByRole('region', { name: 'Референс рядом с холстом' })).toBeVisible();
  await expect.poll(() => page.getByRole('img', { name: 'Загруженный референс' })
    .evaluate((element: HTMLImageElement) => element.naturalWidth)).toBe(32);
  await page.getByRole('button', { name: 'Полный экран' }).click();
  await expect(page.getByRole('region', { name: 'Референс рядом с холстом' })).toBeVisible();
  await page.getByRole('button', { name: 'Выйти из полного экрана' }).click();
});

test('испорченный файл не заменяет рисунок', async ({ page }) => {
  await goToStudio(page);
  await page.getByRole('button', { name: 'Добавить слой' }).click();
  await expect(page.getByRole('button', { name: 'Слой 2 · выбран' })).toBeVisible();
  await page.getByLabel('Загрузить эскиз для обводки').setInputFiles({
    name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('This is not an image'),
  });
  await expect(page.getByRole('alert')).toContainText('повреждён');
  await expect(page.getByRole('button', { name: 'Слой 2 · выбран' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Размер нового документа' })).toHaveCount(0);
});
