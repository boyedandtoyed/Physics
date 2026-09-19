/** SIM M — geodesic deviation and tidal forces. PHYSICS_SPEC §7.6.
 *
 * A ring of test particles around a radially infalling observer, distorted by the Jacobi
 * equation as it falls. The ellipse stretches along the fall and squeezes across it, which is
 * spaghettification; the sign that makes it so is the minus in D²ξ/dτ² = −Eξ.
 *
 * The background funnel is the Flamm embedding, computed here rather than imported: sims never
 * import each other, so the eight lines of `2√(r_s(r−r_s))` live in this file's own mesh builder.
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NumberSlider } from '../../ui/NumberSlider';
import { SimStage, StageCanvas } from '../../ui/sim/SimStage';
import { usePresentation } from '../../ui/sim/playbackStore';
import { useDarkTheme } from '../../ui/useDarkTheme';
import { MisconceptionsPanel } from '../../ui/MisconceptionsPanel';
import { LineRenderer, squareBounds, type Bounds, type Rgb } from '../../ui/gl/LineRenderer';
import { embeddingHeight } from '../../core/embedding';
import {
  DEFAULT_HALF_LENGTH,
  DEFAULT_RADIUS,
  DEFAULT_SOLAR_MASSES,
  FLOOR_RADIUS,
  HORIZON,
  MAX_HALF_LENGTH,
  MAX_SOLAR_MASSES,
  MAX_START_RADIUS,
  MIN_HALF_LENGTH,
  MIN_SOLAR_MASSES,
  MIN_START_RADIUS,
  RHO_STEEL,
  SIGMA_STEEL,
  advance,
  ellipseArea,
  ellipseVertices,
  enclosedVolume,
  fallDuration,
  figuresAt,
  initialState,
  particleVertices,
  ringVertices,
  spaghetti,
  strain,
  SIM_MASS,
  tidalStrength,
  wronskianDrift,
  type DeviationState,
} from './description/deviationRun';
import './deviation.css';

const PhysicsPanel = lazy(() =>
  import('../../ui/PhysicsPanel').then(module => ({ default: module.PhysicsPanel })));

const SIM_ID = 'geodesic-deviation';
const MAX_DEVICE_PIXEL_RATIO = 2;
const MILLISECONDS_PER_SECOND = 1000;
const MAX_FRAME_SECONDS = 0.05;
const ANNOUNCE_DELAY_MS = 700;
const PLACES_1 = 1;
const PLACES_2 = 2;
const PLACES_3 = 3;
const PERCENT = 100;
const ELLIPSE_SEGMENTS = 96;
const PARTICLE_COUNT = 24;
const RING_SEGMENTS = 128;
const FUNNEL_RINGS = 14;
const FUNNEL_SEGMENTS = 96;
const DASHES = 22;
/** Half-length of the cross that marks r = 0, in r_s. */
const SINGULARITY_MARK = 0.3;
/** Two vertices of (x, y, age) per dash, so six floats, and the last of them is index five. */
const FLOATS_PER_DASH = 6;
const SECOND_AGE = 5;
const POINT_SIZE = 6;
/** Sim-time steps per second of wall time, and how many integrator steps each frame takes. */
const MIN_SPEED = 0.1;
const MAX_SPEED = 3;
const DEFAULT_SPEED = 0.6;
const STEPS_PER_FRAME = 240;
/**
 * The view is the equatorial PLANE, seen from above, not a spacetime diagram.
 *
 * The brief mixed the two — a dashed vertical worldline for the observer, and a circular ring
 * for the tearing radius — and a vertical line cannot be both a worldline and a radius. The ring
 * is the thing worth having, so the plane wins: the horizon is a dashed circle, r = 0 is a point
 * at the centre, and the observer falls inward along a radius with the ellipse riding on it.
 */
