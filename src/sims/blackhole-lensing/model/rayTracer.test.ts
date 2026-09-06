import { describe, expect, it } from 'vitest';
import {
  CRITICAL_IMPACT_PARAMETER,
  HORIZON_RADIUS,
  MASS,
  PHOTON_SPHERE_RADIUS,
  flatLaunchSine,
  impactParameter,
  impactParameterToFlatH,
  shadowAngularRadius,
} from '../../../core/schwarzschild';
import { adaptiveStep, traceRay, traceViewingAngle } from './rayTracer';

describe('Schwarzschild geometry in r_s = 1 units', () => {
  it('places the critical radii where PHYSICS_SPEC §2.4 requires', () => {
    expect(HORIZON_RADIUS).toBe(1);
    expect(PHOTON_SPHERE_RADIUS).toBe(1.5);
    expect(MASS).toBe(0.5);
    // b_crit = 3*sqrt(3) M, which is 3*sqrt(3)/2 in these units.
    expect(CRITICAL_IMPACT_PARAMETER).toBeCloseTo(2.598076211353316, 12);
  });

  it('rejects radii inside the horizon rather than returning nonsense', () => {
    expect(() => shadowAngularRadius(1)).toThrow(RangeError);
    expect(() => shadowAngularRadius(0.5)).toThrow(RangeError);
    expect(() => impactParameter(Number.NaN, 0.1)).toThrow(RangeError);
  });

  it('distinguishes the flat-Cartesian h from the physical impact parameter', () => {
    // 1/h^2 = 1/b^2 + r_s/D^3 -- they converge only as D grows.
    for (const distance of [20, 200, 2000]) {
      const b = CRITICAL_IMPACT_PARAMETER;
      const h = impactParameterToFlatH(b, distance);
      expect(1 / h ** 2).toBeCloseTo(1 / b ** 2 + 2 * MASS / distance ** 3, 14);
      expect(h).toBeLessThan(b);
    }
    // Small at a usable camera distance -- 0.042% at D = 20 -- but exact, so it is kept.
    // The larger sqrt(1 - r_s/D) factor lives in `impactParameter`, not here.
    const ratio = impactParameterToFlatH(CRITICAL_IMPACT_PARAMETER, 20) / CRITICAL_IMPACT_PARAMETER;
    expect(ratio).toBeGreaterThan(0.999);
    expect(ratio).toBeLessThan(1);
  });
});

describe('adaptive stepping (§4.2)', () => {
  it('narrows across the photon sphere and grows with radius', () => {
    expect(adaptiveStep(PHOTON_SPHERE_RADIUS)).toBeLessThan(adaptiveStep(PHOTON_SPHERE_RADIUS * 3));
    expect(adaptiveStep(1000)).toBeGreaterThan(adaptiveStep(10));
    // At the photon sphere the Gaussian is at full depth: base * (1 - 0.7).
    const u = HORIZON_RADIUS / PHOTON_SPHERE_RADIUS;
    const base = 0.16 * PHOTON_SPHERE_RADIUS / (1 + u);
    expect(adaptiveStep(PHOTON_SPHERE_RADIUS)).toBeCloseTo(base * 0.3, 12);
  });
});

describe('null geodesic integration (§2.3)', () => {
  /** Capture threshold in launch offset, integrating from far away. This is b_crit directly,
   * because at large r the flat h and the physical b coincide. */
  function captureThresholdFromInfinity(launchRadius = 4000): number {
    const captured = (offset: number) =>
      traceRay([launchRadius, offset, 0], [-1, 0, 0]).outcome === 'captured';
    let lo = 0.1, hi = 8;
    expect(captured(lo)).toBe(true);
    expect(captured(hi)).toBe(false);
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (captured(mid)) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }

  it('reproduces b_crit = 3*sqrt(3)M as the capture threshold', () => {
    // This is the single assertion that would have caught the wrong force law: the previous
    // spec text (rhat/r^5) yields 1.732051 here instead of 2.598076.
    expect(captureThresholdFromInfinity()).toBeCloseTo(CRITICAL_IMPACT_PARAMETER, 4);
  });

  it('reproduces the deflection series alpha = 4M/b + (15pi/4)(M/b)^2', () => {
    // Asserting only the leading 4M/b term would need a loose tolerance that hides real error.
    // The second-order coefficient is a sharper probe: at b = 200 it contributes 7.4e-5 rad,
    // and the integrator has to get it right to land inside 2e-6.
    for (const offset of [200, 800]) {
      const result = traceRay([200_000, offset, 0], [-1, 0, 0]);
      expect(result.outcome).toBe('escaped');
      // Incoming direction is (-1, 0, 0); the turn angle is the deflection.
      const turn = Math.acos(Math.min(1, Math.max(-1, -result.direction[0])));
      const ratio = MASS / offset;
      const expected = 4 * ratio + (15 * Math.PI / 4) * ratio ** 2;
      // The remaining gap is the third-order term, (128/3)(M/b)^3 = 6.7e-7 at b = 200, which
      // this two-term reference deliberately omits. 2e-6 bounds it without hiding real error.
      expect(Math.abs(turn - expected)).toBeLessThan(2e-6);
    }
  });

  it('captures inside the shadow and escapes outside it, at a real camera distance', () => {
    // The full chain: viewing angle -> b -> flat h -> launch -> integrate. If the b->h
    // conversion were skipped, the threshold would sit ~1.7% away from the analytic edge.
    const distance = 20;
    const edge = shadowAngularRadius(distance);
    const inward = (theta: number) => Math.PI - theta; // measured from the outward radial
    expect(traceViewingAngle(distance, inward(edge * 0.98)).outcome).toBe('captured');
    expect(traceViewingAngle(distance, inward(edge * 1.02)).outcome).toBe('escaped');
  });

  it('locates the shadow edge at the analytic angle to 1e-4 rad', () => {
    for (const distance of [10, 20, 50]) {
      const captured = (theta: number) =>
        traceViewingAngle(distance, Math.PI - theta).outcome === 'captured';
      let lo = 1e-4, hi = Math.PI / 2;
      for (let i = 0; i < 40; i++) {
        const mid = (lo + hi) / 2;
        if (captured(mid)) lo = mid; else hi = mid;
      }
      expect((lo + hi) / 2).toBeCloseTo(shadowAngularRadius(distance), 4);
    }
  });

  it('agrees with the closed form for the launch geometry', () => {
    const distance = 30;
    const theta = 0.2;
    const b = impactParameter(distance, theta);
    expect(flatLaunchSine(distance, theta) * distance)
      .toBeCloseTo(impactParameterToFlatH(b, distance), 12);
  });
});
