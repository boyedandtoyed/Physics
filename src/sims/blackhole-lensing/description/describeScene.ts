/** Text description of the scene, for the screen summary BUILD_PLAN §6 requires.
 *
 * A WebGL canvas is opaque to assistive technology: there is no structure inside it to read. This
 * is the substitute, and it has to carry the *physics*, not a picture caption — the numbers a
 * sighted user reads off the image are the numbers this has to state.
 *
 * Pure and unit-tested, so the description cannot quietly drift from what is rendered.
 */
import {
  CRITICAL_IMPACT_PARAMETER,
  HORIZON_RADIUS,
  ISCO_RADIUS,
  PHOTON_SPHERE_RADIUS,
  shadowAngularRadius,
} from '../../../core/schwarzschild';
import { G, C, SOLAR_MASS } from '../../../core/units';

const TWO = 2;
const KILOMETRES_PER_METRE = 1e-3;
const DEGREES_IN_HALF_TURN = 180;
const ARCSECONDS_PER_DEGREE = 3600;
const ARCSECONDS_PER_RADIAN = (DEGREES_IN_HALF_TURN / Math.PI) * ARCSECONDS_PER_DEGREE;
const DECIMAL_BASE = 10;
/** Below this the view reads as edge-on; above the face-on threshold, as face-on. */
const EDGE_ON_DEGREES = 5;
const FACE_ON_DEGREES = 75;

export interface SceneState {
  /** Black hole mass in solar masses. */
  solarMasses: number;
  /** Camera radius, r_s units. */
  cameraDistance: number;
  /** Camera latitude above the disk plane, radians. */
  inclination: number;
  diskEnabled: boolean;
  cinematic: boolean;
  stepsPerRay: number;
}

/** Schwarzschild radius in kilometres for a given mass. */
export function schwarzschildRadiusKm(solarMasses: number): number {
  return (TWO * G * solarMasses * SOLAR_MASS) / C ** TWO * KILOMETRES_PER_METRE;
}

const round = (value: number, places: number) => {
  const factor = DECIMAL_BASE ** places;
  return Math.round(value * factor) / factor;
};

/** Numbers shown in the readout and spoken in the summary. Keeping them in one place is what
 * stops the visible panel and the screen-reader text from disagreeing. */
export function sceneFigures(state: SceneState) {
  const horizonKm = schwarzschildRadiusKm(state.solarMasses);
  const shadowAngle = shadowAngularRadius(state.cameraDistance);
  return {
    horizonKm,
    photonSphereKm: horizonKm * PHOTON_SPHERE_RADIUS,
    iscoKm: horizonKm * ISCO_RADIUS,
    /** The apparent shadow is the photon *capture cross-section*, not the horizon. */
    shadowImpactParameterKm: horizonKm * CRITICAL_IMPACT_PARAMETER,
    shadowToHorizonRatio: CRITICAL_IMPACT_PARAMETER / HORIZON_RADIUS,
    shadowAngularRadiusArcsec: shadowAngle * ARCSECONDS_PER_RADIAN,
    inclinationDegrees: (state.inclination * DEGREES_IN_HALF_TURN) / Math.PI,
  };
}

/** One-sentence label for the canvas itself. */
export function describeScene(state: SceneState): string {
  const figures = sceneFigures(state);
  const view = Math.abs(figures.inclinationDegrees) < EDGE_ON_DEGREES
    ? 'edge-on'
    : Math.abs(figures.inclinationDegrees) > FACE_ON_DEGREES ? 'face-on' : `tilted ${round(figures.inclinationDegrees, 0)} degrees`;
  const disk = state.diskEnabled
    ? 'A Novikov–Thorne accretion disk surrounds it, brighter on the side rotating towards you.'
    : 'The accretion disk is switched off, leaving only the lensed star field.';
  const mode = state.cinematic
    ? ' Cinematic mode is on: the Doppler brightening has been removed, which is not physical.'
    : '';
  return `A non-rotating black hole of ${round(state.solarMasses, 2)} solar masses, viewed ${view} `
    + `from ${round(state.cameraDistance, 1)} Schwarzschild radii. The black disc is the photon `
    + `capture cross-section, ${round(figures.shadowToHorizonRatio, 3)} times the radius of the `
    + `event horizon. ${disk}${mode}`;
}

/** Live-region text: the numbers, stated plainly, for announcement after a control settles. */
export function describeSceneNumbers(state: SceneState): string {
  const f = sceneFigures(state);
  return [
    `Event horizon ${round(f.horizonKm, 2)} kilometres.`,
    `Photon sphere ${round(f.photonSphereKm, 2)} kilometres.`,
    `Innermost stable circular orbit ${round(f.iscoKm, 2)} kilometres.`,
    `Apparent shadow radius ${round(f.shadowImpactParameterKm, 2)} kilometres,`,
    `subtending ${round(f.shadowAngularRadiusArcsec, 1)} arcseconds from the camera.`,
    `Quality ${state.stepsPerRay} integration steps per ray.`,
  ].join(' ');
}