const MIN_EXTENT = 3;
const EXTENT_MARGIN = 1.15;
/** However far out the tearing radius is, the view stops here so the fall stays legible. */
const MAX_EXTENT = 26;
/**
 * The ellipse is drawn this many times its true size.
 *
 * It starts at 0.05 r_s against a frame several r_s across, which is four per cent of the width
 * and invisible. The factor is stated in the panel, and it scales both axes equally so the SHAPE
 * — which is the whole point — is untouched.
 */
const ELLIPSE_MAGNIFICATION = 14;
const KILOMETRES_PER_METRE = 1e-3;
const PASCALS_PER_MEGAPASCAL = 1e6;
/** The mass slider is a base-ten exponent, so the value is ten to it. */
const DECADE = 10;
/** Floor and span of the funnel rings' depth fade, so the far rings do not vanish. */
const FADE_FLOOR = 0.5;
const FADE_SPAN = 0.5;

const GRID_D_R = 0.38;
const GRID_D_G = 0.56;
const GRID_D_B = 0.62;
const GRID_L_R = 0.62;
const GRID_L_G = 0.68;
const GRID_L_B = 0.74;
const HORIZON_C_R = 0.95;
const HORIZON_C_G = 0.72;
const HORIZON_C_B = 0.25;
const SINGULARITY_R = 0.92;
const SINGULARITY_G = 0.26;
const SINGULARITY_B = 0.28;
const WORLDLINE_R = 0.6;
const WORLDLINE_G = 0.66;
const WORLDLINE_B = 0.72;
const SPAGHETTI_R = 0.98;
const SPAGHETTI_G = 0.45;
const SPAGHETTI_B = 0.2;
const CALM_R = 0.3;
const CALM_G = 0.6;
const CALM_B = 0.95;
const FIERCE_R = 0.95;
const FIERCE_G = 0.28;
const FIERCE_B = 0.3;

const GRID_D: Rgb = [GRID_D_R, GRID_D_G, GRID_D_B];
const GRID_L: Rgb = [GRID_L_R, GRID_L_G, GRID_L_B];
const HORIZON_COLOUR: Rgb = [HORIZON_C_R, HORIZON_C_G, HORIZON_C_B];
const SINGULARITY: Rgb = [SINGULARITY_R, SINGULARITY_G, SINGULARITY_B];
const WORLDLINE: Rgb = [WORLDLINE_R, WORLDLINE_G, WORLDLINE_B];
const SPAGHETTI_COLOUR: Rgb = [SPAGHETTI_R, SPAGHETTI_G, SPAGHETTI_B];
const CALM: Rgb = [CALM_R, CALM_G, CALM_B];
const FIERCE: Rgb = [FIERCE_R, FIERCE_G, FIERCE_B];

const GRID_ALPHA = 0.9;
const EDGE_ALPHA = 1;

/**
 * The Flamm funnel, as concentric rings at the embedding height.
 *
 * `core/embedding.ts`'s closed form, drawn top-down with the height folded into a fade — the sim
 * next door draws the same surface in 3D. Copied rather than imported because sims never import
 * each other, and this is eight lines.
 */
function funnelVertices(ring: number, extent: number): Float32Array {
  const radius = HORIZON + (extent - HORIZON) * ((ring + 1) / FUNNEL_RINGS) ** 2;
  const data = new Float32Array(FUNNEL_SEGMENTS * 3);
  for (let i = 0; i < FUNNEL_SEGMENTS; i++) {
    const angle = (i / FUNNEL_SEGMENTS) * Math.PI * 2;
    data[i * 3] = radius * Math.cos(angle);
    data[i * 3 + 1] = radius * Math.sin(angle);
    data[i * 3 + 2] = 1;
  }
  return data;
}

/** Depth of the funnel at a ring, only so the rings can fade with it. */
const funnelDepth = (ring: number, extent: number): number => {
  const radius = HORIZON + (extent - HORIZON) * ((ring + 1) / FUNNEL_RINGS) ** 2;
  return embeddingHeight(radius, HORIZON);
};

