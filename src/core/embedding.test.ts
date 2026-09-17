import { describe, expect, it } from 'vitest';
import {
  HORIZON,
  embeddingHeight,
  embeddingResidual,
  embeddingSlope,
  sheetHeight,
  spatialShareOfDeflection,
  uniformSphereField,
  uniformSpherePotential,
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

describe('the rubber sheet the sandboxes draw', () => {
  it('is the exact Newtonian potential outside the body', () => {
    for (const r of [1, 2, 10, 1e3]) {
      expect(uniformSpherePotential(r, 3, 0.5)).toBeCloseTo(-3 / r, 12);
    }
  });

  it('is the exact uniform-sphere interior, not a softening parameter', () => {
    const mass = 4;
    const radius = 2;
    // -3M/2R at the centre, -M/R at the surface, and a ratio of exactly 3/2 between them.
    expect(uniformSpherePotential(0, mass, radius)).toBeCloseTo(-1.5 * mass / radius, 12);
    expect(uniformSpherePotential(radius, mass, radius)).toBeCloseTo(-mass / radius, 12);
    expect(uniformSpherePotential(0, mass, radius) / uniformSpherePotential(radius, mass, radius))
      .toBeCloseTo(1.5, 12);
  });

  it('joins continuously, and with a continuous slope, at the surface', () => {
    const mass = 4;
    const radius = 2;
    // Both branches evaluated AT the surface rather than either side of it: the interior form
    // -M(3R^2-r^2)/(2R^3) collapses to -M/R at r = R exactly, and MR/R^3 to M/R^2, so this is a
    // statement about the algebra and not about how small an epsilon was chosen.
    const interior = (-mass * (3 * radius * radius - radius * radius)) / (2 * radius ** 3);
    expect(interior).toBe(-mass / radius);
    expect(uniformSpherePotential(radius, mass, radius)).toBe(-mass / radius);
    expect((mass * radius) / radius ** 3).toBe(mass / (radius * radius));
    expect(uniformSphereField(radius, mass, radius)).toBe(mass / (radius * radius));
    // And the step across the join is what a slope of M/R^2 over 2e-9 gives, not a jump.
    const epsilon = 1e-9;
    const step = uniformSpherePotential(radius + epsilon, mass, radius)
      - uniformSpherePotential(radius - epsilon, mass, radius);
    expect(step).toBeCloseTo(2 * epsilon * (mass / (radius * radius)), 15);
    // The field is finite everywhere, including dead centre, which is why no epsilon is needed.
    expect(uniformSphereField(0, mass, radius)).toBe(0);
  });

  it('is NOT the Flamm paraboloid, and the two disagree in sign of slope', () => {
    // Flamm rises outward as +2 sqrt(r_s r); the potential rises to zero from below as -M/r.
    // Both "rise", but one is unbounded above and the other is bounded by zero — they are not
    // the same picture and the sims say which one they are drawing.
    expect(embeddingHeight(4)).toBeGreaterThan(embeddingHeight(2));
    expect(uniformSpherePotential(4, 1, 0.1)).toBeGreaterThan(uniformSpherePotential(2, 1, 0.1));
    expect(embeddingHeight(100)).toBeGreaterThan(10);
    expect(uniformSpherePotential(100, 1, 0.1)).toBeGreaterThan(-0.011);
  });

  it('superposes linearly, which is exactly why it can be drawn for several masses at all', () => {
    const a = { x: -2, y: 0, mass: 3, radius: 0.4 };
    const b = { x: 2, y: 0, mass: 1, radius: 0.2 };
    const point = { x: 0.7, y: 1.3 };
    expect(sheetHeight(point.x, point.y, [a, b])).toBeCloseTo(
      sheetHeight(point.x, point.y, [a]) + sheetHeight(point.x, point.y, [b]), 12,
    );
  });

  it('is deepest at a mass and shallower between two of them', () => {
    const masses = [
      { x: -2, y: 0, mass: 1, radius: 0.3 },
      { x: 2, y: 0, mass: 1, radius: 0.3 },
    ];
    expect(sheetHeight(-2, 0, masses)).toBeLessThan(sheetHeight(0, 0, masses));
    expect(sheetHeight(0, 0, masses)).toBeLessThan(sheetHeight(20, 0, masses));
    // Symmetric, as two equal masses must be.
    expect(sheetHeight(-2, 0, masses)).toBeCloseTo(sheetHeight(2, 0, masses), 12);
  });

  it('scales the whole sheet without changing its shape', () => {
    const masses = [{ x: 0, y: 0, mass: 2, radius: 0.5 }];
    expect(sheetHeight(3, 0, masses, 4)).toBeCloseTo(4 * sheetHeight(3, 0, masses), 12);
  });

  it('is finite everywhere, including dead centre of a mass', () => {
    const masses = [{ x: 0, y: 0, mass: 5, radius: 0.25 }];
    expect(Number.isFinite(sheetHeight(0, 0, masses))).toBe(true);
    expect(sheetHeight(0, 0, masses)).toBeCloseTo(-1.5 * 5 / 0.25, 12);
  });

  it('refuses a body with no radius rather than returning an infinity', () => {
    expect(() => uniformSpherePotential(0, 1, 0)).toThrow(RangeError);
  });
});
