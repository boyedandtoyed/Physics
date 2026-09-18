import { describe, expect, it } from 'vitest';
import {
  BAND_HEIGHT,
  BLOCKS_PER_REPETITION,
  SPIN,
  blockAt,
  blockTower,
  contourRadii,
  contourVertices,
  horizonCrossVertices,
  horizonEdges,
  lightConeVertices,
  radialPosition,
  radiusAtPosition,
  radiusIsTimelike,
  ringPosition,
  ringVertices,
  towerHeight,
} from './kerrBlocks';
import { delta, horizonRadii, radialTortoise, surfaceGravity } from '../../../core/kerr';

describe('the block tower', () => {
  it('repeats the five-block pattern without end', () => {
    for (const repetitions of [1, 3, 5]) {
      const tower = blockTower(repetitions);
      expect(tower).toHaveLength(repetitions * BLOCKS_PER_REPETITION);
    }
    const three = blockTower(3);
    expect(towerHeight(three)).toBeCloseTo(15 * 0.7, 9);
    // The pattern really is a pattern: block k and block k+5 are the same kind.
    for (let i = 0; i + BLOCKS_PER_REPETITION < three.length; i++) {
      expect(three[i]!.kind).toBe(three[i + BLOCKS_PER_REPETITION]!.kind);
    }
  });

  it('orders the blocks exterior, between, inner, between, exterior', () => {
    const kinds = blockTower(1).map(block => block.kind);
    expect(kinds).toEqual(['exterior', 'between', 'inner', 'between', 'exterior']);
  });

  it('stacks the bands without gaps or overlaps', () => {
    const tower = blockTower(3);
    for (let i = 1; i < tower.length; i++) {
      expect(tower[i]!.bottom).toBe(tower[i - 1]!.top);
    }
  });

  it('gives every block the radial range its name claims', () => {
    const { outer, inner } = horizonRadii(SPIN);
    for (const block of blockTower(2)) {
      if (block.kind === 'exterior') {
        expect(block.from).toBeCloseTo(outer, 12);
        expect(block.to).toBe(Number.POSITIVE_INFINITY);
      } else if (block.kind === 'between') {
        expect(block.from).toBeCloseTo(inner, 12);
        expect(block.to).toBeCloseTo(outer, 12);
      } else {
        expect(block.from).toBe(0);
        expect(block.to).toBeCloseTo(inner, 12);
      }
    }
  });
});

describe('where r is a place and where it is a time', () => {
  it('flips exactly where Δ changes sign', () => {
    const { outer, inner } = horizonRadii(SPIN);
    // Outside the outer horizon and inside the inner one, Δ > 0 and r is spacelike.
    expect(delta(outer + 0.3, SPIN)).toBeGreaterThan(0);
    expect(delta(inner * 0.5, SPIN)).toBeGreaterThan(0);
    // Between them Δ < 0 and r is a time — which is what makes that block a trap.
    expect(delta((outer + inner) / 2, SPIN)).toBeLessThan(0);

    expect(radiusIsTimelike('exterior')).toBe(false);
    expect(radiusIsTimelike('inner')).toBe(false);
    expect(radiusIsTimelike('between')).toBe(true);
  });

  it('draws r = const across the trapped block and along the others', () => {
    const tower = blockTower(1);
    const exterior = tower.find(b => b.kind === 'exterior')!;
    const between = tower.find(b => b.kind === 'between')!;
    // Vertical in the exterior: the two endpoints share an x.
    const vertical = contourVertices(3, exterior);
    expect(vertical[0]).toBeCloseTo(vertical[3]!, 6);
    expect(vertical[1]).not.toBeCloseTo(vertical[4]!, 3);
    // Horizontal between the horizons: they share a y.
    const { outer, inner } = horizonRadii(SPIN);
    const horizontal = contourVertices((outer + inner) / 2, between);
    expect(horizontal[1]).toBeCloseTo(horizontal[4]!, 6);
    expect(horizontal[0]).not.toBeCloseTo(horizontal[3]!, 3);
  });

  it('keeps every contour inside its own band', () => {
    for (const block of blockTower(2)) {
      for (const radius of contourRadii(block, 5)) {
        const data = contourVertices(radius, block);
        for (let i = 1; i < data.length; i += 3) {
          expect(data[i]!).toBeGreaterThanOrEqual(block.bottom);
          expect(data[i]!).toBeLessThanOrEqual(block.top);
        }
      }
    }
  });
});

