/** What the Phase 1 acceptance test predicts the shadow radius should be.
 *
 * The measurement itself is `core/imageMeasure.ts`, shared with the Kerr sim and re-exported
 * here so this module stays the one place the Schwarzschild acceptance test reads from. This
 * file keeps the *prediction*, which is Schwarzschild's and nobody else's.
 */
import { shadowAngularRadius } from '../../../core/schwarzschild';
import { measureShadowRadius, type Frame, type ShadowMeasurement } from '../../../core/imageMeasure';

export { measureShadowRadius };
export type { Frame, ShadowMeasurement };

const HALF = 0.5;
const DEGREES_IN_HALF_TURN = 180;

/** Shadow edge radius in pixels predicted analytically, for the same pinhole projection the
 * shader uses. Along the vertical axis a ray at angle theta lands at
 * ndc = tan(theta)/tan(fov/2), and ndc = 1 is half the frame height. */
export function predictedShadowRadiusPixels(
  cameraDistance: number,
  fieldOfViewDegrees: number,
  frameHeight: number,
): number {
  const theta = shadowAngularRadius(cameraDistance);
  const tanHalfFov = Math.tan((fieldOfViewDegrees * Math.PI) / DEGREES_IN_HALF_TURN * HALF);
  return (Math.tan(theta) / tanHalfFov) * (frameHeight * HALF);
}
