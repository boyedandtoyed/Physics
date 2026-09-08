import { describe, expect, it } from 'vitest';
import {
  MAX_PLOT_RADIUS,
  curveBounds,
  MIN_PLOT_RADIUS,
  OrbitRun,
  circularOrbitReadout,
  criticalRadii,
  curveVertices,
  describeState,
  energyCrossings,
  energyLine,
  potentialCurve,
  verticalMarker,
} from './orbitState';
import { effectivePotential, iscoAngularMomentum } from '../../../core/orbit';

const M = 1;
const L_ISCO = iscoAngularMomentum(M);

describe('the plotted curve', () => {
  it('spans exactly the window §2.5 asks for, and never inside the horizon', () => {
    const points = potentialCurve(M, 5);
    expect(points[0]!.radius).toBeCloseTo(MIN_PLOT_RADIUS, 9);
    expect(points[points.length - 1]!.radius).toBeCloseTo(MAX_PLOT_RADIUS, 9);
    for (const p of points) expect(p.radius).toBeGreaterThan(2 * M);
  });

  it('agrees with the core potential at every sample', () => {
    // The plot cannot drift from the physics: the curve is the function, sampled.
    for (const L of [0, 3, L_ISCO, 6]) {
      for (const p of potentialCurve(M, L)) {
        expect(p.potential).toBeCloseTo(effectivePotential(p.radius, M, L), 14);
      }
    }
  });

  it('scales with M, so the picture is identical and only the labels change', () => {
    const one = potentialCurve(1, L_ISCO);
    const ten = potentialCurve(10, iscoAngularMomentum(10));
    for (let i = 0; i < one.length; i += 37) {
      expect(ten[i]!.radius / 10).toBeCloseTo(one[i]!.radius, 9);
      expect(ten[i]!.potential).toBeCloseTo(one[i]!.potential, 12);
    }
  });

  it('gives a usable plot window at every angular momentum, including the extremes', () => {
    // A fixed band inverted at high L — the barrier reaches +5.2 at 5x L_ISCO, above any clamped
    // ceiling — and nothing drew at all. The window is derived from the curve's own features now.
    for (const L of [0, 1, L_ISCO, 2 * L_ISCO, 5 * L_ISCO]) {
      const bounds = curveBounds(potentialCurve(M, L));
      expect(bounds.maxY).toBeGreaterThan(bounds.minY);
      expect(Number.isFinite(bounds.minY)).toBe(true);
      expect(Number.isFinite(bounds.maxY)).toBe(true);
    }
  });

  it('contains the barrier peak and the potential minimum when they exist', () => {
    for (const L of [1.45 * L_ISCO, 3 * L_ISCO]) {
      const readout = circularOrbitReadout(M, L);
      const bounds = curveBounds(potentialCurve(M, L));
      const peak = effectivePotential(readout.inner, M, L);
      const trough = effectivePotential(readout.outer, M, L);
      // Both features are inside the drawn band, which is the point of deriving it from them.
      if (readout.inner >= MIN_PLOT_RADIUS && readout.inner <= MAX_PLOT_RADIUS) {
        expect(peak).toBeLessThanOrEqual(bounds.maxY);
      }
      if (readout.outer >= MIN_PLOT_RADIUS && readout.outer <= MAX_PLOT_RADIUS) {
        expect(trough).toBeGreaterThanOrEqual(bounds.minY);
      }
    }
  });

  it('includes zero, so the bound/unbound line is always on the plot', () => {
    for (const L of [0, L_ISCO, 4 * L_ISCO]) {
      const bounds = curveBounds(potentialCurve(M, L));
      expect(bounds.minY).toBeLessThanOrEqual(0);
      expect(bounds.maxY).toBeGreaterThanOrEqual(0);
    }
  });

  it('marks the three critical radii at 2M, 3M and 6M', () => {
    const radii = criticalRadii(M);
    expect(radii.horizon).toBe(2);
    expect(radii.photonSphere).toBe(3);
    expect(radii.isco).toBe(6);
    const scaled = criticalRadii(4);
    expect(scaled.isco).toBe(24);
  });

  it('emits vertices the renderer can draw, with no NaN', () => {
    const data = curveVertices(potentialCurve(M, 5));
    expect(data.length % 3).toBe(0);
    for (const value of data) expect(Number.isFinite(value)).toBe(true);
    // Float32Array: -0.1 is not representable exactly, so compare per element rather than
    // asserting float64 equality on a GPU buffer.
    const marker = verticalMarker(6, -0.1, 0.1);
    expect(marker).toHaveLength(6);
    [6, -0.1, 1, 6, 0.1, 1].forEach((want, i) => expect(marker[i]!).toBeCloseTo(want, 6));
    // Float32 again: ~7 significant digits is all these buffers carry, which is ample for a
    // line the GPU is about to rasterise.
    const line = energyLine(-0.02, 2.1, 30);
    expect(line[1]).toBeCloseTo(-0.02, 7);
    expect(line[4]).toBeCloseTo(-0.02, 7);
  });
});

