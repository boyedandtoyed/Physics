/** The effective-potential explorer, PHYSICS_SPEC §2.5.
 *
 * V_eff on the left with the three critical radii and a draggable energy line; the integrated
 * orbit on the right. The whole of general relativity in this sim is the -ML²/r³ term: remove it
 * and the left curve loses its inner barrier and the right orbit closes.
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Switch } from 'react-aria-components';
import { NumberSlider } from '../../ui/NumberSlider';
import { MisconceptionsPanel } from '../../ui/MisconceptionsPanel';
import { SimStage, StageCanvas } from '../../ui/sim/SimStage';
import { usePlaybackStore, usePresentation } from '../../ui/sim/playbackStore';
import {
  ISCO_BINDING_EFFICIENCY,
  ISCO_SPECIFIC_ENERGY,
  effectivePotential,
  iscoAngularMomentum,
} from '../../core/orbit';
import {
  MAX_PLOT_RADIUS,
  MIN_PLOT_RADIUS,
  OrbitRun,
  circularOrbitReadout,
  criticalRadii,
  curveBounds,
  curveVertices,
  describeState,
  energyCrossings,
  energyFromWellFraction,
  energyLine,
  potentialCurve,
  verticalMarker,
} from './description/orbitState';
import { PotentialRenderer, type Bounds, type Rgb } from './view/PotentialRenderer';
import './potential.css';

const PhysicsPanel = lazy(() =>
  import('../../ui/PhysicsPanel').then(module => ({ default: module.PhysicsPanel })));

const SIM_ID = 'effective-potential';
const MIN_MASS = 0.1;
const MAX_MASS = 10;
const DEFAULT_MASS = 1;
/** L runs to 5x L_ISCO, per the brief. */
const MAX_L_MULTIPLE = 5;
/** 1.15 x L_ISCO: eccentric enough to be visibly non-circular, with the apoapsis inside the
 * 30 M plot window. At 1.45 the well is so wide that a half-depth orbit reaches past the edge. */
const DEFAULT_L_MULTIPLE = 1.15;
const ANNOUNCE_DELAY_MS = 600;
const MAX_DEVICE_PIXEL_RATIO = 2;
const MILLISECONDS_PER_SECOND = 1000;
/** Integrator steps per animation frame, and the step in geometric time units. */
const SUBSTEPS = 40;
const STEP_SIZE = 0.05;
const TRAIL_LENGTH = 2600;
const PERCENT = 100;
/** Default energy line position within the plotted band. */
/** Energy as a share of the well depth: 0 is the circular orbit, 1 is E = 0, above 1 unbound.
 * 0.25 is eccentric enough to read as an ellipse while keeping the apoapsis inside the 30 M
 * window — at 0.5 the well is shallow enough that the orbit runs off the plot. */
const DEFAULT_ENERGY_OFFSET = 0.25;
const MAX_ENERGY_FRACTION = 1.4;
/** Segments in the drawn horizon circle. */
const CIRCLE_SEGMENTS = 128;
/** Framing of the orbit viewport, as a fraction of the plot window and of the current radius. */
const ORBIT_EXTENT_FRACTION = 0.75;
const ORBIT_HEADROOM = 1.1;
/** Where a new particle is dropped when no turning point or circular orbit exists. */
const FALLBACK_START_FRACTION = 0.8;
/** Frame time is clamped so a stalled tab does not integrate a huge step on resume. */
const MAX_FRAME_SECONDS = 0.1;
const REFERENCE_FPS = 60;
/** Marker line alphas. */
const MARKER_ALPHA = 0.85;
const ENERGY_ALPHA = 0.9;
const CIRCLE_ALPHA = 0.8;
/** Readout precision: energy is small and needs places; E_ISCO is quoted to its benchmark. */
const ENERGY_PLACES = 5;
const ISCO_ENERGY_PLACES = 10;

/** Palette per theme, linear RGB, channel by channel — the canvas is transparent over a
 * theme-token background, so one palette washes out on one theme or the other. The radii these
 * colours mark are physical; the hues are a display choice. */
