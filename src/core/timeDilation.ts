/** Gravitational and kinematic time dilation, PHYSICS_SPEC §8 rows 5–9 and §2.1.
 *
 * Framework-free, float64. Every function here is asserted against a published number in
 * `docs/verify_benchmarks.py` and in the unit tests beside it.
 */
import {
  C,
  EARTH_ANGULAR_VELOCITY,
  EARTH_GM,
  EARTH_MEAN_RADIUS,
  G,
  GPS_ORBIT_RADIUS,
  SECONDS_PER_DAY,
  STANDARD_GRAVITY,
  DEGREES_IN_HALF_TURN,
  SECONDS_PER_HOUR,
  NANOSECONDS_PER_SECOND,
  MICROSECONDS_PER_SECOND,
} from './units';
export { HAFELE_KEATING_EASTWARD, HAFELE_KEATING_WESTWARD, HAFELE_KEATING_PREDICTIONS } from './units';

const TWO = 2;
const THREE = 3;

/** Schwarzschild radius of a mass, metres. */
export function schwarzschildRadius(massKilograms: number): number {
  return (TWO * G * massKilograms) / C ** TWO;
}

/**
 * Schwarzschild radius from a gravitational parameter GM rather than a mass.
 *
 * GM is what is actually measured — GM_earth is known to about one part in 10^9, G itself to one
 * part in 10^5 — so anything quoted per-body should come in this way rather than through a mass.
 */
export function schwarzschildFromParameter(gravitationalParameter: number): number {
  return (TWO * gravitationalParameter) / C ** TWO;
}

/**
 * Rate of a static clock at `radius` relative to one at infinity: sqrt(1 - r_s/r).
 *
 * `radius` and `schwarzschild` share whatever length unit the caller uses — the ratio is all
 * that enters. Returns 0 at the horizon and throws inside it, where no static clock exists.
 */
export function staticClockRate(radius: number, schwarzschild: number): number {
  if (!(radius > 0) || !(schwarzschild > 0)) {
    throw new RangeError('Radius and Schwarzschild radius must be positive.');
  }
  if (radius < schwarzschild) {
    throw new RangeError('No static clock exists inside the horizon.');
  }
  return Math.sqrt(1 - schwarzschild / radius);
}

/** Ratio of two static clocks' rates, lower relative to upper. Below 1: the deeper clock is slow. */
export function clockRateRatio(lower: number, upper: number, schwarzschild: number): number {
  return staticClockRate(lower, schwarzschild) / staticClockRate(upper, schwarzschild);
}

export interface GpsOffsets {
  /** Satellite clock runs fast because it sits higher in the potential. Microseconds per day. */
  gravitational: number;
  /** Satellite clock runs slow because it moves faster. Microseconds per day. */
  kinematic: number;
  net: number;
}

/**
 * GPS clock offsets, PHYSICS_SPEC §8 rows 5–7. Satellite minus ground, microseconds per day.
 *
 * The kinematic term is a *difference*: the ground station is itself moving at R_perp * Omega,
 * and only the difference of the two v^2/2c^2 terms survives.
 */
export function gpsOffsets(
  orbitRadius = GPS_ORBIT_RADIUS,
  groundLatitudeDegrees = 0,
): GpsOffsets {
  const groundRadius = EARTH_MEAN_RADIUS;
  const satelliteSpeed = Math.sqrt(EARTH_GM / orbitRadius);
  const groundSpeed = perpendicularRadius(groundLatitudeDegrees) * EARTH_ANGULAR_VELOCITY;
  const potentialDifference = (EARTH_GM / groundRadius - EARTH_GM / orbitRadius) / C ** TWO;
  const speedDifference = -(satelliteSpeed ** TWO - groundSpeed ** TWO) / (TWO * C ** TWO);
  const perDay = SECONDS_PER_DAY * MICROSECONDS_PER_SECOND;
  return {
    gravitational: potentialDifference * perDay,
    kinematic: speedDifference * perDay,
    net: (potentialDifference + speedDifference) * perDay,
  };
}

/** Distance from the Earth's rotation axis at a given latitude. */
export function perpendicularRadius(latitudeDegrees: number): number {
  return EARTH_MEAN_RADIUS * Math.cos((latitudeDegrees * Math.PI) / DEGREES_IN_HALF_TURN);
}

export interface FlightLeg {
  heightMetres: number;
  /** Aircraft speed **over the ground**, positive eastward.
   *
   * Not the ground station's speed. PHYSICS_SPEC §8 previously wrote both kinematic terms with
   * `v_ground`, which reads as R_perp*Omega; substituting that gives a direction-independent
   * constant and the east/west asymmetry disappears entirely. */
  airSpeed: number;
  latitudeDegrees: number;
  hours: number;
}

export interface FlightOffsets {
  gravitational: number;
  kinematic: number;
  net: number;
  /** The 2 R_perp Omega v term alone. Reverses sign with direction. */
  sagnacCross: number;
  /** The v^2 term alone. Does not reverse. */
  quadratic: number;
}

/**
 * Hafele–Keating: flying clock minus ground clock, nanoseconds, PHYSICS_SPEC §8 rows 8, 9 and 19.
 *
 *     dtau/tau = g h / c^2 - (2 R_perp Omega v_air + v_air^2) / (2 c^2)
 *
 * in the non-rotating ECI frame. The ground clock's own (R_perp Omega)^2 term cancels in the
 * difference, leaving the cross term that makes east and west asymmetric.
 */
