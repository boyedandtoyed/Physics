import { describe, expect, it } from 'vitest';
import {
  EQUATORIAL_ERGOSPHERE_RADIUS,
  SHADOW_VERTICAL_HALF_EXTENT,
  bardeenEta,
  bardeenEtaUnfactored,
  bardeenXi,
  bisect,
  delta,
  ergosphereRadius,
  horizonAngularVelocity,
  horizonRadii,
  insideErgosphere,
  iscoRadius,
  lapse,
  maximise,
  omegaVarpi,
  omegaZamo,
  penroseMaxEfficiency,
  penroseSplit,
  photonOrbitCubic,
  photonOrbitRadius,
  polarPhotonOrbitCubic,
  shadowBoundary,
  shadowExtent,
} from './kerr';

const SPINS = [0.1, 0.3, 0.5, 0.7, 0.9, 0.99, 0.998] as const;

describe('horizons and the ergosphere', () => {
  it('gives r± = M ± √(M²−a²), with Δ vanishing at both', () => {
    for (const spin of SPINS) {
      const { outer, inner } = horizonRadii(spin);
      expect(delta(outer, spin)).toBeCloseTo(0, 12);
      expect(delta(inner, spin)).toBeCloseTo(0, 12);
      expect(outer).toBeGreaterThan(inner);
    }
  });

  it('reduces to the Schwarzschild horizon at 2M when the spin is zero', () => {
    expect(horizonRadii(0).outer).toBe(2);
    expect(horizonRadii(0).inner).toBe(0);
  });

  it('refuses a = M, which is extremal and singular, and refuses a > M outright', () => {
    expect(() => horizonRadii(1)).toThrow(RangeError);
    expect(() => horizonRadii(1.2)).toThrow(RangeError);
    expect(() => horizonRadii(-0.1)).toThrow(RangeError);
  });

  it('puts the ergosphere at exactly 2M on the equator, at EVERY spin', () => {
    // The single most-often-drawn-wrongly fact about the ergosphere: it does not shrink towards
    // the horizon as the hole spins up. Only the polar extent moves.
    for (const spin of SPINS) {
      expect(ergosphereRadius(spin, Math.PI / 2)).toBeCloseTo(EQUATORIAL_ERGOSPHERE_RADIUS, 12);
    }
  });

  it('touches the horizon at the poles, so the ergosphere is empty at a = 0', () => {
    for (const spin of SPINS) {
      expect(ergosphereRadius(spin, 0)).toBeCloseTo(horizonRadii(spin).outer, 12);
    }
    expect(ergosphereRadius(0, Math.PI / 2)).toBe(2);
    expect(ergosphereRadius(0, 0)).toBe(2);
  });

  it('encloses the horizon everywhere except at the poles', () => {
    for (const spin of SPINS) {
      for (const theta of [0.2, 0.6, 1.0, Math.PI / 2]) {
        expect(ergosphereRadius(spin, theta)).toBeGreaterThan(horizonRadii(spin).outer);
      }
    }
  });

  it('recovers the same 2M from the lapse crossing the drag term, by a different route', () => {
    // alpha = omega*varpi is the static limit. The functions are built from different
    // expressions, so agreeing here is a real check and not the same algebra twice.
    for (const spin of SPINS) {
      expect(lapse(2, spin)).toBeCloseTo(omegaVarpi(2, spin), 12);
      expect(insideErgosphere(2.0001, spin)).toBe(false);
      expect(insideErgosphere(1.999, spin)).toBe(spin > 0);
    }
  });
});

describe('frame dragging', () => {
  it('makes ω(r₊) equal Ω_H, in all three published forms', () => {
    for (const spin of SPINS) {
      const { outer } = horizonRadii(spin);
      const fromField = omegaZamo(outer, spin);
      expect(fromField).toBeCloseTo(horizonAngularVelocity(spin), 15);
      expect(fromField).toBeCloseTo(spin / (outer * outer + spin * spin), 15);
    }
  });

  it('falls off as 2Ma/r³, so halving the radius multiplies ω by eight', () => {
    for (const spin of SPINS) {
      expect(omegaZamo(500, spin) / omegaZamo(1000, spin)).toBeCloseTo(8, 3);
      expect(omegaZamo(1e8, spin)).toBeLessThan(1e-20);
      expect(omegaZamo(1e8, spin)).toBeGreaterThan(0);
    }
  });

  it('is exactly zero at every radius when the hole is not spinning', () => {
    for (const radius of [2.5, 10, 1000]) expect(omegaZamo(radius, 0)).toBe(0);
  });

  it('rises monotonically inward, so no radius drags less than one outside it', () => {
    for (const spin of SPINS) {
      const { outer } = horizonRadii(spin);
      let previous = 0;
      for (let i = 200; i >= 1; i--) {
        const radius = outer + ((40 - outer) * i) / 200;
        const omega = omegaZamo(radius, spin);
        expect(omega).toBeGreaterThan(previous);
        previous = omega;
      }
    }
  });
});

