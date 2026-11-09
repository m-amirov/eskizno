import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');

test('mobile size control lives outside the toolbar hidden on narrow screens', () => {
  const statusBar = html.slice(html.indexOf('<div class="status-bar">'), html.indexOf('</main>'));
  assert.match(statusBar, /id="mobile-size"[^>]*type="range"/);
  assert.match(css, /@media\s*\(max-width:\s*550px\)[\s\S]*?\.mobile-size-control\s*\{[^}]*display:\s*flex/);
});

test('UI has a visible version marker for checking whether updated files loaded', () => {
  assert.match(html, /id="build-version"[^>]*>v0\.4</);
});
