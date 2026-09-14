/** The frame-dragging field, as geometry. PHYSICS_SPEC §3.5.
 *
 * Two pictures of the same spacetime:
 *
 * - the **equatorial plane** from above, where the ergosphere boundary is a *circle* of radius
 *   exactly 2M at every spin, and where the dragging is visible;
 * - a **meridional cut** containing the spin axis, which is the only place the ergosphere's
 *   oblateness exists. It is often drawn as an ellipse over the equatorial view; there is no
 *   ellipse there. r_E(θ) = M + √(M² − a²cos²θ) equals 2M for the whole of that view.
 *
 * Pure: everything here returns numbers or vertex buffers, and nothing touches a canvas.
 */
import {
  angularVelocityRange,
  draggedInfallRates,
  ergosphereRadius,
  horizonRadii,
  omegaZamo,
} from '../../../core/kerr';

const TWO = 2;
const THREE = 3;
const TAU = Math.PI * 2;
const FLOATS_PER_VERTEX = 3;
const HALF = 0.5;

/** Radii carrying a marker ring, as fractions of the way from the ergosphere out to the edge. */
export const MARKER_RINGS = 7;
/** Markers per ring. Enough to read as a ring, few enough to see each one move. */
export const MARKERS_PER_RING = 18;
/** Radii carrying a light-cone fan. Fewer, because each is a filled sector. */
export const FAN_RINGS = 6;
/** How close to the horizon the innermost ring sits. Far enough out that its light-cone band,
 *  which is ±11% of its own radius wide, clears the horizon disc rather than being drawn under
 *  it — the innermost band is the one that shows the prohibition, so it must be on screen. */
const RING_INNER_MARGIN = 1.12;

/** Sample radii for the marker rings, from just outside the horizon to the outer edge. */
export function markerRadii(spin: number, outerEdge: number): number[] {
  const { outer } = horizonRadii(spin);
  const inner = outer * RING_INNER_MARGIN;
  if (!(outerEdge > inner)) throw new RangeError('The field needs room outside the horizon.');
  // Geometric spacing: the dragging goes as r^-3, so linear spacing wastes every ring on the
  // region where nothing happens.
  return Array.from({ length: MARKER_RINGS }, (_, index) =>
    inner * (outerEdge / inner) ** (index / (MARKER_RINGS - 1)));
}

/** Angular position of a marker at radius r after coordinate time t, starting from `phase`. */
export const markerAngle = (radius: number, spin: number, time: number, phase: number): number =>
  phase + omegaZamo(radius, spin) * time;

export interface FieldParams {
  spin: number;
  outerEdge: number;
  /** Coordinate time elapsed, in M. */
  time: number;
}

/**
 * Marker segments: one short arrow per marker, tangential, pointing the way it is being dragged.
 *
 * Length is ω(r) **relative to the innermost ring's**, times `arrowScale` times the frame width.
 * Relative rather than absolute because ω falls off as r⁻³: on any absolute scale that fits the
 * inner arrows, every arrow beyond about 3 M is shorter than a pixel, and "the outer ones barely
 * move" becomes "the outer ones are not drawn". Position says where the dragging has got to;
 * length says how fast, against the fastest ring on screen.
 *
 * Returned as (x, y, age) triples for the shared line renderer, two vertices per arrow.
 */
export function markerVertices(params: FieldParams, arrowScale: number): Float32Array {
  const { spin, outerEdge, time } = params;
  const radii = markerRadii(spin, outerEdge);
  const reference = omegaZamo(radii[0] as number, spin);
  const data = new Float32Array(radii.length * MARKERS_PER_RING * TWO * FLOATS_PER_VERTEX);
  let cursor = 0;
  for (const radius of radii) {
    const omega = omegaZamo(radius, spin);
    const relative = reference > 0 ? omega / reference : 0;
    const length = Math.min(arrowScale * outerEdge * relative, radius * HALF);
    for (let index = 0; index < MARKERS_PER_RING; index++) {
      const phase = (index / MARKERS_PER_RING) * TAU;
      const angle = markerAngle(radius, spin, time, phase);
      const tail = angle - length / radius;
      data[cursor] = radius * Math.cos(tail);
      data[cursor + 1] = radius * Math.sin(tail);
      data[cursor + 2] = 0;
      data[cursor + FLOATS_PER_VERTEX] = radius * Math.cos(angle);
      data[cursor + FLOATS_PER_VERTEX + 1] = radius * Math.sin(angle);
      data[cursor + FLOATS_PER_VERTEX + 2] = 1;
      cursor += TWO * FLOATS_PER_VERTEX;
    }
  }
  return data;
}

