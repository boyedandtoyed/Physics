/** WebGL2 renderer for the Kerr shadow simulation.
 *
 * Knows nothing about React (BUILD_PLAN §5). Same arrangement as the Schwarzschild raymarcher:
 * resolution scaling and jittered accumulation from PHYSICS_SPEC §4.5, with the history
 * discarded on any parameter change other than the jitter.
 */
import {
  FULLSCREEN_TRIANGLE_VERTEX_COUNT,
  FULLSCREEN_TRIANGLE_VERTEX_SHADER,
  createContext,
  createProgram,
  uniformLocations,
} from '../../../core/gl/context';
import {
  ACCUMULATE_FRAGMENT_SHADER,
  BLIT_FRAGMENT_SHADER,
  createRenderTarget,
  disposeRenderTarget,
  haltonJitter,
  type RenderTarget,
} from '../../../core/gl/framebuffer';
import { MAX_SPIN, horizonRadii, iscoRadius } from '../../../core/kerr';
import {
  KERR_CAPTURE_MASK_MODE,
  KERR_FRAGMENT_SHADER,
  KERR_HAMILTONIAN_MODE,
  KERR_STARS_MODE,
} from './kerrShader';
import { cameraFrame, tanHalfFieldOfView } from './camera';

export type KerrMode = 'stars' | 'capture-mask' | 'hamiltonian';

export interface KerrParams {
  /** a/M. 0 is the Schwarzschild limit; a = M is extremal and singular, so the slider stops at
   * 0.998 — the Thorne limit, above which accretion torque cannot spin a hole anyway. */
  spin: number;
  /** Camera radius in M. */
  cameraDistance: number;
  /** Camera latitude in radians. 0 is edge-on. */
  inclination: number;
  azimuth: number;
  fieldOfView: number;
  stepsPerRay: number;
  mode: KerrMode;
  ringEnabled: boolean;
  /** Inner edge. Defaults to the prograde ISCO for the current spin. */
  ringInnerRadius: number;
  ringOuterRadius: number;
  exposure: number;
  jitter: readonly [number, number];
  grain: number;
  resolutionScale: number;
  /** Blend towards the non-physical symmetric look. **Physical (0) is the default.** */
  cinematic: number;
  accumulate: boolean;
}

/** Far enough out that the shadow and its displacement both sit comfortably in frame. */
const DEFAULT_CAMERA_DISTANCE = 30;
const DEFAULT_FIELD_OF_VIEW_DEGREES = 40;
/** Kerr–Schild RK4 is four metric evaluations a step against the Schwarzschild Nyström form's
 * four accelerations, and each evaluation is much heavier. 260 holds the shadow edge well inside
 * a pixel at the shipped resolution scale. */
const DEFAULT_STEPS_PER_RAY = 260;
const DEFAULT_RING_OUTER_RADIUS = 14;
const DEFAULT_EXPOSURE = 1.1;
const DEFAULT_SPIN = 0.9;
const GRAIN_SEED_STRIDE = 17;

export const DEFAULT_KERR_PARAMS: KerrParams = {
  spin: DEFAULT_SPIN,
  cameraDistance: DEFAULT_CAMERA_DISTANCE,
  inclination: 0,
  azimuth: 0,
  fieldOfView: DEFAULT_FIELD_OF_VIEW_DEGREES,
  stepsPerRay: DEFAULT_STEPS_PER_RAY,
  mode: 'stars',
  ringEnabled: true,
  ringInnerRadius: iscoRadius(DEFAULT_SPIN),
  ringOuterRadius: DEFAULT_RING_OUTER_RADIUS,
  exposure: DEFAULT_EXPOSURE,
  jitter: [0, 0],
  grain: 0,
  resolutionScale: 1,
  cinematic: 0,
  accumulate: false,
};

const UNIFORMS = [
  'uResolution',
  'uCameraPosition',
  'uCameraRight',
  'uCameraUp',
  'uCameraForward',
  'uTanHalfFov',
  'uSpin',
  'uMaxSteps',
  'uMode',
  'uRingEnabled',
  'uRingInner',
  'uRingOuter',
  'uExposure',
  'uJitter',
  'uCinematic',
] as const;

const MODE_CODES: Record<KerrMode, number> = {
  stars: KERR_STARS_MODE,
  'capture-mask': KERR_CAPTURE_MASK_MODE,
  hamiltonian: KERR_HAMILTONIAN_MODE,
};

const DEGREES_IN_HALF_TURN = 180;

