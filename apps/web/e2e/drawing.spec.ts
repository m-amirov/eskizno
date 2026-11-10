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

test('на телефоне кисть и ластик сохраняют собственную толщину после переключения', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Свободная студия' }).click();
  const thickness = page.getByRole('slider', { name: 'Толщина линии' });
  await thickness.press('Home');
  for (let index = 0; index < 17; index += 1) await thickness.press('ArrowRight');
  const canvas = page.getByRole('img', { name: 'Холст для рисования' });
  await page.getByRole('button', { name: 'Ластик' }).click();
  const eraserThickness = page.getByRole('slider', { name: 'Толщина ластика' });
  await expect(eraserThickness).toHaveValue('8');
  await eraserThickness.press('End');
  for (let index = 0; index < 17; index += 1) await eraserThickness.press('ArrowLeft');

  const rect = await canvas.boundingBox();
  expect(rect).not.toBeNull();
  if (!rect) return;
  await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await expect(page.getByText('Штрихов: 1')).toBeVisible();

  await page.getByRole('button', { name: 'Кисти, выбран Карандаш' }).click();
  await page.getByRole('button', { name: 'Выбрать Карандаш' }).click();
  await expect(thickness).toHaveValue('18');
  await page.mouse.click(rect.x + rect.width / 3, rect.y + rect.height / 3);
  await expect(page.getByText('Штрихов: 2')).toBeVisible();
  await page.getByRole('button', { name: 'Ластик' }).click();
  await expect(eraserThickness).toHaveValue('31');
});

test('второе касание отменяет недорисованный штрих и включает масштабирование двумя пальцами', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Свободная студия' }).click();
  const canvas = page.getByRole('img', { name: 'Холст для рисования' });
  const rect = await canvas.boundingBox();
  expect(rect).not.toBeNull();
  if (!rect) return;

  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;
  const touch = await page.context().newCDPSession(page);
  const first = (x: number) => ({ x, y: centerY, id: 1 });
  const second = (x: number) => ({ x, y: centerY, id: 2 });
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [first(centerX - 50)] });
  await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [first(centerX - 40)] });
  await touch.send('Input.dispatchTouchEvent', {
    type: 'touchStart', touchPoints: [first(centerX - 40), second(centerX + 50)],
  });
  await touch.send('Input.dispatchTouchEvent', {
    type: 'touchMove', touchPoints: [first(centerX - 80), second(centerX + 90)],
  });
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [first(centerX - 80)] });
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

  await expect(page.getByText('Штрихов: 0')).toBeVisible();
  await expect(page.locator('.zoom-controls span')).not.toHaveText('100%');
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

