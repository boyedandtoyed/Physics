import { describe, expect, it } from 'vitest';
import { CRITICAL_IMPACT_PARAMETER } from '../../../core/schwarzschild';
import {
  describeScene,
  describeSceneNumbers,
  sceneFigures,
  schwarzschildRadiusKm,
  type SceneState,
} from './describeScene';

const BASE: SceneState = {
  solarMasses: 10,
  cameraDistance: 20,
  inclination: 0.25,
  diskEnabled: true,
  cinematic: false,
  stepsPerRay: 320,
};

describe('scene figures', () => {
  it('gives the textbook Schwarzschild radius for a solar mass', () => {
    // 2GM_sun/c^2 = 2.953 km.
    expect(schwarzschildRadiusKm(1)).toBeCloseTo(2.953, 2);
    expect(schwarzschildRadiusKm(10)).toBeCloseTo(29.53, 1);
  });

  it('keeps the shadow larger than the horizon by exactly 3*sqrt(3)/2', () => {
    // This ratio is the whole point of the misconceptions panel, so it is asserted, not typed in.
    const figures = sceneFigures(BASE);
    expect(figures.shadowToHorizonRatio).toBeCloseTo(CRITICAL_IMPACT_PARAMETER, 12);
    expect(figures.shadowToHorizonRatio).toBeCloseTo(2.598076, 5);
    expect(figures.shadowImpactParameterKm / figures.horizonKm).toBeCloseTo(2.598076, 5);
  });

  it('orders the critical radii as §2.4 requires', () => {
    const f = sceneFigures(BASE);
    expect(f.horizonKm).toBeLessThan(f.photonSphereKm);
    expect(f.photonSphereKm).toBeLessThan(f.shadowImpactParameterKm);
    expect(f.shadowImpactParameterKm).toBeLessThan(f.iscoKm);
    expect(f.photonSphereKm / f.horizonKm).toBeCloseTo(1.5, 12);
    expect(f.iscoKm / f.horizonKm).toBeCloseTo(3, 12);
  });

  it('scales every length linearly with mass, because Schwarzschild is scale-free', () => {
    const ten = sceneFigures(BASE);
    const forty = sceneFigures({ ...BASE, solarMasses: 40 });
    expect(forty.horizonKm / ten.horizonKm).toBeCloseTo(4, 12);
    expect(forty.shadowImpactParameterKm / ten.shadowImpactParameterKm).toBeCloseTo(4, 12);
    // The apparent angle does not change: the camera distance is in r_s units.
    expect(forty.shadowAngularRadiusArcsec).toBeCloseTo(ten.shadowAngularRadiusArcsec, 12);
  });

  it('shrinks the apparent shadow as the camera retreats', () => {
    expect(sceneFigures({ ...BASE, cameraDistance: 60 }).shadowAngularRadiusArcsec)
      .toBeLessThan(sceneFigures({ ...BASE, cameraDistance: 10 }).shadowAngularRadiusArcsec);
  });
});

describe('scene description', () => {
  it('states the shadow is the capture cross-section, not the horizon', () => {
    const text = describeScene(BASE);
    expect(text).toContain('photon capture cross-section');
    expect(text).toContain('2.598');
    expect(text).toContain('10 solar masses');
  });

  it('names the viewing geometry', () => {
    expect(describeScene({ ...BASE, inclination: 0 })).toContain('edge-on');
    expect(describeScene({ ...BASE, inclination: Math.PI / 2 })).toContain('face-on');
    expect(describeScene({ ...BASE, inclination: 0.6 })).toContain('tilted');
  });

  it('says when the disk is off and when cinematic mode is misleading', () => {
    expect(describeScene({ ...BASE, diskEnabled: false })).toContain('switched off');
    const cinematic = describeScene({ ...BASE, cinematic: true });
    expect(cinematic).toContain('not physical');
    expect(describeScene(BASE)).not.toContain('not physical');
  });

  it('reports the numbers a sighted user reads off the image', () => {
    const numbers = describeSceneNumbers(BASE);
    expect(numbers).toContain('Event horizon 29.53 kilometres');
    expect(numbers).toContain('Photon sphere 44.3 kilometres');
    expect(numbers).toContain('arcseconds');
    expect(numbers).toContain('320 integration steps');
  });
});
