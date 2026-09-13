/** The ISCO explorer's state layer, PHYSICS_SPEC §2.5 and §8 rows 38–41.
 *
 * Pure and unit-tested; the renderer draws only what this produces.
 *
 * The sim answers one question: what does "innermost *stable*" mean? A circular orbit exists at
 * every radius above 3M, so the ISCO is not where orbits run out — it is where the restoring
 * force runs out. κ² = V_eff''(r_c) = M(r − 6M)/(r³(r − 3M)) is positive above 6M, zero at it,
 * negative below. Nudge the particle and the sign is what decides whether it comes back.
 *
 * **The clock is Schwarzschild coordinate time.** The integrator advances proper time τ, because
 * that is what makes the Hamiltonian separable and Yoshida-4 applicable, and t is accumulated
 * alongside from dt/dτ = Ẽ/(1 − 2M/r). Playback is paced by t, so the infall visibly stalls as
 * the horizon is approached — which is the whole point, and which is why the run stops at
 * r = 2.001M and says so. No coordinate change happens mid-run.
 */
import {
  circularAngularMomentum,
  circularOrbits,
  circularSpecificEnergy,
  coordinateTimeRate,
  effectivePotential,
  isStableCircularOrbit,
  orbitAcceleration,
  orbitEnergy,
  radialEpicyclicSquared,
  specificEnergyFromOrbitEnergy,
} from '../../../core/orbit';
import { createYoshida4 } from '../../../core/integrators/symplectic';

const TWO = 2;
const THREE = 3;
const SIX = 6;
const TWO_PI = 2 * Math.PI;
const FLOATS_PER_VERTEX = 3;
const STATIC_AGE = 1;

/**
 * Where the animation stops, in units of M.
 *
 * Just outside the horizon at 2M — 1.0005 r_s. Not 2.001 r_s, which would be 4.002M: that is the
 * marginally bound circular orbit, most of the way back out to the ISCO.
 */
export const STOP_RADIUS_OVER_MASS = 2.001;

/** Shown permanently once the particle has plunged. Not a tooltip and not a toggle. */
export const HORIZON_LABEL =
  'Coordinate time diverges at the horizon — interior not shown in Schwarzschild coordinates.';

/** Beyond this the particle is off the plot and the run stops rather than integrating forever. */
export const ESCAPE_RADIUS_OVER_MASS = 60;

/** Integrator steps per orbital period at the launch radius. */
export const STEPS_PER_ORBIT = 1200;
/** Halvings allowed on the final approach so the stop lands on 2.001M and never inside 2M. */
const REFINEMENTS = 24;
const TRAIL_ORBITS = 4;

export interface IscoParams {
  /** Launch radius of the circular orbit, in the same units as `mass`. */
  radius: number;
  /** Radial kick as a fraction of the local tangential speed. Negative is inward. */
  nudge: number;
  mass: number;
}

export type Stability = 'stable' | 'marginal' | 'unstable';

/** Within this of 6M, the orbit reads as being at the ISCO rather than either side of it. */
const MARGINAL_TOLERANCE = 1e-9;

export function stabilityAt(radius: number, mass: number): Stability {
  if (Math.abs(radius - SIX * mass) <= MARGINAL_TOLERANCE * mass) return 'marginal';
  return isStableCircularOrbit(radius, mass) ? 'stable' : 'unstable';
}

/**
 * Period of a small radial oscillation, 2π/κ, or null where there is no restoring force.
 *
 * Diverges at the ISCO: 225 M at 8M, 1,606 M at 6.01M. That divergence is what "marginally
 * stable" means in practice — the orbit is stable, but takes unboundedly long to recover.
 */
export function epicyclicPeriod(radius: number, mass: number): number | null {
  const squared = radialEpicyclicSquared(radius, mass);
  return squared > 0 ? TWO_PI / Math.sqrt(squared) : null;
}

