/** SIM F — the Penrose process. PHYSICS_SPEC §3.6.
 *
 * A particle falls in, reaches its turning point inside the ergosphere and splits. One fragment
 * carries **negative** energy and plunges; the other leaves with more than came in, and the
 * difference is taken out of the hole's rotation.
 *
 * The efficiency is never clamped. It falls out of the LNRF split, and the split cannot exceed
 * ½(√(2M/r₊) − 1) because that is what the split is — 400 radii at four spins are walked in the
 * tests looking for a counter-example. A demonstration that clamped a number it had computed
 * wrongly would be hiding the error rather than preventing it.
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
  type Bounds,
  type Rgb,
} from '../../ui/gl/LineRenderer';
import { EQUATORIAL_ERGOSPHERE_RADIUS, MAX_SPIN, horizonRadii } from '../../core/kerr';
import {
  advanceRun,
  describeRun,
  energies,
  pointVertex,
  splitRadiusRange,
  startRun,
  trailVertices,
  type RunParams,
  type RunState,
} from './description/penroseRun';
import './penrose.css';

const PhysicsPanel = lazy(() =>
  import('../../ui/PhysicsPanel').then(module => ({ default: module.PhysicsPanel })));

const SIM_ID = 'penrose-process';
const MIN_SPIN = 0;
const SPIN_STEP = 0.002;
const SPIN_PLACES = 3;
const DEFAULT_SPIN = 0.9;
/** Position within the available split range, 0 = at the horizon, 1 = on the static limit. */
const DEFAULT_DEPTH = 0.25;
const DEPTH_STEP = 0.01;
const MIN_RATE = 0.25;
const MAX_RATE = 6;
const DEFAULT_RATE = 1.5;
const PLACES = 3;
const PLACES_2 = 2;
const PLACES_4 = 4;
const PERCENT_PLACES = 2;
const PERCENT = 100;

const CIRCLE_SEGMENTS = 160;
const DASH_SEGMENTS = 96;
const DISC_SEGMENTS = 96;
/** Half-extent of the frame, in M. Framed on the RELEASE radius, not on the escape radius: the
 *  geometry worth seeing — the horizon at 1.4 M, the ergosphere at 2 M, the split between them —
 *  is all inside 2 M, and a frame that held the escape radius drew every one of them inside four
 *  pixels. The escaping fragment leaving the frame is what escaping looks like. */
const FRAME_EXTENT = 7.5;
const MAX_DEVICE_PIXEL_RATIO = 2;
const ANNOUNCE_DELAY_MS = 700;
const SECONDS_PER_M = 0.10;
const MAX_FRAME_SECONDS = 0.05;
const MILLISECONDS_PER_SECOND = 1000;
const TRAIL_AGE_FLOOR = 0.2;
const POINT_SIZE = 9;
const SMALL_POINT_SIZE = 7;

/** Linear-RGB palette, named per channel. Energy is colour-coded and the code is stated. */
const PARENT_DARK_R = 0.86;
const PARENT_DARK_G = 0.86;
const PARENT_DARK_B = 0.9;
const PARENT_LIGHT_R = 0.16;
const PARENT_LIGHT_G = 0.16;
const PARENT_LIGHT_B = 0.2;
const NEGATIVE_R = 0.85;
const NEGATIVE_G = 0.3;
const NEGATIVE_B = 0.32;
const POSITIVE_R = 0.35;
const POSITIVE_G = 0.78;
const POSITIVE_B = 0.95;
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

const PARENT_DARK: Rgb = [PARENT_DARK_R, PARENT_DARK_G, PARENT_DARK_B];
const PARENT_LIGHT: Rgb = [PARENT_LIGHT_R, PARENT_LIGHT_G, PARENT_LIGHT_B];
/** The fragment with E < 0. Red because it is the whole mechanism, not because it is dangerous. */
const NEGATIVE: Rgb = [NEGATIVE_R, NEGATIVE_G, NEGATIVE_B];
const POSITIVE: Rgb = [POSITIVE_R, POSITIVE_G, POSITIVE_B];
const HORIZON_FILL: Rgb = [HORIZON_FILL_R, HORIZON_FILL_G, HORIZON_FILL_B];
const HORIZON_EDGE: Rgb = [HORIZON_EDGE_R, HORIZON_EDGE_G, HORIZON_EDGE_B];
const ERGO_DARK: Rgb = [ERGO_DARK_R, ERGO_DARK_G, ERGO_DARK_B];
const ERGO_LIGHT: Rgb = [ERGO_LIGHT_R, ERGO_LIGHT_G, ERGO_LIGHT_B];

