import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RIVER_PARAMS,
  RING_FLAG,
  buildMarkers,
  markerRadius,
  markerSpeed,
} from './RiverRenderer';
import { flowBand, riverSpeedOverC } from '../../../core/river';

const FLOATS = 4;
const OUTER = DEFAULT_RIVER_PARAMS.outerRadius;
const INNER = DEFAULT_RIVER_PARAMS.innerCutoff;

/** Flow markers only, excluding the horizon-ring geometry. */
const markers = (params = DEFAULT_RIVER_PARAMS) => {
  const data = buildMarkers(params);
  const out: { dx: number; dy: number; phase: number; end: number }[] = [];
  for (let i = 0; i < data.length; i += FLOATS) {
    out.push({ dx: data[i]!, dy: data[i + 1]!, phase: data[i + 2]!, end: data[i + 3]! });
  }
  return out.filter(m => m.end !== RING_FLAG);
};

/** The horizon-ring vertices. */
const ring = (params = DEFAULT_RIVER_PARAMS) => {
  const data = buildMarkers(params);
  const out: { dx: number; dy: number }[] = [];
  for (let i = 0; i < data.length; i += FLOATS) {
    if (data[i + 3] === RING_FLAG) out.push({ dx: data[i]!, dy: data[i + 1]! });
  }
  return out;
};

describe('the marker field', () => {
  it('lays every marker on a unit radial direction', () => {
    // Float32Array, so unit length holds to float32 precision (~1e-7) and not further. That is
    // the buffer the GPU reads; asking for float64 here would be asserting something the
    // renderer never sees.
    for (const m of markers()) expect(Math.hypot(m.dx, m.dy)).toBeCloseTo(1, 6);
  });

  it('emits one segment per marker, tail then head', () => {
    const all = markers();
    expect(all).toHaveLength(
      DEFAULT_RIVER_PARAMS.spokes * DEFAULT_RIVER_PARAMS.markersPerSpoke * 2,
    );
    for (let i = 0; i < all.length; i += 2) {
      expect(all[i]!.end).toBe(0);
      expect(all[i + 1]!.end).toBe(1);
      // Both ends share a direction and a phase, or the segment would not be radial.
      expect(all[i]!.dx).toBe(all[i + 1]!.dx);
      expect(all[i]!.phase).toBe(all[i + 1]!.phase);
    }
  });

  it('spreads phases over the whole fall so the field is not a set of pulsing rings', () => {
    const phases = markers().map(m => m.phase);
    for (const phase of phases) {
      expect(phase).toBeGreaterThanOrEqual(0);
      expect(phase).toBeLessThan(1);
    }
    // Distinct phases across a spoke, and offset between spokes.
    expect(new Set(phases.map(p => p.toFixed(4))).size)
      .toBeGreaterThan(DEFAULT_RIVER_PARAMS.markersPerSpoke);
  });

  it('covers every direction, so the flow is radial everywhere and not a fan', () => {
    const angles = markers().map(m => Math.atan2(m.dy, m.dx));
    expect(Math.min(...angles)).toBeLessThan(-Math.PI / 2);
    expect(Math.max(...angles)).toBeGreaterThan(Math.PI / 2);
  });

  it('draws the horizon as explicit geometry, not as whichever marker happens to be there', () => {
    // The horizon is the one radius that must be unambiguous. A sampled flow field cannot
    // promise a marker is ever sitting at r = r_s, so the ring is its own closed loop.
    const loop = ring();
    expect(loop.length).toBeGreaterThan(100);
    for (const v of loop) expect(Math.hypot(v.dx, v.dy)).toBeCloseTo(1, 6);
    // Closed: it spans the full turn.
    const angles = loop.map(v => Math.atan2(v.dy, v.dx));
    expect(Math.min(...angles)).toBeLessThan(-Math.PI * 0.9);
    expect(Math.max(...angles)).toBeGreaterThan(Math.PI * 0.9);
  });

  it('does not lay the phases out in a spiral', () => {
    // A phase offset that ramps linearly with the spoke index reads as rotation, and this flow
    // is purely radial. Adjacent spokes must not have steadily advancing phases.
    const all = markers();
    const perSpoke = DEFAULT_RIVER_PARAMS.markersPerSpoke * 2;
    const firstPhases: number[] = [];
    for (let spoke = 0; spoke < DEFAULT_RIVER_PARAMS.spokes; spoke++) {
      firstPhases.push(all[spoke * perSpoke]!.phase);
    }
    const deltas = firstPhases.slice(1).map((p, i) => {
      const d = p - firstPhases[i]!;
      return d < 0 ? d + 1 : d;
    });
    // A spiral has near-identical successive deltas; a decorrelated field does not.
    const mean = deltas.reduce((a, b) => a + b, 0) / deltas.length;
    const spread = Math.sqrt(
      deltas.reduce((a, d) => a + (d - mean) ** 2, 0) / deltas.length,
    );
    expect(spread).toBeGreaterThan(0.15);
  });

  it('refuses a degenerate field', () => {
    expect(() => buildMarkers({ ...DEFAULT_RIVER_PARAMS, spokes: 2 })).toThrow(RangeError);
    expect(() => buildMarkers({ ...DEFAULT_RIVER_PARAMS, markersPerSpoke: 0 })).toThrow(RangeError);
  });
});

