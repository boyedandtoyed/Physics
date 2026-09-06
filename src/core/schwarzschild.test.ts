import { describe, expect, it } from 'vitest';
import {
  CRITICAL_IMPACT_PARAMETER,
  HORIZON_RADIUS,
  ISCO_RADIUS,
  MASS,
  NT_PEAK_FLUX,
  PHOTON_SPHERE_RADIUS,
  circularOrbitEnergy,
  novikovThorneFlux,
  novikovThorneTemperature,
  orbitalAngularVelocity,
  redshiftFactor,
} from './schwarzschild';

/** Simpson's rule; the repo has no scipy-equivalent and does not need one. */
function simpson(f: (x: number) => number, a: number, b: number, n = 20000): number {
  const h = (b - a) / n;
  let total = f(a) + f(b);
  for (let i = 1; i < n; i++) total += f(a + i * h) * (i % 2 ? 4 : 2);
  return (total * h) / 3;
}

describe('circular orbits', () => {
  it('gives the ISCO specific energy sqrt(8/9), hence 5.7191% efficiency', () => {
    expect(circularOrbitEnergy(ISCO_RADIUS)).toBeCloseTo(Math.sqrt(8 / 9), 12);
    expect((1 - circularOrbitEnergy(ISCO_RADIUS)) * 100).toBeCloseTo(5.7191, 4);
  });

  it('reproduces the local orbital speed c/2 at the ISCO (§2.4)', () => {
    // beta = sqrt(M/r)/sqrt(1 - r_s/r), measured by a static observer at the same event.
    const beta = (r: number) => Math.sqrt(MASS / r) / Math.sqrt(1 - HORIZON_RADIUS / r);
    expect(beta(ISCO_RADIUS)).toBeCloseTo(0.5, 12);
  });

  it('refuses radii where no circular orbit exists', () => {
    expect(() => circularOrbitEnergy(PHOTON_SPHERE_RADIUS)).toThrow(RangeError);
    expect(() => circularOrbitEnergy(HORIZON_RADIUS)).toThrow(RangeError);
  });
});

describe('Novikov-Thorne flux (§4.3)', () => {
  it('vanishes at and inside the ISCO — the zero-torque inner boundary', () => {
    expect(novikovThorneFlux(ISCO_RADIUS)).toBe(0);
    expect(novikovThorneFlux(ISCO_RADIUS - 0.5)).toBe(0);
    expect(novikovThorneFlux(ISCO_RADIUS + 0.001)).toBeGreaterThan(0);
  });

  it('integrates to the ISCO binding energy — the check that validates the whole profile', () => {
    // In M = 1 units the identity is int F E r dr = 1 - E_isco. Here r is in r_s units, so
    // r_M = 2r and dr_M = 2 dr, giving the factor of 4. That factor is also a test of the
    // unit conversion inside novikovThorneFlux.
    const integrand = (u: number) => {
      const r = ISCO_RADIUS / u; // u in (0, 1] maps the infinite tail onto a finite interval
      return novikovThorneFlux(r) * circularOrbitEnergy(r) * r * (ISCO_RADIUS / u ** 2);
    };
    const luminosity = 4 * simpson(integrand, 1e-9, 1, 200_000);
    expect(luminosity).toBeCloseTo(1 - Math.sqrt(8 / 9), 7);
  });

  it('peaks at 9.55M = 4.775 r_s, not the Newtonian 8.16M', () => {
    let best = { flux: 0, radius: 0 };
    for (let r = ISCO_RADIUS; r < 40; r += 0.0005) {
      const flux = novikovThorneFlux(r);
      if (flux > best.flux) best = { flux, radius: r };
    }
    expect(best.radius).toBeCloseTo(9.55 / 2, 2);
    expect(best.flux).toBeCloseTo(NT_PEAK_FLUX, 6);
  });

  it('differs from the Shakura-Sunyaev profile by more than a normalisation', () => {
    // If SS were merely NT rescaled, this ratio would be constant. It is not: 7.2 near the
    // inner edge falling towards 1 far out. Shipping SS under the NT name is a physics error,
    // not a cosmetic one.
    const ss = (r: number) => {
      const rM = 2 * r;
      return 1.5 * (1 - Math.sqrt(6 / rM)) / rM ** 3;
    };
    const ratio = (r: number) => ss(r) / novikovThorneFlux(r);
    expect(ratio(6.5 / 2)).toBeCloseTo(7.216, 2);
    expect(ratio(10 / 2)).toBeCloseTo(1.983, 2);
    expect(ratio(100 / 2)).toBeCloseTo(1.158, 2);
  });

  it('normalises the temperature profile to a unit peak and T ~ F^(1/4)', () => {
    const peakRadius = 9.55 / 2;
    expect(novikovThorneTemperature(peakRadius)).toBeCloseTo(1, 3);
    expect(novikovThorneTemperature(ISCO_RADIUS)).toBe(0);
    const r = 8;
    expect(novikovThorneTemperature(r)).toBeCloseTo((novikovThorneFlux(r) / NT_PEAK_FLUX) ** 0.25, 12);
  });
});

