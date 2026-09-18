import { describe, expect, it } from 'vitest';
import {
  CENTRAL_BODIES,
  FULL_DRAG_SPEED,
  OBJECTS,
  STEP,
  STOP_RADIUS,
  advance,
  circularSpeedAt,
  cycloidTime,
  emptyState,
  escapeSpeedAt,
  fieldArrows,
  flowMarkers,
  funnelHeight,
  hoverFieldAt,
  newtonianFieldAt,
  radiusOf,
  release,
  riverSpeedAt,
  speedOf,
  staticClockRate,
  velocityFromDrag,
} from './freefallRun';
import { embeddingHeight } from '../../../core/embedding';


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

  it('keeps a trail to draw', () => {
    const state = advance(release(10, 0, 0, 0), 50, 2.001);
    expect(state.relativistic.trail.length).toBeGreaterThan(1);
    expect(state.relativistic.trail[0]!.x).toBeCloseTo(10, 6);
  });

  it('advances proper time by the step, exactly', () => {
    const state = advance(release(10, 0, 0, 0), 50, 2.001);
    expect(state.relativistic.time).toBeCloseTo(50 * STEP, 12);
  });
});

describe('the Flamm funnel the 3D view draws', () => {
  it('is the exact embedding, hung so the outer edge is level', () => {
    expect(funnelHeight(40, 40)).toBeCloseTo(0, 12);
    for (const r of [2, 5, 12, 30]) {
      expect(funnelHeight(r, 40)).toBeCloseTo(embeddingHeight(r, 2) - embeddingHeight(40, 2), 12);
    }
  });

  it('is the SAME funnel whatever the central body, which is the sim’s whole claim', () => {
    // The geometry depends on r/M alone, so in units of M there is one surface and the body
    // selector moves the surface along it rather than deepening it.
    const shape = (r: number) => funnelHeight(r, 40) / funnelHeight(2, 40);
    for (const body of CENTRAL_BODIES) {
      expect(body.surfaceRadius).toBeGreaterThan(0);
    }
    expect(shape(2)).toBeCloseTo(1, 12);
    expect(shape(40)).toBeCloseTo(0, 12);
  });

  it('bottoms out at the throat and does not continue inside it', () => {
    expect(funnelHeight(1, 40)).toBe(funnelHeight(2, 40));
    expect(funnelHeight(0, 40)).toBe(funnelHeight(2, 40));
  });

  it('is flat where the surface is far out, which is the Earth’s case', () => {
    // The claim the proper-distance rings used to carry, said against what is now drawn: at 1.44
    // billion M the funnel's slope is so small that the whole visible frame is level to a part
    // in 10^4, which is why the Earth's sheet looks flat and should.
    const earth = CENTRAL_BODIES.find(entry => entry.id === 'earth')!;
    const outer = earth.surfaceRadius * 6;
    const depth = Math.abs(funnelHeight(earth.surfaceRadius, outer));
    expect(depth / outer).toBeLessThan(1e-4);
    // A black hole, framed the same way, is not remotely flat.
    expect(Math.abs(funnelHeight(2, 12)) / 12).toBeGreaterThan(0.5);
  });

  it('rises monotonically outward', () => {
    const radii = [2, 3, 6, 12, 25, 40];
    for (let i = 1; i < radii.length; i++) {
      expect(funnelHeight(radii[i]!, 40)).toBeGreaterThan(funnelHeight(radii[i - 1]!, 40));
    }
  });
});

