import { expect, test } from '@playwright/test';

async function drawLine(page: import('@playwright/test').Page, startX: number, startY: number) {
  const rect = await page.getByRole('img', { name: 'Холст для рисования' }).boundingBox();
  expect(rect).not.toBeNull();
  if (!rect) return;
  await page.mouse.move(rect.x + rect.width * startX, rect.y + rect.height * startY);
  await page.mouse.down();
  await page.mouse.move(rect.x + rect.width * (startX + .1), rect.y + rect.height * (startY + .06), { steps: 5 });
  await page.mouse.up();
}

test('слои и пиксели восстанавливаются после reload и открытия работы из галереи', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Свободная студия' }).click();
  await drawLine(page, .2, .2);
  await expect(page.getByText('Штрихов: 1')).toBeVisible();
  await page.getByRole('button', { name: 'Добавить слой' }).click();
  await drawLine(page, .6, .6);
  await expect(page.getByText('Штрихов: 2')).toBeVisible();
  await expect(page.getByText('Сохранено')).toBeVisible();
  const before = await page.getByRole('img', { name: 'Холст для рисования' })
    .evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
  const beforeDb = await page.evaluate(async () => new Promise<{ count: number; strokes: number[] }>((resolve, reject) => {
    const request = indexedDB.open('eskizno-projects');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const all = db.transaction('projects').objectStore('projects').getAll();
      all.onsuccess = () => { const project = all.result[0];
        resolve({ count: project.layers.length, strokes: project.layers.map((layer: { strokes?: unknown[] }) => layer.strokes?.length ?? 0) });
        db.close();
      };
      all.onerror = () => reject(all.error);
    };
  }));
  expect(beforeDb).toEqual({ count: 2, strokes: [1, 1] });

  await page.reload();
  await page.getByRole('button', { name: 'Мои работы' }).click();
  await expect.poll(() => page.locator('.project-card-paper').evaluate((canvas: HTMLCanvasElement) => {
    const context = canvas.getContext('2d');
    return !!context && context.getImageData(0, 0, canvas.width, canvas.height).data.some(
      (value, index) => index % 4 === 3 && value > 0);
  })).toBe(true);
  await page.getByRole('button', { name: /Открыть работу/ }).click();
  await expect(page.getByText('Штрихов: 2')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Слой 2 · выбран$/ })).toBeVisible();
  const after = await page.getByRole('img', { name: 'Холст для рисования' })
    .evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
  expect(after).toBe(before);
});

test('при отказе записи IndexedDB нет ложного статуса сохранения', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Свободная студия' }).click();
  await expect(page.getByText('Новый рисунок')).toBeVisible();
  await page.evaluate(() => {
    const original = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (names, mode, options) {
      if (mode === 'readwrite') throw new DOMException('Quota exceeded', 'QuotaExceededError');
      return original.call(this, names, mode, options);
    };
  });
  await drawLine(page, .3, .3);
  await expect(page.getByText('Не удалось сохранить', { exact: true })).toBeVisible();
  await expect(page.getByText('Сохранено', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Повторить сохранение' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Скачать PNG' })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Мои работы' }).click();
  await expect(page.getByRole('region', { name: 'Здесь пока нет работ' })).toBeVisible();
});

test('миграция v1 сохраняет ластик и не создаёт дубликаты при повторном входе', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('eskizno:prototype:botanical-branch:v1', JSON.stringify({
      version: 1, lessonId: 'botanical-branch', audience: 'adult', mode: 'trace', step: 3,
      strokes: [
        { id: 'one', kind: 'ink', color: '#254332', width: 5, step: 1, points: [{ x: .2, y: .3 }] },
        { id: 'two', kind: 'erase', color: '#254332', width: 11, step: 3, points: [{ x: .4, y: .5 }] },
      ],
    }));
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Мои работы' }).click();
  await expect(page.getByRole('button', { name: /Открыть работу/ })).toHaveCount(1);
  await page.reload();
  await page.getByRole('button', { name: 'Мои работы' }).click();
  await expect(page.getByRole('button', { name: /Открыть работу/ })).toHaveCount(1);
  await page.getByRole('button', { name: /Открыть работу/ }).click();
  await expect(page.getByText('Штрихов: 2')).toBeVisible();
  await page.getByRole('button', { name: 'Мои работы' }).click();
  await page.getByRole('button', { name: /Удалить работу/ }).click();
  await page.getByRole('button', { name: 'Удалить безвозвратно' }).click();
  await expect(page.getByRole('region', { name: 'Здесь пока нет работ' })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Мои работы' }).click();
  await expect(page.getByRole('region', { name: 'Здесь пока нет работ' })).toBeVisible();
});
