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

  // Recorded baseline, point-sampled cube-cell field, this exact scene: rimRms 15.09,
  // frameRms 8.94. Anisotropic footprint filtering brings it to 6.81 / 3.97. The gate sits
  // between the two: dropping the many-star limit alone returns 11.87 and fails here.
  expect(report.rimRms).toBeLessThan(9);
  expect(report.frameRms).toBeLessThan(6);
});
