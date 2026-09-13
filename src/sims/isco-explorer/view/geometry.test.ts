import { describe, expect, it } from 'vitest';
import {
  circleVertices,
  discVertices,
  squareBounds,
  squeezeForPanel,
} from './IscoRenderer';

const HALF = { x: 0.55, y: 0.08, width: 0.4, height: 0.86 };

describe('the orbit panel’s framing', () => {
  it('accounts for the viewport’s share of the canvas, not just the canvas aspect', () => {
    // A 1600x800 canvas is 2:1, but the orbit occupies a 0.4 x 0.86 slice of it, which is
    // 640x688 — taller than wide. Using the canvas aspect would stretch the orbit horizontally
    // by a factor of two, and in this sim a stretched circle reads as an eccentric orbit.
    const bounds = squareBounds(10, 1600, 800, HALF);
    const width = bounds.maxX - bounds.minX;
    const height = bounds.maxY - bounds.minY;
    expect(width / height).toBeCloseTo((1600 * 0.4) / (800 * 0.86), 12);
    expect(width / height).toBeLessThan(1);
  });

  it('always contains the requested extent in both directions', () => {
    for (const [w, h] of [[1600, 800], [800, 1200], [400, 400]] as const) {
      const bounds = squareBounds(10, w, h, HALF);
      expect(bounds.maxX).toBeGreaterThanOrEqual(10);
      expect(bounds.maxY).toBeGreaterThanOrEqual(10);
    }
  });

  it('stays centred on the black hole', () => {
    const bounds = squareBounds(7, 1000, 700, HALF);
    expect(bounds.minX).toBeCloseTo(-bounds.maxX, 12);
    expect(bounds.minY).toBeCloseTo(-bounds.maxY, 12);
  });

  it('refuses a degenerate canvas or viewport', () => {
    expect(() => squareBounds(1, 0, 100, HALF)).toThrow(RangeError);
    expect(() => squareBounds(0, 100, 100, HALF)).toThrow(RangeError);
    expect(() => squareBounds(1, 100, 100, { ...HALF, height: 0 })).toThrow(RangeError);
  });
});

describe('circles', () => {
  it('put every vertex on the radius', () => {
    for (const data of [circleVertices(6, 24), discVertices(2, 24)]) {
      for (let i = 3; i < data.length; i += 3) {
        expect(Math.hypot(data[i]!, data[i + 1]!)).toBeGreaterThan(0);
      }
    }
    const circle = circleVertices(6, 24);
    for (let i = 0; i < circle.length; i += 3) {
      expect(Math.hypot(circle[i]!, circle[i + 1]!)).toBeCloseTo(6, 6);
    }
  });

  it('start the disc at the centre so a triangle fan closes', () => {
    const disc = discVertices(2, 24);
    expect(disc[0]).toBe(0);
    expect(disc[1]).toBe(0);
    expect(Math.hypot(disc[3]!, disc[4]!)).toBeCloseTo(2, 6);
    expect(disc[3]).toBeCloseTo(disc[disc.length - 3]!, 6);
  });

  it('refuse a two-sided circle', () => {
    expect(() => circleVertices(1, 2)).toThrow(RangeError);
    expect(() => discVertices(1, 2)).toThrow(RangeError);
  });
});

describe('making room for the expanded view’s floating panel', () => {
  it('leaves the layout alone when the panel is not floating', () => {
    const view = { x: 0.56, y: 0.09, width: 0.4, height: 0.84 };
    expect(squeezeForPanel(view, 1280, 0)).toEqual(view);
  });

  it('pulls the right-hand viewport clear of the panel', () => {
    // The orbit lives at x 0.56–0.96. A 21rem panel on a 1280px canvas covers from 0.74, so
    // the orbit was drawn underneath it and could not be seen at all.
    const view = { x: 0.56, y: 0.09, width: 0.4, height: 0.84 };
    const squeezed = squeezeForPanel(view, 1280, 21 * 16);
    const panelLeft = 1 - (21 * 16) / 1280;
    expect(squeezed.x + squeezed.width).toBeLessThan(panelLeft);
    expect(squeezed.x).toBeLessThan(view.x);
    expect(squeezed.height).toBe(view.height);
  });

  it('keeps the two viewports in the same proportion and order', () => {
    const potential = squeezeForPanel({ x: 0.05, y: 0.09, width: 0.44, height: 0.84 }, 1280, 336);
    const orbit = squeezeForPanel({ x: 0.56, y: 0.09, width: 0.4, height: 0.84 }, 1280, 336);
    expect(potential.x + potential.width).toBeLessThan(orbit.x);
    expect(potential.width / orbit.width).toBeCloseTo(0.44 / 0.4, 12);
  });

  it('never squeezes the canvas away entirely on a narrow window', () => {
    const orbit = squeezeForPanel({ x: 0.56, y: 0.09, width: 0.4, height: 0.84 }, 320, 134);
    expect(orbit.width).toBeGreaterThan(0.1);
    expect(orbit.x).toBeGreaterThan(0);
  });
});
