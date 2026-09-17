import { describe, expect, it } from 'vitest';
import {
  JUPITER_TO_EARTH,
  MERCURY_YEAR_RATIO,
  MIN_SEPARATION,
  MOON_TO_EARTH,
  SIM_LIGHT_SPEED,
  SUN_TO_EARTH,
  accelerations,
  binary,
  circularSpeed,
  escapeSpeed,
  findAbsorptions,
  orbitalPeriod,
  petersEnergyLossRate,
  petersMergerTime,
  presets,
  radiationReaction,
  relativisticFraction,
  totalEnergy,
  totalMomentum,
  type Body,
  zeroMomentum,
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
      const c2 = SIM_LIGHT_SPEED ** 2;
      expect(extra).toBeCloseTo(-(3 * mass * h * h * 3) / (3 ** 5 * c2), 12);
      // The literal 3/2 form agrees only at M = 1/2, which is why the slip survives a
      // Schwarzschild-shader check and nothing else.
      const literal = -(1.5 * h * h * 3) / (3 ** 5 * c2);
      if (mass === 0.5) expect(extra).toBeCloseTo(literal, 12);
      else expect(extra / literal).toBeCloseTo(2 * mass, 10);
    }
  });

  it('makes the correction grow inward, not outward', () => {
    // The whole validity argument of §2.6 in one assertion: 3h²/(c²r²), with h² = GMr for a
    // near-circular orbit, is 3GM/(rc²) — biggest close in.
    let previous = Number.POSITIVE_INFINITY;
    for (const radius of [3, 10, 30, 100, 1000]) {
      const speed = circularSpeed(radius, 1);
      const bodies = [make({ mass: 1, x: 0, y: 0 }), make({ mass: 0, x: radius, y: 0, vy: speed })];
      const fraction = relativisticFraction(bodies, 1);
      expect(fraction).toBeCloseTo(3 / (radius * SIM_LIGHT_SPEED ** 2), 9);
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

  it('keeps the sandbox inside the expansion at the scales it draws', () => {
    // With c implicit at 1 the binary-hole preset's "correction" is 1000% of the Newtonian term
    // and the expansion has failed outright. SIM_LIGHT_SPEED is what puts it back at 10%.
    for (const preset of presets()) {
      let worst = 0;
      for (let i = 0; i < preset.bodies.length; i++) {
        worst = Math.max(worst, relativisticFraction(preset.bodies, i));
      }
      expect(worst, preset.id).toBeLessThan(0.2);
    }
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

  it('keeps those ratios exact with the Sun as the unit, not the Earth', () => {
    // Normalising to the Sun is what makes the preset integrable at the fixed step; the ratios
    // it exists to show must survive the change of unit exactly.
    const solar = presets().find(p => p.id === 'sun-earth-jupiter')!.bodies;
    const [sun, earth, jupiter] = solar;
    expect(sun!.mass / earth!.mass).toBeCloseTo(SUN_TO_EARTH, 4);
    expect(jupiter!.mass / earth!.mass).toBeCloseTo(JUPITER_TO_EARTH, 8);
    expect(sun!.mass).toBeCloseTo(1, 6);
  });

  it('says in every note which quantities are to scale and which are not', () => {
    for (const preset of presets()) {
      expect(preset.note.length).toBeGreaterThan(40);
      expect(preset.bodies.length).toBeGreaterThan(1);
    }
    expect(presets().find(p => p.id === 'sun-earth-jupiter')!.note).toContain('not');
    // This note used to say the sandbox had no gravitational radiation. It has, now, so the
    // note says what the conservative correction can and cannot do instead.
    expect(presets().find(p => p.id === 'binary-holes')!.note).toContain('conservative');
    expect(presets().find(p => p.id === 'inspiral')!.note).toContain('Peters');
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

describe('quadrupole radiation reaction', () => {
  const rate = (bodies: Body[]) => {
    const velocities = Float64Array.from(bodies.flatMap(b => [b.vx, b.vy]));
    const out = new Float64Array(bodies.length * 2);
    radiationReaction(bodies, velocities, out);
    // dE/dt = sum m_i v_i . a_i, which for a reactive force is the radiated power.
    let power = 0;
    bodies.forEach((b, i) => {
      power += b.mass * (b.vx * out[i * 2]! + b.vy * out[i * 2 + 1]!);
    });
    return { out, power };
  };

  const circular = (massA: number, massB: number, separation: number) =>
    zeroMomentum(binary(massA, massB, separation));

  it('reproduces Peters’ circular energy-loss rate exactly', () => {
    // The gate on the whole term: get any coefficient wrong and this misses.
    for (const [a, b, r] of [[10, 10, 6], [10, 2, 3], [1, 1, 12]] as const) {
      const { power } = rate(circular(a, b, r));
      expect(power).toBeCloseTo(petersEnergyLossRate(a, b, r), 12);
      expect(power).toBeLessThan(0);
    }
  });

  it('takes energy out and never puts it in', () => {
    const bodies = circular(10, 2, 3);
    expect(rate(bodies).power).toBeLessThan(0);
    // ...at every separation, not just one.
    for (const r of [1, 2, 4, 8, 16]) expect(rate(circular(10, 2, r)).power).toBeLessThan(0);
  });

  it('conserves momentum: the two reactive forces are equal and opposite', () => {
    const bodies = circular(10, 2, 3);
    const { out } = rate(bodies);
    const fx = bodies.reduce((sum, b, i) => sum + b.mass * out[i * 2]!, 0);
    const fy = bodies.reduce((sum, b, i) => sum + b.mass * out[i * 2 + 1]!, 0);
    expect(Math.abs(fx)).toBeLessThan(1e-18);
    expect(Math.abs(fy)).toBeLessThan(1e-18);
  });

  it('falls off as a^-5 in the power and so as a^4 in the merger time', () => {
    const near = rate(circular(10, 10, 3)).power;
    const far = rate(circular(10, 10, 6)).power;
    expect(near / far).toBeCloseTo(2 ** 5, 6);
    expect(petersMergerTime(10, 10, 6) / petersMergerTime(10, 10, 3)).toBeCloseTo(2 ** 4, 12);
  });

  it('vanishes for a lone body and for a massless companion', () => {
    const out = new Float64Array(4);
    radiationReaction(
      [{ mass: 10, x: 0, y: 0, vx: 0, vy: 0, absorbRadius: 0, kind: 'hole' },
        { mass: 0, x: 3, y: 0, vx: 0, vy: 1, absorbRadius: 0, kind: 'test' }],
      Float64Array.from([0, 0, 0, 1]), out,
    );
    expect(Array.from(out)).toEqual([0, 0, 0, 0]);
  });

  it('is what makes an inspiral an inspiral: the conservative term alone cannot shrink an orbit', () => {
    // PHYSICS_SPEC §2.10. The §2.6 correction is conservative; run it for many orbits and the
    // separation comes back.
    const bodies = circular(10, 2, 3);
    const velocities = new Float64Array(4);
    const out = new Float64Array(4);
    bodies.forEach((b, i) => { velocities[i * 2] = b.vx; velocities[i * 2 + 1] = b.vy; });
    accelerations(bodies, out, true, velocities);
    // The conservative correction is purely radial: no component along v for a circular orbit.
    const alongVelocity = bodies.reduce(
      (sum, b, i) => sum + b.mass * (b.vx * out[i * 2]! + b.vy * out[i * 2 + 1]!), 0,
    );
    expect(Math.abs(alongVelocity)).toBeLessThan(1e-12);
    // Radiation reaction, by contrast, is almost entirely along -v.
    expect(rate(bodies).power).toBeLessThan(-1e-6);
  });
});

describe('the new presets', () => {
  const find = (id: string) => presets().find(entry => entry.id === id)!;

  it('places the inner planets at exact ratios of radius and of period', () => {
    const inner = find('inner-planets');
    expect(inner.bodies).toHaveLength(5);
    const [sun, mercury, venus, earth, mars] = inner.bodies as [Body, Body, Body, Body, Body];
    expect(sun.mass).toBe(1);
    // Masses from measured GM, normalised to the Sun.
    expect(mercury.mass).toBeCloseTo(1.6601e-7, 10);
    expect(venus.mass).toBeCloseTo(2.4478e-6, 9);
    expect(earth.mass).toBeCloseTo(3.0035e-6, 9);
    expect(mars.mass).toBeCloseTo(3.2271e-7, 10);
    // Radius ratios are the real ones, because one factor scales them all.
    const radius = (b: Body) => Math.hypot(b.x - sun.x, b.y - sun.y);
    expect(radius(mercury) / radius(earth)).toBeCloseTo(0.387_098_93 / 1.000_000_11, 9);
    expect(radius(mars) / radius(earth)).toBeCloseTo(1.523_662_31 / 1.000_000_11, 9);
  });

  it('gives Mercury a year 0.2408 of Earth’s, as Kepler’s third law requires', () => {
    expect(MERCURY_YEAR_RATIO).toBeCloseTo(0.2408, 4);
    const inner = find('inner-planets').bodies;
    const [sun, mercury, , earth] = inner as [Body, Body, Body, Body];
    const period = (b: Body) => orbitalPeriod(Math.hypot(b.x - sun.x, b.y - sun.y), 1);
    expect(period(mercury) / period(earth)).toBeCloseTo(MERCURY_YEAR_RATIO, 9);
  });

  it('starts the figure eight at the published initial conditions', () => {
    const eight = find('figure-eight').bodies;
    expect(eight).toHaveLength(3);
    expect(eight.every(b => b.mass === 1)).toBe(true);
    const [a, b, c] = eight as [Body, Body, Body];
    expect(a.x).toBeCloseTo(0.97000436, 8);
    expect(a.y).toBeCloseTo(-0.24308753, 8);
    expect(b.x).toBeCloseTo(-a.x, 12);
    expect(b.y).toBeCloseTo(-a.y, 12);
    expect(c.x).toBe(0);
    expect(c.y).toBe(0);
    // The third body carries minus twice the others' velocity, which is what zeroes the momentum.
    expect(c.vx).toBeCloseTo(-0.93240737, 8);
    expect(c.vy).toBeCloseTo(-0.86473146, 8);
    const momentum = totalMomentum(eight);
    expect(Math.abs(momentum.x)).toBeLessThan(1e-15);
    expect(Math.abs(momentum.y)).toBeLessThan(1e-15);
  });

  it('gives the inspiral a merger time Peters can be asked to confirm', () => {
    const inspiral = find('inspiral').bodies;
    expect(inspiral).toHaveLength(2);
    const separation = Math.hypot(
      inspiral[0]!.x - inspiral[1]!.x, inspiral[0]!.y - inspiral[1]!.y,
    );
    expect(separation).toBeCloseTo(3, 12);
    expect(petersMergerTime(10, 2, 3)).toBeCloseTo(659.18, 1);
    // Long enough to watch and short enough to finish: tens of orbits, not thousands.
    const orbits = petersMergerTime(10, 2, 3) / orbitalPeriod(3, 12);
    expect(orbits).toBeGreaterThan(20);
    expect(orbits).toBeLessThan(200);
  });

  it('keeps every preset momentum-free, so nothing drifts off screen', () => {
    for (const preset of presets()) {
      const momentum = totalMomentum(preset.bodies);
      expect(Math.hypot(momentum.x, momentum.y), preset.id).toBeLessThan(1e-12);
    }
  });
});
