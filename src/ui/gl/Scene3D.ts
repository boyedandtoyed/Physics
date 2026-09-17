/** The 3D scene the two sandboxes draw into: a deforming fabric, coloured lines, glowing bodies,
 * and an optional screen-space distortion around a black hole.
 *
 * One renderer rather than four, because the four passes have to agree about the camera, the
 * depth buffer and the order they run in, and three of those are exactly the things that go
 * wrong when each sim owns its own.
 *
 * **What is physics and what is decoration.** The fabric's height is a closed form from
 * `core/embedding.ts` (see `fabric.ts`, and PHYSICS_SPEC §2.9). The body positions and the trail
 * vertices are the integrator's output. Everything else here — the glow falloff, the depth
 * fade, the screen-space distortion — is display, applied after the geometry and never to it.
 * The distortion in particular is **not** lensing: it is a radial pull on finished pixels, it
 * is off by default, and the sims that ray-trace the real thing do not use it.
 */
import { createContext, createProgram, uniformLocations } from '../../core/gl/context';
import { matricesFor, type Lens, type Pose } from './camera3d';
import type { Mat4 } from '../../core/gl/matrix';
import { FABRIC_GLSL, MAX_FABRIC_MASSES, packMasses, type FabricParams } from './fabric';

export type Rgb = readonly [number, number, number];

const FABRIC_VERTEX = `#version 300 es
precision highp float;
in vec2 aPlane;
uniform mat4 uViewProjection;
uniform mat4 uView;
out float vDepth;
out float vHeight;
${FABRIC_GLSL}
void main() {
  float height = fabricHeight(aPlane);
  vec4 world = vec4(aPlane.x, height, aPlane.y, 1.0);
  vDepth = -(uView * world).z;
  vHeight = height;
  gl_Position = uViewProjection * world;
}
`;

const FABRIC_FRAGMENT = `#version 300 es
precision highp float;
in float vDepth;
in float vHeight;
uniform vec3 uLineColour;
uniform vec3 uDeepColour;
uniform float uFadeNear;
uniform float uFadeFar;
uniform float uDeepAt;
uniform float uAlpha;
out vec4 fragColor;
void main() {
  float fade = 1.0 - clamp((vDepth - uFadeNear) / max(uFadeFar - uFadeNear, 1e-3), 0.0, 1.0);
  // Depth of the sheet tints the line, so a well reads as a well on a still frame and not only
  // in motion. A display choice: the height it is reading is the physical one.
  float deep = clamp(-vHeight / max(uDeepAt, 1e-3), 0.0, 1.0);
  fragColor = vec4(mix(uLineColour, uDeepColour, deep), uAlpha * mix(0.15, 1.0, fade));
}
`;

const LINE_VERTEX = `#version 300 es
precision highp float;
in vec3 aPosition;
in vec4 aColour;
uniform mat4 uViewProjection;
out vec4 vColour;
void main() {
  vColour = aColour;
  gl_Position = uViewProjection * vec4(aPosition, 1.0);
}
`;

const LINE_FRAGMENT = `#version 300 es
precision highp float;
in vec4 vColour;
out vec4 fragColor;
void main() { fragColor = vColour; }
`;

/** Camera-facing billboards, one instance per body. The quad's corners come from gl_VertexID, so
 * the only buffer is the instance data. */
const GLOW_VERTEX = `#version 300 es
precision highp float;
in vec3 aCentre;
in float aRadius;
in vec3 aColour;
in float aCore;
in float aRim;
uniform mat4 uViewProjection;
uniform vec3 uRight;
uniform vec3 uUp;
out vec2 vOffset;
out vec3 vColour;
out float vCore;
out float vRim;
void main() {
  vRim = aRim;
  vec2 corner = vec2((gl_VertexID == 1 || gl_VertexID == 2) ? 1.0 : -1.0,
                     (gl_VertexID >= 2) ? 1.0 : -1.0);
  vOffset = corner;
  vColour = aColour;
  vCore = aCore;
  vec3 world = aCentre + uRight * (corner.x * aRadius) + uUp * (corner.y * aRadius);
  gl_Position = uViewProjection * vec4(world, 1.0);
}
`;