describe('redshift factor (§4.3)', () => {
  /** The g_grav * Doppler factorisation, with beta and n-hat in the local static frame. */
  function decomposed(emission: number, axialImpact: number, observer: number): number {
    const gravitational = Math.sqrt(
      (1 - HORIZON_RADIUS / emission) / (1 - HORIZON_RADIUS / observer),
    );
    const beta = Math.sqrt(MASS / emission) / Math.sqrt(1 - HORIZON_RADIUS / emission);
    const gamma = 1 / Math.sqrt(1 - beta * beta);
    const nPhi = (axialImpact * Math.sqrt(1 - HORIZON_RADIUS / emission)) / emission;
    return gravitational / (gamma * (1 - beta * nPhi));
  }

  it('agrees with the local-static-frame decomposition to machine precision', () => {
    let worst = 0;
    for (const emission of [3, 4, 6, 15]) {
      const bMax = emission / Math.sqrt(1 - HORIZON_RADIUS / emission);
      for (const fraction of [-0.9, -0.5, 0, 0.5, 0.9]) {
        for (const observer of [20, 1e7]) {
          const a = redshiftFactor(emission, fraction * bMax, observer);
          const b = decomposed(emission, fraction * bMax, observer);
          worst = Math.max(worst, Math.abs(a - b) / a);
        }
      }
    }
    expect(worst).toBeLessThan(1e-14);
  });

  it('blueshifts the prograde side and redshifts the retrograde side', () => {
    const bMax = ISCO_RADIUS / Math.sqrt(1 - HORIZON_RADIUS / ISCO_RADIUS);
    const approaching = redshiftFactor(ISCO_RADIUS, 0.99 * bMax, 20);
    const receding = redshiftFactor(ISCO_RADIUS, -0.99 * bMax, 20);
    expect(approaching).toBeGreaterThan(1);
    expect(receding).toBeLessThan(1);
    // The crescent contrast the renderer must produce. Double-applying g would give 5899.
    expect((approaching / receding) ** 4).toBeCloseTo(76.81, 1);
  });

  it('reduces to pure gravitational redshift for a radially moving photon', () => {
    // b_phi = 0 means no azimuthal motion along the line of sight, so only the transverse
    // Doppler and gravitational terms survive.
    // The observer's own sqrt(1 - r_s/r_obs) only vanishes in the limit, so push it far out.
    const observer = 1e14;
    expect(redshiftFactor(ISCO_RADIUS, 0, observer))
      .toBeCloseTo(Math.sqrt(1 - 3 * MASS / ISCO_RADIUS), 12);
  });

  it('keeps the Keplerian angular velocity consistent with the ISCO period', () => {
    expect(orbitalAngularVelocity(ISCO_RADIUS)).toBeCloseTo(Math.sqrt(MASS / ISCO_RADIUS ** 3), 14);
    // Unit sanity: b_crit is a length in the same r_s units, so Omega*b is dimensionless.
    expect(orbitalAngularVelocity(ISCO_RADIUS) * CRITICAL_IMPACT_PARAMETER).toBeLessThan(1);
  });
});
