/** The gravity sandbox's run state. PHYSICS_SPEC §2.6.
 *
 * Holds the bodies, their trails, the absorption notices and the energy the run started with.
 * Pure: it takes a step size and returns a new state, and knows nothing about a canvas.
 */
import { createYoshida4 } from '../../../core/integrators/symplectic';
import {
  accelerations,
  escapeSpeed,
  findAbsorptions,
  orbitalPeriod,
  relativisticFraction,
  totalEnergy,
  type Body,
} from '../../../core/nbody';

const TWO = 2;
const THREE = 3;
const FLOATS_PER_VERTEX = 3;

/** Trail samples kept per body, as the brief asks. */
export const TRAIL_LENGTH = 200;
/** An absorption notice stays up this long, in seconds of wall time. */
export const ABSORBED_NOTICE_SECONDS = 2;
/**
 * Reference orbit the step size is pinned to: a circular orbit at r = 2 around a unit mass takes
 * this many steps. Everything else inherits it, so the integrator's fidelity is one number.
 */
export const STEPS_PER_REFERENCE_ORBIT = 512;
export const REFERENCE_RADIUS = 2;
export const REFERENCE_MASS = 1;
export const FIXED_STEP = orbitalPeriod(REFERENCE_RADIUS, REFERENCE_MASS)
  / STEPS_PER_REFERENCE_ORBIT;

/**
 * Absorb radius per unit mass. **A display choice, not a horizon.**
 *
 * The sandbox fixes G = 1 and says nothing about c, so it has no geometric length scale and
 * therefore no horizon: if c were set to 1 as well, a mass-10 body's horizon would be 2M = 20 sim
 * units and would swallow the whole canvas. 0.05 per unit mass puts the default black hole's
 * absorb radius at 0.5, which is what reads as a disc at the sim's default framing.
 */
export const ABSORB_PER_MASS = 0.05;

/** Drawn glyph radii, sim units. Display only: the physics is point masses throughout. */
const PLANET_GLYPH = 0.16;
const HOLE_GLYPH = 0.3;
const SATELLITE_GLYPH = 0.07;
const TEST_GLYPH = 0.05;
const HOLE_MASS = 10;
const SATELLITE_MASS = 0.001;

export interface PaletteEntry {
  kind: string;
  label: string;
  mass: number;
  /** Drawn radius in sim units. Display only; the physics is point masses. */
  glyphRadius: number;
  absorbRadius: number;
  hint: string;
}

export const PALETTE: readonly PaletteEntry[] = [
  {
    kind: 'planet', label: 'Planet', mass: 1, glyphRadius: PLANET_GLYPH,
    absorbRadius: ABSORB_PER_MASS,
    hint: 'One sim-unit mass. The unit everything else is quoted against.',
  },
  {
    kind: 'hole', label: 'Black hole', mass: HOLE_MASS, glyphRadius: HOLE_GLYPH,
    absorbRadius: ABSORB_PER_MASS * HOLE_MASS,
    hint: 'Ten sim-unit masses. Anything inside 0.5 units is absorbed — a display choice, not a '
      + 'horizon: the sandbox sets G = 1 and says nothing about c, so it has no horizon scale.',
  },
  {
    kind: 'satellite', label: 'Satellite', mass: SATELLITE_MASS, glyphRadius: SATELLITE_GLYPH,
    absorbRadius: 0,
    hint: 'A thousandth of a planet. Light enough to be moved by everything and to move nothing.',
  },
  {
    kind: 'test', label: 'Test particle', mass: 0, glyphRadius: TEST_GLYPH,
    absorbRadius: 0,
    hint: 'Exactly zero mass: it follows the field and exerts no force at all. Not an '
      + 'approximation — the term it would contribute is multiplied by its mass.',
  },
];

export interface TrailPoint {
  x: number;
  y: number;
  /** Speed as a fraction of the local escape speed at that moment. Sets the colour band. */
  escapeFraction: number;
}

export interface AbsorbedNotice {
  x: number;
  y: number;
  /** Wall-clock seconds remaining on the notice. */
  remaining: number;
}

export interface SandboxState {
  bodies: Body[];
  trails: TrailPoint[][];
  notices: AbsorbedNotice[];
  /** Elapsed sim time. */
  time: number;
  steps: number;
  /** Energy when the current set of bodies was last changed, for the drift readout. */
  referenceEnergy: number;
}

export const emptyState = (): SandboxState =>
  ({ bodies: [], trails: [], notices: [], time: 0, steps: 0, referenceEnergy: 0 });

export function stateFrom(bodies: readonly Body[]): SandboxState {
  const copy = bodies.map(b => ({ ...b }));
  return {
    bodies: copy,
    trails: copy.map(() => []),
    notices: [],
    time: 0,
    steps: 0,
    referenceEnergy: totalEnergy(copy),
  };
}

