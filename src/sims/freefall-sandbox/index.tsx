/** SIM H — drop anything into a gravity well. PHYSICS_SPEC §2.5, §2.7.
 *
 * Click to drop from rest, drag to throw. One central mass, so the §2.5 correction is exact
 * rather than an interpolation, and the two tracks — Newtonian and corrected — can be run from
 * identical initial conditions and compared honestly.
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
  dashedCircleVertices,
  discVertices,
  squareBounds,
  type Bounds,
  type Rgb,
} from '../../ui/gl/LineRenderer';
import { pixelToSim, simPerPixel, type CanvasFrame } from '../../ui/gl/canvasMapping';
import {
  CENTRAL_BODIES,
  OBJECTS,
  STEP,
  advance,
  cycloidTime,
  emptyState,
  escapeSpeedAt,
  pointVertex,
  properDistanceRings,
  radiusOf,
  release,
  speedOf,
  staticClockRate,
  toKilometres,
  trailVertices,
  velocityFromDrag,
  FULL_DRAG_SPEED,
  type FreefallState,
} from './description/freefallRun';
import './freefall.css';

const PhysicsPanel = lazy(() =>
  import('../../ui/PhysicsPanel').then(module => ({ default: module.PhysicsPanel })));

const SIM_ID = 'freefall-sandbox';
const MIN_SPEED = 1;
const MAX_SPEED = 400;
const DEFAULT_SPEED = 60;
const CIRCLE_SEGMENTS = 128;
const DASH_SEGMENTS = 72;
const DISC_SEGMENTS = 64;
const RING_COUNT = 9;
const MAX_DEVICE_PIXEL_RATIO = 2;
const MILLISECONDS_PER_SECOND = 1000;
const MAX_FRAME_SECONDS = 0.05;
const TRAIL_AGE_FLOOR = 0.25;
const ANNOUNCE_DELAY_MS = 700;
const DRAG_DEADZONE_PIXELS = 4;
/** Frame half-width as a multiple of the surface radius, so every body is framed the same way. */
const FRAME_MULTIPLE = 6;
/** Minimum frame, in M — a black hole's surface is 2 M and needs room around it. */
const MIN_FRAME = 12;
const PLACES = 3;
const PLACES_2 = 2;
const PLACES_4 = 4;
const PERCENT = 100;
/** Above this a clock rate needs more than four places to say anything. */
const CLOCK_NEAR_ONE = 0.999;
const POINT_SIZE = 8;
/** Places for a clock rate so close to 1 that four would read as exactly 1. */
const PLACES_9 = 9;
/** Below this the two tracks are the same track to display precision. */
const IDENTICAL_TRACKS = 1e-9;
/** r_s in these units: M = 1, so the horizon is at 2. */
const HORIZON_RADIUS = 2;
/** The drop PHYSICS_SPEC §8 benchmarks: 10 M down to just outside the horizon. */
const BENCHMARK_FROM = 10;
const BENCHMARK_TO = 2.001;

const WELL_R = 0.42;
const WELL_G = 0.56;
const WELL_B = 0.68;
const SURFACE_FILL_R = 0.12;
const SURFACE_FILL_G = 0.12;
const SURFACE_FILL_B = 0.16;
const SURFACE_EDGE_R = 0.68;
const SURFACE_EDGE_G = 0.6;
const SURFACE_EDGE_B = 0.45;
const HORIZON_R = 0.78;
const HORIZON_G = 0.3;
const HORIZON_B = 0.3;
const GR_R = 0.35;
const GR_G = 0.78;
const GR_B = 0.95;
const NEWTON_R = 0.95;
const NEWTON_G = 0.68;
const NEWTON_B = 0.2;
const GHOST_R = 0.6;
const GHOST_G = 0.62;
const GHOST_B = 0.68;

const WELL: Rgb = [WELL_R, WELL_G, WELL_B];
const SURFACE_FILL: Rgb = [SURFACE_FILL_R, SURFACE_FILL_G, SURFACE_FILL_B];
const SURFACE_EDGE: Rgb = [SURFACE_EDGE_R, SURFACE_EDGE_G, SURFACE_EDGE_B];
const HORIZON: Rgb = [HORIZON_R, HORIZON_G, HORIZON_B];
const GR_TRACK: Rgb = [GR_R, GR_G, GR_B];
const NEWTON_TRACK: Rgb = [NEWTON_R, NEWTON_G, NEWTON_B];
const GHOST: Rgb = [GHOST_R, GHOST_G, GHOST_B];

const WELL_ALPHA = 0.85;
const TRACK_ALPHA = 0.95;

interface Drag { fromX: number; fromY: number; toX: number; toY: number }

