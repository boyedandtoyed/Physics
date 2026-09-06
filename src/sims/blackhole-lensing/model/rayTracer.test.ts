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
import { redshiftFactor } from '../../../core/schwarzschild';
import { maximumAxialImpact } from './camera';
import {
  DEFAULT_DISK,
  adaptiveStep,
  traceCameraPixel,
  traceRay,
  traceViewingAngle,
} from './rayTracer';

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

describe('accretion disk (§4.3)', () => {
  const POSE = { distance: 20, inclination: 0.2, azimuth: 0 };
  const FOV = 60;
  const hit = (ndcX: number, ndcY = 0) => traceCameraPixel(POSE, FOV, ndcX, ndcY, 1, DEFAULT_DISK);

  it('brightens the side rotating toward the camera, not the other one', () => {
    // Geometry, independent of this code's sign conventions: the disk spins about +y, so at +z
    // its material moves along +x, i.e. toward a camera on +x. The camera basis has
    // right = (0,0,-1), so +z lands on the LEFT of the image. Left must be blueshifted.
    // Getting the backward-tracing sign wrong flips the crescent, and only a test framed in
    // terms of the physical geometry catches that.
    const left = hit(-0.45);
    const right = hit(0.45);
    expect(left.outcome).toBe('disk');
    expect(right.outcome).toBe('disk');

    const gLeft = redshiftFactor(left.emissionRadius!, left.axialImpactParameter!, POSE.distance);
    const gRight = redshiftFactor(right.emissionRadius!, right.axialImpactParameter!, POSE.distance);
    expect(gLeft).toBeGreaterThan(1);
    expect(gRight).toBeLessThan(1);
    // Mirror-symmetric pixels sample the same radius with opposite b_phi.
    expect(left.emissionRadius!).toBeCloseTo(right.emissionRadius!, 6);
    expect(left.axialImpactParameter!).toBeCloseTo(-right.axialImpactParameter!, 6);
  });

  it('keeps every emission radius inside the annulus it was given', () => {
    let hits = 0;
    for (let ndcX = -0.95; ndcX <= 0.95; ndcX += 0.05) {
      for (const ndcY of [-0.3, 0, 0.3]) {
        const result = hit(ndcX, ndcY);
        if (result.outcome !== 'disk') continue;
        hits++;
        expect(result.emissionRadius!).toBeGreaterThanOrEqual(DEFAULT_DISK.innerRadius - 1e-9);
        expect(result.emissionRadius!).toBeLessThanOrEqual(DEFAULT_DISK.outerRadius + 1e-9);
        expect(Math.abs(result.axialImpactParameter!))
          .toBeLessThanOrEqual(maximumAxialImpact(result.emissionRadius!) + 1e-9);
      }
    }
    expect(hits).toBeGreaterThan(20);
  });

  it('shows no Doppler asymmetry when viewed face-on', () => {
    // Face-on, the orbital velocity is perpendicular to every line of sight, so g must depend on
    // emission radius alone. Any azimuthal variation here would mean a spurious Doppler term.
    const faceOn = { distance: 20, inclination: Math.PI / 2, azimuth: 0 };
    const samples: { radius: number; g: number }[] = [];
    const imageRadius = 0.5;
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * 2 * Math.PI;
      const result = traceCameraPixel(
        faceOn, FOV, imageRadius * Math.cos(angle), imageRadius * Math.sin(angle), 1, DEFAULT_DISK,
      );
      if (result.outcome === 'disk') {
        samples.push({
          radius: result.emissionRadius!,
          g: redshiftFactor(result.emissionRadius!, result.axialImpactParameter!, faceOn.distance),
        });
      }
    }
    expect(samples.length).toBeGreaterThan(5);
    const radii = samples.map(s => s.radius);
    const gs = samples.map(s => s.g);
    expect(Math.max(...radii) - Math.min(...radii)).toBeLessThan(1e-6);
    expect(Math.max(...gs) - Math.min(...gs)).toBeLessThan(1e-6);
    // And it is a redshift: gravitational plus transverse Doppler, with no approach term.
    expect(gs[0]!).toBeLessThan(1);
  });

  it('leaves a hole where the ISCO is, rather than filling the centre', () => {
    // The disk has an inner edge at the ISCO; the line of sight through the middle must not
    // report a disk hit at some smaller radius.
    const centre = traceCameraPixel(POSE, FOV, 0, 0, 1, DEFAULT_DISK);
    expect(centre.outcome).toBe('captured');
  });
});
