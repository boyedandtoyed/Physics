import { validateDimension } from './rk4';

export type Acceleration = (position: Float64Array, output: Float64Array) => void;

// Mathematical composition coefficients, not physical constants. PHYSICS_SPEC §6.1.
export const YOSHIDA_W1 = 1 / (2 - Math.cbrt(2));
export const YOSHIDA_W0 = -Math.cbrt(2) / (2 - Math.cbrt(2));

/** In-place, fixed-step solvers for autonomous q'' = a(q), not velocity-dependent forces.
 * Acceleration must fill output and leave position untouched. Scratch space is reused;
 * instances are not reentrant. Position and velocity must not overlap in memory.
 */
function createSymplectic(dimension: number, weights: readonly number[]) {
  validateDimension(dimension);
  const acceleration = new Float64Array(dimension);
  return {
    step(q: Float64Array, v: Float64Array, dt: number, force: Acceleration): void {
      const overlaps = q.buffer === v.buffer && q.byteOffset < v.byteOffset + v.byteLength
        && v.byteOffset < q.byteOffset + q.byteLength;
      if (q.length !== dimension || v.length !== dimension || overlaps || !Number.isFinite(dt)) {
        throw new RangeError('Non-overlapping states of the configured dimension and a finite step are required.');
      }
      for (const weight of weights) {
        const h = dt * weight;
        force(q, acceleration);
        for (let i = 0; i < dimension; i++) {
          v[i] = v[i]! + h * acceleration[i]! / 2;
          q[i] = q[i]! + h * v[i]!;
        }
        force(q, acceleration);
        for (let i = 0; i < dimension; i++) v[i] = v[i]! + h * acceleration[i]! / 2;
      }
    },
  };
}

export const createVerlet = (dimension: number) => createSymplectic(dimension, [1]);
export const createYoshida4 = (dimension: number) => createSymplectic(dimension, [YOSHIDA_W1, YOSHIDA_W0, YOSHIDA_W1]);
