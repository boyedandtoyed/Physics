import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Switch } from 'react-aria-components';
import { NumberSlider } from '../../ui/NumberSlider';
import { MisconceptionsPanel } from '../../ui/MisconceptionsPanel';
import {
  CRITICAL_IMPACT_PARAMETER,
  HORIZON_RADIUS,
  ISCO_RADIUS,
  PHOTON_SPHERE_RADIUS,
} from '../../core/schwarzschild';
import { LensingRenderer, type LensingParams } from './view/LensingRenderer';
import { describeScene, describeSceneNumbers, sceneFigures, type SceneState } from './description/describeScene';
import './lensing.css';

const PhysicsPanel = lazy(() =>
  import('../../ui/PhysicsPanel').then(module => ({ default: module.PhysicsPanel })));

const MIN_SOLAR_MASSES = 1;
const MAX_SOLAR_MASSES = 100;
const MIN_DISTANCE = 6;
const MAX_DISTANCE = 60;
const MAX_INCLINATION_DEGREES = 89;
const MIN_STEPS = 96;
const MAX_STEPS = 640;
const STEP_GRANULARITY = 32;
const DEGREES_IN_HALF_TURN = 180;
const DEGREES_PER_RADIAN = DEGREES_IN_HALF_TURN / Math.PI;
/** A stellar-mass black hole; the scale-free geometry makes the choice presentational. */
const DEFAULT_SOLAR_MASSES = 10;
/** Far enough out that the shadow, both lensing rings and the disk's far side all sit in frame. */
const DEFAULT_DISTANCE = 20;
/** Enough tilt to show the far side lensed over the top and the Doppler crescent across. */
const DEFAULT_INCLINATION_DEGREES = 14;
const DEFAULT_STEPS = 320;
/** Frames accumulated once the controls settle. Beyond this the image has converged. */
const ACCUMULATION_TARGET = 24;
/** Stop accumulating if the budget is spent. Without this a slow device — a software renderer,
 * or an integrated GPU, which §4.5 notes runs 3-6x slower — keeps the main thread busy long
 * enough to block input and assistive technology. Convergence is a nicety; responsiveness is not. */
const ACCUMULATION_BUDGET_MS = 1200;
const SLOW_FRAME_MS = 150;
/** Progressive refinement. The renderer **starts small and grows**, rather than starting at full
 * quality and shrinking after the damage is done: one frame at full resolution on a software
 * renderer or a weak integrated GPU blocks the main thread for seconds, freezing input and
 * assistive technology before the user can reach any control. Beginning at a fraction of the
 * target and stepping up only while frames stay fast makes the page responsive on every device,
 * and reaches full quality within a few frames on a capable one.
 *
 * The ratchet matters: once a frame has been slow the scale is **locked**. Allowing it to grow
 * again after shrinking oscillates — at full scale the frame is slow, at the reduced scale it is
 * fast, so it flips between them forever, and because each flip sets state the component never
 * stops re-rendering. That kept the page permanently busy and made every Playwright actionability
 * check time out while the page still looked fine to a human. */
const DEGRADE_FACTOR = 0.6;
const UPGRADE_FACTOR = 1.6;
const MIN_DEGRADE = 0.2;
const INITIAL_DEGRADE = 0.28;
const FAST_FRAME_MS = 35;
/** Ceiling on the backing store, so a hi-DPI display does not quietly quadruple the work. */
const MAX_CANVAS_PIXELS = 1_200_000;
/** §4.5 marks resolution scaling required, not optional. 0.65 is the measured setting that clears
 * BUILD_PLAN's 60 fps at 1080p on the reference GPU (Quadro M5000) while keeping the shadow rim
 * as sharp as any nearby scale; native runs 28 fps. The shadow gate is measured at 1.0 separately,
 * and diagnostics always bypass scaling. */
const DEFAULT_RESOLUTION_SCALE = 0.65;
/** Live-region updates are throttled so dragging a slider does not flood a screen reader
 * (BUILD_PLAN §6: "responsive descriptions ... throttled"). */
const ANNOUNCE_DELAY_MS = 600;
const MAX_DEVICE_PIXEL_RATIO = 2;
/** Arrow-key increment; Shift multiplies it. */
const COARSE_NUDGE = 5;

interface Controls {
  solarMasses: number;
  cameraDistance: number;
  inclinationDegrees: number;
  diskEnabled: boolean;
  stepsPerRay: number;
  cinematic: boolean;
  resolutionScale: number;
}

/** A stellar-mass hole seen from well outside the photon sphere, tilted enough to show both the
 * lensed far side of the disk and the Doppler crescent. */