/**
 * Time for a departure from an unstable circular orbit to grow by a factor of e, 1/|κ|.
 *
 * Null where the orbit is stable and nothing grows. Below the ISCO this is the only timescale
 * there is: the orbit is an equilibrium, but an unobservable one — left completely alone, the
 * integrator's own truncation error is a perturbation, and it grows out of it after about
 * seventeen e-folding times whatever the radius. That is not a defect in the sim; it is what
 * "unstable" means, and the page says so rather than hiding it behind a nudge of zero.
 */
export function eFoldingTime(radius: number, mass: number): number | null {
  const squared = radialEpicyclicSquared(radius, mass);
  return squared < 0 ? 1 / Math.sqrt(-squared) : null;
}

/** Orbital period in Schwarzschild coordinate time: exactly Kepler's 2π√(r³/M). */
export function orbitalPeriod(radius: number, mass: number): number {
  if (!(radius > 0) || !(mass > 0)) throw new RangeError('Radius and mass must be positive.');
  return TWO_PI * Math.sqrt(radius ** THREE / mass);
}

export interface LaunchState {
  angularMomentum: number;
  /** Ẽ, conserved along the geodesic — including the nudge's kinetic energy. */
  specificEnergy: number;
  position: readonly [number, number];
  velocity: readonly [number, number];
}

/**
 * Launch on the circular orbit at `radius`, then kick it radially.
 *
 * The kick changes Ẽ but not L: it is purely radial, so x·v_y − y·v_x is untouched. That is what
 * makes the demonstration clean — the potential the particle moves in does not change, only
 * where its energy line sits in it.
 */
export function launchState(params: IscoParams): LaunchState {
  const { radius, nudge, mass } = params;
  const angularMomentum = circularAngularMomentum(radius, mass);
  const tangential = angularMomentum / radius;
  const radial = nudge * tangential;
  const energy = orbitEnergy(radius, 0, radial, tangential, mass);
  return {
    angularMomentum,
    specificEnergy: specificEnergyFromOrbitEnergy(energy),
    position: [radius, 0],
    velocity: [radial, tangential],
  };
}

export interface Sample {
  x: number;
  y: number;
}

export type Outcome = 'orbiting' | 'plunged' | 'escaped';

export class IscoRun {
  readonly params: IscoParams;
  readonly angularMomentum: number;
  readonly specificEnergy: number;
  readonly energy: number;
  readonly baseStep: number;
  #q = new Float64Array(2);
  #v = new Float64Array(2);
  #integrator = createYoshida4(2);
  #trail: Sample[] = [];
  #maxTrail: number;
  #properTime = 0;
  #coordinateTime = 0;
  #outcome: Outcome = 'orbiting';
  #minRadius: number;
  #maxRadius: number;

  constructor(params: IscoParams) {
    this.params = params;
    const seed = launchState(params);
    this.angularMomentum = seed.angularMomentum;
    this.specificEnergy = seed.specificEnergy;
    this.energy = (seed.specificEnergy * seed.specificEnergy - 1) / TWO;
    this.baseStep = orbitalPeriod(params.radius, params.mass) / STEPS_PER_ORBIT;
    this.#maxTrail = STEPS_PER_ORBIT * TRAIL_ORBITS;
    this.#q[0] = seed.position[0];
    this.#q[1] = seed.position[1];
    this.#v[0] = seed.velocity[0];
    this.#v[1] = seed.velocity[1];
    this.#minRadius = params.radius;
    this.#maxRadius = params.radius;
    this.#trail.push({ x: this.#q[0]!, y: this.#q[1]! });
  }