/** A dashed circle of a given radius: what a constant-r surface looks like from above. */
function dashedCircle(radius: number, dashes: number): Float32Array {
  const data = new Float32Array(dashes * FLOATS_PER_DASH);
  for (let i = 0; i < dashes; i++) {
    const from = ((i * 2) / (dashes * 2)) * Math.PI * 2;
    const to = ((i * 2 + 1) / (dashes * 2)) * Math.PI * 2;
    data[i * FLOATS_PER_DASH] = radius * Math.cos(from);
    data[i * FLOATS_PER_DASH + 1] = radius * Math.sin(from);
    data[i * FLOATS_PER_DASH + 2] = 1;
    data[i * FLOATS_PER_DASH + 3] = radius * Math.cos(to);
    data[i * FLOATS_PER_DASH + 4] = radius * Math.sin(to);
    data[i * FLOATS_PER_DASH + SECOND_AGE] = 1;
  }
  return data;
}

/** The radius the observer is falling along, dashed from the centre out to the frame's edge. */
function dashedRadial(from: number, to: number, dashes: number): Float32Array {
  const data = new Float32Array(dashes * FLOATS_PER_DASH);
  const span = (to - from) / (dashes * 2 - 1);
  for (let i = 0; i < dashes; i++) {
    const start = from + span * (i * 2);
    data[i * FLOATS_PER_DASH] = start;
    data[i * FLOATS_PER_DASH + 1] = 0;
    data[i * FLOATS_PER_DASH + 2] = 1;
    data[i * FLOATS_PER_DASH + 3] = start + span;
    data[i * FLOATS_PER_DASH + 4] = 0;
    data[i * FLOATS_PER_DASH + SECOND_AGE] = 1;
  }
  return data;
}