const GLOW_FRAGMENT = `#version 300 es
precision highp float;
in vec2 vOffset;
in vec3 vColour;
in float vCore;
in float vRim;
uniform float uHaloStrength;
uniform vec3 uVoidColour;
out vec4 fragColor;
void main() {
  float r = length(vOffset);
  if (r > 1.0) discard;
  float halo = pow(max(1.0 - r, 0.0), 3.0) * uHaloStrength;
  if (vRim > 0.5) {
    // Rim mode: a dark disc with a bright ring at its edge. Drawn OVER the scene rather than
    // added to it, because a dark thing cannot be additive — added to a dark background it is
    // simply invisible. The ring marks the drawn radius and is a glyph, not a photon orbit:
    // this sandbox never sets c, so it has no photon sphere to put one at.
    float inner = 1.0 - smoothstep(vCore * 0.92, vCore * 1.02, r);
    float ring = smoothstep(vCore * 0.88, vCore * 1.02, r)
      * (1.0 - smoothstep(vCore * 1.05, vCore * 1.5, r));
    vec3 colour = mix(uVoidColour, vColour, clamp(ring * 2.2, 0.0, 1.0));
    fragColor = vec4(colour, clamp(inner + ring + halo * 0.5, 0.0, 1.0));
    return;
  }
  // A hard-edged core with a soft halo around it. The core's size is the body's drawn radius;
  // the halo is decoration and carries no size information at all.
  float core = 1.0 - smoothstep(vCore * 0.82, vCore, r);
  fragColor = vec4(vColour * (1.0 + core * 0.6), clamp(core + halo, 0.0, 1.0));
}
`;

const DISTORT_VERTEX = `#version 300 es
out vec2 vUv;
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

/** Screen-space radial pull. NOT lensing: see the file header and the sim's own label. */
const DISTORT_FRAGMENT = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
uniform vec3 uHoles[4];
uniform int uHoleCount;
uniform float uStrength;
uniform float uAspect;
out vec4 fragColor;
void main() {
  vec2 uv = vUv;
  for (int i = 0; i < 4; i++) {
    if (i >= uHoleCount) break;
    vec2 delta = uv - uHoles[i].xy;
    delta.x *= uAspect;
    float r = length(delta);
    float radius = max(uHoles[i].z, 1e-4);
    if (r < 1e-5) continue;
    // 1/r, softened inside the disc and faded out well before it reaches the frame edge.
    float shift = uStrength * radius * radius / max(r, radius * 0.6);
    float falloff = smoothstep(radius * 7.0, radius * 1.1, r);
    vec2 direction = delta / r;
    direction.x /= uAspect;
    uv -= direction * shift * falloff;
  }
  fragColor = texture(uScene, clamp(uv, 0.0, 1.0));
}
`;

export const MAX_DISTORT_HOLES = 4;
const MATRIX_FLOATS = 16;
const FABRIC_FLOATS = 2;
const LINE_FLOATS = 7;
const GLOW_FLOATS = 9;
const QUAD_VERTICES = 4;
const MODE_FLAMM = 1;
const MODE_POTENTIAL = 0;
const FADE_NEAR_FRACTION = 0.3;
const FADE_FAR_FRACTION = 2.2;

export interface FrameOptions {
  pose: Pose;
  lens: Lens;
  /** Drawing-buffer size in device pixels. */
  width: number;
  height: number;
  /** When set, the scene is rendered to a texture and pulled toward these holes on the way out.
   * Screen coordinates in [0,1], radius as a fraction of the width. */
  distortion?: { holes: readonly { u: number; v: number; radius: number }[]; strength: number };
}

export interface FabricStyle {
  lineColour: Rgb;
  deepColour: Rgb;
  /** Depth at which the line is fully `deepColour`. */
  deepAt: number;
  alpha: number;
}

