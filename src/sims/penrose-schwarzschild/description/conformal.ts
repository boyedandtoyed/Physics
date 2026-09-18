/** The Penrose diagram's geometry. PHYSICS_SPEC §7.4a.
 *
 * The compactification itself is `core/kruskal`'s `penrose`; everything here is the shape that
 * results — which corners are which infinity, where the boundaries run, and what a causal curve
 * can reach from a given event.
 *
 * Coordinates: `across` and `up`, each in [−1, 1], with the whole spacetime inside the diamond
 * |across ± up| ≤ 1 cut off at |up| ≤ ½ by the two singularities.
 */
import {
  type Region,
  nullCoordinates,
  penrose,
  productAtRadius,
  radiusFromNull,
} from '../../../core/kruskal';
import {
  DEFAULT_START_RADIUS,
  eddingtonFinkelsteinV,
  properTime,
  radiusAtProperTime,
} from '../../../core/infall';

const TWO = 2;
const HALF = 0.5;
const FLOATS_PER_VERTEX = 3;
/** r_s = 1 in the core's units, so this is the horizon. */
const HORIZON_RADIUS = 1;
/** Slack on the diagram's edges, so a click exactly on a boundary is inside rather than nowhere. */
const EDGE_TOLERANCE = 1e-12;

/** Height of the two singularities. Exactly ½, because UV = −1 maps to p + q = π/2. */
export const SINGULARITY_UP = HALF;
/** The diamond's left and right corners: spacelike infinity. */
export const INFINITY_ACROSS = 1;
/** Where the four horizons meet: the bifurcation 2-sphere, U = V = 0. */
export const BIFURCATION: readonly [number, number] = [0, 0];

/** A closed region of the diagram, as a polygon in (across, up). */
export interface RegionShape {
  region: Region;
  label: string;
  polygon: readonly (readonly [number, number])[];
}

/**
 * The four regions, as polygons.
 *
 * Region I and IV are quadrilaterals reaching out to spacelike infinity; II and III are
 * triangles whose flat edge is a singularity. The flat edge is the whole reason the diagram is
 * worth drawing: in Kruskal the singularity is a hyperbola and looks like a wall you might steer
 * around, and the conformal map straightens it into a horizontal line — a moment, across the
 * whole of space, which is what it is.
 */
export const REGION_SHAPES: readonly RegionShape[] = [
  {
    region: 'exterior',
    label: 'I — our exterior',
    polygon: [[0, 0], [HALF, HALF], [INFINITY_ACROSS, 0], [HALF, -HALF]],
  },
  {
    region: 'black-hole',
    label: 'II — inside the horizon',
    polygon: [[0, 0], [HALF, HALF], [-HALF, HALF]],
  },
  {
    region: 'white-hole',
    label: 'III — the white hole',
    polygon: [[0, 0], [HALF, -HALF], [-HALF, -HALF]],
  },
  {
    region: 'parallel',
    label: 'IV — the parallel exterior',
    polygon: [[0, 0], [-HALF, HALF], [-INFINITY_ACROSS, 0], [-HALF, -HALF]],
  },
];

export type BoundaryKind = 'singularity' | 'horizon' | 'null-infinity' | 'point';

export interface Boundary {
  kind: BoundaryKind;
  /** What it is, in words, for the label drawn beside it. */
  label: string;
  /** A one-line explanation, for the panel. */
  note: string;
  from: readonly [number, number];
  to: readonly [number, number];
  /** Where to hang the label. */
  anchor: readonly [number, number];
}

const midpoint = (
  from: readonly [number, number], to: readonly [number, number],
): [number, number] => [(from[0] + to[0]) / TWO, (from[1] + to[1]) / TWO];

const boundary = (
  kind: BoundaryKind, label: string, note: string,
  from: readonly [number, number], to: readonly [number, number],
): Boundary => ({ kind, label, note, from, to, anchor: midpoint(from, to) });

/**
 * Every edge and corner of the diagram, named.
 *
 * Naming them all is the point of a Penrose diagram: the boundary is where the interesting
 * distinctions live, and an unlabelled one is just a shape.
 */
