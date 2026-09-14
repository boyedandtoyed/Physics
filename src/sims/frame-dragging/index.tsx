/** SIM E — frame dragging: the ZAMO field, the ergosphere, and what it forbids. PHYSICS_SPEC §3.5.
 *
 * Two viewports, because the ergosphere has two shapes and only one of them is an ellipse:
 *
 * - **left, the equatorial plane from above**, where the ergosphere boundary is a *circle* of
 *   radius exactly 2M at every spin, and where the dragging is visible;
 * - **right, a cut containing the spin axis**, which is the only view the oblateness exists in.
 *
 * The markers are carried round at ω(r). The fans are the stronger statement: they are the range
 * of dφ/dt a worldline can have, and inside the ergosphere that range excludes zero.
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  squeezeForPanel,
  type Bounds,
  type Rgb,
  type Viewport,
} from '../../ui/gl/LineRenderer';
import {
  EQUATORIAL_ERGOSPHERE_RADIUS,
  MAX_SPIN,
  angularVelocityRange,
  horizonAngularVelocity,
  horizonRadii,
  omegaZamo,
} from '../../core/kerr';
import {
  advanceFaller,
  fanVertices,
  lightConeFans,
  markerHeadVertices,
  markerVertices,
  meridionalErgosphere,
  releaseFaller,
  staticTickVertices,
  trailVertices,
  type Faller,
} from './description/dragField';
import './frameDragging.css';

const PhysicsPanel = lazy(() =>
  import('../../ui/PhysicsPanel').then(module => ({ default: module.PhysicsPanel })));

const SIM_ID = 'frame-dragging';
const MIN_SPIN = 0;
const SPIN_STEP = 0.002;
const SPIN_PLACES = 3;
const DEFAULT_SPIN = 0.9;
const MIN_EDGE = 4;
const MAX_EDGE = 30;
const DEFAULT_EDGE = 6;
const MIN_RELEASE = 3;
const MAX_RELEASE = 20;
const DEFAULT_RELEASE = 5;
const MIN_RATE = 0.25;
const MAX_RATE = 8;
const DEFAULT_RATE = 2;
const PLACES = 3;
const PLACES_2 = 2;

const CIRCLE_SEGMENTS = 160;
const DASH_SEGMENTS = 96;
const DISC_SEGMENTS = 96;
const FAN_SEGMENTS = 24;
const MERIDIONAL_SEGMENTS = 240;
/** Coordinate time the light-cone fans span. Wide enough to read, short enough to stay a wedge. */
const FAN_SPAN = 2.2;
/** Arrow length at the innermost ring, as a fraction of the frame. Lengths are scaled to that
 *  ring's ω, so an arrow's length is ω(r)/ω(r_inner) — the differential dragging is the point,
 *  and an absolute scale puts every arrow outside 3 M below a pixel. */
const ARROW_SCALE = 0.11;
const TRAIL_LENGTH = 900;
const MAX_DEVICE_PIXEL_RATIO = 2;
const ANNOUNCE_DELAY_MS = 600;
/** Seconds of wall time per M of coordinate time, at rate 1. */
const SECONDS_PER_M = 0.09;
const MAX_FRAME_SECONDS = 0.05;
const MILLISECONDS_PER_SECOND = 1000;
/** Alpha of the oldest trail sample. The wind-up IS the picture, so the whole path must read. */
const TRAIL_AGE_FLOOR = 0.18;
/** Radii the readout samples either side of the static limit, to state the prohibition. */
const JUST_INSIDE = 0.95;
const JUST_OUTSIDE = 1.05;
const PANEL_REM = 21;
const PANEL_VW_FRACTION = 0.42;
const REM_PX = 16;

/** Viewport rectangles, as fractions of the canvas from the bottom-left. The equatorial view
 *  takes the majority: it is the picture, and the meridional cut is the caption. */
