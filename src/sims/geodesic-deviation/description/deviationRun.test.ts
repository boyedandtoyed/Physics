import { describe, expect, it } from 'vitest';
import {
  FLOOR_RADIUS,
  INITIAL_SEPARATION,
  advance,
  dashedVertical,
  ellipseArea,
  ellipseVertices,
  enclosedVolume,
  fallDuration,
  figuresAt,
  initialState,
  particleVertices,
  ringVertices,
  solidVertical,
  spaghetti,
  strain,
  wronskianDrift,
} from './deviationRun';
import { SOLAR_MASS } from '../../../core/units';

/** Run the whole fall in `steps` pieces, as the sim does frame by frame. */
const run = (startRadius: number, steps = 20000) => {
  const step = fallDuration(startRadius) / steps;
  return advance(initialState(startRadius), steps, step, startRadius);
};

describe('the ellipse under the fall', () => {
  it('starts as a circle of a twentieth of a Schwarzschild radius', () => {
    const state = initialState(8);
    expect(state.radial).toBe(INITIAL_SEPARATION);
    expect(state.transverse).toBe(INITIAL_SEPARATION);
    expect(INITIAL_SEPARATION).toBe(0.05);
    expect(strain(state)).toEqual({ radial: 1, transverse: 1 });
  });

  it('STRETCHES radially and SQUEEZES transversally — spaghettification', () => {
    // The sign of the Jacobi equation, seen as a shape. The brief for this sim had the two
    // swapped, which would draw a body squashed lengthwise and splayed sideways.
    const state = run(8);
    expect(state.radial).toBeGreaterThan(INITIAL_SEPARATION * 1.5);
    expect(state.transverse).toBeLessThan(INITIAL_SEPARATION * 0.8);
    const ratio = strain(state);
    expect(ratio.radial).toBeGreaterThan(1);
    expect(ratio.transverse).toBeLessThan(1);
  });

  it('does that monotonically, once released from rest', () => {
    let state = initialState(8);
    const step = fallDuration(8) / 4000;
    let previousRadial = state.radial;
    let previousTransverse = state.transverse;
    for (let i = 0; i < 40; i++) {
      state = advance(state, 100, step, 8);
      expect(state.radial).toBeGreaterThanOrEqual(previousRadial);
      expect(state.transverse).toBeLessThanOrEqual(previousTransverse);
      previousRadial = state.radial;
      previousTransverse = state.transverse;
    }
  });

  it('conserves the Wronskian, which is the exact invariant here', () => {
    expect(wronskianDrift(run(8))).toBeLessThan(1e-10);
    expect(wronskianDrift(run(12))).toBeLessThan(1e-10);
  });

  it('does NOT conserve the ellipse’s area — it grows', () => {
    // The natural thing to assume, and false. (ln A)″ starts at +M/r³, not zero.
    const before = ellipseArea(initialState(8));
    const after = ellipseArea(run(8));
    expect(after).toBeGreaterThan(before * 1.2);
  });

  it('focuses the 3-volume, as Raychaudhuri requires', () => {
    // What the trace-free condition actually buys: the volume is stationary at release and
    // decreasing thereafter, because the shear terms are strictly negative.
    const before = enclosedVolume(initialState(8));
    const after = enclosedVolume(run(8));
    expect(after).toBeLessThan(before);
  });

  it('stops at half a Schwarzschild radius rather than at the singularity', () => {
    // E goes as 1/r³ and no fixed step resolves it near r = 0; §7.6.
    const state = run(8);
    expect(state.finished).toBe(true);
    expect(state.radius).toBeCloseTo(FLOOR_RADIUS, 6);
    expect(state.properTime).toBeCloseTo(fallDuration(8), 6);
  });

  it('takes longer to fall from further out', () => {
    expect(fallDuration(12)).toBeGreaterThan(fallDuration(8));
    expect(fallDuration(4)).toBeGreaterThan(0);
  });

  it('distorts harder from closer in, where the tidal field is stronger', () => {
    // Same fall, deeper start: less proper time but a far larger field for most of it.
    expect(strain(run(4)).radial).toBeGreaterThan(1);
    expect(strain(run(4)).transverse).toBeLessThan(1);
  });
});

