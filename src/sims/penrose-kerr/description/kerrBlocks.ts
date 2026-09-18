/** The Kerr causal diagram's geometry, equatorial slice. PHYSICS_SPEC §7.4b.
 *
 * **What is computed and what is taken from the literature**, because the distinction matters
 * more here than anywhere else in this repo:
 *
 *   - COMPUTED: the two horizon radii, the two surface gravities, the exact tortoise coordinate
 *     r*(r), and therefore where every r = const contour sits inside its block and which way it
 *     runs. Also that the ring singularity is at *finite* r* while both horizons are at infinite
 *     r*, which is the reason the diagram continues past r = 0 at all.
 *   - TAKEN FROM THE LITERATURE: the arrangement of the blocks — that an exterior is followed by
 *     a between-horizons block, then an inner block, then the pattern repeats without end. That
 *     is a topological statement (Carter 1966; Hawking & Ellis fig. 29), not something a single
 *     conformal formula produces. Unlike Schwarzschild, Kerr has no one map of the whole
 *     manifold: each horizon needs its own Kruskalisation, with its own surface gravity, and the
 *     blocks are glued.
 *
 * The sim says both of those on screen. Drawing a schematic and implying it was derived would be
 * the dishonest option, and the arrangement is standard enough to cite.
 *
 * Units: M = 1, matching `core/kerr`.
 */
import { horizonRadii, radialTortoise, surfaceGravity } from '../../../core/kerr';

const TWO = 2;
const HALF = 0.5;
const FLOATS_PER_VERTEX = 3;

/** The spin this diagram is drawn at, as the brief fixes it. */
export const SPIN = 0.5;

/** Where r is timelike, r = const is a spacelike slice and runs across the block. */
export type BlockKind = 'exterior' | 'between' | 'inner';

export interface Block {
  kind: BlockKind;
  label: string;
  /** Radial range, M. `from` is the lower end. */
  from: number;
  to: number;
  /** True where Δ < 0, so r is a time and r = const runs horizontally. */
  radiusIsTime: boolean;
  /** Which repetition of the pattern this block belongs to. */
  repetition: number;
  /** Vertical band the block occupies, in diagram units. */
  bottom: number;
  top: number;
}

/** Height of one block band, against a half-width of 1. The tower is tall and thin — the
 * standard figures are too — so the sim shows a window onto it rather than all of it at once. */
export const BAND_HEIGHT = 0.7;
/** Half-width of the strip the diagram is drawn in. */
export const HALF_WIDTH = 1;
/** Blocks per repetition of the pattern, as the brief asks: I, II, III, II′, I′. */
export const BLOCKS_PER_REPETITION = 5;

/**
 * The block tower, `repetitions` copies of the pattern.
 *
 * Bottom to top: an exterior, the region between the horizons, the inner region holding the ring
 * singularity, then back out through another between-horizons block to a new exterior — which is
 * where the next repetition starts. The pattern really does not terminate; three copies is enough
 * to see that it does not.
 */
export function blockTower(repetitions: number): Block[] {
  const { outer, inner } = horizonRadii(SPIN);
  const blocks: Block[] = [];
  const pattern: readonly [BlockKind, string, number, number][] = [
    ['exterior', 'I — exterior (r > r_+)', outer, Number.POSITIVE_INFINITY],
    ['between', 'II — between the horizons (r_− < r < r_+)', inner, outer],
    ['inner', 'III — inside the Cauchy horizon (0 < r < r_−)', 0, inner],
    ['between', 'II′ — between the horizons again', inner, outer],
    ['exterior', 'I′ — a new exterior', outer, Number.POSITIVE_INFINITY],
  ];
  for (let repetition = 0; repetition < repetitions; repetition++) {
    pattern.forEach(([kind, label, from, to], index) => {
      const position = repetition * BLOCKS_PER_REPETITION + index;
      blocks.push({
        kind,
        label,
        from,
        to,
        radiusIsTime: kind === 'between',
        repetition,
        bottom: position * BAND_HEIGHT,
        top: (position + 1) * BAND_HEIGHT,
      });
    });
  }
  return blocks;
}

/** Δ changes sign at each horizon, and that is what flips r between a place and a time. */
export const radiusIsTimelike = (kind: BlockKind): boolean => kind === 'between';

/**
 * Where a radius sits across its block, in [−1, 1], from the **exact** tortoise coordinate.
 *
 * r* runs to ∓∞ at the horizons, so the compactification arctan(κ r*) puts them at the block's
 * edges however the blocks themselves are arranged. The ring singularity is the exception and
 * the interesting one: r*(0) is finite — 0.2688 M at a/M = ½ — so r = 0 lands at a definite
 * place inside the innermost block rather than at its edge. That is precisely why it is a
 * timelike line you can steer around and not a spacelike end you cannot.
 */
