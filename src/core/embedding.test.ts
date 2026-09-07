import { describe, expect, it } from 'vitest';
import {
  HORIZON,
  embeddingHeight,
  embeddingResidual,
  embeddingSlope,
  spatialShareOfDeflection,
} from './embedding';

// Never one radius, and never only r = r_s, where the normalised variable is 1 and a wrong
// exponent is invisible. The lesson this repo has now learned three times.
const RADII = [1.2, 1.5, 2, 3, 4, 10, 25, 100];

describe('the Flamm paraboloid (§2.1a)', () => {
  it('satisfies the embedding identity at every sampled radius', () => {
    // (dz/dr)^2 + 1 = (1 - r_s/r)^-1. This is the whole content of the surface: if it holds, the
    // rendering is the exact embedding and not an artist's funnel.
    for (const radius of RADII) {
      expect(embeddingResidual(radius)).toBeLessThan(1e-12);
    }
  });

  it('reproduces the closed form at named radii', () => {
    expect(embeddingHeight(HORIZON)).toBe(0);
    expect(embeddingHeight(2)).toBeCloseTo(2, 12);
    expect(embeddingHeight(10)).toBeCloseTo(6, 12);
    expect(embeddingHeight(1.5)).toBeCloseTo(Math.SQRT2, 12);
  });

  it('approaches a sqrt(r) growth far out, without ever reaching it', () => {
    // z = 2 sqrt(r_s(r - r_s)) -> 2 sqrt(r_s r) only as r >> r_s, so quadrupling r doubles z in
    // the limit and not before: the ratio is 2.0076 at r = 100 r_s. Asserting a flat 2x would be
    // asserting the asymptote instead of the formula.
    const quadruple = (radius: number) => embeddingHeight(radius * 4) / embeddingHeight(radius);
    expect(quadruple(100)).toBeCloseTo(2.0076, 3);
    expect(quadruple(1600)).toBeCloseTo(2.0005, 3);
    // ...and converges monotonically towards 2 from above.
    for (const radius of [100, 400, 1600, 6400]) {
      expect(quadruple(radius)).toBeGreaterThan(2);
      expect(quadruple(radius * 4)).toBeLessThan(quadruple(radius));
    }
  });

  it('stands vertical at the throat, and never turns over', () => {
    const approach = [1.1, 1.01, 1.001, 1.0001].map(r => embeddingSlope(r));
    for (let i = 1; i < approach.length; i++) {
      expect(approach[i]!).toBeGreaterThan(approach[i - 1]!);
    }
    expect(embeddingSlope(1.0000001)).toBeGreaterThan(1000);
    // Monotonic: the surface descends towards the throat and nowhere doubles back.
    for (let i = 1; i < RADII.length; i++) {
      expect(embeddingHeight(RADII[i]!)).toBeGreaterThan(embeddingHeight(RADII[i - 1]!));
    }
  });

  it('scales with r_s: the surface is self-similar', () => {
    // z(kr, k r_s) = k z(r, r_s). Schwarzschild geometry has no scale beyond r_s.
    for (const schwarzschild of [0.5, 2, 1000]) {
      for (const ratio of [1.5, 3, 20]) {
        expect(embeddingHeight(ratio * schwarzschild, schwarzschild))
          .toBeCloseTo(schwarzschild * embeddingHeight(ratio, 1), 9);
      }
    }
  });

  it('refuses to extend inside the horizon, where the slice is not spacelike', () => {
    expect(() => embeddingHeight(0.9)).toThrow(RangeError);
    expect(() => embeddingHeight(-1)).toThrow(RangeError);
    expect(() => embeddingSlope(HORIZON)).toThrow(RangeError);
    expect(() => embeddingHeight(2, 0)).toThrow(RangeError);
  });
});

describe('what the funnel is not a picture of', () => {
  it('gives the spatial share of the deflection as exactly (v/c)^2', () => {
    // The number the view states so the reader is not left with "curved space makes things fall".
    expect(spatialShareOfDeflection(1)).toBe(1);
    expect(spatialShareOfDeflection(10 / 299792458)).toBeCloseTo(1.11e-15, 17);
    expect(spatialShareOfDeflection(7700 / 299792458)).toBeCloseTo(6.6e-10, 12);
    expect(() => spatialShareOfDeflection(0)).toThrow(RangeError);
    expect(() => spatialShareOfDeflection(1.5)).toThrow(RangeError);
  });
});
