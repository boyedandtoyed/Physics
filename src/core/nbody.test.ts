import { describe, expect, it } from 'vitest';
import {
  MIN_SEPARATION,
  MOON_TO_EARTH,
  JUPITER_TO_EARTH,
  SUN_TO_EARTH,
  accelerations,
  binary,
  circularSpeed,
  escapeSpeed,
  findAbsorptions,
  orbitalPeriod,
  presets,
  relativisticFraction,
  totalEnergy,
  zeroMomentum,
  totalMomentum,
  type Body,
} from './nbody';
import { createYoshida4 } from './integrators/symplectic';

const make = (partial: Partial<Body> & Pick<Body, 'mass' | 'x' | 'y'>): Body =>
  ({ vx: 0, vy: 0, absorbRadius: 0, kind: 'planet', ...partial });

/** Pack bodies into the flat arrays the integrator wants, step, and unpack. */
function run(bodies: Body[], dt: number, steps: number, relativistic = false): Body[] {
  const state = bodies.map(b => ({ ...b }));
  const q = new Float64Array(state.length * 2);
  const v = new Float64Array(state.length * 2);
  state.forEach((b, i) => {
    q[i * 2] = b.x; q[i * 2 + 1] = b.y; v[i * 2] = b.vx; v[i * 2 + 1] = b.vy;
  });
  const stepper = createYoshida4(state.length * 2);
  const force = (position: Float64Array, out: Float64Array) => {
    state.forEach((b, i) => { b.x = position[i * 2]!; b.y = position[i * 2 + 1]!; });
    accelerations(state, out, relativistic, v);
  };
  for (let step = 0; step < steps; step++) stepper.step(q, v, dt, force);
  state.forEach((b, i) => {
    b.x = q[i * 2]!; b.y = q[i * 2 + 1]!; b.vx = v[i * 2]!; b.vy = v[i * 2 + 1]!;
  });
  return state;
}

describe('the force law', () => {
  it('is an inverse square on the pair, with G = 1', () => {
    const bodies = [make({ mass: 4, x: 0, y: 0 }), make({ mass: 0, x: 2, y: 0 })];
    const out = new Float64Array(4);
    accelerations(bodies, out);
    // The test particle feels 4/2² = 1, inward.
    expect(out[2]).toBeCloseTo(-1, 12);
    expect(out[3]).toBeCloseTo(0, 12);
    // The massive body feels nothing from a massless one.
    expect(out[0]).toBe(0);
    expect(out[1]).toBe(0);
  });

  it('uses a 3Gm coefficient for the correction, not 3/2', () => {
    // PHYSICS_SPEC §2.6. −3/2 h²r/r⁵ is the r_s = 1 specialisation, where M = 1/2.
    for (const mass of [0.5, 1, 10]) {
      const bodies = [
        make({ mass, x: 0, y: 0 }),
        make({ mass: 0, x: 3, y: 0, vy: 2 }),
      ];
      const newtonian = new Float64Array(4);
      const corrected = new Float64Array(4);
      const velocities = Float64Array.from([0, 0, 0, 2]);
      accelerations(bodies, newtonian, false);
      accelerations(bodies, corrected, true, velocities);
      const extra = corrected[2]! - newtonian[2]!;
      const h = 3 * 2; // r × v for the test particle relative to the centre
      expect(extra).toBeCloseTo(-(3 * mass * h * h * 3) / 3 ** 5, 12);
      // The literal 3/2 form agrees only at M = 1/2, which is why the slip survives a
      // Schwarzschild-shader check and nothing else.
      const literal = -(1.5 * h * h * 3) / 3 ** 5;
      if (mass === 0.5) expect(extra).toBeCloseTo(literal, 12);
      else expect(extra / literal).toBeCloseTo(2 * mass, 10);
    }
  });

  it('makes the correction grow inward, not outward', () => {
    // The whole validity argument of §2.6 in one assertion: 3h²/r², with h² = GMr for a
    // near-circular orbit, is 3GM/r — biggest close in.
    let previous = Number.POSITIVE_INFINITY;
    for (const radius of [3, 10, 30, 100, 1000]) {
      const speed = circularSpeed(radius, 1);
      const bodies = [make({ mass: 1, x: 0, y: 0 }), make({ mass: 0, x: radius, y: 0, vy: speed })];
      const fraction = relativisticFraction(bodies, 1);
      expect(fraction).toBeCloseTo(3 / radius, 9);
      expect(fraction).toBeLessThan(previous);
      previous = fraction;
    }
  });

  it('vanishes identically for radial motion, where h = 0', () => {
    const bodies = [make({ mass: 5, x: 0, y: 0 }), make({ mass: 0, x: 4, y: 0, vx: -1 })];
    const newtonian = new Float64Array(4);
    const corrected = new Float64Array(4);
    accelerations(bodies, newtonian, false);
    accelerations(bodies, corrected, true, Float64Array.from([0, 0, -1, 0]));
    expect(corrected[2]).toBe(newtonian[2]);
    expect(corrected[3]).toBe(newtonian[3]);
  });

  it('refuses two bodies on top of each other rather than returning infinity', () => {
    const bodies = [make({ mass: 1, x: 0, y: 0 }), make({ mass: 1, x: 0, y: 0 })];
    expect(() => accelerations(bodies, new Float64Array(4))).toThrow(RangeError);
    expect(() => accelerations(
      [make({ mass: 1, x: 0, y: 0 }), make({ mass: 1, x: MIN_SEPARATION / 2, y: 0 })],
      new Float64Array(4),
    )).toThrow(RangeError);
  });

  it('refuses the relativistic term without velocities, rather than reading zeros', () => {
    const bodies = [make({ mass: 1, x: 0, y: 0 }), make({ mass: 0, x: 3, y: 0 })];
    expect(() => accelerations(bodies, new Float64Array(4), true)).toThrow(RangeError);
  });
});

