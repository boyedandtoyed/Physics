/** WebGL2 renderer for the ISCO explorer, PHYSICS_SPEC §2.5.
 *
 * Two viewports in one canvas: V_eff(r) with its critical radii and the particle's energy line
 * on the left, and the orbit in the equatorial plane on the right. Both are line geometry
 * uploaded per frame, because both are moving — the marker at the current radius tracks the
 * particle across the potential while the particle tracks it around the orbit.
 */
import { createContext, createProgram } from '../../../core/gl/context';

const VERTEX_SHADER = `#version 300 es
precision highp float;
in vec2 aPosition;
/** 0 = oldest trail sample, 1 = newest or a static line. */
in float aAge;
uniform vec4 uViewport;   // x, y, width, height as fractions of the canvas, from bottom-left
uniform vec4 uBounds;     // minX, minY, maxX, maxY in data space
uniform float uPointSize;
out float vAge;
void main() {
  vec2 unit = (aPosition - uBounds.xy) / max(uBounds.zw - uBounds.xy, vec2(1e-6));
  vec2 frame = uViewport.xy + unit * uViewport.zw;
  vAge = aAge;
  gl_PointSize = uPointSize;
  gl_Position = vec4(frame * 2.0 - 1.0, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
in float vAge;
uniform vec3 uColour;
uniform float uAlpha;
/** Non-zero when drawing points, which are rounded off from the square GL primitive. */
uniform float uRound;
out vec4 fragColor;
void main() {
  float coverage = 1.0;
  if (uRound > 0.5) {
    float d = length(gl_PointCoord - vec2(0.5));
    coverage = 1.0 - smoothstep(0.42, 0.5, d);
    if (coverage <= 0.0) discard;
  }
  // The trail fades with age: a display effect on alpha that never touches a position. The
  // floor is high because the accumulated path is the picture.
  fragColor = vec4(uColour, uAlpha * coverage * mix(0.28, 1.0, vAge));
}
`;

export type Rgb = readonly [number, number, number];
export type DrawMode = 'strip' | 'lines' | 'loop' | 'fan' | 'points';

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** A rectangle in [0,1] of the canvas, measured from the bottom-left. */
export interface Viewport {
  x: number;
  y: number;
  width: number;
  height: number;
}

const FLOATS_PER_VERTEX = 3;

/**
 * Square data bounds for the orbit panel: `extent` either side of the origin, corrected for the
 * viewport's own aspect so the orbit is drawn round.
 *
 * The viewport is a fraction of the canvas, so the aspect that matters is the canvas aspect
 * times the viewport's width-to-height ratio — not the canvas aspect alone. Getting this wrong
 * stretches a circular orbit into an ellipse, which in this sim is indistinguishable from the
 * physics.
 */
export function squareBounds(
  extent: number, canvasWidth: number, canvasHeight: number, viewport: Viewport,
): Bounds {
  if (!(extent > 0) || !(canvasWidth > 0) || !(canvasHeight > 0)) {
    throw new RangeError('Extent and canvas dimensions must be positive.');
  }
  if (!(viewport.width > 0) || !(viewport.height > 0)) {
    throw new RangeError('The viewport must have a positive size.');
  }
  const aspect = (canvasWidth * viewport.width) / (canvasHeight * viewport.height);
  const halfWidth = aspect >= 1 ? extent * aspect : extent;
  const halfHeight = aspect >= 1 ? extent : extent / aspect;
  return { minX: -halfWidth, minY: -halfHeight, maxX: halfWidth, maxY: halfHeight };
}

/** Gutter left between the squeezed content and the floating panel, as a fraction of the canvas. */
const PANEL_GUTTER = 0.03;
/** However narrow the window, this much of the canvas stays available for the sim. */
const MIN_USABLE = 0.42;

/**
 * Squeezes a viewport into the width the expanded view's floating control panel leaves.
 *
 * In the expanded view the panel is positioned over the top right of the canvas. The orbit lives
 * in the right-hand viewport and was drawn underneath it, invisible. `panelWidth` is passed in
 * rather than measured here so this stays a pure function of two lengths; the page computes it
 * from the same `min(21rem, 42vw)` rule the stylesheet uses, and passes 0 when not expanded.
 */
