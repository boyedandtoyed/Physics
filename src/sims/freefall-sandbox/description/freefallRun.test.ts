import { describe, expect, it } from 'vitest';
import {
  CENTRAL_BODIES,
  OBJECTS,
  STEP,
  STOP_RADIUS,
  advance,
  cycloidTime,
  emptyState,
  escapeSpeedAt,
  properDistanceRings,
  radiusOf,
  release,
  speedOf,
  staticClockRate,
  trailVertices,
  velocityFromDrag,
  circularSpeedAt,
  FULL_DRAG_SPEED,
} from './freefallRun';


/** Drop from rest at `from` and run until it stops, returning the final state. */
function drop(from: number, surfaceRadius = STOP_RADIUS) {
  let state = release(from, 0, 0, 0);
  for (let batch = 0; batch < 4000 && !state.relativistic.finished; batch++) {
    state = advance(state, 100, surfaceRadius);
  }
  return state;
}

describe('the central bodies', () => {
  it('places every surface where its real compactness puts it', () => {
    const byId = Object.fromEntries(CENTRAL_BODIES.map(body => [body.id, body]));
    expect(byId.earth!.surfaceRadius).toBeCloseTo(1.436e9, -7);
    expect(byId.jupiter!.surfaceRadius).toBeCloseTo(5.07e7, -6);
    expect(byId['neutron-star']!.surfaceRadius).toBeCloseTo(5.804, 2);
    // A black hole's "surface" is the horizon, at exactly 2 M.
    expect(byId['black-hole']!.surfaceRadius).toBeCloseTo(2, 9);
  });

  it('spans eight decades of compactness, which is the whole exhibit', () => {
    const radii = CENTRAL_BODIES.map(body => body.surfaceRadius);
    expect(Math.max(...radii) / Math.min(...radii)).toBeGreaterThan(1e8);
  });

  it('says in every note what is and is not determined', () => {
    for (const body of CENTRAL_BODIES) expect(body.note.length).toBeGreaterThan(40);
    expect(CENTRAL_BODIES.find(b => b.id === 'neutron-star')!.note)
      .toContain('representative, not determined');
  });

  it('offers four objects that are all test particles, and says so', () => {
    expect(OBJECTS).toHaveLength(4);
    expect(new Set(OBJECTS.map(o => o.id)).size).toBe(4);
  });
});

describe('the static clock rate', () => {
  it('is √(1 − 2/r) and reaches zero exactly at the horizon', () => {
    expect(staticClockRate(4)).toBeCloseTo(Math.SQRT1_2, 12);
    expect(staticClockRate(2)).toBe(0);
    expect(staticClockRate(1.5)).toBe(0);
  });

  it('gives the neutron star’s surface the rate its compactness implies', () => {
    const star = CENTRAL_BODIES.find(body => body.id === 'neutron-star')!;
    expect(staticClockRate(star.surfaceRadius)).toBeCloseTo(0.8096, 3);
  });

  it('is indistinguishable from one at the Earth’s surface, and that is the point', () => {
    const earth = CENTRAL_BODIES.find(body => body.id === 'earth')!;
    expect(1 - staticClockRate(earth.surfaceRadius)).toBeLessThan(1e-9);
    expect(1 - staticClockRate(earth.surfaceRadius)).toBeGreaterThan(0);
  });
});

describe('escape speed', () => {
  it('is √(r_s/r), which is also the Gullstrand–Painlevé river speed', () => {
    expect(escapeSpeedAt(2)).toBeCloseTo(1, 12);
    expect(escapeSpeedAt(8)).toBeCloseTo(0.5, 12);
  });
});