const EQ_X = 0.03;
const EQ_Y = 0.08;
const EQ_W = 0.52;
const EQ_H = 0.86;
const MER_X = 0.61;
const MER_W = 0.36;
const STACK_X = 0.06;
const STACK_W = 0.88;
const STACK_H = 0.44;
const STACK_TOP_Y = 0.53;
const STACK_BOTTOM_Y = 0.04;
/** Half-extent of the meridional frame, in M, as a multiple of the 2M ergosphere: enough margin
 *  that the oblate boundary is not drawn against the frame edge. */
const MERIDIONAL_MARGIN = 1.6;
const MERIDIONAL_EXTENT = EQUATORIAL_ERGOSPHERE_RADIUS * MERIDIONAL_MARGIN;

const EQUATORIAL_VIEW: Viewport = { x: EQ_X, y: EQ_Y, width: EQ_W, height: EQ_H };
const MERIDIONAL_VIEW: Viewport = { x: MER_X, y: EQ_Y, width: MER_W, height: EQ_H };
const STACKED_EQUATORIAL: Viewport =
  { x: STACK_X, y: STACK_TOP_Y, width: STACK_W, height: STACK_H };
const STACKED_MERIDIONAL: Viewport =
  { x: STACK_X, y: STACK_BOTTOM_Y, width: STACK_W, height: STACK_H };
/** Below this CANVAS width the two views stack instead of sitting side by side. It is the canvas,
 *  not the window: at a 1440 px window the side panel leaves about 800 px here, and a 900 px
 *  breakpoint stacked the views on a desktop. */
const NARROW_BREAKPOINT = 620;

/** Linear-RGB palette. Named per channel, like every other number in this repo: the band edges
 *  these colours mark are physical, so none of them is tuned inline. */
const DARK_MARKER_R = 0.45;
const DARK_MARKER_G = 0.72;
const DARK_MARKER_B = 0.98;
const LIGHT_MARKER_R = 0.13;
const LIGHT_MARKER_G = 0.38;
const LIGHT_MARKER_B = 0.72;
const DARK_FAN_R = 0.95;
const DARK_FAN_G = 0.68;
const DARK_FAN_B = 0.15;
const LIGHT_FAN_R = 0.78;
const LIGHT_FAN_G = 0.45;
const LIGHT_FAN_B = 0.05;
const FORBIDDEN_R = 0.85;
const FORBIDDEN_G = 0.3;
const FORBIDDEN_B = 0.3;
const HORIZON_FILL_R = 0.16;
const HORIZON_FILL_G = 0.05;
const HORIZON_FILL_B = 0.06;
const HORIZON_EDGE_R = 0.72;
const HORIZON_EDGE_G = 0.28;
const HORIZON_EDGE_B = 0.28;
const ERGO_DARK_R = 0.62;
const ERGO_DARK_G = 0.82;
const ERGO_DARK_B = 0.72;
const ERGO_LIGHT_R = 0.12;
const ERGO_LIGHT_G = 0.42;
const ERGO_LIGHT_B = 0.3;
const FALLER_LIGHT_R = 0.1;
const FALLER_LIGHT_G = 0.1;
const FALLER_LIGHT_B = 0.12;

const DARK_MARKER: Rgb = [DARK_MARKER_R, DARK_MARKER_G, DARK_MARKER_B];
const LIGHT_MARKER: Rgb = [LIGHT_MARKER_R, LIGHT_MARKER_G, LIGHT_MARKER_B];
const DARK_FAN: Rgb = [DARK_FAN_R, DARK_FAN_G, DARK_FAN_B];
const LIGHT_FAN: Rgb = [LIGHT_FAN_R, LIGHT_FAN_G, LIGHT_FAN_B];
/** Drawn where the wedge excludes zero, i.e. where standing still is not one of the options. */
const FORBIDDEN_FAN: Rgb = [FORBIDDEN_R, FORBIDDEN_G, FORBIDDEN_B];
const HORIZON_FILL: Rgb = [HORIZON_FILL_R, HORIZON_FILL_G, HORIZON_FILL_B];
const HORIZON_EDGE: Rgb = [HORIZON_EDGE_R, HORIZON_EDGE_G, HORIZON_EDGE_B];
const ERGO_DARK: Rgb = [ERGO_DARK_R, ERGO_DARK_G, ERGO_DARK_B];
const ERGO_LIGHT: Rgb = [ERGO_LIGHT_R, ERGO_LIGHT_G, ERGO_LIGHT_B];
const FALLER_DARK: Rgb = [1, 1, 1];
const FALLER_LIGHT: Rgb = [FALLER_LIGHT_R, FALLER_LIGHT_G, FALLER_LIGHT_B];

