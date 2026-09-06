import { describe, expect, it } from 'vitest';
import {
  LUT_MAX_TEMPERATURE,
  LUT_MIN_TEMPERATURE,
  blackbodyChromaticity,
  blackbodyColourTable,
  blackbodyLinearSrgb,
  blackbodyXyz,
  encodeSrgb,
  planckSpectralRadiance,
} from './blackbody';
import { BOLTZMANN, C, H } from '../units';

describe('Planck spectrum', () => {
  it('peaks where Wien displacement says it should', () => {
    // lambda_max * T = 2.897771955e-3 m K (CODATA). Found by scan, not asserted from the formula.
    for (const temperature of [3000, 6000, 12000]) {
      let best = { radiance: 0, lambda: 0 };
      for (let lambda = 50e-9; lambda < 3000e-9; lambda += 1e-10) {
        const radiance = planckSpectralRadiance(lambda, temperature);
        if (radiance > best.radiance) best = { radiance, lambda };
      }
      expect(best.lambda * temperature).toBeCloseTo(2.897771955e-3, 6);
    }
  });

  it('integrates to the Stefan-Boltzmann law', () => {
    // int B_lambda dlambda over all wavelengths = sigma T^4 / pi.
    const sigma = (2 * Math.PI ** 5 * BOLTZMANN ** 4) / (15 * H ** 3 * C ** 2);
    const temperature = 5000;
    let total = 0;
    const step = 2e-9;
    for (let lambda = 1e-9; lambda < 4e-5; lambda += step) {
      total += planckSpectralRadiance(lambda, temperature) * step;
    }
    expect(total / (sigma * temperature ** 4 / Math.PI)).toBeCloseTo(1, 3);
  });
});

describe('blackbody chromaticity', () => {
  it('normalises to unit luminance so the table carries no brightness', () => {
    // This is the guard against re-introducing the g double-count through the colour table.
    for (const temperature of [1500, 6504, 25000]) {
      expect(blackbodyXyz(temperature)[1]).toBeCloseTo(1, 12);
    }
  });

  it('lands on the published Planckian locus at 6504 K', () => {
    const [x, y] = blackbodyChromaticity(6504);
    expect(Math.hypot(x - 0.3135, y - 0.3237)).toBeLessThan(0.001);
  });

  it('does NOT sit on D65, because daylight is not a blackbody', () => {
    // sRGB's white point is a daylight illuminant roughly 0.0054 off the Planckian locus.
    // A correct implementation misses it by about that much; matching it would mean fitting
    // the colour-matching functions to the wrong target.
    const [x, y] = blackbodyChromaticity(6504);
    const offset = Math.hypot(x - 0.3127, y - 0.3290);
    expect(offset).toBeGreaterThan(0.004);
    expect(offset).toBeLessThan(0.007);
  });

  it('moves monotonically from red to blue as temperature rises', () => {
    // CIE x, not the blue/red channel ratio: gamut mapping clamps blue to zero at the red end,
    // so that ratio is flat there and cannot show monotonicity.
    let previous = Number.POSITIVE_INFINITY;
    for (let temperature = 1200; temperature <= 25000; temperature += 400) {
      const [x] = blackbodyChromaticity(temperature);
      expect(x).toBeLessThan(previous);
      previous = x;
    }
  });

  it('is red-dominant when cool and blue-dominant when hot', () => {
    const [rCool, , bCool] = blackbodyLinearSrgb(1500);
    expect(rCool).toBeGreaterThan(bCool);
    const [rHot, , bHot] = blackbodyLinearSrgb(25000);
    expect(bHot).toBeGreaterThan(rHot);
  });

  it('never emits a negative channel after gamut mapping', () => {
    for (let temperature = 1000; temperature <= 30000; temperature += 250) {
      for (const channel of blackbodyLinearSrgb(temperature)) {
        expect(channel).toBeGreaterThanOrEqual(0);
        expect(channel).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('sRGB transfer function', () => {
  it('matches the IEC 61966-2-1 breakpoints', () => {
    expect(encodeSrgb(0)).toBe(0);
    expect(encodeSrgb(1)).toBeCloseTo(1, 12);
    expect(encodeSrgb(0.0031308)).toBeCloseTo(12.92 * 0.0031308, 12);
    // Mid grey: linear 0.2140 encodes to about 0.5.
    expect(encodeSrgb(0.2140)).toBeCloseTo(0.5, 2);
  });

  it('clamps rather than producing NaN outside [0, 1]', () => {
    expect(encodeSrgb(-3)).toBe(0);
    expect(encodeSrgb(11)).toBeCloseTo(1, 12);
  });
});

describe('colour lookup table', () => {
  it('spans the documented range and matches direct evaluation at its endpoints', () => {
    const size = 256;
    const table = blackbodyColourTable(size);
    expect(table).toHaveLength(size * 3);
    const [rLow, gLow, bLow] = blackbodyLinearSrgb(LUT_MIN_TEMPERATURE);
    expect(table[0]).toBeCloseTo(rLow, 6);
    expect(table[1]).toBeCloseTo(gLow, 6);
    expect(table[2]).toBeCloseTo(bLow, 6);
    const [rHigh] = blackbodyLinearSrgb(LUT_MAX_TEMPERATURE);
    expect(table[(size - 1) * 3]).toBeCloseTo(rHigh, 6);
  });

  it('rejects a degenerate size', () => {
    expect(() => blackbodyColourTable(1)).toThrow(RangeError);
    expect(() => blackbodyColourTable(2.5)).toThrow(RangeError);
  });
});
