/** The Kruskal diagram's geometry. PHYSICS_SPEC §7.4a.
 *
 * Everything here is a curve in the (X, T) plane, built from `core/kruskal`'s chart. Pure: it
 * knows about hyperbolae and light cones, not about a canvas.
 *
 * Units: r_s = 1, as in the core. The UI quotes radii and times in M = r_s/2, which is a factor
 * of two and is applied at the very edge — `inM` and `toM` below are the only place it happens.
 */
import {
  HORIZON,
  type Region,
  cartesian,
  nullCoordinates,
  nullFromCartesian,
  penrose,
  product,
  productAtRadius,
  radiusFromNull,
  regionOf,
  timeFromNull,
} from '../../../core/kruskal';
import {
  DEFAULT_START_RADIUS,
  eddingtonFinkelsteinV,
  properTime,
  radiusAtProperTime,
} from '../../../core/infall';

const TWO = 2;
const FLOATS_PER_VERTEX = 3;
/** Bisection for the window's outer radius: monotone, and not a hot path. */
const BISECTION_FLOOR = 1e-9;
const BISECTION_CEILING = 30;
const BISECTION_STEPS = 200;

/** A radius quoted in M, converted to the r_s = 1 units the core works in. */
export const inM = (radiiInM: number) => radiiInM / TWO;
/** …and back, for a readout. */
export const toM = (radiiInRs: number) => radiiInRs * TWO;

/** Half-width of the drawn plane. X grows as √(r−r_s)·e^{r/2r_s}, so this is a radius cutoff. */
export const DEFAULT_EXTENT = 4;
export const MIN_EXTENT = 1.6;
export const MAX_EXTENT = 8;

/** The outermost radius that fits in a window of half-width `extent`, at t = 0. */
export function outermostRadius(extent: number): number {
  // Solve √(r−1)e^{r/2} = extent by bisection: it is monotone and this is not a hot path.
  let low = HORIZON + BISECTION_FLOOR;
  let high = BISECTION_CEILING;
  for (let step = 0; step < BISECTION_STEPS; step++) {
    const middle = (low + high) / TWO;
    if (Math.sqrt(middle - HORIZON) * Math.exp(middle / TWO) < extent) low = middle;
    else high = middle;
  }
  return (low + high) / TWO;
}

/** Radii to draw as hyperbolae, in r_s, one every `stepInM` of M. */
export function radiusGrid(extent: number, stepInM: number): number[] {
  const step = inM(stepInM);
  const outer = outermostRadius(extent);
  const radii: number[] = [];
  for (let r = step; r < outer; r += step) {
    // The horizon is drawn separately, in its own colour, and is not one of these.
    if (Math.abs(r - HORIZON) > step / TWO) radii.push(r);
  }
  return radii;
}

/** Schwarzschild times to draw as straight lines, one every `stepInM` of M. */
export function timeGrid(spanInM: number, stepInM: number): number[] {
  const span = inM(spanInM);
  const step = inM(stepInM);
  const times: number[] = [];
  for (let t = -span; t <= span + step / TWO; t += step) {
    if (Math.abs(t) > step / TWO) times.push(t);
  }
  return times;
}

/**
 * A curve of constant r, clipped to the window, as a line strip.
 *
 * X² − T² is fixed along it, so this is a hyperbola asymptotic to the horizons — and outside the
 * horizon it is exactly the worldline of an observer who stays put.
 */
