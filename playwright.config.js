import { defineConfig } from '@playwright/test';
// The same variable the review scripts read, so a second checkout can be tested on another port.
const baseURL = process.env.DREAM_STREET_URL || 'http://127.0.0.1:5173';
const port = new URL(baseURL).port || '5173';
export default defineConfig({
  testDir: './tests/browser',
  timeout: 45_000,
  workers: 1,
  fullyParallel: false,
  reporter: [['list'], ['json', { outputFile: 'artifacts/browser/results.json' }]],
  use: {
    channel: 'chrome',
    headless: true,
    baseURL,
    viewport: { width: 1440, height: 900 },
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `npm run dev -- --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
