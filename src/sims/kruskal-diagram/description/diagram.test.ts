import { describe, expect, it } from 'vitest';
import {
  DEFAULT_EXTENT,
  MINIMUM_RADIUS,
  fallDuration,
  horizonFraction,
  horizonVertices,
  inM,
  infallWorldline,
  lightConeVertices,
  outermostRadius,
  radiusGrid,
  radiusVertices,
  readEvent,
  singularityVertices,
  staticObserverVertices,
  timeGrid,
  timeVertices,
  toM,
  trackVertices,
} from './diagram';
import { productAtRadius } from '../../../core/kruskal';
import { properTimeToHorizon } from '../../../core/infall';

describe('the units the diagram is labelled in', () => {
  it('is M on screen and r_s underneath, and the two round-trip', () => {
    expect(inM(4)).toBe(2);
    expect(toM(1)).toBe(2);
    expect(toM(inM(3.5))).toBeCloseTo(3.5, 12);
  });
});

describe('the window', () => {
  it('knows the outermost radius that fits', () => {
    const outer = outermostRadius(DEFAULT_EXTENT);
    expect(Math.sqrt(outer - 1) * Math.exp(outer / 2)).toBeCloseTo(DEFAULT_EXTENT, 6);
    // X grows exponentially with r, so a window four across reaches only a couple of r_s.
    expect(outer).toBeGreaterThan(1.5);
    expect(outer).toBeLessThan(3);
  });

  it('spaces the radius grid every half an M and leaves the horizon out of it', () => {
    const radii = radiusGrid(DEFAULT_EXTENT, 0.5);
    expect(radii.length).toBeGreaterThan(4);
    for (const r of radii) expect(Math.abs(r - 1)).toBeGreaterThan(0.1);
    // Consecutive radii differ by 0.5 M = 0.25 r_s.
    expect(radii[1]! - radii[0]!).toBeCloseTo(0.25, 12);
  });

  it('spaces the time grid symmetrically about t = 0 and leaves t = 0 out', () => {
    const times = timeGrid(4, 0.5);
    expect(times).not.toContain(0);
    expect(Math.min(...times)).toBeCloseTo(-2, 12);
    expect(Math.max(...times)).toBeCloseTo(2, 12);
    for (const t of times) expect(times.some(other => Math.abs(other + t) < 1e-12)).toBe(true);
  });
});

describe('the drawn curves', () => {
  it('keeps a constant-r curve on X² − T² = (r − 1)e^r', () => {
    for (const [radius, region] of [[2, 'exterior'], [0.5, 'black-hole']] as const) {
      const data = radiusVertices(radius, region, DEFAULT_EXTENT, 41);
      expect(data.length / 3).toBe(41);
      for (let i = 0; i < data.length; i += 3) {
        const x = data[i]!;
        const t = data[i + 1]!;
        expect(x * x - t * t).toBeCloseTo(productAtRadius(radius), 4);
      }
    }
  });

  it('puts each region’s curve on its own side of the diagram', () => {
    const at = (region: Parameters<typeof radiusVertices>[1], radius: number) => {
      const data = radiusVertices(radius, region, DEFAULT_EXTENT, 21);
      const middle = Math.floor(21 / 2) * 3;
      return { x: data[middle]!, t: data[middle + 1]! };
    };
    expect(at('exterior', 2).x).toBeGreaterThan(0);
    expect(at('parallel', 2).x).toBeLessThan(0);
    expect(at('black-hole', 0.5).t).toBeGreaterThan(0);
    expect(at('white-hole', 0.5).t).toBeLessThan(0);
  });

  it('draws the horizons at exactly 45 degrees, both of them', () => {
    const data = horizonVertices(2);
    for (let i = 0; i < data.length; i += 3) {
      expect(Math.abs(data[i]!)).toBeCloseTo(Math.abs(data[i + 1]!), 6);
    }
  });

  it('draws a constant-t line through the origin at slope tanh(t/2)', () => {
    // Seven places, not twelve: these are vertex buffers, and a Float32Array holds about
    // seven significant digits. Asserting more is asserting something the buffer cannot carry.
    const data = timeVertices(1.5, 2);
    expect(data[1]! / data[0]!).toBeCloseTo(Math.tanh(0.75), 7);
    expect(data[4]! / data[3]!).toBeCloseTo(Math.tanh(0.75), 7);
    // Through the origin: the two ends are opposite.
    expect(data[0]!).toBeCloseTo(-data[3]!, 6);
  });

  it('draws the singularity JAGGED, never as a smooth curve', () => {
    // The requirement is that it cannot be read as a surface in spacetime, so the test is that
    // the drawn points genuinely alternate about the hyperbola rather than lying on it.
    const data = singularityVertices(2, true);
    let above = 0;
    let below = 0;
    for (let i = 0; i < data.length; i += 3) {
      const x = data[i]!;
      const t = data[i + 1]!;
      const exact = Math.sqrt(1 + x * x);
      if (t > exact) above++;
      if (t < exact) below++;
      // …but never far off it: this is a decoration on the curve, not a different curve.
      expect(Math.abs(t - exact)).toBeLessThan(0.2);
    }
    expect(above).toBeGreaterThan(10);
    expect(below).toBeGreaterThan(10);
  });

  it('puts the past singularity below and the future one above', () => {
    expect(singularityVertices(2, true)[1]!).toBeGreaterThan(0);
    expect(singularityVertices(2, false)[1]!).toBeLessThan(0);
  });
});

