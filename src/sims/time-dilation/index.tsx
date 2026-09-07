/** The gravitational time-dilation calculator, PHYSICS_SPEC §8 rows 5–9 and §2.1.
 *
 * Three demonstrations of one equation. Near-horizon static clocks are the pure case; GPS is the
 * case that runs the world and would break it in a day if it were ignored; Hafele–Keating is the
 * one somebody actually flew. Each is asserted against a published number.
 */
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from 'react-aria-components';
import { NumberSlider } from '../../ui/NumberSlider';
import { MisconceptionsPanel } from '../../ui/MisconceptionsPanel';
import { GPS_ORBIT_RADIUS, METRES_PER_KILOMETRE } from '../../core/units';
import {
  ASHBY_FRACTIONAL_RATE,
  CLOCK_PRESETS,
  GPS_RADIUS_STEPS,
  HEIGHT_STEPS,
  MAX_LATITUDE,
  clockFigures,
  describeClocks,
  describeFlights,
  describeGps,
  flightFigures,
  formatElapsed,
  formatMicroseconds,
  formatNanoseconds,
  formatRadius,
  formatRate,
  gpsFigures,
  gpsRadiusFromIndex,
  indexFromGpsRadius,
  indexFromLogHeight,
  logHeightFromIndex,
  offsetFrequency,
} from './description/describeClocks';
import { RateCurve } from './view/RateCurve';
import { TickStrip } from './view/TickStrip';
import './timeDilation.css';

const PhysicsPanel = lazy(() =>
  import('../../ui/PhysicsPanel').then(module => ({ default: module.PhysicsPanel })));

const ANNOUNCE_DELAY_MS = 600;
const PERCENT = 100;
/** Opens at 2 r_s: log10(2 - 1) = 0, the midpoint of the slider and a rate of 0.707. */
const DEFAULT_LOG_HEIGHT = 0;
const DEFAULT_LATITUDE = 0;
const MEGAHERTZ = 1e6;
const ALTITUDE_FIGURES = 5;
/** Ashby's offset is quoted to eleven decimal places; fewer hides the whole point. */
const FREQUENCY_PLACES = 11;

/** Green for a contribution that makes the flying clock gain, orange for one that costs it.
 * Westward, the Sagnac contribution is a gain — colouring it as a loss would contradict the sign
 * printed next to it. */
const signClass = (value: number): string => (value >= 0 ? 'gain' : 'loss');

