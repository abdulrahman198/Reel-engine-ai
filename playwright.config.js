import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  timeout: 30_000,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    browserName: 'chromium',
    headless: true,
    viewport: { width: 1440, height: 1000 },
  },
  webServer: {
    command: 'npm run dev:client -- --port 4173',
    url: 'http://127.0.0.1:4173/studio.html',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
