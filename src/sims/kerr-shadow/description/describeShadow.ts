/** Text description and readout figures for the Kerr shadow scene.
 *
 * A WebGL canvas is opaque to assistive technology, so this is the substitute BUILD_PLAN §6
 * requires — and it has to carry the *physics*, not a picture caption. Pure and unit-tested, so
 * the description cannot drift from what is rendered.
 */
import {
  SHADOW_VERTICAL_HALF_EXTENT,
  ergosphereRadius,
  horizonAngularVelocity,
  horizonRadii,
  iscoRadius,
  penroseMaxEfficiency,
  photonOrbitRadius,
  shadowExtent,
} from '../../../core/kerr';

const DEGREES_IN_HALF_TURN = 180;
const DEGREES_PER_RADIAN = DEGREES_IN_HALF_TURN / Math.PI;
const PERCENT = 100;
const PLACES = 3;
const EDGE_ON_DEGREES = 5;
const FACE_ON_DEGREES = 75;

export interface ShadowScene {
  /** a/M. */
  spin: number;
  /** Camera radius in M. */
  cameraDistance: number;
  /** Camera latitude above the equatorial plane, radians. */
  inclination: number;
  ringEnabled: boolean;
  cinematic: boolean;
  stepsPerRay: number;
}

export interface ShadowFigures {
  outerHorizon: number;
  innerHorizon: number;
  /** Equatorial static limit. 2M at every spin — that is the point of showing it. */
  equatorialErgosphere: number;
  /** Polar extent of the ergosphere, which DOES move with spin. */
  polarErgosphere: number;
  prograde: number;
  retrograde: number;
  isco: number;
  /** Bardeen's α extent of the shadow, and its displacement. */
  shadowMin: number;
  shadowMax: number;
  shadowDisplacement: number;
  /** 3√3 M, at every spin. */
  shadowHalfHeight: number;
  horizonAngularVelocity: number;
  penroseCeiling: number;
}

export function shadowFigures(scene: ShadowScene): ShadowFigures {
  const { spin } = scene;
  const { outer, inner } = horizonRadii(spin);
  const extent = shadowExtent(spin);
  return {
    outerHorizon: outer,
    innerHorizon: inner,
    equatorialErgosphere: ergosphereRadius(spin, Math.PI / 2),
    polarErgosphere: ergosphereRadius(spin, 0),
    prograde: photonOrbitRadius(spin, 'prograde'),
    retrograde: photonOrbitRadius(spin, 'retrograde'),
    isco: iscoRadius(spin),
    shadowMin: extent.min,
    shadowMax: extent.max,
    shadowDisplacement: extent.midpoint,
    shadowHalfHeight: SHADOW_VERTICAL_HALF_EXTENT,
    horizonAngularVelocity: horizonAngularVelocity(spin),
    penroseCeiling: penroseMaxEfficiency(spin) * PERCENT,
  };
}

const m = (value: number) => `${value.toFixed(PLACES)} M`;

/** The standing description: what the picture is. */
export function describeShadow(scene: ShadowScene): string {
  const figures = shadowFigures(scene);
  const degrees = Math.abs(scene.inclination * DEGREES_PER_RADIAN);
  const view = degrees < EDGE_ON_DEGREES
    ? 'edge-on'
    : degrees > FACE_ON_DEGREES ? 'nearly down the spin axis' : `tilted ${degrees.toFixed(0)} degrees`;
  if (scene.spin === 0) {
    return 'A non-spinning black hole, seen ' + view + '. The shadow is a circle of radius '
      + `${m(figures.shadowHalfHeight)}, centred on the hole: with no spin there is no frame `
      + 'dragging, no ergosphere and nothing to displace it.';
  }
  return `A black hole spinning at a/M = ${scene.spin.toFixed(PLACES)}, seen ${view}. `
    + `The shadow runs from ${m(figures.shadowMin)} on the prograde side, where it is flattened, `
    + `to ${m(figures.shadowMax)} on the retrograde side — displaced by `
    + `${m(figures.shadowDisplacement)} from the hole. Its height is unchanged: `
    + `${m(figures.shadowHalfHeight)} either side of the equator at every spin.`;
}

/** The throttled live update: the numbers, spoken once the controls settle. */
export function describeShadowNumbers(scene: ShadowScene): string {
  const figures = shadowFigures(scene);
  const ring = scene.ringEnabled
    ? ` The ring is brighter on the prograde side, which is approaching; that is relativistic `
      + `beaming, and its brightness profile is uniform and not physical.`
    : '';
  const mode = scene.cinematic
    ? ' Cinematic mode: the Doppler term is removed, which is not physical.'
    : '';
  return `Spin a over M ${scene.spin.toFixed(PLACES)}. `
    + `Outer horizon ${m(figures.outerHorizon)}, inner horizon ${m(figures.innerHorizon)}. `
    + `Ergosphere ${m(figures.equatorialErgosphere)} at the equator and `
    + `${m(figures.polarErgosphere)} at the poles. `
    + `Prograde photon orbit ${m(figures.prograde)}, retrograde ${m(figures.retrograde)}, `
    + `prograde ISCO ${m(figures.isco)}. `
    + `Shadow from ${m(figures.shadowMin)} to ${m(figures.shadowMax)}, `
    + `displaced ${m(figures.shadowDisplacement)}.`
    + ring + mode;
}
