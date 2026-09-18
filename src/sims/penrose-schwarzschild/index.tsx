/** SIM K — the Penrose conformal diagram of Schwarzschild. PHYSICS_SPEC §7.4a.
 *
 * The same spacetime as the Kruskal sim with infinity brought onto the page. The map is
 * `core/kruskal`'s `penrose`; the shape it produces — which corner is which infinity, and what a
 * given event can reach — is `description/conformal.ts`.
 *
 * Every boundary is labelled, because on a conformal diagram the boundary is the content.
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from 'react-aria-components';
import { NumberSlider } from '../../ui/NumberSlider';
import { SimStage, StageCanvas } from '../../ui/sim/SimStage';
import { usePresentation } from '../../ui/sim/playbackStore';
import { useDarkTheme } from '../../ui/useDarkTheme';
import { MisconceptionsPanel } from '../../ui/MisconceptionsPanel';
import { LineRenderer, squareBounds, type Bounds, type Rgb } from '../../ui/gl/LineRenderer';
import { pixelToSim, simToPixel, type CanvasFrame } from '../../ui/gl/canvasMapping';
import {
  BOUNDARIES,
  CORNERS,
  REGION_SHAPES,
  futureConeFill,
  futureConeVertices,
  infallWorldline,
  jaggedVertices,
  polygonVertices,
  extentFor,
  readConformal,
  segmentVertices,
  staticWorldline,
  trackVertices,
  type ConformalReading,
  type ConformalSample,
} from './description/conformal';
import './penrose.css';

const PhysicsPanel = lazy(() =>
  import('../../ui/PhysicsPanel').then(module => ({ default: module.PhysicsPanel })));

const SIM_ID = 'penrose-schwarzschild';

const MAX_DEVICE_PIXEL_RATIO = 2;
const ANNOUNCE_DELAY_MS = 700;
const PLACES_2 = 2;
const WORLDLINE_SAMPLES = 241;
const FALL_SAMPLES = 401;
const STATIC_SPAN = 60;
const JAG_STEPS = 40;
const JAG_SIZE = 0.012;
const POINT_SIZE = 10;
/** Where the static observer stands, in r_s — the slider is quoted in M. */
const MIN_STAND_M = 2.05;
const MAX_STAND_M = 12;
const DEFAULT_STAND_M = 4;
const MIN_RELEASE_M = 2.2;
const MAX_RELEASE_M = 14;
const DEFAULT_RELEASE_M = 6;

/** Every channel named, because `no-magic-numbers` is on over sims/ and a colour table is the
 * one place a bare literal would otherwise pile up. */
const EXTERIOR_D_R = 0.14;
const EXTERIOR_D_G = 0.24;
const EXTERIOR_D_B = 0.3;
const EXTERIOR_L_R = 0.86;
const EXTERIOR_L_G = 0.9;
const EXTERIOR_L_B = 0.93;
const HOLE_D_R = 0.26;
const HOLE_D_G = 0.15;
const HOLE_D_B = 0.22;
const HOLE_L_R = 0.93;
const HOLE_L_G = 0.87;
const HOLE_L_B = 0.89;
const WHITE_D_R = 0.15;
const WHITE_D_G = 0.22;
const WHITE_D_B = 0.17;
const WHITE_L_R = 0.87;
const WHITE_L_G = 0.92;
const WHITE_L_B = 0.88;
const PARALLEL_D_R = 0.18;
const PARALLEL_D_G = 0.18;
const PARALLEL_D_B = 0.28;
const PARALLEL_L_R = 0.89;
const PARALLEL_L_G = 0.89;
const PARALLEL_L_B = 0.93;
const HORIZON_D_R = 0.98;
const HORIZON_D_G = 0.72;
const HORIZON_D_B = 0.22;
const HORIZON_L_R = 0.72;
const HORIZON_L_G = 0.45;
const HORIZON_L_B = 0.02;
const SINGULARITY_R = 0.92;
const SINGULARITY_G = 0.3;
const SINGULARITY_B = 0.32;
const INFINITY_D_R = 0.5;
const INFINITY_D_G = 0.78;
const INFINITY_D_B = 0.86;
const INFINITY_L_R = 0.13;
const INFINITY_L_G = 0.42;
const INFINITY_L_B = 0.55;
const OBSERVER_R = 0.35;
const OBSERVER_G = 0.85;
const OBSERVER_B = 0.55;
const FALLER_R = 0.36;
const FALLER_G = 0.76;
const FALLER_B = 0.98;
const TRAPPED_R = 0.9;
const TRAPPED_G = 0.35;
const TRAPPED_B = 0.4;
const CONE_R = 0.85;
const CONE_G = 0.8;
const CONE_B = 0.35;

