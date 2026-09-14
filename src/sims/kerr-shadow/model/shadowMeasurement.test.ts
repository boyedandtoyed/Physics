import { describe, expect, it } from 'vitest';
import {
  alphaForColumn,
  measureShadowEdges,
  measureShadowExtent,
  type AlphaMapping,
} from './shadowMeasurement';
import { shadowExtent } from '../../../core/kerr';

/** A synthetic capture mask: black between `left` and `right` on every row, white elsewhere. */
function syntheticFrame(width: number, height: number, left: number, right: number) {
  const pixels = new Uint8Array(width * height * 4);
  for (let row = 0; row < height; row++) {
    for (let column = 0; column < width; column++) {
      const inside = column >= left && column <= right;
      const value = inside ? 0 : 255;
      const offset = (row * width + column) * 4;
      pixels[offset] = value;
      pixels[offset + 1] = value;
      pixels[offset + 2] = value;
      pixels[offset + 3] = 255;
    }
  }
  return { width, height, pixels };
}

const MAPPING: AlphaMapping = {
  pose: { distance: 60, inclination: 0, azimuth: 0 },
  fieldOfView: 40,
  width: 601,
  height: 401,
  spin: 0.998,
};

describe('finding the edges', () => {
  it('locates a hard-edged synthetic shadow to within half a pixel', () => {
    const frame = syntheticFrame(601, 401, 200, 400);
    const edges = measureShadowEdges(frame);
    expect(edges.leftColumn).toBeCloseTo(199.5, 6);
    expect(edges.rightColumn).toBeCloseTo(400.5, 6);
  });

  it('scans the row the equatorial plane projects onto', () => {
    expect(measureShadowEdges(syntheticFrame(601, 401, 200, 400)).row).toBe(200);
  });

  it('refuses a frame with no shadow rather than returning a number', () => {
    expect(() => measureShadowEdges(syntheticFrame(101, 101, 5, 1))).toThrow(RangeError);
  });

  it('refuses a shadow that runs off the frame, which would measure the frame', () => {
    expect(() => measureShadowEdges(syntheticFrame(101, 101, 0, 60))).toThrow(RangeError);
    expect(() => measureShadowEdges(syntheticFrame(101, 101, 40, 100))).toThrow(RangeError);
  });
});

describe('the column-to-α mapping', () => {
  it('puts α = 0 at the optical axis', () => {
    const centre = (MAPPING.width - 1) / 2;
    expect(alphaForColumn(centre, MAPPING)).toBeCloseTo(0, 9);
  });

  it('is monotonic across the whole frame', () => {
    let previous = Number.NEGATIVE_INFINITY;
    for (let column = 0; column < MAPPING.width; column += 10) {
      const alpha = alphaForColumn(column, MAPPING);
      expect(alpha).toBeGreaterThan(previous);
      previous = alpha;
    }
  });

  it('is not quite antisymmetric, and the residual is the drag at the camera', () => {
    // Worth pinning rather than rounding away. The camera sits in a dragged frame: k_y = −ax/Σ
    // is non-zero at (D, 0, 0), so the null condition scales p differently for a ray aimed at
    // +ŷ than for one aimed at −ŷ. It is 1.7 parts per million at a/M = 0.998 and D = 60 M —
    // far below the measurement gate, and exactly zero when the hole does not spin.
    const centre = (MAPPING.width - 1) / 2;
    const asymmetry = (mapping: AlphaMapping): number =>
      alphaForColumn(centre + 80, mapping) + alphaForColumn(centre - 80, mapping);
    const spun = asymmetry(MAPPING);
    expect(Math.abs(spun)).toBeGreaterThan(0);
    expect(Math.abs(spun / alphaForColumn(centre + 80, MAPPING))).toBeLessThan(1e-5);
    expect(asymmetry({ ...MAPPING, spin: 0 })).toBeCloseTo(0, 12);
  });

  it('agrees with the small-angle impact parameter near the axis, and not far from it', () => {
    // Near the axis α ≈ D tan θ. That is the check people would write instead of launching the
    // ray; it is 1% wrong by the edge of a 40° field, which is far more than the gate allows.
    const centre = (MAPPING.width - 1) / 2;
    const tan = Math.tan(((40 / 2) * Math.PI) / 180);
    const aspect = MAPPING.width / MAPPING.height;
    const approximate = (column: number) => {
      const ndc = ((column + 0.5) / MAPPING.width) * 2 - 1;
      return 60 * ndc * tan * aspect;
    };
    expect(alphaForColumn(centre + 5, MAPPING) / approximate(centre + 5)).toBeCloseTo(1, 2);
    const edgeRatio = alphaForColumn(MAPPING.width - 1, MAPPING) / approximate(MAPPING.width - 1);
    expect(Math.abs(edgeRatio - 1)).toBeGreaterThan(0.01);
  });

  it('does not depend on how far away the camera is, because ξ is conserved', () => {
    for (const distance of [30, 60, 200]) {
      const mapping = { ...MAPPING, pose: { ...MAPPING.pose, distance } };
      // The same physical direction: an impact parameter of 4 M, aimed by angle.
      const angle = Math.asin(4 / distance);
      const tan = Math.tan(((40 / 2) * Math.PI) / 180);
      const aspect = MAPPING.width / MAPPING.height;
      const ndc = Math.tan(angle) / (tan * aspect);
      const column = ((ndc + 1) / 2) * MAPPING.width - 0.5;
      expect(alphaForColumn(column, mapping)).toBeCloseTo(4, 1);
    }
  });
});

describe('the extent measurement, end to end on a synthetic frame', () => {
  it('recovers the α extent a mask drawn at known columns encodes', () => {
    // Draw the mask at the columns Bardeen's curve predicts for a/M = 0.998, then measure it
    // back. This checks the measurement, not the renderer — that is the harness's job.
    const expected = shadowExtent(0.998);
    const columnFor = (alpha: number): number => {
      let lo = 0;
      let hi = MAPPING.width - 1;
      for (let step = 0; step < 60; step++) {
        const mid = (lo + hi) / 2;
        if (alphaForColumn(mid, MAPPING) < alpha) lo = mid;
        else hi = mid;
      }
      return (lo + hi) / 2;
    };
    const left = Math.round(columnFor(expected.min));
    const right = Math.round(columnFor(expected.max));
    const measured = measureShadowExtent(syntheticFrame(601, 401, left, right), MAPPING);
    // A hard-edged mask puts the true edge half a pixel outside the first black pixel, which is
    // what `refine` returns. The round trip is therefore exact against those columns, and that
    // is what this test checks — the measurement, not the renderer.
    expect(measured.min).toBeCloseTo(alphaForColumn(left - 0.5, MAPPING), 9);
    expect(measured.max).toBeCloseTo(alphaForColumn(right + 0.5, MAPPING), 9);
    // And those columns are Bardeen's values to within the pixel they were rounded to: 601
    // columns over a 40° field is 0.17 M per pixel here.
    expect(measured.min).toBeCloseTo(expected.min, 0);
    expect(measured.max).toBeCloseTo(expected.max, 0);
    expect(Math.abs(measured.midpoint - expected.midpoint)).toBeLessThan(0.2);
    expect(measured.midpoint).toBeGreaterThan(0);
  });
});
