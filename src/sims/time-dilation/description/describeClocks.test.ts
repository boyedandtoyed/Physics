import { describe, expect, it } from 'vitest';
import {
  ASHBY_FRACTIONAL_RATE,
  CLOCK_PRESETS,
  GPS_RADIUS_STEPS,
  HEIGHT_STEPS,
  MAX_GPS_RADIUS,
  MAX_LOG_HEIGHT,
  MIN_GPS_RADIUS,
  MIN_LOG_HEIGHT,
  REFERENCE_RADIUS,
  clockFigures,
  describeClocks,
  describeFlights,
  describeGps,
  flightFigures,
  formatElapsed,
  formatMicroseconds,
  formatNanoseconds,
  formatRadius,
  formatRate,
  gpsFigures,
  gpsRadiusFromIndex,
  indexFromGpsRadius,
  indexFromLogHeight,
  insideBand,
  logHeightFromIndex,
  offsetFrequency,
  radiusForRate,
  radiusFromLogHeight,
  rateCurve,
} from './describeClocks';
import { GPS_ORBIT_RADIUS, METRES_PER_KILOMETRE } from '../../../core/units';

// Never a single radius, and never r = r_s, where the normalised variable is 1 and every wrong
// exponent gives the same answer. The lesson this repo learned twice already.
const LOG_HEIGHTS = [-6, -4, -2, 0, 2, 4, 6];

describe('the near-horizon slider maps onto the physics', () => {
  it('pins both endpoints exactly and stays outside the horizon everywhere', () => {
    expect(logHeightFromIndex(0)).toBe(MIN_LOG_HEIGHT);
    expect(logHeightFromIndex(HEIGHT_STEPS)).toBe(MAX_LOG_HEIGHT);
    for (let index = 0; index <= HEIGHT_STEPS; index += 17) {
      // No static clock exists at or inside r_s; the calculator must never offer one.
      expect(radiusFromLogHeight(logHeightFromIndex(index))).toBeGreaterThan(1);
    }
  });

  it('round-trips through the index and is monotonic', () => {
    for (let index = 0; index <= HEIGHT_STEPS; index += 53) {
      expect(indexFromLogHeight(logHeightFromIndex(index))).toBe(index);
    }
    for (let index = 1; index <= HEIGHT_STEPS; index++) {
      expect(logHeightFromIndex(index)).toBeGreaterThan(logHeightFromIndex(index - 1));
    }
    expect(indexFromLogHeight(-99)).toBe(0);
    expect(indexFromLogHeight(99)).toBe(HEIGHT_STEPS);
  });

  it('clamps an out-of-range index rather than extrapolating past the slider', () => {
    // The endpoint guards exist for this. Without them the mapping runs off both ends, and the
    // exact-endpoint behaviour they also provide is indistinguishable from the formula's.
    expect(logHeightFromIndex(-5)).toBe(MIN_LOG_HEIGHT);
    expect(logHeightFromIndex(-1e6)).toBe(MIN_LOG_HEIGHT);
    expect(logHeightFromIndex(HEIGHT_STEPS + 5)).toBe(MAX_LOG_HEIGHT);
    expect(logHeightFromIndex(1e6)).toBe(MAX_LOG_HEIGHT);
    expect(gpsRadiusFromIndex(-5)).toBe(MIN_GPS_RADIUS);
    expect(gpsRadiusFromIndex(GPS_RADIUS_STEPS + 5)).toBe(MAX_GPS_RADIUS);
  });

  it('reaches a clock running a thousand times slow at the near end', () => {
    const near = clockFigures(MIN_LOG_HEIGHT);
    expect(near.radius).toBeCloseTo(1 + 1e-6, 12);
    // Not exactly 1e-3 and not exactly 1000x: the rate is sqrt(d/(1+d)), not sqrt(d), so at
    // d = 1e-6 it is 9.999995e-4 and the slowdown is 1000.0005. Asserting the round number
    // would be asserting the asymptote instead of the formula.
    expect(near.rate).toBeCloseTo(9.999995e-4, 12);
    expect(near.slowdown).toBeCloseTo(1000.0005, 3);
    expect(near.slowdown).not.toBe(1000);
  });

  it('reaches effectively no dilation at the far end', () => {
    const far = clockFigures(MAX_LOG_HEIGHT);
    expect(far.rate).toBeGreaterThan(0.9999);
    expect(far.rate).toBeLessThan(1);
  });
});

