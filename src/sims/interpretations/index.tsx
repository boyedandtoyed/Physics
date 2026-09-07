/** Interpretations: one geometry, four coordinate systems, one set of invariants.
 *
 * PHYSICS_SPEC §7.4 Claim B and §5.4. The owner's intuition — that the massive object is in some
 * sense coming toward us — maps onto a real and exact formalism, the Gullstrand-Painlevé river.
 * This module takes that seriously, shows the chart in which it is literally true, and then shows
 * the three places the literal reading breaks: the flow is a coordinate choice, nothing invariant
 * distinguishes it from a static picture, and no expansion story produces a tidal field at all.
 */
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { NumberSlider } from '../../ui/NumberSlider';
import { MisconceptionsPanel } from '../../ui/MisconceptionsPanel';
import {
  DEFAULT_START_RADIUS,
  kretschmann,
  properTimeToHorizon,
  radiusAtProperTime,
  radiusFromEddingtonV,
  radiusFromSchwarzschildTime,
} from '../../core/infall';
import {
  CHARTS,
  describeEvent,
  formatInvariant,
  formatRadius,
  readEvent,
} from './description/describeCharts';
import { ChartPanel } from './view/ChartPanel';
import { TidalPanel } from './view/TidalPanel';
import './interpretations.css';

const PhysicsPanel = lazy(() =>
  import('../../ui/PhysicsPanel').then(module => ({ default: module.PhysicsPanel })));

const SLIDER_STEPS = 600;
const ANNOUNCE_DELAY_MS = 600;
/** The coordinate value §7.4 uses to show what the wrong comparison does. */
const NAIVE_COORDINATE_VALUE = 13;
const TIME_PLACES = 3;

