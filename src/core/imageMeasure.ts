/** Measuring a hard-edged silhouette off a rendered frame, to sub-pixel accuracy.
 *
 * Promoted out of the Schwarzschild sim once the Kerr one needed it too. It is pure arithmetic
 * over an RGBA buffer — no GL, no React, no physics — and it is the only part of the two shadow
 * measurements that is genuinely the same routine. What each sim predicts the answer should be
 * stays with that sim, because those are different formulas.
 *
 * A circle measured over many spokes averages the ±half-pixel quantisation of a hard edge down
 * to a fraction of a pixel: the Phase 1 gate reaches 0.013 px over 720 spokes. A shape that is
 * not a circle gets no such averaging, which is why the Kerr gates are stated in pixels.
 */
const TWO = 2;
const HALF = 0.5;
/** Midpoint of the 0..255 range: the mask is black inside the shadow and white outside. */
const LUMINANCE_THRESHOLD = 127.5;
/** Rays cast outward from the image centre when locating the edge. */
const DEFAULT_SPOKES = 720;

export interface ShadowMeasurement {
  /** Mean edge radius over all spokes, in pixels. */
  radiusPixels: number;
  /** Spread across spokes. A correct render is circular, so this should be well under a pixel. */
  spreadPixels: number;
  spokes: number;
}

export interface Frame {
  width: number;
  height: number;
  /** RGBA rows, top row first. */
  pixels: Uint8Array | Uint8ClampedArray | ArrayLike<number>;
}

function luminanceAt(frame: Frame, x: number, y: number): number {
  const ix = Math.round(x);
  const iy = Math.round(y);
  if (ix < 0 || iy < 0 || ix >= frame.width || iy >= frame.height) return Number.NaN;
  const offset = (iy * frame.width + ix) * 4;
  // The capture mask is greyscale, so the red channel is the luminance.
  return frame.pixels[offset] ?? Number.NaN;
}

/** Locate the shadow edge by marching outward from the image centre along `spokes` directions.
 *
 * The centre pixel must be inside the shadow; if it is not, the camera is not pointed at the
 * hole and the caller has a setup bug rather than a measurement to make.
 */
export function measureShadowRadius(frame: Frame, spokes = DEFAULT_SPOKES): ShadowMeasurement {
  const centreX = frame.width * HALF - HALF;
  const centreY = frame.height * HALF - HALF;
  if (!(luminanceAt(frame, centreX, centreY) < LUMINANCE_THRESHOLD)) {
    throw new Error('The image centre is not inside the shadow; check the camera orientation.');
  }
  const maxRadius = Math.min(frame.width, frame.height) * HALF - 1;
  const radii: number[] = [];

  for (let spoke = 0; spoke < spokes; spoke++) {
    const angle = (spoke / spokes) * TWO * Math.PI;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    let previous = 0;
    let found = Number.NaN;
    // Coarse march at half-pixel steps, then linear interpolation across the crossing.
    for (let radius = 0; radius <= maxRadius; radius += HALF) {
      const value = luminanceAt(frame, centreX + dx * radius, centreY + dy * radius);
      if (Number.isNaN(value)) break;
      if (value >= LUMINANCE_THRESHOLD) {
        const span = value - previous;
        const fraction = span === 0 ? 0 : (LUMINANCE_THRESHOLD - previous) / span;
        found = radius - HALF + fraction * HALF;
        break;
      }
      previous = value;
    }
    if (!Number.isNaN(found)) radii.push(found);
  }

  if (radii.length < spokes * HALF) {
    throw new Error('The shadow edge was not found on enough spokes; the frame may be clipped.');
  }
  const mean = radii.reduce((sum, r) => sum + r, 0) / radii.length;
  const variance = radii.reduce((sum, r) => sum + (r - mean) ** TWO, 0) / radii.length;
  return { radiusPixels: mean, spreadPixels: Math.sqrt(variance), spokes: radii.length };
}
