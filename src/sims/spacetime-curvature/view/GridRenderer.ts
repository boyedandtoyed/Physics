/** WebGL2 line renderer for the Flamm paraboloid, PHYSICS_SPEC §2.1a.
 *
 * The surface is drawn as a wireframe of circles of constant r and radial spokes of constant phi,
 * with every vertex placed at the exact embedding height z = 2 sqrt(r_s(r - r_s)). Nothing is
 * sculpted or eyeballed: change r_s and the mesh is rebuilt from the same closed form the core
 * module is tested against.
 *
 * Depth cueing is a fade with eye-space distance, which is a display choice and is applied after
 * the geometry, never to it.
 */
import { createContext, createProgram } from '../../../core/gl/context';
import { lookAt, multiply, perspective, type Mat4 } from '../../../core/gl/matrix';
import { embeddingHeight } from '../../../core/embedding';

const VERTEX_SHADER = `#version 300 es
precision highp float;
in vec3 aPosition;
/** r/r_s at this vertex, so the fragment stage can mark the horizon ring. */
in float aRadius;
uniform mat4 uViewProjection;
uniform mat4 uView;
out float vDepth;
out float vRadius;
void main() {
  vec4 eye = uView * vec4(aPosition, 1.0);
  vDepth = -eye.z;
  vRadius = aRadius;
  gl_Position = uViewProjection * vec4(aPosition, 1.0);
}
`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
in float vDepth;
in float vRadius;
uniform vec3 uLineColour;
uniform vec3 uHorizonColour;
uniform float uFadeNear;
uniform float uFadeFar;
out vec4 fragColor;
void main() {
  // Depth cue only: lines further from the camera fade. A display choice, applied to colour and
  // never to position.
  float fade = 1.0 - clamp((vDepth - uFadeNear) / max(uFadeFar - uFadeNear, 1e-3), 0.0, 1.0);
  float alpha = mix(0.18, 1.0, fade);
  // The throat ring is the horizon and is marked, because it is the one radius with meaning.
  float horizon = 1.0 - smoothstep(0.0, 0.06, abs(vRadius - 1.0));
  vec3 colour = mix(uLineColour, uHorizonColour, horizon);
  fragColor = vec4(colour, alpha * mix(0.75, 1.0, horizon));
}
`;

export interface GridParams {
  /** Outer edge of the drawn surface, in r_s. The paraboloid is unbounded; this truncates it. */
  outerRadius: number;
  /** Rings of constant r. */
  rings: number;
  /** Radial spokes of constant phi. */
  spokes: number;
  /** Camera. */
  distance: number;
  inclination: number;
  azimuth: number;
  /** Vertical exaggeration of the embedding height. 1 is the true surface. */
  depthScale: number;
  lineColour: readonly [number, number, number];
  horizonColour: readonly [number, number, number];
}

const SEGMENTS_PER_RING = 128;
const TAU = Math.PI * 2;
/** Wireframe colours as linear RGB — a muted teal for the mesh, warm for the horizon ring, so
 * the one radius with physical meaning is the one that stands out. */
const LINE_R = 0.42;
const LINE_G = 0.62;
const LINE_B = 0.60;
const HORIZON_R = 0.85;
const HORIZON_G = 0.45;
const HORIZON_B = 0.15;
const LINE_RGB: readonly [number, number, number] = [LINE_R, LINE_G, LINE_B];
const HORIZON_RGB: readonly [number, number, number] = [HORIZON_R, HORIZON_G, HORIZON_B];
/** Default framing: far enough out to see the throat and the flattening together. */
const DEFAULT_OUTER_RADIUS = 12;
const DEFAULT_RINGS = 26;
const DEFAULT_SPOKES = 48;
const DEFAULT_DISTANCE = 26;
const DEFAULT_INCLINATION = 0.42;
const DEFAULT_AZIMUTH = 0.6;
/** Depth-cue band, as fractions of the camera distance. */
const FADE_NEAR_FRACTION = 0.35;
const FADE_FAR_FRACTION = 1.8;
const FIELD_OF_VIEW = Math.PI / 4;
const NEAR = 0.5;
const FAR = 400;
const FLOATS_PER_VERTEX = 4;

export const DEFAULT_GRID_PARAMS: GridParams = {
  outerRadius: DEFAULT_OUTER_RADIUS,
  rings: DEFAULT_RINGS,
  spokes: DEFAULT_SPOKES,
  distance: DEFAULT_DISTANCE,
  inclination: DEFAULT_INCLINATION,
  azimuth: DEFAULT_AZIMUTH,
  depthScale: 1,
  lineColour: LINE_RGB,
  horizonColour: HORIZON_RGB,
};



/**
 * Vertex data for the wireframe.
 *
 * Exported for tests: the mesh must sit on the embedding, and that is checkable without a GPU.
 */
export function buildGridVertices(params: GridParams): Float32Array {
  const { outerRadius, rings, spokes, depthScale } = params;
  if (!(outerRadius > 1) || rings < 2 || spokes < 3) {
    throw new RangeError('The grid needs an outer radius beyond the throat and a real mesh.');
  }
  const data: number[] = [];
  const push = (radius: number, phi: number) => {
    // Radii are spaced in sqrt(r - r_s) so the rings are evenly spaced ON THE SURFACE rather than
    // bunching up at the throat, where the surface is nearly vertical.
    const height = embeddingHeight(radius) * depthScale;
    // +height, not -height: z(r) grows with r, so the throat is the low point and the surface
    // rises and flattens outwards. Negating it stands the funnel on its head.
    data.push(radius * Math.cos(phi), height, radius * Math.sin(phi), radius);
  };
  const radiusAt = (index: number, count: number) => {
    const t = index / count;
    return 1 + (outerRadius - 1) * t * t;
  };

  // Rings of constant r.
  for (let ring = 0; ring <= rings; ring++) {
    const radius = radiusAt(ring, rings);
    for (let segment = 0; segment < SEGMENTS_PER_RING; segment++) {
      const a = (segment / SEGMENTS_PER_RING) * TAU;
      const b = ((segment + 1) / SEGMENTS_PER_RING) * TAU;
      push(radius, a);
      push(radius, b);
    }
  }
  // Radial spokes of constant phi.
  for (let spoke = 0; spoke < spokes; spoke++) {
    const phi = (spoke / spokes) * TAU;
    for (let ring = 0; ring < rings; ring++) {
      push(radiusAt(ring, rings), phi);
      push(radiusAt(ring + 1, rings), phi);
    }
  }
  return new Float32Array(data);
}

export class GridRenderer {
  #gl: WebGL2RenderingContext;
  #program: WebGLProgram;
  #vao: WebGLVertexArrayObject;
  #buffer: WebGLBuffer;
  #vertexCount = 0;
  #params: GridParams;
  #disposed = false;

  constructor(canvas: HTMLCanvasElement, params: Partial<GridParams> = {}) {
    this.#params = { ...DEFAULT_GRID_PARAMS, ...params };
    // Transparent: the CSS background is a theme token, so the view follows light and dark
    // without the renderer knowing anything about themes.
    const gl = createContext(canvas, { alpha: true });
    this.#gl = gl;
    this.#program = createProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER);
    const vao = gl.createVertexArray();
    const buffer = gl.createBuffer();
    if (!vao || !buffer) throw new Error('Could not allocate grid buffers.');
    this.#vao = vao;
    this.#buffer = buffer;
    this.#upload();
  }

  setParams(next: Partial<GridParams>): void {
    const merged = { ...this.#params, ...next };
    const rebuild = merged.outerRadius !== this.#params.outerRadius
      || merged.rings !== this.#params.rings
      || merged.spokes !== this.#params.spokes
      || merged.depthScale !== this.#params.depthScale;
    this.#params = merged;
    if (rebuild) this.#upload();
  }

  #upload(): void {
    const gl = this.#gl;
    const vertices = buildGridVertices(this.#params);
    this.#vertexCount = vertices.length / FLOATS_PER_VERTEX;
    gl.bindVertexArray(this.#vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.#buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
    const stride = FLOATS_PER_VERTEX * Float32Array.BYTES_PER_ELEMENT;
    const position = gl.getAttribLocation(this.#program, 'aPosition');
    const radius = gl.getAttribLocation(this.#program, 'aRadius');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(radius);
    gl.vertexAttribPointer(radius, 1, gl.FLOAT, false, stride, 3 * Float32Array.BYTES_PER_ELEMENT);
    gl.bindVertexArray(null);
  }

  render(): void {
    if (this.#disposed) throw new Error('This renderer has been disposed.');
    const gl = this.#gl;
    const { width, height } = gl.canvas;
    const { distance, inclination, azimuth } = this.#params;

    const eye: [number, number, number] = [
      distance * Math.cos(inclination) * Math.cos(azimuth),
      distance * Math.sin(inclination),
      distance * Math.cos(inclination) * Math.sin(azimuth),
    ];
    const view = lookAt(eye, [0, 0, 0], [0, 1, 0]);
    const viewProjection = multiply(
      perspective(FIELD_OF_VIEW, Math.max(width, 1) / Math.max(height, 1), NEAR, FAR), view,
    );

    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(this.#program);
    this.#setMatrix('uViewProjection', viewProjection);
    this.#setMatrix('uView', view);
    this.#setVec3('uLineColour', this.#params.lineColour);
    this.#setVec3('uHorizonColour', this.#params.horizonColour);
    gl.uniform1f(gl.getUniformLocation(this.#program, 'uFadeNear'), distance * FADE_NEAR_FRACTION);
    gl.uniform1f(gl.getUniformLocation(this.#program, 'uFadeFar'), distance * FADE_FAR_FRACTION);
    gl.bindVertexArray(this.#vao);
    gl.drawArrays(gl.LINES, 0, this.#vertexCount);
    gl.bindVertexArray(null);
  }

  #setMatrix(name: string, value: Mat4): void {
    this.#gl.uniformMatrix4fv(this.#gl.getUniformLocation(this.#program, name), false, value);
  }

  #setVec3(name: string, value: readonly [number, number, number]): void {
    this.#gl.uniform3f(this.#gl.getUniformLocation(this.#program, name), value[0], value[1], value[2]);
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
