import { describe, expect, it } from 'vitest';
import { frameBounds, pixelToSim, simPerPixel, simToPixel } from './canvasMapping';

const WIDE = { width: 1200, height: 600, extent: 10 };
const TALL = { width: 400, height: 900, extent: 10 };
const SQUARE = { width: 700, height: 700, extent: 6 };

describe('the pixel ↔ sim mapping', () => {
  it('round-trips through both directions, on every aspect', () => {
    for (const frame of [WIDE, TALL, SQUARE]) {
      const points: [number, number][] =
        [[0, 0], [frame.width, frame.height], [123, 456], [700, 51]];
      for (const [px, py] of points) {
        const sim = pixelToSim(px, py, frame);
        const back = simToPixel(sim.x, sim.y, frame);
        expect(back.x).toBeCloseTo(px, 9);
        expect(back.y).toBeCloseTo(py, 9);
      }
    }
  });

  it('puts the canvas centre at the origin', () => {
    for (const frame of [WIDE, TALL, SQUARE]) {
      const sim = pixelToSim(frame.width / 2, frame.height / 2, frame);
      expect(sim.x).toBeCloseTo(0, 12);
      expect(sim.y).toBeCloseTo(0, 12);
    }
  });

  it('has y grow upward in sim units while the pixel grows downward', () => {
    // The one sign in the whole module. Inverted, every placement lands mirrored about the
    // horizontal axis and every orbit appears to run the wrong way.
    const top = pixelToSim(600, 0, WIDE);
    const bottom = pixelToSim(600, WIDE.height, WIDE);
    expect(top.y).toBeGreaterThan(bottom.y);
    expect(top.y).toBeCloseTo(WIDE.extent, 9);
    expect(bottom.y).toBeCloseTo(-WIDE.extent, 9);
  });

  it('keeps the shorter axis at the requested extent and widens the longer one', () => {
    const wide = frameBounds(WIDE);
    expect(wide.maxY).toBeCloseTo(10, 9);
    expect(wide.maxX).toBeCloseTo(20, 9);
    const tall = frameBounds(TALL);
    expect(tall.maxX).toBeCloseTo(10, 9);
    expect(tall.maxY).toBeCloseTo(22.5, 9);
  });

  it('gives a pixel size that scales with the extent, not with the canvas', () => {
    expect(simPerPixel(SQUARE)).toBeCloseTo((6 * 2) / 700, 12);
    expect(simPerPixel({ ...SQUARE, extent: 12 })).toBeCloseTo(2 * simPerPixel(SQUARE), 12);
  });

  it('does not stretch: one sim unit is the same number of pixels both ways', () => {
    for (const frame of [WIDE, TALL, SQUARE]) {
      const origin = simToPixel(0, 0, frame);
      const alongX = simToPixel(1, 0, frame);
      const alongY = simToPixel(0, 1, frame);
      expect(Math.abs(alongX.x - origin.x)).toBeCloseTo(Math.abs(alongY.y - origin.y), 9);
    }
  });
});
