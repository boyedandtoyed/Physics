import { describe, expect, it } from 'vitest';
import { createRK4 } from './rk4';
import { createVerlet, createYoshida4, YOSHIDA_W0, YOSHIDA_W1 } from './symplectic';

const oscillator = (_t: number, y: Float64Array, out: Float64Array) => {
  out[0] = y[1]!;
  out[1] = -y[0]!;
};

function trajectory(method: string, h: number, steps: number, reverse = false) {
  const q = new Float64Array([1]);
  const v = new Float64Array([0]);
  const y = new Float64Array([1, 0]);
  const rk = createRK4(2);
  const sym = method === 'Verlet' ? createVerlet(1) : createYoshida4(1);
  const acceleration = (position: Float64Array, out: Float64Array) => { out[0] = -position[0]!; };
  const advance = (dt: number) => {
    for (let i = 0; i < steps; i++) {
      if (method === 'RK4') rk.step(y, i * dt, dt, oscillator);
      else sym.step(q, v, dt, acceleration);
    }
  };
  advance(h);
  if (reverse) advance(-h);
  return method === 'RK4' ? Array.from(y) : [q[0]!, v[0]!];
}

describe.each([['RK4', 16], ['Verlet', 4], ['Yoshida', 16]] as const)('%s', (method, ratio) => {
  it('converges at its claimed global order', () => {
    const error = (steps: number) => {
      const [q, v] = trajectory(method, 1 / steps, steps);
      return Math.hypot(q! - Math.cos(1), v! + Math.sin(1));
    };
    expect(error(20) / error(40)).toBeGreaterThan(ratio * 0.95);
    expect(error(20) / error(40)).toBeLessThan(ratio * 1.05);
  });
  it('distinguishes symmetric methods from RK4 under time reversal', () => {
    const [q, v] = trajectory(method, 0.1, 100, true);
    const error = Math.hypot(q! - 1, v!);
    if (method === 'RK4') expect(error).toBeGreaterThan(1e-10);
    else expect(error).toBeLessThan(1e-10);
  });
});

it('retains the negative Yoshida substep', () => {
  expect(YOSHIDA_W0).toBeLessThan(0);
  expect(YOSHIDA_W0 + 2 * YOSHIDA_W1).toBeCloseTo(1, 14);
  expect(YOSHIDA_W0 ** 3 + 2 * YOSHIDA_W1 ** 3).toBeCloseTo(0, 14);
});

it('RK4 evaluates non-autonomous derivatives at the correct stage times', () => {
  const y = new Float64Array([0]);
  createRK4(1).step(y, 2, 0.5, (t, _y, out) => { out[0] = t ** 3; });
  expect(y[0]).toBeCloseTo((2.5 ** 4 - 2 ** 4) / 4, 14);
});

it.each([createVerlet, createYoshida4])('bounds oscillator energy over 1,000 periods', (create) => {
  const solver = create(1);
  const q = new Float64Array([1]);
  const v = new Float64Array([0]);
  let maxError = 0;
  for (let i = 0; i < 100_000; i++) {
    solver.step(q, v, 2 * Math.PI / 100, (x, a) => { a[0] = -x[0]!; });
    maxError = Math.max(maxError, Math.abs((q[0]! ** 2 + v[0]! ** 2) / 2 - 0.5));
  }
  expect(maxError).toBeLessThan(5e-4);
});

it.each([0, 0.3])('closes a Newtonian orbit with eccentricity %s', (e) => {
  const q = new Float64Array([1 - e, 0]);
  const v = new Float64Array([0, Math.sqrt((1 + e) / (1 - e))]);
  const initial = [...q, ...v];
  const solver = createYoshida4(2);
  let radialDrift = 0;
  for (let i = 0; i < 4096; i++) {
    solver.step(q, v, 2 * Math.PI / 4096, (x, a) => {
      const r = Math.hypot(...x);
      a[0] = -x[0]! / r ** 3;
      a[1] = -x[1]! / r ** 3;
    });
    radialDrift = Math.max(radialDrift, Math.abs(Math.hypot(...q) - 1));
  }
  expect(Math.hypot(...[...q, ...v].map((x, i) => x - initial[i]!))).toBeLessThan(1e-8);
  if (e === 0) expect(radialDrift).toBeLessThan(1e-9);
  expect(q[0]! * v[1]! - q[1]! * v[0]!).toBeCloseTo(Math.sqrt(1 - e * e), 12);
});