  get position(): Sample {
    return { x: this.#q[0]!, y: this.#q[1]! };
  }

  get radius(): number {
    return Math.hypot(this.#q[0]!, this.#q[1]!);
  }

  /** The faller's own clock. Finite everywhere, including at the horizon. */
  get properTime(): number {
    return this.#properTime;
  }

  /** Schwarzschild t. Diverges at the horizon, which is why the run stops short of it. */
  get coordinateTime(): number {
    return this.#coordinateTime;
  }

  get outcome(): Outcome {
    return this.#outcome;
  }

  get plunged(): boolean {
    return this.#outcome === 'plunged';
  }

  get trail(): readonly Sample[] {
    return this.#trail;
  }

  /** Extremes of r reached so far — the excursion a nudge actually produced. */
  get radiusRange(): { min: number; max: number } {
    return { min: this.#minRadius, max: this.#maxRadius };
  }

  get stopRadius(): number {
    return STOP_RADIUS_OVER_MASS * this.params.mass;
  }

  #force = (position: Float64Array, out: Float64Array): void => {
    const [ax, ay] = orbitAcceleration(
      position[0]!, position[1]!, this.params.mass, this.angularMomentum,
    );
    out[0] = ax;
    out[1] = ay;
  };

  /**
   * Step of proper time at this radius.
   *
   * Constant — and therefore exactly symplectic — everywhere at or above 4M, which is where all
   * of the orbital dynamics this sim is about happens. It shrinks in proportion to r − 2M below
   * that, because the last stretch of a plunge is the part the reader is being asked to watch:
   * at the base step the particle covered 2.10M to 2.001M in two steps and jumped, showing
   * nothing. In proportion to r − 2M, the same stretch takes about 170.
   *
   * The step depends on radius alone, so a near-circular orbit still sees a constant step even
   * below 4M; the symplectic property is given up only on a one-way plunge that terminates.
   */
  #stepFor(radius: number): number {
    const horizon = TWO * this.params.mass;
    return this.baseStep * Math.min(1, (radius - horizon) / horizon);
  }

  /**
   * One step, refined if it would carry the particle past the stop radius.
   *
   * Without the refinement a step that overshot 2M would leave Schwarzschild t undefined — and
   * `coordinateTimeRate` throws there rather than returning a large number, so the whole sim
   * would come down.
   */
  #stepOnce(): boolean {
    const stop = this.stopRadius;
    let step = this.#stepFor(this.radius);
    const savedQ = Float64Array.from(this.#q);
    const savedV = Float64Array.from(this.#v);
    for (let refinement = 0; refinement <= REFINEMENTS; refinement++) {
      this.#q.set(savedQ);
      this.#v.set(savedV);
      this.#integrator.step(this.#q, this.#v, step, this.#force);
      if (this.radius > stop) break;
      if (refinement === REFINEMENTS) {
        this.#outcome = 'plunged';
        return false;
      }
      step /= TWO;
    }
    // dt/dτ evaluated at the midpoint of the step, which is second-order rather than first —
    // it matters here because the rate is changing by orders of magnitude per step near the end.
    const midpoint = (Math.hypot(savedQ[0]!, savedQ[1]!) + this.radius) / TWO;
    this.#properTime += step;
    this.#coordinateTime += coordinateTimeRate(midpoint, this.params.mass, this.specificEnergy)
      * step;
    const r = this.radius;
    this.#minRadius = Math.min(this.#minRadius, r);
    this.#maxRadius = Math.max(this.#maxRadius, r);
    this.#trail.push({ x: this.#q[0]!, y: this.#q[1]! });
    const excess = this.#trail.length - this.#maxTrail;
    if (excess > 0) this.#trail.splice(0, excess);
    if (r <= stop) {
      this.#outcome = 'plunged';
      return false;
    }
    if (r >= ESCAPE_RADIUS_OVER_MASS * this.params.mass) {
      this.#outcome = 'escaped';
      return false;
    }
    return true;
  }

  /**
   * Advance until `deltaT` of *coordinate* time has passed, or `maxSteps` are spent.
   *
   * Pacing on t rather than τ is what makes the stall visible: near the horizon one step of
   * proper time buys thousands of steps' worth of coordinate time, so the loop exits after a
   * single step and the particle barely moves.
   */
  advanceCoordinateTime(deltaT: number, maxSteps: number): void {
    if (this.#outcome !== 'orbiting') return;
    const target = this.#coordinateTime + deltaT;
    for (let i = 0; i < maxSteps; i++) {
      if (this.#coordinateTime >= target) return;
      if (!this.#stepOnce()) return;
    }
  }

  /** Trail as (x, y, age) triples, oldest first. Age drives the fade and nothing else. */
  trailVertices(): Float32Array {
    const count = this.#trail.length;
    const data = new Float32Array(count * FLOATS_PER_VERTEX);
    for (let i = 0; i < count; i++) {
      const sample = this.#trail[i]!;
      data[i * FLOATS_PER_VERTEX] = sample.x;
      data[i * FLOATS_PER_VERTEX + 1] = sample.y;
      data[i * FLOATS_PER_VERTEX + 2] = count > 1 ? i / (count - 1) : STATIC_AGE;
    }
    return data;
  }
}

// --- the potential panel ------------------------------------------------------------------

export interface CurvePoint {
  radius: number;
  potential: number;
}

const CURVE_SAMPLES = 420;
/** The plotted window starts just outside the horizon; V_eff dives to −∞ below it. */
export const MIN_PLOT_RADIUS = 2.05;
/** Padding above and below the plotted band. */
const PAD_FRACTION = 0.1;
/** A floor on the band so a perfectly flat curve still has a scale. */
const MIN_SPAN = 1e-9;
/** The band runs from this many scales below the well floor to this many above. */
const BAND_BELOW = 0.8;
const BAND_ABOVE = 3;
/** The radius excursion the curvature scale is measured over, as a fraction of r_c. */
const CURVATURE_FRACTION = 0.1;
/** The r window: this multiple of the launch radius, clamped so the ISCO is always on screen. */
const WINDOW_MULTIPLE = 1.8;
const WINDOW_MIN = 12;
const WINDOW_MAX = 40;

/** V_eff sampled from just outside the horizon out to `maxRadius`, in units of M. */
export function potentialCurve(
  mass: number, angularMomentum: number, maxRadius: number,
): CurvePoint[] {
  if (!(maxRadius > MIN_PLOT_RADIUS)) throw new RangeError('The window must contain the horizon.');
  const points: CurvePoint[] = [];
  for (let i = 0; i <= CURVE_SAMPLES; i++) {
    const radius = (MIN_PLOT_RADIUS + ((maxRadius - MIN_PLOT_RADIUS) * i) / CURVE_SAMPLES) * mass;
    points.push({ radius, potential: effectivePotential(radius, mass, angularMomentum) });
  }
  return points;
}

/**
 * The r window: wide enough to hold the ISCO and the orbit, capped so the well stays legible.
 */
export function plotWindow(launchRadius: number, mass: number): number {
  const wanted = Math.max((launchRadius / mass) * WINDOW_MULTIPLE, WINDOW_MIN);
  return Math.min(wanted, WINDOW_MAX);
}

/**
 * Vertical band worth plotting, scaled to the excursion the particle actually makes.
 *
 * Three rules that each replaced something that did not work:
 *
 * 1. Not the extremes of the sampled curve. V_eff dives towards −∞ near the horizon, so the band
 *    came out ten times too tall and the structure — a well a hundredth of a unit deep — was a
 *    flat line.
 * 2. Not the two circular orbits either. At r_c = 9M the barrier stands 0.0093 above the well
 *    while a −0.06 nudge explores 0.0003 of it, so the energy line and its turning points sat
 *    invisibly on the floor. The barrier is drawn if it falls inside the band and is allowed to
 *    leave the top of the frame if it does not; the particle cannot reach it either way.
 * 3. The scale is the larger of the energy excursion and the well's own curvature over a tenth
 *    of the launch radius, ½|κ²|(r_c/10)². The second is what gives a zero nudge a sensible
 *    zoom instead of a degenerate one — and at r_c = 9M the two agree to 7%, which is the check
 *    that the curvature scale is the right stand-in.
 */
export function curveBounds(
  mass: number, angularMomentum: number, launchRadius: number, energy: number,
): { minY: number; maxY: number } {
  const circular = circularOrbits(mass, angularMomentum);
  const windowTop = plotWindow(launchRadius, mass) * mass;
  const launchValue = effectivePotential(launchRadius, mass, angularMomentum);
  // Anchored on the well floor, or on the right-hand edge of the window when the well lies
  // beyond it — an anchor off screen sets a band for a feature the reader cannot see.
  const floorRadius = circular ? Math.min(circular.outer, windowTop) : windowTop;
  const floor = effectivePotential(floorRadius, mass, angularMomentum);
  const curvature = Math.abs(radialEpicyclicSquared(launchRadius, mass))
    * (launchRadius * CURVATURE_FRACTION) ** TWO / TWO;
  const scale = Math.max(energy - floor, curvature, MIN_SPAN);
  const low = Math.min(floor - scale * BAND_BELOW, energy, launchValue);
  let high = Math.max(floor + scale * BAND_ABOVE, energy, launchValue);
  if (circular) {
    const peak = effectivePotential(circular.inner, mass, angularMomentum);
    // Included only if it already falls inside: a barrier twenty radii away and ten times the
    // well's depth would flatten the well again for an obstacle nothing can reach.
    if (peak <= high) high = Math.max(high, peak);
  }
  const pad = (high - low) * PAD_FRACTION;
  return { minY: low - pad, maxY: high + pad };
}

/** A horizontal line at the particle's energy, as (x, y, age) triples. */
export function energyLine(energy: number, from: number, to: number): Float32Array {
  return new Float32Array([from, energy, STATIC_AGE, to, energy, STATIC_AGE]);
}

/** A vertical marker at `radius`, as (x, y, age) triples. */
export function verticalMarker(radius: number, minY: number, maxY: number): Float32Array {
  return new Float32Array([radius, minY, STATIC_AGE, radius, maxY, STATIC_AGE]);
}

/** The curve as a line strip. */
export function curveVertices(curve: CurvePoint[]): Float32Array {
  const data = new Float32Array(curve.length * FLOATS_PER_VERTEX);
  curve.forEach((point, index) => {
    data[index * FLOATS_PER_VERTEX] = point.radius;
    data[index * FLOATS_PER_VERTEX + 1] = point.potential;
    data[index * FLOATS_PER_VERTEX + 2] = STATIC_AGE;
  });
  return data;
}

// --- the spoken summary -------------------------------------------------------------------

const PERCENT = 100;
const PLACES = 3;

/** The live summary BUILD_PLAN §6 requires. Names both clocks, because that is the point. */
export function describeIsco(run: IscoRun | null, params: IscoParams): string {
  const overMass = params.radius / params.mass;
  const stability = stabilityAt(params.radius, params.mass);
  const opening = `Circular orbit at ${overMass.toFixed(2)} M, ${stability}`
    + `${stability === 'marginal' ? ' — this is the ISCO' : ''}.`;
  if (!run) return opening;
  const clocks = `The faller's clock reads ${run.properTime.toFixed(1)} M; Schwarzschild `
    + `coordinate time reads ${run.coordinateTime.toFixed(1)} M.`;
  if (run.plunged) {
    return `${opening} The particle has plunged and the run stopped at `
      + `${STOP_RADIUS_OVER_MASS} M, just outside the horizon. ${clocks} ${HORIZON_LABEL}`;
  }
  if (run.outcome === 'escaped') {
    return `${opening} The nudge sent the particle out past `
      + `${ESCAPE_RADIUS_OVER_MASS} M and it is not coming back. ${clocks}`;
  }
  const range = run.radiusRange;
  return `${opening} Radius ${(run.radius / params.mass).toFixed(PLACES)} M, oscillating between `
    + `${(range.min / params.mass).toFixed(PLACES)} and `
    + `${(range.max / params.mass).toFixed(PLACES)} M. Specific energy `
    + `${run.specificEnergy.toFixed(6)}, so ${((1 - run.specificEnergy) * PERCENT).toFixed(PLACES)}`
    + ` per cent of the rest mass has been given up to get here. ${clocks}`;
}

export { circularSpecificEnergy };