describe('a radial drop', () => {
  it('reproduces the analytic cycloid, which §2.7 says is exact in both theories', () => {
    // PHYSICS_SPEC §2.7 and §8: 33.69975 M from 10 M to 2.001 M. Asserted to integration error,
    // not to a percentage — a 1% gate here would be a statement about the step size.
    expect(cycloidTime(10, 2.001)).toBeCloseTo(33.69975, 4);
    const state = drop(10, 2.001);
    expect(state.relativistic.time).toBeCloseTo(cycloidTime(10, 2.001), 1);
    expect(Math.abs(state.relativistic.time - cycloidTime(10, 2.001)) / cycloidTime(10, 2.001))
      .toBeLessThan(1e-3);
  });

  it('is identical with and without the correction, because h = 0 kills it', () => {
    const state = drop(10, 2.001);
    expect(state.angularMomentum).toBe(0);
    expect(state.newtonian.time).toBeCloseTo(state.relativistic.time, 9);
    expect(radiusOf(state.newtonian)).toBeCloseTo(radiusOf(state.relativistic), 9);
  });

  it('matches the cycloid from several heights, not just the benchmark one', () => {
    for (const from of [6, 10, 40]) {
      const state = drop(from, 2.001);
      expect(Math.abs(state.relativistic.time - cycloidTime(from, 2.001)) / cycloidTime(from, 2.001),
        `from ${from} M`).toBeLessThan(2e-3);
    }
  });

  it('stops at the surface, and never asks for a radius inside it', () => {
    for (const body of CENTRAL_BODIES) {
      const from = Math.max(body.surfaceRadius * 1.5, 6);
      let state = release(from, 0, 0, 0);
      for (let batch = 0; batch < 200; batch++) {
        state = advance(state, 200, body.surfaceRadius);
        expect(radiusOf(state.relativistic), body.id).toBeGreaterThanOrEqual(
          Math.max(body.surfaceRadius, STOP_RADIUS) * (1 - 1e-9));
        if (state.relativistic.finished) break;
      }
    }
  });

  it('speeds up as it falls, and passes escape speed nowhere', () => {
    // A body dropped from rest at a finite height is bound: its speed is always below the local
    // escape speed, at every radius, by construction.
    let state = release(10, 0, 0, 0);
    for (let batch = 0; batch < 400 && !state.relativistic.finished; batch++) {
      state = advance(state, 20, 2.001);
      const radius = radiusOf(state.relativistic);
      expect(speedOf(state.relativistic)).toBeLessThan(escapeSpeedAt(radius) + 1e-9);
    }
  });
});

describe('an orbit, where the correction does something', () => {
  it('separates the Newtonian and corrected tracks when there is angular momentum', () => {
    const radius = 20;
    const speed = Math.sqrt(1 / radius);
    let state = release(radius, 0, 0, speed);
    expect(state.angularMomentum).toBeCloseTo(radius * speed, 12);
    for (let batch = 0; batch < 300; batch++) state = advance(state, 200, STOP_RADIUS);
    const separation = Math.hypot(
      state.relativistic.x - state.newtonian.x, state.relativistic.y - state.newtonian.y);
    // Precession: the corrected orbit leads the Newtonian one after many orbits.
    expect(separation).toBeGreaterThan(1);
  });

  it('leaves the Newtonian track circular and makes the corrected one slightly eccentric', () => {
    // √(M/r) is the circular speed in the Newtonian potential and NOT in the corrected one, so
    // the same launch gives a circle in one theory and a precessing ellipse in the other. That
    // difference is the exhibit, so it is asserted rather than tolerated.
    const radius = 20;
    let state = release(radius, 0, 0, Math.sqrt(1 / radius));
    let lowest = radius;
    let highest = radius;
    for (let batch = 0; batch < 300; batch++) {
      state = advance(state, 200, STOP_RADIUS);
      lowest = Math.min(lowest, radiusOf(state.relativistic));
      highest = Math.max(highest, radiusOf(state.relativistic));
      expect(radiusOf(state.newtonian)).toBeCloseTo(radius, 1);
    }
    expect(highest - lowest).toBeGreaterThan(0.5);
    expect(lowest).toBeGreaterThan(radius * 0.8);
    expect(highest).toBeLessThan(radius * 1.05);
  });
});

