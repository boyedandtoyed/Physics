import { describe, expect, it } from 'vitest';
import {
  DEFAULT_START_RADIUS,
  HORIZON,
  MASS,
  eddingtonFinkelsteinU,
  eddingtonFinkelsteinV,
  gullstrandPainleveTime,
  kretschmann,
  kruskal,
  lambertW0,
  properTime,
  properTimeToHorizon,
  radialTidal,
  radiusAtProperTime,
  radiusFromEddingtonV,
  radiusFromKruskal,
  radiusFromSchwarzschildTime,
  schwarzschildTime,
  tortoise,
} from './infall';

// Sampled events on the worldline, by the faller's own clock. Never a single radius, and never
// only r = r_s, where every power of r gives the same answer — the defect this document's own
// fifth audit found in the first Kretschmann check.
const EVENT_TIMES = [0.5, 3, 7, 11, 13, 14, 14.4];
const RADII = [8, 6, 4, 3, 2, 1.5, 1.1, 1.001];

describe('the infall trajectory (§7.4 Claim B)', () => {
  it('reaches the horizon in 14.4183 r_s/c of proper time from 8 r_s', () => {
    expect(properTimeToHorizon(DEFAULT_START_RADIUS)).toBeCloseTo(14.4183, 4);
  });

  it('matches (2/3)(r0^{3/2} - r_s^{3/2}) at six starting radii', () => {
    // The closed form, not one number: the r_s^{3/2} term is easy to drop and invisible at a
    // single large r0. Asserting it across radii is what pins it.
    for (const start of [1.5, 2, 4, 8, 100, 1e4]) {
      expect(properTimeToHorizon(start))
        .toBeCloseTo((2 / 3) * (start ** 1.5 - 1), 8);
    }
  });

  it('approaches the r0^{3/2} scaling only asymptotically, which is the honest statement', () => {
    // Quadrupling r0 gives exactly 8x only as r0 -> infinity; at r0 = 4 it is 9.0, because the
    // -r_s^{3/2} term is not negligible there. Asserting a flat 8x would have been wrong.
    expect(properTimeToHorizon(16) / properTimeToHorizon(4)).toBeCloseTo(9.0, 6);
    expect(properTimeToHorizon(64) / properTimeToHorizon(16)).toBeCloseTo(8.1111, 3);
    expect(properTimeToHorizon(4e6) / properTimeToHorizon(1e6)).toBeCloseTo(8, 3);
  });

  it('inverts proper time consistently across the whole fall', () => {
    for (const radius of RADII) {
      expect(radiusAtProperTime(properTime(radius))).toBeCloseTo(radius, 10);
    }
  });

  it('sends Schwarzschild t to infinity while proper time stays finite', () => {
    // The single contrast the module exists to draw.
    const times = [1.1, 1.01, 1.001, 1.0001].map(r => schwarzschildTime(r));
    for (let i = 1; i < times.length; i++) expect(times[i]!).toBeGreaterThan(times[i - 1]!);
    expect(schwarzschildTime(1.0000001)).toBeGreaterThan(30);
    expect(schwarzschildTime(HORIZON)).toBe(Number.POSITIVE_INFINITY);
    expect(properTimeToHorizon()).toBeLessThan(15);
    // Inside the horizon this chart has nothing to say: t is spatial there. Refusing beats
    // returning a number that could wander into the invariant comparison.
    expect(() => schwarzschildTime(0.9)).toThrow(RangeError);
  });

  it('runs both invertible coordinates strictly downwards in r, which the bisection assumes', () => {
    for (const [outer, inner] of [[8, 6], [6, 4], [4, 2], [2, 1.5], [1.5, 1.1], [1.1, 1.001]]) {
      expect(schwarzschildTime(inner!)).toBeGreaterThan(schwarzschildTime(outer!));
      expect(eddingtonFinkelsteinV(inner!)).toBeGreaterThan(eddingtonFinkelsteinV(outer!));
    }
  });

  it('starts every chart at the stated origin', () => {
    expect(schwarzschildTime(DEFAULT_START_RADIUS)).toBeCloseTo(0, 12);
    expect(gullstrandPainleveTime(DEFAULT_START_RADIUS)).toBeCloseTo(0, 12);
    expect(eddingtonFinkelsteinV(DEFAULT_START_RADIUS))
      .toBeCloseTo(tortoise(DEFAULT_START_RADIUS), 10);
  });
});