describe('the energy line and its crossings', () => {
  it('finds turning points where V_eff equals the energy', () => {
    const L = 5;
    for (const energy of [-0.03, -0.02, -0.01]) {
      for (const r of energyCrossings(energy, M, L)) {
        expect(effectivePotential(r, M, L)).toBeCloseTo(energy, 8);
      }
    }
  });

  it('brackets a bound orbit between two turning points', () => {
    const L = 5;
    const readout = circularOrbitReadout(M, L);
    // Just above the minimum: +0.003 puts the OUTER turning point beyond the 30M plot window,
    // so the window would honestly report one crossing, not two. The bracketing claim only makes
    // sense for an orbit that fits in the window.
    const energy = effectivePotential(readout.outer, M, L) + 0.001;
    const crossings = energyCrossings(energy, M, L).filter(r => r > 3);
    expect(crossings.length).toBeGreaterThanOrEqual(2);
    expect(Math.min(...crossings)).toBeLessThan(readout.outer);
    expect(Math.max(...crossings)).toBeGreaterThan(readout.outer);
  });

  it('does not report a crossing the particle cannot reach past the barrier', () => {
    // A crossing on the far side of the barrier belongs to a different trajectory. At the
    // default settings it sits near 2.5 M while the particle never comes inside 12 M.
    const L = 1.15 * L_ISCO;
    const readout = circularOrbitReadout(M, L);
    const minimum = effectivePotential(readout.outer, M, L);
    const energy = minimum / 2;
    const barrier = effectivePotential(readout.inner, M, L);
    expect(energy).toBeLessThan(barrier);
    for (const r of energyCrossings(energy, M, L)) {
      expect(r).toBeGreaterThan(readout.inner);
    }
    // The unfiltered search does find one inside, which is what makes the filter necessary.
    const raw = energyCrossings(energy, M, L * 1.0);
    expect(raw.every(r => r > readout.inner)).toBe(true);
  });

  it('reports no turning points at all once the energy clears the barrier', () => {
    // Which is exactly why the particle plunges: above the barrier peak there is nothing left in
    // the window for the radial motion to turn against.
    const L = 1.15 * L_ISCO;
    const readout = circularOrbitReadout(M, L);
    const barrier = effectivePotential(readout.inner, M, L);
    expect(energyCrossings(barrier + 0.01, M, L)).toHaveLength(0);
    // Just below it there is still an outer turning point to come back from.
    expect(energyCrossings(barrier - 0.005, M, L).length).toBeGreaterThan(0);
  });

  it('reports one crossing, not two, when the outer turning point is off the plot', () => {
    // The window is a drawing choice; the explorer must not claim a turning point it cannot show.
    const L = 5;
    const readout = circularOrbitReadout(M, L);
    const energy = effectivePotential(readout.outer, M, L) + 0.003;
    expect(energyCrossings(energy, M, L).filter(r => r > 3)).toHaveLength(1);
  });

  it('reports that no circular orbit exists below L_ISCO', () => {
    expect(circularOrbitReadout(M, 3).exists).toBe(false);
    expect(circularOrbitReadout(M, L_ISCO).exists).toBe(true);
    expect(circularOrbitReadout(M, L_ISCO).atIsco).toBe(true);
    expect(circularOrbitReadout(M, 5).atIsco).toBe(false);
    // At L_ISCO the two orbits have merged.
    const merged = circularOrbitReadout(M, L_ISCO);
    expect(merged.inner).toBeCloseTo(6, 8);
    expect(merged.outer).toBeCloseTo(6, 8);
  });
});

