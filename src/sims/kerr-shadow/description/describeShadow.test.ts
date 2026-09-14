import { describe, expect, it } from 'vitest';
import { describeShadow, describeShadowNumbers, shadowFigures } from './describeShadow';

const scene = (spin: number, overrides = {}) => ({
  spin, cameraDistance: 30, inclination: 0, ringEnabled: true, cinematic: false,
  stepsPerRay: 260, ...overrides,
});

describe('the figures beside the picture', () => {
  it('reports the ergosphere as 2M at the equator for every spin, and moving at the poles', () => {
    const polar: number[] = [];
    for (const spin of [0, 0.3, 0.6, 0.9, 0.998]) {
      const figures = shadowFigures(scene(spin));
      expect(figures.equatorialErgosphere).toBeCloseTo(2, 12);
      polar.push(figures.polarErgosphere);
    }
    // The polar extent shrinks with spin; the equatorial one does not move at all.
    for (let index = 1; index < polar.length; index++) {
      expect(polar[index]!).toBeLessThan(polar[index - 1]!);
    }
  });

  it('reports the same shadow height at every spin, which is the counter-intuitive one', () => {
    for (const spin of [0, 0.5, 0.9, 0.998]) {
      expect(shadowFigures(scene(spin)).shadowHalfHeight).toBeCloseTo(3 * Math.sqrt(3), 12);
    }
  });

  it('reports a displacement that is zero without spin and grows with it', () => {
    expect(shadowFigures(scene(0)).shadowDisplacement).toBe(0);
    let previous = 0;
    for (const spin of [0.2, 0.5, 0.9, 0.998]) {
      const value = shadowFigures(scene(spin)).shadowDisplacement;
      expect(value).toBeGreaterThan(previous);
      previous = value;
    }
  });

  it('caps the Penrose efficiency at the theoretical maximum for the spin shown', () => {
    expect(shadowFigures(scene(0)).penroseCeiling).toBe(0);
    expect(shadowFigures(scene(0.998)).penroseCeiling).toBeCloseTo(18.5764, 3);
    // Never above 20.71%, which is the extremal limit.
    for (let i = 0; i <= 200; i++) {
      expect(shadowFigures(scene((0.998 * i) / 200)).penroseCeiling).toBeLessThan(20.711);
    }
  });
});

describe('the spoken description', () => {
  it('says the shadow is a centred circle when the hole does not spin', () => {
    const text = describeShadow(scene(0));
    expect(text).toContain('non-spinning');
    expect(text).toContain('circle');
    expect(text).toContain('no ergosphere');
    expect(text).not.toContain('prograde side');
  });

  it('names which side is flattened, and says the height does not change', () => {
    const text = describeShadow(scene(0.998));
    expect(text).toContain('prograde side, where it is flattened');
    expect(text).toContain('Its height is unchanged');
    expect(text).toContain('5.196 M');
  });

  it('describes the view angle rather than leaving the reader to guess', () => {
    expect(describeShadow(scene(0.9))).toContain('edge-on');
    expect(describeShadow(scene(0.9, { inclination: Math.PI / 2.05 })))
      .toContain('down the spin axis');
    expect(describeShadow(scene(0.9, { inclination: 0.6 }))).toContain('tilted 34 degrees');
  });

  it('states that the ring’s brightness profile is not physical, whenever the ring is on', () => {
    expect(describeShadowNumbers(scene(0.9))).toContain('not physical');
    expect(describeShadowNumbers(scene(0.9, { ringEnabled: false }))).not.toContain('beaming');
  });

  it('labels cinematic mode as non-physical in the live description', () => {
    expect(describeShadowNumbers(scene(0.9, { cinematic: true })))
      .toContain('Cinematic mode');
    expect(describeShadowNumbers(scene(0.9, { cinematic: true })))
      .toContain('not physical');
  });

  it('carries the numbers a sighted reader gets from the picture', () => {
    const text = describeShadowNumbers(scene(0.998));
    for (const fragment of ['Outer horizon', 'Ergosphere', 'Prograde photon orbit', 'Shadow from']) {
      expect(text).toContain(fragment);
    }
    expect(text).toContain('1.063 M');
    expect(text).toContain('displaced 2.443 M');
  });
});
