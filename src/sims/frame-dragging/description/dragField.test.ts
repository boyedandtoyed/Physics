import { describe, expect, it } from 'vitest';
import {
  FAN_RINGS,
  MARKERS_PER_RING,
  MARKER_RINGS,
  STOP_FACTOR,
  advanceFaller,
  fanVertices,
  lightConeFans,
  markerAngle,
  markerRadii,
  markerVertices,
  meridionalErgosphere,
  releaseFaller,
  staticTickVertices,
  trailVertices,
} from './dragField';
import { horizonRadii, omegaZamo } from '../../../core/kerr';

const SPINS = [0.1, 0.5, 0.9, 0.998] as const;

describe('the marker rings', () => {
  it('sit outside the horizon and inside the frame, at every spin', () => {
    for (const spin of SPINS) {
      const { outer } = horizonRadii(spin);
      const radii = markerRadii(spin, 12);
      expect(radii).toHaveLength(MARKER_RINGS);
      for (const radius of radii) {
        expect(radius).toBeGreaterThan(outer);
        expect(radius).toBeLessThanOrEqual(12 + 1e-9);
      }
    }
  });

  it('are spaced geometrically, because the dragging goes as r⁻³', () => {
    const radii = markerRadii(0.9, 12);
    const ratios = radii.slice(1).map((r, i) => r / radii[i]!);
    for (const ratio of ratios) expect(ratio).toBeCloseTo(ratios[0]!, 9);
  });

  it('refuses a frame with no room outside the horizon', () => {
    expect(() => markerRadii(0.9, 1.0)).toThrow(RangeError);
  });

  it('carries each marker round at exactly ω(r), so the outer rings barely move', () => {
    const spin = 0.9;
    const radii = markerRadii(spin, 12);
    const time = 40;
    const inner = markerAngle(radii[0]!, spin, time, 0);
    const outer = markerAngle(radii[radii.length - 1]!, spin, time, 0);
    expect(inner).toBeCloseTo(omegaZamo(radii[0]!, spin) * time, 12);
    expect(inner / outer).toBeGreaterThan(100);
  });

  it('emits two vertices per marker, all on their own ring', () => {
    const data = markerVertices({ spin: 0.9, outerEdge: 12, time: 7 }, 0.02);
    expect(data.length / 3).toBe(MARKER_RINGS * MARKERS_PER_RING * 2);
    const radii = markerRadii(0.9, 12);
    for (let vertex = 0; vertex < data.length / 3; vertex++) {
      const r = Math.hypot(data[vertex * 3]!, data[vertex * 3 + 1]!);
      expect(radii.some(candidate => Math.abs(candidate - r) < 1e-6)).toBe(true);
    }
  });

  it('draws nothing at all when the hole is not spinning — there is no drag to draw', () => {
    const data = markerVertices({ spin: 0, outerEdge: 12, time: 30 }, 0.02);
    for (let vertex = 0; vertex < data.length / 3; vertex += 2) {
      // Tail and head coincide: zero arrow length, because ω is identically zero.
      expect(data[vertex * 3]).toBeCloseTo(data[(vertex + 1) * 3]!, 12);
      expect(data[vertex * 3 + 1]).toBeCloseTo(data[(vertex + 1) * 3 + 1]!, 12);
    }
  });
});

