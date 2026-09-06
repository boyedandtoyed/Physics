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
