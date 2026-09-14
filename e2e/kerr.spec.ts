import { test, expect } from '@playwright/test';
import type {
  ShadowReport, AgreementReport, CircleReport, DriftReport, RingReport,
} from '../harness/kerr';

/** Phase 4 acceptance gates for the Kerr raymarcher, measured off real GPU frames.
 *
 * The Schwarzschild gate is one number — a radius — because that shadow is a circle. This one
 * cannot be: PHYSICS_SPEC §8 row 44 says the vertical half-extent is 3√3 M at EVERY spin, so a
 * renderer that reproduced only the size would have demonstrated nothing about spin. The gates
 * are the horizontal extent and the displacement, against Bardeen's analytic curve.
 */

const HARNESS = '/kerr-harness.html';

const BASE = {
  width: 601,
  height: 401,
  cameraDistance: 60,
  fieldOfView: 40,
  stepsPerRay: 900,
};

declare global {
  interface Window {
    kerrHarness: {
      measureShadow(request: typeof BASE & { spin: number }): ShadowReport;
      measureCircle(request: typeof BASE & { spin: number }): CircleReport;
      compareWithModel(request: typeof BASE & { spin: number }, samples: number): AgreementReport;
      measureDrift(request: typeof BASE & { spin: number }): DriftReport;
      measureRing(request: Record<string, unknown>): RingReport;
      rendererName(): string;
    };
  }
}

async function open(page: import('@playwright/test').Page) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(HARNESS);
  await page.waitForFunction(() => typeof window.kerrHarness !== 'undefined');
  return errors;
}

test('the a = 0 path reproduces b_crit = 3*sqrt(3) M on the Kerr integrator', async ({ page }) => {
  // PHYSICS_SPEC §8 row 47. The Kerr code must hit this on its own rather than inheriting it
  // from the Schwarzschild raymarcher, which shares none of this integrator.
  //
  // Measured over 720 spokes rather than from the two edges of a scan line. A hard-edged capture
  // mask quantises an edge to half a pixel, and the two-edge measurement has no way to average
  // that down: it reads 0.38 px small here however many integration steps it is given, which is
  // the quantisation and not the physics. A circle gives 720 independent samples of the same
  // radius, which is how the Phase 1 gate reaches 0.013 px.
  const errors = await open(page);
  const circle = await page.evaluate(
    base => window.kerrHarness.measureCircle({ ...base, spin: 0 }), BASE);
  console.log('kerr a=0 circle:', JSON.stringify(circle));
  expect(circle.spokes).toBeGreaterThan(700);
  expect(Math.abs(circle.errorAlpha) / (3 * Math.sqrt(3))).toBeLessThan(0.005);
  // A circle, not merely the right size: the spread across spokes is the shape check.
  expect(circle.spreadPixels).toBeLessThan(1);

  const report = await page.evaluate(
    base => window.kerrHarness.measureShadow({ ...base, spin: 0 }), BASE);
  console.log('kerr a=0 shadow:', JSON.stringify(report));
  // Not displaced: without spin there is nothing to displace it.
  expect(Math.abs(report.measuredMidpoint)).toBeLessThan(0.5 * report.alphaPerPixel);
  expect(errors).toEqual([]);
});

for (const spin of [0.5, 0.9, 0.998]) {
  test(`a/M = ${spin}: the measured shadow matches Bardeen's analytic extent`, async ({ page }) => {
    const errors = await open(page);
    const report = await page.evaluate(
      ({ base, s }) => window.kerrHarness.measureShadow({ ...base, spin: s }),
      { base: BASE, s: spin });
    console.log(`kerr a=${spin} shadow:`, JSON.stringify(report));
    // The gate is in pixels, because that is what a two-edge measurement of a hard mask can
    // resolve — BUILD_PLAN §3's own standard for the Schwarzschild shadow is "within a pixel".
    expect(Math.abs(report.errorMin)).toBeLessThan(report.alphaPerPixel);
    expect(Math.abs(report.errorMax)).toBeLessThan(report.alphaPerPixel);
    expect(errors).toEqual([]);
  });
}