test('панель инструментов держит целые группы на телефоне, планшете и десктопе', async ({ page }) => {
  for (const viewport of [
    { width: 320, height: 760 },
    { width: 390, height: 844 },
    { width: 820, height: 1180 },
    { width: 1305, height: 764 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.getByRole('button', { name: 'Свободная студия' }).click();
    const toolbar = page.getByLabel('Инструменты рисования');

    for (const group of ['toolbar-drawing-tools', 'toolbar-actions']) {
      const boxes = await toolbar.locator(`.${group}`).getByRole('button').evaluateAll((buttons) =>
        buttons.map((button) => button.getBoundingClientRect().top));
      expect(Math.max(...boxes) - Math.min(...boxes), `${group} ${viewport.width}`).toBeLessThanOrEqual(2);
    }
    for (const name of ['Толщина линии', 'Прозрачность кисти']) {
      await expect(toolbar.getByRole('slider', { name })).toBeVisible();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth), JSON.stringify(viewport)).toBeLessThanOrEqual(viewport.width + 1);

    await toolbar.getByRole('button', { name: 'Фигуры' }).click();
    await expect(toolbar.getByRole('combobox', { name: 'Тип фигуры' })).toBeVisible();
    await expect(toolbar.getByRole('combobox', { name: 'Стиль фигуры' })).toBeVisible();
    await toolbar.getByRole('combobox', { name: 'Тип фигуры' }).selectOption('triangle');
    await toolbar.getByRole('slider', { name: 'Прозрачность кисти' }).press('ArrowLeft');
    await expect(toolbar.getByRole('slider', { name: 'Прозрачность кисти' })).toHaveValue('99');
    expect(await page.evaluate(() => document.documentElement.scrollWidth), `фигуры ${viewport.width}`).toBeLessThanOrEqual(viewport.width + 1);
    await expect(toolbar.getByRole('button', { name: 'Отменить' })).toBeVisible();
    await expect(toolbar.getByRole('button', { name: 'Полный экран' })).toBeVisible();
  }
});

test('слои на телефоне раскрываются компактно и показывают выбранный слой без дублирования', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Свободная студия' }).click();

  const toggle = page.getByRole('button', { name: 'Слои (1) · развернуть' });
  await expect(toggle).toHaveText('Слои (1)');
  await expect(toggle.locator('svg')).toBeVisible();
  await toggle.click();
  await page.getByRole('button', { name: 'Добавить слой' }).click();

  const selected = page.getByRole('button', { name: 'Слой 2 · выбран' });
  await expect(selected).toHaveText('Слой 2');
  const row = page.locator('.layer-row.selected');
  await expect(row.getByRole('button', { name: 'Действия со слоем Слой 2' }).locator('svg')).toBeVisible();
  await expect(row.getByRole('button', { name: 'Перетащить Слой 2' }).locator('svg')).toBeVisible();
  const saveState = page.locator('.save-state');
  await expect(saveState).toBeVisible();
  await expect(saveState).toContainText(/Сохранено|Сохранение/);
  expect((await saveState.boundingBox())?.height).toBeLessThan(65);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);
});

test('обычная студия вмещает холст и строку состояния без прокрутки страницы', async ({ page }) => {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 820, height: 1180 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.getByRole('button', { name: 'Свободная студия' }).click();
    const canvas = page.getByRole('img', { name: 'Холст для рисования' });
    await expect(canvas).toBeVisible();
    const layout = await page.evaluate(() => {
      const artboard = document.querySelector<HTMLCanvasElement>('.drawing-canvas');
      const footer = document.querySelector<HTMLElement>('.canvas-footer');
      if (!artboard || !footer) return null;
      const canvasRect = artboard.getBoundingClientRect();
      return {
        canvasWidth: canvasRect.width,
        canvasHeight: canvasRect.height,
        canvasBottom: canvasRect.bottom,
        footerBottom: footer.getBoundingClientRect().bottom,
        scrollHeight: document.documentElement.scrollHeight,
        scrollWidth: document.documentElement.scrollWidth,
        viewportHeight: window.innerHeight,
        viewportWidth: window.innerWidth,
        intrinsicSize: [artboard.width, artboard.height],
      };
    });
    expect(layout, JSON.stringify(viewport)).not.toBeNull();
    if (!layout) return;
    expect(layout.canvasWidth, JSON.stringify(viewport)).toBeGreaterThan(100);
    expect(layout.canvasWidth / layout.canvasHeight, JSON.stringify(viewport)).toBeCloseTo(4 / 3, 2);
    expect(layout.intrinsicSize).toEqual([1024, 768]);
    expect(layout.canvasBottom, JSON.stringify(viewport)).toBeLessThanOrEqual(layout.viewportHeight + 1);
    expect(layout.footerBottom, JSON.stringify(viewport)).toBeLessThanOrEqual(layout.viewportHeight + 1);
    expect(layout.scrollHeight, JSON.stringify(viewport)).toBeLessThanOrEqual(layout.viewportHeight + 1);
    expect(layout.scrollWidth, JSON.stringify(viewport)).toBeLessThanOrEqual(layout.viewportWidth + 1);
  }
});

