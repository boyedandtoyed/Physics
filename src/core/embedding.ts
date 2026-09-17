/** The Flamm paraboloid: the equatorial constant-t slice of Schwarzschild, embedded in flat 3D.
 *
 * PHYSICS_SPEC §2.1a. This is the "rubber sheet" — and the spec records at length what it does
 * not show, because it is the most-abused picture in the subject. The arithmetic here is exact;
 * the honesty is in the UI copy that goes with it.
 *
 * Geometrized units, r_s = 1. Framework-free, float64.
 */

const TWO = 2;
const THREE = 3;

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

/**
 * Newtonian potential of a **uniform sphere**, in units where G = 1.
 *
 * This is the height function the multi-mass "rubber sheet" is drawn from, and it is here rather
 * than in a sim because the CPU and the vertex shader must compute the same thing — a sheet that
 * disagrees with the field the integrator uses would be a picture of nothing.
 *
 *     Phi(r) = -M/r                      for r >= R
 *     Phi(r) = -M(3R^2 - r^2)/(2R^3)     for r < R
 *
 * The interior branch is the exact potential inside a uniform sphere, not a softening parameter.
 * That matters: a softened 1/sqrt(r^2 + eps^2) has no physical reading and its depth depends on
 * a number chosen for looks, whereas this is continuous, continuously differentiable at r = R,
 * and bottoms out at a value — -3M/2R — that means something.
 *
 * **What the sheet is.** Superposing this over several masses is exact for Newtonian gravity,
 * because the Newtonian potential obeys the linear Poisson equation. It is the exact field the
 * N-body integrator uses, drawn as a height.
 *
 * **What the sheet is not.** It is NOT the Flamm paraboloid, even for one mass: Flamm's
 * embedding goes as +2 sqrt(r_s r) and rises outward, this goes as -M/r and rises to zero. And
 * it is not a solution of Einstein's equations for several bodies — no such embedding diagram
 * exists, because general relativity is not linear and a multi-body slice has no isometric
 * embedding in flat 3-space. The sheet is a picture of the Newtonian potential and the UI says
 * exactly that.
 */
export function uniformSpherePotential(radius: number, mass: number, bodyRadius: number): number {
  if (!(bodyRadius > 0)) throw new RangeError('A uniform sphere needs a positive radius.');
  if (!(radius >= 0)) throw new RangeError('Distance from the centre must be non-negative.');
  if (radius >= bodyRadius) return -mass / radius;
  return (-mass * (THREE * bodyRadius * bodyRadius - radius * radius))
    / (TWO * bodyRadius ** THREE);
}

/** d(Phi)/dr for the same, so the continuity of the slope at r = R can be measured not asserted. */
export function uniformSphereField(radius: number, mass: number, bodyRadius: number): number {
  if (!(bodyRadius > 0)) throw new RangeError('A uniform sphere needs a positive radius.');
  if (radius >= bodyRadius) return mass / (radius * radius);
  return (mass * radius) / bodyRadius ** THREE;
}

export interface SheetMass {
  x: number;
  y: number;
  mass: number;
  /** The drawn radius, which is also the interior branch's R. */
  radius: number;
}

/**
 * Height of the rubber sheet at a point, summed over the masses on it.
 *
 * The CPU twin of the vertex shader in `ui/gl/fabricGlsl.ts`; the two are asserted to agree, so
 * that a claim made about the sheet in a test is a claim about the pixels.
 */
export function sheetHeight(
  x: number, y: number, masses: readonly SheetMass[], scale = 1,
): number {
  let total = 0;
  for (const source of masses) {
    const distance = Math.hypot(x - source.x, y - source.y);
    total += uniformSpherePotential(distance, source.mass, source.radius);
  }
  return total * scale;
}
