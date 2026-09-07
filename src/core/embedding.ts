/** The Flamm paraboloid: the equatorial constant-t slice of Schwarzschild, embedded in flat 3D.
 *
 * PHYSICS_SPEC §2.1a. This is the "rubber sheet" — and the spec records at length what it does
 * not show, because it is the most-abused picture in the subject. The arithmetic here is exact;
 * the honesty is in the UI copy that goes with it.
 *
 * Geometrized units, r_s = 1. Framework-free, float64.
 */

const TWO = 2;

/** r_s = 1 by construction, so the formulae read as they do in the spec. */
export const HORIZON = 1;

/**
 * Embedding height z(r) = 2 sqrt(r_s (r - r_s)).
 *
 * Zero at the throat and unbounded above: z grows as 2 sqrt(r_s r), so a rendering has to
 * truncate somewhere and say where.
 */
export function embeddingHeight(radius: number, schwarzschild = HORIZON): number {
  if (!(schwarzschild > 0)) throw new RangeError('The Schwarzschild radius must be positive.');
  if (!Number.isFinite(radius) || radius < schwarzschild) {
    // Outside the horizon only: the embedding does not extend inside, where r is not a radial
    // coordinate and the constant-t slice is not spacelike.
    throw new RangeError('The embedding is defined only for r >= r_s.');
  }
  return TWO * Math.sqrt(schwarzschild * (radius - schwarzschild));
}

/** dz/dr = sqrt(r_s / (r - r_s)). Diverges at the throat: the surface is vertical there. */
export function embeddingSlope(radius: number, schwarzschild = HORIZON): number {
  if (!(radius > schwarzschild)) {
    throw new RangeError('The slope is infinite at the throat and undefined inside it.');
  }
  return Math.sqrt(schwarzschild / (radius - schwarzschild));
}

/**
 * The identity the embedding must satisfy: (dz/dr)^2 + 1 = (1 - r_s/r)^-1.
 *
 * Returned rather than asserted so the tests can measure it, and so the UI can state that the
 * surface is the exact embedding rather than an artist's impression.
 */
export function embeddingResidual(radius: number, schwarzschild = HORIZON): number {
  const slope = embeddingSlope(radius, schwarzschild);
  return Math.abs((slope * slope + 1) - 1 / (1 - schwarzschild / radius));
}

/**
 * The ratio of the spatial to the temporal contribution to a body's deflection, exactly (v/c)^2.
 *
 * Carried here so the curvature view can state, with a number, that the funnel it is drawing is
 * a picture of the part of the geometry that is not why things fall. PHYSICS_SPEC §7.4, §2.1a.
 */
export function spatialShareOfDeflection(speedOverC: number): number {
  if (!(speedOverC > 0) || speedOverC > 1) throw new RangeError('v/c must lie in (0, 1].');
  return speedOverC * speedOverC;
}