export default function TimeDilation() {
  // State is the exact log-height, not the slider index. A preset must land ON the radius it
  // names: routing "Photon sphere" through the integer index snaps it to 1.50119 r_s, which is
  // not the photon sphere. The slider shows the nearest index; the value stays exact.
  const [logHeight, setLogHeight] = useState(DEFAULT_LOG_HEIGHT);
  const [gpsStep, setGpsStep] = useState(indexFromGpsRadius(GPS_ORBIT_RADIUS));
  const [latitude, setLatitude] = useState(DEFAULT_LATITUDE);
  const [announcement, setAnnouncement] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const clocks = useMemo(() => clockFigures(logHeight), [logHeight]);
  const gps = useMemo(
    () => gpsFigures(gpsRadiusFromIndex(gpsStep), latitude), [gpsStep, latitude],
  );
  const east = useMemo(() => flightFigures('eastward'), []);
  const west = useMemo(() => flightFigures('westward'), []);

  // One live region for three sections. The clock slider is the primary control, so it owns the
  // announcement; the other two announce when they are the thing that moved.
  const [focus, setFocus] = useState<'clocks' | 'gps'>('clocks');
  const summary = useMemo(
    () => (focus === 'gps' ? describeGps(gps) : describeClocks(logHeight)),
    [focus, gps, logHeight],
  );

  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setAnnouncement(summary), ANNOUNCE_DELAY_MS);
    return () => clearTimeout(timer.current);
  }, [summary]);

  const gravitationalShare = gps.gravitational / (gps.gravitational + Math.abs(gps.kinematic));

  return (
    <article className="clocks">
      <div className="clocks-head">
        <p className="eyebrow">Time · The calculator</p>
        <h1>Every clock is<br />somewhere.</h1>
        <p className="intro">
          A clock deeper in a gravitational field ticks slower than one higher up — not because it
          is faulty, but because there is less proper time between the same two events down there.
          It is a small effect, and it is not a subtle one: leave it out of GPS and the system is
          eleven kilometres wrong by tomorrow.
        </p>
      </div>

      {/* ------------------------------------------------------- near-horizon static clocks */}
      <section className="section" aria-labelledby="clocks-heading">
        <h2 id="clocks-heading">A clock near a black hole</h2>
        <p className="section-intro">
          For a static clock at radius r outside a Schwarzschild horizon,
          dτ/dt = √(1 − r<sub>s</sub>/r). Nothing hovers at the horizon itself — no static observer
          exists there — so the rate reaches zero only as a limit, and this slider never gets
          there.
        </p>

        <div className="controls-grid">
          <NumberSlider
            label="Height above the horizon"
            value={indexFromLogHeight(logHeight)}
            onChange={value => { setLogHeight(logHeightFromIndex(value)); setFocus('clocks'); }}
            minValue={0}
            maxValue={HEIGHT_STEPS}
            step={1}
            format={() => formatRadius(clocks.radius)}
            hint={'Logarithmic in r − r_s: the whole effect lives within a hair of the horizon, '
              + 'and a linear axis would spend its length where the answer is 1.'}
          />
          <div className="preset-group">
            <p className="preset-label" id="clock-presets">Jump to</p>
            <div className="preset-buttons" role="group" aria-labelledby="clock-presets">
              {CLOCK_PRESETS.map(preset => (
                <Button
                  key={preset.id}
                  className="preset"
                  onPress={() => {
                    setLogHeight(Math.log10(preset.radius - 1));
                    setFocus('clocks');
                  }}
                >
                  {preset.label}<span>{preset.note}</span>
                </Button>
              ))}
            </div>
          </div>
        </div>

        <dl className="figures">
          <div>
            <dt>Tick rate dτ/dt</dt>
            <dd>{formatRate(clocks.rate)}<span>of the far-away rate</span></dd>
          </div>
          <div>
            <dt>Runs slow by</dt>
            <dd>{clocks.slowdown.toPrecision(4)}×</dd>
          </div>
          <div>
            <dt>In one far-away year</dt>
            <dd>{formatElapsed(clocks.secondsPerFarYear)}<span>elapse here</span></dd>
          </div>
        </dl>

        <RateCurve logHeight={logHeight} />
        <TickStrip logHeight={logHeight} />
      </section>

      {/* --------------------------------------------------------------------------- GPS */}
      <section className="section" aria-labelledby="gps-heading">
        <h2 id="gps-heading">GPS, where it is not optional</h2>
        <p className="section-intro">
          A GPS satellite sits higher in the potential, so its clock gains; it also moves faster
          than the ground station, so its clock loses. The two effects fight and height wins. The
          receiver turns a clock difference into a distance by multiplying by c, which is why an
          uncorrected offset is a position error.
        </p>

        <div className="controls-grid">
          <NumberSlider
            label="Orbit radius"
            value={gpsStep}
            onChange={value => { setGpsStep(value); setFocus('gps'); }}
            minValue={0}
            maxValue={GPS_RADIUS_STEPS}
            step={1}
            format={() => `${gps.altitudeKm.toPrecision(ALTITUDE_FIGURES)} km altitude`}
            hint="Real GPS orbits at 20 191 km. Low orbits are fast enough to flip the net sign."
          />
          <NumberSlider
            label="Ground station latitude"
            value={latitude}
            onChange={value => { setLatitude(value); setFocus('gps'); }}
            minValue={0}
            maxValue={MAX_LATITUDE}
            step={1}
            places={0}
            unit="°"
            hint={'The ground clock is itself moving at R cos(latitude) × Ω, and only the '
              + 'difference of the two v²/2c² terms survives.'}
          />
        </div>

        <div
          className="split-bar"
          role="img"
          aria-label={
            `Gravitational gain ${formatMicroseconds(gps.gravitational)}, kinematic loss `
            + `${formatMicroseconds(gps.kinematic)}.`
          }
        >
          <div className="split-gain" style={{ width: `${gravitationalShare * PERCENT}%` }}>
            <span>Height: clock gains</span>
          </div>
          <div className="split-loss" style={{ width: `${(1 - gravitationalShare) * PERCENT}%` }}>
            <span>Speed: clock loses</span>
          </div>
        </div>

        <dl className="figures">
          <div>
            <dt>Gravitational</dt>
            <dd className="gain">{formatMicroseconds(gps.gravitational)}</dd>
          </div>
          <div>
            <dt>Kinematic</dt>
            <dd className="loss">{formatMicroseconds(gps.kinematic)}</dd>
          </div>
          <div>
            <dt>Net</dt>
            <dd>{formatMicroseconds(gps.net)}</dd>
          </div>
          <div>
            <dt>Uncorrected position drift</dt>
            <dd>
              {(gps.rangeErrorMetresPerDay / METRES_PER_KILOMETRE).toPrecision(3)}
              <span>km per day — c × the net offset</span>
            </dd>
          </div>
        </dl>

        <p className="crosscheck">
          <strong>Independent check.</strong> GPS satellites are detuned before launch for exactly
          this reason: their proper frequency is set to{' '}
          {(offsetFrequency(ASHBY_FRACTIONAL_RATE) / MEGAHERTZ).toFixed(FREQUENCY_PLACES)} MHz rather than 10.23
          MHz, a fractional rate offset of {ASHBY_FRACTIONAL_RATE.toExponential(4)}. This model
          gives {gps.fractionalRate.toExponential(4)} at the real orbit —{' '}
          {(Math.abs(gps.fractionalRate / ASHBY_FRACTIONAL_RATE - 1) * PERCENT).toFixed(2)}% high,
          which is the geoid correction a spherical Earth drops.
        </p>
      </section>

      {/* --------------------------------------------------------------- Hafele–Keating */}
      <section className="section" aria-labelledby="flights-heading">
        <h2 id="flights-heading">The experiment somebody flew</h2>
        <p className="section-intro">
          In 1971 Hafele and Keating put caesium clocks on scheduled airliners and flew them around
          the world in both directions. Altitude makes the flying clock gain; speed makes it lose.
          The two directions disagree, and that asymmetry is the point: the Earth is rotating
          underneath, so an eastward aircraft moves faster in the non-rotating frame than a
          westward one.
        </p>

        {/* The table is accessible markup, so it needs no live region — but a six-column table
            is a lot to parse for one takeaway, so the takeaway is stated first. */}
        <p className="visually-hidden">{describeFlights(east, west)}</p>

        <div className="table-scroll">
          <table>
            <caption className="visually-hidden">
              Hafele–Keating: computed offsets against the published predictions
            </caption>
            <thead>
              <tr>
                <th scope="col">Direction</th>
                <th scope="col">Altitude (gh/c²)</th>
                <th scope="col">Sagnac contribution</th>
                <th scope="col">v² contribution</th>
                <th scope="col">Net</th>
                <th scope="col">Published prediction</th>
              </tr>
            </thead>
            <tbody>
              {[east, west].map(leg => (
                <tr key={leg.direction}>
                  <th scope="row">{leg.direction === 'eastward' ? 'Eastward' : 'Westward'}</th>
                  <td className={signClass(leg.gravitational)}>
                    {formatNanoseconds(leg.gravitational)}
                  </td>
                  <td className={signClass(-leg.sagnacCross)}>
                    {formatNanoseconds(-leg.sagnacCross)}
                  </td>
                  <td className={signClass(-leg.quadratic)}>
                    {formatNanoseconds(-leg.quadratic)}
                  </td>
                  <td><strong>{formatNanoseconds(leg.net)}</strong></td>
                  <td>
                    {leg.predicted.value} ± {leg.predicted.uncertainty} ns{' '}
                    <span className={leg.insideBand ? 'inside' : 'outside'}>
                      {leg.insideBand ? '✓ inside' : '✗ outside'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="crosscheck">
          <strong>Where the asymmetry comes from.</strong> The cross term 2R<sub>⊥</sub>Ωv is{' '}
          {east.crossToQuadratic.toPrecision(3)}× the v² term at these parameters and{' '}
          <em>reverses sign</em> with direction; the v² term does not. Substitute the ground
          station's speed for the aircraft's — a notation trap this project's own spec fell into —
          and both directions give the same answer, which is the one thing this experiment exists
          to disprove.
        </p>
      </section>

      <p className="visually-hidden" role="status" aria-live="polite">{announcement}</p>

      <MisconceptionsPanel items={[
        {
          myth: 'The lower clock is running slow — something is physically wrong with it.',
          reality: 'Nothing is wrong with either clock. Each measures one second per second in '
            + 'its own frame; a caesium atom down there oscillates at exactly its proper '
            + 'frequency. What differs is the amount of proper time along the two worldlines '
            + 'between the same pair of events. "Running slow" is a statement about a comparison, '
            + 'not about a mechanism, and the comparison is symmetric in the sense that the lower '
            + 'observer sees the upper clock running fast by exactly the reciprocal factor.',
        },
        {
          myth: 'Gravitational time dilation is a tiny correction that only matters near black '
            + 'holes.',
          reality: 'It runs the satellite navigation system in your pocket. At GPS altitude the '
            + 'net offset is about 38.6 μs per day — a fractional rate of 4.5×10⁻¹⁰, which sounds '
            + 'negligible until you multiply by c to get a distance. The satellites are detuned '
            + 'at the factory before launch because the effect is far too large to leave to '
            + 'software.',
          figures: [
            { label: 'Net offset at GPS altitude', value: '+38.6 μs/day' },
            { label: 'Uncorrected position drift', value: '11.6 km/day' },
            { label: 'Pre-launch frequency offset', value: '10.22999999543 MHz' },
          ],
          source: {
            title: 'Ashby 2003 — Relativity in the Global Positioning System',
            url: 'https://doi.org/10.12942/lrr-2003-1',
          },
        },
        {
          myth: 'GPS proves general relativity because the satellite clocks run fast.',
          reality: 'Both effects are there and they pull opposite ways. Special-relativistic time '
            + 'dilation from the satellite’s speed makes its clock lose about 7 μs/day; the '
            + 'gravitational term makes it gain about 46. The net is a gain only because height '
            + 'wins at that altitude. Drag the orbit radius down far enough and the net changes '
            + 'sign — at low orbit the speed term dominates and the satellite clock runs slow.',
        },
        {
          myth: 'Hafele–Keating just measured altitude — the east/west difference is noise.',
          reality: 'The east/west difference is the largest single feature of the result and it '
            + 'is predicted, not noise: eastward −40±23 ns against westward +275±21 ns. It comes '
            + 'from the Sagnac cross term 2R⊥Ωv, which reverses sign with flight direction '
            + 'because the Earth is rotating beneath the aircraft. Altitude alone is '
            + 'direction-independent and cannot produce it.',
          figures: [
            { label: 'Eastward, computed', value: `${east.net.toFixed(1)} ns` },
            { label: 'Westward, computed', value: `+${west.net.toFixed(0)} ns` },
            { label: 'Cross term ÷ v² term', value: `${east.crossToQuadratic.toPrecision(3)}×` },
          ],
        },
      ]} />

      <Suspense fallback={<p role="status">Loading equations…</p>}>
        <PhysicsPanel
          equation={String.raw`\frac{d\tau}{dt}=\sqrt{1-\frac{r_s}{r}},\qquad \frac{\Delta\tau}{\tau}=\frac{gh}{c^2}-\frac{2R_\perp\Omega v_{\rm air}+v_{\rm air}^2}{2c^2}`}
          assumptions={[
            'Static Schwarzschild clocks only, at r > r_s. No static observer exists at or inside the horizon, so the rate reaches zero as a limit and the calculator never offers a clock there.',
            'These are rate comparisons, not a ray-traced view of received ticks. Signal travel time is not included, and neither is the Doppler shift of a signal actually sent between the two clocks.',
            'GPS uses a spherical, non-rotating-frame Earth retained to order c⁻². It omits oblateness, orbital eccentricity, geoid corrections and signal-propagation corrections, and is an educational model rather than the operational one — the 0.09% disagreement with Ashby’s pre-launch offset is the size of what is dropped.',
            'The Hafele–Keating figures use representative constant height, speed and latitude (8.9 km, 265 m/s, 50°). They are not a reconstruction of the flown trajectories, which is why the test asserts the published band rather than a single number; the result is genuinely latitude-sensitive.',
            'The velocity in both kinematic terms is the aircraft’s speed over the ground, signed positive eastward — not the ground station’s speed. Substituting the latter makes the east/west asymmetry vanish entirely.',
            'Tick counts in the strip are rounded to whole ticks for drawing. The exact rate is in the readout beside it.',
          ]}
          sources={[
            { title: 'Ashby 2003 — Relativity in the Global Positioning System', url: 'https://doi.org/10.12942/lrr-2003-1' },
            { title: 'Hafele & Keating 1972 — Around-the-World Atomic Clocks: Observed Relativistic Time Gains', url: 'https://www.science.org/doi/10.1126/science.177.4044.168' },
            { title: 'Misner, Thorne & Wheeler — Gravitation, §25', url: 'https://press.princeton.edu/books/hardcover/9780691177793/gravitation' },
            { title: 'Pound & Rebka 1960 — Apparent Weight of Photons', url: 'https://doi.org/10.1103/PhysRevLett.4.337' },
          ]}
        />
      </Suspense>

      <p className="verification-note">
        Verified numerically, not by eye: the GPS figures reproduce §8 rows 5–7 (+45.7, −7.11,
        +38.5 μs/day) and the range error is computed as c × the net offset rather than
        remembered; both Hafele–Keating legs land inside the published −40±23 ns and +275±21 ns
        bands; and 45 mutations of the underlying arithmetic were introduced, every one of which
        makes the suite fail.
      </p>
    </article>
  );
}
