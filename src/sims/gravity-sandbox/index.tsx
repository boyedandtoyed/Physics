/** SIM G — the gravity sandbox, in three dimensions. PHYSICS_SPEC §2.6, §2.9, §2.10.
 *
 * Click to place a mass, drag before releasing to give it a velocity, right-click to remove it.
 * Newtonian N-body with Yoshida-4, an optional §2.5 correction, and optional quadrupole
 * radiation reaction — the only thing here that can make an orbit shrink.
 *
 * **The sheet is the Newtonian potential**, summed over the bodies with the exact uniform-sphere
 * interior, evaluated in the vertex shader. It is the field this sim integrates, drawn as a
 * height. It is *not* a Flamm paraboloid: that surface exists only for one Schwarzschild mass,
 * is not linear, and rises outward rather than dipping. PHYSICS_SPEC §2.9 sets out both.
 *
 * The camera orbits with shift-drag, the middle button, the wheel and the arrow keys. Plain drag
 * belongs to placement, which is what the reader came for.
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
  matricesFor,
  pickGroundPlane,
  pixelToNdc,
  projectToScreen,
  screenRadius,
  simPerPixelAtOrigin,
  type Pose,
} from '../../ui/gl/camera3d';
import { cartesianGridVertices, MAX_FABRIC_MASSES, type FabricParams } from '../../ui/gl/fabric';
import { petersMergerTime, presets, type Body } from '../../core/nbody';
import {
  FIXED_STEP,
  PALETTE,
  RESOLVED_STEPS_PER_ORBIT,
  addBody,
  advance,
  bodyNear,
  dragVertices3d,
  emptyState,
  energyDrift,
  fabricMasses,
  glowInstances,
  glyphRadiusOf,
  largestRelativisticFraction,
  noticeVertices3d,
  potentialAt,
  removeBody,
  stateFrom,
  stepsPerTightestOrbit,
  trailVertices3d,
  velocityFromDrag,
  type Band,
  type SandboxState,
} from './description/sandboxRun';
import './sandbox.css';

const PhysicsPanel = lazy(() =>
  import('../../ui/PhysicsPanel').then(module => ({ default: module.PhysicsPanel })));

const SIM_ID = 'gravity-sandbox';
const MIN_SPEED = 1;
const MAX_SPEED = 100;
const DEFAULT_SPEED = 8;
/** Camera distance, which is what "zoom" means once the view is a perspective one. */
const MIN_DISTANCE = 8;
const MAX_DISTANCE = 90;
const DEFAULT_DISTANCE = 24;
const MAX_INCLINATION = 1.45;
/** Half-width of the fabric, and how many divisions across it. The brief asks for 48. */
const FABRIC_HALF_WIDTH = 20;
const FABRIC_DIVISIONS = 48;
/** Vertical scale of the sheet, and how far down it is allowed to go. Display choices. */
const MIN_SHEET = 0;
const MAX_SHEET = 2.5;
const DEFAULT_SHEET = 0.9;
const SHEET_FLOOR = 9;
/** Depth at which a fabric line is fully the "deep" colour. */
const SHEET_DEEP_AT = 6;
const MAX_DEVICE_PIXEL_RATIO = 2;
const MILLISECONDS_PER_SECOND = 1000;
const MAX_FRAME_SECONDS = 0.05;
const ANNOUNCE_DELAY_MS = 700;
/** Right-click hit radius, in CSS pixels, so it feels the same at every zoom. */
const HIT_PIXELS = 18;
/** Below this drag length the release is treated as a plain click: placed at rest. */
const DRAG_DEADZONE_PIXELS = 4;
/** The fabric shader holds 32 masses, so placement stops there rather than silently ignoring. */
const PLACE_LIMIT = MAX_FABRIC_MASSES;
const PLACES_1 = 1;
const PLACES_2 = 2;
const PERCENT = 100;
const DEGREES_IN_HALF_TURN = 180;
const DEGREES_IN_TURN = 360;
const DEGREES_PER_RADIAN = DEGREES_IN_HALF_TURN / Math.PI;
/** The glow billboard is this many times the body's real radius; the rest is halo. */
const HALO_FACTOR = 4;
const HALO_STRENGTH = 0.5;
/** Strength of the schematic distortion, and how many holes it can act on. */
const DISTORT_STRENGTH = 0.55;
const DISTORT_HOLES = 4;
/** The inspiral preset's own numbers, so the panel quotes what the preset actually loads. */
const INSPIRAL_PRIMARY = 10;
const INSPIRAL_SECONDARY = 2;
const INSPIRAL_SEPARATION = 3;

