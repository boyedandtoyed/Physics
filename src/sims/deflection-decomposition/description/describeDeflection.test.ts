import { describe, expect, it } from 'vitest';
import {
  MAX_LOG_BETA,
  MIN_LOG_BETA,
  SLIDER_STEPS,
  hasDrawableSpaceLine,
  indexFromLogBeta,
  logBetaFromIndex,
  WEAK_LIMIT_LOG_ARCSEC,
  betaFromLog,
  curveBounds,
  deflectionCurve,
  deflectionFigures,
  describeDeflection,
  formatArcseconds,
  formatRatio,
  formatSpeed,
  speedFromLog,
} from './describeDeflection';
import { DEFLECTION_PRESETS, EINSTEIN_1911_PPN_GAMMA } from '../../../core/deflection';
import { APPLE_SPEED, C } from '../../../core/units';

const gr = (logBeta: number) => deflectionFigures({ logBeta, ppnGamma: 1 });

describe('the slider maps onto the physics', () => {
  it('spans exactly the apple to light, and puts light at beta = 1', () => {
    expect(speedFromLog(MIN_LOG_BETA)).toBeCloseTo(APPLE_SPEED, 6);
    expect(betaFromLog(MAX_LOG_BETA)).toBe(1);
    expect(speedFromLog(MAX_LOG_BETA)).toBe(C);
  });

  it('is logarithmic: equal slider steps are equal speed ratios, checked at several points', () => {
    for (const logBeta of [-7, -5, -3, -1]) {
      expect(speedFromLog(logBeta + 1) / speedFromLog(logBeta)).toBeCloseTo(10, 9);
    }
  });

  it('never lets rounding push beta above 1, where deflection() would throw', () => {
    expect(betaFromLog(0)).toBe(1);
    expect(betaFromLog(1e-12)).toBe(1);
    expect(() => gr(0)).not.toThrow();
  });
});

describe('the figures the panel and the summary share', () => {
  it('reproduces 0.8756" and 1.7512" for light', () => {
    const f = gr(0);
    expect(f.timeArcsec).toBeCloseTo(0.8756, 3);
    expect(f.spaceArcsec).toBeCloseTo(0.8756, 3);
    expect(f.totalArcsec).toBeCloseTo(1.7512, 3);
    expect(f.weakDeflectionValid).toBe(true);
  });

  it('holds the space figure at 0.8756" across the whole slider', () => {
    for (const logBeta of [MIN_LOG_BETA, -6, -4, -2, -1, 0]) {
      expect(gr(logBeta).spaceArcsec).toBeCloseTo(0.8756, 3);
    }
  });

  it('names each of §7.4’s four systems when the slider sits on it', () => {
    for (const preset of DEFLECTION_PRESETS) {
      expect(gr(Math.log10(preset.speed / C)).presetId).toBe(preset.id);
    }
    // And does not invent a name in between.
    expect(gr(-3).presetId).toBeNull();
  });

  it('counts the apple’s absurd total in full turns', () => {
    const apple = gr(MIN_LOG_BETA);
    expect(apple.fullTurns).toBeCloseTo(6.07e8, -7);
    expect(apple.weakDeflectionValid).toBe(false);
  });

  it('carries the gamma through to the displayed figures', () => {
    const einstein = deflectionFigures({ logBeta: 0, ppnGamma: EINSTEIN_1911_PPN_GAMMA });
    expect(einstein.spaceArcsec).toBe(0);
    expect(einstein.totalArcsec).toBeCloseTo(0.8756, 3);
  });
});

describe('formatting survives fifteen orders of magnitude', () => {
  it('switches to exponential rather than printing an unreadable integer', () => {
    expect(formatArcseconds(1.7511903)).toBe('1.751″');
    expect(formatArcseconds(0.8755952)).toBe('0.8756″');
    expect(formatArcseconds(7.8695e14)).toMatch(/^7\.87e\+14″$/);
  });

  it('renders the ratio readably at both ends', () => {
    expect(formatRatio(1)).toBe('1.00');
    expect(formatRatio(0.5)).toBe('0.500');
    expect(formatRatio(1.1127e-15)).toBe('1.11e-15');
    expect(formatRatio(0)).toBe('0.00e+0');
  });

  it('picks a unit a reader can hold, and names c at the top', () => {
    expect(formatSpeed(C)).toContain('speed of light');
    expect(formatSpeed(10)).toBe('10.0 m/s');
    expect(formatSpeed(7700)).toBe('7.70 km/s');
  });
});

