import { describe, expect, it } from 'vitest';
import {
  CIRCULAR_FRACTION,
  FIXED_STEP,
  PALETTE,
  REFERENCE_MASS,
  REFERENCE_RADIUS,
  STEPS_PER_REFERENCE_ORBIT,
  TRAIL_LENGTH,
  addBody,
  advance,
  bandOf,
  bodyNear,
  bodyPoints,
  energyDrift,
  largestRelativisticFraction,
  removeBody,
  RESOLVED_STEPS_PER_ORBIT,
  stateFrom,
  stepsPerTightestOrbit,
  trailBands,
  velocityFromDrag,
} from './sandboxRun';
import {
  SIM_LIGHT_SPEED, circularSpeed, orbitalPeriod, presets, type Body,
} from '../../../core/nbody';

const make = (partial: Partial<Body> & Pick<Body, 'mass' | 'x' | 'y'>): Body =>
  ({ vx: 0, vy: 0, absorbRadius: 0, kind: 'planet', ...partial });

const orbit = (radius = REFERENCE_RADIUS): Body[] => [
  make({ mass: REFERENCE_MASS, x: 0, y: 0 }),
  make({ mass: 0, x: radius, y: 0, vy: circularSpeed(radius, REFERENCE_MASS), kind: 'test' }),
];

const run = (bodies: Body[], steps: number, relativistic = false) =>
  advance(stateFrom(bodies), steps, relativistic, 0);

describe('the step size', () => {
  it('is pinned to 512 steps for a circular orbit at r = 2, as the brief specifies', () => {
    expect(FIXED_STEP * STEPS_PER_REFERENCE_ORBIT)
      .toBeCloseTo(orbitalPeriod(REFERENCE_RADIUS, REFERENCE_MASS), 12);
    expect(STEPS_PER_REFERENCE_ORBIT).toBe(512);
  });

  it('brings that reference orbit back to where it started after exactly one period', () => {
    const after = run(orbit(), STEPS_PER_REFERENCE_ORBIT);
    const particle = after.bodies[1]!;
    expect(Math.hypot(particle.x - REFERENCE_RADIUS, particle.y))
      .toBeLessThan(REFERENCE_RADIUS * 1e-3);
  });
});

describe('placing and removing', () => {
  it('turns a drag into a velocity one-for-one, so a circular orbit is predictable', () => {
    // One sim unit of drag is one sim unit of speed. A reader who knows √(M/r) can aim for a
    // circle and check it, which is the point of not scaling the arrow.
    expect(velocityFromDrag(2, 0, 2, 0.5)).toEqual({ vx: 0, vy: 0.5 });
    const speed = circularSpeed(REFERENCE_RADIUS, REFERENCE_MASS);
    const placed = addBody(stateFrom([make({ mass: 1, x: 0, y: 0 })]), make({
      mass: 0, x: REFERENCE_RADIUS, y: 0, kind: 'test',
      ...velocityFromDrag(REFERENCE_RADIUS, 0, REFERENCE_RADIUS, speed),
    }));
    const after = advance(placed, STEPS_PER_REFERENCE_ORBIT, false, 0);
    expect(Math.hypot(after.bodies[1]!.x, after.bodies[1]!.y))
      .toBeCloseTo(REFERENCE_RADIUS, 2);
  });

  it('finds the body under a right-click, and nothing when the click misses', () => {
    const state = stateFrom([make({ mass: 1, x: 0, y: 0 }), make({ mass: 1, x: 5, y: 0 })]);
    expect(bodyNear(state, 4.9, 0.05, 0.3)).toBe(1);
    expect(bodyNear(state, 2.5, 0, 0.3)).toBe(-1);
  });

  it('keeps bodies and trails in step when one is removed', () => {
    let state = stateFrom([make({ mass: 1, x: 0, y: 0 }), make({ mass: 1, x: 5, y: 0 })]);
    state = advance(state, 10, false, 0);
    expect(state.trails).toHaveLength(2);
    state = removeBody(state, 0);
    expect(state.bodies).toHaveLength(1);
    expect(state.trails).toHaveLength(1);
    expect(state.bodies[0]!.x).toBeCloseTo(5, 0);
    expect(removeBody(state, 9)).toBe(state);
  });

  it('resets the energy reference when the set of bodies changes, since it must', () => {
    const state = addBody(stateFrom([make({ mass: 1, x: 0, y: 0 })]), make({ mass: 1, x: 4, y: 0 }));
    expect(energyDrift(state)).toBeCloseTo(0, 12);
  });

  it('offers a palette whose masses span four decades, including exactly zero', () => {
    expect(PALETTE.map(p => p.mass)).toEqual([1, 10, 0.001, 0]);
    for (const entry of PALETTE) expect(entry.hint.length).toBeGreaterThan(30);
  });
});

