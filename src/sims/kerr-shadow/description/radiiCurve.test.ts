import { describe, expect, it } from 'vitest';
import { photonOrbitResidual, radiiAt, radiiCurve } from './radiiCurve';
import { MAX_SPIN } from '../../../core/kerr';

describe('the critical-radii curve', () => {
  it('hits the six numbers the Kerr literature quotes at the two ends', () => {
    const zero = radiiAt(0);
    expect(zero.outerHorizon).toBeCloseTo(2, 9);
    expect(zero.photonPrograde).toBeCloseTo(3, 9);
    expect(zero.photonRetrograde).toBeCloseTo(3, 9);
    expect(zero.iscoPrograde).toBeCloseTo(6, 9);
    expect(zero.iscoRetrograde).toBeCloseTo(6, 9);

    const extremal = radiiAt(0.999999999);
    expect(extremal.outerHorizon).toBeCloseTo(1, 4);
    expect(extremal.photonPrograde).toBeCloseTo(1, 3);
    expect(extremal.photonRetrograde).toBeCloseTo(4, 5);
    expect(extremal.iscoRetrograde).toBeCloseTo(9, 4);
  });

  it('orders the radii the same way at every spin: horizon < photon < ISCO', () => {
    for (const sample of radiiCurve(400, MAX_SPIN)) {
      expect(sample.innerHorizon).toBeLessThanOrEqual(sample.outerHorizon);
      expect(sample.outerHorizon).toBeLessThan(sample.photonPrograde);
      expect(sample.photonPrograde).toBeLessThan(sample.iscoPrograde);
      expect(sample.photonPrograde).toBeLessThanOrEqual(sample.photonRetrograde);
      expect(sample.photonRetrograde).toBeLessThan(sample.iscoRetrograde);
    }
  });

  it('is monotonic in every series, which is what makes it a curve and not a corner', () => {
    const curve = radiiCurve(400, MAX_SPIN);
    for (let index = 1; index < curve.length; index++) {
      const previous = curve[index - 1]!;
      const current = curve[index]!;
      expect(current.outerHorizon).toBeLessThan(previous.outerHorizon);
      expect(current.photonPrograde).toBeLessThan(previous.photonPrograde);
      expect(current.iscoPrograde).toBeLessThan(previous.iscoPrograde);
      expect(current.photonRetrograde).toBeGreaterThan(previous.photonRetrograde);
      expect(current.iscoRetrograde).toBeGreaterThan(previous.iscoRetrograde);
    }
  });

  it('samples quadratically towards extremal, where all the travel is', () => {
    // The prograde ISCO is still 2.32 M at a/M = 0.9 and 1.24 M at 0.998: linear spacing draws
    // that last stretch as a corner. Half the samples must fall above a/M = 0.75.
    const curve = radiiCurve(400, MAX_SPIN);
    // a = a_max(1 − (1−f)²), so the upper half of the spin range takes 71% of the samples and
    // the top quarter takes half of them. Linear spacing would give 50% and 25%.
    expect(curve.filter(sample => sample.spin > 0.5 * MAX_SPIN).length / curve.length)
      .toBeGreaterThan(0.65);
    expect(curve.filter(sample => sample.spin > 0.75 * MAX_SPIN).length / curve.length)
      .toBeGreaterThanOrEqual(0.49);
    expect(radiiAt(0.5).iscoPrograde).toBeCloseTo(4.233, 3);
    expect(radiiAt(0.9).iscoPrograde).toBeCloseTo(2.321, 3);
    expect(radiiAt(0.998).iscoPrograde).toBeCloseTo(1.237, 3);
  });

  it('passes the accuracy probe: Teo’s orbits satisfy a cubic they were not derived from', () => {
    // BUILD_PLAN §4 names the photon orbits as the accuracy probe. The closed form and the
    // cubic are different expressions, so this constrains both.
    expect(photonOrbitResidual(radiiCurve(400, MAX_SPIN))).toBeLessThan(1e-9);
  });

  it('refuses a degenerate curve rather than drawing one', () => {
    expect(() => radiiCurve(1, 0.9)).toThrow(RangeError);
    expect(() => radiiCurve(10, 1)).toThrow(RangeError);
    expect(() => radiiCurve(10, 0)).toThrow(RangeError);
  });
});