export function radialPosition(radius: number, block: Block): number {
  const tortoise = radialTortoise(radius, SPIN);
  const low = block.kind === 'inner'
    ? compress(radialTortoise(0, SPIN), block)
    : -Math.PI / TWO;
  const high = Math.PI / TWO;
  return (TWO * (compress(tortoise, block) - low)) / (high - low) - 1;
}

/**
 * The compression a block uses, with **each horizon regularised by its own surface gravity**.
 *
 * This is the piece that cannot be papered over. A single κ cannot straighten both ends of the
 * between-horizons block: κ_+ = 0.232/M and |κ_−| = 3.232/M differ by a factor of fourteen, and
 * using κ_+ throughout leaves the inner edge bunched at 0.43 instead of 0.94 — the outer horizon
 * looking like a boundary and the inner one looking like the middle of the block. Kerr has no
 * one conformal map of the whole manifold for exactly this reason; the blocks are Kruskalised
 * separately and glued, and this function is that statement in arithmetic.
 */
function compress(tortoise: number, block: Block): number {
  const gravity = surfaceGravity(SPIN);
  const scale = block.kind === 'exterior'
    ? gravity.outer
    : block.kind === 'inner'
      ? Math.abs(gravity.inner)
      // Between the horizons r* runs to −∞ at r_+ and +∞ at r_−, so which horizon is near depends
      // on the sign, and so does which κ straightens it.
      : (tortoise < 0 ? gravity.outer : Math.abs(gravity.inner));
  return Math.atan(scale * tortoise);
}

/**
 * The radius at a given position across a block, by bisection on the exact r*.
 *
 * The inverse of `radialPosition`. Needed because the two are wildly non-linear in each other:
 * r* is logarithmic at both horizons, so contours spaced evenly in r pile up against one edge
 * and show the reader nothing. Spacing them evenly in POSITION is what makes the block's
 * structure legible, and it is still the exact r* deciding where each one lands.
 */
export function radiusAtPosition(position: number, block: Block): number {
  const { outer, inner } = horizonRadii(SPIN);
  const bottom = block.kind === 'exterior' ? outer : block.kind === 'between' ? inner : 0;
  const top = block.kind === 'exterior'
    ? EXTERIOR_REACH
    : block.kind === 'between' ? outer : inner;
  // Nudge off the endpoints, where r* is infinite and the bisection has nothing to compare.
  const nudge = Math.min((top - bottom) * BISECTION_NUDGE, BISECTION_NUDGE);
  let low = bottom + nudge;
  let high = top - nudge;
  // **The map is not always increasing.** Between the horizons Δ < 0, so dr*/dr < 0 and the
  // position DECREASES with r — the one block where growing r moves you left. Assuming a
  // direction put every contour in that band at the wrong end of it.
  const rising = radialPosition(high, block) > radialPosition(low, block);
  for (let step = 0; step < BISECTION_STEPS; step++) {
    const middle = (low + high) / TWO;
    const below = radialPosition(middle, block) < position;
    if (below === rising) low = middle;
    else high = middle;
  }
  return (low + high) / TWO;
}

const BISECTION_STEPS = 120;
const BISECTION_NUDGE = 1e-9;

/** Radii to draw as contours inside a block, spread evenly ACROSS it rather than in r. */
export function contourRadii(block: Block, count: number): number[] {
  const radii: number[] = [];
  for (let i = 1; i <= count; i++) {
    const position = -1 + (TWO * i) / (count + 1);
    radii.push(radiusAtPosition(position, block));
  }
  return radii;
}

/** The exterior is unbounded, so the bisection needs a top far enough out that positions near
 * the block's outer edge are actually reachable. r*(10⁶ M) puts the compactified position within
 * 10⁻⁵ of 1. */
const EXTERIOR_REACH = 1e6;

/**
 * A contour of constant r inside a block, as a line pair.
 *
 * Vertical where r is a place — outside the outer horizon and inside the inner one — and
 * horizontal where r is a time, between them. That flip is not decoration: it is the sign of Δ,
 * and it is the whole reason a Kerr singularity can be avoided and a Schwarzschild one cannot.
 */
export function contourVertices(radius: number, block: Block): Float32Array {
  const position = radialPosition(radius, block);
  const margin = BAND_HEIGHT * CONTOUR_MARGIN;
  if (block.radiusIsTime) {
    const y = block.bottom + (block.top - block.bottom) * ((position + 1) / TWO);
    return new Float32Array([
      -HALF_WIDTH + margin, y, 1,
      HALF_WIDTH - margin, y, 1,
    ]);
  }
  const x = position * HALF_WIDTH;
  return new Float32Array([
    x, block.bottom + margin, 1,
    x, block.top - margin, 1,
  ]);
}