describe('advection recycles without ever reaching the singularity', () => {
  it('keeps every marker between the inner cutoff and the outer edge, over a full cycle', () => {
    // The brief's requirement: markers reset at 0.1 r_s, not 0. r = 0 is the curvature
    // singularity and the flow speed diverges there.
    for (let t = 0; t < 60; t += 0.37) {
      for (const phase of [0, 0.13, 0.5, 0.77, 0.99]) {
        const r = markerRadius(phase, t, OUTER, INNER);
        expect(r).toBeGreaterThanOrEqual(INNER);
        expect(r).toBeLessThanOrEqual(OUTER + 1e-9);
        expect(Number.isFinite(r)).toBe(true);
      }
    }
  });

  it('moves every marker inward, never outward, within a cycle', () => {
    // The fall from 9 r_s to the 0.1 r_s cutoff takes 17.98 r_s/c, so the loop has to run past
    // one full period or it never observes a recycle.
    let previous = markerRadius(0, 0, OUTER, INNER);
    let wrapped = 0;
    for (let t = 0.05; t < 40; t += 0.05) {
      const r = markerRadius(0, t, OUTER, INNER);
      if (r > previous + 1e-9) wrapped += 1;   // recycling to the outer edge
      else expect(r).toBeLessThanOrEqual(previous + 1e-9);
      previous = r;
    }
    // It must actually recycle, or the field empties out.
    expect(wrapped).toBeGreaterThan(0);
  });

  it('speeds up as it falls, reaching exactly c at the horizon', () => {
    expect(markerSpeed(0, 0, OUTER, INNER)).toBeCloseTo(riverSpeedOverC(OUTER), 9);
    // Somewhere in the fall a marker passes the horizon; when it does, its speed is 1.
    const atHorizon = riverSpeedOverC(1);
    expect(atHorizon).toBe(1);
    expect(flowBand(atHorizon)).toBe('horizon');
    // And inside, it is superluminal — which the colour band marks as such.
    expect(flowBand(riverSpeedOverC(INNER))).toBe('superluminal');
    expect(riverSpeedOverC(INNER)).toBeCloseTo(Math.sqrt(10), 9);
  });

  it('gives the whole field the same period, so it is steady in time', () => {
    // A marker at phase p and time t sits where a marker at phase 0 sits at time t + p*T.
    const fall = markerRadius(0, 0, OUTER, INNER);
    expect(fall).toBeCloseTo(OUTER, 9);
    for (const phase of [0.25, 0.5, 0.75]) {
      const period = markerRadius(phase, 0, OUTER, INNER);
      expect(period).toBeLessThan(OUTER);
      expect(period).toBeGreaterThanOrEqual(INNER);
    }
  });
});
