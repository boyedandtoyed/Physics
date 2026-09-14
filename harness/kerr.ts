/** Acceptance-test harness for the Kerr renderer.
 *
 * The Phase 4 gates measure real GPU frames, which needs a real page. Built only when
 * PHYSICS_HARNESS=1, so it never reaches the shipped image, and it lives outside `src/` so the
 * architecture rules keep enforcing that nothing in the app imports a simulation except the
 * registry.
 */
import { KerrRenderer, type KerrMode } from '../src/sims/kerr-shadow/view/KerrRenderer';
import { DIAGNOSTIC_MAX_DRIFT } from '../src/sims/kerr-shadow/view/kerrShader';
import {
  alphaForColumn,
  measureShadowExtent,
} from '../src/sims/kerr-shadow/model/shadowMeasurement';
import { SHADOW_VERTICAL_HALF_EXTENT, shadowExtent } from '../src/core/kerr';
import { measureShadowRadius } from '../src/core/imageMeasure';
import { launchPhoton, traceRay } from '../src/core/kerrSchild';
import { cameraFrame, tanHalfFieldOfView } from '../src/sims/kerr-shadow/view/camera';

export interface HarnessRequest {
  width: number;
  height: number;
  spin: number;
  cameraDistance: number;
  fieldOfView: number;
  stepsPerRay: number;
  inclination?: number;
  azimuth?: number;
  ringEnabled?: boolean;
  ringInnerRadius?: number;
  ringOuterRadius?: number;
  mode?: KerrMode;
}

export interface ShadowReport {
  spin: number;
  measuredMin: number;
  measuredMax: number;
  measuredMidpoint: number;
  predictedMin: number;
  predictedMax: number;
  predictedMidpoint: number;
  errorMin: number;
  errorMax: number;
  errorMidpoint: number;
  /** α per pixel on the equatorial row: the resolution the measurement is capable of. */
  alphaPerPixel: number;
}

export interface AgreementReport {
  sampled: number;
  /** Pixels where the shader's capture verdict differs from the float64 model's. */
  disagreed: number;
  /** Largest |α| at which they disagreed; a silhouette-edge disagreement is expected. */
  worstAlpha: number;
  /** How far the worst disagreeing pixel sits from the analytic boundary, in α. */
  worstDistanceFromEdge: number;
}

export interface CircleReport {
  /** Mean edge radius over every spoke, in pixels. */
  radiusPixels: number;
  spreadPixels: number;
  spokes: number;
  /** The same radius converted to α, through the exact ray launch. */
  radiusAlpha: number;
  predictedAlpha: number;
  errorAlpha: number;
  errorPixels: number;
}

export interface DriftReport {
  maxDrift: number;
  meanDrift: number;
  sampled: number;
}

export interface RingReport {
  /** Mean luminance on the approaching limb, and on the receding one. */
  approachingMean: number;
  recedingMean: number;
  ratio: number;
  approachingPixels: number;
  recedingPixels: number;
}

declare global {
  interface Window {
    kerrHarness: {
      measureShadow(request: HarnessRequest): ShadowReport;
      measureCircle(request: HarnessRequest): CircleReport;
      compareWithModel(request: HarnessRequest, samples: number): AgreementReport;
      measureDrift(request: HarnessRequest): DriftReport;
      measureRing(request: HarnessRequest): RingReport;
      rendererName(): string;
    };
  }
}

const canvas = document.getElementById('scene') as HTMLCanvasElement;
let renderer: KerrRenderer | undefined;

function pose(request: HarnessRequest) {
  return {
    distance: request.cameraDistance,
    inclination: request.inclination ?? 0,
    azimuth: request.azimuth ?? 0,
  };
}

function mappingOf(request: HarnessRequest) {
  return {
    pose: pose(request),
    fieldOfView: request.fieldOfView,
    width: request.width,
    height: request.height,
    spin: request.spin,
  };
}

