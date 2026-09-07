import { describe, expect, it } from 'vitest';
import {
  HAFELE_KEATING_EASTWARD,
  HAFELE_KEATING_PREDICTIONS,
  HAFELE_KEATING_WESTWARD,
  clockRateRatio,
  gpsOffsets,
  hafeleKeating,
  perpendicularRadius,
  properTimeAt,
  radiusForClockRate,
  schwarzschildRadius,
  staticClockRate,
} from './timeDilation';
import { EARTH_ANGULAR_VELOCITY, SOLAR_MASS } from './units';

describe('static clock rate', () => {
  // Never gated at one radius, and never at r = r_s where the normalised variable is 1 and
  // every wrong exponent still gives the same answer. That mistake was made once in this
  // project already; see DECISIONS.md, the Kretschmann check.
  const RADII = [1.5, 2, 4, 10, 100, 1e4];

  it('matches sqrt(1 - r_s/r) across six decades of radius', () => {
    for (const ratio of RADII) {
      expect(staticClockRate(ratio, 1)).toBeCloseTo(Math.sqrt(1 - 1 / ratio), 14);
    }
  });

  it('is scale-free: only r/r_s enters', () => {
    for (const ratio of RADII) {
      for (const schwarzschild of [1e-3, 1, 2.95e3, 1e9]) {
        expect(staticClockRate(ratio * schwarzschild, schwarzschild))
          .toBeCloseTo(staticClockRate(ratio, 1), 14);
      }
    }
  });

  it('approaches the weak-field limit with an error that falls as the square', () => {
    // 1 - sqrt(1 - x) = x/2 + x^2/8 + ..., so the residual after the linear term scales as x^2.
    // Asserting the scaling, not one value, is what pins the exponent.
    const residual = (ratio: number) => {
      const x = 1 / ratio;
      return Math.abs(1 - staticClockRate(ratio, 1) - x / 2);
    };
    for (const ratio of [1e3, 1e4, 1e5]) {
      expect(residual(ratio) / residual(ratio * 10)).toBeCloseTo(100, 0);
    }
  });

  it('vanishes at the horizon and is rejected inside it', () => {
    expect(staticClockRate(1, 1)).toBe(0);
    expect(() => staticClockRate(0.9, 1)).toThrow(RangeError);
    expect(() => staticClockRate(-1, 1)).toThrow(RangeError);
  });

  it('inverts consistently over a range of rates', () => {
    for (const rate of [0.1, 0.5, 0.9, 0.99, 0.999]) {
      const radius = radiusForClockRate(rate, 1);
      expect(staticClockRate(radius, 1)).toBeCloseTo(rate, 12);
    }
    expect(() => radiusForClockRate(1, 1)).toThrow(RangeError);
    expect(() => radiusForClockRate(0, 1)).toThrow(RangeError);
  });

  it('makes the deeper of two clocks the slower one, at several separations', () => {
    for (const [lower, upper] of [[2, 4], [3, 30], [1.2, 1e6]]) {
      expect(clockRateRatio(lower!, upper!, 1)).toBeLessThan(1);
    }
    expect(properTimeAt(4, 1, 100)).toBeCloseTo(100 * Math.sqrt(0.75), 12);
  });

  it('gives the textbook solar Schwarzschild radius', () => {
    expect(schwarzschildRadius(SOLAR_MASS) / 1000).toBeCloseTo(2.953, 2);
  });
});

describe('GPS clock offsets (§8 rows 5-7)', () => {
  it('reproduces the published per-day figures', () => {
    const offsets = gpsOffsets();
    expect(offsets.gravitational).toBeCloseTo(45.7, 1);
    // -7.11 at the equator; the published -7.2 assumes a non-equatorial station.
    expect(offsets.kinematic).toBeCloseTo(-7.11, 1);
    expect(offsets.net).toBeCloseTo(38.5, 0);
  });

  it('has the two effects opposing, with gravity winning', () => {
    const offsets = gpsOffsets();
    expect(offsets.gravitational).toBeGreaterThan(0);
    expect(offsets.kinematic).toBeLessThan(0);
    expect(Math.abs(offsets.gravitational)).toBeGreaterThan(Math.abs(offsets.kinematic));
  });

  it('weakens the gravitational term as the orbit is lowered, across several radii', () => {
    const radii = [8e6, 1.2e7, 2.6562e7, 5e7];
    const values = radii.map(r => gpsOffsets(r).gravitational);
    for (let i = 1; i < values.length; i++) expect(values[i]!).toBeGreaterThan(values[i - 1]!);
    // A low orbit is fast enough that the net offset changes sign.
    expect(gpsOffsets(6.6e6).net).toBeLessThan(0);
    expect(gpsOffsets(2.6562e7).net).toBeGreaterThan(0);
  });
});

