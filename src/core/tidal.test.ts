import { describe, expect, it } from 'vitest';
import {
  horizonRadiusMetres,
  jacobiAcceleration,
  spaghettificationCrossoverMass,
  spaghettificationRadius,
  spaghettificationRatio,
  tidalEigenvalues,
  tidalStrength,
  traceResidual,
  wronskian,
} from './tidal';
import { RHO_STEEL, SIGMA_STEEL, SOLAR_MASS } from './units';
import { createYoshida4 } from './integrators/symplectic';
import { properTime, radiusAtProperTime } from './infall';

describe('the tidal eigenvalues', () => {
  it('gives −1/108M² at the ISCO', () => {
    const { radial, transverse } = tidalEigenvalues(6);
    expect(radial).toBeCloseTo(-1 / 108, 15);
    expect(transverse).toBeCloseTo(1 / 216, 15);
  });

  it('gives −2/27M² at the photon sphere', () => {
    expect(tidalEigenvalues(3).radial).toBeCloseTo(-2 / 27, 15);
  });

  it('is trace-free at every radius, to machine precision', () => {
    // Schwarzschild is a vacuum solution: Ricci vanishes, so the tidal tensor is pure Weyl and
    // its trace is identically zero. A body in free fall is distorted, never compressed overall.
    for (const radius of [3, 6, 10, 100, 1e6]) {
      expect(Math.abs(traceResidual(radius)), `r = ${radius}`).toBeLessThan(1e-14);
    }
    for (const mass of [0.5, 1, 1e6]) {
      expect(Math.abs(traceResidual(7, mass))).toBeLessThan(1e-14);
    }
  });

  it('falls off as 1/r³ and diverges only at the centre', () => {
    expect(tidalEigenvalues(10).radial / tidalEigenvalues(20).radial).toBeCloseTo(8, 12);
    // Perfectly finite at the horizon: nothing special happens there.
    expect(Number.isFinite(tidalEigenvalues(2).radial)).toBe(true);
    expect(() => tidalEigenvalues(0)).toThrow(RangeError);
  });

  it('has Frobenius norm √6 M/r³', () => {
    expect(tidalStrength(4)).toBeCloseTo(Math.sqrt(6) / 64, 14);
  });
});

describe('the sign the Jacobi equation supplies', () => {
  it('STRETCHES radially and SQUEEZES transversally', () => {
    // The minus sign in D²ξ/dτ² = −Eξ is the whole physics. E_rr is negative, so the radial
    // acceleration is positive and a radial separation grows; E_⊥⊥ is positive, so a transverse
    // one shrinks. That is spaghettification, and dropping the sign inverts both.
    const acceleration = jacobiAcceleration({ radial: 1, transverse: 1 }, 6);
    expect(acceleration.radial).toBeGreaterThan(0);
    expect(acceleration.transverse).toBeLessThan(0);
    expect(acceleration.radial).toBeCloseTo(2 / 216, 15);
    expect(acceleration.transverse).toBeCloseTo(-1 / 216, 15);
    // And the two are in the ratio −2, which is the trace-free condition again.
    expect(acceleration.radial / acceleration.transverse).toBeCloseTo(-2, 12);
  });

  it('scales linearly with the separation, as a linear equation must', () => {
    const one = jacobiAcceleration({ radial: 1, transverse: 1 }, 5);
    const three = jacobiAcceleration({ radial: 3, transverse: 3 }, 5);
    expect(three.radial).toBeCloseTo(3 * one.radial, 15);
  });
});

/** Integrate ξ'' = −E(r(τ))ξ along a real infall, as the sim does. r_s = 1, so M = 1/2. */
function integrate(
  startRadius: number, steps: number, initial: number, initialRate: number, floor = 0.5,
) {
  const MASS = 0.5;
  const total = properTime(floor, startRadius);
  const step = total / steps;
  const stepper = createYoshida4(2);
  const q = Float64Array.from([initial, initial]);
  const v = Float64Array.from([initialRate, initialRate]);
  let tau = 0;
  const history: { radius: number; radial: number; transverse: number }[] = [];
  for (let i = 0; i < steps; i++) {
    const radius = Math.max(radiusAtProperTime(tau, startRadius), floor);
    const eigen = tidalEigenvalues(radius, MASS);
    stepper.step(q, v, step, (position, out) => {
      out[0] = -eigen.radial * position[0]!;
      out[1] = -eigen.transverse * position[1]!;
    });
    tau += step;
    history.push({ radius, radial: q[0]!, transverse: q[1]! });
  }
  return { q, v, history, total };
}

