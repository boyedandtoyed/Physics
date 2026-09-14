import { describe, expect, it } from 'vitest';
import {
  ESCAPE_RADIUS,
  RELEASE_RADIUS,
  STOP_FACTOR,
  advanceRun,
  describeRun,
  energies,
  splitRadiusRange,
  startRun,
  trailVertices,
} from './penroseRun';
import { horizonRadii, penroseMaxEfficiency } from '../../../core/kerr';

const SPINS = [0.3, 0.5, 0.9, 0.998] as const;

const midSplit = (spin: number) => {
  const range = splitRadiusRange(spin);
  return range.min + (range.max - range.min) * 0.3;
};

describe('the energies', () => {
  it('conserve energy exactly: E₁ + E₂ is what came in', () => {
    for (const spin of SPINS) {
      for (const fraction of [0.01, 0.3, 0.7, 1]) {
        const range = splitRadiusRange(spin);
        const splitRadius = range.min + (range.max - range.min) * fraction;
        const figures = energies({ spin, splitRadius });
        expect(figures.plunging + figures.escaping).toBeCloseTo(figures.incoming, 9);
      }
    }
  });

  it('never exceed the ceiling for the spin, at any split radius', () => {
    // Not clamped: derived. The ceiling is a property of the split, and this walks the whole
    // slider looking for a counter-example.
    for (const spin of [0, 0.2, 0.5, 0.9, 0.998]) {
      const range = splitRadiusRange(spin);
      for (let index = 0; index <= 400; index++) {
        const splitRadius = range.min + ((range.max - range.min) * index) / 400;
        const figures = energies({ spin, splitRadius });
        expect(figures.gainPercent).toBeLessThanOrEqual(figures.ceilingPercent + 1e-7);
      }
    }
  });

  it('never exceed 20.71% at any spin the slider can reach', () => {
    for (let i = 0; i <= 200; i++) {
      const spin = (0.998 * i) / 200;
      const range = splitRadiusRange(spin);
      for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
        const splitRadius = range.min + (range.max - range.min) * fraction;
        expect(energies({ spin, splitRadius }).gainPercent).toBeLessThan(20.711);
      }
    }
  });

  it('gain exactly zero on the static limit, and E₁ exactly zero with it', () => {
    for (const spin of SPINS) {
      const figures = energies({ spin, splitRadius: 2 });
      expect(figures.gainPercent).toBeCloseTo(0, 7);
      expect(figures.plunging).toBeCloseTo(0, 7);
      expect(figures.escaping).toBeCloseTo(1, 7);
      expect(figures.insideErgosphere).toBe(false);
    }
  });

  it('cannot gain anything when the hole does not spin — and says it LOSES', () => {
    // At a = 0 the horizon and the static limit are the same surface, so the only split radius
    // available is outside the ergosphere that does not exist. E₁ is positive there, so E₂ is
    // smaller than what came in. Reporting that honestly is the point; a clamp to zero would be
    // inventing a result.
    const range = splitRadiusRange(0);
    expect(range.max - range.min).toBeLessThan(0.01);
    const figures = energies({ spin: 0, splitRadius: range.min });
    expect(figures.gainPercent).toBeLessThan(0);
    expect(figures.plunging).toBeGreaterThan(0);
    expect(figures.ceilingPercent).toBe(0);
    expect(figures.insideErgosphere).toBe(false);
  });

  it('approach the closed-form ceiling as the split moves to the horizon', () => {
    for (const spin of [0.5, 0.9, 0.998]) {
      const range = splitRadiusRange(spin);
      const figures = energies({ spin, splitRadius: range.min });
      expect(figures.gainPercent / (penroseMaxEfficiency(spin) * 100)).toBeCloseTo(1, 1);
    }
  });
});

describe('the slider range', () => {
  it('stops outside the horizon and on the static limit', () => {
    for (const spin of SPINS) {
      const range = splitRadiusRange(spin);
      expect(range.min).toBeGreaterThan(horizonRadii(spin).outer);
      expect(range.max).toBe(2);
      expect(range.min).toBeLessThan(range.max);
    }
  });

  it('collapses to nearly nothing when the hole does not spin, because there is no ergosphere', () => {
    const range = splitRadiusRange(0);
    expect(range.max - range.min).toBeLessThan(0.01);
  });
});