describe('Yoshida-4 on the sandbox force', () => {
  const RADIUS = 3;
  const MASS = 1;
  const PERIOD = orbitalPeriod(RADIUS, MASS);
  const STEPS_PER_ORBIT = 512;

  it('gives the Kepler period the sandbox is stepped against', () => {
    expect(PERIOD).toBeCloseTo(2 * Math.PI * Math.sqrt(27), 12);
  });

  it('closes a circular orbit at r = 3 to 0.1% over ten orbits', () => {
    const start: Body[] = [
      make({ mass: MASS, x: 0, y: 0 }),
      make({ mass: 0, x: RADIUS, y: 0, vy: circularSpeed(RADIUS, MASS) }),
    ];
    const end = run(start, PERIOD / STEPS_PER_ORBIT, STEPS_PER_ORBIT * 10);
    const particle = end[1]!;
    expect(Math.hypot(particle.x, particle.y)).toBeCloseTo(RADIUS, 2);
    // Back where it started, not merely at the right radius.
    expect(Math.hypot(particle.x - RADIUS, particle.y)).toBeLessThan(RADIUS * 1e-3);
  });

  it('holds the energy to 1e-8 over 100 steps, which is why it is symplectic', () => {
    const bodies: Body[] = [
      make({ mass: 1, x: -1, y: 0, vy: -0.35 }),
      make({ mass: 1, x: 1, y: 0, vy: 0.35 }),
      make({ mass: 0.1, x: 0, y: 4, vx: 0.4 }),
    ];
    const before = totalEnergy(bodies);
    const after = totalEnergy(run(bodies, 0.01, 100));
    expect(Math.abs((after - before) / before)).toBeLessThan(1e-8);
  });

  it('does not let that drift grow secularly over 10⁵ steps', () => {
    const bodies: Body[] = [
      make({ mass: MASS, x: 0, y: 0 }),
      make({ mass: 1e-3, x: RADIUS, y: 0, vy: circularSpeed(RADIUS, MASS) }),
    ];
    const before = totalEnergy(bodies);
    const after = totalEnergy(run(bodies, PERIOD / STEPS_PER_ORBIT, 100_000));
    expect(Math.abs((after - before) / before)).toBeLessThan(1e-8);
  });

  it('loses that guarantee with the correction on, measurably — which is the point', () => {
    // §2.6: h is read from the current velocities, so the force is velocity-dependent and
    // `createSymplectic`'s contract no longer holds. Asserted rather than asserted-away.
    const seed = (): Body[] => [
      make({ mass: 1, x: 0, y: 0 }),
      make({ mass: 1e-3, x: RADIUS, y: 0, vy: circularSpeed(RADIUS, MASS) * 0.8 }),
    ];
    const dt = PERIOD / STEPS_PER_ORBIT;
    const newtonianDrift = Math.abs(
      (totalEnergy(run(seed(), dt, 20_000)) - totalEnergy(seed())) / totalEnergy(seed()));
    const relativisticDrift = Math.abs(
      (totalEnergy(run(seed(), dt, 20_000, true)) - totalEnergy(seed())) / totalEnergy(seed()));
    expect(newtonianDrift).toBeLessThan(1e-8);
    expect(relativisticDrift).toBeGreaterThan(newtonianDrift * 10);
  });

  it('conserves momentum exactly under the Newtonian force', () => {
    const bodies: Body[] = [
      make({ mass: 2, x: -2, y: 0, vy: -0.3 }),
      make({ mass: 3, x: 2, y: 1, vy: 0.2 }),
      make({ mass: 1, x: 0, y: -3, vx: 0.5 }),
    ];
    const before = totalMomentum(bodies);
    const after = totalMomentum(run(bodies, 0.005, 4000));
    expect(after.x).toBeCloseTo(before.x, 10);
    expect(after.y).toBeCloseTo(before.y, 10);
  });
});

