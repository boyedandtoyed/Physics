/** Float64 CPU reference for the Schwarzschild null-geodesic raymarcher.
 *
 * This is the same algorithm the fragment shader runs, in double precision and without a GPU:
 * the flat-Cartesian formulation of PHYSICS_SPEC §2.3 with RK4 and the adaptive stepping of §4.2.
 * It exists so the integration can be tested against b_crit and the deflection law without a
 * browser, and so a shader regression can be bisected against a trustworthy baseline.
 *
 * Units are r_s = 1 throughout (§6.5): the horizon is r = 1 and capture is simply r <= 1.
 * The accretion disk lies in the y = 0 plane and orbits with angular velocity along +y.
 */
import {
  HORIZON_RADIUS,
  ISCO_RADIUS,
  MASS,
  PHOTON_SPHERE_RADIUS,
  flatLaunchSine,
} from '../../../core/schwarzschild';
import { cameraFrame, launchVelocity, viewDirection, type CameraPose } from './camera';

const TWO = 2;
const THREE = 3;
const HALF = 0.5;

/** Force coefficient in rdd = -3M h^2 rhat/r^4, PHYSICS_SPEC §2.3.
 * 3M = 1.5 in r_s = 1 units. The literal r^5 form in older revisions of the spec was wrong. */
const FORCE_COEFFICIENT = THREE * MASS;

/** Adaptive stepping, §4.2. The spec states the heuristic for the u-phi formulation as
 * dphi = C/(1 + K u); the Cartesian analogue must also grow with r or the far field costs
 * unbounded steps, hence the leading factor of r. */
const STEP_SCALE = 0.16;
const STEP_INVERSE_RADIUS_WEIGHT = 1;
/** Gaussian narrowing across the photon sphere, where trajectories turn most sharply. */
const PHOTON_SPHERE_U = HORIZON_RADIUS / PHOTON_SPHERE_RADIUS;
const NARROWING_DEPTH = 0.7;
const NARROWING_WIDTH = 12;

/** Escape radius. Beyond this and moving outward, a ray is asymptotically straight. */
const FAR_RADIUS = 4000;
const MAX_STEPS = 100_000;
/** Secant iterations used to land the disk crossing on y = 0. Three is ample: the residual
 * falls below 1e-12 in practice, far under the accuracy of the step itself. */
const CROSSING_REFINEMENTS = THREE;

export type RayOutcome = 'captured' | 'escaped' | 'exhausted' | 'disk';

export interface DiskGeometry {
  innerRadius: number;
  outerRadius: number;
}

/** Outer edge of the modelled disk, r_s units. Beyond this the Novikov-Thorne flux is negligible
 * and the thin-disk assumptions weaken; the cut is a modelling choice, stated in the UI. */
const DEFAULT_DISK_OUTER_RADIUS = 12;
export const DEFAULT_DISK: DiskGeometry = {
  innerRadius: ISCO_RADIUS,
  outerRadius: DEFAULT_DISK_OUTER_RADIUS,
};

export interface RayResult {
  outcome: RayOutcome;
  /** Unit direction the ray is travelling at termination. Meaningful when escaped. */
  direction: readonly [number, number, number];
  /** Closest approach reached, useful for diagnostics. */
  periapsis: number;
  steps: number;
  /** Cylindrical emission radius, set when `outcome` is 'disk'. */
  emissionRadius?: number;
  /** b_phi = L_z/E of the *physical* photon (disk -> camera), set when `outcome` is 'disk'.
   * Positive is the prograde, approaching side. */
  axialImpactParameter?: number;
}

type Vec3 = [number, number, number];