test('spin displaces the shadow, and by the amount the formula says', async ({ page }) => {
  const errors = await open(page);
  const reports: ShadowReport[] = [];
  for (const spin of [0, 0.5, 0.9, 0.998]) {
    reports.push(await page.evaluate(
      ({ base, s }) => window.kerrHarness.measureShadow({ ...base, spin: s }),
      { base: BASE, s: spin }));
  }
  console.log('kerr displacement:', JSON.stringify(reports.map(r => ({
    spin: r.spin, measured: r.measuredMidpoint, predicted: r.predictedMidpoint,
  }))));
  // Monotonic in spin, positive whenever the hole spins, and matching the analytic midpoint.
  for (let index = 1; index < reports.length; index++) {
    expect(reports[index]!.measuredMidpoint)
      .toBeGreaterThan(reports[index - 1]!.measuredMidpoint);
    expect(Math.abs(reports[index]!.errorMidpoint))
      .toBeLessThan(reports[index]!.alphaPerPixel);
  }
  expect(reports[3]!.measuredMidpoint).toBeGreaterThan(2);
  expect(errors).toEqual([]);
});

test('the shadow narrows with spin while its height does not change', async ({ page }) => {
  // §8 row 44 is the counter-intuitive one and is worth measuring rather than asserting: the
  // vertical half-extent is 3√3 M at every spin, so only the width moves.
  const errors = await open(page);
  const widths: number[] = [];
  for (const spin of [0, 0.5, 0.9, 0.998]) {
    const report = await page.evaluate(
      ({ base, s }) => window.kerrHarness.measureShadow({ ...base, spin: s }),
      { base: BASE, s: spin });
    widths.push(report.measuredMax - report.measuredMin);
  }
  console.log('kerr widths:', JSON.stringify(widths));
  for (let index = 1; index < widths.length; index++) {
    expect(widths[index]!).toBeLessThan(widths[index - 1]!);
  }
  expect(errors).toEqual([]);
});

test('the float32 shader and the float64 model agree on capture, pixel by pixel', async ({ page }) => {
  const errors = await open(page);
  const report = await page.evaluate(
    base => window.kerrHarness.compareWithModel({ ...base, spin: 0.9 }, 240), BASE);
  console.log('kerr shader vs model:', JSON.stringify(report));
  // Disagreement is expected only where the boundary crosses a pixel. Anything further from the
  // analytic edge than a couple of pixels means the two integrators have genuinely diverged.
  expect(report.sampled).toBeGreaterThan(200);
  expect(report.worstDistanceFromEdge).toBeLessThan(0.4);
  expect(errors).toEqual([]);
});

test('the Hamiltonian stays at zero across the whole frame', async ({ page }) => {
  // The error telemetry PHYSICS_SPEC §3.4 asks for, read back off the GPU in float32.
  const errors = await open(page);
  const report = await page.evaluate(
    base => window.kerrHarness.measureDrift({ ...base, spin: 0.9 }), BASE);
  console.log('kerr hamiltonian drift:', JSON.stringify(report));
  expect(report.maxDrift).toBeLessThan(2e-3);
  expect(report.meanDrift).toBeLessThan(2e-4);
  expect(errors).toEqual([]);
});

test('the ring is brighter on the same side as the shadow’s flat edge', async ({ page }) => {
  // **This is the handedness gate, and it is the only test here that can see a reflected scene.**
  // A φ-reflection mislabels the α axis by exactly the reflection it introduces, so the shadow
  // measurement agrees with Bardeen either way. The blueshifted limb does not: g = 1/(1 − Ωξ)
  // puts it at ξ > 0, i.e. α < 0, which is also where the flat prograde edge of the shadow is.
  // If the two land on opposite sides, the trace is mirrored.
  const errors = await open(page);
  const ring = await page.evaluate(base => window.kerrHarness.measureRing({
    ...base, spin: 0.9, ringEnabled: true, ringInnerRadius: 6, ringOuterRadius: 14,
  }), BASE);
  const shadow = await page.evaluate(
    base => window.kerrHarness.measureShadow({ ...base, spin: 0.9 }), BASE);
  console.log('kerr ring:', JSON.stringify(ring));
  expect(ring.approachingPixels).toBeGreaterThan(50);
  expect(ring.recedingPixels).toBeGreaterThan(50);
  // The flat edge is the α < 0 one, which is where `measureRing` counts "approaching".
  expect(Math.abs(shadow.measuredMin)).toBeLessThan(Math.abs(shadow.measuredMax));
  // Beaming is g^4 (PHYSICS_SPEC §4.3a). The tone map compresses the ratio, so the gate is on
  // the sign and the scale rather than on the exponent.
  expect(ring.ratio).toBeGreaterThan(1.15);
  expect(errors).toEqual([]);
});
