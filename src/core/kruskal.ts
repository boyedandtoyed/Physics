/** The Kruskal–Szekeres **chart**: the whole maximally extended Schwarzschild spacetime, in all
 * four regions, for arbitrary (r, t) rather than along one worldline.
 *
 * This is deliberately NOT a reimplementation of `infall.ts`. That module maps one radial infall
 * into Kruskal coordinates and is the right tool for that job; it cannot draw the diagram, for
 * three measured reasons:
 *
 *   - its normalisation is a **boost anchored to that fall's horizon crossing**, so `kruskal(2)`
 *     returns X = 5.525, T = -4.810 where the standard chart at r = 2 r_s, t = 0 has X = e,
 *     T = 0. Both are correct Kruskal coordinates; they differ by a boost, which is why the
 *     product UV = 7.389 = e² agrees exactly between them. That invariance is asserted below.
 *   - it routes through `schwarzschildTime`, which quite rightly throws inside the horizon, so it
 *     cannot reach regions II and III at all.
 *   - `radiusFromKruskal` refuses UV < 0, which is every event inside the horizon.
 *
 * What IS shared is the discipline and the arithmetic that matters: `lambertW0` is imported
 * rather than rewritten, and every quantity here is carried in the null coordinates U and V.
 *
 * Geometrized units, r_s = 1, c = 1, hence M = 1/2 — the same convention as `infall.ts` and
 * `embedding.ts`. The diagram a reader sees is labelled in M, which is a factor of two away and
 * is the sim's business, not this module's.
 */
import { lambertW0 } from './infall';

const TWO = 2;
const HALF = 0.5;

/** r_s = 1 by construction, so the formulae read as they do in the spec. */
export const HORIZON = 1;
/** UV on the singularity: (r - 1)e^r at r = 0. The curve r = 0 is UV = -1. */
export const SINGULARITY_PRODUCT = -1;

/**
 * The four regions of the maximally extended spacetime, named by what they are.
 *
 * 'white-hole' and 'parallel' are mathematical continuations of the vacuum solution. They are
 * not features of a black hole formed by collapse — that spacetime has a star where region III
 * would be — and the sim says so on screen rather than in a comment.
 */
export type Region = 'exterior' | 'black-hole' | 'white-hole' | 'parallel';

export const REGIONS: readonly Region[] = ['exterior', 'black-hole', 'white-hole', 'parallel'];

/** Signs of (U, V) in each region. Everything else about the layout follows from these. */
export function regionSigns(region: Region): { u: number; v: number } {
  switch (region) {
    case 'exterior': return { u: 1, v: 1 };
    case 'black-hole': return { u: -1, v: 1 };
    case 'white-hole': return { u: 1, v: -1 };
    default: return { u: -1, v: -1 };
  }
}

/** Which region an event lies in, or null on a horizon, where U or V vanishes. */
export function regionOf(u: number, v: number): Region | null {
  if (u === 0 || v === 0) return null;
  if (u > 0) return v > 0 ? 'exterior' : 'white-hole';
  return v > 0 ? 'black-hole' : 'parallel';
}

/**
 * (r, t) in a given region, to the null Kruskal coordinates.
 *
 *     |V| = exp( ½ln|r − r_s| + r/2r_s + t/2r_s ),   |U| = exp( … − t/2r_s )
 *
 * Written as a single exponential of a sum rather than as √|r−1| · e^{r/2} · e^{t/2}: the factors
 * overflow independently at radii and times the combined exponent handles without trouble, and
 * the sum is one rounding rather than three.
 *
 * Equivalent to the cosh/sinh form in the textbooks — V = X + T and U = X − T turn cosh ± sinh
 * into e^{±t/2} identically — and better conditioned, because it never forms X and T at all.
 */
export function nullCoordinates(
  radius: number, time: number, region: Region,
): { u: number; v: number } {
  if (!(radius >= 0) || !Number.isFinite(radius)) {
    throw new RangeError('Radius must be finite and non-negative.');
  }
  if (!Number.isFinite(time)) throw new RangeError('Time must be finite.');
  const signs = regionSigns(region);
  if (radius === HORIZON) {
    // The horizon is U = 0 or V = 0, and which one it is depends on the boundary rather than on
    // t: finite t at r = r_s is the bifurcation point, where both vanish. Returning that is the
    // honest answer; the sim draws the horizon lines directly rather than sampling this.
    return { u: 0, v: 0 };
  }
  const magnitude = HALF * Math.log(Math.abs(radius - HORIZON)) + radius / (TWO * HORIZON);
  return {
    u: signs.u * Math.exp(magnitude - time / (TWO * HORIZON)),
    v: signs.v * Math.exp(magnitude + time / (TWO * HORIZON)),
  };
}

/** X = (V + U)/2, T = (V − U)/2. For drawing only — see `product` for why. */
export const cartesian = (u: number, v: number): { x: number; t: number } =>
  ({ x: (v + u) / TWO, t: (v - u) / TWO });

/** U = X − T, V = X + T. The way back in, for a pointer landing on the diagram. */
export const nullFromCartesian = (x: number, t: number): { u: number; v: number } =>
  ({ u: x - t, v: x + t });