describe('the static clock figures', () => {
  it('matches sqrt(1 - r_s/r) across the whole slider', () => {
    for (const logHeight of LOG_HEIGHTS) {
      const radius = radiusFromLogHeight(logHeight);
      expect(clockFigures(logHeight).rate).toBeCloseTo(Math.sqrt(1 - 1 / radius), 14);
    }
  });

  it('turns the rate into an elapsed time consistently, at several radii', () => {
    const YEAR = 365.25 * 86400;
    for (const logHeight of LOG_HEIGHTS) {
      const figures = clockFigures(logHeight);
      expect(figures.secondsPerFarYear).toBeCloseTo(figures.rate * YEAR, 6);
      expect(figures.slowdown).toBeCloseTo(1 / figures.rate, 12);
    }
  });

  it('compares against a finite reference clock, not against infinity', () => {
    // The ratio to a clock at 1e6 r_s is very slightly larger than the ratio to infinity.
    for (const logHeight of [-6, -2, 0, 2]) {
      const figures = clockFigures(logHeight);
      expect(figures.ratioToReference).toBeGreaterThan(figures.rate);
      expect(figures.referenceRadius).toBe(REFERENCE_RADIUS);
      expect(figures.ratioToReference / figures.rate).toBeCloseTo(1, 5);
    }
  });

  it('inverts the rate consistently over a range of rates', () => {
    for (const rate of [0.001, 0.1, 0.5, 0.9, 0.999]) {
      expect(clockFigures(Math.log10(radiusForRate(rate) - 1)).rate).toBeCloseTo(rate, 10);
    }
  });

  it('names four radii, all strictly outside the horizon', () => {
    expect(CLOCK_PRESETS).toHaveLength(4);
    for (const preset of CLOCK_PRESETS) expect(preset.radius).toBeGreaterThan(1);
    expect(CLOCK_PRESETS.map(preset => preset.id))
      .toEqual(['near', 'photon', 'isco', 'far']);
    // Tied to the real critical radii, not to transcribed numbers.
    expect(CLOCK_PRESETS[1]!.radius).toBe(1.5);
    expect(CLOCK_PRESETS[2]!.radius).toBe(3);
  });
});

describe('the plotted rate curve', () => {
  const points = rateCurve(120);

  it('rises monotonically from the horizon to the far field', () => {
    expect(points).toHaveLength(120);
    for (let i = 1; i < points.length; i++) {
      expect(points[i]!.rate).toBeGreaterThan(points[i - 1]!.rate);
      expect(points[i]!.logHeight).toBeGreaterThan(points[i - 1]!.logHeight);
    }
  });

  it('spans the full slider range and stays inside (0, 1)', () => {
    expect(points[0]!.logHeight).toBe(MIN_LOG_HEIGHT);
    expect(points[points.length - 1]!.logHeight).toBe(MAX_LOG_HEIGHT);
    for (const point of points) {
      expect(point.rate).toBeGreaterThan(0);
      expect(point.rate).toBeLessThan(1);
      expect(Number.isFinite(point.rate)).toBe(true);
    }
  });

  it('has the rate approach a sqrt(height) law near the horizon, asymptotically', () => {
    // sqrt(1 - 1/(1+d)) = sqrt(d/(1+d)) -> sqrt(d) only as d -> 0. A decade in d approaches a
    // factor sqrt(10) in rate; it does not equal it. Asserting the exponent AND the approach is
    // the honest version — a flat sqrt(10) assertion is false by 0.045% at d = 1e-4.
    const decade = (logHeight: number) =>
      clockFigures(logHeight + 1).rate / clockFigures(logHeight).rate;
    expect(Math.abs(decade(-6) / Math.sqrt(10) - 1)).toBeLessThan(1e-5);
    expect(Math.abs(decade(-4) / Math.sqrt(10) - 1)).toBeLessThan(1e-3);
    expect(Math.abs(decade(-2) / Math.sqrt(10) - 1)).toBeGreaterThan(1e-2);
    // And it converges monotonically as the horizon is approached.
    for (const logHeight of [-5, -4, -3, -2]) {
      expect(Math.abs(decade(logHeight - 1) - Math.sqrt(10)))
        .toBeLessThan(Math.abs(decade(logHeight) - Math.sqrt(10)));
    }
  });

  it('refuses a degenerate request', () => {
    expect(() => rateCurve(1)).toThrow(RangeError);
    expect(() => rateCurve(10.5)).toThrow(RangeError);
  });
});

