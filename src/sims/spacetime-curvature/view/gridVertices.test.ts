import { describe, expect, it } from 'vitest';
import { DEFAULT_GRID_PARAMS, buildGridVertices } from './GridRenderer';
import { embeddingHeight } from '../../../core/embedding';

const FLOATS = 4;

/** Every vertex, as {x, y, z, r}. */
const vertices = (params = DEFAULT_GRID_PARAMS) => {
  const data = buildGridVertices(params);
  const out: { x: number; y: number; z: number; r: number }[] = [];
  for (let i = 0; i < data.length; i += FLOATS) {
    out.push({ x: data[i]!, y: data[i + 1]!, z: data[i + 2]!, r: data[i + 3]! });
  }
  return out;
};

describe('the grid mesh sits on the exact embedding', () => {
  it('places every vertex at z = 2 sqrt(r_s(r - r_s))', () => {
    // The whole claim of the view. If this holds, the wireframe is the Flamm paraboloid and not
    // a sculpted funnel that merely looks like one.
    for (const v of vertices()) {
      expect(v.y).toBeCloseTo(embeddingHeight(v.r), 4);
    }
  });

  it('stands the funnel the right way up: the throat is the low point', () => {
    // z(r) grows with r, so the throat sits at the bottom and the surface rises and flattens
    // outwards. Negating the height renders a plausible picture upside down, which is exactly
    // the sort of thing a screenshot check catches and a green suite does not — so it is pinned.
    const all = vertices();
    const inner = all.reduce((a, b) => (a.r < b.r ? a : b));
    const outer = all.reduce((a, b) => (a.r > b.r ? a : b));
    expect(inner.y).toBeLessThan(outer.y);
    expect(inner.y).toBeCloseTo(0, 9);
    for (const v of all) expect(v.y).toBeGreaterThanOrEqual(0);
  });

  it('puts every vertex at its own cylindrical radius', () => {
    for (const v of vertices()) {
      expect(Math.hypot(v.x, v.z)).toBeCloseTo(v.r, 4);
    }
  });

  it('never reaches inside the horizon, and touches it exactly at the throat', () => {
    const all = vertices();
    for (const v of all) expect(v.r).toBeGreaterThanOrEqual(1);
    const innermost = Math.min(...all.map(v => v.r));
    expect(innermost).toBeCloseTo(1, 9);
    // The throat is the one place the surface meets z = 0.
    const throat = all.filter(v => Math.abs(v.r - 1) < 1e-9);
    for (const v of throat) expect(v.y).toBeCloseTo(0, 9);
  });

  it('spans out to the requested outer radius and no further', () => {
    const all = vertices({ ...DEFAULT_GRID_PARAMS, outerRadius: 20 });
    expect(Math.max(...all.map(v => v.r))).toBeCloseTo(20, 6);
  });

  it('scales the drawn depth without moving the geometry it reports', () => {
    // depthScale is an exaggeration for viewing. It must scale z and leave r alone, so the
    // radius the fragment stage marks the horizon by stays honest.
    const plain = vertices();
    const exaggerated = vertices({ ...DEFAULT_GRID_PARAMS, depthScale: 3 });
    expect(exaggerated).toHaveLength(plain.length);
    for (let i = 0; i < plain.length; i += 97) {
      expect(exaggerated[i]!.r).toBeCloseTo(plain[i]!.r, 6);
      expect(exaggerated[i]!.y).toBeCloseTo(plain[i]!.y * 3, 4);
    }
  });

  it('spaces rings so they do not all bunch at the throat', () => {
    // The surface is nearly vertical near r_s; linear spacing in r would pile most rings there
    // and leave the outer surface bare.
    const radii = [...new Set(vertices().map(v => Number(v.r.toFixed(6))))].sort((a, b) => a - b);
    const gaps = radii.slice(1).map((r, i) => r - radii[i]!);
    // Gaps grow outwards, which is what quadratic spacing in r buys.
    expect(gaps[gaps.length - 1]!).toBeGreaterThan(gaps[0]!);
  });

  it('refuses a degenerate mesh', () => {
    expect(() => buildGridVertices({ ...DEFAULT_GRID_PARAMS, outerRadius: 1 })).toThrow(RangeError);
    expect(() => buildGridVertices({ ...DEFAULT_GRID_PARAMS, rings: 1 })).toThrow(RangeError);
    expect(() => buildGridVertices({ ...DEFAULT_GRID_PARAMS, spokes: 2 })).toThrow(RangeError);
  });
});
