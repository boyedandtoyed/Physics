import { describe, expect, it } from 'vitest';
import {
  axialAngularMomentum,
  hamiltonian,
  kerrSchildRadius,
  launchPhoton,
  rayRates,
  rk4Step,
  sampleMetric,
  traceRay,
  type RayState,
  type Vec3,
} from './kerrSchild';
import { SHADOW_VERTICAL_HALF_EXTENT, horizonRadii, shadowExtent } from './kerr';

const SPINS = [0, 0.3, 0.5, 0.9, 0.998] as const;
const POINTS: Vec3[] = [
  { x: 5, y: 0, z: 0 },
  { x: 0, y: 0, z: 7 },
  { x: 3, y: -4, z: 2 },
  { x: -1.7, y: 0.9, z: -3.2 },
  { x: 0.3, y: 0.2, z: 0.1 },
  { x: 40, y: 12, z: -25 },
];

describe('the implicit Kerr–Schild radius', () => {
  it('solves its own defining equation everywhere', () => {
    for (const spin of SPINS) {
      for (const p of POINTS) {
        const r = kerrSchildRadius(p, spin);
        const residual = r ** 4 - (p.x * p.x + p.y * p.y + p.z * p.z - spin * spin) * r * r
          - spin * spin * p.z * p.z;
        expect(Math.abs(residual) / Math.max(1, r ** 4)).toBeLessThan(1e-13);
      }
    }
  });

  it('satisfies the oblate-spheroid form too', () => {
    for (const spin of [0.3, 0.9, 0.998]) {
      for (const p of POINTS) {
        const r = kerrSchildRadius(p, spin);
        expect((p.x * p.x + p.y * p.y) / (r * r + spin * spin) + (p.z * p.z) / (r * r))
          .toBeCloseTo(1, 10);
      }
    }
  });

  it('is the ordinary radius when the hole is not spinning', () => {
    for (const p of POINTS) {
      expect(kerrSchildRadius(p, 0)).toBeCloseTo(Math.hypot(p.x, p.y, p.z), 12);
    }
  });

  it('keeps the z dependence far out, where the naive quadratic root loses it', () => {
    // R² ≫ a² makes ½[(R²−a²) + √((R²−a²)²+4a²z²)] a subtraction of nearly equal numbers on the
    // other branch; getting it wrong turns the oblate spheroid into a sphere, which is Kerr
    // silently becoming Schwarzschild far from the hole.
    const spin = 0.9;
    const onAxis = kerrSchildRadius({ x: 0, y: 0, z: 1000 }, spin);
    const inPlane = kerrSchildRadius({ x: 1000, y: 0, z: 0 }, spin);
    expect(onAxis).toBeCloseTo(1000, 9);
    // In the equatorial plane r² = R² − a², so r is smaller by a²/2R.
    expect(inPlane).toBeCloseTo(Math.sqrt(1000 * 1000 - spin * spin), 9);
    expect(onAxis - inPlane).toBeGreaterThan(1e-4);
  });
});

describe('the null vector and the metric', () => {
  it('keeps k null in the flat background, which is what makes the inverse exact', () => {
    for (const spin of SPINS) {
      for (const p of POINTS) {
        const { k } = sampleMetric(p, spin);
        expect(k.x * k.x + k.y * k.y + k.z * k.z).toBeCloseTo(1, 10);
      }
    }
  });

  it('inverts: g^{μα} g_{αν} = δ^μ_ν', () => {
    for (const spin of [0.3, 0.9]) {
      for (const p of POINTS) {
        const { h, k } = sampleMetric(p, spin);
        const kLower = [1, k.x, k.y, k.z];
        const kUpper = [-1, k.x, k.y, k.z];
        const eta = [-1, 1, 1, 1];
        for (let mu = 0; mu < 4; mu++) {
          for (let nu = 0; nu < 4; nu++) {
            let sum = 0;
            for (let alpha = 0; alpha < 4; alpha++) {
              const up = (mu === alpha ? eta[mu]! : 0) - 2 * h * kUpper[mu]! * kUpper[alpha]!;
              const down = (alpha === nu ? eta[nu]! : 0) + 2 * h * kLower[alpha]! * kLower[nu]!;
              sum += up * down;
            }
            expect(sum).toBeCloseTo(mu === nu ? 1 : 0, 9);
          }
        }
      }
    }
  });

  it('has the analytic gradients the shader needs, checked against central differences', () => {
    const step = 1e-5;
    for (const spin of [0.3, 0.9]) {
      for (const p of POINTS) {
        const sample = sampleMetric(p, spin);
        const axes = ['x', 'y', 'z'] as const;
        axes.forEach((axis, index) => {
          const forward = sampleMetric({ ...p, [axis]: p[axis] + step }, spin);
          const back = sampleMetric({ ...p, [axis]: p[axis] - step }, spin);
          const scale = Math.max(1e-6, Math.abs(sample.gradH[axis]));
          expect(Math.abs((forward.h - back.h) / (2 * step) - sample.gradH[index === 0 ? 'x' : index === 1 ? 'y' : 'z']))
            .toBeLessThan(1e-5 * Math.max(1, scale * 1e3));
          for (const component of axes) {
            const numeric = (forward.k[component] - back.k[component]) / (2 * step);
            expect(numeric).toBeCloseTo(sample.gradK[index]![component], 5);
          }
        });
      }
    }
  });
});

