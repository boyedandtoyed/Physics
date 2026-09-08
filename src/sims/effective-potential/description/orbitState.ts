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
/** Padding around the plotted band, and a floor on its height so a flat curve still has a scale. */
const POTENTIAL_PAD_FRACTION = 0.12;
const MIN_PLOT_SPAN = 0.02;
/** Stand-in well depth when no circular orbit exists, so the energy control still has a range. */
const FALLBACK_WELL_DEPTH = 0.05;
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
 * Vertical extent worth plotting, derived from the curve's own features.
 *
 * A fixed band does not work: V_eff dives to -infinity at small r and its barrier grows without
 * bound with L, so at 5x L_ISCO the peak reaches +5.2 while a clamped ceiling of 0.12 sits below
 * the curve's minimum in the window — the bounds invert and nothing draws at all. The window is
 * therefore set by the circular-orbit values, the far field, and zero (the bound/unbound line),
 * which are the features a reader is looking for.
 *
 * Takes no mass: V_eff is dimensionless and scale-free, so the band is the same for every mass
 * and only the radius labels change.
 */
export function curveBounds(
  points: readonly CurvePoint[],
): { minY: number; maxY: number } {
  const features: number[] = [0];
  const last = points[points.length - 1];
  if (last && Number.isFinite(last.potential)) features.push(last.potential);
  // Local extrema, found from the samples themselves so this works whether or not the
  // closed-form roots fall inside the plotted window.
  const finite = points.filter(point => Number.isFinite(point.potential));
  for (let i = 1; i < finite.length - 1; i++) {
    const before = finite[i - 1]!.potential;
    const here = finite[i]!.potential;
    const after = finite[i + 1]!.potential;
    if ((here >= before && here >= after) || (here <= before && here <= after)) {
      features.push(here);
    }
  }
  const lower = Math.min(...features);
  const upper = Math.max(...features);
  const span = Math.max(upper - lower, MIN_PLOT_SPAN);
  const pad = span * POTENTIAL_PAD_FRACTION;
  return { minY: lower - pad, maxY: upper + pad };
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

/**
 * Where the energy line crosses V_eff — but only the crossings this orbit can actually reach.
 *
 * A crossing on the far side of the barrier is a turning point of a different trajectory: a
 * particle approaching from outside with E below the barrier peak cannot get past it, so
 * reporting the inner crossing as "a turning point of the orbit" is wrong. At the default
 * settings that inner crossing sits at 2.47 M while the particle never comes inside 12 M.
 *
 * When E exceeds the barrier peak there is no inner turning point at all — the particle plunges,
 * and every crossing outside the peak is reported.
 */
export function energyCrossings(
  energy: number, mass: number, angularMomentum: number,
): number[] {
  const all = turningPoints(energy, mass, angularMomentum, {
    from: MIN_PLOT_RADIUS, to: MAX_PLOT_RADIUS,
  });
  const orbits = circularOrbits(mass, angularMomentum);
  if (!orbits) return all;
  const barrier = effectivePotential(orbits.inner, mass, angularMomentum);
  // Below the barrier the outside region is separated from the inside one; above it, it is not.
  return energy < barrier ? all.filter(radius => radius > orbits.inner) : all;
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

/**
 * Map the energy control onto the physics rather than onto the plot band.
 *
 * `fraction` is the energy as a share of the well depth: 0 sits at the potential minimum (a
 * circular orbit), 1 sits at E = 0 (marginally bound), and beyond 1 the orbit is unbound. A
 * linear sweep of the drawn band instead spends most of its travel above E = 0, because the
 * barrier is far taller than the well is deep — at the default angular momentum the well is
 * 0.022 deep and the barrier 0.156 high, so seven eighths of the slider was unbound.
 *
 * With no minimum — below L_ISCO — there is no well to measure against, and the control sweeps a
 * small band around zero instead.
 */
export function energyFromWellFraction(
  fraction: number, mass: number, angularMomentum: number,
): number {
  const orbits = circularOrbits(mass, angularMomentum);
  if (!orbits) return -FALLBACK_WELL_DEPTH * (1 - fraction);
  const minimum = effectivePotential(orbits.outer, mass, angularMomentum);
  return minimum * (1 - fraction);
}

/** The inverse, for showing where the current energy sits in the well. */
export function wellFractionFromEnergy(
  energy: number, mass: number, angularMomentum: number,
): number {
  const orbits = circularOrbits(mass, angularMomentum);
  if (!orbits) return 1 + energy / FALLBACK_WELL_DEPTH;
  const minimum = effectivePotential(orbits.outer, mass, angularMomentum);
  if (!(Math.abs(minimum) > 0)) return 0;
  return 1 - energy / minimum;
}
