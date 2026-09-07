/** Figures and the screen-reader summary for the time-dilation calculator, PHYSICS_SPEC §8.5-8.9.
 *
 * Pure and unit-tested. The physics itself lives in `core/timeDilation.ts`, which is finished and
 * mutation-tested; nothing here re-derives it. What lives here is everything the panels display —
 * the slider mappings, the derived consequences, the formatting and the spoken summary — so that
 * three sections cannot quietly disagree with each other or with the equations panel.
 */
import {
  HAFELE_KEATING_EASTWARD,
  HAFELE_KEATING_PREDICTIONS,
  HAFELE_KEATING_WESTWARD,
  clockRateRatio,
  gpsOffsets,
  hafeleKeating,
  radiusForClockRate,
  staticClockRate,
  type FlightOffsets,
  type GpsOffsets,
} from '../../../core/timeDilation';
import { ISCO_RADIUS, PHOTON_SPHERE_RADIUS } from '../../../core/schwarzschild';
import {
  C,
  DAYS_PER_JULIAN_YEAR,
  EARTH_MEAN_RADIUS,
  METRES_PER_KILOMETRE,
  MICROSECONDS_PER_SECOND,
  SECONDS_PER_DAY,
} from '../../../core/units';

const DECIMAL_BASE = 10;
const HORIZON = 1;

/* ------------------------------------------------------------------ near-horizon static clocks */

/**
 * The slider runs in log10(r/r_s - 1), not in r.
 *
 * Everything interesting happens within a hair of the horizon: at r = 1.000001 r_s a clock runs
 * 1000x slow, and at r = 2 r_s it runs at 0.707. A linear axis in r spends its whole length in
 * the region where the answer is 1. Integer steps, both endpoints pinned — the deflection slider
 * taught that lesson the hard way.
 */
export const MIN_LOG_HEIGHT = -6;
export const MAX_LOG_HEIGHT = 6;
export const HEIGHT_STEPS = 1200;

export function logHeightFromIndex(index: number): number {
  if (index <= 0) return MIN_LOG_HEIGHT;
  if (index >= HEIGHT_STEPS) return MAX_LOG_HEIGHT;
  return MIN_LOG_HEIGHT + ((MAX_LOG_HEIGHT - MIN_LOG_HEIGHT) * index) / HEIGHT_STEPS;
}

export function indexFromLogHeight(logHeight: number): number {
  const fraction = (logHeight - MIN_LOG_HEIGHT) / (MAX_LOG_HEIGHT - MIN_LOG_HEIGHT);
  return Math.min(HEIGHT_STEPS, Math.max(0, Math.round(fraction * HEIGHT_STEPS)));
}

/** r/r_s for a slider position. Always strictly greater than 1: no static clock exists at r_s. */
export function radiusFromLogHeight(logHeight: number): number {
  return HORIZON + DECIMAL_BASE ** logHeight;
}

export interface ClockFigures {
  /** r/r_s of the deep clock. */
  radius: number;
  /** dtau/dt for the deep clock, relative to a clock at infinity. */
  rate: number;
  /** 1/rate — "the deep clock runs this many times slow". */
  slowdown: number;
  /** Proper seconds elapsed for the deep clock while one year passes far away. */
  secondsPerFarYear: number;
  /** Rate of the deep clock relative to the reference clock, not to infinity. */
  ratioToReference: number;
  referenceRadius: number;
}

const SECONDS_PER_YEAR = DAYS_PER_JULIAN_YEAR * SECONDS_PER_DAY;

/** The comparison clock: far enough out that its own dilation is negligible but still finite. */
export const REFERENCE_RADIUS = 1e6;

export function clockFigures(logHeight: number): ClockFigures {
  const radius = radiusFromLogHeight(logHeight);
  const rate = staticClockRate(radius, HORIZON);
  return {
    radius,
    rate,
    slowdown: 1 / rate,
    secondsPerFarYear: rate * SECONDS_PER_YEAR,
    ratioToReference: clockRateRatio(radius, REFERENCE_RADIUS, HORIZON),
    referenceRadius: REFERENCE_RADIUS,
  };
}