const FAN_ALPHA = 0.9;
const STATIC_TICK_ALPHA = 0.55;
const MARKER_ALPHA = 0.95;
const ERGO_ALPHA = 0.95;
const TRAIL_ALPHA = 0.9;
const POINT_SIZE = 7;
const MARKER_POINT_SIZE = 2.6;

interface Controls {
  spin: number;
  outerEdge: number;
  releaseRadius: number;
  rate: number;
}

const INITIAL: Controls = {
  spin: DEFAULT_SPIN,
  outerEdge: DEFAULT_EDGE,
  releaseRadius: DEFAULT_RELEASE,
  rate: DEFAULT_RATE,
};

function useDarkTheme(): boolean {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const read = () => {
      const attribute = document.documentElement.dataset.theme;
      setDark(attribute
        ? attribute === 'dark'
        : window.matchMedia('(prefers-color-scheme: dark)').matches);
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    query.addEventListener('change', read);
    return () => { observer.disconnect(); query.removeEventListener('change', read); };
  }, []);
  return dark;
}

export default function FrameDragging() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<LineRenderer>(null);
  const fallerRef = useRef<Faller>(releaseFaller(DEFAULT_RELEASE));
  const trailRef = useRef<Faller[]>([]);
  const timeRef = useRef(0);
  const [controls, setControls] = useState<Controls>(INITIAL);
  const [failure, setFailure] = useState<string>();
  const [announcement, setAnnouncement] = useState('');
  const [swept, setSwept] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [plunged, setPlunged] = useState(false);
  const presentation = usePresentation(SIM_ID);
  const dark = useDarkTheme();

  const { spin, outerEdge, releaseRadius, rate } = controls;
  const horizon = useMemo(() => horizonRadii(spin), [spin]);

  const set = useCallback(<K extends keyof Controls>(key: K, value: Controls[K]) => {
    setControls(previous => ({ ...previous, [key]: value }));
  }, []);

  // Any change to the geometry or the release point restarts the faller: a trajectory integrated
  // in one spacetime cannot be continued in another.
  useEffect(() => {
    fallerRef.current = releaseFaller(releaseRadius);
    trailRef.current = [];
    timeRef.current = 0;
    setSwept(0);
    setElapsed(0);
    setPlunged(false);
  }, [spin, releaseRadius, presentation.resetToken]);

  useEffect(() => {
    if (presentation.resetToken > 0) setControls(INITIAL);
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

    const markerColour = dark ? DARK_MARKER : LIGHT_MARKER;
    const fanColour = dark ? DARK_FAN : LIGHT_FAN;
    const ergoColour = dark ? ERGO_DARK : ERGO_LIGHT;
    const fallerColour = dark ? FALLER_DARK : FALLER_LIGHT;

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

      const narrow = canvas.clientWidth < NARROW_BREAKPOINT;
      const panelWidth = presentation.focused
        ? Math.min(PANEL_REM * REM_PX, window.innerWidth * PANEL_VW_FRACTION)
        : 0;
      let equatorial = narrow ? STACKED_EQUATORIAL : EQUATORIAL_VIEW;
      let meridional = narrow ? STACKED_MERIDIONAL : MERIDIONAL_VIEW;
      if (!narrow) {
        equatorial = squeezeForPanel(equatorial, canvas.clientWidth, panelWidth);
        meridional = squeezeForPanel(meridional, canvas.clientWidth, panelWidth);
      }
      const equatorialBounds: Bounds = squareBounds(outerEdge, width, height, equatorial);
      const meridionalBounds: Bounds = squareBounds(
        MERIDIONAL_EXTENT, width, height, meridional,
      );

      renderer.beginFrame();

      // --- the equatorial plane, from above ---------------------------------------------------
      // The horizon first: it is the floor of this picture, and the innermost light-cone band
      // overlaps it. Drawn last, the disc covered exactly the band that carries the point.
      renderer.draw(
        discVertices(horizon.outer, DISC_SEGMENTS), 'fan', equatorial, equatorialBounds,
        HORIZON_FILL,
      );
      renderer.draw(
        circleVertices(horizon.outer, CIRCLE_SEGMENTS), 'loop', equatorial, equatorialBounds,
        HORIZON_EDGE,
      );
      // The ergosphere: a DASHED circle, because nothing stops at it. Exactly 2M, every spin.
      renderer.draw(
        dashedCircleVertices(EQUATORIAL_ERGOSPHERE_RADIUS, DASH_SEGMENTS),
        'lines', equatorial, equatorialBounds, ergoColour, ERGO_ALPHA,
      );

      const fans = lightConeFans({ spin, outerEdge, time: timeRef.current }, FAN_SPAN);
      for (const fan of fans) {
        renderer.draw(
          fanVertices(fan, FAN_SEGMENTS), 'loop', equatorial, equatorialBounds,
          fan.staticAllowed ? fanColour : FORBIDDEN_FAN, FAN_ALPHA,
        );
      }
      // The tick each band is judged against: where "hold φ fixed" would put you.
      renderer.draw(
        staticTickVertices(fans), 'lines', equatorial, equatorialBounds,
        fanColour, STATIC_TICK_ALPHA,
      );

      const field = { spin, outerEdge, time: timeRef.current };
      renderer.draw(
        markerVertices(field, ARROW_SCALE), 'lines', equatorial, equatorialBounds,
        markerColour, MARKER_ALPHA,
      );
      renderer.draw(
        markerHeadVertices(field), 'points', equatorial, equatorialBounds,
        markerColour, MARKER_ALPHA, MARKER_POINT_SIZE * ratio,
      );

      const trail = trailRef.current;
      if (trail.length > 1) {
        renderer.draw(
          trailVertices(trail), 'strip', equatorial, equatorialBounds, fallerColour, TRAIL_ALPHA,
        );
      }
      const faller = fallerRef.current;
      renderer.draw(
        new Float32Array([
          faller.radius * Math.cos(faller.angle), faller.radius * Math.sin(faller.angle), 1,
        ]),
        'points', equatorial, equatorialBounds, fallerColour, 1, POINT_SIZE * ratio,
      );

      // --- the meridional cut: the only view the oblateness exists in -------------------------
      renderer.draw(
        discVertices(horizon.outer, DISC_SEGMENTS), 'fan', meridional, meridionalBounds,
        HORIZON_FILL,
      );
      renderer.draw(
        circleVertices(horizon.outer, CIRCLE_SEGMENTS), 'loop', meridional, meridionalBounds,
        HORIZON_EDGE,
      );
      renderer.draw(
        meridionalErgosphere(spin, MERIDIONAL_SEGMENTS), 'loop', meridional, meridionalBounds,
        ergoColour, ERGO_ALPHA,
      );

      renderer.endFrame();
    };

    const step = (now: number) => {
      if (stopped) return;
      const seconds = Math.min((now - previous) / MILLISECONDS_PER_SECOND, MAX_FRAME_SECONDS);
      previous = now;
      const advance = (seconds / SECONDS_PER_M) * rate;
      timeRef.current += advance;
      const next = advanceFaller(fallerRef.current, spin, advance);
      fallerRef.current = next;
      trailRef.current.push(next);
      if (trailRef.current.length > TRAIL_LENGTH) trailRef.current.shift();
      setSwept(next.swept);
      setElapsed(next.time);
      setPlunged(next.plunged);
      draw();
      handle = requestAnimationFrame(step);
    };

    // One frame always, so the canvas is never blank; the loop only while playing. Paused has to
    // mean the GPU goes idle, not that a static picture is redrawn sixty times a second — the
    // first version kept scheduling frames and only skipped the integration, which is a paused
    // animation that still costs everything an animation costs.
    draw();
    if (!presentation.playing) return () => { stopped = true; };
    handle = requestAnimationFrame(step);
    return () => { stopped = true; cancelAnimationFrame(handle); };
  }, [
    spin, outerEdge, rate, dark, failure, presentation.playing, presentation.focused,
  ]);

  const figures = useMemo(() => {
    const insideRange = angularVelocityRange(EQUATORIAL_ERGOSPHERE_RADIUS * JUST_INSIDE, spin);
    const outsideRange = angularVelocityRange(EQUATORIAL_ERGOSPHERE_RADIUS * JUST_OUTSIDE, spin);
    return {
      omegaHorizon: horizonAngularVelocity(spin),
      omegaAtEdge: omegaZamo(outerEdge, spin),
      omegaAtErgo: omegaZamo(EQUATORIAL_ERGOSPHERE_RADIUS, spin),
      minInside: insideRange.min,
      minOutside: outsideRange.min,
    };
  }, [spin, outerEdge]);

  const summary = useMemo(() =>
    `Top-down view of the equatorial plane of a black hole spinning at a over M `
    + `${spin.toFixed(SPIN_PLACES)}. Markers at seven radii are carried round at the `
    + `zero-angular-momentum angular velocity. The ergosphere is a dashed circle at `
    + `${EQUATORIAL_ERGOSPHERE_RADIUS} M and the horizon a filled disc at `
    + `${horizon.outer.toFixed(PLACES)} M. Beside it, a cut through the spin axis shows the `
    + `same ergosphere as an oblate surface, which is the only view it is one in.`,
  [spin, horizon.outer]);

  useEffect(() => {
    const timer = setTimeout(() => setAnnouncement(
      `Coordinate time ${elapsed.toFixed(PLACES_2)} M. The faller has zero angular momentum and `
      + `has swept ${swept.toFixed(PLACES)} radians. `
      + (plunged ? 'It has reached the stopping radius just outside the horizon. ' : '')
      + `Omega at the horizon is ${figures.omegaHorizon.toFixed(PLACES)} per M.`,
    ), ANNOUNCE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [swept, elapsed, plunged, figures.omegaHorizon]);

  const perM = (value: number) => `${value.toFixed(PLACES)} /M`;

  return (
    <article className="dragging sim-page">
      <header className="sim-head">
        <p className="eyebrow">Kerr · frame dragging and the ergosphere</p>
        <h1>You cannot stand still.</h1>
        <p className="intro">
          A spinning mass drags the geometry around with it. Far away that is a small precession;
          close in it becomes a prohibition. Inside the ergosphere there is no worldline at all
          with dφ/dt ≤ 0 — not a difficult one, not an expensive one. None.
        </p>
      </header>

      <SimStage
        simId={SIM_ID}
        panelLabel="The field"
        canvas={
          <StageCanvas simId={SIM_ID} dragging={false}>
            {failure ? (
              <p className="stage-failure" role="alert">
                This view needs WebGL2, which this browser did not provide. {failure}
              </p>
            ) : (
              <canvas ref={canvasRef} tabIndex={0} role="img" aria-label={summary} />
            )}
            <p className="visually-hidden" aria-live="polite">{announcement}</p>
          </StageCanvas>
        }
        permanentLabel={<>
          <p>
            <strong>Clock: Boyer–Lindquist coordinate time.</strong> The faller never crosses the
            horizon in this chart — it stalls against it — and that is the coordinate, not the
            physics. Its own clock reaches the horizon in finite proper time.
          </p>
          <p>
            Left: the equatorial plane from above, where the ergosphere is a <em>circle</em> at
            exactly 2 M. Right: a cut through the spin axis, the only view it is an ellipse in.
          </p>
        </>}
        controls={<>
          <NumberSlider
            label="Spin" value={spin}
            onChange={v => set('spin', v)}
            minValue={MIN_SPIN} maxValue={MAX_SPIN} step={SPIN_STEP}
            places={SPIN_PLACES}
            format={value => `a/M = ${value.toFixed(SPIN_PLACES)}`}
            hint="At 0 the markers do not move at all, the wedges are symmetric about zero, and
                  the ergosphere collapses onto the horizon — there is no region between them."
          />
          <NumberSlider
            label="Outer edge" value={outerEdge}
            onChange={v => set('outerEdge', v)}
            minValue={MIN_EDGE} maxValue={MAX_EDGE} step={0.5}
            unit=" M" places={1}
            hint="How much of the plane is in frame. ω falls off as 2Ma/r³, so widening the view
                  is the quickest way to see how fast the dragging dies away."
          />
          <NumberSlider
            label="Release radius" value={releaseRadius}
            onChange={v => set('releaseRadius', v)}
            minValue={MIN_RELEASE} maxValue={MAX_RELEASE} step={0.5}
            unit=" M" places={1}
            hint="Where the zero-angular-momentum particle is dropped from rest. It is released
                  with L_z = 0 and keeps L_z = 0 for the whole fall."
          />
          <NumberSlider
            label="Speed" value={rate}
            onChange={v => set('rate', v)}
            minValue={MIN_RATE} maxValue={MAX_RATE} step={0.25}
            unit="×" places={2}
            hint="Playback only. The integrator takes the same steps per unit coordinate time at
                  every speed."
          />

          <div className="readout" aria-label="Measured angular velocities">
            <dl>
              <div>
                <dt>Ω at the horizon</dt>
                <dd>{perM(figures.omegaHorizon)}<span>Ω_H = a/(2Mr_+)</span></dd>
              </div>
              <div>
                <dt>ω at the ergosphere</dt>
                <dd>{perM(figures.omegaAtErgo)}<span>at 2 M</span></dd>
              </div>
              <div>
                <dt>ω at the outer edge</dt>
                <dd>{perM(figures.omegaAtEdge)}<span>at {outerEdge.toFixed(1)} M</span></dd>
              </div>
              <div className={figures.minInside > 0 ? 'figure-benchmark forbidden' : 'figure-benchmark'}>
                <dt>Slowest allowed dφ/dt</dt>
                <dd>
                  {perM(figures.minInside)}
                  <span>
                    just inside 2 M
                    {figures.minInside > 0
                      ? ' — positive, so standing still is impossible'
                      : ' — zero spin, so standing still is allowed'}
                  </span>
                </dd>
              </div>
              <div>
                <dt>…just outside 2 M</dt>
                <dd>{perM(figures.minOutside)}<span>negative: counter-rotation available</span></dd>
              </div>
              <div>
                <dt>Faller, L_z = 0</dt>
                <dd>
                  {swept.toFixed(PLACES)} rad
                  <span>after {elapsed.toFixed(PLACES_2)} M of coordinate time</span>
                </dd>
              </div>
            </dl>
          </div>
        </>}
      >
        <MisconceptionsPanel items={[
          {
            myth: 'The ergosphere is an ellipse drawn around the equator.',
            reality: 'The oblate shape exists only in a cut containing the spin axis. Seen from '
              + 'above — looking down the spin axis, which is how the ergosphere is almost always '
              + 'drawn — its boundary is a circle of radius exactly 2M, at every spin, because '
              + 'r_E(θ) = M + √(M² − a²cos²θ) has the cosine vanish at the equator. Both views '
              + 'are on screen above, side by side, for exactly this reason.',
            figures: [
              { label: 'Ergosphere, equator', value: '2.000 M — every spin' },
              { label: 'Ergosphere, poles', value: `${horizon.outer.toFixed(PLACES)} M — meets the horizon` },
              { label: 'Horizon', value: `${horizon.outer.toFixed(PLACES)} M` },
            ],
          },
          {
            myth: 'Frame dragging is a force the hole exerts on things near it.',
            reality: 'Nothing is pushed. A zero-angular-momentum observer has p_φ = 0 — that is '
              + 'the definition — and still has dφ/dt = ω ≠ 0, because it is the coordinates '
              + 'themselves that are dragged. The particle in the picture is released with '
              + 'L_z = 0 and keeps L_z = 0 for the whole fall, and it still winds up. Far from '
              + 'the hole the same effect is the Lense–Thirring precession, and it has been '
              + 'measured: Gravity Probe B found 37.2 ± 7.2 mas/yr against a prediction of 39.2.',
          },
          {
            myth: 'Inside the ergosphere you would have to work hard not to be dragged round.',
            reality: 'There is nothing to work at. Inside 2M every timelike and null worldline '
              + 'has dφ/dt > 0, because the whole light cone has tipped past the direction of '
              + 'constant φ. The orange wedges in the picture are that range of dφ/dt; outside '
              + 'the ergosphere each one contains its own base angle, meaning "stay put" is '
              + 'among the options, and inside none of them does. At the horizon the wedge '
              + 'closes to a single value, Ω_H — which is what it means to say the horizon '
              + 'rotates rigidly.',
            figures: [
              { label: 'Slowest dφ/dt just inside 2M', value: `${perM(figures.minInside)}` },
              { label: 'Slowest dφ/dt just outside 2M', value: `${perM(figures.minOutside)}` },
              { label: 'At the horizon the range is', value: `a single value, ${perM(figures.omegaHorizon)}` },
            ],
          },
        ]} />

        <Suspense fallback={<p role="status">Loading equations…</p>}>
          <PhysicsPanel
            equation={String.raw`\omega_{\rm ZAMO} = -\frac{g_{t\varphi}}{g_{\varphi\varphi}} = \frac{2Mar}{\Sigma^2},\qquad \Omega_\pm = \omega \pm \frac{\alpha}{\varpi} = \frac{2Mar \pm r^2\sqrt{\Delta}}{\Sigma^2}`}
            assumptions={[
              'Kerr geometry in Boyer–Lindquist coordinates, equatorial plane, with Σ² = (r²+a²)² − a²Δ and Δ = (r−r_+)(r−r_−).',
              'Δ is computed in its factored form, not as r² − 2Mr + a². The two are the same polynomial and not the same computation: at a/M = 0.998 the literal form returns 1.4×10⁻¹⁷ at r_+ instead of 0, and √Δ of that is the whole width of a light cone that should have closed to a point.',
              'The clock is Boyer–Lindquist coordinate time throughout, including the faller. It never crosses the horizon in this chart; its own proper time reaches it in a finite interval.',
              'The faller is dropped from rest at infinity with exactly zero angular momentum: E = μ, L_z = 0. Its rates are dr/dt = −√(1−α²)Δ/Σ and dφ/dt = ω, integrated with RK4 and refined so a step never lands inside the horizon.',
              'The wedges are drawn for a fixed span of coordinate time, so their width is the local light cone in φ and not a velocity.',
              'The markers are carried at ω(r) and are not geodesics: a ZAMO has to accelerate to stay at fixed r. Nothing here claims they are freely falling.',
              'Spin stops at a/M = 0.998, the Thorne limit. a = M is extremal and the two horizons merge.',
            ]}
            sources={[
              { title: 'Bardeen, Press & Teukolsky 1972 — Rotating black holes: LNRF equations', url: 'https://ui.adsabs.harvard.edu/abs/1972ApJ...178..347B' },
              { title: 'Visser 2007 — The Kerr spacetime: a brief introduction', url: 'https://arxiv.org/abs/0706.0622' },
              { title: 'Everitt et al. 2011 — Gravity Probe B: final results of a space experiment to test general relativity', url: 'https://arxiv.org/abs/1105.3456' },
            ]}
          />
        </Suspense>

        <p className="verification-note">
          Every claim on this page is asserted numerically. ω(r_+) equals Ω_H in all three of its
          published forms to 10⁻¹⁵; ω falls off as r⁻³ to within 5%; the equatorial ergosphere is
          2 M to 10⁻¹⁰ at every spin, confirmed by three independent routes; Ω_− crosses zero at
          exactly r = 2 M; and the light-cone wedge closes to a single value at the horizon,
          exactly, which needs the factored Δ to be true at all.
        </p>
      </SimStage>
    </article>
  );
}