describe('Gullstrand–Painlevé time is the faller’s own clock', () => {
  it('equals proper time exactly, at every sampled radius', () => {
    for (const radius of RADII) {
      expect(gullstrandPainleveTime(radius)).toBe(properTime(radius));
    }
  });

  it('stays finite through the horizon where Schwarzschild t does not', () => {
    expect(gullstrandPainleveTime(1.0000001)).toBeLessThan(15);
    expect(Number.isFinite(gullstrandPainleveTime(HORIZON))).toBe(true);
  });
});

describe('Eddington–Finkelstein v is regular at the horizon', () => {
  it('agrees with t + r* wherever t is finite, across the fall', () => {
    // The closed form cancels the divergent logarithms algebraically; this checks it did not
    // cancel anything else on the way.
    for (const radius of RADII) {
      expect(eddingtonFinkelsteinV(radius))
        .toBeCloseTo(schwarzschildTime(radius) + tortoise(radius), 8);
    }
  });

  it('converges to a finite limit at the horizon rather than diverging', () => {
    const approach = [1.01, 1.001, 1.0001, 1.000001].map(r => eddingtonFinkelsteinV(r));
    for (const value of approach) expect(Number.isFinite(value)).toBe(true);
    // Successive differences shrink: it is converging, not creeping to infinity.
    const gaps = approach.slice(1).map((value, i) => Math.abs(value - approach[i]!));
    for (let i = 1; i < gaps.length; i++) expect(gaps[i]!).toBeLessThan(gaps[i - 1]!);
    expect(approach[approach.length - 1]!).toBeCloseTo(19.7224, 3);
  });

  it('has u diverge, which is what makes the horizon a coordinate limit in the old chart', () => {
    expect(eddingtonFinkelsteinU(1.000001)).toBeGreaterThan(eddingtonFinkelsteinU(1.1));
    expect(eddingtonFinkelsteinU(HORIZON)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('Lambert W0', () => {
  it('reproduces its known values', () => {
    expect(lambertW0(0)).toBe(0);
    expect(lambertW0(Math.E)).toBeCloseTo(1, 12);
    expect(lambertW0(1)).toBeCloseTo(0.5671432904097838, 12);
    expect(lambertW0(-1 / Math.E)).toBeCloseTo(-1, 6);
  });

  it('satisfies its defining equation over eight decades', () => {
    for (const z of [1e-4, 1e-2, 0.5, 1, 10, 1e3, 1e5, 1e8]) {
      const w = lambertW0(z);
      expect(w * Math.exp(w)).toBeCloseTo(z, 6);
      expect(Math.abs(w * Math.exp(w) / z - 1)).toBeLessThan(1e-12);
    }
  });

  it('rejects arguments below -1/e where it is not real', () => {
    expect(() => lambertW0(-0.5)).toThrow(RangeError);
    expect(() => lambertW0(Number.NaN)).toThrow(RangeError);
  });
});

describe('Kruskal is carried in null coordinates for a measured reason', () => {
  const productError = (radius: number) => {
    const { U, V } = kruskal(radius);
    return Math.abs((U * V) / ((radius - 1) * Math.exp(radius)) - 1);
  };
  const differenceError = (radius: number) => {
    const { T, X } = kruskal(radius);
    return Math.abs((X * X - T * T) / ((radius - 1) * Math.exp(radius)) - 1);
  };

  it('gives UV = (r/r_s - 1) e^{r/r_s} well inside the 1e-10 invariant gate', () => {
    for (const radius of RADII) expect(productError(radius)).toBeLessThan(1e-13);
    // Even a thousandth of an r_s from the horizon, where the naive form has already failed.
    expect(productError(1.00001)).toBeLessThan(1e-11);
  });

  it('shows why X^2 - T^2 is not usable: it breaches the gate at the far end of the fall', () => {
    // Not a stylistic preference. This is the measurement behind PHYSICS_SPEC §7.4's choice.
    // With the shipped normalisation (V = 1 at the crossing) the ill-conditioned end is the
    // distant exterior, where X and T are ~1e6 and nearly equal and opposite.
    expect(differenceError(8)).toBeGreaterThan(1e-9);
    expect(differenceError(6)).toBeGreaterThan(1e-11);
    expect(productError(8)).toBeLessThan(1e-14);
    expect(differenceError(8) / productError(8)).toBeGreaterThan(1e5);
  });

  it('is canonical: anchoring at the crossing makes it independent of where the fall began', () => {
    // v(r) - v(r_s) does not depend on the time origin, so the normalised plane is the same
    // chart whatever r0 is. That is a virtue, and it is why no boost parameter is exposed.
    for (const radius of [1.2, 2, 3, 4]) {
      const eight = kruskal(radius, 8);
      const five = kruskal(radius, 5);
      expect(Math.abs(five.X / eight.X - 1)).toBeLessThan(1e-12);
      expect(Math.abs((five.U * five.V) / (eight.U * eight.V) - 1)).toBeLessThan(1e-12);
    }
  });

  it('has a boost move the ill-conditioning rather than remove it', () => {
    // Applied arithmetically, since the shipped chart is canonical: a boost multiplies V and
    // divides U by the same factor. UV is untouched; X^2 - T^2 is not, and wherever the boost
    // makes one end of the trajectory clean it makes the other end worse.
    const boosted = (radius: number, factor: number) => {
      const { U, V } = kruskal(radius);
      const bV = V * factor;
      const bU = U / factor;
      const X = (bV + bU) / 2;
      const T = (bV - bU) / 2;
      const exact = (radius - 1) * Math.exp(radius);
      return {
        product: Math.abs((bU * bV) / exact - 1),
        difference: Math.abs((X * X - T * T) / exact - 1),
      };
    };
    // A boost that cleans up the distant end...
    expect(boosted(8, 1e6).difference).toBeLessThan(boosted(8, 1).difference);
    // ...ruins the horizon end, which the shipped normalisation had clean.
    expect(boosted(1.0001, 1e6).difference).toBeGreaterThan(boosted(1.0001, 1).difference);
    expect(boosted(1.0001, 1e6).difference).toBeGreaterThan(1e-8);
    // The product form is unaffected by any of it, at both ends.
    for (const factor of [1e-6, 1, 1e6]) {
      expect(boosted(8, factor).product).toBeLessThan(1e-13);
      expect(boosted(1.0001, factor).product).toBeLessThan(1e-11);
    }
  });

  it('puts the horizon crossing at V = 1, which is what makes the plane plottable', () => {
    expect(kruskal(1 + 1e-12).V).toBeCloseTo(1, 9);
    expect(kruskal(1 + 1e-12).X).toBeCloseTo(0.5, 6);
    // And the interesting stretch of the fall is then order unity rather than order 1e6.
    for (const radius of [1.001, 1.1, 1.5, 2, 3]) {
      expect(Math.abs(kruskal(radius).X)).toBeLessThan(50);
    }
    // While the start of the fall is far outside any drawable window; the panel says so.
    expect(kruskal(8).X).toBeGreaterThan(1e6);
  });

  it('keeps X = (V+U)/2 and T = (V-U)/2 consistent for drawing', () => {
    for (const radius of RADII) {
      const { U, V, T, X } = kruskal(radius);
      expect(X + T).toBeCloseTo(V, 8);
      expect(X - T).toBeCloseTo(U, 8);
    }
  });

  it('sends U to zero at the horizon, which is where the chart is regular', () => {
    const approach = [1.1, 1.01, 1.001, 1.0001].map(r => kruskal(r).U);
    for (let i = 1; i < approach.length; i++) expect(approach[i]!).toBeLessThan(approach[i - 1]!);
    expect(approach[approach.length - 1]!).toBeGreaterThan(0);
  });
});

describe('the invariants agree at the same EVENTS across all four charts', () => {
  // The module's entire thesis. Each chart recovers the areal radius by its own route: a
  // root-find on t(r), proper time for GP, a root-find on v(r), and W0(UV/e) for Kruskal.
  // Handing r around instead would make this a comparison of a number with itself.
  const recoveries = (tau: number) => {
    const radius = radiusAtProperTime(tau);
    return {
      truth: radius,
      schwarzschild: radiusFromSchwarzschildTime(schwarzschildTime(radius)),
      gullstrandPainleve: radiusAtProperTime(gullstrandPainleveTime(radius)),
      eddingtonFinkelstein: radiusFromEddingtonV(eddingtonFinkelsteinV(radius)),
      kruskal: radiusFromKruskal(kruskal(radius)),
    };
  };

  it('recovers the same areal radius in all four charts to 1e-12', () => {
    for (const tau of EVENT_TIMES) {
      const r = recoveries(tau);
      for (const chart of ['schwarzschild', 'gullstrandPainleve', 'eddingtonFinkelstein', 'kruskal'] as const) {
        expect(Math.abs(r[chart] / r.truth - 1)).toBeLessThan(1e-12);
      }
    }
  });

  it('gives the same Kretschmann scalar and tidal component to 1e-10', () => {
    for (const tau of EVENT_TIMES) {
      const r = recoveries(tau);
      const reference = kretschmann(r.truth);
      const referenceTidal = radialTidal(r.truth);
      for (const chart of ['schwarzschild', 'gullstrandPainleve', 'eddingtonFinkelstein', 'kruskal'] as const) {
        expect(Math.abs(kretschmann(r[chart]) / reference - 1)).toBeLessThan(1e-10);
        expect(Math.abs(radialTidal(r[chart]) / referenceTidal - 1)).toBeLessThan(1e-10);
      }
    }
  });

  it('is not a tautology: the four charts genuinely disagree about the COORDINATES', () => {
    // If the coordinates were all the same, the agreement above would mean nothing.
    for (const tau of [3, 11, 14]) {
      const radius = radiusAtProperTime(tau);
      const values = [
        schwarzschildTime(radius),
        gullstrandPainleveTime(radius),
        eddingtonFinkelsteinV(radius),
        kruskal(radius).X,
      ];
      const distinct = new Set(values.map(value => value.toFixed(4)));
      expect(distinct.size).toBe(4);
    }
  });
});

describe('comparing at the same coordinate VALUE is the wrong comparison', () => {
  // Asserted so that a refactor which quietly starts comparing coordinate values instead of
  // events fails loudly rather than passing for the wrong reason. PHYSICS_SPEC §7.4.
  const COORDINATE_VALUE = 13;

  it('lands on three different events, at 3.5339, 2.1386 and 6.4395 r_s', () => {
    expect(radiusFromSchwarzschildTime(COORDINATE_VALUE)).toBeCloseTo(3.5339, 3);
    expect(radiusAtProperTime(COORDINATE_VALUE)).toBeCloseTo(2.1386, 3);
    expect(radiusFromEddingtonV(COORDINATE_VALUE)).toBeCloseTo(6.4395, 3);
  });

  it('makes the Kretschmann scalars differ by a factor of 745', () => {
    const values = [
      kretschmann(radiusFromSchwarzschildTime(COORDINATE_VALUE)),
      kretschmann(radiusAtProperTime(COORDINATE_VALUE)),
      kretschmann(radiusFromEddingtonV(COORDINATE_VALUE)),
    ];
    expect(Math.max(...values) / Math.min(...values)).toBeCloseTo(745.4, 0);
  });
});

describe('the invariants themselves', () => {
  it('gives K = 12 and tidal = -1 at the horizon, in these units', () => {
    expect(kretschmann(HORIZON)).toBeCloseTo(12, 12);
    expect(radialTidal(HORIZON)).toBeCloseTo(-1, 12);
    expect(MASS).toBe(0.5);
  });

  it('falls as r^-6 and r^-3, asserted as scaling laws at several radii', () => {
    // Checked away from r = r_s, where every power gives the same answer.
    for (const radius of [1.5, 2, 4, 10]) {
      expect(kretschmann(radius) / kretschmann(radius * 2)).toBeCloseTo(64, 6);
      expect(radialTidal(radius) / radialTidal(radius * 2)).toBeCloseTo(8, 9);
    }
  });

  it('is finite at the horizon and divergent only at the centre', () => {
    // No coordinate choice removes it, and no uniform-expansion story produces it at all.
    expect(Number.isFinite(kretschmann(HORIZON))).toBe(true);
    expect(Number.isFinite(radialTidal(HORIZON))).toBe(true);
    expect(kretschmann(1e-3)).toBeGreaterThan(1e15);
    expect(() => kretschmann(0)).toThrow(RangeError);
    expect(() => radialTidal(-1)).toThrow(RangeError);
  });
});

describe('domain guards', () => {
  it('rejects a start inside the horizon and a radius off the trajectory', () => {
    expect(() => properTime(1, 0.5)).toThrow(RangeError);
    expect(() => properTime(1, HORIZON)).toThrow(RangeError);
    expect(() => properTime(9, 8)).toThrow(RangeError);
    expect(() => properTime(-1, 8)).toThrow(RangeError);
    expect(() => radiusAtProperTime(1e6)).toThrow(RangeError);
    expect(() => tortoise(0)).toThrow(RangeError);
  });
});
