/** WebGL2 renderer for the Schwarzschild lensing simulation.
 *
 * Knows nothing about React (BUILD_PLAN §5). The React wrapper owns the canvas element and the
 * controls; this owns the GL resources and the camera, and renders on demand.
 */
import {
  FULLSCREEN_TRIANGLE_VERTEX_COUNT,
  FULLSCREEN_TRIANGLE_VERTEX_SHADER,
  createContext,
  createProgram,
  uniformLocations,
} from '../../../core/gl/context';
import { HORIZON_RADIUS } from '../../../core/schwarzschild';
import { cameraFrame } from '../model/camera';
import {
  LENSING_CAPTURE_MASK_MODE,
  LENSING_DISK_DIAGNOSTIC_MODE,
  LENSING_DISK_LUMINANCE_MODE,
  LENSING_FRAGMENT_SHADER,
  LENSING_STARS_MODE,
} from './lensingShader';
import {
  LUT_MAX_TEMPERATURE,
  LUT_MIN_TEMPERATURE,
  blackbodyColourTable,
} from '../../../core/color/blackbody';
import { ISCO_RADIUS, NT_PEAK_FLUX } from '../../../core/schwarzschild';

export type LensingMode = 'stars' | 'capture-mask' | 'disk-diagnostic' | 'disk-luminance';

export interface LensingParams {
  /** Camera radius in r_s = 1 units. Must be outside the horizon. */
  cameraDistance: number;
  /** Camera latitude in radians. 0 looks along the equatorial plane. */
  inclination: number;
  /** Azimuth in radians. */
  azimuth: number;
  /** Vertical field of view in degrees. */
  fieldOfView: number;
  /** Integration budget per ray; the quality control of §4.5. */
  stepsPerRay: number;
  mode: LensingMode;
  /** Draw the Novikov-Thorne disk. Physical mode is the default (§4.3). */
  diskEnabled: boolean;
  /** Inner edge, r_s units. The ISCO is the zero-torque boundary the NT profile assumes. */
  diskInnerRadius: number;
  diskOuterRadius: number;
  /** Effective temperature at the flux peak, kelvin. Sets where the disk sits in the colour LUT. */
  peakTemperature: number;
  /** Display exposure. Tone mapping is cosmetic and applied after all physical arithmetic. */
  exposure: number;
  /** Sub-pixel sample offset in pixels. Diagnostics must leave this at [0, 0]. */
  jitter: readonly [number, number];
}

/** Far enough out that the whole shadow and the first lensing ring sit comfortably in frame. */
const DEFAULT_CAMERA_DISTANCE = 20;
const DEFAULT_FIELD_OF_VIEW_DEGREES = 60;
/** Step budget per ray. §4.5 makes this the quality control; 320 holds the shadow edge to well
 * under a pixel at 1080p while staying interactive on a mid-range GPU. */
const DEFAULT_STEPS_PER_RAY = 320;
const DEFAULT_DISK_OUTER_RADIUS = 12;
/** A stellar-mass hole's inner disk runs to ~10^7 K; this is a display choice that places the
 * peak inside the 1000-30000 K colour table, and it is labelled as such in the UI. */
const DEFAULT_PEAK_TEMPERATURE = 9000;
const DEFAULT_EXPOSURE = 1.6;
const COLOUR_TABLE_SIZE = 256;
/** Full-scale value of an 8-bit texture channel. */
const BYTE_MAX = 255;

export const DEFAULT_LENSING_PARAMS: LensingParams = {
  cameraDistance: DEFAULT_CAMERA_DISTANCE,
  inclination: 0,
  azimuth: 0,
  fieldOfView: DEFAULT_FIELD_OF_VIEW_DEGREES,
  stepsPerRay: DEFAULT_STEPS_PER_RAY,
  mode: 'stars',
  diskEnabled: true,
  diskInnerRadius: ISCO_RADIUS,
  diskOuterRadius: DEFAULT_DISK_OUTER_RADIUS,
  peakTemperature: DEFAULT_PEAK_TEMPERATURE,
  exposure: DEFAULT_EXPOSURE,
  jitter: [0, 0],
};

