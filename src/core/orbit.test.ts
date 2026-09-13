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
  angularMomentumForTurningPoints,
  specificAngularMomentum,
  turningPoints,
  circularAngularMomentum,
  circularBindingEfficiency,
  circularSpecificEnergy,
  coordinateTimeRate,
  isStableCircularOrbit,
  marginallyBoundRadius,
  radialEpicyclicSquared,
  specificEnergyFromOrbitEnergy,
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

describe('seeding an orbit from its turning points', () => {
  it('reduces to the textbook L² = M a (1 − e²) in the Newtonian case', () => {
    for (const [a, e] of [[20, 0.2056], [100, 0.4], [1000, 0.05]] as const) {
      const L = angularMomentumForTurningPoints(a * (1 - e), a * (1 + e), M, false);
      expect(L * L).toBeCloseTo(M * a * (1 - e * e), 8);
    }
  });

  it('produces exactly the requested turning points in the relativistic case', () => {
    // The reason this exists: Newtonian vis-viva seeding gives the wrong orbit once the field is
    // strong — at M/a = 0.05 the eccentricity collapses from 0.2056 to 0.029.
    for (const [a, e] of [[20, 0.2056], [50, 0.3], [200, 0.1]] as const) {
      const periapsis = a * (1 - e);
      const apoapsis = a * (1 + e);
      const L = angularMomentumForTurningPoints(periapsis, apoapsis, M, true);
      // Both radii are turning points: V_eff takes the same value at each.
      expect(effectivePotential(periapsis, M, L))
        .toBeCloseTo(effectivePotential(apoapsis, M, L), 12);
    }
  });

  it('holds the orbit shape while the physics is switched, so the comparison is fair', () => {
    const a = 20;
    const e = 0.2056;
    const gr = angularMomentumForTurningPoints(a * (1 - e), a * (1 + e), M, true);
    const newtonian = angularMomentumForTurningPoints(a * (1 - e), a * (1 + e), M, false);
    // Different angular momenta — which is the point: the same ellipse needs different L under
    // different physics. Using one L for both compares two different orbits.
    expect(gr).not.toBeCloseTo(newtonian, 3);
    expect(gr).toBeGreaterThan(0);
    expect(newtonian).toBeGreaterThan(0);
  });

  it('refuses turning points no bound orbit has', () => {
    expect(() => angularMomentumForTurningPoints(0, 10, M)).toThrow(RangeError);
    expect(() => angularMomentumForTurningPoints(10, 5, M)).toThrow(RangeError);
    // Deep inside the barrier there is no bound orbit with those turning points.
    expect(() => angularMomentumForTurningPoints(2.5, 3, M, true)).toThrow(RangeError);
  });
});

describe('circular orbits', () => {
  it('gives 2 sqrt(3) M and sqrt(8/9) at the ISCO, by the closed forms', () => {
    expect(circularAngularMomentum(6, 1)).toBeCloseTo(2 * Math.sqrt(3), 12);
    expect(circularSpecificEnergy(6, 1)).toBeCloseTo(Math.sqrt(8 / 9), 12);
    expect(circularBindingEfficiency(6, 1) * 100).toBeCloseTo(5.7191, 4);
  });

  it('reaches the same energy by a second, independent route', () => {
    // Etil from the closed form must equal sqrt(1 + 2 V_eff) at the same radius with that L.
    // Two conventions for the same quantity; confusing them is the standard error here.
    for (const radius of [4.5, 6, 8, 20, 500]) {
      const l = circularAngularMomentum(radius, 1);
      const viaPotential = specificEnergyFromOrbitEnergy(effectivePotential(radius, 1, l));
      expect(viaPotential).toBeCloseTo(circularSpecificEnergy(radius, 1), 12);
    }
  });

  it('sits at a stationary point of the potential, which is what circular means', () => {
    for (const radius of [3.5, 6, 10, 100]) {
      const l = circularAngularMomentum(radius, 1);
      expect(Math.abs(effectivePotentialSlope(radius, 1, l))).toBeLessThan(1e-14);
    }
  });

  it('agrees with circularOrbits, which solves the same condition the other way round', () => {
    const l = circularAngularMomentum(9, 1);
    const roots = circularOrbits(1, l);
    expect(roots).not.toBeNull();
    expect(roots!.outer).toBeCloseTo(9, 9);
  });

  it('has no solution at or inside the photon sphere, at any angular momentum', () => {
    expect(() => circularAngularMomentum(3, 1)).toThrow(RangeError);
    expect(() => circularAngularMomentum(2.9, 1)).toThrow(RangeError);
    expect(() => circularSpecificEnergy(3, 1)).toThrow(RangeError);
    // ...and it diverges on the way in, rather than stopping at some finite value.
    expect(circularAngularMomentum(3.001, 1)).toBeGreaterThan(50);
    expect(circularAngularMomentum(3.000001, 1)).toBeGreaterThan(1500);
  });

  it('scales with the mass, since only r/M enters', () => {
    for (const mass of [0.5, 1, 7]) {
      expect(circularAngularMomentum(6 * mass, mass) / mass).toBeCloseTo(2 * Math.sqrt(3), 12);
      expect(circularSpecificEnergy(6 * mass, mass)).toBeCloseTo(Math.sqrt(8 / 9), 12);
    }
  });

  it('is marginally bound at exactly 4M, where Etil = 1', () => {
    // The radius the "2.001 r_s" slip pointed at: 4M is r_mb, not the horizon.
    expect(circularSpecificEnergy(marginallyBoundRadius(1), 1)).toBeCloseTo(1, 12);
    expect(circularSpecificEnergy(4.1, 1)).toBeLessThan(1);
    expect(circularSpecificEnergy(3.9, 1)).toBeGreaterThan(1);
  });

  it('binds more tightly the deeper it goes, down to the ISCO', () => {
    const efficiencies = [100, 20, 10, 6].map(r => circularBindingEfficiency(r, 1));
    for (let i = 1; i < efficiencies.length; i++) {
      expect(efficiencies[i]!).toBeGreaterThan(efficiencies[i - 1]!);
    }
    expect(efficiencies.at(-1)!).toBeCloseTo(1 - Math.sqrt(8 / 9), 12);
  });
});

