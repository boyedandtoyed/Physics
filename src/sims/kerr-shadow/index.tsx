/** SIM D — the Kerr shadow. PHYSICS_SPEC §3.
 *
 * Every ray is integrated through the Kerr geometry in Cartesian Kerr–Schild coordinates, by the
 * Hamiltonian form of §3.4. The spin slider stops at 0.998 because a = M is extremal and the
 * metric is singular there — and because 0.998 is the Thorne limit, above which accretion torque
 * cannot spin a hole anyway.
 *
 * What spin changes is the *shape* of the shadow and where it sits, not its height: §3.4c's
 * η(3M) = 27M² identity makes the vertical half-extent 3√3 M at every spin. The page says so,
 * because it is the thing a reader would otherwise get wrong from watching the slider.
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Switch } from 'react-aria-components';
import { NumberSlider } from '../../ui/NumberSlider';
import { SimStage, StageCanvas } from '../../ui/sim/SimStage';
import { usePlaybackStore, usePresentation } from '../../ui/sim/playbackStore';
import { useOrbitControls, useWheelZoom } from '../../ui/sim/useOrbitControls';
import { MisconceptionsPanel } from '../../ui/MisconceptionsPanel';
import { MAX_SPIN, horizonRadii, iscoRadius } from '../../core/kerr';
import { KerrRenderer, type KerrParams } from './view/KerrRenderer';
import {
  describeShadow,
  describeShadowNumbers,
  shadowFigures,
  type ShadowScene,
} from './description/describeShadow';
import './kerrShadow.css';

const PhysicsPanel = lazy(() =>
  import('../../ui/PhysicsPanel').then(module => ({ default: module.PhysicsPanel })));

const SIM_ID = 'kerr-shadow';
const MIN_SPIN = 0;
const SPIN_STEP = 0.002;
const SPIN_PLACES = 3;
const MIN_DISTANCE = 8;
const MAX_DISTANCE = 90;
const MAX_INCLINATION_DEGREES = 89;
const MIN_STEPS = 120;
const MAX_STEPS = 640;
const STEP_GRANULARITY = 20;
const DEGREES_IN_HALF_TURN = 180;
const DEGREES_PER_RADIAN = DEGREES_IN_HALF_TURN / Math.PI;
const DEFAULT_SPIN = 0.9;
const DEFAULT_DISTANCE = 42;
/** Nearly edge-on: the displacement and the flattened prograde edge are both largest at 0°, and
 *  cos 10° is 0.985 of that. A few degrees of tilt is what makes the ring legible — exactly
 *  edge-on, a geometrically thin ring is a line, and only its lensed images have any area. */
const DEFAULT_INCLINATION_DEGREES = 10;
const DEFAULT_STEPS = 260;
const RING_OUTER = 12;
const ACCUMULATION_TARGET = 24;
const ACCUMULATION_BUDGET_MS = 1200;
const SLOW_FRAME_MS = 150;
const DEGRADE_FACTOR = 0.6;
const UPGRADE_FACTOR = 1.6;
const MIN_DEGRADE = 0.18;
const INITIAL_DEGRADE = 0.22;
const DEFAULT_RESOLUTION_SCALE = 0.65;
/** Ceiling on the backing store. Lower than the Schwarzschild sim's: a Kerr–Schild step is four
 *  full metric evaluations against that renderer's four three-term accelerations, so a ray here
 *  costs roughly two orders of magnitude more. */
const MAX_CANVAS_PIXELS = 700_000;
const MAX_DEVICE_PIXEL_RATIO = 2;
const ANNOUNCE_DELAY_MS = 600;
const PLACES = 3;

interface Controls {
  spin: number;
  cameraDistance: number;
  inclinationDegrees: number;
  azimuthDegrees: number;
  ringEnabled: boolean;
  stepsPerRay: number;
  cinematic: boolean;
  resolutionScale: number;
}

const INITIAL: Controls = {
  spin: DEFAULT_SPIN,
  cameraDistance: DEFAULT_DISTANCE,
  inclinationDegrees: DEFAULT_INCLINATION_DEGREES,
  azimuthDegrees: 0,
  ringEnabled: true,
  stepsPerRay: DEFAULT_STEPS,
  cinematic: false,
  resolutionScale: DEFAULT_RESOLUTION_SCALE,
};

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return reduced;
}

