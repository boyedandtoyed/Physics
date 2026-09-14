import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const resolve = (path: string) => fileURLToPath(new URL(path, import.meta.url));

// The acceptance harnesses are test fixtures, not part of the product. They are built only when
// PHYSICS_HARNESS=1, which Playwright sets for its own server, so the shipped Docker image never
// contains them.
const withHarness = process.env.PHYSICS_HARNESS === '1';

export default defineConfig({
  plugins: [react()],
  build: withHarness
    ? {
        rollupOptions: {
          input: {
            main: resolve('./index.html'),
            lensing: resolve('./lensing-harness.html'),
            kerr: resolve('./kerr-harness.html'),
          },
        },
      }
    : {},
  test: { include: ['src/**/*.test.{ts,tsx}'] },
});
