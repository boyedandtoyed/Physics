import { describe, expect, it } from 'vitest';
import { decadeTicks, project, projectClamped, toPath, type Axis } from './chartGeometry';

const xAxis: Axis = { min: -7.48, max: 0, from: 60, to: 660 };
// Vertical: the maximum maps to the SMALLER pixel value, because SVG y grows downwards.
const yAxis: Axis = { min: -1, max: 15, from: 300, to: 20 };

describe('axis projection', () => {
  it('pins both endpoints exactly', () => {
    expect(project(xAxis, xAxis.min)).toBeCloseTo(60, 12);
    expect(project(xAxis, xAxis.max)).toBeCloseTo(660, 12);
    expect(project(yAxis, yAxis.min)).toBeCloseTo(300, 12);
    expect(project(yAxis, yAxis.max)).toBeCloseTo(20, 12);
  });

  it('is linear in between, checked at several fractions rather than only the midpoint', () => {
    // The midpoint alone cannot distinguish a linear map from several wrong ones.
    for (const fraction of [0.1, 0.25, 0.5, 0.75, 0.9]) {
      const value = xAxis.min + (xAxis.max - xAxis.min) * fraction;
      expect(project(xAxis, value)).toBeCloseTo(60 + 600 * fraction, 9);
    }
  });

  it('runs the y axis upwards on screen: a larger value gets a smaller pixel', () => {
    expect(project(yAxis, 10)).toBeLessThan(project(yAxis, 5));
    expect(project(yAxis, 5)).toBeLessThan(project(yAxis, 0));
  });

  it('extrapolates rather than clamping, unless clamping is asked for', () => {
    expect(project(xAxis, 1)).toBeGreaterThan(660);
    expect(projectClamped(xAxis, 1)).toBeCloseTo(660, 12);
    expect(projectClamped(xAxis, -99)).toBeCloseTo(60, 12);
    expect(projectClamped(yAxis, 99)).toBeCloseTo(20, 12);
  });

  it('rejects a degenerate axis instead of dividing by zero', () => {
    expect(() => project({ min: 1, max: 1, from: 0, to: 10 }, 1)).toThrow(RangeError);
    expect(() => project({ min: 2, max: 1, from: 0, to: 10 }, 1)).toThrow(RangeError);
  });
});

describe('path building', () => {
  it('starts with a move and continues with lines', () => {
    const path = toPath([{ x: -7.48, y: 15 }, { x: 0, y: -1 }], xAxis, yAxis);
    expect(path).toBe('M60.00 20.00 L660.00 300.00');
  });

  it('keeps one command per point', () => {
    const points = Array.from({ length: 12 }, (_, i) => ({ x: -7 + i * 0.5, y: i }));
    const path = toPath(points, xAxis, yAxis);
    expect(path.match(/[ML]/g)).toHaveLength(12);
  });

  it('refuses an empty series rather than emitting an invalid path', () => {
    expect(() => toPath([], xAxis, yAxis)).toThrow(RangeError);
  });
});

describe('decade ticks', () => {
  it('lists the whole decades inside the axis and none outside it', () => {
    expect(decadeTicks({ min: -7.48, max: 0, from: 0, to: 1 }, 20)).toEqual(
      [-7, -6, -5, -4, -3, -2, -1, 0],
    );
  });

  it('thins them to fit rather than overlapping labels', () => {
    const ticks = decadeTicks({ min: -7.48, max: 0, from: 0, to: 1 }, 4);
    expect(ticks.length).toBeLessThanOrEqual(4);
    expect(ticks[0]).toBe(-7);
  });

  it('handles an axis narrower than one decade', () => {
    expect(decadeTicks({ min: 0.2, max: 0.8, from: 0, to: 1 }, 5)).toEqual([]);
  });
});
