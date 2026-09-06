import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const resolve = (path: string) => fileURLToPath(new URL(path, import.meta.url));

// The lensing acceptance harness is a test fixture, not part of the product. It is built only
// when PHYSICS_HARNESS=1, which Playwright sets for its own server, so the shipped Docker image
// never contains it.
const withHarness = process.env.PHYSICS_HARNESS === '1';

export default defineConfig({
  plugins: [react()],
  build: withHarness
    ? {
        rollupOptions: {
          input: { main: resolve('./index.html'), lensing: resolve('./lensing-harness.html') },
        },
      }
    : {},
  test: { include: ['src/**/*.test.{ts,tsx}'] },
});
