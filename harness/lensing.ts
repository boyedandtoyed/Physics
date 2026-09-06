/** Acceptance-test harness for the lensing renderer.
 *
 * The simulation is deliberately not in `registry/sims.ts` yet — it is unfinished, and the
 * gallery must not advertise it (BUILD_PLAN §2). But the Phase 1 acceptance tests have to measure
 * real GPU frames, which needs a real page. This entry point exists only for that, and is built
 * only when PHYSICS_HARNESS=1, so it never reaches the shipped image.
 *
 * It lives outside `src/` so the architecture rules can keep enforcing that nothing in the app
 * imports a simulation except the registry.
 */
import {
  LensingRenderer,
  type LensingMode,
} from '../src/sims/blackhole-lensing/view/LensingRenderer';
import {
  DIAGNOSTIC_MAX_G,
  DIAGNOSTIC_MAX_LUMINANCE,
  DIAGNOSTIC_MAX_RADIUS,
} from '../src/sims/blackhole-lensing/view/lensingShader';
import {
  measureShadowRadius,
  predictedShadowRadiusPixels,
} from '../src/sims/blackhole-lensing/model/shadowMeasurement';
import { traceCameraPixel } from '../src/sims/blackhole-lensing/model/rayTracer';
import { novikovThorneTemperature, redshiftFactor } from '../src/core/schwarzschild';
import { haltonJitter } from '../src/core/gl/framebuffer';

export interface HarnessRequest {
  width: number;
  height: number;
  cameraDistance: number;
  fieldOfView: number;
  stepsPerRay: number;
  inclination?: number;
  azimuth?: number;
  diskInnerRadius?: number;
  diskOuterRadius?: number;
  diskEnabled?: boolean;
  mode?: LensingMode;
  jitter?: readonly [number, number];
  resolutionScale?: number;
  accumulate?: boolean;
}

export interface ShadowReport {
  measuredPixels: number;
  predictedPixels: number;
  errorPixels: number;
  spreadPixels: number;
  spokes: number;
  shadowAngleRadians: number;
}

export interface DiskReport {
  /** Pixels where the shader and the float64 model both report a disk hit. */
  agreed: number;
  /** Pixels where exactly one of them reports a hit — silhouette edges, essentially. */
  disagreed: number;
  sampled: number;
  /** 95th-percentile relative error across agreeing pixels. */
  radiusError95: number;
  redshiftError95: number;
  /** Shifted temperature g*T(r). Guards the Novikov-Thorne profile itself: the emission radius
   * and g are identical whether the flux law is NT or the Newtonian Shakura-Sunyaev one, so
   * without this the wrong profile passes every other check. */
  temperatureError95: number;
  temperatureErrorMax: number;
  radiusErrorMax: number;
  redshiftErrorMax: number;
  /** Details of the single worst redshift disagreement, for diagnosis. */
  worst: {
    ndcX: number; ndcY: number;
    shaderRadius: number; modelRadius: number;
    shaderG: number; modelG: number;
    modelAxialImpact: number;
    modelGAtShaderRadius: number;
  } | null;
}

export interface CrescentReport {
  /** Mean encoded brightness of the approaching (image-left) side of the disk plane. */
  approachingMean: number;
  recedingMean: number;
  ratio: number;
  approachingPixels: number;
  recedingPixels: number;
}

export interface StabilityReport {
  /** RMS per-pixel luminance standard deviation across sub-pixel jitters, in the rim annulus
   * where the lensing map compresses hardest. This is the temporal-stability metric of §4.5. */
  rimRms: number;
  /** Same statistic over the whole frame, for context. */
  frameRms: number;
  /** Worst single pixel in the annulus. */
  rimMax: number;
  /** Mean luminance in the annulus. **The stability gate is unsound without this.** A blank
   * frame has zero variance and would otherwise score perfectly; this is what stops "render
   * nothing" from passing. Found by a mutation that made the kernel so narrow the rim went
   * black and scored better than the correct filter. */
  rimMean: number;
  samples: number;
  rimPixels: number;
}