const cross = (a: readonly number[], b: readonly number[]): Vec3 => [
  a[1]! * b[2]! - a[2]! * b[1]!,
  a[2]! * b[0]! - a[0]! * b[2]!,
  a[0]! * b[1]! - a[1]! * b[0]!,
];
const norm = (v: readonly number[]) => Math.hypot(v[0]!, v[1]!, v[2]!);
const dot = (a: readonly number[], b: readonly number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;

/** Step length at radius r, mirroring the shader exactly. */
export function adaptiveStep(radius: number): number {
  const u = HORIZON_RADIUS / radius;
  const base = STEP_SCALE * radius / (1 + STEP_INVERSE_RADIUS_WEIGHT * u);
  const offset = u - PHOTON_SPHERE_U;
  return base * (1 - NARROWING_DEPTH * Math.exp(-NARROWING_WIDTH * offset * offset));
}

/** One RK4 step of rdd = -3M h^2 r/r^5, written out of place so it can be retried. */
function rk4Step(p: Vec3, v: Vec3, dl: number, hSquared: number): { p: Vec3; v: Vec3 } {
  const accelerate = (q: Vec3): Vec3 => {
    const r = norm(q);
    const factor = -FORCE_COEFFICIENT * hSquared / r ** (THREE + TWO);
    return [factor * q[0], factor * q[1], factor * q[2]];
  };
  const a1 = accelerate(p);
  const a2 = accelerate([0, 1, 2].map(i => p[i]! + HALF * dl * v[i]!) as Vec3);
  const a3 = accelerate([0, 1, 2].map(i => p[i]! + HALF * dl * (v[i]! + HALF * dl * a1[i]!)) as Vec3);
  const a4 = accelerate([0, 1, 2].map(i => p[i]! + dl * (v[i]! + HALF * dl * a2[i]!)) as Vec3);
  return {
    p: [0, 1, 2].map(i => p[i]! + dl * (v[i]! + dl * (a1[i]! + a2[i]! + a3[i]!) / (THREE * TWO))) as Vec3,
    v: [0, 1, 2].map(i => v[i]! + dl * (a1[i]! + TWO * a2[i]! + TWO * a3[i]! + a4[i]!) / (THREE * TWO)) as Vec3,
  };
}

/** Integrate one null geodesic from `position` with unit velocity `velocity`.
 *
 * `disk` is optional; when given, the first crossing of the y = 0 plane that lands between the
 * inner and outer radii terminates the ray. Crossings outside that annulus are ignored, which is
 * what produces the secondary image arcing over the top of the hole.
 */
export function traceRay(
  position: readonly number[],
  velocity: readonly number[],
  disk?: DiskGeometry,
): RayResult {
  let p: Vec3 = [position[0]!, position[1]!, position[2]!];
  let v: Vec3 = [velocity[0]!, velocity[1]!, velocity[2]!];
  const hVector = cross(p, v);
  const hSquared = dot(hVector, hVector);
  const hLength = Math.sqrt(hSquared);
  let periapsis = norm(p);

  for (let step = 0; step < MAX_STEPS; step++) {
    const r = norm(p);
    periapsis = Math.min(periapsis, r);
    if (r <= HORIZON_RADIUS) {
      return { outcome: 'captured', direction: [v[0], v[1], v[2]], periapsis, steps: step };
    }
    if (r > FAR_RADIUS && dot(p, v) > 0) {
      const speed = norm(v);
      return {
        outcome: 'escaped',
        direction: [v[0] / speed, v[1] / speed, v[2] / speed],
        periapsis,
        steps: step,
      };
    }

    const dl = adaptiveStep(r);
    const next = rk4Step(p, v, dl, hSquared);

    if (disk && p[1] !== 0 && Math.sign(next.p[1]) !== Math.sign(p[1])) {
      // Land exactly on the plane by secant iteration on the step length, then test the annulus.
      let lo = 0;
      let hi = dl;
      let landing = next;
      for (let i = 0; i < CROSSING_REFINEMENTS; i++) {
        const guess = lo + (hi - lo) * (Math.abs(p[1]) / (Math.abs(p[1]) + Math.abs(landing.p[1])));
        landing = rk4Step(p, v, guess, hSquared);
        if (Math.sign(landing.p[1]) === Math.sign(p[1])) lo = guess; else hi = guess;
      }
      const cylindrical = Math.hypot(landing.p[0], landing.p[2]);
      if (cylindrical >= disk.innerRadius && cylindrical <= disk.outerRadius) {
        return {
          outcome: 'disk',
          direction: [landing.v[0], landing.v[1], landing.v[2]],
          periapsis: Math.min(periapsis, norm(landing.p)),
          steps: step,
          emissionRadius: cylindrical,
          axialImpactParameter: axialImpactFromFlatH(hVector, hLength, norm(position)),
        };
      }
    }
    p = next.p;
    v = next.v;
  }
  return { outcome: 'exhausted', direction: [v[0], v[1], v[2]], periapsis, steps: MAX_STEPS };
}

/** b_phi = L_z/E for the *physical* photon travelling disk -> camera.
 *
 * We integrate backwards, so the traced velocity is the reverse of the physical photon's and the
 * conserved h flips sign with it: L_z(physical) = -L_z(traced). Getting this wrong puts the
 * bright crescent on the wrong side of the image, which is why there is a geometric test for it
 * rather than only a comparison against this same code.
 */
function axialImpactFromFlatH(hVector: Vec3, hLength: number, launchRadius: number): number {
  if (hLength === 0) return 0;
  const total = totalImpactFromFlatH(hLength, launchRadius);
  return -total * (hVector[1] / hLength);
}

/** Invert 1/h^2 = 1/b^2 + 2M/D^3 for b. */
export function totalImpactFromFlatH(hLength: number, launchRadius: number): number {
  const inverseSquared = 1 / (hLength * hLength) - TWO * MASS / launchRadius ** THREE;
  return inverseSquared <= 0 ? Number.POSITIVE_INFINITY : 1 / Math.sqrt(inverseSquared);
}

/** Trace the ray a static observer at `distance` sees at angle `theta` from the direction
 * pointing away from the hole. Applies the b -> h conversion of §2.3, which is what makes the
 * rendered shadow land on 3*sqrt(3)M rather than ~1.7% off it. */
export function traceViewingAngle(distance: number, theta: number, disk?: DiskGeometry): RayResult {
  // Observer on +x, looking generally inward. Outward radial is +x, tangential is +y.
  const sineFlat = flatLaunchSine(distance, theta);
  const cosineFlat = Math.sqrt(Math.max(0, 1 - sineFlat * sineFlat));
  // theta is measured from the outward radial direction, so theta > pi/2 points inward.
  const radialSign = Math.cos(theta) >= 0 ? 1 : -1;
  return traceRay([distance, 0, 0], [radialSign * cosineFlat, sineFlat, 0], disk);
}

/** Trace the ray the shader casts for one pixel. This is the float64 twin of the shader's
 * main(): identical camera basis, identical launch conversion, identical integration. The
 * acceptance harness compares the two per pixel, so any divergence is a real defect in one of
 * them rather than a difference of formulation. */
export function traceCameraPixel(
  pose: CameraPose,
  fieldOfViewDegrees: number,
  ndcX: number,
  ndcY: number,
  aspect: number,
  disk?: DiskGeometry,
): RayResult {
  const frame = cameraFrame(pose);
  const direction = viewDirection(frame, ndcX, ndcY, aspect, fieldOfViewDegrees);
  return traceRay(frame.position, launchVelocity(frame.position, direction), disk);
}
