/** Minimal WebGL2 helpers. Framework-free, no Three.js: a fullscreen-triangle raymarcher is one
 * program and one draw call, and a scene graph would add ~600 KB for nothing (BUILD_PLAN §4).
 *
 * Every failure path here reports the driver's own log. A silently blank canvas is the single
 * most expensive failure mode in shader work.
 */

export class GlError extends Error {
  constructor(message: string, readonly log?: string) {
    super(log ? `${message}\n${log}` : message);
    this.name = 'GlError';
  }
}

export interface ContextOptions {
  /** Needed to read pixels back after compositing; the acceptance harness depends on it. */
  preserveDrawingBuffer?: boolean;
}

export function createContext(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  options: ContextOptions = {},
): WebGL2RenderingContext {
  const gl = canvas.getContext('webgl2', {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: options.preserveDrawingBuffer ?? false,
  });
  if (!gl) throw new GlError('WebGL2 is unavailable in this browser.');
  return gl;
}

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new GlError('Could not allocate a shader.');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? '';
    gl.deleteShader(shader);
    const stage = type === gl.VERTEX_SHADER ? 'vertex' : 'fragment';
    throw new GlError(`The ${stage} shader failed to compile.`, log);
  }
  return shader;
}

export function createProgram(
  gl: WebGL2RenderingContext,
  vertexSource: string,
  fragmentSource: string,
): WebGLProgram {
  const vertex = compile(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  if (!program) throw new GlError('Could not allocate a program.');
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  // The shaders are owned by the program once attached; detaching lets the driver free them.
  gl.detachShader(program, vertex);
  gl.detachShader(program, fragment);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) ?? '';
    gl.deleteProgram(program);
    throw new GlError('The program failed to link.', log);
  }
  return program;
}

/** Uniform locations, resolved once. A null location is a silent no-op in WebGL, which hides
 * typos, so unknown names are reported rather than ignored. */
export function uniformLocations<K extends string>(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  names: readonly K[],
): Record<K, WebGLUniformLocation> {
  const result = {} as Record<K, WebGLUniformLocation>;
  const missing: string[] = [];
  for (const name of names) {
    const location = gl.getUniformLocation(program, name);
    if (location === null) missing.push(name);
    else result[name] = location;
  }
  if (missing.length) {
    throw new GlError(
      `Uniforms absent from the linked program (misspelled, or optimised out because unused): ${missing.join(', ')}`,
    );
  }
  return result;
}

/** A single oversized triangle covering the viewport. Cheaper than a quad and free of the
 * diagonal seam two triangles produce under interpolation. The vertex positions are generated
 * from gl_VertexID, so no buffer is needed at all. */
export const FULLSCREEN_TRIANGLE_VERTEX_SHADER = `#version 300 es
void main() {
  vec2 vertex = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(vertex * 2.0 - 1.0, 0.0, 1.0);
}
`;

export const FULLSCREEN_TRIANGLE_VERTEX_COUNT = 3;
