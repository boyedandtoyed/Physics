import { describe, expect, it } from 'vitest';
import {
  CASSINI_GAMMA_OFFSET,
  CASSINI_GAMMA_UNCERTAINTY,
  DEFLECTION_PRESETS,
  EINSTEIN_1911_PPN_GAMMA,
  GR_PPN_GAMMA,
  WEAK_DEFLECTION_LIMIT_RADIANS,
  deflection,
  deflectionScale,
  exactNewtonianDeflection,
  radiansToArcseconds,
  weakDeflectionBetaThreshold,
} from './deflection';
import { C, SOLAR_GM, SOLAR_RADIUS } from './units';

const arcsec = (beta: number, gamma = GR_PPN_GAMMA) =>
  radiansToArcseconds(deflection(beta, { ppnGamma: gamma }).total);

// Never gated at a single beta, and never only at beta = 1, where 1/beta^2 = beta^2 = 1 and a
// wrong exponent on either term is invisible. Same lesson as the r = 1 Kretschmann check.
const BETAS = [1e-3, 1e-2, 0.1, 0.3, 0.7, 1];

describe('deflection at the solar limb (§8 rows 2-3)', () => {
  it('reproduces the measured 1.7512" for light', () => {
    expect(radiansToArcseconds(deflection(1).total)).toBeCloseTo(1.7512, 3);
    expect(deflection(1).total).toBeCloseTo(8.4900e-6, 9);
  });

  it("reproduces Einstein's 1911 time-only 0.8756\"", () => {
    expect(radiansToArcseconds(deflection(1).timeCurvature)).toBeCloseTo(0.8756, 3);
    // gamma = 0 is the 1911 theory: it removes the space term and nothing else.
    expect(arcsec(1, EINSTEIN_1911_PPN_GAMMA)).toBeCloseTo(0.8756, 3);
  });

  it('makes the ratio exactly 2 for light — the factor that measures spatial curvature', () => {
    const light = deflection(1);
    expect(light.total / light.timeCurvature).toBe(2);
    expect(light.spaceCurvature).toBe(light.timeCurvature);
  });

  it('gives the scale 2GM/c^2b independently of how it is assembled', () => {
    expect(deflectionScale()).toBeCloseTo(4.2450e-6, 10);
    expect(deflectionScale()).toBeCloseTo((2 * SOLAR_GM) / (C ** 2 * SOLAR_RADIUS), 15);
  });
});

describe('the space term is the constant one — §7.4 Claim A', () => {
  it('holds the space contribution fixed at 0.8756" for every speed', () => {
    // The sentence §7.4 says the ratio table alone does not tell you. It is the whole exhibit.
    for (const beta of BETAS) {
      expect(radiansToArcseconds(deflection(beta).spaceCurvature)).toBeCloseTo(0.8756, 3);
    }
  });

  it('blows the time contribution up as 1/beta^2, checked as a scaling law', () => {
    // Asserting the scaling across decades pins the exponent; one value would not.
    for (const beta of [1e-3, 1e-2, 0.1]) {
      const ratio = deflection(beta).timeCurvature / deflection(beta * 10).timeCurvature;
      expect(ratio).toBeCloseTo(100, 6);
    }
  });

  it('makes space/time exactly beta^2 across four decades', () => {
    for (const beta of BETAS) {
      expect(deflection(beta).spaceOverTime).toBeCloseTo(beta ** 2, 12);
    }
  });

  it("reproduces §7.4's ratio table for the four named systems", () => {
    const expected: Record<string, number> = {
      apple: 1.11e-15, iss: 6.6e-10, mercury: 2.55e-8, light: 1,
    };
    for (const preset of DEFLECTION_PRESETS) {
      const got = deflection(preset.speed / C).spaceOverTime;
      // Relative agreement: these span fifteen orders of magnitude.
      expect(got / expected[preset.id]!).toBeCloseTo(1, 1);
    }
  });

  it('sums to the parts it reports, at every speed', () => {
    for (const beta of BETAS) {
      const d = deflection(beta);
      expect(d.total).toBeCloseTo(d.timeCurvature + d.spaceCurvature, 12);
    }
  });
});