const CONTOUR_MARGIN = 0.12;

/**
 * The horizons between two stacked blocks, drawn as a crossed pair of 45° lines.
 *
 * Both branches appear, meeting at a point: that crossing is the bifurcation structure, and it is
 * why an infalling observer has a choice of which block to enter next.
 */
export function horizonCrossVertices(atHeight: number): Float32Array {
  const reach = Math.min(HALF_WIDTH, BAND_HEIGHT * HALF);
  return new Float32Array([
    -reach, atHeight - reach, 1, reach, atHeight + reach, 1,
    -reach, atHeight + reach, 1, reach, atHeight - reach, 1,
  ]);
}

export interface HorizonEdge {
  atHeight: number;
  /** True for the inner, Cauchy horizon — the one that is unstable. */
  isCauchy: boolean;
  label: string;
}

/** Every horizon in the tower, with the Cauchy ones flagged so they can be drawn as warnings. */
export function horizonEdges(blocks: readonly Block[]): HorizonEdge[] {
  const edges: HorizonEdge[] = [];
  for (let i = 0; i < blocks.length - 1; i++) {
    const below = blocks[i] as Block;
    const above = blocks[i + 1] as Block;
    // The boundary between a between-block and an inner block is the Cauchy horizon.
    const isCauchy = below.kind === 'inner' || above.kind === 'inner';
    edges.push({
      atHeight: below.top,
      isCauchy,
      label: isCauchy ? 'r_− — Cauchy horizon' : 'r_+ — event horizon',
    });
  }
  return edges;
}

/**
 * The ring singularity, as a **timelike** vertical line at r = 0 inside each inner block.
 *
 * Timelike, and therefore avoidable: an equatorial geodesic runs into it, but one with any
 * inclination at all passes through the disc r = 0 and out into a region with r < 0. This sim
 * draws the equatorial slice, which is exactly the slice in which the ring cannot be dodged —
 * that is worth saying on screen rather than leaving the reader to infer that a Kerr singularity
 * is unavoidable, which it is not.
 */
export function ringVertices(block: Block): Float32Array {
  const position = radialPosition(0, block);
  const margin = BAND_HEIGHT * CONTOUR_MARGIN;
  const x = position * HALF_WIDTH;
  const steps = RING_JAG_STEPS;
  const data: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const y = block.bottom + margin
      + ((block.top - block.bottom - TWO * margin) * i) / steps;
    data.push(x + (i % TWO === 0 ? RING_JAG : -RING_JAG), y, 1);
  }
  return new Float32Array(data);
}

const RING_JAG_STEPS = 18;
const RING_JAG = 0.022;

/** Where the ring sits across its block, for the readout. */
export const ringPosition = (block: Block): number => radialPosition(0, block);

/** The strip's outline, so the drawn region has an edge. */
export function frameVertices(blocks: readonly Block[]): Float32Array {
  if (blocks.length === 0) return new Float32Array();
  const bottom = (blocks[0] as Block).bottom;
  const top = (blocks[blocks.length - 1] as Block).top;
  return new Float32Array([
    -HALF_WIDTH, bottom, 1, HALF_WIDTH, bottom, 1,
    HALF_WIDTH, bottom, 1, HALF_WIDTH, top, 1,
    HALF_WIDTH, top, 1, -HALF_WIDTH, top, 1,
    -HALF_WIDTH, top, 1, -HALF_WIDTH, bottom, 1,
  ]);
}

/** A light cone at an event: 45°, as everywhere on a conformal diagram. */
export function lightConeVertices(x: number, y: number, arm: number): Float32Array {
  return new Float32Array([
    x, y, 1, x + arm, y + arm, 1,
    x, y, 1, x - arm, y + arm, 1,
    x, y, 1, x + arm, y - arm, 1,
    x, y, 1, x - arm, y - arm, 1,
  ]);
}

/** A block as a filled quad, for its tint. */
export function blockVertices(block: Block): Float32Array {
  return new Float32Array([
    -HALF_WIDTH, block.bottom, 1,
    HALF_WIDTH, block.bottom, 1,
    HALF_WIDTH, block.top, 1,
    -HALF_WIDTH, block.top, 1,
  ]);
}

/** Which block a point of the diagram falls in, or null off the tower. */
export function blockAt(blocks: readonly Block[], y: number): Block | null {
  return blocks.find(block => y >= block.bottom && y < block.top) ?? null;
}

/** Total height of the tower, for framing. */
export const towerHeight = (blocks: readonly Block[]): number =>
  blocks.length === 0 ? 0 : (blocks[blocks.length - 1] as Block).top - (blocks[0] as Block).bottom;

export { FLOATS_PER_VERTEX };
