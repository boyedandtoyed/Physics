import { describe, expect, it } from 'vitest';
import {
  CHARTS,
  describeEvent,
  formatInvariant,
  formatRadius,
  readEvent,
  sampleTrajectory,
  type ChartId,
} from './describeCharts';
import { HORIZON, properTimeToHorizon } from '../../../core/infall';

const EVENT_TIMES = [0, 2, 6, 10, 13, 14, 14.41];
const ALL: ChartId[] = ['schwarzschild', 'gullstrandPainleve', 'eddingtonFinkelstein', 'kruskal'];

describe('the four charts', () => {
  it('names all four, each with its own time label', () => {
    expect(CHARTS.map(chart => chart.id)).toEqual(ALL);
    expect(new Set(CHARTS.map(chart => chart.timeLabel)).size).toBe(4);
    expect(CHARTS.find(chart => chart.id === 'schwarzschild')?.atHorizon).toContain('∞');
    for (const chart of CHARTS.filter(candidate => candidate.id !== 'schwarzschild')) {
      expect(chart.atHorizon).toBe('finite');
    }
  });

  it('explains, on the two panels that cannot show the whole worldline, why not', () => {
    // Schwarzschild runs off the top; Kruskal's exterior is exponentially stretched. Both are
    // physics rather than clipping, so both are stated rather than left as a gap.
    const withNotes = CHARTS.filter(chart => chart.windowNote).map(chart => chart.id).sort();
    expect(withNotes).toEqual(['kruskal', 'schwarzschild']);
    expect(CHARTS.find(chart => chart.id === 'schwarzschild')?.windowNote).toContain('t → ∞');
    expect(CHARTS.find(chart => chart.id === 'kruskal')?.windowNote).toContain('1.4×10⁶');
  });
});

describe('the invariants agree at the same event, in all four charts', () => {
  it('recovers the same areal radius by four independent routes, to 1e-12', () => {
    for (const tau of EVENT_TIMES) {
      const reading = readEvent(tau);
      for (const chart of reading.charts) {
        if (!Number.isFinite(chart.recoveredRadius)) continue;
        expect(chart.radiusDeviation).toBeLessThan(1e-12);
      }
    }
  });

  it('agrees on the Kretschmann scalar and the tidal component to 1e-10', () => {
    for (const tau of EVENT_TIMES) {
      const reading = readEvent(tau);
      expect(reading.invariantSpread).toBeLessThan(1e-10);
      const finite = reading.charts.filter(chart => Number.isFinite(chart.tidal));
      const tidals = finite.map(chart => chart.tidal);
      expect(Math.max(...tidals) / Math.min(...tidals) - 1).toBeLessThan(1e-10);
      expect(finite.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('is not comparing a number with itself: the coordinates genuinely differ', () => {
    // Without this the agreement above would be worthless. Four charts, four different numbers,
    // one curvature.
    for (const tau of [2, 6, 10, 13]) {
      const reading = readEvent(tau);
      const shown = reading.charts.map(chart => chart.timeValue);
      expect(new Set(shown).size).toBe(4);
    }
  });

  it('holds the invariants themselves varying strongly along the fall', () => {
    // If K barely changed, agreeing on it would be easy. It runs over five orders of magnitude.
    const first = readEvent(0).charts[1]!.kretschmann;
    const last = readEvent(14.41).charts[1]!.kretschmann;
    expect(last / first).toBeGreaterThan(1e4);
  });
});

describe('what each chart does at the horizon', () => {
  const atHorizon = readEvent(properTimeToHorizon());

  it('puts the faller at the horizon in finite proper time', () => {
    expect(atHorizon.radius).toBeCloseTo(HORIZON, 10);
    expect(atHorizon.pastHorizon).toBe(true);
    expect(atHorizon.properTime).toBeCloseTo(14.4183, 4);
  });

  it('has Schwarzschild and Eddington–Finkelstein stop covering the event', () => {
    const bounded = atHorizon.charts.filter(chart => chart.timeValue === '∞');
    expect(bounded.map(chart => chart.id).sort())
      .toEqual(['eddingtonFinkelstein', 'kruskal', 'schwarzschild']);
    // GP alone still labels it, with the faller's own finite clock.
    const gp = atHorizon.charts.find(chart => chart.id === 'gullstrandPainleve')!;
    expect(Number(gp.timeValue)).toBeCloseTo(14.4183, 3);
  });

  it('reports an unremarkable curvature there — the horizon is not a place of violence', () => {
    const gp = atHorizon.charts.find(chart => chart.id === 'gullstrandPainleve')!;
    expect(gp.kretschmann).toBeCloseTo(12, 6);
    expect(gp.tidal).toBeCloseTo(-1, 6);
    expect(Number.isFinite(gp.tidal)).toBe(true);
  });
});

describe('the sampled trajectory', () => {
  it('spans r0 to the horizon with the requested number of samples', () => {
    const points = sampleTrajectory(50);
    expect(points).toHaveLength(50);
    expect(points[0]!.radius).toBeCloseTo(8, 8);
    expect(points[0]!.tau).toBe(0);
    expect(points[49]!.radius).toBeCloseTo(HORIZON, 8);
    expect(points[49]!.tau).toBeCloseTo(14.4183, 4);
  });

  it('descends monotonically and refuses a degenerate request', () => {
    const points = sampleTrajectory(30);
    for (let i = 1; i < points.length; i++) {
      expect(points[i]!.radius).toBeLessThan(points[i - 1]!.radius);
      expect(points[i]!.tau).toBeGreaterThan(points[i - 1]!.tau);
    }
    expect(() => sampleTrajectory(1)).toThrow(RangeError);
    expect(() => sampleTrajectory(10.5)).toThrow(RangeError);
  });
});

describe('formatting and the spoken summary', () => {
  it('formats radii and invariants without losing the scale', () => {
    expect(formatRadius(2.13857)).toBe('2.138570');
    expect(formatRadius(Number.NaN)).toBe('—');
    expect(formatInvariant(0.12544058)).toBe('1.2544e-1');
    expect(formatInvariant(Number.NaN)).toBe('—');
  });

  it('states the agreement as a number rather than describing four pictures', () => {
    const text = describeEvent(readEvent(10));
    expect(text).toContain('Schwarzschild t =');
    expect(text).toContain('Gullstrand–Painlevé t_ff =');
    expect(text).toContain('Eddington–Finkelstein v =');
    expect(text).toContain('Kruskal–Szekeres T =');
    expect(text).toContain('Kretschmann scalar');
    expect(text).not.toMatch(/NaN|undefined|Infinity/);
  });

  it('says what happens at the horizon, including that nothing does', () => {
    const text = describeEvent(readEvent(properTimeToHorizon()));
    expect(text).toContain('at or inside the horizon');
    expect(text).toContain('the curvature is unremarkable');
    expect(text).not.toMatch(/NaN|undefined/);
  });

  it('produces finite prose at every point of the fall', () => {
    for (let tau = 0; tau <= properTimeToHorizon(); tau += 0.97) {
      const text = describeEvent(readEvent(tau));
      expect(text).not.toMatch(/NaN|undefined/);
      expect(text.length).toBeGreaterThan(120);
    }
  });
});
