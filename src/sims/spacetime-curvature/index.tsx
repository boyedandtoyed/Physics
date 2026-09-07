/** Spacetime curvature: the embedding diagram, drawn exactly and labelled honestly.
 *
 * PHYSICS_SPEC §2.1a. Every vertex sits at z = 2√(r_s(r − r_s)); the surface is the Flamm
 * paraboloid, not a sculpted funnel. What makes this worth shipping is not the picture — it is
 * the three things the picture does not show, which §2.1a requires the UI to say.
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from 'react-aria-components';
import { NumberSlider } from '../../ui/NumberSlider';
import { MisconceptionsPanel } from '../../ui/MisconceptionsPanel';
import { SimStage, StageCanvas } from '../../ui/sim/SimStage';
import { usePlaybackStore, usePresentation } from '../../ui/sim/playbackStore';
import { useOrbitControls, useWheelZoom } from '../../ui/sim/useOrbitControls';
import { embeddingHeight, spatialShareOfDeflection } from '../../core/embedding';
import { APPLE_SPEED, C, DEGREES_IN_HALF_TURN } from '../../core/units';
import { GridRenderer, DEFAULT_GRID_PARAMS } from './view/GridRenderer';
import './curvature.css';

const PhysicsPanel = lazy(() =>
  import('../../ui/PhysicsPanel').then(module => ({ default: module.PhysicsPanel })));

const SIM_ID = 'spacetime-curvature';
const MIN_OUTER = 4;
const MAX_OUTER = 40;
const MIN_DEPTH_SCALE = 0.25;
const MAX_DEPTH_SCALE = 3;
const MIN_DISTANCE = 6;
const MAX_DISTANCE = 90;
/** Stop just short of straight down, where the camera basis degenerates. */
const POLE_MARGIN_RADIANS = 0.05;
const MAX_INCLINATION = Math.PI / 2 - POLE_MARGIN_RADIANS;
const ANNOUNCE_DELAY_MS = 600;
const MAX_DEVICE_PIXEL_RATIO = 2;
const DEGREES_PER_RADIAN = DEGREES_IN_HALF_TURN / Math.PI;
/** Azimuth of the named viewpoints: enough off-axis to read as three-dimensional. */
const PRESET_AZIMUTH = 0.6;
/** Nearly edge-on, so the funnel reads as a profile rather than a disc. */
const SIDE_INCLINATION = 0.02;
/** ~60 s for a full turn: slower than the lensing sim, since there is less to look at. */
const IDLE_DRIFT_RADIANS_PER_SECOND = 0.1;

/** Wireframe colours per theme, as linear RGB channels.
 *
 * The canvas is transparent so the page background shows through, which means the mesh has to
 * carry enough contrast against a light panel as well as a dark one — a single palette washes
 * out on one of them. Named channel by channel because every number in this repo is named.
 */
const DARK_LINE_R = 0.42;
const DARK_LINE_G = 0.72;
const DARK_LINE_B = 0.66;
const LIGHT_LINE_R = 0.05;
const LIGHT_LINE_G = 0.32;
const LIGHT_LINE_B = 0.28;
const DARK_HORIZON_R = 1.0;
const DARK_HORIZON_G = 0.62;
const DARK_HORIZON_B = 0.28;
const LIGHT_HORIZON_R = 0.72;
const LIGHT_HORIZON_G = 0.34;
const LIGHT_HORIZON_B = 0.05;

const DARK_LINE: readonly [number, number, number] = [DARK_LINE_R, DARK_LINE_G, DARK_LINE_B];
const LIGHT_LINE: readonly [number, number, number] = [LIGHT_LINE_R, LIGHT_LINE_G, LIGHT_LINE_B];
const DARK_HORIZON: readonly [number, number, number] =
  [DARK_HORIZON_R, DARK_HORIZON_G, DARK_HORIZON_B];
const LIGHT_HORIZON: readonly [number, number, number] =
  [LIGHT_HORIZON_R, LIGHT_HORIZON_G, LIGHT_HORIZON_B];