export interface Fan {
  radius: number;
  /** Angular position the fan is drawn at. */
  angle: number;
  /** Angular offsets, in radians, reachable in `horizon` of coordinate time. */
  minOffset: number;
  maxOffset: number;
  /** True when standing still is one of the options — i.e. outside the ergosphere. */
  staticAllowed: boolean;
}

/**
 * The light cone in φ at each fan radius: where a worldline could be after `span` of coordinate
 * time, given Ω ∈ [Ω₋, Ω₊].
 *
 * Outside the ergosphere the sector contains its own base angle, because Ω = 0 is allowed.
 * Inside it does not, at any spin, because Ω₋ > 0 there. That is the picture the ergosphere
 * deserves, and it is not the same statement as "the arrows spin fast".
 */
export function lightConeFans(params: FieldParams, span: number): Fan[] {
  const { spin, outerEdge, time } = params;
  const { outer } = horizonRadii(spin);
  const inner = outer * RING_INNER_MARGIN;
  const fans: Fan[] = [];
  for (let index = 0; index < FAN_RINGS; index++) {
    const radius = inner * (outerEdge / inner) ** (index / (FAN_RINGS - 1));
    const range = angularVelocityRange(radius, spin);
    fans.push({
      radius,
      angle: markerAngle(radius, spin, time, 0),
      minOffset: range.min * span,
      maxOffset: range.max * span,
      staticAllowed: range.min < 0,
    });
  }
  return fans;
}

/** Radial half-thickness of a light-cone band, as a fraction of its own radius. */
const FAN_THICKNESS = 0.11;

/**
 * One light cone as a closed **annular sector** outline: inner arc, outer arc, joined.
 *
 * Not a pie slice from the origin. Drawn that way the sectors are metres wide at the rim and
 * overlap each other and everything else on the plot — the first version buried the markers, the
 * ergosphere and the faller under six of them. A band at the cone's own radius says the same
 * thing and says it locally: this is where something at *this* radius could be, a moment from
 * now.
 */
export function fanVertices(fan: Fan, segments: number): Float32Array {
  if (segments < TWO) throw new RangeError('A sector needs at least two segments.');
  const inner = fan.radius * (1 - FAN_THICKNESS);
  const outer = fan.radius * (1 + FAN_THICKNESS);
  const data = new Float32Array((segments + 1) * TWO * FLOATS_PER_VERTEX);
  const angleAt = (index: number) =>
    fan.angle + fan.minOffset + ((fan.maxOffset - fan.minOffset) * index) / segments;
  let cursor = 0;
  for (let index = 0; index <= segments; index++) {
    const angle = angleAt(index);
    data[cursor] = inner * Math.cos(angle);
    data[cursor + 1] = inner * Math.sin(angle);
    data[cursor + 2] = 1;
    cursor += FLOATS_PER_VERTEX;
  }
  for (let index = segments; index >= 0; index--) {
    const angle = angleAt(index);
    data[cursor] = outer * Math.cos(angle);
    data[cursor + 1] = outer * Math.sin(angle);
    data[cursor + 2] = 1;
    cursor += FLOATS_PER_VERTEX;
  }
  return data;
}

/**
 * A radial tick at each cone's base angle: where something that held φ fixed would still be.
 *
 * The whole statement is whether this tick falls inside the band beside it. Outside the
 * ergosphere it does; inside, at any spin, it does not.
 */
export function staticTickVertices(fans: readonly Fan[]): Float32Array {
  const data = new Float32Array(fans.length * TWO * FLOATS_PER_VERTEX);
  let cursor = 0;
  for (const fan of fans) {
    const inner = fan.radius * (1 - FAN_THICKNESS);
    const outer = fan.radius * (1 + FAN_THICKNESS);
    data[cursor] = inner * Math.cos(fan.angle);
    data[cursor + 1] = inner * Math.sin(fan.angle);
    data[cursor + 2] = 1;
    data[cursor + FLOATS_PER_VERTEX] = outer * Math.cos(fan.angle);
    data[cursor + FLOATS_PER_VERTEX + 1] = outer * Math.sin(fan.angle);
    data[cursor + FLOATS_PER_VERTEX + 2] = 1;
    cursor += TWO * FLOATS_PER_VERTEX;
  }
  return data;
}

