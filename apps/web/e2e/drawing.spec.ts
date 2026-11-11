import { expect, test } from '@playwright/test';
import { createCanvas, loadImage } from '@napi-rs/canvas';

test('синтетическое перо: динамика, отмена, повтор и сохранение; мышь остаётся без динамики', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Свободная студия' }).click();
  const canvas = page.getByRole('img', { name: 'Холст для рисования' });
  await expect(page.getByRole('slider', { name: 'Чувствительность к нажиму' })).toHaveValue('80');
  await canvas.evaluate((node: HTMLCanvasElement) => {
    // Synthetic input checks the app pipeline, not physical stylus support.
    // Script-created pointers are not registered for native pointer capture.
    const captureDescriptor = Object.getOwnPropertyDescriptor(node, 'setPointerCapture');
    node.setPointerCapture = () => {};
    try {
      const rect = node.getBoundingClientRect();
      for (const [type, x, pressure] of [['pointerdown', .2, .2], ['pointermove', .4, .8], ['pointerup', .6, 0]] as const) {
        node.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 19, pointerType: 'pen',
          button: 0, buttons: type === 'pointerup' ? 0 : 1, isPrimary: true,
          clientX: rect.left + rect.width * x, clientY: rect.top + rect.height * .4,
          pressure, tiltX: 25, tiltY: -15 }));
      }
    } finally {
      // Restore native capture before the real Playwright mouse interaction below.
      if (captureDescriptor) Object.defineProperty(node, 'setPointerCapture', captureDescriptor);
      else Reflect.deleteProperty(node, 'setPointerCapture');
    }
  });
  await expect(page.getByText('Штрихов: 1')).toBeVisible();
  await page.getByRole('button', { name: 'Отменить' }).click();
  await expect(page.getByText('Штрихов: 0')).toBeVisible();
  await page.getByRole('button', { name: 'Повторить' }).click();
  await expect(page.getByText('Штрихов: 1')).toBeVisible();
  const rect = await canvas.boundingBox();
  if (!rect) throw new Error('Холст не виден');
  await page.mouse.click(rect.x + rect.width * .5, rect.y + rect.height * .7);
  await expect(page.getByText('Штрихов: 2')).toBeVisible();
  await expect(page.locator('.save-state')).toContainText('Сохранено');
  await page.reload();
  await page.getByRole('button', { name: 'Свободная студия' }).click();
  await expect(page.getByText('Штрихов: 2')).toBeVisible();
  const strokes = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('eskizno-projects');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const projects = await new Promise<any[]>((resolve, reject) => {
      const request = db.transaction('projects').objectStore('projects').getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return projects.flatMap((project) => project.layers.flatMap((layer: { strokes?: unknown[] }) => layer.strokes ?? []));
  });
  expect(strokes).toHaveLength(2);
  expect(strokes[0].dynamics).toEqual({ pressureSize: .8, tiltAngle: true });
  expect(strokes[0].points.map((point: { pressure: number }) => point.pressure)).toEqual([
    expect.closeTo(.2), expect.closeTo(.8), expect.closeTo(.8),
  ]);
  expect(strokes[0].points[0]).toMatchObject({ tiltX: 25, tiltY: -15 });
  expect(strokes[1].dynamics).toBeUndefined();
  expect(strokes[1].points[0].pressure).toBeUndefined();
});