describe('Hafele-Keating (§8 rows 8, 9, 19)', () => {
  it('lands inside both published prediction bands', () => {
    const east = hafeleKeating(HAFELE_KEATING_EASTWARD).net;
    const west = hafeleKeating(HAFELE_KEATING_WESTWARD).net;
    const { eastward, westward } = HAFELE_KEATING_PREDICTIONS;
    expect(Math.abs(east - eastward.value)).toBeLessThanOrEqual(eastward.uncertainty);
    expect(Math.abs(west - westward.value)).toBeLessThanOrEqual(westward.uncertainty);
    expect(east).toBeLessThan(0);
    expect(west).toBeGreaterThan(0);
  });

  it('makes the asymmetry come from the cross term, not the quadratic one', () => {
    const east = hafeleKeating(HAFELE_KEATING_EASTWARD);
    const west = hafeleKeating(HAFELE_KEATING_WESTWARD);
    // The cross term reverses with direction; the v^2 term does not.
    expect(Math.sign(east.sagnacCross)).toBe(-Math.sign(west.sagnacCross));
    expect(Math.sign(east.quadratic)).toBe(Math.sign(west.quadratic));
    expect(east.sagnacCross / east.quadratic).toBeCloseTo(2.254, 2);
  });

  it('loses the asymmetry entirely if the aircraft speed is misread as the ground station speed', () => {
    // The trap PHYSICS_SPEC §8 previously invited. Substituting R_perp*Omega makes both
    // directions identical, which is the one thing these rows exist to disprove.
    const groundSpeed = perpendicularRadius(50) * EARTH_ANGULAR_VELOCITY;
    const misreadEast = hafeleKeating({ ...HAFELE_KEATING_EASTWARD, airSpeed: groundSpeed });
    const misreadWest = hafeleKeating({ ...HAFELE_KEATING_WESTWARD, airSpeed: groundSpeed, hours: 41.2 });
    expect(misreadEast.net).toBeCloseTo(misreadWest.net, 9);
    // Whereas the correct reading gives two clearly different answers.
    const east = hafeleKeating(HAFELE_KEATING_EASTWARD).net;
    const west = hafeleKeating({ ...HAFELE_KEATING_WESTWARD, hours: 41.2 }).net;
    expect(Math.abs(east - west)).toBeGreaterThan(100);
  });

  it('reports parts that add up to the whole it reports', () => {
    // Found by mutation: `kinematic` was displayed but asserted by nothing, so it could have
    // returned the cross term alone and the suite would still have been green. The panel shows
    // this decomposition to the reader, so the decomposition itself has to be gated.
    for (const leg of [HAFELE_KEATING_EASTWARD, HAFELE_KEATING_WESTWARD]) {
      const o = hafeleKeating(leg);
      expect(o.kinematic).toBeCloseTo(-(o.sagnacCross + o.quadratic), 9);
      expect(o.net).toBeCloseTo(o.gravitational + o.kinematic, 9);
      expect(o.quadratic).toBeGreaterThan(0);
    }
    const gps = gpsOffsets();
    expect(gps.net).toBeCloseTo(gps.gravitational + gps.kinematic, 9);
  });

  it('scales the gravitational term linearly with altitude, at several altitudes', () => {
    const at = (h: number) => hafeleKeating({ ...HAFELE_KEATING_EASTWARD, heightMetres: h }).gravitational;
    for (const h of [2000, 5000, 11000]) {
      expect(at(2 * h) / at(h)).toBeCloseTo(2, 9);
    }
  });

  it('puts the distance from the rotation axis, not the Earth radius, in the cross term', () => {
    // R_perp = R * cos(lat): the effect must weaken towards the poles.
    const values = [0, 30, 60, 80].map(
      lat => hafeleKeating({ ...HAFELE_KEATING_EASTWARD, latitudeDegrees: lat }).sagnacCross,
    );
    for (let i = 1; i < values.length; i++) expect(values[i]!).toBeLessThan(values[i - 1]!);
    expect(perpendicularRadius(60) / perpendicularRadius(0)).toBeCloseTo(0.5, 9);
  });
});
