import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const base = 'http://127.0.0.1:8765/';

test('editor paints, supports undo and preserves work between steps and modes', async () => {
  const browser = await chromium.launch({ headless: true, executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(base);
    await page.getByRole('heading', { name: 'Ветка с листьями' }).waitFor();
    assert.equal(await page.locator('#step-counter').textContent(), '01 / 06');
    const rect = await page.locator('canvas').boundingBox();
    assert.ok(rect.width > 550 && rect.height > 400, 'tablet artboard should be substantial');
    await page.mouse.move(rect.x + rect.width * .2, rect.y + rect.height * .6);
    await page.mouse.down();
    await page.mouse.move(rect.x + rect.width * .6, rect.y + rect.height * .2, { steps: 12 });
    await page.mouse.up();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('eskizno:prototype:botanical-branch:v1') ?? 'null')?.strokes.length === 1);
    await page.getByRole('button', { name: 'Отменить' }).click();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('eskizno:prototype:botanical-branch:v1') ?? 'null')?.strokes.length === 0);
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('eskizno:prototype:botanical-branch:v1')).strokes.length), 0);
    await page.getByRole('button', { name: 'Повторить' }).click();
    await page.getByRole('button', { name: 'Дальше' }).click();
    await page.getByRole('button', { name: 'Пойми' }).click();
    await page.waitForFunction(() => {
      const data = JSON.parse(localStorage.getItem('eskizno:prototype:botanical-branch:v1') ?? 'null');
      return data?.step === 1 && data?.mode === 'construct' && data?.strokes.length === 1;
    });
    await page.reload();
    assert.equal(await page.locator('#step-counter').textContent(), '02 / 06');
    assert.equal(await page.getByRole('button', { name: 'Пойми' }).getAttribute('aria-pressed'), 'true');
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('eskizno:prototype:botanical-branch:v1')).strokes.length), 1);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('tablet and mobile keep the drawing canvas onscreen without horizontal scrolling', async () => {
  const browser = await chromium.launch({ headless: true, executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
  try {
    for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
      const page = await browser.newPage({ viewport, deviceScaleFactor: 2 });
      await page.goto(base);
      const rect = await page.locator('canvas').boundingBox();
      assert.ok(rect.width > 260, `canvas too narrow on ${viewport.width}`);
      assert.ok(rect.x >= 0 && rect.x + rect.width <= viewport.width + 1, `canvas clipped on ${viewport.width}`);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({ path: `prototypes/stylus-editor-v1/screenshot-${viewport.width}.png`, fullPage: true });
      await page.close();
    }
  } finally { await browser.close(); }
});

test('tablet lesson controls fit in the bottom panel without nested scrolling', async () => {
  const browser = await chromium.launch({ headless: true, executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
  try {
    for (const viewport of [{ width: 768, height: 900 }, { width: 600, height: 840 }]) {
      const page = await browser.newPage({ viewport });
      await page.goto(base);
      const panel = page.locator('.lesson-panel');
      const metrics = await panel.evaluate((element) => ({ visible: element.clientHeight, content: element.scrollHeight }));
      assert.ok(metrics.content <= metrics.visible + 2, `lesson panel scrolls at ${viewport.width}px: ${JSON.stringify(metrics)}`);
      const panelRect = await panel.boundingBox();
      const actionRect = await page.locator('.lesson-actions').boundingBox();
      assert.ok(actionRect.y + actionRect.height <= panelRect.y + panelRect.height, `buttons clipped at ${viewport.width}px`);
      await page.close();
    }
  } finally { await browser.close(); }
});

test('zoom changes artwork coordinates but never the canvas element dimensions', async () => {
  const browser = await chromium.launch({ headless: true, executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 768, height: 900 } });
  try {
    await page.goto(base);
    const before = await page.locator('canvas').boundingBox();
    await page.getByRole('button', { name: 'Увеличить холст' }).click();
    assert.equal(await page.locator('#zoom-reset').textContent(), '125%');
    const after = await page.locator('canvas').boundingBox();
    assert.deepEqual(after, before);
    await page.mouse.click(before.x + before.width * .25, before.y + before.height * .75);
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('eskizno:prototype:botanical-branch:v1') ?? 'null')?.strokes.length === 1);
    const point = await page.evaluate(() => JSON.parse(localStorage.getItem('eskizno:prototype:botanical-branch:v1')).strokes[0].points[0]);
    assert.ok(Math.abs(point.x - .3) < .025, `inverse zoom X=${point.x}`);
    assert.ok(Math.abs(point.y - .7) < .025, `inverse zoom Y=${point.y}`);
    await page.getByRole('button', { name: 'Сбросить масштаб холста' }).click();
    assert.equal(await page.locator('#zoom-reset').textContent(), '100%');
  } finally { await browser.close(); }
});