function draw(request: HarnessRequest, mode: KerrMode) {
  canvas.width = request.width;
  canvas.height = request.height;
  // One context for the page: browsers cap how many a document may hold. alpha: true is not
  // cosmetic — the drift mode packs a 16-bit value across two channels.
  renderer ??= new KerrRenderer(canvas, {}, { preserveDrawingBuffer: true, alpha: true });
  renderer.setParams({
    spin: request.spin,
    cameraDistance: request.cameraDistance,
    inclination: request.inclination ?? 0,
    azimuth: request.azimuth ?? 0,
    fieldOfView: request.fieldOfView,
    stepsPerRay: request.stepsPerRay,
    ringEnabled: request.ringEnabled ?? false,
    ringInnerRadius: request.ringInnerRadius ?? 6,
    ringOuterRadius: request.ringOuterRadius ?? 14,
    jitter: [0, 0],
    resolutionScale: 1,
    accumulate: false,
    mode,
  });
  renderer.render();
  return renderer;
}

const decode16 = (high: number, low: number) => (high * 256 + low) / 65535;

const HALF = 0.5;

window.kerrHarness = {
  measureShadow(request) {
    const active = draw({ ...request, ringEnabled: false }, 'capture-mask');
    const frame = active.readPixels();
    const mapping = mappingOf(request);
    const measured = measureShadowExtent(frame, mapping);
    const predicted = shadowExtent(request.spin);
    const centre = (request.width - 1) * HALF;
    const alphaPerPixel = alphaForColumn(centre + HALF, mapping) - alphaForColumn(centre - HALF, mapping);
    return {
      spin: request.spin,
      measuredMin: measured.min,
      measuredMax: measured.max,
      measuredMidpoint: measured.midpoint,
      predictedMin: predicted.min,
      predictedMax: predicted.max,
      predictedMidpoint: predicted.midpoint,
      errorMin: measured.min - predicted.min,
      errorMax: measured.max - predicted.max,
      errorMidpoint: measured.midpoint - predicted.midpoint,
      alphaPerPixel,
    };
  },

  /** At a = 0 the shadow is a circle, so 720 spokes average the hard edge's half-pixel
   *  quantisation down to a fraction of a pixel — the same technique as the Phase 1 gate, and
   *  the only way to check b_crit to 0.5% rather than to the pixel. */
  measureCircle(request) {
    const active = draw({ ...request, ringEnabled: false }, 'capture-mask');
    const frame = active.readPixels();
    const measurement = measureShadowRadius(frame);
    const mapping = mappingOf(request);
    const centre = (request.width - 1) * HALF;
    const radiusAlpha = alphaForColumn(centre + measurement.radiusPixels, mapping);
    const alphaPerPixel = alphaForColumn(centre + HALF, mapping) - alphaForColumn(centre - HALF, mapping);
    return {
      radiusPixels: measurement.radiusPixels,
      spreadPixels: measurement.spreadPixels,
      spokes: measurement.spokes,
      radiusAlpha,
      predictedAlpha: SHADOW_VERTICAL_HALF_EXTENT,
      errorAlpha: radiusAlpha - SHADOW_VERTICAL_HALF_EXTENT,
      errorPixels: (radiusAlpha - SHADOW_VERTICAL_HALF_EXTENT) / alphaPerPixel,
    };
  },

  compareWithModel(request, samples) {
    const active = draw({ ...request, ringEnabled: false }, 'capture-mask');
    const frame = active.readPixels();
    const mapping = mappingOf(request);
    const camera = cameraFrame(pose(request));
    const tan = tanHalfFieldOfView(request.fieldOfView);
    const aspect = request.width / request.height;
    const row = Math.round(request.height * HALF - HALF);
    const predicted = shadowExtent(request.spin);
    let disagreed = 0;
    let worstAlpha = 0;
    let worstDistance = 0;
    let sampled = 0;
    for (let index = 0; index < samples; index++) {
      const column = Math.round(((index + HALF) / samples) * (request.width - 1));
      const ndcX = ((column + HALF) / request.width) * 2 - 1;
      const direction = [0, 1, 2].map(axis =>
        camera.forward[axis]! + camera.right[axis]! * (ndcX * tan * aspect)) as [number, number, number];
      const state = launchPhoton(
        { x: camera.position[0], y: camera.position[1], z: camera.position[2] },
        { x: direction[0], y: direction[1], z: direction[2] },
        request.spin,
      );
      const modelCaptured = traceRay(state, {
        spin: request.spin,
        escapeRadius: request.cameraDistance * 30,
        maxSteps: 60_000,
        stepFraction: 0.02,
        maxStep: 20,
      }).outcome === 'captured';
      const shaderCaptured =
        (frame.pixels[(row * frame.width + column) * 4] ?? 255) < 127.5;
      sampled++;
      if (modelCaptured !== shaderCaptured) {
        disagreed++;
        const alpha = alphaForColumn(column, mapping);
        const distance = Math.min(
          Math.abs(alpha - predicted.min), Math.abs(alpha - predicted.max),
        );
        if (distance > worstDistance) {
          worstDistance = distance;
          worstAlpha = alpha;
        }
      }
    }
    return { sampled, disagreed, worstAlpha, worstDistanceFromEdge: worstDistance };
  },

  measureDrift(request) {
    const active = draw({ ...request, ringEnabled: false }, 'hamiltonian');
    const frame = active.readPixels();
    let max = 0;
    let total = 0;
    let count = 0;
    for (let offset = 0; offset < frame.pixels.length; offset += 4) {
      const value = decode16(frame.pixels[offset] ?? 0, frame.pixels[offset + 1] ?? 0)
        * DIAGNOSTIC_MAX_DRIFT;
      max = Math.max(max, value);
      total += value;
      count++;
    }
    return { maxDrift: max, meanDrift: total / count, sampled: count };
  },

  measureRing(request) {
    const active = draw({ ...request, ringEnabled: true }, 'stars');
    const frame = active.readPixels();
    const mapping = mappingOf(request);
    // The ring is edge-on, so its two limbs sit left and right of the shadow on the equatorial
    // band. g = 1/(1 - Omega xi) with Omega > 0, so the blueshifted limb is xi > 0 -- which is
    // alpha < 0, because alpha = -xi (PHYSICS_SPEC 4.3a and 3.4c). That is the SAME side as the
    // shadow's flat edge, which sits at alpha = -2.11 M at a/M = 0.998: both are the prograde
    // side. The two landing on opposite sides is the signature of a reflected trace, and it is
    // the only thing here that can see one.
    const row = Math.round(request.height * HALF - HALF);
    const band = Math.max(2, Math.round(request.height * 0.02));
    let approaching = 0;
    let approachingPixels = 0;
    let receding = 0;
    let recedingPixels = 0;
    for (let dy = -band; dy <= band; dy++) {
      const y = row + dy;
      if (y < 0 || y >= frame.height) continue;
      for (let column = 0; column < frame.width; column++) {
        const offset = (y * frame.width + column) * 4;
        const luminance = 0.2126 * (frame.pixels[offset] ?? 0)
          + 0.7152 * (frame.pixels[offset + 1] ?? 0)
          + 0.0722 * (frame.pixels[offset + 2] ?? 0);
        // Sky and shadow are dark; only the ring is bright here.
        if (luminance < 40) continue;
        const alpha = alphaForColumn(column, mapping);
        if (alpha < 0) { approaching += luminance; approachingPixels++; }
        else { receding += luminance; recedingPixels++; }
      }
    }
    return {
      approachingMean: approachingPixels ? approaching / approachingPixels : 0,
      recedingMean: recedingPixels ? receding / recedingPixels : 0,
      ratio: recedingPixels && approachingPixels
        ? (approaching / approachingPixels) / (receding / recedingPixels) : 0,
      approachingPixels,
      recedingPixels,
    };
  },

  rendererName() {
    renderer ??= new KerrRenderer(canvas, {}, { preserveDrawingBuffer: true, alpha: true });
    return renderer.rendererName();
  },
};

export { SHADOW_VERTICAL_HALF_EXTENT };
