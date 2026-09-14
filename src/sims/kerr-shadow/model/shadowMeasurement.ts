/** Measure the Kerr shadow off a rendered frame, in Bardeen's α.
 *
 * The Schwarzschild acceptance test measures one number — a radius — because the shadow is a
 * circle. The Kerr shadow is not a circle and its size is the *least* interesting thing about
 * it: PHYSICS_SPEC §3.4c row 44 says the vertical half-extent is 3√3 M at **every** spin, so a
 * renderer that got only the size right would have demonstrated nothing about spin at all. What
 * spin changes is the horizontal extent and the displacement, and those are what this measures.
 *
 * The conversion from a pixel column to α is not an approximation: the ray for that column is
 * launched through the same float64 model the shader mirrors, and α = −ξ = −L_z/E is read off
 * the launched state. ξ is conserved, so the measured boundary is the α → ∞ boundary however
 * close the camera is.
 */
import { bardeenAlpha, launchPhoton } from '../../../core/kerrSchild';
import { cameraFrame, tanHalfFieldOfView, type CameraPose, type Vec3 } from '../view/camera';

const HALF = 0.5;
/** Midpoint of 0..255: the capture mask is black inside the shadow and white outside. */
const LUMINANCE_THRESHOLD = 127.5;

export interface Frame {
  width: number;
  height: number;
  /** RGBA rows, top row first. */
  pixels: Uint8Array | Uint8ClampedArray | ArrayLike<number>;
}

export interface ShadowEdges {
  /** Sub-pixel column of the left edge of the shadow on the equatorial row. */
  leftColumn: number;
  rightColumn: number;
  /** Row the scan was taken on. */
  row: number;
}

function luminanceAt(frame: Frame, column: number, row: number): number {
  if (column < 0 || row < 0 || column >= frame.width || row >= frame.height) return Number.NaN;
  // The capture mask is greyscale, so the red channel is the luminance.
  return frame.pixels[(row * frame.width + column) * 4] ?? Number.NaN;
}

/**
 * Find both edges of the shadow along the row where the equatorial plane projects.
 *
 * Sub-pixel by linear interpolation of the luminance across the threshold, which is what the
 * capture mask's hard edge supports: the mask is 0 or 255 with the anti-aliased transition one
 * pixel wide, so interpolating it recovers the crossing to a fraction of a pixel.
 */
export function measureShadowEdges(frame: Frame, row = Math.round(frame.height * HALF - HALF)):
ShadowEdges {
  let first = -1;
  let last = -1;
  for (let column = 0; column < frame.width; column++) {
    if (luminanceAt(frame, column, row) < LUMINANCE_THRESHOLD) {
      if (first < 0) first = column;
      last = column;
    }
  }
  if (first < 0) throw new RangeError('No shadow on this row: the camera is not on the hole.');
  if (first === 0 || last === frame.width - 1) {
    throw new RangeError('The shadow touches the frame edge; widen the field of view.');
  }
  const refine = (inside: number, outside: number): number => {
    const lumInside = luminanceAt(frame, inside, row);
    const lumOutside = luminanceAt(frame, outside, row);
    if (!(lumOutside > lumInside)) return (inside + outside) * HALF;
    const fraction = (LUMINANCE_THRESHOLD - lumInside) / (lumOutside - lumInside);
    return inside + fraction * (outside - inside);
  };
  return { leftColumn: refine(first, first - 1), rightColumn: refine(last, last + 1), row };
}

export interface AlphaMapping {
  pose: CameraPose;
  fieldOfView: number;
  width: number;
  height: number;
  spin: number;
}

/**
 * Bardeen's α for a sub-pixel column on the equatorial row.
 *
 * α = −ξ, with ξ = L_z/E read off the launched ray. ξ is unchanged by reversing the momentum, so
 * it belongs to the geodesic rather than to the direction it is traversed in, and the sign of
 * p_t is carried in exactly one place — `impactRatio` in core/kerrSchild.ts.
 */
export function alphaForColumn(column: number, mapping: AlphaMapping): number {
  const { pose, fieldOfView, width, height, spin } = mapping;
  const frame = cameraFrame(pose);
  const ndcX = ((column + HALF) / width) * 2 - 1;
  const tan = tanHalfFieldOfView(fieldOfView);
  const aspect = width / height;
  const direction = [0, 1, 2].map(i =>
    frame.forward[i]! + frame.right[i]! * (ndcX * tan * aspect)) as Vec3;
  const state = launchPhoton(
    { x: frame.position[0], y: frame.position[1], z: frame.position[2] },
    { x: direction[0], y: direction[1], z: direction[2] },
    spin,
  );
  return bardeenAlpha(state);
}

export interface ShadowExtentMeasurement {
  min: number;
  max: number;
  midpoint: number;
  width: number;
}

/** The measured shadow extent in α, from a capture-mask frame. */
export function measureShadowExtent(frame: Frame, mapping: AlphaMapping): ShadowExtentMeasurement {
  const edges = measureShadowEdges(frame);
  const a = alphaForColumn(edges.leftColumn, mapping);
  const b = alphaForColumn(edges.rightColumn, mapping);
  const min = Math.min(a, b);
  const max = Math.max(a, b);
  return { min, max, midpoint: (min + max) * HALF, width: max - min };
}
