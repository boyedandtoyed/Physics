/** Light and particle deflection, decomposed into its time- and space-curvature halves.
 *
 * PHYSICS_SPEC §7.4 Claim A and §8 rows 2-3. This is the numerical core of the exhibit that
 * settles "time dilation causes gravity": the claim is exactly right in the slow limit and
 * exactly half right for light, and the factor of 2 between 0.8756" and 1.7512" is the
 * measurement that says so.
 *
 * Framework-free, float64.
 */
import {
  APPLE_SPEED,
  ARCSECONDS_PER_RADIAN,
  C,
  ISS_ORBITAL_SPEED,
  MERCURY_ORBITAL_SPEED,
  SOLAR_GM,
  SOLAR_RADIUS,
} from './units';

const TWO = 2;

/** General relativity's value for the PPN space-curvature coefficient. */
export const GR_PPN_GAMMA = 1;
/** Einstein's 1911 calculation had no spatial curvature at all. */
export const EINSTEIN_1911_PPN_GAMMA = 0;
/** Cassini: gamma - 1 = (2.1 +/- 2.3)e-5. Bertotti, Iess & Tortora 2003. */
export const CASSINI_GAMMA_OFFSET = 2.1e-5;
export const CASSINI_GAMMA_UNCERTAINTY = 2.3e-5;

/**
 * Above this deflection the linearized formula is no longer describing a deflection.
 *
 * §7.4: at 0.01 rad the linearization still agrees with the exact Newtonian hyperbola to 0.02%,
 * and by an order of magnitude further down in beta it is wrong by a factor of 135. The slow end
 * of the slider is *outside* this band by many orders of magnitude, and the UI says so rather
 * than drawing a number it knows is meaningless.
 */
export const WEAK_DEFLECTION_LIMIT_RADIANS = 0.01;

export interface DeflectionGeometry {
  /** GM of the deflector, m^3/s^2. Defaults to the Sun. */
  gm?: number;
  /** Impact parameter, m. Defaults to the solar radius — the classic grazing ray. */
  impactParameter?: number;
  /** PPN space-curvature coefficient. 1 is general relativity, 0 is Einstein 1911. */
  ppnGamma?: number;
}

export interface DeflectionTerms {
  /** Contribution of g_00 alone, radians. Einstein's 1911 value at beta = 1. Diverges as beta -> 0. */
  timeCurvature: number;
  /** Contribution of the spatial metric, radians. **Independent of beta** — §7.4's actual point:
   * it is the time term that blows up for slow particles, not the space term that vanishes. */
  spaceCurvature: number;
  /** Their sum, radians. */
  total: number;
  /** spaceCurvature / timeCurvature. Equals gamma * beta^2 — the ratio column of §7.4's table. */
  spaceOverTime: number;
  /** False where `total` exceeds the linearization's domain and means nothing physically. */
  weakDeflectionValid: boolean;
}

/** The scale 2GM/c^2b that both terms are built from. Radians. */
export function deflectionScale(geometry: DeflectionGeometry = {}): number {
  const { gm = SOLAR_GM, impactParameter = SOLAR_RADIUS } = geometry;
  if (!(gm > 0) || !(impactParameter > 0)) {
    throw new RangeError('GM and impact parameter must be positive.');
  }
  return (TWO * gm) / (C ** TWO * impactParameter);
}

/**
 * Deflection of a particle of speed `beta` = v/c, split into its two curvature contributions.
 *
 *     alpha(beta, gamma) = (2GM/c^2 b) (1/beta^2 + gamma)
 *
 * PHYSICS_SPEC §7.4. Weak field and small deflection; see `weakDeflectionValid`.
 */
export function deflection(beta: number, geometry: DeflectionGeometry = {}): DeflectionTerms {
  if (!(beta > 0) || beta > 1) {
    throw new RangeError('beta = v/c must lie in (0, 1].');
  }
  const { ppnGamma = GR_PPN_GAMMA } = geometry;
  const scale = deflectionScale(geometry);
  const timeCurvature = scale / beta ** TWO;
  const spaceCurvature = scale * ppnGamma;
  const total = timeCurvature + spaceCurvature;
  return {
    timeCurvature,
    spaceCurvature,
    total,
    spaceOverTime: spaceCurvature / timeCurvature,
    weakDeflectionValid: total <= WEAK_DEFLECTION_LIMIT_RADIANS,
  };
}

/**
 * The exact Newtonian hyperbolic deflection for the same encounter: tan(alpha/2) = GM/(b v^2).
 *
 * Present so the interactive can show *where* the linearized time term stops being a deflection
 * rather than merely asserting that it does. §7.4: the two agree to 0.02% at 0.01 rad and differ
 * by a factor of 2 at beta = 9.542e-4.
 */
export function exactNewtonianDeflection(beta: number, geometry: DeflectionGeometry = {}): number {
  if (!(beta > 0) || beta > 1) {
    throw new RangeError('beta = v/c must lie in (0, 1].');
  }
  return TWO * Math.atan(deflectionScale(geometry) / (TWO * beta ** TWO));
}

/** Speed below which the linearized total leaves the weak-deflection band, as beta. */
export function weakDeflectionBetaThreshold(geometry: DeflectionGeometry = {}): number {
  const { ppnGamma = GR_PPN_GAMMA } = geometry;
  const scale = deflectionScale(geometry);
  const headroom = WEAK_DEFLECTION_LIMIT_RADIANS - scale * ppnGamma;
  if (headroom <= 0) return 1;
  return Math.min(1, Math.sqrt(scale / headroom));
}

export function radiansToArcseconds(radians: number): number {
  return radians * ARCSECONDS_PER_RADIAN;
}

/** §7.4's table of representative speeds, as beta. The ratio column is beta^2. */
export const DEFLECTION_PRESETS = [
  { id: 'apple', label: 'Falling apple', speed: APPLE_SPEED, note: '~10 m/s' },
  { id: 'iss', label: 'ISS in orbit', speed: ISS_ORBITAL_SPEED, note: '7.7 km/s' },
  { id: 'mercury', label: 'Mercury', speed: MERCURY_ORBITAL_SPEED, note: '47.9 km/s' },
  { id: 'light', label: 'Light', speed: C, note: 'c' },
] as const;