export interface ClockPreset {
  id: string;
  label: string;
  /** r/r_s. */
  radius: number;
  note: string;
}

/** A thousand Schwarzschild radii out: dilation is 0.9995, effectively the far-field rate. */
const FAR_FIELD_RADIUS = 1001;
/** As close to the horizon as the slider reaches. The rate there is 1e-3. */
const NEAREST_HEIGHT = 1e-6;

/** Radii worth naming, all outside the horizon (PHYSICS_SPEC §2.4). */
export const CLOCK_PRESETS: readonly ClockPreset[] = [
  { id: 'near', label: 'Just outside', radius: HORIZON + NEAREST_HEIGHT, note: '1.000001 rₛ' },
  { id: 'photon', label: 'Photon sphere', radius: PHOTON_SPHERE_RADIUS, note: '1.5 rₛ' },
  { id: 'isco', label: 'ISCO', radius: ISCO_RADIUS, note: '3 rₛ' },
  { id: 'far', label: 'Far field', radius: FAR_FIELD_RADIUS, note: '1001 rₛ' },
];

/** The curve of dtau/dt against radius, sampled in log(r/r_s - 1). */
export interface RatePoint {
  logHeight: number;
  rate: number;
}

export function rateCurve(samples: number): RatePoint[] {
  if (!Number.isInteger(samples) || samples < 2) {
    throw new RangeError('Need at least two samples.');
  }
  return Array.from({ length: samples }, (_, index) => {
    const logHeight = MIN_LOG_HEIGHT
      + ((MAX_LOG_HEIGHT - MIN_LOG_HEIGHT) * index) / (samples - 1);
    return { logHeight, rate: staticClockRate(radiusFromLogHeight(logHeight), HORIZON) };
  });
}

/** Radius at which a clock runs at a given fraction of the far rate. Inverts the curve. */
export function radiusForRate(rate: number): number {
  return radiusForClockRate(rate, HORIZON);
}

/* ------------------------------------------------------------------------------------ GPS */

export const MIN_GPS_RADIUS = 6.6e6;
export const MAX_GPS_RADIUS = 5e7;
export const GPS_RADIUS_STEPS = 880;
export const MAX_LATITUDE = 80;

export function gpsRadiusFromIndex(index: number): number {
  if (index <= 0) return MIN_GPS_RADIUS;
  if (index >= GPS_RADIUS_STEPS) return MAX_GPS_RADIUS;
  return MIN_GPS_RADIUS + ((MAX_GPS_RADIUS - MIN_GPS_RADIUS) * index) / GPS_RADIUS_STEPS;
}

export function indexFromGpsRadius(radius: number): number {
  const fraction = (radius - MIN_GPS_RADIUS) / (MAX_GPS_RADIUS - MIN_GPS_RADIUS);
  return Math.min(GPS_RADIUS_STEPS, Math.max(0, Math.round(fraction * GPS_RADIUS_STEPS)));
}

export interface GpsFigures extends GpsOffsets {
  orbitRadius: number;
  latitudeDegrees: number;
  /** Orbit altitude above the mean radius, km — the number a reader can picture. */
  altitudeKm: number;
  /**
   * Position drift if the offset were left uncorrected, metres per day.
   *
   * Pseudoranging multiplies a clock difference by c, so this is c times the net offset and is
   * computed that way rather than remembered. PHYSICS_SPEC §8.
   */
  rangeErrorMetresPerDay: number;
  /** Fractional rate offset, for comparison with Ashby's pre-launch 4.4647e-10. */
  fractionalRate: number;
}

export function gpsFigures(orbitRadius: number, latitudeDegrees: number): GpsFigures {
  const offsets = gpsOffsets(orbitRadius, latitudeDegrees);
  const netSeconds = offsets.net / MICROSECONDS_PER_SECOND;
  return {
    ...offsets,
    orbitRadius,
    latitudeDegrees,
    altitudeKm: (orbitRadius - EARTH_MEAN_RADIUS) / METRES_PER_KILOMETRE,
    rangeErrorMetresPerDay: netSeconds * C,
    fractionalRate: netSeconds / SECONDS_PER_DAY,
  };
}

