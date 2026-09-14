/** Orbit camera for the Kerr scene. The spin axis is **+z** and the ring lies in z = 0.
 *
 * Deliberately not shared with the Schwarzschild raymarcher's camera, whose polar axis is +y:
 * the two differ in the only thing a camera model says. Sharing them would mean a module whose
 * axis is a parameter, and an axis passed as a parameter is an axis that gets passed wrongly.
 */

const DEGREES_IN_HALF_TURN = 180;
const HALF = 0.5;
/** Camera nearly on the spin axis: pick a different world-up to keep the basis stable. */
const POLE_GUARD = 0.999;

export type Vec3 = [number, number, number];

export interface CameraPose {
  /** Camera radius in M. */
  distance: number;
  /** Latitude in radians. 0 is edge-on, which is where the shadow's asymmetry is largest. */
  inclination: number;
  azimuth: number;
}

export interface CameraFrame {
  position: Vec3;
  forward: Vec3;
  right: Vec3;
  up: Vec3;
}

const normalise = (v: Vec3): Vec3 => {
  const length = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / length, v[1] / length, v[2] / length];
};

const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

export function cameraFrame({ distance, inclination, azimuth }: CameraPose): CameraFrame {
  const position: Vec3 = [
    distance * Math.cos(inclination) * Math.cos(azimuth),
    distance * Math.cos(inclination) * Math.sin(azimuth),
    distance * Math.sin(inclination),
  ];
  const forward = normalise([-position[0], -position[1], -position[2]]);
  const worldUp: Vec3 = Math.abs(forward[2]) > POLE_GUARD ? [1, 0, 0] : [0, 0, 1];
  // `cross(worldUp, forward)`, not `cross(forward, worldUp)`: a LEFT-handed image basis, which
  // reflects the picture about the spin axis. That reflection is not a style choice — it undoes
  // the one the ray tracer introduces. The trace fires a future-directed ray inward, which
  // substitutes t → −t alone, and in Kerr the isometry is t → −t TOGETHER WITH φ → −φ, so the
  // traced scene is the φ-reflection of the real one. See core/kerrSchild.ts `launchPhoton`.
  // Undo it here, once, rather than negating the spin — which would also have to negate the
  // ring's orbital sense, in a second place, correctly.
  const right = normalise(cross(worldUp, forward));
  const up = cross(right, forward);
  return { position, forward, right, up };
}

export const tanHalfFieldOfView = (degrees: number): number =>
  Math.tan((degrees * Math.PI) / DEGREES_IN_HALF_TURN * HALF);
