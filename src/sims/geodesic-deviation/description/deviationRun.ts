/** The geodesic-deviation sim's run state. PHYSICS_SPEC §7.6.
 *
 * A ring of test particles around a radially infalling reference observer, carried along the
 * exact Schwarzschild infall from `core/infall.ts` while the Jacobi equation distorts it. Pure:
 * it knows about ellipses and proper time, not about a canvas.
 *
 * Units: r_s = 1 throughout, so M = 1/2 — the convention `core/infall.ts` and `core/kruskal.ts`
 * use. Physical masses and lengths enter only through the spaghettification threshold, which is
 * genuinely dimensional and is computed in SI.
 */
import { createYoshida4 } from '../../../core/integrators/symplectic';
import { properTime, radiusAtProperTime, DEFAULT_START_RADIUS } from '../../../core/infall';
import {
  horizonRadiusMetres,
  spaghettificationRadius,
  tidalEigenvalues,
  tidalStrength,
  traceResidual,
  wronskian,
} from '../../../core/tidal';
import { RHO_STEEL, SIGMA_STEEL, SOLAR_MASS } from '../../../core/units';

const TWO = 2;
const FLOATS_PER_VERTEX = 3;

/** r_s = 1, so the central mass is a half in these units. */
export const SIM_MASS = 0.5;
export const HORIZON = 1;

/**
 * The fall stops here rather than at r = 0.
 *
 * E goes as 1/r³, so the tidal timescale 1/√|E| collapses towards the centre: at 10⁻⁴ r_s a step
 * that resolves the rest of the fall perfectly well has √|E|·h ≈ 750, and nothing a fixed-step
 * integrator produces there means anything. §7.6. Stopping at half a Schwarzschild radius keeps
 * every drawn frame inside the regime the arithmetic is good for, and the body has long since
 * been torn apart by then anyway.
 */
export const FLOOR_RADIUS = 0.5;

/** Initial ring radius, as the brief asks: a twentieth of a Schwarzschild radius. */
export const INITIAL_SEPARATION = 0.05;

export const MIN_START_RADIUS = 3;
export const MAX_START_RADIUS = 20;
export const DEFAULT_RADIUS = DEFAULT_START_RADIUS;

export interface DeviationState {
  /** Proper time since release. */
  properTime: number;
  radius: number;
  /** Semi-axes of the ellipse: radial and transverse. */
  radial: number;
  transverse: number;
  radialRate: number;
  transverseRate: number;
  /** A second, independent solution pair, carried only to measure the Wronskian. */
  companionRadial: number;
  companionTransverse: number;
  companionRadialRate: number;
  companionTransverseRate: number;
  finished: boolean;
}

export function initialState(startRadius: number): DeviationState {
  return {
    properTime: 0,
    radius: startRadius,
    radial: INITIAL_SEPARATION,
    transverse: INITIAL_SEPARATION,
    radialRate: 0,
    transverseRate: 0,
    // Released with unit rate and zero displacement: independent of the first by construction,
    // so the Wronskian starts at exactly INITIAL_SEPARATION.
    companionRadial: 0,
    companionTransverse: 0,
    companionRadialRate: 1,
    companionTransverseRate: 1,
    finished: false,
  };
}

/** Proper time from release to the floor. The whole animation lasts this long. */
export const fallDuration = (startRadius: number): number =>
  properTime(FLOOR_RADIUS, startRadius);

const STATE_DIMENSION = 4;

/**
 * Advance the ellipse by `steps` of `step` proper time.
 *
 * `createYoshida4`'s contract is an autonomous q″ = a(q), and this force is not: E depends on τ
 * through r(τ). The eigenvalues are therefore frozen across each step, which costs the scheme
 * its formal order — and the Wronskian is what measures the cost, which is why the sim carries
 * a second solution and puts the number on screen rather than asserting the integration is fine.
 */
