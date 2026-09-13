/** The ISCO explorer, PHYSICS_SPEC §2.5 and §8 rows 38–41.
 *
 * V_eff on the left with the particle's energy line, the orbit on the right. The control that
 * matters is the nudge: above 6M the potential has a minimum and the particle comes back; below
 * it the same construction is a maximum and it does not. "Innermost stable" is that sign change,
 * and κ² = M(r − 6M)/(r³(r − 3M)) is the whole of it.
 *
 * The clock is Schwarzschild coordinate time, throughout and without switching. That is why a
 * plunge stalls near the horizon and stops at r = 2.001 M with a label that stays on screen: in
 * this chart the particle reaches 2M only at t = ∞, and drawing it crossing would be drawing
 * something the coordinates do not contain.
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NumberSlider } from '../../ui/NumberSlider';
import { MisconceptionsPanel } from '../../ui/MisconceptionsPanel';
import { SimStage, StageCanvas } from '../../ui/sim/SimStage';
import { usePlaybackStore, usePresentation } from '../../ui/sim/playbackStore';
import {
  ISCO_BINDING_EFFICIENCY,
  ISCO_SPECIFIC_ENERGY,
  circularSpecificEnergy,
  iscoAngularMomentum,
  iscoRadius,
  marginallyBoundRadius,
  photonSphereRadius,
} from '../../core/orbit';
import {
  HORIZON_LABEL,
  IscoRun,
  MIN_PLOT_RADIUS,
  STOP_RADIUS_OVER_MASS,
  curveBounds,
  curveVertices,
  describeIsco,
  eFoldingTime,
  energyLine,
  epicyclicPeriod,
  plotWindow,
  potentialCurve,
  stabilityAt,
  verticalMarker,
  type IscoParams,
} from './description/iscoRun';
import {
  IscoRenderer,
  circleVertices,
  discVertices,
  squareBounds,
  squeezeForPanel,
  type Bounds,
  type Rgb,
  type Viewport,
} from './view/IscoRenderer';
import './isco.css';

const PhysicsPanel = lazy(() =>
  import('../../ui/PhysicsPanel').then(module => ({ default: module.PhysicsPanel })));

const SIM_ID = 'isco-explorer';
/** Geometric units: M is the unit of length, so the mass is 1 and only r/M is on screen. */
const MASS = 1;

/** Launch radius. From just above the photon sphere out to where the ISCO is a distant memory.
 * 6.0 and 9.0 are both on the 0.1 grid, so the ISCO itself is reachable exactly. */
const MIN_RADIUS = 3.2;
const MAX_RADIUS = 24;
const DEFAULT_RADIUS = 9;
const RADIUS_STEP = 0.1;
/** Radial kick, as a fraction of the local tangential speed. 0 is on the grid. */
const MIN_NUDGE = -0.3;
const MAX_NUDGE = 0.3;
const DEFAULT_NUDGE = -0.06;
const NUDGE_STEP = 0.01;
/** Playback: units of M of *coordinate* time per second at 1x. */
const MIN_SPEED = 1;
const MAX_SPEED = 20;
const DEFAULT_SPEED = 2;
const TIME_UNITS_PER_SECOND_AT_1X = 10;

const MAX_FRAME_SECONDS = 0.1;
const MAX_STEPS_PER_FRAME = 4000;
const MILLISECONDS_PER_SECOND = 1000;
const MAX_DEVICE_PIXEL_RATIO = 2;
const ANNOUNCE_DELAY_MS = 700;
const READOUT_INTERVAL_MS = 250;