export default function FreefallSandbox() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<LineRenderer>(null);
  const stateRef = useRef<FreefallState>(emptyState());
  const dragRef = useRef<Drag | null>(null);
  const [bodyId, setBodyId] = useState(CENTRAL_BODIES[0]!.id);
  const [objectId, setObjectId] = useState(OBJECTS[0]!.id);
  const [compare, setCompare] = useState(true);
  const [speed, setSpeed] = useState(DEFAULT_SPEED);
  const [failure, setFailure] = useState<string>();
  const [announcement, setAnnouncement] = useState('');
  const [tick, setTick] = useState(0);
  const presentation = usePresentation(SIM_ID);

  const body = useMemo(
    () => CENTRAL_BODIES.find(entry => entry.id === bodyId) ?? CENTRAL_BODIES[0]!, [bodyId]);
  const object = useMemo(
    () => OBJECTS.find(entry => entry.id === objectId) ?? OBJECTS[0]!, [objectId]);
  const extent = useMemo(
    () => Math.max(body.surfaceRadius * FRAME_MULTIPLE, MIN_FRAME), [body]);
  const rings = useMemo(
    () => properDistanceRings(body.surfaceRadius, extent, RING_COUNT), [body, extent]);

  const frameOf = useCallback((): CanvasFrame => ({
    width: Math.max(1, canvasRef.current?.clientWidth ?? 1),
    height: Math.max(1, canvasRef.current?.clientHeight ?? 1),
    extent,
  }), [extent]);

  // A trajectory integrated around one mass cannot be continued around another.
  useEffect(() => {
    stateRef.current = emptyState();
    setTick(value => value + 1);
  }, [bodyId, presentation.resetToken]);

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

      // The well: rings at equal PROPER radial separation. Their bunching towards the centre is
      // the depth of the Flamm paraboloid, seen from above, with nothing exaggerated.
      for (const radius of rings) {
        renderer.draw(
          circleVertices(radius, CIRCLE_SEGMENTS), 'loop', view, bounds, WELL, WELL_ALPHA,
        );
      }

      renderer.draw(
        discVertices(body.surfaceRadius, DISC_SEGMENTS), 'fan', view, bounds, SURFACE_FILL,
      );
      renderer.draw(
        circleVertices(body.surfaceRadius, CIRCLE_SEGMENTS), 'loop', view, bounds,
        body.id === 'black-hole' ? HORIZON : SURFACE_EDGE,
      );
      // The horizon, dashed, whenever it is not the surface itself.
      if (body.surfaceRadius > HORIZON_RADIUS) {
        renderer.draw(
          dashedCircleVertices(HORIZON_RADIUS, DASH_SEGMENTS), 'lines', view, bounds, HORIZON, WELL_ALPHA,
        );
      }

      if (state.released) {
        if (compare) {
          renderer.draw(
            trailVertices(state.newtonian.trail), 'strip', view, bounds,
            NEWTON_TRACK, TRACK_ALPHA,
          );
          renderer.draw(
            pointVertex(state.newtonian), 'points', view, bounds, NEWTON_TRACK, 1,
            POINT_SIZE * ratio,
          );
        }
        renderer.draw(
          trailVertices(state.relativistic.trail), 'strip', view, bounds, GR_TRACK, TRACK_ALPHA,
        );
        renderer.draw(
          pointVertex(state.relativistic), 'points', view, bounds, GR_TRACK, 1,
          POINT_SIZE * ratio,
        );
      }

      const drag = dragRef.current;
      if (drag) {
        renderer.draw(
          Float32Array.from([drag.fromX, drag.fromY, 1, drag.toX, drag.toY, 1]),
          'lines', view, bounds, GHOST, TRACK_ALPHA,
        );
      }
      renderer.endFrame();
    };

    const step = (now: number) => {
      if (stopped) return;
      const seconds = Math.min((now - previous) / MILLISECONDS_PER_SECOND, MAX_FRAME_SECONDS);
      previous = now;
      const steps = Math.max(1, Math.round((seconds * speed) / STEP));
      stateRef.current = advance(stateRef.current, steps, body.surfaceRadius);
      draw();
      setTick(value => value + 1);
      handle = requestAnimationFrame(step);
    };

    draw();
    if (!presentation.playing) return () => { stopped = true; };
    handle = requestAnimationFrame(step);
    return () => { stopped = true; cancelAnimationFrame(handle); };
  }, [extent, rings, body, speed, compare, failure, presentation.playing, presentation.focused]);

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || event.button !== 0) return;
    const rect = canvas.getBoundingClientRect();
    const point = pixelToSim(event.clientX - rect.left, event.clientY - rect.top, frameOf());
    dragRef.current = { fromX: point.x, fromY: point.y, toX: point.x, toY: point.y };
    try { canvas.setPointerCapture(event.pointerId); } catch { /* drag still works */ }
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
    const frame = frameOf();
    const dragPixels = Math.hypot(drag.toX - drag.fromX, drag.toY - drag.fromY)
      / simPerPixel(frame);
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
  }, [frameOf, body.surfaceRadius, extent]);

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
    };
  }, [tick, body, compare]);

  const summary = useMemo(() =>
    `A gravity well around ${body.label}, whose surface sits at `
    + `${body.surfaceRadius.toPrecision(PLACES)} M. Click the canvas to drop `
    + `${object.label.toLowerCase()} from rest, or drag before releasing to throw it.`,
  [body, object]);

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
          well around all of them. What changes from Earth to a black hole is not how deep the
          well goes — in these units it is the same well — but how far down into it the surface
          reaches.
        </p>
      </header>

      <SimStage
        simId={SIM_ID}
        panelLabel="The drop"
        /* The canvas is an input surface: a click drops something. See StageCanvas. */
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
            Lengths are in M = GM/c². The rings are at equal <em>proper</em> radial separation:
            where they crowd together, that is the depth of the well, drawn without exaggeration.
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
          </div>

          <NumberSlider
            label="Speed" value={speed} onChange={setSpeed}
            minValue={MIN_SPEED} maxValue={MAX_SPEED} step={1} unit="× M/s" places={0}
            hint="Proper time per second of wall time. The step is fixed, so the trajectory is
                  identical at every setting."
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
            circular orbit is about a tenth of that · <strong>Reset</strong> clears it. Expand is
            in this panel: a click on the canvas drops something rather than expanding.
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