describe('photon orbits', () => {
  it('satisfies its own cubic, which is checked against Teo rather than against itself', () => {
    for (const spin of [0, ...SPINS]) {
      for (const sense of ['prograde', 'retrograde'] as const) {
        expect(photonOrbitCubic(photonOrbitRadius(spin, sense), spin)).toBeCloseTo(0, 9);
      }
    }
  });

  it('brackets 3M: prograde in [M, 3M], retrograde in [3M, 4M]', () => {
    for (const spin of SPINS) {
      const pro = photonOrbitRadius(spin, 'prograde');
      const retro = photonOrbitRadius(spin, 'retrograde');
      expect(pro).toBeGreaterThanOrEqual(1);
      expect(pro).toBeLessThanOrEqual(3);
      expect(retro).toBeGreaterThanOrEqual(3);
      expect(retro).toBeLessThanOrEqual(4);
    }
    expect(photonOrbitRadius(0, 'prograde')).toBeCloseTo(3, 12);
    expect(photonOrbitRadius(0, 'retrograde')).toBeCloseTo(3, 12);
  });

  it('gives 2.347296355 M prograde and 3.532088886 M retrograde at a/M = 0.5', () => {
    expect(photonOrbitRadius(0.5, 'prograde')).toBeCloseTo(2.347296355, 9);
    expect(photonOrbitRadius(0.5, 'retrograde')).toBeCloseTo(3.532088886, 9);
  });

  it('is NOT the polar orbit, though the two cubics agree at both endpoints', () => {
    // This is the substitution PHYSICS_SPEC §3.4b records. It survives every endpoint check.
    expect(bisect(r => polarPhotonOrbitCubic(r, 0), 2, 4)).toBeCloseTo(3, 9);
    const polarHalf = bisect(r => polarPhotonOrbitCubic(r, 0.5), 2, 3);
    expect(polarHalf).toBeCloseTo(2.883217742, 8);
    // ...and ξ vanishes there, which is what that cubic actually means.
    expect(bardeenXi(polarHalf, 0.5)).toBeCloseTo(0, 9);
    // ...23% away from the prograde equatorial orbit.
    const equatorial = photonOrbitRadius(0.5, 'prograde');
    expect(Math.abs(polarHalf - equatorial) / equatorial).toBeCloseTo(0.2284, 3);
  });
});

describe('the ISCO against spin', () => {
  it('hits the three endpoints BPT is quoted for', () => {
    expect(iscoRadius(0)).toBeCloseTo(6, 9);
    expect(iscoRadius(0, 'retrograde')).toBeCloseTo(6, 9);
    expect(iscoRadius(0.999999, 'retrograde')).toBeCloseTo(9, 4);
    // The prograde branch approaches M only as (1−a²)^(1/6), so a fixed tolerance at one spin
    // would be a statement about how close to extremal that spin is. The approach is asserted.
    expect(iscoRadius(0.999999)).toBeCloseTo(1, 1);
    expect(iscoRadius(0.999999999999)).toBeCloseTo(1, 3);
    expect(iscoRadius(0.999999999999)).toBeGreaterThan(1);
  });

  it('moves inward with prograde spin and outward with retrograde spin, monotonically', () => {
    let prograde = iscoRadius(0);
    let retrograde = iscoRadius(0, 'retrograde');
    for (let i = 1; i <= 200; i++) {
      const spin = (0.998 * i) / 200;
      const next = iscoRadius(spin);
      const nextRetro = iscoRadius(spin, 'retrograde');
      expect(next).toBeLessThan(prograde);
      expect(nextRetro).toBeGreaterThan(retrograde);
      prograde = next;
      retrograde = nextRetro;
    }
  });

  it('always sits outside the horizon and outside the prograde photon orbit', () => {
    for (const spin of SPINS) {
      expect(iscoRadius(spin)).toBeGreaterThan(horizonRadii(spin).outer);
      expect(iscoRadius(spin)).toBeGreaterThan(photonOrbitRadius(spin, 'prograde'));
    }
  });
});