export function advance(
  state: DeviationState, steps: number, step: number, startRadius: number,
): DeviationState {
  if (state.finished || steps <= 0) return state;
  const stepper = createYoshida4(STATE_DIMENSION);
  const q = Float64Array.from([
    state.radial, state.transverse, state.companionRadial, state.companionTransverse,
  ]);
  const v = Float64Array.from([
    state.radialRate, state.transverseRate,
    state.companionRadialRate, state.companionTransverseRate,
  ]);
  const total = fallDuration(startRadius);
  let tau = state.properTime;
  let radius = state.radius;
  let finished = false;

  for (let i = 0; i < steps; i++) {
    if (tau >= total) { finished = true; break; }
    radius = Math.max(radiusAtProperTime(Math.min(tau, total), startRadius), FLOOR_RADIUS);
    const eigen = tidalEigenvalues(radius, SIM_MASS);
    stepper.step(q, v, step, (position, out) => {
      // The Jacobi equation's minus sign, which is the whole physics: a negative E_rr drives a
      // radial separation OUTWARD. §7.6.
      out[0] = -eigen.radial * position[0]!;
      out[1] = -eigen.transverse * position[1]!;
      out[TWO] = -eigen.radial * position[TWO]!;
      out[THREE_INDEX] = -eigen.transverse * position[THREE_INDEX]!;
    });
    tau += step;
    if (tau >= total) { tau = total; finished = true; }
  }

  return {
    properTime: tau,
    radius: Math.max(radiusAtProperTime(Math.min(tau, total), startRadius), FLOOR_RADIUS),
    radial: q[0]!,
    transverse: q[1]!,
    radialRate: v[0]!,
    transverseRate: v[1]!,
    companionRadial: q[TWO]!,
    companionTransverse: q[THREE_INDEX]!,
    companionRadialRate: v[TWO]!,
    companionTransverseRate: v[THREE_INDEX]!,
    finished,
  };
}

const THREE_INDEX = 3;

/** Strain: how far each axis has moved from where it started. */
export const strain = (state: DeviationState): { radial: number; transverse: number } => ({
  radial: state.radial / INITIAL_SEPARATION,
  transverse: state.transverse / INITIAL_SEPARATION,
});

/** The ellipse's area, which is NOT conserved — it grows. §7.6. */
export const ellipseArea = (state: DeviationState): number =>
  Math.PI * state.radial * state.transverse;

/**
 * The 3-volume ξ_r ξ_⊥², which focuses.
 *
 * Stationary at release because the tidal tensor is trace-free, and decreasing thereafter
 * because the shear terms are strictly negative — Raychaudhuri. This is the quantity the
 * trace-free condition actually constrains, and it is not the drawn area.
 */
export const enclosedVolume = (state: DeviationState): number =>
  state.radial * state.transverse * state.transverse;

/** |ΔW/W₀| along each axis: the exact invariant, and the integrator's report card. */
export function wronskianDrift(state: DeviationState): number {
  const start = INITIAL_SEPARATION;
  const radial = wronskian(
    { value: state.radial, rate: state.radialRate },
    { value: state.companionRadial, rate: state.companionRadialRate },
  );
  const transverse = wronskian(
    { value: state.transverse, rate: state.transverseRate },
    { value: state.companionTransverse, rate: state.companionTransverseRate },
  );
  return Math.max(
    Math.abs((radial - start) / start), Math.abs((transverse - start) / start),
  );
}

/** The tidal figures at the observer's current radius, for the readouts. */
export function figuresAt(radius: number): {
  radial: number; transverse: number; residual: number; strength: number;
} {
  const eigen = tidalEigenvalues(radius, SIM_MASS);
  return {
    radial: eigen.radial,
    transverse: eigen.transverse,
    residual: traceResidual(radius, SIM_MASS),
    strength: tidalStrength(radius, SIM_MASS),
  };
}

// ---------------------------------------------------------------------------------------------
// The dimensional part: where a real body of a real material comes apart.
// ---------------------------------------------------------------------------------------------

/** Down to a hundredth of a solar mass, not the brief's 1 M☉: the case it asks to demonstrate —
 * a small hole tearing a body apart well outside its horizon — needs the slider to reach it, and
 * the crossover at 317 M☉ is only interesting if both sides of it are on the dial. */
export const MIN_SOLAR_MASSES = 0.01;
export const MAX_SOLAR_MASSES = 1e9;
export const DEFAULT_SOLAR_MASSES = 10;
export const MIN_HALF_LENGTH = 0.5;
export const MAX_HALF_LENGTH = 10;
export const DEFAULT_HALF_LENGTH = 1;