describe('stepping', () => {
  it('holds the energy to 1e-8 over 100 steps with the correction off', () => {
    const after = run(orbit(3), 100);
    expect(Math.abs(energyDrift(after))).toBeLessThan(1e-8);
  });

  it('keeps a trail no longer than 200 samples', () => {
    const after = run(orbit(), TRAIL_LENGTH * 3);
    for (const trail of after.trails) expect(trail.length).toBeLessThanOrEqual(TRAIL_LENGTH);
    expect(after.trails[1]!.length).toBe(TRAIL_LENGTH);
  });

  it('absorbs what falls into a black hole and leaves a notice behind', () => {
    const hole = PALETTE.find(p => p.kind === 'hole')!;
    const state = stateFrom([
      make({ mass: hole.mass, x: 0, y: 0, absorbRadius: hole.absorbRadius, kind: 'hole' }),
      make({ mass: 0, x: 1.2, y: 0, kind: 'test' }),
    ]);
    const after = advance(state, 4000, false, 0);
    expect(after.bodies).toHaveLength(1);
    expect(after.notices).toHaveLength(1);
    expect(after.notices[0]!.remaining).toBeGreaterThan(0);
  });

  it('expires the notice after two seconds of wall time', () => {
    const hole = PALETTE.find(p => p.kind === 'hole')!;
    let state = stateFrom([
      make({ mass: hole.mass, x: 0, y: 0, absorbRadius: hole.absorbRadius, kind: 'hole' }),
      make({ mass: 0, x: 1.2, y: 0, kind: 'test' }),
    ]);
    state = advance(state, 4000, false, 0);
    expect(state.notices).toHaveLength(1);
    state = advance(state, 1, false, 2.1);
    expect(state.notices).toHaveLength(0);
  });

  it('survives two bodies landing on top of each other, rather than filling with NaN', () => {
    // The force refuses a zero separation; the run must stop the step and clean up, not let a
    // NaN propagate into every other body through the next acceleration sum.
    const state = stateFrom([
      make({ mass: 1, x: 0, y: 0, absorbRadius: 0 }),
      make({ mass: 1, x: 1e-7, y: 0, absorbRadius: 0 }),
      make({ mass: 0, x: 6, y: 0, vy: circularSpeed(6, 2), kind: 'test' }),
    ]);
    const after = advance(state, 500, false, 0);
    for (const body of after.bodies) {
      expect(Number.isFinite(body.x)).toBe(true);
      expect(Number.isFinite(body.y)).toBe(true);
    }
  });

  it('runs every preset for 30 seconds of sim time without losing a body', () => {
    for (const preset of presets()) {
      const steps = Math.round(30 / FIXED_STEP);
      const after = advance(stateFrom(preset.bodies), steps, false, 0);
      expect(after.bodies, preset.id).toHaveLength(preset.bodies.length);
      expect(after.time).toBeCloseTo(steps * FIXED_STEP, 9);
    }
  });
});

describe('whether the fixed step resolves what is on screen', () => {
  it('gives the reference orbit exactly its 512 steps', () => {
    expect(stepsPerTightestOrbit(stateFrom(orbit(REFERENCE_RADIUS))))
      .toBeCloseTo(STEPS_PER_REFERENCE_ORBIT, 6);
  });

  it('resolves every preset comfortably', () => {
    for (const preset of presets()) {
      expect(stepsPerTightestOrbit(stateFrom(preset.bodies)), preset.id)
        .toBeGreaterThan(RESOLVED_STEPS_PER_ORBIT);
    }
  });

  it('would NOT have resolved the solar preset built on the Earth as the unit', () => {
    // The defect this replaced: with m_sun = 332946 the orbit at r = 3 gets 1.6 steps, and
    // Yoshida-4 draws a ten-sided polygon. The ratios are identical; only the unit changed.
    const earthUnit = stateFrom([
      make({ mass: 332946, x: 0, y: 0 }),
      make({ mass: 1, x: 3, y: 0, vy: circularSpeed(3, 332946) }),
    ]);
    expect(stepsPerTightestOrbit(earthUnit)).toBeLessThan(RESOLVED_STEPS_PER_ORBIT);
    expect(stepsPerTightestOrbit(earthUnit)).toBeCloseTo(1.6, 1);
  });

  it('warns when a hand-placed pair is too tight for the step', () => {
    const tight = stateFrom([
      make({ mass: 10, x: 0, y: 0, kind: 'hole' }),
      make({ mass: 0, x: 0.6, y: 0, vy: circularSpeed(0.6, 10), kind: 'test' }),
    ]);
    expect(stepsPerTightestOrbit(tight)).toBeLessThan(RESOLVED_STEPS_PER_ORBIT);
  });

  it('is infinite when there is nothing to resolve', () => {
    expect(stepsPerTightestOrbit(stateFrom([]))).toBe(Number.POSITIVE_INFINITY);
    expect(stepsPerTightestOrbit(stateFrom([make({ mass: 1, x: 0, y: 0 })])))
      .toBe(Number.POSITIVE_INFINITY);
  });
});