export const BOUNDARIES: readonly Boundary[] = [
  boundary(
    'singularity', 'r = 0, future',
    'Spacelike: a moment, not a place. Everything inside the horizon reaches it.',
    [-HALF, SINGULARITY_UP], [HALF, SINGULARITY_UP],
  ),
  boundary(
    'singularity', 'r = 0, past',
    'The white hole’s singularity. Nothing in our universe’s history came out of it.',
    [-HALF, -SINGULARITY_UP], [HALF, -SINGULARITY_UP],
  ),
  boundary(
    'null-infinity', 'ℐ⁺ (right)',
    'Future null infinity: where light that escapes ends up. Radiation, not observers.',
    [HALF, HALF], [INFINITY_ACROSS, 0],
  ),
  boundary(
    'null-infinity', 'ℐ⁻ (right)',
    'Past null infinity: where light arriving from far away came from.',
    [INFINITY_ACROSS, 0], [HALF, -HALF],
  ),
  boundary(
    'null-infinity', 'ℐ⁺ (left)',
    'The parallel exterior’s future null infinity. No signal from ours ever reaches it.',
    [-HALF, HALF], [-INFINITY_ACROSS, 0],
  ),
  boundary(
    'null-infinity', 'ℐ⁻ (left)',
    'The parallel exterior’s past null infinity.',
    [-INFINITY_ACROSS, 0], [-HALF, -HALF],
  ),
  boundary(
    'horizon', 'Future horizon',
    'U = 0. Cross it and no signal you send ever reaches ℐ⁺.',
    [0, 0], [HALF, HALF],
  ),
  boundary(
    'horizon', 'Past horizon',
    'V = 0. The white hole’s boundary: things can come out, but nothing can go in.',
    [0, 0], [HALF, -HALF],
  ),
  boundary(
    'horizon', 'Future horizon (left)',
    'The parallel exterior’s way in to the same black hole interior.',
    [0, 0], [-HALF, HALF],
  ),
  boundary(
    'horizon', 'Past horizon (left)',
    'The parallel exterior’s boundary with the white hole.',
    [0, 0], [-HALF, -HALF],
  ),
];

export interface Corner {
  label: string;
  note: string;
  at: readonly [number, number];
}

/**
 * The corners.
 *
 * i⁺ is the corner of region I where ℐ⁺ meets the future horizon — NOT the top of the diagram,
 * which is the singularity. That distinction is the one most often drawn wrong: timelike
 * infinity is where immortal observers end up, and inside a horizon there are none.
 */
export const CORNERS: readonly Corner[] = [
  { label: 'i⁰', note: 'Spacelike infinity: where every constant-t slice runs out to.', at: [INFINITY_ACROSS, 0] },
  { label: 'i⁰ (left)', note: 'The parallel exterior’s spacelike infinity.', at: [-INFINITY_ACROSS, 0] },
  { label: 'i⁺', note: 'Future timelike infinity: where an observer who never falls in ends up.', at: [HALF, HALF] },
  { label: 'i⁻', note: 'Past timelike infinity: where an eternal observer came from.', at: [HALF, -HALF] },
  { label: 'i⁺ (left)', note: 'The parallel exterior’s future timelike infinity.', at: [-HALF, HALF] },
  { label: 'i⁻ (left)', note: 'The parallel exterior’s past timelike infinity.', at: [-HALF, -HALF] },
];

/** Half-width the diagram needs, including room for the i⁰ labels at across = ±1. */
const NEEDED_HALF_WIDTH = 1.28;
/** Half-height it needs: the singularities at ±½, plus room for the labels above them. */
const NEEDED_HALF_HEIGHT = 0.66;

/**
 * The extent to hand `squareBounds`, for a canvas of a given aspect.
 *
 * The diagram is twice as wide as it is tall and a canvas rarely is, so a fixed extent either
 * wastes most of the width or clips the i⁰ labels off a narrow one. `squareBounds` puts its
 * extent on the SHORT axis, which is the sign that catches people out: on a wide canvas the
 * extent is the half-HEIGHT and on a tall one it is the half-width.
 */
export function extentFor(aspect: number): number {
  if (!(aspect > 0)) return NEEDED_HALF_WIDTH;
  return aspect >= 1
    ? Math.max(NEEDED_HALF_WIDTH / aspect, NEEDED_HALF_HEIGHT)
    : Math.max(NEEDED_HALF_WIDTH, NEEDED_HALF_HEIGHT * aspect);
}

