/** SIM L — the Kerr causal diagram, equatorial slice at a/M = ½. PHYSICS_SPEC §7.4b.
 *
 * The honest division, stated here and on screen: the **radial structure** is computed — both
 * horizons, both surface gravities, the exact tortoise coordinate, and therefore where every
 * r = const contour sits and which way it runs — while the **arrangement of the blocks** is the
 * standard one from the literature (Carter 1966; Hawking & Ellis fig. 29). Kerr has no single
 * conformal map of the whole manifold: each horizon must be regularised by its own κ, and κ₊
 * and |κ₋| differ by a factor of fourteen at this spin.
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NumberSlider } from '../../ui/NumberSlider';
import { SimStage, StageCanvas } from '../../ui/sim/SimStage';
import { usePresentation } from '../../ui/sim/playbackStore';
import { useDarkTheme } from '../../ui/useDarkTheme';
import { MisconceptionsPanel } from '../../ui/MisconceptionsPanel';
import { LineRenderer, type Bounds, type Rgb } from '../../ui/gl/LineRenderer';
import { pixelToSim, simToPixel, type CanvasFrame } from '../../ui/gl/canvasMapping';
import { horizonRadii, massInflationRatio, radialTortoise, surfaceGravity } from '../../core/kerr';
import {
  BAND_HEIGHT,
  BLOCKS_PER_REPETITION,
  SPIN,
  blockAt,
  blockTower,
  blockVertices,
  contourRadii,
  contourVertices,
  frameVertices,
  horizonCrossVertices,
  horizonEdges,
  lightConeVertices,
  ringVertices,
  towerHeight,
  type Block,
} from './description/kerrBlocks';
import './kerrPenrose.css';

const PhysicsPanel = lazy(() =>
  import('../../ui/PhysicsPanel').then(module => ({ default: module.PhysicsPanel })));

const SIM_ID = 'penrose-kerr';
const REPETITIONS = 3;
const MAX_DEVICE_PIXEL_RATIO = 2;
const ANNOUNCE_DELAY_MS = 700;
const PLACES_2 = 2;
const PLACES_4 = 4;
const CONTOURS_PER_BLOCK = 4;
const MIN_BANDS = 3;
const MAX_BANDS = 15;
const DEFAULT_BANDS = 6;
const CONE_ARM = 0.34;
const POINT_SIZE = 10;
const TWO = 2;

const EXTERIOR_D_R = 0.13;
const EXTERIOR_D_G = 0.23;
const EXTERIOR_D_B = 0.29;
const EXTERIOR_L_R = 0.87;
const EXTERIOR_L_G = 0.91;
const EXTERIOR_L_B = 0.94;
const BETWEEN_D_R = 0.27;
const BETWEEN_D_G = 0.16;
const BETWEEN_D_B = 0.2;
const BETWEEN_L_R = 0.94;
const BETWEEN_L_G = 0.88;
const BETWEEN_L_B = 0.89;
const INNER_D_R = 0.2;
const INNER_D_G = 0.16;
const INNER_D_B = 0.3;
const INNER_L_R = 0.9;
const INNER_L_G = 0.88;
const INNER_L_B = 0.95;
const EVENT_HORIZON_R = 0.98;
const EVENT_HORIZON_G = 0.72;
const EVENT_HORIZON_B = 0.22;
const CAUCHY_R = 0.95;
const CAUCHY_G = 0.32;
const CAUCHY_B = 0.3;
const RING_R = 0.95;
const RING_G = 0.45;
const RING_B = 0.75;
const CONTOUR_D_R = 0.5;
const CONTOUR_D_G = 0.62;
const CONTOUR_D_B = 0.68;
const CONTOUR_L_R = 0.42;
const CONTOUR_L_G = 0.48;
const CONTOUR_L_B = 0.56;
const CONE_R = 0.85;
const CONE_G = 0.8;
const CONE_B = 0.35;

const EXTERIOR_D: Rgb = [EXTERIOR_D_R, EXTERIOR_D_G, EXTERIOR_D_B];
const EXTERIOR_L: Rgb = [EXTERIOR_L_R, EXTERIOR_L_G, EXTERIOR_L_B];
const BETWEEN_D: Rgb = [BETWEEN_D_R, BETWEEN_D_G, BETWEEN_D_B];
const BETWEEN_L: Rgb = [BETWEEN_L_R, BETWEEN_L_G, BETWEEN_L_B];
const INNER_D: Rgb = [INNER_D_R, INNER_D_G, INNER_D_B];
const INNER_L: Rgb = [INNER_L_R, INNER_L_G, INNER_L_B];
const EVENT_HORIZON: Rgb = [EVENT_HORIZON_R, EVENT_HORIZON_G, EVENT_HORIZON_B];
const CAUCHY: Rgb = [CAUCHY_R, CAUCHY_G, CAUCHY_B];
const RING: Rgb = [RING_R, RING_G, RING_B];
const CONTOUR_D: Rgb = [CONTOUR_D_R, CONTOUR_D_G, CONTOUR_D_B];
const CONTOUR_L: Rgb = [CONTOUR_L_R, CONTOUR_L_G, CONTOUR_L_B];
const CONE: Rgb = [CONE_R, CONE_G, CONE_B];

const CONTOUR_ALPHA = 0.75;
const EDGE_ALPHA = 1;

export default function PenroseKerr() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<LineRenderer>(null);
  const [size, setSize] = useState({ width: 1, height: 1 });
  const [bands, setBands] = useState(DEFAULT_BANDS);
  const [centre, setCentre] = useState(0.5);
  const [event, setEvent] = useState<{ x: number; y: number; block: Block | null } | null>(null);
  const [failure, setFailure] = useState<string>();
  const [announcement, setAnnouncement] = useState('');
  const presentation = usePresentation(SIM_ID);
  const dark = useDarkTheme();

  const tower = useMemo(() => blockTower(REPETITIONS), []);
  const edges = useMemo(() => horizonEdges(tower), [tower]);
  const height = useMemo(() => towerHeight(tower), [tower]);
  const geometry = useMemo(() => {
    const { outer, inner } = horizonRadii(SPIN);
    const gravity = surfaceGravity(SPIN);
    return {
      outer,
      inner,
      gravity,
      ratio: massInflationRatio(SPIN),
      ringTortoise: radialTortoise(0, SPIN),
    };
  }, []);

  /** The vertical window: `bands` bands, centred by the slider. */
  const viewWindow = useMemo(() => {
    const span = bands * BAND_HEIGHT;
    const middle = centre * height;
    return { span, middle, extent: span / TWO };
  }, [bands, centre, height]);

  const frameOf = useCallback((): CanvasFrame => ({
    width: Math.max(1, canvasRef.current?.clientWidth ?? 1),
    height: Math.max(1, canvasRef.current?.clientHeight ?? 1),
    extent: viewWindow.extent,
  }), [viewWindow.extent]);

  useEffect(() => {
    if (presentation.resetToken > 0) setEvent(null);
  }, [presentation.resetToken]);

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
    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => setSize({
      width: Math.max(1, canvas.clientWidth),
      height: Math.max(1, canvas.clientHeight),
    }));
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [failure]);

  useEffect(() => {
    const renderer = rendererRef.current;
    const canvas = canvasRef.current;
    if (!renderer || !canvas || failure) return;
    let handle = 0;

    const draw = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, MAX_DEVICE_PIXEL_RATIO);
      const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
      const height2 = Math.max(1, Math.round(canvas.clientHeight * ratio));
      if (canvas.width !== width || canvas.height !== height2) {
        canvas.width = width;
        canvas.height = height2;
      }
      const view = { x: 0, y: 0, width: 1, height: 1 };
      // The window scrolls vertically, so the bounds are offset rather than centred on zero.
      const aspect = width / height2;
      const halfHeight = aspect >= 1 ? viewWindow.extent : viewWindow.extent / aspect;
      const halfWidth = aspect >= 1 ? viewWindow.extent * aspect : viewWindow.extent;
      const bounds: Bounds = {
        minX: -halfWidth, maxX: halfWidth,
        minY: viewWindow.middle - halfHeight, maxY: viewWindow.middle + halfHeight,
      };
      renderer.beginFrame();

      for (const block of tower) {
        const tint = block.kind === 'exterior' ? (dark ? EXTERIOR_D : EXTERIOR_L)
          : block.kind === 'between' ? (dark ? BETWEEN_D : BETWEEN_L)
            : (dark ? INNER_D : INNER_L);
        renderer.draw(blockVertices(block), 'fan', view, bounds, tint, 1);
      }

      for (const block of tower) {
        for (const radius of contourRadii(block, CONTOURS_PER_BLOCK)) {
          renderer.draw(
            contourVertices(radius, block), 'lines', view, bounds,
            dark ? CONTOUR_D : CONTOUR_L, CONTOUR_ALPHA,
          );
        }
        if (block.kind === 'inner') {
          renderer.draw(ringVertices(block), 'strip', view, bounds, RING, EDGE_ALPHA);
        }
      }

      for (const edge of edges) {
        renderer.draw(
          horizonCrossVertices(edge.atHeight), 'lines', view, bounds,
          edge.isCauchy ? CAUCHY : EVENT_HORIZON, EDGE_ALPHA,
        );
      }
      renderer.draw(
        frameVertices(tower), 'lines', view, bounds, dark ? CONTOUR_D : CONTOUR_L, EDGE_ALPHA,
      );

      if (event) {
        renderer.draw(
          lightConeVertices(event.x, event.y, CONE_ARM), 'lines', view, bounds, CONE, 1,
        );
        renderer.draw(
          new Float32Array([event.x, event.y, 1]), 'points', view, bounds, CONE, 1,
          POINT_SIZE * ratio,
        );
      }
      renderer.endFrame();
      handle = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(handle);
  }, [tower, edges, viewWindow, dark, failure, event, presentation.focused, size]);

  const onCanvasClick = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const frame = frameOf();
    const point = pixelToSim(clientX - rect.left, clientY - rect.top, frame);
    const y = point.y + viewWindow.middle;
    setEvent({ x: point.x, y, block: blockAt(tower, y) });
  }, [frameOf, tower, viewWindow.middle]);

  /** Band labels, placed from the same coordinates the canvas draws with. */
  const labels = useMemo(() => {
    const frame: CanvasFrame = {
      width: size.width, height: size.height, extent: viewWindow.extent,
    };
    return tower
      .map(block => {
        const at = simToPixel(0, (block.bottom + block.top) / TWO - viewWindow.middle, frame);
        return { block, at };
      })
      .filter(item => item.at.y > 0 && item.at.y < size.height);
  }, [tower, size, viewWindow]);

  useEffect(() => {
    const timer = setTimeout(() => setAnnouncement(
      event?.block
        ? `Event in ${event.block.label}. Here r is a ${event.block.radiusIsTime
          ? 'time, so r = 0 cannot be avoided by waiting'
          : 'place, so worldlines can move both inward and outward'}.`
        : 'Click a block to place an event and draw its light cone.',
    ), ANNOUNCE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [event]);

  const summary = 'A Kerr causal diagram for spin a/M = 0.5, equatorial slice. Blocks of '
    + 'exterior, between-horizons and inner regions repeat up the page without end. The inner '
    + 'boundary of each pair is the Cauchy horizon, drawn as a warning.';

  return (
    <article className="penrose-kerr sim-page">
      <header className="sim-head">
        <p className="eyebrow">Spacetime · causal structure</p>
        <h1>The one with a door at the bottom.</h1>
        <p className="intro">
          A rotating hole has two horizons, and past the inner one the pattern begins again —
          another between-horizons block, another exterior, for ever. The singularity is a ring
          and it is <em>timelike</em>: unlike Schwarzschild’s, it can be missed. Whether any of
          this survives a perturbation is the question the Cauchy horizon answers, badly.
        </p>
      </header>

      <SimStage
        simId={SIM_ID}
        panelLabel="The tower"
        canvas={
          <StageCanvas simId={SIM_ID} dragging={false} clickToExpand={false}>
            {failure ? (
              <p className="stage-failure" role="alert">
                This view needs WebGL2, which this browser did not provide. {failure}
              </p>
            ) : (
              <>
                <canvas
                  ref={canvasRef}
                  tabIndex={0}
                  role="img"
                  aria-label={summary}
                  onClick={click => onCanvasClick(click.clientX, click.clientY)}
                />
                {labels.map(item => (
                  <p
                    key={`${item.block.repetition}-${item.block.bottom}`}
                    className={`kerr-band-label is-${item.block.kind}`}
                    style={{ left: '50%', top: item.at.y }}
                  >{item.block.label}</p>
                ))}
              </>
            )}
            <p className="visually-hidden" aria-live="polite">{announcement}</p>
          </StageCanvas>
        }
        permanentLabel={<>
          <p>
            <strong>Kerr diagram for a/M = 0.5, equatorial slice. The Cauchy horizon (inner
            boundary) is physically unstable — GR predicts it becomes singular under
            perturbations (mass inflation). The diagram beyond it is not expected to represent
            physical reality. Ref: Penrose 1968; Poisson &amp; Israel 1990.</strong>
          </p>
          <p>
            <strong>What is computed and what is not.</strong> The horizon radii, both surface
            gravities, the exact tortoise coordinate r*(r) and therefore every r = const contour’s
            position and direction are computed. The <em>arrangement</em> of the blocks is the
            standard one from Carter 1966 — Kerr has no single conformal map of the whole
            manifold, because each horizon must be regularised by its own κ, and κ₊ and |κ₋|
            differ by a factor of {geometry.ratio.toFixed(1)} here.
          </p>
        </>}
        controls={<>
          <NumberSlider
            label="Scroll the tower" value={centre} onChange={setCentre}
            minValue={0} maxValue={1} step={0.01} places={2}
            hint="The pattern repeats without end; three repetitions are drawn, which is enough
                  to see that it does not stop."
          />
          <NumberSlider
            label="Bands in view" value={bands} onChange={setBands}
            minValue={MIN_BANDS} maxValue={MAX_BANDS} step={1} places={0}
            hint="The tower is tall and thin, as the standard figures are. This is the window
                  onto it."
          />

          <div className="readout" aria-label="Measured">
            <dl>
              <div className="figure-benchmark" data-readout="horizons">
                <dt>The two horizons</dt>
                <dd>
                  {geometry.outer.toFixed(PLACES_4)} / {geometry.inner.toFixed(PLACES_4)}
                  <span>r₊ / r₋ in M, at a/M = {SPIN} — M ± √(M² − a²)</span>
                </dd>
              </div>
              <div className="figure-benchmark" data-readout="gravity">
                <dt>Surface gravities</dt>
                <dd>
                  {geometry.gravity.outer.toFixed(PLACES_4)} /{' '}
                  {geometry.gravity.inner.toFixed(PLACES_4)}
                  <span>
                    κ₊ / κ₋ in 1/M. κ₋ is negative and {geometry.ratio.toFixed(PLACES_2)}× larger
                    in magnitude — that ratio is the mass-inflation instability
                  </span>
                </dd>
              </div>
              <div data-readout="ring">
                <dt>Ring singularity</dt>
                <dd>
                  r* = {geometry.ringTortoise.toFixed(PLACES_4)}
                  <span>
                    M — <strong>finite</strong>, unlike either horizon at r* = ∓∞. That is why
                    r = 0 is a timelike line inside the block rather than a spacelike end, and
                    why the spacetime continues past it
                  </span>
                </dd>
              </div>
              <div data-readout="block">
                <dt>Last click</dt>
                <dd>
                  {event?.block
                    ? event.block.radiusIsTime ? 'r is a TIME here' : 'r is a place here'
                    : '—'}
                  <span>
                    {event?.block
                      ? `${event.block.label} · ${event.block.radiusIsTime
                        ? 'Δ < 0, so r = const is a spacelike slice and falling inward is as '
                          + 'unavoidable as next Tuesday'
                        : 'Δ > 0, so r = const is a timelike surface and you can hover'}`
                      : 'click a block'}
                  </span>
                </dd>
              </div>
              <div data-readout="pattern">
                <dt>Blocks drawn</dt>
                <dd>
                  {tower.length}
                  <span>
                    {REPETITIONS} repetitions × {BLOCKS_PER_REPETITION} blocks · the real tower
                    has no top and no bottom
                  </span>
                </dd>
              </div>
            </dl>
          </div>

          <p className="chooser-hint">
            Yellow crossings are the event horizon at r₊. <strong>Red crossings are the Cauchy
            horizon at r₋</strong>, drawn as a warning because that is what it is. The magenta
            line is the ring singularity, vertical because it is timelike.
          </p>
        </>}
      >
        <MisconceptionsPanel items={[
          {
            myth: 'The extra regions are somewhere you could actually travel to.',
            reality: 'Almost certainly not, and the diagram’s own inner boundary is why. An '
              + 'ingoing perturbation is blueshifted at the Cauchy horizon as e^{|κ₋|v} while '
              + 'the outgoing tail from the collapse decays only as a power of v, so the flux '
              + 'measured there diverges — mass inflation. At a/M = 0.5 the inner surface '
              + 'gravity is 13.93 times the outer one, and that ratio is the instability. The '
              + 'maximal extension is a solution of the vacuum equations; it is not a prediction '
              + 'about what a real rotating hole contains.',
            figures: [
              { label: 'κ₊', value: '0.2321 / M' },
              { label: 'κ₋', value: '−3.2321 / M' },
              { label: '|κ₋| / κ₊', value: '13.93 — the blueshift rate' },
            ],
          },
          {
            myth: 'A Kerr singularity is unavoidable, like a Schwarzschild one.',
            reality: 'It is avoidable, and that is the deepest difference between the two. '
              + 'Schwarzschild’s r = 0 is spacelike: inside the horizon it lies in your future '
              + 'the way tomorrow does, and no worldline misses it. Kerr’s is a ring at r = 0, '
              + 'θ = π/2, and it is timelike — a place, not a moment. A geodesic with any '
              + 'inclination at all passes through the disc r = 0 into a region with r < 0. This '
              + 'sim draws the equatorial slice, which is precisely the one slice where the ring '
              + 'cannot be dodged.',
            figures: [
              { label: 'Schwarzschild r = 0', value: 'spacelike — drawn horizontal' },
              { label: 'Kerr ring', value: 'timelike — drawn vertical' },
              { label: 'r* at the ring', value: 'finite: 0.2688 M' },
            ],
          },
          {
            myth: 'Between the horizons is just more of the inside.',
            reality: 'It is the only part where r is a TIME. Δ = r² − 2Mr + a² is negative only '
              + 'between r₋ and r₊, and where Δ < 0 the r direction is timelike — so r = const is '
              + 'a spacelike slice, shrinking r is as unavoidable as the clock advancing, and '
              + 'the contours in that band are drawn horizontal for that reason. Cross the '
              + 'Cauchy horizon and Δ turns positive again: r becomes a place, you can hover, '
              + 'and the compulsion stops.',
          },
          {
            myth: 'This diagram was derived the way the Schwarzschild one was.',
            reality: 'It was not, and pretending otherwise would be the easy lie. Schwarzschild '
              + 'has one conformal map of the whole manifold; Kerr has none, because each '
              + 'horizon has to be regularised by its own surface gravity and the two differ by '
              + 'a factor of fourteen here. What this sim computes is the radial structure — '
              + 'r±, κ±, the exact r*(r), and hence where each contour lies and which way it '
              + 'runs. What it takes from Carter 1966 is the arrangement of the blocks.',
          },
        ]} />

        <Suspense fallback={<p role="status">Loading equations…</p>}>
          <PhysicsPanel
            equation={String.raw`r_* = r + \frac{\ln|r-r_+|}{2\kappa_+} + \frac{\ln|r-r_-|}{2\kappa_-},\qquad \kappa_\pm=\frac{r_\pm-r_\mp}{4Mr_\pm},\qquad \Delta=r^2-2Mr+a^2`}
            assumptions={[
              'Kerr, a/M = 0.5, M = 1, equatorial slice only. The two suppressed directions are not symmetric here the way they are in Schwarzschild, and the off-equatorial structure — including the passage through the ring to r < 0 — is not drawn.',
              'COMPUTED: r± = M ± √(M² − a²); κ± = (r± − r∓)/4Mr±, which uses r±² + a² = 2Mr±; the exact tortoise coordinate r*(r), whose coefficients are exactly 1/2κ±; and from it every contour’s position and orientation.',
              'FROM THE LITERATURE: the arrangement of the blocks — exterior, between-horizons, inner, repeating. Carter 1966 and Hawking & Ellis fig. 29. Kerr admits no single conformal map of the whole manifold, so this cannot be derived from one formula and is not presented as though it were.',
              'Each horizon is regularised by its OWN surface gravity. Using κ₊ throughout puts the Cauchy horizon at 0.43 across its block instead of 0.94 — it would look like the middle of the region rather than its boundary. The factor of 13.93 between κ₊ and |κ₋| is exactly why.',
              'r*(0) is FINITE — 0.2688 M — while both horizons sit at r* = ∓∞. That is the computed reason the ring is a timelike line at a definite place and the spacetime continues past it, rather than a spacelike end like Schwarzschild’s.',
              'The Cauchy horizon is unstable. Mass inflation (Poisson & Israel 1990) makes the curvature there diverge under any realistic perturbation, so everything above the first Cauchy horizon in this picture is a feature of the exact vacuum solution and not a claim about a real black hole.',
              'No matter, no charge, no quantum effects, and no attempt to draw the r < 0 region reached through the ring.',
            ]}
            sources={[
              { title: 'Carter 1966 — Complete analytic extension of the symmetry axis of Kerr’s solution', url: 'https://journals.aps.org/pr/abstract/10.1103/PhysRev.141.1242' },
              { title: 'Poisson & Israel 1990 — Internal structure of black holes (mass inflation)', url: 'https://journals.aps.org/prd/abstract/10.1103/PhysRevD.41.1796' },
              { title: 'Penrose 1968 — Structure of space-time (the Cauchy horizon instability)', url: 'https://link.springer.com/article/10.1007/BF01645389' },
              { title: 'Hawking & Ellis — The Large Scale Structure of Space-Time, §5.6', url: 'https://www.cambridge.org/core/books/large-scale-structure-of-spacetime/1E6B961EC9878E0A8B0A2C5A0A1A0A1A' },
            ]}
          />
        </Suspense>

        <p className="verification-note">
          Asserted numerically: r₊ = 1.8660 M and r₋ = 0.1340 M at a/M = ½; κ₊ = 0.2320508076/M
          and κ₋ = −3.2320508076/M, agreeing with the (r± − r∓)/2(r±² + a²) form to 10⁻¹⁵; their
          ratio is 13.9282, and exactly r₊/r₋; the tortoise coefficients are exactly 1/2κ±, and
          differentiating r* recovers (r² + a²)/Δ; r*(0) = 0.2688 M is finite while both horizons
          run to ∓∞; Δ is negative only between the horizons, which is what flips every contour
          in that band from vertical to horizontal; and using κ₊ alone would put the Cauchy
          horizon at 0.43 of its block instead of 0.94, which is the assertion that the two
          surface gravities are both needed.
        </p>
      </SimStage>
    </article>
  );
}