describe('the spoken summary carries the physics, not a caption', () => {
  it('states both contributions, the ratio and the total for light', () => {
    const text = describeDeflection({ logBeta: 0, ppnGamma: 1 });
    expect(text).toContain('0.8756″');
    expect(text).toContain('1.751″');
    expect(text).toContain('unchanged at every speed');
    expect(text).toContain('Light');
  });

  it('says out loud that the slow end is outside the formula’s domain', () => {
    // The shaded band is the sighted reader's cue; this sentence is the substitute for it.
    const text = describeDeflection({ logBeta: MIN_LOG_BETA, ppnGamma: 1 });
    expect(text).toContain('not a deflection at all');
    expect(text).toContain('full turns');
    expect(text).toContain('the ratio above is still exact, the total is not');
    expect(text).not.toContain('undefined');
    expect(text).not.toContain('NaN');
  });

  it('does not cry wolf inside the valid band', () => {
    const text = describeDeflection({ logBeta: -1, ppnGamma: 1 });
    expect(text).not.toContain('not a deflection at all');
    expect(text).toContain('Total deflection');
  });

  it('flags a non-GR gamma, and names the 1911 theory specifically', () => {
    expect(describeDeflection({ logBeta: 0, ppnGamma: 1 })).not.toContain('gamma');
    expect(describeDeflection({ logBeta: 0, ppnGamma: 0 })).toContain('1911');
    expect(describeDeflection({ logBeta: 0, ppnGamma: 0.5 })).toContain('gamma is 0.5');
  });

  it('produces finite prose at every slider position', () => {
    for (let logBeta = MIN_LOG_BETA; logBeta <= 0; logBeta += 0.37) {
      const text = describeDeflection({ logBeta, ppnGamma: 1 });
      expect(text).not.toMatch(/NaN|Infinity|undefined/);
      expect(text.length).toBeGreaterThan(80);
    }
  });
});

describe('the plotted curves', () => {
  const points = deflectionCurve(1, 64);

  it('draws the space contribution as a flat line — the whole visual claim', () => {
    const spread = Math.max(...points.map(p => p.logSpace)) - Math.min(...points.map(p => p.logSpace));
    expect(spread).toBeLessThan(1e-12);
  });

  it('draws the time contribution with slope -2 in log-log, checked across the axis', () => {
    // A wrong exponent would still pass through the beta = 1 point; the slope is what pins it.
    const spans: readonly (readonly [number, number])[] = [[0, 10], [20, 30], [40, 50]];
    for (const [a, b] of spans) {
      const first = points[a]!;
      const second = points[b]!;
      const slope = (second.logTime - first.logTime) / (second.logBeta - first.logBeta);
      expect(slope).toBeCloseTo(-2, 9);
    }
  });

  it('has the total meet the time line at the slow end and sit 2x above it at beta = 1', () => {
    const slow = points[0]!;
    const fast = points[points.length - 1]!;
    expect(slow.logTotal - slow.logTime).toBeLessThan(1e-12);
    expect(10 ** (fast.logTotal - fast.logTime)).toBeCloseTo(2, 9);
    expect(fast.logBeta).toBe(MAX_LOG_BETA);
    expect(slow.logBeta).toBeCloseTo(MIN_LOG_BETA, 12);
  });

  it('spans the axis monotonically with the requested number of samples', () => {
    expect(points).toHaveLength(64);
    for (let i = 1; i < points.length; i++) {
      expect(points[i]!.logBeta).toBeGreaterThan(points[i - 1]!.logBeta);
      expect(points[i]!.logTime).toBeLessThan(points[i - 1]!.logTime);
    }
    expect(() => deflectionCurve(1, 1)).toThrow(RangeError);
    expect(() => deflectionCurve(1, 2.5)).toThrow(RangeError);
  });

  it('bounds the plot around both drawn series', () => {
    const bounds = curveBounds(points);
    expect(bounds.min).toBeLessThanOrEqual(Math.min(...points.map(p => p.logSpace)));
    expect(bounds.max).toBeGreaterThanOrEqual(Math.max(...points.map(p => p.logTotal)));
    expect(bounds.max).toBeGreaterThan(bounds.min);
  });

  it('puts the weak-deflection ceiling inside the plotted range, so the band is visible', () => {
    const bounds = curveBounds(points);
    expect(WEAK_LIMIT_LOG_ARCSEC).toBeGreaterThan(bounds.min);
    expect(WEAK_LIMIT_LOG_ARCSEC).toBeLessThan(bounds.max);
    // 0.01 rad in arcseconds, i.e. about 2063".
    expect(10 ** WEAK_LIMIT_LOG_ARCSEC).toBeCloseTo(2062.65, 1);
  });
});