export function addBody(state: SandboxState, added: Body): SandboxState {
  const bodies = [...state.bodies, { ...added }];
  return {
    ...state,
    bodies,
    trails: [...state.trails, []],
    referenceEnergy: totalEnergy(bodies),
  };
}

export function removeBody(state: SandboxState, index: number): SandboxState {
  if (index < 0 || index >= state.bodies.length) return state;
  const bodies = state.bodies.filter((_, i) => i !== index);
  return {
    ...state,
    bodies,
    trails: state.trails.filter((_, i) => i !== index),
    referenceEnergy: totalEnergy(bodies),
  };
}

/** Index of the body nearest a point, within `radius`, or −1. For right-click removal. */
export function bodyNear(state: SandboxState, x: number, y: number, radius: number): number {
  let best = -1;
  let bestDistance = radius;
  state.bodies.forEach((b, index) => {
    const distance = Math.hypot(b.x - x, b.y - y);
    if (distance <= bestDistance) {
      bestDistance = distance;
      best = index;
    }
  });
  return best;
}

/**
 * Advance by up to `steps` fixed steps of `FIXED_STEP`.
 *
 * The stepper is rebuilt whenever the body count changes, because `createYoshida4` is built for
 * one dimension and holds its own scratch buffer.
 *
 * **Trails are sampled every step, not every frame.** Sampled per frame, a trail covers 200 of
 * whatever the speed slider is doing, so it means a different span of sim time at 1× and at
 * 100× — it stretches as you speed up, which reads as the orbit changing. Per step it is always
 * the same 200 × FIXED_STEP of sim time, about two fifths of an orbit at the reference radius,
 * whatever the playback speed.
 *
 * **Absorption is checked every step, and stops the batch.** Checked only at the end of the
 * batch, a body that falls into a black hole is integrated straight *through* it first: at 100×
 * the remaining steps take it through the singularity, the force refuses the zero separation,
 * and what gets removed is whatever wreckage is left. Stopping on the step it crosses the radius
 * is both the right physics and the reason the notice appears where the body actually was.
 */
export function advance(
  state: SandboxState, steps: number, relativistic: boolean, wallSeconds: number,
): SandboxState {
  const count = state.bodies.length;
  const notices = state.notices
    .map(n => ({ ...n, remaining: n.remaining - wallSeconds }))
    .filter(n => n.remaining > 0);
  if (count === 0 || steps <= 0) return { ...state, notices };

  const bodies = state.bodies.map(b => ({ ...b }));
  const trails = state.trails.map(t => [...t]);
  const q = new Float64Array(count * TWO);
  const v = new Float64Array(count * TWO);
  bodies.forEach((b, i) => {
    q[i * TWO] = b.x; q[i * TWO + 1] = b.y; v[i * TWO] = b.vx; v[i * TWO + 1] = b.vy;
  });
  const stepper = createYoshida4(count * TWO);
  const force = (position: Float64Array, out: Float64Array) => {
    bodies.forEach((b, i) => { b.x = position[i * TWO]!; b.y = position[i * TWO + 1]!; });
    accelerations(bodies, out, relativistic, v);
  };
  const unpack = () => {
    bodies.forEach((b, i) => {
      b.x = q[i * TWO]!; b.y = q[i * TWO + 1]!; b.vx = v[i * TWO]!; b.vy = v[i * TWO + 1]!;
    });
  };

  let done = 0;
  let remove = new Set<number>();
  for (; done < steps; done++) {
    try {
      stepper.step(q, v, FIXED_STEP, force);
    } catch {
      // Two bodies landed on top of each other. Stop rather than propagating a NaN through every
      // other body's acceleration sum on the next step.
      unpack();
      remove = new Set(bodies
        .map((b, i) => (Number.isFinite(b.x) && Number.isFinite(b.y) ? -1 : i))
        .filter(i => i >= 0));
      break;
    }
    unpack();

    for (let i = 0; i < bodies.length; i++) {
      const body = bodies[i] as Body;
      const escape = escapeSpeed(bodies, i);
      const speed = Math.hypot(body.vx, body.vy);
      const trail = trails[i] as TrailPoint[];
      trail.push({ x: body.x, y: body.y, escapeFraction: escape > 0 ? speed / escape : 0 });
      if (trail.length > TRAIL_LENGTH) trail.shift();
    }

    const doomed = findAbsorptions(bodies);
    const broken = bodies
      .map((b, i) => (Number.isFinite(b.x) && Number.isFinite(b.y) ? -1 : i))
      .filter(i => i >= 0);
    if (doomed.length > 0 || broken.length > 0) {
      remove = new Set([...doomed, ...broken]);
      done++;
      break;
    }
  }

  for (const index of remove) {
    const body = bodies[index] as Body;
    if (Number.isFinite(body.x) && Number.isFinite(body.y)) {
      notices.push({ x: body.x, y: body.y, remaining: ABSORBED_NOTICE_SECONDS });
    }
  }
  const kept = bodies.filter((_, i) => !remove.has(i));
  const keptTrails = trails.filter((_, i) => !remove.has(i));

  return {
    bodies: kept,
    trails: keptTrails,
    notices,
    time: state.time + done * FIXED_STEP,
    steps: state.steps + done,
    // Removing a body changes the total energy by construction, so the reference resets with it.
    referenceEnergy: remove.size > 0 ? totalEnergy(kept) : state.referenceEnergy,
  };
}