/** Canvas layout: potential on the left, orbit on the right, as fractions from the bottom-left. */
const PANEL_BOTTOM = 0.09;
const PANEL_HEIGHT = 0.84;
const POTENTIAL_LEFT = 0.05;
const POTENTIAL_WIDTH = 0.44;
const ORBIT_LEFT = 0.56;
const ORBIT_WIDTH = 0.40;
const POTENTIAL_VIEW: Viewport = {
  x: POTENTIAL_LEFT, y: PANEL_BOTTOM, width: POTENTIAL_WIDTH, height: PANEL_HEIGHT,
};
const ORBIT_VIEW: Viewport = {
  x: ORBIT_LEFT, y: PANEL_BOTTOM, width: ORBIT_WIDTH, height: PANEL_HEIGHT,
};
const CIRCLE_SEGMENTS = 128;
const DISC_SEGMENTS = 64;
/** The orbit frame, as a multiple of the widest radius the particle reaches. */
const FRAME_MARGIN = 1.15;
const PARTICLE_POINT = 9;
const MARKER_ALPHA = 0.8;
const ENERGY_ALPHA = 0.95;
const TRAIL_ALPHA = 0.95;
const PERCENT = 100;
const PLACES_2 = 2;
const PLACES_3 = 3;
const PLACES_6 = 6;
const PLACES_9 = 9;
/** Palette per theme, linear RGB channel by channel — the canvas is transparent over a
 * theme-token background, so one palette washes out on one theme or the other. */
const DARK_CURVE_R = 0.45; const DARK_CURVE_G = 0.78; const DARK_CURVE_B = 0.72;
const LIGHT_CURVE_R = 0.05; const LIGHT_CURVE_G = 0.33; const LIGHT_CURVE_B = 0.29;
const DARK_AXIS_R = 0.62; const DARK_AXIS_G = 0.68; const DARK_AXIS_B = 0.72;
const LIGHT_AXIS_R = 0.34; const LIGHT_AXIS_G = 0.40; const LIGHT_AXIS_B = 0.44;
const DARK_TRAIL_R = 0.42; const DARK_TRAIL_G = 0.68; const DARK_TRAIL_B = 0.98;
const LIGHT_TRAIL_R = 0.10; const LIGHT_TRAIL_G = 0.32; const LIGHT_TRAIL_B = 0.72;
const HORIZON_R = 0.72; const HORIZON_G = 0.28; const HORIZON_B = 0.24;
const HORIZON_FILL_R = 0.28; const HORIZON_FILL_G = 0.09; const HORIZON_FILL_B = 0.11;
const PHOTON_R = 0.85; const PHOTON_G = 0.55; const PHOTON_B = 0.15;
const ISCO_R = 0.25; const ISCO_G = 0.62; const ISCO_B = 0.90;
const NOW_R = 0.90; const NOW_G = 0.42; const NOW_B = 0.72;
const PARTICLE_LIGHT_R = 0.08; const PARTICLE_LIGHT_G = 0.10; const PARTICLE_LIGHT_B = 0.14;

const DARK_CURVE: Rgb = [DARK_CURVE_R, DARK_CURVE_G, DARK_CURVE_B];
const LIGHT_CURVE: Rgb = [LIGHT_CURVE_R, LIGHT_CURVE_G, LIGHT_CURVE_B];
const DARK_AXIS: Rgb = [DARK_AXIS_R, DARK_AXIS_G, DARK_AXIS_B];
const LIGHT_AXIS: Rgb = [LIGHT_AXIS_R, LIGHT_AXIS_G, LIGHT_AXIS_B];
const DARK_TRAIL: Rgb = [DARK_TRAIL_R, DARK_TRAIL_G, DARK_TRAIL_B];
const LIGHT_TRAIL: Rgb = [LIGHT_TRAIL_R, LIGHT_TRAIL_G, LIGHT_TRAIL_B];
const HORIZON_RGB: Rgb = [HORIZON_R, HORIZON_G, HORIZON_B];
const HORIZON_FILL: Rgb = [HORIZON_FILL_R, HORIZON_FILL_G, HORIZON_FILL_B];
const PHOTON_RGB: Rgb = [PHOTON_R, PHOTON_G, PHOTON_B];
const ISCO_RGB: Rgb = [ISCO_R, ISCO_G, ISCO_B];
const NOW_RGB: Rgb = [NOW_R, NOW_G, NOW_B];
const PARTICLE_DARK: Rgb = [1, 1, 1];
const PARTICLE_LIGHT: Rgb = [PARTICLE_LIGHT_R, PARTICLE_LIGHT_G, PARTICLE_LIGHT_B];