describe('GPS (§8 rows 5-7)', () => {
  const nominal = gpsFigures(GPS_ORBIT_RADIUS, 0);

  it('reproduces the published per-day figures', () => {
    expect(nominal.gravitational).toBeCloseTo(45.7, 1);
    expect(nominal.kinematic).toBeCloseTo(-7.11, 1);
    expect(nominal.net).toBeCloseTo(38.5, 0);
  });

  it('derives the range error as c times the net offset, not as a remembered number', () => {
    const expected = (nominal.net / 1e6) * 299792458;
    expect(nominal.rangeErrorMetresPerDay).toBeCloseTo(expected, 6);
    expect(nominal.rangeErrorMetresPerDay / METRES_PER_KILOMETRE).toBeCloseTo(11.6, 1);
  });

  it('agrees with Ashby’s pre-launch frequency offset to better than 0.1%', () => {
    // An independent check on sign and magnitude: the satellites are detuned before launch.
    expect(nominal.fractionalRate).toBeCloseTo(ASHBY_FRACTIONAL_RATE, 12);
    expect(Math.abs(nominal.fractionalRate / ASHBY_FRACTIONAL_RATE - 1)).toBeLessThan(1e-3);
    // 10.23 MHz detuned by Ashby's fraction is the published 10.22999999543 MHz. The tolerance
    // has to be tighter than the 0.0091 Hz between detuning down and detuning up, or the
    // assertion cannot tell the sign of the correction — which is the whole point of quoting it.
    expect(offsetFrequency(ASHBY_FRACTIONAL_RATE)).toBeCloseTo(10229999.99543, 4);
    expect(offsetFrequency(ASHBY_FRACTIONAL_RATE)).toBeLessThan(10.23e6);
  });

  it('reports the altitude a reader can picture', () => {
    expect(nominal.altitudeKm).toBeCloseTo(20191, 0);
  });

  it('changes sign at low orbit, where speed beats height', () => {
    expect(gpsFigures(MIN_GPS_RADIUS, 0).net).toBeLessThan(0);
    expect(gpsFigures(MAX_GPS_RADIUS, 0).net).toBeGreaterThan(0);
    // And the range error follows the sign, since it is c times the net.
    expect(gpsFigures(MIN_GPS_RADIUS, 0).rangeErrorMetresPerDay).toBeLessThan(0);
  });

  it('weakens the kinematic penalty towards the poles, at several latitudes', () => {
    // The ground station's own speed is R cos(lat) * Omega, so a polar station moves less and
    // the satellite loses more against it.
    const values = [0, 30, 60, 80].map(lat => gpsFigures(GPS_ORBIT_RADIUS, lat).kinematic);
    for (let i = 1; i < values.length; i++) expect(values[i]!).toBeLessThan(values[i - 1]!);
  });

  it('maps its slider to both endpoints exactly', () => {
    expect(gpsRadiusFromIndex(0)).toBe(MIN_GPS_RADIUS);
    expect(gpsRadiusFromIndex(GPS_RADIUS_STEPS)).toBe(MAX_GPS_RADIUS);
    for (let index = 0; index <= GPS_RADIUS_STEPS; index += 41) {
      expect(indexFromGpsRadius(gpsRadiusFromIndex(index))).toBe(index);
    }
    // The real GPS radius must be reachable, since it is the row §8 asserts.
    const index = indexFromGpsRadius(GPS_ORBIT_RADIUS);
    expect(Math.abs(gpsRadiusFromIndex(index) - GPS_ORBIT_RADIUS)).toBeLessThan(30_000);
  });
});