describe('the light cone in φ', () => {
  it('contains standing still outside the ergosphere and excludes it inside', () => {
    for (const spin of SPINS) {
      for (const fan of lightConeFans({ spin, outerEdge: 12, time: 0 }, 1)) {
        expect(fan.staticAllowed).toBe(fan.radius > 2);
        if (fan.staticAllowed) {
          expect(fan.minOffset).toBeLessThan(0);
          expect(fan.maxOffset).toBeGreaterThan(0);
        } else {
          expect(fan.minOffset).toBeGreaterThan(0);
        }
      }
    }
  });

  it('has every fan inside the ergosphere lying entirely on the co-rotating side', () => {
    const fans = lightConeFans({ spin: 0.998, outerEdge: 12, time: 0 }, 1)
      .filter(fan => fan.radius < 2);
    expect(fans.length).toBeGreaterThan(0);
    for (const fan of fans) expect(fan.minOffset).toBeGreaterThan(0);
  });

  it('produces the right number of fans, and none inside the horizon', () => {
    for (const spin of SPINS) {
      const fans = lightConeFans({ spin, outerEdge: 12, time: 0 }, 1);
      expect(fans).toHaveLength(FAN_RINGS);
      for (const fan of fans) expect(fan.radius).toBeGreaterThan(horizonRadii(spin).outer);
    }
  });

  it('draws a band at its own radius, not a pie slice from the origin', () => {
    // A sector drawn from the origin is metres wide at the rim and buries everything else on
    // the plot under six overlapping wedges. Every vertex must be near its own radius.
    const fan = { radius: 4, angle: 0.3, minOffset: -0.2, maxOffset: 0.5, staticAllowed: true };
    const data = fanVertices(fan, 8);
    for (let vertex = 0; vertex < data.length / 3; vertex++) {
      const r = Math.hypot(data[vertex * 3]!, data[vertex * 3 + 1]!);
      expect(Math.abs(r - 4) / 4).toBeLessThan(0.2);
    }
  });

  it('spans exactly the allowed range of angles, and closes', () => {
    const fan = { radius: 4, angle: 0.3, minOffset: -0.2, maxOffset: 0.5, staticAllowed: true };
    const data = fanVertices(fan, 8);
    const angles = Array.from({ length: data.length / 3 }, (_, v) =>
      Math.atan2(data[v * 3 + 1]!, data[v * 3]!));
    // Six places, not nine: these buffers are Float32Array because they go straight to the GPU.
    expect(Math.min(...angles)).toBeCloseTo(0.3 - 0.2, 6);
    expect(Math.max(...angles)).toBeCloseTo(0.3 + 0.5, 6);
    // A closed loop: first and last vertex are the two ends of the same radial edge.
    expect(angles[0]).toBeCloseTo(angles[angles.length - 1]!, 6);
  });

  it('puts the static tick inside the band outside the ergosphere and outside it within', () => {
    for (const spin of SPINS) {
      const fans = lightConeFans({ spin, outerEdge: 12, time: 3 }, 1);
      const ticks = staticTickVertices(fans);
      expect(ticks.length / 3).toBe(fans.length * 2);
      fans.forEach((fan, index) => {
        const angle = Math.atan2(ticks[index * 6 + 1]!, ticks[index * 6]!);
        const relative = Math.atan2(Math.sin(angle - fan.angle), Math.cos(angle - fan.angle));
        expect(relative).toBeCloseTo(0, 5);
        const inside = relative > fan.minOffset && relative < fan.maxOffset;
        expect(inside).toBe(fan.staticAllowed);
      });
    }
  });
});

describe('the meridional cut', () => {
  it('is a circle of radius 2M when the hole is not spinning', () => {
    for (let i = 0; i < 64; i++) {
      const data = meridionalErgosphere(0, 64);
      expect(Math.hypot(data[i * 3]!, data[i * 3 + 1]!)).toBeCloseTo(2, 6);
    }
  });

  it('is oblate when it spins: 2M across the equator, less at the poles', () => {
    const spin = 0.9;
    const data = meridionalErgosphere(spin, 400);
    const radii = Array.from({ length: 400 }, (_, i) => Math.hypot(data[i * 3]!, data[i * 3 + 1]!));
    expect(Math.max(...radii)).toBeCloseTo(2, 6);
    expect(Math.min(...radii)).toBeCloseTo(horizonRadii(spin).outer, 6);
    // This is the ONLY view the oblateness exists in; the equatorial one is a circle.
    expect(Math.max(...radii) - Math.min(...radii)).toBeGreaterThan(0.5);
  });
});

