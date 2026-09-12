import { describe, expect, it } from 'vitest';
import {
  MERCURY_ORBITS_PER_CENTURY,
  MERCURY_PRECESSION_ARCSEC_PER_CENTURY,
  MERCURY_PRECESSION_ARCSEC_PER_ORBIT,
  MERCURY_WEAK_FIELD_PARAMETER,
  orbitsForPrecession,
  precessionPerOrbit,
  weakFieldParameter,
  yearsForPrecession,
} from './mercury';
import { ARCSECONDS_PER_RADIAN, SOLAR_GM } from './units';

describe('Mercury at its real parameters (§8 row 1)', () => {
  it('reproduces the published figures', () => {
    expect(MERCURY_PRECESSION_ARCSEC_PER_ORBIT).toBeCloseTo(0.10353, 4);
    expect(MERCURY_ORBITS_PER_CENTURY).toBeCloseTo(415.20, 1);
    expect(MERCURY_PRECESSION_ARCSEC_PER_CENTURY).toBeCloseTo(42.98, 2);
  });

  it('uses only constants from units.ts, so the formula is reproducible from them', () => {
    const direct = precessionPerOrbit(SOLAR_GM, 5.790_905e10, 0.205_630) * ARCSECONDS_PER_RADIAN;
    expect(direct).toBeCloseTo(MERCURY_PRECESSION_ARCSEC_PER_ORBIT, 12);
  });

  it('scales as 1/(a(1-e²)), asserted across several orbits rather than at one', () => {
    // Doubling the semi-latus rectum halves the advance, exactly.
    for (const a of [1e10, 5e10, 2e11]) {
      expect(precessionPerOrbit(SOLAR_GM, a, 0.2) / precessionPerOrbit(SOLAR_GM, 2 * a, 0.2))
        .toBeCloseTo(2, 12);
    }
    for (const e of [0, 0.3, 0.6]) {
      const ratio = precessionPerOrbit(SOLAR_GM, 5e10, e)
        / precessionPerOrbit(SOLAR_GM, 5e10, 0);
      expect(ratio).toBeCloseTo(1 / (1 - e * e), 12);
    }
  });

  it('is linear in GM', () => {
    for (const factor of [0.5, 2, 100]) {
      expect(precessionPerOrbit(SOLAR_GM * factor, 5e10, 0.2)
        / precessionPerOrbit(SOLAR_GM, 5e10, 0.2)).toBeCloseTo(factor, 12);
    }
  });

  it('rejects unphysical elements rather than returning a number', () => {
    expect(() => precessionPerOrbit(0, 5e10, 0.2)).toThrow(RangeError);
    expect(() => precessionPerOrbit(SOLAR_GM, 0, 0.2)).toThrow(RangeError);
    expect(() => precessionPerOrbit(SOLAR_GM, 5e10, 1)).toThrow(RangeError);
    expect(() => precessionPerOrbit(SOLAR_GM, 5e10, -0.1)).toThrow(RangeError);
  });
});

describe('why the animation has to exaggerate', () => {
  it('puts Mercury deep in the weak field, at GM/(ac²) = 2.6e-8', () => {
    expect(MERCURY_WEAK_FIELD_PARAMETER).toBeCloseTo(2.55e-8, 10);
    expect(weakFieldParameter(SOLAR_GM, 5.790_905e10)).toBe(MERCURY_WEAK_FIELD_PARAMETER);
  });

  it('needs millennia for a degree of drift, which is the whole reason for the exaggeration', () => {
    const oneDegree = Math.PI / 180;
    expect(yearsForPrecession(oneDegree)).toBeGreaterThan(5000);
    expect(orbitsForPrecession(oneDegree)).toBeGreaterThan(30_000);
    // A single arcsecond already takes years.
    expect(yearsForPrecession(1 / ARCSECONDS_PER_RADIAN)).toBeGreaterThan(1);
  });

  it('rejects a negative precession', () => {
    expect(() => yearsForPrecession(-1)).toThrow(RangeError);
  });
});
