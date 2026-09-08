import { describe, expect, it } from 'vitest';
import { HORIZON, advect, flowBand, infallTime, radiusForSpeed, riverSpeedOverC } from './river';

// Never a single radius, and never only r = r_s, where the normalised variable is 1 and every
// wrong exponent gives the same answer. This repo has learned that one three times.
const RADII = [0.25, 0.5, 1, 2, 4, 9, 25, 100];

describe('the river speed (§5.1, §8 row 33)', () => {
  it('reproduces the benchmark values exactly', () => {
    expect(riverSpeedOverC(4)).toBeCloseTo(0.5, 12);
    expect(riverSpeedOverC(HORIZON)).toBe(1);
    expect(riverSpeedOverC(0.25)).toBeCloseTo(2, 12);
    expect(riverSpeedOverC(100)).toBeCloseTo(0.1, 12);
  });

  it('matches sqrt(r_s/r) across four decades', () => {
    for (const radius of RADII) {
      expect(riverSpeedOverC(radius)).toBeCloseTo(Math.sqrt(1 / radius), 14);
    }
  });

  it('falls as r^{-1/2}, asserted as a scaling law rather than one value', () => {
    // Quadrupling the radius halves the speed, exactly, at every radius. A wrong exponent
    // still passes through r = r_s, which is why the scaling is what gets asserted.
    for (const radius of RADII) {
      expect(riverSpeedOverC(radius) / riverSpeedOverC(radius * 4)).toBeCloseTo(2, 12);
    }
  });

  it('reaches exactly c at the horizon, and only there', () => {
    // This is what makes r_s the horizon in this picture (§5.3), so it is asserted as an
    // equality and not an approximation.
    expect(riverSpeedOverC(HORIZON)).toBe(1);
    expect(riverSpeedOverC(HORIZON * 1.0001)).toBeLessThan(1);
    expect(riverSpeedOverC(HORIZON * 0.9999)).toBeGreaterThan(1);
  });

  it('inverts consistently over a range of speeds', () => {
    for (const speed of [0.1, 0.5, 0.99, 1, 1.5, 3]) {
      expect(riverSpeedOverC(radiusForSpeed(speed))).toBeCloseTo(speed, 12);
    }
    expect(radiusForSpeed(1)).toBe(HORIZON);
    expect(radiusForSpeed(0.5)).toBeCloseTo(4, 12);
  });

  it('rejects a radius of zero rather than returning infinity', () => {
    expect(() => riverSpeedOverC(0)).toThrow(RangeError);
    expect(() => riverSpeedOverC(-1)).toThrow(RangeError);
    expect(() => radiusForSpeed(0)).toThrow(RangeError);
  });
});

describe('the colour bands are drawn on physical boundaries', () => {
  it('puts the band edges at r = 4 r_s and at the horizon', () => {
    expect(flowBand(riverSpeedOverC(9))).toBe('slow');          // 0.333 c
    expect(flowBand(riverSpeedOverC(4.1))).toBe('slow');        // just under 0.5 c
    expect(flowBand(riverSpeedOverC(4))).toBe('transonic');     // exactly 0.5 c
    expect(flowBand(riverSpeedOverC(2))).toBe('transonic');     // 0.707 c
    expect(flowBand(riverSpeedOverC(HORIZON))).toBe('horizon'); // exactly c
    expect(flowBand(riverSpeedOverC(0.25))).toBe('superluminal');
  });

  it('marks a narrow ring at the horizon, not a wide band', () => {
    // The white ring must read as "the horizon", so it has to be thin either side of c.
    expect(flowBand(1.005)).toBe('horizon');
    expect(flowBand(1.02)).toBe('superluminal');
    expect(flowBand(0.98)).toBe('transonic');
  });
});

describe('advection is exact, not stepped', () => {
  it('agrees with the closed-form infall time in both directions', () => {
    for (const from of [2, 4, 25]) {
      for (const to of [0.5, 1, 1.5]) {
        if (to >= from) continue;
        const dt = infallTime(from, to);
        expect(advect(from, dt)).toBeCloseTo(to, 10);
      }
    }
  });

  it('does not drift when a long fall is taken in many small steps', () => {
    // The reason for a closed form: a 1/sqrt(r) field integrated by Euler steps accumulates
    // error fastest exactly where the flow is fastest, which is where the picture is being read.
    const total = infallTime(20, 0.1);
    const steps = 4000;
    let stepped = 20;
    for (let i = 0; i < steps; i++) stepped = advect(stepped, total / steps);
    expect(stepped).toBeCloseTo(advect(20, total), 8);
    expect(stepped).toBeCloseTo(0.1, 8);
  });

  it('crosses the horizon without stalling, which is the point of GP coordinates', () => {
    // Schwarzschild t would never get there. Nothing special happens here in this chart.
    const justOutside = 1.0001;
    const after = advect(justOutside, infallTime(justOutside, 0.5));
    expect(after).toBeCloseTo(0.5, 10);
    expect(after).toBeLessThan(HORIZON);
  });

  it('reaches the centre in finite time and clamps there instead of going negative', () => {
    expect(infallTime(1, 0)).toBeCloseTo(2 / 3, 12);
    expect(advect(1, 10)).toBe(0);
    expect(advect(1, infallTime(1, 0))).toBeCloseTo(0, 12);
  });

  it('rejects a backwards step and a non-positive radius', () => {
    expect(() => advect(0, 1)).toThrow(RangeError);
    expect(() => advect(1, -1)).toThrow(RangeError);
    expect(() => infallTime(1, 2)).toThrow(RangeError);
  });
});
