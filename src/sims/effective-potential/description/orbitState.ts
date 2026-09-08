/** Curve data, orbit integration state and readouts for the effective-potential explorer.
 *
 * Pure and unit-tested. The renderer only draws what this produces, so the picture cannot drift
 * from the physics without a test noticing.
 */
import {
  circularOrbits,
  classifyOrbit,
  effectivePotential,
  iscoAngularMomentum,
  iscoRadius,
  orbitAcceleration,
  photonSphereRadius,
  specificAngularMomentum,
  turningPoints,
  type OrbitClass,
} from '../../../core/orbit';
import { createYoshida4 } from '../../../core/integrators/symplectic';

/** The plotted window, in units of M. §2.5's explorer runs from just outside the horizon. */
export const MIN_PLOT_RADIUS = 2.1;
export const MAX_PLOT_RADIUS = 30;
const CURVE_SAMPLES = 480;
const FLOATS_PER_VERTEX = 3;
const STATIC_AGE = 1;
/** Plot window in V_eff. The potential dives to -infinity at small r, so the band is set by the
 * interesting features — the minimum and the barrier — not by the divergence. */
const POTENTIAL_FLOOR = -0.25;
const POTENTIAL_CEILING = 0.12;
const POTENTIAL_PAD_FRACTION = 0.12;
/** Angular momentum within this of L_ISCO reads as "at the ISCO" in the readout. */
const ISCO_TOLERANCE = 1e-9;

export interface CurvePoint {
  radius: number;
  potential: number;
}

/** V_eff sampled across the plotted window. */
export function potentialCurve(mass: number, angularMomentum: number): CurvePoint[] {
  const points: CurvePoint[] = [];
  for (let i = 0; i <= CURVE_SAMPLES; i++) {
    const radius = (MIN_PLOT_RADIUS + ((MAX_PLOT_RADIUS - MIN_PLOT_RADIUS) * i) / CURVE_SAMPLES)
      * mass;
    points.push({ radius, potential: effectivePotential(radius, mass, angularMomentum) });
  }
  return points;
}

/**
 * Vertical extent worth plotting: the curve clipped to a readable band around its features.
 *
 * Takes no mass, and that is not an oversight: V_eff is dimensionless and scale-free, so the
 * band is the same for every mass. Only the radius labels change.
 */
export function curveBounds(
  points: readonly CurvePoint[],
): { minY: number; maxY: number } {
  // The potential dives to -infinity at small r, so the window is set by the interesting part —
  // the minimum and the barrier — not by the divergence.
  const finite = points.map(p => p.potential).filter(Number.isFinite);
  const lowest = Math.min(...finite);
  const highest = Math.max(...finite);
  const floor = Math.max(lowest, POTENTIAL_FLOOR);
  const ceiling = Math.min(highest, POTENTIAL_CEILING);
  const pad = (ceiling - floor) * POTENTIAL_PAD_FRACTION;
  return { minY: floor - pad, maxY: ceiling + pad };
}

/** The three radii the explorer marks, in units of M. */
export function criticalRadii(mass: number) {
  return {
    horizon: 2 * mass,
    photonSphere: photonSphereRadius(mass),
    isco: iscoRadius(mass),
  };
}

export interface OrbitSample {
  x: number;
  y: number;
}

/**
 * A test particle integrated with Yoshida-4.
 *
 * The trail is a ring buffer: the orbit persists and the oldest samples fade, which the renderer
 * does with the age attribute. Integration is in float64 and the trail is float32 only at the
 * moment it is handed to the GPU.
 */
export class OrbitRun {
  readonly mass: number;
  readonly angularMomentum: number;
  readonly relativistic: boolean;
  #q = new Float64Array(2);
  #v = new Float64Array(2);
  #integrator = createYoshida4(2);
  #trail: OrbitSample[] = [];
  #maxTrail: number;
  #properTime = 0;

  constructor(
    mass: number, startRadius: number, angularMomentum: number,
    { relativistic = true, maxTrail = 3000 } = {},
  ) {
    if (!(startRadius > 0)) throw new RangeError('Start radius must be positive.');
    this.mass = mass;
    this.relativistic = relativistic;
    this.#maxTrail = maxTrail;
    // Launched tangentially at the requested radius, so L is exactly the requested value.
    this.#q[0] = startRadius;
    this.#q[1] = 0;
    this.#v[0] = 0;
    this.#v[1] = angularMomentum / startRadius;
    this.angularMomentum = specificAngularMomentum(
      this.#q[0]!, this.#q[1]!, this.#v[0]!, this.#v[1]!,
    );
    this.#trail.push({ x: this.#q[0]!, y: this.#q[1]! });
  }