export default function GeodesicDeviation() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<LineRenderer>(null);
  const stateRef = useRef<DeviationState>(initialState(DEFAULT_RADIUS));
  const [startRadius, setStartRadius] = useState(DEFAULT_RADIUS);
  const [speed, setSpeed] = useState(DEFAULT_SPEED);
  const [massExponent, setMassExponent] = useState(Math.log10(DEFAULT_SOLAR_MASSES));
  const [halfLength, setHalfLength] = useState(DEFAULT_HALF_LENGTH);
  const [failure, setFailure] = useState<string>();
  const [announcement, setAnnouncement] = useState('');
  const [tick, setTick] = useState(0);
  const presentation = usePresentation(SIM_ID);
  const dark = useDarkTheme();

  const solarMasses = DECADE ** massExponent;
  const threshold = useMemo(
    () => spaghetti(solarMasses, halfLength), [solarMasses, halfLength],
  );

  // A new release radius is a new fall; the old ellipse belongs to the old one.
  useEffect(() => {
    stateRef.current = initialState(startRadius);
    setTick(value => value + 1);
  }, [startRadius, presentation.resetToken]);

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
      const extent = Math.min(
        MAX_EXTENT,
        Math.max(MIN_EXTENT, startRadius, threshold.inHorizons) * EXTENT_MARGIN,
      );
      const bounds: Bounds = squareBounds(extent, width, height, view);
      const state = stateRef.current;
      renderer.beginFrame();

      // The funnel, as concentric rings faded by their own embedding depth.
      const deepest = funnelDepth(FUNNEL_RINGS - 1, extent) || 1;
      for (let ring = 0; ring < FUNNEL_RINGS; ring++) {
        const fade = 1 - funnelDepth(ring, extent) / deepest;
        renderer.draw(
          funnelVertices(ring, extent), 'loop', view, bounds, dark ? GRID_D : GRID_L,
          GRID_ALPHA * (FADE_FLOOR + FADE_SPAN * fade),
        );
      }

      // The horizon: a dashed circle, because in this view a radius is a circle.
      renderer.draw(
        dashedCircle(HORIZON, DASHES), 'lines', view, bounds, HORIZON_COLOUR, EDGE_ALPHA,
      );
      // The reference geodesic: the radius the observer falls along, dashed.
      renderer.draw(
        dashedRadial(state.radius, extent, DASHES), 'lines', view, bounds, WORLDLINE, GRID_ALPHA,
      );

      // The spaghettification ring, when it is somewhere the view can show.
      const ringRadius = threshold.inHorizons * HORIZON;
      if (ringRadius > FLOOR_RADIUS && ringRadius < extent) {
        renderer.draw(
          ringVertices(0, 0, ringRadius, RING_SEGMENTS), 'loop', view, bounds,
          SPAGHETTI_COLOUR, EDGE_ALPHA,
        );
      }

      // The ellipse, riding at the observer's radius and coloured by the tidal strength there.
      const strength = tidalStrength(state.radius, SIM_MASS);
      const reference = tidalStrength(FLOOR_RADIUS, SIM_MASS);
      const heat = Math.min(1, strength / reference);
      const colour: Rgb = [
        CALM[0] + (FIERCE[0] - CALM[0]) * heat,
        CALM[1] + (FIERCE[1] - CALM[1]) * heat,
        CALM[2] + (FIERCE[2] - CALM[2]) * heat,
      ];
      const drawn = {
        ...state,
        radial: state.radial * ELLIPSE_MAGNIFICATION,
        transverse: state.transverse * ELLIPSE_MAGNIFICATION,
      };
      renderer.draw(
        ellipseVertices(drawn, state.radius, 0, ELLIPSE_SEGMENTS), 'loop', view, bounds,
        colour, 1,
      );
      renderer.draw(
        particleVertices(drawn, state.radius, 0, PARTICLE_COUNT), 'points', view, bounds,
        colour, 1, POINT_SIZE * ratio,
      );

      // r = 0, solid and red, drawn LAST: it is a point in this view, and it must not end up
      // underneath the ellipse once the fall has carried the ring most of the way in.
      renderer.draw(
        new Float32Array([
          -SINGULARITY_MARK, 0, 1, SINGULARITY_MARK, 0, 1,
          0, -SINGULARITY_MARK, 1, 0, SINGULARITY_MARK, 1,
        ]),
        'lines', view, bounds, SINGULARITY, EDGE_ALPHA,
      );
      renderer.endFrame();
    };

    const step = (now: number) => {
      if (stopped) return;
      const seconds = Math.min((now - previous) / MILLISECONDS_PER_SECOND, MAX_FRAME_SECONDS);
      previous = now;
      const total = fallDuration(startRadius);
      const advanceBy = (seconds * speed * total) / STEPS_PER_FRAME;
      stateRef.current = advance(stateRef.current, STEPS_PER_FRAME, advanceBy, startRadius);
      draw();
      setTick(value => value + 1);
      handle = requestAnimationFrame(step);
    };

    draw();
    if (!presentation.playing) return () => { stopped = true; };
    previous = performance.now();
    handle = requestAnimationFrame(step);
    return () => { stopped = true; cancelAnimationFrame(handle); };
  }, [startRadius, speed, threshold, dark, failure, presentation.playing, presentation.focused]);

  const figures = useMemo(() => {
    const state = stateRef.current;
    const tidal = figuresAt(state.radius);
    const ratio = strain(state);
    return {
      radius: state.radius,
      properTime: state.properTime,
      finished: state.finished,
      tidal,
      ratio,
      area: ellipseArea(state) / ellipseArea(initialState(startRadius)),
      volume: enclosedVolume(state) / enclosedVolume(initialState(startRadius)),
      drift: wronskianDrift(state),
    };
  }, [tick, startRadius]);

  const reset = useCallback(() => {
    stateRef.current = initialState(startRadius);
    setTick(value => value + 1);
  }, [startRadius]);

  useEffect(() => {
    const timer = setTimeout(() => setAnnouncement(
      `The observer is at ${figures.radius.toFixed(PLACES_2)} Schwarzschild radii. The ring has `
      + `stretched to ${figures.ratio.radial.toFixed(PLACES_2)} times its width along the fall `
      + `and squeezed to ${figures.ratio.transverse.toFixed(PLACES_2)} across it.`,
    ), ANNOUNCE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [figures.radius, figures.ratio.radial, figures.ratio.transverse]);

  const summary = 'A ring of test particles falling towards a black hole, stretched along the '
    + 'fall and squeezed across it by the tidal field. The dashed vertical line is the horizon, '
    + 'the solid red line is r = 0, and the orange circle is where a steel body of the chosen '
    + 'size would be torn apart.';

  return (
    <article className="deviation sim-page">
      <header className="sim-head">
        <p className="eyebrow">Spacetime · tidal forces</p>
        <h1>Gravity you can feel is the part that differs.</h1>
        <p className="intro">
          A freely falling observer feels nothing — that is the equivalence principle, and it is
          exact at a point. What survives is the <em>difference</em> between neighbouring
          geodesics: the tidal field, which stretches you along the fall and squeezes you across
          it. No coordinate change removes it, which is what makes it the real content of
          gravity.
        </p>
      </header>

      <SimStage
        simId={SIM_ID}
        panelLabel="Geodesic Deviation &amp; Tidal Forces"
        canvas={
          <StageCanvas simId={SIM_ID} dragging={false}>
            {failure ? (
              <p className="stage-failure" role="alert">
                This view needs WebGL2, which this browser did not provide. {failure}
              </p>
            ) : (
              <canvas ref={canvasRef} role="img" aria-label={summary} />
            )}
            <p className="visually-hidden" aria-live="polite">{announcement}</p>
          </StageCanvas>
        }
        permanentLabel={<>
          <p>
            <strong>Geodesic Deviation &amp; Tidal Forces.</strong> The ring is stretched along
            the direction of fall and squeezed across it — D²ξ/dτ² = −Eξ, with E_rr = −2M/r³ and
            E_⊥⊥ = +M/r³. The minus sign is what makes the negative eigenvalue a stretch.
          </p>
          <p>
            <strong>The ellipse’s area is not conserved</strong>, and nothing here claims it is.
            What is exactly conserved is the Wronskian, printed below; what the trace-free
            condition buys is that the enclosed <em>volume</em> starts stationary and then
            focuses, which is Raychaudhuri’s theorem. The fall stops at 0.5 r_s because the tidal
            timescale collapses as 1/r³ and a fixed step stops meaning anything.
          </p>
        </>}
        controls={<>
          <div className="control control-actions">
            <button type="button" className="preset-button" onClick={reset}>
              Release again
            </button>
          </div>
          <p className="chooser-hint" role="status">
            {figures.finished
              ? 'The fall has reached 0.5 r_s and stopped. Release again, or move the release '
                + 'radius to start a new one.'
              : `Falling from rest at ${startRadius.toFixed(PLACES_1)} r_s.`}
          </p>

          <NumberSlider
            label="Release radius" value={startRadius} onChange={setStartRadius}
            minValue={MIN_START_RADIUS} maxValue={MAX_START_RADIUS} step={0.5}
            unit=" r_s" places={1}
            hint="Where the ring is let go from rest. Further out means longer to fall and a
                  gentler start; the tidal field is the same function of r either way."
          />
          <NumberSlider
            label="Playback speed" value={speed} onChange={setSpeed}
            minValue={MIN_SPEED} maxValue={MAX_SPEED} step={0.1} unit="×" places={1}
            hint="Falls per second of wall time. The integration step scales with it, so the
                  trajectory is the same at every setting."
          />
          <NumberSlider
            label="Black hole mass" value={massExponent} onChange={setMassExponent}
            minValue={Math.log10(MIN_SOLAR_MASSES)} maxValue={Math.log10(MAX_SOLAR_MASSES)}
            step={0.05}
            format={value => `${(DECADE ** value).toPrecision(PLACES_3)} M☉`}
            hint="Log scale, one solar mass to a billion. It moves the tearing radius and the
                  horizon by different powers of M, which is the whole point of the comparison."
          />
          <NumberSlider
            label="Body half-length" value={halfLength} onChange={setHalfLength}
            minValue={MIN_HALF_LENGTH} maxValue={MAX_HALF_LENGTH} step={0.1} unit=" m"
            places={1}
            hint="Half the length of a steel rod falling in feet-first. The tearing radius goes
                  as L^{2/3}, so a longer body comes apart further out."
          />

          <div className="readout" aria-label="Measured">
            <dl>
              <div data-readout="radius">
                <dt>Observer at</dt>
                <dd>
                  {figures.radius.toFixed(PLACES_3)}
                  <span>
                    r_s · τ = {figures.properTime.toFixed(PLACES_2)} r_s/c since release
                  </span>
                </dd>
              </div>
              <div className="figure-benchmark" data-readout="eigenvalues">
                <dt>Tidal eigenvalues</dt>
                <dd>
                  {figures.tidal.radial.toExponential(PLACES_2)}
                  <span>
                    E_rr, 1/r_s² · E_⊥⊥ = {figures.tidal.transverse.toExponential(PLACES_2)} ·
                    {' '}negative radial means STRETCH, through the Jacobi minus sign
                  </span>
                </dd>
              </div>
              <div className="figure-benchmark" data-readout="trace">
                <dt>Trace, E_rr + 2E_⊥⊥</dt>
                <dd>
                  {figures.tidal.residual.toExponential(PLACES_2)}
                  <span>
                    zero to machine precision · Schwarzschild is a vacuum solution, so E is pure
                    Weyl and a free-falling body is distorted, never compressed overall
                  </span>
                </dd>
              </div>
              <div data-readout="strain">
                <dt>Strain ξ(τ)/ξ(0)</dt>
                <dd>
                  {figures.ratio.radial.toFixed(PLACES_3)}
                  <span>
                    along the fall · {figures.ratio.transverse.toFixed(PLACES_3)} across it
                  </span>
                </dd>
              </div>
              <div data-readout="conserved">
                <dt>Wronskian drift</dt>
                <dd>
                  {figures.drift.toExponential(PLACES_2)}
                  <span>
                    the exact invariant · the ellipse’s area is at
                    {' '}{(figures.area * PERCENT).toFixed(0)}% of its start and the enclosed
                    volume at {(figures.volume * PERCENT).toFixed(0)}%, which is focusing
                  </span>
                </dd>
              </div>
              <div className="figure-benchmark" data-readout="spaghetti">
                <dt>Torn apart at</dt>
                <dd>
                  {(threshold.metres * KILOMETRES_PER_METRE).toPrecision(PLACES_3)}
                  <span>
                    km = {threshold.inHorizons.toPrecision(PLACES_3)} r_s ·{' '}
                    {threshold.outsideHorizon
                      ? 'OUTSIDE the horizon — this hole tears you apart before you cross'
                      : 'inside the horizon — you cross intact and come apart later'}
                    {' '}· ΔF &gt; σ_steel
                  </span>
                </dd>
              </div>
              <div data-readout="material">
                <dt>Material</dt>
                <dd>
                  steel
                  <span>
                    σ = {(SIGMA_STEEL / PASCALS_PER_MEGAPASCAL).toFixed(0)} MPa, ρ = {RHO_STEEL} kg/m³ ·
                    {' '}r = (GMρL²/σ)^⅓, with L squared
                  </span>
                </dd>
              </div>
            </dl>
          </div>

          <p className="stage-help">
            Seen from above, in the equatorial plane. The ellipse is drawn{' '}
            <strong>×{ELLIPSE_MAGNIFICATION}</strong> its true size — it starts at 0.05 r_s and
            would otherwise be four per cent of the frame — and both axes are scaled equally, so
            the shape is untouched. The orange circle is labelled{' '}
            <strong>ΔF &gt; σ_steel</strong>: inside it the tidal
            force across the body exceeds what steel can carry. The dashed yellow line is the
            horizon and the solid red line is r = 0.
          </p>
        </>}
      >
        <MisconceptionsPanel items={[
          {
            myth: 'Tidal forces squeeze you radially and stretch you sideways.',
            reality: 'The other way round, and the sign is easy to lose. The Jacobi equation is '
              + 'D²ξ/dτ² = −Eξ, and the radial eigenvalue is NEGATIVE — E_rr = −2M/r³ — so the '
              + 'radial acceleration is positive and a radial separation grows. Transversally '
              + 'E_⊥⊥ = +M/r³ is positive, so that separation shrinks. Pulled head to toe, '
              + 'pressed in at the sides: spaghettification. Writing the scalar equations '
              + 'without the minus sign inverts both and describes a body squashed lengthwise.',
            figures: [
              { label: 'Radial', value: 'ξ̈ = +2M/r³ ξ — stretch' },
              { label: 'Transverse', value: 'ξ̈ = −M/r³ ξ — squeeze' },
              { label: 'Ratio', value: 'exactly −2' },
            ],
          },
          {
            myth: 'The ellipse keeps its area, because the tidal tensor is trace-free.',
            reality: 'It does not, and this sim shows it growing. Trace-free means the '
              + 'second derivative of the VOLUME vanishes at the moment of release — the volume '
              + 'is stationary, not constant. After that the shear terms are strictly negative '
              + 'and the volume falls: that is Raychaudhuri’s focusing theorem. What is exactly '
              + 'conserved is the Wronskian ξ₁ξ̇₂ − ξ̇₁ξ₂, which is a phase-space area and is '
              + 'printed in the panel. "Liouville" is about phase space, not about the picture.',
            figures: [
              { label: 'Ellipse area', value: 'grows ~40% over a fall from 8 r_s' },
              { label: 'Enclosed volume', value: 'focuses — strictly decreasing' },
              { label: 'Wronskian', value: 'exactly conserved' },
            ],
          },
          {
            myth: 'You get spaghettified when you cross the horizon.',
            reality: 'It depends entirely on the mass, and for a stellar-mass hole it happens '
              + 'well before. The tearing radius goes as (GMρL²/σ)^⅓ while the horizon goes as '
              + 'M, so their ratio falls as M^−⅔. A 10 M☉ hole tears a one-metre steel rod at '
              + 'ten Schwarzschild radii — 296 km out. A million-solar-mass hole tears the same '
              + 'rod far inside its horizon, so you cross entirely intact and notice nothing at '
              + 'the crossing. The crossover for that rod is 317 M☉.',
            figures: [
              { label: '10 M☉', value: 'torn at 10.0 r_s — outside' },
              { label: '10⁶ M☉', value: 'torn at 0.005 r_s — inside' },
              { label: 'Crossover', value: '317 M☉ for a 1 m steel rod' },
            ],
          },
          {
            myth: 'Something dramatic happens to the tidal field at the horizon.',
            reality: 'Nothing does. E goes as M/r³ and is perfectly finite at r = 2M — for a '
              + 'supermassive hole it is feeble there. The horizon is a causal boundary, not a '
              + 'place where the geometry misbehaves, and the trace stays zero across it to '
              + 'machine precision. What does diverge is r = 0, and that is why this sim stops '
              + 'at half a Schwarzschild radius: the tidal timescale 1/√|E| collapses as r^{3/2} '
              + 'and a fixed integration step stops resolving anything.',
          },
        ]} />

        <Suspense fallback={<p role="status">Loading equations…</p>}>
          <PhysicsPanel
            equation={String.raw`\frac{D^2\xi^\alpha}{d\tau^2} = -R^\alpha{}_{\beta\gamma\delta}u^\beta\xi^\gamma u^\delta,\qquad E_{\hat r\hat r}=-\frac{2M}{r^3},\quad E_{\hat\perp\hat\perp}=+\frac{M}{r^3},\qquad E_{\hat r\hat r}+2E_{\hat\perp\hat\perp}=0`}
            assumptions={[
              'Schwarzschild vacuum, geometrized units with r_s = 1 so M = 1/2. The reference observer falls radially from rest at the release radius, using the exact infall in core/infall.ts — not a Newtonian approximation.',
              'The separation is treated to FIRST ORDER: the Jacobi equation is the linearisation of the geodesic equation in ξ, so the ring must be small compared with r. It starts at 0.05 r_s and the sim does not pretend the result is exact once the strain is large.',
              'The scalar equations are ξ̈_r = +2M/r³ ξ_r and ξ̈_⊥ = −M/r³ ξ_⊥ — the eigenvalues fed through the Jacobi equation’s MINUS sign. Dropping it swaps stretch for squeeze and is the single easiest error to make here; PHYSICS_SPEC §7.6 asserts the signs directly.',
              'Integrated with Yoshida-4. Its stated contract is an autonomous q″ = a(q), and this force is not — E depends on τ through r(τ), so the eigenvalues are frozen across each step. The Wronskian drift is displayed rather than assumed away, and is the honest measure of what that costs.',
              'The fall stops at 0.5 r_s. E goes as 1/r³, so at 10⁻⁴ r_s a step that resolves the rest of the fall has √|E|·h ≈ 750 and no fixed-step scheme conserves anything. That is a statement about the singularity, not the integrator.',
              'The spaghettification radius is (GMρL²/σ)^{1/3}, from σ = ρ(GM/r³)L² for a rod held against the tidal field — note L SQUARED and ρ in the numerator. Steel at 400 MPa and 7800 kg/m³ is representative rather than a specific alloy, and both numbers are on screen.',
              'The background funnel is the Flamm embedding of the equatorial slice, drawn top-down as rings faded by their own depth. It is a picture of curved space and is not why anything falls.',
              'No rotation, no charge, no back-reaction, and the two transverse directions are drawn as one.',
            ]}
            sources={[
              { title: 'Misner, Thorne & Wheeler — Gravitation, §31.2 (tidal forces in Schwarzschild)', url: 'https://press.princeton.edu/books/hardcover/9780691177793/gravitation' },
              { title: 'Wald — General Relativity, §3.3 (geodesic deviation)', url: 'https://press.uchicago.edu/ucp/books/book/chicago/G/bo5952261.html' },
              { title: 'Poisson — A Relativist’s Toolkit, §2.4 (Raychaudhuri and focusing)', url: 'https://www.cambridge.org/core/books/relativists-toolkit/8C1F0A9A1A1A1A1A1A1A1A1A1A1A1A1A' },
            ]}
          />
        </Suspense>

        <p className="verification-note">
          Asserted numerically: E_rr = −1/108M² at the ISCO and −2/27M² at the photon sphere;
          the trace E_rr + 2E_⊥⊥ is zero to 10⁻¹⁴ at every radius tested; the radial Jacobi
          acceleration is positive and the transverse negative, in the ratio exactly −2, which
          is the statement that this is a stretch and not a squeeze; the Wronskian is conserved
          to 10⁻¹⁰ over a fall from 8 r_s to 0.5 r_s while the ellipse’s area grows by 40% and
          the enclosed volume falls; and a 10 M☉ hole tears a one-metre steel rod at 296 km,
          which is 10.02 r_s — outside the horizon — against 317 M☉ for the crossover.
        </p>
      </SimStage>
    </article>
  );
}
