/** Orbit integration and the precession readout for the Mercury sim, PHYSICS_SPEC §2.5 and §8.1.
 *
 * Pure and unit-tested; the renderer draws only what this produces.
 *
 * Everything here works in geometric units with the semi-major axis set to 1, so the single
 * parameter that fixes the geometry is mu = GM/(a c^2) — the dimensionless field strength the
 * weak-field formula is an expansion in. Mercury's real value is 2.55e-8, at which the drift is
 * 0.1 arcseconds per orbit and no animation can show it. The canvas therefore runs at a mu five
 * million times larger, which is a property of the *view*: `core/mercury.ts` holds the real
 * figures and nothing in this file feeds them.
 *
 * The consequence of exaggerating is that the leading-order formula stops being accurate, and
 * this module reports that rather than hiding it — `formulaAdvancePerOrbit` beside the measured
 * advance, and the ratio between them.
 */
import {
  angularMomentumForTurningPoints,
  circularOrbits,
  orbitAcceleration,
} from '../../../core/orbit';
import { createYoshida4 } from '../../../core/integrators/symplectic';
import { DEGREES_IN_HALF_TURN } from '../../../core/units';

/** The semi-major axis is the unit of length, so a = 1 and M = mu throughout. */
export const SEMI_MAJOR_AXIS = 1;
const TWO_PI = 2 * Math.PI;
const THREE = 3;
/** Steps per orbit. The measured advance is converged to 1e-4 degrees by 500; 1500 is margin. */
const STEPS_PER_ORBIT_VALUE = 1500;
export const STEPS_PER_ORBIT = STEPS_PER_ORBIT_VALUE;
/** Samples kept in the trail, in steps — five orbits, which is what makes a rosette rather than
 * an arc. Held in integrator steps, not frames, so the tail is the same length at every speed. */
const TRAIL_ORBITS = 5;
const DEFAULT_TRAIL = STEPS_PER_ORBIT_VALUE * TRAIL_ORBITS;
const FLOATS_PER_VERTEX = 3;
const STATIC_AGE = 1;
/** A perihelion needs three samples to bracket; the parabola through them locates it. */
const BRACKET = 3;
const PERCENT = 100;

export interface OrbitParams {
  /** mu = GM/(a c^2). Mercury's real value is 2.55e-8; the canvas exaggerates it. */
  fieldStrength: number;
  eccentricity: number;
  relativistic: boolean;
}

/** Kepler period at a = 1, in geometric time units: T = 2 pi sqrt(a^3/M). */
export function orbitalPeriod(fieldStrength: number): number {
  if (!(fieldStrength > 0)) throw new RangeError('The field strength must be positive.');
  return TWO_PI * Math.sqrt(SEMI_MAJOR_AXIS ** THREE / fieldStrength);
}

/** Periapsis and apoapsis of an orbit of semi-major axis 1 and the given eccentricity. */
export function apsides(eccentricity: number): { periapsis: number; apoapsis: number } {
  if (!(eccentricity >= 0) || eccentricity >= 1) {
    throw new RangeError('Eccentricity must lie in [0, 1).');
  }
  return {
    periapsis: SEMI_MAJOR_AXIS * (1 - eccentricity),
    apoapsis: SEMI_MAJOR_AXIS * (1 + eccentricity),
  };
}

/**
 * The leading-order advance per orbit, radians: 6 pi GM / (a(1-e^2) c^2) = 6 pi mu / (1-e^2).
 *
 * Written in mu rather than by calling `core/mercury.ts`, because this is the *animation's*
 * comparison value at the exaggerated field strength. The real Mercury figure is a separate
 * quantity and the UI shows both, never one standing in for the other.
 */
export function formulaAdvancePerOrbit(params: OrbitParams): number {
  if (!params.relativistic) return 0;
  const { fieldStrength, eccentricity } = params;
  return (6 * Math.PI * fieldStrength) / (1 - eccentricity * eccentricity);
}

/**
 * Whether these apsides describe a precessing orbit, a plunge, or nothing at all.
 *
 * Three outcomes, because the mass slider reaches all three and they are different facts:
 *
 * - `precessing` — the periapsis is outside the potential barrier and the orbit turns there.
 * - `plunging` — an L solves V_eff(r_p) = V_eff(r_a), but the requested periapsis lies *inside*
 *   the barrier peak. It is a point on the way in, not a turning point, and the particle falls
 *   through the horizon. Past about mu = 0.15 at Mercury's eccentricity, this is the case.
 * - `unavailable` — no L solves the condition at all. At mu = 0.2 and e = 0.6 the requested
 *   periapsis is 2M, the horizon itself, and no bound orbit has a turning point there.
 *
 * The Newtonian potential has no barrier, so it never plunges and never runs out of solutions
 * for a periapsis inside an apoapsis.
 */