export class Scene3D {
  #gl: WebGL2RenderingContext;
  #fabric: { program: WebGLProgram; vao: WebGLVertexArrayObject; buffer: WebGLBuffer;
    uniforms: Record<string, WebGLUniformLocation>; count: number };
  #lines: { program: WebGLProgram; vao: WebGLVertexArrayObject; buffer: WebGLBuffer;
    uniforms: Record<string, WebGLUniformLocation> };
  #glow: { program: WebGLProgram; vao: WebGLVertexArrayObject; buffer: WebGLBuffer;
    uniforms: Record<string, WebGLUniformLocation> };
  #distort: { program: WebGLProgram; uniforms: Record<string, WebGLUniformLocation>;
    vao: WebGLVertexArrayObject };
  #target: { framebuffer: WebGLFramebuffer; texture: WebGLTexture; depth: WebGLRenderbuffer;
    width: number; height: number } | null = null;
  #viewProjection: Mat4 = new Float32Array(MATRIX_FLOATS);
  #right: [number, number, number] = [1, 0, 0];
  #up: [number, number, number] = [0, 1, 0];
  #frame: FrameOptions | null = null;
  #disposed = false;

  constructor(canvas: HTMLCanvasElement) {
    const gl = createContext(canvas, { alpha: true, depth: true });
    this.#gl = gl;
    const fabricProgram = createProgram(gl, FABRIC_VERTEX, FABRIC_FRAGMENT);
    this.#fabric = {
      program: fabricProgram,
      vao: this.#vao(),
      buffer: this.#buffer(),
      uniforms: uniformLocations(gl, fabricProgram, [
        'uViewProjection', 'uView', 'uLineColour', 'uDeepColour', 'uFadeNear', 'uFadeFar',
        'uDeepAt', 'uAlpha', 'uMasses', 'uMassCount', 'uMode', 'uHeightScale', 'uFloor',
        'uOuterRadius',
      ]),
      count: 0,
    };
    const lineProgram = createProgram(gl, LINE_VERTEX, LINE_FRAGMENT);
    this.#lines = {
      program: lineProgram,
      vao: this.#vao(),
      buffer: this.#buffer(),
      uniforms: uniformLocations(gl, lineProgram, ['uViewProjection']),
    };
    const glowProgram = createProgram(gl, GLOW_VERTEX, GLOW_FRAGMENT);
    this.#glow = {
      program: glowProgram,
      vao: this.#vao(),
      buffer: this.#buffer(),
      uniforms: uniformLocations(gl, glowProgram, [
        'uViewProjection', 'uRight', 'uUp', 'uHaloStrength', 'uVoidColour',
      ]),
    };
    const distortProgram = createProgram(gl, DISTORT_VERTEX, DISTORT_FRAGMENT);
    this.#distort = {
      program: distortProgram,
      vao: this.#vao(),
      uniforms: uniformLocations(gl, distortProgram, [
        'uScene', 'uHoles', 'uHoleCount', 'uStrength', 'uAspect',
      ]),
    };
    this.#configureAttributes();
  }

  #vao(): WebGLVertexArrayObject {
    const vao = this.#gl.createVertexArray();
    if (!vao) throw new Error('Could not allocate a vertex array.');
    return vao;
  }

  #buffer(): WebGLBuffer {
    const buffer = this.#gl.createBuffer();
    if (!buffer) throw new Error('Could not allocate a buffer.');
    return buffer;
  }

  #configureAttributes(): void {
    const gl = this.#gl;
    const bytes = Float32Array.BYTES_PER_ELEMENT;

    gl.bindVertexArray(this.#fabric.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.#fabric.buffer);
    const plane = gl.getAttribLocation(this.#fabric.program, 'aPlane');
    gl.enableVertexAttribArray(plane);
    gl.vertexAttribPointer(plane, 2, gl.FLOAT, false, FABRIC_FLOATS * bytes, 0);

    gl.bindVertexArray(this.#lines.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.#lines.buffer);
    const position = gl.getAttribLocation(this.#lines.program, 'aPosition');
    const colour = gl.getAttribLocation(this.#lines.program, 'aColour');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 3, gl.FLOAT, false, LINE_FLOATS * bytes, 0);
    gl.enableVertexAttribArray(colour);
    gl.vertexAttribPointer(colour, 4, gl.FLOAT, false, LINE_FLOATS * bytes, 3 * bytes);

    gl.bindVertexArray(this.#glow.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.#glow.buffer);
    const centre = gl.getAttribLocation(this.#glow.program, 'aCentre');
    const radius = gl.getAttribLocation(this.#glow.program, 'aRadius');
    const glowColour = gl.getAttribLocation(this.#glow.program, 'aColour');
    const core = gl.getAttribLocation(this.#glow.program, 'aCore');
    const rim = gl.getAttribLocation(this.#glow.program, 'aRim');
    const stride = GLOW_FLOATS * bytes;
    for (const [location, size, offset] of [
      [centre, 3, 0], [radius, 1, 3], [glowColour, 3, 4], [core, 1, 7], [rim, 1, 8],
    ] as const) {
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, size, gl.FLOAT, false, stride, offset * bytes);
      gl.vertexAttribDivisor(location, 1);
    }
    gl.bindVertexArray(null);
  }

  /** Uploads the fabric mesh. Static: the shader moves it, so this runs on a resize, not a frame. */
  setFabricMesh(mesh: Float32Array): void {
    const gl = this.#gl;
    this.#fabric.count = mesh.length / FABRIC_FLOATS;
    gl.bindVertexArray(this.#fabric.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.#fabric.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, mesh, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
  }

  beginFrame(options: FrameOptions): void {
    const gl = this.#gl;
    this.#frame = options;
    const { view, viewProjection, eye } = matricesFor(options.pose, options.lens);
    this.#viewProjection = viewProjection;
    // The billboard basis is the camera's, read straight out of the view matrix's rows.
    this.#right = [view[0] as number, view[4] as number, view[8] as number];
    this.#up = [view[1] as number, view[5] as number, view[9] as number];
    this.#eye = eye;
    this.#view = view;

    if (options.distortion && options.distortion.holes.length > 0) {
      this.#ensureTarget(options.width, options.height);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.#target!.framebuffer);
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    gl.viewport(0, 0, options.width, options.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clearDepth(1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  #eye: [number, number, number] = [0, 0, 1];
  #view: Mat4 = new Float32Array(MATRIX_FLOATS);

  drawFabric(params: FabricParams, style: FabricStyle): void {
    const gl = this.#gl;
    const frame = this.#frame;
    if (!frame || this.#fabric.count === 0) return;
    const u = this.#fabric.uniforms;
    gl.useProgram(this.#fabric.program);
    gl.uniformMatrix4fv(u.uViewProjection!, false, this.#viewProjection);
    gl.uniformMatrix4fv(u.uView!, false, this.#view);
    gl.uniform3fv(u.uLineColour!, style.lineColour as unknown as Float32List);
    gl.uniform3fv(u.uDeepColour!, style.deepColour as unknown as Float32List);
    gl.uniform1f(u.uFadeNear!, frame.pose.distance * FADE_NEAR_FRACTION);
    gl.uniform1f(u.uFadeFar!, frame.pose.distance * FADE_FAR_FRACTION);
    gl.uniform1f(u.uDeepAt!, style.deepAt);
    gl.uniform1f(u.uAlpha!, style.alpha);
    gl.uniform4fv(u.uMasses!, packMasses(params.masses));
    gl.uniform1i(u.uMassCount!, Math.min(params.masses.length, MAX_FABRIC_MASSES));
    gl.uniform1i(u.uMode!, params.mode === 'flamm' ? MODE_FLAMM : MODE_POTENTIAL);
    gl.uniform1f(u.uHeightScale!, params.heightScale);
    gl.uniform1f(u.uFloor!, params.floor);
    gl.uniform1f(u.uOuterRadius!, params.outerRadius);
    gl.bindVertexArray(this.#fabric.vao);
    gl.drawArrays(gl.LINES, 0, this.#fabric.count);
    gl.bindVertexArray(null);
  }

  /** Coloured 3D lines: x, y, z, r, g, b, a per vertex. Trails, arrows and flow lines all. */
  drawLines(data: Float32Array, mode: 'lines' | 'strip' = 'lines'): void {
    const gl = this.#gl;
    if (data.length < LINE_FLOATS * 2) return;
    gl.useProgram(this.#lines.program);
    gl.uniformMatrix4fv(this.#lines.uniforms.uViewProjection!, false, this.#viewProjection);
    gl.bindVertexArray(this.#lines.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.#lines.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    gl.drawArrays(mode === 'strip' ? gl.LINE_STRIP : gl.LINES, 0, data.length / LINE_FLOATS);
    gl.bindVertexArray(null);
  }

  /** Glowing bodies: centre xyz, radius, rgb, core fraction, rim flag — one instance each.
 *
 * Call it twice when a scene has both kinds: the rim bodies want `additive: false` so their dark
 * core paints over what is behind it, and the rest want additive on a dark theme. */
  drawGlows(
    instances: Float32Array, haloStrength = 0.55, additive = true,
    voidColour: Rgb = [0.02, 0.02, 0.04],
  ): void {
    const gl = this.#gl;
    const count = Math.floor(instances.length / GLOW_FLOATS);
    if (count === 0) return;
    gl.useProgram(this.#glow.program);
    gl.uniformMatrix4fv(this.#glow.uniforms.uViewProjection!, false, this.#viewProjection);
    gl.uniform3f(this.#glow.uniforms.uRight!, this.#right[0], this.#right[1], this.#right[2]);
    gl.uniform3f(this.#glow.uniforms.uUp!, this.#up[0], this.#up[1], this.#up[2]);
    gl.uniform1f(this.#glow.uniforms.uHaloStrength!, haloStrength);
    gl.uniform3f(
      this.#glow.uniforms.uVoidColour!, voidColour[0], voidColour[1], voidColour[2],
    );
    // Halos overlap; writing depth would let the nearer one punch a hole in the further one.
    gl.depthMask(false);
    if (additive) gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.bindVertexArray(this.#glow.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.#glow.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, instances, gl.DYNAMIC_DRAW);
    gl.drawArraysInstanced(gl.TRIANGLE_FAN, 0, QUAD_VERTICES, count);
    gl.bindVertexArray(null);
    gl.depthMask(true);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  endFrame(): void {
    const gl = this.#gl;
    const frame = this.#frame;
    this.#frame = null;
    if (!frame?.distortion || frame.distortion.holes.length === 0 || !this.#target) {
      gl.flush();
      return;
    }
    const holes = frame.distortion.holes.slice(0, MAX_DISTORT_HOLES);
    const packed = new Float32Array(MAX_DISTORT_HOLES * 3);
    holes.forEach((hole, index) => {
      packed[index * 3] = hole.u;
      packed[index * 3 + 1] = hole.v;
      packed[index * 3 + 2] = hole.radius;
    });
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, frame.width, frame.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.disable(gl.DEPTH_TEST);
    gl.useProgram(this.#distort.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.#target.texture);
    gl.uniform1i(this.#distort.uniforms.uScene!, 0);
    gl.uniform3fv(this.#distort.uniforms.uHoles!, packed);
    gl.uniform1i(this.#distort.uniforms.uHoleCount!, holes.length);
    gl.uniform1f(this.#distort.uniforms.uStrength!, frame.distortion.strength);
    gl.uniform1f(this.#distort.uniforms.uAspect!, frame.width / Math.max(frame.height, 1));
    gl.bindVertexArray(this.#distort.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    gl.enable(gl.DEPTH_TEST);
    gl.flush();
  }

  /** The camera position, for sorting or for sizing something against its distance. */
  get eye(): readonly [number, number, number] { return this.#eye; }

  #ensureTarget(width: number, height: number): void {
    const gl = this.#gl;
    if (this.#target && this.#target.width === width && this.#target.height === height) return;
    this.#releaseTarget();
    const texture = gl.createTexture();
    const framebuffer = gl.createFramebuffer();
    const depth = gl.createRenderbuffer();
    if (!texture || !framebuffer || !depth) throw new Error('Could not allocate a render target.');
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, width, height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error('The scene render target is incomplete.');
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.#target = { framebuffer, texture, depth, width, height };
  }

  #releaseTarget(): void {
    if (!this.#target) return;
    const gl = this.#gl;
    gl.deleteFramebuffer(this.#target.framebuffer);
    gl.deleteTexture(this.#target.texture);
    gl.deleteRenderbuffer(this.#target.depth);
    this.#target = null;
  }

  dispose(): void {
    if (this.#disposed) return;
    const gl = this.#gl;
    this.#releaseTarget();
    for (const pass of [this.#fabric, this.#lines, this.#glow]) {
      gl.deleteBuffer(pass.buffer);
      gl.deleteVertexArray(pass.vao);
      gl.deleteProgram(pass.program);
    }
    gl.deleteVertexArray(this.#distort.vao);
    gl.deleteProgram(this.#distort.program);
    this.#disposed = true;
  }
}
