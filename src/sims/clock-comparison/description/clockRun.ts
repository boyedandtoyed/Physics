/** SIM I — two clocks, one static and one orbiting. PHYSICS_SPEC §2.8, §8 rows 5–7 and 40.
 *
 * Everything physical here is a closed form: both rates are constant in time, so there is no
 * integrator and no truncation error. What the sim does with time is multiply. That makes the
 * numerical question the *other* one — both rates are 1 − 10⁻⁹ around the Earth, and their
 * difference is what the whole sim is about, so it is never formed by subtracting them.
 * `clockRateDifference` in core does it as a difference of squares instead.
 *
 * Lengths are metres and times are seconds, because the answer is quoted in microseconds per day
 * and geometric units would hide exactly the smallness that is the point.
 */
import {
  EARTH_GM,
  EARTH_MEAN_RADIUS,
  GPS_ORBIT_RADIUS,
  LOW_EARTH_ORBIT_RADIUS,
  MICROSECONDS_PER_SECOND,
  SECONDS_PER_DAY,
} from '../../../core/units';
import {
  breakEvenRadius,
  circularClockRate,
  clockRateDifference,
  gpsOffsets,
  orbitAngularVelocity,
  schwarzschildFromParameter,
  staticClockRate,
} from '../../../core/timeDilation';

const TWO = 2;
const HALF = 0.5;
const THREE_HALVES = 1.5;
const FLOATS_PER_VERTEX = 3;
const TURN = Math.PI * TWO;

/** The Earth's Schwarzschild radius: 8.870 mm. Every number in this sim is a ratio against it. */
export const EARTH_SCHWARZSCHILD = schwarzschildFromParameter(EARTH_GM);

/** Slider ranges, in Earth radii — the unit that makes both ends legible. */
export const MIN_STATIC_RADII = 1;
export const MAX_STATIC_RADII = 10;
export const MIN_ORBIT_RADII = LOW_EARTH_ORBIT_RADIUS / EARTH_MEAN_RADIUS;
export const MAX_ORBIT_RADII = 100;

export const toMetres = (earthRadii: number): number => earthRadii * EARTH_MEAN_RADIUS;
export const toEarthRadii = (metres: number): number => metres / EARTH_MEAN_RADIUS;

export interface ClockState {
  /** Schwarzschild coordinate time since the two clocks were started together, in seconds. */
  coordinateSeconds: number;
}

export const emptyState = (): ClockState => ({ coordinateSeconds: 0 });

export function advance(state: ClockState, seconds: number): ClockState {
  return { coordinateSeconds: state.coordinateSeconds + Math.max(0, seconds) };
}

export interface ClockFigures {
  /** dτ/dt of the static clock, and of the orbiting one. Both a hair under 1. */
  staticRate: number;
  orbitRate: number;
  /** Proper seconds each clock has accumulated. */
  staticSeconds: number;
  orbitSeconds: number;
  /** Orbiting minus static, in microseconds. Positive: the orbiting clock is ahead. */
  differenceMicroseconds: number;
  /** The same thing per day of coordinate time, which is how the GPS number is always quoted. */
  driftPerDay: number;
  /** The two terms of that, separately. They sum to `driftPerDay` exactly. */
  gravitationalPerDay: number;
  kinematicPerDay: number;
  /** Where the orbiting clock would break even against this static one: 1.5 r_A. */
  breakEvenMetres: number;
  orbitPeriodSeconds: number;
  orbitSpeed: number;
}

/**
 * The split into "gravitational" and "kinematic" parts.
 *
 * This is a decomposition of one term, not two separate effects: rate_B² − rate_A² is
 * r_s/r_A − 1.5 r_s/r_B, and the 1.5 is a 1 (the orbiting clock's own gravitational factor) plus
 * a 0.5 (its motion). Splitting it that way and dividing both pieces by the same rate_A + rate_B
 * makes the two named terms add up to the answer exactly, which the usual weak-field itemisation
 * only does to first order.
 */
export function figures(
  staticMetres: number, orbitMetres: number, coordinateSeconds: number,
): ClockFigures {
  const rs = EARTH_SCHWARZSCHILD;
  const staticRate = staticClockRate(staticMetres, rs);
  const orbitRate = circularClockRate(orbitMetres, rs);
  const sum = staticRate + orbitRate;
  const perDay = SECONDS_PER_DAY * MICROSECONDS_PER_SECOND;
  const gravitational = (rs / staticMetres - rs / orbitMetres) / sum;
  const kinematic = -(HALF * rs) / orbitMetres / sum;
  const rate = clockRateDifference(staticMetres, orbitMetres, rs);
  const angular = orbitAngularVelocity(orbitMetres, EARTH_GM);
  return {
    staticRate,
    orbitRate,
    staticSeconds: staticRate * coordinateSeconds,
    orbitSeconds: orbitRate * coordinateSeconds,
    differenceMicroseconds: rate * coordinateSeconds * MICROSECONDS_PER_SECOND,
    driftPerDay: rate * perDay,
    gravitationalPerDay: gravitational * perDay,
    kinematicPerDay: kinematic * perDay,
    breakEvenMetres: breakEvenRadius(staticMetres),
    orbitPeriodSeconds: TURN / angular,
    orbitSpeed: angular * orbitMetres,
  };
}