const DARK_CURVE_R = 0.45; const DARK_CURVE_G = 0.78; const DARK_CURVE_B = 0.72;
const LIGHT_CURVE_R = 0.05; const LIGHT_CURVE_G = 0.33; const LIGHT_CURVE_B = 0.29;
const DARK_AXIS_R = 0.55; const DARK_AXIS_G = 0.62; const DARK_AXIS_B = 0.66;
const LIGHT_AXIS_R = 0.38; const LIGHT_AXIS_G = 0.44; const LIGHT_AXIS_B = 0.47;
const HORIZON_R = 0.72; const HORIZON_G = 0.28; const HORIZON_B = 0.24;
const PHOTON_R = 0.85; const PHOTON_G = 0.55; const PHOTON_B = 0.15;
const ISCO_R = 0.25; const ISCO_G = 0.62; const ISCO_B = 0.90;
const BOUND_R = 0.32; const BOUND_G = 0.60; const BOUND_B = 0.95;
const UNBOUND_R = 0.95; const UNBOUND_G = 0.68; const UNBOUND_B = 0.18;
const MARGINAL_LIGHT_R = 0.12; const MARGINAL_LIGHT_G = 0.12; const MARGINAL_LIGHT_B = 0.14;

const DARK_CURVE: Rgb = [DARK_CURVE_R, DARK_CURVE_G, DARK_CURVE_B];
const LIGHT_CURVE: Rgb = [LIGHT_CURVE_R, LIGHT_CURVE_G, LIGHT_CURVE_B];
const DARK_AXIS: Rgb = [DARK_AXIS_R, DARK_AXIS_G, DARK_AXIS_B];
const LIGHT_AXIS: Rgb = [LIGHT_AXIS_R, LIGHT_AXIS_G, LIGHT_AXIS_B];
const HORIZON_RGB: Rgb = [HORIZON_R, HORIZON_G, HORIZON_B];
const PHOTON_RGB: Rgb = [PHOTON_R, PHOTON_G, PHOTON_B];
const ISCO_RGB: Rgb = [ISCO_R, ISCO_G, ISCO_B];
const BOUND_RGB: Rgb = [BOUND_R, BOUND_G, BOUND_B];
const UNBOUND_RGB: Rgb = [UNBOUND_R, UNBOUND_G, UNBOUND_B];
const MARGINAL_LIGHT: Rgb = [MARGINAL_LIGHT_R, MARGINAL_LIGHT_G, MARGINAL_LIGHT_B];
const MARGINAL_DARK: Rgb = [1, 1, 1];