describe('stability of a circular orbit', () => {
  it('changes sign exactly at 6M, which is the ISCO', () => {
    expect(radialEpicyclicSquared(6, 1)).toBe(0);
    expect(radialEpicyclicSquared(6.0001, 1)).toBeGreaterThan(0);
    expect(radialEpicyclicSquared(5.9999, 1)).toBeLessThan(0);
    expect(isStableCircularOrbit(6.0001, 1)).toBe(true);
    expect(isStableCircularOrbit(6, 1)).toBe(false);
    expect(isStableCircularOrbit(5, 1)).toBe(false);
  });

  it('is the second derivative of the potential, checked against a finite difference', () => {
    // The claim is that kappa^2 = V_eff''(r_c). Asserting the closed form against itself would
    // prove nothing, so it is differenced numerically.
    for (const radius of [4, 8, 12, 20]) {
      const l = circularAngularMomentum(radius, 1);
      const h = 1e-4;
      const second = (effectivePotential(radius + h, 1, l)
        - 2 * effectivePotential(radius, 1, l)
        + effectivePotential(radius - h, 1, l)) / (h * h);
      expect(second).toBeCloseTo(radialEpicyclicSquared(radius, 1), 8);
    }
  });

  it('makes the epicyclic period diverge at the ISCO — "marginally" stable, operationally', () => {
    const period = (r: number) => (2 * Math.PI) / Math.sqrt(radialEpicyclicSquared(r, 1));
    expect(period(8)).toBeCloseTo(224.794, 2);
    expect(period(6.01)).toBeGreaterThan(1500);
    expect(period(6.000001)).toBeGreaterThan(150_000);
  });
});

describe('coordinate time', () => {
  it('runs at Etil/(1 - 2M/r) and diverges at the horizon, not before', () => {
    const e = circularSpecificEnergy(20, 1);
    expect(coordinateTimeRate(20, 1, e)).toBeCloseTo(e / 0.9, 12);
    expect(coordinateTimeRate(2.001, 1, 1)).toBeGreaterThan(2000);
    expect(coordinateTimeRate(2.000001, 1, 1)).toBeGreaterThan(2e6);
  });

  it('refuses to label events at or inside the horizon', () => {
    // Schwarzschild t is not a coordinate there. Returning a large number instead would let a
    // caller animate straight through the horizon in a chart that does not cover it.
    expect(() => coordinateTimeRate(2, 1, 1)).toThrow(RangeError);
    expect(() => coordinateTimeRate(1.5, 1, 1)).toThrow(RangeError);
  });

  it('tends to Etil far away, where t and tau agree', () => {
    expect(coordinateTimeRate(1e8, 1, 1)).toBeCloseTo(1, 7);
  });

  it('reproduces Kepler’s third law: dphi/dt = sqrt(M/r^3) exactly', () => {
    // A genuinely surprising exactness — the Newtonian relation survives untouched in
    // Schwarzschild coordinate time, though not in proper time.
    for (const radius of [6, 10, 50]) {
      const l = circularAngularMomentum(radius, 1);
      const e = circularSpecificEnergy(radius, 1);
      const perProperTime = l / (radius * radius);
      expect(perProperTime / coordinateTimeRate(radius, 1, e))
        .toBeCloseTo(Math.sqrt(1 / radius ** 3), 12);
    }
  });
});

describe('the two energy conventions', () => {
  it('invert each other', () => {
    for (const energy of [-0.05, -1 / 18, 0, 0.3]) {
      const tilde = specificEnergyFromOrbitEnergy(energy);
      expect((tilde * tilde - 1) / 2).toBeCloseTo(energy, 14);
    }
  });

  it('put the bound/unbound line at Etil = 1, not at Etil = 0', () => {
    expect(specificEnergyFromOrbitEnergy(0)).toBe(1);
    expect(specificEnergyFromOrbitEnergy(-1 / 18)).toBeCloseTo(Math.sqrt(8 / 9), 14);
  });

  it('refuses an energy below -1/2, where no timelike geodesic exists', () => {
    expect(() => specificEnergyFromOrbitEnergy(-0.6)).toThrow(RangeError);
  });
});