const EXTERIOR_D_C: Rgb = [EXTERIOR_D_R, EXTERIOR_D_G, EXTERIOR_D_B];
const EXTERIOR_L_C: Rgb = [EXTERIOR_L_R, EXTERIOR_L_G, EXTERIOR_L_B];
const HOLE_D_C: Rgb = [HOLE_D_R, HOLE_D_G, HOLE_D_B];
const HOLE_L_C: Rgb = [HOLE_L_R, HOLE_L_G, HOLE_L_B];
const WHITE_D_C: Rgb = [WHITE_D_R, WHITE_D_G, WHITE_D_B];
const WHITE_L_C: Rgb = [WHITE_L_R, WHITE_L_G, WHITE_L_B];
const PARALLEL_D_C: Rgb = [PARALLEL_D_R, PARALLEL_D_G, PARALLEL_D_B];
const PARALLEL_L_C: Rgb = [PARALLEL_L_R, PARALLEL_L_G, PARALLEL_L_B];
const HORIZON_D_C: Rgb = [HORIZON_D_R, HORIZON_D_G, HORIZON_D_B];
const HORIZON_L_C: Rgb = [HORIZON_L_R, HORIZON_L_G, HORIZON_L_B];
const SINGULARITY_C: Rgb = [SINGULARITY_R, SINGULARITY_G, SINGULARITY_B];
const INFINITY_D_C: Rgb = [INFINITY_D_R, INFINITY_D_G, INFINITY_D_B];
const INFINITY_L_C: Rgb = [INFINITY_L_R, INFINITY_L_G, INFINITY_L_B];
const OBSERVER_C: Rgb = [OBSERVER_R, OBSERVER_G, OBSERVER_B];
const FALLER_C: Rgb = [FALLER_R, FALLER_G, FALLER_B];
const TRAPPED_C: Rgb = [TRAPPED_R, TRAPPED_G, TRAPPED_B];
const CONE_C: Rgb = [CONE_R, CONE_G, CONE_B];

/** Muted region tints: a backdrop for the labels rather than the point of the picture. */
const REGION_TINTS: Record<string, [Rgb, Rgb]> = {
  exterior: [EXTERIOR_D_C, EXTERIOR_L_C],
  'black-hole': [HOLE_D_C, HOLE_L_C],
  'white-hole': [WHITE_D_C, WHITE_L_C],
  parallel: [PARALLEL_D_C, PARALLEL_L_C],
};

const CONE_FILL_ALPHA = 0.22;
const EDGE_ALPHA = 1;
const TRACK_ALPHA = 0.95;

