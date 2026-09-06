import { defineConfig } from '@playwright/test';

const APP_PORT = 4173;
const HARNESS_PORT = 4174;

export default defineConfig({
  testDir: './e2e',
  use: { trace: 'retain-on-failure' },
  // Two servers on purpose. The app tests must run against the *shipped* bundle, with nothing
  // extra compiled in; the acceptance harness is a separate build behind PHYSICS_HARNESS so it
  // can never reach the Docker image. See DECISIONS.md.
  webServer: [
    {
      command: `npm run build && npm run preview -- --port ${APP_PORT} --strictPort`,
      url: `http://127.0.0.1:${APP_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command:
        `PHYSICS_HARNESS=1 npm run build -- --outDir dist-harness && `
        + `npm run preview -- --outDir dist-harness --port ${HARNESS_PORT} --strictPort`,
      url: `http://127.0.0.1:${HARNESS_PORT}/lensing-harness.html`,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
  ],
  projects: [
    {
      name: 'app',
      testMatch: /shell\.spec\.ts/,
      use: { baseURL: `http://127.0.0.1:${APP_PORT}` },
    },
    {
      name: 'lensing',
      testMatch: /lensing\.spec\.ts/,
      use: { baseURL: `http://127.0.0.1:${HARNESS_PORT}` },
    },
  ],
});
