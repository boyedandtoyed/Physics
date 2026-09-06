/** Float64 CPU reference for the Schwarzschild null-geodesic raymarcher.
 *
 * This is the same algorithm the fragment shader runs, in double precision and without a GPU:
 * the flat-Cartesian formulation of PHYSICS_SPEC §2.3 with RK4 and the adaptive stepping of §4.2.
 * It exists so the integration can be tested against b_crit and the deflection law without a
 * browser, and so a shader regression can be bisected against a trustworthy baseline.
 *
 * Units are r_s = 1 throughout (§6.5): the horizon is r = 1 and capture is simply r <= 1.
 */
import {
  HORIZON_RADIUS,
  MASS,
  PHOTON_SPHERE_RADIUS,
  flatLaunchSine,
} from '../../../core/schwarzschild';

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

export type RayOutcome = 'captured' | 'escaped' | 'exhausted';

export interface RayResult {
  outcome: RayOutcome;
  /** Unit direction the ray is travelling at termination. Meaningful when escaped. */
  direction: readonly [number, number, number];
  /** Closest approach reached, useful for diagnostics. */
  periapsis: number;
  steps: number;
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

/** Integrate one null geodesic from `position` with unit velocity `velocity`.
 * `hSquared` is |r x v|^2 evaluated once at launch and held fixed, per §2.3. */
export function traceRay(position: readonly number[], velocity: readonly number[]): RayResult {
  const p: Vec3 = [position[0]!, position[1]!, position[2]!];
  const v: Vec3 = [velocity[0]!, velocity[1]!, velocity[2]!];
  const hSquared = dot(cross(p, v), cross(p, v));
  let periapsis = norm(p);

  // rdd = -3M h^2 * r_vec / r^5   (equivalently -3M h^2 rhat/r^4)
  const accelerate = (q: Vec3, out: Vec3) => {
    const r = norm(q);
    const factor = -FORCE_COEFFICIENT * hSquared / r ** (THREE + TWO);
    out[0] = factor * q[0];
    out[1] = factor * q[1];
    out[2] = factor * q[2];
  };

  const a1: Vec3 = [0, 0, 0], a2: Vec3 = [0, 0, 0], a3: Vec3 = [0, 0, 0], a4: Vec3 = [0, 0, 0];
  const tmp: Vec3 = [0, 0, 0];

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

    const h = adaptiveStep(r);
    // Classical RK4 on the second-order system, state (p, v).
    accelerate(p, a1);
    for (let i = 0; i < THREE; i++) tmp[i] = p[i]! + HALF * h * v[i]!;
    accelerate(tmp, a2);
    for (let i = 0; i < THREE; i++) tmp[i] = p[i]! + HALF * h * (v[i]! + HALF * h * a1[i]!);
    accelerate(tmp, a3);
    for (let i = 0; i < THREE; i++) tmp[i] = p[i]! + h * (v[i]! + HALF * h * a2[i]!);
    accelerate(tmp, a4);
    for (let i = 0; i < THREE; i++) {
      p[i] = p[i]! + h * (v[i]! + h * (a1[i]! + a2[i]! + a3[i]!) / (THREE * TWO));
      v[i] = v[i]! + h * (a1[i]! + TWO * a2[i]! + TWO * a3[i]! + a4[i]!) / (THREE * TWO);
    }
  }
  return { outcome: 'exhausted', direction: [v[0], v[1], v[2]], periapsis, steps: MAX_STEPS };
}

/** Trace the ray a static observer at `distance` sees at angle `theta` from the direction
 * pointing away from the hole. Applies the b -> h conversion of §2.3, which is what makes the
 * rendered shadow land on 3*sqrt(3)M rather than ~1.7% off it. */
export function traceViewingAngle(distance: number, theta: number): RayResult {
  // Observer on +x, looking generally inward. Outward radial is +x, tangential is +y.
  const sineFlat = flatLaunchSine(distance, theta);
  const cosineFlat = Math.sqrt(Math.max(0, 1 - sineFlat * sineFlat));
  // theta is measured from the outward radial direction, so theta > pi/2 points inward.
  const radialSign = Math.cos(theta) >= 0 ? 1 : -1;
  return traceRay([distance, 0, 0], [radialSign * cosineFlat, sineFlat, 0]);
}
