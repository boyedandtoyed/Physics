import { describe, expect, it } from 'vitest';
import {
  HORIZON,
  INFINITY_ACROSS,
  REGIONS,
  SINGULARITY_HEIGHT,
  SINGULARITY_PRODUCT,
  beyondSingularity,
  cartesian,
  nullCoordinates,
  nullFromCartesian,
  penrose,
  penroseAt,
  product,
  productAtRadius,
  radiusCurve,
  radiusFromNull,
  regionOf,
  regionSigns,
  timeFromNull,
  timeLine,
  timeLineSlope,
} from './kruskal';
import { kruskal } from './infall';

/** r_s = 1 here and the brief's numbers are in M = r_s/2, so r = 4M is r = 2 r_s. */
const inM = (radiiInM: number) => radiiInM / 2;

const chart = (radius: number, time: number, region: Parameters<typeof nullCoordinates>[2]) =>
  cartesian(...([nullCoordinates(radius, time, region)].map(p => [p.u, p.v])[0] as [number, number]));

describe('the published values', () => {
  it('puts r = 4M, t = 0 at X = e, T = 0', () => {
    const { u, v } = nullCoordinates(inM(4), 0, 'exterior');
    const point = cartesian(u, v);
    expect(point.x).toBeCloseTo(Math.E, 8);
    expect(point.t).toBeCloseTo(0, 12);
    // …and √(r/2M − 1) e^{r/4M} with r = 4M is √1 · e¹, which is where the e comes from.
    expect(point.x).toBeCloseTo(Math.sqrt(1) * Math.exp(1), 8);
  });

  it('puts the horizon at T² − X² = 0 for every t', () => {
    for (const time of [-6, -1, 0, 1, 6]) {
      const { u, v } = nullCoordinates(HORIZON, time, 'exterior');
      expect(product(u, v)).toBe(0);
      const point = cartesian(u, v);
      expect(point.t * point.t - point.x * point.x).toBe(0);
    }
    // Approached from outside, UV → 0 from above; from inside, from below.
    expect(productAtRadius(1 + 1e-9)).toBeGreaterThan(0);
    expect(productAtRadius(1 - 1e-9)).toBeLessThan(0);
  });

  it('puts r = M in the interior at T² − X² = √e/2 = 0.8244', () => {
    const { u, v } = nullCoordinates(inM(1), 0, 'black-hole');
    // T² − X² = −UV, and UV = (r − 1)e^r with r = 0.5 r_s.
    expect(-product(u, v)).toBeCloseTo(Math.sqrt(Math.E) / 2, 8);
    expect(-product(u, v)).toBeCloseTo(0.8243606354, 8);
    const point = cartesian(u, v);
    expect(point.t * point.t - point.x * point.x).toBeCloseTo(0.8243606354, 8);
  });

  it('agrees with the exact (r − r_s)e^{r/r_s} everywhere', () => {
    for (const radius of [0.2, 0.75, 1.5, 3, 8]) {
      const region = radius > HORIZON ? 'exterior' : 'black-hole';
      for (const time of [-3, 0, 2.5]) {
        const { u, v } = nullCoordinates(radius, time, region);
        expect(product(u, v)).toBeCloseTo(productAtRadius(radius), 10);
      }
    }
  });
});

describe('the cancellation the spec warns about', () => {
  /** The textbook chart, formed through X and T, which is what this module refuses to do. */
  const viaCartesian = (radius: number, time: number) => {
    const s = Math.sqrt(radius - HORIZON) * Math.exp(radius / 2);
    return { X: s * Math.cosh(time / 2), T: s * Math.sinh(time / 2) };
  };

  it('destroys X² − T² near the horizon at large t, and the product form does not save it', () => {
    const radius = 1 + 1e-6;
    const exact = productAtRadius(radius);
    // At t = 40 r_s/c the two coordinates are bitwise equal, so BOTH X-based forms return
    // exactly zero: the difference of squares and its "safer" factorisation alike. There is no
    // rearrangement of X and T that recovers what the subtraction has already thrown away.
    const { X, T } = viaCartesian(radius, 40);
    expect(X * X - T * T).toBe(0);
    expect((X - T) * (X + T)).toBe(0);
    expect(exact).toBeCloseTo(2.718e-6, 9);
  });

  it('holds full precision through U and V at the same event', () => {
    const radius = 1 + 1e-6;
    for (const time of [0, 20, 40, 60]) {
      const { u, v } = nullCoordinates(radius, time, 'exterior');
      const relative = Math.abs(product(u, v) - productAtRadius(radius)) / productAtRadius(radius);
      expect(relative, `t = ${time}`).toBeLessThan(1e-14);
    }
  });

  it('recovers the radius from U and V where the X route has nothing left', () => {
    const radius = 1 + 1e-6;
    const { u, v } = nullCoordinates(radius, 40, 'exterior');
    expect(radiusFromNull(u, v)).toBeCloseTo(radius, 12);
  });
});