describe('a static observer', () => {
  it('follows a HYPERBOLA, not a vertical line', () => {
    // The brief for this sim said a static observer "follows a vertical line in Kruskal
    // coordinates". It does not, and this is the test that says so: dr/dt = 0 means UV is
    // constant, which is X² − T² constant — the same hyperbola a Rindler observer follows in
    // flat space, and for the same reason. X varies along it by more than a factor of two.
    const data = staticObserverVertices(1.5, DEFAULT_EXTENT, 61);
    const xs: number[] = [];
    for (let i = 0; i < data.length; i += 3) {
      xs.push(data[i]!);
      expect(data[i]! ** 2 - data[i + 1]! ** 2).toBeCloseTo(productAtRadius(1.5), 4);
    }
    expect(Math.max(...xs) / Math.min(...xs)).toBeGreaterThan(2);
  });

  it('never crosses either horizon, however long it waits', () => {
    const data = staticObserverVertices(1.5, DEFAULT_EXTENT, 81);
    for (let i = 0; i < data.length; i += 3) {
      expect(data[i]!).toBeGreaterThan(Math.abs(data[i + 1]!));
    }
  });

  it('hugs the horizon more closely the deeper it stands', () => {
    const deep = staticObserverVertices(1.05, DEFAULT_EXTENT, 21);
    const high = staticObserverVertices(2.2, DEFAULT_EXTENT, 21);
    expect(deep[0 * 3]! ** 2 - deep[1]! ** 2).toBeLessThan(high[0]! ** 2 - high[1]! ** 2);
  });
});