/** Polygon as a triangle fan, for the region tints. */
export function polygonVertices(polygon: readonly (readonly [number, number])[]): Float32Array {
  const data = new Float32Array(polygon.length * FLOATS_PER_VERTEX);
  polygon.forEach((point, index) => {
    data[index * FLOATS_PER_VERTEX] = point[0];
    data[index * FLOATS_PER_VERTEX + 1] = point[1];
    data[index * FLOATS_PER_VERTEX + 2] = 1;
  });
  return data;
}

/** A straight boundary as a line pair. */
export const segmentVertices = (
  from: readonly [number, number], to: readonly [number, number],
): Float32Array => new Float32Array([from[0], from[1], 1, to[0], to[1], 1]);

/** The singularity, jagged — for the same reason it is jagged on the Kruskal diagram. */
export function jaggedVertices(
  from: readonly [number, number], to: readonly [number, number], steps: number, jag: number,
): Float32Array {
  const data: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = from[0] + (to[0] - from[0]) * t;
    const y = from[1] + (to[1] - from[1]) * t;
    data.push(x, y + (i % TWO === 0 ? jag : -jag), 1);
  }
  return new Float32Array(data);
}

/**
 * The worldline of an observer who stays at a fixed radius, from i⁻ to i⁺.
 *
 * Constant r is constant UV; as t runs from −∞ to +∞ the curve leaves i⁻, bulges out towards
 * i⁰ and arrives at i⁺ — never touching either horizon. The nearer the horizon they stand, the
 * closer the curve hugs the diagonals.
 */
export function staticWorldline(radius: number, span: number, samples: number): Float32Array {
  const data = new Float32Array(samples * FLOATS_PER_VERTEX);
  for (let i = 0; i < samples; i++) {
    const time = -span + (TWO * span * i) / (samples - 1);
    const { u, v } = nullCoordinates(radius, time, 'exterior');
    const point = penrose(u, v);
    data[i * FLOATS_PER_VERTEX] = point.across;
    data[i * FLOATS_PER_VERTEX + 1] = point.up;
    data[i * FLOATS_PER_VERTEX + 2] = 1;
  }
  return data;
}

export interface ConformalSample {
  across: number;
  up: number;
  radius: number;
  properTime: number;
  /** True once the faller is inside the horizon and can no longer signal ℐ⁺. */
  trapped: boolean;
}

/** Stop this far above r = 0: W₀'s branch point costs half the digits there. §7.4a. */
export const MINIMUM_RADIUS = 1e-4;

/**
 * A radial infall, in the compactified diagram.
 *
 * Built on `core/infall` — the same worldline the Kruskal sim draws, mapped through the same
 * compactification. It does **not** cross ℐ⁺: null infinity is where escaping *light* ends up,
 * and an infalling observer reaches the singularity instead. What it crosses is the horizon.
 */
export function infallWorldline(startRadius: number, samples: number): ConformalSample[] {
  const total = properTime(MINIMUM_RADIUS, startRadius);
  const track: ConformalSample[] = [];
  for (let i = 0; i < samples; i++) {
    const tau = (total * i) / (samples - 1);
    const radius = Math.min(
      startRadius, Math.max(radiusAtProperTime(tau, startRadius), MINIMUM_RADIUS),
    );
    const v = Math.exp(eddingtonFinkelsteinV(radius, startRadius) / TWO);
    const u = productAtRadius(radius) / v;
    const point = penrose(u, v);
    track.push({
      across: point.across,
      up: point.up,
      radius,
      properTime: tau,
      // Inside the horizon, no signal the faller sends reaches ℐ⁺ ever again.
      trapped: radius < HORIZON_RADIUS,
    });
  }
  return track;
}

/** A worldline, or the part of it that is trapped, as a strip. */
export function trackVertices(
  track: readonly ConformalSample[], trappedOnly: boolean,
): Float32Array {
  const points = trappedOnly ? track.filter(sample => sample.trapped) : track;
  const data = new Float32Array(points.length * FLOATS_PER_VERTEX);
  points.forEach((sample, index) => {
    data[index * FLOATS_PER_VERTEX] = sample.across;
    data[index * FLOATS_PER_VERTEX + 1] = sample.up;
    data[index * FLOATS_PER_VERTEX + 2] = 1;
  });
  return data;
}

