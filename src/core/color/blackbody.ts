/** Blackbody colour: Planck spectrum -> CIE XYZ -> linear sRGB chromaticity.
 *
 * PHYSICS_SPEC §4.3. The table produced here holds **chromaticity only**, normalised to unit
 * luminance. Brightness is supplied separately from sigma*T^4. Storing luminance in the table as
 * well would re-introduce the g double-count the §4.3 audit removed, in a different disguise.
 *
 * Framework-free and float64; the shader consumes the finished table as a texture.
 */
import { BOLTZMANN, C, H } from '../units';

const TWO = 2;
const THREE = 3;
const HALF = 0.5;

/** Visible range, nm. The CMF fits are defined here and negligible outside. */
const LAMBDA_MIN_NM = 360;
const LAMBDA_MAX_NM = 830;
const LAMBDA_STEP_NM = 1;
const NANOMETRES_PER_METRE = 1e9;

/** Piecewise-Gaussian lobe: sigma switches at the peak. Wyman, Sloan & Shirley 2013. */
function lobe(lambda: number, peak: number, sigmaLow: number, sigmaHigh: number): number {
  const sigma = lambda < peak ? sigmaLow : sigmaHigh;
  const t = (lambda - peak) / sigma;
  return Math.exp(-HALF * t * t);
}

/** CIE 1931 colour-matching functions, analytic multi-lobe fit (JCGT 2(2), 2013). */
export function colourMatching(lambdaNm: number): [number, number, number] {
  const x = 1.056 * lobe(lambdaNm, 599.8, 37.9, 31.0)
    + 0.362 * lobe(lambdaNm, 442.0, 16.0, 26.7)
    - 0.065 * lobe(lambdaNm, 501.1, 20.4, 26.2);
  const y = 0.821 * lobe(lambdaNm, 568.8, 46.9, 40.5)
    + 0.286 * lobe(lambdaNm, 530.9, 16.3, 31.1);
  const z = 1.217 * lobe(lambdaNm, 437.0, 11.8, 36.0)
    + 0.681 * lobe(lambdaNm, 459.0, 26.0, 13.8);
  return [x, y, z];
}

/** Planck spectral radiance per unit wavelength, B_lambda(T), SI. */
export function planckSpectralRadiance(wavelengthMetres: number, temperature: number): number {
  const numerator = TWO * H * C ** TWO / wavelengthMetres ** (THREE + TWO);
  const exponent = H * C / (wavelengthMetres * BOLTZMANN * temperature);
  // expm1 keeps the low-frequency tail accurate where exp(x) - 1 would cancel catastrophically.
  return numerator / Math.expm1(exponent);
}

/** CIE XYZ of a blackbody at `temperature`, normalised so Y = 1 (chromaticity only). */
export function blackbodyXyz(temperature: number): [number, number, number] {
  let X = 0, Y = 0, Z = 0;
  for (let lambda = LAMBDA_MIN_NM; lambda <= LAMBDA_MAX_NM; lambda += LAMBDA_STEP_NM) {
    const radiance = planckSpectralRadiance(lambda / NANOMETRES_PER_METRE, temperature);
    const [x, y, z] = colourMatching(lambda);
    X += radiance * x;
    Y += radiance * y;
    Z += radiance * z;
  }
  if (Y <= 0) return [0, 0, 0];
  return [X / Y, 1, Z / Y];
}

/** CIE xy chromaticity coordinates. */
export function blackbodyChromaticity(temperature: number): [number, number] {
  const [X, Y, Z] = blackbodyXyz(temperature);
  const sum = X + Y + Z;
  return [X / sum, Y / sum];
}

/** Linear sRGB (IEC 61966-2-1, D65), normalised so the largest component is 1.
 *
 * Out-of-gamut colours are desaturated toward white by adding the most negative component to all
 * three, rather than clipped per channel — clipping shifts hue, which would misrepresent the
 * temperature the pixel is meant to convey.
 */
export function blackbodyLinearSrgb(temperature: number): [number, number, number] {
  const [X, Y, Z] = blackbodyXyz(temperature);
  let r = 3.2406 * X - 1.5372 * Y - 0.4986 * Z;
  let g = -0.9689 * X + 1.8758 * Y + 0.0415 * Z;
  let b = 0.0557 * X - 0.2040 * Y + 1.0570 * Z;
  const mostNegative = Math.min(r, g, b, 0);
  r -= mostNegative;
  g -= mostNegative;
  b -= mostNegative;
  const peak = Math.max(r, g, b);
  return peak > 0 ? [r / peak, g / peak, b / peak] : [0, 0, 0];
}

/** sRGB transfer function, for display only. Never apply this before physical arithmetic. */
export function encodeSrgb(linear: number): number {
  const clamped = Math.min(1, Math.max(0, linear));
  return clamped <= 0.0031308
    ? 12.92 * clamped
    : 1.055 * clamped ** (1 / 2.4) - 0.055;
}

export const LUT_MIN_TEMPERATURE = 1000;
export const LUT_MAX_TEMPERATURE = 30_000;

/** Chromaticity lookup table over [1000 K, 30000 K], as RGB triples in linear sRGB.
 * PHYSICS_SPEC §4.3 step 2: shift the temperature and look the colour up, rather than
 * shifting spectra per pixel. */
export function blackbodyColourTable(size: number): Float32Array {
  if (!Number.isSafeInteger(size) || size < TWO) {
    throw new RangeError('The colour table needs at least two entries.');
  }
  const table = new Float32Array(size * THREE);
  for (let i = 0; i < size; i++) {
    const t = i / (size - 1);
    const temperature = LUT_MIN_TEMPERATURE + t * (LUT_MAX_TEMPERATURE - LUT_MIN_TEMPERATURE);
    const [r, g, b] = blackbodyLinearSrgb(temperature);
    table[i * THREE] = r;
    table[i * THREE + 1] = g;
    table[i * THREE + THREE - 1] = b;
  }
  return table;
}
