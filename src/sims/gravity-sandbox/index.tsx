/** SIM G — the gravity sandbox. PHYSICS_SPEC §2.6.
 *
 * Click to place a mass, drag before releasing to give it a velocity, right-click to remove it.
 * Newtonian N-body with Yoshida-4, and an optional §2.5 correction whose cost to the energy is
 * shown rather than hidden.
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Switch } from 'react-aria-components';
import { NumberSlider } from '../../ui/NumberSlider';
import { SimStage, StageCanvas } from '../../ui/sim/SimStage';
import { usePresentation } from '../../ui/sim/playbackStore';
import { MisconceptionsPanel } from '../../ui/MisconceptionsPanel';
import {
  LineRenderer,
  circleVertices,
  discVertices,
  squareBounds,
  type Bounds,
  type Rgb,
} from '../../ui/gl/LineRenderer';
import { presets, type Body } from '../../core/nbody';
import {
  FIXED_STEP,
  PALETTE,
  advance,
  bodyNear,
  bodyPoints,
  emptyState,
  energyDrift,
  largestRelativisticFraction,
  RESOLVED_STEPS_PER_ORBIT,
  stepsPerTightestOrbit,
  removeBody,
  addBody,
  stateFrom,
  trailBands,
  velocityFromDrag,
  type SandboxState,
} from './description/sandboxRun';
import { pixelToSim, simPerPixel, type CanvasFrame } from './view/canvasMapping';
import './sandbox.css';

const PhysicsPanel = lazy(() =>
  import('../../ui/PhysicsPanel').then(module => ({ default: module.PhysicsPanel })));

const SIM_ID = 'gravity-sandbox';
const MIN_SPEED = 1;
const MAX_SPEED = 100;
const DEFAULT_SPEED = 8;
const MIN_EXTENT = 4;
const MAX_EXTENT = 30;
const DEFAULT_EXTENT = 10;
const CIRCLE_SEGMENTS = 48;
const DISC_SEGMENTS = 40;
const MAX_DEVICE_PIXEL_RATIO = 2;
const MILLISECONDS_PER_SECOND = 1000;
const MAX_FRAME_SECONDS = 0.05;
const TRAIL_AGE_FLOOR = 0.12;
const ANNOUNCE_DELAY_MS = 700;
/** Right-click hit radius, in CSS pixels, so it feels the same at every zoom. */
const HIT_PIXELS = 18;
/** Below this drag length the release is treated as a plain click: placed at rest. */
const DRAG_DEADZONE_PIXELS = 4;
const PLACE_LIMIT = 60;
const PLACES_2 = 2;
const PERCENT = 100;

const TRAIL_SLOW_R = 0.28;
const TRAIL_SLOW_G = 0.55;
const TRAIL_SLOW_B = 0.95;
const TRAIL_FAST_R = 0.96;
const TRAIL_FAST_G = 0.7;
const TRAIL_FAST_B = 0.18;
const TRAIL_FREE_R = 0.87;
const TRAIL_FREE_G = 0.31;
const TRAIL_FREE_B = 0.3;
const HOLE_FILL_R = 0.1;
const HOLE_FILL_G = 0.04;
const HOLE_FILL_B = 0.06;
const RING_R = 0.85;
const RING_G = 0.55;
const RING_B = 0.2;
const PLANET_R = 0.45;
const PLANET_G = 0.78;
const PLANET_B = 0.6;
const SATELLITE_R = 1;
const SATELLITE_G = 0.93;
const SATELLITE_B = 0.6;
const TEST_R = 0.7;
const TEST_G = 0.75;
const TEST_B = 0.8;
const GHOST_R = 0.6;
const GHOST_G = 0.62;
const GHOST_B = 0.68;

const TRAIL_SLOW: Rgb = [TRAIL_SLOW_R, TRAIL_SLOW_G, TRAIL_SLOW_B];
const TRAIL_FAST: Rgb = [TRAIL_FAST_R, TRAIL_FAST_G, TRAIL_FAST_B];
const TRAIL_FREE: Rgb = [TRAIL_FREE_R, TRAIL_FREE_G, TRAIL_FREE_B];
const HOLE_FILL: Rgb = [HOLE_FILL_R, HOLE_FILL_G, HOLE_FILL_B];
const RING: Rgb = [RING_R, RING_G, RING_B];
const PLANET: Rgb = [PLANET_R, PLANET_G, PLANET_B];
const SATELLITE: Rgb = [SATELLITE_R, SATELLITE_G, SATELLITE_B];
const TEST: Rgb = [TEST_R, TEST_G, TEST_B];
const GHOST: Rgb = [GHOST_R, GHOST_G, GHOST_B];

