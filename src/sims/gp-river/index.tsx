/** The Gullstrand-Painlevé river, animated. PHYSICS_SPEC §5.
 *
 * Space "flowing inward" is an exact restatement of Schwarzschild geometry in one particular
 * slicing — and it is a slicing, not a current. §5.4 lists six caveats and requires a label; both
 * that label and the flow itself are on the page at all times, never behind a toggle.
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NumberSlider } from '../../ui/NumberSlider';
import { MisconceptionsPanel } from '../../ui/MisconceptionsPanel';
import { SimStage, StageCanvas } from '../../ui/sim/SimStage';
import { usePlaybackStore, usePresentation } from '../../ui/sim/playbackStore';
import { radiusForSpeed, riverSpeedOverC } from '../../core/river';
import { schwarzschildRadius } from '../../core/timeDilation';
import { METRES_PER_KILOMETRE, SOLAR_MASS } from '../../core/units';
import { DEFAULT_RIVER_PARAMS, RiverRenderer } from './view/RiverRenderer';
import './river.css';

const PhysicsPanel = lazy(() =>
  import('../../ui/PhysicsPanel').then(module => ({ default: module.PhysicsPanel })));

const SIM_ID = 'gp-river';
const MIN_SOLAR_MASSES = 1;
const MAX_SOLAR_MASSES = 100;
const DEFAULT_SOLAR_MASSES = 10;
const MIN_OUTER = 3;
const MAX_OUTER = 24;
const MIN_TIME_SCALE = 0.1;
const MAX_TIME_SCALE = 1.5;
const ANNOUNCE_DELAY_MS = 600;
const MAX_DEVICE_PIXEL_RATIO = 2;
const MILLISECONDS_PER_SECOND = 1000;
const PERCENT = 100;

interface Controls {
  solarMasses: number;
  outerRadius: number;
  timeScale: number;
}

const INITIAL: Controls = {
  solarMasses: DEFAULT_SOLAR_MASSES,
  outerRadius: DEFAULT_RIVER_PARAMS.outerRadius,
  timeScale: DEFAULT_RIVER_PARAMS.timeScale,
};

/** Flow palette per theme, linear RGB, channel by channel.
 *
 * The canvas is transparent over a theme-token background, so a single palette washes out on one
 * theme or the other. The band EDGES these colours mark are physical — 0.5 c is exactly r = 4 rₛ
 * and 1 c is exactly the horizon — while the hues are a display choice.
 */
const DARK_SLOW_R = 0.30;
const DARK_SLOW_G = 0.58;
const DARK_SLOW_B = 0.95;
const LIGHT_SLOW_R = 0.10;
const LIGHT_SLOW_G = 0.32;
const LIGHT_SLOW_B = 0.72;
const DARK_FAST_R = 1.0;
const DARK_FAST_G = 0.72;
const DARK_FAST_B = 0.20;
const LIGHT_FAST_R = 0.78;
const LIGHT_FAST_G = 0.46;
const LIGHT_FAST_B = 0.02;
const LIGHT_HORIZON_R = 0.08;
const LIGHT_HORIZON_G = 0.09;
const LIGHT_HORIZON_B = 0.10;
const DARK_SUPER_R = 0.85;
const DARK_SUPER_G = 0.38;
const DARK_SUPER_B = 0.36;
const LIGHT_SUPER_R = 0.62;
const LIGHT_SUPER_G = 0.16;
const LIGHT_SUPER_B = 0.16;

const DARK_SLOW: readonly [number, number, number] = [DARK_SLOW_R, DARK_SLOW_G, DARK_SLOW_B];
const LIGHT_SLOW: readonly [number, number, number] = [LIGHT_SLOW_R, LIGHT_SLOW_G, LIGHT_SLOW_B];
const DARK_FAST: readonly [number, number, number] = [DARK_FAST_R, DARK_FAST_G, DARK_FAST_B];
const LIGHT_FAST: readonly [number, number, number] = [LIGHT_FAST_R, LIGHT_FAST_G, LIGHT_FAST_B];
const DARK_HORIZON: readonly [number, number, number] = [1, 1, 1];
const LIGHT_HORIZON: readonly [number, number, number] =
  [LIGHT_HORIZON_R, LIGHT_HORIZON_G, LIGHT_HORIZON_B];
