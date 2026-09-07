import { describe, expect, it } from 'vitest';
import { identity, lookAt, multiply, normalise, perspective, transformPoint, type Vec3 } from './matrix';

const close = (a: readonly number[], b: readonly number[], places = 5) => {
  expect(a.length).toBe(b.length);
  a.forEach((value, index) => expect(value).toBeCloseTo(b[index]!, places));
};

describe('matrix algebra', () => {
  it('leaves a matrix unchanged when multiplied by the identity, on both sides', () => {
    const m = perspective(1, 1.5, 0.1, 100);
    close([...multiply(identity(), m)], [...m]);
    close([...multiply(m, identity())], [...m]);
  });

  it('composes in the order a*(b*v), not the transpose', () => {
    // The classic silent bug: a transposed product renders a plausible picture of the wrong
    // geometry. Checked against applying the two matrices in sequence to a real point.
    const view = lookAt([0, 0, 6], [0, 0, 0], [0, 1, 0]);
    const projection = perspective(Math.PI / 3, 1, 0.1, 100);
    const point: Vec3 = [1, 0.5, -2];
    const composed = transformPoint(multiply(projection, view), point);
    const stepwise = transformPoint(view, point);
    const then = transformPoint(projection, [
      stepwise.ndc[0] * stepwise.w, stepwise.ndc[1] * stepwise.w, stepwise.ndc[2] * stepwise.w,
    ]);
    close(composed.ndc, then.ndc, 4);
  });
});

describe('lookAt', () => {
  it('puts the target at the centre of the view', () => {
    const view = lookAt([0, 0, 5], [0, 0, 0], [0, 1, 0]);
    const { ndc } = transformPoint(multiply(perspective(1, 1, 0.1, 100), view), [0, 0, 0]);
    expect(ndc[0]).toBeCloseTo(0, 6);
    expect(ndc[1]).toBeCloseTo(0, 6);
  });

  it('views down -z in eye space, so the target is in front of the camera', () => {
    const view = lookAt([0, 0, 5], [0, 0, 0], [0, 1, 0]);
    // Eye-space z of the target must be negative: in front. A sign slip here puts the whole
    // scene behind the camera and renders nothing.
    const eyeSpace = transformPoint(view, [0, 0, 0]);
    expect(eyeSpace.ndc[2]).toBeLessThan(0);
  });

  it('keeps up pointing up, from several camera positions', () => {
    for (const eye of [[0, 0, 5], [4, 3, 2], [-3, 6, -1]] as Vec3[]) {
      const view = lookAt(eye, [0, 0, 0], [0, 1, 0]);
      const origin = transformPoint(view, [0, 0, 0]);
      const above = transformPoint(view, [0, 1, 0]);
      expect(above.ndc[1] * above.w).toBeGreaterThan(origin.ndc[1] * origin.w);
    }
  });
});

describe('perspective', () => {
  it('maps the near and far planes onto the depth range', () => {
    const projection = perspective(Math.PI / 3, 1, 1, 100);
    expect(transformPoint(projection, [0, 0, -1]).ndc[2]).toBeCloseTo(-1, 5);
    expect(transformPoint(projection, [0, 0, -100]).ndc[2]).toBeCloseTo(1, 5);
  });

  it('makes distant things smaller, at several depths', () => {
    const projection = perspective(Math.PI / 3, 1, 0.1, 100);
    const sizes = [-2, -4, -8, -16].map(z => transformPoint(projection, [1, 0, z]).ndc[0]);
    for (let i = 1; i < sizes.length; i++) expect(sizes[i]!).toBeLessThan(sizes[i - 1]!);
  });

  it('applies the aspect ratio to x alone', () => {
    const wide = perspective(Math.PI / 3, 2, 0.1, 100);
    const square = perspective(Math.PI / 3, 1, 0.1, 100);
    const p: Vec3 = [1, 1, -5];
    expect(transformPoint(wide, p).ndc[0]).toBeCloseTo(transformPoint(square, p).ndc[0] / 2, 6);
    expect(transformPoint(wide, p).ndc[1]).toBeCloseTo(transformPoint(square, p).ndc[1], 6);
  });

  it('rejects degenerate parameters rather than rendering nonsense', () => {
    expect(() => perspective(0, 1, 0.1, 100)).toThrow(RangeError);
    expect(() => perspective(1, 0, 0.1, 100)).toThrow(RangeError);
    expect(() => perspective(1, 1, 0, 100)).toThrow(RangeError);
    expect(() => perspective(1, 1, 100, 1)).toThrow(RangeError);
    expect(() => normalise([0, 0, 0])).toThrow(RangeError);
  });
});