describe('PPN gamma is the space coefficient', () => {
  it('scales only the space term, leaving the time term untouched', () => {
    for (const beta of [1e-2, 0.5, 1]) {
      const base = deflection(beta, { ppnGamma: 1 });
      for (const gamma of [0, 0.5, 1, 1.5]) {
        const d = deflection(beta, { ppnGamma: gamma });
        expect(d.timeCurvature).toBeCloseTo(base.timeCurvature, 15);
        expect(d.spaceCurvature).toBeCloseTo(gamma * base.spaceCurvature, 15);
      }
    }
  });

  it('admits nothing outside 0.0001" of 1.7512" within the Cassini bound', () => {
    const lo = 1 + CASSINI_GAMMA_OFFSET - CASSINI_GAMMA_UNCERTAINTY;
    const hi = 1 + CASSINI_GAMMA_OFFSET + CASSINI_GAMMA_UNCERTAINTY;
    for (const gamma of [lo, 1 + CASSINI_GAMMA_OFFSET, hi]) {
      expect(Math.abs(arcsec(1, gamma) - 1.7511903)).toBeLessThan(1e-4);
    }
    // And the bound genuinely excludes the 1911 theory, by four orders of magnitude.
    expect(Math.abs(arcsec(1, EINSTEIN_1911_PPN_GAMMA) - 1.7511903)).toBeGreaterThan(0.8);
  });
});

describe('where the linearization stops being a deflection', () => {
  it('agrees with the exact Newtonian hyperbola to better than 1% inside the band', () => {
    for (const beta of [0.0206, 0.05, 0.2, 1]) {
      const linear = deflection(beta).timeCurvature;
      const exact = exactNewtonianDeflection(beta);
      expect(Math.abs(linear / exact - 1)).toBeLessThan(0.01);
    }
  });

  it('diverges from it by a factor of 2 at beta = 9.542e-4, and by 135 a decade below', () => {
    const ratio = (beta: number) => deflection(beta).timeCurvature / exactNewtonianDeflection(beta);
    expect(ratio(9.542e-4)).toBeCloseTo(2, 3);
    expect(ratio(1e-3)).toBeCloseTo(1.88, 2);
    expect(ratio(1e-4)).toBeCloseTo(135.5, 0);
  });

  it('flags the invalid band, and puts the threshold at v ~ 6180 km/s', () => {
    const threshold = weakDeflectionBetaThreshold();
    expect(threshold).toBeCloseTo(0.0206078, 6);
    expect(threshold * C / 1000).toBeCloseTo(6178, 0);
    expect(deflection(threshold).total).toBeCloseTo(WEAK_DEFLECTION_LIMIT_RADIANS, 12);
    expect(deflection(threshold * 1.01).weakDeflectionValid).toBe(true);
    expect(deflection(threshold * 0.99).weakDeflectionValid).toBe(false);
    expect(deflection(1).weakDeflectionValid).toBe(true);
  });

  it('marks every one of the three slow presets invalid, and only light valid', () => {
    // An apple at the solar limb comes out at ~6.1e8 full turns. That is not a deflection, and
    // the exhibit has to say so rather than plot it.
    for (const preset of DEFLECTION_PRESETS) {
      const d = deflection(preset.speed / C);
      expect(d.weakDeflectionValid).toBe(preset.id === 'light');
    }
    const apple = deflection(10 / C);
    expect(radiansToArcseconds(apple.total) / (360 * 3600)).toBeCloseTo(6.07e8, -7);
  });
});

describe('domain guards', () => {
  it('rejects speeds outside (0, 1] and non-positive geometry', () => {
    for (const bad of [0, -0.5, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => deflection(bad)).toThrow(RangeError);
      expect(() => exactNewtonianDeflection(bad)).toThrow(RangeError);
    }
    expect(() => deflection(1, { gm: 0 })).toThrow(RangeError);
    expect(() => deflection(1, { impactParameter: -1 })).toThrow(RangeError);
  });

  it('scales as 1/b: doubling the impact parameter halves both terms', () => {
    for (const factor of [2, 10, 100]) {
      const near = deflection(1);
      const far = deflection(1, { impactParameter: SOLAR_RADIUS * factor });
      expect(near.total / far.total).toBeCloseTo(factor, 9);
      expect(near.spaceCurvature / far.spaceCurvature).toBeCloseTo(factor, 9);
    }
  });

  it('scales linearly with the deflecting mass, at several masses', () => {
    for (const factor of [0.5, 2, 1000]) {
      expect(deflection(1, { gm: SOLAR_GM * factor }).total / deflection(1).total)
        .toBeCloseTo(factor, 9);
    }
  });
});
