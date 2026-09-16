/** Dropping things into a gravity well. PHYSICS_SPEC §2.5, §2.7.
 *
 * Geometric units with **M = 1**, so r_s = 2 and every radius is in M. That makes the geometry
 * universal: the well is the same well for every central body, and the only thing that changes
 * is how far down into it the body's *surface* reaches. Which is the honest version of "the dip
 * deepens with mass" — in geometric units it does not deepen at all.
 *
 * The trajectory is integrated in **proper time**: `orbitAcceleration` is r̈ = −V_eff′(r) with τ
 * as the parameter. §2.7 is why that matters and why a radial drop is exactly right anyway.
 */
import { createYoshida4 } from '../../../core/integrators/symplectic';
import { orbitAcceleration, specificAngularMomentum } from '../../../core/orbit';
import {
  C,
  EARTH_GM,
  EARTH_MEAN_RADIUS,
  G,
  JUPITER_EQUATORIAL_RADIUS,
  JUPITER_GM,
  NEUTRON_STAR_MASSES,
  NEUTRON_STAR_RADIUS,
  SOLAR_MASS,
  STELLAR_BLACK_HOLE_MASSES,
} from '../../../core/units';

const TWO = 2;
const HALF = 0.5;
const FLOATS_PER_VERTEX = 3;
const KILOMETRES_PER_METRE = 1e-3;
/** The 8 in the cycloid's √(r₀³/8GM), with G = M = 1. */
const CYCLOID_DENOMINATOR = 8;
/** Quadrature steps for the proper-distance rings. */
const RING_QUADRATURE_STEPS = 4000;

/** Geometric mass GM/c², in metres, for a body given its GM. */
const geometricLength = (gm: number): number => gm / C ** TWO;

export interface CentralBody {
  id: string;
  label: string;
  /** Surface radius in units of the geometric mass M = GM/c². */
  surfaceRadius: number;
  /** Geometric mass in metres, for converting the readout back to something familiar. */
  geometricMetres: number;
  /** Physical surface radius in metres. */
  surfaceMetres: number;
  note: string;
}

function centralBody(
  id: string, label: string, gm: number, surfaceMetres: number, note: string,
): CentralBody {
  const geometricMetres = geometricLength(gm);
  return {
    id,
    label,
    surfaceRadius: surfaceMetres / geometricMetres,
    geometricMetres,
    surfaceMetres,
    note,
  };
}

const NEUTRON_STAR_GM = G * NEUTRON_STAR_MASSES * SOLAR_MASS;
const BLACK_HOLE_GM = G * STELLAR_BLACK_HOLE_MASSES * SOLAR_MASS;

export const CENTRAL_BODIES: readonly CentralBody[] = [
  centralBody('earth', 'Earth', EARTH_GM, EARTH_MEAN_RADIUS,
    'Surface at 1.4 billion M. The well is the same well; the surface is so far up it that the '
    + 'geometry there is flat to one part in 10⁹.'),
  centralBody('jupiter', 'Jupiter', JUPITER_GM, JUPITER_EQUATORIAL_RADIUS,
    'Three hundred Earth masses and still 51 million M out. More mass does not make the well '
    + 'deeper in these units — it makes the surface bigger in step with it.'),
  centralBody('neutron-star', 'Neutron star', NEUTRON_STAR_GM, NEUTRON_STAR_RADIUS,
    '1.4 solar masses in 12 km: the surface is 5.8 M out, and a clock there runs at 0.81 of a '
    + 'distant one. The radius is representative, not determined — NICER constrains it loosely.'),
  centralBody('black-hole', 'Black hole', BLACK_HOLE_GM, TWO * geometricLength(BLACK_HOLE_GM),
    'Ten solar masses, and no surface at all: the "surface" is the horizon at exactly 2 M, where '
    + 'the static clock rate reaches zero.'),
];

export interface FallingObject {
  id: string;
  label: string;
  note: string;
}

/**
 * Every one of these is a **test particle** and they follow identical trajectories.
 *
 * That is the point rather than a simplification: free fall does not depend on what is falling,
 * and offering an apple and a space station that fall the same way is the cleanest statement of
 * it this sim can make.
 */
export const OBJECTS: readonly FallingObject[] = [
  { id: 'apple', label: 'Apple', note: '0.1 kg' },
  { id: 'satellite', label: 'Satellite', note: '1 tonne' },
  { id: 'station', label: 'Space station', note: '400 tonnes' },
  { id: 'moon', label: 'Moon', note: '7.3 × 10²² kg' },
];

/** Stop here rather than at the horizon: coordinate-independent, and the chart ends at r_s. */
export const STOP_RADIUS = 2.0005;

export interface Sample {
  x: number;
  y: number;
  /** Proper time since release, in M. */
  time: number;
}

export interface Track {
  x: number;
  y: number;
  vx: number;
  vy: number;
  time: number;
  finished: boolean;
  trail: Sample[];
}