export default function PenroseSchwarzschild() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<LineRenderer>(null);
  const [size, setSize] = useState({ width: 1, height: 1 });
  const [standM, setStandM] = useState(DEFAULT_STAND_M);
  const [releaseM, setReleaseM] = useState(DEFAULT_RELEASE_M);
  const [showStatic, setShowStatic] = useState(false);
  const [showFall, setShowFall] = useState(false);
  const [event, setEvent] = useState<ConformalReading | null>(null);
  const [failure, setFailure] = useState<string>();
  const [announcement, setAnnouncement] = useState('');
  const presentation = usePresentation(SIM_ID);
  const dark = useDarkTheme();

  const staticTrack = useMemo(
    () => staticWorldline(standM / 2, STATIC_SPAN, WORLDLINE_SAMPLES), [standM],
  );
  const fallTrack = useMemo<ConformalSample[]>(
    () => infallWorldline(releaseM / 2, FALL_SAMPLES), [releaseM],
  );

  const frameOf = useCallback((): CanvasFrame => ({
    width: Math.max(1, canvasRef.current?.clientWidth ?? 1),
    height: Math.max(1, canvasRef.current?.clientHeight ?? 1),
    extent: extentFor(
      Math.max(1, canvasRef.current?.clientWidth ?? 1)
      / Math.max(1, canvasRef.current?.clientHeight ?? 1),
    ),
  }), []);

  useEffect(() => {
    if (presentation.resetToken > 0) {
      setEvent(null);
      setShowStatic(false);
      setShowFall(false);
    }
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
      const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      const view = { x: 0, y: 0, width: 1, height: 1 };
      const bounds: Bounds = squareBounds(extentFor(width / height), width, height, view);
      renderer.beginFrame();

      for (const shape of REGION_SHAPES) {
        const tint = REGION_TINTS[shape.region] ?? REGION_TINTS.exterior!;
        renderer.draw(
          polygonVertices(shape.polygon), 'fan', view, bounds, dark ? tint[0] : tint[1], 1,
        );
      }

      for (const edge of BOUNDARIES) {
        if (edge.kind === 'singularity') {
          renderer.draw(
            jaggedVertices(edge.from, edge.to, JAG_STEPS, JAG_SIZE), 'strip', view, bounds,
            SINGULARITY_C, EDGE_ALPHA,
          );
          continue;
        }
        const colour = edge.kind === 'horizon'
          ? (dark ? HORIZON_D_C : HORIZON_L_C)
          : (dark ? INFINITY_D_C : INFINITY_L_C);
        renderer.draw(
          segmentVertices(edge.from, edge.to), 'lines', view, bounds, colour, EDGE_ALPHA,
        );
      }

      if (showStatic) {
        renderer.draw(staticTrack, 'strip', view, bounds, OBSERVER_C, TRACK_ALPHA);
      }
      if (showFall) {
        renderer.draw(
          trackVertices(fallTrack, false), 'strip', view, bounds, FALLER_C, TRACK_ALPHA,
        );
        // The part that can no longer reach ℐ⁺, in the colour of a thing that cannot get out.
        renderer.draw(
          trackVertices(fallTrack, true), 'strip', view, bounds, TRAPPED_C, TRACK_ALPHA,
        );
      }

      if (event && !event.outside) {
        renderer.draw(
          futureConeFill(event.across, event.up), 'fan', view, bounds, CONE_C, CONE_FILL_ALPHA,
        );
        renderer.draw(
          futureConeVertices(event.across, event.up), 'lines', view, bounds, CONE_C, 1,
        );
        renderer.draw(
          new Float32Array([event.across, event.up, 1]), 'points', view, bounds, CONE_C, 1,
          POINT_SIZE * ratio,
        );
      }
      renderer.endFrame();
      handle = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(handle);
  }, [
    dark, failure, event, showStatic, showFall, staticTrack, fallTrack,
    presentation.focused, size,
  ]);

  const onCanvasClick = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const point = pixelToSim(clientX - rect.left, clientY - rect.top, frameOf());
    setEvent(readConformal(point.x, point.y));
  }, [frameOf]);

  /** Label anchors, from the same coordinates the canvas draws with. */
  const labels = useMemo(() => {
    const frame: CanvasFrame = {
      width: size.width, height: size.height, extent: extentFor(size.width / size.height),
    };
    const place = (at: readonly [number, number]) => simToPixel(at[0], at[1], frame);
    return {
      boundaries: BOUNDARIES.map(edge => ({ ...edge, at: place(edge.anchor) })),
      corners: CORNERS.map(corner => ({ ...corner, at: place(corner.at) })),
      regions: REGION_SHAPES.map(shape => {
        const centroid = shape.polygon.reduce(
          (sum, point) => [sum[0] + point[0] / shape.polygon.length,
            sum[1] + point[1] / shape.polygon.length] as [number, number],
          [0, 0] as [number, number],
        );
        return { region: shape.region, label: shape.label, at: place(centroid) };
      }),
    };
  }, [size]);

  useEffect(() => {
    const timer = setTimeout(() => setAnnouncement(
      event
        ? event.outside
          ? 'That point is outside the diagram.'
          : `Event in ${event.region ?? 'a horizon'}, at radius `
            + `${((event.radius ?? 0) * 2).toFixed(PLACES_2)} M. It can influence `
            + `${event.reach.length} of the four regions.`
        : 'No event placed. Click the diagram to place one and draw its future light cone.',
    ), ANNOUNCE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [event]);

  const summary = 'A Penrose conformal diagram of Schwarzschild spacetime. The whole of '
    + 'spacetime, including its infinities, drawn inside a diamond with flat top and bottom. '
    + 'Light travels at 45 degrees everywhere. Click to place an event and see its future.';

  return (
    <article className="penrose-schwarzschild sim-page">
      <header className="sim-head">
        <p className="eyebrow">Spacetime · causal structure</p>
        <h1>All of it, on one page.</h1>
        <p className="intro">
          A conformal map squeezes infinity onto the paper without bending a single light ray.
          Distances and durations are destroyed; what survives is exactly the question the
          diagram is for — which events can reach which. Everything that escapes ends up on the
          upper edges; everything inside the horizon ends up on the flat top.
        </p>
      </header>

      <SimStage
        simId={SIM_ID}
        panelLabel="The diagram"
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
                {labels.regions.map(item => (
                  <p
                    key={item.region}
                    className="penrose-region-label"
                    style={{ left: item.at.x, top: item.at.y }}
                  >{item.label}</p>
                ))}
                {labels.boundaries.map(item => (
                  <p
                    key={item.label}
                    className={`penrose-edge-label is-${item.kind}`}
                    style={{ left: item.at.x, top: item.at.y }}
                  >{item.label}</p>
                ))}
                {labels.corners.map(item => (
                  <p
                    key={item.label}
                    className="penrose-corner-label"
                    style={{ left: item.at.x, top: item.at.y }}
                  >{item.label}</p>
                ))}
              </>
            )}
            <p className="visually-hidden" aria-live="polite">{announcement}</p>
          </StageCanvas>
        }
        permanentLabel={<>
          <p>
            <strong>Penrose conformal diagram — all of spacetime fits on screen. Light always
            travels at 45°. The diagram preserves causal structure but not distances or time
            intervals.</strong>
          </p>
          <p>
            Two points a millimetre apart near an edge may be infinitely far apart, and the flat
            top is not a ceiling — it is r = 0, drawn jagged because the geometry ends there.
            i⁺ is the <em>corner</em> of region I where ℐ⁺ meets the horizon, not the top of the
            picture.
          </p>
        </>}
        controls={<>
          <div className="control control-actions">
            <Button
              className={showStatic ? 'preset-button is-selected' : 'preset-button'}
              onPress={() => setShowStatic(value => !value)}
              aria-pressed={showStatic}
            >Observer in region I</Button>
            <Button
              className={showFall ? 'preset-button is-selected' : 'preset-button'}
              onPress={() => setShowFall(value => !value)}
              aria-pressed={showFall}
            >Infalling observer</Button>
            <Button className="preset-button" onPress={() => setEvent(null)}>Clear event</Button>
          </div>
          <p className="chooser-hint" role="status">
            {showFall
              ? 'The red stretch is the part of the fall after the horizon: from there no signal '
                + 'the faller sends reaches ℐ⁺ ever again. It does NOT cross ℐ⁺ — null infinity '
                + 'is where escaping light ends up, and the faller reaches r = 0 instead.'
              : 'Click anywhere inside the diagram to place an event and draw its future cone.'}
          </p>

          <NumberSlider
            label="Static observer radius" value={standM} onChange={setStandM}
            minValue={MIN_STAND_M} maxValue={MAX_STAND_M} step={0.05} unit=" M" places={2}
            hint="Their worldline runs from i⁻ to i⁺, bulging towards i⁰. The closer they stand
                  to 2M, the more tightly it hugs the horizons."
          />
          <NumberSlider
            label="Release radius" value={releaseM} onChange={setReleaseM}
            minValue={MIN_RELEASE_M} maxValue={MAX_RELEASE_M} step={0.1} unit=" M" places={1}
            hint="Where the infalling observer is dropped from rest."
          />

          <div className="readout" aria-label="Measured">
            <dl>
              <div data-readout="event">
                <dt>Event</dt>
                <dd>
                  {event
                    ? event.outside
                      ? 'outside the diagram'
                      : `${((event.radius ?? 0) * 2).toFixed(PLACES_2)} M`
                    : '—'}
                  <span>
                    {event && !event.outside
                      ? `${event.region ?? 'on a horizon'}`
                      : 'click inside the diamond'}
                  </span>
                </dd>
              </div>
              <div className="figure-benchmark" data-readout="reach">
                <dt>Can causally influence</dt>
                <dd>
                  {event && !event.outside ? `${event.reach.length} of 4` : '—'}
                  <span>
                    {event && !event.outside
                      ? event.reach.join(', ')
                      : 'a future-directed curve has V increasing and U decreasing, so the '
                        + 'future of an event is a quadrant'}
                  </span>
                </dd>
              </div>
              <div data-readout="boundaries">
                <dt>Boundaries drawn</dt>
                <dd>
                  {BOUNDARIES.length}
                  <span>
                    2 singularities · 4 horizons · 4 sheets of null infinity · {CORNERS.length}
                    {' '}named corners
                  </span>
                </dd>
              </div>
            </dl>
          </div>

          <details className="boundary-key">
            <summary>What every boundary is</summary>
            <dl>
              {BOUNDARIES.map(edge => (
                <div key={edge.label}>
                  <dt>{edge.label}</dt>
                  <dd>{edge.note}</dd>
                </div>
              ))}
              {CORNERS.map(corner => (
                <div key={corner.label}>
                  <dt>{corner.label}</dt>
                  <dd>{corner.note}</dd>
                </div>
              ))}
            </dl>
          </details>
        </>}
      >
        <MisconceptionsPanel items={[
          {
            myth: 'The infalling observer crosses ℐ⁺.',
            reality: 'They cannot. ℐ⁺ is future null infinity — where light that escapes to '
              + 'infinity ends up — and it is a null boundary, not somewhere a massive body can '
              + 'go. An infalling observer crosses the horizon and reaches r = 0, which is the '
              + 'flat top of the diagram. The two are drawn as different edges precisely because '
              + 'they are different fates: one is "got away", the other is "ran out of future".',
            figures: [
              { label: 'Escaping light', value: 'ends on ℐ⁺' },
              { label: 'An observer who never falls in', value: 'ends at i⁺' },
              { label: 'An infalling observer', value: 'ends on r = 0' },
            ],
          },
          {
            myth: 'The top of the diagram is i⁺, future timelike infinity.',
            reality: 'The top is the singularity. i⁺ is the corner of region I, where ℐ⁺ meets '
              + 'the future horizon — it is where an observer who never falls in ends up after '
              + 'infinite proper time. Inside the horizon there are no such observers, so region '
              + 'II has no i⁺ at all: every worldline in it terminates on r = 0 in finite proper '
              + 'time. Putting i⁺ at the top quietly asserts that something in there has an '
              + 'infinite future.',
          },
          {
            myth: 'Two points close together on the diagram are close together in spacetime.',
            reality: 'Nothing on a conformal diagram means a distance. The map is arctan, which '
              + 'squeezes an infinite range into a finite one, so a millimetre near an edge is '
              + 'an unbounded amount of spacetime. What the map does preserve is the angle of '
              + 'null rays — every light ray is at 45° — and therefore the entire causal '
              + 'structure. That is the trade it makes, and it is the only thing it claims.',
          },
          {
            myth: 'Region III is region II run backwards, so it is a curiosity with no consequences.',
            reality: 'It is the one region that can influence everywhere. A future-directed '
              + 'curve has V increasing and U decreasing, so from the white hole you can reach '
              + 'region I, region IV, region II and itself — all four. Region II, by contrast, '
              + 'reaches only itself. The diagram makes that asymmetry a matter of looking at '
              + 'which wedges the 45° cone opens into, which is what it is for.',
            figures: [
              { label: 'From region I', value: 'I and II' },
              { label: 'From region II', value: 'II only' },
              { label: 'From region III', value: 'all four' },
            ],
          },
        ]} />

        <Suspense fallback={<p role="status">Loading equations…</p>}>
          <PhysicsPanel
            equation={String.raw`p=\arctan V,\quad q=\arctan(-U),\qquad \text{across}=\frac{p-q}{\pi},\quad \text{up}=\frac{p+q}{\pi}`}
            assumptions={[
              'The same maximally extended vacuum Schwarzschild spacetime the Kruskal sim draws, with the same caveat: regions III and IV are continuations of the solution, not places a collapse-formed hole has.',
              'arctan is a monotone bijection of the real line onto (−π/2, π/2), so the map is one-to-one and nothing is folded over anything else. It is conformal in two dimensions, which is exactly the statement that null rays stay at 45°.',
              'Distances and durations on the finished diagram mean nothing at all. The conformal factor is not drawn and cannot be: it diverges at every boundary.',
              'The future singularity UV = −1 maps to the level line up = ½ for every t — asserted. That straightening is the whole reason to compactify: in Kruskal it is a hyperbola, and a hyperbola looks like something you could steer around.',
              'Two angular directions are suppressed, so every interior point is a 2-sphere and the left and right halves are two different values of the suppressed angle, not two different places.',
              'The radius shown for a clicked event is recovered by inverting the compactification back to U and V and then through r = r_s[1 + W₀(UV/e)] — never by reading a length off the picture, which would be meaningless.',
            ]}
            sources={[
              { title: 'Penrose 1964 — Conformal treatment of infinity', url: 'https://link.springer.com/article/10.1007/s10714-011-1184-8' },
              { title: 'Carter 1966 — Complete analytic extension of the symmetry axis of Kerr', url: 'https://journals.aps.org/pr/abstract/10.1103/PhysRev.141.1242' },
              { title: 'Hawking & Ellis — The Large Scale Structure of Space-Time, §5', url: 'https://www.cambridge.org/core/books/large-scale-structure-of-spacetime/1E6B961EC9878E0A8B0A2C5A0A1A0A1A' },
            ]}
          />
        </Suspense>

        <p className="verification-note">
          Asserted numerically: the future singularity is the level line up = ½ at every t; i⁰
          sits at across = ±1 and i⁺ at (½, ½) — the corner of region I, not the top of the
          picture; every horizon and every sheet of null infinity runs at exactly 45°; a radial
          null ray has slope exactly 1; a static observer’s worldline runs from i⁻ to i⁺ without
          touching a horizon, and bulges past across = 0.7 on the way; the infalling worldline
          stays strictly inside across + up = 1, which is the assertion that it never crosses
          ℐ⁺; and the causal-reach table is the one a future-directed curve with dV ≥ 0, dU ≤ 0
          produces — four regions from the white hole, one from inside the black hole.
        </p>
      </SimStage>
    </article>
  );
}
