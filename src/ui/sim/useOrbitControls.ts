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

/**
 * Controlled: the caller owns the pose.
 *
 * The alternative — the hook holding its own copy — gives every sim two sources of truth for the
 * camera, one behind the sliders and one behind the mouse, which drift apart the moment both are
 * used. The caller passes the current pose in and applies the deltas this hook reports.
 */
interface Options {
  pose: OrbitPose;
  onChange: (next: OrbitPose) => void;
  limits: OrbitLimits;
  /** Slow idle rotation while playing and untouched. */
  idleDriftRadiansPerSecond?: number;
  playing?: boolean;
  /**
   * Applies one drift step, in radians of azimuth.
   *
   * Deliberately NOT routed through `onChange`: drift fires every frame, and a whole-pose write
   * read-modify-writes state it does not own. That raced with Reset — the drift callback read the
   * pre-reset pose, Reset committed, and the drift's write landed afterwards and restored the old
   * camera. A delta applied with a functional update composes with whatever else changed.
   */
  onDrift?: (deltaAzimuthRadians: number) => void;
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
  /** Spread onto the canvas element. */
  handlers: {
    onPointerDown: (event: React.PointerEvent<HTMLCanvasElement>) => void;
    onPointerMove: (event: React.PointerEvent<HTMLCanvasElement>) => void;
    onPointerUp: (event: React.PointerEvent<HTMLCanvasElement>) => void;
    onKeyDown: (event: React.KeyboardEvent<HTMLCanvasElement>) => void;
  };
  /** True while a drag is in progress — used to suppress the click that opens focus mode. */
  dragging: boolean;
  /** Exposed so the caller can wire wheel zoom, which must be a non-passive native listener. */
  zoomBy: (factor: number) => void;
}

export function useOrbitControls({
  pose, onChange, limits, idleDriftRadiansPerSecond = 0, playing = true, onDrift,
}: Options): OrbitControls {
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const [dragging, setDragging] = useState(false);
  const lastInput = useRef(0);
  // Latest pose and callback, so the idle-drift effect does not re-subscribe every frame.
  const latest = useRef({ pose, onChange, onDrift });
  latest.current = { pose, onChange, onDrift };

  const markInput = () => { lastInput.current = performance.now(); };

  const orbitBy = useCallback((deltaAzimuth: number, deltaInclination: number) => {
    const current = latest.current.pose;
    latest.current.onChange({
      ...current,
      azimuth: current.azimuth + deltaAzimuth,
      inclination: clamp(
        current.inclination + deltaInclination, -limits.maxInclination, limits.maxInclination,
      ),
    });
  }, [limits.maxInclination]);

  const zoomBy = useCallback((factor: number) => {
    const current = latest.current.pose;
    latest.current.onChange({
      ...current,
      distance: clamp(current.distance * factor, limits.minDistance, limits.maxDistance),
    });
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
    if (!playing || idleDriftRadiansPerSecond === 0 || !onDrift) return undefined;
    // Start the idle clock now, not at the epoch, or the drift begins the instant the page loads.
    lastInput.current = performance.now();
    let frame = 0;
    let previous = performance.now();
    const tick = (now: number) => {
      const dt = (now - previous) / MILLISECONDS_PER_SECOND;
      previous = now;
      if (now - lastInput.current > IDLE_DELAY_MS && !drag.current) {
        latest.current.onDrift?.(idleDriftRadiansPerSecond * dt);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, idleDriftRadiansPerSecond, onDrift]);

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
    };
    const action = actions[event.key];
    if (!action) return;
    event.preventDefault();
    markInput();
    action();
  };

  return { handlers: { onPointerDown, onPointerMove, onPointerUp, onKeyDown }, dragging, zoomBy };
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