export interface SharpnessReport {
  /** Mean over radial spokes of the steepest one-pixel luminance step across the shadow rim.
   * Higher is sharper. Quantifies what resolution scaling costs at a hard edge (§4.5). */
  edgeGradient: number;
  spokes: number;
}

export interface AccumulationReport {
  /** Max per-pixel difference between the accumulator and an explicit mean of the same jitters. */
  convergenceError: number;
  /** Max per-pixel difference between a post-camera-change frame and a fresh single frame.
   * Non-zero would mean the history leaked across the change -- the ghosting §4.5 requires
   * the implementation to prevent. */
  ghostingError: number;
  accumulatedFrames: number;
  frames: number;
}

export interface ThroughputReport {
  framesPerSecond: number;
  millisecondsPerFrame: number;
  frames: number;
  width: number;
  height: number;
  stepsPerRay: number;
  resolutionScale: number;
  renderer: string;
}

export interface ExponentReport {
  /** d(log luminance)/d(log g), measured from mirror-image pixels. Must be 4, not 8. */
  exponent: number;
  gLeft: number;
  gRight: number;
  luminanceLeft: number;
  luminanceRight: number;
  radiusLeft: number;
  radiusRight: number;
  shiftedTemperatureLeft: number;
  shiftedTemperatureRight: number;
}

declare global {
  interface Window {
    lensingHarness?: {
      measureShadow(request: HarnessRequest): ShadowReport;
      measureDisk(request: HarnessRequest): DiskReport;
      measureDopplerExponent(request: HarnessRequest): ExponentReport;
      measureCrescent(request: HarnessRequest): CrescentReport;
    measureTemporalStability(request: HarnessRequest, samples?: number): StabilityReport;
    measureEdgeSharpness(request: HarnessRequest): SharpnessReport;
    measureThroughput(request: HarnessRequest, frames?: number): ThroughputReport;
    measureAccumulation(request: HarnessRequest, frames?: number): AccumulationReport;
    renderStars(request: HarnessRequest): void;
    };
  }
}

const element = document.getElementById('scene');
if (!(element instanceof HTMLCanvasElement)) throw new Error('The harness canvas is missing.');
const canvas: HTMLCanvasElement = element;

let renderer: LensingRenderer | undefined;

function pose(request: HarnessRequest) {
  return {
    distance: request.cameraDistance,
    inclination: request.inclination ?? 0,
    azimuth: request.azimuth ?? 0,
  };
}

function disk(request: HarnessRequest) {
  return {
    innerRadius: request.diskInnerRadius ?? 3,
    outerRadius: request.diskOuterRadius ?? 12,
  };
}

function draw(request: HarnessRequest, mode: LensingMode) {
  canvas.width = request.width;
  canvas.height = request.height;
  // One context for the page: browsers cap how many a document may hold.
  // alpha: true is not cosmetic here -- the diagnostic modes encode a 16-bit value across
  // the blue and alpha channels, and without a real alpha channel readPixels returns 255.
  renderer ??= new LensingRenderer(canvas, {}, { preserveDrawingBuffer: true, alpha: true });
  renderer.setParams({
    cameraDistance: request.cameraDistance,
    inclination: request.inclination ?? 0,
    azimuth: request.azimuth ?? 0,
    fieldOfView: request.fieldOfView,
    stepsPerRay: request.stepsPerRay,
    diskEnabled: request.diskEnabled ?? true,
    diskInnerRadius: request.diskInnerRadius ?? 3,
    diskOuterRadius: request.diskOuterRadius ?? 12,
    jitter: request.jitter ?? [0, 0],
    resolutionScale: request.resolutionScale ?? 1,
    accumulate: request.accumulate ?? false,
    mode,
  });
  renderer.render();
  return renderer;
}

/** Undo the shader's encode16: two 8-bit channels back to a [0, 1] fraction. */
const decode16 = (high: number, low: number) => (high * 256 + low) / 65535;

/** Normalised device coordinates of a pixel, matching gl_FragCoord exactly.
 * `row` is measured from the top, as readPixels() returns it. */
