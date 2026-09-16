/** SIM I — a static clock and an orbiting one, side by side. PHYSICS_SPEC §2.8, §8 rows 5–7, 40.
 *
 * The two faces will not visibly disagree, and that is not a failing of the sim: around the
 * Earth the disagreement is tens of microseconds a day. The third dial is the honest way to see
 * it — one turn of its needle is one microsecond of accumulated difference, and it is the same
 * number the panel prints, magnified rather than invented.
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from 'react-aria-components';
import { NumberSlider } from '../../ui/NumberSlider';
import { SimStage, StageCanvas } from '../../ui/sim/SimStage';
import { usePresentation } from '../../ui/sim/playbackStore';
import { MisconceptionsPanel } from '../../ui/MisconceptionsPanel';
import { LineRenderer, squareBounds, type Bounds, type Rgb } from '../../ui/gl/LineRenderer';
import { useDarkTheme } from '../../ui/useDarkTheme';
import { simToPixel, type CanvasFrame } from '../../ui/gl/canvasMapping';
import {
  GPS_ITEMISED,
  GPS_STATIC_GROUND,
  MAX_ORBIT_RADII,
  MAX_STATIC_RADII,
  MICROSECONDS_PER_TURN,
  MIN_ORBIT_RADII,
  MIN_STATIC_RADII,
  PRESETS,
  advance,
  discAt,
  emptyState,
  faceReading,
  figures as figuresAt,
  handAngles,
  handVertices,
  layout as layoutOf,
  needleAngle,
  ringVertices,
  tickVertices,
  toEarthRadii,
  toMetres,
  type ClockState,
} from './description/clockRun';
import './clocks.css';

const PhysicsPanel = lazy(() =>
  import('../../ui/PhysicsPanel').then(module => ({ default: module.PhysicsPanel })));

const SIM_ID = 'clock-comparison';
/** The frame is one unit high whatever the canvas is; everything else is a share of that. */
const EXTENT = 1;
const CIRCLE_SEGMENTS = 128;
const DISC_SEGMENTS = 64;
const MAX_DEVICE_PIXEL_RATIO = 2;
const MILLISECONDS_PER_SECOND = 1000;
const MAX_FRAME_SECONDS = 0.05;
const ANNOUNCE_DELAY_MS = 900;
const RADIUS_STEP = 0.001;
const MIN_EXPONENT = 0;
const MAX_EXPONENT = 4;
const EXPONENT_STEP = 0.25;
const DECADE = 10;
const DEFAULT_EXPONENT = 2;
const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;
/** Above two hours, a period reads better in hours than in three digits of minutes. */
const LONG_ORBIT = 2 * SECONDS_PER_HOUR;
const KILOMETRES_PER_METRE = 1e-3;
const PLACES_1 = 1;
const PLACES_2 = 2;
/** Two digits per field on a clock face reading. */
const CLOCK_DIGITS = 2;
const PLACES_3 = 3;
const PLACES_4 = 4;
/** Places needed before a rate of 1 − 4×10⁻¹⁰ stops reading as exactly 1. */
const PLACES_12 = 12;
const ZERO_DRIFT = 1e-12;

const HOUR_HAND = 0.5;
const MINUTE_HAND = 0.74;
const SECOND_HAND = 0.86;
const HOUR_WIDTH = 0.045;
const MINUTE_WIDTH = 0.032;
const SECOND_WIDTH = 0.018;
const PIVOT = 0.045;
const TICK_RING = 0.94;
const NEEDLE = 0.78;
const NEEDLE_WIDTH = 0.05;
/** Where a caption's top edge sits under the thing it names, as a multiple of that radius.
 * `CAPTION_ROOM` in the layout is larger than this, so the text itself has somewhere to go. */
const CAPTION_DROP = 1.2;

/** Two palettes, because a clock face drawn to read on near-black is invisible on near-white.
 * CLAUDE.md rule 3: a contrast failure exists in exactly one of the two themes. */