test('eraser paints a transparent path instead of deleting an entire ink stroke', async () => {
  const browser = await chromium.launch({ headless: true, executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 820 }, deviceScaleFactor: 1 });
  try {
    await page.goto(base);
    await page.getByRole('button', { name: 'Сам', exact: true }).click();
    const box = await page.locator('canvas').boundingBox();
    const draw = async (x1, y1, x2, y2) => {
      await page.mouse.move(box.x + box.width * x1, box.y + box.height * y1);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * x2, box.y + box.height * y2, { steps: 16 });
      await page.mouse.up();
    };
    await draw(.2, .5, .8, .5);
    await page.getByRole('button', { name: 'Ластик' }).click();
    await draw(.5, .35, .5, .65);
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('eskizno:prototype:botanical-branch:v1') ?? 'null')?.strokes.length === 2);
    const state = await page.evaluate(() => {
      const canvas = document.getElementById('drawing');
      const ctx = canvas.getContext('2d');
      const pixel = (x, y) => [...ctx.getImageData(Math.round(canvas.width * x), Math.round(canvas.height * y), 1, 1).data];
      return { left: pixel(.3, .5), erased: pixel(.5, .5), right: pixel(.7, .5), strokes: JSON.parse(localStorage.getItem('eskizno:prototype:botanical-branch:v1')).strokes };
    });
    assert.equal(state.strokes[1].kind, 'erase');
    assert.ok(state.left[0] < 100 && state.right[0] < 100, 'left/right ink remains');
    assert.ok(state.erased[0] > 240, 'only the crossed pixels turn white');
    await page.getByRole('button', { name: 'Отменить' }).click();
    const restored = await page.locator('canvas').evaluate((element) => element.getContext('2d').getImageData(Math.round(element.width / 2), Math.round(element.height / 2), 1, 1).data[0]);
    assert.ok(restored < 100, 'undo restores crossed ink');
  } finally { await browser.close(); }
});

test('eraser size can be adjusted on mobile and is independent of the brush size', async () => {
  const browser = await chromium.launch({ headless: true, executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  try {
    await page.goto(base);
    await page.getByRole('button', { name: 'Ластик' }).click();
    const size = page.getByRole('slider', { name: 'Размер инструмента' });
    assert.ok(await size.isVisible(), 'mobile should expose a size slider');
    await size.evaluate((input) => { input.value = '40'; input.dispatchEvent(new Event('input', { bubbles: true })); });
    assert.equal(await page.locator('#mobile-size-value').textContent(), '40');
    const rect = await page.locator('canvas').boundingBox();
    await page.mouse.move(rect.x + rect.width * .5, rect.y + rect.height * .4);
    await page.mouse.down();
    await page.mouse.move(rect.x + rect.width * .5, rect.y + rect.height * .6, { steps: 12 });
    await page.mouse.up();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('eskizno:prototype:botanical-branch:v1') ?? 'null')?.strokes.length === 1);
    const stroke = await page.evaluate(() => JSON.parse(localStorage.getItem('eskizno:prototype:botanical-branch:v1')).strokes[0]);
    assert.equal(stroke.kind, 'erase');
    assert.equal(stroke.width, 40);
    await page.getByRole('button', { name: 'Кисть' }).click();
    assert.equal(await size.inputValue(), '3');
    await size.evaluate((input) => { input.value = '8'; input.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.getByRole('button', { name: 'Ластик' }).click();
    assert.equal(await size.inputValue(), '40', 'eraser remembers its size independently');
  } finally { await browser.close(); }
});