/**
 * Steps the fixed step gives to the *tightest* pair currently on screen.
 *
 * The step is calibrated so a circular orbit at r = 2 around a unit mass gets 512 of them, and
 * that is a statement about one configuration, not about every configuration. Place a mass-10
 * black hole and a planet close together and the same step resolves their mutual orbit a handful
 * of times, at which point Yoshida-4 is producing a polygon and the energy readout says so. This
 * is what the panel warns on, rather than silently changing the step underneath the reader.
 */
export function stepsPerTightestOrbit(state: SandboxState): number {
  let worst = Number.POSITIVE_INFINITY;
  const { bodies } = state;
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i] as Body;
      const b = bodies[j] as Body;
      const total = a.mass + b.mass;
      if (!(total > 0)) continue;
      const separation = Math.hypot(a.x - b.x, a.y - b.y);
      if (!(separation > 0)) continue;
      worst = Math.min(worst, orbitalPeriod(separation, total) / FIXED_STEP);
    }
  }
  return Number.isFinite(worst) ? worst : Number.POSITIVE_INFINITY;
}

/** Below this the fixed step is not resolving the tightest pair and the panel says so. */
export const RESOLVED_STEPS_PER_ORBIT = 40;

/** Relative energy drift since the last change to the set of bodies. */
export function energyDrift(state: SandboxState): number {
  if (state.bodies.length === 0 || state.referenceEnergy === 0) return 0;
  return (totalEnergy(state.bodies) - state.referenceEnergy) / Math.abs(state.referenceEnergy);
}

/** Largest relativistic fraction across the bodies — §2.6's "show it, do not cut it off". */
export function largestRelativisticFraction(state: SandboxState): number {
  let worst = 0;
  for (let i = 0; i < state.bodies.length; i++) {
    worst = Math.max(worst, relativisticFraction(state.bodies, i));
  }
  return worst;
}

/** Colour bands for the trails: below circular, above circular, above escape. */
export type Band = 'slow' | 'fast' | 'unbound';

/**
 * A circular orbit sits at exactly 1/√2 of the local escape speed, at every radius — so that
 * ratio, and not a tuned number, is where "slow" becomes "fast".
 */
export const CIRCULAR_FRACTION = Math.SQRT1_2;

export const bandOf = (escapeFraction: number): Band =>
  escapeFraction >= 1 ? 'unbound' : escapeFraction >= CIRCULAR_FRACTION ? 'fast' : 'slow';

/**
 * Trail segments split into the three bands, as (x, y, age) line pairs.
 *
 * One buffer per band across every body, so the whole field costs three draw calls rather than
 * one per segment. The band is taken from the segment's starting sample.
 */
export function trailBands(state: SandboxState): Record<Band, Float32Array> {
  const buckets: Record<Band, number[]> = { slow: [], fast: [], unbound: [] };
  for (const trail of state.trails) {
    for (let i = 1; i < trail.length; i++) {
      const from = trail[i - 1] as TrailPoint;
      const to = trail[i] as TrailPoint;
      const age = trail.length < TWO ? 1 : i / (trail.length - 1);
      const bucket = buckets[bandOf(from.escapeFraction)];
      bucket.push(from.x, from.y, age, to.x, to.y, age);
    }
  }
  return {
    slow: new Float32Array(buckets.slow),
    fast: new Float32Array(buckets.fast),
    unbound: new Float32Array(buckets.unbound),
  };
}

/** Body positions as (x, y, age) points, for the glyph pass. */
export function bodyPoints(state: SandboxState, kind: string): Float32Array {
  const data: number[] = [];
  for (const b of state.bodies) if (b.kind === kind) data.push(b.x, b.y, 1);
  return new Float32Array(data);
}

/** The drag arrow, from the placement point to the cursor, as a line pair. */
export function dragVertices(
  fromX: number, fromY: number, toX: number, toY: number,
): Float32Array {
  const data = new Float32Array(TWO * FLOATS_PER_VERTEX);
  data[0] = fromX; data[1] = fromY; data[2] = 1;
  data[THREE] = toX; data[4] = toY; data[5] = 1;
  return data;
}

/**
 * Velocity a drag encodes: the arrow points the way the body will go, and its length in sim
 * units *is* the speed. One sim unit of drag is one sim unit of speed — stated rather than
 * scaled, so the reader can predict a circular orbit and check it.
 */
export const velocityFromDrag = (
  fromX: number, fromY: number, toX: number, toY: number,
): { vx: number; vy: number } => ({ vx: toX - fromX, vy: toY - fromY });