function prefersDark(): boolean {
  const explicit = document.documentElement.dataset.theme;
  if (explicit === 'dark') return true;
  if (explicit === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

interface View {
  distance: number;
  inclination: number;
  azimuth: number;
  outerRadius: number;
  depthScale: number;
}

const INITIAL: View = {
  distance: DEFAULT_GRID_PARAMS.distance,
  inclination: DEFAULT_GRID_PARAMS.inclination,
  azimuth: DEFAULT_GRID_PARAMS.azimuth,
  outerRadius: DEFAULT_GRID_PARAMS.outerRadius,
  depthScale: 1,
};

/** Named viewpoints. The angles are the whole content of a preset; nothing else changes. */
const PRESETS = [
  { id: 'birds-eye', label: "Bird's eye", inclination: MAX_INCLINATION, azimuth: PRESET_AZIMUTH },
  { id: 'side', label: 'Side', inclination: SIDE_INCLINATION, azimuth: PRESET_AZIMUTH },
  { id: 'free', label: 'Three-quarter', inclination: DEFAULT_GRID_PARAMS.inclination, azimuth: PRESET_AZIMUTH },
] as const;

export default function SpacetimeCurvature() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<GridRenderer>(null);
  const [view, setView] = useState<View>(INITIAL);
  const [failure, setFailure] = useState<string>();
  /** Bumped when the theme changes, so the wireframe is redrawn in the new palette. */
  const [themeTick, setThemeTick] = useState(0);
  const [announcement, setAnnouncement] = useState('');
  const presentation = usePresentation(SIM_ID);
  const setFocused = usePlaybackStore(state => state.setFocused);

  const pose = useMemo(
    () => ({ distance: view.distance, inclination: view.inclination, azimuth: view.azimuth }),
    [view.distance, view.inclination, view.azimuth],
  );
  const onOrbit = useCallback((next: typeof pose) => {
    setView(previous => ({ ...previous, ...next }));
  }, []);
  const onDrift = useCallback((delta: number) => {
    setView(previous => ({ ...previous, azimuth: previous.azimuth + delta }));
  }, []);

  const orbit = useOrbitControls({
    pose,
    onChange: onOrbit,
    onDrift,
    limits: { minDistance: MIN_DISTANCE, maxDistance: MAX_DISTANCE, maxInclination: MAX_INCLINATION },
    idleDriftRadiansPerSecond: IDLE_DRIFT_RADIANS_PER_SECOND,
    playing: presentation.playing,
  });
  useWheelZoom(canvasRef, orbit.zoomBy);

  useEffect(() => {
    if (presentation.resetToken > 0) setView(INITIAL);
  }, [presentation.resetToken]);

  // The canvas is transparent and the palette is chosen in JS, so a theme change has to trigger
  // a redraw; CSS alone cannot recolour lines already in the framebuffer.
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
      rendererRef.current = new GridRenderer(canvas);
      setFailure(undefined);
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
      return undefined;
    }
    return () => { rendererRef.current?.dispose(); rendererRef.current = null; };
  }, []);

  // One draw per change. A static wireframe has nothing to animate, so there is no loop to
  // leave running — pausing stops the idle drift, which is the only thing that moves.
  useEffect(() => {
    const canvas = canvasRef.current;
    const renderer = rendererRef.current;
    if (!canvas || !renderer || failure) return;
    const ratio = Math.min(window.devicePixelRatio || 1, MAX_DEVICE_PIXEL_RATIO);
    const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
    const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const dark = prefersDark();
    renderer.setParams({
      ...view,
      lineColour: dark ? DARK_LINE : LIGHT_LINE,
      horizonColour: dark ? DARK_HORIZON : LIGHT_HORIZON,
    });
    renderer.render();
  }, [view, failure, presentation.focused, themeTick]);

  const figures = useMemo(() => ({
    throatDepth: embeddingHeight(view.outerRadius),
    appleShare: spatialShareOfDeflection(APPLE_SPEED / C),
  }), [view.outerRadius]);

  const summary = useMemo(() => (
    `Embedding diagram of the equatorial plane at constant Schwarzschild time, drawn out to `
    + `${view.outerRadius.toFixed(0)} Schwarzschild radii, where the surface is `
    + `${figures.throatDepth.toFixed(2)} radii deep. The throat is the horizon. `
    + `Viewpoint: ${(view.inclination * DEGREES_PER_RADIAN).toFixed(0)} degrees above the plane.`
  ), [view.outerRadius, view.inclination, figures.throatDepth]);

  useEffect(() => {
    const timer = setTimeout(() => setAnnouncement(summary), ANNOUNCE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [summary]);

  const onCanvasKeyDown = useCallback((event: React.KeyboardEvent<HTMLCanvasElement>) => {
    if (event.key === 'Home') { event.preventDefault(); setView(INITIAL); return; }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault(); setFocused(SIM_ID, true); return;
    }
    orbit.handlers.onKeyDown(event);
  }, [orbit, setFocused]);

  return (
    <article className="curvature sim-page">
      <div className="sim-head">
        <p className="eyebrow">Geometry · The embedding diagram</p>
        <h1>The picture everyone has seen.</h1>
        <p className="intro">
          This is the real surface — every point sits at z = 2√(r<sub>s</sub>(r − r<sub>s</sub>)),
          the exact embedding of a slice of Schwarzschild space. It is also the most misleading
          image in the subject, and the three reasons why are below the view, not buried in a
          footnote.
        </p>
      </div>

      <SimStage
        simId={SIM_ID}
        panelLabel="View"
        canvas={
          <StageCanvas simId={SIM_ID} dragging={orbit.dragging}>
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
                {...orbit.handlers}
                onKeyDown={onCanvasKeyDown}
              />
            )}
            <p className="visually-hidden" aria-live="polite">{announcement}</p>
          </StageCanvas>
        }
        controls={<>
          <div className="preset-group">
            <p className="preset-label" id="camera-presets">Camera</p>
            <div className="preset-buttons" role="group" aria-labelledby="camera-presets">
              {PRESETS.map(preset => (
                <Button
                  key={preset.id}
                  className="preset"
                  onPress={() => setView(previous => ({
                    ...previous, inclination: preset.inclination, azimuth: preset.azimuth,
                  }))}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
          </div>

          <NumberSlider
            label="Outer edge" value={view.outerRadius}
            onChange={v => setView(previous => ({ ...previous, outerRadius: v }))}
            minValue={MIN_OUTER} maxValue={MAX_OUTER} step={1}
            unit=" rₛ" places={0}
            hint="The paraboloid is unbounded — z grows as 2√(rₛr) forever — so any drawing has to
                  stop somewhere. This is where."
          />
          <NumberSlider
            label="Depth exaggeration" value={view.depthScale}
            onChange={v => setView(previous => ({ ...previous, depthScale: v }))}
            minValue={MIN_DEPTH_SCALE} maxValue={MAX_DEPTH_SCALE} step={0.05}
            unit="×" places={2}
            hint="Stretches the vertical direction for viewing. 1.00× is the true surface;
                  anything else is a display choice and changes no radius."
          />
          <NumberSlider
            label="Distance" value={view.distance}
            onChange={v => setView(previous => ({ ...previous, distance: v }))}
            minValue={MIN_DISTANCE} maxValue={MAX_DISTANCE} step={1}
            unit=" rₛ" places={0}
            hint="Camera distance. Drag the view to orbit and scroll to zoom."
          />

          <dl className="figures">
            <div>
              <dt>Depth at the outer edge</dt>
              <dd>{figures.throatDepth.toFixed(2)}<span>rₛ below the throat</span></dd>
            </div>
            <div>
              <dt>Spatial share for a falling apple</dt>
              <dd>{figures.appleShare.toExponential(2)}<span>= (v/c)²</span></dd>
            </div>
          </dl>

          <p className="stage-help">
            Drag to orbit, scroll to zoom. From the keyboard: focus the view, arrows orbit,
            <kbd>+</kbd>/<kbd>−</kbd> zoom, <kbd>Home</kbd> resets. Click to expand.
          </p>
        </>}
      >
        <p className="required-label">
          A spatial slice at constant Schwarzschild time, embedded in a flat space for viewing.
          The vertical direction is not a direction you can move in, and the same geometry is
          exactly flat when sliced by a free-faller’s clock.
        </p>

        <MisconceptionsPanel items={[
          {
            myth: 'Things fall because they roll down the funnel.',
            reality: 'The rolling needs a downward gravity to do it — the picture assumes the '
              + 'thing it claims to explain. Worse, this surface shows the curvature of SPACE, '
              + 'and space curvature is very nearly not why anything falls: the ratio of the '
              + 'spatial to the temporal contribution is exactly (v/c)², which for a falling '
              + 'apple is about one part in 10¹⁵. Everyday falling is almost entirely the '
              + 'curvature of TIME, which this surface does not show at all.',
            figures: [
              { label: 'Spatial share, falling apple', value: '1.11×10⁻¹⁵' },
              { label: 'Spatial share, light', value: '1 — equal' },
              { label: 'What the funnel shows', value: 'the spatial part only' },
            ],
          },
          {
            myth: 'Space really is shaped like this.',
            reality: 'The funnel is a property of the slicing, not of the spacetime. Slice the '
              + 'same Schwarzschild geometry at constant Gullstrand–Painlevé time instead — a '
              + 'free-faller’s clock — and the spatial slices are exactly flat Euclidean space. '
              + 'A curved sheet and a flat sheet, same spacetime. Nothing invariant distinguishes '
              + 'them, which is the same lesson the four-chart Interpretations module draws.',
            source: {
              title: 'Hamilton & Lisle 2008 — The river model of black holes',
              url: 'https://arxiv.org/abs/gr-qc/0411060',
            },
          },
          {
            myth: 'The vertical axis is a real direction.',
            reality: 'It is an embedding dimension with no counterpart in the spacetime. You '
              + 'cannot move along it, nothing is "below" the sheet, and the depth you see is an '
              + 'artefact of choosing to draw a curved 2D surface inside a flat 3D one. The only '
              + 'physical content is how distances and angles behave within the surface.',
          },
        ]} />

        <Suspense fallback={<p role="status">Loading equations…</p>}>
          <PhysicsPanel
            equation={String.raw`d\sigma^2 = \frac{dr^2}{1-r_s/r} + r^2d\phi^2,\qquad z(r) = 2\sqrt{r_s\,(r-r_s)}`}
            assumptions={[
              'The equatorial plane θ = π/2 of Schwarzschild geometry, at constant Schwarzschild coordinate time. A spatial slice, not spacetime.',
              'Embedded in flat Euclidean 3-space, which is possible for this slice and is what fixes z(r) uniquely up to a sign. The embedding satisfies (dz/dr)² + 1 = (1 − rₛ/r)⁻¹ exactly, asserted at eight radii.',
              'Defined only outside the horizon. The surface has a vertical tangent at the throat and does not continue inside, where r is not a radial coordinate.',
              'The paraboloid is unbounded: z grows as 2√(rₛr) without limit, so the drawn outer edge is a display choice, exposed as a control.',
              'Depth exaggeration stretches the vertical direction for viewing only. It changes no radius and no physical quantity; 1.00× is the true surface.',
              'Line fading with distance is a depth cue applied to colour, never to position.',
            ]}
            sources={[
              { title: 'Flamm 1916 — Beiträge zur Einsteinschen Gravitationstheorie', url: 'https://ui.adsabs.harvard.edu/abs/1916PhyZ...17..448F' },
              { title: 'Misner, Thorne & Wheeler — Gravitation, §23.8', url: 'https://press.princeton.edu/books/hardcover/9780691177793/gravitation' },
              { title: 'Carroll — Spacetime and Geometry, §5.7', url: 'https://www.preposterousuniverse.com/spacetimeandgeometry/' },
            ]}
          />
        </Suspense>

        <p className="verification-note">
          Verified numerically, not by eye: every vertex in the wireframe is asserted to sit at
          z = 2√(rₛ(r − rₛ)) and at its own cylindrical radius, the embedding identity
          (dz/dr)² + 1 = (1 − rₛ/r)⁻¹ holds to 10⁻¹² at eight radii, and no vertex reaches inside
          the horizon.
        </p>
      </SimStage>
    </article>
  );
}
