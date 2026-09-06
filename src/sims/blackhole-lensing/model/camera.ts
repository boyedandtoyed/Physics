/** Camera geometry and ray launch, shared by the CPU reference and the renderer.
 *
 * The shader duplicates this arithmetic in float32. Keeping the definitive version here, in
 * float64 and unit-testable, is what lets the acceptance harness compare the two per pixel.
 */
import { HORIZON_RADIUS, MASS, impactParameter, impactParameterToFlatH } from '../../../core/schwarzschild';

const TWO = 2;
const HALF = 0.5;
const DEGREES_IN_HALF_TURN = 180;
/** Camera nearly on the polar axis: pick a different world-up to keep the basis stable. */
const POLE_GUARD = 0.999;
const TANGENT_EPSILON = 1e-12;

export type Vec3 = [number, number, number];

export interface CameraPose {
  /** Camera radius in r_s = 1 units. */
  distance: number;
  /** Latitude in radians. 0 looks along the disk plane (edge-on); pi/2 is face-on. */
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

/** Orthonormal camera basis for an observer at `distance` looking at the hole.
 * The disk lies in y = 0, so y is the polar axis and `inclination` is latitude above the disk. */
export function cameraFrame({ distance, inclination, azimuth }: CameraPose): CameraFrame {
  const position: Vec3 = [
    distance * Math.cos(inclination) * Math.cos(azimuth),
    distance * Math.sin(inclination),
    distance * Math.cos(inclination) * Math.sin(azimuth),
  ];
  const forward = normalise([-position[0], -position[1], -position[2]]);
  const worldUp: Vec3 = Math.abs(forward[1]) > POLE_GUARD ? [0, 0, 1] : [0, 1, 0];
  const right = normalise(cross(forward, worldUp));
  const up = cross(right, forward);
  return { position, forward, right, up };
}

/** Pinhole view direction for normalised device coordinates in [-1, 1]. */
export function viewDirection(
  frame: CameraFrame,
  ndcX: number,
  ndcY: number,
  aspect: number,
  fieldOfViewDegrees: number,
): Vec3 {
  const tanHalfFov = Math.tan((fieldOfViewDegrees * Math.PI) / DEGREES_IN_HALF_TURN * HALF);
  return normalise([0, 1, 2].map(i =>
    frame.forward[i]!
    + frame.right[i]! * (ndcX * tanHalfFov * aspect)
    + frame.up[i]! * (ndcY * tanHalfFov)) as Vec3);
}

/** Convert a viewing direction in the static observer's local frame into the flat-Cartesian
 * launch velocity. Both conversions of §2.3 live here: the sqrt(1 - r_s/D) that makes the
 * direction a *local frame* direction, and b -> h. */
export function launchVelocity(position: Vec3, direction: Vec3): Vec3 {
  const distance = Math.hypot(position[0], position[1], position[2]);
  const radial: Vec3 = [position[0] / distance, position[1] / distance, position[2] / distance];
  const cosTheta = direction[0] * radial[0] + direction[1] * radial[1] + direction[2] * radial[2];
  const radialSign = cosTheta >= 0 ? 1 : -1;

  const tangentRaw: Vec3 = [0, 1, 2].map(i => direction[i]! - cosTheta * radial[i]!) as Vec3;
  const tangentLength = Math.hypot(tangentRaw[0], tangentRaw[1], tangentRaw[2]);
  if (tangentLength <= TANGENT_EPSILON) {
    return [radial[0] * radialSign, radial[1] * radialSign, radial[2] * radialSign];
  }
  const tangent: Vec3 = [0, 1, 2].map(i => tangentRaw[i]! / tangentLength) as Vec3;

  // theta here is measured from the OUTWARD radial direction.
  const theta = Math.acos(Math.min(1, Math.max(-1, cosTheta)));
  const impact = impactParameter(distance, theta);
  const h = impactParameterToFlatH(impact, distance);
  const sineFlat = Math.min(1, h / distance);
  const cosineFlat = Math.sqrt(Math.max(0, 1 - sineFlat * sineFlat)) * radialSign;
  return [0, 1, 2].map(i => radial[i]! * cosineFlat + tangent[i]! * sineFlat) as Vec3;
}

/** Sanity bound used by tests: |b_phi| cannot exceed r/sqrt(1 - r_s/r) for an emitter at r. */
export function maximumAxialImpact(radius: number): number {
  return radius / Math.sqrt(1 - HORIZON_RADIUS / radius);
}

export { MASS, TWO };