function validate(params: KerrParams): void {
  if (!Number.isFinite(params.spin) || params.spin < 0 || params.spin > MAX_SPIN) {
    throw new RangeError(`Spin a/M must be in [0, ${MAX_SPIN}].`);
  }
  const { outer } = horizonRadii(params.spin);
  if (!Number.isFinite(params.cameraDistance) || params.cameraDistance <= outer) {
    throw new RangeError('The camera must be outside the horizon.');
  }
  if (!Number.isFinite(params.fieldOfView)
    || params.fieldOfView <= 0 || params.fieldOfView >= DEGREES_IN_HALF_TURN) {
    throw new RangeError('The field of view must be in (0, 180) degrees.');
  }
  if (!Number.isSafeInteger(params.stepsPerRay) || params.stepsPerRay < 1) {
    throw new RangeError('Steps per ray must be a positive integer.');
  }
  if (!(params.ringOuterRadius > params.ringInnerRadius)) {
    throw new RangeError('The ring needs a positive width.');
  }
  if (params.ringInnerRadius < outer) {
    throw new RangeError('The ring cannot start inside the horizon.');
  }
  if (!Number.isFinite(params.grain) || params.grain < 0 || params.grain > 1) {
    throw new RangeError('Grain must be between 0 and 1.');
  }
  if (!(params.exposure > 0)) throw new RangeError('Exposure must be positive.');
  if (!(params.resolutionScale > 0) || params.resolutionScale > 1) {
    throw new RangeError('The resolution scale must be in (0, 1].');
  }
  if (!(params.cinematic >= 0) || params.cinematic > 1) {
    throw new RangeError('The cinematic blend must be between 0 and 1.');
  }
}

export class KerrRenderer {
  #gl: WebGL2RenderingContext;
  #program: WebGLProgram;
  #vao: WebGLVertexArrayObject;
  #uniforms: Record<(typeof UNIFORMS)[number], WebGLUniformLocation>;
  #blitProgram: WebGLProgram;
  #accumulateProgram: WebGLProgram;
  #scene?: RenderTarget;
  #history: [RenderTarget?, RenderTarget?] = [undefined, undefined];
  #frameIndex = 0;
  #params: KerrParams;
  #disposed = false;

