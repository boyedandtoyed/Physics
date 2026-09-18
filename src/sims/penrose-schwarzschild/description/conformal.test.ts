import { describe, expect, it } from 'vitest';
import {
  BOUNDARIES,
  CORNERS,
  INFINITY_ACROSS,
  REGION_SHAPES,
  SINGULARITY_UP,
  extentFor,
  futureConeVertices,
  futureRayEnd,
  futureRegions,
  infallWorldline,
  jaggedVertices,
  polygonVertices,
  readConformal,
  regionAt,
  staticWorldline,
  trackVertices,
} from './conformal';
import { penroseAt } from '../../../core/kruskal';

describe('the shape of the diagram', () => {
  it('cuts the diamond off at the two singularities', () => {
    expect(SINGULARITY_UP).toBe(0.5);
    expect(INFINITY_ACROSS).toBe(1);
    // Every vertex of every region is inside the diamond and no higher than the singularity.
    for (const shape of REGION_SHAPES) {
      for (const [across, up] of shape.polygon) {
        expect(Math.abs(across) + Math.abs(up)).toBeLessThanOrEqual(1 + 1e-12);
        expect(Math.abs(up)).toBeLessThanOrEqual(SINGULARITY_UP + 1e-12);
      }
    }
  });

  it('puts each region where the Kruskal diagram puts it', () => {
    // Not asserted from the polygons but from the compactification itself, at a real event.
    expect(penroseAt(2, 0, 'exterior').across).toBeGreaterThan(0);
    expect(penroseAt(2, 0, 'parallel').across).toBeLessThan(0);
    expect(penroseAt(0.5, 0, 'black-hole').up).toBeGreaterThan(0);
    expect(penroseAt(0.5, 0, 'white-hole').up).toBeLessThan(0);
  });

  it('gives the exteriors four corners and the interiors three', () => {
    const byRegion = Object.fromEntries(REGION_SHAPES.map(s => [s.region, s.polygon.length]));
    expect(byRegion.exterior).toBe(4);
    expect(byRegion.parallel).toBe(4);
    expect(byRegion['black-hole']).toBe(3);
    expect(byRegion['white-hole']).toBe(3);
  });

  it('names every boundary and every corner', () => {
    const kinds = new Set(BOUNDARIES.map(b => b.kind));
    expect(kinds).toContain('singularity');
    expect(kinds).toContain('horizon');
    expect(kinds).toContain('null-infinity');
    expect(BOUNDARIES.filter(b => b.kind === 'singularity')).toHaveLength(2);
    expect(BOUNDARIES.filter(b => b.kind === 'horizon')).toHaveLength(4);
    expect(BOUNDARIES.filter(b => b.kind === 'null-infinity')).toHaveLength(4);
    for (const b of BOUNDARIES) expect(b.note.length).toBeGreaterThan(20);
    const labels = CORNERS.map(c => c.label);
    expect(labels).toContain('i⁰');
    expect(labels).toContain('i⁺');
    expect(labels).toContain('i⁻');
  });

  it('puts i⁺ at the corner of region I, not at the top of the diagram', () => {
    // The commonest way this diagram is drawn wrong. The top of the picture is the singularity;
    // timelike infinity is where an observer who never falls in ends up, which is region I's
    // corner, and it sits at the RIGHT-HAND END of the singularity line.
    const future = CORNERS.find(c => c.label === 'i⁺')!;
    expect(future.at).toEqual([0.5, 0.5]);
    expect(future.at[1]).toBe(SINGULARITY_UP);
    expect(future.at[0]).toBeGreaterThan(0);
    const singularity = BOUNDARIES.find(b => b.label === 'r = 0, future')!;
    expect(singularity.to).toEqual([0.5, SINGULARITY_UP]);
  });

  it('runs every horizon at exactly 45 degrees through the bifurcation point', () => {
    for (const edge of BOUNDARIES.filter(b => b.kind === 'horizon')) {
      expect(edge.from).toEqual([0, 0]);
      expect(Math.abs(edge.to[0])).toBeCloseTo(Math.abs(edge.to[1]), 12);
    }
  });

  it('runs null infinity at 45 degrees too', () => {
    for (const edge of BOUNDARIES.filter(b => b.kind === 'null-infinity')) {
      const dx = edge.to[0] - edge.from[0];
      const dy = edge.to[1] - edge.from[1];
      expect(Math.abs(dy / dx)).toBeCloseTo(1, 12);
    }
  });

  it('draws the singularity jagged, never as a straight line', () => {
    const data = jaggedVertices([-0.5, 0.5], [0.5, 0.5], 24, 0.02);
    let above = 0;
    let below = 0;
    for (let i = 0; i < data.length; i += 3) {
      if (data[i + 1]! > 0.5) above++;
      if (data[i + 1]! < 0.5) below++;
    }
    expect(above).toBeGreaterThan(5);
    expect(below).toBeGreaterThan(5);
  });

  it('emits a polygon as a fan of the right length', () => {
    expect(polygonVertices(REGION_SHAPES[0]!.polygon).length).toBe(4 * 3);
  });
});

