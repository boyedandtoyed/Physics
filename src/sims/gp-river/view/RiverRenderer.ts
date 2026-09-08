/** WebGL2 renderer for the Gullstrand-Painlevé flow field, PHYSICS_SPEC §5.
 *
 * Markers are laid out on radial spokes and advected inward along the exact GP trajectory
 * r(t) = (r0^{3/2} - (3/2)t)^{2/3}, in units of r_s and c. Each marker carries its own phase so
 * the spokes do not pulse in unison, and recycles to the outer edge once it passes the inner
 * cutoff — which is at 0.1 r_s, not 0, because r = 0 is the curvature singularity and the flow
 * speed diverges there.
 *
 * Colour is a function of speed alone and the band edges are physical: 0.5c is exactly r = 4 r_s
 * and 1c is exactly the horizon. Nothing here is tuned by eye.
 */
import { createContext, createProgram } from '../../../core/gl/context';
import { advect, infallTime, riverSpeedOverC } from '../../../core/river';

const VERTEX_SHADER = `#version 300 es
precision highp float;
/** Unit direction of this marker's spoke, and its phase offset along the fall. */
in vec2 aDirection;
in float aPhase;
/** Which end of the arrow segment: 0 = tail, 1 = head. */
in float aEnd;

uniform float uTime;
uniform float uOuterRadius;
uniform float uInnerCutoff;
uniform float uFallTime;
uniform float uArrowLength;
uniform vec2 uViewport;
uniform float uPixelsPerRs;

out float vSpeed;
out float vEnd;

/** Exact GP infall: r(t) = (r0^{3/2} - (3/2)t)^{2/3}, clamped at the inner cutoff. */
float radiusAt(float elapsed) {
  float cubed = pow(uOuterRadius, 1.5) - 1.5 * elapsed;
  return cubed <= 0.0 ? 0.0 : pow(cubed, 2.0 / 3.0);
}

void main() {
  // aEnd > 1.5 marks the horizon ring: fixed geometry at exactly r = r_s, drawn rather than left
  // to whichever marker happens to be passing. The horizon is the one radius that has to be
  // unambiguous, and a sampled field cannot promise it is ever occupied.
  bool isRing = aEnd > 1.5;
  // Each marker is at its own point in the same fall, wrapped so the field is steady in time.
  float elapsed = mod(uTime + aPhase * uFallTime, uFallTime);
  float r = isRing ? 1.0 : max(radiusAt(elapsed), uInnerCutoff);
  // The arrow points the way the flow does: inward. Its tail is further out than its head.
  float speed = sqrt(1.0 / max(r, 1e-4));
  vSpeed = speed;
  vEnd = aEnd;
  // Arrow length is a fraction of the FRAME, not a fixed number of r_s: defined in r_s it
  // shrinks to a few pixels as soon as the outer edge is widened, which is what happened.
  // Floored so a slow arrow is still legible, and capped at a fraction of its own radius so an
  // inner arrow never overshoots the centre.
  float base = uArrowLength * uOuterRadius;
  float length = clamp(base * speed, base * 0.45, r * 0.55);
  float radius = (!isRing && aEnd < 0.5) ? r + length : r;
  vec2 world = aDirection * radius;
  vec2 clip = (world * uPixelsPerRs) / (uViewport * 0.5);
  gl_Position = vec4(clip, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
in float vSpeed;
in float vEnd;
uniform vec3 uSlowColour;
uniform vec3 uFastColour;
uniform vec3 uHorizonColour;
uniform vec3 uSuperluminalColour;
out vec4 fragColor;

void main() {
  if (vEnd > 1.5) {
    fragColor = vec4(uHorizonColour, 1.0);
    return;
  }
  vec3 colour;
  if (vSpeed > 1.01) {
    // Inside the horizon: desaturated red. Still dragging everything inward, and still not a
    // causality violation -- nothing moves faster than c relative to the river.
    colour = uSuperluminalColour;
  } else if (vSpeed > 0.99) {
    colour = uHorizonColour;
  } else if (vSpeed < 0.5) {
    // Below half light speed -- everything outside r = 4 r_s -- is one flat band. Ramping this
    // region towards amber instead leaves the whole visible field amber, because the flow only
    // approaches zero asymptotically and never gets near the blue end on screen.
    colour = uSlowColour;
  } else {
    // 0.5c to c: the gradient that actually spans a visible range, between 4 r_s and the horizon.
    colour = mix(uSlowColour, uFastColour, (vSpeed - 0.5) / 0.49);
  }
  // Arrow tails fade towards the tail, so each marker reads as travelling head-first — inward.
  // The floor is high enough that the colour band still reads; at 0.15 the whole field greyed out.
  float alpha = mix(0.45, 1.0, vEnd);
  fragColor = vec4(colour, alpha);
}
`;

