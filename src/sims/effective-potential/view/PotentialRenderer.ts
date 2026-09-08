/** WebGL2 line renderer for the effective-potential explorer, PHYSICS_SPEC §2.5.
 *
 * Two viewports in one canvas: the V_eff(r) curve on the left with its critical radii and the
 * user's energy line, and the orbit in the equatorial plane on the right. Both are line
 * geometry, uploaded per frame — the curve because the sliders move it, the orbit because it is
 * being integrated.
 *
 * The orbit trail fades with age, which is a display choice applied to alpha and never to the
 * integrated positions.
 */
import { createContext, createProgram } from '../../../core/gl/context';

const VERTEX_SHADER = `#version 300 es
precision highp float;
in vec2 aPosition;
/** 0 = oldest trail sample, 1 = newest or a static line. */
in float aAge;
uniform vec4 uViewport;   // x, y, width, height in clip space
uniform vec4 uBounds;     // minX, minY, maxX, maxY in data space
out float vAge;
void main() {
  vec2 unit = (aPosition - uBounds.xy) / max(uBounds.zw - uBounds.xy, vec2(1e-6));
  vec2 clip = uViewport.xy + unit * uViewport.zw;
  vAge = aAge;
  gl_Position = vec4(clip * 2.0 - 1.0, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
in float vAge;
uniform vec3 uColour;
uniform float uAlpha;
out vec4 fragColor;
void main() {
  // Older trail samples fade. A static line passes age 1 and is drawn flat.
  fragColor = vec4(uColour, uAlpha * mix(0.05, 1.0, vAge));
}
`;

export type Rgb = readonly [number, number, number];

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** A clip-space rectangle in [0,1], measured from the bottom-left of the canvas. */
export interface Viewport {
  x: number;
  y: number;
  width: number;
  height: number;
}

const FLOATS_PER_VERTEX = 3;

export class PotentialRenderer {
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
    if (!vao || !buffer) throw new Error('Could not allocate potential buffers.');
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

  /** Draw a polyline. `data` is (x, y, age) triples in data space. */
  drawLines(
    data: Float32Array, mode: 'strip' | 'lines',
    viewport: Viewport, bounds: Bounds, colour: Rgb, alpha = 1,
  ): void {
    if (this.#disposed) throw new Error('This renderer has been disposed.');
    if (data.length < FLOATS_PER_VERTEX * 2) return;
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
    gl.drawArrays(
      mode === 'strip' ? gl.LINE_STRIP : gl.LINES, 0, data.length / FLOATS_PER_VERTEX,
    );
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