function prefersDark(): boolean {
  const explicit = document.documentElement.dataset.theme;
  if (explicit === 'dark') return true;
  if (explicit === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/** Left half for the potential, right half for the orbit. Clip-space fractions of the canvas. */
const VIEW_MARGIN = 0.04;
const VIEW_BOTTOM = 0.08;
const VIEW_HEIGHT = 0.86;
const POTENTIAL_WIDTH = 0.52;
const ORBIT_LEFT = 0.60;
const ORBIT_WIDTH = 0.37;
const POTENTIAL_VIEW = {
  x: VIEW_MARGIN, y: VIEW_BOTTOM, width: POTENTIAL_WIDTH, height: VIEW_HEIGHT,
};
const ORBIT_VIEW = { x: ORBIT_LEFT, y: VIEW_BOTTOM, width: ORBIT_WIDTH, height: VIEW_HEIGHT };

export default function EffectivePotential() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<PotentialRenderer>(null);
  const runRef = useRef<OrbitRun | null>(null);
  const [mass, setMass] = useState(DEFAULT_MASS);
  const [lMultiple, setLMultiple] = useState(DEFAULT_L_MULTIPLE);
  const [energyOffset, setEnergyOffset] = useState(DEFAULT_ENERGY_OFFSET);
  const [relativistic, setRelativistic] = useState(true);
  const [failure, setFailure] = useState<string>();
  const [announcement, setAnnouncement] = useState('');
  const [themeTick, setThemeTick] = useState(0);
  const [tick, setTick] = useState(0);
  const presentation = usePresentation(SIM_ID);
  const setFocused = usePlaybackStore(state => state.setFocused);

  const angularMomentum = lMultiple * iscoAngularMomentum(mass);
  const radii = useMemo(() => criticalRadii(mass), [mass]);
  const curve = useMemo(() => potentialCurve(mass, angularMomentum), [mass, angularMomentum]);
  const bounds = useMemo(() => curveBounds(curve), [curve]);
  const readout = useMemo(
    () => circularOrbitReadout(mass, angularMomentum), [mass, angularMomentum],
  );

  /** The energy, as a share of the well depth — see energyFromWellFraction. */
  const energy = useMemo(
    () => energyFromWellFraction(energyOffset, mass, angularMomentum),
    [energyOffset, mass, angularMomentum],
  );
  const crossings = useMemo(
    () => energyCrossings(energy, mass, angularMomentum), [energy, mass, angularMomentum],
  );

  /** Drop a new particle at the outer turning point, or at the stable orbit if there is none. */
  const launch = useCallback(() => {
    const preferred = crossings.length > 0
      ? Math.max(...crossings)
      : (readout.exists ? readout.outer : MAX_PLOT_RADIUS * mass * FALLBACK_START_FRACTION);
    // Never inside the horizon, and never zero: with no angular momentum there is no orbit to
    // start from, so the particle is dropped from the plot's outer edge and falls straight in.
    const startRadius = Number.isFinite(preferred) && preferred > radii.horizon
      ? preferred
      : MAX_PLOT_RADIUS * mass * FALLBACK_START_FRACTION;
    runRef.current = new OrbitRun(mass, startRadius, angularMomentum, {
      relativistic, maxTrail: TRAIL_LENGTH,
    });
    setTick(value => value + 1);
  }, [crossings, readout, mass, angularMomentum, relativistic, radii.horizon]);

  useEffect(() => { launch(); }, [launch]);
  useEffect(() => {
    if (presentation.resetToken > 0) {
      setMass(DEFAULT_MASS);
      setLMultiple(DEFAULT_L_MULTIPLE);
      setEnergyOffset(DEFAULT_ENERGY_OFFSET);
      setRelativistic(true);
    }
  }, [presentation.resetToken]);

  useEffect(() => {
    const bump = () => setThemeTick(value => value + 1);
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    query.addEventListener('change', bump);
    const observer = new MutationObserver(bump);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => { query.removeEventListener('change', bump); observer.disconnect(); };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    try {
      rendererRef.current = new PotentialRenderer(canvas);
      setFailure(undefined);
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
      return undefined;
    }
    return () => { rendererRef.current?.dispose(); rendererRef.current = null; };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const renderer = rendererRef.current;
    if (!canvas || !renderer || failure) return undefined;
    const dark = prefersDark();
    const curveColour = dark ? DARK_CURVE : LIGHT_CURVE;
    const axisColour = dark ? DARK_AXIS : LIGHT_AXIS;

    const potentialBounds: Bounds = {
      minX: MIN_PLOT_RADIUS * mass, minY: bounds.minY,
      maxX: MAX_PLOT_RADIUS * mass, maxY: bounds.maxY,
    };

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

      // --- the potential ---
      for (const [radius, colour] of [
        [radii.horizon, HORIZON_RGB], [radii.photonSphere, PHOTON_RGB], [radii.isco, ISCO_RGB],
      ] as const) {
        renderer.drawLines(
          verticalMarker(radius, bounds.minY, bounds.maxY), 'lines',
          POTENTIAL_VIEW, potentialBounds, colour, MARKER_ALPHA,
        );
      }
      renderer.drawLines(
        energyLine(energy, MIN_PLOT_RADIUS * mass, MAX_PLOT_RADIUS * mass), 'lines',
        POTENTIAL_VIEW, potentialBounds, axisColour, ENERGY_ALPHA,
      );
      renderer.drawLines(
        curveVertices(curve), 'strip', POTENTIAL_VIEW, potentialBounds, curveColour,
      );

      // --- the orbit ---
      const run = runRef.current;
      if (run) {
        const extent = Math.max(
          MAX_PLOT_RADIUS * mass * ORBIT_EXTENT_FRACTION, run.radius * ORBIT_HEADROOM,
        );
        const orbitBounds: Bounds = {
          minX: -extent, minY: -extent, maxX: extent, maxY: extent,
        };
        const marginal = dark ? MARGINAL_DARK : MARGINAL_LIGHT;
        const colour = run.orbitClass === 'bound'
          ? BOUND_RGB : run.orbitClass === 'unbound' ? UNBOUND_RGB : marginal;
        // The horizon, drawn as a circle so the orbit has something to be relative to.
        const circle = new Float32Array((CIRCLE_SEGMENTS + 1) * 3);
        for (let i = 0; i <= CIRCLE_SEGMENTS; i++) {
          const angle = (i / CIRCLE_SEGMENTS) * Math.PI * 2;
          circle[i * 3] = radii.horizon * Math.cos(angle);
          circle[i * 3 + 1] = radii.horizon * Math.sin(angle);
          circle[i * 3 + 2] = 1;
        }
        renderer.drawLines(circle, 'strip', ORBIT_VIEW, orbitBounds, HORIZON_RGB, CIRCLE_ALPHA);
        renderer.drawLines(run.trailVertices(), 'strip', ORBIT_VIEW, orbitBounds, colour);
      }
      renderer.endFrame();
    };

    let previous = performance.now();
    const step = (now: number) => {
      if (stopped) return;
      const dt = Math.min((now - previous) / MILLISECONDS_PER_SECOND, MAX_FRAME_SECONDS);
      previous = now;
      runRef.current?.step(STEP_SIZE, Math.round(SUBSTEPS * dt * REFERENCE_FPS));
      draw();
      if (presentation.playing) handle = requestAnimationFrame(step);
    };
    draw();
    previous = performance.now();
    if (presentation.playing) handle = requestAnimationFrame(step);
    return () => { stopped = true; cancelAnimationFrame(handle); };
  }, [
    curve, bounds, radii, energy, mass, failure, themeTick, tick,
    presentation.playing, presentation.focused,
  ]);

  const summary = useMemo(
    () => describeState(mass, angularMomentum, energy, runRef.current),
    [mass, angularMomentum, energy, tick],
  );
  useEffect(() => {
    const timer = setTimeout(() => setAnnouncement(summary), ANNOUNCE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [summary]);

  const onCanvasKeyDown = useCallback((event: React.KeyboardEvent<HTMLCanvasElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setFocused(SIM_ID, true);
    }
  }, [setFocused]);

  const run = runRef.current;

  return (
    <article className="potential sim-page">
      <div className="sim-head">
        <p className="eyebrow">Orbits · The effective potential</p>
        <h1>One term, two consequences.</h1>
        <p className="intro">
          Newtonian gravity gives a potential with one minimum and no inner edge. General
          relativity adds −ML²/r³, and that single term produces both the perihelion precession
          and the innermost stable circular orbit. Turn it off with the switch and watch the
          barrier vanish and the orbit close.
        </p>
      </div>

      <SimStage
        simId={SIM_ID}
        panelLabel="Orbit"
        canvas={
          <StageCanvas simId={SIM_ID} dragging={false}>
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
            label="Mass" value={mass}
            onChange={setMass}
            minValue={MIN_MASS} maxValue={MAX_MASS} step={0.1}
            unit=" M" places={1}
            hint="Geometric units. The geometry is scale-free — only r/M and L/M enter — so the
                  curve is identical at every mass and only the labels change."
          />
          <NumberSlider
            label="Angular momentum" value={lMultiple}
            onChange={setLMultiple}
            minValue={0} maxValue={MAX_L_MULTIPLE} step={0.01}
            unit=" × L_ISCO" places={2}
            hint="Below 1.00 × L_ISCO the barrier disappears and there are no circular orbits at
                  all — not merely no stable ones."
          />
          <NumberSlider
            label="Energy" value={energyOffset}
            onChange={setEnergyOffset}
            minValue={0} maxValue={MAX_ENERGY_FRACTION} step={0.005}
            places={3}
            hint="Energy as a share of the well depth: 0 is the circular orbit at the minimum,
                  1.00 is E = 0 and marginally bound, above that the orbit is unbound. Where the
                  line crosses the curve are the turning points."
          />
          <div className="control control-switches">
            <Switch isSelected={relativistic} onChange={setRelativistic}>
              <div className="switch-indicator" aria-hidden="true" /> Relativistic term
            </Switch>
            <p className={relativistic ? 'mode-warning' : 'mode-warning active'} role="status">
              {relativistic
                ? 'Full V_eff, including −ML²/r³.'
                : 'Newtonian: the −ML²/r³ term is off. No ISCO, no precession, orbits close.'}
            </p>
          </div>

          <dl className="figures">
            <div>
              <dt>Circular orbits</dt>
              <dd>
                {readout.exists
                  ? `${(readout.outer / mass).toFixed(2)} M`
                  : 'none'}
                <span>
                  {readout.exists
                    ? `stable; unstable at ${(readout.inner / mass).toFixed(2)} M`
                    : 'below L_ISCO none exist at all'}
                </span>
              </dd>
            </div>
            <div>
              <dt>Turning points</dt>
              <dd>
                {crossings.length === 0 ? '—' : crossings.map(r => (r / mass).toFixed(2)).join(', ')}
                <span>M, where E meets V_eff</span>
              </dd>
            </div>
            <div>
              <dt>V_eff at the ISCO</dt>
              <dd>
                {effectivePotential(6 * mass, mass, iscoAngularMomentum(mass)).toFixed(6)}
                <span>= −1/18 exactly</span>
              </dd>
            </div>
            <div>
              <dt>Particle</dt>
              <dd className={run ? `orbit-${run.orbitClass}` : undefined}>
                {run ? run.orbitClass : '—'}
                <span>{run ? `E = ${run.energy.toFixed(ENERGY_PLACES)}, r = ${(run.radius / mass).toFixed(2)} M` : ''}</span>
              </dd>
            </div>
          </dl>

          <ul className="legend" aria-label="Colour key">
            <li className="legend-horizon">Horizon, 2M</li>
            <li className="legend-photon">Photon sphere, 3M</li>
            <li className="legend-isco">ISCO, 6M</li>
            <li className="legend-bound">Bound orbit (E &lt; 0)</li>
            <li className="legend-unbound">Unbound (E &gt; 0)</li>
          </ul>
        </>}
      >
        <MisconceptionsPanel items={[
          {
            myth: 'V_eff has its maximum at the photon sphere, 3M.',
            reality: 'Not for a massive particle. The maximum is the inner root of '
              + 'r² − (L²/M)r + 3L² = 0, and it only approaches 3M as L grows without bound — '
              + '3.303 M at L = 6 M, 3.023 M at L = 20 M, 3.000002 M at L = 2000 M. Below '
              + 'L = 2√3 M the discriminant is negative and there is no maximum at all. The exact '
              + '3M belongs to the null potential L²(1/r² − 2M/r³), whose derivative vanishes at '
              + '3M for every L — which is why the photon sphere has one radius regardless of a '
              + 'photon’s angular momentum.',
            figures: [
              { label: 'Massive maximum at L = 20 M', value: '3.0228 M' },
              { label: 'Massive maximum at L = 2000 M', value: '3.000002 M' },
              { label: 'Photon sphere, any L', value: 'exactly 3 M' },
            ],
          },
          {
            myth: 'Below the ISCO there are unstable circular orbits you could still sit on.',
            reality: 'Below L = 2√3 M there are no circular orbits of any kind — the quadratic '
              + 'has no real roots. Above it there are two: the outer one stable, the inner one '
              + 'unstable, and they merge exactly at 6M. The ISCO is where they merge, not where '
              + 'stability is lost while orbits continue to exist.',
            figures: [
              { label: 'L_ISCO', value: '2√3 M = 3.4641 M' },
              { label: 'V_eff at the ISCO', value: '−1/18 = −0.055556' },
              { label: 'Circular orbits below L_ISCO', value: 'none' },
            ],
          },
          {
            myth: 'The ISCO binding energy is an accretion-model assumption.',
            reality: 'It is pure geometry. The specific energy of the ISCO orbit is √(8/9), so a '
              + 'particle spiralling in from rest at infinity must radiate 1 − √(8/9) = 5.72% of '
              + 'its rest mass before it can get there. That number is where the Novikov–Thorne '
              + 'radiative efficiency comes from; the disk model inherits it rather than choosing '
              + 'it.',
            figures: [
              { label: 'E_ISCO', value: `${ISCO_SPECIFIC_ENERGY.toFixed(ISCO_ENERGY_PLACES)}` },
              { label: 'Binding energy', value: `${(ISCO_BINDING_EFFICIENCY * PERCENT).toFixed(4)}%` },
            ],
          },
        ]} />

        <Suspense fallback={<p role="status">Loading equations…</p>}>
          <PhysicsPanel
            equation={String.raw`V_{\rm eff}(r) = -\frac{M}{r} + \frac{L^2}{2r^2} - \frac{ML^2}{r^3},\qquad \tfrac12\left(\frac{dr}{d\tau}\right)^2 + V_{\rm eff} = E`}
            assumptions={[
              'Schwarzschild geometry, equatorial plane, geometric units G = c = 1. M and L carry units of length and V_eff is dimensionless.',
              'The orbit is integrated in Cartesian coordinates with a = −(M/r³ + 3ML²/r⁵) r⃗, which is −grad Φ with Φ = −M/r − ML²/r³. The Hamiltonian is separable, which is the precondition Yoshida-4 needs (§2.5).',
              'L is held fixed inside the potential. That is exact, not an approximation: the force is central, so the Cartesian dynamics conserves L — asserted to a part in 10¹⁰ over 20,000 steps.',
              'Turning points are found by bisection rather than by solving the cubic, whose roots are ill-conditioned near the ISCO where two of them merge.',
              'The plot window is 2.1 M to 30 M. The potential diverges at small r and the outer turning point of a weakly bound orbit can lie beyond 30 M, in which case the readout reports the one crossing it can show rather than inventing the other.',
              'The trail fade is a display effect applied to alpha. It never touches an integrated position.',
            ]}
            sources={[
              { title: 'Misner, Thorne & Wheeler — Gravitation, §25.5', url: 'https://press.princeton.edu/books/hardcover/9780691177793/gravitation' },
              { title: 'Carroll — Spacetime and Geometry, §5.4', url: 'https://www.preposterousuniverse.com/spacetimeandgeometry/' },
              { title: 'Bardeen, Press & Teukolsky 1972 — Rotating black holes', url: 'https://ui.adsabs.harvard.edu/abs/1972ApJ...178..347B' },
            ]}
          />
        </Suspense>

        <p className="verification-note">
          Verified numerically, not by eye: V_eff at the ISCO is asserted at −1/18 and explicitly
          not at −1/12, and the identity with (Ẽ²−1)/2 for Ẽ = √(8/9) is asserted directly, so the
          same number is reached two ways. A circular orbit launched at the potential minimum stays
          there to a part in 10⁴ over 20,000 steps; the energy stays within 10⁻⁶ over 40,000; and
          the same angular momentum closes a Newtonian orbit while precessing a relativistic one.
        </p>
      </SimStage>
    </article>
  );
}
