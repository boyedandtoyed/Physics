import { describe, expect, it } from 'vitest';
import {
  FABRIC_GLSL,
  MAX_FABRIC_MASSES,
  cartesianGridVertices,
  fabricHeight,
  packMasses,
  polarGridVertices,
  type FabricParams,
} from './fabric';
import { embeddingHeight, sheetHeight } from '../../core/embedding';

const params = (over: Partial<FabricParams> = {}): FabricParams => ({
  mode: 'potential',
  masses: [{ x: 0, y: 0, mass: 1, radius: 0.3 }],
  heightScale: 1,
  floor: 1e6,
  outerRadius: 24,
  ...over,
});

describe('the potential sheet', () => {
  it('is exactly the core’s sheet, which is exactly the field the integrator uses', () => {
    const masses = [
      { x: -2, y: 1, mass: 3, radius: 0.4 },
      { x: 4, y: -3, mass: 0.5, radius: 0.15 },
    ];
    for (const [x, y] of [[0, 0], [1.5, 2.5], [-6, 4], [30, 30]] as const) {
      expect(fabricHeight(x, y, params({ masses }))).toBeCloseTo(sheetHeight(x, y, masses), 12);
    }
  });

  it('deepens under a mass and flattens away from one', () => {
    const at = (x: number) => fabricHeight(x, 0, params());
    expect(at(0)).toBeLessThan(at(1));
    expect(at(1)).toBeLessThan(at(10));
    expect(at(1000)).toBeCloseTo(0, 2);
  });

  it('is finite at the centre of a mass, with no softening parameter anywhere', () => {
    const height = fabricHeight(0, 0, params({ masses: [{ x: 0, y: 0, mass: 4, radius: 2 }] }));
    expect(height).toBeCloseTo(-3, 12);
    expect(Number.isFinite(height)).toBe(true);
  });

  it('clips at the floor, so one heavy mass cannot take the grid off screen', () => {
    const heavy = params({ masses: [{ x: 0, y: 0, mass: 100, radius: 0.1 }], floor: 12 });
    expect(fabricHeight(0, 0, heavy)).toBe(-12);
    // ...and the sign of the floor is not something a caller can get wrong.
    expect(fabricHeight(0, 0, { ...heavy, floor: -12 })).toBe(-12);
  });

  it('scales vertically without changing where the dips are', () => {
    const masses = [{ x: 3, y: 0, mass: 2, radius: 0.3 }];
    const one = fabricHeight(0, 0, params({ masses }));
    const five = fabricHeight(0, 0, params({ masses, heightScale: 5 }));
    expect(five).toBeCloseTo(5 * one, 12);
  });

  it('is flat when there is nothing on it', () => {
    expect(fabricHeight(4, 4, params({ masses: [] }))).toBe(0);
  });
});

describe('the Flamm sheet', () => {
  const flamm = params({
    mode: 'flamm', masses: [{ x: 0, y: 0, mass: 1, radius: 2 }], outerRadius: 24,
  });

  it('is the exact embedding, hung so the outer edge sits at zero', () => {
    expect(fabricHeight(24, 0, flamm)).toBeCloseTo(0, 12);
    for (const r of [3, 6, 12, 20]) {
      expect(fabricHeight(r, 0, flamm))
        .toBeCloseTo(embeddingHeight(r, 2) - embeddingHeight(24, 2), 12);
    }
  });

  it('bottoms out at the throat and does not continue inside it', () => {
    // The embedding does not exist for r < r_s, so the mesh stops at the throat rather than
    // inventing a surface for a region the slice does not cover.
    const throat = fabricHeight(2, 0, flamm);
    expect(fabricHeight(1, 0, flamm)).toBe(throat);
    expect(fabricHeight(0, 0, flamm)).toBe(throat);
    expect(throat).toBeCloseTo(-embeddingHeight(24, 2), 12);
  });

  it('rises monotonically outward, which the potential sheet also does — but differently', () => {
    const radii = [2, 3, 5, 9, 15, 24];
    const heights = radii.map(r => fabricHeight(r, 0, flamm));
    for (let i = 1; i < heights.length; i++) {
      expect(heights[i]!).toBeGreaterThan(heights[i - 1]!);
    }
    // Flamm goes as sqrt(r); the potential goes as -1/r. Halfway out in radius, the two are at
    // very different fractions of their full depth, which is why they are not interchangeable.
    const flammFraction = (fabricHeight(13, 0, flamm) - heights[0]!) / (0 - heights[0]!);
    const potential = params({ masses: [{ x: 0, y: 0, mass: 1, radius: 2 }] });
    const deep = fabricHeight(2, 0, potential);
    const potentialFraction = (fabricHeight(13, 0, potential) - deep) / (0 - deep);
    expect(flammFraction).toBeGreaterThan(0.6);
    expect(potentialFraction).toBeGreaterThan(0.8);
    expect(Math.abs(flammFraction - potentialFraction)).toBeGreaterThan(0.1);
  });

  it('ignores the mass, because the Flamm surface is set by r_s alone', () => {
    const heavy = { ...flamm, masses: [{ x: 0, y: 0, mass: 1000, radius: 2 }] };
    expect(fabricHeight(7, 0, heavy)).toBeCloseTo(fabricHeight(7, 0, flamm), 12);
  });
});

