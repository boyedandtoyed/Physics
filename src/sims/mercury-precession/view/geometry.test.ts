import { describe, expect, it } from 'vitest';
import { circleVertices, discVertices, framedBounds } from './PrecessionRenderer';

const radiusAt = (data: Float32Array, vertex: number): number =>
  Math.hypot(data[vertex * 3]!, data[vertex * 3 + 1]!);

describe('framing', () => {
  it('keeps the orbit round on a wide canvas by widening x, never by cropping y', () => {
    // A viewport that stretched instead would show an apparent eccentricity indistinguishable
    // from the real one, which is the single thing this sim is measuring.
    const bounds = framedBounds(1.5, 1600, 800);
    expect(bounds.maxY).toBeCloseTo(1.5, 12);
    expect(bounds.maxX).toBeCloseTo(3, 12);
    expect((bounds.maxX - bounds.minX) / (bounds.maxY - bounds.minY)).toBeCloseTo(2, 12);
  });

  it('keeps it round on a tall canvas too', () => {
    const bounds = framedBounds(1.5, 600, 900);
    expect(bounds.maxX).toBeCloseTo(1.5, 12);
    expect(bounds.maxY).toBeCloseTo(2.25, 12);
  });

  it('stays centred on the focus, which is where the mass is', () => {
    const bounds = framedBounds(2, 1000, 700);
    expect(bounds.minX).toBeCloseTo(-bounds.maxX, 12);
    expect(bounds.minY).toBeCloseTo(-bounds.maxY, 12);
  });

  it('refuses a degenerate canvas rather than dividing by zero', () => {
    expect(() => framedBounds(1, 0, 100)).toThrow(RangeError);
    expect(() => framedBounds(0, 100, 100)).toThrow(RangeError);
  });
});

describe('the horizon disc', () => {
  it('starts at the centre and puts every rim vertex at the horizon radius', () => {
    const data = discVertices(0.1, 32);
    expect(radiusAt(data, 0)).toBe(0);
    for (let i = 1; i < data.length / 3; i++) expect(radiusAt(data, i)).toBeCloseTo(0.1, 6);
  });

  it('closes: the last rim vertex coincides with the first', () => {
    const data = discVertices(0.4, 24);
    const last = data.length / 3 - 1;
    expect(data[3]!).toBeCloseTo(data[last * 3]!, 6);
    expect(data[4]!).toBeCloseTo(data[last * 3 + 1]!, 6);
  });
});

describe('the circle', () => {
  it('has every vertex at the radius and does not repeat the seam', () => {
    const data = circleVertices(0.75, 16);
    expect(data.length / 3).toBe(16);
    for (let i = 0; i < 16; i++) expect(radiusAt(data, i)).toBeCloseTo(0.75, 6);
  });

  it('refuses a two-sided circle', () => {
    expect(() => circleVertices(1, 2)).toThrow(RangeError);
  });
});