/** A photon launched in the equatorial plane, parallel to +ŷ, at image offset `alpha`. */
function equatorialRay(alpha: number, spin: number, distance: number): RayState {
  return launchPhoton({ x: -alpha, y: -distance, z: 0 }, { x: 0, y: 1, z: 0 }, spin);
}

const TRACE = (spin: number, distance: number) => ({
  spin, escapeRadius: distance * 1.5, maxSteps: 40_000, stepFraction: 0.04, maxStep: 20,
});

describe('integrating a photon', () => {
  it('launches exactly null: ℋ = 0 before the first step', () => {
    for (const spin of SPINS) {
      for (const alpha of [-8, -3, 0.5, 4, 11]) {
        const ray = equatorialRay(alpha, spin, 60);
        expect(Math.abs(hamiltonian(ray, spin))).toBeLessThan(1e-14);
      }
    }
  });

  it('is null off the equatorial plane too', () => {
    for (const spin of [0.5, 0.998]) {
      const ray = launchPhoton({ x: 3, y: -50, z: 6 }, { x: 0.05, y: 1, z: -0.2 }, spin);
      expect(Math.abs(hamiltonian(ray, spin))).toBeLessThan(1e-14);
    }
  });

  it('holds ℋ = 0 along the whole integration, which is the error telemetry', () => {
    for (const spin of [0, 0.5, 0.998]) {
      // Outside the shadow at every spin tested: it spans [−5.196, +5.196] at a = 0 and
      // [−2.111, +6.997] at a/M = 0.998, so +6.2 is INSIDE it at high spin and is captured.
      for (const alpha of [-9, -6, 8, 10]) {
        const result = traceRay(equatorialRay(alpha, spin, 400), TRACE(spin, 400));
        expect(result.outcome).toBe('escaped');
        expect(result.hamiltonianDrift, `a=${spin} alpha=${alpha}`).toBeLessThan(1e-7);
      }
    }
  });

  it('converges at fourth order, so the drift is truncation error and not a wrong model', () => {
    // A tolerance alone would pass for any integrator that happens to be small on this ray. The
    // rate is what says the residual is RK4's own truncation: quartering the step must divide
    // the drift by about 256.
    const spin = 0.9;
    const drift = (fraction: number): number => traceRay(
      equatorialRay(8, spin, 400),
      { spin, escapeRadius: 600, maxSteps: 400_000, stepFraction: fraction, maxStep: 20 },
    ).hamiltonianDrift;
    const coarse = drift(0.04);
    const fine = drift(0.01);
    // Not the full 256: `maxStep` caps the far-field steps, which are identical at both
    // fractions, so only the steps near the hole refine.
    expect(coarse / fine).toBeGreaterThan(60);
    expect(fine).toBeLessThan(1e-7);
  });

  it('conserves E exactly and L_z to integration error', () => {
    for (const spin of [0.3, 0.9]) {
      let state = equatorialRay(7, spin, 80);
      const lz = axialAngularMomentum(state);
      const energy = state.energy;
      for (let step = 0; step < 4000; step++) {
        if (kerrSchildRadius(state.position, spin) > 200) break;
        state = rk4Step(state, spin, 0.05);
      }
      expect(state.energy).toBe(energy);
      expect(axialAngularMomentum(state)).toBeCloseTo(lz, 6);
    }
  });

  it('straightens out far away exactly as fast as H does, i.e. like M/r', () => {
    // Not "is straight": at 10⁵ M the geometry is still Kerr, and a test that demanded zero
    // deflection would be asserting a flat spacetime that is not there. What must hold is the
    // rate — the transverse rate falls off as 1/r, because H = M r³/(r⁴+a²z²) → M/r.
    const transverse = (distance: number): number => {
      const state = launchPhoton(
        { x: distance, y: -distance, z: 0 }, { x: 0, y: 1, z: 0 }, 0.9,
      );
      const rates = rayRates(state, 0.9);
      expect(rates.position.y).toBeCloseTo(1, 4);
      return Math.abs(rates.position.x);
    };
    const near = transverse(1e4);
    const far = transverse(1e5);
    expect(near / far).toBeCloseTo(10, 1);
    expect(far).toBeLessThan(1e-5);
  });
});