/** Below this canvas width the two panels stack instead of sitting side by side: at 390 px a
 * side-by-side potential panel is 150 px wide and shows nothing but its axis markers. */
const STACK_BELOW_PX = 560;
const STACKED_LEFT = 0.09;
const STACKED_WIDTH = 0.86;
const STACKED_POTENTIAL_BOTTOM = 0.56;
const STACKED_POTENTIAL_HEIGHT = 0.40;
const STACKED_ORBIT_BOTTOM = 0.05;
const STACKED_ORBIT_HEIGHT = 0.44;
const STACKED_POTENTIAL_VIEW: Viewport = {
  x: STACKED_LEFT, y: STACKED_POTENTIAL_BOTTOM,
  width: STACKED_WIDTH, height: STACKED_POTENTIAL_HEIGHT,
};
const STACKED_ORBIT_VIEW: Viewport = {
  x: STACKED_LEFT, y: STACKED_ORBIT_BOTTOM, width: STACKED_WIDTH, height: STACKED_ORBIT_HEIGHT,
};
/** Expanded on a narrow screen the control panel is a bottom sheet covering 46vh, not a floating
 * column on the right, so both viewports move into the upper half rather than being squeezed
 * horizontally away from a panel that is not there. */
const SHEET_POTENTIAL_BOTTOM = 0.75;
const SHEET_ORBIT_BOTTOM = 0.5;
const SHEET_HEIGHT = 0.22;
const SHEET_POTENTIAL_VIEW: Viewport = {
  x: STACKED_LEFT, y: SHEET_POTENTIAL_BOTTOM, width: STACKED_WIDTH, height: SHEET_HEIGHT,
};
const SHEET_ORBIT_VIEW: Viewport = {
  x: STACKED_LEFT, y: SHEET_ORBIT_BOTTOM, width: STACKED_WIDTH, height: SHEET_HEIGHT,
};

/** The floating control panel's width in the expanded view, mirroring simStage.css. */
const PANEL_REM = 21;
const PANEL_MAX_VIEWPORT_FRACTION = 0.42;
const FALLBACK_REM_PX = 16;

/** Width the expanded view's panel covers, by the same `min(21rem, 42vw)` rule the CSS uses. */
function floatingPanelWidth(focused: boolean): number {
  if (!focused) return 0;
  const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize)
    || FALLBACK_REM_PX;
  return Math.min(PANEL_REM * rem, PANEL_MAX_VIEWPORT_FRACTION * window.innerWidth);
}

