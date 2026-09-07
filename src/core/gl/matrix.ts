/** Minimal 4x4 matrix maths for the scene-graph sims, column-major to match GLSL.
 *
 * Small enough to own rather than take a dependency for, and tested, because a transposed
 * multiply or a sign slip in the projection renders a perfectly plausible picture of the wrong
 * geometry — the failure mode this project exists to avoid.
 */

export type Mat4 = Float32Array;
export type Vec3 = readonly [number, number, number];

const SIZE = 16;
const TWO = 2;

export function identity(): Mat4 {
  const m = new Float32Array(SIZE);
  m[0] = 1; m[5] = 1; m[10] = 1; m[15] = 1;
  return m;
}

/** Column-major product a*b, applied to a column vector as a*(b*v). */
export function multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Float32Array(SIZE);
  for (let column = 0; column < 4; column++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += (a[k * 4 + row] ?? 0) * (b[column * 4 + k] ?? 0);
      out[column * 4 + row] = sum;
    }
  }
  return out;
}

const subtract = (a: Vec3, b: Vec3): [number, number, number] =>
  [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

const cross = (a: Vec3, b: Vec3): [number, number, number] => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export function normalise(v: Vec3): [number, number, number] {
  const length = Math.hypot(v[0], v[1], v[2]);
  if (!(length > 0)) throw new RangeError('Cannot normalise a zero-length vector.');
  return [v[0] / length, v[1] / length, v[2] / length];
}

/** Right-handed look-at, viewing down -z in eye space. */
export function lookAt(eye: Vec3, target: Vec3, up: Vec3): Mat4 {
  const forward = normalise(subtract(target, eye));
  const side = normalise(cross(forward, up));
  const trueUp = cross(side, forward);
  const m = new Float32Array(SIZE);
  m[0] = side[0]; m[4] = side[1]; m[8] = side[2]; m[12] = -dot(side, eye);
  m[1] = trueUp[0]; m[5] = trueUp[1]; m[9] = trueUp[2]; m[13] = -dot(trueUp, eye);
  m[2] = -forward[0]; m[6] = -forward[1]; m[10] = -forward[2]; m[14] = dot(forward, eye);
  m[15] = 1;
  return m;
}

/** Standard right-handed perspective with a [-1, 1] depth range. */
export function perspective(
  fovYRadians: number, aspect: number, near: number, far: number,
): Mat4 {
  if (!(fovYRadians > 0) || !(aspect > 0) || !(far > near) || !(near > 0)) {
    throw new RangeError('Invalid perspective parameters.');
  }
  const f = 1 / Math.tan(fovYRadians / TWO);
  const m = new Float32Array(SIZE);
  m[0] = f / aspect;
  m[5] = f;
  m[10] = (far + near) / (near - far);
  m[11] = -1;
  m[14] = (TWO * far * near) / (near - far);
  return m;
}

/** Apply a matrix to a point, returning the perspective-divided result and its w. */
export function transformPoint(m: Mat4, p: Vec3): { ndc: [number, number, number]; w: number } {
  const x = (m[0] ?? 0) * p[0] + (m[4] ?? 0) * p[1] + (m[8] ?? 0) * p[2] + (m[12] ?? 0);
  const y = (m[1] ?? 0) * p[0] + (m[5] ?? 0) * p[1] + (m[9] ?? 0) * p[2] + (m[13] ?? 0);
  const z = (m[2] ?? 0) * p[0] + (m[6] ?? 0) * p[1] + (m[10] ?? 0) * p[2] + (m[14] ?? 0);
  const w = (m[3] ?? 0) * p[0] + (m[7] ?? 0) * p[1] + (m[11] ?? 0) * p[2] + (m[15] ?? 0);
  return { ndc: [x / w, y / w, z / w], w };
}