const UNIFORMS = [
  'uResolution',
  'uCameraPosition',
  'uCameraRight',
  'uCameraUp',
  'uCameraForward',
  'uTanHalfFov',
  'uMaxSteps',
  'uMode',
  'uDiskInner',
  'uDiskOuter',
  'uPeakFlux',
  'uPeakTemperature',
  'uExposure',
  'uDiskEnabled',
  'uColourTable',
  'uLutMinTemperature',
  'uLutMaxTemperature',
  'uJitter',
] as const;

const MODE_CODES: Record<LensingMode, number> = {
  stars: LENSING_STARS_MODE,
  'capture-mask': LENSING_CAPTURE_MASK_MODE,
  'disk-diagnostic': LENSING_DISK_DIAGNOSTIC_MODE,
  'disk-luminance': LENSING_DISK_LUMINANCE_MODE,
};

const DEGREES_IN_HALF_TURN = 180;
const DEGREES_TO_RADIANS = Math.PI / DEGREES_IN_HALF_TURN;
const HALF = 0.5;


export class LensingRenderer {
  #gl: WebGL2RenderingContext;
  #program: WebGLProgram;
  #vao: WebGLVertexArrayObject;
  #uniforms: Record<(typeof UNIFORMS)[number], WebGLUniformLocation>;
  #colourTable: WebGLTexture;
  #params: LensingParams;
  #disposed = false;

