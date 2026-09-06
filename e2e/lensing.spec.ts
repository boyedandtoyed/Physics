import { test, expect, type Page } from '@playwright/test';
import type { HarnessRequest, ShadowReport } from '../harness/lensing';

/** THE PHASE 1 ACCEPTANCE TEST (BUILD_PLAN §3).
 *
 * The shadow radius measured off a real GPU frame must match b_crit = 3*sqrt(3) GM/c^2 to within
 * a pixel. Everything else in Phase 1 — the disk, anisotropic sampling, the controls — is built
 * on top of a renderer that has to keep passing this.
 *
 * The measurement runs in the page (it needs the framebuffer) but the routine itself is unit
 * tested against synthetic frames in `shadowMeasurement.test.ts`, so a passing number here is not
 * resting on an unchecked measuring stick.
 */

async function measure(page: Page, request: HarnessRequest): Promise<ShadowReport> {
  return page.evaluate((req) => {
    const harness = window.lensingHarness;
    if (!harness) throw new Error('The lensing harness did not initialise.');
    return harness.measureShadow(req);
  }, request);
}

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/lensing-harness.html');
  await page.waitForFunction(() => Boolean(window.lensingHarness));
  expect(errors).toEqual([]);
});

test('shadow radius matches 3*sqrt(3) GM/c^2 to within a pixel', async ({ page }) => {
  const report = await measure(page, {
    width: 900,
    height: 900,
    cameraDistance: 20,
    fieldOfView: 60,
    stepsPerRay: 400,
  });

  // The measured numbers belong in the CI log: a passing gate should still show its margin.
  console.log('shadow measurement:', JSON.stringify(report));

  expect(report.spokes).toBeGreaterThan(700);
  // A correct render is circular: if the edge wandered, the mean could be right by accident.
  expect(report.spreadPixels).toBeLessThan(1);
  expect(report.errorPixels).toBeLessThan(1);
});

test('holds to within a pixel across camera distances and fields of view', async ({ page }) => {
  // One camera pose could pass by coincidence. The b -> h conversion and the static-observer
  // sqrt(1 - r_s/D) factor both vary with D, so a missing factor cannot stay hidden here.
  for (const [cameraDistance, fieldOfView] of [[8, 90], [15, 60], [40, 25]] as const) {
    const report = await measure(page, {
      width: 800,
      height: 800,
      cameraDistance,
      fieldOfView,
      stepsPerRay: 400,
    });
    expect(
      report.errorPixels,
      `D=${cameraDistance} fov=${fieldOfView}: measured ${report.measuredPixels.toFixed(3)} px, `
        + `predicted ${report.predictedPixels.toFixed(3)} px`,
    ).toBeLessThan(1);
  }
});

test('the shadow shrinks as the camera retreats', async ({ page }) => {
  const near = await measure(page, {
    width: 600, height: 600, cameraDistance: 10, fieldOfView: 60, stepsPerRay: 300,
  });
  const far = await measure(page, {
    width: 600, height: 600, cameraDistance: 40, fieldOfView: 60, stepsPerRay: 300,
  });
  expect(far.measuredPixels).toBeLessThan(near.measuredPixels);
});

test('renders a lensed star field without errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.evaluate(() => {
    window.lensingHarness?.renderStars({
      width: 600, height: 600, cameraDistance: 20, fieldOfView: 60, stepsPerRay: 300,
    });
  });
  expect(errors).toEqual([]);
  // Some pixels must be lit, or the star field is silently producing nothing.
  const lit = await page.evaluate(() => {
    const canvas = document.getElementById('scene') as HTMLCanvasElement;
    const gl = canvas.getContext('webgl2');
    if (!gl) return -1;
    const pixels = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    let count = 0;
    for (let i = 0; i < pixels.length; i += 4) if ((pixels[i] ?? 0) > 8) count++;
    return count;
  });
  expect(lit).toBeGreaterThan(0);
});