export function squeezeForPanel(
  view: Viewport, canvasWidth: number, panelWidth: number,
): Viewport {
  if (!(panelWidth > 0) || !(canvasWidth > 0)) return view;
  const usable = Math.max(1 - panelWidth / canvasWidth - PANEL_GUTTER, MIN_USABLE);
  return { ...view, x: view.x * usable, width: view.width * usable };
}

/** A filled disc as a triangle fan, centred on the origin. */
export function discVertices(radius: number, segments: number): Float32Array {
  if (!(radius > 0) || segments < 3) throw new RangeError('A disc needs a radius and 3 segments.');
  const data = new Float32Array((segments + 2) * FLOATS_PER_VERTEX);
  data[2] = 1;
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    const base = (i + 1) * FLOATS_PER_VERTEX;
    data[base] = radius * Math.cos(angle);
    data[base + 1] = radius * Math.sin(angle);
    data[base + 2] = 1;
  }
  return data;
}

/** A closed circle as a line loop. */
export function circleVertices(radius: number, segments: number): Float32Array {
  if (!(radius > 0) || segments < 3) throw new RangeError('A circle needs a radius and 3 segments.');
  const data = new Float32Array(segments * FLOATS_PER_VERTEX);
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    data[i * FLOATS_PER_VERTEX] = radius * Math.cos(angle);
    data[i * FLOATS_PER_VERTEX + 1] = radius * Math.sin(angle);
    data[i * FLOATS_PER_VERTEX + 2] = 1;
  }
  return data;
}

export class IscoRenderer {
  #gl: WebGL2RenderingContext;
  #program: WebGLProgram;
  #vao: WebGLVertexArrayObject;
  #buffer: WebGLBuffer;
  #disposed = false;

  constructor(canvas: HTMLCanvasElement) {
    const gl = createContext(canvas, { alpha: true });
    this.#gl = gl;
    this.#program = createProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER);
    const vao = gl.createVertexArray();
    const buffer = gl.createBuffer();
    if (!vao || !buffer) throw new Error('Could not allocate ISCO buffers.');
    this.#vao = vao;
    this.#buffer = buffer;
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    const stride = FLOATS_PER_VERTEX * Float32Array.BYTES_PER_ELEMENT;
    const position = gl.getAttribLocation(this.#program, 'aPosition');
    const age = gl.getAttribLocation(this.#program, 'aAge');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(age);
    gl.vertexAttribPointer(age, 1, gl.FLOAT, false, stride, 2 * Float32Array.BYTES_PER_ELEMENT);
    gl.bindVertexArray(null);
  }

  beginFrame(): void {
    const gl = this.#gl;
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(this.#program);
    gl.bindVertexArray(this.#vao);
  }

  /** Draw (x, y, age) triples in data space, into one viewport. */
  draw(
    data: Float32Array, mode: DrawMode, viewport: Viewport, bounds: Bounds,
    colour: Rgb, alpha = 1, pointSize = 1,
  ): void {
    if (this.#disposed) throw new Error('This renderer has been disposed.');
    const count = data.length / FLOATS_PER_VERTEX;
    if (count < 1) return;
    const gl = this.#gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.#buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    gl.uniform4f(
      gl.getUniformLocation(this.#program, 'uViewport'),
      viewport.x, viewport.y, viewport.width, viewport.height,
    );
    gl.uniform4f(
      gl.getUniformLocation(this.#program, 'uBounds'),
      bounds.minX, bounds.minY, bounds.maxX, bounds.maxY,
    );
    gl.uniform3f(gl.getUniformLocation(this.#program, 'uColour'), colour[0], colour[1], colour[2]);
    gl.uniform1f(gl.getUniformLocation(this.#program, 'uAlpha'), alpha);
    gl.uniform1f(gl.getUniformLocation(this.#program, 'uPointSize'), pointSize);
    gl.uniform1f(gl.getUniformLocation(this.#program, 'uRound'), mode === 'points' ? 1 : 0);
    gl.drawArrays(PRIMITIVES[mode](gl), 0, count);
  }

  endFrame(): void {
    this.#gl.bindVertexArray(null);
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

const PRIMITIVES: Record<DrawMode, (gl: WebGL2RenderingContext) => number> = {
  strip: gl => gl.LINE_STRIP,
  lines: gl => gl.LINES,
  loop: gl => gl.LINE_LOOP,
  fan: gl => gl.TRIANGLE_FAN,
  points: gl => gl.POINTS,
};