test('v2 с операциями и референсом: синтетическое перо, preview, история, reload и PNG', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Свободная студия' }).click();
  const canvas = page.getByRole('img', { name: 'Холст для рисования' });
  await canvas.click({ position: { x: 40, y: 40 } });
  await expect(page.locator('.save-state')).toContainText('Сохранено');
  await page.goto('/');
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open('eskizno-projects'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
    });
    const project = await new Promise<any>((resolve, reject) => {
      const r = db.transaction('projects').objectStore('projects').getAll();
      r.onsuccess = () => resolve(r.result[0]); r.onerror = () => reject(r.error);
    });
    const paint = project.layers.find((layer: { kind: string }) => layer.kind === 'paint');
    paint.strokes = [{ id: 'legacy', kind: 'ink', brushId: 'liner', color: '#FF0000', width: 24, opacity: 1,
      points: [{ x: .1, y: .2 }, { x: .4, y: .2 }] }];
    paint.operations = [
      { type: 'fill', fill: { id: 'fill', point: { x: .01, y: .01 }, color: '#FFFFFF' } },
      { type: 'stroke', strokeId: 'legacy' },
      { type: 'shape', shape: { id: 'shape', kind: 'rectangle', from: { x: .7, y: .1 }, to: { x: .9, y: .3 },
        color: '#0000FF', width: 2, style: 'fill', opacity: 1 } },
    ];
    project.schemaVersion = 2;
    project.layers.push({ id: 'reference', kind: 'reference', name: 'Референс', visible: true, locked: true,
      opacity: .5, assetId: 'ref', placement: 'side', transform: { x: 0, y: 0, scale: 1, rotation: 0 } });
    const refCanvas = document.createElement('canvas'); refCanvas.width = refCanvas.height = 2;
    const blob = await new Promise<Blob>((resolve) => refCanvas.toBlob((value) => resolve(value!), 'image/png'));
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['projects', 'assets'], 'readwrite');
      tx.objectStore('projects').put(project);
      tx.objectStore('assets').put({ id: `${project.id}:ref`, projectId: project.id, assetId: 'ref', blob });
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
    });
    db.close();
  });
  await page.getByRole('button', { name: 'Мои работы' }).click();
  await page.getByRole('button', { name: /Открыть работу/ }).click();
  await expect(page.getByText('Штрихов: 1')).toBeVisible();
  const beforePen = await canvas.evaluate((node: HTMLCanvasElement) => node.toDataURL());
  await canvas.evaluate((node: HTMLCanvasElement) => {
    node.setPointerCapture = () => {};
    const rect = node.getBoundingClientRect();
    for (const [type, x] of [['pointerdown', .2], ['pointermove', .5]] as const)
      node.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 19, pointerType: 'pen', button: 0, buttons: 1,
        clientX: rect.left + rect.width * x, clientY: rect.top + rect.height * .7, pressure: .9, tiltX: 20, tiltY: -10 }));
  });
  await expect.poll(() => canvas.evaluate((node: HTMLCanvasElement) => node.toDataURL())).not.toBe(beforePen);
  const preview = await canvas.evaluate((node: HTMLCanvasElement) => node.toDataURL());
  await canvas.evaluate((node: HTMLCanvasElement) => {
    const rect = node.getBoundingClientRect();
    node.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 19, pointerType: 'pen', buttons: 0,
      clientX: rect.left + rect.width * .5, clientY: rect.top + rect.height * .7, pressure: 0 }));
    Reflect.deleteProperty(node, 'setPointerCapture');
  });
  await expect(page.getByText('Штрихов: 2')).toBeVisible();
  await expect.poll(() => canvas.evaluate((node: HTMLCanvasElement) => node.toDataURL())).toBe(preview);
  await page.getByRole('button', { name: 'Отменить' }).click();
  await expect(page.getByText('Штрихов: 1')).toBeVisible();
  await page.getByRole('button', { name: 'Повторить' }).click();
  await expect(page.getByText('Штрихов: 2')).toBeVisible();
  await expect(page.locator('.save-state')).toContainText('Сохранено');
  await page.reload();
  await page.getByRole('button', { name: 'Мои работы' }).click();
  await page.getByRole('button', { name: /Открыть работу/ }).click();
  await expect(page.getByText('Штрихов: 2')).toBeVisible();
  await expect.poll(() => canvas.evaluate((node: HTMLCanvasElement) => node.toDataURL())).toBe(preview);
  const saved = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open('eskizno-projects'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
    });
    const tx = db.transaction(['projects', 'assets']);
    const all = <T,>(r: IDBRequest<T>) => new Promise<T>((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    const [projects, assets] = await Promise.all([all(tx.objectStore('projects').getAll()), all(tx.objectStore('assets').getAll())]);
    // Native Blob is not serializable across Playwright's evaluate boundary.
    // Check the real IndexedDB payload in-page, then return scalar evidence.
    const assetSizes = assets.map((asset: { assetId: string; blob: Blob }) => ({
      assetId: asset.assetId,
      size: asset.blob.size,
    }));
    db.close(); return { project: projects[0], assetSizes };
  });
  expect(saved.project.schemaVersion).toBe(3);
  expect(saved.project.layers[0].operations.map((operation: { type: string }) => operation.type)).toEqual(['fill', 'stroke', 'shape', 'stroke']);
  expect(saved.project.layers[0].strokes[1].points.at(-1).pressure).toBeCloseTo(.9);
  expect(saved.project.layers.some((layer: { assetId?: string }) => layer.assetId === 'ref')).toBe(true);
  expect(saved.assetSizes.some((asset: { assetId: string; size: number }) => asset.assetId === 'ref' && asset.size > 0)).toBe(true);
  await page.getByRole('button', { name: 'Экспортировать PNG' }).click();
  const downloadReady = page.waitForEvent('download');
  await page.getByRole('dialog', { name: 'Экспорт PNG' }).getByRole('button', { name: 'Скачать PNG' }).click();
  const download = await downloadReady;
  const path = await download.path();
  if (!path) throw new Error('PNG не скачан');
  const image = await loadImage(path);
  const output = createCanvas(image.width, image.height); const ctx = output.getContext('2d'); ctx.drawImage(image, 0, 0);
  const pixel = (x: number, y: number) => Array.from(ctx.getImageData(Math.round(x * image.width), Math.round(y * image.height), 1, 1).data);
  expect(pixel(.25, .2)).toEqual([255, 0, 0, 255]);
  expect(pixel(.8, .2)).toEqual([0, 0, 255, 255]);
  const dynamic = pixel(.35, .7);
  expect(dynamic[0]).toBeLessThan(200); expect(dynamic[1]).toBeLessThan(200); expect(dynamic[3]).toBe(255);
});

