/** Mercury's perihelion precession at its real parameters, PHYSICS_SPEC §8 row 1.
 *
 * Every number here comes from `units.ts`. Nothing in this module is exaggerated: the animation
 * that shows the drift uses a much larger mass so the effect is visible in seconds rather than
 * millennia, and that is a property of the *view*, not of these figures.
 *
 * Framework-free, float64.
 */
import {
  ARCSECONDS_PER_RADIAN,
  C,
  DAYS_PER_JULIAN_YEAR,
  MERCURY_ECCENTRICITY,
  MERCURY_PERIOD_DAYS,
  MERCURY_SEMI_MAJOR_AXIS,
  SECONDS_PER_DAY,
  SOLAR_GM,
} from './units';

const TWO = 2;
const SIX = 6;
const YEARS_PER_CENTURY = 100;

/**
 * General-relativistic perihelion advance per orbit, radians.
 *
 *     dphi = 6 pi G M / (a (1 - e^2) c^2)
 *
 * The leading-order weak-field result. It is accurate for Mercury, where GM/(a c^2) is
 * 2.6e-8, and increasingly poor as that ratio grows — see `weakFieldParameter`.
 */
export function precessionPerOrbit(
  gravitationalParameter: number, semiMajorAxis: number, eccentricity: number,
): number {
  if (!(gravitationalParameter > 0)) throw new RangeError('GM must be positive.');
  if (!(semiMajorAxis > 0)) throw new RangeError('The semi-major axis must be positive.');
  if (!(eccentricity >= 0) || eccentricity >= 1) {
    throw new RangeError('Eccentricity must lie in [0, 1).');
  }
  const semiLatusRectum = semiMajorAxis * (1 - eccentricity * eccentricity);
  return (SIX * Math.PI * gravitationalParameter) / (semiLatusRectum * C * C);
}

/**
 * GM/(a c^2), the dimensionless field strength the formula is an expansion in.
 *
 * 2.6e-8 for Mercury. The animation runs at 0.05, where the leading-order formula is about 30%
 * low — which the UI says rather than implying the exaggerated drift confirms the real number.
 */
export function weakFieldParameter(
  gravitationalParameter: number, semiMajorAxis: number,
): number {
  return gravitationalParameter / (semiMajorAxis * C * C);
}

export const MERCURY_ORBITS_PER_CENTURY =
  (YEARS_PER_CENTURY * DAYS_PER_JULIAN_YEAR) / MERCURY_PERIOD_DAYS;

/** Mercury's advance per orbit, radians. */
export const MERCURY_PRECESSION_PER_ORBIT = precessionPerOrbit(
  SOLAR_GM, MERCURY_SEMI_MAJOR_AXIS, MERCURY_ECCENTRICITY,
);

export const MERCURY_PRECESSION_ARCSEC_PER_ORBIT =
  MERCURY_PRECESSION_PER_ORBIT * ARCSECONDS_PER_RADIAN;

/** The benchmark figure: 42.98 arcseconds per century. */
export const MERCURY_PRECESSION_ARCSEC_PER_CENTURY =
  MERCURY_PRECESSION_ARCSEC_PER_ORBIT * MERCURY_ORBITS_PER_CENTURY;

/** Mercury's field strength, GM/(a c^2) = 2.6e-8. */
export const MERCURY_WEAK_FIELD_PARAMETER =
  weakFieldParameter(SOLAR_GM, MERCURY_SEMI_MAJOR_AXIS);

/** Orbital period in seconds, for converting simulated orbits to elapsed real time. */
export const MERCURY_PERIOD_SECONDS = MERCURY_PERIOD_DAYS * SECONDS_PER_DAY;

/**
 * How long Mercury takes to accumulate a given precession, in years.
 *
 * The number that makes the exaggeration necessary: one degree of drift takes about 8,400 years.
 */
export function yearsForPrecession(radians: number): number {
  if (!(radians >= 0)) throw new RangeError('Precession must not be negative.');
  const orbits = radians / MERCURY_PRECESSION_PER_ORBIT;
  return (orbits * MERCURY_PERIOD_DAYS) / DAYS_PER_JULIAN_YEAR;
}

/** Orbits needed for a given precession, at Mercury's real parameters. */
export function orbitsForPrecession(radians: number): number {
  return radians / MERCURY_PRECESSION_PER_ORBIT;
}

export const TWO_PI = TWO * Math.PI;