export interface Preset {
  id: string;
  label: string;
  staticRadii: number;
  orbitRadii: number;
  note: string;
}

/** Three settings that between them show the sign change §2.8 says a slider spanning 1.5 r_A must. */
export const PRESETS: readonly Preset[] = [
  {
    id: 'gps',
    label: 'GPS',
    staticRadii: 1,
    orbitRadii: GPS_ORBIT_RADIUS / EARTH_MEAN_RADIUS,
    note: 'Ground station and a navigation satellite at 26 562 km. Well above 1.5 R⊕, so the '
      + 'satellite clock gains — and the receiver in your pocket corrects for it.',
  },
  {
    id: 'break-even',
    label: 'Break-even',
    staticRadii: 1,
    orbitRadii: THREE_HALVES,
    note: 'r_B = 1.5 r_A, at 9 557 km. The two terms are equal and opposite here — ±20.05 µs '
      + 'a day — and the clocks agree exactly, for any central mass whatsoever.',
  },
  {
    id: 'iss',
    label: 'Space station',
    staticRadii: 1,
    orbitRadii: MIN_ORBIT_RADII,
    note: 'Low Earth orbit at 6 771 km, below the break-even radius. The orbiting clock '
      + 'loses about 25 µs a day — the opposite sign to GPS, in the same gravity well.',
  },
  {
    id: 'same-radius',
    label: 'Same radius',
    staticRadii: MIN_ORBIT_RADII,
    orbitRadii: MIN_ORBIT_RADII,
    note: 'Both clocks at one radius, which is the case people expect to cancel. It does not: '
      + 'the gravitational terms cancel exactly and the whole kinematic term is left over — '
      + '−28.30 µs a day at this radius, and −30.07 at the Earth’s surface.',
  },
];

/** The GPS itemisation, from core, at the real orbit radius rather than at the slider's. */
export const GPS_ITEMISED = gpsOffsets();

/** The same pair with a *non-rotating* ground station, which is what the canvas actually draws. */
export const GPS_STATIC_GROUND = figures(EARTH_MEAN_RADIUS, GPS_ORBIT_RADIUS, 0);

// ---------------------------------------------------------------------------------------------
// Clock faces. Geometry only; the hands' angles come from the proper times above.
// ---------------------------------------------------------------------------------------------

export const SECONDS_PER_MINUTE = 60;
export const MINUTES_PER_HOUR = 60;
/** An analogue face is a 12-hour face. */
export const HOURS_PER_FACE = 12;
const SECONDS_PER_FACE = SECONDS_PER_MINUTE * MINUTES_PER_HOUR * HOURS_PER_FACE;

export interface HandAngles {
  /** Radians clockwise from twelve o'clock. */
  second: number;
  minute: number;
  hour: number;
}

/** Hand angles for a clock reading `seconds`. All three sweep continuously — no ticking. */
export function handAngles(seconds: number): HandAngles {
  const wrapped = ((seconds % SECONDS_PER_FACE) + SECONDS_PER_FACE) % SECONDS_PER_FACE;
  return {
    second: (TURN * (wrapped % SECONDS_PER_MINUTE)) / SECONDS_PER_MINUTE,
    minute: (TURN * (wrapped % (SECONDS_PER_MINUTE * MINUTES_PER_HOUR)))
      / (SECONDS_PER_MINUTE * MINUTES_PER_HOUR),
    hour: (TURN * wrapped) / SECONDS_PER_FACE,
  };
}

export interface Layout {
  faceRadius: number;
  faceY: number;
  leftX: number;
  rightX: number;
  dialRadius: number;
  dialY: number;
}

const HEIGHT_SHARE = 0.46;
const WIDTH_SHARE = 0.42;
const FACE_Y_SHARE = 0.38;
const CENTRE_SPREAD = 1.12;
const DIAL_SHARE = 0.24;
const DIAL_Y_SHARE = -0.52;
/** Room left under the dial for its caption, as a multiple of the dial's radius. The captions
 * are HTML over the canvas, so anything the layout pushes past the bottom edge is simply gone. */
export const CAPTION_ROOM = 1.6;

/**
 * Where the two faces and the difference dial go, given the half-extents of the frame.
 *
 * Sized so the faces stay circular and never overlap each other or the dial at any aspect ratio
 * the stage produces — including the expanded view, which is much wider than the panel one.
 */
