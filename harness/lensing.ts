/** Acceptance-test harness for the lensing renderer.
 *
 * The simulation is deliberately not in `registry/sims.ts` yet — it is unfinished, and the
 * gallery must not advertise it (BUILD_PLAN §2). But the Phase 1 acceptance test has to measure
 * the shadow off a real GPU frame, which needs a real page. This entry point exists only for
 * that, and is built only when PHYSICS_HARNESS=1, so it never reaches the shipped image.
 *
 * It lives outside `src/` so the architecture rules can keep enforcing that nothing in the app
 * imports a simulation except the registry.
 */
import {
  LensingRenderer,
  type LensingMode,
} from '../src/sims/blackhole-lensing/view/LensingRenderer';
import {
  measureShadowRadius,
  predictedShadowRadiusPixels,
} from '../src/sims/blackhole-lensing/model/shadowMeasurement';

export interface HarnessRequest {
  width: number;
  height: number;
  cameraDistance: number;
  fieldOfView: number;
  stepsPerRay: number;
  mode?: LensingMode;
}

export interface ShadowReport {
  measuredPixels: number;
  predictedPixels: number;
  errorPixels: number;
  spreadPixels: number;
  spokes: number;
  shadowAngleRadians: number;
}

declare global {
  interface Window {
    lensingHarness?: {
      measureShadow(request: HarnessRequest): ShadowReport;
      renderStars(request: HarnessRequest): void;
      lastError?: string;
    };
  }
}

const element = document.getElementById('scene');
if (!(element instanceof HTMLCanvasElement)) throw new Error('The harness canvas is missing.');
const canvas: HTMLCanvasElement = element;

let renderer: LensingRenderer | undefined;

function draw(request: HarnessRequest) {
  canvas.width = request.width;
  canvas.height = request.height;
  // One context for the page: browsers cap how many a document may hold.
  renderer ??= new LensingRenderer(canvas, {}, { preserveDrawingBuffer: true });
  renderer.setParams({
    cameraDistance: request.cameraDistance,
    fieldOfView: request.fieldOfView,
    stepsPerRay: request.stepsPerRay,
    mode: request.mode ?? 'capture-mask',
  });
  renderer.render();
  return renderer;
}

window.lensingHarness = {
  measureShadow(request) {
    const active = draw({ ...request, mode: 'capture-mask' });
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
  renderStars(request) {
    draw({ ...request, mode: 'stars' });
  },
};
