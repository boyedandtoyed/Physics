/** Mercury's perihelion precession, PHYSICS_SPEC §2.5 and §8.1.
 *
 * The animation runs at an exaggerated mass, because it has to: at Mercury's real field
 * strength the perihelion moves a tenth of an arcsecond per orbit and a visible drift takes
 * thousands of years. Exaggerating has a cost, and this page pays it openly — the same
 * −ML²/r³ term that produces 42.98″/century produces 74° per orbit at the default mass, and at
 * that field strength the weak-field formula the benchmark uses is about 32% low. The panel
 * therefore shows three separate numbers and never lets one stand for another: what the
 * integrator measured, what the formula predicts *at the animation's mass*, and Mercury's real
 * figure computed from `core/mercury.ts` at the real Solar mass and orbit.
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Switch } from 'react-aria-components';
import { NumberSlider } from '../../ui/NumberSlider';
import { MisconceptionsPanel } from '../../ui/MisconceptionsPanel';
import { SimStage, StageCanvas } from '../../ui/sim/SimStage';
import { usePlaybackStore, usePresentation } from '../../ui/sim/playbackStore';
import {
  MERCURY_PRECESSION_ARCSEC_PER_CENTURY,
  MERCURY_PRECESSION_ARCSEC_PER_ORBIT,
  MERCURY_WEAK_FIELD_PARAMETER,
  yearsForPrecession,
} from '../../core/mercury';
import {
  PrecessionRun,
  STEPS_PER_ORBIT,
  apsides,
  orbitStatus,
  degrees,
  describePrecession,
  formulaAdvancePerOrbit,
  type OrbitParams,
} from './description/precessionRun';
import {
  PrecessionRenderer,
  circleVertices,
  discVertices,
  framedBounds,
  type Rgb,
} from './view/PrecessionRenderer';
import './precession.css';

const PhysicsPanel = lazy(() =>
  import('../../ui/PhysicsPanel').then(module => ({ default: module.PhysicsPanel })));

const SIM_ID = 'mercury-precession';

/** The mass slider, as GM/(a c²). The range is the brief's; the default is its midpoint in the
 * sense that matters — large enough to see a drift within a couple of seconds, small enough
 * that a bound orbit still exists at Mercury's eccentricity. */
const MIN_FIELD = 0.001;
const MAX_FIELD = 0.2;
const DEFAULT_FIELD = 0.05;
const FIELD_STEP = 0.001;
/** Eccentricity. Mercury's real 0.20563 is a slider position away from the default 0.205; the
 * benchmark figures come from `core/mercury.ts` at the real value regardless of this control. */
const MIN_ECCENTRICITY = 0.01;
const MAX_ECCENTRICITY = 0.6;
const DEFAULT_ECCENTRICITY = 0.205;
const ECCENTRICITY_STEP = 0.005;
/** Playback speed, in multiples of one orbit per SECONDS_PER_ORBIT_AT_1X seconds. */
const MIN_SPEED = 1;
const MAX_SPEED = 100;
const DEFAULT_SPEED = 4;
const SECONDS_PER_ORBIT_AT_1X = 4;
/** A stalled tab must not integrate an hour in one frame. */
const MAX_FRAME_SECONDS = 0.1;
const MAX_STEPS_PER_FRAME = 6000;
const MILLISECONDS_PER_SECOND = 1000;
const MAX_DEVICE_PIXEL_RATIO = 2;
const ANNOUNCE_DELAY_MS = 700;

/** Framing: the apoapsis plus a margin, so the orbit never touches the canvas edge. */
const FRAME_MARGIN = 1.18;
const CIRCLE_SEGMENTS = 128;
const DISC_SEGMENTS = 64;
const ARC_SEGMENTS = 256;
/** The particle and the focus, in device pixels. */
const PARTICLE_POINT = 9;
const FOCUS_POINT = 5;
const TRAIL_ALPHA = 0.95;
const ARC_ALPHA = 0.9;
const SPOKE_ALPHA = 0.8;
const WEDGE_ALPHA = 0.16;
const GUIDE_ALPHA = 0.3;

