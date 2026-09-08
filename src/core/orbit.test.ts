import { describe, expect, it } from 'vitest';
import {
  ISCO_BINDING_EFFICIENCY,
  ISCO_SPECIFIC_ENERGY,
  circularOrbits,
  classifyOrbit,
  effectivePotential,
  effectivePotentialSlope,
  iscoAngularMomentum,
  iscoRadius,
  orbitAcceleration,
  photonPotentialSlope,
  photonSphereRadius,
  specificAngularMomentum,
  turningPoints,
} from './orbit';
import { createYoshida4 } from './integrators/symplectic';

const M = 1;
const L_ISCO = 2 * Math.sqrt(3);
// Never one radius, and never only where the normalised variable is 1.
const RADII = [2.5, 3, 4, 6, 10, 25, 100];

describe('the effective potential (§2.5)', () => {
  it('matches the closed form across the range the explorer plots', () => {
    for (const r of RADII) {
      for (const L of [0, 2, L_ISCO, 6]) {
        const expected = -M / r + (L * L) / (2 * r * r) - (M * L * L) / r ** 3;
        expect(effectivePotential(r, M, L)).toBeCloseTo(expected, 14);
      }
    }
  });

  it('reduces to Newtonian when the GR term is removed, at every radius', () => {
    // The -ML^2/r^3 term is the whole of GR here. Without it this is Kepler.
    for (const r of RADII) {
      const L = 4;
      const newtonian = -M / r + (L * L) / (2 * r * r);
      expect(effectivePotential(r, M, L) + (M * L * L) / r ** 3).toBeCloseTo(newtonian, 14);
    }
  });

  it('is scale-free: only r/M and L/M enter', () => {
    // Schwarzschild geometry has no length scale beyond M, which is why one picture serves
    // every mass and only the labels change.
    for (const mass of [0.1, 2, 1000]) {
      for (const ratio of [3, 6, 20]) {
        expect(effectivePotential(ratio * mass, mass, L_ISCO * mass))
          .toBeCloseTo(effectivePotential(ratio, 1, L_ISCO), 12);
      }
    }
  });

  it('has its slope vanish exactly at the circular orbits', () => {
    for (const L of [4, 5, 8]) {
      const orbits = circularOrbits(M, L)!;
      expect(effectivePotentialSlope(orbits.inner, M, L)).toBeCloseTo(0, 10);
      expect(effectivePotentialSlope(orbits.outer, M, L)).toBeCloseTo(0, 10);
    }
  });

  it('rejects a radius at or inside the centre', () => {
    expect(() => effectivePotential(0, M, 4)).toThrow(RangeError);
    expect(() => effectivePotential(-1, M, 4)).toThrow(RangeError);
    expect(() => effectivePotential(4, 0, 4)).toThrow(RangeError);
  });
});