describe('gamma = 0 does not take the chart down with it', () => {
  // Found by running the page, not by a unit test: at gamma = 0 the space contribution is
  // exactly zero, log10(0) is -Infinity, and the tick loop counted upwards from -Infinity
  // forever. Selecting "Einstein 1911" hung the tab.
  const zeroGamma = deflectionCurve(EINSTEIN_1911_PPN_GAMMA, 32);

  it('produces a space series that is entirely non-finite, and says so', () => {
    expect(zeroGamma.every(point => point.logSpace === Number.NEGATIVE_INFINITY)).toBe(true);
    expect(hasDrawableSpaceLine(zeroGamma)).toBe(false);
    expect(hasDrawableSpaceLine(deflectionCurve(1, 32))).toBe(true);
  });

  it('still returns finite, usable bounds', () => {
    const bounds = curveBounds(zeroGamma);
    expect(Number.isFinite(bounds.min)).toBe(true);
    expect(Number.isFinite(bounds.max)).toBe(true);
    expect(bounds.max).toBeGreaterThan(bounds.min);
  });

  it('keeps the total and time lines identical, since there is no space term', () => {
    for (const point of zeroGamma) {
      expect(point.logTotal).toBeCloseTo(point.logTime, 12);
    }
  });

  it('refuses to bound a series with nothing finite in it', () => {
    expect(() => curveBounds([])).toThrow(RangeError);
  });
});

describe('the slider index mapping', () => {
  it('reaches both endpoints exactly — the whole reason it is integer-valued', () => {
    expect(logBetaFromIndex(SLIDER_STEPS)).toBe(MAX_LOG_BETA);
    expect(betaFromLog(logBetaFromIndex(SLIDER_STEPS))).toBe(1);
    expect(logBetaFromIndex(0)).toBe(MIN_LOG_BETA);
    expect(speedFromLog(logBetaFromIndex(0))).toBeCloseTo(APPLE_SPEED, 6);
  });

  it('round-trips through the index at many positions', () => {
    for (let index = 0; index <= SLIDER_STEPS; index += 37) {
      expect(indexFromLogBeta(logBetaFromIndex(index))).toBe(index);
    }
  });

  it('is monotonic and stays inside the range even when pushed outside it', () => {
    for (let index = 1; index <= SLIDER_STEPS; index++) {
      expect(logBetaFromIndex(index)).toBeGreaterThan(logBetaFromIndex(index - 1));
    }
    expect(logBetaFromIndex(-50)).toBe(MIN_LOG_BETA);
    expect(logBetaFromIndex(SLIDER_STEPS + 50)).toBe(MAX_LOG_BETA);
    expect(indexFromLogBeta(5)).toBe(SLIDER_STEPS);
    expect(indexFromLogBeta(-50)).toBe(0);
  });

  it('lands close enough to each preset that the readout still names it', () => {
    // One index step is 2.3% in speed; the readout's tolerance is 2%, so the nearest index has
    // to be within half a step of every preset for the labels to work.
    for (const preset of DEFLECTION_PRESETS) {
      const index = indexFromLogBeta(Math.log10(preset.speed / C));
      expect(deflectionFigures({ logBeta: logBetaFromIndex(index), ppnGamma: 1 }).presetId)
        .toBe(preset.id);
    }
  });
});