function prefersDark(): boolean {
  const explicit = document.documentElement.dataset.theme;
  if (explicit === 'dark') return true;
  if (explicit === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export default function IscoExplorer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<IscoRenderer>(null);
  const runRef = useRef<IscoRun | null>(null);
  const [radius, setRadius] = useState(DEFAULT_RADIUS);
  const [nudge, setNudge] = useState(DEFAULT_NUDGE);
  const [speed, setSpeed] = useState(DEFAULT_SPEED);
  const [failure, setFailure] = useState<string>();
  const [announcement, setAnnouncement] = useState('');
  const [themeTick, setThemeTick] = useState(0);
  const [tick, setTick] = useState(0);
  const presentation = usePresentation(SIM_ID);
  const setFocused = usePlaybackStore(state => state.setFocused);

  const params: IscoParams = useMemo(
    () => ({ radius, nudge, mass: MASS }), [radius, nudge],
  );
  const stability = stabilityAt(radius, MASS);
  const recovery = epicyclicPeriod(radius, MASS);
  const growth = eFoldingTime(radius, MASS);

  const launch = useCallback(() => {
    runRef.current = new IscoRun(params);
    setTick(value => value + 1);
  }, [params]);

  useEffect(() => { launch(); }, [launch]);

  useEffect(() => {
    if (presentation.resetToken > 0) {
      setRadius(DEFAULT_RADIUS);
      setNudge(DEFAULT_NUDGE);
      setSpeed(DEFAULT_SPEED);
      launch();
    }
    // `launch` is excluded deliberately: the effect above already owns parameter changes, and
    // including it here would relaunch on every slider move as well.
  }, [presentation.resetToken]);

  useEffect(() => {
    const bump = () => setThemeTick(value => value + 1);
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    query.addEventListener('change', bump);
    const observer = new MutationObserver(bump);
    observer.observe(document.documentElement, {
      attributes: true, attributeFilter: ['data-theme'],
    });
    return () => { query.removeEventListener('change', bump); observer.disconnect(); };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    try {
      rendererRef.current = new IscoRenderer(canvas);
      setFailure(undefined);
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
      return undefined;
    }
    return () => { rendererRef.current?.dispose(); rendererRef.current = null; };
  }, []);

  const run = runRef.current;
  const angularMomentum = run?.angularMomentum ?? iscoAngularMomentum(MASS);
  const energy = run?.energy ?? 0;

  const plotMax = plotWindow(radius, MASS);
  const curve = useMemo(
    () => potentialCurve(MASS, angularMomentum, plotMax), [angularMomentum, plotMax],
  );
  const bounds = useMemo(
    () => curveBounds(MASS, angularMomentum, radius, energy), [angularMomentum, radius, energy],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const renderer = rendererRef.current;
    if (!canvas || !renderer || failure) return undefined;
    const dark = prefersDark();
    const curveColour = dark ? DARK_CURVE : LIGHT_CURVE;
    const axisColour = dark ? DARK_AXIS : LIGHT_AXIS;
    const trailColour = dark ? DARK_TRAIL : LIGHT_TRAIL;
    const particleColour = dark ? PARTICLE_DARK : PARTICLE_LIGHT;
    const focused = presentation.focused;

    let handle = 0;
    let stopped = false;

    const draw = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, MAX_DEVICE_PIXEL_RATIO);
      const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
      const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      renderer.beginFrame();
      const current = runRef.current;
      const stacked = canvas.clientWidth < STACK_BELOW_PX;
      // The panel only takes width from the canvas when it floats on the right, which is the
      // wide-screen expanded layout. Narrow, it is a bottom sheet and takes height instead.
      const panelWidth = stacked ? 0 : floatingPanelWidth(focused);
      let potentialView = POTENTIAL_VIEW;
      let orbitView = ORBIT_VIEW;
      if (stacked) {
        potentialView = focused ? SHEET_POTENTIAL_VIEW : STACKED_POTENTIAL_VIEW;
        orbitView = focused ? SHEET_ORBIT_VIEW : STACKED_ORBIT_VIEW;
      }
      potentialView = squeezeForPanel(potentialView, canvas.clientWidth, panelWidth);
      orbitView = squeezeForPanel(orbitView, canvas.clientWidth, panelWidth);

      // --- the potential ---
      const potentialBounds: Bounds = {
        minX: MIN_PLOT_RADIUS * MASS, minY: bounds.minY, maxX: plotMax * MASS, maxY: bounds.maxY,
      };
      for (const [marker, colour] of [
        [2 * MASS, HORIZON_RGB],
        [photonSphereRadius(MASS), PHOTON_RGB],
        [iscoRadius(MASS), ISCO_RGB],
      ] as const) {
        renderer.draw(
          verticalMarker(marker, bounds.minY, bounds.maxY), 'lines',
          potentialView, potentialBounds, colour, MARKER_ALPHA,
        );
      }
      if (current) {
        // Where the particle is *now*, on the same axis as the curve — the link between the two
        // panels, and the thing that makes the barrier legible as something it can hit.
        renderer.draw(
          verticalMarker(current.radius, bounds.minY, bounds.maxY), 'lines',
          potentialView, potentialBounds, NOW_RGB, MARKER_ALPHA,
        );
      }
      renderer.draw(
        energyLine(energy, MIN_PLOT_RADIUS * MASS, plotMax * MASS), 'lines',
        potentialView, potentialBounds, axisColour, ENERGY_ALPHA,
      );
      renderer.draw(
        curveVertices(curve), 'strip', potentialView, potentialBounds, curveColour,
      );

      // --- the orbit ---
      const reach = current
        ? Math.max(current.radiusRange.max, radius)
        : radius;
      const orbitBounds = squareBounds(reach * FRAME_MARGIN, width, height, orbitView);
      renderer.draw(
        discVertices(2 * MASS, DISC_SEGMENTS), 'fan', orbitView, orbitBounds, HORIZON_FILL,
      );
      renderer.draw(
        circleVertices(2 * MASS, CIRCLE_SEGMENTS), 'loop', orbitView, orbitBounds,
        HORIZON_RGB, MARKER_ALPHA,
      );
      renderer.draw(
        circleVertices(iscoRadius(MASS), CIRCLE_SEGMENTS), 'loop', orbitView, orbitBounds,
        ISCO_RGB, MARKER_ALPHA,
      );
      if (current) {
        renderer.draw(
          current.trailVertices(), 'strip', orbitView, orbitBounds, trailColour, TRAIL_ALPHA,
        );
        const { x, y } = current.position;
        renderer.draw(
          new Float32Array([x, y, 1]), 'points', orbitView, orbitBounds,
          particleColour, 1, PARTICLE_POINT * ratio,
        );
      }
      renderer.endFrame();
    };

    let previous = performance.now();
    const step = (now: number) => {
      if (stopped) return;
      const elapsed = Math.min(
        (now - previous) / MILLISECONDS_PER_SECOND, MAX_FRAME_SECONDS,
      );
      previous = now;
      runRef.current?.advanceCoordinateTime(
        TIME_UNITS_PER_SECOND_AT_1X * speed * elapsed, MAX_STEPS_PER_FRAME,
      );
      draw();
      if (presentation.playing) handle = requestAnimationFrame(step);
    };
    draw();
    previous = performance.now();
    if (presentation.playing) handle = requestAnimationFrame(step);
    return () => { stopped = true; cancelAnimationFrame(handle); };
  }, [
    curve, bounds, energy, radius, plotMax, speed, failure, themeTick, tick,
    presentation.playing, presentation.focused,
  ]);

  const summary = useMemo(() => describeIsco(runRef.current, params), [params, tick]);
  useEffect(() => {
    const timer = setTimeout(() => setAnnouncement(summary), ANNOUNCE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [summary]);

  /** Keeps the readouts moving without re-rendering once per frame. */
  useEffect(() => {
    if (!presentation.playing) return undefined;
    const timer = setInterval(() => setTick(value => value + 1), READOUT_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [presentation.playing]);

  const onCanvasKeyDown = useCallback((event: React.KeyboardEvent<HTMLCanvasElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setFocused(SIM_ID, true);
    }
  }, [setFocused]);

  // From the run's own Ẽ, not from the circular orbit's: with a nudge the two differ, and
  // printing 5.72% beside Ẽ = 0.943445 invites the reader to check 1 − Ẽ and find 5.66%.
  const specificEnergy = run?.specificEnergy ?? circularSpecificEnergy(radius, MASS);
  const efficiency = (1 - specificEnergy) * PERCENT;

  return (
    <article className="isco sim-page">
      <div className="sim-head">
        <p className="eyebrow">Orbits · The innermost stable circular orbit</p>
        <h1>Where orbits stop coming back.</h1>
        <p className="intro">
          Circular orbits exist all the way down to 3M. What runs out at 6M is not the orbit — it
          is the restoring force. Above the ISCO the effective potential has a minimum, so a
          nudged particle oscillates and returns; below it, the same construction is a maximum and
          the nudge grows. Move the launch radius across 6M and watch the curve on the left change
          shape under the energy line.
        </p>
      </div>

      <SimStage
        simId={SIM_ID}
        panelLabel="Orbit"
        canvas={
          <StageCanvas simId={SIM_ID} dragging={false}>
            {/* Both labels above the canvas, in one stack, so the row count does not change
                when the plunge label appears and the canvas keeps its 1fr row. Below the canvas
                the plunge label was off screen at the default window height. */}
            <div className="isco-labels">
              <p className="clock-label">
                Clock: <strong>Schwarzschild coordinate time</strong>. The chart is the same
                throughout — nothing switches coordinates mid-run.
              </p>
              {/* Required once the particle has plunged: on screen, permanently, not on hover. */}
              {run?.plunged && (
                <p className="horizon-label" role="status">
                  <strong>{HORIZON_LABEL}</strong>{' '}
                  Stopped at r = {STOP_RADIUS_OVER_MASS} M. The faller crossed nothing here —
                  their own clock reads a finite {run.properTime.toFixed(PLACES_2)} M and keeps
                  running.
                </p>
              )}
            </div>
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
                onKeyDown={onCanvasKeyDown}
              />
            )}
            <p className="visually-hidden" aria-live="polite">{announcement}</p>
          </StageCanvas>
        }
        controls={<>
          <NumberSlider
            label="Launch radius" value={radius}
            onChange={setRadius}
            minValue={MIN_RADIUS} maxValue={MAX_RADIUS} step={RADIUS_STEP}
            unit=" M" places={1}
            hint="The circular orbit the particle starts on. Circular orbits exist for every
                  radius above 3M — the photon sphere — but only above 6M are they stable."
          />
          <NumberSlider
            label="Radial nudge" value={nudge}
            onChange={setNudge}
            minValue={MIN_NUDGE} maxValue={MAX_NUDGE} step={NUDGE_STEP}
            places={PLACES_2}
            format={value => `${value >= 0 ? '+' : ''}${value.toFixed(PLACES_2)} × v_φ`}
            hint="A purely radial kick, so it changes the energy but not the angular momentum —
                  the potential stays put and only the energy line moves. Negative is inward."
          />
          <NumberSlider
            label="Speed" value={speed}
            onChange={setSpeed}
            minValue={MIN_SPEED} maxValue={MAX_SPEED} step={1}
            places={0} unit="×"
            hint="Playback only, in units of M of coordinate time per second. The step size is
                  fixed, so this changes how fast you watch and never what is computed."
          />

          <p className={`stability stability-${stability}`} role="status">
            {stability === 'stable'
              && `Stable. κ² > 0: a small nudge oscillates back, with a period of
                  ${recovery!.toFixed(0)} M.`}
            {stability === 'marginal'
              && 'This is the ISCO. κ² = 0 exactly — there is no restoring force left, and the '
                + 'recovery period has diverged.'}
            {stability === 'unstable'
              && `Unstable. κ² < 0: a departure grows by a factor of e every
                  ${growth!.toFixed(PLACES_2)} M, so this orbit is an equilibrium nobody can sit
                  on. Left completely alone it still falls off — the integrator's own rounding is
                  a nudge, and about seventeen e-folding times later it has grown to the size of
                  the orbit.`}
          </p>

          <dl className="figures">
            <div>
              <dt>This orbit</dt>
              <dd>
                L = {angularMomentum.toFixed(PLACES_3)} M
                <span>
                  Ẽ = {specificEnergy.toFixed(PLACES_6)} ·{' '}
                  {efficiency.toFixed(PLACES_2)}% of rest mass given up to get here
                </span>
              </dd>
            </div>
            <div>
              <dt>Two clocks</dt>
              <dd>
                τ = {(run?.properTime ?? 0).toFixed(PLACES_2)} M
                <span>
                  the faller's own · Schwarzschild t ={' '}
                  {(run?.coordinateTime ?? 0).toFixed(PLACES_2)} M
                </span>
              </dd>
            </div>
            <div>
              <dt>Radius now</dt>
              <dd>
                {(run?.radius ?? radius).toFixed(PLACES_3)} M
                <span>
                  {run
                    ? `ranged over ${run.radiusRange.min.toFixed(PLACES_3)}–${run.radiusRange.max.toFixed(PLACES_3)} M`
                    : ''}
                  {run?.plunged ? ' · plunged' : ''}
                  {run?.outcome === 'escaped' ? ' · escaped' : ''}
                </span>
              </dd>
            </div>
            <div className="figure-benchmark">
              <dt>The ISCO itself</dt>
              <dd>
                6 M
                <span>
                  L = 2√3 M = {iscoAngularMomentum(MASS).toFixed(PLACES_6)} M · Ẽ = √(8/9) ={' '}
                  {ISCO_SPECIFIC_ENERGY.toFixed(PLACES_9)} ·{' '}
                  {(ISCO_BINDING_EFFICIENCY * PERCENT).toFixed(4)}% binding
                </span>
              </dd>
            </div>
          </dl>

          <ul className="legend" aria-label="Colour key">
            <li className="legend-curve">V_eff at this orbit's L</li>
            <li className="legend-energy">The particle's energy</li>
            <li className="legend-now">Where it is now</li>
            <li className="legend-isco">ISCO, 6M</li>
            <li className="legend-photon">Photon sphere, 3M</li>
            <li className="legend-horizon">Horizon, 2M</li>
          </ul>
        </>}
      >
        <MisconceptionsPanel items={[
          {
            myth: 'The ISCO is the closest you can orbit a black hole.',
            reality: 'Circular orbits exist at every radius above 3M. What ends at 6M is their '
              + 'stability: below it the effective potential has a maximum where it had a '
              + 'minimum, so the orbit is a balance you can hold in principle and never in '
              + 'practice. A spacecraft with thrust could sit at 4M indefinitely. What it could '
              + 'not do is coast there — and matter in an accretion disk coasts.',
            figures: [
              { label: 'Circular orbits exist above', value: '3 M' },
              { label: 'Stable above', value: '6 M' },
              { label: 'Marginally bound circular orbit', value: `${marginallyBoundRadius(1)} M, Ẽ = 1` },
            ],
          },
          {
            myth: 'Below the ISCO an orbit is unstable, but you would still see it go round a few times.',
            reality: 'That depends entirely on how far below, and the sim measures it. The '
              + 'departure grows by a factor of e every 1/|κ| — 15.8 M at r = 5M, but 28.8 M at '
              + 'r = 5.5M and only 9.6 M at r = 4.5M. Set the nudge to zero and the orbit still '
              + 'falls off, after about seventeen e-folding times, because the integrator’s own '
              + 'truncation error is a perturbation and an unstable equilibrium amplifies '
              + 'anything. That is not a bug in the animation; it is what unstable means.',
            figures: [
              { label: 'e-folding time at 4.5 M', value: '9.55 M' },
              { label: 'at 5 M', value: '15.81 M' },
              { label: 'at 5.5 M', value: '28.84 M' },
              { label: 'Departure, no nudge at all', value: '≈ 17 e-folds' },
            ],
          },
          {
            myth: 'The infalling particle is destroyed at the horizon, which is why the animation stops.',
            reality: 'Nothing happens to the faller at 2M — the curvature there is unremarkable '
              + 'for a large black hole, and their own clock runs through it without a pause. '
              + 'The animation stops because *this chart* does. Schwarzschild t labels events '
              + 'outside the horizon only, and the faller reaches 2M at t = ∞. Watch the two '
              + 'clocks in the panel diverge: over the last 0.009 M of radius, proper time '
              + 'advances by under 0.02 M while coordinate time advances by more than 4 M. '
              + 'Switching to Gullstrand–Painlevé or Eddington–Finkelstein coordinates carries '
              + 'straight through — that is what the interpretations module is for — but doing '
              + 'it silently mid-animation would hide exactly the fact being demonstrated.',
            figures: [
              { label: 'Stopped at', value: `${STOP_RADIUS_OVER_MASS} M = 1.0005 r_s` },
              { label: 'dt/dτ there', value: '≈ 2,000' },
              { label: 'Mean dt/dτ, 2.01 M → 2.0011 M', value: '≈ 480' },
              { label: 'Mean dt/dτ, 2.5 M → 2.1 M', value: '≈ 8' },
            ],
          },
        ]} />

        <Suspense fallback={<p role="status">Loading equations…</p>}>
          <PhysicsPanel
            equation={String.raw`\kappa^2 = V_{\rm eff}''(r_c) = \frac{M\,(r-6M)}{r^3\,(r-3M)},\qquad \tilde E = \frac{1-2M/r}{\sqrt{1-3M/r}},\qquad \frac{dt}{d\tau} = \frac{\tilde E}{1-2M/r}`}
            assumptions={[
              'Schwarzschild geometry, equatorial plane, geometric units G = c = 1. M is the unit of length, so only r/M appears.',
              'The circular orbit at r has L² = M r²/(r − 3M) and Ẽ = (1 − 2M/r)/√(1 − 3M/r). Both diverge as r → 3M: no massive particle circles at the photon sphere, at any angular momentum.',
              'κ² is the curvature of V_eff at the circular orbit, and it is asserted against a finite difference of the potential rather than against itself.',
              'The nudge is purely radial, so it changes Ẽ but leaves L untouched. The potential the particle moves in is therefore unchanged and only the energy line moves.',
              'The integrator is Yoshida-4 in proper time at 1,200 steps per orbital period, which is what makes the Hamiltonian separable. Coordinate time is accumulated alongside from dt/dτ evaluated at each step’s midpoint.',
              'Playback is paced by coordinate time, so the stall near the horizon is real and not an animation effect. The step shrinks in proportion to r − 2M below 4M so that the approach is resolved; above 4M it is constant and the integration is exactly symplectic.',
              'The run stops at r = 2.001 M = 1.0005 r_s. Schwarzschild t does not label events at or inside 2M, so nothing beyond that point is drawn.',
            ]}
            sources={[
              { title: 'Bardeen, Press & Teukolsky 1972 — Rotating black holes', url: 'https://ui.adsabs.harvard.edu/abs/1972ApJ...178..347B' },
              { title: 'Misner, Thorne & Wheeler — Gravitation, §25.5', url: 'https://press.princeton.edu/books/hardcover/9780691177793/gravitation' },
              { title: 'Carroll — Spacetime and Geometry, §5.4', url: 'https://www.preposterousuniverse.com/spacetimeandgeometry/' },
            ]}
          />
        </Suspense>

        <p className="verification-note">
          Verified numerically, not by eye. κ² is asserted against a finite difference of V_eff at
          three radii and shown to change sign at exactly 6M; the epicyclic period is 224.794 M at
          8M and 1,606 M at 6.01M, diverging as the ISCO is approached. A circular orbit at 9M
          holds its radius to six parts in 10⁹ over twenty orbits. An unstable orbit left with no
          nudge departs after 17.3, 17.1 and 16.4 e-folding times at 4.5M, 5M and 5.5M — the same
          count across a threefold range of timescales, which is only true if the growth rate is
          the κ the formula gives. dφ/dt is asserted to equal √(M/r³) exactly, and no launch
          radius or nudge on either slider ever asks for dt/dτ inside the horizon.
        </p>
      </SimStage>
    </article>
  );
}