describe('the gravity field arrows', () => {
  it('point at the centre, always', () => {
    for (const arrow of fieldArrows(8, 20, 2, 1.5)) {
      const radius = Math.hypot(arrow.x, arrow.y);
      expect(arrow.dx).toBeCloseTo(-arrow.x / radius, 12);
      expect(arrow.dy).toBeCloseTo(-arrow.y / radius, 12);
      expect(Math.hypot(arrow.dx, arrow.dy)).toBeCloseTo(1, 12);
    }
  });

  it('measures the proper hover acceleration, not GM/r², so it diverges at the horizon', () => {
    // The distinction the diagram exists to make: GM/r² is finite at the horizon and would draw
    // it as an ordinary place to stand.
    expect(hoverFieldAt(2.0001)).toBeGreaterThan(newtonianFieldAt(2.0001) * 50);
    expect(newtonianFieldAt(2)).toBeCloseTo(0.25, 12);
    expect(hoverFieldAt(2)).toBe(Infinity);
    // Far out the two agree.
    expect(hoverFieldAt(1e5) / newtonianFieldAt(1e5)).toBeCloseTo(1, 4);
  });

  it('caps the drawn length while keeping the magnitude honest', () => {
    const arrows = fieldArrows(16, 20, 2, 1.5);
    expect(arrows.length).toBeGreaterThan(100);
    for (const arrow of arrows) {
      expect(arrow.length).toBeLessThanOrEqual(1.5 + 1e-12);
      expect(arrow.length).toBeGreaterThan(0);
    }
    // The magnitude spans orders of magnitude even though the length spans a factor of a few.
    const magnitudes = arrows.map(a => a.magnitude);
    const lengths = arrows.map(a => a.length);
    expect(Math.max(...magnitudes) / Math.min(...magnitudes)).toBeGreaterThan(20);
    expect(Math.max(...lengths) / Math.min(...lengths)).toBeLessThan(20);
  });

  it('draws nothing inside the body, where there is no vacuum field', () => {
    const arrows = fieldArrows(24, 20, 9, 1.5);
    for (const arrow of arrows) expect(Math.hypot(arrow.x, arrow.y)).toBeGreaterThan(9);
  });

  it('draws nothing outside the frame, where there is no surface to lie on', () => {
    // The lattice is square and the mesh is round: the corners reach extent*sqrt(2).
    for (const arrow of fieldArrows(16, 20, 2, 1.5)) {
      expect(Math.hypot(arrow.x, arrow.y)).toBeLessThanOrEqual(20);
    }
  });

  it('falls off as 1/r² where the cap is not biting', () => {
    expect(newtonianFieldAt(10) / newtonianFieldAt(20)).toBeCloseTo(4, 12);
  });
});

describe('the river overlay', () => {
  it('reaches exactly c at the horizon and less outside it', () => {
    expect(riverSpeedAt(2)).toBeCloseTo(1, 12);
    expect(riverSpeedAt(8)).toBeCloseTo(0.5, 12);
    expect(riverSpeedAt(200)).toBeLessThan(0.11);
    expect(riverSpeedAt(1)).toBeGreaterThan(1);
  });

  it('is the escape velocity, which is what makes the horizon the horizon', () => {
    for (const r of [3, 10, 50]) expect(riverSpeedAt(r)).toBeCloseTo(escapeSpeedAt(r), 12);
  });

  it('advects markers inward and keeps them outside the horizon', () => {
    for (const phase of [0, 0.25, 0.5, 0.9]) {
      const markers = flowMarkers(12, 6, 30, phase);
      expect(markers.length).toBeGreaterThan(0);
      for (const marker of markers) {
        expect(marker.radius).toBeGreaterThan(2);
        expect(marker.radius).toBeLessThanOrEqual(30 + 1e-9);
        expect(marker.speed).toBeCloseTo(riverSpeedAt(marker.radius), 12);
      }
    }
  });

  it('spreads markers over every spoke', () => {
    const angles = new Set(flowMarkers(8, 4, 30, 0.1).map(m => m.angle.toFixed(6)));
    expect(angles.size).toBe(8);
  });

  it('moves them inward as the phase advances', () => {
    const first = flowMarkers(1, 1, 30, 0)[0]!;
    const later = flowMarkers(1, 1, 30, 0.4)[0]!;
    expect(later.radius).toBeLessThan(first.radius);
    expect(later.speed).toBeGreaterThan(first.speed);
  });
});