describe('the trail bands', () => {
  it('splits at the circular fraction, which is 1/√2 and not a tuned number', () => {
    expect(CIRCULAR_FRACTION).toBeCloseTo(Math.SQRT1_2, 15);
    expect(bandOf(0.5)).toBe('slow');
    expect(bandOf(0.71)).toBe('fast');
    expect(bandOf(1.0)).toBe('unbound');
    expect(bandOf(1.4)).toBe('unbound');
  });

  it('puts a circular orbit on the boundary between slow and fast, at every radius', () => {
    for (const radius of [2, 5, 20]) {
      const after = run(orbit(radius), 50);
      const sample = after.trails[1]!.at(-1)!;
      expect(sample.escapeFraction).toBeCloseTo(CIRCULAR_FRACTION, 6);
    }
  });

  it('marks an unbound body unbound', () => {
    const after = run([
      make({ mass: 1, x: 0, y: 0 }),
      make({ mass: 0, x: 3, y: 0, vy: circularSpeed(3, 1) * 2, kind: 'test' }),
    ], 50);
    expect(bandOf(after.trails[1]!.at(-1)!.escapeFraction)).toBe('unbound');
  });

  it('emits line pairs in three buffers, six floats per segment', () => {
    const after = run(orbit(), 60);
    const bands = trailBands(after);
    const total = bands.slow.length + bands.fast.length + bands.unbound.length;
    // Two bodies, 60 samples each, 59 segments each.
    expect(total).toBe(2 * 59 * 6);
    for (const buffer of Object.values(bands)) expect(buffer.length % 6).toBe(0);
  });

  it('groups the glyph points by palette kind', () => {
    const state = stateFrom([
      make({ mass: 10, x: 0, y: 0, kind: 'hole' }),
      make({ mass: 1, x: 3, y: 0, kind: 'planet' }),
      make({ mass: 1, x: -3, y: 0, kind: 'planet' }),
    ]);
    expect(bodyPoints(state, 'planet').length / 3).toBe(2);
    expect(bodyPoints(state, 'hole').length / 3).toBe(1);
    expect(bodyPoints(state, 'test').length).toBe(0);
  });
});

describe('the relativistic readout', () => {
  it('reports the largest fraction on screen, and it grows as the orbit tightens', () => {
    let previous = Number.POSITIVE_INFINITY;
    for (const radius of [3, 10, 40]) {
      const fraction = largestRelativisticFraction(stateFrom(orbit(radius)));
      expect(fraction).toBeCloseTo(3 / (radius * SIM_LIGHT_SPEED ** 2), 9);
      expect(fraction).toBeLessThan(previous);
      previous = fraction;
    }
  });

  it('is zero when nothing is moving, and for a lone body', () => {
    expect(largestRelativisticFraction(stateFrom([make({ mass: 1, x: 0, y: 0 })]))).toBe(0);
  });

  it('shows the drift the correction costs, rather than hiding it', () => {
    const start = [
      make({ mass: 1, x: 0, y: 0 }),
      make({ mass: 1e-3, x: 3, y: 0, vy: circularSpeed(3, 1) * 0.8, kind: 'satellite' }),
    ];
    const newtonian = Math.abs(energyDrift(run(start, 20_000)));
    const relativistic = Math.abs(energyDrift(run(start, 20_000, true)));
    expect(newtonian).toBeLessThan(1e-8);
    expect(relativistic).toBeGreaterThan(newtonian * 10);
  });
});