/**
 * UV = (r − r_s) e^{r/r_s}, the boost-invariant that carries the whole radial structure.
 *
 * **Never computed as X² − T², and not as (X − T)(X + T) either.** Measured at r = 1 + 10⁻⁶ in
 * r_s units, against the exact value:
 *
 *   | t (r_s/c) | X² − T² | (X − T)(X + T) | this, from U and V |
 *   |---|---|---|---|
 *   | 20 | 1.1e-8 | 1.9e-8 | exact |
 *   | 30 | 9.1e-5 | 6.6e-5 | exact |
 *   | 40 | **returns 0** | **returns 0** | exact |
 *
 * The usual advice — rearrange a difference of squares into a product of a sum and a difference
 * — buys nothing here and is worth being explicit about: by t = 40 the two coordinates are
 * bitwise equal, so X − T is exactly zero and no rearrangement of X and T can recover what the
 * subtraction destroyed. The fix is not a better formula in X and T; it is not forming X and T.
 * PHYSICS_SPEC §7.4.
 */
export const product = (u: number, v: number): number => u * v;

/** The same quantity from the areal radius, for checking the round trip. */
export const productAtRadius = (radius: number): number =>
  (radius - HORIZON) * Math.exp(radius / HORIZON);

/**
 * Areal radius from the null coordinates: r = r_s [1 + W₀(UV/e)].
 *
 * Valid in all four regions, unlike `infall.ts`'s exterior-only version: UV ∈ [−1, 0) inside the
 * horizon, and W₀ maps [−1/e, 0) onto [−1, 0), which is exactly r ∈ (0, r_s].
 */
export function radiusFromNull(u: number, v: number): number {
  const uv = product(u, v);
  if (!(uv >= SINGULARITY_PRODUCT)) {
    throw new RangeError('UV < -1 lies beyond the singularity, where there is no spacetime.');
  }
  return HORIZON * (1 + lambertW0(uv / Math.E));
}

/**
 * Schwarzschild time from the null coordinates: t = r_s ln|V/U|.
 *
 * Undefined on either horizon, where one of them vanishes — which is the coordinate singularity
 * Kruskal exists to remove, seen from the other side.
 */
export function timeFromNull(u: number, v: number): number {
  if (u === 0 || v === 0) {
    throw new RangeError('Schwarzschild t is undefined on a horizon, where U or V vanishes.');
  }
  return HORIZON * Math.log(Math.abs(v / u));
}

/** Whether an event lies inside the singularity, where the extension simply ends. */
export const beyondSingularity = (u: number, v: number): boolean =>
  product(u, v) < SINGULARITY_PRODUCT;

/**
 * A curve of constant r, sampled over a range of t, as (X, T) pairs.
 *
 * A hyperbola: UV is fixed, so X² − T² is fixed — timelike inside the horizon and spacelike
 * outside, which is the diagram's whole point about why r = 0 is a time and not a place.
 */
export function radiusCurve(
  radius: number, region: Region, timeSpan: number, samples: number,
): Float64Array {
  if (samples < TWO) throw new RangeError('A curve needs at least two samples.');
  const data = new Float64Array(samples * TWO);
  for (let i = 0; i < samples; i++) {
    const time = -timeSpan + (TWO * timeSpan * i) / (samples - 1);
    const { u, v } = nullCoordinates(radius, time, region);
    const point = cartesian(u, v);
    data[i * TWO] = point.x;
    data[i * TWO + 1] = point.t;
  }
  return data;
}

/**
 * A line of constant t: straight through the origin, with T/X = tanh(t/2r_s).
 *
 * Returned as its two endpoints at the given radii, because it really is a straight line and
 * sampling it would only invite a reader to think it is not.
 */
export function timeLine(
  time: number, region: Region, innerRadius: number, outerRadius: number,
): { from: { x: number; t: number }; to: { x: number; t: number } } {
  const inner = cartesian(...nullPair(nullCoordinates(innerRadius, time, region)));
  const outer = cartesian(...nullPair(nullCoordinates(outerRadius, time, region)));
  return { from: inner, to: outer };
}

const nullPair = (point: { u: number; v: number }): [number, number] => [point.u, point.v];

/** Slope T/X of a constant-t line: tanh(t/2r_s). Exported because it is worth asserting. */
export const timeLineSlope = (time: number): number => Math.tanh(time / (TWO * HORIZON));

// ---------------------------------------------------------------------------------------------
// The conformal compactification: Penrose from Kruskal.
// ---------------------------------------------------------------------------------------------

/**
 * Penrose coordinates, normalised so the square is [−1, 1] in each direction.
 *
 *     p = arctan V,  q = arctan(−U),  across = (p − q)/(π/2)/2,  up = (p + q)/(π/2)/2
 *
 * `arctan` is a monotone bijection of the whole real line onto (−π/2, π/2), so infinity arrives
 * at a finite coordinate and nothing is lost or reordered: the map is conformal in the 2D sense,
 * which is why light still travels at 45°. It is not an isometry and no distance on the finished
 * diagram means anything.
 *
 * Landmarks that follow, and that the tests pin down: the future singularity UV = −1 becomes the
 * straight line up = ½, spacelike infinity i⁰ is (±1, 0), and the future horizon is the diagonal
 * up = across from the origin to i⁺ at (½, ½).
 */
export function penrose(u: number, v: number): { across: number; up: number } {
  const p = Math.atan(v);
  const q = Math.atan(-u);
  return { across: (p - q) / Math.PI, up: (p + q) / Math.PI };
}

/** The Penrose image of an (r, t) event, which is what the sims actually plot. */
export function penroseAt(
  radius: number, time: number, region: Region,
): { across: number; up: number } {
  const { u, v } = nullCoordinates(radius, time, region);
  return penrose(u, v);
}

/** Height of the future singularity in the compactified square. Exactly ½. */
export const SINGULARITY_HEIGHT = HALF;
/** Where spacelike infinity sits: the left and right corners. */
export const INFINITY_ACROSS = 1;