export interface RiverParams {
  /** Outer edge of the seeded field, in r_s. */
  outerRadius: number;
  /** Markers recycle here. 0.1 r_s, not 0: the flow diverges at the singularity. */
  innerCutoff: number;
  spokes: number;
  markersPerSpoke: number;
  /** Marker length at 1c, in r_s. */
  arrowLength: number;
  /** Seconds of wall time per r_s/c of flow time. */
  timeScale: number;
  slowColour: readonly [number, number, number];
  fastColour: readonly [number, number, number];
  horizonColour: readonly [number, number, number];
  superluminalColour: readonly [number, number, number];
}

/** 12 rₛ: the flow is 0.29c at the edge, so a real span of the sub-0.5c band is on screen and
 * the blue end of the scale is actually reached. Closer in and the whole field is already amber;
 * much further out and the horizon ring gets too small to read. */
const DEFAULT_OUTER = 12;
const DEFAULT_INNER_CUTOFF = 0.1;
const DEFAULT_SPOKES = 44;
const DEFAULT_MARKERS = 13;
/** Arrow length at 1c, as a fraction of the outer radius. */
const DEFAULT_ARROW = 0.055;
const DEFAULT_TIME_SCALE = 0.35;

/** Flow palette, linear RGB. The band edges these colours mark are physical — 0.5c is exactly
 * r = 4 r_s and 1c is exactly the horizon — so the colours are named per channel like every
 * other number in this repo rather than tuned inline. */
const SLOW_R = 0.22;
const SLOW_G = 0.48;
const SLOW_B = 0.85;
const FAST_R = 0.95;
const FAST_G = 0.68;
const FAST_B = 0.15;
const SUPER_R = 0.72;
const SUPER_G = 0.28;
const SUPER_B = 0.28;

export const DEFAULT_RIVER_PARAMS: RiverParams = {
  outerRadius: DEFAULT_OUTER,
  innerCutoff: DEFAULT_INNER_CUTOFF,
  spokes: DEFAULT_SPOKES,
  markersPerSpoke: DEFAULT_MARKERS,
  arrowLength: DEFAULT_ARROW,
  timeScale: DEFAULT_TIME_SCALE,
  slowColour: [SLOW_R, SLOW_G, SLOW_B],
  fastColour: [FAST_R, FAST_G, FAST_B],
  horizonColour: [1, 1, 1],
  superluminalColour: [SUPER_R, SUPER_G, SUPER_B],
};

const TAU = Math.PI * 2;
const RING_SEGMENTS = 192;
/** aEnd value that marks a vertex as belonging to the horizon ring rather than to a marker. */
export const RING_FLAG = 2;
const HASH_A = 0.6180339887;
const HASH_B = 7.13;

/** Decorrelates a spoke's phase from its angle, so no spiral emerges from a linear ramp. */
function spokePhaseJitter(spoke: number): number {
  return (spoke * HASH_A + Math.sin(spoke * HASH_B) * HASH_A) % 1;
}
const FLOATS_PER_VERTEX = 4;
/** Margin so the outermost arrows are not clipped by the canvas edge. */
const FRAME_MARGIN = 1.12;
/** The field is drawn about the centre, so the half-extent is what fits. */
const TWO_SIDES = 2;

/** Marker layout: one segment per marker, two vertices, as (dirX, dirY, phase, end). */
export function buildMarkers(params: RiverParams): Float32Array {
  const { spokes, markersPerSpoke } = params;
  if (spokes < 3 || markersPerSpoke < 1) {
    throw new RangeError('The field needs at least three spokes and one marker each.');
  }
  const data: number[] = [];
  for (let spoke = 0; spoke < spokes; spoke++) {
    const angle = (spoke / spokes) * TAU;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    for (let marker = 0; marker < markersPerSpoke; marker++) {
      // Hashed rather than a linear ramp in the spoke index: a linear offset makes the phases
      // advance steadily with angle, and the eye reads that as a rotating spiral. The flow is
      // purely radial and must not look otherwise.
      const phase = (marker / markersPerSpoke + spokePhaseJitter(spoke)) % 1;
      data.push(dx, dy, phase, 0);
      data.push(dx, dy, phase, 1);
    }
  }
  // The horizon ring: explicit geometry at exactly r = r_s, closed.
  for (let segment = 0; segment < RING_SEGMENTS; segment++) {
    const a = (segment / RING_SEGMENTS) * TAU;
    const b = ((segment + 1) / RING_SEGMENTS) * TAU;
    data.push(Math.cos(a), Math.sin(a), 0, RING_FLAG);
    data.push(Math.cos(b), Math.sin(b), 0, RING_FLAG);
  }
  return new Float32Array(data);
}

export class RiverRenderer {
  #gl: WebGL2RenderingContext;
  #program: WebGLProgram;
  #vao: WebGLVertexArrayObject;
  #buffer: WebGLBuffer;
  #vertexCount = 0;
  #params: RiverParams;
  #disposed = false;