interface Palette {
  fill: Rgb;
  bezel: Rgb;
  staticHand: Rgb;
  orbitHand: Rgb;
  gain: Rgb;
  loss: Rgb;
  fillAlpha: number;
}

const DARK_FILL_R = 0.1;
const DARK_FILL_G = 0.11;
const DARK_FILL_B = 0.14;
const DARK_BEZEL_R = 0.62;
const DARK_BEZEL_G = 0.66;
const DARK_BEZEL_B = 0.72;
const DARK_STATIC_R = 0.98;
const DARK_STATIC_G = 0.72;
const DARK_STATIC_B = 0.25;
const DARK_ORBIT_R = 0.42;
const DARK_ORBIT_G = 0.8;
const DARK_ORBIT_B = 0.96;
const DARK_GAIN_R = 0.45;
const DARK_GAIN_G = 0.88;
const DARK_GAIN_B = 0.55;
const DARK_LOSS_R = 0.95;
const DARK_LOSS_G = 0.48;
const DARK_LOSS_B = 0.48;
const DARK_FILL_ALPHA = 0.55;

const LIGHT_FILL_R = 1;
const LIGHT_FILL_G = 1;
const LIGHT_FILL_B = 1;
const LIGHT_BEZEL_R = 0.26;
const LIGHT_BEZEL_G = 0.3;
const LIGHT_BEZEL_B = 0.38;
const LIGHT_STATIC_R = 0.72;
const LIGHT_STATIC_G = 0.42;
const LIGHT_STATIC_B = 0.02;
const LIGHT_ORBIT_R = 0.06;
const LIGHT_ORBIT_G = 0.38;
const LIGHT_ORBIT_B = 0.62;
const LIGHT_GAIN_R = 0.05;
const LIGHT_GAIN_G = 0.45;
const LIGHT_GAIN_B = 0.2;
const LIGHT_LOSS_R = 0.72;
const LIGHT_LOSS_G = 0.13;
const LIGHT_LOSS_B = 0.13;
const LIGHT_FILL_ALPHA = 0.85;

const DARK_PALETTE: Palette = {
  fill: [DARK_FILL_R, DARK_FILL_G, DARK_FILL_B],
  bezel: [DARK_BEZEL_R, DARK_BEZEL_G, DARK_BEZEL_B],
  staticHand: [DARK_STATIC_R, DARK_STATIC_G, DARK_STATIC_B],
  orbitHand: [DARK_ORBIT_R, DARK_ORBIT_G, DARK_ORBIT_B],
  gain: [DARK_GAIN_R, DARK_GAIN_G, DARK_GAIN_B],
  loss: [DARK_LOSS_R, DARK_LOSS_G, DARK_LOSS_B],
  fillAlpha: DARK_FILL_ALPHA,
};

const LIGHT_PALETTE: Palette = {
  fill: [LIGHT_FILL_R, LIGHT_FILL_G, LIGHT_FILL_B],
  bezel: [LIGHT_BEZEL_R, LIGHT_BEZEL_G, LIGHT_BEZEL_B],
  staticHand: [LIGHT_STATIC_R, LIGHT_STATIC_G, LIGHT_STATIC_B],
  orbitHand: [LIGHT_ORBIT_R, LIGHT_ORBIT_G, LIGHT_ORBIT_B],
  gain: [LIGHT_GAIN_R, LIGHT_GAIN_G, LIGHT_GAIN_B],
  loss: [LIGHT_LOSS_R, LIGHT_LOSS_G, LIGHT_LOSS_B],
  fillAlpha: LIGHT_FILL_ALPHA,
};

const TICK_ALPHA = 0.85;

const formatRadii = (radii: number): string =>
  `${radii.toFixed(PLACES_3)} R⊕ · ${(toMetres(radii) * KILOMETRES_PER_METRE).toFixed(0)} km`;

const formatSpeed = (exponent: number): string => {
  const factor = DECADE ** exponent;
  return `${factor >= DECADE ** PLACES_3 ? Math.round(factor).toLocaleString('en-GB')
    : factor.toPrecision(PLACES_3)}×`;
};

