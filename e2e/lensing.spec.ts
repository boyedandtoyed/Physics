import { test, expect, type Page } from '@playwright/test';
import type {
  CrescentReport,
  DiskReport,
  ExponentReport,
  HarnessRequest,
  ShadowReport,
} from '../harness/lensing';

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

test.describe('accretion disk (§4.3)', () => {
  const DISK: HarnessRequest = {
    width: 700,
    height: 700,
    cameraDistance: 20,
    fieldOfView: 60,
    stepsPerRay: 500,
    inclination: 0.2,
  };

  test('shader emission radius and redshift match the float64 model per pixel', async ({ page }) => {
    const report: DiskReport = await page.evaluate((req) => {
      const harness = window.lensingHarness;
      if (!harness) throw new Error('The lensing harness did not initialise.');
      return harness.measureDisk(req);
    }, DISK);
    console.log('disk agreement:', JSON.stringify(report));

    expect(report.agreed).toBeGreaterThan(150);
    // Disagreements are silhouette pixels where a float32 and a float64 ray fall on opposite
    // sides of an edge. A handful is expected; a large fraction would mean a real divergence.
    expect(report.disagreed / report.sampled).toBeLessThan(0.06);
    // float32 vs float64 through a few hundred RK4 steps and a secant refinement. Both land
    // near 1e-4; 1e-3 leaves room for driver differences without hiding a real divergence.
    // These were 0.01 while the harness itself was broken -- the readback packed 16 bits into
    // the alpha channel of a buffer created with alpha: false, so readPixels returned 255 and
    // the corruption masqueraded as a ~1% physics error. See DECISIONS.md.
    expect(report.radiusError95).toBeLessThan(1e-3);
    expect(report.redshiftError95).toBeLessThan(1e-3);
    expect(report.radiusErrorMax).toBeLessThan(5e-3);
    expect(report.redshiftErrorMax).toBeLessThan(5e-3);
    // Guards the Novikov-Thorne profile itself. Emission radius and g are unchanged by swapping
    // in the Newtonian Shakura-Sunyaev flux law, so this is the only check that catches it.
    expect(report.temperatureError95).toBeLessThan(2e-3);
    expect(report.temperatureErrorMax).toBeLessThan(1e-2);
  });

  test('brightness scales as g^4, not g^8', async ({ page }) => {
    // The §4.3 audit found the colour pipeline applying g twice. This measures the exponent off
    // the rendered frame: mirror pixels sample the same emission radius, so the luminance ratio
    // is purely (g_left/g_right)^n. Correct is 4; the double-counted pipeline reads 8.
    const report: ExponentReport = await page.evaluate((req) => {
      const harness = window.lensingHarness;
      if (!harness) throw new Error('The lensing harness did not initialise.');
      return harness.measureDopplerExponent(req);
    }, DISK);
    console.log('doppler exponent:', JSON.stringify(report));

    expect(report.radiusLeft).toBeGreaterThan(0);
    expect(report.radiusRight).toBeGreaterThan(0);
    // Mirror pixels must land on the same radius, or the exponent measurement is meaningless.
    expect(Math.abs(report.radiusLeft - report.radiusRight) / report.radiusLeft).toBeLessThan(0.01);
    // Approaching side is the blueshifted one.
    expect(report.gLeft).toBeGreaterThan(report.gRight);
    expect(report.exponent).toBeGreaterThan(3.8);
    expect(report.exponent).toBeLessThan(4.2);
  });

  test('physical mode renders a one-sided crescent, in the finished image', async ({ page }) => {
    // Not a stylistic check. §4.3 and CLAUDE.md require the asymmetry to survive into what the
    // user sees: DNGR softened it for the film, and we explicitly do not.
    const report: CrescentReport = await page.evaluate((req) => {
      const harness = window.lensingHarness;
      if (!harness) throw new Error('The lensing harness did not initialise.');
      return harness.measureCrescent(req);
    }, { ...DISK, width: 600, height: 600, fieldOfView: 55, inclination: 0.08, stepsPerRay: 600 });
    console.log('crescent:', JSON.stringify(report));

    expect(report.approachingPixels).toBeGreaterThan(500);
    expect(report.recedingPixels).toBeGreaterThan(500);
    // Encoded sRGB, so this understates the linear ratio considerably.
    expect(report.ratio).toBeGreaterThan(1.8);
  });

  test('the disk does not disturb the shadow measurement', async ({ page }) => {
    // The shadow gate must keep holding with the disk present; the capture mask ignores it.
    const report: ShadowReport = await page.evaluate((req) => {
      const harness = window.lensingHarness;
      if (!harness) throw new Error('The lensing harness did not initialise.');
      return harness.measureShadow(req);
    }, { ...DISK, width: 900, height: 900, inclination: 0 });
    expect(report.errorPixels).toBeLessThan(1);
  });
});