export default function Interpretations() {
  const total = useMemo(() => properTimeToHorizon(DEFAULT_START_RADIUS), []);
  const [step, setStep] = useState(0);
  const [announcement, setAnnouncement] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const tau = (total * step) / SLIDER_STEPS;
  const readings = useMemo(() => readEvent(tau), [tau]);
  const summary = useMemo(() => describeEvent(readings), [readings]);

  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setAnnouncement(summary), ANNOUNCE_DELAY_MS);
    return () => clearTimeout(timer.current);
  }, [summary]);

  const naive = useMemo(() => {
    const rows = [
      { chart: 'Schwarzschild t', radius: radiusFromSchwarzschildTime(NAIVE_COORDINATE_VALUE) },
      { chart: 'Gullstrand–Painlevé t_ff', radius: radiusAtProperTime(NAIVE_COORDINATE_VALUE) },
      { chart: 'Eddington–Finkelstein v', radius: radiusFromEddingtonV(NAIVE_COORDINATE_VALUE) },
    ].map(row => ({ ...row, kretschmann: kretschmann(row.radius) }));
    const values = rows.map(row => row.kretschmann);
    return { rows, ratio: Math.max(...values) / Math.min(...values) };
  }, []);

  return (
    <article className="interpretations">
      <div className="interp-head">
        <p className="eyebrow">Interpretations · Claim B</p>
        <h1>One geometry.<br /><em>Four</em> pictures.</h1>
        <p className="intro">
          Drop something from 8 r<sub>s</sub> and watch it fall. In Schwarzschild coordinates it
          slows, freezes, and never arrives. In Gullstrand–Painlevé coordinates space flows inward
          and carries it across in 14.42 r<sub>s</sub>/c by its own clock. Eddington–Finkelstein
          tips the light cones over; Kruskal straightens them out again. All four are the same
          spacetime. Move the slider and watch every picture disagree — and every measurable
          quantity agree.
        </p>
      </div>

      <section className="event" aria-labelledby="event-heading">
        <h2 id="event-heading">The event</h2>
        <div className="controls-grid">
          <NumberSlider
            label="The faller’s own clock"
            value={step}
            onChange={setStep}
            minValue={0}
            maxValue={SLIDER_STEPS}
            step={1}
            format={() => `τ = ${tau.toFixed(TIME_PLACES)} r_s/c`}
            hint={'Proper time along the worldline. This is a physical label for an event, not a '
              + 'coordinate: it means the same thing in all four charts, which is exactly why the '
              + 'comparison is made against it.'}
          />
          <dl className="event-figures">
            <div>
              <dt>Areal radius</dt>
              <dd>{formatRadius(readings.radius)}<span>r_s</span></dd>
            </div>
            <div>
              <dt>Proper time to the horizon</dt>
              <dd>{total.toFixed(4)}<span>r_s/c — finite</span></dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="panels" aria-labelledby="panels-heading">
        <h2 id="panels-heading">The same worldline, four times</h2>
        <div className="panel-grid">
          {CHARTS.map(chart => (
            <figure key={chart.id} className="panel-card">
              <figcaption>
                <strong>{chart.name}</strong>
                <span className="panel-horizon-note">At the horizon: {chart.atHorizon}</span>
                <span>{chart.character}</span>
              </figcaption>
              <ChartPanel id={chart.id} properTime={tau} />
            </figure>
          ))}
        </div>
      </section>

      <section className="agreement" aria-labelledby="agreement-heading">
        <h2 id="agreement-heading">Different coordinates, identical curvature</h2>
        <p className="section-intro">
          Each chart below recovers the areal radius <em>by its own route</em> — a root-find on
          t(r), the faller’s proper time, a root-find on v(r), and W₀(UV/e) for Kruskal. None of
          them is handed the answer. That is what makes the agreement worth anything.
        </p>
        <div className="table-scroll">
          <table>
            <caption className="visually-hidden">
              The four charts at the selected event, with the invariants each recovers
            </caption>
            <thead>
              <tr>
                <th scope="col">Chart</th>
                <th scope="col">Its time coordinate</th>
                <th scope="col">Areal radius recovered</th>
                <th scope="col">Kretschmann K</th>
                <th scope="col">Tidal −2M/r³</th>
              </tr>
            </thead>
            <tbody>
              {readings.charts.map(chart => {
                const definition = CHARTS.find(candidate => candidate.id === chart.id)!;
                return (
                  <tr key={chart.id}>
                    <th scope="row">{definition.name}</th>
                    <td>{definition.timeLabel} = {chart.timeValue}</td>
                    <td>{formatRadius(chart.recoveredRadius)}</td>
                    <td>{formatInvariant(chart.kretschmann)}</td>
                    <td>{formatInvariant(chart.tidal)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="agreement-note">
          Largest disagreement in K across the charts:{' '}
          <strong>
            {readings.invariantSpread === 0
              ? 'none, to the last digit float64 holds'
              : readings.invariantSpread.toExponential(1)}
          </strong>
          . The gate is 10⁻¹⁰.
        </p>
      </section>

      <section className="naive" aria-labelledby="naive-heading">
        <h2 id="naive-heading">Why it has to be the same <em>event</em></h2>
        <p className="section-intro">
          K and the tidal component depend on the areal radius alone, and r is a coordinate in
          three of these four charts. So comparing the charts <em>at the same r</em> would be
          comparing a number with itself — it would agree perfectly no matter how wrongly the
          transformations were implemented. The comparison above is made at the same physical
          event instead. Here is what the shortcut would have produced: reading each chart at the
          same numerical value, τ or t or v = {NAIVE_COORDINATE_VALUE} r<sub>s</sub>/c.
        </p>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">Chart, read at {NAIVE_COORDINATE_VALUE}</th>
                <th scope="col">Event it actually lands on</th>
                <th scope="col">Kretschmann K</th>
              </tr>
            </thead>
            <tbody>
              {naive.rows.map(row => (
                <tr key={row.chart}>
                  <th scope="row">{row.chart}</th>
                  <td>r = {row.radius.toFixed(4)} r_s</td>
                  <td>{formatInvariant(row.kretschmann)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="naive-note">
          Three different events, and a curvature spread of{' '}
          <strong>{naive.ratio.toFixed(0)}×</strong>. A test asserts this ratio, so that a future
          change which quietly starts comparing coordinate values instead of events fails loudly.
        </p>
      </section>

      <section className="tidal" aria-labelledby="tidal-heading">
        <h2 id="tidal-heading">The part no coordinate choice can remove</h2>
        <div className="tidal-layout">
          <TidalPanel radius={readings.radius} />
          <div>
            <p>
              Every chart above disagrees about what time it is and what the picture looks like.
              None of them disagrees about this. Geodesic deviation — the relative acceleration of
              neighbouring free-fallers, ξ̈<sup>μ</sup> = −R<sup>μ</sup><sub>ανβ</sub>u<sup>α</sup>
              u<sup>ν</sup>ξ<sup>β</sup> — is the coordinate-independent content of gravity, and it
              is what a falling observer actually feels.
            </p>
            <p>
              It is <strong>finite at the horizon</strong>: −1.0 c²/r<sub>s</sub>² for this hole.
              Nothing happens to the faller crossing it. It diverges only as r → 0.
            </p>
            <p className="tidal-verdict">
              A uniform expansion of space has <strong>identically zero</strong> geodesic
              deviation. It cannot produce this panel at any radius. That is the sharpest limit on
              the “the mass is expanding toward you” reading: the picture explains falling and
              nothing else — not tides, not orbits, not the ISCO.
            </p>
          </div>
        </div>
      </section>

      <p className="visually-hidden" role="status" aria-live="polite">{announcement}</p>

      <MisconceptionsPanel items={[
        {
          myth: 'Space really is flowing inward, like a river — that is what gravity is.',
          reality: 'Half right, and the half that is right is exact. In Gullstrand–Painlevé '
            + 'coordinates Schwarzschild spacetime genuinely is flat space with an inward flow at '
            + 'the Newtonian escape velocity, and this is not an approximation: the constant-t_ff '
            + 'slices are exactly Euclidean. But the flow is a property of that coordinate '
            + 'choice. The Schwarzschild panel above shows the identical geometry as completely '
            + 'static, with no flow at all, and nothing invariant distinguishes them. Hamilton & '
            + 'Lisle, who wrote the river model, say so themselves: the flat background “has no '
            + 'physically observable meaning.”',
          figures: [
            { label: 'River speed at the horizon', value: 'exactly c' },
            { label: 'Kretschmann K there', value: '12 c⁴/r_s⁴ — finite' },
            { label: 'Charts that disagree about the flow', value: 'all four' },
            { label: 'Invariants that disagree', value: 'none' },
          ],
          source: {
            title: 'Hamilton & Lisle 2008 — The river model of black holes',
            url: 'https://arxiv.org/abs/gr-qc/0411060',
          },
        },
        {
          myth: 'The massive object is expanding toward us, and that is why things fall.',
          reality: 'It explains falling and nothing else, which is the problem. A uniform '
            + 'expansion has zero geodesic deviation, so it produces no tidal field — and tidal '
            + 'gravity is the invariant content of gravity, the panel above. It needs a preferred '
            + 'frame. It is not consistent between two gravitating bodies: which expansion does '
            + 'the space between two stars follow? And an inward flow alone cannot give you '
            + 'stable closed orbits or an ISCO, which come from the angular-momentum barrier in '
            + 'the effective potential, not from any flow.',
        },
        {
          myth: 'The faller freezes at the horizon and never crosses.',
          reality: 'That is one chart’s statement, not a fact about the faller. Schwarzschild t '
            + 'does diverge — the panel shows the worldline running off the top — and a distant '
            + 'observer does see the infalling image redden and dim without limit. But the '
            + 'faller’s own clock reaches the horizon in 14.42 r_s/c and keeps going. Three of '
            + 'the four charts label the crossing with a perfectly ordinary finite number.',
          figures: [
            { label: 'Proper time to the horizon from 8 r_s', value: '14.4183 r_s/c' },
            { label: 'Schwarzschild t at the horizon', value: 'infinite' },
            { label: 'Curvature at the horizon', value: 'finite and unremarkable' },
          ],
        },
        {
          myth: 'Superluminal flow inside the horizon breaks relativity.',
          reality: 'Nothing moves faster than light relative to the river, and only that is '
            + 'physical. The flow is not a substance: it carries no energy, no momentum and no '
            + 'stress-energy, it has no detectable state of motion, and no local experiment '
            + 'detects it. A freely-falling laboratory measures flat Minkowski physics to first '
            + 'order everywhere, inside the horizon included. Only tidal effects are locally '
            + 'detectable, and those are curvature.',
        },
      ]} />

      <Suspense fallback={<p role="status">Loading equations…</p>}>
        <PhysicsPanel
          equation={String.raw`\frac{dr}{d\tau}=-\sqrt{\frac{r_s}{r}},\qquad K=\frac{48M^2}{r^6},\qquad r = r_s\left[1+W_0\!\left(\tfrac{UV}{e}\right)\right]`}
          assumptions={[
            'Schwarzschild geometry: non-rotating, uncharged, vacuum. Radial infall from rest at infinity, the one trajectory for which Gullstrand–Painlevé time is exactly the faller’s proper time.',
            'Geometrized units with r_s = 1 and c = 1, so M = 1/2. Radii in r_s, times in r_s/c.',
            'Each chart’s time origin is a convention and no invariant depends on it. This module fixes t(r₀) = 0 and t_ff(r₀) = τ(r₀) = 0.',
            'Kruskal is carried in the null coordinates U = X − T and V = X + T. Forming X² − T² from stored X and T loses the precision the 10⁻¹⁰ gate needs: 9×10⁻⁶ relative error at r = 1.001 r_s, 9.7×10⁻⁴ at r = 1.00001 r_s. The product UV holds 5×10⁻¹⁴.',
            'The invariants are compared at the same physical events, labelled by proper time — never at the same coordinate values, which would compare different events, and never at the same r, which would compare a number with itself.',
            'Only the exterior and the horizon crossing are shown. The interior is a different problem and is not modelled here.',
            'The tidal figure’s deformation is exaggerated and swept logarithmically; the 2:1 ratio of radial stretch to transverse squeeze is exact and is drawn to scale.',
          ]}
          sources={[
            { title: 'Hamilton & Lisle 2008 — The river model of black holes', url: 'https://arxiv.org/abs/gr-qc/0411060' },
            { title: 'Misner, Thorne & Wheeler — Gravitation, §31 (Kruskal) and §32 (infall)', url: 'https://press.princeton.edu/books/hardcover/9780691177793/gravitation' },
            { title: 'Martel & Poisson 2001 — Regular coordinate systems for Schwarzschild', url: 'https://arxiv.org/abs/gr-qc/0001069' },
            { title: 'Carroll — Spacetime and Geometry, ch. 5', url: 'https://www.preposterousuniverse.com/spacetimeandgeometry/' },
          ]}
        />
      </Suspense>

      <p className="verification-note">
        Verified numerically, not by eye: at every sampled event the four charts recover the same
        areal radius to 10⁻¹², and the same Kretschmann scalar and tidal component to 10⁻¹⁰, each
        by its own inverse. A paired test asserts that the <em>wrong</em> comparison — the same
        coordinate value in each chart — disagrees by {naive.ratio.toFixed(0)}×, so the correct one
        cannot quietly become vacuous. 35 mutations of the underlying arithmetic were introduced
        and all 35 make the suite fail.
      </p>
    </article>
  );
}