describe('the shadow', () => {
  it('reaches |β| = 3√3 M at EVERY spin, because η(3M) = 27M² identically', () => {
    for (const spin of SPINS) {
      expect(bardeenEta(3, spin)).toBeCloseTo(27, 9);
      expect(Math.sqrt(bardeenEta(3, spin))).toBeCloseTo(SHADOW_VERTICAL_HALF_EXTENT, 9);
    }
  });

  it('maximises η at exactly r = 3M — found numerically, not asserted', () => {
    for (const spin of SPINS) {
      const at = maximise(
        r => bardeenEta(r, spin),
        photonOrbitRadius(spin, 'prograde'),
        photonOrbitRadius(spin, 'retrograde'),
      );
      expect(at).toBeCloseTo(3, 6);
    }
  });

  it('puts that extremum at α = +2a exactly, so the displacement is linear in the spin', () => {
    for (const spin of SPINS) expect(-bardeenXi(3, spin)).toBeCloseTo(2 * spin, 9);
  });

  it('spans Bardeen’s own [−2M, +7M] as the spin approaches extremal', () => {
    expect(shadowExtent(0.9999999).max).toBeCloseTo(7, 5);
    // The prograde edge reaches −2M only as −√3·√(M²−a²), so the RATE is what is asserted: a
    // tolerance at one spin would only be saying how close to extremal that spin is.
    for (const spin of [0.99999, 0.9999999]) {
      const error = shadowExtent(spin).min + 2;
      expect(error / Math.sqrt(1 - spin * spin)).toBeCloseTo(-Math.sqrt(3), 2);
    }
  });

  it('spans [−2.110888, +6.996666] M at a/M = 0.998, displaced by +2.442889 M', () => {
    const extent = shadowExtent(0.998);
    expect(extent.min).toBeCloseTo(-2.110888, 5);
    expect(extent.max).toBeCloseTo(6.996666, 5);
    expect(extent.midpoint).toBeCloseTo(2.442889, 5);
    expect(extent.midpoint).toBeGreaterThan(0);
  });

  it('is not displaced without spin, and the displacement vanishes linearly with a', () => {
    expect(shadowExtent(0).midpoint).toBe(0);
    for (const spin of [0.02, 0.01, 0.005]) {
      expect(shadowExtent(spin).midpoint / spin).toBeCloseTo(2, 1);
    }
  });

  it('closes on the α axis at both ends, where the equatorial photon orbits are', () => {
    for (const spin of SPINS) {
      const points = shadowBoundary(spin, Math.PI / 2, 601);
      expect(points).toHaveLength(601);
      // The endpoints are the equatorial photon orbits and β is exactly zero at both. They used
      // to be dropped by a `>= 0` test against a 1e-33 rounding residue, which left the closed
      // curve open at each end.
      expect(points[0]!.beta).toBe(0);
      expect(points[points.length - 1]!.beta).toBe(0);
      expect(points[0]!.radius).toBeCloseTo(photonOrbitRadius(spin, 'prograde'), 12);
      expect(points[600]!.radius).toBeCloseTo(photonOrbitRadius(spin, 'retrograde'), 12);
      const betas = points.map(p => p.beta);
      expect(Math.max(...betas)).toBeCloseTo(SHADOW_VERTICAL_HALF_EXTENT, 3);
    }
  });

  it('draws without a notch at the cusps, where β goes as √(r−r₁)', () => {
    // Uniform spacing in r put the first sample 0.42 M up a vertical cusp. Chebyshev spacing
    // clusters samples at both ends; the test is on the drawn polyline, not on the spacing rule.
    for (const spin of SPINS) {
      const points = shadowBoundary(spin, Math.PI / 2, 601);
      let longest = 0;
      for (let i = 1; i < points.length; i++) {
        longest = Math.max(longest, Math.hypot(
          points[i]!.alpha - points[i - 1]!.alpha, points[i]!.beta - points[i - 1]!.beta,
        ));
      }
      expect(longest, `a/M = ${spin} has a ${longest.toFixed(3)} M gap in the outline`)
        .toBeLessThan(0.08);
    }
  });

  it('does not lose the boundary to cancellation at small spin, as the literal η does', () => {
    // Bardeen's bracket 4Δ − r(r−M)² is minus the photon-orbit cubic, so it vanishes at both
    // ends of the sampled range. Evaluated literally at a/M = 0.1 the two terms are ≈10.225 and
    // differ by 2e-4, and the a² underneath multiplies that error by a hundred: the boundary
    // came back with β = 0.42 M at a point where β is exactly zero.
    const spin = 0.1;
    const inner = photonOrbitRadius(spin, 'prograde');
    // Exactly zero, not nearly: the factored form has the root in it.
    expect(bardeenEta(inner, spin)).toBe(0);
    expect(bardeenEtaUnfactored(inner, spin)).not.toBe(0);
    // Away from the ends, where there is no cancellation, the two agree — so the factored form
    // is the same function and not a different one.
    for (const radius of [2.95, 3, 3.05]) {
      expect(bardeenEta(radius, spin)).toBeCloseTo(bardeenEtaUnfactored(radius, spin), 6);
    }
  });

  it('is the exact Schwarzschild circle at a = 0, not a limit taken by dividing by a²', () => {
    expect(() => bardeenEta(3, 0)).toThrow(RangeError);
    for (const point of shadowBoundary(0, Math.PI / 2, 128)) {
      expect(Math.hypot(point.alpha, point.beta)).toBeCloseTo(3 * Math.sqrt(3), 12);
    }
  });

  it('narrows horizontally with spin while keeping its vertical extent', () => {
    let width = Number.POSITIVE_INFINITY;
    for (const spin of [0.1, 0.3, 0.5, 0.7, 0.9, 0.998]) {
      const extent = shadowExtent(spin);
      const next = extent.max - extent.min;
      expect(next).toBeLessThan(width);
      width = next;
      expect(Math.sqrt(bardeenEta(3, spin))).toBeCloseTo(SHADOW_VERTICAL_HALF_EXTENT, 9);
    }
  });
});

