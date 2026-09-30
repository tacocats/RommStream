import { defineConfig } from '@playwright/test';

// Desktop (Electron) smoke tests: `npm run e2e:desktop`. Runs against the
// build in dist/, so build first (`npm run build:desktop`). On a headless
// Linux box, wrap it in `xvfb-run -a`.
export default defineConfig({
  testDir: '.',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  outputDir: '../artifacts/e2e-desktop',
});
