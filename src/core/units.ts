/** SI constants, CODATA 2022: https://physics.nist.gov/cuu/Constants/
 * Astronomical reference values follow PHYSICS_SPEC §1, not CODATA measurements.
 * JS numbers and all CPU integrator buffers use IEEE-754 float64.
 */
export const C = 299_792_458; // m/s, exact
export const H = 6.626_070_15e-34; // J s, exact
export const HBAR = H / (2 * Math.PI); // Exact definition; float64 representation
export const ELEMENTARY_CHARGE = 1.602_176_634e-19; // C, exact
export const BOLTZMANN = 1.380_649e-23; // J/K, exact
export const G = 6.674_30e-11; // m^3 kg^-1 s^-2, measured
export const ELECTRON_MASS = 9.109_383_7139e-31; // kg
export const ELECTRON_REST_ENERGY_EV = ELECTRON_MASS * C ** 2 / ELEMENTARY_CHARGE;
export const FINE_STRUCTURE = 7.297_352_5643e-3;
export const SOLAR_MASS = 1.988_4e30; // kg, rounded reference mass
export const SOLAR_GM = 1.327_124_400_18e20; // m^3/s^2; do not reconstruct from rounded mass
export const SOLAR_RADIUS = 6.957e8; // m
export const SOLAR_GEOMETRIC_LENGTH = SOLAR_GM / C ** 2; // m

/** Convert a dimensionless length from M=1 core units to r_s=1 shader units. */
export function massLengthToSchwarzschild(length: number): number {
  return length / 2;
}

/** Earth and GPS reference values, for the time-dilation benchmarks of PHYSICS_SPEC §8.
 * These are defining or conventional values, not measurements to be re-derived here. */

/** Geocentric gravitational constant, WGS-84 / IERS. m^3 s^-2. */
export const EARTH_GM = 3.986_004_418e14;
/** Mean radius, IUGG. m. The Hafele-Keating geometry needs the distance from the rotation
 * axis, R_earth * cos(latitude), not this value directly. */
export const EARTH_MEAN_RADIUS = 6.371e6;
/** Sidereal rotation rate, IERS. rad/s. */
export const EARTH_ANGULAR_VELOCITY = 7.292_115e-5;
/** Standard gravity, exact by definition (CGPM 1901). m/s^2. */
export const STANDARD_GRAVITY = 9.806_65;
/** GPS orbital semi-major axis, m. Twelve-hour orbit. */
export const GPS_ORBIT_RADIUS = 26_562_000;
/** Seconds in a day, for expressing clock offsets per day. */
export const SECONDS_PER_DAY = 86_400;
/** Days in a Julian year, the IAU definition. Exact by convention. */
export const DAYS_PER_JULIAN_YEAR = 365.25;
export const SECONDS_PER_HOUR = 3600;
export const NANOSECONDS_PER_SECOND = 1e9;
export const MICROSECONDS_PER_SECOND = 1e6;
export const METRES_PER_KILOMETRE = 1000;
export const DEGREES_IN_HALF_TURN = 180;
export const ARCSECONDS_PER_RADIAN = 180 * 3600 / Math.PI;
/** Arcseconds in one full turn, for reporting angles that have stopped being small. */
export const ARCSECONDS_PER_TURN = ARCSECONDS_PER_RADIAN * 2 * Math.PI;

/** Representative constant-profile flights, not reconstructed flight logs; PHYSICS_SPEC §8. */
export const HAFELE_KEATING_EASTWARD = {
  heightMetres: 8900, airSpeed: 265, latitudeDegrees: 50, hours: 41.2,
} as const;
export const HAFELE_KEATING_WESTWARD = {
  ...HAFELE_KEATING_EASTWARD, airSpeed: -265, hours: 48.6,
} as const;
export const HAFELE_KEATING_PREDICTIONS = {
  eastward: { value: -40, uncertainty: 23 },
  westward: { value: 275, uncertainty: 21 },
} as const;

/** Representative speeds for the deflection decomposition, PHYSICS_SPEC §7.4 Claim A's table.
 * Reference values chosen to name a familiar system, not measurements to be re-derived. */
/** A falling apple, m/s. MTW's "Parable of the Apple", Gravitation §1.6. */
export const APPLE_SPEED = 10;
/** ISS mean orbital speed, m/s. */
export const ISS_ORBITAL_SPEED = 7700;
/** Mercury mean orbital speed, m/s. */
export const MERCURY_ORBITAL_SPEED = 47_900;

/** Mercury's orbit, for the precession benchmark of PHYSICS_SPEC §8 row 1.
 * Reference elements, not measurements to be re-derived here. */
/** Semi-major axis, m. */
export const MERCURY_SEMI_MAJOR_AXIS = 5.790_905e10;
/** Orbital eccentricity, dimensionless. */
export const MERCURY_ECCENTRICITY = 0.205_630;
/** Sidereal orbital period, days. */
export const MERCURY_PERIOD_DAYS = 87.9691;
