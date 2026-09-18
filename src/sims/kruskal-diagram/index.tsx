/** SIM J — the Kruskal–Szekeres diagram. PHYSICS_SPEC §7.4a.
 *
 * The maximally extended Schwarzschild spacetime, all four regions, with light cones at 45°
 * everywhere. The chart is `core/kruskal`; the infalling worldline is `core/infall`, which is
 * already benchmarked and is not re-derived here.
 *
 * Radii and times are quoted in M on screen and carried in r_s underneath — a factor of two,
 * applied only in `description/diagram.ts`.
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Switch } from 'react-aria-components';
import { NumberSlider } from '../../ui/NumberSlider';
import { SimStage, StageCanvas } from '../../ui/sim/SimStage';
import { usePresentation } from '../../ui/sim/playbackStore';
import { useDarkTheme } from '../../ui/useDarkTheme';
import { MisconceptionsPanel } from '../../ui/MisconceptionsPanel';
import { LineRenderer, squareBounds, type Bounds, type Rgb } from '../../ui/gl/LineRenderer';
import { pixelToSim, type CanvasFrame } from '../../ui/gl/canvasMapping';
import { SOLAR_GEOMETRIC_LENGTH } from '../../core/units';
import {
  DEFAULT_EXTENT,
  MAX_EXTENT,
  MIN_EXTENT,
  fallDuration,
  futureConeVertices,
  horizonFraction,
  horizonVertices,
  infallWorldline,
  lightConeVertices,
  radiusGrid,
  radiusVertices,
  readEvent,
  singularityVertices,
  staticObserverVertices,
  timeGrid,
  timeVertices,
  toM,
  trackVertices,
  type EventReading,
  type FallSample,
} from './description/diagram';
import './kruskal.css';

const PhysicsPanel = lazy(() =>
  import('../../ui/PhysicsPanel').then(module => ({ default: module.PhysicsPanel })));

const SIM_ID = 'kruskal-diagram';
const CURVE_SAMPLES = 129;
const MAX_DEVICE_PIXEL_RATIO = 2;
const MILLISECONDS_PER_SECOND = 1000;
const MAX_FRAME_SECONDS = 0.05;
const ANNOUNCE_DELAY_MS = 700;
const PLACES_2 = 2;
const PLACES_3 = 3;
const PERCENT = 100;
/** Grid spacing, in M, as the brief asks. */
const RADIUS_STEP_M = 0.5;
const TIME_STEP_M = 0.5;
/** How far the constant-t lines run, in M. Beyond about 6 M of t the slope tanh(t/4M) is within
 * a per cent of 45° and the lines pile onto the horizon — a dozen translucent lines stacking
 * into an opaque one, which hid the horizon they were crowding towards. */
const TIME_SPAN_M = 6;
/** Solar masses on the M slider. The diagram does not change; only what its axes mean does. */
const MIN_MASSES = 1;
const MAX_MASSES = 100;
const DEFAULT_MASSES = 10;
const KILOMETRES_PER_METRE = 1e-3;
/** Seconds of wall time for the whole fall, at the slowest and fastest settings. */
const MIN_FALL_SECONDS = 2;
const MAX_FALL_SECONDS = 30;
const DEFAULT_FALL_SECONDS = 9;
const CONE_ARM = 0.42;
const POINT_SIZE = 9;
const OBSERVER_POINT = 11;

const GRID_R = 0.44;
const GRID_G = 0.62;
const GRID_B = 0.68;
const LIGHT_GRID_R = 0.55;
const LIGHT_GRID_G = 0.6;
const LIGHT_GRID_B = 0.66;
const TIME_R = 0.3;
const TIME_G = 0.42;
const TIME_B = 0.5;
const LIGHT_TIME_R = 0.6;
const LIGHT_TIME_G = 0.64;
const LIGHT_TIME_B = 0.7;
const HORIZON_R = 0.98;
const HORIZON_G = 0.72;
const HORIZON_B = 0.22;
const LIGHT_HORIZON_R = 0.72;
const LIGHT_HORIZON_G = 0.45;
const LIGHT_HORIZON_B = 0.02;
const SINGULARITY_R = 0.92;
const SINGULARITY_G = 0.3;
const SINGULARITY_B = 0.32;
const OBSERVER_R = 0.4;
const OBSERVER_G = 0.85;
const OBSERVER_B = 0.6;
const FALLER_R = 0.36;
const FALLER_G = 0.76;
const FALLER_B = 0.98;
const CONE_R = 0.8;
const CONE_G = 0.78;
const CONE_B = 0.4;