export function orbitStatus(params: OrbitParams): OrbitStatus {
  const { periapsis, apoapsis } = apsides(params.eccentricity);
  const { fieldStrength } = params;
  let angularMomentum: number;
  try {
    angularMomentum = angularMomentumForTurningPoints(
      periapsis, apoapsis, fieldStrength, params.relativistic,
    );
  } catch {
    return 'unavailable';
  }
  if (!params.relativistic) return 'precessing';
  const circular = circularOrbits(fieldStrength, angularMomentum);
  // The unstable circular radius is the barrier peak.
  if (circular === null || periapsis <= circular.inner) return 'plunging';
  return 'precessing';
}

export type OrbitStatus = 'precessing' | 'plunging' | 'unavailable';

export interface Seed {
  angularMomentum: number;
  position: readonly [number, number];
  velocity: readonly [number, number];
}

/**
 * Launch state at periapsis, seeded from the turning points rather than from vis-viva.
 *
 * Newtonian vis-viva seeding is wrong here by an amount that grows with mu: at mu = 0.05 it
 * collapses the eccentricity from 0.206 to 0.029, because the velocity that gives a Newtonian
 * ellipse gives a different orbit in the relativistic potential. Solving V_eff(r_p) = V_eff(r_a)
 * for L instead reproduces the requested apsides exactly in whichever potential is in use, so
 * the Newtonian and relativistic orbits differ only in their physics and not in their shape.
 */
export function seedOrbit(params: OrbitParams): Seed {
  const { periapsis, apoapsis } = apsides(params.eccentricity);
  const angularMomentum = angularMomentumForTurningPoints(
    periapsis, apoapsis, params.fieldStrength, params.relativistic,
  );
  return {
    angularMomentum,
    position: [periapsis, 0],
    velocity: [0, angularMomentum / periapsis],
  };
}

export interface Sample {
  x: number;
  y: number;
}

/**
 * One integrated orbit, with its perihelion passages recorded as they happen.
 *
 * The advance is measured, never assumed: each perihelion is located by fitting a parabola to
 * the three samples that bracket the radial minimum and reading the angle at its vertex, and the
 * cumulative advance is the running sum of the differences between consecutive perihelion
 * angles. Sampling the angle at the nearest step instead would quantise the measurement at
 * 2 pi / 1500 = 0.24 degrees, which is a third of the whole effect at the low end of the slider.
 */
export class PrecessionRun {
  readonly params: OrbitParams;
  readonly angularMomentum: number;
  readonly period: number;
  readonly step: number;
  #q = new Float64Array(2);
  #v = new Float64Array(2);
  #integrator = createYoshida4(2);
  #trail: Sample[] = [];
  #maxTrail: number;
  #time = 0;
  /** Radius and angle of the last three steps, oldest first — the perihelion bracket. */
  #recent: { radius: number; angle: number }[] = [];
  #perihelionAngles: number[] = [];
  #cumulative = 0;
  #plunged = false;

  constructor(params: OrbitParams, { maxTrail = DEFAULT_TRAIL } = {}) {
    this.params = params;
    const seed = seedOrbit(params);
    this.angularMomentum = seed.angularMomentum;
    this.period = orbitalPeriod(params.fieldStrength);
    this.step = this.period / STEPS_PER_ORBIT;
    this.#maxTrail = maxTrail;
    this.#q[0] = seed.position[0];
    this.#q[1] = seed.position[1];
    this.#v[0] = seed.velocity[0];
    this.#v[1] = seed.velocity[1];
    this.#trail.push({ x: this.#q[0]!, y: this.#q[1]! });
    this.#record();
  }