describe('the presets', () => {
  it('builds the Earth–Moon ratio from measured GM, not a rounded mass', () => {
    expect(MOON_TO_EARTH).toBeCloseTo(0.01230, 5);
    const earthMoon = presets().find(preset => preset.id === 'earth-moon')!;
    expect(earthMoon.bodies[1]!.mass / earthMoon.bodies[0]!.mass).toBeCloseTo(0.01230, 5);
  });

  it('gets the Sun and Jupiter ratios right too', () => {
    expect(SUN_TO_EARTH).toBeCloseTo(332946, 0);
    expect(JUPITER_TO_EARTH).toBeCloseTo(317.83, 2);
  });

  it('says in every note which quantities are to scale and which are not', () => {
    for (const preset of presets()) {
      expect(preset.note.length).toBeGreaterThan(40);
      expect(preset.bodies.length).toBeGreaterThan(1);
    }
    expect(presets().find(p => p.id === 'sun-earth-jupiter')!.note).toContain('not');
    expect(presets().find(p => p.id === 'binary-holes')!.note).toContain('no gravitational radiation');
  });

  it('boosts to the barycentre frame, which is a Galilean boost and changes nothing', () => {
    const bodies: Body[] = [
      make({ mass: 3, x: 1, y: 2, vx: 0.4, vy: -0.1 }),
      make({ mass: 1, x: -4, y: 0, vx: 0.2, vy: 0.9 }),
    ];
    const boosted = zeroMomentum(bodies);
    const momentum = totalMomentum(boosted);
    expect(Math.hypot(momentum.x, momentum.y)).toBeCloseTo(0, 12);
    // Separations and relative velocities are untouched: the physics is the same physics.
    expect(Math.hypot(boosted[0]!.x - boosted[1]!.x, boosted[0]!.y - boosted[1]!.y))
      .toBeCloseTo(Math.hypot(bodies[0]!.x - bodies[1]!.x, bodies[0]!.y - bodies[1]!.y), 12);
    expect(boosted[0]!.vx - boosted[1]!.vx).toBeCloseTo(bodies[0]!.vx - bodies[1]!.vx, 12);
    expect(totalEnergy(boosted)).toBeLessThan(totalEnergy(bodies) + 1e-12);
  });

  it('starts every preset with zero net momentum, so nothing drifts off screen', () => {
    for (const preset of presets()) {
      const momentum = totalMomentum(preset.bodies);
      const scale = preset.bodies.reduce((sum, b) => sum + b.mass, 0);
      expect(Math.hypot(momentum.x, momentum.y) / scale).toBeLessThan(1e-9);
    }
  });

  it('keeps every preset bound and on station for ten orbits', () => {
    for (const preset of presets()) {
      const spread = (bodies: Body[]) =>
        Math.max(...bodies.map(b => Math.hypot(b.x, b.y)));
      const before = spread(preset.bodies);
      const after = spread(run(preset.bodies, 0.002, 40_000));
      expect(after).toBeLessThan(before * 3);
      expect(after).toBeGreaterThan(before / 3);
    }
  });

  it('puts the two black holes on a genuine mutual circular orbit', () => {
    const [a, b] = binary(10, 10, 6);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeCloseTo(6, 12);
    // Equal masses: the barycentre is midway and the speeds are equal and opposite.
    expect(a.x).toBeCloseTo(-b.x, 12);
    expect(a.vy).toBeCloseTo(-b.vy, 12);
    const bodies = [{ ...a, absorbRadius: 0, kind: 'hole' }, { ...b, absorbRadius: 0, kind: 'hole' }];
    const after = run(bodies, 0.002, 20_000);
    expect(Math.hypot(after[0]!.x - after[1]!.x, after[0]!.y - after[1]!.y)).toBeCloseTo(6, 2);
  });

  it('builds an unequal binary with the barycentre at rest', () => {
    const [a, b] = binary(10, 1, 4);
    expect(10 * a.vy + 1 * b.vy).toBeCloseTo(0, 12);
    expect(10 * a.x + 1 * b.x).toBeCloseTo(0, 12);
  });
});