test('при очень низком viewport инструменты и холст доступны через прокрутку, а не обрезаются', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 568 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Свободная студия' }).click();
  const canvas = page.getByRole('img', { name: 'Холст для рисования' });
  const footer = page.locator('.canvas-footer');
  expect((await canvas.boundingBox())?.width).toBeGreaterThan(150);
  await footer.scrollIntoViewIfNeeded();
  const resetZoom = page.getByRole('button', { name: 'Сброс масштаба' });
  // On a short viewport the footer can wrap: test access by scrolling to the actual control.
  await resetZoom.scrollIntoViewIfNeeded();
  await expect(resetZoom).toBeInViewport();
  const dimensions = await page.evaluate(() => ({
    scrollHeight: document.documentElement.scrollHeight,
    scrollWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
  }));
  expect(dimensions.scrollHeight).toBeGreaterThan(dimensions.viewportHeight);
  if (dimensions.scrollWidth > dimensions.viewportWidth + 1) {
    const culprits = await page.evaluate(() => Array.from(document.querySelectorAll('body *'))
      .map((element) => ({ element, rect: element.getBoundingClientRect() }))
      .filter(({ rect }) => rect.right > window.innerWidth + 1 && rect.width > 0)
      .slice(0, 18)
      .map(({ element, rect }) => ({ tag: element.tagName, classes: element.className,
        width: Math.round(rect.width), left: Math.round(rect.left), right: Math.round(rect.right),
        minWidth: getComputedStyle(element).minWidth, overflow: getComputedStyle(element).overflow })));
    console.info('LOW_VIEWPORT_OVERFLOW_DIAGNOSTIC', JSON.stringify(culprits));
  }
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.viewportWidth + 1);
});

test('колёсико масштабирует холст и не меняет размер пиксельного буфера', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Свободная студия' }).click();
  const canvas = page.getByRole('img', { name: 'Холст для рисования' });
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error('Холст не виден');
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.wheel(0, -140);
  // The toolbar has a separate "100%" brush opacity label; only the zoom display should change.
  await expect(page.locator('.zoom-controls > span')).not.toHaveText('100%');
  expect(await canvas.evaluate((node: HTMLCanvasElement) => [node.width, node.height])).toEqual([1024, 768]);
});

