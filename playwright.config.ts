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
  // These drive a raymarcher. On a CI runner with a couple of vCPUs and no GPU, WebGL falls back
  // to SwiftShader on the CPU and a frame costs orders of magnitude more than it does on the
  // development machine. The default 30 s timeout is a development-machine assumption, not a
  // statement about the code: the app suite already reaches 23 s on two cores here.
  projects: [
    {
      name: 'app',
      testMatch: /(shell|sim|deflection|interpretations)\.spec\.ts/,
      timeout: 150_000,
      use: { baseURL: `http://127.0.0.1:${APP_PORT}` },
    },
    {
      name: 'lensing',
      testMatch: /(lensing|stability)\.spec\.ts/,
      timeout: 600_000,
      use: { baseURL: `http://127.0.0.1:${HARNESS_PORT}` },
    },
  ],
});