/** The ergosphere boundary in a meridional cut: r_E(θ) = M + √(M² − a²cos²θ), in (x, z). */
export function meridionalErgosphere(spin: number, segments: number): Float32Array {
  if (segments < THREE) throw new RangeError('The boundary needs three segments.');
  const data = new Float32Array(segments * FLOATS_PER_VERTEX);
  for (let index = 0; index < segments; index++) {
    const theta = (index / segments) * TAU;
    const radius = ergosphereRadius(spin, theta);
    data[index * FLOATS_PER_VERTEX] = radius * Math.sin(theta);
    data[index * FLOATS_PER_VERTEX + 1] = radius * Math.cos(theta);
    data[index * FLOATS_PER_VERTEX + 2] = 1;
  }
  return data;
}

/** State of the zero-angular-momentum faller. */
export interface Faller {
  radius: number;
  angle: number;
  /** Coordinate time since release, in M. */
  time: number;
  /** Total angle swept. Not reduced mod 2π: the number is the point. */
  swept: number;
  plunged: boolean;
}

export const releaseFaller = (radius: number): Faller =>
  ({ radius, angle: 0, time: 0, swept: 0, plunged: false });

/** Stop here. Kerr–Schild would run through the horizon; Boyer–Lindquist coordinate time
 *  does not, and this sim is in coordinate time throughout. */
export const STOP_FACTOR = 1.0005;

/**
 * Advance the faller by `step` of coordinate time, with RK4 on (r, φ).
 *
 * The step is refined near the horizon rather than allowed to overshoot it: dr/dt → 0 there, so
 * an overshoot is not a physical event but an integration one, and it would put the state inside
 * a region this chart does not cover.
 */
export function advanceFaller(faller: Faller, spin: number, step: number): Faller {
  if (faller.plunged) return faller;
  const { outer } = horizonRadii(spin);
  const stop = outer * STOP_FACTOR;
  const rate = (radius: number) => draggedInfallRates(Math.max(radius, stop), spin);

  const k1 = rate(faller.radius);
  const k2 = rate(faller.radius + (step * HALF) * k1.radial);
  const k3 = rate(faller.radius + (step * HALF) * k2.radial);
  const k4 = rate(faller.radius + step * k3.radial);
  const radial = (k1.radial + TWO * k2.radial + TWO * k3.radial + k4.radial) / 6;
  const angular = (k1.angular + TWO * k2.angular + TWO * k3.angular + k4.angular) / 6;

  const radius = faller.radius + step * radial;
  const swept = faller.swept + step * angular;
  if (radius <= stop) {
    return { radius: stop, angle: faller.angle + step * angular, time: faller.time + step, swept, plunged: true };
  }
  return { radius, angle: faller.angle + step * angular, time: faller.time + step, swept, plunged: false };
}

/** Trail vertices for the faller's path, oldest first, as (x, y, age). */
export function trailVertices(trail: readonly Faller[]): Float32Array {
  const data = new Float32Array(trail.length * FLOATS_PER_VERTEX);
  trail.forEach((sample, index) => {
    data[index * FLOATS_PER_VERTEX] = sample.radius * Math.cos(sample.angle);
    data[index * FLOATS_PER_VERTEX + 1] = sample.radius * Math.sin(sample.angle);
    data[index * FLOATS_PER_VERTEX + 2] = trail.length < TWO ? 1 : index / (trail.length - 1);
  });
  return data;
}

/** Marker head positions as (x, y, age) points.
 *
 * Every marker needs to be visible even where ω(r) puts its arrow below a pixel — otherwise "the
 * outer rings barely move" is drawn as "the outer rings are not there". The head says where the
 * marker is; the arrow behind it says how fast it is being carried.
 */
export function markerHeadVertices(params: FieldParams): Float32Array {
  const { spin, outerEdge, time } = params;
  const radii = markerRadii(spin, outerEdge);
  const data = new Float32Array(radii.length * MARKERS_PER_RING * FLOATS_PER_VERTEX);
  let cursor = 0;
  for (const radius of radii) {
    for (let index = 0; index < MARKERS_PER_RING; index++) {
      const phase = (index / MARKERS_PER_RING) * TAU;
      const angle = markerAngle(radius, spin, time, phase);
      data[cursor] = radius * Math.cos(angle);
      data[cursor + 1] = radius * Math.sin(angle);
      data[cursor + 2] = 1;
      cursor += FLOATS_PER_VERTEX;
    }
  }
  return data;
}