const DARK_SUPER: readonly [number, number, number] = [DARK_SUPER_R, DARK_SUPER_G, DARK_SUPER_B];
const LIGHT_SUPER: readonly [number, number, number] =
  [LIGHT_SUPER_R, LIGHT_SUPER_G, LIGHT_SUPER_B];

function prefersDark(): boolean {
  const explicit = document.documentElement.dataset.theme;
  if (explicit === 'dark') return true;
  if (explicit === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export default function GpRiver() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<RiverRenderer>(null);
  const flowTime = useRef(0);
  const [controls, setControls] = useState<Controls>(INITIAL);
  const [failure, setFailure] = useState<string>();
  const [announcement, setAnnouncement] = useState('');
  const [themeTick, setThemeTick] = useState(0);
  const presentation = usePresentation(SIM_ID);
  const setFocused = usePlaybackStore(state => state.setFocused);

  const set = useCallback(<K extends keyof Controls>(key: K, value: Controls[K]) => {
    setControls(previous => ({ ...previous, [key]: value }));
  }, []);

  useEffect(() => {
    if (presentation.resetToken > 0) { setControls(INITIAL); flowTime.current = 0; }
  }, [presentation.resetToken]);

  useEffect(() => {
    const bump = () => setThemeTick(tick => tick + 1);
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
      rendererRef.current = new RiverRenderer(canvas);
      setFailure(undefined);
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
      return undefined;
    }
    return () => { rendererRef.current?.dispose(); rendererRef.current = null; };
  }, []);

  // The animation loop. Paused schedules no frame at all, so the GPU goes idle rather than
  // redrawing a field that is not moving.
  useEffect(() => {
    const canvas = canvasRef.current;
    const renderer = rendererRef.current;
    if (!canvas || !renderer || failure) return undefined;

    const dark = prefersDark();
    renderer.setParams({
      outerRadius: controls.outerRadius,
      slowColour: dark ? DARK_SLOW : LIGHT_SLOW,
      fastColour: dark ? DARK_FAST : LIGHT_FAST,
      horizonColour: dark ? DARK_HORIZON : LIGHT_HORIZON,
      superluminalColour: dark ? DARK_SUPER : LIGHT_SUPER,
    });

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, MAX_DEVICE_PIXEL_RATIO);
      const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
      const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
    };

    let handle = 0;
    let previous = performance.now();
    let stopped = false;
    const step = (now: number) => {
      if (stopped) return;
      const dt = (now - previous) / MILLISECONDS_PER_SECOND;
      previous = now;
      flowTime.current += dt * controls.timeScale;
      resize();
      rendererRef.current?.render(flowTime.current);
      if (presentation.playing) handle = requestAnimationFrame(step);
    };
    resize();
    // One frame always, so a paused canvas is never blank.
    previous = performance.now();
    rendererRef.current?.render(flowTime.current);
    if (presentation.playing) handle = requestAnimationFrame(step);
    return () => { stopped = true; cancelAnimationFrame(handle); };
  }, [controls, failure, presentation.playing, presentation.focused, themeTick]);

  const figures = useMemo(() => {
    const horizonKm = schwarzschildRadius(controls.solarMasses * SOLAR_MASS) / METRES_PER_KILOMETRE;
    return {
      horizonKm,
      halfLightRadius: radiusForSpeed(0.5),
      speedAtEdge: riverSpeedOverC(controls.outerRadius),
      edgeKm: horizonKm * controls.outerRadius,
    };
  }, [controls.solarMasses, controls.outerRadius]);

  const summary = useMemo(() => (
    `Gullstrand-Painlevé flow field around a ${controls.solarMasses.toFixed(0)} solar mass black `
    + `hole, drawn out to ${controls.outerRadius.toFixed(0)} Schwarzschild radii. The inflow speed `
    + `is ${(figures.speedAtEdge * PERCENT).toFixed(0)} per cent of light speed at the outer edge, `
    + `reaches exactly light speed at the horizon, and exceeds it inside. This is a coordinate `
    + `choice, not a measurable current.`
  ), [controls.solarMasses, controls.outerRadius, figures.speedAtEdge]);

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

  const km = (value: number) => `${value.toFixed(2)} km`;

  return (
    <article className="river sim-page">
      <div className="sim-head">
        <p className="eyebrow">Interpretations · The river model</p>
        <h1>Space is not flowing.</h1>
        <p className="intro">
          But there is an exact way of writing Schwarzschild geometry in which it looks exactly as
          though it is — flat space with an inward current at the Newtonian escape velocity. The
          flow below is that current, computed from the metric. What it is not is a thing you
          could measure.
        </p>
      </div>

      <SimStage
        simId={SIM_ID}
        panelLabel="The flow"
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
            label="Mass" value={controls.solarMasses}
            onChange={v => set('solarMasses', v)}
            minValue={MIN_SOLAR_MASSES} maxValue={MAX_SOLAR_MASSES} step={0.5}
            unit=" M☉" places={1}
            hint="Rescales the whole field. The flow is scale-free — only r/rₛ enters — so the
                  picture is identical at every mass and only the kilometres beside it change."
          />
          <NumberSlider
            label="Outer edge" value={controls.outerRadius}
            onChange={v => set('outerRadius', v)}
            minValue={MIN_OUTER} maxValue={MAX_OUTER} step={1}
            unit=" rₛ" places={0}
            hint="How far out the field is seeded. The flow never stops — it falls off as 1/√r
                  forever — so the edge is a drawing choice."
          />
          <NumberSlider
            label="Flow rate" value={controls.timeScale}
            onChange={v => set('timeScale', v)}
            minValue={MIN_TIME_SCALE} maxValue={MAX_TIME_SCALE} step={0.05}
            unit="×" places={2}
            hint="Playback speed of the animation. A display choice; it changes no velocity in
                  the model."
          />

          <ul className="legend" aria-label="Colour key">
            <li className="legend-slow">Below 0.5 c — outside 4 rₛ</li>
            <li className="legend-fast">0.5 c to c</li>
            <li className="legend-horizon">Exactly c — the horizon, at rₛ</li>
            <li className="legend-super">Faster than c — inside the horizon</li>
          </ul>

          <dl className="figures">
            <div>
              <dt>Horizon</dt>
              <dd>{km(figures.horizonKm)}<span>rₛ, where the flow reaches c</span></dd>
            </div>
            <div>
              <dt>Half light speed at</dt>
              <dd>{figures.halfLightRadius.toFixed(0)} rₛ<span>= {km(figures.horizonKm * figures.halfLightRadius)}</span></dd>
            </div>
            <div>
              <dt>Speed at the outer edge</dt>
              <dd>{figures.speedAtEdge.toFixed(3)} c<span>at {km(figures.edgeKm)}</span></dd>
            </div>
          </dl>
        </>}
      >
        {/* Mandatory, in every state, never behind a toggle. */}
        <p className="river-disclaimer">
          <strong>This is a coordinate choice (Gullstrand–Painlevé), not a physical current.</strong>{' '}
          The river form is exact at every radius — it is not an approximation that improves near
          the horizon — but the flow itself carries no energy or momentum, has no detectable state
          of motion, and cannot be measured by any local experiment. It explains falling and
          nothing else: not tides, not orbits, not the ISCO.{' '}
          <span className="river-ref">
            Ref: Hamilton &amp; Lisle 2008, <em>Am. J. Phys.</em> <strong>76</strong> 519.
          </span>
        </p>
        <p className="river-required-label">
          One exact way of slicing Schwarzschild spacetime. The inflow is a property of this
          coordinate choice, not a measurable current.
        </p>

        <MisconceptionsPanel items={[
          {
            myth: 'The water analogy is a rough picture that breaks down far from the hole.',
            reality: 'The opposite of the usual caveat, and worth getting right: the '
              + 'Gullstrand–Painlevé form is EXACT at every radius. Expanding the square recovers '
              + 'Schwarzschild identically, and the constant-t_ff slices are exactly flat '
              + 'Euclidean space. Far out the flow simply becomes negligible — β → 0 as 1/√r — so '
              + 'the picture becomes trivial, not wrong. What fails is not the radius but the '
              + 'analogy itself: the river is not a substance anywhere.',
            figures: [
              { label: 'β at 4 rₛ', value: '0.500 c' },
              { label: 'β at the horizon', value: 'exactly c' },
              { label: 'β at 100 rₛ', value: '0.100 c' },
              { label: 'Exactness of the form', value: 'exact at every r' },
            ],
            source: {
              title: 'Hamilton & Lisle 2008 — The river model of black holes',
              url: 'https://arxiv.org/abs/gr-qc/0411060',
            },
          },
          {
            myth: 'Space really is flowing inward, and that is what gravity is.',
            reality: 'Nothing invariant distinguishes flowing space from static space. The same '
              + 'geometry in Schwarzschild coordinates is completely static, with no flow at all, '
              + 'and the four-chart Interpretations module shows every invariant agreeing to one '
              + 'part in 10¹⁰ across both. Hamilton and Lisle, who wrote the river model, say it '
              + 'themselves: the flat background “has no physically observable meaning.”',
          },
          {
            myth: 'Superluminal flow inside the horizon breaks relativity.',
            reality: 'Nothing moves faster than light relative to the river, and only that is '
              + 'physical. The red arrows inside rₛ are moving faster than c with respect to a '
              + 'fictitious flat background, which is not a frame anything can occupy. A freely '
              + 'falling laboratory measures flat Minkowski physics to first order there, exactly '
              + 'as it does outside.',
          },
        ]} />

        <Suspense fallback={<p role="status">Loading equations…</p>}>
          <PhysicsPanel
            equation={String.raw`ds^2 = -c^2dt_{ff}^2 + (dr + \beta c\,dt_{ff})^2 + r^2d\Omega^2,\qquad \beta = -\sqrt{\frac{r_s}{r}}`}
            assumptions={[
              'Schwarzschild geometry: non-rotating, uncharged, vacuum. β is the metric’s shift, equal to the Newtonian escape velocity in units of c and to the radial velocity of an observer falling from rest at infinity.',
              'The form is exact, not an approximation. Expanding the square recovers Schwarzschild identically; the transformation is a re-slicing of time alone.',
              'Markers advect along the exact trajectory r(t) = (r₀^{3/2} − (3/2)t)^{2/3} in units of rₛ and c, in closed form rather than by stepped integration.',
              'Markers recycle at 0.1 rₛ rather than at r = 0: the flow speed diverges at the curvature singularity, which is a real feature of the geometry and not something to animate through.',
              'Colour band edges are physical: 0.5 c is exactly r = 4 rₛ and 1 c is exactly the horizon. Arrow length tracks speed and is capped for legibility.',
              'The flow rate control is playback speed. It changes no velocity in the model.',
              'Exact only for stationary black holes. A general spacetime has no flat spatial slicing at all.',
            ]}
            sources={[
              { title: 'Hamilton & Lisle 2008 — The river model of black holes, Am. J. Phys. 76, 519', url: 'https://arxiv.org/abs/gr-qc/0411060' },
              { title: 'Martel & Poisson 2001 — Regular coordinate systems for Schwarzschild', url: 'https://arxiv.org/abs/gr-qc/0001069' },
              { title: 'Misner, Thorne & Wheeler — Gravitation, §31', url: 'https://press.princeton.edu/books/hardcover/9780691177793/gravitation' },
            ]}
          />
        </Suspense>

        <p className="verification-note">
          Verified numerically, not by eye: the flow speed is asserted against PHYSICS_SPEC §8
          row 33 — 0.5 c at 4 rₛ and exactly c at the horizon, both to 10⁻¹⁰ — and the advection
          is asserted to agree with the closed-form infall time in both directions, to stay
          between the cutoff and the outer edge over a full cycle, and never to run outward.
        </p>
      </SimStage>
    </article>
  );
}