describe('the zero-angular-momentum faller', () => {
  it('does not move in φ at all when the hole is not spinning', () => {
    let faller = releaseFaller(10);
    for (let step = 0; step < 500; step++) faller = advanceFaller(faller, 0, 0.2);
    expect(faller.swept).toBe(0);
    expect(faller.radius).toBeLessThan(10);
  });

  it('sweeps a growing angle with exactly zero angular momentum once it does', () => {
    let faller = releaseFaller(10);
    let previous = 0;
    for (let step = 0; step < 4000; step++) {
      faller = advanceFaller(faller, 0.9, 0.2);
      expect(faller.swept).toBeGreaterThanOrEqual(previous);
      previous = faller.swept;
    }
    expect(faller.swept).toBeGreaterThan(1);
  });

  it('is dragged further the faster the hole spins, from the same release', () => {
    const sweptAt = (spin: number) => {
      let faller = releaseFaller(10);
      for (let step = 0; step < 3000; step++) faller = advanceFaller(faller, spin, 0.2);
      return faller.swept;
    };
    let previous = -1;
    for (const spin of [0, 0.3, 0.6, 0.9, 0.998]) {
      const swept = sweptAt(spin);
      expect(swept).toBeGreaterThan(previous);
      previous = swept;
    }
  });

  it('stops outside the horizon and never asks for a radius inside it', () => {
    for (const spin of [0, 0.5, 0.998]) {
      const { outer } = horizonRadii(spin);
      let faller = releaseFaller(8);
      for (let step = 0; step < 20_000; step++) {
        faller = advanceFaller(faller, spin, 0.5);
        expect(faller.radius).toBeGreaterThanOrEqual(outer * STOP_FACTOR - 1e-12);
      }
      expect(faller.plunged).toBe(true);
      expect(faller.radius).toBeCloseTo(outer * STOP_FACTOR, 9);
    }
  });

  it('stalls: coordinate time per unit radius diverges as the horizon is approached', () => {
    // The faller is paced by Boyer–Lindquist t, so the approach is asymptotic. That is the
    // physics, not the animation running out, and the divergence is what has to be asserted —
    // a single elapsed time would be a statement about where the run happened to stop.
    const spin = 0.9;
    const { outer } = horizonRadii(spin);
    const bands = [4, 2, 1.5, 1.2, 1.05, 1.01, 1.001];
    const crossings = new Map<number, { time: number; radius: number }>();
    let faller = releaseFaller(8);
    const start = { time: 0, radius: 8 };
    for (let step = 0; step < 200_000; step++) {
      const before = faller.radius;
      faller = advanceFaller(faller, spin, 0.05);
      for (const band of bands) {
        if (before > outer * band && faller.radius <= outer * band && !crossings.has(band)) {
          crossings.set(band, { time: faller.time, radius: faller.radius });
        }
      }
      if (faller.plunged) break;
    }
    expect(crossings.size).toBe(bands.length);

    const points = [start, ...bands.map(band => crossings.get(band)!)];
    const cost: number[] = [];
    for (let index = 1; index < points.length; index++) {
      const dt = points[index]!.time - points[index - 1]!.time;
      const dr = points[index - 1]!.radius - points[index]!.radius;
      cost.push(dt / dr);
    }
    for (let index = 1; index < cost.length; index++) {
      expect(cost[index], `band ${index} is not more expensive than the one outside it`)
        .toBeGreaterThan(cost[index - 1]!);
    }
    // The innermost band costs more than a hundred times the outermost, per unit radius.
    expect(cost[cost.length - 1]! / cost[0]!).toBeGreaterThan(100);
  });

  it('keeps a trail that runs oldest-first and fades by index', () => {
    const trail = [releaseFaller(9), releaseFaller(8), releaseFaller(7)];
    const data = trailVertices(trail);
    expect(data.length / 3).toBe(3);
    expect(data[2]).toBe(0);
    expect(data[8]).toBe(1);
    expect(trailVertices([]).length).toBe(0);
  });
});