export interface FreefallState {
  /** Integrated with the §2.5 correction. */
  relativistic: Track;
  /** The same initial conditions, inverse-square only. */
  newtonian: Track;
  angularMomentum: number;
  released: boolean;
}

/**
 * Trail samples kept, and how often one is taken.
 *
 * Every step at STEP = 0.002 would hold 4000 × 0.002 = **8 M** of proper time, and a drop from
 * 12 M takes 44 — so the whole visible path was thrown away and only the last stretch survived,
 * hidden underneath the central body. Sampling every eighth step holds 96 M, which covers any
 * drop the frame can start.
 */
const TRAIL_LIMIT = 6000;
const TRAIL_EVERY = 8;
/** Bisections used to land the last step exactly on the surface. */
const REFINEMENTS = 40;

const newTrack = (x: number, y: number, vx: number, vy: number): Track =>
  ({ x, y, vx, vy, time: 0, finished: false, trail: [{ x, y, time: 0 }] });

export const emptyState = (): FreefallState => ({
  relativistic: newTrack(0, 0, 0, 0),
  newtonian: newTrack(0, 0, 0, 0),
  angularMomentum: 0,
  released: false,
});

export function release(x: number, y: number, vx: number, vy: number): FreefallState {
  return {
    relativistic: newTrack(x, y, vx, vy),
    newtonian: newTrack(x, y, vx, vy),
    angularMomentum: specificAngularMomentum(x, y, vx, vy),
    released: true,
  };
}

/** Step size in proper time, in M. Fine enough that the benchmark drop resolves to 10⁻⁴. */
export const STEP = 0.002;

function advanceTrack(
  track: Track, angularMomentum: number, relativistic: boolean, steps: number,
  surfaceRadius: number,
): Track {
  if (track.finished) return track;
  const stepper = createYoshida4(TWO);
  const q = Float64Array.from([track.x, track.y]);
  const v = Float64Array.from([track.vx, track.vy]);
  const force = (position: Float64Array, out: Float64Array) => {
    const [ax, ay] = orbitAcceleration(
      position[0] as number, position[1] as number, 1, angularMomentum, relativistic,
    );
    out[0] = ax;
    out[1] = ay;
  };
  const trail = [...track.trail];
  let time = track.time;
  let finished = false;
  const floor = Math.max(surfaceRadius, STOP_RADIUS);

  for (let step = 0; step < steps; step++) {
    const beforeQ = Float64Array.from(q);
    const beforeV = Float64Array.from(v);
    try {
      stepper.step(q, v, STEP, force);
    } catch {
      finished = true;
      break;
    }
    let taken = STEP;
    let radius = Math.hypot(q[0] as number, q[1] as number);
    if (!Number.isFinite(radius)) { finished = true; break; }

    if (radius <= floor) {
      // Land ON the surface rather than a step past it. A whole step of overshoot is 10⁻⁴ of the
      // radius at a neutron star's surface — small, and still an arrival at a radius the body
      // does not have. Bisecting the last step puts the landing where the physics puts it.
      let low = 0;
      let high = STEP;
      for (let refine = 0; refine < REFINEMENTS; refine++) {
        const guess = (low + high) * HALF;
        q.set(beforeQ);
        v.set(beforeV);
        stepper.step(q, v, guess, force);
        if (Math.hypot(q[0] as number, q[1] as number) <= floor) high = guess;
        else low = guess;
      }
      q.set(beforeQ);
      v.set(beforeV);
      stepper.step(q, v, high, force);
      taken = high;
      radius = Math.hypot(q[0] as number, q[1] as number);
      finished = true;
    }

    time += taken;
    if (step % TRAIL_EVERY === 0 || finished) {
      trail.push({ x: q[0] as number, y: q[1] as number, time });
      if (trail.length > TRAIL_LIMIT) trail.shift();
    }
    if (finished) break;
  }

  return {
    x: q[0] as number, y: q[1] as number, vx: v[0] as number, vy: v[1] as number,
    time, finished, trail,
  };
}

export function advance(
  state: FreefallState, steps: number, surfaceRadius: number,
): FreefallState {
  if (!state.released) return state;
  return {
    ...state,
    relativistic: advanceTrack(state.relativistic, state.angularMomentum, true, steps, surfaceRadius),
    newtonian: advanceTrack(state.newtonian, state.angularMomentum, false, steps, surfaceRadius),
  };
}

/** Radius, in M. */
export const radiusOf = (track: Track): number => Math.hypot(track.x, track.y);

/** Speed in units of c, from the proper-time velocity. */
export const speedOf = (track: Track): number => Math.hypot(track.vx, track.vy);

/**
 * Newtonian escape speed at this radius, √(2M/r) in geometric units — which is also
 * √(r_s/r), the Gullstrand–Painlevé river speed of §5.
 */
