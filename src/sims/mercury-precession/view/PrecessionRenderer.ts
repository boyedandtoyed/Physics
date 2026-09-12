/** WebGL2 renderer for the precessing orbit, PHYSICS_SPEC §2.5 and §8.1.
 *
 * One view of the equatorial plane, with the semi-major axis as the unit of length. The scale is
 * aspect-corrected from the canvas so the orbit is drawn round rather than stretched — an
 * apparent eccentricity that came from the viewport would be indistinguishable from the real one.
 *
 * Geometry is uploaded per frame: the orbit is being integrated, and the perihelion arc grows.
 */
import { createContext, createProgram } from '../../../core/gl/context';

const VERTEX_SHADER = `#version 300 es
precision highp float;
in vec2 aPosition;
/** 0 = oldest trail sample, 1 = newest or a static line. */
in float aAge;
uniform vec4 uBounds;   // minX, minY, maxX, maxY in data space
uniform float uPointSize;
out float vAge;
void main() {
  vec2 unit = (aPosition - uBounds.xy) / max(uBounds.zw - uBounds.xy, vec2(1e-6));
  vAge = aAge;
  gl_PointSize = uPointSize;
  gl_Position = vec4(unit * 2.0 - 1.0, 0.0, 1.0);
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
  // The trail fades with age. That is a display effect on alpha and never touches a position.
  // The floor is high because the picture IS the accumulated rosette: at 0.04 the older orbits
  // were invisible and the trail read as a single arc with no precession in it.
  fragColor = vec4(uColour, uAlpha * coverage * mix(0.3, 1.0, vAge));
}
`;

export type Rgb = readonly [number, number, number];

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export type DrawMode = 'strip' | 'lines' | 'loop' | 'fan' | 'points';

const FLOATS_PER_VERTEX = 3;
const MIN_VERTICES = 1;

/** Bounds centred on the origin covering `extent` in the shorter axis, widened for the aspect. */
export function framedBounds(extent: number, width: number, height: number): Bounds {
  if (!(extent > 0) || !(width > 0) || !(height > 0)) {
    throw new RangeError('Extent and canvas dimensions must be positive.');
  }
  const aspect = width / height;
  const halfWidth = aspect >= 1 ? extent * aspect : extent;
  const halfHeight = aspect >= 1 ? extent : extent / aspect;
  return { minX: -halfWidth, minY: -halfHeight, maxX: halfWidth, maxY: halfHeight };
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

export class PrecessionRenderer {
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
    if (!vao || !buffer) throw new Error('Could not allocate precession buffers.');
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

  beginFrame(bounds: Bounds): void {
    const gl = this.#gl;
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(this.#program);
    gl.bindVertexArray(this.#vao);
    gl.uniform4f(
      gl.getUniformLocation(this.#program, 'uBounds'),
      bounds.minX, bounds.minY, bounds.maxX, bounds.maxY,
    );
  }

  /** Draw (x, y, age) triples in data space. `pointSize` is in device pixels. */
  draw(
    data: Float32Array, mode: DrawMode, colour: Rgb, alpha = 1, pointSize = 1,
  ): void {
    if (this.#disposed) throw new Error('This renderer has been disposed.');
    const count = data.length / FLOATS_PER_VERTEX;
    if (count < MIN_VERTICES) return;
    const gl = this.#gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.#buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
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