const PERCENT = 100;
const DEGREE_PLACES = 2;
const RATE_PLACES = 3;
const FIELD_PLACES = 3;
const ARCSEC_PLACES = 2;
const PER_ORBIT_PLACES = 5;
const ORBIT_PLACES = 1;
const YEAR_GROUPING = 'en-GB';

/** Palette per theme, linear RGB channel by channel — the canvas is transparent over a
 * theme-token background, so a single palette washes out on one theme or the other. */
const DARK_TRAIL_R = 0.42; const DARK_TRAIL_G = 0.68; const DARK_TRAIL_B = 0.98;
const LIGHT_TRAIL_R = 0.10; const LIGHT_TRAIL_G = 0.32; const LIGHT_TRAIL_B = 0.72;
const DARK_ARC_R = 0.98; const DARK_ARC_G = 0.72; const DARK_ARC_B = 0.22;
const LIGHT_ARC_R = 0.72; const LIGHT_ARC_G = 0.42; const LIGHT_ARC_B = 0.02;
const DARK_GUIDE_R = 0.55; const DARK_GUIDE_G = 0.60; const DARK_GUIDE_B = 0.66;
const LIGHT_GUIDE_R = 0.42; const LIGHT_GUIDE_G = 0.46; const LIGHT_GUIDE_B = 0.50;
const MASS_R = 0.95; const MASS_G = 0.78; const MASS_B = 0.35;
const HORIZON_R = 0.30; const HORIZON_G = 0.10; const HORIZON_B = 0.12;
const PARTICLE_LIGHT_R = 0.08; const PARTICLE_LIGHT_G = 0.10; const PARTICLE_LIGHT_B = 0.14;

const DARK_TRAIL: Rgb = [DARK_TRAIL_R, DARK_TRAIL_G, DARK_TRAIL_B];
const LIGHT_TRAIL: Rgb = [LIGHT_TRAIL_R, LIGHT_TRAIL_G, LIGHT_TRAIL_B];
const DARK_ARC: Rgb = [DARK_ARC_R, DARK_ARC_G, DARK_ARC_B];
const LIGHT_ARC: Rgb = [LIGHT_ARC_R, LIGHT_ARC_G, LIGHT_ARC_B];
const DARK_GUIDE: Rgb = [DARK_GUIDE_R, DARK_GUIDE_G, DARK_GUIDE_B];
const LIGHT_GUIDE: Rgb = [LIGHT_GUIDE_R, LIGHT_GUIDE_G, LIGHT_GUIDE_B];
const MASS_RGB: Rgb = [MASS_R, MASS_G, MASS_B];
const HORIZON_RGB: Rgb = [HORIZON_R, HORIZON_G, HORIZON_B];
const PARTICLE_DARK: Rgb = [1, 1, 1];
const PARTICLE_LIGHT: Rgb = [PARTICLE_LIGHT_R, PARTICLE_LIGHT_G, PARTICLE_LIGHT_B];