/**
 * Where a 45° ray from an event leaves the diagram.
 *
 * Up and to the right, the ray leaves across + up = 1 — which is ℐ⁺ or the right horizon — or it
 * runs into the singularity at up = ½, whichever comes first. That "whichever comes first" is
 * the entire causal content of the picture.
 */
export function futureRayEnd(
  across: number, up: number, rightward: boolean,
): { across: number; up: number; hitsSingularity: boolean } {
  const toEdge = rightward
    ? (INFINITY_ACROSS - across - up) / TWO
    : (INFINITY_ACROSS + across - up) / TWO;
  const toSingularity = SINGULARITY_UP - up;
  const step = Math.max(0, Math.min(toEdge, toSingularity));
  return {
    across: across + (rightward ? step : -step),
    up: up + step,
    hitsSingularity: toSingularity <= toEdge,
  };
}

/** The future light cone as two 45° rays, clipped to the diagram. */
export function futureConeVertices(across: number, up: number): Float32Array {
  const right = futureRayEnd(across, up, true);
  const left = futureRayEnd(across, up, false);
  return new Float32Array([
    across, up, 1, right.across, right.up, 1,
    across, up, 1, left.across, left.up, 1,
  ]);
}

/** The cone's interior, filled, so "everything this event can reach" reads at a glance. */
export function futureConeFill(across: number, up: number): Float32Array {
  const right = futureRayEnd(across, up, true);
  const left = futureRayEnd(across, up, false);
  return new Float32Array([
    across, up, 1,
    left.across, left.up, 1,
    right.across, right.up, 1,
  ]);
}

/**
 * Which regions an event can causally influence.
 *
 * A future-directed causal curve has dV ≥ 0 and dU ≤ 0 — V increases towards the future and U
 * decreases — so the future of an event is the quadrant V ≥ V₀, U ≤ U₀, cut off by UV ≥ −1. The
 * table below is that statement, region by region, and the asymmetry is the interesting part:
 * the white hole can influence everywhere, and region II can influence only itself.
 */
export function futureRegions(region: Region | null): Region[] {
  switch (region) {
    case 'exterior': return ['exterior', 'black-hole'];
    case 'parallel': return ['parallel', 'black-hole'];
    case 'black-hole': return ['black-hole'];
    case 'white-hole': return ['white-hole', 'exterior', 'parallel', 'black-hole'];
    default: return [];
  }
}

/** Which region a point of the diagram lies in, from its position alone. */
export function regionAt(across: number, up: number): Region | null {
  if (Math.abs(up) > SINGULARITY_UP + EDGE_TOLERANCE) return null;
  if (Math.abs(across) + Math.abs(up) > INFINITY_ACROSS + EDGE_TOLERANCE) return null;
  // The horizons are the diagonals through the origin; the four regions are the four wedges.
  if (Math.abs(up) > Math.abs(across)) return up > 0 ? 'black-hole' : 'white-hole';
  if (Math.abs(across) === Math.abs(up)) return null;
  return across > 0 ? 'exterior' : 'parallel';
}

export interface ConformalReading {
  across: number;
  up: number;
  region: Region | null;
  /** Areal radius, r_s, or null off the diagram. */
  radius: number | null;
  reach: Region[];
  /** True where the point is outside the diagram entirely. */
  outside: boolean;
}

/** Read an event off the compactified diagram: region, radius, and what it can reach. */
export function readConformal(across: number, up: number): ConformalReading {
  const outside = Math.abs(up) > SINGULARITY_UP
    || Math.abs(across) + Math.abs(up) > INFINITY_ACROSS;
  const region = outside ? null : regionAt(across, up);
  let radius: number | null = null;
  if (!outside) {
    // Invert the compactification: V = tan p, U = −tan q, with p = (up + across)π/2 and
    // q = (up − across)π/2 — then the radius comes from UV as everywhere else.
    const p = ((up + across) * Math.PI) / TWO;
    const q = ((up - across) * Math.PI) / TWO;
    const v = Math.tan(p);
    const u = -Math.tan(q);
    try { radius = radiusFromNull(u, v); } catch { radius = null; }
  }
  return { across, up, region, radius, reach: futureRegions(region), outside };
}

export { DEFAULT_START_RADIUS };
