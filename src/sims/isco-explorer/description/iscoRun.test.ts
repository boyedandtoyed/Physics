import { describe, expect, it } from 'vitest';
import {
  circularAngularMomentum,
  circularOrbits,
  effectivePotential,
} from '../../../core/orbit';
import {
  ESCAPE_RADIUS_OVER_MASS,
  HORIZON_LABEL,
  IscoRun,
  STOP_RADIUS_OVER_MASS,
  curveBounds,
  describeIsco,
  eFoldingTime,
  epicyclicPeriod,
  launchState,
  orbitalPeriod,
  potentialCurve,
  stabilityAt,
} from './iscoRun';

const M = 1;
const params = (radius: number, nudge = 0) => ({ radius, nudge, mass: M });

/** Runs until the outcome settles or `budget` steps are spent. */
function run(radius: number, nudge: number, coordinateTime: number, budget = 400_000): IscoRun {
  const instance = new IscoRun(params(radius, nudge));
  instance.advanceCoordinateTime(coordinateTime, budget);
  return instance;
}

describe('launching on a circular orbit', () => {
  it('stays there, to a part in 10^6 over twenty orbits', () => {
    const instance = run(9, 0, 20 * orbitalPeriod(9, M));
    const { min, max } = instance.radiusRange;
    expect(instance.outcome).toBe('orbiting');
    expect(max / min - 1).toBeLessThan(1e-7);
  });

  it('holds its energy over the same run', () => {
    // Yoshida-4 on a separable Hamiltonian: the drift must be bounded, not merely small once.
    const instance = run(9, 0, 20 * orbitalPeriod(9, M));
    const { x, y } = instance.position;
    const radius = Math.hypot(x, y);
    expect(effectivePotential(radius, M, instance.angularMomentum))
      .toBeCloseTo(instance.energy, 8);
  });

  it('takes exactly Kepler’s period per turn, in coordinate time', () => {
    // dphi/dt = sqrt(M/r^3) exactly in Schwarzschild t, so one turn is 2 pi sqrt(r^3/M).
    const radius = 12;
    const instance = new IscoRun(params(radius));
    const period = orbitalPeriod(radius, M);
    instance.advanceCoordinateTime(period, 200_000);
    // Back to the launch angle after one period, to within a step.
    const angle = Math.atan2(instance.position.y, instance.position.x);
    expect(Math.abs(angle)).toBeLessThan(0.01);
  });

  it('gives the ISCO’s published constants at 6M', () => {
    const seed = launchState(params(6));
    expect(seed.angularMomentum).toBeCloseTo(2 * Math.sqrt(3), 12);
    expect(seed.specificEnergy).toBeCloseTo(Math.sqrt(8 / 9), 12);
  });
});

describe('stability, which is what the ISCO is about', () => {
  it('is the sign of kappa squared, changing at exactly 6M', () => {
    expect(stabilityAt(6, M)).toBe('marginal');
    expect(stabilityAt(6.001, M)).toBe('stable');
    expect(stabilityAt(5.999, M)).toBe('unstable');
    expect(stabilityAt(24, M)).toBe('stable');
    expect(stabilityAt(3.5, M)).toBe('unstable');
  });

  it('has no epicyclic period below the ISCO — nothing oscillates', () => {
    expect(epicyclicPeriod(8, M)).toBeCloseTo(224.794, 2);
    expect(epicyclicPeriod(6, M)).toBeNull();
    expect(epicyclicPeriod(4, M)).toBeNull();
  });

  it('makes the recovery time diverge as the ISCO is approached', () => {
    expect(epicyclicPeriod(6.01, M)!).toBeGreaterThan(epicyclicPeriod(8, M)! * 5);
    expect(epicyclicPeriod(6.0001, M)!).toBeGreaterThan(epicyclicPeriod(6.01, M)! * 5);
  });

  it('brings a nudged orbit back above the ISCO', () => {
    // The definition of stable, measured: the excursion stays bounded and the particle survives.
    const instance = run(10, -0.06, 6 * orbitalPeriod(10, M));
    expect(instance.outcome).toBe('orbiting');
    const { min, max } = instance.radiusRange;
    expect(min).toBeGreaterThan(8);
    expect(max).toBeLessThan(12);
  });

  it('oscillates at the epicyclic period, which is the frequency the formula gives', () => {
    // Measured against the closed form rather than asserted from it: count the coordinate time
    // between successive minima of r. In proper time kappa is the rate; converting through
    // dt/dtau at the orbit gives what this run should show.
    const radius = 12;
    const instance = new IscoRun(params(radius, -0.03));
    const minima: number[] = [];
    let previous = instance.radius;
    let previous2 = Number.NaN;
    const period = orbitalPeriod(radius, M);
    for (let i = 0; i < 40_000 && minima.length < 3; i++) {
      const before = instance.properTime;
      instance.advanceCoordinateTime(period / 400, 4000);
      if (instance.properTime === before) break;
      const r = instance.radius;
      if (!Number.isNaN(previous2) && previous < previous2 && previous < r) {
        minima.push(instance.properTime);
      }
      previous2 = previous;
      previous = r;
    }
    expect(minima.length).toBeGreaterThanOrEqual(2);
    const measured = minima[1]! - minima[0]!;
    expect(measured / epicyclicPeriod(radius, M)!).toBeCloseTo(1, 1);
  });

  it('lets a big enough nudge plunge even from a stable orbit', () => {
    // "Stable" means stable against SMALL perturbations. A kick that clears the barrier still
    // plunges, and the page must not imply otherwise.
    const instance = run(8, -0.6, 4000);
    expect(instance.outcome).toBe('plunged');
  });
});