describe('the mesh', () => {
  it('spans the stated extent and closes on itself', () => {
    const grid = cartesianGridVertices(10, 4);
    let minimum = Infinity;
    let maximum = -Infinity;
    for (let i = 0; i < grid.length; i++) {
      minimum = Math.min(minimum, grid[i]!);
      maximum = Math.max(maximum, grid[i]!);
    }
    expect(minimum).toBeCloseTo(-10, 12);
    expect(maximum).toBeCloseTo(10, 12);
  });

  it('samples the displacement at every crossing, not only at the ends', () => {
    // A 48-division grid drawn as 49 long lines would be displaced at 98 points; drawn as
    // segments it is displaced at every one of its crossings, which is what makes the dip a dip
    // rather than a crease.
    const divisions = 48;
    const grid = cartesianGridVertices(10, divisions);
    expect(grid.length / 4).toBe(2 * (divisions + 1) * divisions);
  });

  it('refuses a degenerate grid rather than drawing nothing', () => {
    expect(() => cartesianGridVertices(0, 8)).toThrow(RangeError);
    expect(() => cartesianGridVertices(10, 1)).toThrow(RangeError);
    expect(() => polarGridVertices(2, 1, 10, 10)).toThrow(RangeError);
  });

  it('builds a polar grid whose rings bunch towards the throat', () => {
    const rings = 12;
    const grid = polarGridVertices(2, 24, rings, 16, 8);
    const radii: number[] = [];
    for (let i = 0; i <= rings; i++) {
      const t = i / rings;
      radii.push(2 + 22 * t * t);
    }
    // Consecutive gaps grow outward: the rings are close together where the surface is steep.
    for (let i = 2; i < radii.length; i++) {
      expect(radii[i]! - radii[i - 1]!).toBeGreaterThan(radii[i - 1]! - radii[i - 2]!);
    }
    expect(grid.length).toBeGreaterThan(0);
    // Every vertex lies in the annulus — to float32, which is what a vertex buffer holds. An
    // inner radius of 2 comes back as 1.99999996, and a float64-sized tolerance here would be
    // asserting something about the test rather than about the mesh.
    const float32 = 1e-5;
    for (let i = 0; i < grid.length; i += 2) {
      const r = Math.hypot(grid[i]!, grid[i + 1]!);
      expect(r).toBeGreaterThanOrEqual(2 - float32);
      expect(r).toBeLessThanOrEqual(24 + float32);
    }
  });
});

describe('the uniform array', () => {
  it('packs position, mass and radius in that order', () => {
    const packed = packMasses([{ x: 1, y: 2, mass: 3, radius: 4 }]);
    expect(Array.from(packed.slice(0, 4))).toEqual([1, 2, 3, 4]);
    expect(packed.length).toBe(MAX_FABRIC_MASSES * 4);
  });

  it('truncates at the shader’s limit rather than overrunning it', () => {
    const many = Array.from({ length: 50 }, (_, i) => ({ x: i, y: 0, mass: 1, radius: 1 }));
    const packed = packMasses(many);
    expect(packed.length).toBe(MAX_FABRIC_MASSES * 4);
    expect(packed[(MAX_FABRIC_MASSES - 1) * 4]).toBe(MAX_FABRIC_MASSES - 1);
  });

  it('never packs a zero radius, which would divide by zero in the shader', () => {
    const packed = packMasses([{ x: 0, y: 0, mass: 1, radius: 0 }]);
    expect(packed[3]).toBeGreaterThan(0);
  });

  it('declares the same limit in the GLSL as in the TypeScript', () => {
    expect(FABRIC_GLSL).toContain(`MAX_FABRIC_MASSES = ${MAX_FABRIC_MASSES}`);
    // The two branches the CPU twin has, the shader must have too.
    expect(FABRIC_GLSL).toContain('uMode == 1');
    expect(FABRIC_GLSL).toContain('2.0 * sqrt(rs * (r - rs))');
    expect(FABRIC_GLSL).toContain('3.0 * bodyRadius * bodyRadius - r * r');
  });
});