describe('the radial map', () => {
  it('places contours from the EXACT tortoise coordinate, monotonically', () => {
    const exterior = blockTower(1)[0]!;
    let previous = -Infinity;
    for (const radius of [1.9, 2.2, 3, 5, 9, 40]) {
      const position = radialPosition(radius, exterior);
      expect(position).toBeGreaterThan(previous);
      expect(Math.abs(position)).toBeLessThanOrEqual(1);
      previous = position;
    }
    // …and it really is r*, not r: the exterior block's map is arctan(κ₊ r*), normalised.
    const gravity = surfaceGravity(SPIN);
    expect(radialPosition(3, exterior)).toBeCloseTo(
      (2 / Math.PI) * Math.atan(gravity.outer * radialTortoise(3, SPIN)), 12,
    );
  });

  it('pushes both horizons to the edges of their blocks', () => {
    const { outer, inner } = horizonRadii(SPIN);
    const tower = blockTower(1);
    const exterior = tower[0]!;
    const between = tower[1]!;
    expect(radialPosition(outer + 1e-10, exterior)).toBeLessThan(-0.94);
    expect(radialPosition(outer - 1e-10, between)).toBeLessThan(-0.94);
    // The inner edge of the between-block needs |κ₋|, not κ₊: the two differ by a factor of
    // fourteen, and using the outer one throughout leaves this at 0.43 — the Cauchy horizon
    // drawn in the middle of the block instead of at its edge.
    expect(radialPosition(inner + 1e-10, between)).toBeGreaterThan(0.94);
  });

  it('uses each horizon’s own surface gravity, which is why Kerr needs glued blocks', () => {
    const gravity = surfaceGravity(SPIN);
    expect(Math.abs(gravity.inner) / gravity.outer).toBeCloseTo(13.9282, 3);
    const { outer, inner } = horizonRadii(SPIN);
    const between = blockTower(1)[1]!;
    // A single κ₊ would put the inner edge here instead, which is the defect this avoids.
    const withOuterOnly = (2 / Math.PI)
      * Math.atan(gravity.outer * radialTortoise(inner + 1e-10, SPIN));
    expect(withOuterOnly).toBeLessThan(0.5);
    expect(radialPosition(inner + 1e-10, between)).toBeGreaterThan(withOuterOnly + 0.4);
    expect(outer).toBeGreaterThan(inner);
  });

  it('puts the ring singularity at a FINITE place inside its block, not at an edge', () => {
    // The computed fact the whole diagram turns on: r*(0) = 0.2688 M is finite, while both
    // horizons are at r* = ∓∞. So r = 0 is a line inside the innermost block — timelike, and
    // therefore avoidable — rather than a spacelike boundary the way Schwarzschild's is.
    expect(radialTortoise(0, SPIN)).toBeCloseTo(0.2688, 4);
    const innerBlock = blockTower(1).find(b => b.kind === 'inner')!;
    // r = 0 is the inner block's own boundary, and the block's range is normalised onto
    // [−1, 1], so it sits at the left edge — as a TIMELIKE edge, drawn vertical. The content is
    // not where it lands but that it is vertical and at finite r*: a Schwarzschild singularity
    // is horizontal, and no worldline can steer around a horizontal one.
    const position = ringPosition(innerBlock);
    expect(position).toBeCloseTo(-1, 9);
    expect(position).toBeCloseTo(radialPosition(0, innerBlock), 12);
    expect(radiusIsTimelike(innerBlock.kind)).toBe(false);
  });

  it('draws the ring jagged and vertical, because it is timelike', () => {
    const innerBlock = blockTower(1).find(b => b.kind === 'inner')!;
    const data = ringVertices(innerBlock);
    let above = 0;
    let below = 0;
    const centre = ringPosition(innerBlock);
    for (let i = 0; i < data.length; i += 3) {
      if (data[i]! > centre) above++;
      if (data[i]! < centre) below++;
      expect(data[i + 1]!).toBeGreaterThanOrEqual(innerBlock.bottom);
      expect(data[i + 1]!).toBeLessThanOrEqual(innerBlock.top);
    }
    expect(above).toBeGreaterThan(4);
    expect(below).toBeGreaterThan(4);
    // Vertical: y increases monotonically along it.
    for (let i = 4; i < data.length; i += 3) {
      expect(data[i]!).toBeGreaterThan(data[i - 3]!);
    }
  });
});