const GRID: Rgb = [GRID_R, GRID_G, GRID_B];
const LIGHT_GRID: Rgb = [LIGHT_GRID_R, LIGHT_GRID_G, LIGHT_GRID_B];
const TIME_LINES: Rgb = [TIME_R, TIME_G, TIME_B];
const LIGHT_TIME_LINES: Rgb = [LIGHT_TIME_R, LIGHT_TIME_G, LIGHT_TIME_B];
const HORIZON_COLOUR: Rgb = [HORIZON_R, HORIZON_G, HORIZON_B];
/** The same line, dark enough to read on a near-white page. */
const LIGHT_HORIZON_COLOUR: Rgb = [LIGHT_HORIZON_R, LIGHT_HORIZON_G, LIGHT_HORIZON_B];
const SINGULARITY: Rgb = [SINGULARITY_R, SINGULARITY_G, SINGULARITY_B];
const OBSERVER: Rgb = [OBSERVER_R, OBSERVER_G, OBSERVER_B];
const FALLER: Rgb = [FALLER_R, FALLER_G, FALLER_B];
const CONE: Rgb = [CONE_R, CONE_G, CONE_B];

const GRID_ALPHA = 0.8;
const TIME_ALPHA = 0.32;
const HORIZON_ALPHA = 1;
const CONE_FILL_ALPHA = 0.16;
const TRACK_ALPHA = 0.95;

interface Placed {
  /** Where the observer stands, in r_s. */
  radius: number;
  x: number;
  t: number;
}

