import { describe, expect, it } from 'vitest';
import {
  CAPTION_ROOM,
  EARTH_SCHWARZSCHILD,
  GPS_ITEMISED,
  GPS_STATIC_GROUND,
  PRESETS,
  advance,
  emptyState,
  faceReading,
  figures,
  handAngles,
  handVertices,
  layout,
  needleAngle,
  ringVertices,
  tickVertices,
  toMetres,
} from './clockRun';
import {
  breakEvenRadius, circularClockRate, clockRateDifference, staticClockRate,
} from '../../../core/timeDilation';
import {
  EARTH_MEAN_RADIUS, GPS_ORBIT_RADIUS, LOW_EARTH_ORBIT_RADIUS, SECONDS_PER_DAY,
} from '../../../core/units';

const TURN = Math.PI * 2;
const ground = EARTH_MEAN_RADIUS;

describe('the Earth as a Schwarzschild source', () => {
  it('has a Schwarzschild radius of 8.870 mm', () => {
    expect(EARTH_SCHWARZSCHILD * 1000).toBeCloseTo(8.870, 3);
  });

  it('puts both clock rates within a part in 10^9 of one', () => {
    const rates = figures(ground, GPS_ORBIT_RADIUS, 0);
    expect(1 - rates.staticRate).toBeLessThan(1e-9);
    expect(1 - rates.orbitRate).toBeLessThan(1e-9);
    // Which is exactly why the difference is never taken by subtracting them.
    expect(rates.staticRate).not.toBe(rates.orbitRate);
  });
});

describe('the GPS case', () => {
  const gps = figures(ground, GPS_ORBIT_RADIUS, 0);

  it('gains 45.72 µs a day from the potential', () => {
    expect(gps.gravitationalPerDay).toBeCloseTo(45.719, 2);
  });

  it('loses 7.213 µs a day to the orbital motion, against a non-rotating ground clock', () => {
    expect(gps.kinematicPerDay).toBeCloseTo(-7.213, 2);
  });

  it('nets +38.51 µs a day, and the two terms add up to it exactly', () => {
    expect(gps.driftPerDay).toBeCloseTo(38.506, 2);
    expect(gps.gravitationalPerDay + gps.kinematicPerDay).toBeCloseTo(gps.driftPerDay, 12);
  });

  it('differs from the published +38.61 only by the ground station’s own rotation', () => {
    // core's gpsOffsets puts the ground clock on a rotating Earth; this sim's static clock is
    // not rotating. The gravitational terms therefore agree and the kinematic ones do not.
    expect(GPS_ITEMISED.gravitational).toBeCloseTo(GPS_STATIC_GROUND.gravitationalPerDay, 3);
    expect(GPS_ITEMISED.kinematic - GPS_STATIC_GROUND.kinematicPerDay).toBeCloseTo(0.1038, 3);
    expect(GPS_ITEMISED.net).toBeCloseTo(38.610, 2);
  });
});

describe('the break-even radius', () => {
  it('is 1.5 r_A and nothing else', () => {
    expect(breakEvenRadius(ground)).toBeCloseTo(9_556_500, 0);
    expect(figures(ground, ground, 0).breakEvenMetres).toBe(1.5 * ground);
  });

  it('leaves the two clocks in agreement to better than 1e-12 µs after a million steps', () => {
    // The brief's version of this gate put it at r_A = r_B, where it is false. Here it holds.
    let state = emptyState();
    const step = 1;
    for (let i = 0; i < 1e6; i++) state = advance(state, step);
    expect(state.coordinateSeconds).toBe(1e6);
    const at = figures(ground, breakEvenRadius(ground), state.coordinateSeconds);
    expect(Math.abs(at.differenceMicroseconds)).toBeLessThan(1e-12);
    expect(Math.abs(at.driftPerDay)).toBeLessThan(1e-12);
  });

  it('has equal and opposite terms of ±20.05 µs a day there', () => {
    const even = figures(ground, breakEvenRadius(ground), 0);
    expect(even.gravitationalPerDay).toBeCloseTo(20.0485, 3);
    expect(even.kinematicPerDay).toBeCloseTo(-20.0485, 3);
  });

  it('changes the sign of the drift across it', () => {
    const below = figures(ground, 1.4 * ground, 0).driftPerDay;
    const above = figures(ground, 1.6 * ground, 0).driftPerDay;
    expect(below).toBeLessThan(0);
    expect(above).toBeGreaterThan(0);
  });

  it('is independent of the central mass', () => {
    // Same ratio, a thousand times the Schwarzschild radius: still exactly zero.
    const rs = EARTH_SCHWARZSCHILD * 1000;
    expect(clockRateDifference(ground, 1.5 * ground, rs)).toBeCloseTo(0, 15);
  });
});

