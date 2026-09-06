import { test, expect } from '@playwright/test';
import type { HarnessRequest, StabilityReport } from '../harness/lensing';

/** PHYSICS_SPEC §4.5 temporal-stability gate. See DECISIONS.md for the baseline it replaced. */
const SCENE: HarnessRequest = {
  width: 500,
  height: 500,
  cameraDistance: 20,
  fieldOfView: 55,
  stepsPerRay: 400,
  inclination: 0.25,
  diskEnabled: false,
};

test('star-field sampling is temporally stable under sub-pixel jitter', async ({ page }) => {
  await page.goto('/lensing-harness.html');
  await page.waitForFunction(() => Boolean(window.lensingHarness));
  const report: StabilityReport = await page.evaluate((req) => {
    const harness = window.lensingHarness;
    if (!harness) throw new Error('The lensing harness did not initialise.');
    return harness.measureTemporalStability(req, 16);
  }, SCENE);
  // The measured metric belongs in the CI log alongside its recorded baseline.
  console.log('stability:', JSON.stringify(report));
  expect(report.samples).toBe(16);
  expect(report.rimPixels).toBeGreaterThan(1000);

  // The gate needs BOTH halves. Variance alone is gamed by a blank frame -- a mutation that
  // narrowed the kernel until the rim went black scored 1.78, better than the correct filter's
  // 6.81, precisely because there was nothing left to vary.
  expect(report.rimMean).toBeGreaterThan(6);

  // The gate is the *relative* figure, so tuning brightness cannot break it or game it:
  // correct filtering 0.32, dropping the many-star limit 1.14, a blank frame 16.8.
  // Absolute reference values, point-sampled cube-cell field on this scene: rimRms 15.09,
  // frameRms 8.94; after anisotropic filtering, 6.81 / 3.97.
  expect(report.rimRelative).toBeLessThan(0.6);
});

test('resolution scaling costs sharpness at the shadow rim, and the cost is measured', async ({ page }) => {
  // §4.5 previously called 0.5-0.7x upsampling "nearly free visually" on the grounds that the
  // image is a smooth warped skybox. The star field is smooth; the shadow rim is not. This
  // records what the trade actually costs instead of asserting it away.
  await page.goto('/lensing-harness.html');
  await page.waitForFunction(() => Boolean(window.lensingHarness));
  const measure = (resolutionScale: number) => page.evaluate((req) => {
    const harness = window.lensingHarness;
    if (!harness) throw new Error('The lensing harness did not initialise.');
    return harness.measureEdgeSharpness(req);
  }, { ...SCENE, diskEnabled: true, resolutionScale });

  const full = await measure(1);
  const half = await measure(0.5);
  console.log('edge sharpness:', JSON.stringify({ full, half, ratio: full.edgeGradient / half.edgeGradient }));

  expect(full.edgeGradient).toBeGreaterThan(0);
  // The point of the measurement: it is a real cost, not a negligible one.
  expect(full.edgeGradient).toBeGreaterThan(half.edgeGradient * 1.15);
});

test('accumulation converges to the mean and discards history on a camera change', async ({ page }) => {
  await page.goto('/lensing-harness.html');
  await page.waitForFunction(() => Boolean(window.lensingHarness));
  const report = await page.evaluate((req) => {
    const harness = window.lensingHarness;
    if (!harness) throw new Error('The lensing harness did not initialise.');
    return harness.measureAccumulation(req, 8);
  }, { ...SCENE, width: 300, height: 300, stepsPerRay: 300 });
  console.log('accumulation:', JSON.stringify(report));

  expect(report.accumulatedFrames).toBe(8);
  // 8-bit readback of a half-float accumulator: a couple of levels is rounding, not drift.
  expect(report.convergenceError).toBeLessThan(3);
  // The reset requirement. Without it this would be a visible blend of the two camera poses.
  expect(report.ghostingError).toBeLessThan(3);
});