/** Ashby 2003: the satellites' proper frequency is set low by this fraction before launch. */
export const ASHBY_FRACTIONAL_RATE = 4.4647e-10;
export const GPS_NOMINAL_FREQUENCY_HZ = 10.23e6;

/** The pre-launch offset frequency implied by a fractional rate. Ashby's is 10.22999999543 MHz. */
export function offsetFrequency(fractionalRate: number): number {
  return GPS_NOMINAL_FREQUENCY_HZ * (1 - fractionalRate);
}

/* ---------------------------------------------------------------------------- Hafele-Keating */

export type FlightDirection = 'eastward' | 'westward';

export interface FlightFigures extends FlightOffsets {
  direction: FlightDirection;
  predicted: { value: number; uncertainty: number };
  /** Whether the computed net lands inside the published prediction band. */
  insideBand: boolean;
  /** |cross| / quadratic — 2.25 at these parameters. The asymmetry mechanism, as a number. */
  crossToQuadratic: number;
}

/**
 * Whether a computed offset lands inside a published prediction band.
 *
 * Exported and tested directly because `flightFigures` only ever produces the two real legs, both
 * of which are inside — so a test built on it alone cannot tell this apart from `true`, and
 * mutation testing said so.
 */
export function insideBand(net: number, predicted: { value: number; uncertainty: number }): boolean {
  return Math.abs(net - predicted.value) <= predicted.uncertainty;
}

export function flightFigures(direction: FlightDirection): FlightFigures {
  const leg = direction === 'eastward' ? HAFELE_KEATING_EASTWARD : HAFELE_KEATING_WESTWARD;
  const offsets = hafeleKeating(leg);
  const predicted = HAFELE_KEATING_PREDICTIONS[direction];
  return {
    ...offsets,
    direction,
    predicted,
    insideBand: insideBand(offsets.net, predicted),
    crossToQuadratic: Math.abs(offsets.sagnacCross) / offsets.quadratic,
  };
}

/* -------------------------------------------------------------------------------- formatting */

const SIGNIFICANT = 4;
const EXPONENTIAL_ABOVE = 1e5;
const EXPONENTIAL_BELOW = 1e-3;
/** Above this the rate rounds to 1 in fixed notation and the readout stops saying anything. */
const NEAR_UNITY = 1e-6;
const NEAR_UNITY_PLACES = 9;

/** Readable across the fifteen decades the radius slider covers. Uses the subscript the rest of
 * the product uses; `formatRadiusSpoken` is the version for the screen-reader summary, where a
 * subscript glyph is either silent or read as a stray letter. */
export function formatRadius(radius: number): string {
  const height = radius - HORIZON;
  if (height < EXPONENTIAL_BELOW || radius >= EXPONENTIAL_ABOVE) {
    return `rₛ + ${height.toExponential(2)} rₛ`;
  }
  return `${radius.toPrecision(SIGNIFICANT)} rₛ`;
}

export function formatRadiusSpoken(radius: number): string {
  const height = radius - HORIZON;
  if (height < EXPONENTIAL_BELOW || radius >= EXPONENTIAL_ABOVE) {
    return `one Schwarzschild radius plus ${height.toExponential(2)} Schwarzschild radii`;
  }
  return `${radius.toPrecision(SIGNIFICANT)} Schwarzschild radii`;
}

/** A rate that may be 0.001 or 0.9999995 — fixed notation loses one end or the other. */
export function formatRate(rate: number): string {
  if (rate < EXPONENTIAL_BELOW) return rate.toExponential(3);
  if (rate > 1 - NEAR_UNITY) return rate.toFixed(NEAR_UNITY_PLACES);
  return rate.toPrecision(SIGNIFICANT);
}