describe('the claim that clocks at the same radius agree', () => {
  it('is false, and the whole remaining difference is kinematic', () => {
    const same = figures(ground, ground, 0);
    expect(same.gravitationalPerDay).toBe(0);
    expect(same.driftPerDay).toBeCloseTo(-30.073, 2);
    // The gravitational term is identically zero, so the drift *is* the kinematic term — to the
    // last bit or two, the two expressions being different roundings of the same quantity.
    expect(same.driftPerDay).toBeCloseTo(same.kinematicPerDay, 12);
  });

  it('has the orbiting clock losing at every radius, for any mass', () => {
    for (const radii of [1, 2, 5, 10, 50]) {
      const radius = toMetres(radii);
      expect(circularClockRate(radius, EARTH_SCHWARZSCHILD))
        .toBeLessThan(staticClockRate(radius, EARTH_SCHWARZSCHILD));
    }
  });
});

describe('low Earth orbit', () => {
  it('loses about 25 µs a day, the opposite sign to GPS', () => {
    const iss = figures(ground, LOW_EARTH_ORBIT_RADIUS, 0);
    expect(iss.driftPerDay).toBeCloseTo(-24.743, 2);
    expect(iss.gravitationalPerDay).toBeGreaterThan(0);
    expect(iss.kinematicPerDay).toBeLessThan(0);
  });

  it('takes 92.4 minutes to go round, and GPS takes half a sidereal day', () => {
    expect(figures(ground, LOW_EARTH_ORBIT_RADIUS, 0).orbitPeriodSeconds / 60)
      .toBeCloseTo(92.414, 2);
    expect(figures(ground, GPS_ORBIT_RADIUS, 0).orbitPeriodSeconds / 3600).toBeCloseTo(11.967, 2);
  });

  it('puts a GPS satellite at 3.874 km/s', () => {
    expect(figures(ground, GPS_ORBIT_RADIUS, 0).orbitSpeed / 1000).toBeCloseTo(3.8738, 3);
  });
});

describe('accumulation', () => {
  it('multiplies rather than integrates, so a day of coordinate time is a day', () => {
    const state = advance(emptyState(), SECONDS_PER_DAY);
    const day = figures(ground, GPS_ORBIT_RADIUS, state.coordinateSeconds);
    expect(day.differenceMicroseconds).toBeCloseTo(day.driftPerDay, 9);
    expect(day.staticSeconds).toBeLessThan(SECONDS_PER_DAY);
    expect(day.orbitSeconds).toBeLessThan(SECONDS_PER_DAY);
    expect(day.orbitSeconds).toBeGreaterThan(day.staticSeconds);
  });

  it('beats the naive subtraction by seven digits', () => {
    // Both rates are 1 - 4e-10, so subtracting them directly throws away nine digits before the
    // answer starts and leaves about seven. That is the whole reason core computes the
    // difference of squares instead, and it is worth the 1e-7 rather than being pedantry: the
    // GPS correction is quoted to four figures.
    const seconds = 1e6;
    const exact = figures(ground, GPS_ORBIT_RADIUS, seconds).differenceMicroseconds;
    const naive = (circularClockRate(GPS_ORBIT_RADIUS, EARTH_SCHWARZSCHILD) * seconds
      - staticClockRate(ground, EARTH_SCHWARZSCHILD) * seconds) * 1e6;
    expect(exact).toBeCloseTo(445.674102245, 8);
    expect(Math.abs(naive - exact) / exact).toBeGreaterThan(1e-8);
    expect(Math.abs(naive - exact) / exact).toBeLessThan(1e-5);
  });

  it('never runs time backwards', () => {
    expect(advance(emptyState(), -5).coordinateSeconds).toBe(0);
  });
});

describe('the presets', () => {
  it('straddle the break-even radius in both directions', () => {
    const drift = (id: string) => {
      const preset = PRESETS.find(entry => entry.id === id)!;
      return figures(toMetres(preset.staticRadii), toMetres(preset.orbitRadii), 0).driftPerDay;
    };
    expect(drift('gps')).toBeGreaterThan(0);
    expect(drift('iss')).toBeLessThan(0);
    expect(drift('same-radius')).toBeLessThan(0);
    expect(Math.abs(drift('break-even'))).toBeLessThan(1e-12);
  });
});