describe('integrating the deviation along a real infall', () => {
  it('stretches the radial separation and shrinks the transverse one', () => {
    const { q } = integrate(8, 20000, 1, 0);
    expect(q[0]!).toBeGreaterThan(1.5);
    expect(q[1]!).toBeLessThan(0.7);
  });

  it('conserves the Wronskian of two independent solutions', () => {
    // The exact invariant of ξ'' = −E(τ)ξ, by Abel's identity: no first-derivative term means
    // dW/dτ = 0. This is what an integrator on this system should be judged by.
    //
    // Down to r = 0.5 r_s, which is where the fixed step still resolves the tidal timescale.
    // E goes as 1/r³, so 1/√|E| collapses towards r = 0: at the 1e-4 r_s the fall would
    // otherwise reach, √|E|·h is about 750 and no fixed-step scheme conserves anything. That is
    // a statement about the singularity, not about Yoshida-4, and the sim stops short for the
    // same reason.
    const steps = 20000;
    const a = integrate(8, steps, 1, 0);
    const b = integrate(8, steps, 0, 1);
    for (const axis of [0, 1] as const) {
      const start = wronskian({ value: 1, rate: 0 }, { value: 0, rate: 1 });
      const end = wronskian(
        { value: a.q[axis]!, rate: a.v[axis]! },
        { value: b.q[axis]!, rate: b.v[axis]! },
      );
      expect(start).toBe(1);
      expect(Math.abs((end - start) / start), `axis ${axis}`).toBeLessThan(1e-10);
    }
  });

  it('does NOT conserve the area of the drawn ellipse', () => {
    // Worth asserting because it is the natural thing to assume and it is false. The 2D area
    // ξ_r ξ_⊥ grows by about 40% over a fall from 8 r_s: (ln A)″ starts at +M/r³, not zero.
    const { q } = integrate(8, 20000, 1, 0);
    const area = q[0]! * q[1]!;
    expect(area).toBeGreaterThan(1.2);
  });

  it('focuses the 3-volume, as Raychaudhuri requires', () => {
    // The trace-free condition makes the volume STATIONARY at τ = 0, not constant. After that
    // the shear terms are strictly negative, so ξ_r ξ_⊥² can only fall. That is the focusing
    // theorem, and it is the correct statement of "what is conserved here".
    const { history, q } = integrate(8, 20000, 1, 0);
    const volume = q[0]! * q[1]! ** 2;
    expect(volume).toBeLessThan(1);
    let previous = Infinity;
    for (const sample of history.filter((_, i) => i % 500 === 0)) {
      const current = sample.radial * sample.transverse ** 2;
      expect(current).toBeLessThanOrEqual(previous + 1e-9);
      previous = current;
    }
  });
});

describe('spaghettification', () => {
  it('is a length, which the (2ML/σ/ρ)^{1/3} form is not', () => {
    // σ = ρ(GM/r³)L² gives r = (G M ρ L²/σ)^{1/3}: L SQUARED, and ρ in the numerator.
    const radius = spaghettificationRadius(10 * SOLAR_MASS, 1);
    expect(radius / 1e3).toBeCloseTo(295.8, 0);
    // Doubling the body's length pushes the tearing radius out by 2^{2/3}, not by 2^{1/3}.
    expect(spaghettificationRadius(10 * SOLAR_MASS, 2) / radius).toBeCloseTo(Math.cbrt(4), 9);
    // A denser body tears further out; a stronger one survives closer in.
    expect(spaghettificationRadius(10 * SOLAR_MASS, 1, RHO_STEEL * 8)).toBeGreaterThan(radius);
    expect(spaghettificationRadius(10 * SOLAR_MASS, 1, RHO_STEEL, SIGMA_STEEL * 8))
      .toBeLessThan(radius);
  });

  it('happens outside the horizon for a stellar-mass hole', () => {
    // A 10 M☉ hole tears a 1 m steel rod at ten Schwarzschild radii — well before the crossing,
    // not after it.
    expect(spaghettificationRatio(10 * SOLAR_MASS, 1)).toBeCloseTo(10.02, 1);
    expect(spaghettificationRatio(0.1 * SOLAR_MASS, 1)).toBeGreaterThan(1);
  });

  it('happens inside the horizon for a supermassive one', () => {
    expect(spaghettificationRatio(1e6 * SOLAR_MASS, 1)).toBeLessThan(1);
    expect(spaghettificationRatio(1e9 * SOLAR_MASS, 1)).toBeLessThan(1e-3);
  });

  it('crosses over at 317 M☉ for a one-metre steel rod, scaling as M^{-2/3}', () => {
    const crossover = spaghettificationCrossoverMass(1);
    expect(crossover / SOLAR_MASS).toBeCloseTo(317, 0);
    expect(spaghettificationRatio(crossover, 1)).toBeCloseTo(1, 9);
    // The ratio's scaling, which is why the crossover exists at all.
    const ratio = (mass: number) => spaghettificationRatio(mass * SOLAR_MASS, 1);
    expect(ratio(10) / ratio(1000)).toBeCloseTo(100 ** (2 / 3), 6);
  });

  it('refuses a body with no size, rather than returning zero', () => {
    expect(() => spaghettificationRadius(SOLAR_MASS, 0)).toThrow(RangeError);
    expect(() => spaghettificationRadius(0, 1)).toThrow(RangeError);
  });

  it('agrees with the Schwarzschild radius in metres', () => {
    expect(horizonRadiusMetres(SOLAR_MASS) / 1e3).toBeCloseTo(2.953, 3);
  });
});