describe('absorption and the trail colouring', () => {
  it('removes what falls inside an absorb radius, and nothing else', () => {
    const bodies: Body[] = [
      make({ mass: 10, x: 0, y: 0, absorbRadius: 0.5, kind: 'hole' }),
      make({ mass: 0.001, x: 0.3, y: 0 }),
      make({ mass: 0.001, x: 5, y: 0 }),
    ];
    expect(findAbsorptions(bodies)).toEqual([1]);
  });

  it('never absorbs something heavier than the absorber', () => {
    const bodies: Body[] = [
      make({ mass: 1, x: 0, y: 0, absorbRadius: 2, kind: 'planet' }),
      make({ mass: 10, x: 0.3, y: 0, absorbRadius: 0.5, kind: 'hole' }),
    ];
    // The hole absorbs the planet; the planet does not absorb the hole.
    expect(findAbsorptions(bodies)).toEqual([0]);
  });

  it('gives the escape speed the trail colouring switches on', () => {
    // A circular orbit is at exactly 1/√2 of the local escape speed, at every radius.
    for (const radius of [2, 5, 20]) {
      const bodies = [
        make({ mass: 1, x: 0, y: 0 }),
        make({ mass: 0, x: radius, y: 0, vy: circularSpeed(radius, 1) }),
      ];
      expect(circularSpeed(radius, 1) / escapeSpeed(bodies, 1)).toBeCloseTo(Math.SQRT1_2, 12);
    }
  });

  it('adds up the potential of every body for the escape speed, not just the nearest', () => {
    const bodies: Body[] = [
      make({ mass: 1, x: -2, y: 0 }),
      make({ mass: 1, x: 2, y: 0 }),
      make({ mass: 0, x: 0, y: 0 }),
    ];
    expect(escapeSpeed(bodies, 2)).toBeCloseTo(Math.sqrt(2 * (1 / 2 + 1 / 2)), 12);
  });
});