export function radiusVertices(
  radius: number, region: Region, extent: number, samples: number,
): Float32Array {
  const data: number[] = [];
  const magnitude = Math.sqrt(Math.abs(productAtRadius(radius)));
  if (!(magnitude > 0)) return new Float32Array();
  // Parametrise by the hyperbolic angle rather than by t: it spaces samples evenly ALONG the
  // curve, where equal steps in t bunch everything at the vertex and leave the arms in straight
  // segments that visibly cut the corner.
  const limit = Math.asinh((extent * TWO) / magnitude);
  for (let i = 0; i < samples; i++) {
    const angle = -limit + (TWO * limit * i) / (samples - 1);
    const cosh = magnitude * Math.cosh(angle);
    const sinh = magnitude * Math.sinh(angle);
    // Written out per region rather than assembled from sign flags. U and V are (±m e^∓θ, ±m e^θ)
    // with the region's signs, and X = (V+U)/2, T = (V−U)/2 turns that into these four lines —
    // the exteriors open sideways and the interiors open up and down, which is the whole shape
    // of the diagram. Two multiplied sign variables got this wrong and put region II below.
    const point = region === 'exterior' ? [cosh, sinh]
      : region === 'parallel' ? [-cosh, -sinh]
        : region === 'black-hole' ? [sinh, cosh]
          : [-sinh, -cosh];
    data.push(point[0] as number, point[1] as number, 1);
  }
  return new Float32Array(data);
}

/** A line of constant t, from the horizon out to the window edge, both sides. */
export function timeVertices(time: number, extent: number): Float32Array {
  const slope = Math.tanh(time / TWO);
  const reach = extent * TWO;
  return new Float32Array([
    -reach, -reach * slope, 1,
    reach, reach * slope, 1,
  ]);
}

/** The two horizons, T = ±X, as a line list. */
export function horizonVertices(extent: number): Float32Array {
  const reach = extent * TWO;
  return new Float32Array([
    -reach, -reach, 1, reach, reach, 1,
    -reach, reach, 1, reach, -reach, 1,
  ]);
}

/** Amplitude of the singularity's zigzag, as a fraction of the window. */
const JAG_FRACTION = 0.022;
const JAG_STEPS = 64;

/**
 * The singularity r = 0, as a **jagged** line: T² − X² = 1, top and bottom.
 *
 * Jagged by convention and on purpose. It is not a curve in spacetime and nothing travels along
 * it — it is where the geometry stops being a geometry — and drawing it as a smooth line invites
 * exactly the reading that it is a place with a surface. The zigzag is the standard signal that
 * this is an edge of the manifold rather than a feature in it.
 */
export function singularityVertices(extent: number, future: boolean): Float32Array {
  const data: number[] = [];
  const reach = extent * TWO;
  const jag = extent * JAG_FRACTION;
  const sign = future ? 1 : -1;
  for (let i = 0; i <= JAG_STEPS; i++) {
    const x = -reach + (TWO * reach * i) / JAG_STEPS;
    const base = Math.sqrt(1 + x * x);
    const offset = i % TWO === 0 ? jag : -jag;
    data.push(x, sign * (base + offset), 1);
  }
  return new Float32Array(data);
}

/**
 * The worldline of an observer who stays at a fixed radius.
 *
 * **Not a vertical line.** A static observer has dr/dt = 0, so UV is constant, so X² − T² is
 * constant — a hyperbola asymptotic to the two horizons, never crossing either. It is the exact
 * analogue of a Rindler observer in flat space, and for the same reason: staying still outside a
 * horizon requires proper acceleration forever, and an eternally accelerated worldline is a
 * hyperbola. A vertical line X = const is something else entirely — it is not a curve of
 * constant r, and above |T| = X it is not even timelike.
 */
export const staticObserverVertices = (
  radius: number, extent: number, samples: number,
): Float32Array => radiusVertices(radius, 'exterior', extent, samples);

export interface FallSample {
  x: number;
  t: number;
  /** Areal radius, r_s. */
  radius: number;
  /** The faller's own clock since release. */
  properTime: number;
}

/** Stop this far above r = 0: the Lambert branch point costs half the digits there, §7.4a. */
export const MINIMUM_RADIUS = 1e-4;

/**
 * A radial infall from rest at `startRadius`, sampled in the faller's proper time.
 *
 * Built on `core/infall`, which is what that module is for. The one piece it will not give is U
 * inside the horizon — it routes through the Schwarzschild `u`, which diverges there — so U is
 * taken from the invariant instead: U = UV/V, with UV = (r − r_s)e^{r/r_s} exactly. That keeps
 * the whole worldline in one normalisation, and it is the crossing itself that is the point.
 */