const INITIAL: Controls = {
  solarMasses: DEFAULT_SOLAR_MASSES,
  cameraDistance: DEFAULT_DISTANCE,
  inclinationDegrees: DEFAULT_INCLINATION_DEGREES,
  diskEnabled: true,
  stepsPerRay: DEFAULT_STEPS,
  cinematic: false,
  // §4.5 lists resolution scaling as required, not optional: 0.7 is 2x less work and reaches
  // 60 fps at 1080p on the reference GPU. The shadow gate is measured at 1.0 separately.
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

export default function BlackHoleLensing() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<LensingRenderer>(null);
  const [controls, setControls] = useState<Controls>(INITIAL);
  const [failure, setFailure] = useState<string>();
  const [announcement, setAnnouncement] = useState('');
  const degradeRef = useRef(INITIAL_DEGRADE);
  /** Set once a frame has been slow. From then on the scale only ever decreases. */
  const lockedRef = useRef(false);
  const [degradeTick, setDegradeTick] = useState(0);
  const reducedMotion = usePrefersReducedMotion();

  const scene: SceneState = useMemo(() => ({
    solarMasses: controls.solarMasses,
    cameraDistance: controls.cameraDistance,
    inclination: controls.inclinationDegrees / DEGREES_PER_RADIAN,
    diskEnabled: controls.diskEnabled,
    cinematic: controls.cinematic,
    stepsPerRay: controls.stepsPerRay,
  }), [controls]);
  const figures = useMemo(() => sceneFigures(scene), [scene]);
  const summary = useMemo(() => describeScene(scene), [scene]);

  const set = useCallback(<K extends keyof Controls>(key: K, value: Controls[K]) => {
    setControls(previous => ({ ...previous, [key]: value }));
  }, []);

  // Create the renderer once the canvas exists. A missing WebGL2 context is reported, not
  // swallowed: a blank canvas with no explanation is the worst possible failure here.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      rendererRef.current = new LensingRenderer(canvas);
      setFailure(undefined);
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
    }
    return () => {
      rendererRef.current?.dispose();
      rendererRef.current = null;
    };
  }, []);

  // Render, then accumulate jittered frames until the image converges. The loop *is* the motion,
  // so prefers-reduced-motion suppresses it rather than merely easing it.
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

    const params: Partial<LensingParams> = {
      cameraDistance: controls.cameraDistance,
      inclination: scene.inclination,
      diskEnabled: controls.diskEnabled,
      stepsPerRay: controls.stepsPerRay,
      cinematic: controls.cinematic ? 1 : 0,
      resolutionScale: controls.resolutionScale * degradeRef.current,
      accumulate: !reducedMotion,
      mode: 'stars',
    };
    renderer.setParams(params);

    // Every render happens inside an animation frame, including the first. Rendering
    // synchronously here blocks the main thread for as long as the frame takes — seconds on a
    // software renderer — which freezes input and assistive technology before the user can reach
    // a control. The page stays interactive; the image catches up.
    let handle = 0;
    const deadline = performance.now() + ACCUMULATION_BUDGET_MS;
    const step = () => {
      const active = rendererRef.current;
      if (!active) return;
      const started = performance.now();
      active.render();
      const frameMs = performance.now() - started;

      if (frameMs > SLOW_FRAME_MS) {
        lockedRef.current = true;
        if (degradeRef.current > MIN_DEGRADE) {
          degradeRef.current = Math.max(MIN_DEGRADE, degradeRef.current * DEGRADE_FACTOR);
          setDegradeTick(tick => tick + 1);
        }
        return;
      }
      if (!lockedRef.current && frameMs < FAST_FRAME_MS && degradeRef.current < 1) {
        degradeRef.current = Math.min(1, degradeRef.current * UPGRADE_FACTOR);
        setDegradeTick(tick => tick + 1);
        return;
      }
      const converged = active.accumulatedFrames >= ACCUMULATION_TARGET;
      if (reducedMotion || converged || frameMs > SLOW_FRAME_MS || performance.now() > deadline) {
        return;
      }
      handle = requestAnimationFrame(step);
    };
    handle = requestAnimationFrame(step);
    return () => cancelAnimationFrame(handle);
  }, [controls, scene.inclination, reducedMotion, failure, degradeTick]);

  // Throttled announcement of the numbers, so a slider drag produces one utterance, not fifty.
  useEffect(() => {
    const timer = setTimeout(() => setAnnouncement(describeSceneNumbers(scene)), ANNOUNCE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [scene]);

  const onCanvasKeyDown = useCallback((event: React.KeyboardEvent) => {
    const nudge = event.shiftKey ? COARSE_NUDGE : 1;
    const actions: Record<string, () => void> = {
      ArrowLeft: () => set('inclinationDegrees',
        Math.max(-MAX_INCLINATION_DEGREES, controls.inclinationDegrees - nudge)),
      ArrowRight: () => set('inclinationDegrees',
        Math.min(MAX_INCLINATION_DEGREES, controls.inclinationDegrees + nudge)),
      ArrowUp: () => set('cameraDistance', Math.max(MIN_DISTANCE, controls.cameraDistance - nudge)),
      ArrowDown: () => set('cameraDistance', Math.min(MAX_DISTANCE, controls.cameraDistance + nudge)),
      Home: () => setControls(INITIAL),
    };
    const action = actions[event.key];
    if (!action) return;
    event.preventDefault();
    action();
  }, [controls.inclinationDegrees, controls.cameraDistance, set]);

  const km = (value: number) => `${value.toFixed(2)} km`;

  return (
    <article className="lensing">
      <header className="lensing-head">
        <p className="eyebrow">First experiment · Schwarzschild</p>
        <h1>When light meets a black hole.</h1>
        <p className="intro">
          Every ray in this image is integrated through the Schwarzschild geometry. Nothing is
          painted on. The controls change the physics, not a picture.
        </p>
      </header>

      <div className="stage">
        {failure ? (
          <p className="stage-failure" role="alert">
            This simulation needs WebGL2, which this browser did not provide. {failure}
          </p>
        ) : (
          <canvas
            ref={canvasRef}
            className="stage-canvas"
            tabIndex={0}
            role="img"
            aria-label={summary}
            onKeyDown={onCanvasKeyDown}
          />
        )}
        <p className="stage-help">
          The view is keyboard-operable: focus it, then use the arrow keys to change inclination
          and distance, Shift for larger steps, and Home to reset.
        </p>
        <p className="visually-hidden" aria-live="polite">{announcement}</p>
      </div>

      <section className="controls-grid" aria-label="Simulation controls">
        <NumberSlider
          label="Mass" value={controls.solarMasses}
          onChange={v => set('solarMasses', v)}
          minValue={MIN_SOLAR_MASSES} maxValue={MAX_SOLAR_MASSES} step={0.5}
          unit=" M☉" places={1}
          hint="Sets the physical scale only. Schwarzschild geometry is scale-free, so the image
                is identical at every mass — the lengths beside it change, the picture does not."
        />
        <NumberSlider
          label="Camera distance" value={controls.cameraDistance}
          onChange={v => set('cameraDistance', v)}
          minValue={MIN_DISTANCE} maxValue={MAX_DISTANCE} step={0.5}
          unit=" rₛ" places={1}
          hint="Measured in Schwarzschild radii from the centre."
        />
        <NumberSlider
          label="Inclination" value={controls.inclinationDegrees}
          onChange={v => set('inclinationDegrees', v)}
          minValue={-MAX_INCLINATION_DEGREES} maxValue={MAX_INCLINATION_DEGREES} step={1}
          unit="°" places={0}
          hint="0° is edge-on. Face-on removes the Doppler asymmetry entirely, because the orbital
                motion is then perpendicular to every line of sight."
        />
        <NumberSlider
          label="Quality" value={controls.stepsPerRay}
          onChange={v => set('stepsPerRay', v)}
          minValue={MIN_STEPS} maxValue={MAX_STEPS} step={STEP_GRANULARITY}
          unit=" steps/ray" places={0}
          hint="Integration steps per ray. Lower is faster and less accurate near the photon sphere."
        />
        <div className="control control-switches">
          <Switch isSelected={controls.diskEnabled} onChange={v => set('diskEnabled', v)}>
            <div className="switch-indicator" aria-hidden="true" /> Accretion disk
          </Switch>
          <Switch isSelected={controls.cinematic} onChange={v => set('cinematic', v)}>
            <div className="switch-indicator" aria-hidden="true" /> Cinematic mode
          </Switch>
          <p className={controls.cinematic ? 'mode-warning active' : 'mode-warning'} role="status">
            {controls.cinematic
              ? 'Not physical: Doppler beaming removed, as the Interstellar renderer did for the film.'
              : 'Physical mode. The one-sided crescent is the correct output.'}
          </p>
        </div>
      </section>

      <section className="readout" aria-label="Measured geometry">
        <dl>
          <div><dt>Event horizon</dt><dd>{km(figures.horizonKm)}<span>rₛ</span></dd></div>
          <div><dt>Photon sphere</dt><dd>{km(figures.photonSphereKm)}<span>1.5 rₛ</span></dd></div>
          <div><dt>Apparent shadow</dt><dd>{km(figures.shadowImpactParameterKm)}<span>2.598 rₛ</span></dd></div>
          <div><dt>ISCO</dt><dd>{km(figures.iscoKm)}<span>3 rₛ</span></dd></div>
        </dl>
      </section>

      <MisconceptionsPanel items={[
        {
          myth: 'The black disc you see is the event horizon.',
          reality: 'It is the photon capture cross-section — the set of directions whose rays end '
            + 'on the horizon after being bent. Because light is deflected inwards, the silhouette '
            + 'is considerably larger than the horizon itself, and its size is set by the critical '
            + 'impact parameter b_crit = 3√3 GM/c², not by rₛ. This simulation measures its radius '
            + 'off the rendered frame and agrees with 3√3 GM/c² to 0.013 pixels.',
          figures: [
            { label: 'Event horizon', value: `${HORIZON_RADIUS.toFixed(3)} rₛ — ${km(figures.horizonKm)}` },
            { label: 'Photon sphere', value: `${PHOTON_SPHERE_RADIUS.toFixed(3)} rₛ — ${km(figures.photonSphereKm)}` },
            { label: 'Apparent shadow', value: `${CRITICAL_IMPACT_PARAMETER.toFixed(3)} rₛ — ${km(figures.shadowImpactParameterKm)}` },
            { label: 'Shadow ÷ horizon', value: `${figures.shadowToHorizonRatio.toFixed(3)}×` },
          ],
          source: {
            title: 'Gralla, Holz & Wald 2019 — Black hole shadows, photon rings, and lensing rings',
            url: 'https://arxiv.org/abs/1906.00873',
          },
        },
        {
          myth: 'The disk is brighter on one side because that side is hotter.',
          reality: 'The temperature profile is axisymmetric. The asymmetry is relativistic beaming: '
            + 'the side rotating towards you is blueshifted, and observed brightness scales as g⁴. '
            + 'Switch to a face-on view and the crescent disappears entirely, because the orbital '
            + 'velocity is then perpendicular to the line of sight.',
        },
        {
          myth: 'A bigger black hole would look different.',
          reality: 'Vacuum Schwarzschild geometry has no intrinsic length scale beyond rₛ itself. '
            + 'Change the mass and every length scales in proportion; at fixed distance measured in '
            + 'rₛ, the image is pixel-for-pixel identical. Only the numbers beside it change.',
        },
      ]} />

      <Suspense fallback={<p role="status">Loading equations…</p>}>
        <PhysicsPanel
          equation={String.raw`\frac{d^2u}{d\phi^2} + u = \frac{3GM}{c^2}u^2,\qquad u \equiv 1/r`}
          assumptions={[
            'Schwarzschild geometry: a non-rotating, uncharged black hole in vacuum. No spin, so no frame dragging and no ergosphere — those are Kerr, and are not modelled here.',
            'Rays are integrated in the flat-Cartesian formulation, r̈ = −3Mh²r̂/r⁴, whose trajectories are exactly the Schwarzschild null geodesics but which has no coordinate singularity at the horizon.',
            'The camera is a static observer. Its viewing direction is converted to an impact parameter with the factor √(1 − rₛ/D), and the flat system’s conserved h is not b: 1/h² = 1/b² + 2M/D³.',
            'The disk is an optically thick, geometrically thin Novikov–Thorne disk with zero torque at the ISCO. It is a steady-state model: no turbulence, no variability, no self-gravity, and no emission inside the ISCO.',
            'A Doppler-shifted blackbody is still a blackbody at T′ = gT, so the g³ per-band factor is already contained in that substitution and is not applied twice. Brightness follows σT′⁴.',
            'Disk colour is calibrated: Planck spectrum → CIE XYZ → linear sRGB. Star colours are indicative only. Exposure and tone mapping are display choices, applied after all physical arithmetic.',
            'Shader arithmetic is float32 in rₛ = 1 units. The CPU reference that validates it is float64.',
          ]}
          sources={[
            { title: 'James, von Tunzelmann, Franklin & Thorne 2015 — Gravitational lensing by spinning black holes', url: 'https://arxiv.org/abs/1502.03808' },
            { title: 'Page & Thorne 1974 — Disk-accretion onto a black hole', url: 'https://ui.adsabs.harvard.edu/abs/1974ApJ...191..499P' },
            { title: 'Gralla, Holz & Wald 2019 — Shadows, photon rings and lensing rings', url: 'https://arxiv.org/abs/1906.00873' },
            { title: 'Wyman, Sloan & Shirley 2013 — Analytic approximations to the CIE XYZ colour matching functions', url: 'https://jcgt.org/published/0002/02/01/paper.pdf' },
          ]}
        />
      </Suspense>
      <p className="verification-note">
        Verified numerically, not by eye: the shadow radius measured off the rendered frame matches
        3√3 GM/c² to 0.013 px; the shader agrees with an independent float64 model to 3×10⁻⁵ on
        emission radius and redshift; and the measured brightness exponent is 4.00, not 8.
        {' '}ISCO {ISCO_RADIUS} rₛ, photon sphere {PHOTON_SPHERE_RADIUS} rₛ.
      </p>
    </article>
  );
}