const TRAIL_SLOW_R = 0.28;
const TRAIL_SLOW_G = 0.55;
const TRAIL_SLOW_B = 0.95;
const TRAIL_FAST_R = 0.96;
const TRAIL_FAST_G = 0.7;
const TRAIL_FAST_B = 0.18;
const TRAIL_FREE_R = 0.87;
const TRAIL_FREE_G = 0.31;
const TRAIL_FREE_B = 0.3;
const RING_R = 0.95;
const RING_G = 0.62;
const RING_B = 0.25;
const PLANET_R = 0.45;
const PLANET_G = 0.82;
const PLANET_B = 0.62;
const SATELLITE_R = 1;
const SATELLITE_G = 0.93;
const SATELLITE_B = 0.6;
const TEST_R = 0.72;
const TEST_G = 0.78;
const TEST_B = 0.85;
const GHOST_R = 0.7;
const GHOST_G = 0.72;
const GHOST_B = 0.78;
const NOTICE_R = 0.9;
const NOTICE_G = 0.4;
const NOTICE_B = 0.35;
const DARK_VOID_R = 0.02;
const DARK_VOID_G = 0.02;
const DARK_VOID_B = 0.05;
const LIGHT_VOID_R = 0.09;
const LIGHT_VOID_G = 0.09;
const LIGHT_VOID_B = 0.14;
const DARK_GRID_R = 0.32;
const DARK_GRID_G = 0.46;
const DARK_GRID_B = 0.52;
const DARK_DEEP_R = 0.55;
const DARK_DEEP_G = 0.38;
const DARK_DEEP_B = 0.72;
const LIGHT_GRID_R = 0.42;
const LIGHT_GRID_G = 0.5;
const LIGHT_GRID_B = 0.6;
const LIGHT_DEEP_R = 0.35;
const LIGHT_DEEP_G = 0.2;
const LIGHT_DEEP_B = 0.55;

const TRAIL_SLOW: Rgb = [TRAIL_SLOW_R, TRAIL_SLOW_G, TRAIL_SLOW_B];
const TRAIL_FAST: Rgb = [TRAIL_FAST_R, TRAIL_FAST_G, TRAIL_FAST_B];
const TRAIL_FREE: Rgb = [TRAIL_FREE_R, TRAIL_FREE_G, TRAIL_FREE_B];
const RING: Rgb = [RING_R, RING_G, RING_B];
const PLANET: Rgb = [PLANET_R, PLANET_G, PLANET_B];
const SATELLITE: Rgb = [SATELLITE_R, SATELLITE_G, SATELLITE_B];
const TEST: Rgb = [TEST_R, TEST_G, TEST_B];
const GHOST: Rgb = [GHOST_R, GHOST_G, GHOST_B];
const NOTICE: Rgb = [NOTICE_R, NOTICE_G, NOTICE_B];
/** The colour of "nothing is coming out of here". Not black on a light page, or it reads as ink. */
const DARK_VOID: Rgb = [DARK_VOID_R, DARK_VOID_G, DARK_VOID_B];
const LIGHT_VOID: Rgb = [LIGHT_VOID_R, LIGHT_VOID_G, LIGHT_VOID_B];
const DARK_GRID: Rgb = [DARK_GRID_R, DARK_GRID_G, DARK_GRID_B];
const DARK_DEEP: Rgb = [DARK_DEEP_R, DARK_DEEP_G, DARK_DEEP_B];
const LIGHT_GRID: Rgb = [LIGHT_GRID_R, LIGHT_GRID_G, LIGHT_GRID_B];
const LIGHT_DEEP: Rgb = [LIGHT_DEEP_R, LIGHT_DEEP_G, LIGHT_DEEP_B];

const TRAIL_COLOURS: Record<Band, Rgb> = {
  slow: TRAIL_SLOW, fast: TRAIL_FAST, unbound: TRAIL_FREE,
};
const GLYPH_COLOUR: Record<string, Rgb> = {
  planet: PLANET, hole: RING, satellite: SATELLITE, test: TEST, star: RING,
};
/** Black holes are drawn as a dark disc with a bright rim; everything else glows. */
const isHole = (kind: string): boolean => kind === 'hole';
const styleOf = (kind: string) => ({ colour: GLYPH_COLOUR[kind] ?? PLANET, rim: isHole(kind) });

/** Azimuth into [0, 360), so the readout reads as a bearing rather than as an unbounded angle. */
const wrapDegrees = (degrees: number): number =>
  ((degrees % DEGREES_IN_TURN) + DEGREES_IN_TURN) % DEGREES_IN_TURN;

const FABRIC_ALPHA = 0.9;
const NOTICE_RADIUS = 0.45;

interface Drag {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
}