/** Bisect the capture boundary on one side of the shadow, returning that ray's ξ = L_z/E. */
function boundaryXi(spin: number, captured: number, escaped: number, distance = 400): number {
  let inside = captured;
  let outside = escaped;
  for (let step = 0; step < 60; step++) {
    const mid = (inside + outside) / 2;
    const result = traceRay(equatorialRay(mid, spin, distance), TRACE(spin, distance));
    if (result.outcome === 'captured') inside = mid;
    else outside = mid;
  }
  const edge = equatorialRay((inside + outside) / 2, spin, distance);
  return axialAngularMomentum(edge) / -edge.energy;
}

describe('the shadow, measured by integrating rays rather than by a formula', () => {
  it('reproduces b_crit = 3√3 M at a = 0, on the Kerr path', () => {
    // PHYSICS_SPEC §8 row 12 and row 47: the Kerr integrator must hit this on its own, not
    // inherit it from the Schwarzschild raymarcher.
    const left = -boundaryXi(0, -0.5, -9);
    const right = -boundaryXi(0, 0.5, 9);
    expect(Math.abs(left)).toBeCloseTo(SHADOW_VERTICAL_HALF_EXTENT, 2);
    expect(Math.abs(right)).toBeCloseTo(SHADOW_VERTICAL_HALF_EXTENT, 2);
    // The gate PHYSICS_SPEC §8 row 47 states: 0.5%.
    expect(Math.abs(Math.abs(right) / SHADOW_VERTICAL_HALF_EXTENT - 1)).toBeLessThan(0.005);
    expect(Math.abs(Math.abs(left) / SHADOW_VERTICAL_HALF_EXTENT - 1)).toBeLessThan(0.005);
  });

  it('reproduces Bardeen’s analytic extent at a/M = 0.5 and 0.998', () => {
    for (const spin of [0.5, 0.998]) {
      const expected = shadowExtent(spin);
      const min = -boundaryXi(spin, -0.5, -9);
      const max = -boundaryXi(spin, 0.5, 9);
      expect(Math.min(min, max), `a/M=${spin} prograde edge`).toBeCloseTo(expected.min, 2);
      expect(Math.max(min, max), `a/M=${spin} retrograde edge`).toBeCloseTo(expected.max, 2);
    }
  });

  it('displaces the shadow: the measured midpoint is positive and matches 2.44 M at 0.998', () => {
    const min = -boundaryXi(0.998, -0.5, -9);
    const max = -boundaryXi(0.998, 0.5, 9);
    const midpoint = (Math.min(min, max) + Math.max(min, max)) / 2;
    expect(midpoint).toBeGreaterThan(0);
    expect(midpoint).toBeCloseTo(shadowExtent(0.998).midpoint, 2);
  });

  it('is not displaced at all without spin', () => {
    const min = -boundaryXi(0, -0.5, -9);
    const max = -boundaryXi(0, 0.5, 9);
    expect((min + max) / 2).toBeCloseTo(0, 3);
  });

  it('captures everything aimed at the middle and nothing aimed far outside', () => {
    for (const spin of SPINS) {
      const { outer } = horizonRadii(spin);
      expect(traceRay(equatorialRay(0, spin, 200), TRACE(spin, 200)).outcome).toBe('captured');
      expect(traceRay(equatorialRay(40, spin, 200), TRACE(spin, 200)).outcome).toBe('escaped');
      expect(outer).toBeGreaterThan(1);
    }
  });
});
