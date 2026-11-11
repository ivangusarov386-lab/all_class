import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: true,
  workers: 2,
  use: {
    browserName: 'chromium',
    timezoneId: 'Europe/Moscow',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {},
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'pages-from-main', use: { baseURL: 'http://127.0.0.1:4175/all_class/' } },
    { name: 'production-build', use: { baseURL: 'http://127.0.0.1:4176/all_class/' } },
  ],
  webServer: [
    { command: 'node scripts/serve_static.mjs . 4175', url: 'http://127.0.0.1:4175/all_class/' },
    { command: 'node scripts/serve_static.mjs dist 4176', url: 'http://127.0.0.1:4176/all_class/' },
  ],
});
