/** Orbit camera control shared by every 3D sim: drag to rotate, wheel to zoom.
 *
 * Emits the same three numbers the sims' camera models already take — distance, inclination,
 * azimuth — so nothing about the projection or the ray launch changes. This is input handling,
 * not geometry.
 *
 * Keyboard operability is not optional here (BUILD_PLAN §6): arrows orbit, +/- zoom, Home
 * restores. A pointer-only camera would make the sim unusable for anyone not using a mouse.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export interface OrbitPose {
  distance: number;
  /** Latitude in radians. */
  inclination: number;
  azimuth: number;
}

export interface OrbitLimits {
  minDistance: number;
  maxDistance: number;
  /** Latitude is clamped just short of the poles, where the camera basis degenerates. */
  maxInclination: number;
}

interface Options {
  initial: OrbitPose;
  limits: OrbitLimits;
  /** Bumped to snap back to `initial`. */
  resetToken?: number;
  /** Slow idle rotation while playing and untouched — see `idleDriftRadiansPerSecond`. */
  idleDriftRadiansPerSecond?: number;
  playing?: boolean;
}

/** Radians of orbit per pixel dragged. Tuned so a full drag across a 1000px canvas is ~180°. */
const RADIANS_PER_PIXEL = Math.PI / 1000;
/** Multiplicative zoom per wheel notch. */
const ZOOM_PER_NOTCH = 1.0015;
const KEY_ORBIT_STEP = Math.PI / 45;
const KEY_ZOOM_STEP = 1.08;
const MILLISECONDS_PER_SECOND = 1000;
/** Drift stops for this long after any input, so it never fights the user. */
const IDLE_DELAY_MS = 2500;

const clamp = (value: number, low: number, high: number): number =>
  Math.min(high, Math.max(low, value));

export interface OrbitControls {
  pose: OrbitPose;
  /** Spread onto the canvas element. */
  handlers: {
    onPointerDown: (event: React.PointerEvent<HTMLCanvasElement>) => void;
    onPointerMove: (event: React.PointerEvent<HTMLCanvasElement>) => void;
    onPointerUp: (event: React.PointerEvent<HTMLCanvasElement>) => void;
    onKeyDown: (event: React.KeyboardEvent<HTMLCanvasElement>) => void;
  };
  /** True while a drag is in progress — used to suppress the click that opens focus mode. */
  dragging: boolean;
}

export function useOrbitControls({
  initial, limits, resetToken = 0, idleDriftRadiansPerSecond = 0, playing = true,
}: Options): OrbitControls {
  const [pose, setPose] = useState<OrbitPose>(initial);
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const [dragging, setDragging] = useState(false);
  const lastInput = useRef(0);
  // `initial` is a fresh object every render; hold it in a ref so the reset effect depends on
  // the token alone and does not fire on every parent render.
  const home = useRef(initial);
  home.current = initial;

  useEffect(() => { setPose(home.current); }, [resetToken]);

  const markInput = () => { lastInput.current = performance.now(); };

  const orbitBy = useCallback((deltaAzimuth: number, deltaInclination: number) => {
    setPose(current => ({
      ...current,
      azimuth: current.azimuth + deltaAzimuth,
      inclination: clamp(
        current.inclination + deltaInclination, -limits.maxInclination, limits.maxInclination,
      ),
    }));
  }, [limits.maxInclination]);

  const zoomBy = useCallback((factor: number) => {
    setPose(current => ({
      ...current,
      distance: clamp(current.distance * factor, limits.minDistance, limits.maxDistance),
    }));
  }, [limits.minDistance, limits.maxDistance]);

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    drag.current = { x: event.clientX, y: event.clientY, moved: false };
    setDragging(true);
    markInput();
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const state = drag.current;
    if (!state) return;
    const dx = event.clientX - state.x;
    const dy = event.clientY - state.y;
    if (Math.abs(dx) + Math.abs(dy) > 2) state.moved = true;
    state.x = event.clientX;
    state.y = event.clientY;
    markInput();
    orbitBy(-dx * RADIANS_PER_PIXEL, dy * RADIANS_PER_PIXEL);
  };

  const onPointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    // Keep `dragging` true for one frame so the synthetic click after a drag does not open
    // focus mode; the canvas's onClick checks it.
    const moved = drag.current?.moved ?? false;
    drag.current = null;
    if (moved) requestAnimationFrame(() => setDragging(false));
    else setDragging(false);
  };

  /**
   * Slow idle orbit while playing and untouched.
   *
   * This is the honest version of "make the black hole feel alive": the CAMERA drifts, which is
   * a viewpoint change and claims nothing about the physics. There is no light source in a
   * vacuum Schwarzschild scene to move, and the accretion disk is axisymmetric, so spinning it
   * would be either invisible or a fabrication. Drift yields to the user immediately and stays
   * off for IDLE_DELAY_MS after any input.
   */
  useEffect(() => {
    if (!playing || idleDriftRadiansPerSecond === 0) return undefined;
    let frame = 0;
    let previous = performance.now();
    const tick = (now: number) => {
      const dt = (now - previous) / MILLISECONDS_PER_SECOND;
      previous = now;
      if (now - lastInput.current > IDLE_DELAY_MS && !drag.current) {
        setPose(current => ({
          ...current, azimuth: current.azimuth + idleDriftRadiansPerSecond * dt,
        }));
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, idleDriftRadiansPerSecond]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLCanvasElement>) => {
    const step = event.shiftKey ? KEY_ORBIT_STEP * 3 : KEY_ORBIT_STEP;
    const actions: Record<string, () => void> = {
      ArrowLeft: () => orbitBy(step, 0),
      ArrowRight: () => orbitBy(-step, 0),
      ArrowUp: () => orbitBy(0, step),
      ArrowDown: () => orbitBy(0, -step),
      '+': () => zoomBy(1 / KEY_ZOOM_STEP),
      '=': () => zoomBy(1 / KEY_ZOOM_STEP),
      '-': () => zoomBy(KEY_ZOOM_STEP),
      Home: () => setPose(home.current),
    };
    const action = actions[event.key];
    if (!action) return;
    event.preventDefault();
    markInput();
    action();
  };

  return { pose, handlers: { onPointerDown, onPointerMove, onPointerUp, onKeyDown }, dragging };
}

/** Wheel zoom, attached natively so `preventDefault` works — React's onWheel is passive. */
export function useWheelZoom(
  canvas: React.RefObject<HTMLCanvasElement | null>,
  onZoom: (factor: number) => void,
): void {
  useEffect(() => {
    const element = canvas.current;
    if (!element) return undefined;
    const handler = (event: WheelEvent) => {
      event.preventDefault();
      onZoom(ZOOM_PER_NOTCH ** event.deltaY);
    };
    element.addEventListener('wheel', handler, { passive: false });
    return () => element.removeEventListener('wheel', handler);
  }, [canvas, onZoom]);
}

export const orbitHelpers = {
  clamp,
  RADIANS_PER_PIXEL,
  ZOOM_PER_NOTCH,
  IDLE_DELAY_MS,
  MILLISECONDS_PER_SECOND,
};
