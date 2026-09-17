/** The orbit camera's geometry, shared by every 3D sim: pose to matrices, and pixels back to the
 * equatorial plane.
 *
 * The inverse map is the part that has to be right. A sandbox where clicking puts a mass
 * somewhere other than under the pointer reads as the physics being wrong rather than the
 * arithmetic, and in a perspective view the error grows with distance from the centre of the
 * screen — precisely where it is least likely to be noticed in a screenshot. So the ray is built
 * from the camera basis rather than from an inverted matrix, and the tests check it against the
 * forward projection that actually draws the frame.
 *
 * World convention, shared with `spacetime-curvature`'s grid: **up is +y** and the equatorial
 * plane is y = 0. A sim's two-dimensional (x, y) therefore lives at world (x, height, y).
 */
import {
  lookAt, multiply, perspective, transformPoint, type Mat4, type Vec3,
} from '../../core/gl/matrix';

export interface Pose {
  distance: number;
  /** Latitude in radians: 0 is edge-on, +pi/2 is directly overhead. */
  inclination: number;
  azimuth: number;
}

export interface Lens {
  fieldOfView: number;
  aspect: number;
  near: number;
  far: number;
}

export const DEFAULT_FIELD_OF_VIEW = Math.PI / 4;
export const DEFAULT_NEAR = 0.1;
export const DEFAULT_FAR = 600;
/** 30 degrees above the plane: far enough to read the sheet's depth, flat enough to read orbits. */
export const DEFAULT_INCLINATION = Math.PI / 6;

const TWO = 2;
const UP: Vec3 = [0, 1, 0];
/** How close to straight overhead the camera may get before its basis stops meaning anything. */
const POLE_TOLERANCE = 1e-6;

export const lensFor = (aspect: number, fieldOfView = DEFAULT_FIELD_OF_VIEW): Lens => ({
  fieldOfView, aspect: Math.max(aspect, 1e-6), near: DEFAULT_NEAR, far: DEFAULT_FAR,
});

/** Where the camera is, for a pose that always looks at the origin. */
export function eyePosition(pose: Pose): [number, number, number] {
  const { distance, inclination, azimuth } = pose;
  return [
    distance * Math.cos(inclination) * Math.cos(azimuth),
    distance * Math.sin(inclination),
    distance * Math.cos(inclination) * Math.sin(azimuth),
  ];
}

export interface Matrices {
  view: Mat4;
  projection: Mat4;
  viewProjection: Mat4;
  eye: [number, number, number];
}

export function matricesFor(pose: Pose, lens: Lens): Matrices {
  const eye = eyePosition(pose);
  const view = lookAt(eye, [0, 0, 0], UP);
  const projection = perspective(lens.fieldOfView, lens.aspect, lens.near, lens.far);
  return { view, projection, viewProjection: multiply(projection, view), eye };
}

/** Normalised device coordinates for a pixel measured from the canvas's top-left. */
export function pixelToNdc(
  pixelX: number, pixelY: number, width: number, height: number,
): { x: number; y: number } {
  if (!(width > 0) || !(height > 0)) throw new RangeError('The canvas must have a size.');
  return {
    // GL's y grows upward and the DOM's downward. This is the one sign worth checking.
    x: (pixelX / width) * TWO - 1,
    y: 1 - (pixelY / height) * TWO,
  };
}

export interface Ray {
  origin: [number, number, number];
  direction: [number, number, number];
}

/**
 * The ray through a point on the near plane, in world space.
 *
 * Built from the camera basis — forward, right, true up — rather than by inverting the
 * view-projection. Both are correct; this one cannot silently disagree with the projection over
 * a sign, and it needs no matrix inverse in a file that otherwise has none.
 */