describe('the relationship to infall.ts', () => {
  it('differs from it by a boost, which leaves UV exactly alone', () => {
    // infall.ts anchors V = 1 at ITS fall's horizon crossing; this chart uses the standard
    // normalisation. A boost multiplies V and divides U, so the product is untouched — and that
    // is the only thing either module computes anything from.
    for (const radius of [1.5, 2, 4, 8]) {
      const fall = kruskal(radius);
      expect(fall.U * fall.V).toBeCloseTo(productAtRadius(radius), 10);
    }
  });

  it('gives different X and T from infall.ts, as a boost must', () => {
    const fall = kruskal(2);
    const here = chart(2, 0, 'exterior');
    expect(fall.X).toBeCloseTo(5.5246, 3);
    expect(here.x).toBeCloseTo(Math.E, 8);
    expect(fall.X).not.toBeCloseTo(here.x, 2);
    // Both are right, and both recover the same radius.
    expect(radiusFromNull(fall.U, fall.V)).toBeCloseTo(2, 10);
  });

  it('reaches the interior, which infall.ts cannot', () => {
    expect(() => kruskal(0.5)).toThrow(RangeError);
    expect(() => nullCoordinates(0.5, 0, 'black-hole')).not.toThrow();
    expect(radiusFromNull(...pair(nullCoordinates(0.5, 1.3, 'black-hole')))).toBeCloseTo(0.5, 10);
  });
});

const pair = (point: { u: number; v: number }): [number, number] => [point.u, point.v];

describe('the four regions', () => {
  it('is round-tripped by the sign convention', () => {
    for (const region of REGIONS) {
      const radius = region === 'exterior' || region === 'parallel' ? 2.5 : 0.6;
      const { u, v } = nullCoordinates(radius, 1.2, region);
      expect(regionOf(u, v), region).toBe(region);
      expect(Math.sign(u)).toBe(regionSigns(region).u);
      expect(Math.sign(v)).toBe(regionSigns(region).v);
      expect(radiusFromNull(u, v)).toBeCloseTo(radius, 10);
    }
  });

  it('lays the regions out where the diagram puts them', () => {
    const right = cartesian(...pair(nullCoordinates(2.5, 0, 'exterior')));
    expect(right.x).toBeGreaterThan(Math.abs(right.t));
    const above = cartesian(...pair(nullCoordinates(0.6, 0, 'black-hole')));
    expect(above.t).toBeGreaterThan(Math.abs(above.x));
    const below = cartesian(...pair(nullCoordinates(0.6, 0, 'white-hole')));
    expect(below.t).toBeLessThan(-Math.abs(below.x));
    const left = cartesian(...pair(nullCoordinates(2.5, 0, 'parallel')));
    expect(left.x).toBeLessThan(-Math.abs(left.t));
  });

  it('reports no region on a horizon, where U or V vanishes', () => {
    expect(regionOf(0, 1)).toBeNull();
    expect(regionOf(1, 0)).toBeNull();
  });

  it('refuses events past the singularity rather than returning a radius', () => {
    expect(beyondSingularity(-2, 1)).toBe(true);
    expect(beyondSingularity(-0.5, 1)).toBe(false);
    expect(() => radiusFromNull(-2, 1)).toThrow(RangeError);
    // r = 0 itself is UV = -1 exactly, and is the edge of the extension rather than past it.
    // It comes back as 1.3e-8 rather than 0, and that is the arithmetic being honest: W₀ has a
    // square-root branch point at -1/e, where W(z) ≈ -1 + √(2(ez+1)), so the derivative is
    // infinite and the error in r is the SQUARE ROOT of the error in UV. Machine epsilon in the
    // argument is 1e-8 in the answer, and no amount of iteration improves it.
    expect(radiusFromNull(-1, 1)).toBeLessThan(1e-7);
    expect(radiusFromNull(-1, 1)).toBeGreaterThanOrEqual(0);
    expect(SINGULARITY_PRODUCT).toBe(-1);
  });

  it('loses half its digits approaching the singularity, by the square-root law', () => {
    // Worth pinning down rather than discovering: a sim drawing r = 0.001 near the singularity
    // is asking for a radius whose input it knows to 1e-16 and whose answer is good to 1e-8.
    for (const epsilon of [1e-4, 1e-8, 1e-12]) {
      const exact = radiusFromNull(-1 + epsilon, 1);
      const predicted = Math.sqrt(2 * epsilon * Math.E / Math.E);
      expect(exact / predicted, `ε = ${epsilon}`).toBeCloseTo(1, 1);
    }
  });
});

