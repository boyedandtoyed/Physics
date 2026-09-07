import { defineConfig } from '@playwright/test';

/**
 * Point the app suite at a DEPLOYED host instead of a local build:
 *
 *   PHYSICS_EDGE_URL=https://staging-abstract-physics.binodtiwari.com npx playwright test
 *
 * This is how a release candidate is verified. The Cloudflare edge is not transparent — it
 * injects markup into every response — so a page that passes against `vite preview` has not been
 * checked in the form the public receives it. When this is set, no local servers are started and
 * only the app specs run; the lensing acceptance suite needs its own harness build and stays out.
 */
const EDGE_URL = process.env.PHYSICS_EDGE_URL;

const APP_PORT = 4173;
const HARNESS_PORT = 4174;

export default defineConfig({
  testDir: './e2e',
  use: { trace: 'retain-on-failure' },
  // Two servers on purpose. The app tests must run against the *shipped* bundle, with nothing
  // extra compiled in; the acceptance harness is a separate build behind PHYSICS_HARNESS so it
  // can never reach the Docker image. See DECISIONS.md.
  webServer: EDGE_URL ? undefined : [
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
  projects: EDGE_URL ? [
    {
      name: 'edge',
      testMatch: /(shell|sim|deflection|interpretations|timeDilation|simStage)\.spec\.ts/,
      // A round trip through Cloudflare is slower than localhost, and the lensing sim renders
      // on SwiftShader in CI.
      timeout: 180_000,
      use: { baseURL: EDGE_URL },
    },
  ] : [
    {
      name: 'app',
      testMatch: /(shell|sim|deflection|interpretations|timeDilation|simStage)\.spec\.ts/,
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
