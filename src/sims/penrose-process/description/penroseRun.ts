/** The Penrose process as an animation. PHYSICS_SPEC §3.6.
 *
 * Four phases in one coordinate time: the parent falls in, reaches its turning point inside the
 * ergosphere, splits, and the two fragments go their separate ways. Every number on screen comes
 * from `core/kerr.ts`'s LNRF split; nothing here invents an efficiency.
 *
 * **The efficiency is never clamped.** It comes out of the split, and the split cannot exceed
 * ½(√(2M/r₊) − 1) because that is what the split *is* — `core/kerr.test.ts` walks 400 radii at
 * four spins and asserts it. A demonstration that clamped a number it had computed wrongly would
 * be hiding the error, not preventing it.
 */
import {
  equatorialRates,
  horizonRadii,
  penroseFragments,
  penroseMaxEfficiency,
  penroseSplit,
  type EquatorialOrbit,
  type PenroseSplit,
} from '../../../core/kerr';

const TWO = 2;
const HALF = 0.5;
const FLOATS_PER_VERTEX = 3;
const SIX = 6;

/** Stop a plunging fragment here. Boyer–Lindquist coordinate time never reaches the horizon. */
export const STOP_FACTOR = 1.0008;
/** Once a fragment is out here it has escaped; there is nothing left to show. */
export const ESCAPE_RADIUS = 18;
/** Where the parent is released. Far enough out to read as "arriving", close enough to be brief. */
export const RELEASE_RADIUS = 6;

/**
 * How far off the turning point each fragment starts, in M.
 *
 * **A turning point is a fixed point of the first-order radial equation.** dr/dt = ±√(…)
 * vanishes there, so every RK4 stage evaluates zero, and the fragments sat at the split radius
 * for twenty thousand M of coordinate time without moving — the run never reached its final
 * phase and the escaping fragment never escaped. Physically they do leave, and in finite time,
 * because ∫dr/√(r−r_turn) converges; it is the discretisation that cannot, not the trajectory.
 *
 * Offsetting by a hair in each fragment's own direction of travel starts them off the fixed
 * point. The cost is that each begins 10⁻⁴ M from where it was created, which is four orders of
 * magnitude below anything on screen and changes no energy: E and L_z are the conserved
 * quantities of the orbit, and they are set at the split, not by where the integration starts.
 */
const TURNING_OFFSET = 1e-4;

export type Phase = 'approaching' | 'split' | 'separating' | 'done';

export interface Body {
  radius: number;
  angle: number;
  /** Finished: reached the stop radius or the escape radius. */
  finished: boolean;
}

export interface RunState {
  phase: Phase;
  time: number;
  parent: Body;
  plunging: Body;
  escaping: Body;
  /** Sampled path of each body, oldest first. */
  parentTrail: Body[];
  plungingTrail: Body[];
  escapingTrail: Body[];
}

export interface RunParams {
  spin: number;
  /** Where the split happens, in M. Between r₊ and 2M for any gain at all. */
  splitRadius: number;
}

export interface Energies {
  incoming: number;
  plunging: number;
  escaping: number;
  /** (E₂ − E_in)/E_in, as a percentage. */
  gainPercent: number;
  /** The theoretical ceiling for this spin, as a percentage. */
  ceilingPercent: number;
  /** True when the split is inside the ergosphere, which is the only place it can gain. */
  insideErgosphere: boolean;
}

const PERCENT = 100;

export function energies(params: RunParams): Energies {
  const split = penroseSplit(params.splitRadius, params.spin);
  return {
    incoming: 1,
    plunging: split.plungingEnergy,
    escaping: split.escapingEnergy,
    gainPercent: split.gain * PERCENT,
    ceilingPercent: penroseMaxEfficiency(params.spin) * PERCENT,
    insideErgosphere: params.splitRadius < TWO,
  };
}

/**
 * The split radii the slider may reach: outside the horizon, in or on the static limit at 2M.
 *
 * **At a = 0 the range collapses to a point outside the static limit**, because there the horizon
 * and the static limit are the same surface and the ergosphere is empty. That is not a special
 * case to be worked around — it is the answer. A split there has E₁ > 0, so E₂ is *less* than
 * came in, and the readout says so rather than reporting a zero it did not compute.
 */
export function splitRadiusRange(spin: number): { min: number; max: number } {
  const { outer } = horizonRadii(spin);
  const min = outer * STOP_FACTOR;
  return { min, max: Math.max(TWO, min) };
}

export function startRun(params: RunParams): RunState {
  const parent: Body = { radius: RELEASE_RADIUS, angle: 0, finished: false };
  const at: Body = { radius: params.splitRadius, angle: 0, finished: false };
  // Before the split the fragments do not exist; they are parked at the split radius so the
  // readout has something to describe, and are offset off the turning point when created.
  return {
    phase: 'approaching',
    time: 0,
    parent,
    plunging: { ...at },
    escaping: { ...at },
    parentTrail: [parent],
    plungingTrail: [],
    escapingTrail: [],
  };
}