describe('worldlines', () => {
  it('runs a static observer from i⁻ to i⁺, bulging towards i⁰', () => {
    const data = staticWorldline(2, 40, 61);
    const first = { across: data[0]!, up: data[1]! };
    const last = { across: data[data.length - 3]!, up: data[data.length - 2]! };
    expect(first.up).toBeLessThan(-0.45);
    expect(last.up).toBeGreaterThan(0.45);
    expect(first.across).toBeCloseTo(0.5, 1);
    expect(last.across).toBeCloseTo(0.5, 1);
    // At t = 0 it is further right than either end: that is the bulge towards i⁰.
    const middle = Math.floor(61 / 2) * 3;
    expect(data[middle]!).toBeGreaterThan(first.across);
    expect(data[middle]!).toBeGreaterThan(0.7);
  });

  it('never lets a static observer touch a horizon, except in the limit', () => {
    // Over a range where the answer survives the vertex buffer, the worldline is strictly
    // inside region I at every sample: |across| > |up| means it has not reached a horizon.
    const near = staticWorldline(1.2, 12, 81);
    for (let i = 0; i < near.length; i += 3) {
      expect(Math.abs(near[i]!)).toBeGreaterThan(Math.abs(near[i + 1]!));
    }
    // Run it far enough and the two coordinates differ by 1e-14, which a Float32Array cannot
    // hold — so the drawn endpoints land exactly on i⁺ and i⁻. That is the correct asymptotics
    // arriving at the precision of the buffer, not the observer falling in.
    const far = staticWorldline(1.2, 60, 81);
    expect(far[0]!).toBeCloseTo(0.5, 6);
    expect(far[1]!).toBeCloseTo(-0.5, 6);
    expect(far[far.length - 3]!).toBeCloseTo(0.5, 6);
    expect(far[far.length - 2]!).toBeCloseTo(0.5, 6);
  });

  it('hugs the horizon more closely the deeper the observer stands', () => {
    const deep = staticWorldline(1.02, 40, 41);
    const high = staticWorldline(3, 40, 41);
    const middle = Math.floor(41 / 2) * 3;
    expect(deep[middle]!).toBeLessThan(high[middle]!);
  });

  it('sends an infalling observer to the singularity, NOT across ℐ⁺', () => {
    // The brief said the infalling worldline "crosses ℐ⁺ in finite conformal time". It does
    // not: null infinity is where escaping LIGHT ends up. The faller crosses the horizon and
    // reaches r = 0, which on this diagram is the flat top.
    const track = infallWorldline(3, 240);
    const last = track[track.length - 1]!;
    expect(last.radius).toBeLessThan(1e-3);
    expect(last.up).toBeCloseTo(SINGULARITY_UP, 2);
    // ℐ⁺ is across + up = 1; the worldline stays strictly inside it.
    for (const sample of track) {
      expect(sample.across + sample.up).toBeLessThan(1);
    }
  });

  it('marks exactly the part of the fall that can no longer signal ℐ⁺', () => {
    const track = infallWorldline(3, 240);
    const trapped = track.filter(sample => sample.trapped);
    expect(trapped.length).toBeGreaterThan(0);
    expect(trapped.length).toBeLessThan(track.length);
    // The trapped part is exactly the part inside the horizon, and it is the tail.
    for (const sample of trapped) expect(sample.radius).toBeLessThan(1);
    expect(track[track.length - 1]!.trapped).toBe(true);
    expect(track[0]!.trapped).toBe(false);
    expect(trackVertices(track, true).length / 3).toBe(trapped.length);
    expect(trackVertices(track, false).length / 3).toBe(track.length);
  });

  it('moves the faller upward on the diagram the whole way', () => {
    const track = infallWorldline(3, 120);
    for (let i = 1; i < track.length; i++) {
      expect(track[i]!.up).toBeGreaterThan(track[i - 1]!.up);
    }
  });
});

