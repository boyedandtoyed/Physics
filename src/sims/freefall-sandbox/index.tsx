/** SIM H — drop anything into a gravity well, in three dimensions. PHYSICS_SPEC §2.5, §2.7, §2.9.
 *
 * Click to drop from rest, drag to throw. One central mass, so the §2.5 correction is exact
 * rather than an interpolation, and the two tracks — Newtonian and corrected — can be run from
 * identical initial conditions and compared honestly.
 *
 * **The funnel is the real Flamm paraboloid**, z = 2√(r_s(r − r_s)), evaluated in the vertex
 * shader. This sim has exactly one Schwarzschild mass, which is the only case in which that
 * surface exists at all — the gravity sandbox next door has several and draws the Newtonian
 * potential instead, and says so. The vertical scale is 1 by default: heights are in M, the same
 * unit as the plane, so a black hole's funnel is deep and the Earth's is flat because they are.
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Switch } from 'react-aria-components';
import { NumberSlider } from '../../ui/NumberSlider';
import { SimStage, StageCanvas } from '../../ui/sim/SimStage';
import { usePresentation } from '../../ui/sim/playbackStore';
import { useDarkTheme } from '../../ui/useDarkTheme';
import { MisconceptionsPanel } from '../../ui/MisconceptionsPanel';
import { useOrbitControls, useWheelZoom } from '../../ui/sim/useOrbitControls';
import { Scene3D, type Rgb } from '../../ui/gl/Scene3D';
import {
  DEFAULT_INCLINATION,
  lensFor,
  pickGroundPlane,
  pixelToNdc,
  simPerPixelAtOrigin,
  type Pose,
} from '../../ui/gl/camera3d';
import { polarGridVertices, type FabricParams } from '../../ui/gl/fabric';
import { flowBand } from '../../core/river';
import {
  CENTRAL_BODIES,
  FULL_DRAG_SPEED,
  HORIZON_RADIUS,
  OBJECTS,
  STEP,
  advance,
  cycloidTime,
  emptyState,
  escapeSpeedAt,
  fieldArrows,
  flowMarkers,
  funnelHeight,
  hoverFieldAt,
  newtonianFieldAt,
  radiusOf,
  release,
  riverSpeedAt,
  speedOf,
  staticClockRate,
  toKilometres,
  velocityFromDrag,
  type FreefallState,
  type Track,
} from './description/freefallRun';
import './freefall.css';

const PhysicsPanel = lazy(() =>
  import('../../ui/PhysicsPanel').then(module => ({ default: module.PhysicsPanel })));

const SIM_ID = 'freefall-sandbox';
const MIN_SPEED = 1;
const MAX_SPEED = 400;
const DEFAULT_SPEED = 60;
const MAX_DEVICE_PIXEL_RATIO = 2;
const MILLISECONDS_PER_SECOND = 1000;
const MAX_FRAME_SECONDS = 0.05;
const ANNOUNCE_DELAY_MS = 700;
const DRAG_DEADZONE_PIXELS = 4;
/** Frame half-width as a multiple of the surface radius, so every body is framed the same way. */
const FRAME_MULTIPLE = 6;
/** Minimum frame, in M — a black hole's surface is 2 M and needs room around it. */
const MIN_FRAME = 12;
const PLACES = 3;
const PLACES_1 = 1;
const PLACES_2 = 2;
const PLACES_4 = 4;
const PERCENT = 100;
/** Above this a clock rate needs more than four places to say anything. */
const CLOCK_NEAR_ONE = 0.999;
/** Places for a clock rate so close to 1 that four would read as exactly 1. */
const PLACES_9 = 9;
/** Below this the two tracks are the same track to display precision. */
const IDENTICAL_TRACKS = 1e-9;
/** The drop PHYSICS_SPEC §8 benchmarks: 10 M down to just outside the horizon. */
const BENCHMARK_FROM = 10;
const BENCHMARK_TO = 2.001;

/** Camera: the distance is quoted as a multiple of the frame, so every body is framed alike. */
const MIN_DISTANCE_FACTOR = 0.8;
const MAX_DISTANCE_FACTOR = 5;
const DEFAULT_DISTANCE_FACTOR = 2.4;
const MAX_INCLINATION = 1.45;
const GRID_RINGS = 26;
const GRID_SPOKES = 48;
const GRID_SEGMENTS = 96;
/** Vertical exaggeration. 1 is the true surface, and is the default. */
const MIN_EXAGGERATION = 1;
const MAX_EXAGGERATION = 6;
const DEFAULT_EXAGGERATION = 1;
/** Field arrows: a 16x16 lattice, as the brief asks, capped in length. */
const ARROW_DIVISIONS = 16;
const ARROW_CAP_FRACTION = 0.09;
const ARROW_BARB = 0.3;
const ARROW_BARB_ANGLE = 2.6;
/** River markers. */
const FLOW_SPOKES = 24;
const FLOW_PER_SPOKE = 7;
const FLOW_DASH_FRACTION = 0.035;
const FLOW_CYCLE_SECONDS = 6;
const HALO_FACTOR = 3.2;
/** A black hole gets a tighter billboard: its rim IS its edge, and a wide halo would blur it. */
const HOLE_HALO_FACTOR = 1.6;
/** The central glyph never shrinks below this fraction of the frame, or the Earth vanishes. */
const MIN_GLYPH_FRACTION = 0.012;
/** The faller's marker, as a fraction of the frame. */
const MARKER_FRACTION = 0.02;
/** The radius the arrow colour ramp saturates at, as a multiple of the surface. */
const ARROW_REFERENCE_MULTIPLE = 1.5;
const HALO_STRENGTH = 0.55;
const LINE_FLOATS = 7;