export function infallWorldline(startRadius: number, samples: number): FallSample[] {
  const total = properTime(MINIMUM_RADIUS, startRadius);
  const track: FallSample[] = [];
  for (let i = 0; i < samples; i++) {
    const tau = (total * i) / (samples - 1);
    // Clamped at BOTH ends. `radiusAtProperTime(0, r0)` is r0 up to a rounding of the cube and
    // the two-thirds power, and one ulp above it is outside the trajectory — which `core/infall`
    // quite rightly refuses, taking the whole component into its error boundary when the reader
    // happens to click at a radius where the rounding goes that way.
    const radius = Math.min(
      startRadius, Math.max(radiusAtProperTime(tau, startRadius), MINIMUM_RADIUS),
    );
    const v = Math.exp(eddingtonFinkelsteinV(radius, startRadius) / TWO);
    const u = productAtRadius(radius) / v;
    const point = cartesian(u, v);
    track.push({ x: point.x, t: point.t, radius, properTime: tau });
  }
  return track;
}

/** Proper time from release to the singularity, for the readout. */
export const fallDuration = (startRadius: number): number =>
  properTime(MINIMUM_RADIUS, startRadius);

/** Where the fall crosses the horizon, as a fraction of the way through. */
export function horizonFraction(startRadius: number): number {
  return properTime(HORIZON, startRadius) / fallDuration(startRadius);
}

/** A worldline as a line strip, clipped to what has happened so far. */
export function trackVertices(track: readonly FallSample[], through: number): Float32Array {
  const count = Math.max(TWO, Math.min(track.length, Math.ceil(track.length * through)));
  const data = new Float32Array(count * FLOATS_PER_VERTEX);
  for (let i = 0; i < count; i++) {
    const sample = track[i] as FallSample;
    data[i * FLOATS_PER_VERTEX] = sample.x;
    data[i * FLOATS_PER_VERTEX + 1] = sample.t;
    data[i * FLOATS_PER_VERTEX + 2] = count < TWO ? 1 : i / (count - 1);
  }
  return data;
}

/**
 * A light cone at an event: four 45° rays.
 *
 * 45° everywhere on the diagram, in every region, is the entire reason Kruskal coordinates are
 * worth the trouble — it is what makes "the singularity is in your future" something you can
 * read off the picture rather than take on trust.
 */
export function lightConeVertices(x: number, t: number, arm: number): Float32Array {
  return new Float32Array([
    x, t, 1, x + arm, t + arm, 1,
    x, t, 1, x - arm, t + arm, 1,
    x, t, 1, x + arm, t - arm, 1,
    x, t, 1, x - arm, t - arm, 1,
  ]);
}

/** The future half of the cone, filled, so "where this event can reach" reads at a glance. */
export function futureConeVertices(x: number, t: number, arm: number): Float32Array {
  return new Float32Array([
    x, t, 1,
    x - arm, t + arm, 1,
    x + arm, t + arm, 1,
  ]);
}

export interface EventReading {
  x: number;
  t: number;
  region: Region | null;
  /** Areal radius, r_s. Null past the singularity, where there is no spacetime. */
  radius: number | null;
  /** Schwarzschild t, r_s/c. Null on a horizon, where it is undefined. */
  time: number | null;
  beyond: boolean;
}

/** What the pointer landed on. The inverse map, through U and V rather than through X² − T². */
export function readEvent(x: number, t: number): EventReading {
  const { u, v } = nullFromCartesian(x, t);
  const beyond = product(u, v) < -1;
  let radius: number | null = null;
  let time: number | null = null;
  if (!beyond) {
    try { radius = radiusFromNull(u, v); } catch { radius = null; }
    try { time = timeFromNull(u, v); } catch { time = null; }
  }
  return { x, t, region: regionOf(u, v), radius, time, beyond };
}

/** The Penrose image of an event, for the sibling sim's cross-reference. Re-exported, not rebuilt. */
export { penrose, nullCoordinates, DEFAULT_START_RADIUS };