describe('the infall', () => {
  it('starts at rest where it was released and ends at the singularity', () => {
    const track = infallWorldline(3, 200);
    expect(track[0]!.radius).toBeCloseTo(3, 9);
    expect(track[0]!.properTime).toBe(0);
    expect(track[track.length - 1]!.radius).toBeCloseTo(MINIMUM_RADIUS, 6);
    expect(track[track.length - 1]!.properTime).toBeCloseTo(fallDuration(3), 9);
  });

  it('never steps outside the trajectory, at any release radius', () => {
    // The rounding in r0 → τ → r can put the first sample an ulp ABOVE r0, which core/infall
    // refuses. A reader clicking at such a radius took the whole sim into its error boundary.
    for (const start of [1.0001, 1.37, 2.0603, 2.5, 3, 7.99]) {
      expect(() => infallWorldline(start, 64), `r0 = ${start}`).not.toThrow();
      expect(infallWorldline(start, 64)[0]!.radius).toBeLessThanOrEqual(start);
    }
  });

  it('falls inward the whole way, in the faller’s own time', () => {
    const track = infallWorldline(3, 120);
    for (let i = 1; i < track.length; i++) {
      expect(track[i]!.radius).toBeLessThan(track[i - 1]!.radius);
      expect(track[i]!.properTime).toBeGreaterThan(track[i - 1]!.properTime);
    }
  });

  it('crosses the horizon at a finite fraction of the way through', () => {
    const fraction = horizonFraction(8);
    expect(fraction).toBeGreaterThan(0);
    expect(fraction).toBeLessThan(1);
    // §7.4: 14.4183 r_s/c to the horizon from 8 r_s, against 15.0849 to r = 0.
    expect(properTimeToHorizon(8)).toBeCloseTo(14.4183, 4);
    expect(fallDuration(8)).toBeCloseTo(15.0849, 3);
  });

  it('crosses T = X exactly once, and then stays inside', () => {
    const track = infallWorldline(3, 400);
    let crossings = 0;
    for (let i = 1; i < track.length; i++) {
      const before = track[i - 1]!.t - track[i - 1]!.x;
      const after = track[i]!.t - track[i]!.x;
      if (before < 0 && after > 0) crossings++;
    }
    expect(crossings).toBe(1);
    expect(track[track.length - 1]!.t).toBeGreaterThan(track[track.length - 1]!.x);
  });

  it('keeps X² − T² on the invariant the whole way, across the horizon', () => {
    // The worldline is built from core/infall's v, with U taken from UV/V so the divergent
    // Schwarzschild u never appears. This is the check that the two halves agree.
    for (const sample of infallWorldline(3, 60)) {
      expect(sample.x ** 2 - sample.t ** 2)
        .toBeCloseTo(productAtRadius(sample.radius), 6);
    }
  });

  it('draws only as far as it has got', () => {
    const track = infallWorldline(3, 100);
    expect(trackVertices(track, 0.5).length / 3).toBe(50);
    expect(trackVertices(track, 1).length / 3).toBe(100);
    expect(trackVertices(track, 0).length / 3).toBe(2);
  });
});

describe('light cones', () => {
  it('opens at exactly 45 degrees in all four directions', () => {
    const data = lightConeVertices(0.7, -0.3, 1);
    for (let i = 0; i < data.length; i += 6) {
      const dx = data[i + 3]! - data[i]!;
      const dt = data[i + 4]! - data[i + 1]!;
      expect(Math.abs(dt / dx)).toBeCloseTo(1, 6);
    }
  });
});

describe('reading an event off the diagram', () => {
  it('recovers r and t in the exterior', () => {
    const data = radiusVertices(2, 'exterior', DEFAULT_EXTENT, 3);
    const reading = readEvent(data[3]!, data[4]!);
    expect(reading.region).toBe('exterior');
    expect(reading.radius).toBeCloseTo(2, 6);
    expect(reading.time).toBeCloseTo(0, 6);
    expect(reading.beyond).toBe(false);
  });

  it('names the region for a click in each quadrant', () => {
    expect(readEvent(2, 0).region).toBe('exterior');
    expect(readEvent(-2, 0).region).toBe('parallel');
    expect(readEvent(0, 0.7).region).toBe('black-hole');
    expect(readEvent(0, -0.7).region).toBe('white-hole');
  });

  it('reports "past the singularity" rather than inventing a radius', () => {
    const beyond = readEvent(0, 2);
    expect(beyond.beyond).toBe(true);
    expect(beyond.radius).toBeNull();
    // On the singularity itself, r comes back at zero to the square-root law's precision.
    const edge = readEvent(0, 1);
    expect(edge.beyond).toBe(false);
    expect(edge.radius!).toBeLessThan(1e-7);
  });

  it('declines to quote a Schwarzschild time on a horizon', () => {
    const onHorizon = readEvent(1, 1);
    expect(onHorizon.time).toBeNull();
    expect(onHorizon.region).toBeNull();
    expect(onHorizon.radius).toBeCloseTo(1, 9);
  });
});