/** One RK4 step of a body along its orbit. Returns null where the body cannot go further. */
function advance(
  body: Body, spin: number, orbit: EquatorialOrbit, step: number,
): Body | null {
  const rate = (radius: number) => equatorialRates(radius, spin, orbit);
  const k1 = rate(body.radius);
  if (!k1) return null;
  const k2 = rate(body.radius + (step * HALF) * k1.radial) ?? k1;
  const k3 = rate(body.radius + (step * HALF) * k2.radial) ?? k2;
  const k4 = rate(body.radius + step * k3.radial) ?? k3;
  const radial = (k1.radial + TWO * k2.radial + TWO * k3.radial + k4.radial) / SIX;
  const angular = (k1.angular + TWO * k2.angular + TWO * k3.angular + k4.angular) / SIX;
  return {
    radius: body.radius + step * radial,
    angle: body.angle + step * angular,
    finished: false,
  };
}

const TRAIL_LIMIT = 1200;

function push(trail: Body[], body: Body): void {
  trail.push(body);
  if (trail.length > TRAIL_LIMIT) trail.shift();
}

/**
 * Advance the whole run by `step` of coordinate time.
 *
 * The parent decelerates into its turning point, so the last approach is refined rather than
 * allowed to overshoot: past the turning point there is no trajectory, and an overshoot would
 * be an integration event presented as a physical one.
 */
export function advanceRun(state: RunState, params: RunParams, step: number): RunState {
  const { spin, splitRadius } = params;
  const split: PenroseSplit = penroseSplit(splitRadius, spin);
  const { outer } = horizonRadii(spin);
  const stop = outer * STOP_FACTOR;
  const next: RunState = { ...state, time: state.time + step };

  if (state.phase === 'approaching') {
    const parentOrbit: EquatorialOrbit = {
      energy: 1, angularMomentum: split.parentAngularMomentum, mass: 1, radialSign: -1,
    };
    const moved = advance(state.parent, spin, parentOrbit, step);
    if (!moved || moved.radius <= splitRadius) {
      // Land exactly on the split radius: it is the turning point, and the animation's next
      // phase is defined there and nowhere else.
      const arrived: Body = {
        radius: splitRadius,
        angle: moved ? moved.angle : state.parent.angle,
        finished: true,
      };
      next.parent = arrived;
      push(next.parentTrail, arrived);
      next.phase = 'split';
      next.plunging = {
        radius: splitRadius - TURNING_OFFSET, angle: arrived.angle, finished: false,
      };
      next.escaping = {
        radius: splitRadius + TURNING_OFFSET, angle: arrived.angle, finished: false,
      };
      return next;
    }
    next.parent = moved;
    push(next.parentTrail, moved);
    return next;
  }

  if (state.phase === 'done') return state;

  const fragments = penroseFragments(split, spin);
  next.phase = 'separating';

  if (!state.plunging.finished) {
    const moved = advance(state.plunging, spin, fragments.plunging, step);
    const landed = !moved || moved.radius <= stop
      ? { radius: stop, angle: moved?.angle ?? state.plunging.angle, finished: true }
      : moved;
    next.plunging = landed;
    push(next.plungingTrail, landed);
  }
  if (!state.escaping.finished) {
    const moved = advance(state.escaping, spin, fragments.escaping, step);
    const landed = !moved || moved.radius >= ESCAPE_RADIUS
      ? { radius: Math.min(moved?.radius ?? ESCAPE_RADIUS, ESCAPE_RADIUS), angle: moved?.angle ?? state.escaping.angle, finished: true }
      : moved;
    next.escaping = landed;
    push(next.escapingTrail, landed);
  }
  if (next.plunging.finished && next.escaping.finished) next.phase = 'done';
  return next;
}

/** Trail vertices as (x, y, age), oldest first. */
export function trailVertices(trail: readonly Body[]): Float32Array {
  const data = new Float32Array(trail.length * FLOATS_PER_VERTEX);
  trail.forEach((body, index) => {
    data[index * FLOATS_PER_VERTEX] = body.radius * Math.cos(body.angle);
    data[index * FLOATS_PER_VERTEX + 1] = body.radius * Math.sin(body.angle);
    data[index * FLOATS_PER_VERTEX + 2] = trail.length < TWO ? 1 : index / (trail.length - 1);
  });
  return data;
}

export const pointVertex = (body: Body): Float32Array =>
  new Float32Array([body.radius * Math.cos(body.angle), body.radius * Math.sin(body.angle), 1]);

/** The sentence the readout carries. Never claims a gain the geometry does not allow. */
export function describeRun(params: RunParams, state: RunState): string {
  const figures = energies(params);
  if (params.spin === 0) {
    return 'With no spin there is no ergosphere at all: the static limit and the horizon are the '
      + 'same surface, so there is nowhere to put a negative-energy fragment. The split still '
      + 'happens — and it loses, because E₁ comes out positive and E₂ is smaller than what came '
      + 'in. The Penrose process needs an ergosphere, and this hole has none.';
  }
  if (!figures.insideErgosphere) {
    return 'The split is on the static limit, not inside the ergosphere. E₁ is zero, E₂ equals '
      + 'the energy that came in, and the gain is exactly zero — not small, zero. Move the split '
      + 'radius inward.';
  }
  return `The plunging fragment carries E₁ = ${figures.plunging.toFixed(4)}, which is negative — `
    + 'only possible inside the ergosphere. The escaping fragment therefore carries '
    + `E₂ = ${figures.escaping.toFixed(4)}, more than came in, and the difference is taken out of `
    + `the hole's rotation. Gain ${figures.gainPercent.toFixed(2)}%, against a ceiling of `
    + `${figures.ceilingPercent.toFixed(2)}% at this spin. Phase: ${state.phase}.`;
}