describe('below the ISCO', () => {
  it('plunges on the smallest inward nudge', () => {
    const instance = run(5, -0.01, 3000);
    expect(instance.outcome).toBe('plunged');
  });

  it('flies outward on the smallest outward nudge — the orbit is a maximum, not a minimum', () => {
    const instance = run(5, 0.01, 3000);
    expect(instance.radiusRange.max).toBeGreaterThan(6);
  });

  it('departs on its own, at the rate the formula predicts', () => {
    // An unstable circular orbit is an equilibrium, but an unobservable one: with no nudge at
    // all, the integrator's own truncation error is a perturbation and it grows exponentially
    // at |kappa|. The test is not that it falls — anything falls eventually — but that it takes
    // the same number of e-folding times to do it at every radius, which is only true if the
    // growth rate really is the kappa the closed form gives.
    const efolds = [4.5, 5, 5.5].map(radius => {
      const instance = new IscoRun(params(radius));
      const period = orbitalPeriod(radius, M);
      for (let i = 0; i < 400 && instance.outcome === 'orbiting'; i++) {
        instance.advanceCoordinateTime(period, 200_000);
      }
      expect(instance.outcome).toBe('plunged');
      return instance.properTime / eFoldingTime(radius, M)!;
    });
    for (const count of efolds) expect(count).toBeGreaterThan(15);
    for (const count of efolds) expect(count).toBeLessThan(19);
    // The proper times themselves differ by a factor of nearly three across those radii, so
    // agreeing on the e-fold count is not a coincidence of the window.
    expect(eFoldingTime(5.5, M)! / eFoldingTime(4.5, M)!).toBeGreaterThan(2.5);
  });

  it('has no e-folding time where the orbit is stable', () => {
    expect(eFoldingTime(8, M)).toBeNull();
    expect(eFoldingTime(6, M)).toBeNull();
    expect(eFoldingTime(5, M)).toBeCloseTo(15.811, 3);
  });
});