export const escapeSpeedAt = (radius: number): number => Math.sqrt(TWO / radius);

/**
 * The static-observer clock rate √(1 − r_s/r) at the current position.
 *
 * **This is the rate of a clock held still there, not of the falling object's own clock.** The
 * faller's clock is the integration parameter; it does not run slow in its own terms at all.
 */
export function staticClockRate(radius: number): number {
  if (!(radius > TWO)) return 0;
  return Math.sqrt(1 - TWO / radius);
}

/**
 * Proper time for a radial fall from rest at `from` down to `to`, in M.
 *
 * §2.7: identical in Newton and in Schwarzschild proper time, so this closed form is exact in
 * both and is what the sim's radial drop is checked against.
 */
export function cycloidTime(from: number, to: number): number {
  if (!(from > to) || !(to > 0)) throw new RangeError('A fall needs a drop.');
  const eta = Math.acos((TWO * to) / from - 1);
  return Math.sqrt(from ** 3 / CYCLOID_DENOMINATOR) * (eta + Math.sin(eta));
}

/** Trail vertices as (x, y, age), oldest first. */
export function trailVertices(trail: readonly Sample[]): Float32Array {
  const data = new Float32Array(trail.length * FLOATS_PER_VERTEX);
  trail.forEach((sample, index) => {
    data[index * FLOATS_PER_VERTEX] = sample.x;
    data[index * FLOATS_PER_VERTEX + 1] = sample.y;
    data[index * FLOATS_PER_VERTEX + 2] = trail.length < TWO ? 1 : index / (trail.length - 1);
  });
  return data;
}

export const pointVertex = (track: Track): Float32Array =>
  new Float32Array([track.x, track.y, 1]);

/**
 * Radii at equal **proper** radial separation, outward from the surface.
 *
 * This is the well, drawn top-down and without a fake third dimension. Proper radial distance is
 * dℓ = dr/√(1 − r_s/r), so rings laid down at equal proper spacing bunch up in coordinate r near
 * the horizon — and that bunching *is* the depth of the Flamm paraboloid, seen from above. For
 * Earth the rings come out evenly spaced, because at 1.4 billion M the geometry is flat; for a
 * black hole they crowd against the horizon. Nothing is exaggerated, and nothing needs to be.
 */
export function properDistanceRings(
  surfaceRadius: number, outerRadius: number, count: number,
): number[] {
  if (count < TWO || !(outerRadius > surfaceRadius)) return [];
  // Proper distance from the surface, by quadrature in a variable with no endpoint singularity.
  const steps = RING_QUADRATURE_STEPS;
  const radii: number[] = [];
  const distances: number[] = [];
  let total = 0;
  for (let index = 0; index <= steps; index++) {
    const radius = surfaceRadius + ((outerRadius - surfaceRadius) * index) / steps;
    if (index > 0) {
      const previous = surfaceRadius + ((outerRadius - surfaceRadius) * (index - 1)) / steps;
      const mid = (radius + previous) * HALF;
      const factor = mid > TWO ? 1 / Math.sqrt(1 - TWO / mid) : 1;
      total += (radius - previous) * factor;
    }
    radii.push(radius);
    distances.push(total);
  }
  const rings: number[] = [];
  for (let ring = 1; ring < count; ring++) {
    const target = (total * ring) / count;
    let index = distances.findIndex(distance => distance >= target);
    if (index < 0) index = distances.length - 1;
    rings.push(radii[index] as number);
  }
  return rings;
}

/**
 * Velocity a drag encodes, given the frame's half-extent.
 *
 * **Not one-for-one.** These are geometric units, where c = 1 and a circular orbit at 20 M moves
 * at 0.22 — so mapping a sim unit of drag to a sim unit of speed makes a 40-pixel flick a launch
 * at 4.5c, and the object leaves the frame before it is drawn. A drag across the whole frame
 * half-width is `FULL_DRAG_SPEED` instead, which puts a circular orbit about a tenth of the way
 * across and keeps everything reachable sub-luminal.
 */
export const FULL_DRAG_SPEED = 0.6;

export function velocityFromDrag(
  fromX: number, fromY: number, toX: number, toY: number, extent: number,
): { vx: number; vy: number } {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const length = Math.hypot(dx, dy);
  if (!(length > 0) || !(extent > 0)) return { vx: 0, vy: 0 };
  const speed = Math.min((length / extent) * FULL_DRAG_SPEED, FULL_DRAG_SPEED);
  return { vx: (dx / length) * speed, vy: (dy / length) * speed };
}

/** Circular-orbit speed at a radius, geometric units with M = 1. For the drag hint. */
export const circularSpeedAt = (radius: number): number => Math.sqrt(1 / radius);

/** Distance in kilometres, for the readout beside the geometric number. */
export const toKilometres = (radius: number, body: CentralBody): number =>
  radius * body.geometricMetres * KILOMETRES_PER_METRE;
