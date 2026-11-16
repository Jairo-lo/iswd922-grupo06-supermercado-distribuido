import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/ui', timeout: 45000, workers: 1, fullyParallel: false,
  reporter: [['list'], ['json', { outputFile: 'docs/evidencias/ui-results.json' }]],
  use: { browserName: 'chromium', headless: true, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
});