const TRAIL_ALPHA = 0.92;
const ERGO_ALPHA = 0.95;
const SPLIT_ALPHA = 0.7;

interface Controls {
  spin: number;
  /** Where in the available range the split happens, 0 at the horizon, 1 at the static limit. */
  depth: number;
  rate: number;
}

const INITIAL: Controls = { spin: DEFAULT_SPIN, depth: DEFAULT_DEPTH, rate: DEFAULT_RATE };

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

export default function PenroseProcess() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<LineRenderer>(null);
  const [controls, setControls] = useState<Controls>(INITIAL);
  const [failure, setFailure] = useState<string>();
  const [announcement, setAnnouncement] = useState('');
  const presentation = usePresentation(SIM_ID);
  const dark = useDarkTheme();

  const { spin, depth, rate } = controls;
  const range = useMemo(() => splitRadiusRange(spin), [spin]);
  const splitRadius = useMemo(
    () => range.min + (range.max - range.min) * depth, [range, depth]);
  const params: RunParams = useMemo(() => ({ spin, splitRadius }), [spin, splitRadius]);
  const figures = useMemo(() => energies(params), [params]);
  const horizon = useMemo(() => horizonRadii(spin), [spin]);

  const runRef = useRef<RunState>(startRun(params));
  const [phase, setPhase] = useState(runRef.current.phase);

  const set = useCallback(<K extends keyof Controls>(key: K, value: Controls[K]) => {
    setControls(previous => ({ ...previous, [key]: value }));
  }, []);

  // A trajectory integrated in one spacetime cannot be continued in another, and the split
  // radius is part of the trajectory: any change restarts the run.
  useEffect(() => {
    runRef.current = startRun(params);
    setPhase(runRef.current.phase);
  }, [params, presentation.resetToken]);

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

    const parentColour = dark ? PARENT_DARK : PARENT_LIGHT;
    const ergoColour = dark ? ERGO_DARK : ERGO_LIGHT;

    let handle = 0;
    let stopped = false;
    let previous = performance.now();

    const drawAll = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, MAX_DEVICE_PIXEL_RATIO);
      const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
      const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      const view = { x: 0, y: 0, width: 1, height: 1 };
      const bounds: Bounds = squareBounds(FRAME_EXTENT, width, height, view);
      const state = runRef.current;

      renderer.beginFrame();
      renderer.draw(discVertices(horizon.outer, DISC_SEGMENTS), 'fan', view, bounds, HORIZON_FILL);
      renderer.draw(
        circleVertices(horizon.outer, CIRCLE_SEGMENTS), 'loop', view, bounds, HORIZON_EDGE,
      );
      // The ergosphere: dashed, because nothing stops at it — and it is where E < 0 lives.
      renderer.draw(
        dashedCircleVertices(EQUATORIAL_ERGOSPHERE_RADIUS, DASH_SEGMENTS), 'lines', view, bounds,
        ergoColour, ERGO_ALPHA,
      );
      // The split radius itself, so the slider has something to move.
      renderer.draw(
        dashedCircleVertices(splitRadius, DASH_SEGMENTS), 'lines', view, bounds,
        parentColour, SPLIT_ALPHA,
      );

      if (state.parentTrail.length > 1) {
        renderer.draw(
          trailVertices(state.parentTrail), 'strip', view, bounds, parentColour, TRAIL_ALPHA,
        );
      }
      if (state.plungingTrail.length > 1) {
        renderer.draw(
          trailVertices(state.plungingTrail), 'strip', view, bounds, NEGATIVE, TRAIL_ALPHA,
        );
      }
      if (state.escapingTrail.length > 1) {
        renderer.draw(
          trailVertices(state.escapingTrail), 'strip', view, bounds, POSITIVE, TRAIL_ALPHA,
        );
      }
      if (state.phase === 'approaching') {
        renderer.draw(
          pointVertex(state.parent), 'points', view, bounds, parentColour, 1, POINT_SIZE * ratio,
        );
      } else {
        renderer.draw(
          pointVertex(state.plunging), 'points', view, bounds, NEGATIVE, 1,
          SMALL_POINT_SIZE * ratio,
        );
        renderer.draw(
          pointVertex(state.escaping), 'points', view, bounds, POSITIVE, 1,
          SMALL_POINT_SIZE * ratio,
        );
      }
      renderer.endFrame();
    };

    const step = (now: number) => {
      if (stopped) return;
      const seconds = Math.min((now - previous) / MILLISECONDS_PER_SECOND, MAX_FRAME_SECONDS);
      previous = now;
      const advance = (seconds / SECONDS_PER_M) * rate;
      const next = advanceRun(runRef.current, params, advance);
      runRef.current = next;
      if (next.phase !== phase) setPhase(next.phase);
      drawAll();
      handle = requestAnimationFrame(step);
    };

    drawAll();
    // Paused means the GPU goes idle, not that a static picture is redrawn sixty times a second.
    if (!presentation.playing) return () => { stopped = true; };
    handle = requestAnimationFrame(step);
    return () => { stopped = true; cancelAnimationFrame(handle); };
  }, [params, rate, dark, failure, horizon.outer, splitRadius, phase, presentation.playing]);

  const summary = useMemo(() =>
    `Top-down view of the equatorial plane of a black hole spinning at a over M `
    + `${spin.toFixed(SPIN_PLACES)}. A particle falls in, reaches its turning point at `
    + `${splitRadius.toFixed(PLACES)} M and splits in two. `
    + describeRun(params, runRef.current), [spin, splitRadius, params]);

  useEffect(() => {
    const timer = setTimeout(
      () => setAnnouncement(describeRun(params, runRef.current)), ANNOUNCE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [params, phase]);

  const gainLabel = figures.gainPercent >= 0 ? 'Energy gained' : 'Energy LOST';

  return (
    <article className="penrose sim-page">
      <header className="sim-head">
        <p className="eyebrow">Kerr · extracting energy from a black hole</p>
        <h1>Twenty per cent, and not a scrap more.</h1>
        <p className="intro">
          Inside the ergosphere a fragment can have negative energy — not a little energy, less
          than none. Throw one in and what comes back out carries more than you sent. The bill is
          paid by the hole’s rotation, and the most you can ever get is 20.7%.
        </p>
      </header>

      <SimStage
        simId={SIM_ID}
        panelLabel="The split"
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
        permanentLabel={
          <p>
            <strong>The gain is computed, never capped.</strong> It comes out of the split itself,
            and the split cannot exceed ½(√(2M/r_+) − 1) because that is what the split <em>is</em>.
            The ceiling beside the gain is the closed form, shown so the two can be compared.
          </p>
        }
        controls={<>
          <NumberSlider
            label="Spin" value={spin}
            onChange={v => set('spin', v)}
            minValue={MIN_SPIN} maxValue={MAX_SPIN} step={SPIN_STEP}
            places={SPIN_PLACES}
            format={value => `a/M = ${value.toFixed(SPIN_PLACES)}`}
            hint="At 0 the horizon and the static limit are the same surface, the ergosphere is
                  empty, and there is nowhere to put a negative-energy fragment — so there is no
                  gain to be had at any split radius."
          />
          <NumberSlider
            label="Split depth" value={depth}
            onChange={v => set('depth', v)}
            minValue={0} maxValue={1} step={DEPTH_STEP}
            places={PERCENT_PLACES}
            format={value =>
              `${splitRadius.toFixed(PLACES)} M — ${(value * PERCENT).toFixed(0)}% out`}
            hint="Where inside the ergosphere the particle splits. 0 is as close to the horizon as
                  the chart reaches, where the gain is largest; 1 is the static limit at 2 M,
                  where it is exactly zero."
          />
          <NumberSlider
            label="Speed" value={rate}
            onChange={v => set('rate', v)}
            minValue={MIN_RATE} maxValue={MAX_RATE} step={0.25}
            unit="×" places={PLACES_2}
            hint="Playback only. The integrator takes the same steps per unit coordinate time at
                  every speed."
          />

          <div className="readout" aria-label="Energy budget">
            <dl>
              <div>
                <dt>Energy in</dt>
                <dd>{figures.incoming.toFixed(PLACES_4)}<span>the parent, dropped from rest at infinity</span></dd>
              </div>
              <div className="negative">
                <dt>E₁, the plunging fragment</dt>
                <dd>
                  {figures.plunging.toFixed(PLACES_4)}
                  <span>
                    {figures.plunging < 0
                      ? 'negative — only possible inside the ergosphere'
                      : 'positive: this split is not inside an ergosphere'}
                  </span>
                </dd>
              </div>
              <div className="positive">
                <dt>E₂, the escaping fragment</dt>
                <dd>{figures.escaping.toFixed(PLACES_4)}<span>E_in − E₁, exactly</span></dd>
              </div>
              <div className={figures.gainPercent > 0 ? 'figure-benchmark gaining' : 'figure-benchmark'}>
                <dt>{gainLabel}</dt>
                <dd>
                  {figures.gainPercent.toFixed(PERCENT_PLACES)}%
                  <span>
                    ceiling at this spin {figures.ceilingPercent.toFixed(PERCENT_PLACES)}% ·
                    {' '}extremal limit 20.71%
                  </span>
                </dd>
              </div>
              <div>
                <dt>Ergosphere</dt>
                <dd>
                  {horizon.outer.toFixed(PLACES)} – {EQUATORIAL_ERGOSPHERE_RADIUS.toFixed(PLACES)} M
                  <span>{figures.insideErgosphere ? 'the split is inside it' : 'the split is NOT inside it'}</span>
                </dd>
              </div>
            </dl>
          </div>

          <p className="phase-note" role="status">{describeRun(params, runRef.current)}</p>
        </>}
      >
        <MisconceptionsPanel items={[
          {
            myth: 'The Penrose process is free energy.',
            reality: 'Every extraction lowers the hole’s angular momentum. The bound is the '
              + 'irreducible mass M_irr = √(½M(M + √(M²−a²))), which never decreases; spin the '
              + 'hole all the way down and the process stops. For a maximally spinning hole the '
              + 'rotational energy is 29% of M, and the most any single split can take is 20.7%.',
            figures: [
              { label: 'Maximum gain, extremal', value: '20.71% = ½(√2 − 1)' },
              { label: 'At this spin', value: `${figures.ceilingPercent.toFixed(PERCENT_PLACES)}%` },
              { label: 'At a = 0', value: '0% — no ergosphere' },
            ],
            source: {
              title: 'Chandrasekhar 1983 — The Mathematical Theory of Black Holes, §65',
              url: 'https://global.oup.com/academic/product/the-mathematical-theory-of-black-holes-9780198503705',
            },
          },
          {
            myth: 'The maximum efficiency is 1 − 1/√2.',
            reality: '1 − 1/√2 is 29.29%, which is a different number. The 20.7% figure is '
              + '½(√2 − 1) = 1/√2 − 1/2. The two are easy to interchange and differ by 41%; the '
              + 'general-spin form is ½(√(2M/r_+) − 1), which gives 0 at a = 0 and ½(√2 − 1) at '
              + 'a = M. (29% is a real Kerr number — it is the fraction of an extremal hole’s '
              + 'mass that is rotational energy — but it is not the efficiency of one split.)',
            figures: [
              { label: '½(√2 − 1)', value: '0.207107 — the maximum gain per split' },
              { label: '1 − 1/√2', value: '0.292893 — not this' },
            ],
          },
          {
            myth: 'Negative energy means antimatter, or exotic matter.',
            reality: 'It means E = −p_t is negative, and E is only "the energy" for an observer '
              + 'at infinity. The fragment is an ordinary photon with perfectly positive energy '
              + 'in its own neighbourhood: E = αε + ωL, and inside the ergosphere ωL can be '
              + 'negative enough to swamp the αε. Nothing about the fragment is strange; the '
              + 'strangeness is entirely in ω.',
          },
          {
            myth: 'This is how quasars are powered.',
            reality: 'Almost certainly not. The Penrose process needs a particle to break up at '
              + 'just the right place with just the right momenta, and the fragments have to '
              + 'move at a substantial fraction of c relative to each other — in practice '
              + 'collisions are far more likely to be elastic. Rotational energy does come out '
              + 'of real black holes, but electromagnetically, by the Blandford–Znajek mechanism, '
              + 'which needs a magnetic field the vacuum solution here does not have.',
            source: {
              title: 'Blandford & Znajek 1977 — Electromagnetic extraction of energy from Kerr black holes',
              url: 'https://academic.oup.com/mnras/article/179/3/433/962905',
            },
          },
        ]} />

        <Suspense fallback={<p role="status">Loading equations…</p>}>
          <PhysicsPanel
            equation={String.raw`E = \alpha p^{(t)} + \omega\varpi\,p^{(\varphi)},\qquad \eta_{\rm max}(a) = \tfrac12\left(\sqrt{\tfrac{2M}{r_+}} - 1\right)`}
            assumptions={[
              'Kerr geometry in Boyer–Lindquist coordinates, equatorial plane. Every quantity is computed in the locally non-rotating frame, where E = αp^(t) + ωϖp^(φ) makes the sign of E a statement about ω rather than about the fragment.',
              'The parent has unit rest mass and E = 1: dropped from rest at infinity. Its angular momentum is fixed by requiring a radial turning point at the split radius, so the split happens where p^(r) = 0 and the fragments start from rest in r.',
              'It splits into two photons emitted along ±φ̂ in that frame. That is the configuration maximising the escaping energy once p^(r) = 0, and it is Chandrasekhar’s.',
              'The gain is derived from the split, never clamped. Its ceiling ½(√(2M/r_+) − 1) is a consequence, and the tests walk 400 split radii at four spins looking for a counter-example.',
              'The fragments are started 10⁻⁴ M off the turning point. A turning point is a fixed point of the first-order radial equation, so an RK4 step from exactly there never moves; the trajectory does leave, in finite time, but the discretisation cannot.',
              'The clock is Boyer–Lindquist coordinate time. The plunging fragment approaches the horizon asymptotically in it and is stopped just outside; its own affine parameter reaches the horizon in a finite interval.',
              'Δ is computed as (r−r_+)(r−r_−), not r²−2Mr+a²: at a/M = 0.998 the literal form loses every significant digit at the horizon.',
              'No radiation, no back-reaction and no self-gravity: the hole is a fixed background. A real extraction would spin the hole down, which is the bound this cannot show.',
            ]}
            sources={[
              { title: 'Penrose 1969 — Gravitational collapse: the role of general relativity', url: 'https://ui.adsabs.harvard.edu/abs/1969NCimR...1..252P' },
              { title: 'Bardeen, Press & Teukolsky 1972 — Rotating black holes: LNRF equations', url: 'https://ui.adsabs.harvard.edu/abs/1972ApJ...178..347B' },
              { title: 'Blandford & Znajek 1977 — Electromagnetic extraction of energy from Kerr black holes', url: 'https://academic.oup.com/mnras/article/179/3/433/962905' },
            ]}
          />
        </Suspense>

        <p className="verification-note">
          Asserted numerically, not drawn to look right: E₁ + E₂ equals the energy that came in to
          10⁻⁹ at every split radius and spin; the gain is exactly zero on the static limit, with
          E₁ exactly zero beside it; it reaches the closed-form ceiling as the split approaches the
          horizon; and no spin the slider can reach produces a gain above 20.71%, checked at 201
          spins × 5 radii.
        </p>
      </SimStage>
    </article>
  );
}