export function hafeleKeating(leg: FlightLeg): FlightOffsets {
  const perpendicular = perpendicularRadius(leg.latitudeDegrees);
  const elapsed = leg.hours * SECONDS_PER_HOUR * NANOSECONDS_PER_SECOND;
  const gravitational = (STANDARD_GRAVITY * leg.heightMetres) / C ** TWO;
  const cross = (TWO * perpendicular * EARTH_ANGULAR_VELOCITY * leg.airSpeed) / (TWO * C ** TWO);
  const quadratic = leg.airSpeed ** TWO / (TWO * C ** TWO);
  return {
    gravitational: gravitational * elapsed,
    kinematic: -(cross + quadratic) * elapsed,
    net: (gravitational - cross - quadratic) * elapsed,
    sagnacCross: cross * elapsed,
    quadratic: quadratic * elapsed,
  };
}

/** Proper time elapsed for a static observer at `radius` while `coordinateSeconds` pass far away. */
export function properTimeAt(
  radius: number,
  schwarzschild: number,
  coordinateSeconds: number,
): number {
  return staticClockRate(radius, schwarzschild) * coordinateSeconds;
}

/** Radius at which a static clock runs at a given fraction of the far-away rate.
 * Inverts sqrt(1 - r_s/r) = rate, i.e. r = r_s/(1 - rate^2). */
export function radiusForClockRate(rate: number, schwarzschild: number): number {
  if (!(rate > 0) || rate >= 1) {
    throw new RangeError('Clock rate must lie strictly between 0 and 1.');
  }
  return schwarzschild / (1 - rate ** TWO);
}

/** 3/2, as it appears in both the circular-orbit rate and the break-even radius. */
const THREE_HALVES = 1.5;

/**
 * Rate of a clock on a **circular geodesic orbit** at `radius`, relative to one at infinity:
 * sqrt(1 - 3GM/(rc^2)) = sqrt(1 - 1.5 r_s/r). PHYSICS_SPEC §2.8, §8 row 40.
 *
 * Exact in Schwarzschild coordinate time, not a weak-field expansion: substituting the exact
 * Omega^2 = GM/r^3 into sqrt(1 - r_s/r - r^2 Omega^2/c^2) collapses the two terms into one.
 * It vanishes at r = 3GM/c^2 = 1.5 r_s, the photon sphere, where circular timelike orbits stop
 * existing — a factor of two astray in that denominator puts the zero inside the horizon, which
 * is the quickest way to check the expression.
 */
export function circularClockRate(radius: number, schwarzschild: number): number {
  if (!(radius > 0) || !(schwarzschild > 0)) {
    throw new RangeError('Radius and Schwarzschild radius must be positive.');
  }
  if (radius <= THREE_HALVES * schwarzschild) {
    throw new RangeError('No circular timelike orbit exists at or inside the photon sphere.');
  }
  return Math.sqrt(1 - (THREE_HALVES * schwarzschild) / radius);
}

/**
 * Radius at which an orbiting clock ticks at the same rate as a static clock at `staticRadius`.
 *
 * 1 - 3GM/r_B c^2 = 1 - 2GM/r_A c^2 gives r_B = 1.5 r_A exactly, independent of the mass. Below
 * it the orbiting clock loses, above it gains; GPS is above, the ISS is below.
 */
export function breakEvenRadius(staticRadius: number): number {
  return THREE_HALVES * staticRadius;
}

/**
 * (orbiting rate) - (static rate), computed without catastrophic cancellation.
 *
 * Both rates are 1 - 1e-9 around the Earth, so subtracting them directly throws away nine of the
 * sixteen digits before the answer starts. The difference of squares is exact and its numerator
 * is a difference of two quantities that are themselves small, so nothing is lost:
 *
 *     rate_B - rate_A = (rate_B^2 - rate_A^2)/(rate_B + rate_A)
 *                     = (r_s/r_A - 1.5 r_s/r_B)/(rate_A + rate_B)
 *
 * Positive: the orbiting clock gains. Zero exactly at r_B = 1.5 r_A.
 */
export function clockRateDifference(
  staticRadius: number, orbitRadius: number, schwarzschild: number,
): number {
  const rateA = staticClockRate(staticRadius, schwarzschild);
  const rateB = circularClockRate(orbitRadius, schwarzschild);
  const numerator = schwarzschild / staticRadius - (THREE_HALVES * schwarzschild) / orbitRadius;
  return numerator / (rateA + rateB);
}

/**
 * Microseconds the orbiting clock gains on the static one per day of **coordinate** time.
 *
 * Coordinate rather than either proper time, because that is the frame in which "per day" is
 * unambiguous for both clocks at once; the two choices differ by one part in 10^9 of an already
 * microsecond-sized number.
 */
export function clockDriftPerDay(
  staticRadius: number, orbitRadius: number, schwarzschild: number,
): number {
  return clockRateDifference(staticRadius, orbitRadius, schwarzschild)
    * SECONDS_PER_DAY * MICROSECONDS_PER_SECOND;
}

/** Coordinate angular velocity of a circular orbit, sqrt(GM/r^3). Exact in Schwarzschild t. */
export function orbitAngularVelocity(radius: number, gravitationalParameter: number): number {
  return Math.sqrt(gravitationalParameter / radius ** THREE);
}