describe('Hafele–Keating (§8 rows 8, 9, 19)', () => {
  const east = flightFigures('eastward');
  const west = flightFigures('westward');

  it('lands both legs inside the published prediction bands', () => {
    expect(east.insideBand).toBe(true);
    expect(west.insideBand).toBe(true);
    expect(east.net).toBeCloseTo(-44.5, 0);
    expect(west.net).toBeCloseTo(256, -1);
    expect(east.net).toBeLessThan(0);
    expect(west.net).toBeGreaterThan(0);
  });

  it('checks the band on both sides, not just where the real legs happen to land', () => {
    // Both real legs are inside, so `insideBand: true` would pass every test built on them.
    expect(insideBand(-40, { value: -40, uncertainty: 23 })).toBe(true);
    expect(insideBand(-63, { value: -40, uncertainty: 23 })).toBe(true);
    expect(insideBand(-17, { value: -40, uncertainty: 23 })).toBe(true);
    expect(insideBand(-63.01, { value: -40, uncertainty: 23 })).toBe(false);
    expect(insideBand(-16.99, { value: -40, uncertainty: 23 })).toBe(false);
    expect(insideBand(0, { value: 275, uncertainty: 21 })).toBe(false);
  });

  it('quotes the published predictions alongside, not instead of, the computed value', () => {
    expect(east.predicted).toEqual({ value: -40, uncertainty: 23 });
    expect(west.predicted).toEqual({ value: 275, uncertainty: 21 });
  });

  it('puts the asymmetry in the cross term, at a ratio of 2.25', () => {
    expect(east.crossToQuadratic).toBeCloseTo(2.254, 2);
    expect(west.crossToQuadratic).toBeCloseTo(2.254, 2);
    // The cross term reverses with direction; the quadratic one does not.
    expect(Math.sign(east.sagnacCross)).toBe(-Math.sign(west.sagnacCross));
    expect(Math.sign(east.quadratic)).toBe(Math.sign(west.quadratic));
  });

  it('reports parts that sum to the whole it reports', () => {
    for (const leg of [east, west]) {
      expect(leg.kinematic).toBeCloseTo(-(leg.sagnacCross + leg.quadratic), 9);
      expect(leg.net).toBeCloseTo(leg.gravitational + leg.kinematic, 9);
    }
  });
});

describe('formatting survives the ranges these numbers actually cover', () => {
  it('keeps the radius readable at both ends of fifteen decades', () => {
    expect(formatRadius(1 + 1e-6)).toBe('r_s + 1.00e-6 r_s');
    expect(formatRadius(3)).toBe('3.000 r_s');
    expect(formatRadius(1 + 1e6)).toBe('r_s + 1.00e+6 r_s');
  });

  it('keeps the rate readable at both ends', () => {
    expect(formatRate(1e-3)).toBe('0.001000');
    expect(formatRate(1e-5)).toBe('1.000e-5');
    expect(formatRate(0.7071)).toBe('0.7071');
    // Near 1, fixed notation with enough places — otherwise the readout just says "1".
    expect(formatRate(0.9999995)).toBe('0.999999500');
  });

  it('picks a unit for the elapsed time that a reader can hold', () => {
    const YEAR = 365.25 * 86400;
    expect(formatElapsed(YEAR)).toContain('years');
    expect(formatElapsed(YEAR * 0.01)).toContain('days');
    expect(formatElapsed(3600 * 5)).toContain('hours');
    expect(formatElapsed(300)).toContain('minutes');
    expect(formatElapsed(12)).toContain('seconds');
  });

  it('signs the offsets, since the sign is the physics', () => {
    expect(formatMicroseconds(45.7)).toBe('+45.70 μs/day');
    expect(formatMicroseconds(-7.11)).toBe('-7.110 μs/day');
    expect(formatNanoseconds(256)).toBe('+256.0 ns');
    expect(formatNanoseconds(-44.5)).toBe('-44.50 ns');
  });
});

describe('the spoken summaries carry the physics', () => {
  it('states the rate, the slowdown and the horizon caveat', () => {
    const text = describeClocks(0);
    expect(text).toContain('times slow');
    expect(text).toContain('one year passes far away');
    expect(text).toContain('No static clock exists at or inside the horizon');
    expect(text).not.toMatch(/NaN|undefined|Infinity/);
  });

  it('states both GPS terms, their sign, and the consequence', () => {
    const text = describeGps(gpsFigures(GPS_ORBIT_RADIUS, 0));
    expect(text).toContain('gain');
    expect(text).toContain('lose');
    expect(text).toContain('kilometres of position error per day');
    expect(text).not.toMatch(/NaN|undefined/);
  });

  it('states the east/west asymmetry and names its mechanism', () => {
    const text = describeFlights(flightFigures('eastward'), flightFigures('westward'));
    expect(text).toContain('Sagnac cross term');
    expect(text).toContain('reverses sign with direction');
    expect(text).toContain('inside the published predictions');
    expect(text).not.toMatch(/NaN|undefined/);
  });

  it('produces finite prose at every slider position', () => {
    for (let index = 0; index <= HEIGHT_STEPS; index += 43) {
      const text = describeClocks(logHeightFromIndex(index));
      expect(text).not.toMatch(/NaN|undefined|Infinity/);
      expect(text.length).toBeGreaterThan(120);
    }
    for (let index = 0; index <= GPS_RADIUS_STEPS; index += 37) {
      const text = describeGps(gpsFigures(gpsRadiusFromIndex(index), 0));
      expect(text).not.toMatch(/NaN|undefined|Infinity/);
    }
  });
});
