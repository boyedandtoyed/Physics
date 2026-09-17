import { describe, expect, it } from 'vitest';
import {
  DEFAULT_INCLINATION,
  eyePosition,
  lensFor,
  matricesFor,
  pickGroundPlane,
  pixelToNdc,
  rayThroughNdc,
  projectToScreen,
  screenRadius,
  simPerPixelAtOrigin,
  toWorld,
  type Pose,
} from './camera3d';
import { transformPoint } from '../../core/gl/matrix';

const pose = (over: Partial<Pose> = {}): Pose => ({
  distance: 30, inclination: DEFAULT_INCLINATION, azimuth: 0.6, ...over,
});

describe('the camera', () => {
  it('sits at the stated distance, and at the stated angle above the plane', () => {
    const eye = eyePosition(pose({ distance: 10, inclination: Math.PI / 6, azimuth: 0 }));
    expect(Math.hypot(eye[0], eye[1], eye[2])).toBeCloseTo(10, 12);
    expect(eye[1]).toBeCloseTo(10 * Math.sin(Math.PI / 6), 12);
    expect(Math.asin(eye[1] / 10)).toBeCloseTo(Math.PI / 6, 12);
  });

  it('defaults to 30 degrees above the plane, as the brief asks', () => {
    expect((DEFAULT_INCLINATION * 180) / Math.PI).toBeCloseTo(30, 12);
  });

  it('looks at the origin: the centre of the screen is the origin', () => {
    const lens = lensFor(16 / 9);
    const { viewProjection } = matricesFor(pose(), lens);
    const { ndc } = transformPoint(viewProjection, [0, 0, 0]);
    expect(ndc[0]).toBeCloseTo(0, 6);
    expect(ndc[1]).toBeCloseTo(0, 6);
  });
});

describe('pixels to the equatorial plane', () => {
  it('maps the top-left pixel to (-1, +1) and the centre to the origin', () => {
    expect(pixelToNdc(0, 0, 800, 600)).toEqual({ x: -1, y: 1 });
    expect(pixelToNdc(400, 300, 800, 600)).toEqual({ x: 0, y: 0 });
    expect(pixelToNdc(800, 600, 800, 600)).toEqual({ x: 1, y: -1 });
  });

  it('round-trips against the projection that actually draws the frame', () => {
    // The real test of the inverse: project a known point on the plane, then pick with that NDC
    // and require the same point back. A sign error anywhere fails this.
    const lens = lensFor(16 / 9);
    for (const camera of [
      pose(), pose({ azimuth: 2.4 }), pose({ inclination: 0.05 }),
      pose({ inclination: 1.2, distance: 12 }),
    ]) {
      const { viewProjection } = matricesFor(camera, lens);
      for (const point of [[0, 0], [5, 0], [-3, 7], [11, -4]] as const) {
        const { ndc } = transformPoint(viewProjection, toWorld(point[0], point[1]));
        const back = pickGroundPlane(camera, lens, ndc[0], ndc[1]);
        expect(back, `${camera.azimuth} ${point}`).not.toBeNull();
        expect(back!.x).toBeCloseTo(point[0], 4);
        expect(back!.y).toBeCloseTo(point[1], 4);
      }
    }
  });

  it('puts the centre of the screen at the origin of the plane', () => {
    const lens = lensFor(1.5);
    const hit = pickGroundPlane(pose(), lens, 0, 0);
    expect(hit!.x).toBeCloseTo(0, 9);
    expect(hit!.y).toBeCloseTo(0, 9);
  });

  it('returns null rather than a wild number when the ray misses the plane', () => {
    // Looking slightly upward from a shallow camera: the ray goes to the sky, and there is
    // genuinely no answer. A huge number would place a mass a million units away.
    const lens = lensFor(1.5);
    expect(pickGroundPlane(pose({ inclination: 0.02 }), lens, 0, 0.9)).toBeNull();
    // Exactly edge-on and dead centre: parallel to the plane.
    expect(pickGroundPlane(pose({ inclination: 0 }), lens, 0, 0)).toBeNull();
  });

  it('refuses a pole, where the camera basis degenerates', () => {
    expect(() => rayThroughNdc(pose({ inclination: Math.PI / 2 }), lensFor(1), 0, 0))
      .toThrow(RangeError);
    // Not an exact-zero test: cos(pi/2) is 6e-17, so the degenerate basis is small rather than
    // absent, and a `> 0` guard would sail straight past it into a ray built from rounding.
    expect(Math.cos(Math.PI / 2)).toBeGreaterThan(0);
    // Just short of the pole still works, which is where the controls clamp.
    expect(() => rayThroughNdc(pose({ inclination: 1.5 }), lensFor(1), 0, 0)).not.toThrow();
  });

  it('gives a unit direction, always', () => {
    const lens = lensFor(2.2);
    for (const [x, y] of [[0, 0], [-1, -1], [1, 1], [0.3, -0.8]] as const) {
      const ray = rayThroughNdc(pose(), lens, x, y);
      expect(Math.hypot(...ray.direction)).toBeCloseTo(1, 12);
    }
  });

  it('spreads the plane further per pixel as the camera pulls back', () => {
    const lens = lensFor(1.6);
    const near = simPerPixelAtOrigin(pose({ distance: 10 }), lens, 600);
    const far = simPerPixelAtOrigin(pose({ distance: 40 }), lens, 600);
    expect(far / near).toBeCloseTo(4, 12);
  });
});

describe('the world convention', () => {
  it('puts the sim plane at y = 0 with the sim’s second coordinate on z', () => {
    expect(toWorld(3, 5)).toEqual([3, 0, 5]);
    expect(toWorld(3, 5, -2)).toEqual([3, -2, 5]);
  });
});

describe('projecting back to the screen', () => {
  it('puts the origin dead centre and marks nothing behind the camera', () => {
    const lens = lensFor(1.6);
    const matrices = matricesFor(pose(), lens);
    const screen = projectToScreen(matrices, [0, 0, 0]);
    expect(screen.u).toBeCloseTo(0.5, 6);
    expect(screen.v).toBeCloseTo(0.5, 6);
    expect(screen.behind).toBe(false);
    expect(screen.depth).toBeCloseTo(30, 6);
  });

  it('flags a point behind the camera rather than reflecting it silently', () => {
    const lens = lensFor(1.6);
    const camera = pose({ distance: 10, inclination: 0.3, azimuth: 0 });
    const matrices = matricesFor(camera, lens);
    const eye = matrices.eye;
    // Twice as far out along the eye direction: well behind the camera.
    const behind = projectToScreen(matrices, [eye[0] * 2, eye[1] * 2, eye[2] * 2]);
    expect(behind.behind).toBe(true);
  });

  it('shrinks a body’s apparent radius in inverse proportion to its distance', () => {
    const lens = lensFor(2);
    const near = screenRadius(lens, 10, 1);
    const far = screenRadius(lens, 40, 1);
    expect(near / far).toBeCloseTo(4, 12);
    expect(screenRadius(lens, 0, 1)).toBe(0);
  });

  it('measures the apparent radius against the width, not the height', () => {
    const wide = screenRadius(lensFor(4), 10, 1);
    const square = screenRadius(lensFor(1), 10, 1);
    expect(square / wide).toBeCloseTo(4, 12);
  });
});