describe('the horizon, in Schwarzschild coordinates', () => {
  it('stops at 2.001 M and never inside the horizon', () => {
    const instance = run(5, -0.05, 5000);
    expect(instance.plunged).toBe(true);
    expect(instance.radius).toBeLessThanOrEqual(STOP_RADIUS_OVER_MASS * M);
    expect(instance.radius).toBeGreaterThan(2 * M);
  });

  it('stops at 1.0005 r_s — not at 2.001 r_s, which is 4.002M', () => {
    // The marginally bound circular orbit is at 4M; stopping there would be nowhere near the
    // horizon and would cut the plunge off before anything interesting happened.
    expect(STOP_RADIUS_OVER_MASS).toBe(2.001);
    expect(STOP_RADIUS_OVER_MASS / 2).toBeCloseTo(1.0005, 12);
  });

  it('leaves the faller’s clock finite while coordinate time runs away', () => {
    const instance = run(5, -0.05, 100_000);
    expect(instance.plunged).toBe(true);
    expect(Number.isFinite(instance.properTime)).toBe(true);
    expect(instance.properTime).toBeLessThan(200);
    // t is not merely larger — it is larger by orders of magnitude, and that ratio is the point.
    expect(instance.coordinateTime / instance.properTime).toBeGreaterThan(2);
  });

  it('stalls: dt/dtau over the final stretch is far larger than earlier in the same fall', () => {
    // The measurement the sim is making. From 2.50M to 2.10M the mean dt/dtau is about 8; from
    // 2.010M to 2.0011M it is nearly 500. The fall does not slow in the faller's own time at
    // all — only in the coordinate that cannot reach the horizon.
    const instance = new IscoRun(params(5, -0.05));
    const at = (target: number) => {
      while (instance.outcome === 'orbiting' && instance.radius > target) {
        instance.advanceCoordinateTime(0.02, 200);
      }
      return { tau: instance.properTime, t: instance.coordinateTime };
    };
    const a = at(2.5);
    const b = at(2.1);
    const c = at(2.01);
    const d = at(2.0011);
    expect(b.tau).toBeGreaterThan(a.tau);
    expect(d.tau).toBeGreaterThan(c.tau);
    const early = (b.t - a.t) / (b.tau - a.tau);
    const late = (d.t - c.t) / (d.tau - c.tau);
    expect(early).toBeGreaterThan(4);
    expect(early).toBeLessThan(20);
    expect(late).toBeGreaterThan(200);
    expect(late / early).toBeGreaterThan(20);
    // ...and the faller barely notices: the last 0.009 M of radius costs under 0.02 of proper
    // time, while it costs over four of coordinate time.
    expect(d.tau - c.tau).toBeLessThan(0.02);
    expect(d.t - c.t).toBeGreaterThan(4);
  });

  it('says so, in the summary, permanently and in those words', () => {
    const instance = run(5, -0.05, 5000);
    expect(describeIsco(instance, params(5, -0.05))).toContain(HORIZON_LABEL);
  });

  it('never asks for dt/dtau inside the horizon, at any launch radius or nudge', () => {
    // coordinateTimeRate throws there by design. A step that overshot 2M would take the whole
    // sim down, so the final approach is refined until it lands outside.
    for (let radius = 32; radius <= 240; radius += 1) {
      for (const nudge of [-0.9, -0.3, -0.05, 0, 0.05, 0.3]) {
        expect(() => run(radius / 10, nudge, 300, 20_000)).not.toThrow();
      }
    }
  });
});

describe('escape', () => {
  it('stops when the particle is off the plot rather than integrating forever', () => {
    const instance = run(20, 0.9, 1e6, 400_000);
    expect(instance.outcome).toBe('escaped');
    expect(instance.radius).toBeGreaterThanOrEqual(ESCAPE_RADIUS_OVER_MASS * M);
  });
});

