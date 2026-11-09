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