describe('the horizons', () => {
  it('marks every boundary, and flags the Cauchy ones', () => {
    const tower = blockTower(2);
    const edges = horizonEdges(tower);
    expect(edges).toHaveLength(tower.length - 1);
    const cauchy = edges.filter(edge => edge.isCauchy);
    // Two per repetition: into the inner block and out of it.
    expect(cauchy).toHaveLength(4);
    for (const edge of cauchy) expect(edge.label).toContain('Cauchy');
    for (const edge of edges.filter(e => !e.isCauchy)) expect(edge.label).toContain('event');
  });

  it('draws each horizon as a crossed pair at exactly 45 degrees', () => {
    const data = horizonCrossVertices(3);
    for (let i = 0; i < data.length; i += 6) {
      const dx = data[i + 3]! - data[i]!;
      const dy = data[i + 4]! - data[i + 1]!;
      expect(Math.abs(dy / dx)).toBeCloseTo(1, 6);
    }
    // The two branches cross at the boundary height.
    expect((data[1]! + data[4]!) / 2).toBeCloseTo(3, 6);
  });
});

describe('reading the diagram', () => {
  it('finds the block at a height, and nothing off the tower', () => {
    const tower = blockTower(2);
    // Heights in band units, so the test does not silently depend on BAND_HEIGHT.
    const band = (index: number) => (index + 0.5) * BAND_HEIGHT;
    expect(blockAt(tower, band(0))!.kind).toBe('exterior');
    expect(blockAt(tower, band(1))!.kind).toBe('between');
    expect(blockAt(tower, band(2))!.kind).toBe('inner');
    expect(blockAt(tower, -1)).toBeNull();
    expect(blockAt(tower, 99)).toBeNull();
  });

  it('opens a light cone at 45 degrees', () => {
    const data = lightConeVertices(0.2, 4, 0.5);
    for (let i = 0; i < data.length; i += 6) {
      const dx = data[i + 3]! - data[i]!;
      const dy = data[i + 4]! - data[i + 1]!;
      expect(Math.abs(dy / dx)).toBeCloseTo(1, 6);
    }
  });
});

describe('spreading the contours', () => {
  it('spaces them evenly across the block, not evenly in r', () => {
    // Evenly in r they pile against one edge: r* is logarithmic at both horizons, so the
    // interesting structure gets compressed into the last few per cent of the band.
    for (const block of blockTower(1)) {
      const positions = contourRadii(block, 4).map(radius => radialPosition(radius, block));
      expect(positions).toHaveLength(4);
      for (let i = 0; i < positions.length; i++) {
        expect(positions[i]!, `${block.kind} #${i}`).toBeCloseTo(-1 + (2 * (i + 1)) / 5, 5);
      }
    }
  });

  it('inverts radialPosition, which is the claim that the spacing is still exact r*', () => {
    const exterior = blockTower(1)[0]!;
    for (const position of [-0.8, -0.2, 0.3, 0.9]) {
      const radius = radiusAtPosition(position, exterior);
      expect(radialPosition(radius, exterior)).toBeCloseTo(position, 6);
    }
  });

  it('keeps every contour radius inside its block’s range', () => {
    const { outer, inner } = horizonRadii(SPIN);
    for (const block of blockTower(1)) {
      for (const radius of contourRadii(block, 5)) {
        if (block.kind === 'exterior') expect(radius).toBeGreaterThan(outer);
        else if (block.kind === 'between') {
          expect(radius).toBeGreaterThan(inner);
          expect(radius).toBeLessThan(outer);
        } else {
          expect(radius).toBeGreaterThan(0);
          expect(radius).toBeLessThan(inner);
        }
      }
    }
  });
});