  constructor(
    canvas: HTMLCanvasElement | OffscreenCanvas,
    params: Partial<KerrParams> = {},
    { preserveDrawingBuffer = false, alpha = false } = {},
  ) {
    this.#params = { ...DEFAULT_KERR_PARAMS, ...params };
    validate(this.#params);
    const gl = createContext(canvas, { preserveDrawingBuffer, alpha });
    this.#gl = gl;
    this.#program = createProgram(gl, FULLSCREEN_TRIANGLE_VERTEX_SHADER, KERR_FRAGMENT_SHADER);
    this.#uniforms = uniformLocations(gl, this.#program, UNIFORMS);
    const vao = gl.createVertexArray();
    if (!vao) throw new Error('Could not allocate a vertex array.');
    this.#vao = vao;
    this.#blitProgram = createProgram(gl, FULLSCREEN_TRIANGLE_VERTEX_SHADER, BLIT_FRAGMENT_SHADER);
    this.#accumulateProgram =
      createProgram(gl, FULLSCREEN_TRIANGLE_VERTEX_SHADER, ACCUMULATE_FRAGMENT_SHADER);
  }

  setParams(next: Partial<KerrParams>): void {
    const merged = { ...this.#params, ...next };
    validate(merged);
    const changed = (Object.keys(merged) as (keyof KerrParams)[])
      .some(key => key !== 'jitter' && merged[key] !== this.#params[key]);
    this.#params = merged;
    if (changed) this.resetAccumulation();
  }

  resetAccumulation(): void {
    this.#frameIndex = 0;
  }

  get accumulatedFrames(): number {
    return this.#frameIndex;
  }

  getState(): Readonly<KerrParams> {
    return { ...this.#params };
  }

  render(): void {
    if (this.#disposed) throw new Error('This renderer has been disposed.');
    const gl = this.#gl;
    const { width, height } = gl.canvas;

    // Diagnostic modes encode data, not colour: averaging or upsampling them would corrupt the
    // encoded values, so they render straight to the canvas at full scale.
    if (this.#params.mode !== 'stars') {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      this.#drawScene(width, height, [0, 0]);
      return;
    }

    const scale = this.#params.resolutionScale;
    const passWidth = Math.max(1, Math.round(width * scale));
    const passHeight = Math.max(1, Math.round(height * scale));
    this.#ensureTargets(passWidth, passHeight);
    const scene = this.#scene as RenderTarget;
    const previous = this.#history[this.#frameIndex % 2] as RenderTarget;
    const next = this.#history[(this.#frameIndex + 1) % 2] as RenderTarget;

    const jitter = this.#params.accumulate ? haltonJitter(this.#frameIndex) : this.#params.jitter;

    gl.bindFramebuffer(gl.FRAMEBUFFER, scene.framebuffer);
    this.#drawScene(passWidth, passHeight, jitter);

    let source = scene;
    if (this.#params.accumulate) {
      const blend = 1 / (this.#frameIndex + 1);
      gl.bindFramebuffer(gl.FRAMEBUFFER, next.framebuffer);
      gl.viewport(0, 0, passWidth, passHeight);
      gl.useProgram(this.#accumulateProgram);
      gl.bindVertexArray(this.#vao);
      this.#setTexture(this.#accumulateProgram, 'uCurrent', scene.texture, 0);
      this.#setTexture(this.#accumulateProgram, 'uHistory', previous.texture, 1);
      this.#setVec2(this.#accumulateProgram, 'uTargetSize', passWidth, passHeight);
      this.#setFloat(this.#accumulateProgram, 'uBlend', this.#frameIndex === 0 ? 1 : blend);
      gl.drawArrays(gl.TRIANGLES, 0, FULLSCREEN_TRIANGLE_VERTEX_COUNT);
      source = next;
      this.#frameIndex++;
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);
    gl.useProgram(this.#blitProgram);
    gl.bindVertexArray(this.#vao);
    this.#setTexture(this.#blitProgram, 'uSource', source.texture, 0);
    this.#setVec2(this.#blitProgram, 'uTargetSize', width, height);
    this.#setFloat(this.#blitProgram, 'uGrain', this.#params.grain);
    this.#setFloat(this.#blitProgram, 'uGrainSeed', this.#frameIndex * GRAIN_SEED_STRIDE);
    gl.drawArrays(gl.TRIANGLES, 0, FULLSCREEN_TRIANGLE_VERTEX_COUNT);
    gl.bindVertexArray(null);
  }

  #ensureTargets(width: number, height: number): void {
    const gl = this.#gl;
    const stale = !this.#scene || this.#scene.width !== width || this.#scene.height !== height;
    if (!stale) return;
    for (const target of [this.#scene, ...this.#history]) {
      if (target) disposeRenderTarget(gl, target);
    }
    this.#scene = createRenderTarget(gl, width, height);
    this.#history = [createRenderTarget(gl, width, height), createRenderTarget(gl, width, height)];
    this.#frameIndex = 0;
  }

  #setTexture(program: WebGLProgram, name: string, texture: WebGLTexture, unit: number): void {
    const gl = this.#gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(gl.getUniformLocation(program, name), unit);
  }

  #setVec2(program: WebGLProgram, name: string, x: number, y: number): void {
    this.#gl.uniform2f(this.#gl.getUniformLocation(program, name), x, y);
  }

  #setFloat(program: WebGLProgram, name: string, value: number): void {
    this.#gl.uniform1f(this.#gl.getUniformLocation(program, name), value);
  }

  #drawScene(width: number, height: number, jitter: readonly [number, number]): void {
    const gl = this.#gl;
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
    gl.uniform1f(u.uTanHalfFov, tanHalfFieldOfView(this.#params.fieldOfView));
    gl.uniform1f(u.uSpin, this.#params.spin);
    gl.uniform1i(u.uMaxSteps, this.#params.stepsPerRay);
    gl.uniform1i(u.uMode, MODE_CODES[this.#params.mode]);
    gl.uniform1i(u.uRingEnabled, this.#params.ringEnabled ? 1 : 0);
    gl.uniform1f(u.uRingInner, this.#params.ringInnerRadius);
    gl.uniform1f(u.uRingOuter, this.#params.ringOuterRadius);
    gl.uniform1f(u.uExposure, this.#params.exposure);
    gl.uniform2f(u.uJitter, jitter[0], jitter[1]);
    gl.uniform1f(u.uCinematic, this.#params.cinematic);
    gl.drawArrays(gl.TRIANGLES, 0, FULLSCREEN_TRIANGLE_VERTEX_COUNT);
    gl.bindVertexArray(null);
  }

  /** Block until the GPU has finished. `gl.finish()` alone returns before the work completes in
   * Chromium; reading one pixel back forces a real round trip. */
  finish(): void {
    const gl = this.#gl;
    gl.finish();
    const pixel = new Uint8Array(4);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
  }

  rendererName(): string {
    const gl = this.#gl;
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    return info
      ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL))
      : String(gl.getParameter(gl.RENDERER));
  }

  /** Read the rendered frame back as RGBA rows, top row first. */
  readPixels(): { width: number; height: number; pixels: Uint8Array } {
    const gl = this.#gl;
    const { width, height } = gl.canvas;
    const pixels = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
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
    gl.deleteProgram(this.#blitProgram);
    gl.deleteProgram(this.#accumulateProgram);
    gl.deleteVertexArray(this.#vao);
    for (const target of [this.#scene, ...this.#history]) {
      if (target) disposeRenderTarget(gl, target);
    }
    this.#disposed = true;
  }
}