const GLYPH_COLOUR: Record<string, Rgb> = {
  planet: PLANET, hole: RING, satellite: SATELLITE, test: TEST, star: RING,
};
/** Glyph sizes in device pixels. Ordered by mass, so the palette reads as a scale. */
const PLANET_POINT = 9;
const HOLE_POINT = 14;
const SATELLITE_POINT = 5;
const TEST_POINT = 4;
const STAR_POINT = 16;
const DEFAULT_POINT = 8;
const POINT_SIZE: Record<string, number> = {
  planet: PLANET_POINT, hole: HOLE_POINT, satellite: SATELLITE_POINT,
  test: TEST_POINT, star: STAR_POINT,
};
const TRAIL_ALPHA = 0.9;
const GLYPH_ALPHA = 1;
const GHOST_ALPHA = 0.8;

interface Drag {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
}

export default function GravitySandbox() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<LineRenderer>(null);
  const stateRef = useRef<SandboxState>(emptyState());
  const dragRef = useRef<Drag | null>(null);
  const [kind, setKind] = useState<string>('planet');
  const [relativistic, setRelativistic] = useState(false);
  const [speed, setSpeed] = useState(DEFAULT_SPEED);
  const [extent, setExtent] = useState(DEFAULT_EXTENT);
  const [failure, setFailure] = useState<string>();
  const [announcement, setAnnouncement] = useState('');
  const [tick, setTick] = useState(0);
  const presentation = usePresentation(SIM_ID);

  const palette = useMemo(() => PALETTE.find(entry => entry.kind === kind) ?? PALETTE[0]!, [kind]);
  const presetList = useMemo(() => presets(), []);

  const frameOf = useCallback((): CanvasFrame => {
    const canvas = canvasRef.current;
    return {
      width: Math.max(1, canvas?.clientWidth ?? 1),
      height: Math.max(1, canvas?.clientHeight ?? 1),
      extent,
    };
  }, [extent]);

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
      rendererRef.current = new LineRenderer(canvas, { ageFloor: TRAIL_AGE_FLOOR });
      setFailure(undefined);
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
    }
    return () => {
      rendererRef.current?.dispose();
      rendererRef.current = null;
    };
  }, []);

  useEffect(() => {
    const renderer = rendererRef.current;
    const canvas = canvasRef.current;
    if (!renderer || !canvas || failure) return;

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
      const view = { x: 0, y: 0, width: 1, height: 1 };
      const bounds: Bounds = squareBounds(extent, width, height, view);
      const state = stateRef.current;

      renderer.beginFrame();

      const bands = trailBands(state);
      renderer.draw(bands.slow, 'lines', view, bounds, TRAIL_SLOW, TRAIL_ALPHA);
      renderer.draw(bands.fast, 'lines', view, bounds, TRAIL_FAST, TRAIL_ALPHA);
      renderer.draw(bands.unbound, 'lines', view, bounds, TRAIL_FREE, TRAIL_ALPHA);

      // Black holes get a filled disc and a ring, so they read as something light does not leave.
      for (const body of state.bodies) {
        if (body.kind !== 'hole' && body.kind !== 'star') continue;
        renderer.draw(
          discVertices(body.absorbRadius, DISC_SEGMENTS), 'fan', view,
          { minX: bounds.minX - body.x, minY: bounds.minY - body.y,
            maxX: bounds.maxX - body.x, maxY: bounds.maxY - body.y },
          HOLE_FILL,
        );
        renderer.draw(
          circleVertices(body.absorbRadius, CIRCLE_SEGMENTS), 'loop', view,
          { minX: bounds.minX - body.x, minY: bounds.minY - body.y,
            maxX: bounds.maxX - body.x, maxY: bounds.maxY - body.y },
          RING,
        );
      }

      for (const entry of PALETTE) {
        const points = bodyPoints(state, entry.kind);
        if (points.length === 0) continue;
        renderer.draw(
          points, 'points', view, bounds, GLYPH_COLOUR[entry.kind] ?? PLANET, GLYPH_ALPHA,
          (POINT_SIZE[entry.kind] ?? DEFAULT_POINT) * ratio,
        );
      }
      const stars = bodyPoints(state, 'star');
      if (stars.length > 0) {
        renderer.draw(stars, 'points', view, bounds, RING, GLYPH_ALPHA, STAR_POINT * ratio);
      }

      const drag = dragRef.current;
      if (drag) {
        renderer.draw(
          Float32Array.from([drag.fromX, drag.fromY, 1, drag.toX, drag.toY, 1]),
          'lines', view, bounds, GHOST, GHOST_ALPHA,
        );
        renderer.draw(
          Float32Array.from([drag.fromX, drag.fromY, 1]), 'points', view, bounds,
          GHOST, GHOST_ALPHA, (POINT_SIZE[kind] ?? DEFAULT_POINT) * ratio,
        );
      }

      renderer.endFrame();
    };

    const step = (now: number) => {
      if (stopped) return;
      const seconds = Math.min((now - previous) / MILLISECONDS_PER_SECOND, MAX_FRAME_SECONDS);
      previous = now;
      const steps = Math.max(1, Math.round((seconds * speed) / FIXED_STEP));
      stateRef.current = advance(stateRef.current, steps, relativistic, seconds);
      draw();
      setTick(value => value + 1);
      handle = requestAnimationFrame(step);
    };

    draw();
    // Paused means the GPU and the integrator both go idle, not that a static picture is redrawn.
    if (!presentation.playing) return () => { stopped = true; };
    handle = requestAnimationFrame(step);
    return () => { stopped = true; cancelAnimationFrame(handle); };
  }, [extent, speed, relativistic, failure, kind, presentation.playing, presentation.focused]);

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const frame = frameOf();
    const point = pixelToSim(event.clientX - rect.left, event.clientY - rect.top, frame);

    if (event.button === 2) {
      const index = bodyNear(stateRef.current, point.x, point.y, HIT_PIXELS * simPerPixel(frame));
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
  }, [frameOf]);

  const onPointerMove = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const drag = dragRef.current;
    if (!canvas || !drag) return;
    const rect = canvas.getBoundingClientRect();
    const point = pixelToSim(event.clientX - rect.left, event.clientY - rect.top, frameOf());
    dragRef.current = { ...drag, toX: point.x, toY: point.y };
  }, [frameOf]);

  const onPointerUp = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const drag = dragRef.current;
    dragRef.current = null;
    if (!canvas || !drag) return;
    // Release BEFORE nothing and AFTER the placement is decided: `releasePointerCapture` throws
    // NotFoundError when the browser has already released capture implicitly on pointerup, which
    // it does under rapid clicks. Called first and unguarded, it threw out of the handler and the
    // body was never added — six of fifteen rapid placements silently went missing.
    const frame = frameOf();
    const dragPixels = Math.hypot(drag.toX - drag.fromX, drag.toY - drag.fromY)
      / simPerPixel(frame);
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
  }, [frameOf, palette]);

  const figures = useMemo(() => {
    const state = stateRef.current;
    return {
      count: state.bodies.length,
      time: state.time,
      drift: energyDrift(state),
      fraction: largestRelativisticFraction(state),
      resolution: stepsPerTightestOrbit(state),
      notices: state.notices.length,
    };
    // `tick` is the dependency: the state lives in a ref so the animation loop does not
    // re-render on every frame, and this is what tells React the numbers moved.
  }, [tick]);

  const summary = useMemo(() =>
    `A gravity sandbox with ${figures.count} bodies, `
    + `${figures.time.toFixed(PLACES_2)} sim time units elapsed. Click the canvas to place a `
    + `${palette.label.toLowerCase()}, drag before releasing to give it a velocity, right-click `
    + 'to remove it.', [figures.count, figures.time, palette.label]);

  useEffect(() => {
    const timer = setTimeout(() => setAnnouncement(
      `${figures.count} bodies. Energy drift ${(figures.drift * PERCENT).toExponential(PLACES_2)} `
      + `per cent. Largest relativistic correction `
      + `${(figures.fraction * PERCENT).toFixed(PLACES_2)} per cent of the Newtonian term.`,
    ), ANNOUNCE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [figures.count, figures.drift, figures.fraction]);

  return (
    <article className="sandbox sim-page">
      <header className="sim-head">
        <p className="eyebrow">Sandbox · N-body gravity</p>
        <h1>Put something in orbit.</h1>
        <p className="intro">
          Click to drop a mass, drag before you let go to throw it. Everything pulls on everything
          else, integrated with the same symplectic scheme the Mercury sim precesses with — so
          orbits close, energy holds, and what you see is the arithmetic rather than an animation
          of it.
        </p>
      </header>

      <SimStage
        simId={SIM_ID}
        panelLabel="The sandbox"
        /* The canvas is an input surface here: a click places a mass. Click-to-expand would
           resize it under the reader mid-interaction — see StageCanvas. Expand is in the panel. */
        canvas={
          <StageCanvas simId={SIM_ID} dragging={false} clickToExpand={false}>
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
                onContextMenu={event => event.preventDefault()}
              />
            )}
            <p className="visually-hidden" aria-live="polite">{announcement}</p>
          </StageCanvas>
        }
        permanentLabel={
          <p>
            <strong>Newtonian, with an optional post-Newtonian correction. Not a full GR
            simulation.</strong> Sim units: G = 1, and c is not set at all — so there is no
            horizon here, and the black hole’s dark disc is a chosen absorption radius rather
            than one.
          </p>
        }
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
          </div>

          <NumberSlider
            label="Speed" value={speed} onChange={setSpeed}
            minValue={MIN_SPEED} maxValue={MAX_SPEED} step={1} unit="×" places={0}
            hint="Sim time per second of wall time. The step size never changes, so the physics is
                  identical at every setting — only how much of it you watch per second."
          />
          <NumberSlider
            label="Zoom" value={extent} onChange={setExtent}
            minValue={MIN_EXTENT} maxValue={MAX_EXTENT} step={0.5} unit=" units" places={1}
            hint="Half-width of the view, in sim units."
          />

          <div className="readout" aria-label="Measured">
            <dl>
              <div data-readout="bodies">
                <dt>Bodies</dt>
                <dd>{figures.count}<span>of {PLACE_LIMIT} allowed</span></dd>
              </div>
              <div data-readout="time">
                <dt>Sim time</dt>
                <dd>{figures.time.toFixed(PLACES_2)}<span>units, step {FIXED_STEP.toFixed(4)}</span></dd>
              </div>
              <div className="figure-benchmark" data-readout="drift">
                <dt>Energy drift</dt>
                <dd>
                  {figures.count > 0 ? figures.drift.toExponential(PLACES_2) : '—'}
                  <span>
                    {relativistic
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
            velocity, one unit of drag per unit of speed · <strong>right-click</strong> removes.
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
            myth: 'The binary black holes should spiral together.',
            reality: 'They would, in general relativity: a binary radiates gravitational waves '
              + 'and the orbit shrinks — that is what LIGO hears. There is no radiation in this '
              + 'sandbox, Newtonian or corrected, so the preset orbits forever. The correction '
              + 'term produces precession, not inspiral.',
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
              'No gravitational radiation, no tides, no collisions other than absorption, and no relativistic time dilation between bodies.',
            ]}
            sources={[
              { title: 'Yoshida 1990 — Construction of higher order symplectic integrators', url: 'https://www.sciencedirect.com/science/article/abs/pii/0375960190900923' },
              { title: 'Will 2014 — The confrontation between general relativity and experiment (post-Newtonian theory)', url: 'https://link.springer.com/article/10.12942/lrr-2014-4' },
              { title: 'Hairer, Lubich & Wanner — Geometric Numerical Integration', url: 'https://link.springer.com/book/10.1007/3-540-30666-8' },
            ]}
          />
        </Suspense>

        <p className="verification-note">
          Asserted numerically: a circular orbit at r = 3 closes to better than 0.1% over ten
          orbits; the relative energy drift stays under 10⁻⁸ over 100 steps and over 10⁵ with the
          correction off; the Earth–Moon preset’s mass ratio is 0.0123000, built from the measured
          GM values rather than from rounded masses; and the drift with the correction on is
          asserted to be at least ten times worse, because that claim is the honest one.
        </p>
      </SimStage>
    </article>
  );
}