describe('causal structure', () => {
  it('sends a 45° ray to ℐ⁺ from outside and to the singularity from inside', () => {
    const outside = futureRayEnd(0.7, 0, true);
    expect(outside.hitsSingularity).toBe(false);
    expect(outside.across + outside.up).toBeCloseTo(1, 12);
    const inside = futureRayEnd(0, 0.2, true);
    expect(inside.hitsSingularity).toBe(true);
    expect(inside.up).toBeCloseTo(SINGULARITY_UP, 12);
  });

  it('opens the cone at exactly 45 degrees on both sides', () => {
    const data = futureConeVertices(0.55, -0.1);
    for (let i = 0; i < data.length; i += 6) {
      const dx = data[i + 3]! - data[i]!;
      const dy = data[i + 4]! - data[i + 1]!;
      // Six places: these are Float32Array vertices and hold about seven significant digits.
      expect(Math.abs(dy / dx)).toBeCloseTo(1, 6);
    }
  });

  it('knows which regions each region can influence, and the asymmetry is the point', () => {
    expect(futureRegions('exterior')).toEqual(['exterior', 'black-hole']);
    expect(futureRegions('parallel')).toEqual(['parallel', 'black-hole']);
    // Region II can reach only itself: that is what "trapped" means.
    expect(futureRegions('black-hole')).toEqual(['black-hole']);
    // The white hole can reach everywhere, which is why it is not a time-reverse curiosity.
    expect(futureRegions('white-hole')).toHaveLength(4);
    // Our exterior cannot reach the parallel one, in either direction.
    expect(futureRegions('exterior')).not.toContain('parallel');
    expect(futureRegions('parallel')).not.toContain('exterior');
  });

  it('names the region at a point of the diagram', () => {
    expect(regionAt(0.7, 0)).toBe('exterior');
    expect(regionAt(-0.7, 0)).toBe('parallel');
    expect(regionAt(0, 0.3)).toBe('black-hole');
    expect(regionAt(0, -0.3)).toBe('white-hole');
    // On a horizon, and outside the diagram.
    expect(regionAt(0.3, 0.3)).toBeNull();
    expect(regionAt(0, 0.9)).toBeNull();
    expect(regionAt(0.95, 0.4)).toBeNull();
  });

  it('reads an event back to a radius, and refuses one off the diagram', () => {
    const point = penroseAt(2, 0.5, 'exterior');
    const reading = readConformal(point.across, point.up);
    expect(reading.region).toBe('exterior');
    expect(reading.radius).toBeCloseTo(2, 6);
    expect(reading.reach).toEqual(['exterior', 'black-hole']);
    expect(reading.outside).toBe(false);

    const off = readConformal(0, 0.95);
    expect(off.outside).toBe(true);
    expect(off.radius).toBeNull();
    expect(off.reach).toEqual([]);
  });

  it('reads an interior event back to a radius under the horizon', () => {
    const point = penroseAt(0.4, 0.7, 'black-hole');
    const reading = readConformal(point.across, point.up);
    expect(reading.region).toBe('black-hole');
    expect(reading.radius).toBeCloseTo(0.4, 5);
    expect(reading.reach).toEqual(['black-hole']);
  });
});

describe('fitting the diagram to the canvas', () => {
  it('keeps the whole diamond on screen at every aspect', () => {
    // squareBounds puts its extent on the SHORT axis, so a wide canvas gets the half-HEIGHT and
    // a tall one the half-width. Getting that backwards clips the i⁰ labels off one of them.
    for (const aspect of [0.6, 1, 1.3, 2, 3.5]) {
      const extent = extentFor(aspect);
      const halfWidth = aspect >= 1 ? extent * aspect : extent;
      const halfHeight = aspect >= 1 ? extent : extent / aspect;
      expect(halfWidth, `aspect ${aspect}`).toBeGreaterThanOrEqual(INFINITY_ACROSS);
      expect(halfHeight, `aspect ${aspect}`).toBeGreaterThanOrEqual(SINGULARITY_UP);
    }
  });

  it('fills a wide canvas rather than leaving it mostly empty', () => {
    // At a typical stage aspect the diagram should span most of the width.
    const aspect = 1.3;
    const halfWidth = extentFor(aspect) * aspect;
    expect(halfWidth).toBeLessThan(1.5);
  });

  it('does not divide by zero on a degenerate canvas', () => {
    expect(Number.isFinite(extentFor(0))).toBe(true);
    expect(extentFor(0)).toBeGreaterThan(0);
  });
});