export default function GravitySandbox() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<Scene3D>(null);
  const stateRef = useRef<SandboxState>(emptyState());
  const dragRef = useRef<Drag | null>(null);
  const [kind, setKind] = useState<string>('planet');
  const [relativistic, setRelativistic] = useState(false);
  const [radiation, setRadiation] = useState(false);
  const [distortion, setDistortion] = useState(false);
  const [speed, setSpeed] = useState(DEFAULT_SPEED);
  const [sheet, setSheet] = useState(DEFAULT_SHEET);
  const [pose, setPose] = useState<Pose>({
    distance: DEFAULT_DISTANCE, inclination: DEFAULT_INCLINATION, azimuth: Math.PI / 4,
  });
  const [failure, setFailure] = useState<string>();
  const [announcement, setAnnouncement] = useState('');
  const [tick, setTick] = useState(0);
  const presentation = usePresentation(SIM_ID);
  const dark = useDarkTheme();

  const palette = useMemo(() => PALETTE.find(entry => entry.kind === kind) ?? PALETTE[0]!, [kind]);
  const presetList = useMemo(() => presets(), []);

  const orbit = useOrbitControls({
    pose,
    onChange: setPose,
    limits: {
      minDistance: MIN_DISTANCE, maxDistance: MAX_DISTANCE, maxInclination: MAX_INCLINATION,
    },
  });
  useWheelZoom(canvasRef, orbit.zoomBy);

  const lensOf = useCallback(() => {
    const canvas = canvasRef.current;
    const width = Math.max(1, canvas?.clientWidth ?? 1);
    const height = Math.max(1, canvas?.clientHeight ?? 1);
    return { lens: lensFor(width / height), width, height };
  }, []);

  /** Where a pointer event lands on the equatorial plane, or null if it misses it entirely. */
  const planePoint = useCallback((event: { clientX: number; clientY: number }) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const { lens, width, height } = lensOf();
    const ndc = pixelToNdc(event.clientX - rect.left, event.clientY - rect.top, width, height);
    return pickGroundPlane(pose, lens, ndc.x, ndc.y);
  }, [lensOf, pose]);

  const loadPreset = useCallback((bodies: readonly Body[]) => {
    stateRef.current = stateFrom(bodies);
    setTick(value => value + 1);
  }, []);

  useEffect(() => {
    if (presentation.resetToken > 0) {
      stateRef.current = emptyState();
      setTick(value => value + 1);
    }
  }, [presentation.resetToken]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      const scene = new Scene3D(canvas);
      scene.setFabricMesh(cartesianGridVertices(FABRIC_HALF_WIDTH, FABRIC_DIVISIONS));
      sceneRef.current = scene;
      setFailure(undefined);
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
    }
    return () => {
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
  }, []);

  const fabricParams = useCallback((state: SandboxState): FabricParams => ({
    mode: 'potential',
    masses: fabricMasses(state),
    heightScale: sheet,
    floor: SHEET_FLOOR,
    outerRadius: FABRIC_HALF_WIDTH,
  }), [sheet]);

  useEffect(() => {
    const scene = sceneRef.current;
    const canvas = canvasRef.current;
    if (!scene || !canvas || failure) return;

    let handle = 0;
    let stopped = false;
    let previous = performance.now();

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

      // The schematic distortion acts on the black holes nearest the camera, and only on those
      // actually in front of it. It is off by default: it is a pull on finished pixels, not
      // lensing, and this repo does not ship a non-physical view as the default.
      const holes = distortion
        ? (() => {
          const matrices = matricesFor(pose, lens);
          return state.bodies
            .filter(body => body.kind === 'hole')
            .map(body => {
              const glyph = glyphRadiusOf(body.kind);
              const worldY = Math.max(
                potentialAt(state.bodies, body.x, body.y, -1) * sheet, -SHEET_FLOOR,
              );
              const screen = projectToScreen(matrices, [body.x, worldY, body.y]);
              return { ...screen, radius: screenRadius(lens, screen.depth, glyph) };
            })
            .filter(hole => !hole.behind)
            .sort((a, b) => a.depth - b.depth)
            .slice(0, DISTORT_HOLES)
            .map(hole => ({ u: hole.u, v: hole.v, radius: hole.radius }));
        })()
        : [];

      scene.beginFrame({
        pose,
        lens,
        width,
        height,
        distortion: holes.length > 0 ? { holes, strength: DISTORT_STRENGTH } : undefined,
      });
      scene.drawFabric(fabricParams(state), {
        lineColour: dark ? DARK_GRID : LIGHT_GRID,
        deepColour: dark ? DARK_DEEP : LIGHT_DEEP,
        deepAt: SHEET_DEEP_AT,
        alpha: FABRIC_ALPHA,
      });
      scene.drawLines(trailVertices3d(state, TRAIL_COLOURS, sheet, SHEET_FLOOR));
      scene.drawLines(noticeVertices3d(state, NOTICE, NOTICE_RADIUS, sheet, SHEET_FLOOR));
      const drag = dragRef.current;
      if (drag) {
        scene.drawLines(
          dragVertices3d(state, drag.fromX, drag.fromY, drag.toX, drag.toY, GHOST, sheet, SHEET_FLOOR),
        );
      }
      // Two calls, two blend modes. The glowing bodies add light to the scene; the black holes
      // take it away, and a dark disc drawn additively is not a dark disc at all.
      scene.drawGlows(
        glowInstances(state, styleOf, sheet, SHEET_FLOOR, HALO_FACTOR, k => !isHole(k)),
        HALO_STRENGTH, dark,
      );
      scene.drawGlows(
        glowInstances(state, styleOf, sheet, SHEET_FLOOR, HALO_FACTOR, isHole),
        HALO_STRENGTH, false, dark ? DARK_VOID : LIGHT_VOID,
      );
      scene.endFrame();
    };

    const step = (now: number) => {
      if (stopped) return;
      const seconds = Math.min((now - previous) / MILLISECONDS_PER_SECOND, MAX_FRAME_SECONDS);
      previous = now;
      const steps = Math.max(1, Math.round((seconds * speed) / FIXED_STEP));
      stateRef.current = advance(stateRef.current, steps, relativistic, seconds, radiation);
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
    speed, relativistic, radiation, distortion, sheet, pose, dark, failure, fabricParams,
    presentation.playing, presentation.focused,
  ]);

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Shift-drag and the middle button orbit the camera; a plain drag places a mass. Plain drag
    // belongs to placement because that is what the reader came to do, and because every
    // existing muscle memory for this sim is a left-click.
    if (event.shiftKey || event.button === 1) {
      orbit.handlers.onPointerDown(event);
      return;
    }
    const point = planePoint(event);
    if (!point) return;

    if (event.button === 2) {
      const { lens, height } = lensOf();
      const index = bodyNear(
        stateRef.current, point.x, point.y,
        HIT_PIXELS * simPerPixelAtOrigin(pose, lens, height),
      );
      if (index >= 0) {
        stateRef.current = removeBody(stateRef.current, index);
        setTick(value => value + 1);
      }
      return;
    }
    if (event.button !== 0) return;
    if (stateRef.current.bodies.length >= PLACE_LIMIT) return;
    dragRef.current = { fromX: point.x, fromY: point.y, toX: point.x, toY: point.y };
    // Capture is a convenience — it keeps the drag alive if the cursor leaves the canvas — and
    // it must never be load-bearing. It throws if the pointer is no longer active, which happens
    // with rapid clicks, and a throw here would abandon the placement before it is made.
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {
      // Dragging still works; only the off-canvas part of it is lost.
    }
  }, [planePoint, lensOf, pose, orbit.handlers]);

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
    // Release BEFORE nothing and AFTER the placement is decided: `releasePointerCapture` throws
    // NotFoundError when the browser has already released capture implicitly on pointerup, which
    // it does under rapid clicks. Called first and unguarded, it threw out of the handler and the
    // body was never added — six of fifteen rapid placements silently went missing.
    const { lens, height } = lensOf();
    const dragPixels = Math.hypot(drag.toX - drag.fromX, drag.toY - drag.fromY)
      / simPerPixelAtOrigin(pose, lens, height);
    const velocity = dragPixels < DRAG_DEADZONE_PIXELS
      ? { vx: 0, vy: 0 }
      : velocityFromDrag(drag.fromX, drag.fromY, drag.toX, drag.toY);
    stateRef.current = addBody(stateRef.current, {
      mass: palette.mass,
      x: drag.fromX,
      y: drag.fromY,
      absorbRadius: palette.absorbRadius,
      kind: palette.kind,
      ...velocity,
    });
    setTick(value => value + 1);
    try {
      canvas.releasePointerCapture(event.pointerId);
    } catch {
      // Already released by the browser. Nothing to undo.
    }
  }, [lensOf, palette, pose, orbit]);

  const figures = useMemo(() => {
    const state = stateRef.current;
    // Depth of the sheet at its lowest, which is under the heaviest thing on it. Raw potential:
    // the slider scales the drawing, not the field.
    let deepest = 0;
    for (const body of state.bodies) {
      deepest = Math.min(deepest, potentialAt(state.bodies, body.x, body.y, -1));
    }
    return {
      count: state.bodies.length,
      time: state.time,
      drift: energyDrift(state),
      fraction: largestRelativisticFraction(state),
      resolution: stepsPerTightestOrbit(state),
      notices: state.notices.length,
      deepest,
    };
    // `tick` is the dependency: the state lives in a ref so the animation loop does not
    // re-render on every frame, and this is what tells React the numbers moved.
  }, [tick]);

  const summary = useMemo(() =>
    `A three-dimensional gravity sandbox with ${figures.count} bodies, `
    + `${figures.time.toFixed(PLACES_2)} sim time units elapsed, seen from `
    + `${(pose.inclination * DEGREES_PER_RADIAN).toFixed(0)} degrees above the plane. Click the `
    + `canvas to place a ${palette.label.toLowerCase()}, drag before releasing to give it a `
    + 'velocity, right-click to remove it, shift-drag or use the arrow keys to orbit the camera.',
  [figures.count, figures.time, palette.label, pose.inclination]);

  useEffect(() => {
    const timer = setTimeout(() => setAnnouncement(
      `${figures.count} bodies. Energy drift ${(figures.drift * PERCENT).toExponential(PLACES_2)} `
      + `per cent. Largest relativistic correction `
      + `${(figures.fraction * PERCENT).toFixed(PLACES_2)} per cent of the Newtonian term.`,
    ), ANNOUNCE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [figures.count, figures.drift, figures.fraction]);

  const onCanvasKeyDown = useCallback((event: React.KeyboardEvent<HTMLCanvasElement>) => {
    orbit.handlers.onKeyDown(event);
  }, [orbit.handlers]);

  return (
    <article className="sandbox sim-page">
      <header className="sim-head">
        <p className="eyebrow">Sandbox · N-body gravity</p>
        <h1>Put something in orbit.</h1>
        <p className="intro">
          Click to drop a mass, drag before you let go to throw it. Everything pulls on everything
          else, integrated with the same symplectic scheme the Mercury sim precesses with — so
          orbits close, energy holds, and what you see is the arithmetic rather than an animation
          of it. The sheet under it all is that arithmetic too: the potential, drawn as a depth.
        </p>
      </header>

      <SimStage
        simId={SIM_ID}
        panelLabel="The sandbox"
        /* The canvas is an input surface here: a click places a mass. Click-to-expand would
           resize it under the reader mid-interaction — see StageCanvas. Expand is in the panel. */
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
                onContextMenu={event => event.preventDefault()}
              />
            )}
            <p className="visually-hidden" aria-live="polite">{announcement}</p>
          </StageCanvas>
        }
        permanentLabel={<>
          <p>
            <strong>Newtonian, with an optional post-Newtonian correction. Not a full GR
            simulation.</strong> Sim units: G = 1, and c is set only where the corrections need
            it — so there is no horizon here, and the black hole’s dark disc is a chosen
            absorption radius rather than one.
          </p>
          <p>
            <strong>The grid is the Newtonian potential, not a solution of Einstein’s
            equations.</strong> It is the exact field this sim integrates, summed over the bodies
            and drawn as a height — honest for any number of masses, because Poisson’s equation
            is linear. It is <em>not</em> a Flamm paraboloid: that surface exists only for one
            Schwarzschild mass, and no embedding diagram exists for several at all.
          </p>
        </>}
        controls={<>
          <div className="palette" role="group" aria-label="What to place">
            {PALETTE.map(entry => (
              <Button
                key={entry.kind}
                className={entry.kind === kind ? 'palette-button is-selected' : 'palette-button'}
                onPress={() => setKind(entry.kind)}
                aria-pressed={entry.kind === kind}
              >
                <span className={`palette-glyph glyph-${entry.kind}`} aria-hidden="true" />
                <span className="palette-label">{entry.label}</span>
                <span className="palette-mass">M = {entry.mass}</span>
              </Button>
            ))}
          </div>
          <p className="palette-hint" role="status">{palette.hint}</p>

          <div className="presets" role="group" aria-label="Presets">
            {presetList.map(preset => (
              <Button
                key={preset.id} className="preset-button"
                onPress={() => loadPreset(preset.bodies)}
              >{preset.label}</Button>
            ))}
            <Button
              className="preset-button"
              onPress={() => { stateRef.current = emptyState(); setTick(v => v + 1); }}
            >Clear</Button>
          </div>

          <div className="control control-switches">
            <Switch isSelected={relativistic} onChange={setRelativistic}>
              <div className="switch-indicator" aria-hidden="true" /> Post-Newtonian correction
            </Switch>
            <p className={relativistic ? 'mode-warning active' : 'mode-warning'} role="status">
              {relativistic
                ? 'On: −3Gm h²r/r⁵ per pair. Exact for one dominant mass; NOT the 1PN N-body '
                  + 'equations, which are Einstein–Infeld–Hoffmann. The energy drift below is '
                  + 'what that costs.'
                : 'Off: pure inverse-square. The force is a gradient, so Yoshida-4 holds the '
                  + 'energy to one part in 10⁸.'}
            </p>
            <Switch isSelected={radiation} onChange={setRadiation}>
              <div className="switch-indicator" aria-hidden="true" /> Gravitational radiation
            </Switch>
            <p className={radiation ? 'mode-warning active' : 'mode-warning'} role="status">
              {radiation
                ? 'On: the 2.5PN quadrupole reaction term. It takes energy OUT, so the drift '
                  + 'below goes negative and stays there — that is the orbit shrinking, not a '
                  + 'numerical fault. Inspiral at 10 and 2 masses, 3 apart: Peters gives '
                  + `${petersMergerTime(INSPIRAL_PRIMARY, INSPIRAL_SECONDARY, INSPIRAL_SEPARATION)
                    .toFixed(0)} sim units to merger.`
                : 'Off. The post-Newtonian correction alone is conservative: it precesses an '
                  + 'orbit and can never shrink it. Nothing here inspirals until this is on.'}
            </p>
            <Switch isSelected={distortion} onChange={setDistortion}>
              <div className="switch-indicator" aria-hidden="true" /> Schematic distortion
            </Switch>
            <p className={distortion ? 'mode-warning active' : 'mode-warning'} role="status">
              {distortion
                ? 'NOT PHYSICAL. A radial pull on finished pixels around each black hole, falling '
                  + 'off as 1/r. It is not lensing: no ray is traced, no photon orbit exists, and '
                  + 'nothing behind the hole is bent around it. The real calculation is two '
                  + 'routes away, in the lensing and Kerr shadow sims.'
                : 'Off, which is the default: a screen-space effect is a picture of nothing, and '
                  + 'physical is the default here.'}
            </p>
          </div>

          <NumberSlider
            label="Speed" value={speed} onChange={setSpeed}
            minValue={MIN_SPEED} maxValue={MAX_SPEED} step={1} unit="×" places={0}
            hint="Sim time per second of wall time. The step size never changes, so the physics is
                  identical at every setting — only how much of it you watch per second."
          />
          <NumberSlider
            label="Camera distance" value={pose.distance}
            onChange={distance => setPose(previous => ({ ...previous, distance }))}
            minValue={MIN_DISTANCE} maxValue={MAX_DISTANCE} step={1} unit=" units" places={0}
            hint="Drag with shift held to orbit, scroll to zoom, or use the arrow keys with the
                  canvas focused. A plain drag places a mass."
          />
          <NumberSlider
            label="Camera height" value={pose.inclination * DEGREES_PER_RADIAN}
            onChange={degrees => setPose(previous => (
              { ...previous, inclination: degrees / DEGREES_PER_RADIAN }
            ))}
            minValue={-MAX_INCLINATION * DEGREES_PER_RADIAN}
            maxValue={MAX_INCLINATION * DEGREES_PER_RADIAN}
            step={1} unit="°" places={0}
            hint="Degrees above the equatorial plane. Edge-on at zero, and the sheet's depth is
                  easiest to read from about 20 degrees."
          />
          <NumberSlider
            label="Sheet depth" value={sheet} onChange={setSheet}
            minValue={MIN_SHEET} maxValue={MAX_SHEET} step={0.05} places={2}
            hint="Vertical scale of the grid. A display choice applied after the physics: at zero
                  the sheet is flat and nothing about the motion changes."
          />

          <div className="readout" aria-label="Measured">
            <dl>
              <div data-readout="bodies">
                <dt>Bodies</dt>
                <dd>{figures.count}<span>of {PLACE_LIMIT} the sheet shader can hold</span></dd>
              </div>
              <div data-readout="time">
                <dt>Sim time</dt>
                <dd>{figures.time.toFixed(PLACES_2)}<span>units, step {FIXED_STEP.toFixed(4)}</span></dd>
              </div>
              <div data-readout="well">
                <dt>Deepest point of the sheet</dt>
                <dd>
                  {figures.deepest.toFixed(PLACES_2)}
                  <span>
                    GM/units of potential — the field, not the drawing; the depth slider scales
                    only the picture
                  </span>
                </dd>
              </div>
              <div data-readout="camera">
                <dt>Camera</dt>
                <dd>
                  {(pose.inclination * DEGREES_PER_RADIAN).toFixed(PLACES_1)}°
                  <span>
                    above the plane · azimuth{' '}
                    {wrapDegrees(pose.azimuth * DEGREES_PER_RADIAN).toFixed(PLACES_1)}°
                    {' '}· {pose.distance.toFixed(0)} units out
                  </span>
                </dd>
              </div>
              <div className="figure-benchmark" data-readout="drift">
                <dt>Energy drift</dt>
                <dd>
                  {figures.count > 0 ? figures.drift.toExponential(PLACES_2) : '—'}
                  <span>
                    {radiation
                      ? 'relative; NEGATIVE and growing is the radiation doing its job'
                      : relativistic
                        ? 'relative; the correction makes the force velocity-dependent'
                        : 'relative; symplectic, so this stays bounded'}
                  </span>
                </dd>
              </div>
              <div
                data-readout="resolution"
                className={figures.resolution < RESOLVED_STEPS_PER_ORBIT
                  ? 'figure-benchmark under-resolved' : ''}
              >
                <dt>Steps per tightest orbit</dt>
                <dd>
                  {Number.isFinite(figures.resolution)
                    ? Math.round(figures.resolution).toLocaleString()
                    : '—'}
                  <span>
                    {figures.resolution < RESOLVED_STEPS_PER_ORBIT
                      ? 'too few: the step cannot resolve that pair, and the orbit drawn is an '
                        + 'artefact of the step size'
                      : 'the step is fixed, so this is what the tightest pair gets'}
                  </span>
                </dd>
              </div>
              <div data-readout="correction">
                <dt>Largest correction</dt>
                <dd>
                  {(figures.fraction * PERCENT).toFixed(PLACES_2)}%
                  <span>3h²/r² of the Newtonian term — it grows inward</span>
                </dd>
              </div>
            </dl>
          </div>

          <p className="stage-help">
            <strong>Left-click</strong> places · <strong>drag</strong> before releasing sets the
            velocity, one unit of drag per unit of speed · <strong>right-click</strong> removes ·
            {' '}<strong>shift-drag</strong>, the middle button, the wheel or the arrow keys move
            the camera.
          </p>
        </>}
      >
        <MisconceptionsPanel items={[
          {
            myth: 'Turning on the correction makes this a general-relativistic simulation.',
            reality: 'It adds one term, −3Gm h²r/r⁵ per pair, which is §2.5’s Schwarzschild '
              + 'correction written in Cartesian form. That is exact for a test particle around '
              + 'a single dominant mass — it is what makes Mercury precess — and it is not the '
              + 'post-Newtonian N-body problem. Those are the Einstein–Infeld–Hoffmann '
              + 'equations: velocity-dependent, with three-body terms that do not decompose into '
              + 'pairs at all. With several comparable masses this term is a plausible-looking '
              + 'interpolation with nothing behind it.',
          },
          {
            myth: 'The relativistic correction matters most when things are far apart and weakly bound.',
            reality: 'Exactly backwards. Its size relative to the Newtonian term is 3h²/r², which '
              + 'for a near-circular orbit is 3GM/rc² — so it grows as you move *inward*. It is '
              + '10% at 30 M and 100% at the photon sphere, and utterly negligible far away. A '
              + 'post-Newtonian expansion is a weak-field expansion; the weak field is where it '
              + 'is trustworthy, not where it switches off. Nothing is cut off here: the number '
              + 'is displayed instead, because a discontinuous force would destroy the energy '
              + 'conservation the integrator was chosen for.',
            figures: [
              { label: 'Correction at r = 30 M', value: '10% of the Newtonian term' },
              { label: 'At r = 3 M, the photon sphere', value: '100%' },
              { label: 'At r = 1000 M', value: '0.3%' },
            ],
          },
          {
            myth: 'A test particle is just a very light one.',
            reality: 'Here it is exactly massless, and that is different in kind. Its mass '
              + 'multiplies the force it exerts, so at zero it exerts nothing at all — not a '
              + 'little, none — while still feeling the full field. Drop a hundred of them and '
              + 'they map the field without disturbing it; a hundred satellites would not.',
          },
          {
            myth: 'The post-Newtonian correction is what makes a binary spiral together.',
            reality: 'It is not, and it cannot be. That correction is conservative — it does no '
              + 'net work around a closed orbit — so it precesses an orbit and never shrinks it. '
              + 'Leave radiation off and the binary preset orbits forever however hard the '
              + 'correction is working. What shrinks an orbit is the 2.5PN quadrupole reaction '
              + 'term, which is dissipative and is the thing LIGO hears: switch it on and the '
              + 'energy drift goes negative and stays there. The sandbox asserts its circular '
              + 'limit against Peters’ 1964 closed form, which is the only reason it is here.',
            figures: [
              { label: 'Correction alone, component along v', value: 'exactly zero' },
              { label: 'Radiation, circular power', value: '−(32/5)m₁²m₂²M/c⁵a⁵' },
              { label: 'Inspiral preset, Peters merger time', value: '659 sim units' },
            ],
          },
          {
            myth: 'The grid under everything is the curvature of spacetime.',
            reality: 'It is the Newtonian potential, Φ = −ΣGM/r, drawn as a height — which is '
              + 'exactly the field this sim integrates, and honest for any number of masses '
              + 'because Poisson’s equation is linear. The famous funnel is something else: the '
              + 'Flamm paraboloid, z = 2√(r_s(r−r_s)), which is the exact embedding of ONE '
              + 'Schwarzschild mass, goes as +√r rather than −1/r, and has no multi-mass version '
              + 'at all. There is no embedding diagram of two stars, because general relativity '
              + 'is not linear. The freefall sandbox next door draws the real Flamm surface, '
              + 'because it has exactly one mass to draw it for.',
            figures: [
              { label: 'This sheet', value: 'Φ = −ΣGM/r, exact and linear' },
              { label: 'Flamm paraboloid', value: '2√(r_s(r−r_s)), one mass only' },
              { label: 'Multi-mass embedding', value: 'does not exist' },
            ],
          },
        ]} />

        <Suspense fallback={<p role="status">Loading equations…</p>}>
          <PhysicsPanel
            equation={String.raw`\ddot{\mathbf r}_i = -\sum_{j\ne i} \frac{Gm_j\,\mathbf r_{ij}}{r_{ij}^3} \;-\; \sum_{j\ne i} \frac{3Gm_j h_{ij}^2\,\mathbf r_{ij}}{r_{ij}^5}`}
            assumptions={[
              'Sim units: G = 1, masses and lengths arbitrary. c is not set, so nothing here has a horizon or a speed limit, and the black hole’s absorption radius is a display choice — 0.05 per unit mass — rather than a physical surface.',
              'Newtonian pair forces, integrated with Yoshida-4 (core/integrators/symplectic.ts) at a fixed step: a circular orbit at r = 2 around a unit mass takes exactly 512 of them. The step never changes with the speed slider.',
              'The correction’s coefficient is 3Gm. The familiar −3/2 h²r/r⁵ is PHYSICS_SPEC §2.3’s specialisation to r_s = 1, where M = 1/2; it is correct in the Schwarzschild shader and wrong by 2M anywhere else.',
              'That correction is §2.5’s massive-particle one, which rides on top of the Newtonian term. §2.3’s photon version has no Newtonian term at all, because a photon has no Newtonian limit to correct.',
              'With the correction on, h is read from the current velocities, so the force is velocity-dependent and createSymplectic’s stated contract — autonomous q″ = a(q) — no longer holds. The energy is not conserved by construction, and the drift is on screen rather than suppressed.',
              'No softening and no cutoff anywhere. A cutoff makes the force discontinuous, which destroys exactly the energy conservation a symplectic integrator is chosen for.',
              'Absorption removes a body outright. That conserves neither momentum nor energy and is a display convenience, which is why the energy reference resets when it happens.',
              'Gravitational radiation is optional and off by default. With it on, the 2.5PN quadrupole term is added per pair — exact for the two-body preset, an approximation beyond it, since radiation reaction is not additive over pairs. Its circular limit reproduces Peters 1964 exactly, which is what the tests check; the eccentric terms are carried in standard form but no published number here pins them down.',
              'No tides, no collisions other than absorption, and no relativistic time dilation between bodies.',
              'The grid is the Newtonian potential of uniform spheres, summed — PHYSICS_SPEC §2.9 — evaluated in the vertex shader from the same body positions the integrator produced. It is not a Flamm paraboloid and not a solution of Einstein’s equations. Its vertical scale is a slider and changes nothing about the motion.',
            ]}
            sources={[
              { title: 'Yoshida 1990 — Construction of higher order symplectic integrators', url: 'https://www.sciencedirect.com/science/article/abs/pii/0375960190900923' },
              { title: 'Will 2014 — The confrontation between general relativity and experiment (post-Newtonian theory)', url: 'https://link.springer.com/article/10.12942/lrr-2014-4' },
              { title: 'Hairer, Lubich & Wanner — Geometric Numerical Integration', url: 'https://link.springer.com/book/10.1007/3-540-30666-8' },
              { title: 'Peters 1964 — Gravitational radiation and the motion of two point masses', url: 'https://journals.aps.org/pr/abstract/10.1103/PhysRev.136.B1224' },
              { title: 'Chenciner & Montgomery 2000 — A remarkable periodic solution of the three-body problem', url: 'https://annals.math.princeton.edu/2000/152-3/p13' },
            ]}
          />
        </Suspense>

        <p className="verification-note">
          Asserted numerically: a circular orbit at r = 3 closes to better than 0.1% over ten
          orbits; the relative energy drift stays under 10⁻⁸ over 100 steps and over 10⁵ with the
          correction off; the Earth–Moon preset’s mass ratio is 0.0123000, built from the measured
          GM values rather than from rounded masses; and the drift with the correction on is
          asserted to be at least ten times worse, because that claim is the honest one. With
          radiation on, the circular energy-loss rate is asserted against Peters 1964 to one part
          in 10¹² at three mass ratios, the reactive force is asserted equal and opposite to
          10⁻¹⁸, and the conservative correction is asserted to have <em>exactly zero</em>
          component along the velocity — which is the statement that it cannot cause an inspiral.
          The sheet is asserted to be the same function in the shader as in the tests, and the
          camera's pixel-to-plane map is asserted against the projection that draws the frame.
        </p>
      </SimStage>
    </article>
  );
}
