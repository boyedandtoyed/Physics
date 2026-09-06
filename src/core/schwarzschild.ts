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

// ---------------------------------------------------------------------------------------------
// Accretion disk, PHYSICS_SPEC §4.3. Still r_s = 1 units, so M = 1/2 and r_ISCO = 3.
//
// The published Novikov-Thorne formulae are written in M = 1 units, where r_ISCO = 6. Mixing the
// two is exactly what §6.5 warns about, so the conversion happens once, here, in `toMassUnits`.
// ---------------------------------------------------------------------------------------------

const SQRT_THREE = Math.sqrt(THREE);
const SQRT_SIX = Math.sqrt(THREE * TWO);
/** Radius in M = 1 units, given a radius in r_s = 1 units. r_s = 2M, so r/M = 2r. */
const toMassUnits = (radius: number) => radius * TWO;

/** Keplerian angular velocity of a circular equatorial orbit, Omega = sqrt(M/r^3). */
export function orbitalAngularVelocity(radius: number): number {
  requireOutsideHorizon(radius);
  return Math.sqrt(MASS / radius ** THREE);
}

/** Specific energy of a circular equatorial orbit, E = (1 - r_s/r)/sqrt(1 - 3M/r).
 * At the ISCO this is sqrt(8/9), so 1 - E is the 5.7191% radiative efficiency of §2.4. */
export function circularOrbitEnergy(radius: number): number {
  requireCircularOrbitExists(radius);
  return (1 - HORIZON_RADIUS / radius) / Math.sqrt(1 - THREE * MASS / radius);
}

/** Redshift factor g = nu_obs/nu_em for a circular Keplerian emitter seen by a static observer.
 *
 *     g = sqrt(1 - 3M/r_em) / [ (1 - Omega b_phi) sqrt(1 - r_s/r_obs) ]
 *
 * `axialImpactParameter` is b_phi = L_z/E, the photon's angular momentum **about the disk axis**
 * per unit energy — not the total impact parameter that sets the shadow. b_phi > 0 is the
 * prograde, approaching side. PHYSICS_SPEC §4.3 derives this and checks it against the
 * g_grav * Doppler factorisation to 5e-16; the closed form is used because it needs no local
 * frame transformation.
 */
export function redshiftFactor(
  emissionRadius: number,
  axialImpactParameter: number,
  observerRadius: number,
): number {
  requireCircularOrbitExists(emissionRadius);
  requireOutsideHorizon(observerRadius);
  const denominator = 1 - orbitalAngularVelocity(emissionRadius) * axialImpactParameter;
  if (denominator <= 0) return Number.POSITIVE_INFINITY;
  return Math.sqrt(1 - THREE * MASS / emissionRadius)
    / (denominator * Math.sqrt(1 - HORIZON_RADIUS / observerRadius));
}

/** Dimensionless Novikov-Thorne flux profile, Page & Thorne 1974, specialised to Schwarzschild.
 *
 * The emitted flux is F(r) = Mdot/(4 pi M^2) * this. Returns 0 at and inside the ISCO, which is
 * the zero-torque inner boundary condition.
 *
 * **This is not the Shakura-Sunyaev [1 - sqrt(r_in/r)] profile.** That Newtonian form
 * over-radiates by 43% and implies an 8.33% radiative efficiency, contradicting §2.4's 5.7191%.
 * See `DECISIONS.md`.
 */
export function novikovThorneFlux(radius: number): number {
  if (!(radius > ISCO_RADIUS)) return 0;
  const r = toMassUnits(radius);
  const antiderivative = (x: number) =>
    x - (SQRT_THREE / TWO) * Math.log((x - SQRT_THREE) / (x + SQRT_THREE));
  const integral = antiderivative(Math.sqrt(r)) - antiderivative(SQRT_SIX);
  // r^(5/2) written as r^2 * sqrt(r): the exponent is 2.5, and an earlier arithmetic
  // dodge around the lint rule made it 4, which the luminosity identity caught at once.
  return (THREE / TWO) / (r ** TWO * Math.sqrt(r) * (r - THREE)) * integral;
}

/** Peak of the dimensionless NT flux, at r = 9.55M = 4.775 r_s. Computed once by scan rather
 * than hard-coded, so it tracks any change to the profile. */
const PEAK_SCAN_OUTER_RADIUS = 60;
const PEAK_SCAN_STEP = 0.001;
export const NT_PEAK_FLUX = (() => {
  let best = 0;
  for (let r = ISCO_RADIUS; r < PEAK_SCAN_OUTER_RADIUS; r += PEAK_SCAN_STEP) {
    best = Math.max(best, novikovThorneFlux(r));
  }
  return best;
})();

/** Effective temperature profile, normalised so its peak is 1. The absolute scale depends on
 * Mdot and M, which are not modelled; the shape is what the physics fixes. T ~ F^(1/4). */
export function novikovThorneTemperature(radius: number, peakFlux = NT_PEAK_FLUX): number {
  const flux = novikovThorneFlux(radius);
  return flux <= 0 ? 0 : (flux / peakFlux) ** (1 / (TWO + TWO));
}

function requireCircularOrbitExists(radius: number) {
  requireOutsideHorizon(radius);
  if (radius <= THREE * MASS) {
    throw new RangeError('No circular orbit exists at or inside the photon sphere.');
  }
}