const MINUTES_PER_HOUR = 60;
const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR_LOCAL = MINUTES_PER_HOUR * SECONDS_PER_MINUTE;
/** Below a year by less than this, report in years anyway rather than 365 days. */
const NEARLY_A_YEAR = 0.9;

/** Proper time elapsed for the deep clock in one far-away year, in units a reader can hold. */
export function formatElapsed(seconds: number): string {
  if (seconds >= SECONDS_PER_YEAR * NEARLY_A_YEAR) {
    return `${(seconds / SECONDS_PER_YEAR).toPrecision(SIGNIFICANT)} years`;
  }
  if (seconds >= SECONDS_PER_DAY) return `${(seconds / SECONDS_PER_DAY).toPrecision(SIGNIFICANT)} days`;
  if (seconds >= SECONDS_PER_HOUR_LOCAL) {
    return `${(seconds / SECONDS_PER_HOUR_LOCAL).toPrecision(SIGNIFICANT)} hours`;
  }
  if (seconds >= SECONDS_PER_MINUTE) {
    return `${(seconds / SECONDS_PER_MINUTE).toPrecision(SIGNIFICANT)} minutes`;
  }
  return `${seconds.toPrecision(SIGNIFICANT)} seconds`;
}

export const formatMicroseconds = (value: number): string =>
  `${value >= 0 ? '+' : ''}${value.toPrecision(SIGNIFICANT)} μs/day`;

export const formatNanoseconds = (value: number): string =>
  `${value >= 0 ? '+' : ''}${value.toPrecision(SIGNIFICANT)} ns`;

/* ------------------------------------------------------------------------- spoken summaries */

/**
 * The live summary BUILD_PLAN §6 requires, for whichever section is showing.
 *
 * Three sections share one live region: announcing all three at once would read out numbers the
 * user is not looking at. It carries the physics, not a description of the controls.
 */
export function describeClocks(logHeight: number): string {
  const f = clockFigures(logHeight);
  return [
    `Static clock at ${formatRadiusSpoken(f.radius)}, outside the horizon.`,
    `It ticks at ${formatRate(f.rate)} of the rate of a clock at infinity, so it runs`
    + ` ${f.slowdown.toPrecision(SIGNIFICANT)} times slow.`,
    `While one year passes far away, ${formatElapsed(f.secondsPerFarYear)} pass here.`,
    'No static clock exists at or inside the horizon, so the rate reaches zero only as a limit.',
  ].join(' ');
}

export function describeGps(figures: GpsFigures): string {
  return [
    `GPS satellite at ${figures.altitudeKm.toPrecision(SIGNIFICANT)} kilometres altitude,`
    + ` ground station at ${figures.latitudeDegrees.toFixed(0)} degrees latitude.`,
    `Height makes the satellite clock gain ${formatMicroseconds(figures.gravitational)};`
    + ` its speed makes it lose ${formatMicroseconds(figures.kinematic)};`
    + ` the net is ${formatMicroseconds(figures.net)}.`,
    `Uncorrected, that is ${(figures.rangeErrorMetresPerDay / METRES_PER_KILOMETRE).toPrecision(3)}`
    + ' kilometres of position error per day.',
  ].join(' ');
}

export function describeFlights(east: FlightFigures, west: FlightFigures): string {
  return [
    'Hafele and Keating flew caesium clocks around the world in 1971.',
    `Eastward, with the Earth's rotation, the flying clock loses`
    + ` ${formatNanoseconds(east.net)} against the ground; westward it gains`
    + ` ${formatNanoseconds(west.net)}.`,
    `Both land inside the published predictions of ${east.predicted.value} plus or minus`
    + ` ${east.predicted.uncertainty} and ${west.predicted.value} plus or minus`
    + ` ${west.predicted.uncertainty} nanoseconds.`,
    `The asymmetry comes from the Sagnac cross term, which is`
    + ` ${east.crossToQuadratic.toPrecision(3)} times the v-squared term and reverses sign with`
    + ' direction, while the v-squared term does not.',
  ].join(' ');
}