describe('the well, drawn as proper-distance rings', () => {
  it('bunches the rings against the horizon for a black hole', () => {
    // Equal PROPER spacing means unequal coordinate spacing, and the gaps must grow outward at
    // every step — that monotonicity is the depth of the well, seen from above.
    const rings = properDistanceRings(2.0005, 30, 8);
    expect(rings).toHaveLength(7);
    const gaps = rings.slice(1).map((r, i) => r - rings[i]!);
    for (let index = 1; index < gaps.length; index++) {
      expect(gaps[index]!).toBeGreaterThan(gaps[index - 1]!);
    }
    // Close in, where the effect lives, the outermost gap is twice the innermost.
    const near = properDistanceRings(2.0005, 8, 8);
    const nearGaps = near.slice(1).map((r, i) => r - near[i]!);
    expect(nearGaps[nearGaps.length - 1]! / nearGaps[0]!).toBeGreaterThan(2);
  });

  it('spaces them evenly where the geometry is flat, which is the Earth’s case', () => {
    const earth = CENTRAL_BODIES.find(body => body.id === 'earth')!;
    const rings = properDistanceRings(earth.surfaceRadius, earth.surfaceRadius * 10, 8);
    const gaps = rings.slice(1).map((r, i) => r - rings[i]!);
    for (const gap of gaps) expect(gap / gaps[0]!).toBeCloseTo(1, 3);
  });

  it('returns nothing for a degenerate range rather than dividing by zero', () => {
    expect(properDistanceRings(10, 10, 6)).toEqual([]);
    expect(properDistanceRings(10, 4, 6)).toEqual([]);
    expect(properDistanceRings(2.1, 30, 1)).toEqual([]);
  });
});

describe('the drag-to-velocity mapping', () => {
  it('never launches faster than light, however far the drag goes', () => {
    // One sim unit of drag per sim unit of speed makes a 40-pixel flick a launch at 4.5c in
    // these units, because c = 1 here. The scale is tied to the frame instead.
    for (const extent of [12, 35, 200]) {
      for (const length of [1, extent, extent * 50]) {
        const v = velocityFromDrag(0, 0, length, 0, extent);
        expect(Math.hypot(v.vx, v.vy)).toBeLessThanOrEqual(FULL_DRAG_SPEED + 1e-12);
      }
    }
  });

  it('gives exactly FULL_DRAG_SPEED for a drag across the frame half-width', () => {
    const v = velocityFromDrag(0, 0, 0, 35, 35);
    expect(v.vy).toBeCloseTo(FULL_DRAG_SPEED, 12);
    expect(v.vx).toBeCloseTo(0, 12);
  });

  it('points the way the drag points', () => {
    const v = velocityFromDrag(2, 3, 2 - 10, 3 + 10, 40);
    expect(v.vx).toBeLessThan(0);
    expect(v.vy).toBeGreaterThan(0);
    expect(Math.abs(v.vx)).toBeCloseTo(Math.abs(v.vy), 12);
  });

  it('puts a circular orbit within reach of a short drag, which is the point of the scale', () => {
    const extent = 35;
    const radius = 20;
    const circular = circularSpeedAt(radius);
    // The drag length that gives circular speed, as a fraction of the frame.
    const fraction = circular / FULL_DRAG_SPEED;
    expect(fraction).toBeGreaterThan(0.05);
    expect(fraction).toBeLessThan(0.5);
    const v = velocityFromDrag(0, 0, 0, fraction * extent, extent);
    expect(Math.hypot(v.vx, v.vy)).toBeCloseTo(circular, 9);
  });

  it('returns rest for a zero drag rather than dividing by zero', () => {
    expect(velocityFromDrag(1, 1, 1, 1, 30)).toEqual({ vx: 0, vy: 0 });
    expect(velocityFromDrag(0, 0, 5, 0, 0)).toEqual({ vx: 0, vy: 0 });
  });
});

describe('bookkeeping', () => {
  it('starts unreleased and stays put until released', () => {
    const state = emptyState();
    expect(state.released).toBe(false);
    expect(advance(state, 100, 2.1)).toBe(state);
  });

  it('keeps a trail that fades oldest to newest', () => {
    const state = advance(release(10, 0, 0, 0), 50, 2.001);
    const data = trailVertices(state.relativistic.trail);
    expect(data.length / 3).toBe(state.relativistic.trail.length);
    expect(data[2]).toBe(0);
    expect(data[data.length - 1]).toBe(1);
  });

  it('advances proper time by the step, exactly', () => {
    const state = advance(release(10, 0, 0, 0), 50, 2.001);
    expect(state.relativistic.time).toBeCloseTo(50 * STEP, 12);
  });
});