  constructor(canvas: HTMLCanvasElement, params: Partial<RiverParams> = {}) {
    this.#params = { ...DEFAULT_RIVER_PARAMS, ...params };
    const gl = createContext(canvas, { alpha: true });
    this.#gl = gl;
    this.#program = createProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER);
    const vao = gl.createVertexArray();
    const buffer = gl.createBuffer();
    if (!vao || !buffer) throw new Error('Could not allocate river buffers.');
    this.#vao = vao;
    this.#buffer = buffer;
    this.#upload();
  }

  setParams(next: Partial<RiverParams>): void {
    const merged = { ...this.#params, ...next };
    const rebuild = merged.spokes !== this.#params.spokes
      || merged.markersPerSpoke !== this.#params.markersPerSpoke;
    this.#params = merged;
    if (rebuild) this.#upload();
  }

  /** Seconds of flow time for a marker to fall the whole seeded field. */
  get fallTime(): number {
    return infallTime(this.#params.outerRadius, this.#params.innerCutoff);
  }

  #upload(): void {
    const gl = this.#gl;
    const data = buildMarkers(this.#params);
    this.#vertexCount = data.length / FLOATS_PER_VERTEX;
    gl.bindVertexArray(this.#vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.#buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    const stride = FLOATS_PER_VERTEX * Float32Array.BYTES_PER_ELEMENT;
    const bytes = Float32Array.BYTES_PER_ELEMENT;
    const direction = gl.getAttribLocation(this.#program, 'aDirection');
    const phase = gl.getAttribLocation(this.#program, 'aPhase');
    const end = gl.getAttribLocation(this.#program, 'aEnd');
    gl.enableVertexAttribArray(direction);
    gl.vertexAttribPointer(direction, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(phase);
    gl.vertexAttribPointer(phase, 1, gl.FLOAT, false, stride, 2 * bytes);
    gl.enableVertexAttribArray(end);
    gl.vertexAttribPointer(end, 1, gl.FLOAT, false, stride, 3 * bytes);
    gl.bindVertexArray(null);
  }

  /** `flowTime` is in r_s/c. The caller owns the clock, so pausing simply stops advancing it. */
  render(flowTime: number): void {
    if (this.#disposed) throw new Error('This renderer has been disposed.');
    const gl = this.#gl;
    const { width, height } = gl.canvas;
    const p = this.#params;
    const pixelsPerRs = (Math.min(width, height) / TWO_SIDES) / (p.outerRadius * FRAME_MARGIN);

    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(this.#program);
    this.#setFloat('uTime', flowTime);
    this.#setFloat('uOuterRadius', p.outerRadius);
    this.#setFloat('uInnerCutoff', p.innerCutoff);
    this.#setFloat('uFallTime', this.fallTime);
    this.#setFloat('uArrowLength', p.arrowLength);
    this.#setFloat('uPixelsPerRs', pixelsPerRs);
    gl.uniform2f(gl.getUniformLocation(this.#program, 'uViewport'), width, height);
    this.#setColour('uSlowColour', p.slowColour);
    this.#setColour('uFastColour', p.fastColour);
    this.#setColour('uHorizonColour', p.horizonColour);
    this.#setColour('uSuperluminalColour', p.superluminalColour);
    gl.bindVertexArray(this.#vao);
    gl.drawArrays(gl.LINES, 0, this.#vertexCount);
    gl.bindVertexArray(null);
  }

  #setFloat(name: string, value: number): void {
    this.#gl.uniform1f(this.#gl.getUniformLocation(this.#program, name), value);
  }

  #setColour(name: string, value: readonly [number, number, number]): void {
    this.#gl.uniform3f(
      this.#gl.getUniformLocation(this.#program, name), value[0], value[1], value[2],
    );
  }

  dispose(): void {
    if (this.#disposed) return;
    const gl = this.#gl;
    gl.deleteBuffer(this.#buffer);
    gl.deleteVertexArray(this.#vao);
    gl.deleteProgram(this.#program);
    this.#disposed = true;
  }
}

/** CPU mirror of the shader's marker position, so the layout can be tested without a GPU. */
export function markerRadius(
  phase: number, flowTime: number, outerRadius: number, innerCutoff: number,
): number {
  const fall = infallTime(outerRadius, innerCutoff);
  const elapsed = (flowTime + phase * fall) % fall;
  return Math.max(advect(outerRadius, elapsed), innerCutoff);
}

/** Speed a marker shows at a given phase and time. */
export function markerSpeed(
  phase: number, flowTime: number, outerRadius: number, innerCutoff: number,
): number {
  return riverSpeedOverC(markerRadius(phase, flowTime, outerRadius, innerCutoff));
}