describe('the ISCO', () => {
  it('puts the potential minimum at -1/18, not at -1/(12M)', () => {
    // V_eff is dimensionless in geometric units, so -1/(12M) is dimensionally wrong as well as
    // numerically: -0.0833 against -0.0556.
    expect(effectivePotential(iscoRadius(M), M, iscoAngularMomentum(M))).toBeCloseTo(-1 / 18, 14);
    expect(effectivePotential(6, M, L_ISCO)).not.toBeCloseTo(-1 / 12, 3);
  });

  it('reaches the same number two ways, which is the point', () => {
    // The potential minimum and (E~^2 - 1)/2 are the same quantity. Asserting the identity is
    // worth more than asserting the value twice.
    const fromPotential = effectivePotential(6, M, L_ISCO);
    const fromEnergy = (ISCO_SPECIFIC_ENERGY ** 2 - 1) / 2;
    expect(fromEnergy - fromPotential).toBeCloseTo(0, 15);
  });

  it('merges the two circular orbits at exactly 6M', () => {
    const merged = circularOrbits(M, iscoAngularMomentum(M))!;
    expect(merged.inner).toBeCloseTo(6, 9);
    expect(merged.outer).toBeCloseTo(6, 9);
    expect(iscoRadius(M)).toBe(6);
    expect(iscoAngularMomentum(M)).toBeCloseTo(3.4641016151, 9);
  });

  it('gives the binding energy that sets the Novikov–Thorne efficiency', () => {
    expect(ISCO_SPECIFIC_ENERGY).toBeCloseTo(0.9428090416, 9);
    expect(ISCO_BINDING_EFFICIENCY).toBeCloseTo(0.0571909584, 9);
  });

  it('treats zero angular momentum as a radial plunge, not a circular orbit at r = 0', () => {
    // The quadratic degenerates to a double root at the singularity. Returning it as a radius
    // crashed the explorer when the angular-momentum slider reached its minimum.
    expect(circularOrbits(M, 0)).toBeNull();
    expect(circularOrbits(M, -0)).toBeNull();
  });

  it('has no circular orbits at all below L_ISCO, not merely no stable ones', () => {
    for (const L of [0.5, 2, 3, L_ISCO - 1e-6]) {
      expect(circularOrbits(M, L)).toBeNull();
    }
    expect(circularOrbits(M, L_ISCO)).not.toBeNull();
    expect(circularOrbits(M, L_ISCO + 0.1)).not.toBeNull();
  });

  it('separates the two orbits as L grows, with the stable one moving out', () => {
    let previousOuter = 6;
    for (const L of [3.6, 4, 6, 20]) {
      const orbits = circularOrbits(M, L)!;
      expect(orbits.outer).toBeGreaterThan(previousOuter);
      expect(orbits.inner).toBeLessThan(orbits.outer);
      previousOuter = orbits.outer;
    }
  });
});

describe('the photon sphere is a different potential', () => {
  it('sits at exactly 3M for every L, in the null potential', () => {
    for (const L of [0.5, 1, 10, 1000]) {
      expect(photonPotentialSlope(photonSphereRadius(M), M, L)).toBeCloseTo(0, 15);
    }
    expect(photonSphereRadius(M)).toBe(3);
  });

  it('is NOT where the massive-particle maximum sits — that only tends to 3M', () => {
    // The common conflation. For a massive particle the unstable maximum approaches 3M from
    // above and never reaches it.
    expect(circularOrbits(M, 6)!.inner).toBeCloseTo(3.303062, 5);
    expect(circularOrbits(M, 20)!.inner).toBeCloseTo(3.022844, 5);
    expect(circularOrbits(M, 2000)!.inner).toBeCloseTo(3.000002, 5);
    for (const L of [6, 20, 2000]) expect(circularOrbits(M, L)!.inner).toBeGreaterThan(3);
    // Monotone approach.
    expect(circularOrbits(M, 2000)!.inner).toBeLessThan(circularOrbits(M, 20)!.inner);
  });
});

describe('turning points and classification', () => {
  it('finds both turning points of a bound orbit, bracketing the stable circular radius', () => {
    const L = 5;
    const circular = circularOrbits(M, L)!.outer;
    const energy = effectivePotential(circular, M, L) + 0.002;
    const points = turningPoints(energy, M, L);
    const bracketing = points.filter(r => r > 3);
    expect(bracketing.length).toBeGreaterThanOrEqual(2);
    expect(Math.min(...bracketing)).toBeLessThan(circular);
    expect(Math.max(...bracketing)).toBeGreaterThan(circular);
  });

  it('puts V_eff equal to the energy at every turning point it reports', () => {
    for (const L of [4.5, 5, 7]) {
      const energy = -0.01;
      for (const r of turningPoints(energy, M, L)) {
        expect(effectivePotential(r, M, L)).toBeCloseTo(energy, 8);
      }
    }
  });

  it('classifies by the sign of the energy, with a marginal band', () => {
    expect(classifyOrbit(-0.02)).toBe('bound');
    expect(classifyOrbit(0.02)).toBe('unbound');
    expect(classifyOrbit(0)).toBe('marginal');
    expect(classifyOrbit(5e-5)).toBe('marginal');
    expect(classifyOrbit(2e-4)).toBe('unbound');
  });
});