it('preserves a Schwarzschild circular effective-potential orbit outside the ISCO', () => {
  const radius = 10;
  const angularMomentumSquared = radius ** 2 / (radius - 3);
  const period = 2 * Math.PI * radius ** 2 / Math.sqrt(angularMomentumSquared);
  const q = new Float64Array([radius]);
  const v = new Float64Array([0]);
  const solver = createVerlet(1);
  let phi = 0;
  for (let i = 0; i < 4096; i++) {
    solver.step(q, v, period / 4096, (x, a) => {
      const r = x[0]!;
      a[0] = -1 / r ** 2 + angularMomentumSquared / r ** 3 - 3 * angularMomentumSquared / r ** 4;
    });
    phi += Math.sqrt(angularMomentumSquared) / q[0]! ** 2 * period / 4096;
  }
  expect(Math.abs(q[0]! - radius)).toBeLessThan(1e-10);
  expect(Math.abs(phi - 2 * Math.PI)).toBeLessThan(1e-10);
});

it('recovers Newtonian effective-potential acceleration as c grows by a million', () => {
  const r = 10;
  const lSquared = 12;
  const newtonian = -1 / r ** 2 + lSquared / r ** 3;
  const correction = (c: number) => -3 * lSquared / (c ** 2 * r ** 4);
  expect(correction(1e6) / correction(1)).toBeCloseTo(1e-12, 25);
  expect(Math.abs((newtonian + correction(1e6)) / newtonian - 1)).toBeLessThan(2e-12);
});

it('rejects invalid dimensions and aliased state without modifying inputs', () => {
  expect(() => createRK4(0)).toThrow(RangeError);
  expect(() => createVerlet(1.5)).toThrow(RangeError);
  const q = new Float64Array([1]);
  expect(() => createVerlet(1).step(q, q, 0.1, () => {})).toThrow(RangeError);
  expect(q[0]).toBe(1);
  expect(() => createRK4(2).step(q, 0, 1, oscillator)).toThrow(RangeError);
});

/** One full orbit launched at periapsis, returning |state - initial| after the analytic period.
 * PHYSICS_SPEC §6.3a: r_p = a(1-e), v_p = sqrt(mu(1+e)/(a(1-e))), T = 2*pi*sqrt(a^3/mu).
 * Varying `semiMajor` makes closure itself a Kepler third-law assertion: if T did not scale as
 * a^(3/2), the orbit would not return to its launch state at all.
 */
function keplerReturnError(e: number, steps: number, semiMajor: number, mu = 1) {
  const periapsis = semiMajor * (1 - e);
  const speed = Math.sqrt(mu * (1 + e) / periapsis);
  const q = new Float64Array([periapsis, 0]);
  const v = new Float64Array([0, speed]);
  const initial = [periapsis, 0, 0, speed];
  const solver = createYoshida4(2);
  const dt = 2 * Math.PI * Math.sqrt(semiMajor ** 3 / mu) / steps;
  for (let i = 0; i < steps; i++) {
    solver.step(q, v, dt, (x, a) => {
      const r = Math.hypot(x[0]!, x[1]!);
      a[0] = -mu * x[0]! / r ** 3;
      a[1] = -mu * x[1]! / r ** 3;
    });
  }
  return Math.hypot(...[q[0]!, q[1]!, v[0]!, v[1]!].map((x, i) => x - initial[i]!));
}

describe.each([[0, 1], [0.3, 1], [0.5, 2.5], [0.7, 0.4]])(
  'Newtonian ellipse, eccentricity %s at semi-major axis %s',
  (e, semiMajor) => {
    it('shrinks its closure error at fourth order under step refinement', () => {
      // The point of this test: the residual is truncation error, not roundoff or a wrong model,
      // so halving the step must divide it by 2^4. PHYSICS_SPEC §6.3a requires refinement
      // evidence rather than a bare "closes to 1e-8" claim at one arbitrary step size.
      const ratio = keplerReturnError(e, 1024, semiMajor) / keplerReturnError(e, 2048, semiMajor);
      expect(ratio).toBeGreaterThan(16 * 0.95);
      expect(ratio).toBeLessThan(16 * 1.05);
    });
    it('closes to a stated tolerance at a stated step count', () => {
      expect(keplerReturnError(e, 8192, semiMajor)).toBeLessThan(1e-6);
    });
  },
);