const WELL_R = 0.42;
const WELL_G = 0.6;
const WELL_B = 0.68;
const DEEP_R = 0.62;
const DEEP_G = 0.4;
const DEEP_B = 0.72;
const LIGHT_WELL_R = 0.4;
const LIGHT_WELL_G = 0.48;
const LIGHT_WELL_B = 0.58;
const LIGHT_DEEP_R = 0.32;
const LIGHT_DEEP_G = 0.2;
const LIGHT_DEEP_B = 0.5;
const SURFACE_R = 0.78;
const SURFACE_G = 0.68;
const SURFACE_B = 0.45;
const HORIZON_COLOUR_R = 0.85;
const HORIZON_COLOUR_G = 0.3;
const HORIZON_COLOUR_B = 0.3;
const GR_R = 0.35;
const GR_G = 0.8;
const GR_B = 0.96;
const NEWTON_R = 0.96;
const NEWTON_G = 0.7;
const NEWTON_B = 0.2;
const GHOST_R = 0.68;
const GHOST_G = 0.7;
const GHOST_B = 0.76;
const ARROW_NEAR_R = 0.95;
const ARROW_NEAR_G = 0.45;
const ARROW_NEAR_B = 0.3;
const ARROW_FAR_R = 0.4;
const ARROW_FAR_G = 0.7;
const ARROW_FAR_B = 0.55;
const FLOW_SLOW_R = 0.35;
const FLOW_SLOW_G = 0.72;
const FLOW_SLOW_B = 0.9;
const FLOW_FAST_R = 0.95;
const FLOW_FAST_G = 0.72;
const FLOW_FAST_B = 0.25;
const FLOW_LIGHT_R = 0.95;
const FLOW_LIGHT_G = 0.3;
const FLOW_LIGHT_B = 0.3;
const VOID_DARK_R = 0.02;
const VOID_DARK_G = 0.02;
const VOID_DARK_B = 0.05;
const VOID_LIGHT_R = 0.09;
const VOID_LIGHT_G = 0.09;
const VOID_LIGHT_B = 0.14;

const WELL: Rgb = [WELL_R, WELL_G, WELL_B];
const DEEP: Rgb = [DEEP_R, DEEP_G, DEEP_B];
const LIGHT_WELL: Rgb = [LIGHT_WELL_R, LIGHT_WELL_G, LIGHT_WELL_B];
const LIGHT_DEEP: Rgb = [LIGHT_DEEP_R, LIGHT_DEEP_G, LIGHT_DEEP_B];
const SURFACE: Rgb = [SURFACE_R, SURFACE_G, SURFACE_B];
const HORIZON_COLOUR: Rgb = [HORIZON_COLOUR_R, HORIZON_COLOUR_G, HORIZON_COLOUR_B];
const GR_TRACK: Rgb = [GR_R, GR_G, GR_B];
const NEWTON_TRACK: Rgb = [NEWTON_R, NEWTON_G, NEWTON_B];
const GHOST: Rgb = [GHOST_R, GHOST_G, GHOST_B];
const ARROW_NEAR: Rgb = [ARROW_NEAR_R, ARROW_NEAR_G, ARROW_NEAR_B];
const ARROW_FAR: Rgb = [ARROW_FAR_R, ARROW_FAR_G, ARROW_FAR_B];
const FLOW_SLOW: Rgb = [FLOW_SLOW_R, FLOW_SLOW_G, FLOW_SLOW_B];
const FLOW_FAST: Rgb = [FLOW_FAST_R, FLOW_FAST_G, FLOW_FAST_B];
const FLOW_LIGHT: Rgb = [FLOW_LIGHT_R, FLOW_LIGHT_G, FLOW_LIGHT_B];
const VOID_DARK: Rgb = [VOID_DARK_R, VOID_DARK_G, VOID_DARK_B];
const VOID_LIGHT: Rgb = [VOID_LIGHT_R, VOID_LIGHT_G, VOID_LIGHT_B];

const TRACK_ALPHA = 0.95;
const FABRIC_ALPHA = 0.95;
const ARROW_ALPHA = 0.9;
const DEGREES_IN_HALF_TURN = 180;
const DEGREES_IN_TURN = 360;
const DEGREES_PER_RADIAN = DEGREES_IN_HALF_TURN / Math.PI;

/** Azimuth into [0, 360), so the readout reads as a bearing rather than an unbounded angle. */
const wrapDegrees = (degrees: number): number =>
  ((degrees % DEGREES_IN_TURN) + DEGREES_IN_TURN) % DEGREES_IN_TURN;

interface Drag { fromX: number; fromY: number; toX: number; toY: number }

/** A line segment for the generic 3D line pass: two vertices of x, y, z, r, g, b, a. */
function segment(
  data: number[], ax: number, ay: number, az: number,
  bx: number, by: number, bz: number, colour: Rgb, alpha: number,
): void {
  data.push(
    ax, ay, az, colour[0], colour[1], colour[2], alpha,
    bx, by, bz, colour[0], colour[1], colour[2], alpha,
  );
}