describe('the Cartesian force the integrator uses', () => {
  it('is central and inverse-square in the Newtonian limit', () => {
    const [ax, ay] = orbitAcceleration(10, 0, M, 4, false);
    expect(ax).toBeCloseTo(-M / 100, 14);
    expect(ay).toBeCloseTo(0, 15);
    // Central: the acceleration is antiparallel to the position.
    const [bx, by] = orbitAcceleration(3, 4, M, 4, false);
    expect(bx / by).toBeCloseTo(3 / 4, 12);
  });

  it('adds exactly the 3ML²/r⁵ term in the relativistic case', () => {
    const L = 4;
    for (const r of RADII) {
      const [gx] = orbitAcceleration(r, 0, M, L, true);
      const [nx] = orbitAcceleration(r, 0, M, L, false);
      expect(nx - gx).toBeCloseTo((3 * M * L * L) / r ** 4, 12);
    }
  });

  it('conserves angular momentum under Yoshida-4, which is why the force may hold L fixed', () => {
    // The force is central, so the Cartesian dynamics conserves L; feeding the initial L into
    // the potential is therefore self-consistent rather than an approximation.
    const integrator = createYoshida4(2);
    const q = new Float64Array([60, 0]);
    const v = new Float64Array([0, Math.sqrt(M / 60) * 1.05]);
    const L = specificAngularMomentum(q[0]!, q[1]!, v[0]!, v[1]!);
    for (let step = 0; step < 20_000; step++) {
      integrator.step(q, v, 0.5, (position, out) => {
        const [ax, ay] = orbitAcceleration(position[0]!, position[1]!, M, L);
        out[0] = ax;
        out[1] = ay;
      });
    }
    const after = specificAngularMomentum(q[0]!, q[1]!, v[0]!, v[1]!);
    expect(Math.abs(after / L - 1)).toBeLessThan(1e-10);
  });

  it('closes a Newtonian orbit and precesses a relativistic one', () => {
    // The single claim the explorer exists to make, measured rather than asserted.
    const run = (relativistic: boolean) => {
      const integrator = createYoshida4(2);
      const q = new Float64Array([100, 0]);
      const v = new Float64Array([0, Math.sqrt(M * 1.3 / 100)]);
      const L = specificAngularMomentum(q[0]!, q[1]!, v[0]!, v[1]!);
      let previous = Math.hypot(q[0]!, q[1]!);
      let beforeThat = Number.POSITIVE_INFINITY;
      const perihelia: number[] = [];
      for (let step = 0; step < 400_000 && perihelia.length < 4; step++) {
        integrator.step(q, v, 0.4, (position, out) => {
          const [ax, ay] = orbitAcceleration(position[0]!, position[1]!, M, L, relativistic);
          out[0] = ax;
          out[1] = ay;
        });
        const r = Math.hypot(q[0]!, q[1]!);
        if (previous < beforeThat && previous < r) perihelia.push(Math.atan2(q[1]!, q[0]!));
        beforeThat = previous;
        previous = r;
      }
      const advance = perihelia.slice(1).map((angle, i) => {
        let d = angle - perihelia[i]!;
        while (d < -Math.PI) d += 2 * Math.PI;
        while (d > Math.PI) d -= 2 * Math.PI;
        return d;
      });
      return advance.reduce((a, b) => a + b, 0) / advance.length;
    };
    expect(Math.abs(run(false))).toBeLessThan(1e-3);   // Newtonian closes
    expect(run(true)).toBeGreaterThan(0.05);           // GR precesses, and forwards
  });
});
