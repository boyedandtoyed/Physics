export type Derivative = (time: number, state: Float64Array, output: Float64Array) => void;

export function validateDimension(dimension: number) {
  if (!Number.isSafeInteger(dimension) || dimension < 1) throw new RangeError('Dimension must be a positive integer.');
}

/** In-place float64 RK4. A solver owns reusable scratch space and is not reentrant.
 * Derivatives must fill output completely, not mutate state, and not retain buffers.
 */
export function createRK4(dimension: number) {
  validateDimension(dimension);
  const k1 = new Float64Array(dimension);
  const k2 = new Float64Array(dimension);
  const k3 = new Float64Array(dimension);
  const k4 = new Float64Array(dimension);
  const stage = new Float64Array(dimension);
  return {
    step(state: Float64Array, time: number, dt: number, derivative: Derivative): void {
      if (state.length !== dimension || !Number.isFinite(time) || !Number.isFinite(dt)) {
        throw new RangeError('State dimension and finite time/step are required.');
      }
      derivative(time, state, k1);
      for (let i = 0; i < dimension; i++) stage[i] = state[i]! + dt * k1[i]! / 2;
      derivative(time + dt / 2, stage, k2);
      for (let i = 0; i < dimension; i++) stage[i] = state[i]! + dt * k2[i]! / 2;
      derivative(time + dt / 2, stage, k3);
      for (let i = 0; i < dimension; i++) stage[i] = state[i]! + dt * k3[i]!;
      derivative(time + dt, stage, k4);
      for (let i = 0; i < dimension; i++) {
        state[i] = state[i]! + dt * (k1[i]! + 2 * k2[i]! + 2 * k3[i]! + k4[i]!) / 6;
      }
    },
  };
}
