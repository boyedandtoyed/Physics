import { describe, expect, it } from 'vitest';
import { shadowAngularRadius } from '../../../core/schwarzschild';
import {
  measureShadowRadius,
  predictedShadowRadiusPixels,
  type Frame,
} from './shadowMeasurement';

/** Synthetic capture mask: a black disc of exactly `radius` px on white, so the true answer
 * is known and the measurement routine can be checked before it is trusted on a real frame. */
function disc(width: number, height: number, radius: number): Frame {
  const pixels = new Uint8Array(width * height * 4);
  const cx = width / 2 - 0.5;
  const cy = height / 2 - 0.5;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const inside = Math.hypot(x - cx, y - cy) <= radius;
      const offset = (y * width + x) * 4;
      const value = inside ? 0 : 255;
      pixels[offset] = value;
      pixels[offset + 1] = value;
      pixels[offset + 2] = value;
      pixels[offset + 3] = 255;
    }
  }
  return { width, height, pixels };
}

describe('shadow edge measurement', () => {
  it('recovers the radius of a synthetic disc to better than half a pixel', () => {
    for (const radius of [40, 77.5, 130]) {
      const measured = measureShadowRadius(disc(512, 512, radius));
      expect(Math.abs(measured.radiusPixels - radius)).toBeLessThan(0.5);
      // A circle measured on many spokes should be tight; this guards against a routine that
      // returns a plausible mean while finding the edge in the wrong place on some spokes.
      expect(measured.spreadPixels).toBeLessThan(0.5);
      expect(measured.spokes).toBeGreaterThan(700);
    }
  });

  it('works on a non-square frame', () => {
    expect(measureShadowRadius(disc(800, 400, 90)).radiusPixels).toBeCloseTo(90, 0);
  });

  it('refuses to measure when the centre is not inside the shadow', () => {
    const allWhite = disc(64, 64, 0);
    expect(() => measureShadowRadius(allWhite)).toThrow(/centre is not inside/);
  });

  it('refuses to report a radius when the shadow is clipped by the frame', () => {
    // Disc larger than the frame: no spoke ever crosses the edge.
    expect(() => measureShadowRadius(disc(128, 128, 400))).toThrow(/not found on enough spokes/);
  });
});

describe('analytic prediction', () => {
  it('scales with the tangent of the shadow angle, not the angle', () => {
    // Small-angle agreement is expected; the point is that the routine uses tan, since the
    // projection is a pinhole. At 60 deg FOV and D = 6 the difference exceeds a pixel.
    const height = 600;
    const fov = 60;
    for (const distance of [10, 20, 50]) {
      const theta = shadowAngularRadius(distance);
      const tanHalfFov = Math.tan((fov * Math.PI) / 180 / 2);
      expect(predictedShadowRadiusPixels(distance, fov, height))
        .toBeCloseTo((Math.tan(theta) / tanHalfFov) * (height / 2), 10);
    }
  });

  it('shrinks as the camera retreats and as the field of view widens', () => {
    expect(predictedShadowRadiusPixels(50, 60, 600))
      .toBeLessThan(predictedShadowRadiusPixels(10, 60, 600));
    expect(predictedShadowRadiusPixels(20, 90, 600))
      .toBeLessThan(predictedShadowRadiusPixels(20, 45, 600));
  });
});