  get position(): OrbitSample {
    return { x: this.#q[0]!, y: this.#q[1]! };
  }

  get radius(): number {
    return Math.hypot(this.#q[0]!, this.#q[1]!);
  }

  get properTime(): number {
    return this.#properTime;
  }

  get trail(): readonly OrbitSample[] {
    return this.#trail;
  }

  /** Specific energy E = v_r^2/2 + V_eff, the quantity the energy line shows. */
  get energy(): number {
    const r = this.radius;
    const radialSpeed = (this.#q[0]! * this.#v[0]! + this.#q[1]! * this.#v[1]!) / r;
    return 0.5 * radialSpeed * radialSpeed
      + effectivePotential(r, this.mass, this.angularMomentum);
  }

  get orbitClass(): OrbitClass {
    return classifyOrbit(this.energy);
  }

  /** True once the particle has fallen inside the horizon; integration stops there. */
  get captured(): boolean {
    return this.radius <= 2 * this.mass;
  }

  step(dt: number, substeps = 1): void {
    if (this.captured) return;
    for (let i = 0; i < substeps; i++) {
      this.#integrator.step(this.#q, this.#v, dt, (position, out) => {
        const [ax, ay] = orbitAcceleration(
          position[0]!, position[1]!, this.mass, this.angularMomentum, this.relativistic,
        );
        out[0] = ax;
        out[1] = ay;
      });
      this.#properTime += dt;
      if (this.captured) break;
    }
    this.#trail.push({ x: this.#q[0]!, y: this.#q[1]! });
    if (this.#trail.length > this.#maxTrail) this.#trail.shift();
  }

  /** Trail as (x, y, age) triples for the renderer, oldest first. */
  trailVertices(): Float32Array {
    const count = this.#trail.length;
    const data = new Float32Array(count * FLOATS_PER_VERTEX);
    for (let i = 0; i < count; i++) {
      const sample = this.#trail[i]!;
      data[i * FLOATS_PER_VERTEX] = sample.x;
      data[i * FLOATS_PER_VERTEX + 1] = sample.y;
      data[i * FLOATS_PER_VERTEX + 2] = count === 1 ? STATIC_AGE : i / (count - 1);
    }
    return data;
  }
}

/** Curve points as (x, y, age) triples. Age is 1: a static line does not fade. */
export function curveVertices(points: readonly CurvePoint[]): Float32Array {
  const data = new Float32Array(points.length * FLOATS_PER_VERTEX);
  points.forEach((point, i) => {
    data[i * FLOATS_PER_VERTEX] = point.radius;
    data[i * FLOATS_PER_VERTEX + 1] = point.potential;
    data[i * FLOATS_PER_VERTEX + 2] = STATIC_AGE;
  });
  return data;
}

/** A vertical marker at `radius`, spanning the plotted band. */
export function verticalMarker(radius: number, minY: number, maxY: number): Float32Array {
  return new Float32Array([radius, minY, STATIC_AGE, radius, maxY, STATIC_AGE]);
}

/** The horizontal energy line across the plotted window. */
export function energyLine(energy: number, minX: number, maxX: number): Float32Array {
  return new Float32Array([minX, energy, STATIC_AGE, maxX, energy, STATIC_AGE]);
}

/** Where the energy line crosses V_eff — the orbit's turning points. */
export function energyCrossings(
  energy: number, mass: number, angularMomentum: number,
): number[] {
  return turningPoints(energy, mass, angularMomentum, {
    from: MIN_PLOT_RADIUS, to: MAX_PLOT_RADIUS,
  });
}

/** The circular orbits, if any exist at this angular momentum. */
export function circularOrbitReadout(mass: number, angularMomentum: number) {
  const orbits = circularOrbits(mass, angularMomentum);
  return {
    exists: orbits !== null,
    inner: orbits?.inner ?? Number.NaN,
    outer: orbits?.outer ?? Number.NaN,
    atIsco: Math.abs(angularMomentum - iscoAngularMomentum(mass)) < ISCO_TOLERANCE,
  };
}

/** The spoken summary BUILD_PLAN §6 requires. */
export function describeState(
  mass: number, angularMomentum: number, energy: number, run: OrbitRun | null,
): string {
  const readout = circularOrbitReadout(mass, angularMomentum);
  const parts = [
    `Effective potential for angular momentum ${(angularMomentum / mass).toFixed(3)} M.`,
  ];
  if (!readout.exists) {
    parts.push(
      'Below 2 root 3 M there are no circular orbits at all — not merely no stable ones — so '
      + 'every trajectory at this angular momentum falls in.',
    );
  } else {
    parts.push(
      `Stable circular orbit at ${(readout.outer / mass).toFixed(2)} M, unstable one at `
      + `${(readout.inner / mass).toFixed(2)} M.`,
    );
  }
  const crossings = energyCrossings(energy, mass, angularMomentum);
  parts.push(
    crossings.length === 0
      ? `At energy ${energy.toFixed(4)} the line does not meet the curve in the plotted window.`
      : `Turning points at ${crossings.map(r => `${(r / mass).toFixed(2)} M`).join(' and ')}.`,
  );
  if (run) {
    parts.push(
      `The test particle is ${run.orbitClass}, currently at ${(run.radius / mass).toFixed(2)} M.`,
    );
  }
  return parts.join(' ');
}