describe('the Penrose process', () => {
  it('gives ½(√2 − 1) = 0.20710678 at extremality, and not 1 − 1/√2', () => {
    expect(penroseMaxEfficiency(0.99999999999)).toBeCloseTo((Math.SQRT2 - 1) / 2, 5);
    expect((Math.SQRT2 - 1) / 2).toBeCloseTo(0.20710678118654757, 15);
    // The substitution that would pass a "≈20%" eyeball check and is 41% wrong.
    expect(Math.abs((1 - 1 / Math.SQRT2) - (Math.SQRT2 - 1) / 2)).toBeGreaterThan(0.08);
  });

  it('is exactly zero without an ergosphere', () => {
    expect(penroseMaxEfficiency(0)).toBe(0);
  });

  it('matches the published intermediate values, generated from the closed form', () => {
    expect(penroseMaxEfficiency(0.5)).toBeCloseTo(0.017638090, 8);
    expect(penroseMaxEfficiency(0.9)).toBeCloseTo(0.090098394, 8);
    expect(penroseMaxEfficiency(0.998)).toBeCloseTo(0.185763988, 8);
  });

  it('rises monotonically with spin', () => {
    let previous = -1;
    for (let i = 0; i <= 200; i++) {
      const value = penroseMaxEfficiency((0.998 * i) / 200);
      expect(value).toBeGreaterThan(previous);
      previous = value;
    }
  });

  it('derives that maximum from the LNRF split, rather than asserting it against itself', () => {
    for (const spin of [0.5, 0.9, 0.998]) {
      const { outer } = horizonRadii(spin);
      const split = penroseSplit(outer * (1 + 1e-9), spin);
      expect(split.gain).toBeCloseTo(penroseMaxEfficiency(spin), 5);
      // The whole mechanism in one line: the gain IS the other fragment's negative energy.
      expect(split.plungingEnergy).toBeCloseTo(-split.gain, 9);
      expect(split.escapingEnergy).toBeGreaterThan(1);
      expect(split.plungingEnergy).toBeLessThan(0);
    }
  });

  it('gains exactly nothing at the static limit, which is where the ergosphere ends', () => {
    for (const spin of [0.3, 0.5, 0.9, 0.998]) {
      const split = penroseSplit(2, spin);
      expect(split.gain).toBeCloseTo(0, 9);
      expect(split.plungingEnergy).toBeCloseTo(0, 9);
      expect(split.escapingEnergy).toBeCloseTo(1, 9);
    }
  });

  it('never exceeds the maximum for its spin, at any radius in the ergosphere', () => {
    for (const spin of [0.2, 0.5, 0.9, 0.998]) {
      const cap = penroseMaxEfficiency(spin);
      const { outer } = horizonRadii(spin);
      for (let i = 0; i <= 400; i++) {
        const radius = outer + ((2 - outer) * i) / 400;
        if (radius <= outer) continue;
        const split = penroseSplit(radius, spin);
        expect(split.gain).toBeLessThanOrEqual(cap + 1e-9);
        expect(split.gain).toBeGreaterThanOrEqual(-1e-9);
        // Energy conservation, asserted on every sample rather than assumed.
        expect(split.plungingEnergy + split.escapingEnergy).toBeCloseTo(1, 9);
      }
    }
  });

  it('falls monotonically as the split moves out towards the static limit', () => {
    const spin = 0.9;
    const { outer } = horizonRadii(spin);
    let previous = Number.POSITIVE_INFINITY;
    for (let i = 1; i <= 200; i++) {
      const radius = outer + ((2 - outer) * i) / 200;
      const { gain } = penroseSplit(radius, spin);
      expect(gain).toBeLessThan(previous);
      previous = gain;
    }
  });

  it('refuses a split at or inside the horizon rather than returning a number', () => {
    const { outer } = horizonRadii(0.9);
    expect(() => penroseSplit(outer, 0.9)).toThrow(RangeError);
    expect(() => penroseSplit(outer * 0.9, 0.9)).toThrow(RangeError);
  });
});