function faceText(seconds: number): string {
  const reading = faceReading(seconds);
  const pad = (value: number) => value.toString().padStart(CLOCK_DIGITS, '0');
  return `${pad(reading.hours)}:${pad(reading.minutes)}:${pad(Math.floor(reading.seconds))}`;
}

export default function ClockComparison() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<LineRenderer>(null);
  const stateRef = useRef<ClockState>(emptyState());
  const [staticRadii, setStaticRadii] = useState(MIN_STATIC_RADII);
  const [orbitRadii, setOrbitRadii] = useState(PRESETS[0]!.orbitRadii);
  const [exponent, setExponent] = useState(DEFAULT_EXPONENT);
  const [size, setSize] = useState({ width: 1, height: 1 });
  const [failure, setFailure] = useState<string>();
  const [announcement, setAnnouncement] = useState('');
  const [tick, setTick] = useState(0);
  const presentation = usePresentation(SIM_ID);
  const dark = useDarkTheme();
  const palette = dark ? DARK_PALETTE : LIGHT_PALETTE;

  const staticMetres = toMetres(staticRadii);
  const orbitMetres = toMetres(orbitRadii);
  const speed = DECADE ** exponent;

  // Moving either clock restarts the comparison: an accumulated difference belongs to one pair.
  useEffect(() => {
    stateRef.current = emptyState();
    setTick(value => value + 1);
  }, [staticRadii, orbitRadii, presentation.resetToken]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      rendererRef.current = new LineRenderer(canvas);
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
    let stopped = false;
    let previous = performance.now();

    const drawFace = (
      centreX: number, centreY: number, radius: number, seconds: number, colour: Rgb,
      view: { x: number; y: number; width: number; height: number }, bounds: Bounds,
    ) => {
      const angles = handAngles(seconds);
      renderer.draw(
        discAt(centreX, centreY, radius, DISC_SEGMENTS), 'fan', view, bounds, palette.fill,
        palette.fillAlpha,
      );
      renderer.draw(
        ringVertices(centreX, centreY, radius, CIRCLE_SEGMENTS), 'loop', view, bounds,
        palette.bezel,
      );
      renderer.draw(
        tickVertices(centreX, centreY, radius * TICK_RING), 'lines', view, bounds, palette.bezel,
        TICK_ALPHA,
      );
      renderer.draw(
        handVertices(centreX, centreY, angles.hour, radius * HOUR_HAND, radius * HOUR_WIDTH),
        'fan', view, bounds, colour,
      );
      renderer.draw(
        handVertices(centreX, centreY, angles.minute, radius * MINUTE_HAND, radius * MINUTE_WIDTH),
        'fan', view, bounds, colour,
      );
      renderer.draw(
        handVertices(centreX, centreY, angles.second, radius * SECOND_HAND, radius * SECOND_WIDTH),
        'fan', view, bounds, colour,
      );
      renderer.draw(
        discAt(centreX, centreY, radius * PIVOT, DISC_SEGMENTS), 'fan', view, bounds, colour,
      );
    };

    const draw = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, MAX_DEVICE_PIXEL_RATIO);
      const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
      const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      const view = { x: 0, y: 0, width: 1, height: 1 };
      const bounds: Bounds = squareBounds(EXTENT, width, height, view);
      const box = layoutOf(bounds.maxX, bounds.maxY);
      const now = figuresAt(staticMetres, orbitMetres, stateRef.current.coordinateSeconds);

      renderer.beginFrame();
      drawFace(
        box.leftX, box.faceY, box.faceRadius, now.staticSeconds, palette.staticHand, view, bounds,
      );
      drawFace(
        box.rightX, box.faceY, box.faceRadius, now.orbitSeconds, palette.orbitHand, view, bounds,
      );

      // The difference dial. One turn is one microsecond, which is the only magnification in
      // the sim and is written on the face.
      const gaining = now.differenceMicroseconds >= 0;
      renderer.draw(
        discAt(0, box.dialY, box.dialRadius, DISC_SEGMENTS), 'fan', view, bounds, palette.fill,
        palette.fillAlpha,
      );
      renderer.draw(
        ringVertices(0, box.dialY, box.dialRadius, CIRCLE_SEGMENTS), 'loop', view, bounds,
        palette.bezel,
      );
      renderer.draw(
        tickVertices(0, box.dialY, box.dialRadius * TICK_RING, true), 'lines', view, bounds,
        palette.bezel, TICK_ALPHA,
      );
      renderer.draw(
        handVertices(
          0, box.dialY, needleAngle(now.differenceMicroseconds), box.dialRadius * NEEDLE,
          box.dialRadius * NEEDLE_WIDTH,
        ),
        'fan', view, bounds, gaining ? palette.gain : palette.loss,
      );
      renderer.draw(
        discAt(0, box.dialY, box.dialRadius * PIVOT, DISC_SEGMENTS), 'fan', view, bounds,
        gaining ? palette.gain : palette.loss,
      );
      renderer.endFrame();
    };

    const step = (frameTime: number) => {
      if (stopped) return;
      const seconds = Math.min(
        (frameTime - previous) / MILLISECONDS_PER_SECOND, MAX_FRAME_SECONDS,
      );
      previous = frameTime;
      stateRef.current = advance(stateRef.current, seconds * speed);
      draw();
      setTick(value => value + 1);
      handle = requestAnimationFrame(step);
    };

    draw();
    if (!presentation.playing) return () => { stopped = true; };
    previous = performance.now();
    handle = requestAnimationFrame(step);
    return () => { stopped = true; cancelAnimationFrame(handle); };
  // `palette` belongs in here: the draw loop closes over it, so leaving it out freezes the
  // canvas on whichever theme happened to be current when the sim mounted.
  }, [
    staticMetres, orbitMetres, speed, failure, palette,
    presentation.playing, presentation.focused,
  ]);

  const figures = useMemo(
    () => figuresAt(staticMetres, orbitMetres, stateRef.current.coordinateSeconds),
    [tick, staticMetres, orbitMetres],
  );

  /** Caption anchors, from the same layout the canvas draws with rather than from a guess. */
  const captions = useMemo(() => {
    const frame: CanvasFrame = { width: size.width, height: size.height, extent: EXTENT };
    const bounds = squareBounds(EXTENT, size.width, size.height);
    const box = layoutOf(bounds.maxX, bounds.maxY);
    const below = box.faceY - box.faceRadius * CAPTION_DROP;
    return {
      left: simToPixel(box.leftX, below, frame),
      right: simToPixel(box.rightX, below, frame),
      dial: simToPixel(0, box.dialY - box.dialRadius * CAPTION_DROP, frame),
    };
  }, [size]);

  const applyPreset = useCallback((id: string) => {
    const preset = PRESETS.find(entry => entry.id === id);
    if (!preset) return;
    setStaticRadii(preset.staticRadii);
    setOrbitRadii(preset.orbitRadii);
  }, []);

  const active = useMemo(() => PRESETS.find(preset =>
    Math.abs(preset.staticRadii - staticRadii) < RADIUS_STEP
    && Math.abs(preset.orbitRadii - orbitRadii) < RADIUS_STEP), [staticRadii, orbitRadii]);

  const summary = `Two clock faces. The left one is held still at `
    + `${formatRadii(staticRadii)}; the right one orbits at ${formatRadii(orbitRadii)}. Below `
    + 'them, a dial whose needle turns once per microsecond of accumulated difference.';

  useEffect(() => {
    const timer = setTimeout(() => setAnnouncement(
      `Static clock ${faceText(figures.staticSeconds)}. Orbiting clock `
      + `${faceText(figures.orbitSeconds)}. The orbiting clock is `
      + `${Math.abs(figures.differenceMicroseconds).toFixed(PLACES_3)} microseconds `
      + `${figures.differenceMicroseconds >= 0 ? 'ahead' : 'behind'}, drifting at `
      + `${figures.driftPerDay.toFixed(PLACES_3)} microseconds per day.`,
    ), ANNOUNCE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [figures]);

  const breakEvenRadii = toEarthRadii(figures.breakEvenMetres);
  const balanced = Math.abs(figures.driftPerDay) < ZERO_DRIFT;

  return (
    <article className="clock-comparison sim-page">
      <header className="sim-head">
        <p className="eyebrow">Sandbox · clocks</p>
        <h1>Which clock is ahead?</h1>
        <p className="intro">
          One clock bolted to a tower, one in a circular orbit, both started together. Height
          makes the orbiting clock gain; motion makes it lose. Neither effect wins everywhere —
          they cross at exactly 1.5 times the tower’s radius, and GPS sits above that crossing
          while the space station sits below it.
        </p>
      </header>

      <SimStage
        simId={SIM_ID}
        panelLabel="The comparison"
        canvas={
          <StageCanvas simId={SIM_ID} dragging={false}>
            {failure ? (
              <p className="stage-failure" role="alert">
                This view needs WebGL2, which this browser did not provide. {failure}
              </p>
            ) : (
              <>
                <canvas ref={canvasRef} role="img" aria-label={summary} />
                <p className="clock-caption" style={{ left: captions.left.x, top: captions.left.y }}>
                  <strong>A — held still</strong>
                  <span>{formatRadii(staticRadii)}</span>
                  <span className="clock-reading">{faceText(figures.staticSeconds)} elapsed</span>
                </p>
                <p
                  className="clock-caption"
                  style={{ left: captions.right.x, top: captions.right.y }}
                >
                  <strong>B — in orbit</strong>
                  <span>{formatRadii(orbitRadii)}</span>
                  <span className="clock-reading">{faceText(figures.orbitSeconds)} elapsed</span>
                </p>
                <p
                  className="clock-caption clock-caption-dial"
                  style={{ left: captions.dial.x, top: captions.dial.y }}
                >
                  <strong>B − A</strong>
                  <span>one turn = {MICROSECONDS_PER_TURN} µs</span>
                </p>
              </>
            )}
            <p className="visually-hidden" aria-live="polite">{announcement}</p>
          </StageCanvas>
        }
        permanentLabel={<>
          <p>
            <strong>The two faces will never visibly disagree, and that is the honest
            picture.</strong> Around the Earth the whole effect is tens of microseconds a day —
            about a hand’s width of a second hand after four months. The dial below them is the
            same difference with nothing added to it: one turn of its needle is one microsecond.
          </p>
          <p>
            Clock A is <em>static</em> at r_A — held up by a tower, not orbiting. Clock B is in a
            circular geodesic orbit at r_B. Both rates are quoted against a clock at infinity, and
            the Earth here is a non-rotating Schwarzschild mass.
          </p>
        </>}
        controls={<>
          <div className="chooser" role="group" aria-label="Preset">
            {PRESETS.map(preset => (
              <Button
                key={preset.id}
                className={preset.id === active?.id ? 'chooser-button is-selected' : 'chooser-button'}
                onPress={() => applyPreset(preset.id)}
                aria-pressed={preset.id === active?.id}
              >
                {preset.label}
                <span>{formatRadii(preset.orbitRadii)}</span>
              </Button>
            ))}
          </div>
          {active ? <p className="chooser-hint" role="status">{active.note}</p> : null}

          <NumberSlider
            label="Clock A — static radius" value={staticRadii} onChange={setStaticRadii}
            minValue={MIN_STATIC_RADII} maxValue={MAX_STATIC_RADII} step={RADIUS_STEP}
            format={formatRadii}
            hint="From the Earth’s surface outward. Raising it raises the break-even radius with
                  it, since that is always 1.5 times this one."
          />
          <NumberSlider
            label="Clock B — orbit radius" value={orbitRadii} onChange={setOrbitRadii}
            minValue={MIN_ORBIT_RADII} maxValue={MAX_ORBIT_RADII} step={RADIUS_STEP}
            format={formatRadii}
            hint="From low Earth orbit outward. Cross 1.5 r_A and the sign of the drift changes."
          />
          <NumberSlider
            label="Speed" value={exponent} onChange={setExponent}
            minValue={MIN_EXPONENT} maxValue={MAX_EXPONENT} step={EXPONENT_STEP}
            format={formatSpeed}
            hint="Coordinate seconds per second of wall time. Both clocks are scaled together, so
                  the ratio between them — the only thing being measured — is untouched."
          />

          <div className="readout" aria-label="Measured">
            <dl>
              <div data-readout="difference">
                <dt>B − A, accumulated</dt>
                <dd>
                  {figures.differenceMicroseconds >= 0 ? '+' : '−'}
                  {Math.abs(figures.differenceMicroseconds).toFixed(PLACES_3)}
                  <span>µs after {faceText(figures.staticSeconds)} on clock A</span>
                </dd>
              </div>
              <div className="figure-benchmark" data-readout="drift">
                <dt>Drift rate</dt>
                <dd>
                  {figures.driftPerDay >= 0 ? '+' : '−'}
                  {Math.abs(figures.driftPerDay).toFixed(PLACES_3)}
                  <span>
                    µs per day{balanced ? ' — the two terms cancel exactly' : ''}
                  </span>
                </dd>
              </div>
              <div data-readout="gravitational">
                <dt>From the potential</dt>
                <dd>
                  +{figures.gravitationalPerDay.toFixed(PLACES_3)}
                  <span>µs/day · B is higher up, so it gains</span>
                </dd>
              </div>
              <div data-readout="kinematic">
                <dt>From the motion</dt>
                <dd>
                  −{Math.abs(figures.kinematicPerDay).toFixed(PLACES_3)}
                  <span>µs/day · B is moving, so it loses</span>
                </dd>
              </div>
              <div data-readout="breakeven">
                <dt>Break-even orbit</dt>
                <dd>
                  {breakEvenRadii.toFixed(PLACES_3)}
                  <span>
                    R⊕ = 1.5 r_A · {(figures.breakEvenMetres * KILOMETRES_PER_METRE).toFixed(0)} km
                  </span>
                </dd>
              </div>
              <div data-readout="rates">
                <dt>Tick rates</dt>
                <dd>
                  {figures.staticRate.toFixed(PLACES_12)}
                  <span>
                    dτ/dt for A · B is {figures.orbitRate.toFixed(PLACES_12)}
                  </span>
                </dd>
              </div>
              <div data-readout="orbit">
                <dt>Orbit</dt>
                <dd>
                  {figures.orbitPeriodSeconds > LONG_ORBIT
                    ? (figures.orbitPeriodSeconds / SECONDS_PER_HOUR).toFixed(PLACES_2)
                    : (figures.orbitPeriodSeconds / SECONDS_PER_MINUTE).toFixed(PLACES_1)}
                  <span>
                    {figures.orbitPeriodSeconds > LONG_ORBIT ? 'hours' : 'minutes'} ·
                    {' '}{(figures.orbitSpeed * KILOMETRES_PER_METRE).toFixed(PLACES_3)} km/s
                  </span>
                </dd>
              </div>
            </dl>
          </div>

          <div className="gps-case" data-readout="gps">
            <h3>The GPS case, itemised</h3>
            <p>
              A navigation satellite at 26 562 km against a ground station on the equator. This is
              the one place where the correction is not academic: left uncorrected, the ranging
              error grows by about 11 km a day.
            </p>
            <dl className="gps-terms">
              <div>
                <dt>Gravitational</dt>
                <dd>+{GPS_ITEMISED.gravitational.toFixed(PLACES_3)} µs/day</dd>
              </div>
              <div>
                <dt>Kinematic</dt>
                <dd>−{Math.abs(GPS_ITEMISED.kinematic).toFixed(PLACES_3)} µs/day</dd>
              </div>
              <div className="gps-net">
                <dt>Net</dt>
                <dd>+{GPS_ITEMISED.net.toFixed(PLACES_3)} µs/day</dd>
              </div>
            </dl>
            <details>
              <summary>Show the derivation</summary>
              <div className="derivation">
                <p>
                  Both clocks are compared against a clock at infinity, and everything is first
                  order in GM/rc² because that quantity is 7×10⁻¹⁰ at the Earth’s surface.
                </p>
                <ol>
                  <li>
                    <strong>Potential.</strong> Δ(dτ/dt) = (GM/c²)(1/r_ground − 1/r_orbit) =
                    (r_s/2)(1/6 371 km − 1/26 562 km) = 5.291×10⁻¹⁰. Over 86 400 s that is
                    <strong> +{GPS_STATIC_GROUND.gravitationalPerDay.toFixed(PLACES_3)} µs</strong>.
                    The satellite is higher, so it gains.
                  </li>
                  <li>
                    <strong>Satellite motion.</strong> −v²/2c² with v = √(GM/r) = 3.874 km/s gives
                    −8.349×10⁻¹¹, i.e.
                    <strong> −{Math.abs(GPS_STATIC_GROUND.kinematicPerDay).toFixed(PLACES_3)} µs
                    </strong> a day against a clock that is not moving at all.
                  </li>
                  <li>
                    <strong>The ground station is moving too.</strong> It is carried east at
                    R⊕Ω⊕ = 465 m/s, which costs it a further v²/2c² and so gives the satellite
                    back <strong>+{(GPS_ITEMISED.kinematic
                      - GPS_STATIC_GROUND.kinematicPerDay).toFixed(PLACES_4)} µs</strong> a day.
                    The kinematic term is a <em>difference</em> of two speeds, never one speed.
                  </li>
                  <li>
                    <strong>Net.</strong> +{GPS_ITEMISED.gravitational.toFixed(PLACES_2)} −
                    {' '}{Math.abs(GPS_ITEMISED.kinematic).toFixed(PLACES_2)} =
                    {' '}<strong>+{GPS_ITEMISED.net.toFixed(PLACES_2)} µs/day</strong>. The
                    satellite oscillators are offset by 4.4647×10⁻¹⁰ before launch so they run at
                    the right rate once they are up there.
                  </li>
                </ol>
                <p>
                  The canvas shows step 2 rather than step 3 — its clock A is static, not
                  rotating — so its net is
                  {' '}+{GPS_STATIC_GROUND.driftPerDay.toFixed(PLACES_3)} µs/day. The
                  {' '}{(GPS_ITEMISED.net - GPS_STATIC_GROUND.driftPerDay).toFixed(PLACES_3)} µs
                  between them is the Earth’s rotation, and nothing else.
                </p>
              </div>
            </details>
          </div>
        </>}
      >
        <MisconceptionsPanel items={[
          {
            myth: 'Two clocks at the same radius must tick at the same rate.',
            reality: 'Only if they are both at rest. Put one in orbit and the gravitational '
              + 'factors cancel exactly, leaving the whole kinematic term: dτ_B/dτ_A = '
              + '√((1−3μ)/(1−2μ)) < 1 with μ = GM/rc². At the Earth’s surface that is a loss of '
              + '30.07 µs a day, and at the lowest radius this sim can put an orbit at, 28.30. '
              + 'The radius at which the two agree is not r_B = r_A — it is '
              + 'r_B = 1.5 r_A, and no mass appears in that.',
            figures: [
              { label: 'Same radius, at the surface', value: '−30.07 µs/day' },
              { label: 'Same radius, at 6 771 km', value: '−28.30 µs/day' },
              { label: 'Break-even', value: 'r_B = 1.5 r_A exactly' },
            ],
          },
          {
            myth: 'Clocks higher up always run fast, so satellite clocks gain.',
            reality: 'Higher up beats *held still* higher up. An orbiting clock pays for the '
              + 'height with speed, and below 1.5 r_A the speed wins: the space station loses '
              + 'about 25 µs a day while GPS gains 39. Same well, same planet, opposite signs — '
              + 'which is why "gravity makes clocks run slow" is not enough to predict either.',
            figures: [
              { label: 'GPS, 26 562 km', value: '+38.61 µs/day' },
              { label: 'Space station, 6 771 km', value: '−24.74 µs/day' },
            ],
          },
          {
            myth: 'The effect is too small to matter.',
            reality: 'It is small and it is unavoidable. 38.6 µs a day is 11.6 km of light '
              + 'travel a day, and GPS needs metres. The satellite clocks are deliberately '
              + 'offset by 4.4647×10⁻¹⁰ in rate before launch so that they read correctly in '
              + 'orbit — a general-relativistic correction built into hardware that is in '
              + 'essentially every pocket.',
          },
          {
            myth: 'Speeding the sim up changes the answer.',
            reality: 'It scales both clocks by the same factor, because it scales coordinate '
              + 'time. The ratio between them is what is being measured and it is a constant of '
              + 'the two radii alone. The speed control buys patience, not physics: at 1× the '
              + 'needle takes 37 minutes to go round once for GPS.',
          },
        ]} />

        <Suspense fallback={<p role="status">Loading equations…</p>}>
          <PhysicsPanel
            equation={String.raw`\frac{d\tau_A}{dt}=\sqrt{1-\frac{r_s}{r_A}},\qquad \frac{d\tau_B}{dt}=\sqrt{1-\frac{r_s}{r_B}-\frac{r_B^2\Omega^2}{c^2}}=\sqrt{1-\frac{3GM}{r_Bc^2}}`}
            assumptions={[
              'Schwarzschild geometry around a non-rotating Earth, with GM⊕ = 3.986004418×10¹⁴ m³/s² and r_s = 8.870 mm. No oblateness, no Kerr term, no other bodies.',
              'Clock A is STATIC at r_A — supported, not orbiting. Clock B is on a circular geodesic. Both rates are relative to a clock at infinity, and both are exact rather than weak-field expansions.',
              'Ω² = GM/r³ is exact in Schwarzschild coordinate time, which is what collapses the orbiting clock’s two terms into the single √(1 − 3GM/rc²).',
              'The difference of the two rates is computed as (rate_B² − rate_A²)/(rate_B + rate_A). Subtracting the rates directly would throw away nine of sixteen digits before the answer began.',
              '"Per day" means per day of coordinate time. Per day of either clock’s proper time differs by one part in 10⁹ of an already microsecond-sized quantity.',
              'The GPS itemisation adds the ground station’s own rotation at R⊕Ω⊕ = 465 m/s, which the canvas does not: a static clock is not a rotating one. That accounts for all 0.104 µs/day of difference between the two figures quoted.',
              'The dial magnifies nothing except the reading: one turn is one microsecond of the same accumulated difference printed in the panel.',
            ]}
            sources={[
              { title: 'Ashby 2003 — Relativity in the Global Positioning System, Living Reviews in Relativity', url: 'https://link.springer.com/article/10.12942/lrr-2003-1' },
              { title: 'Misner, Thorne & Wheeler — Gravitation, §25.5 (circular orbits)', url: 'https://press.princeton.edu/books/hardcover/9780691177793/gravitation' },
              { title: 'IERS Conventions (2010) — GM⊕ and the Earth’s rotation rate', url: 'https://www.iers.org/IERS/EN/Publications/TechnicalNotes/tn36.html' },
            ]}
          />
        </Suspense>

        <p className="verification-note">
          Asserted numerically: the GPS terms, +45.719 and −7.109 µs/day netting +38.610, each
          against Ashby 2003; the same pair with a static ground clock at +45.719 and −7.213,
          netting +38.506, with the 0.104 µs/day between the two shown to be the ground station’s
          rotation alone. The break-even radius is asserted to be exactly 1.5 r_A for three
          different central masses, with the accumulated difference under 10⁻¹² µs after 10⁶
          steps — the gate the brief placed at r_A = r_B, where it is false by 30.07 µs/day. Low
          Earth orbit is asserted to come out negative, at −24.74 µs/day.
        </p>
      </SimStage>
    </article>
  );
}
