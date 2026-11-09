import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  use: {
    baseURL: 'http://127.0.0.1:8765',
    browserName: 'chromium',
    launchOptions: {
      // By default, use Playwright's bundled Chromium on any supported OS.
      executablePath: process.env.ESKIZNO_CHROMIUM_PATH || undefined,
      args: ['--no-sandbox'],
    },
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 8765 --strictPort',
    url: 'http://127.0.0.1:8765',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