function ndcOf(column: number, row: number, width: number, height: number) {
  return {
    x: ((column + 0.5) / width) * 2 - 1,
    y: ((height - 1 - row + 0.5) / height) * 2 - 1,
  };
}

/** Below this encoded luminance a pixel is sky or shadow, not disk. */
const BACKGROUND_CUTOFF = 12;

function percentile(values: number[], fraction: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))] ?? 0;
}

window.lensingHarness = {
  measureShadow(request) {
    const active = draw({ ...request, diskEnabled: false }, 'capture-mask');
    const frame = active.readPixels();
    const measurement = measureShadowRadius(frame);
    const predicted = predictedShadowRadiusPixels(
      request.cameraDistance,
      request.fieldOfView,
      request.height,
    );
    return {
      measuredPixels: measurement.radiusPixels,
      predictedPixels: predicted,
      errorPixels: Math.abs(measurement.radiusPixels - predicted),
      spreadPixels: measurement.spreadPixels,
      spokes: measurement.spokes,
      shadowAngleRadians: Math.atan(
        (predicted / (request.height / 2)) * Math.tan((request.fieldOfView * Math.PI) / 180 / 2),
      ),
    };
  },

  /** Compare the shader's emission radius and redshift factor against the float64 model,
   * pixel by pixel. This is what makes disk correctness measurable rather than merely visible. */
  measureDisk(request) {
    const diagnostic = draw(request, 'disk-diagnostic').readPixels();
    const active = draw(request, 'disk-luminance');
    const thermal = active.readPixels();
    const peakTemperature = active.getState().peakTemperature;
    const { width, height, pixels } = diagnostic;
    const aspect = width / height;
    const radiusErrors: number[] = [];
    const redshiftErrors: number[] = [];
    const temperatureErrors: number[] = [];
    let agreed = 0;
    let disagreed = 0;
    let sampled = 0;
    let worst: DiskReport['worst'] = null;
    let worstError = -1;

    const stride = Math.max(1, Math.floor(Math.min(width, height) / 48));
    for (let row = 0; row < height; row += stride) {
      for (let column = 0; column < width; column += stride) {
        const offset = (row * width + column) * 4;
        const shaderRadius =
          decode16(pixels[offset] ?? 0, pixels[offset + 1] ?? 0) * DIAGNOSTIC_MAX_RADIUS;
        const shaderG =
          decode16(pixels[offset + 2] ?? 0, pixels[offset + 3] ?? 0) * DIAGNOSTIC_MAX_G;

        const { x, y } = ndcOf(column, row, width, height);
        const reference = traceCameraPixel(
          pose(request), request.fieldOfView, x, y, aspect, disk(request),
        );
        const shaderHit = shaderRadius > 0;
        const modelHit = reference.outcome === 'disk';
        sampled++;
        if (shaderHit !== modelHit) { disagreed++; continue; }
        if (!shaderHit) continue;

        agreed++;
        const modelRadius = reference.emissionRadius ?? 0;
        const modelG = redshiftFactor(
          modelRadius, reference.axialImpactParameter ?? 0, request.cameraDistance,
        );
        radiusErrors.push(Math.abs(shaderRadius - modelRadius) / modelRadius);
        const redshiftError = Math.abs(shaderG - modelG) / modelG;
        redshiftErrors.push(redshiftError);

        // The luminance pass stores g*T normalised by twice the peak temperature.
        const shaderShifted =
          decode16(thermal.pixels[offset + 2] ?? 0, thermal.pixels[offset + 3] ?? 0)
          * 2 * peakTemperature;
        const modelShifted = modelG * novikovThorneTemperature(modelRadius) * peakTemperature;
        if (modelShifted > 0) {
          temperatureErrors.push(Math.abs(shaderShifted - modelShifted) / modelShifted);
        }
        if (redshiftError > worstError) {
          worstError = redshiftError;
          worst = {
            ndcX: x, ndcY: y,
            shaderRadius, modelRadius,
            shaderG, modelG,
            modelAxialImpact: reference.axialImpactParameter ?? 0,
            modelGAtShaderRadius: redshiftFactor(
              shaderRadius, reference.axialImpactParameter ?? 0, request.cameraDistance,
            ),
          };
        }
      }
    }

    return {
      agreed,
      disagreed,
      sampled,
      radiusError95: percentile(radiusErrors, 0.95),
      redshiftError95: percentile(redshiftErrors, 0.95),
      temperatureError95: percentile(temperatureErrors, 0.95),
      temperatureErrorMax: temperatureErrors.length ? Math.max(...temperatureErrors) : 0,
      radiusErrorMax: radiusErrors.length ? Math.max(...radiusErrors) : 0,
      redshiftErrorMax: redshiftErrors.length ? Math.max(...redshiftErrors) : 0,
      worst,
    };
  },

  /** Measure d(log L)/d(log g) from mirror-image pixels.
   *
   * Mirror pixels sample the same emission radius, so the unshifted temperature is identical and
   * the luminance ratio is purely (g_left/g_right)^n. The correct n is 4. If the g factor were
   * applied a second time on top of the T -> gT substitution — the error PHYSICS_SPEC §4.3
   * carried before the audit — this would read 8.
   */
  measureDopplerExponent(request) {
    const sampleColumn = Math.round(request.width * 0.14);
    const mirrorColumn = request.width - 1 - sampleColumn;
    const row = Math.round(request.height / 2);

    const diagnostic = draw(request, 'disk-diagnostic').readPixels();
    const luminance = draw(request, 'disk-luminance').readPixels();

    const read = (frame: { width: number; pixels: Uint8Array }, column: number) => {
      const offset = (row * frame.width + column) * 4;
      return {
        first: decode16(frame.pixels[offset] ?? 0, frame.pixels[offset + 1] ?? 0),
        second: decode16(frame.pixels[offset + 2] ?? 0, frame.pixels[offset + 3] ?? 0),
      };
    };

    const leftDiag = read(diagnostic, sampleColumn);
    const rightDiag = read(diagnostic, mirrorColumn);
    const leftLum = read(luminance, sampleColumn);
    const rightLum = read(luminance, mirrorColumn);

    const gLeft = leftDiag.second * DIAGNOSTIC_MAX_G;
    const gRight = rightDiag.second * DIAGNOSTIC_MAX_G;
    const luminanceLeft = leftLum.first * DIAGNOSTIC_MAX_LUMINANCE;
    const luminanceRight = rightLum.first * DIAGNOSTIC_MAX_LUMINANCE;

    return {
      shiftedTemperatureLeft: leftLum.second,
      shiftedTemperatureRight: rightLum.second,
      exponent: Math.log(luminanceLeft / luminanceRight) / Math.log(gLeft / gRight),
      gLeft,
      gRight,
      luminanceLeft,
      luminanceRight,
      radiusLeft: leftDiag.first * DIAGNOSTIC_MAX_RADIUS,
      radiusRight: rightDiag.first * DIAGNOSTIC_MAX_RADIUS,
    };
  },

  /** Brightness asymmetry of the finished, tone-mapped image.
   *
   * CLAUDE.md and §4.3 require physical mode to be the default and the one-sided crescent to be
   * real output, not a bug. The exponent test proves the g^4 law; this proves the picture the
   * user actually sees still carries it after the colour table and tone mapping. */
  measureCrescent(request) {
    const active = draw(request, 'stars');
    const { width, height, pixels } = active.readPixels();
    const midRow = Math.floor(height / 2);
    const band = Math.max(4, Math.floor(height * 0.04));
    let approaching = 0, receding = 0, approachingPixels = 0, recedingPixels = 0;
    for (let row = midRow - band; row < midRow + band; row++) {
      if (row < 0 || row >= height) continue;
      for (let column = 0; column < width; column++) {
        const offset = (row * width + column) * 4;
        const luminance = 0.2126 * (pixels[offset] ?? 0)
          + 0.7152 * (pixels[offset + 1] ?? 0)
          + 0.0722 * (pixels[offset + 2] ?? 0);
        if (luminance < BACKGROUND_CUTOFF) continue;  // ignore sky and the shadow
        if (column < width * 0.3) { approaching += luminance; approachingPixels++; }
        else if (column > width * 0.7) { receding += luminance; recedingPixels++; }
      }
    }
    const approachingMean = approaching / Math.max(1, approachingPixels);
    const recedingMean = receding / Math.max(1, recedingPixels);
    return {
      approachingMean,
      recedingMean,
      ratio: approachingMean / Math.max(1e-9, recedingMean),
      approachingPixels,
      recedingPixels,
    };
  },

  /** Temporal-stability metric, PHYSICS_SPEC §4.5.
   *
   * Renders the same scene at a grid of sub-pixel jitter offsets and measures how much each
   * pixel's luminance moves. Correct filtering makes a pixel the average over its footprint, so
   * the value should be nearly invariant to where inside the pixel it is sampled; point sampling
   * lands on a different star each time and swings wildly. The statistic is restricted to the
   * annulus just outside the shadow, where the lensing map compresses hardest and aliasing is
   * therefore worst.
   */
  measureTemporalStability(request, samples = 16) {
    const grid = Math.round(Math.sqrt(samples));
    const frames: Float64Array[] = [];
    let width = 0;
    let height = 0;

    for (let i = 0; i < grid; i++) {
      for (let j = 0; j < grid; j++) {
        // Zero-mean offsets spanning one pixel.
        const jitter: [number, number] = [
          (i + 0.5) / grid - 0.5,
          (j + 0.5) / grid - 0.5,
        ];
        const active = draw({ ...request, jitter }, 'stars');
        const frame = active.readPixels();
        width = frame.width;
        height = frame.height;
        const luminance = new Float64Array(width * height);
        for (let p = 0; p < luminance.length; p++) {
          const o = p * 4;
          luminance[p] = 0.2126 * (frame.pixels[o] ?? 0)
            + 0.7152 * (frame.pixels[o + 1] ?? 0)
            + 0.0722 * (frame.pixels[o + 2] ?? 0);
        }
        frames.push(luminance);
      }
    }

    const shadowPixels = predictedShadowRadiusPixels(
      request.cameraDistance, request.fieldOfView, height,
    );
    const inner = shadowPixels * 1.02;
    const outer = shadowPixels * 1.8;
    const centreX = width / 2 - 0.5;
    const centreY = height / 2 - 0.5;

    let rimSquares = 0, rimPixels = 0, rimMax = 0, frameSquares = 0, framePixels = 0;
    let rimSum = 0;
    for (let row = 0; row < height; row++) {
      for (let column = 0; column < width; column++) {
        const index = row * width + column;
        let sum = 0;
        for (const frame of frames) sum += frame[index] ?? 0;
        const mean = sum / frames.length;
        let variance = 0;
        for (const frame of frames) variance += ((frame[index] ?? 0) - mean) ** 2;
        variance /= frames.length;

        frameSquares += variance;
        framePixels++;
        const radius = Math.hypot(column - centreX, row - centreY);
        if (radius >= inner && radius <= outer) {
          rimSquares += variance;
          rimSum += mean;
          rimPixels++;
          rimMax = Math.max(rimMax, Math.sqrt(variance));
        }
      }
    }
    return {
      rimRms: Math.sqrt(rimSquares / Math.max(1, rimPixels)),
      frameRms: Math.sqrt(frameSquares / Math.max(1, framePixels)),
      rimMax,
      rimMean: rimSum / Math.max(1, rimPixels),
      samples: frames.length,
      rimPixels,
    };
  },

  /** Steepest radial luminance step across the shadow rim, averaged over spokes.
   * PHYSICS_SPEC §4.5 requires the cost of resolution scaling at hard edges to be measured
   * rather than assumed negligible; this is the measurement. */
  measureEdgeSharpness(request) {
    const active = draw(request, 'stars');
    const { width, height, pixels } = active.readPixels();
    const shadowPixels = predictedShadowRadiusPixels(
      request.cameraDistance, request.fieldOfView, height,
    );
    const centreX = width / 2 - 0.5;
    const centreY = height / 2 - 0.5;
    const luminanceAt = (x: number, y: number) => {
      const ix = Math.round(x), iy = Math.round(y);
      if (ix < 0 || iy < 0 || ix >= width || iy >= height) return 0;
      const o = (iy * width + ix) * 4;
      return 0.2126 * (pixels[o] ?? 0) + 0.7152 * (pixels[o + 1] ?? 0) + 0.0722 * (pixels[o + 2] ?? 0);
    };
    const spokeCount = 180;
    let total = 0, counted = 0;
    for (let spoke = 0; spoke < spokeCount; spoke++) {
      const angle = (spoke / spokeCount) * 2 * Math.PI;
      const dx = Math.cos(angle), dy = Math.sin(angle);
      let steepest = 0;
      for (let r = shadowPixels * 0.8; r < shadowPixels * 1.35; r += 1) {
        const step = Math.abs(luminanceAt(centreX + dx * (r + 1), centreY + dy * (r + 1))
          - luminanceAt(centreX + dx * r, centreY + dy * r));
        steepest = Math.max(steepest, step);
      }
      total += steepest;
      counted++;
    }
    return { edgeGradient: total / Math.max(1, counted), spokes: counted };
  },

  /** Does the accumulator converge to the mean of its jitters, and does it discard history on a
   * camera change? Both are PHYSICS_SPEC §4.5 requirements; the second was unstated before the
   * audit and is the ghosting failure mode. */
  measureAccumulation(request, frames = 8) {
    const read = (active: LensingRenderer) => Float64Array.from(active.readPixels().pixels);

    // Accumulate `frames` frames of an unchanging scene.
    let accumulated: Float64Array | undefined;
    let accumulatedFrames = 0;
    for (let i = 0; i < frames; i++) {
      const active = draw({ ...request, accumulate: true }, 'stars');
      accumulated = read(active);
      accumulatedFrames = active.accumulatedFrames;
    }

    // Explicit mean of the same Halton jitters, rendered one at a time.
    const reference: Float64Array[] = [];
    for (let i = 0; i < frames; i++) {
      reference.push(read(draw({ ...request, accumulate: false, jitter: haltonJitter(i) }, 'stars')));
    }
    let convergenceError = 0;
    if (accumulated && reference.length === frames) {
      for (let p = 0; p < accumulated.length; p += 4) {
        let mean = 0;
        for (const frame of reference) mean += frame[p] ?? 0;
        convergenceError = Math.max(
          convergenceError, Math.abs((accumulated[p] ?? 0) - mean / frames),
        );
      }
    }

    // Ghosting: accumulate, then move the camera and take one frame. It must equal a fresh
    // single frame of the new pose, not a blend with the old one.
    for (let i = 0; i < frames; i++) draw({ ...request, accumulate: true }, 'stars');
    const moved = { ...request, azimuth: (request.azimuth ?? 0) + 0.35 };
    const afterChange = read(draw({ ...moved, accumulate: true }, 'stars'));
    const fresh = read(draw({ ...moved, accumulate: false, jitter: haltonJitter(0) }, 'stars'));
    let ghostingError = 0;
    for (let p = 0; p < afterChange.length; p += 4) {
      ghostingError = Math.max(ghostingError, Math.abs((afterChange[p] ?? 0) - (fresh[p] ?? 0)));
    }

    return { convergenceError, ghostingError, accumulatedFrames, frames };
  },

  /** Frame rate, measured rather than asserted (BUILD_PLAN Phase 1 definition of done).
   * gl.finish() after each frame is what makes this a render time rather than a submit time. */
  measureThroughput(request, frames = 30) {
    const warmup = draw(request, 'stars');
    warmup.finish();
    const started = performance.now();
    for (let i = 0; i < frames; i++) {
      draw(request, 'stars').finish();
    }
    const elapsed = performance.now() - started;
    return {
      framesPerSecond: (frames * 1000) / elapsed,
      millisecondsPerFrame: elapsed / frames,
      frames,
      width: request.width,
      height: request.height,
      stepsPerRay: request.stepsPerRay,
      resolutionScale: request.resolutionScale ?? 1,
      renderer: warmup.rendererName(),
    };
  },

  renderStars(request) {
    draw(request, 'stars');
  },
};