describe('the integrated test particle', () => {
  it('launches tangentially with exactly the requested angular momentum', () => {
    const run = new OrbitRun(M, 12, 4.2);
    expect(run.angularMomentum).toBeCloseTo(4.2, 12);
    expect(run.radius).toBeCloseTo(12, 12);
    expect(run.position.y).toBe(0);
  });

  it('holds a circular orbit at the stable radius, to a part in 1e-4 over 20,000 steps', () => {
    // Launched at the potential minimum with that L, the orbit should not migrate.
    const L = 5;
    const circular = circularOrbitReadout(M, L).outer;
    const run = new OrbitRun(M, circular, L);
    for (let i = 0; i < 20_000; i++) run.step(0.2);
    expect(Math.abs(run.radius / circular - 1)).toBeLessThan(1e-4);
    expect(run.orbitClass).toBe('bound');
  });

  it('conserves energy over a long run, which is why the integrator is symplectic', () => {
    const run = new OrbitRun(M, 20, 5.2);
    const initial = run.energy;
    for (let i = 0; i < 40_000; i++) run.step(0.2);
    // Symplectic: the energy error stays bounded and oscillatory rather than drifting.
    expect(Math.abs(run.energy - initial)).toBeLessThan(1e-6);
  });

  it('classifies bound, unbound and marginal by energy', () => {
    expect(new OrbitRun(M, 20, 5.2).orbitClass).toBe('bound');
    // A large tangential speed unbinds it.
    const fast = new OrbitRun(M, 20, 20);
    expect(fast.energy).toBeGreaterThan(0);
    expect(fast.orbitClass).toBe('unbound');
  });

  it('falls in when no circular orbit exists, and stops at the horizon', () => {
    // Below L_ISCO the barrier is gone: every trajectory is captured.
    const run = new OrbitRun(M, 12, 2);
    for (let i = 0; i < 200_000 && !run.captured; i++) run.step(0.05);
    expect(run.captured).toBe(true);
    expect(run.radius).toBeLessThanOrEqual(2 * M + 1e-6);
    // Stepping after capture is a no-op rather than integrating through the horizon.
    const frozen = run.radius;
    run.step(0.05);
    expect(run.radius).toBe(frozen);
  });

  it('keeps a fading trail bounded in length', () => {
    const run = new OrbitRun(M, 15, 5, { maxTrail: 50 });
    for (let i = 0; i < 400; i++) run.step(0.1);
    expect(run.trail.length).toBe(50);
    const vertices = run.trailVertices();
    expect(vertices.length).toBe(50 * 3);
    // Age runs 0 (oldest) to 1 (newest), which is what the fade reads.
    expect(vertices[2]).toBeCloseTo(0, 9);
    expect(vertices[vertices.length - 1]).toBeCloseTo(1, 9);
  });

  it('closes a Newtonian orbit and precesses a relativistic one at the same L', () => {
    const startRadius = 60;
    const L = Math.sqrt(M * startRadius) * 1.02;
    const advance = (relativistic: boolean) => {
      const run = new OrbitRun(M, startRadius, L, { relativistic, maxTrail: 10 });
      const angles: number[] = [];
      let previous = run.radius;
      let beforeThat = Number.POSITIVE_INFINITY;
      for (let i = 0; i < 300_000 && angles.length < 4; i++) {
        run.step(0.2);
        const r = run.radius;
        if (previous < beforeThat && previous < r) {
          angles.push(Math.atan2(run.position.y, run.position.x));
        }
        beforeThat = previous;
        previous = r;
      }
      const deltas = angles.slice(1).map((angle, i) => {
        let d = angle - angles[i]!;
        while (d < -Math.PI) d += 2 * Math.PI;
        while (d > Math.PI) d -= 2 * Math.PI;
        return d;
      });
      return deltas.reduce((a, b) => a + b, 0) / Math.max(deltas.length, 1);
    };
    expect(Math.abs(advance(false))).toBeLessThan(2e-3);
    expect(advance(true)).toBeGreaterThan(0.02);
  });

  it('rejects a start at the centre', () => {
    expect(() => new OrbitRun(M, 0, 4)).toThrow(RangeError);
  });
});

describe('the spoken summary', () => {
  it('says outright that no circular orbits exist below L_ISCO', () => {
    const text = describeState(M, 3, -0.02, null);
    expect(text).toContain('no circular orbits at all');
    expect(text).toContain('not merely no stable ones');
  });

  it('states the circular radii and the turning points when they exist', () => {
    const text = describeState(M, 5, -0.02, null);
    expect(text).toContain('Stable circular orbit');
    expect(text).toContain('Turning points');
    expect(text).not.toMatch(/NaN|undefined/);
  });

  it('describes the particle when one is running', () => {
    const run = new OrbitRun(M, 15, 5);
    const text = describeState(M, 5, run.energy, run);
    expect(text).toMatch(/bound|unbound|marginal/);
    expect(text).not.toMatch(/NaN|undefined/);
  });
});
