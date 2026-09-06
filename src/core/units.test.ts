import { expect, it } from 'vitest';
import { C, H, HBAR, ELECTRON_REST_ENERGY_EV, SOLAR_GEOMETRIC_LENGTH, massLengthToSchwarzschild } from './units';

it('preserves exact SI definitions and derives rounded reference quantities', () => {
  expect(C).toBe(299_792_458);
  expect(H).toBe(6.626_070_15e-34);
  expect(HBAR).toBe(H / (2 * Math.PI));
  expect(Math.abs(ELECTRON_REST_ENERGY_EV - 510_998.950_69)).toBeLessThan(0.000_01);
  expect(Math.abs(SOLAR_GEOMETRIC_LENGTH - 1476.6)).toBeLessThan(0.1);
});

it('converts M-normalized lengths into Schwarzschild-radius units', () => {
  expect(massLengthToSchwarzschild(2)).toBe(1);
  expect(massLengthToSchwarzschild(3)).toBe(1.5);
  expect(massLengthToSchwarzschild(6)).toBe(3);
});
