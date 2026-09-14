/** The critical radii against spin — the curve BUILD_PLAN §4 asks for. PHYSICS_SPEC §3.3.
 *
 * Five curves over a/M ∈ [0, 1): the two horizons, the prograde and retrograde ISCO
 * (Bardeen–Press–Teukolsky), and the two equatorial photon orbits (Teo). They all meet at M as
 * the spin approaches extremal, which is the fact the curve exists to show and the one a table
 * of three endpoints cannot.
 *
 * Teo's photon orbits are the accuracy probe §4 names: they are computed from the closed form and
 * checked against the cubic `r³ − 6Mr² + 9M²r − 4a²M`, which is a different expression, rather
 * than against themselves.
 */
import {
  horizonRadii,
  iscoRadius,
  photonOrbitCubic,
  photonOrbitRadius,
} from '../../../core/kerr';

const TWO = 2;

export interface RadiiSample {
  spin: number;
  outerHorizon: number;
  innerHorizon: number;
  iscoPrograde: number;
  iscoRetrograde: number;
  photonPrograde: number;
  photonRetrograde: number;
}

export function radiiAt(spin: number): RadiiSample {
  const { outer, inner } = horizonRadii(spin);
  return {
    spin,
    outerHorizon: outer,
    innerHorizon: inner,
    iscoPrograde: iscoRadius(spin),
    iscoRetrograde: iscoRadius(spin, 'retrograde'),
    photonPrograde: photonOrbitRadius(spin, 'prograde'),
    photonRetrograde: photonOrbitRadius(spin, 'retrograde'),
  };
}

/**
 * Samples across the spin axis.
 *
 * Spacing is **quadratic towards extremal**: every one of these curves turns over in the last few
 * per cent of the spin — the prograde ISCO falls from 2.32 M at a/M = 0.9 to 1.24 M at 0.998 —
 * and linear spacing draws that as a corner rather than as a curve.
 */
export function radiiCurve(samples: number, maxSpin: number): RadiiSample[] {
  if (samples < TWO) throw new RangeError('A curve needs at least two samples.');
  if (!(maxSpin > 0) || maxSpin >= 1) throw new RangeError('Spin must be in (0, 1).');
  return Array.from({ length: samples }, (_, index) => {
    const fraction = index / (samples - 1);
    return radiiAt(maxSpin * (1 - (1 - fraction) ** TWO));
  });
}

/** Largest residual of the photon-orbit cubic across the curve: the accuracy probe, as a number. */
export function photonOrbitResidual(curve: readonly RadiiSample[]): number {
  let worst = 0;
  for (const sample of curve) {
    for (const radius of [sample.photonPrograde, sample.photonRetrograde]) {
      worst = Math.max(worst, Math.abs(photonOrbitCubic(radius, sample.spin)));
    }
  }
  return worst;
}