export default function FreefallSandbox() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<Scene3D>(null);
  const stateRef = useRef<FreefallState>(emptyState());
  const dragRef = useRef<Drag | null>(null);
  const phaseRef = useRef(0);
  const [bodyId, setBodyId] = useState(CENTRAL_BODIES[0]!.id);
  const [objectId, setObjectId] = useState(OBJECTS[0]!.id);
  const [compare, setCompare] = useState(true);
  const [arrows, setArrows] = useState(false);
  const [river, setRiver] = useState(false);
  const [speed, setSpeed] = useState(DEFAULT_SPEED);
  const [exaggeration, setExaggeration] = useState(DEFAULT_EXAGGERATION);
  const [distanceFactor, setDistanceFactor] = useState(DEFAULT_DISTANCE_FACTOR);
  const [inclination, setInclination] = useState(DEFAULT_INCLINATION);
  const [azimuth, setAzimuth] = useState(Math.PI / 4);
  const [failure, setFailure] = useState<string>();
  const [announcement, setAnnouncement] = useState('');
  const [tick, setTick] = useState(0);
  const presentation = usePresentation(SIM_ID);
  const dark = useDarkTheme();

  const body = useMemo(
    () => CENTRAL_BODIES.find(entry => entry.id === bodyId) ?? CENTRAL_BODIES[0]!, [bodyId]);
  const object = useMemo(
    () => OBJECTS.find(entry => entry.id === objectId) ?? OBJECTS[0]!, [objectId]);
  const extent = useMemo(
    () => Math.max(body.surfaceRadius * FRAME_MULTIPLE, MIN_FRAME), [body]);
  /** The mesh starts at the surface: below it there is no vacuum Schwarzschild to embed. */
  const innerRadius = useMemo(
    () => Math.max(body.surfaceRadius, HORIZON_RADIUS), [body]);

  const pose: Pose = useMemo(
    () => ({ distance: extent * distanceFactor, inclination, azimuth }),
    [extent, distanceFactor, inclination, azimuth],
  );

  const setPose = useCallback((next: Pose) => {
    setDistanceFactor(next.distance / extent);
    setInclination(next.inclination);
    setAzimuth(next.azimuth);
  }, [extent]);

  const orbit = useOrbitControls({
    pose,
    onChange: setPose,
    limits: {
      minDistance: extent * MIN_DISTANCE_FACTOR,
      maxDistance: extent * MAX_DISTANCE_FACTOR,
      maxInclination: MAX_INCLINATION,
    },
  });
  useWheelZoom(canvasRef, orbit.zoomBy);

  const lensOf = useCallback(() => {
    const canvas = canvasRef.current;
    const width = Math.max(1, canvas?.clientWidth ?? 1);
    const height = Math.max(1, canvas?.clientHeight ?? 1);
    return { lens: lensFor(width / height), width, height };
  }, []);

  const planePoint = useCallback((event: { clientX: number; clientY: number }) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const { lens, width, height } = lensOf();
    const ndc = pixelToNdc(event.clientX - rect.left, event.clientY - rect.top, width, height);
    return pickGroundPlane(pose, lens, ndc.x, ndc.y);
  }, [lensOf, pose]);

  // A trajectory integrated around one mass cannot be continued around another.
  useEffect(() => {
    stateRef.current = emptyState();
    setTick(value => value + 1);
  }, [bodyId, presentation.resetToken]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      sceneRef.current = new Scene3D(canvas);
      setFailure(undefined);
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
    }
    return () => {
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
  }, []);

  // The mesh is static geometry the shader lifts; it is rebuilt only when the annulus changes.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || failure) return;
    scene.setFabricMesh(
      polarGridVertices(innerRadius, extent, GRID_RINGS, GRID_SPOKES, GRID_SEGMENTS),
    );
  }, [innerRadius, extent, failure]);

  const fabricParams: FabricParams = useMemo(() => ({
    mode: 'flamm',
    masses: [{ x: 0, y: 0, mass: 1, radius: HORIZON_RADIUS }],
    heightScale: exaggeration,
    floor: Number.POSITIVE_INFINITY,
    outerRadius: extent,
  }), [exaggeration, extent]);

  const heightAt = useCallback(
    (radius: number) => funnelHeight(radius, extent) * exaggeration, [extent, exaggeration],
  );

  useEffect(() => {
    const scene = sceneRef.current;
    const canvas = canvasRef.current;
    if (!scene || !canvas || failure) return;

    let handle = 0;
    let stopped = false;
    let previous = performance.now();

    const trackLines = (track: Track, colour: Rgb, data: number[]) => {
      const trail = track.trail;
      for (let i = 1; i < trail.length; i++) {
        const from = trail[i - 1]!;
        const to = trail[i]!;
        const age = trail.length < 2 ? 1 : i / (trail.length - 1);
        data.push(
          from.x, heightAt(Math.hypot(from.x, from.y)), from.y,
          colour[0], colour[1], colour[2], age * TRACK_ALPHA,
          to.x, heightAt(Math.hypot(to.x, to.y)), to.y,
          colour[0], colour[1], colour[2], age * TRACK_ALPHA,
        );
      }
    };

    const draw = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, MAX_DEVICE_PIXEL_RATIO);
      const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
      const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      const lens = lensFor(width / height);
      const state = stateRef.current;

      scene.beginFrame({ pose, lens, width, height });
      scene.drawFabric(fabricParams, {
        lineColour: dark ? WELL : LIGHT_WELL,
        deepColour: dark ? DEEP : LIGHT_DEEP,
        deepAt: Math.abs(heightAt(innerRadius)) || 1,
        alpha: FABRIC_ALPHA,
      });

      const lines: number[] = [];
      // The surface ring, and the horizon if it is not the surface itself.
      const ringAt = (radius: number, colour: Rgb, alpha: number) => {
        const y = heightAt(radius);
        for (let i = 0; i < GRID_SEGMENTS; i++) {
          const a = (i / GRID_SEGMENTS) * Math.PI * 2;
          const b = ((i + 1) / GRID_SEGMENTS) * Math.PI * 2;
          segment(
            lines, radius * Math.cos(a), y, radius * Math.sin(a),
            radius * Math.cos(b), y, radius * Math.sin(b), colour, alpha,
          );
        }
      };
      ringAt(innerRadius, body.id === 'black-hole' ? HORIZON_COLOUR : SURFACE, 1);

      if (arrows) {
        const cap = extent * ARROW_CAP_FRACTION;
        for (const arrow of fieldArrows(ARROW_DIVISIONS, extent, innerRadius, cap)) {
          const radius = Math.hypot(arrow.x, arrow.y);
          const y = heightAt(radius);
          const tipX = arrow.x + arrow.dx * arrow.length;
          const tipY = arrow.y + arrow.dy * arrow.length;
          const tipHeight = heightAt(Math.hypot(tipX, tipY));
          // Colour carries the magnitude the capped length no longer can.
          const strength = Math.min(
            1, arrow.magnitude / hoverFieldAt(innerRadius * ARROW_REFERENCE_MULTIPLE),
          );
          const colour: Rgb = [
            ARROW_FAR[0] + (ARROW_NEAR[0] - ARROW_FAR[0]) * strength,
            ARROW_FAR[1] + (ARROW_NEAR[1] - ARROW_FAR[1]) * strength,
            ARROW_FAR[2] + (ARROW_NEAR[2] - ARROW_FAR[2]) * strength,
          ];
          segment(lines, arrow.x, y, arrow.y, tipX, tipHeight, tipY, colour, ARROW_ALPHA);
          for (const sign of [1, -1]) {
            const angle = Math.atan2(arrow.dy, arrow.dx) + sign * ARROW_BARB_ANGLE;
            const barbX = tipX + Math.cos(angle) * arrow.length * ARROW_BARB;
            const barbY = tipY + Math.sin(angle) * arrow.length * ARROW_BARB;
            segment(
              lines, tipX, tipHeight, tipY,
              barbX, heightAt(Math.hypot(barbX, barbY)), barbY, colour, ARROW_ALPHA,
            );
          }
        }
      }

      if (river) {
        const dash = extent * FLOW_DASH_FRACTION;
        for (const marker of flowMarkers(FLOW_SPOKES, FLOW_PER_SPOKE, extent, phaseRef.current)) {
          if (marker.radius < innerRadius) continue;
          const band = flowBand(marker.speed);
          const colour = band === 'slow' ? FLOW_SLOW
            : band === 'transonic' ? FLOW_FAST : FLOW_LIGHT;
          const inner = Math.max(marker.radius - dash, innerRadius);
          const cos = Math.cos(marker.angle);
          const sin = Math.sin(marker.angle);
          segment(
            lines, marker.radius * cos, heightAt(marker.radius), marker.radius * sin,
            inner * cos, heightAt(inner), inner * sin, colour, 1,
          );
        }
        // The horizon is where the river reaches exactly c, and is drawn as that.
        if (innerRadius <= HORIZON_RADIUS) ringAt(HORIZON_RADIUS, FLOW_LIGHT, 1);
      }

      if (state.released) {
        if (compare) trackLines(state.newtonian, NEWTON_TRACK, lines);
        trackLines(state.relativistic, GR_TRACK, lines);
      }
      const drag = dragRef.current;
      if (drag) {
        segment(
          lines,
          drag.fromX, heightAt(Math.hypot(drag.fromX, drag.fromY)), drag.fromY,
          drag.toX, heightAt(Math.hypot(drag.toX, drag.toY)), drag.toY, GHOST, 1,
        );
      }
      if (lines.length >= LINE_FLOATS * 2) scene.drawLines(new Float32Array(lines));

      // The central body, then the faller.
      const glyph = Math.max(innerRadius, extent * MIN_GLYPH_FRACTION);
      const isHole = body.id === 'black-hole';
      // Red is the horizon's colour and belongs to the horizon. A neutron star has a surface,
      // which is a different kind of thing and is drawn as one.
      const bodyColour = isHole ? HORIZON_COLOUR : SURFACE;
      const bodyGlow = new Float32Array([
        0, heightAt(innerRadius), 0, glyph * (isHole ? HOLE_HALO_FACTOR : HALO_FACTOR),
        bodyColour[0], bodyColour[1], bodyColour[2],
        1 / (isHole ? HOLE_HALO_FACTOR : HALO_FACTOR), isHole ? 1 : 0,
      ]);
      scene.drawGlows(
        bodyGlow, HALO_STRENGTH, !isHole && dark,
        dark ? VOID_DARK : VOID_LIGHT,
      );

      if (state.released) {
        const marker = (track: Track, colour: Rgb) => {
          const radius = radiusOf(track);
          const size = extent * MARKER_FRACTION * HALO_FACTOR;
          return [
            track.x, heightAt(radius), track.y, size,
            colour[0], colour[1], colour[2], 1 / HALO_FACTOR, 0,
          ];
        };
        const instances = compare
          ? [...marker(state.newtonian, NEWTON_TRACK), ...marker(state.relativistic, GR_TRACK)]
          : marker(state.relativistic, GR_TRACK);
        scene.drawGlows(new Float32Array(instances), HALO_STRENGTH, dark);
      }
      scene.endFrame();
    };

    const step = (now: number) => {
      if (stopped) return;
      const seconds = Math.min((now - previous) / MILLISECONDS_PER_SECOND, MAX_FRAME_SECONDS);
      previous = now;
      phaseRef.current = (phaseRef.current + seconds / FLOW_CYCLE_SECONDS) % 1;
      const steps = Math.max(1, Math.round((seconds * speed) / STEP));
      stateRef.current = advance(stateRef.current, steps, body.surfaceRadius);
      draw();
      setTick(value => value + 1);
      handle = requestAnimationFrame(step);
    };

    draw();
    if (!presentation.playing) return () => { stopped = true; };
    previous = performance.now();
    handle = requestAnimationFrame(step);
    return () => { stopped = true; cancelAnimationFrame(handle); };
  }, [
    extent, innerRadius, body, speed, compare, arrows, river, failure, pose, dark, heightAt,
    fabricParams, presentation.playing, presentation.focused,
  ]);

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (event.shiftKey || event.button === 1) {
      orbit.handlers.onPointerDown(event);
      return;
    }
    if (event.button !== 0) return;
    const point = planePoint(event);
    if (!point) return;
    dragRef.current = { fromX: point.x, fromY: point.y, toX: point.x, toY: point.y };
    try { canvas.setPointerCapture(event.pointerId); } catch { /* drag still works */ }
  }, [planePoint, orbit.handlers]);

  const onPointerMove = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    if (orbit.dragging) {
      orbit.handlers.onPointerMove(event);
      return;
    }
    const drag = dragRef.current;
    if (!drag) return;
    const point = planePoint(event);
    if (!point) return;
    dragRef.current = { ...drag, toX: point.x, toY: point.y };
  }, [planePoint, orbit]);

  const onPointerUp = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    if (orbit.dragging) {
      orbit.handlers.onPointerUp(event);
      return;
    }
    const canvas = canvasRef.current;
    const drag = dragRef.current;
    dragRef.current = null;
    if (!canvas || !drag) return;
    const { lens, height } = lensOf();
    const dragPixels = Math.hypot(drag.toX - drag.fromX, drag.toY - drag.fromY)
      / simPerPixelAtOrigin(pose, lens, height);
    const radius = Math.hypot(drag.fromX, drag.fromY);
    // Dropping something inside the body is not a drop. Ignore rather than integrate from there.
    if (radius > body.surfaceRadius) {
      const velocity = dragPixels < DRAG_DEADZONE_PIXELS
        ? { vx: 0, vy: 0 }
        : velocityFromDrag(drag.fromX, drag.fromY, drag.toX, drag.toY, extent);
      stateRef.current = release(drag.fromX, drag.fromY, velocity.vx, velocity.vy);
      setTick(value => value + 1);
    }
    try { canvas.releasePointerCapture(event.pointerId); } catch { /* already released */ }
  }, [lensOf, body.surfaceRadius, extent, pose, orbit]);

  const onCanvasKeyDown = useCallback((event: React.KeyboardEvent<HTMLCanvasElement>) => {
    orbit.handlers.onKeyDown(event);
  }, [orbit.handlers]);

  const figures = useMemo(() => {
    const state = stateRef.current;
    const track = state.relativistic;
    const radius = state.released ? radiusOf(track) : body.surfaceRadius;
    const speedNow = state.released ? speedOf(track) : 0;
    const escape = escapeSpeedAt(radius);
    const drift = state.released && compare
      ? Math.hypot(track.x - state.newtonian.x, track.y - state.newtonian.y)
      : 0;
    return {
      released: state.released,
      radius,
      km: toKilometres(radius, body),
      speed: speedNow,
      escape,
      ratio: escape > 0 ? speedNow / escape : 0,
      clock: staticClockRate(radius),
      properTime: state.released ? track.time : 0,
      drift,
      finished: track.finished,
      funnel: Math.abs(funnelHeight(body.surfaceRadius, extent)),
      hover: body.surfaceRadius > HORIZON_RADIUS ? hoverFieldAt(body.surfaceRadius) : Infinity,
      newtonian: newtonianFieldAt(body.surfaceRadius),
      flow: riverSpeedAt(Math.max(body.surfaceRadius, HORIZON_RADIUS)),
    };
  }, [tick, body, compare, extent]);

  const summary = useMemo(() =>
    `A Flamm funnel around ${body.label}, whose surface sits at `
    + `${body.surfaceRadius.toPrecision(PLACES)} M, seen from `
    + `${(inclination * DEGREES_PER_RADIAN).toFixed(0)} degrees above the plane. Click the canvas `
    + `to drop ${object.label.toLowerCase()} from rest, or drag before releasing to throw it; `
    + 'shift-drag or use the arrow keys to orbit the camera.',
  [body, object, inclination]);

  useEffect(() => {
    const timer = setTimeout(() => setAnnouncement(
      figures.released
        ? `Radius ${figures.radius.toPrecision(PLACES)} M. Speed ${figures.speed.toFixed(PLACES_4)} `
          + `c, which is ${(figures.ratio * PERCENT).toFixed(0)} per cent of the local escape `
          + `speed. A clock held still there runs at ${figures.clock.toFixed(PLACES_4)} of a `
          + `distant one. Proper time since release ${figures.properTime.toFixed(PLACES_2)} M.`
        : 'Nothing dropped yet.',
    ), ANNOUNCE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [figures]);

  const benchmark = useMemo(() => cycloidTime(BENCHMARK_FROM, BENCHMARK_TO), []);

  return (
    <article className="freefall sim-page">
      <header className="sim-head">
        <p className="eyebrow">Sandbox · free fall</p>
        <h1>Drop it and see.</h1>
        <p className="intro">
          One central mass, four very different bodies to put at the middle of it, and the same
          funnel around all of them. What changes from Earth to a black hole is not how deep the
          well goes — in these units it is the same well — but how far down into it the surface
          reaches. Orbit the view and watch where each surface sits.
        </p>
      </header>

      <SimStage
        simId={SIM_ID}
        panelLabel="The drop"
        /* The canvas is an input surface: a click drops something. See StageCanvas. */
        canvas={
          <StageCanvas simId={SIM_ID} dragging={orbit.dragging} clickToExpand={false}>
            {failure ? (
              <p className="stage-failure" role="alert">
                This view needs WebGL2, which this browser did not provide. {failure}
              </p>
            ) : (
              <canvas
                ref={canvasRef}
                tabIndex={0}
                role="img"
                aria-label={summary}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onKeyDown={onCanvasKeyDown}
              />
            )}
            <p className="visually-hidden" aria-live="polite">{announcement}</p>
          </StageCanvas>
        }
        permanentLabel={<>
          <p>
            <strong>Clock: the faller’s own proper time.</strong> The trajectory is integrated in
            τ, so the number counting up is what the falling object’s watch reads — not what a
            distant observer’s does, and not Schwarzschild coordinate time, which never reaches
            the horizon at all.
          </p>
          <p>
            <strong>The funnel is the exact Flamm paraboloid</strong>, z = 2√(r_s(r − r_s)),
            drawn at true vertical scale unless the exaggeration slider is moved. It is a picture
            of curved <em>space</em>, and very nearly not why anything falls. Lengths are in
            M = GM/c².
          </p>
          <p>
            <strong>River model is a coordinate choice (GP).</strong> The inward flow is the
            metric’s shift vector in Gullstrand–Painlevé slicing — exact, and not a current in
            anything: the same geometry in Schwarzschild coordinates is completely static. Ref:
            Hamilton &amp; Lisle 2008.
          </p>
        </>}
        controls={<>
          <div className="chooser" role="group" aria-label="Central body">
            {CENTRAL_BODIES.map(entry => (
              <Button
                key={entry.id}
                className={entry.id === bodyId ? 'chooser-button is-selected' : 'chooser-button'}
                onPress={() => setBodyId(entry.id)}
                aria-pressed={entry.id === bodyId}
              >
                {entry.label}
                <span>{entry.surfaceRadius.toPrecision(PLACES)} M</span>
              </Button>
            ))}
          </div>
          <p className="chooser-hint" role="status">{body.note}</p>

          <div className="chooser" role="group" aria-label="What to drop">
            {OBJECTS.map(entry => (
              <Button
                key={entry.id}
                className={entry.id === objectId ? 'chooser-button is-selected' : 'chooser-button'}
                onPress={() => setObjectId(entry.id)}
                aria-pressed={entry.id === objectId}
              >
                {entry.label}<span>{entry.note}</span>
              </Button>
            ))}
          </div>
          <p className="chooser-hint">
            All four fall identically, and that is the point rather than a shortcut: free fall does
            not depend on what is falling. The masses are there to make the equality surprising.
          </p>

          <div className="control control-switches">
            <Switch isSelected={compare} onChange={setCompare}>
              <div className="switch-indicator" aria-hidden="true" /> Compare with Newton
            </Switch>
            <p className="mode-warning" role="status">
              {compare
                ? 'Both tracks run from identical initial conditions. A straight radial drop puts '
                  + 'them exactly on top of each other — h = 0, so the correction vanishes.'
                : 'Corrected track only.'}
            </p>
            <Switch isSelected={arrows} onChange={setArrows}>
              <div className="switch-indicator" aria-hidden="true" /> Gravity field arrows
            </Switch>
            <p className={arrows ? 'mode-warning active' : 'mode-warning'} role="status">
              {arrows
                ? 'Each arrow is the PROPER acceleration needed to hover there — GM/r² divided '
                  + 'by √(1−r_s/r), which is what a scale under your feet would read. Lengths are '
                  + 'capped, because uncapped they span a factor of a hundred and the diagram '
                  + 'becomes one spike; the colour carries what the length cannot.'
                : 'Off. When on, the arrows use the proper hover acceleration rather than GM/r²: '
                  + 'the Newtonian expression stays finite at the horizon, which would draw it '
                  + 'as an ordinary place to stand.'}
            </p>
            <Switch isSelected={river} onChange={setRiver}>
              <div className="switch-indicator" aria-hidden="true" /> River model (GP)
            </Switch>
            <p className={river ? 'mode-warning active' : 'mode-warning'} role="status">
              {river
                ? 'On: markers advected inward at exactly √(r_s/r), the Gullstrand–Painlevé shift. '
                  + 'It reaches c at the horizon — that is what makes the horizon a horizon — and '
                  + 'exceeds it inside, where the surface being drawn does not extend. A '
                  + 'COORDINATE CHOICE, not a current: nothing here is flowing.'
                : 'Off. A coordinate choice, drawn as one when it is on.'}
            </p>
          </div>

          <NumberSlider
            label="Speed" value={speed} onChange={setSpeed}
            minValue={MIN_SPEED} maxValue={MAX_SPEED} step={1} unit="× M/s" places={0}
            hint="Proper time per second of wall time. The step is fixed, so the trajectory is
                  identical at every setting."
          />
          <NumberSlider
            label="Camera height" value={inclination * DEGREES_PER_RADIAN}
            onChange={degrees => setInclination(degrees / DEGREES_PER_RADIAN)}
            minValue={-MAX_INCLINATION * DEGREES_PER_RADIAN}
            maxValue={MAX_INCLINATION * DEGREES_PER_RADIAN}
            step={1} unit="°" places={0}
            hint="Degrees above the equatorial plane. Drag with shift held to orbit, scroll to
                  zoom, or use the arrow keys with the canvas focused."
          />
          <NumberSlider
            label="Camera distance" value={distanceFactor} onChange={setDistanceFactor}
            minValue={MIN_DISTANCE_FACTOR} maxValue={MAX_DISTANCE_FACTOR} step={0.1}
            unit=" frames" places={1}
            hint="As a multiple of the frame, so every central body is framed the same way
                  however many M across it is."
          />
          <NumberSlider
            label="Vertical exaggeration" value={exaggeration} onChange={setExaggeration}
            minValue={MIN_EXAGGERATION} maxValue={MAX_EXAGGERATION} step={0.5} unit="×" places={1}
            hint="1 is the true surface, and is the default: heights are in M, the same unit as
                  the plane. Anything above 1 is a drawing, not a geometry."
          />

          <div className="readout" aria-label="Measured">
            <dl>
              <div data-readout="radius">
                <dt>Radius</dt>
                <dd>
                  {figures.released ? figures.radius.toPrecision(PLACES) : '—'}
                  <span>M · {figures.km.toPrecision(PLACES)} km</span>
                </dd>
              </div>
              <div data-readout="speed">
                <dt>Speed</dt>
                <dd>
                  {figures.released ? figures.speed.toFixed(PLACES_4) : '—'}
                  <span>c · {(figures.ratio * PERCENT).toFixed(0)}% of local escape speed</span>
                </dd>
              </div>
              <div className="figure-benchmark" data-readout="clock">
                <dt>Static clock rate there</dt>
                <dd>
                  {figures.clock.toFixed(figures.clock > CLOCK_NEAR_ONE ? PLACES_9 : PLACES_4)}
                  <span>√(1 − r_s/r) — a clock held still, not the faller’s</span>
                </dd>
              </div>
              <div data-readout="propertime">
                <dt>Proper time</dt>
                <dd>
                  {figures.properTime.toFixed(PLACES_2)}
                  <span>M since release{figures.finished ? ' · arrived' : ''}</span>
                </dd>
              </div>
              <div data-readout="funnel">
                <dt>Funnel depth at the surface</dt>
                <dd>
                  {figures.funnel.toPrecision(PLACES)}
                  <span>
                    M below the frame’s edge, at true scale — the same surface for every body;
                    only where it is cut changes
                  </span>
                </dd>
              </div>
              <div data-readout="field">
                <dt>Hover acceleration at the surface</dt>
                <dd>
                  {Number.isFinite(figures.hover) ? figures.hover.toExponential(PLACES_2) : '∞'}
                  <span>
                    1/M · Newtonian GM/r² there is {figures.newtonian.toExponential(PLACES_2)},
                    and stays finite at a horizon where this does not
                  </span>
                </dd>
              </div>
              <div data-readout="flow">
                <dt>River speed at the surface</dt>
                <dd>
                  {figures.flow.toFixed(PLACES_4)}
                  <span>c · √(r_s/r), exactly 1 at a horizon</span>
                </dd>
              </div>
              <div data-readout="camera">
                <dt>Camera</dt>
                <dd>
                  {(inclination * DEGREES_PER_RADIAN).toFixed(PLACES_1)}°
                  <span>
                    above the plane · azimuth{' '}
                    {wrapDegrees(azimuth * DEGREES_PER_RADIAN).toFixed(PLACES_1)}°
                  </span>
                </dd>
              </div>
              {compare ? (
                <div data-readout="drift">
                  <dt>Newton vs corrected</dt>
                  <dd>
                    {figures.drift.toPrecision(PLACES)}
                    <span>M apart{figures.drift < IDENTICAL_TRACKS ? ' — identical: h = 0' : ''}</span>
                  </dd>
                </div>
              ) : null}
            </dl>
          </div>

          <p className="stage-help">
            <strong>Click</strong> the canvas to drop from rest · <strong>drag</strong> before
            releasing to throw — a drag across the whole frame is {FULL_DRAG_SPEED} c, so a
            circular orbit is about a tenth of that · <strong>shift-drag</strong>, the wheel or
            the arrow keys move the camera · <strong>Reset</strong> clears it.
          </p>
        </>}
      >
        <MisconceptionsPanel items={[
          {
            myth: 'A heavier planet has a deeper gravity well.',
            reality: 'Not in the units the geometry is written in. Every Schwarzschild well is '
              + 'the same well — the metric depends on r/M alone — so changing the mass rescales '
              + 'the picture and changes nothing about its shape. What differs between the Earth '
              + 'and a black hole is compactness: where the surface sits. The Earth’s is 1.4 '
              + 'billion M out, where the geometry is flat to one part in 10⁹; a black hole has '
              + 'no surface above 2 M at all.',
            figures: [
              { label: 'Earth surface', value: '1.44 × 10⁹ M' },
              { label: 'Jupiter surface', value: '5.07 × 10⁷ M' },
              { label: 'Neutron star surface', value: '5.80 M' },
              { label: 'Black hole horizon', value: 'exactly 2 M' },
            ],
          },
          {
            myth: 'The falling object’s clock runs slow, so it takes longer to arrive.',
            reality: 'Its own clock reads a perfectly ordinary, finite, rather short time — and '
              + 'that is the number counting up in the panel, because the trajectory is '
              + 'integrated in proper time. From 10 M to just outside the horizon is 33.70 M of '
              + 'it. What runs slow is a clock *held still* out there compared with a distant '
              + 'one, and what never finishes is Schwarzschild coordinate time. Three different '
              + 'clocks; only one of them is the faller’s.',
            figures: [
              { label: 'Proper time, 10 M → 2.001 M', value: '33.70 M' },
              { label: 'Coordinate time, same fall', value: '1.677× that, and still climbing' },
            ],
          },
          {
            myth: 'Turning on the relativistic correction changes how things fall.',
            reality: 'Not if they fall straight down. The correction is −3GMh²r/(c²r⁵) and h is '
              + 'the angular momentum, so for a radial drop it is identically zero and the two '
              + 'tracks lie exactly on top of each other. Better than that: Schwarzschild proper '
              + 'time and Newtonian time for a fall from rest are the *same function*, so the '
              + 'Newtonian answer is not an approximation here — it is exact. Throw the object '
              + 'sideways and the tracks separate immediately.',
          },
          {
            myth: 'Heavier things fall faster, or at least differently.',
            reality: 'All four objects in the panel follow one trajectory, and the sim only '
              + 'integrates it once. That is not a simplification: the mass of the falling body '
              + 'cancels out of its own equation of motion, in Newton and in Einstein alike. An '
              + 'apple and a space station released together stay together.',
          },
        ]} />

        <Suspense fallback={<p role="status">Loading equations…</p>}>
          <PhysicsPanel
            equation={String.raw`\ddot{\mathbf r} = -\left(\frac{GM}{r^3} + \frac{3GMh^2}{c^2r^5}\right)\mathbf r,\qquad \tau(r) = \sqrt{\frac{r_0^3}{8GM}}\,(\eta + \sin\eta)`}
            assumptions={[
              'Geometric units with M = 1, so r_s = 2 and every radius is in M = GM/c². One central mass, held fixed: the falling object is a test particle and does not move it.',
              'The trajectory is integrated in PROPER TIME with Yoshida-4, from r̈ = −V_eff′(r). The number in the panel is the faller’s own clock.',
              'The correction is §2.5’s, and with one central mass h really is conserved, so it is exact here rather than the interpolation it would be among several masses.',
              'For a radial drop h = 0 and the correction vanishes identically. Schwarzschild proper time and Newtonian time for a fall from rest are the same cycloid, so the Newtonian track is not an approximation in that case — it is the same answer.',
              'The rings are at equal proper radial separation, ∫dr/√(1−r_s/r). Their crowding is the Flamm paraboloid’s depth seen from above; nothing is exaggerated and no third dimension is invented.',
              'The static clock rate √(1−r_s/r) is the rate of a clock held at rest at that radius, relative to one at infinity. It is not the faller’s rate, which is 1 by construction.',
              'Surface radii are real: Earth and Jupiter from their measured GM and radii, a 1.4 M☉ neutron star at a representative 12 km, and a 10 M☉ black hole whose "surface" is its horizon.',
              'No rotation, no charge, no atmosphere, no tides on the falling body, and no back-reaction.',
            ]}
            sources={[
              { title: 'Misner, Thorne & Wheeler — Gravitation, §25 (radial free fall)', url: 'https://press.princeton.edu/books/hardcover/9780691177793/gravitation' },
              { title: 'Riley et al. 2021 — A NICER view of the massive pulsar PSR J0740+6620 (neutron star radii)', url: 'https://arxiv.org/abs/2105.06980' },
              { title: 'Flamm 1916 — Beiträge zur Einsteinschen Gravitationstheorie', url: 'https://ui.adsabs.harvard.edu/abs/1916PhyZ...17..448F' },
            ]}
          />
        </Suspense>

        <p className="verification-note">
          Asserted numerically: a radial drop from {BENCHMARK_FROM} M reaches {BENCHMARK_TO} M
          in{' '}
          {benchmark.toFixed(PLACES_4)} M of proper time, matching the closed-form cycloid to
          better than 0.1% — and to integration error rather than to a percentage, because a 1%
          gate on that would be a statement about the step size. The Newtonian and corrected
          tracks are asserted identical for a radial drop and measurably separated once there is
          angular momentum; the neutron star’s surface clock rate is 0.8096; and the proper-distance
          rings are asserted to spread outward monotonically, which is what the well’s depth means.
        </p>
      </SimStage>
    </article>
  );
}