describe('the run', () => {
  const run = (spin: number, splitRadius: number, steps: number, step = 0.1) => {
    const params = { spin, splitRadius };
    let state = startRun(params);
    for (let index = 0; index < steps; index++) state = advanceRun(state, params, step);
    return state;
  };

  it('brings the parent from the release radius down to the split radius, and stops there', () => {
    for (const spin of SPINS) {
      const splitRadius = midSplit(spin);
      const state = run(spin, splitRadius, 4000);
      expect(state.parent.radius).toBeCloseTo(splitRadius, 9);
      expect(state.phase).not.toBe('approaching');
      expect(state.parentTrail[0]!.radius).toBe(RELEASE_RADIUS);
    }
  });

  it('never lets the parent overshoot its own turning point', () => {
    for (const spin of SPINS) {
      const splitRadius = midSplit(spin);
      const params = { spin, splitRadius };
      let state = startRun(params);
      for (let index = 0; index < 6000; index++) {
        state = advanceRun(state, params, 0.2);
        expect(state.parent.radius).toBeGreaterThanOrEqual(splitRadius - 1e-9);
      }
    }
  });

  it('sends one fragment to the horizon and the other out of the frame', () => {
    for (const spin of [0.5, 0.9, 0.998]) {
      const splitRadius = midSplit(spin);
      const state = run(spin, splitRadius, 20_000);
      expect(state.phase).toBe('done');
      expect(state.plunging.radius)
        .toBeCloseTo(horizonRadii(spin).outer * STOP_FACTOR, 6);
      expect(state.escaping.radius).toBeCloseTo(ESCAPE_RADIUS, 6);
    }
  });

  it('never asks for a radius inside the horizon, at any spin or split radius', () => {
    for (const spin of [0, 0.5, 0.9, 0.998]) {
      const range = splitRadiusRange(spin);
      for (const fraction of [0, 0.5, 1]) {
        const params = { spin, splitRadius: range.min + (range.max - range.min) * fraction };
        let state = startRun(params);
        const floor = horizonRadii(spin).outer;
        for (let index = 0; index < 5000; index++) {
          state = advanceRun(state, params, 0.2);
          for (const body of [state.parent, state.plunging, state.escaping]) {
            expect(body.radius).toBeGreaterThan(floor);
          }
        }
      }
    }
  });

  it('drags the plunging fragment forward in φ even though it counter-rotates', () => {
    // Its angular momentum is negative and it still ends up going round the way the hole does,
    // because inside the ergosphere nothing can do otherwise.
    const spin = 0.9;
    const state = run(spin, midSplit(spin), 20_000);
    expect(state.plunging.angle).toBeGreaterThan(0);
  });

  it('keeps trails that run oldest-first and fade by index', () => {
    const state = run(0.9, midSplit(0.9), 500);
    const data = trailVertices(state.parentTrail);
    expect(data.length / 3).toBe(state.parentTrail.length);
    expect(data[2]).toBe(0);
    expect(data[data.length - 1]).toBe(1);
    expect(trailVertices([]).length).toBe(0);
  });
});

describe('what the page says', () => {
  it('says the gain is exactly zero on the static limit, in those words', () => {
    const text = describeRun({ spin: 0.9, splitRadius: 2 }, startRun({ spin: 0.9, splitRadius: 2 }));
    expect(text).toContain('exactly zero — not small, zero');
  });

  it('explains that a non-spinning hole has nowhere to put a negative-energy fragment', () => {
    const params = { spin: 0, splitRadius: splitRadiusRange(0).min };
    expect(describeRun(params, startRun(params))).toContain('no ergosphere at all');
  });

  it('names the ceiling alongside the gain, so neither is read alone', () => {
    const params = { spin: 0.998, splitRadius: splitRadiusRange(0.998).min };
    const text = describeRun(params, startRun(params));
    expect(text).toContain('against a ceiling of');
    expect(text).toContain('18.5');
  });
});