export default function KerrShadow() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<KerrRenderer>(null);
  const [controls, setControls] = useState<Controls>(INITIAL);
  const [failure, setFailure] = useState<string>();
  const [announcement, setAnnouncement] = useState('');
  const degradeRef = useRef(INITIAL_DEGRADE);
  const lockedRef = useRef(false);
  const [degradeTick, setDegradeTick] = useState(0);
  const reducedMotion = usePrefersReducedMotion();
  const presentation = usePresentation(SIM_ID);
  const setGrain = usePlaybackStore(state => state.setGrain);
  const setFocused = usePlaybackStore(state => state.setFocused);

  const orbitPose = useMemo(() => ({
    distance: controls.cameraDistance,
    inclination: controls.inclinationDegrees / DEGREES_PER_RADIAN,
    azimuth: controls.azimuthDegrees / DEGREES_PER_RADIAN,
  }), [controls.cameraDistance, controls.inclinationDegrees, controls.azimuthDegrees]);

  const onOrbit = useCallback((next: { distance: number; inclination: number; azimuth: number }) => {
    setControls(previous => ({
      ...previous,
      cameraDistance: next.distance,
      inclinationDegrees: next.inclination * DEGREES_PER_RADIAN,
      azimuthDegrees: next.azimuth * DEGREES_PER_RADIAN,
    }));
  }, []);

  const orbit = useOrbitControls({
    pose: orbitPose,
    onChange: onOrbit,
    limits: {
      minDistance: MIN_DISTANCE,
      maxDistance: MAX_DISTANCE,
      maxInclination: MAX_INCLINATION_DEGREES / DEGREES_PER_RADIAN,
    },
    // **No idle drift here, at any setting.** The Schwarzschild sim drifts its camera slowly
    // because a frame there is cheap; a Kerr–Schild step is four full metric evaluations and a
    // frame costs two orders of magnitude more, so a drifting camera means re-integrating every
    // ray in the scene, every frame, forever. On a software renderer that left a 1-second frame
    // running continuously and the page never became stable enough to accept a click — 27 s
    // before a `<select>` was actionable, with the main thread otherwise idle. It also works
    // against the sim: comparing the shadow's shape between two spins wants the viewpoint held.
    idleDriftRadiansPerSecond: 0,
    playing: presentation.playing,
  });
  useWheelZoom(canvasRef, orbit.zoomBy);

  useEffect(() => {
    if (presentation.resetToken > 0) setControls(INITIAL);
  }, [presentation.resetToken]);

  const scene: ShadowScene = useMemo(() => ({
    spin: controls.spin,
    cameraDistance: controls.cameraDistance,
    inclination: controls.inclinationDegrees / DEGREES_PER_RADIAN,
    ringEnabled: controls.ringEnabled,
    cinematic: controls.cinematic,
    stepsPerRay: controls.stepsPerRay,
  }), [controls]);
  const figures = useMemo(() => shadowFigures(scene), [scene]);
  const summary = useMemo(() => describeShadow(scene), [scene]);

  const set = useCallback(<K extends keyof Controls>(key: K, value: Controls[K]) => {
    setControls(previous => ({ ...previous, [key]: value }));
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      rendererRef.current = new KerrRenderer(canvas);
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

    const ratio = Math.min(window.devicePixelRatio || 1, MAX_DEVICE_PIXEL_RATIO);
    const rawWidth = Math.max(1, canvas.clientWidth * ratio);
    const rawHeight = Math.max(1, canvas.clientHeight * ratio);
    const clamp = Math.min(1, Math.sqrt(MAX_CANVAS_PIXELS / (rawWidth * rawHeight)));
    const width = Math.max(1, Math.round(rawWidth * clamp));
    const height = Math.max(1, Math.round(rawHeight * clamp));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    // The ring's inner edge tracks the ISCO, which moves inward with spin: at a/M = 0.998 it is
    // 1.24 M against Schwarzschild's 6 M. Holding it fixed would be drawing a disk where no
    // circular orbit exists.
    const params: Partial<KerrParams> = {
      spin: controls.spin,
      cameraDistance: controls.cameraDistance,
      inclination: scene.inclination,
      azimuth: controls.azimuthDegrees / DEGREES_PER_RADIAN,
      grain: presentation.grain,
      ringEnabled: controls.ringEnabled,
      ringInnerRadius: iscoRadius(controls.spin),
      ringOuterRadius: RING_OUTER,
      stepsPerRay: controls.stepsPerRay,
      cinematic: controls.cinematic ? 1 : 0,
      resolutionScale: controls.resolutionScale * degradeRef.current,
      accumulate: !reducedMotion,
      mode: 'stars',
    };
    renderer.setParams(params);

    let handle = 0;
    let stopped = false;
    const deadline = performance.now() + ACCUMULATION_BUDGET_MS;
    const step = () => {
      const active = rendererRef.current;
      if (!active) return;
      const started = performance.now();
      active.render();
      // `render()` only QUEUES the work: WebGL commands cross into the GPU process and the call
      // returns before any of it has run, so timing it alone measures the queueing and nothing
      // else. That reads as a few milliseconds however heavy the frame is, the ratchet below
      // then upgrades the resolution every time, and the page ends up asking for the most
      // expensive frame the device cannot draw. `finish()` reads one pixel back, which forces a
      // real round trip. It costs a pipeline stall per frame; this sim draws a couple of dozen
      // frames and then stops, and a measurement that is not a measurement costs more.
      active.finish();
      const frameMs = performance.now() - started;

      if (frameMs > SLOW_FRAME_MS) {
        lockedRef.current = true;
        if (degradeRef.current > MIN_DEGRADE) {
          degradeRef.current = Math.max(MIN_DEGRADE, degradeRef.current * DEGRADE_FACTOR);
          setDegradeTick(tick => tick + 1);
        }
        return;
      }
      // Predictive, not reactive. Cost goes as the square of the linear scale, so a step up by
      // UPGRADE_FACTOR costs UPGRADE_FACTOR² more; upgrading whenever the current frame merely
      // looks fast walks straight past the cliff. On a software renderer that meant climbing to
      // full scale, discovering a ten-second frame, and then walking the whole way back down —
      // 27 s before the page would accept a click. Refusing a step whose predicted cost exceeds
      // the slow threshold makes the climb stop one rung below it.
      if (
        !lockedRef.current && degradeRef.current < 1
        && frameMs * UPGRADE_FACTOR * UPGRADE_FACTOR < SLOW_FRAME_MS
      ) {
        degradeRef.current = Math.min(1, degradeRef.current * UPGRADE_FACTOR);
        setDegradeTick(tick => tick + 1);
        return;
      }
      const converged = active.accumulatedFrames >= ACCUMULATION_TARGET;
      if (
        stopped || !presentation.playing || reducedMotion || converged
        || frameMs > SLOW_FRAME_MS || performance.now() > deadline
      ) {
        return;
      }
      handle = requestAnimationFrame(step);
    };
    handle = requestAnimationFrame(step);
    return () => { stopped = true; cancelAnimationFrame(handle); };
  }, [
    controls, scene.inclination, reducedMotion, failure, degradeTick,
    presentation.playing, presentation.grain, presentation.focused,
  ]);

  useEffect(() => {
    const timer = setTimeout(() => setAnnouncement(describeShadowNumbers(scene)), ANNOUNCE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [scene]);

  const onCanvasKeyDown = useCallback((event: React.KeyboardEvent<HTMLCanvasElement>) => {
    if (event.key === 'Home') {
      event.preventDefault();
      setControls(INITIAL);
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setFocused(SIM_ID, true);
      return;
    }
    orbit.handlers.onKeyDown(event);
  }, [orbit, setFocused]);

  const inM = (value: number) => `${value.toFixed(PLACES)} M`;
  const extremal = horizonRadii(MAX_SPIN);
  // The two widths the misconception panel compares, both computed rather than quoted.
  const roundWidth = 2 * shadowFigures({ ...scene, spin: 0 }).shadowHalfHeight;
  const fastest = shadowFigures({ ...scene, spin: MAX_SPIN });

  return (
    <article className="kerr sim-page">
      <header className="sim-head">
        <p className="eyebrow">Kerr · the shadow of a spinning hole</p>
        <h1>The shadow is not a circle.</h1>
        <p className="intro">
          Spin drags the geometry around with it, and light with it. The silhouette stops being
          round: it flattens on the side rotating towards you and slides across the sky. What it
          does <em>not</em> do is change height — that is exactly 3√3 M at every spin, and the
          slider is the quickest way to see it.
        </p>
      </header>

      <SimStage
        simId={SIM_ID}
        panelLabel="Controls"
        canvas={
          <StageCanvas simId={SIM_ID} dragging={orbit.dragging}>
            {failure ? (
              <p className="stage-failure" role="alert">
                This simulation needs WebGL2, which this browser did not provide. {failure}
              </p>
            ) : (
              <canvas
                ref={canvasRef}
                tabIndex={0}
                role="img"
                aria-label={summary}
                {...orbit.handlers}
                onKeyDown={onCanvasKeyDown}
              />
            )}
            <p className="visually-hidden" aria-live="polite">{announcement}</p>
          </StageCanvas>
        }
        permanentLabel={
          <p>
            <strong>The ring’s brightness profile is not physical.</strong> It emits uniformly
            between the ISCO and {RING_OUTER} M; there is no Kerr Novikov–Thorne profile here.
            The redshift and the g⁴ beaming that make one limb brighter <em>are</em> exact.
          </p>
        }
        controls={<>
          <div className="controls-grid" aria-label="Simulation controls">
            <NumberSlider
              label="Spin" value={controls.spin}
              onChange={v => set('spin', v)}
              minValue={MIN_SPIN} maxValue={MAX_SPIN} step={SPIN_STEP}
              places={SPIN_PLACES}
              format={value => `a/M = ${value.toFixed(SPIN_PLACES)}`}
              hint={`0 is Schwarzschild. The top of the slider is 0.998, not 1: a = M is extremal,
                     the two horizons merge and the metric is singular there. 0.998 is also the
                     Thorne limit — photons from the disk carry away enough angular momentum that
                     accretion cannot spin a hole past it.`}
            />
            <NumberSlider
              label="Camera distance" value={controls.cameraDistance}
              onChange={v => set('cameraDistance', v)}
              minValue={MIN_DISTANCE} maxValue={MAX_DISTANCE} step={0.5}
              unit=" M" places={1}
              hint="Measured in M from the centre. The shadow's shape is an asymptotic quantity,
                    so retreating changes its apparent size and nothing about its form."
            />
            <NumberSlider
              label="Inclination" value={controls.inclinationDegrees}
              onChange={v => set('inclinationDegrees', v)}
              minValue={-MAX_INCLINATION_DEGREES} maxValue={MAX_INCLINATION_DEGREES} step={1}
              unit="°" places={0}
              hint="0° is edge-on, where the displacement and the flattened edge are largest.
                    Looking down the spin axis the shadow is round again and centred, whatever
                    the spin: the asymmetry is a projection effect of the frame dragging."
            />
            <NumberSlider
              label="Quality" value={controls.stepsPerRay}
              onChange={v => set('stepsPerRay', v)}
              minValue={MIN_STEPS} maxValue={MAX_STEPS} step={STEP_GRANULARITY}
              unit=" steps/ray" places={0}
              hint="Integration steps per ray. Each step is four full metric evaluations, so this
                    is the dominant cost."
            />
            <div className="control control-switches">
              <Switch isSelected={controls.ringEnabled} onChange={v => set('ringEnabled', v)}>
                <div className="switch-indicator" aria-hidden="true" /> Emitting ring
              </Switch>
              <Switch isSelected={controls.cinematic} onChange={v => set('cinematic', v)}>
                <div className="switch-indicator" aria-hidden="true" /> Cinematic mode
              </Switch>
              <p className={controls.cinematic ? 'mode-warning active' : 'mode-warning'} role="status">
                {controls.cinematic
                  ? 'Not physical: Doppler beaming removed, as the Interstellar renderer did for the film.'
                  : 'Physical mode. The bright limb is the approaching one, and it is on the same side as the flattened edge.'}
              </p>
            </div>
            <NumberSlider
              label="Film grain" value={presentation.grain}
              onChange={v => setGrain(SIM_ID, v)}
              minValue={0} maxValue={1} step={0.01}
              places={2}
              hint="Non-physical. Added after tone mapping, downstream of every measured quantity."
            />
          </div>

          <div className="readout" aria-label="Kerr geometry at this spin">
            <dl>
              <div>
                <dt>Outer horizon</dt>
                <dd>{inM(figures.outerHorizon)}<span>r_+ = M + √(M²−a²)</span></dd>
              </div>
              <div>
                <dt>Ergosphere, equator</dt>
                <dd>{inM(figures.equatorialErgosphere)}<span>2M at every spin</span></dd>
              </div>
              <div>
                <dt>Ergosphere, poles</dt>
                <dd>{inM(figures.polarErgosphere)}<span>meets the horizon</span></dd>
              </div>
              <div>
                <dt>Photon orbits</dt>
                <dd>{inM(figures.prograde)}<span>prograde · {inM(figures.retrograde)} retrograde</span></dd>
              </div>
              <div>
                <dt>Prograde ISCO</dt>
                <dd>{inM(figures.isco)}<span>where the ring starts</span></dd>
              </div>
              <div className="figure-benchmark">
                <dt>Shadow</dt>
                <dd>
                  {inM(figures.shadowMin)} to {inM(figures.shadowMax)}
                  <span>
                    displaced {inM(figures.shadowDisplacement)}; height{' '}
                    ±{inM(figures.shadowHalfHeight)} at every spin
                  </span>
                </dd>
              </div>
            </dl>
          </div>

          <p className="stage-help">
            Drag the view to orbit, scroll to zoom. From the keyboard: focus the canvas, then
            arrow keys orbit, <kbd>+</kbd> and <kbd>−</kbd> zoom, <kbd>Home</kbd> resets.
            Click the view to expand it.
          </p>
        </>}
      >
        <MisconceptionsPanel items={[
          {
            myth: 'A faster-spinning black hole casts a smaller shadow.',
            reality: 'Not in the direction you are most likely to be looking. Seen edge-on, the '
              + 'shadow’s vertical half-extent is 3√3 M at every spin, exactly — η(3M) = 27M² '
              + 'identically in a, so the extremum of the boundary sits at the same height no '
              + 'matter how fast the hole turns. What spin changes is the horizontal extent and '
              + 'the displacement: the prograde edge flattens in towards the hole and the whole '
              + 'silhouette slides the other way.',
            figures: [
              { label: 'Height, a/M = 0', value: `±${inM(shadowFigures({ ...scene, spin: 0 }).shadowHalfHeight)}` },
              { label: `Height, a/M = ${MAX_SPIN}`, value: `±${inM(fastest.shadowHalfHeight)}` },
              { label: 'Width, a/M = 0', value: `${inM(roundWidth)}` },
              { label: `Width, a/M = ${MAX_SPIN}`, value: `${inM(fastest.shadowMax - fastest.shadowMin)}` },
            ],
            source: {
              title: 'Bardeen 1973 — Timelike and null geodesics in the Kerr metric (Les Houches)',
              url: 'https://ui.adsabs.harvard.edu/abs/1973blho.conf..215B',
            },
          },
          {
            myth: 'The ergosphere shrinks towards the horizon as the hole spins up.',
            reality: 'It does at the poles, where it meets the horizon. At the equator it sits at '
              + 'exactly 2M for every spin, because r_E(π/2) = M + √(M² − a²cos²θ) has the '
              + 'cosine vanish there. As the spin rises the horizon retreats inward and the '
              + 'ergosphere stays put, so the gap between them grows rather than closing.',
            figures: [
              { label: 'Ergosphere at the equator', value: '2.000 M — every spin' },
              { label: 'Horizon at a/M = 0', value: '2.000 M — no gap, no ergosphere' },
              { label: 'Horizon at a/M = 0.998', value: `${inM(extremal.outer)}` },
            ],
          },
          {
            myth: 'Frame dragging is a force that pushes things around the hole.',
            reality: 'It is a statement about which frames are non-rotating. A zero-angular-'
              + 'momentum observer has p_φ = 0 and still moves in φ, because the coordinates '
              + 'themselves are dragged. Nothing pushes it. Far from the hole the effect is the '
              + 'Lense–Thirring precession, falling off as 2Ma/r³, and it has been measured — '
              + 'Gravity Probe B got 37.2 ± 7.2 mas/yr against a prediction of 39.2.',
          },
          {
            myth: 'The bright side of the ring is the side facing us.',
            reality: 'It is the side moving towards us. Brightness goes as g⁴ with '
              + 'g = 1/(1 − Ωξ) at fixed emission radius, so the approaching limb is beamed and '
              + 'blueshifted and the receding one is dimmed. A useful check on any Kerr render: '
              + 'the bright limb and the flattened edge of the shadow are the same side, because '
              + 'both are the prograde side. If they are on opposite sides, the scene is mirrored.',
          },
        ]} />

        <Suspense fallback={<p role="status">Loading equations…</p>}>
          <PhysicsPanel
            equation={String.raw`g_{\mu\nu} = \eta_{\mu\nu} + 2H\,k_\mu k_\nu,\qquad H = \frac{Mr^3}{r^4+a^2z^2},\qquad \mathcal{H} = \tfrac12 g^{\mu\nu}p_\mu p_\nu = 0`}
            assumptions={[
              'Kerr geometry in Cartesian Kerr–Schild coordinates, with r defined implicitly by (x²+y²)/(r²+a²) + z²/r² = 1. The chart removes both the horizon and the polar-axis coordinate singularities, so no branching is needed at a turning point.',
              'Because k is null, the inverse metric is exact — g^{μν} = η^{μν} − 2H k^μ k^ν — so no matrix is inverted anywhere in the shader.',
              'Photon paths are integrated from Hamilton’s equations with RK4 and a step proportional to the distance to the horizon. ℋ = 0 is the error telemetry: across a full frame it holds to 2×10⁻⁵ of E² in float32.',
              'The ray fired from the camera is future-directed, which substitutes t → −t alone. That is not an isometry of Kerr, so the traced scene is the φ-reflection of the real one; the reflection is undone once, at the camera. Nothing physical is negated.',
              'The ring emits uniformly between the prograde ISCO and 14 M. It is NOT a Novikov–Thorne disk: that profile is the Schwarzschild specialisation of the Page–Thorne integral and the Kerr generalisation is not implemented here. The brightness profile is therefore not physical.',
              'The redshift factor is exact: g = u^t_obs / [u^t_em (1 − Ωξ)] for a prograde equatorial circular orbit, with ξ = L_z/E conserved along the ray. A shifted blackbody is a blackbody at T′ = gT, so bolometric brightness goes as g⁴ and g is never applied twice.',
              'The spin slider stops at a/M = 0.998. a = M is extremal: the horizons merge, the metric is singular, and Bardeen’s shadow parametrisation degenerates.',
              'Shader arithmetic is float32 in M = 1 units, written in q = a²z²/r⁴ so nothing larger than r⁵ appears — the literal Kerr–Schild gradients carry r¹², which overflows float32 at the escape radius. The float64 model that validates it is core/kerrSchild.ts.',
            ]}
            sources={[
              { title: 'Bardeen 1973 — Timelike and null geodesics in the Kerr metric', url: 'https://ui.adsabs.harvard.edu/abs/1973blho.conf..215B' },
              { title: 'Visser 2007 — The Kerr spacetime: a brief introduction', url: 'https://arxiv.org/abs/0706.0622' },
              { title: 'Chan, Psaltis & Özel 2017 — GRay2, a general-purpose geodesic integrator', url: 'https://arxiv.org/abs/1706.07062' },
              { title: 'James, von Tunzelmann, Franklin & Thorne 2015 — Gravitational lensing by spinning black holes', url: 'https://arxiv.org/abs/1502.03808' },
              { title: 'Teo 2003 — Spherical photon orbits around a Kerr black hole', url: 'https://link.springer.com/article/10.1023/A:1024534702166' },
            ]}
          />
        </Suspense>

        <p className="verification-note">
          Verified numerically, not by eye. At a/M = 0 the shadow measured off the rendered frame
          over 720 spokes matches 3√3 M to <strong>0.0037 pixels</strong>, on this integrator
          rather than the Schwarzschild one. At a/M = 0.5, 0.9 and 0.998 both edges match
          Bardeen’s analytic extent to under a pixel, and the displacement at 0.9 agrees to
          3×10⁻⁵ M. The float32 shader and the float64 model disagree about capture on zero of
          240 sampled columns, and ℋ holds to 2×10⁻⁵ of E² across the whole frame.
        </p>
      </SimStage>
    </article>
  );
}