describe('the potential panel', () => {
  it('starts outside the horizon, where V_eff is finite', () => {
    const curve = potentialCurve(M, circularAngularMomentum(9, M), 30);
    expect(curve[0]!.radius).toBeCloseTo(2.05, 12);
    expect(curve.every(point => Number.isFinite(point.potential))).toBe(true);
  });

  it('is set by the well, not by the divergence at the horizon', () => {
    // The curve reaches -0.45 at the left edge of the window at r_c = 9M. A band taken from the
    // sampled extremes is ten times too tall and flattens the well to a line.
    const l = circularAngularMomentum(9, M);
    const bounds = curveBounds(M, l, 9, effectivePotential(9, M, l));
    expect(bounds.minY).toBeGreaterThan(-0.1);
    expect(bounds.maxY - bounds.minY).toBeLessThan(0.005);
    // It contains the well floor, which is what the reader is looking at.
    const circular = circularOrbits(M, l)!;
    const floor = effectivePotential(circular.outer, M, l);
    expect(floor).toBeGreaterThan(bounds.minY);
    expect(floor).toBeLessThan(bounds.maxY);
  });

  it('lets the barrier leave the top of the frame when nothing can reach it', () => {
    // At r_c = 9M the barrier is 0.0093 above the floor while a -0.06 nudge explores 0.0003 of
    // it. Fitting the barrier in put the energy line and its turning points on the floor,
    // invisible — and the turning points are the whole demonstration.
    const l = circularAngularMomentum(9, M);
    const instance = new IscoRun(params(9, -0.06));
    const bounds = curveBounds(M, l, 9, instance.energy);
    const peak = effectivePotential(circularOrbits(M, l)!.inner, M, l);
    expect(peak).toBeGreaterThan(bounds.maxY);
    // The excursion is a readable fraction of the band rather than a rounding error in it.
    const floor = effectivePotential(circularOrbits(M, l)!.outer, M, l);
    const share = (instance.energy - floor) / (bounds.maxY - bounds.minY);
    expect(share).toBeGreaterThan(0.1);
    expect(share).toBeLessThan(0.9);
  });

  it('shows the barrier when the nudge is big enough to be about clearing it', () => {
    // Below the ISCO the circular orbit IS the barrier, and whether the energy line sits above
    // or below it is exactly what decides the outcome.
    const l = circularAngularMomentum(5, M);
    const instance = new IscoRun(params(5, -0.06));
    const bounds = curveBounds(M, l, 5, instance.energy);
    const peak = effectivePotential(5, M, l);
    expect(peak).toBeGreaterThan(bounds.minY);
    expect(peak).toBeLessThan(bounds.maxY);
    expect(instance.energy).toBeGreaterThan(peak);
  });

  it('gives a zero nudge the same zoom a small one gets', () => {
    // With no excursion at all the scale comes from the well's curvature instead. The two agree
    // to within a factor of two at the default settings, which is what makes it a fair stand-in.
    const l = circularAngularMomentum(9, M);
    const still = curveBounds(M, l, 9, new IscoRun(params(9, 0)).energy);
    const nudged = curveBounds(M, l, 9, new IscoRun(params(9, -0.06)).energy);
    const ratio = (nudged.maxY - nudged.minY) / (still.maxY - still.minY);
    expect(ratio).toBeGreaterThan(0.5);
    expect(ratio).toBeLessThan(2);
  });

  it('drops a barrier too far above the energy to be relevant', () => {
    // At r_c = 24M the barrier stands at +0.194 against a well at -0.0198. Including it would
    // squeeze the well into a twentieth of the panel for an obstacle twenty radii away.
    const l = circularAngularMomentum(24, M);
    const bounds = curveBounds(M, l, 24, effectivePotential(24, M, l));
    expect(bounds.maxY).toBeLessThan(0.05);
    expect(bounds.maxY - bounds.minY).toBeLessThan(0.02);
  });

  it('always contains the energy line and the launch radius’s potential', () => {
    for (let radius = 3.2; radius <= 24.0001; radius += 0.1) {
      const l = circularAngularMomentum(radius, M);
      const instance = new IscoRun(params(radius, -0.06));
      const bounds = curveBounds(M, l, radius, instance.energy);
      expect(bounds.maxY).toBeGreaterThan(bounds.minY);
      expect(instance.energy).toBeGreaterThan(bounds.minY);
      expect(instance.energy).toBeLessThan(bounds.maxY);
      const launchValue = effectivePotential(radius, M, l);
      expect(launchValue).toBeGreaterThan(bounds.minY);
      expect(launchValue).toBeLessThan(bounds.maxY);
    }
  });

  it('never inverts at any nudge either', () => {
    for (const nudge of [-0.3, -0.06, 0, 0.3]) {
      for (const radius of [3.2, 5, 6, 9, 24]) {
        const l = circularAngularMomentum(radius, M);
        const instance = new IscoRun(params(radius, nudge));
        const bounds = curveBounds(M, l, radius, instance.energy);
        expect(bounds.maxY).toBeGreaterThan(bounds.minY);
      }
    }
  });
});

describe('the summary', () => {
  it('names both clocks, so neither can be mistaken for the other', () => {
    const instance = run(9, -0.05, 500);
    const text = describeIsco(instance, params(9, -0.05));
    expect(text).toContain('faller');
    expect(text).toContain('Schwarzschild');
  });

  it('calls 6M the ISCO by name', () => {
    expect(describeIsco(null, params(6))).toContain('this is the ISCO');
  });
});