describe('the tidal readouts', () => {
  it('reports a negative radial and positive transverse eigenvalue', () => {
    const figures = figuresAt(4);
    expect(figures.radial).toBeLessThan(0);
    expect(figures.transverse).toBeGreaterThan(0);
    // r_s = 1 so M = 1/2: E_rr = -2(0.5)/64 = -1/64.
    expect(figures.radial).toBeCloseTo(-1 / 64, 15);
    expect(figures.transverse).toBeCloseTo(1 / 128, 15);
  });

  it('is trace-free everywhere the sim can reach', () => {
    for (const radius of [FLOOR_RADIUS, 1, 2, 8, 20]) {
      expect(Math.abs(figuresAt(radius).residual), `r = ${radius}`).toBeLessThan(1e-14);
    }
  });

  it('grows as 1/r³ towards the centre, and is finite at the horizon', () => {
    expect(figuresAt(1).strength / figuresAt(2).strength).toBeCloseTo(8, 12);
    expect(Number.isFinite(figuresAt(1).strength)).toBe(true);
  });
});

describe('the spaghettification ring', () => {
  it('sits outside the horizon for a stellar-mass hole', () => {
    const stellar = spaghetti(10, 1);
    expect(stellar.outsideHorizon).toBe(true);
    expect(stellar.inHorizons).toBeCloseTo(10.02, 1);
    expect(stellar.metres / 1e3).toBeCloseTo(295.8, 0);
  });

  it('sits inside the horizon for a supermassive one', () => {
    const supermassive = spaghetti(1e6, 1);
    expect(supermassive.outsideHorizon).toBe(false);
    expect(supermassive.inHorizons).toBeLessThan(0.01);
  });

  it('moves outward with a longer body, as L^{2/3}', () => {
    const short = spaghetti(10, 1);
    const long = spaghetti(10, 4);
    expect(long.metres / short.metres).toBeCloseTo(Math.cbrt(16), 9);
    expect(long.inHorizons).toBeGreaterThan(short.inHorizons);
  });

  it('crosses the horizon between 100 and 1000 solar masses for a one-metre body', () => {
    expect(spaghetti(100, 1).outsideHorizon).toBe(true);
    expect(spaghetti(1000, 1).outsideHorizon).toBe(false);
  });

  it('quotes a horizon that matches 2GM/c²', () => {
    expect(spaghetti(1, 1).horizonMetres / 1e3).toBeCloseTo(2.953, 3);
    expect(spaghetti(1, 1).horizonMetres).toBeCloseTo(
      (2 * 6.674_30e-11 * SOLAR_MASS) / 299_792_458 ** 2, 6,
    );
  });
});

describe('the drawn geometry', () => {
  it('lays the ellipse out long in the direction of the fall', () => {
    const state = run(8);
    const data = ellipseVertices(state, 0, 0, 64);
    let maxX = 0;
    let maxY = 0;
    for (let i = 0; i < data.length; i += 3) {
      maxX = Math.max(maxX, Math.abs(data[i]!));
      maxY = Math.max(maxY, Math.abs(data[i + 1]!));
    }
    // x is the radial axis, and it is the long one by the end.
    expect(maxX).toBeGreaterThan(maxY);
    expect(maxX).toBeCloseTo(state.radial, 5);
    expect(maxY).toBeCloseTo(state.transverse, 5);
  });

  it('puts the particles on the ellipse', () => {
    const state = initialState(8);
    const data = particleVertices(state, 0.5, -0.25, 12);
    expect(data.length / 3).toBe(12);
    for (let i = 0; i < data.length; i += 3) {
      const x = (data[i]! - 0.5) / state.radial;
      const y = (data[i + 1]! + 0.25) / state.transverse;
      expect(x * x + y * y).toBeCloseTo(1, 5);
    }
  });

  it('draws a dashed line as separated segments and a solid one as one', () => {
    const dashed = dashedVertical(0, -1, 1, 8);
    expect(dashed.length / 3).toBe(16);
    // Every vertex shares the x of the line.
    for (let i = 0; i < dashed.length; i += 3) expect(dashed[i]).toBe(0);
    // There is a gap between one dash's end and the next dash's start.
    expect(dashed[4]!).toBeLessThan(dashed[7]!);
    expect(solidVertical(2, -1, 1).length / 3).toBe(2);
  });

  it('draws a ring of the requested radius', () => {
    const data = ringVertices(0, 0, 2.5, 48);
    for (let i = 0; i < data.length; i += 3) {
      expect(Math.hypot(data[i]!, data[i + 1]!)).toBeCloseTo(2.5, 5);
    }
  });
});