export function rayThroughNdc(pose: Pose, lens: Lens, ndcX: number, ndcY: number): Ray {
  const eye = eyePosition(pose);
  const length = Math.hypot(eye[0], eye[1], eye[2]);
  if (!(length > 0)) throw new RangeError('The camera is at the origin it is looking at.');
  // The target is the origin, so forward is just -eye normalised.
  const forward: [number, number, number] = [-eye[0] / length, -eye[1] / length, -eye[2] / length];
  const rightRaw: [number, number, number] = [
    forward[1] * UP[2] - forward[2] * UP[1],
    forward[2] * UP[0] - forward[0] * UP[2],
    forward[0] * UP[1] - forward[1] * UP[0],
  ];
  // |forward x up| is the sine of the angle off the pole. Testing it against zero is not
  // enough: at inclination exactly pi/2 the cosine is 6e-17 rather than 0, so the cross product
  // is a vector of length 6e-17 made entirely of rounding error, and the basis built from it is
  // noise rather than an error. The orbit controls clamp short of the pole for the same reason.
  const rightLength = Math.hypot(rightRaw[0], rightRaw[1], rightRaw[2]);
  if (!(rightLength > POLE_TOLERANCE)) {
    throw new RangeError('The camera is at a pole, where the basis degenerates.');
  }
  const right: [number, number, number] = [
    rightRaw[0] / rightLength, rightRaw[1] / rightLength, rightRaw[2] / rightLength,
  ];
  const up: [number, number, number] = [
    right[1] * forward[2] - right[2] * forward[1],
    right[2] * forward[0] - right[0] * forward[2],
    right[0] * forward[1] - right[1] * forward[0],
  ];
  const tangent = Math.tan(lens.fieldOfView / TWO);
  const sx = ndcX * tangent * lens.aspect;
  const sy = ndcY * tangent;
  const direction: [number, number, number] = [
    forward[0] + sx * right[0] + sy * up[0],
    forward[1] + sx * right[1] + sy * up[1],
    forward[2] + sx * right[2] + sy * up[2],
  ];
  const norm = Math.hypot(direction[0], direction[1], direction[2]);
  return {
    origin: eye,
    direction: [direction[0] / norm, direction[1] / norm, direction[2] / norm],
  };
}

/**
 * Where a pixel lands on the equatorial plane, in the sim's own two coordinates.
 *
 * Returns null when the ray runs parallel to the plane or away from it — looking at the horizon
 * from an almost edge-on camera, there is genuinely no answer, and returning a huge number
 * instead would put a mass a million units away.
 */
export function pickGroundPlane(
  pose: Pose, lens: Lens, ndcX: number, ndcY: number,
): { x: number; y: number } | null {
  const ray = rayThroughNdc(pose, lens, ndcX, ndcY);
  const denominator = ray.direction[1];
  if (Math.abs(denominator) < 1e-6) return null;
  const t = -ray.origin[1] / denominator;
  if (!(t > 0)) return null;
  return {
    x: ray.origin[0] + t * ray.direction[0],
    y: ray.origin[2] + t * ray.direction[2],
  };
}

/** Sim-plane coordinates to world, at a given height. The one place the mapping is written. */
export const toWorld = (x: number, y: number, height = 0): [number, number, number] =>
  [x, height, y];

/**
 * Sim units per pixel at the origin, for a drag that has to mean a velocity.
 *
 * In a perspective view this is a function of depth, so it is quoted **at the plane through the
 * origin** and the UI says so; a drag near the horizon covers more ground per pixel than one
 * near the camera, and no single number can be right for both.
 */
export function simPerPixelAtOrigin(pose: Pose, lens: Lens, height: number): number {
  return (TWO * pose.distance * Math.tan(lens.fieldOfView / TWO)) / Math.max(height, 1);
}

/**
 * Where a world point lands on the screen, in [0,1] with v measured from the bottom.
 *
 * `behind` is true when the point is on the far side of the camera, where the perspective divide
 * flips the sign and the projected position is a reflection rather than a position. Anything
 * reading this has to check it — a hole behind the camera would otherwise distort the frame from
 * the wrong side.
 */
export function projectToScreen(
  matrices: Matrices, point: Vec3,
): { u: number; v: number; behind: boolean; depth: number } {
  const { ndc, w } = transformPoint(matrices.viewProjection, point);
  const eye = matrices.eye;
  const depth = Math.hypot(point[0] - eye[0], point[1] - eye[1], point[2] - eye[2]);
  return { u: (ndc[0] + 1) / TWO, v: (ndc[1] + 1) / TWO, behind: w <= 0, depth };
}

/**
 * Apparent radius of a sphere, as a fraction of the viewport WIDTH.
 *
 * Fraction of the width rather than of the height because the distortion shader works in
 * aspect-corrected screen space, and quoting it in the other unit is the kind of mismatch that
 * shows up as an ellipse only at one window size.
 */
export function screenRadius(
  lens: Lens, distance: number, worldRadius: number,
): number {
  if (!(distance > 0)) return 0;
  const halfHeight = Math.tan(lens.fieldOfView / TWO) * distance;
  return worldRadius / (TWO * halfHeight * lens.aspect);
}
