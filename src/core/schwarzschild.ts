/** Schwarzschild geometry: critical radii, normalization conversion, and the ray-launch
 * conditions the renderer needs. Framework-free, float64, PHYSICS_SPEC §2.
 *
 * Two normalizations exist and must never be mixed within a module (§6.5):
 *   M = 1    in the physics core   -> r_s = 2,   r_photon = 3,   r_ISCO = 6,   b_crit = 3*sqrt(3)
 *   r_s = 1  in shaders            -> M = 1/2,   r_photon = 1.5, r_ISCO = 3,   b_crit = 3*sqrt(3)/2
 * Everything below is stated in r_s = 1 units, because that is what the renderer consumes and
 * because the horizon test is then simply r <= 1. `massLengthToSchwarzschild` in units.ts is the
 * one conversion function.
 */

const TWO = 2;
const THREE = 3;

/** Event horizon. The defining choice of this normalization. */
export const HORIZON_RADIUS = 1;

/** Unstable circular photon orbit, 3GM/c^2 = 1.5 r_s. */
export const PHOTON_SPHERE_RADIUS = THREE / TWO;

/** Innermost stable circular orbit, 6GM/c^2 = 3 r_s. */
export const ISCO_RADIUS = THREE;

/** Mass in r_s = 1 units: r_s = 2M, so M = 1/2. */
export const MASS = HORIZON_RADIUS / TWO;

/** Critical impact parameter, b_crit = 3*sqrt(3) M = 3*sqrt(3)/2 r_s ~ 2.598076.
 * A ray with b < b_crit is captured; b > b_crit escapes. This is the shadow edge, and
 * reproducing it off a rendered frame is the Phase 1 acceptance test. */
export const CRITICAL_IMPACT_PARAMETER = THREE * Math.sqrt(THREE) * MASS;

/** Angular radius of the shadow for a static observer at coordinate radius `distance`.
 *
 * A photon leaving a static observer at r at angle theta to the outward radial direction has
 * impact parameter b = r sin(theta) / sqrt(1 - r_s/r). Setting b = b_crit and inverting gives the
 * edge of the shadow. Returns radians.
 */
export function shadowAngularRadius(distance: number): number {
  requireOutsideHorizon(distance);
  const sine = CRITICAL_IMPACT_PARAMETER * Math.sqrt(1 - HORIZON_RADIUS / distance) / distance;
  if (sine > 1) {
    // Inside r = 1.5 r_s the shadow covers more than a hemisphere and no real angle exists.
    throw new RangeError('The shadow subtends more than a hemisphere at this radius.');
  }
  return Math.asin(sine);
}

/** Physical impact parameter of a ray a static observer at `distance` sees at angle `theta`
 * from the outward radial direction. PHYSICS_SPEC §2.2. */
export function impactParameter(distance: number, theta: number): number {
  requireOutsideHorizon(distance);
  return distance * Math.sin(theta) / Math.sqrt(1 - HORIZON_RADIUS / distance);
}

/** Convert a physical impact parameter to the flat-Cartesian system's conserved h.
 *
 * **These are not the same number**, and conflating them is the easiest way to render a
 * plausible-looking but wrong image. The flat system (§2.3) has first integral
 * (du/dphi)^2 = 1/h^2 - u^2, while the real null geodesic (§2.2) has
 * (du/dphi)^2 = 1/b^2 - u^2 + 2Mu^3. Equating them at the launch radius r = 1/u0 gives
 *
 *     1/h^2 = 1/b^2 + 2M u0^3 = 1/b^2 + r_s/D^3
 *
 * The two agree only as D -> infinity. At D = 20 r_s the correction is 0.042% of b -- small, but
 * exact and free, so there is no reason to drop it.
 *
 * Do not confuse this with the larger correction next to it. Going from a static observer's
 * viewing angle to b carries a factor sqrt(1 - r_s/D) (see `impactParameter`), which at D = 20
 * is 2.5% -- and *that* is the one worth several pixels in the rendered shadow. A renderer that
 * launches flat rays straight down the pixel direction, as the naive reading of §2.3 invites,
 * gets that factor wrong and lands the shadow edge visibly off 3*sqrt(3)M.
 */
export function impactParameterToFlatH(impact: number, distance: number): number {
  requireOutsideHorizon(distance);
  if (!(impact > 0)) throw new RangeError('Impact parameter must be positive.');
  return 1 / Math.sqrt(1 / impact ** TWO + TWO * MASS / distance ** THREE);
}

/** Sine of the flat-space launch angle reproducing a physical viewing angle `theta`
 * for a static observer at `distance`. The renderer builds its ray from this. */
export function flatLaunchSine(distance: number, theta: number): number {
  const impact = impactParameter(distance, theta);
  if (impact === 0) return 0;
  return impactParameterToFlatH(impact, distance) / distance;
}

function requireOutsideHorizon(distance: number) {
  if (!Number.isFinite(distance) || distance <= HORIZON_RADIUS) {
    throw new RangeError('Radius must be finite and outside the horizon.');
  }
}