describe('the drawn curves', () => {
  it('keeps a constant-r curve on its hyperbola', () => {
    const curve = radiusCurve(2, 'exterior', 4, 33);
    for (let i = 0; i < curve.length; i += 2) {
      const x = curve[i]!;
      const t = curve[i + 1]!;
      expect(x * x - t * t).toBeCloseTo(productAtRadius(2), 8);
    }
  });

  it('makes a constant-r curve timelike inside the horizon and spacelike outside', () => {
    // X² − T² > 0 outside is a spacelike surface: r = const is a place. Inside it is negative,
    // which is the statement that r = 0 is a time you arrive at, not a place you could avoid.
    expect(productAtRadius(2)).toBeGreaterThan(0);
    expect(productAtRadius(HORIZON / 2)).toBeLessThan(0);
  });

  it('puts a constant-t line through the origin at slope tanh(t/2)', () => {
    for (const time of [-3, -0.5, 0, 0.5, 3]) {
      const line = timeLine(time, 'exterior', 1.2, 6);
      expect(line.from.t / line.from.x).toBeCloseTo(timeLineSlope(time), 10);
      expect(line.to.t / line.to.x).toBeCloseTo(timeLineSlope(time), 10);
    }
    expect(timeLineSlope(0)).toBe(0);
    // The horizon is the t → ±∞ limit of these lines, at 45°.
    expect(timeLineSlope(100)).toBeCloseTo(1, 12);
    expect(timeLineSlope(-100)).toBeCloseTo(-1, 12);
  });

  it('recovers t from an event, and refuses it on a horizon', () => {
    for (const time of [-2.5, 0, 1.75]) {
      const { u, v } = nullCoordinates(3, time, 'exterior');
      expect(timeFromNull(u, v)).toBeCloseTo(time, 10);
    }
    expect(() => timeFromNull(0, 1)).toThrow(RangeError);
  });

  it('inverts the pointer’s (X, T) back to U and V', () => {
    const { u, v } = nullCoordinates(2.2, -1.4, 'exterior');
    const point = cartesian(u, v);
    const back = nullFromCartesian(point.x, point.t);
    expect(back.u).toBeCloseTo(u, 12);
    expect(back.v).toBeCloseTo(v, 12);
  });
});

describe('the Penrose compactification', () => {
  it('fits the whole spacetime inside the unit square', () => {
    for (const radius of [0.1, 0.9, 1.5, 1e3, 1e8]) {
      for (const region of REGIONS) {
        const inside = radius < HORIZON;
        if (inside !== (region === 'black-hole' || region === 'white-hole')) continue;
        for (const time of [-50, 0, 50]) {
          const { across, up } = penroseAt(radius, time, region);
          expect(Math.abs(across), `${region} r=${radius}`).toBeLessThanOrEqual(1);
          expect(Math.abs(up)).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('flattens the future singularity into the straight line up = ½', () => {
    // UV = −1 for every t, and the compactification turns that hyperbola into a level line —
    // which is the whole reason a Penrose diagram can show "the singularity is a moment".
    for (const time of [-8, -2, 0, 2, 8]) {
      const { up } = penroseAt(0, time, 'black-hole');
      expect(up).toBeCloseTo(SINGULARITY_HEIGHT, 12);
    }
    for (const time of [-4, 0, 4]) {
      expect(penroseAt(0, time, 'white-hole').up).toBeCloseTo(-SINGULARITY_HEIGHT, 12);
    }
  });

  it('puts spacelike infinity at the left and right corners', () => {
    const right = penroseAt(1e12, 0, 'exterior');
    expect(right.across).toBeCloseTo(INFINITY_ACROSS, 9);
    expect(right.up).toBeCloseTo(0, 9);
    const left = penroseAt(1e12, 0, 'parallel');
    expect(left.across).toBeCloseTo(-INFINITY_ACROSS, 9);
    expect(left.up).toBeCloseTo(0, 9);
  });

  it('puts the horizons on the diagonals and i⁺ at (½, ½)', () => {
    // The future horizon is U = 0, V > 0: across = up all the way from the bifurcation point.
    for (const v of [0.1, 1, 10, 1e6]) {
      const point = penrose(0, v);
      expect(point.up).toBeCloseTo(point.across, 12);
    }
    // i⁺ is the far end of it, where V → ∞ with U = 0.
    const future = penrose(0, 1e14);
    expect(future.across).toBeCloseTo(0.5, 8);
    expect(future.up).toBeCloseTo(0.5, 8);
    // And the past horizon, V = 0, is the other diagonal.
    const past = penrose(1e6, 0);
    expect(past.up).toBeCloseTo(-past.across, 12);
  });

  it('sends null rays at 45 degrees, which is the only thing it promises to preserve', () => {
    // A radial null ray has V constant and U varying, or the reverse. In the compactified
    // square that must be a 45° line, whatever the conformal factor is doing to lengths.
    const fixedV = 2.5;
    const a = penrose(0.4, fixedV);
    const b = penrose(3.9, fixedV);
    expect(Math.abs((b.up - a.up) / (b.across - a.across))).toBeCloseTo(1, 12);
    const fixedU = -0.8;
    const c = penrose(fixedU, 0.3);
    const d = penrose(fixedU, 7.1);
    expect(Math.abs((d.up - c.up) / (d.across - c.across))).toBeCloseTo(1, 12);
  });

  it('is monotone, so nothing is folded over anything else', () => {
    let previous = -Infinity;
    for (let v = -20; v <= 20; v += 0.5) {
      const { up, across } = penrose(-1, v);
      const along = up + across;
      expect(along).toBeGreaterThan(previous);
      previous = along;
    }
  });
});