export interface Spaghetti {
  /** Tearing radius in metres, and in units of r_s so it can be drawn. */
  metres: number;
  inHorizons: number;
  horizonMetres: number;
  /** True when the body comes apart before it crosses. */
  outsideHorizon: boolean;
}

/** Where a steel body of half-length L is torn apart, around a hole of this many solar masses. */
export function spaghetti(solarMasses: number, halfLength: number): Spaghetti {
  const massKilograms = solarMasses * SOLAR_MASS;
  const metres = spaghettificationRadius(massKilograms, halfLength, RHO_STEEL, SIGMA_STEEL);
  const horizonMetres = horizonRadiusMetres(massKilograms);
  return {
    metres,
    horizonMetres,
    inHorizons: metres / horizonMetres,
    outsideHorizon: metres > horizonMetres,
  };
}

// ---------------------------------------------------------------------------------------------
// Geometry. Vertices are (x, y, age) triples for `ui/gl/LineRenderer`.
// ---------------------------------------------------------------------------------------------

/**
 * The ellipse of test particles, as a closed loop.
 *
 * The radial semi-axis runs along x — towards the hole — and the transverse along y, so the
 * shape on screen is the shape a body would take: long in the direction of the fall.
 */
export function ellipseVertices(
  state: DeviationState, centreX: number, centreY: number, segments: number,
): Float32Array {
  const data = new Float32Array(segments * FLOATS_PER_VERTEX);
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * TWO;
    data[i * FLOATS_PER_VERTEX] = centreX + state.radial * Math.cos(angle);
    data[i * FLOATS_PER_VERTEX + 1] = centreY + state.transverse * Math.sin(angle);
    data[i * FLOATS_PER_VERTEX + 2] = 1;
  }
  return data;
}

/** The particles themselves, so the distortion reads as a ring of bodies rather than an outline. */
export function particleVertices(
  state: DeviationState, centreX: number, centreY: number, count: number,
): Float32Array {
  const data = new Float32Array(count * FLOATS_PER_VERTEX);
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * TWO;
    data[i * FLOATS_PER_VERTEX] = centreX + state.radial * Math.cos(angle);
    data[i * FLOATS_PER_VERTEX + 1] = centreY + state.transverse * Math.sin(angle);
    data[i * FLOATS_PER_VERTEX + 2] = 1;
  }
  return data;
}

/** A dashed vertical line, for the reference worldline and the horizon. */
export function dashedVertical(
  x: number, from: number, to: number, dashes: number,
): Float32Array {
  const data = new Float32Array(dashes * TWO * FLOATS_PER_VERTEX);
  const span = (to - from) / (dashes * TWO - 1);
  for (let i = 0; i < dashes; i++) {
    const start = from + span * (i * TWO);
    data[i * TWO * FLOATS_PER_VERTEX] = x;
    data[i * TWO * FLOATS_PER_VERTEX + 1] = start;
    data[i * TWO * FLOATS_PER_VERTEX + 2] = 1;
    data[i * TWO * FLOATS_PER_VERTEX + FLOATS_PER_VERTEX] = x;
    data[i * TWO * FLOATS_PER_VERTEX + FLOATS_PER_VERTEX + 1] = start + span;
    data[i * TWO * FLOATS_PER_VERTEX + FLOATS_PER_VERTEX + 2] = 1;
  }
  return data;
}

/** A solid vertical line. */
export const solidVertical = (x: number, from: number, to: number): Float32Array =>
  new Float32Array([x, from, 1, x, to, 1]);

/** A circle centred anywhere, for the spaghettification ring. */
export function ringVertices(
  centreX: number, centreY: number, radius: number, segments: number,
): Float32Array {
  const data = new Float32Array(segments * FLOATS_PER_VERTEX);
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * TWO;
    data[i * FLOATS_PER_VERTEX] = centreX + radius * Math.cos(angle);
    data[i * FLOATS_PER_VERTEX + 1] = centreY + radius * Math.sin(angle);
    data[i * FLOATS_PER_VERTEX + 2] = 1;
  }
  return data;
}

export { tidalStrength, SIGMA_STEEL, RHO_STEEL };