export default function KruskalDiagram() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<LineRenderer>(null);
  const progressRef = useRef(0);
  const [extent, setExtent] = useState(DEFAULT_EXTENT);
  const [masses, setMasses] = useState(DEFAULT_MASSES);
  const [fallSeconds, setFallSeconds] = useState(DEFAULT_FALL_SECONDS);
  const [cones, setCones] = useState(true);
  const [observer, setObserver] = useState<Placed | null>(null);
  const [event, setEvent] = useState<EventReading | null>(null);
  const [falling, setFalling] = useState(false);
  const [failure, setFailure] = useState<string>();
  const [announcement, setAnnouncement] = useState('');
  const [tick, setTick] = useState(0);
  const presentation = usePresentation(SIM_ID);
  const dark = useDarkTheme();

  const radii = useMemo(() => radiusGrid(extent, RADIUS_STEP_M), [extent]);
  const times = useMemo(() => timeGrid(TIME_SPAN_M, TIME_STEP_M), []);
  const track = useMemo<FallSample[] | null>(
    () => (observer ? infallWorldline(observer.radius, CURVE_SAMPLES * 2) : null), [observer],
  );

  const frameOf = useCallback((): CanvasFrame => ({
    width: Math.max(1, canvasRef.current?.clientWidth ?? 1),
    height: Math.max(1, canvasRef.current?.clientHeight ?? 1),
    extent,
  }), [extent]);

  useEffect(() => {
    if (presentation.resetToken > 0) {
      setObserver(null);
      setEvent(null);
      setFalling(false);
      progressRef.current = 0;
      setTick(value => value + 1);
    }
  }, [presentation.resetToken]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      rendererRef.current = new LineRenderer(canvas, { ageFloor: 1 });
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
      renderer.beginFrame();

      for (const time of times) {
        renderer.draw(
          timeVertices(time, extent), 'lines', view, bounds,
          dark ? TIME_LINES : LIGHT_TIME_LINES, TIME_ALPHA,
        );
      }
      for (const radius of radii) {
        const regions = radius > 1
          ? (['exterior', 'parallel'] as const)
          : (['black-hole', 'white-hole'] as const);
        for (const region of regions) {
          renderer.draw(
            radiusVertices(radius, region, extent, CURVE_SAMPLES), 'strip', view, bounds,
            dark ? GRID : LIGHT_GRID, GRID_ALPHA,
          );
        }
      }
      for (const future of [true, false]) {
        renderer.draw(
          singularityVertices(extent, future), 'strip', view, bounds, SINGULARITY, 1,
        );
      }
      // Last of the grid layers, so the crowd of near-45° curves cannot paint over the two
      // lines the whole diagram is organised around.
      renderer.draw(
        horizonVertices(extent), 'lines', view, bounds,
        dark ? HORIZON_COLOUR : LIGHT_HORIZON_COLOUR, HORIZON_ALPHA,
      );

      if (observer) {
        // A hyperbola, not a vertical line: see `staticObserverVertices`.
        renderer.draw(
          staticObserverVertices(observer.radius, extent, CURVE_SAMPLES), 'strip', view, bounds,
          OBSERVER, TRACK_ALPHA,
        );
        renderer.draw(
          new Float32Array([observer.x, observer.t, 1]), 'points', view, bounds, OBSERVER, 1,
          OBSERVER_POINT * ratio,
        );
      }

      if (track) {
        const through = falling ? progressRef.current : 1;
        renderer.draw(
          trackVertices(track, through), 'strip', view, bounds, FALLER, TRACK_ALPHA,
        );
        const index = Math.min(
          track.length - 1, Math.max(0, Math.round((track.length - 1) * through)),
        );
        const head = track[index] as FallSample;
        renderer.draw(
          new Float32Array([head.x, head.t, 1]), 'points', view, bounds, FALLER, 1,
          POINT_SIZE * ratio,
        );
      }

      if (cones && event) {
        renderer.draw(
          futureConeVertices(event.x, event.t, extent * CONE_ARM), 'fan', view, bounds,
          CONE, CONE_FILL_ALPHA,
        );
        renderer.draw(
          lightConeVertices(event.x, event.t, extent * CONE_ARM), 'lines', view, bounds, CONE, 1,
        );
        renderer.draw(
          new Float32Array([event.x, event.t, 1]), 'points', view, bounds, CONE, 1,
          POINT_SIZE * ratio,
        );
      }
      renderer.endFrame();
    };

    const step = (now: number) => {
      if (stopped) return;
      const seconds = Math.min((now - previous) / MILLISECONDS_PER_SECOND, MAX_FRAME_SECONDS);
      previous = now;
      if (falling && track) {
        progressRef.current = Math.min(1, progressRef.current + seconds / fallSeconds);
        if (progressRef.current >= 1) setFalling(false);
        setTick(value => value + 1);
      }
      draw();
      handle = requestAnimationFrame(step);
    };

    draw();
    if (!presentation.playing) return () => { stopped = true; };
    previous = performance.now();
    handle = requestAnimationFrame(step);
    return () => { stopped = true; cancelAnimationFrame(handle); };
  }, [
    extent, radii, times, observer, track, falling, fallSeconds, cones, event, dark, failure,
    presentation.playing, presentation.focused,
  ]);

  const onCanvasClick = useCallback((clientX: number, clientY: number, place: boolean) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const point = pixelToSim(clientX - rect.left, clientY - rect.top, frameOf());
    const reading = readEvent(point.x, point.y);
    setEvent(reading);
    // An observer can only be placed where an observer can be: region I, outside the horizon.
    if (place && reading.region === 'exterior' && reading.radius !== null) {
      setObserver({ radius: reading.radius, x: point.x, t: point.y });
      progressRef.current = 0;
      setFalling(false);
    }
    setTick(value => value + 1);
  }, [frameOf]);

  const drop = useCallback(() => {
    if (!observer) return;
    progressRef.current = 0;
    setFalling(true);
  }, [observer]);

  const figures = useMemo(() => {
    const through = falling ? progressRef.current : 1;
    const index = track
      ? Math.min(track.length - 1, Math.max(0, Math.round((track.length - 1) * through)))
      : 0;
    const head = track?.[index] ?? null;
    return {
      head,
      through,
      duration: observer ? fallDuration(observer.radius) : 0,
      crossing: observer ? horizonFraction(observer.radius) : 0,
      schwarzschildKm: SOLAR_GEOMETRIC_LENGTH * masses * 2 * KILOMETRES_PER_METRE,
    };
  }, [tick, track, observer, falling, masses]);

  useEffect(() => {
    const timer = setTimeout(() => setAnnouncement(
      observer
        ? `Observer at ${toM(observer.radius).toFixed(PLACES_2)} M. ` + (figures.head
          ? `The faller is at ${toM(figures.head.radius).toFixed(PLACES_2)} M after `
            + `${toM(figures.head.properTime).toFixed(PLACES_2)} M of its own time.`
          : '')
        : 'No observer placed yet. Click inside region one, on the right, to place one.',
    ), ANNOUNCE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [observer, figures.head]);

  const summary = `A Kruskal–Szekeres diagram of the maximally extended Schwarzschild spacetime. `
    + `The two horizons run at 45 degrees through the centre; the jagged curves top and bottom `
    + `are the singularities. Click to read an event off the diagram, or to place a static `
    + `observer in region one on the right.`;

  return (
    <article className="kruskal sim-page">
      <header className="sim-head">
        <p className="eyebrow">Spacetime · causal structure</p>
        <h1>The chart where nothing goes wrong at the horizon.</h1>
        <p className="intro">
          Schwarzschild coordinates fall apart at r = 2M — not because the geometry does, but
          because the chart does. Kruskal–Szekeres coordinates cover the same spacetime with
          light travelling at 45° everywhere, which turns “can this event reach that one?” into
          something you read off the page with a ruler.
        </p>
      </header>

      <SimStage
        simId={SIM_ID}
        panelLabel="The diagram"
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
                onClick={clickEvent => onCanvasClick(clickEvent.clientX, clickEvent.clientY, true)}
                onContextMenu={clickEvent => {
                  clickEvent.preventDefault();
                  onCanvasClick(clickEvent.clientX, clickEvent.clientY, false);
                }}
              />
            )}
            <p className="visually-hidden" aria-live="polite">{announcement}</p>
          </StageCanvas>
        }
        permanentLabel={<>
          <p>
            <strong>Kruskal diagram of the maximally extended Schwarzschild spacetime. Regions III
            and IV are mathematical continuations — they do not connect to our universe’s
            past.</strong> A black hole that formed from collapsing matter has a star where
            region III is drawn, and no region IV at all.
          </p>
          <p>
            Axes are X and T in units of M. Light travels at exactly 45° everywhere, in every
            region — that is what the chart is for. The jagged curves are r = 0, drawn jagged
            because the geometry ends there rather than continuing to a surface.
          </p>
        </>}
        controls={<>
          <div className="control control-actions">
            <Button
              className="preset-button"
              isDisabled={!observer}
              onPress={drop}
            >Drop a test particle</Button>
            <Button
              className="preset-button"
              onPress={() => { setObserver(null); setEvent(null); setFalling(false); }}
            >Clear</Button>
          </div>
          <p className="chooser-hint" role="status">
            {observer
              ? `Observer standing at ${toM(observer.radius).toFixed(PLACES_2)} M. Their worldline `
                + 'is the hyperbola — staying put outside a horizon takes acceleration forever, '
                + 'and an eternally accelerated worldline is a hyperbola, exactly as in flat space.'
              : 'Click in region I — the right-hand wedge — to place a static observer. '
                + 'Right-click anywhere to read an event without moving the observer.'}
          </p>

          <div className="control control-switches">
            <Switch isSelected={cones} onChange={setCones}>
              <div className="switch-indicator" aria-hidden="true" /> Light cone at the last click
            </Switch>
            <p className="mode-warning" role="status">
              {cones
                ? 'The cone is 45° wherever you put it. Inside region II every future direction '
                  + 'points at the singularity — which is why it is a moment and not a place.'
                : 'Off.'}
            </p>
          </div>

          <NumberSlider
            label="Window" value={extent} onChange={setExtent}
            minValue={MIN_EXTENT} maxValue={MAX_EXTENT} step={0.2} unit=" in X, T" places={1}
            hint="X grows as √(r−2M)·e^{r/4M}, so a modest window already reaches several M. The
                  diagram cannot show large r without an enormous canvas, and that is the chart's
                  nature rather than a limitation of the drawing."
          />
          <NumberSlider
            label="Fall duration" value={fallSeconds} onChange={setFallSeconds}
            minValue={MIN_FALL_SECONDS} maxValue={MAX_FALL_SECONDS} step={1} unit=" s" places={0}
            hint="Wall-clock seconds for the animation. The trajectory is identical at every
                  setting; this only changes how fast you watch it."
          />
          <NumberSlider
            label="Black hole mass" value={masses} onChange={setMasses}
            minValue={MIN_MASSES} maxValue={MAX_MASSES} step={1} unit=" M☉" places={0}
            hint="Moves the labels, not the picture. In units of M the diagram is the same for
                  every mass — M appears only in the normalisation of X and T."
          />

          <div className="readout" aria-label="Measured">
            <dl>
              <div className="figure-benchmark" data-readout="invariance">
                <dt>Effect of the mass on the diagram</dt>
                <dd>
                  none
                  <span>
                    r_s = {figures.schwarzschildKm.toPrecision(PLACES_3)} km at {masses} M☉ —
                    the axes are in M, so the drawing is identical for every mass. That is not an
                    approximation: M cancels out of X and T when r and t are measured in M.
                  </span>
                </dd>
              </div>
              <div data-readout="event">
                <dt>Last click</dt>
                <dd>
                  {event
                    ? event.beyond
                      ? 'past r = 0'
                      : `${toM(event.radius ?? 0).toFixed(PLACES_2)} M`
                    : '—'}
                  <span>
                    {event
                      ? event.beyond
                        ? 'beyond the singularity: there is no spacetime here to have coordinates'
                        : `${regionName(event.region)} · t = ${event.time === null
                          ? 'undefined on a horizon'
                          : `${toM(event.time).toFixed(PLACES_2)} M`}`
                      : 'click the diagram'}
                  </span>
                </dd>
              </div>
              <div data-readout="observer">
                <dt>Static observer</dt>
                <dd>
                  {observer ? `${toM(observer.radius).toFixed(PLACES_2)} M` : '—'}
                  <span>a hyperbola X² − T² = const, never crossing either horizon</span>
                </dd>
              </div>
              <div data-readout="fall">
                <dt>Proper time to r = 0</dt>
                <dd>
                  {observer ? toM(figures.duration).toFixed(PLACES_2) : '—'}
                  <span>
                    {observer
                      ? `M of the faller's own clock · the horizon is `
                        + `${(figures.crossing * PERCENT).toFixed(0)}% of the way through`
                      : 'place an observer first'}
                  </span>
                </dd>
              </div>
              <div data-readout="faller">
                <dt>Faller now</dt>
                <dd>
                  {figures.head ? toM(figures.head.radius).toFixed(PLACES_3) : '—'}
                  <span>
                    {figures.head
                      ? `M · τ = ${toM(figures.head.properTime).toFixed(PLACES_2)} M · `
                        + `${figures.head.radius < 1 ? 'inside the horizon' : 'outside'}`
                      : 'not dropped yet'}
                  </span>
                </dd>
              </div>
            </dl>
          </div>
        </>}
      >
        <MisconceptionsPanel items={[
          {
            myth: 'A static observer is a vertical line on the Kruskal diagram.',
            reality: 'They are a hyperbola. Standing still means dr/dt = 0, which means UV is '
              + 'constant, which is X² − T² constant — and that is a hyperbola asymptotic to '
              + 'both horizons. It is the same curve a uniformly accelerated observer follows in '
              + 'flat Minkowski space, for exactly the same reason: hovering outside a horizon '
              + 'takes proper acceleration forever. A vertical line X = const is not a curve of '
              + 'constant r at all, and above |T| = X it is not even timelike — nothing could '
              + 'follow it.',
            figures: [
              { label: 'Static worldline', value: 'X² − T² = (r/2M − 1)e^{r/2M}' },
              { label: 'Asymptote', value: 'the horizons, at 45°' },
              { label: 'Flat-space analogue', value: 'a Rindler observer' },
            ],
          },
          {
            myth: 'The singularity is a place at the centre, so you could steer around it.',
            reality: 'Inside the horizon r = 0 is a moment, not a place. The r = const curves '
              + 'flip from spacelike to timelike as you cross — outside the horizon X² − T² is '
              + 'positive and r = const is a surface you can sit on; inside it is negative and '
              + 'r = const is an instant you pass through. Put a light cone anywhere in region '
              + 'II and every direction inside it leads to the jagged line. Steering changes how '
              + 'long you have, not whether you arrive.',
            figures: [
              { label: 'Outside, r = const', value: 'spacelike — a place' },
              { label: 'Inside, r = const', value: 'timelike — a moment' },
            ],
          },
          {
            myth: 'Regions III and IV are somewhere you could go, or somewhere we came from.',
            reality: 'They are consequences of extending the vacuum solution as far as the '
              + 'mathematics allows, which is a different question from what exists. A black '
              + 'hole made by collapse has matter where region III is drawn, and the extension '
              + 'simply does not apply there. And nothing in region I can reach region IV: the '
              + 'two exteriors are spacelike separated at every event, so the "other universe" '
              + 'is not a destination even in the idealised solution.',
          },
          {
            myth: 'The horizon is where the geometry becomes singular.',
            reality: 'Nothing is singular there and this diagram is the demonstration. The '
              + 'Kretschmann scalar at the horizon is 48M²/r⁶ = 3/4M⁴, a perfectly ordinary '
              + 'number, and the grid runs smoothly across the 45° lines. What breaks at r = 2M '
              + 'is the Schwarzschild chart — t there is a label that runs to infinity on the '
              + 'way in, which is a fact about the label.',
            figures: [
              { label: 'Kretschmann at the horizon', value: '3/4M⁴ — finite' },
              { label: 'Kretschmann at r = 0', value: 'divergent' },
            ],
          },
        ]} />

        <Suspense fallback={<p role="status">Loading equations…</p>}>
          <PhysicsPanel
            equation={String.raw`X = \sqrt{\tfrac{r}{2M}-1}\;e^{r/4M}\cosh\tfrac{t}{4M},\qquad T = \sqrt{\tfrac{r}{2M}-1}\;e^{r/4M}\sinh\tfrac{t}{4M},\qquad X^2-T^2=\left(\tfrac{r}{2M}-1\right)e^{r/2M}`}
            assumptions={[
              'Vacuum Schwarzschild, maximally extended. Geometrized units with r_s = 1 in the core, presented in M = r_s/2 on screen.',
              'Everything is computed in the null coordinates U = X − T and V = X + T, never through X and T. Near the horizon at large t the two coordinates become bitwise equal in float64, at which point X² − T² AND its factorisation (X − T)(X + T) both return exactly zero — measured at r = (1 + 10⁻⁶)r_s, t = 40 r_s/c. The fix is not a better formula in X and T; it is not forming them. PHYSICS_SPEC §7.4a.',
              'The infalling worldline is core/infall.ts, which is already benchmarked (14.4183 r_s/c from 8 r_s to the horizon). It is not re-derived here. Inside the horizon its U is taken from the invariant UV/V rather than from the Schwarzschild u, which diverges there.',
              'The areal radius is recovered as r = r_s[1 + W₀(UV/e)]. W₀ has a square-root branch point at −1/e, so near the singularity the error in r is the SQUARE ROOT of the error in UV: r = 0 comes back as 1.3×10⁻⁸ and no iteration improves it. The drawn worldline therefore stops a hair short of r = 0.',
              'The mass slider changes the labels and nothing else. With r and t measured in M, X and T contain no M at all — the diagram is literally the same picture for a stellar-mass hole and a supermassive one.',
              'Radial only. The two angular directions are suppressed, so every point on this diagram is a 2-sphere of area 4πr², and "the singularity" is the whole of that sphere shrinking to nothing.',
            ]}
            sources={[
              { title: 'Kruskal 1960 — Maximal extension of Schwarzschild metric', url: 'https://journals.aps.org/pr/abstract/10.1103/PhysRev.119.1743' },
              { title: 'Szekeres 1960 — On the singularities of a Riemannian manifold', url: 'https://link.springer.com/article/10.1007/BF00759240' },
              { title: 'Misner, Thorne & Wheeler — Gravitation, §31 (Kruskal–Szekeres)', url: 'https://press.princeton.edu/books/hardcover/9780691177793/gravitation' },
            ]}
          />
        </Suspense>

        <p className="verification-note">
          Asserted numerically: X = e and T = 0 at r = 4M, t = 0; UV = 0 on the horizon for every
          t, with the sign flipping across it; T² − X² = √e/2 = 0.8243606354 at r = M inside;
          the future singularity is UV = −1 at every t; a static observer’s X varies by more than
          a factor of two along its worldline, which is the assertion that it is not a vertical
          line; the infall crosses T = X exactly once; and the null coordinates hold full
          precision at an event where both X-based forms of X² − T² return exactly zero.
        </p>
      </SimStage>
    </article>
  );
}

function regionName(region: EventReading['region']): string {
  switch (region) {
    case 'exterior': return 'region I, our exterior';
    case 'black-hole': return 'region II, inside the horizon';
    case 'white-hole': return 'region III, the white hole';
    case 'parallel': return 'region IV, the parallel exterior';
    default: return 'on a horizon';
  }
}
