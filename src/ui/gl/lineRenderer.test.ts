import { describe, expect, it } from 'vitest';
import {
  FULL_VIEWPORT,
  circleVertices,
  dashedCircleVertices,
  discVertices,
  squareBounds,
  squeezeForPanel,
} from './LineRenderer';

/** Merged from the per-sim copies this module replaces (isco-explorer and mercury-precession
 * each had a `view/geometry.test.ts` over its own duplicate of these functions). */

const HALF = { x: 0.55, y: 0.08, width: 0.4, height: 0.86 };
const radiusAt = (data: Float32Array, vertex: number): number =>
  Math.hypot(data[vertex * 3]!, data[vertex * 3 + 1]!);

describe('framing a panel', () => {
  it('accounts for the viewport’s share of the canvas, not just the canvas aspect', () => {
    // A 1600x800 canvas is 2:1, but the orbit occupies a 0.4 x 0.86 slice of it, which is
    // 640x688 — taller than wide. Using the canvas aspect would stretch the orbit horizontally
    // by a factor of two, and a stretched circle reads as an eccentric orbit.
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

  it('stays centred on the origin, which is where the mass is', () => {
    const bounds = squareBounds(7, 1000, 700, HALF);
    expect(bounds.minX).toBeCloseTo(-bounds.maxX, 12);
    expect(bounds.minY).toBeCloseTo(-bounds.maxY, 12);
  });

  it('refuses a degenerate canvas or viewport rather than dividing by zero', () => {
    expect(() => squareBounds(1, 0, 100, HALF)).toThrow(RangeError);
    expect(() => squareBounds(0, 100, 100, HALF)).toThrow(RangeError);
    expect(() => squareBounds(1, 100, 100, { ...HALF, height: 0 })).toThrow(RangeError);
  });
});

describe('framing the whole canvas', () => {
  it('keeps a circle round on a wide canvas by widening x, never by cropping y', () => {
    const bounds = squareBounds(1.5, 1600, 800, FULL_VIEWPORT);
    expect(bounds.maxY).toBeCloseTo(1.5, 12);
    expect(bounds.maxX).toBeCloseTo(3, 12);
    expect((bounds.maxX - bounds.minX) / (bounds.maxY - bounds.minY)).toBeCloseTo(2, 12);
  });

  it('keeps it round on a tall canvas too', () => {
    const bounds = squareBounds(1.5, 600, 900, FULL_VIEWPORT);
    expect(bounds.maxX).toBeCloseTo(1.5, 12);
    expect(bounds.maxY).toBeCloseTo(2.25, 12);
  });

  it('is the default, so a single-panel sim need not name a viewport', () => {
    expect(squareBounds(3, 1000, 700)).toEqual(squareBounds(3, 1000, 700, FULL_VIEWPORT));
  });
});

describe('circles and discs', () => {
  it('put every vertex on the radius', () => {
    const circle = circleVertices(6, 24);
    for (let i = 0; i < 24; i++) expect(radiusAt(circle, i)).toBeCloseTo(6, 6);
  });

  it('does not repeat the seam on a line loop', () => {
    expect(circleVertices(0.75, 16).length / 3).toBe(16);
  });

  it('starts the disc at the centre so a triangle fan closes', () => {
    const disc = discVertices(2, 24);
    expect(radiusAt(disc, 0)).toBe(0);
    for (let i = 1; i < disc.length / 3; i++) expect(radiusAt(disc, i)).toBeCloseTo(2, 6);
    // The last rim vertex coincides with the first, which is what closes the fan.
    expect(disc[3]).toBeCloseTo(disc[disc.length - 3]!, 6);
    expect(disc[4]).toBeCloseTo(disc[disc.length - 2]!, 6);
  });

  it('refuses a two-sided circle', () => {
    expect(() => circleVertices(1, 2)).toThrow(RangeError);
    expect(() => discVertices(1, 2)).toThrow(RangeError);
  });
});

describe('the dashed circle', () => {
  it('draws half the segments, as separate line pairs', () => {
    const data = dashedCircleVertices(2, 40);
    expect(data.length / 3).toBe(40);
    for (let i = 0; i < 40; i++) expect(radiusAt(data, i)).toBeCloseTo(2, 6);
  });

  it('leaves a gap between one dash and the next', () => {
    // Vertex 1 ends the first dash; vertex 2 begins the second. They must not coincide, or the
    // "dashed" boundary is drawn as solid — and the distinction carries meaning: a dashed
    // boundary is one nothing stops at.
    const data = dashedCircleVertices(1, 8);
    const gap = Math.hypot(data[6]! - data[3]!, data[7]! - data[4]!);
    expect(gap).toBeGreaterThan(0.1);
  });

  it('refuses too few segments to dash at all', () => {
    expect(() => dashedCircleVertices(1, 3)).toThrow(RangeError);
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