test('полноэкранная студия сохраняет инструменты и позволяет выйти', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Свободная студия' }).click();
  await page.getByRole('button', { name: 'Полный экран' }).click();
  await expect(page.getByRole('button', { name: 'Выйти из полного экрана' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Кисти, выбран Карандаш' })).toBeVisible();
  const fullscreenSupported = await page.evaluate(() => Boolean(document.fullscreenElement));
  if (fullscreenSupported) {
    // Playwright's visibility matcher does not account for the browser's fullscreen top layer.
    // Verify that the browser itself owns the editor and excludes the site chrome.
    expect(await page.evaluate(() => {
      const host = document.fullscreenElement;
      const editor = document.querySelector('.studio-layout');
      const header = document.querySelector('.site-header');
      return !!host && !!editor && host.contains(editor) && !!header && !host.contains(header);
    })).toBe(true);
  }
  await page.getByRole('button', { name: 'Выйти из полного экрана' }).click();
  await expect(page.getByRole('button', { name: 'Полный экран' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Эскизно' })).toBeVisible();
});

test('HSV открыт сразу, а очистка рисунка обратима', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Свободная студия' }).click();
  await page.getByRole('button', { name: /Палитра, выбран/ }).click();
  await expect(page.getByRole('slider', { name: 'Выбор насыщенности и яркости' })).toBeVisible();
  await page.getByRole('textbox', { name: 'HEX' }).fill('#ff0000');
  await page.getByRole('button', { name: 'Применить' }).click();
  await expect(page.getByRole('dialog', { name: 'Палитра цветов' })).toBeVisible();
  await page.getByRole('button', { name: 'Закрыть палитру' }).click();
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

test('палитра сохраняет видимые действия на мобильном и обычном экране', async ({ page }) => {
  for (const viewport of [{ width: 390, height: 600 }, { width: 1305, height: 764 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.getByRole('button', { name: 'Свободная студия' }).click();
    await page.getByRole('button', { name: /Палитра, выбран/ }).click();

    const palette = page.getByRole('dialog', { name: 'Палитра цветов' });
    const footer = palette.locator('.palette-popover-footer');
    const scrollArea = palette.locator('.palette-popover-scroll');
    await expect(footer.getByRole('button', { name: 'Отмена' })).toBeInViewport();
    await expect(footer.getByRole('button', { name: 'Применить' })).toBeInViewport();
    await expect(footer.getByRole('button', { name: 'Сохранить цвет' })).toBeInViewport();
    expect(await scrollArea.evaluate((node) => getComputedStyle(node).overflowY)).toBe('auto');
    const bounds = await palette.boundingBox();
    expect(bounds).not.toBeNull();
    if (!bounds) return;
    expect(bounds.x).toBeGreaterThanOrEqual(11);
    expect(bounds.y).toBeGreaterThanOrEqual(11);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width - 11);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height - 11);

    await palette.getByRole('textbox', { name: 'HEX' }).fill('#aabbcc');
    await expect(footer.getByRole('button', { name: 'Применить' })).toBeInViewport();
    await footer.getByRole('button', { name: 'Применить' }).click();
    await expect(page.getByRole('button', { name: /Палитра, выбран #AABBCC/ })).toBeVisible();
  }
});

test('недавний цвет выбирается без закрытия палитры, глазок и меню управляют слоем', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Свободная студия' }).click();
  await page.getByRole('button', { name: /Палитра, выбран/ }).click();
  await page.getByRole('textbox', { name: 'HEX' }).fill('#ff2200');
  await page.getByRole('button', { name: 'Применить' }).click();
  await page.getByRole('button', { name: 'Недавний цвет #FF2200' }).click();
  await expect(page.getByRole('dialog', { name: 'Палитра цветов' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'HEX' })).toHaveValue('#ff2200');
  await page.getByRole('button', { name: 'Закрыть палитру' }).click();

  await page.getByRole('button', { name: 'Добавить слой' }).click();
  const eye = page.getByRole('button', { name: 'Скрыть Слой 2' });
  await expect(eye.locator('svg')).toBeVisible();
  await eye.click();
  await expect(page.getByRole('button', { name: 'Показать Слой 2' })).toBeVisible();
  await page.getByRole('button', { name: 'Действия со слоем Слой 2' }).click();
  await page.getByRole('menuitem', { name: 'Заблокировать' }).click();
  await page.getByRole('button', { name: 'Действия со слоем Слой 2' }).click();
  await expect(page.getByRole('menuitem', { name: 'Разблокировать' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Удалить слой' })).toBeDisabled();
  await page.getByRole('menuitem', { name: 'Разблокировать' }).click();
  await page.getByRole('button', { name: 'Действия со слоем Слой 2' }).click();
  await page.getByRole('menuitem', { name: 'Удалить слой' }).click();
  await expect(page.getByRole('button', { name: 'Действия со слоем Слой 2' })).toHaveCount(0);
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

test('расширенные кисти и переименование слоя работают в одном рисунке', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Свободная студия' }).click();
  await page.getByRole('button', { name: 'Кисти, выбран Карандаш' }).click();
  await expect(page.getByRole('dialog', { name: 'Выбор кисти' }).getByRole('button', { name: /^Выбрать / })).toHaveCount(10);
  await page.getByRole('button', { name: 'Выбрать Уголь' }).click();
  await expect(page.getByRole('button', { name: 'Кисти, выбран Уголь' })).toBeVisible();

  const canvas = page.getByRole('img', { name: 'Холст для рисования' });
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error('Холст не виден');
  await page.mouse.move(bounds.x + bounds.width * .4, bounds.y + bounds.height * .4);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * .6, bounds.y + bounds.height * .6, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByText('Штрихов: 1')).toBeVisible();

  await page.getByRole('button', { name: 'Действия со слоем Слой 1' }).click();
  await page.getByRole('menuitem', { name: 'Переименовать' }).click();
  const input = page.getByRole('textbox', { name: 'Название слоя Слой 1' });
  await input.fill('Набросок');
  await input.press('Enter');
  await expect(page.getByRole('button', { name: 'Действия со слоем Набросок' })).toBeVisible();
  await page.getByRole('button', { name: 'Отменить' }).click();
  await expect(page.getByRole('button', { name: 'Действия со слоем Слой 1' })).toBeVisible();
});
