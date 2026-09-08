/** The Gullstrand-Painlevé river: flow speed, and the exact advection of a marker in it.
 *
 * PHYSICS_SPEC §5.1 and §8 row 33. The flow velocity is the metric's shift,
 * beta = -sqrt(r_s/r), which is the Newtonian escape velocity in units of c and is also the
 * radial velocity of an observer falling from rest at infinity (§5.2).
 *
 * What this module deliberately does NOT encode is any claim that the flow is physical. It is a
 * property of one slicing; §5.4 lists the six caveats and the UI carries them. The arithmetic
 * here is exact either way.
 *
 * Framework-free, float64. Radii are in r_s and speeds in c, so nothing here has a scale.
 */

const TWO = 2;
const THREE = 3;

/** r_s = 1 in these units. */
export const HORIZON = 1;

/**
 * River speed as a fraction of c: |beta| = sqrt(r_s / r).
 *
 * Exactly 1 at the horizon — that is what makes r_s the horizon in this picture (§5.3) — and
 * greater than 1 inside, which is not a causality violation because nothing moves faster than c
 * relative to the river (§5.4 point 6).
 */
export function riverSpeedOverC(radiusOverRs: number): number {
  if (!(radiusOverRs > 0)) {
    throw new RangeError('Radius must be positive; the flow diverges at r = 0.');
  }
  return Math.sqrt(HORIZON / radiusOverRs);
}

/** Radius at which the river reaches a given fraction of c. Inverts the above. */
export function radiusForSpeed(speedOverC: number): number {
  if (!(speedOverC > 0)) throw new RangeError('Speed must be positive.');
  return HORIZON / (speedOverC * speedOverC);
}

export type FlowBand = 'slow' | 'transonic' | 'horizon' | 'superluminal';

/** How close to c a marker must be to count as sitting on the horizon ring. */
const HORIZON_TOLERANCE = 0.01;
const HALF = 0.5;

/**
 * Which colour band a marker falls in. The boundaries are physical, not aesthetic: 0.5 c is
 * r = 4 r_s exactly, and 1 c is the horizon exactly.
 */
export function flowBand(speedOverC: number): FlowBand {
  if (Math.abs(speedOverC - 1) <= HORIZON_TOLERANCE) return 'horizon';
  if (speedOverC > 1) return 'superluminal';
  if (speedOverC < HALF) return 'slow';
  return 'transonic';
}

/**
 * Advect a marker inward for `dt` in units of r_s/c, exactly.
 *
 *     dr/dt = -c sqrt(r_s/r)  =>  r(t) = (r0^{3/2} - (3/2) sqrt(r_s) t)^{2/3}
 *
 * A closed form rather than a stepped integrator: the animation runs indefinitely, and Euler
 * steps on a 1/sqrt(r) field accumulate visible error exactly where the flow is fastest.
 * Returns 0 if the marker would pass the centre within the step.
 */
export function advect(radiusOverRs: number, dt: number): number {
  if (!(radiusOverRs > 0)) throw new RangeError('Radius must be positive.');
  if (!(dt >= 0)) throw new RangeError('Time step must not be negative.');
  const cubed = radiusOverRs ** (THREE / TWO) - (THREE / TWO) * dt;
  return cubed <= 0 ? 0 : cubed ** (TWO / THREE);
}

/** Time in r_s/c for a marker to fall from `from` to `to`. The inverse of `advect`. */
export function infallTime(fromRadius: number, toRadius: number): number {
  if (!(fromRadius >= toRadius) || !(toRadius >= 0)) {
    throw new RangeError('The marker falls inward: `from` must not be inside `to`.');
  }
  return (TWO / THREE) * (fromRadius ** (THREE / TWO) - toRadius ** (THREE / TWO));
}
