import { describe, expect, it } from 'vitest';
import {
  MERCURY_PRECESSION_ARCSEC_PER_CENTURY,
  MERCURY_WEAK_FIELD_PARAMETER,
} from '../../../core/mercury';
import { ARCSECONDS_PER_RADIAN, MERCURY_ECCENTRICITY } from '../../../core/units';
import {
  PrecessionRun,
  apsides,
  orbitStatus,
  formulaAdvancePerOrbit,
  orbitalPeriod,
  seedOrbit,
  unwrap,
  STEPS_PER_ORBIT,
} from './precessionRun';

/** Runs until `orbits` perihelion intervals have been measured, or the particle plunges. */
function integrate(params: Parameters<typeof seedOrbit>[0], orbits: number): PrecessionRun {
  const run = new PrecessionRun(params);
  const limit = STEPS_PER_ORBIT * (orbits + 2);
  let steps = 0;
  while (run.orbitsCompleted < orbits && steps < limit && !run.plunged) {
    run.advance(STEPS_PER_ORBIT / 10);
    steps += STEPS_PER_ORBIT / 10;
  }
  return run;
}

const MERCURY_SHAPE = { eccentricity: MERCURY_ECCENTRICITY, relativistic: true };

/** An angle difference reduced into [0, 2pi), which is the range `advanceWithinTurn` lives in. */
const positiveTurn = (angle: number): number =>
  ((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);

describe('seeding', () => {
  it('reproduces the requested turning points, which vis-viva seeding does not', () => {
    // The check that matters: integrate and measure the apsides back off the trajectory. A seed
    // that is merely self-consistent would pass a test that only re-read its own L.
    const run = integrate({ ...MERCURY_SHAPE, fieldStrength: 0.05 }, 2);
    const radii = run.trail.map(sample => Math.hypot(sample.x, sample.y));
    const periapsis = Math.min(...radii);
    const apoapsis = Math.max(...radii);
    expect(periapsis).toBeCloseTo(apsides(MERCURY_ECCENTRICITY).periapsis, 5);
    expect(apoapsis).toBeCloseTo(apsides(MERCURY_ECCENTRICITY).apoapsis, 5);
    // and therefore the eccentricity the user asked for, not a collapsed one
    expect((apoapsis - periapsis) / (apoapsis + periapsis)).toBeCloseTo(MERCURY_ECCENTRICITY, 5);
  });

  it('gives the same shape in the Newtonian potential, so only the physics differs', () => {
    const run = integrate({ ...MERCURY_SHAPE, fieldStrength: 0.05, relativistic: false }, 2);
    const radii = run.trail.map(sample => Math.hypot(sample.x, sample.y));
    expect(Math.min(...radii)).toBeCloseTo(apsides(MERCURY_ECCENTRICITY).periapsis, 5);
    expect(Math.max(...radii)).toBeCloseTo(apsides(MERCURY_ECCENTRICITY).apoapsis, 5);
  });

  it('needs more angular momentum in the relativistic potential than the Newtonian one', () => {
    // The -ML^2/r^3 term deepens the well near periapsis, so holding the same turning points
    // costs more L. If this were reversed the GR orbit would precess backwards.
    const relativistic = seedOrbit({ ...MERCURY_SHAPE, fieldStrength: 0.05 });
    const newtonian = seedOrbit({ ...MERCURY_SHAPE, fieldStrength: 0.05, relativistic: false });
    expect(relativistic.angularMomentum).toBeGreaterThan(newtonian.angularMomentum);
  });
});

describe('the measured advance', () => {
  it('is zero for a Newtonian orbit: the ellipse closes', () => {
    const run = integrate({ ...MERCURY_SHAPE, fieldStrength: 0.05, relativistic: false }, 4);
    expect(Math.abs(run.measuredAdvancePerOrbit!)).toBeLessThan(1e-4);
  });

  it('is forwards, not backwards', () => {
    const run = integrate({ ...MERCURY_SHAPE, fieldStrength: 0.02 }, 2);
    expect(run.measuredAdvancePerOrbit!).toBeGreaterThan(0);
  });

  it('converges on 6 pi mu/(1-e^2) as the field weakens', () => {
    // The point of the whole sim: the formula is exact in the limit and the integrator finds it.
    // The residual is the formula's own truncation, O(mu), so it must shrink with mu.
    const ratios = [0.02, 0.005].map(fieldStrength => {
      const params = { ...MERCURY_SHAPE, fieldStrength };
      const run = integrate(params, 2);
      return run.measuredAdvancePerOrbit! / formulaAdvancePerOrbit(params);
    });
    expect(ratios[0]!).toBeCloseTo(1.105, 2);
    expect(ratios[1]!).toBeCloseTo(1.024, 2);
    expect(ratios[1]!).toBeLessThan(ratios[0]!);
  });

  it('is about 32% above the weak-field formula at the mass the animation uses', () => {
    // Stated as a fact about the default, so that if the default moves this test says so. The
    // UI must never present the exaggerated drift as confirming 42.98 arcsec/century.
    const params = { ...MERCURY_SHAPE, fieldStrength: 0.05 };
    const run = integrate(params, 3);
    const ratio = run.measuredAdvancePerOrbit! / formulaAdvancePerOrbit(params);
    expect(ratio).toBeCloseTo(1.321, 2);
  });

  it('scales as 1/(1-e^2) at fixed mu, at a mu where the formula still holds', () => {
    const fieldStrength = 0.002;
    const circularish = integrate({ fieldStrength, eccentricity: 0.05, relativistic: true }, 2);
    const eccentric = integrate({ fieldStrength, eccentricity: 0.5, relativistic: true }, 2);
    const predicted = (1 - 0.05 ** 2) / (1 - 0.5 ** 2);
    const measured = eccentric.measuredAdvancePerOrbit! / circularish.measuredAdvancePerOrbit!;
    expect(measured / predicted).toBeCloseTo(1, 2);
  });

  it('measures between perihelia, not at the nearest step', () => {
    // A step-quantised measurement would land on a multiple of 2 pi / STEPS_PER_ORBIT. At this
    // field strength the advance is far smaller than that quantum, so a quantised measurement
    // could only report 0 or 0.24 degrees, and this asserts it reports neither.
    const params = { fieldStrength: 6e-5, eccentricity: MERCURY_ECCENTRICITY, relativistic: true };
    const run = integrate(params, 2);
    const quantum = (2 * Math.PI) / STEPS_PER_ORBIT;
    expect(run.measuredAdvancePerOrbit!).toBeLessThan(quantum / 2);
    expect(run.measuredAdvancePerOrbit!).toBeGreaterThan(0);
    expect(run.measuredAdvancePerOrbit! / formulaAdvancePerOrbit(params)).toBeCloseTo(1, 2);
  });
});

describe('the exaggeration', () => {
  it('is five million times Mercury’s real field strength', () => {
    // The sentence the canvas label makes: this is why the animation needs a different mass.
    expect(0.05 / MERCURY_WEAK_FIELD_PARAMETER).toBeGreaterThan(1e6);
    expect(MERCURY_WEAK_FIELD_PARAMETER).toBeLessThan(1e-7);
  });

  it('leaves Mercury’s real benchmark untouched by the animation parameters', () => {
    // core/mercury.ts is the only route to 42.98, and nothing in this module feeds it.
    expect(MERCURY_PRECESSION_ARCSEC_PER_CENTURY).toBeCloseTo(42.98, 2);
  });

  it('puts Mercury’s real per-orbit drift below a tenth of an arcsecond of the animation’s', () => {
    const params = { ...MERCURY_SHAPE, fieldStrength: MERCURY_WEAK_FIELD_PARAMETER };
    const arcsec = formulaAdvancePerOrbit(params) * ARCSECONDS_PER_RADIAN;
    expect(arcsec).toBeCloseTo(0.10353, 4);
  });
});

describe('the bound-orbit domain', () => {
  it('holds at the default mass and gives way to a plunge at the top of the slider', () => {
    // The mass slider reaches 0.2, where Mercury's periapsis is 3.97 M — inside the barrier.
    expect(orbitStatus({ ...MERCURY_SHAPE, fieldStrength: 0.05 })).toBe('precessing');
    expect(orbitStatus({ ...MERCURY_SHAPE, fieldStrength: 0.12 })).toBe('precessing');
    expect(orbitStatus({ ...MERCURY_SHAPE, fieldStrength: 0.2 })).toBe('plunging');
  });

  it('has no solution at all where the requested periapsis is the horizon', () => {
    // mu = 0.2, e = 0.6 asks for a turning point at r = 0.4 = 2M. No bound orbit has one there,
    // and constructing a run for it threw into the page's error boundary.
    expect(apsides(0.6).periapsis).toBeCloseTo(2 * 0.2, 12);
    expect(orbitStatus({ fieldStrength: 0.2, eccentricity: 0.6, relativistic: true }))
      .toBe('unavailable');
  });

  it('never plunges in the Newtonian potential, which has no barrier at all', () => {
    expect(orbitStatus({ ...MERCURY_SHAPE, fieldStrength: 0.2, relativistic: false }))
      .toBe('precessing');
    expect(orbitStatus({ fieldStrength: 0.2, eccentricity: 0.6, relativistic: false }))
      .toBe('precessing');
  });

  it('reports a plunge rather than a precession when the periapsis is inside the barrier', () => {
    const run = integrate({ ...MERCURY_SHAPE, fieldStrength: 0.2 }, 3);
    expect(run.plunged).toBe(true);
    expect(run.radius).toBeLessThanOrEqual(2 * 0.2);
  });

  it('narrows as the orbit is made more eccentric', () => {
    // A more eccentric orbit dives deeper at fixed a, so it hits the barrier at a smaller mass.
    expect(orbitStatus({ fieldStrength: 0.13, eccentricity: 0.1, relativistic: true }))
      .toBe('precessing');
    expect(orbitStatus({ fieldStrength: 0.13, eccentricity: 0.5, relativistic: true }))
      .toBe('plunging');
  });

  it('covers every position of both sliders without throwing', () => {
    // The page constructs a run from whatever the sliders say, and an unhandled RangeError in
    // that constructor replaced the whole sim with the error boundary.
    for (let field = 1; field <= 200; field++) {
      for (let index = 2; index <= 120; index++) {
        const params = {
          fieldStrength: field / 1000, eccentricity: index / 200, relativistic: true,
        };
        const status = orbitStatus(params);
        expect(['precessing', 'plunging', 'unavailable']).toContain(status);
        if (status !== 'unavailable') expect(() => new PrecessionRun(params)).not.toThrow();
      }
    }
  });
});

describe('geometry helpers', () => {
  it('gives Kepler’s period at a = 1', () => {
    expect(orbitalPeriod(0.05)).toBeCloseTo((2 * Math.PI) / Math.sqrt(0.05), 10);
  });

  it('rejects an eccentricity of 1 — a parabola has no apoapsis', () => {
    expect(() => apsides(1)).toThrow(RangeError);
    expect(() => apsides(-0.1)).toThrow(RangeError);
  });

  it('reports no formula advance in Newtonian mode', () => {
    expect(formulaAdvancePerOrbit({ ...MERCURY_SHAPE, fieldStrength: 0.05, relativistic: false }))
      .toBe(0);
  });

  it('unwraps across the branch cut without shifting a nearby angle', () => {
    expect(unwrap(-3.1, 3.1)).toBeCloseTo(-3.1 + 2 * Math.PI, 12);
    expect(unwrap(0.1, 0.2)).toBeCloseTo(0.1, 12);
  });

  it('draws no perihelion arc before two perihelia have been seen', () => {
    const run = new PrecessionRun({ ...MERCURY_SHAPE, fieldStrength: 0.05 });
    expect(run.perihelionArc(32).length).toBe(0);
    expect(run.measuredAdvancePerOrbit).toBeNull();
  });

  it('draws the arc at the periapsis radius, spanning the measured advance', () => {
    const run = integrate({ ...MERCURY_SHAPE, fieldStrength: 0.05 }, 2);
    const arc = run.perihelionArc(16);
    const periapsis = apsides(MERCURY_ECCENTRICITY).periapsis;
    for (let i = 0; i < arc.length; i += 3) {
      expect(Math.hypot(arc[i]!, arc[i + 1]!)).toBeCloseTo(periapsis, 6);
    }
    const first = Math.atan2(arc[1]!, arc[0]!);
    const last = Math.atan2(arc[arc.length - 2]!, arc[arc.length - 3]!);
    // Reduced into [0, 2pi) rather than through `unwrap`, which aliases anything past half a
    // turn — and the advance within a turn routinely exceeds that at the default mass.
    expect(positiveTurn(last - first)).toBeCloseTo(run.advanceWithinTurn, 6);
  });

  it('shows the current turn’s share of the advance, not a closed circle', () => {
    // At the default mass the perihelion goes right round in under five orbits. Drawing the
    // whole accumulated angle then traces the same circle repeatedly and reads as nothing.
    const run = integrate({ ...MERCURY_SHAPE, fieldStrength: 0.05 }, 7);
    expect(run.cumulativeAdvance).toBeGreaterThan(2 * Math.PI);
    expect(run.advanceWithinTurn).toBeLessThan(2 * Math.PI);
    expect(run.advanceWithinTurn).toBeGreaterThanOrEqual(0);
    expect((run.cumulativeAdvance - run.advanceWithinTurn) / (2 * Math.PI))
      .toBeCloseTo(Math.round((run.cumulativeAdvance - run.advanceWithinTurn) / (2 * Math.PI)), 9);
  });

  it('has the arc and the two spokes agree on the same angle', () => {
    const run = integrate({ ...MERCURY_SHAPE, fieldStrength: 0.05 }, 3);
    const spokes = run.perihelionSpokes();
    expect(spokes.length / 3).toBe(4);
    const first = Math.atan2(spokes[4]!, spokes[3]!);
    const second = Math.atan2(spokes[10]!, spokes[9]!);
    expect(positiveTurn(second - first)).toBeCloseTo(run.advanceWithinTurn, 5);
  });
});

describe('the swept sector', () => {
  it('spans exactly the angle the spokes mark, at the periapsis radius', () => {
    const run = integrate({ ...MERCURY_SHAPE, fieldStrength: 0.05 }, 3);
    const wedge = run.perihelionWedge(64);
    const periapsis = apsides(MERCURY_ECCENTRICITY).periapsis;
    // Fan origin at the centre, every rim vertex on the periapsis circle.
    expect(Math.hypot(wedge[0]!, wedge[1]!)).toBe(0);
    for (let i = 3; i < wedge.length; i += 3) {
      expect(Math.hypot(wedge[i]!, wedge[i + 1]!)).toBeCloseTo(periapsis, 6);
    }
    const first = Math.atan2(wedge[4]!, wedge[3]!);
    const last = Math.atan2(wedge[wedge.length - 2]!, wedge[wedge.length - 3]!);
    expect(positiveTurn(last - first)).toBeCloseTo(run.advanceWithinTurn, 5);
  });

  it('is empty before an angle has been swept at all', () => {
    const run = new PrecessionRun({ ...MERCURY_SHAPE, fieldStrength: 0.05 });
    expect(run.perihelionWedge(64).length).toBe(0);
  });

  it('is empty for a Newtonian orbit, which sweeps nothing', () => {
    const run = integrate({ ...MERCURY_SHAPE, fieldStrength: 0.05, relativistic: false }, 3);
    const wedge = run.perihelionWedge(64);
    const first = Math.atan2(wedge[4]!, wedge[3]!);
    const last = Math.atan2(wedge[wedge.length - 2]!, wedge[wedge.length - 3]!);
    expect(Math.abs(positiveTurn(last - first))).toBeLessThan(1e-3);
  });
});