  get position(): Sample {
    return { x: this.#q[0]!, y: this.#q[1]! };
  }

  get radius(): number {
    return Math.hypot(this.#q[0]!, this.#q[1]!);
  }

  get trail(): readonly Sample[] {
    return this.#trail;
  }

  /** Angles at which the particle has reached periapsis, radians, unwrapped and in order. */
  get perihelionAngles(): readonly number[] {
    return this.#perihelionAngles;
  }

  /** Completed orbits: the number of *intervals* between perihelion passages. */
  get orbitsCompleted(): number {
    return Math.max(0, this.#perihelionAngles.length - 1);
  }

  /** Total perihelion advance so far, radians. Zero until a second perihelion is reached. */
  get cumulativeAdvance(): number {
    return this.#cumulative;
  }

  /** Measured advance per orbit, radians, or null before the first full orbit. */
  get measuredAdvancePerOrbit(): number | null {
    return this.orbitsCompleted > 0 ? this.#cumulative / this.orbitsCompleted : null;
  }

  /** Elapsed time in orbital periods — fractional, so it moves every frame. */
  get elapsedOrbits(): number {
    return this.#time / this.period;
  }

  /** True once the particle has crossed the horizon at r = 2M. Integration stops there. */
  get plunged(): boolean {
    return this.#plunged;
  }

  #record(): void {
    const radius = this.radius;
    const raw = Math.atan2(this.#q[1]!, this.#q[0]!);
    const previous = this.#recent.at(-1);
    // Unwrapped against the previous sample, so the parabola below is fitted to a continuous
    // angle and a perihelion that happens to fall across the branch cut is not mismeasured by
    // a full turn.
    const angle = previous ? unwrap(raw, previous.angle) : raw;
    this.#recent.push({ radius, angle });
    if (this.#recent.length > BRACKET) this.#recent.shift();
    this.#detect();
  }

  #detect(): void {
    if (this.#recent.length < BRACKET) return;
    const [first, middle, last] = this.#recent as [
      { radius: number; angle: number },
      { radius: number; angle: number },
      { radius: number; angle: number },
    ];
    if (!(middle.radius < first.radius && middle.radius < last.radius)) return;
    // Vertex of the parabola through the three radii, as a fraction of a step either side of
    // the middle sample, then the same parabola evaluated on the angles at that offset.
    const curvature = first.radius - 2 * middle.radius + last.radius;
    const offset = curvature === 0 ? 0 : (0.5 * (first.radius - last.radius)) / curvature;
    const angle = middle.angle
      + (offset * (last.angle - first.angle)) / 2
      + (offset * offset * (first.angle - 2 * middle.angle + last.angle)) / 2;
    const previous = this.#perihelionAngles.at(-1);
    // The angle is unwrapped continuously, so consecutive perihelia are a full turn plus the
    // advance apart. The turn is subtracted exactly rather than by wrapping into (-pi, pi],
    // which would silently alias an advance past half a turn -- and the mass slider reaches a
    // field strength where the advance is a large fraction of a turn.
    if (previous !== undefined) this.#cumulative += angle - previous - TWO_PI;
    this.#perihelionAngles.push(angle);
  }

  /** Advance by `steps` integrator steps. The caller owns the clock, so pausing simply stops. */
  advance(steps: number): void {
    if (this.#plunged) return;
    const { fieldStrength, relativistic } = this.params;
    const horizon = 2 * fieldStrength;
    for (let i = 0; i < steps; i++) {
      this.#integrator.step(this.#q, this.#v, this.step, (position, out) => {
        const [ax, ay] = orbitAcceleration(
          position[0]!, position[1]!, fieldStrength, this.angularMomentum, relativistic,
        );
        out[0] = ax;
        out[1] = ay;
      });
      this.#time += this.step;
      this.#record();
      this.#trail.push({ x: this.#q[0]!, y: this.#q[1]! });
      if (this.radius <= horizon) {
        this.#plunged = true;
        break;
      }
    }
    // Spliced once rather than shifted per sample: at the top of the speed slider a frame adds
    // thousands of steps, and a shift per step is a quadratic cost in the frame budget.
    const excess = this.#trail.length - this.#maxTrail;
    if (excess > 0) this.#trail.splice(0, excess);
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

  /**
   * Advance still to complete the current turn: the total, less whole turns already swept.
   *
   * At the default mass the perihelion advances 74 degrees an orbit, so it goes right round in
   * under five orbits. Drawing the whole accumulated angle then traces a closed circle that says
   * nothing; the readout carries the running total instead, and the arc shows where in the
   * current turn the perihelion has got to.
   */
  get advanceWithinTurn(): number {
    const turns = Math.trunc(this.#cumulative / TWO_PI);
    return this.#cumulative - turns * TWO_PI;
  }

  /**
   * The perihelion locus: the arc swept by the periapsis point itself, within the current turn.
   *
   * Drawn at the periapsis radius, back from the latest perihelion — which is the line the
   * reader is being asked to look at. With one perihelion recorded there is no arc yet and this
   * returns an empty array.
   */
  perihelionArc(segments: number): Float32Array {
    const angles = this.#perihelionAngles;
    if (angles.length < 2 || segments < 1) return new Float32Array(0);
    const end = angles.at(-1)!;
    const start = end - this.advanceWithinTurn;
    const radius = apsides(this.params.eccentricity).periapsis;
    const data = new Float32Array((segments + 1) * FLOATS_PER_VERTEX);
    for (let i = 0; i <= segments; i++) {
      const angle = start + ((end - start) * i) / segments;
      data[i * FLOATS_PER_VERTEX] = radius * Math.cos(angle);
      data[i * FLOATS_PER_VERTEX + 1] = radius * Math.sin(angle);
      data[i * FLOATS_PER_VERTEX + 2] = STATIC_AGE;
    }
    return data;
  }

  /**
   * The swept angle as a filled sector, from the centre out to the periapsis radius.
   *
   * A one-pixel arc at the periapsis radius is hard to pick out of a rosette drawn in the same
   * few hundred pixels. The sector is the same angle, drawn as an area, and it is the quantity
   * the whole page is about.
   */
  perihelionWedge(segments: number): Float32Array {
    const angles = this.#perihelionAngles;
    if (angles.length < 2 || segments < 1) return new Float32Array(0);
    const end = angles.at(-1)!;
    const swept = this.advanceWithinTurn;
    const radius = apsides(this.params.eccentricity).periapsis;
    const data = new Float32Array((segments + 2) * FLOATS_PER_VERTEX);
    data[2] = STATIC_AGE;
    for (let i = 0; i <= segments; i++) {
      const angle = end - swept + (swept * i) / segments;
      const base = (i + 1) * FLOATS_PER_VERTEX;
      data[base] = radius * Math.cos(angle);
      data[base + 1] = radius * Math.sin(angle);
      data[base + 2] = STATIC_AGE;
    }
    return data;
  }

  /**
   * Radial spokes at the first and the latest perihelion, as (x, y, age) line pairs.
   *
   * Two, not one per orbit: the angle between these two lines *is* the accumulated advance, and
   * a spoke at every passage fills the disc within a few seconds at the top of the speed slider
   * and stops reading as an angle at all.
   */
  perihelionSpokes(): Float32Array {
    const angles = this.#perihelionAngles;
    if (angles.length === 0) return new Float32Array(0);
    const radius = apsides(this.params.eccentricity).periapsis;
    const latest = angles.at(-1)!;
    const marked = angles.length > 1 ? [latest - this.advanceWithinTurn, latest] : [angles[0]!];
    const data = new Float32Array(marked.length * 2 * FLOATS_PER_VERTEX);
    for (let i = 0; i < marked.length; i++) {
      const angle = marked[i]!;
      const base = i * 2 * FLOATS_PER_VERTEX;
      data[base + 2] = STATIC_AGE;
      data[base + FLOATS_PER_VERTEX] = radius * Math.cos(angle);
      data[base + FLOATS_PER_VERTEX + 1] = radius * Math.sin(angle);
      data[base + FLOATS_PER_VERTEX + 2] = STATIC_AGE;
    }
    return data;
  }
}

/** Brings `angle` within half a turn of `reference`, so a sequence stays continuous. */
export function unwrap(angle: number, reference: number): number {
  let value = angle;
  while (value - reference > Math.PI) value -= TWO_PI;
  while (value - reference < -Math.PI) value += TWO_PI;
  return value;
}

/** Radians to degrees, via the one place the repo keeps 180. */
export const degrees = (radians: number): number =>
  (radians * DEGREES_IN_HALF_TURN) / Math.PI;

/**
 * The live summary BUILD_PLAN §6 requires.
 *
 * States the three quantities separately and in the same order as the panel: what the animation
 * measured, what the weak-field formula says at the *animation's* field strength, and Mercury's
 * real figure. Collapsing them would let a listener hear the exaggerated drift as the benchmark.
 */
export function describePrecession(
  run: PrecessionRun | null, params: OrbitParams, realArcsecPerCentury: number,
): string {
  const exaggeration = `Mass exaggerated: GM over a c squared is ${params.fieldStrength.toFixed(3)}`
    + ` in this animation and 2.6 times ten to the minus 8 for Mercury.`;
  if (!run) return exaggeration;
  if (run.plunged) {
    return `${exaggeration} At this mass there is no bound orbit: the periapsis lies inside the `
      + `potential barrier and the particle has fallen through the horizon. Nothing precesses.`;
  }
  const measured = run.measuredAdvancePerOrbit;
  if (measured === null) {
    return `${exaggeration} ${run.elapsedOrbits.toFixed(2)} orbits elapsed; the advance is `
      + `measured between perihelion passages, so the first figure appears after one full orbit.`;
  }
  const formula = formulaAdvancePerOrbit(params);
  const comparison = formula > 0
    ? `The weak-field formula gives ${degrees(formula).toFixed(2)} degrees at this mass, `
      + `${((measured / formula - 1) * PERCENT).toFixed(0)} per cent low — it is an expansion in `
      + `GM over a c squared and this animation runs far outside its domain.`
    : 'The Newtonian orbit closes: no advance at all.';
  return `${exaggeration} After ${run.orbitsCompleted} orbits the perihelion has advanced `
    + `${degrees(run.cumulativeAdvance).toFixed(1)} degrees in total, `
    + `${degrees(measured).toFixed(3)} degrees per orbit. ${comparison} `
    + `At Mercury's real parameters the advance is ${realArcsecPerCentury.toFixed(2)} `
    + `arcseconds per century.`;
}
