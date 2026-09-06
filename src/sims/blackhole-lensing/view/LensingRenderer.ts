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
import {
  LENSING_CAPTURE_MASK_MODE,
  LENSING_FRAGMENT_SHADER,
  LENSING_STARS_MODE,
} from './lensingShader';

export type LensingMode = 'stars' | 'capture-mask';

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
}

/** Far enough out that the whole shadow and the first lensing ring sit comfortably in frame. */
const DEFAULT_CAMERA_DISTANCE = 20;
const DEFAULT_FIELD_OF_VIEW_DEGREES = 60;
/** Step budget per ray. §4.5 makes this the quality control; 320 holds the shadow edge to well
 * under a pixel at 1080p while staying interactive on a mid-range GPU. */
const DEFAULT_STEPS_PER_RAY = 320;

export const DEFAULT_LENSING_PARAMS: LensingParams = {
  cameraDistance: DEFAULT_CAMERA_DISTANCE,
  inclination: 0,
  azimuth: 0,
  fieldOfView: DEFAULT_FIELD_OF_VIEW_DEGREES,
  stepsPerRay: DEFAULT_STEPS_PER_RAY,
  mode: 'stars',
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
] as const;

const DEGREES_IN_HALF_TURN = 180;
const DEGREES_TO_RADIANS = Math.PI / DEGREES_IN_HALF_TURN;
/** Camera nearly on the polar axis: pick a different world-up to keep the basis stable. */
const POLE_GUARD = 0.999;
const HALF = 0.5;

type Vec3 = [number, number, number];

function normalise(v: Vec3): Vec3 {
  const length = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / length, v[1] / length, v[2] / length];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

/** Camera basis for an observer at `distance` looking directly at the hole. Exported because the
 * acceptance harness needs the identical projection to convert pixels back to angles. */
export function cameraFrame(params: LensingParams) {
  const { cameraDistance, inclination, azimuth } = params;
  const position: Vec3 = [
    cameraDistance * Math.cos(inclination) * Math.cos(azimuth),
    cameraDistance * Math.sin(inclination),
    cameraDistance * Math.cos(inclination) * Math.sin(azimuth),
  ];
  // Look at the origin.
  const forward = normalise([-position[0], -position[1], -position[2]]);
  const worldUp: Vec3 = Math.abs(forward[1]) > POLE_GUARD ? [0, 0, 1] : [0, 1, 0];
  const right = normalise(cross(forward, worldUp));
  const up = cross(right, forward);
  return { position, forward, right, up };
}

export class LensingRenderer {
  #gl: WebGL2RenderingContext;
  #program: WebGLProgram;
  #vao: WebGLVertexArrayObject;
  #uniforms: Record<(typeof UNIFORMS)[number], WebGLUniformLocation>;
  #params: LensingParams;
  #disposed = false;

  constructor(
    canvas: HTMLCanvasElement | OffscreenCanvas,
    params: Partial<LensingParams> = {},
    { preserveDrawingBuffer = false } = {},
  ) {
    this.#params = { ...DEFAULT_LENSING_PARAMS, ...params };
    validate(this.#params);
    const gl = createContext(canvas, { preserveDrawingBuffer });
    this.#gl = gl;
    this.#program = createProgram(gl, FULLSCREEN_TRIANGLE_VERTEX_SHADER, LENSING_FRAGMENT_SHADER);
    this.#uniforms = uniformLocations(gl, this.#program, UNIFORMS);
    const vao = gl.createVertexArray();
    if (!vao) throw new Error('Could not allocate a vertex array.');
    this.#vao = vao;
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
    const { position, forward, right, up } = cameraFrame(this.#params);

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
    gl.uniform1i(
      u.uMode,
      this.#params.mode === 'capture-mask' ? LENSING_CAPTURE_MASK_MODE : LENSING_STARS_MODE,
    );

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
    this.#disposed = true;
  }
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
}