describe('the faces', () => {
  it('starts every hand at twelve', () => {
    const angles = handAngles(0);
    expect(angles.second).toBe(0);
    expect(angles.minute).toBe(0);
    expect(angles.hour).toBe(0);
  });

  it('sweeps the second hand once a minute and the hour hand once in twelve hours', () => {
    expect(handAngles(15).second).toBeCloseTo(TURN / 4, 12);
    expect(handAngles(30).second).toBeCloseTo(TURN / 2, 12);
    expect(handAngles(60).second).toBeCloseTo(0, 12);
    expect(handAngles(1800).minute).toBeCloseTo(TURN / 2, 12);
    expect(handAngles(6 * 3600).hour).toBeCloseTo(TURN / 2, 12);
    expect(handAngles(12 * 3600).hour).toBeCloseTo(0, 12);
  });

  it('moves the hour hand continuously rather than in steps', () => {
    expect(handAngles(3600 * 1.5).hour).toBeCloseTo(TURN * 1.5 / 12, 12);
  });

  it('reads back the hours, minutes and seconds', () => {
    const reading = faceReading(3 * 3600 + 25 * 60 + 9.5);
    expect(reading.hours).toBe(3);
    expect(reading.minutes).toBe(25);
    expect(reading.seconds).toBeCloseTo(9.5, 9);
  });

  it('turns the needle once per microsecond, anticlockwise when the clock is losing', () => {
    expect(needleAngle(0)).toBe(0);
    expect(needleAngle(0.5)).toBeCloseTo(Math.PI, 12);
    expect(needleAngle(1)).toBeCloseTo(0, 12);
    expect(needleAngle(-0.25)).toBeCloseTo(-TURN / 4, 12);
  });
});

describe('the layout', () => {
  const aspects: readonly [number, number][] = [[1.67, 1], [1, 1], [3, 1], [1.2, 1]];

  it('keeps the faces inside the frame and clear of each other at every aspect', () => {
    for (const [halfWidth, halfHeight] of aspects) {
      const box = layout(halfWidth, halfHeight);
      expect(box.faceRadius).toBeGreaterThan(0);
      expect(box.rightX + box.faceRadius).toBeLessThanOrEqual(halfWidth);
      expect(box.faceY + box.faceRadius).toBeLessThanOrEqual(halfHeight);
      // Gap between the two faces.
      expect(box.rightX - box.leftX).toBeGreaterThan(2 * box.faceRadius);
    }
  });

  it('leaves room under the dial for its caption', () => {
    // The caption is HTML positioned over the canvas: past the bottom edge it is not clipped,
    // it is invisible. This is the "label below the fold" bug at canvas scale.
    for (const [halfWidth, halfHeight] of aspects) {
      const box = layout(halfWidth, halfHeight);
      expect(box.dialY - box.dialRadius * CAPTION_ROOM).toBeGreaterThan(-halfHeight);
    }
  });

  it('keeps the dial clear of both faces', () => {
    for (const [halfWidth, halfHeight] of aspects) {
      const box = layout(halfWidth, halfHeight);
      const distance = Math.hypot(box.rightX, box.faceY - box.dialY);
      expect(distance).toBeGreaterThan(box.faceRadius + box.dialRadius);
      expect(box.dialY - box.dialRadius).toBeGreaterThanOrEqual(-halfHeight);
    }
  });

  it('mirrors the two faces about the centre line', () => {
    const box = layout(1.67, 1);
    expect(box.leftX).toBe(-box.rightX);
  });
});

describe('the geometry builders', () => {
  it('draws a ring of the right radius about an offset centre', () => {
    const data = ringVertices(2, -1, 0.5, 64);
    expect(data.length).toBe(64 * 3);
    for (let i = 0; i < 64; i++) {
      const x = data[i * 3]!;
      const y = data[i * 3 + 1]!;
      expect(Math.hypot(x - 2, y + 1)).toBeCloseTo(0.5, 6);
      expect(data[i * 3 + 2]).toBe(1);
    }
  });

  it('draws sixty ticks, twelve of them long', () => {
    const data = tickVertices(0, 0, 1);
    expect(data.length).toBe(60 * 2 * 3);
    let long = 0;
    for (let i = 0; i < 60; i++) {
      const inner = Math.hypot(data[i * 6]!, data[i * 6 + 1]!);
      if (inner < 0.9) long++;
    }
    expect(long).toBe(12);
  });

  it('puts the twelve o’clock tick at the top and three o’clock at the right', () => {
    const data = tickVertices(0, 0, 1, true);
    expect(data[3]).toBeCloseTo(0, 9);
    expect(data[4]).toBeCloseTo(1, 9);
    expect(data[3 * 6 + 3]).toBeCloseTo(1, 9);
    expect(data[3 * 6 + 4]).toBeCloseTo(0, 9);
  });

  it('points a hand at twelve when its angle is zero, and at three at a quarter turn', () => {
    const up = handVertices(0, 0, 0, 1, 0.05);
    expect(up[6]).toBeCloseTo(0, 9);
    expect(up[7]).toBeCloseTo(1, 9);
    const right = handVertices(0, 0, TURN / 4, 1, 0.05);
    expect(right[6]).toBeCloseTo(1, 9);
    expect(right[7]).toBeCloseTo(0, 9);
  });

  it('gives every hand a tail behind the pivot, so the pivot reads as a pivot', () => {
    const hand = handVertices(0, 0, 0, 1, 0.05);
    expect(hand[1]).toBeLessThan(0);
    expect(hand.length).toBe(4 * 3);
  });
});