export function layout(halfWidth: number, halfHeight: number): Layout {
  const faceRadius = Math.min(HEIGHT_SHARE * halfHeight, WIDTH_SHARE * halfWidth);
  return {
    faceRadius,
    faceY: FACE_Y_SHARE * halfHeight,
    leftX: -CENTRE_SPREAD * faceRadius,
    rightX: CENTRE_SPREAD * faceRadius,
    dialRadius: Math.min(DIAL_SHARE * halfHeight, DIAL_SHARE * halfWidth),
    dialY: DIAL_Y_SHARE * halfHeight,
  };
}

/** A circle centred anywhere, as a line loop. The shared builder only draws them at the origin. */
export function ringVertices(
  centreX: number, centreY: number, radius: number, segments: number,
): Float32Array {
  const data = new Float32Array(segments * FLOATS_PER_VERTEX);
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * TURN;
    const base = i * FLOATS_PER_VERTEX;
    data[base] = centreX + radius * Math.cos(angle);
    data[base + 1] = centreY + radius * Math.sin(angle);
    data[base + 2] = 1;
  }
  return data;
}

/** A filled disc centred anywhere, as a triangle fan. */
export function discAt(
  centreX: number, centreY: number, radius: number, segments: number,
): Float32Array {
  const data = new Float32Array((segments + TWO) * FLOATS_PER_VERTEX);
  data[0] = centreX;
  data[1] = centreY;
  data[2] = 1;
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * TURN;
    const base = (i + 1) * FLOATS_PER_VERTEX;
    data[base] = centreX + radius * Math.cos(angle);
    data[base + 1] = centreY + radius * Math.sin(angle);
    data[base + 2] = 1;
  }
  return data;
}

const HOUR_TICK_LENGTH = 0.16;
const MINUTE_TICK_LENGTH = 0.07;
const TICKS_PER_HOUR = 5;

/** The sixty minute ticks, with every fifth one drawn long. A line list. */
export function tickVertices(
  centreX: number, centreY: number, radius: number, hourTicksOnly = false,
): Float32Array {
  const count = hourTicksOnly ? HOURS_PER_FACE : SECONDS_PER_MINUTE;
  const stride = hourTicksOnly ? 1 : TICKS_PER_HOUR;
  const data = new Float32Array(count * TWO * FLOATS_PER_VERTEX);
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * TURN;
    const long = hourTicksOnly || i % stride === 0;
    const inner = radius * (1 - (long ? HOUR_TICK_LENGTH : MINUTE_TICK_LENGTH));
    const base = i * TWO * FLOATS_PER_VERTEX;
    data[base] = centreX + inner * Math.sin(angle);
    data[base + 1] = centreY + inner * Math.cos(angle);
    data[base + 2] = 1;
    data[base + FLOATS_PER_VERTEX] = centreX + radius * Math.sin(angle);
    data[base + FLOATS_PER_VERTEX + 1] = centreY + radius * Math.cos(angle);
    data[base + FLOATS_PER_VERTEX + 2] = 1;
  }
  return data;
}

const TAIL_SHARE = 0.16;

/**
 * One hand, as a four-vertex triangle fan: a tail, two shoulders and a tip.
 *
 * `angle` is measured **clockwise from twelve**, which is the convention a clock face is read in
 * and not the one GL draws in; the sine and cosine are swapped here rather than at every call.
 */
export function handVertices(
  centreX: number, centreY: number, angle: number, length: number, halfWidth: number,
): Float32Array {
  const dirX = Math.sin(angle);
  const dirY = Math.cos(angle);
  const tail = TAIL_SHARE * length;
  const points = [
    [centreX - dirX * tail, centreY - dirY * tail],
    [centreX + dirY * halfWidth, centreY - dirX * halfWidth],
    [centreX + dirX * length, centreY + dirY * length],
    [centreX - dirY * halfWidth, centreY + dirX * halfWidth],
  ];
  const data = new Float32Array(points.length * FLOATS_PER_VERTEX);
  points.forEach(([x, y], index) => {
    data[index * FLOATS_PER_VERTEX] = x ?? 0;
    data[index * FLOATS_PER_VERTEX + 1] = y ?? 0;
    data[index * FLOATS_PER_VERTEX + 2] = 1;
  });
  return data;
}

/** One turn of the difference dial's needle is one microsecond. Stated on the dial itself. */
export const MICROSECONDS_PER_TURN = 1;

/** Needle angle for an accumulated difference, clockwise from twelve. Negative differences run
 * anticlockwise, so the direction of travel carries the sign. */
export const needleAngle = (microseconds: number): number =>
  (TURN * (microseconds / MICROSECONDS_PER_TURN)) % TURN;

/** Hours, minutes and seconds a face is showing — for the text beside it and for tests. */
export function faceReading(seconds: number): { hours: number; minutes: number; seconds: number } {
  const wrapped = Math.max(0, seconds);
  return {
    hours: Math.floor(wrapped / (SECONDS_PER_MINUTE * MINUTES_PER_HOUR)),
    minutes: Math.floor(wrapped / SECONDS_PER_MINUTE) % MINUTES_PER_HOUR,
    seconds: wrapped % SECONDS_PER_MINUTE,
  };
}