test('параметры пера доступны без горизонтальной прокрутки на телефоне и планшете', async ({ page }) => {
  for (const viewport of [{ width: 390, height: 844 }, { width: 820, height: 1180 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.getByRole('button', { name: 'Свободная студия' }).click();
    const pressure = page.getByRole('slider', { name: 'Чувствительность к нажиму' });
    await expect(pressure).toHaveValue('80');
    await page.getByRole('button', { name: 'Кисти, выбран Карандаш' }).click();
    await page.getByRole('button', { name: 'Выбрать Каллиграфия' }).click();
    const tilt = page.getByRole('checkbox', { name: 'Наклон пера' });
    await expect(tilt).toBeChecked();
    for (const control of [pressure, tilt]) {
      await control.scrollIntoViewIfNeeded();
      await expect(control).toBeInViewport({ ratio: 1 });
      // A clipped toolbar can hide overflow without increasing document.scrollWidth.
      // Check the entire labelled control as well as the actual input.
      const bounds = await control.evaluate((node) => {
        const rect = node.closest('label')!.getBoundingClientRect();
        return { left: rect.left, right: rect.right, width: rect.width };
      });
      expect(bounds.left, JSON.stringify(viewport)).toBeGreaterThanOrEqual(0);
      expect(bounds.right, JSON.stringify(viewport)).toBeLessThanOrEqual(viewport.width + 1);
      expect(bounds.width).toBeGreaterThan(0);
    }
    await pressure.click();
    expect(Number(await pressure.inputValue())).toBeGreaterThanOrEqual(48);
    expect(Number(await pressure.inputValue())).toBeLessThanOrEqual(52);
    await pressure.press('Home');
    await pressure.press('ArrowRight');
    await expect(pressure).toHaveValue('1');
    await tilt.uncheck();
    await expect(tilt).not.toBeChecked();
    await tilt.check();
    await expect(tilt).toBeChecked();
    const penCanvas = await page.getByRole('img', { name: 'Холст для рисования' }).boundingBox();
    expect(penCanvas?.width, `Холст не должен схлопываться после включения каллиграфии: ${JSON.stringify(viewport)}`).toBeGreaterThan(100);
    const resetZoom = page.getByRole('button', { name: 'Сброс масштаба' });
    await resetZoom.scrollIntoViewIfNeeded();
    await expect(resetZoom).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width + 1);
  }
});

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
  // Changing tools can reflow the toolbar and shift the canvas.
  const brushRect = await canvas.boundingBox();
  if (!brushRect) throw new Error('Холст не виден после смены инструмента');
  await page.mouse.click(brushRect.x + brushRect.width / 3, brushRect.y + brushRect.height / 3);
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