  constructor(
    canvas: HTMLCanvasElement | OffscreenCanvas,
    params: Partial<LensingParams> = {},
    { preserveDrawingBuffer = false, alpha = false } = {},
  ) {
    this.#params = { ...DEFAULT_LENSING_PARAMS, ...params };
    validate(this.#params);
    const gl = createContext(canvas, { preserveDrawingBuffer, alpha });
    this.#gl = gl;
    this.#program = createProgram(gl, FULLSCREEN_TRIANGLE_VERTEX_SHADER, LENSING_FRAGMENT_SHADER);
    this.#uniforms = uniformLocations(gl, this.#program, UNIFORMS);
    const vao = gl.createVertexArray();
    if (!vao) throw new Error('Could not allocate a vertex array.');
    this.#vao = vao;
    this.#colourTable = createColourTexture(gl);
  }

  setParams(next: Partial<LensingParams>): void {
    const merged = { ...this.#params, ...next };
    validate(merged);
    this.#params = merged;
  }

  getState(): Readonly<LensingParams> {
    return { ...this.#params };
  }

  render(): void {
    if (this.#disposed) throw new Error('This renderer has been disposed.');
    const gl = this.#gl;
    const { width, height } = gl.canvas;
    const { cameraDistance, inclination, azimuth } = this.#params;
    const { position, forward, right, up } = cameraFrame({
      distance: cameraDistance, inclination, azimuth,
    });

    gl.viewport(0, 0, width, height);
    gl.useProgram(this.#program);
    gl.bindVertexArray(this.#vao);

    const u = this.#uniforms;
    gl.uniform2f(u.uResolution, width, height);
    gl.uniform3f(u.uCameraPosition, position[0], position[1], position[2]);
    gl.uniform3f(u.uCameraRight, right[0], right[1], right[2]);
    gl.uniform3f(u.uCameraUp, up[0], up[1], up[2]);
    gl.uniform3f(u.uCameraForward, forward[0], forward[1], forward[2]);
    gl.uniform1f(u.uTanHalfFov, Math.tan(this.#params.fieldOfView * DEGREES_TO_RADIANS * HALF));
    gl.uniform1i(u.uMaxSteps, this.#params.stepsPerRay);
    gl.uniform1i(u.uMode, MODE_CODES[this.#params.mode]);
    gl.uniform1f(u.uDiskInner, this.#params.diskInnerRadius);
    gl.uniform1f(u.uDiskOuter, this.#params.diskOuterRadius);
    gl.uniform1f(u.uPeakFlux, NT_PEAK_FLUX);
    gl.uniform1f(u.uPeakTemperature, this.#params.peakTemperature);
    gl.uniform1f(u.uExposure, this.#params.exposure);
    gl.uniform1i(u.uDiskEnabled, this.#params.diskEnabled ? 1 : 0);
    gl.uniform1f(u.uLutMinTemperature, LUT_MIN_TEMPERATURE);
    gl.uniform1f(u.uLutMaxTemperature, LUT_MAX_TEMPERATURE);
    gl.uniform2f(u.uJitter, this.#params.jitter[0], this.#params.jitter[1]);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.#colourTable);
    gl.uniform1i(u.uColourTable, 0);

    gl.drawArrays(gl.TRIANGLES, 0, FULLSCREEN_TRIANGLE_VERTEX_COUNT);
    gl.bindVertexArray(null);
  }

  /** Read the rendered frame back as RGBA rows, top row first. */
  readPixels(): { width: number; height: number; pixels: Uint8Array } {
    const gl = this.#gl;
    const { width, height } = gl.canvas;
    const pixels = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    // GL returns bottom-up; flip so row 0 is the top of the image.
    const stride = width * 4;
    const flipped = new Uint8Array(pixels.length);
    for (let row = 0; row < height; row++) {
      flipped.set(pixels.subarray(row * stride, (row + 1) * stride), (height - 1 - row) * stride);
    }
    return { width, height, pixels: flipped };
  }

  dispose(): void {
    if (this.#disposed) return;
    const gl = this.#gl;
    gl.deleteProgram(this.#program);
    gl.deleteVertexArray(this.#vao);
    gl.deleteTexture(this.#colourTable);
    this.#disposed = true;
  }
}

/** Upload the luminance-normalised blackbody chromaticity table as a 1D texture.
 * Linear filtering makes the temperature ramp continuous rather than banded. */
function createColourTexture(gl: WebGL2RenderingContext): WebGLTexture {
  const texture = gl.createTexture();
  if (!texture) throw new Error('Could not allocate the colour table texture.');
  const table = blackbodyColourTable(COLOUR_TABLE_SIZE);
  const bytes = new Uint8Array(COLOUR_TABLE_SIZE * 4);
  for (let i = 0; i < COLOUR_TABLE_SIZE; i++) {
    for (let channel = 0; channel < 3; channel++) {
      bytes[i * 4 + channel] = Math.round(BYTE_MAX * (table[i * 3 + channel] ?? 0));
    }
    bytes[i * 4 + 3] = BYTE_MAX;
  }
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, COLOUR_TABLE_SIZE, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return texture;
}

function validate(params: LensingParams): void {
  if (!Number.isFinite(params.cameraDistance) || params.cameraDistance <= HORIZON_RADIUS) {
    throw new RangeError('The camera must sit outside the horizon.');
  }
  if (!Number.isFinite(params.fieldOfView) || params.fieldOfView <= 0 || params.fieldOfView >= DEGREES_IN_HALF_TURN) {
    throw new RangeError('Field of view must be within (0, 180) degrees.');
  }
  if (!Number.isSafeInteger(params.stepsPerRay) || params.stepsPerRay < 1) {
    throw new RangeError('Steps per ray must be a positive integer.');
  }
  if (params.diskInnerRadius < ISCO_RADIUS) {
    // The Novikov-Thorne profile assumes a zero-torque boundary at the ISCO; inside it there are
    // no circular orbits, so the model simply does not apply.
    throw new RangeError('The disk cannot extend inside the ISCO.');
  }
  if (!(params.diskOuterRadius > params.diskInnerRadius)) {
    throw new RangeError('The disk outer radius must exceed the inner radius.');
  }
  if (!(params.peakTemperature > 0) || !(params.exposure > 0)) {
    throw new RangeError('Peak temperature and exposure must be positive.');
  }
}