function prefersDark(): boolean {
  const explicit = document.documentElement.dataset.theme;
  if (explicit === 'dark') return true;
  if (explicit === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export default function MercuryPrecession() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<PrecessionRenderer>(null);
  const runRef = useRef<PrecessionRun | null>(null);
  const [fieldStrength, setFieldStrength] = useState(DEFAULT_FIELD);
  const [eccentricity, setEccentricity] = useState(DEFAULT_ECCENTRICITY);
  const [speed, setSpeed] = useState(DEFAULT_SPEED);
  const [relativistic, setRelativistic] = useState(true);
  const [failure, setFailure] = useState<string>();
  const [announcement, setAnnouncement] = useState('');
  const [themeTick, setThemeTick] = useState(0);
  const [tick, setTick] = useState(0);
  const presentation = usePresentation(SIM_ID);
  const setFocused = usePlaybackStore(state => state.setFocused);

  const params: OrbitParams = useMemo(
    () => ({ fieldStrength, eccentricity, relativistic }),
    [fieldStrength, eccentricity, relativistic],
  );
  const status = useMemo(() => orbitStatus(params), [params]);
  const formulaPerOrbit = useMemo(() => formulaAdvancePerOrbit(params), [params]);

  /** A parameter change restarts the orbit: the measured advance is a property of one run.
   *
   * Where no orbit with the requested apsides exists there is nothing to integrate, and
   * constructing one anyway threw a RangeError that replaced the whole sim with the error
   * boundary. The frame is still drawn, and the panel says which case this is. */
  const launch = useCallback(() => {
    runRef.current = status === 'unavailable' ? null : new PrecessionRun(params);
    setTick(value => value + 1);
  }, [params, status]);

  useEffect(() => { launch(); }, [launch]);

  useEffect(() => {
    if (presentation.resetToken > 0) {
      setFieldStrength(DEFAULT_FIELD);
      setEccentricity(DEFAULT_ECCENTRICITY);
      setSpeed(DEFAULT_SPEED);
      setRelativistic(true);
      launch();
    }
    // `launch` is deliberately excluded from the dependencies: including it would restart the
    // orbit on every parameter change through this effect as well, double-launching and losing
    // a frame of trail. The effect above already owns parameter changes.
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
      rendererRef.current = new PrecessionRenderer(canvas);
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
    const trailColour = dark ? DARK_TRAIL : LIGHT_TRAIL;
    const arcColour = dark ? DARK_ARC : LIGHT_ARC;
    const guideColour = dark ? DARK_GUIDE : LIGHT_GUIDE;
    const particleColour = dark ? PARTICLE_DARK : PARTICLE_LIGHT;
    const extent = apsides(eccentricity).apoapsis * FRAME_MARGIN;
    const horizon = 2 * fieldStrength;

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
      renderer.beginFrame(framedBounds(extent, width, height));

      // The apoapsis circle: the radius the orbit is pinned to, so a reader can see the shape is
      // held fixed while the orientation drifts. There is deliberately no periapsis circle — it
      // would sit exactly under the perihelion arc and the two became indistinguishable.
      const { apoapsis } = apsides(eccentricity);
      renderer.draw(circleVertices(apoapsis, CIRCLE_SEGMENTS), 'loop', guideColour, GUIDE_ALPHA);
      // The horizon, to scale. At the default mass it is a tenth of the semi-major axis; at the
      // top of the slider it is nearly half the periapsis, which is why the orbit stops existing.
      renderer.draw(discVertices(horizon, DISC_SEGMENTS), 'fan', HORIZON_RGB);
      renderer.draw(new Float32Array([0, 0, 1]), 'points', MASS_RGB, 1, FOCUS_POINT * ratio);

      const run = runRef.current;
      if (run) {
        // The swept angle, under the orbit: a filled sector rather than a line, because a
        // one-pixel arc is not findable inside a rosette drawn in the same few hundred pixels.
        renderer.draw(run.perihelionWedge(ARC_SEGMENTS), 'fan', arcColour, WEDGE_ALPHA);
        renderer.draw(run.perihelionSpokes(), 'lines', arcColour, SPOKE_ALPHA);
        renderer.draw(run.perihelionArc(ARC_SEGMENTS), 'strip', arcColour, ARC_ALPHA);
        renderer.draw(run.trailVertices(), 'strip', trailColour, TRAIL_ALPHA);
        const { x, y } = run.position;
        renderer.draw(
          new Float32Array([x, y, 1]), 'points', particleColour, 1, PARTICLE_POINT * ratio,
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
      const steps = Math.min(
        Math.round((STEPS_PER_ORBIT * speed * elapsed) / SECONDS_PER_ORBIT_AT_1X),
        MAX_STEPS_PER_FRAME,
      );
      runRef.current?.advance(steps);
      draw();
      if (presentation.playing) handle = requestAnimationFrame(step);
    };
    draw();
    previous = performance.now();
    if (presentation.playing) handle = requestAnimationFrame(step);
    return () => { stopped = true; cancelAnimationFrame(handle); };
  }, [
    fieldStrength, eccentricity, speed, failure, themeTick, tick,
    presentation.playing, presentation.focused,
  ]);

  const run = runRef.current;
  const measured = run?.measuredAdvancePerOrbit ?? null;
  const ratio = measured !== null && formulaPerOrbit > 0 ? measured / formulaPerOrbit : null;

  const summary = useMemo(
    () => describePrecession(runRef.current, params, MERCURY_PRECESSION_ARCSEC_PER_CENTURY),
    // `tick` advances on every launch; the readout is refreshed by the animation frame below.
    [params, tick],
  );
  useEffect(() => {
    const timer = setTimeout(() => setAnnouncement(summary), ANNOUNCE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [summary]);

  /** Keeps the readouts moving while the orbit runs, without re-rendering per frame. */
  useEffect(() => {
    if (!presentation.playing) return undefined;
    const timer = setInterval(() => setTick(value => value + 1), ANNOUNCE_DELAY_MS);
    return () => clearInterval(timer);
  }, [presentation.playing]);

  const onCanvasKeyDown = useCallback((event: React.KeyboardEvent<HTMLCanvasElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setFocused(SIM_ID, true);
    }
  }, [setFocused]);

  const centuriesOfMercury = run && run.cumulativeAdvance > 0
    ? yearsForPrecession(run.cumulativeAdvance)
    : 0;

  return (
    <article className="precession sim-page">
      <div className="sim-head">
        <p className="eyebrow">Orbits · Perihelion precession</p>
        <h1>The 43 arcseconds that were left over.</h1>
        <p className="intro">
          Newton’s ellipse closes. Mercury’s does not: after Le Verrier subtracted every other
          planet’s pull, 43 arcseconds per century remained, and general relativity produced them
          from the same −ML²/r³ term that gives the ISCO. The orbit below is that calculation —
          run at a far larger mass, because at Mercury’s the drift is a tenth of an arcsecond per
          orbit and you would be watching for eight thousand years.
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
            {/* Required in every state, including the expanded view. Never a toggle and never a
                tooltip. A banner at the head of the stage rather than an overlay on the canvas:
                overlaid at the foot it fell below the fold, and overlaid at the head the sticky
                control drawer clipped it mid-sentence on a phone. */}
            <p className="exaggeration-label">
              <strong>Mass exaggerated for visual clarity.</strong> Benchmark value
              (42.98″/century) computed at Mercury’s real parameters.
            </p>
          </StageCanvas>
        }
        controls={<>
          <NumberSlider
            label="Mass" value={fieldStrength}
            onChange={setFieldStrength}
            minValue={MIN_FIELD} maxValue={MAX_FIELD} step={FIELD_STEP}
            places={FIELD_PLACES}
            format={value => `GM/ac² = ${value.toFixed(FIELD_PLACES)}`}
            hint="The field strength the weak-field formula expands in. Mercury’s real value is
                  2.6 × 10⁻⁸ — five million times smaller than anything on this slider. Above
                  about 0.15 the periapsis falls inside the potential barrier and there is no
                  bound orbit left to precess."
          />
          <NumberSlider
            label="Eccentricity" value={eccentricity}
            onChange={setEccentricity}
            minValue={MIN_ECCENTRICITY} maxValue={MAX_ECCENTRICITY} step={ECCENTRICITY_STEP}
            places={RATE_PLACES}
            hint="Mercury’s is 0.2056, the largest of the inner planets — which is most of why
                  its precession is the one that was measurable. The advance goes as 1/(1−e²)."
          />
          <NumberSlider
            label="Speed" value={speed}
            onChange={setSpeed}
            minValue={MIN_SPEED} maxValue={MAX_SPEED} step={1}
            places={0} unit="×"
            hint="Playback only. 1× is one orbit every four seconds; the integrator takes the
                  same 1,500 steps per orbit at every speed, so the measured advance does not
                  depend on this control."
          />
          <div className="control control-switches">
            <Switch isSelected={relativistic} onChange={setRelativistic}>
              <div className="switch-indicator" aria-hidden="true" /> Relativistic term
            </Switch>
            <p className={relativistic ? 'mode-warning' : 'mode-warning active'} role="status">
              {relativistic
                ? 'Full V_eff, including −ML²/r³.'
                : 'Newtonian: the orbit closes exactly. Same apsides, same L convention, no drift.'}
            </p>
          </div>

          {status === 'plunging' && (
            <p className="domain-warning" role="status">
              No bound orbit at this mass and eccentricity: the periapsis
              ({(apsides(eccentricity).periapsis / fieldStrength).toFixed(DEGREE_PLACES)} M) lies
              inside the potential barrier, so the particle plunges instead of precessing. The
              barrier is the −ML²/r³ term again — the same one that produces the drift.
            </p>
          )}
          {status === 'unavailable' && (
            <p className="domain-warning" role="status">
              No orbit at all has turning points at {(apsides(eccentricity).periapsis
                / fieldStrength).toFixed(DEGREE_PLACES)} M and {(apsides(eccentricity).apoapsis
                / fieldStrength).toFixed(DEGREE_PLACES)} M: at this mass the requested periapsis
              is at or inside the horizon, where no turning point exists. Lower the mass or the
              eccentricity.
            </p>
          )}

          <dl className="figures">
            <div>
              <dt>Measured advance</dt>
              <dd>
                {measured === null ? '—' : `${degrees(measured).toFixed(RATE_PLACES)}°`}
                <span>
                  per orbit, over {run?.orbitsCompleted ?? 0} orbits
                  {run && run.cumulativeAdvance !== 0
                    ? ` · ${degrees(run.cumulativeAdvance).toFixed(ORBIT_PLACES)}° in total`
                    : ''}
                </span>
              </dd>
            </div>
            <div>
              <dt>Formula at this mass</dt>
              <dd>
                {relativistic ? `${degrees(formulaPerOrbit).toFixed(RATE_PLACES)}°` : '0°'}
                <span>
                  6πGM/a(1−e²)c² ·{' '}
                  {ratio === null
                    ? 'awaiting the first orbit'
                    : `measured is ${((ratio - 1) * PERCENT).toFixed(0)}% higher`}
                </span>
              </dd>
            </div>
            <div className="figure-benchmark">
              <dt>Mercury, real parameters</dt>
              <dd>
                {MERCURY_PRECESSION_ARCSEC_PER_CENTURY.toFixed(ARCSEC_PLACES)}″
                <span>
                  per century ·{' '}
                  {MERCURY_PRECESSION_ARCSEC_PER_ORBIT.toFixed(PER_ORBIT_PLACES)}″ per orbit at
                  GM/ac² = {MERCURY_WEAK_FIELD_PARAMETER.toExponential(2)}
                </span>
              </dd>
            </div>
            <div>
              <dt>Mercury would need</dt>
              <dd>
                {centuriesOfMercury > 0
                  ? `${Math.round(centuriesOfMercury).toLocaleString(YEAR_GROUPING)} years`
                  : '—'}
                <span>to drift as far as the orbit above already has</span>
              </dd>
            </div>
          </dl>

          <ul className="legend" aria-label="Colour key">
            <li className="legend-orbit">The orbit</li>
            <li className="legend-arc">Perihelion, and the angle it has swept this turn</li>
            <li className="legend-guide">Apoapsis, held fixed as the orbit turns</li>
            <li className="legend-horizon">Horizon, 2M, to scale</li>
          </ul>
        </>}
      >
        <MisconceptionsPanel items={[
          {
            myth: 'The 43″ is the whole of Mercury’s perihelion motion.',
            reality: 'Mercury’s perihelion advances about 5,600″ per century as seen from Earth. '
              + 'Roughly 5,025″ of that is the precession of the equinoxes — a property of our '
              + 'coordinate frame, not of Mercury — and about 532″ is the pull of the other '
              + 'planets. General relativity accounts for the 43″ that was left when Le Verrier '
              + 'subtracted everything known in 1859. It is a residual, and that is what makes it '
              + 'a test: it was measured before there was a theory to explain it.',
            figures: [
              { label: 'Observed, geocentric', value: '≈ 5,600″/century' },
              { label: 'Equinox precession', value: '≈ 5,025″/century' },
              { label: 'Other planets', value: '≈ 532″/century' },
              { label: 'General relativity', value: '42.98″/century' },
            ],
          },
          {
            myth: 'The precession comes from the Sun’s gravity being slightly stronger than Newton said.',
            reality: 'A stronger inverse-square force does not precess an orbit at all — it gives '
              + 'a smaller, faster ellipse that still closes. Only an inverse-square law closes; '
              + 'any deviation from it opens the orbit. The relativistic correction goes as 1/r⁴ '
              + 'in the force, so it matters most at perihelion and swings the axis forward a '
              + 'little each pass. Switch off the relativistic term above and the drift does not '
              + 'shrink — it vanishes.',
            figures: [
              { label: 'Newtonian drift, measured here', value: '< 10⁻⁴ °/orbit' },
              { label: 'Extra force term', value: '−3ML²/r⁵ × r⃗' },
            ],
          },
          {
            myth: 'The animation shows the 42.98″/century being confirmed.',
            reality: 'It does not, and it cannot. This canvas runs at GM/ac² ≈ 0.05, five million '
              + 'times Mercury’s, because otherwise there is nothing to see. At that field '
              + 'strength the leading-order formula is about 32% below what the integrator '
              + 'measures — the formula is the first term of an expansion, and the animation is '
              + 'outside its domain. What the sim demonstrates is the mechanism and the scaling; '
              + 'the 42.98″ is computed separately at the real Solar mass and Mercury’s real '
              + 'orbit, and is asserted against its published value in the benchmark suite.',
            figures: [
              { label: 'Measured / formula at GM/ac² = 0.05', value: '1.321' },
              { label: 'at 0.005', value: '1.024' },
              { label: 'at 0.001', value: '1.005' },
              { label: 'at Mercury’s 2.55 × 10⁻⁸', value: '1 to 8 decimal places' },
            ],
          },
        ]} />

        <Suspense fallback={<p role="status">Loading equations…</p>}>
          <PhysicsPanel
            equation={String.raw`\Delta\varphi = \frac{6\pi GM}{a\,(1-e^2)\,c^2}\qquad\text{from}\qquad \ddot{\vec r} = -\left(\frac{M}{r^3} + \frac{3ML^2}{r^5}\right)\vec r`}
            assumptions={[
              'Schwarzschild geometry, equatorial plane, geometric units G = c = 1. The semi-major axis is the unit of length, so the only parameter is GM/(a c²).',
              'The closed form is the leading order of an expansion in GM/(a c²). It is exact to a part in 10⁸ at Mercury’s value and about 32% low at the animation’s — the panel shows both rather than one.',
              'The orbit is integrated with Yoshida-4 at 1,500 steps per orbit, where the measured advance has converged to 10⁻⁴ degrees. Playback speed changes how many steps a frame takes, never the step size.',
              'The launch state is solved from the turning points: L is chosen so that V_eff(r_p) = V_eff(r_a) in whichever potential is selected. Newtonian vis-viva seeding collapses the eccentricity from 0.206 to 0.029 at GM/ac² = 0.05, because the velocity that gives a Newtonian ellipse gives a different orbit in the relativistic potential.',
              'Each perihelion is located by fitting a parabola to the three samples bracketing the radial minimum, not by taking the nearest step — which would quantise the measurement at 0.24 degrees, a third of the whole effect at the low end of the slider.',
              'Mercury’s figures come from the real Solar GM and its real orbit, in core/units.ts, and no animation parameter feeds them.',
            ]}
            sources={[
              { title: 'Einstein 1915 — Erklärung der Perihelbewegung des Merkur', url: 'https://echo.mpiwg-berlin.mpg.de/MPIWG:YCTUC4AA' },
              { title: 'Misner, Thorne & Wheeler — Gravitation, §25.5', url: 'https://press.princeton.edu/books/hardcover/9780691177793/gravitation' },
              { title: 'Park et al. 2017 — Precession of Mercury from MESSENGER ranging', url: 'https://ui.adsabs.harvard.edu/abs/2017AJ....153..121P' },
            ]}
          />
        </Suspense>

        <p className="verification-note">
          Verified numerically, not by eye. The benchmark suite asserts 42.98″/century at
          Mercury’s real parameters, that the same integrator reproduces the formula to 2.4% at
          GM/ac² = 0.005 and 0.5% at 0.001 — the residual shrinking with the field, as the
          formula’s own truncation must — that a Newtonian orbit closes to 2 × 10⁻⁵ radians per
          orbit, and that at the animation’s 0.05 the formula is 32% low. The unit tests measure
          the eccentricity back off the integrated trajectory rather than trusting the seed.
        </p>
      </SimStage>
    </article>
  );
}
