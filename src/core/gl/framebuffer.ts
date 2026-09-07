/** Off-screen render targets for the resolution-scaling and accumulation passes of
 * PHYSICS_SPEC §4.5. Framework-free WebGL2.
 */
import { GlError } from './context';

/** Base for the hexadecimal framebuffer status code in the error message. */
const HEX = 16;

export interface RenderTarget {
  framebuffer: WebGLFramebuffer;
  texture: WebGLTexture;
  width: number;
  height: number;
}

/** Half-float targets when the driver offers them.
 *
 * Accumulation averages many frames into one buffer; in 8-bit that rounds every step and the
 * average converges to a biased value rather than the supersampled one, which is exactly the
 * failure §4.5 warns about. Half float removes the bias. The 8-bit path is a fallback, not the
 * intent, so callers can tell which they got.
 */
export function preferredColourFormat(gl: WebGL2RenderingContext) {
  const floatRenderable = gl.getExtension('EXT_color_buffer_float')
    ?? gl.getExtension('EXT_color_buffer_half_float');
  return floatRenderable
    ? { internalFormat: gl.RGBA16F, type: gl.HALF_FLOAT, halfFloat: true }
    : { internalFormat: gl.RGBA8, type: gl.UNSIGNED_BYTE, halfFloat: false };
}

export function createRenderTarget(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
  format = preferredColourFormat(gl),
): RenderTarget {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) {
    throw new GlError('Render target dimensions must be positive integers.');
  }
  const texture = gl.createTexture();
  const framebuffer = gl.createFramebuffer();
  if (!texture || !framebuffer) throw new GlError('Could not allocate a render target.');

  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(
    gl.TEXTURE_2D, 0, format.internalFormat, width, height, 0, gl.RGBA, format.type, null,
  );
  // LINEAR is what makes the upsample bilinear, per §4.5.
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.bindTexture(gl.TEXTURE_2D, null);
  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    gl.deleteFramebuffer(framebuffer);
    gl.deleteTexture(texture);
    throw new GlError(`Incomplete framebuffer (status 0x${status.toString(HEX)}).`);
  }
  return { framebuffer, texture, width, height };
}

export function disposeRenderTarget(gl: WebGL2RenderingContext, target: RenderTarget): void {
  gl.deleteFramebuffer(target.framebuffer);
  gl.deleteTexture(target.texture);
}

/** Halton sequence, the standard low-discrepancy choice for sub-pixel jitter.
 * Returned offsets are centred on zero so an accumulated sequence is unbiased (§4.5). */
export function haltonJitter(index: number): [number, number] {
  const radical = (n: number, base: number) => {
    let result = 0;
    let denominator = 1;
    let value = n;
    while (value > 0) {
      denominator *= base;
      result += (value % base) / denominator;
      value = Math.floor(value / base);
    }
    return result;
  };
  return [radical(index + 1, 2) - 0.5, radical(index + 1, 3) - 0.5];
}

/**
 * Present pass: upsample the render target to the canvas, with optional film grain.
 *
 * Grain is a **display** effect and belongs here, after tone mapping and after every physical
 * quantity has been computed -- it must never sit upstream of anything measured. `uGrain` is 0 by
 * default and the addition is then exactly zero, so a frame rendered with grain off is
 * bit-identical to one rendered before grain existed. That matters: the acceptance suite measures
 * the shadow radius off this image.
 *
 * Diagnostic modes bypass this pass entirely (they encode data, not colour), so they can never
 * pick up grain regardless of the setting.
 */
export const BLIT_FRAGMENT_SHADER = `#version 300 es
precision highp float;
uniform sampler2D uSource;
uniform vec2 uTargetSize;
/** 0 = off, and off is the default. Non-physical; labelled as such in the UI. */
uniform float uGrain;
/** Advances per frame so the grain resolves rather than sitting still like dirt on the lens. */
uniform float uGrainSeed;
out vec4 fragColor;

/** Cheap per-pixel hash. Not a texture read: one fewer binding and no wrap artefacts. */
float grainHash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}

void main() {
  vec3 colour = texture(uSource, gl_FragCoord.xy / uTargetSize).rgb;
  if (uGrain > 0.0) {
    float n = grainHash(gl_FragCoord.xy + vec2(uGrainSeed, uGrainSeed * 1.7));
    // Signed, zero-mean, so grain darkens and lightens equally and does not shift exposure.
    colour += (n - 0.5) * uGrain * 0.16;
  }
  fragColor = vec4(colour, 1.0);
}
`;

export const ACCUMULATE_FRAGMENT_SHADER = `#version 300 es
precision highp float;
uniform sampler2D uCurrent;
uniform sampler2D uHistory;
uniform vec2 uTargetSize;
/** Weight of the incoming frame. 1.0 discards the history entirely, which is what a camera or
 * parameter change must do -- otherwise the accumulator smears the old geometry into the new
 * frame (PHYSICS_SPEC 4.5). */
uniform float uBlend;
out vec4 fragColor;
void main() {
  vec2 uv = gl_FragCoord.xy / uTargetSize;
  vec3 current = texture(uCurrent, uv).rgb;
  vec3 history = texture(uHistory, uv).rgb;
  fragColor = vec4(mix(history, current, uBlend), 1.0);
}
`;
