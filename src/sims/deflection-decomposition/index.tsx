/** "Time dilation causes gravity" — the interactive that settles it. PHYSICS_SPEC §7.4 Claim A.
 *
 * The claim is exactly right in the slow limit and exactly half right for light. The exhibit is
 * the factor of two: 0.8756" from the curvature of time, 0.8756" more from the curvature of
 * space, measured 1.7512" in total.
 */
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Button, ToggleButton } from 'react-aria-components';
import { NumberSlider } from '../../ui/NumberSlider';
import { MisconceptionsPanel } from '../../ui/MisconceptionsPanel';
import { SimStage, StageCanvas } from '../../ui/sim/SimStage';
import {
  CASSINI_GAMMA_OFFSET,
  CASSINI_GAMMA_UNCERTAINTY,
  DEFLECTION_PRESETS,
  EINSTEIN_1911_PPN_GAMMA,
  GR_PPN_GAMMA,
  weakDeflectionBetaThreshold,
} from '../../core/deflection';
import { C } from '../../core/units';
import {
  MAX_LOG_BETA,
  SLIDER_STEPS,
  deflectionFigures,
  describeDeflection,
  formatArcseconds,
  formatRatio,
  formatSpeed,
  indexFromLogBeta,
  logBetaFromIndex,
} from './description/describeDeflection';
import { DeflectionChart } from './view/DeflectionChart';
import { RayBending } from './view/RayBending';
import './deflection.css';

const PhysicsPanel = lazy(() =>
  import('../../ui/PhysicsPanel').then(module => ({ default: module.PhysicsPanel })));


/** Live-region updates are throttled so dragging does not flood a screen reader (BUILD_PLAN §6). */
const ANNOUNCE_DELAY_MS = 600;
const PERCENT = 100;
const SIM_ID = 'deflection-decomposition';
/** Cassini's bound is quoted in units of 10^-5; this renders it that way. */
const CASSINI_DISPLAY_SCALE = 1e5;

export default function DeflectionDecomposition() {
  const [logBeta, setLogBeta] = useState(MAX_LOG_BETA);
  const [ppnGamma, setPpnGamma] = useState<number>(GR_PPN_GAMMA);
  const [announcement, setAnnouncement] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const figures = useMemo(() => deflectionFigures({ logBeta, ppnGamma }), [logBeta, ppnGamma]);
  const summary = useMemo(() => describeDeflection({ logBeta, ppnGamma }), [logBeta, ppnGamma]);
  const threshold = useMemo(() => weakDeflectionBetaThreshold({ ppnGamma }), [ppnGamma]);

  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setAnnouncement(summary), ANNOUNCE_DELAY_MS);
    return () => clearTimeout(timer.current);
  }, [summary]);

  const timeShare = figures.timeCurvature / figures.total;

  return (
    <article className="deflection sim-page">
      <div className="deflection-head">
        <p className="eyebrow">Interpretations · Claim A</p>
        <h1>Does time dilation<br /><em>cause</em> gravity?</h1>
        <p className="intro">
          Almost, and the “almost” is measurable. In everyday gravity essentially the whole effect
          comes from the way mass distorts the rate of time — for a falling apple the spatial
          distortion contributes about a part in 10¹⁵. But that is a statement about a limit, not a
          cause. For light the two contribute equally, which is exactly why starlight bends 1.75″
          past the Sun and not 0.875″.
        </p>
      </div>

      <SimStage
        simId={SIM_ID}
        panelLabel="Controls"
        showTransport={false}
        canvas={
          <StageCanvas simId={SIM_ID} dragging={false}>
            <div className="stage-svg chart-host" tabIndex={0} role="group" aria-label="Deflection against particle speed">
              <DeflectionChart logBeta={logBeta} ppnGamma={ppnGamma} />
            </div>
          </StageCanvas>
        }
        controls={<>
      <section className="split" aria-labelledby="split-heading">
        <h2 id="split-heading">The split at this speed</h2>
        <div
          className="split-bar"
          role="img"
          aria-label={
            `Time curvature ${formatArcseconds(figures.timeArcsec)}, space curvature `
            + `${formatArcseconds(figures.spaceArcsec)}.`
          }
        >
          <div className="split-time" style={{ width: `${timeShare * PERCENT}%` }}>
            <span>Time curvature</span>
          </div>
          <div className="split-space" style={{ width: `${(1 - timeShare) * PERCENT}%` }}>
            <span>Space curvature</span>
          </div>
        </div>
        <dl className="split-figures">
          <div>
            <dt>Time curvature</dt>
            <dd>{formatArcseconds(figures.timeArcsec)}</dd>
          </div>
          <div>
            <dt>Space curvature</dt>
            <dd>{formatArcseconds(figures.spaceArcsec)}<span>constant at every speed</span></dd>
          </div>
          <div>
            <dt>Total</dt>
            <dd>{formatArcseconds(figures.totalArcsec)}</dd>
          </div>
          <div>
            <dt>Space ÷ time</dt>
            <dd>{formatRatio(figures.spaceOverTime)}<span>= (v/c)²</span></dd>
          </div>
        </dl>
        {!figures.weakDeflectionValid && (
          <p className="domain-warning" role="status">
            <strong>Outside the formula’s domain.</strong> α(β) is a linearised, small-deflection
            result. At {formatSpeed(figures.speed)} it returns {formatArcseconds(figures.totalArcsec)},
            which is {figures.fullTurns.toExponential(2)} full turns — not a deflection at all. A
            particle this slow aimed at the solar limb is simply captured. The ratio above is still
            exact; the total is not. The approximation holds above{' '}
            {formatSpeed(threshold * C)}.
          </p>
        )}
      </section>

      <RayBending logBeta={logBeta} ppnGamma={ppnGamma} />

      <section className="controls" aria-labelledby="controls-heading">
        <h2 id="controls-heading">Controls</h2>
        <div className="controls-grid">
          <NumberSlider
            label="Particle speed"
            value={indexFromLogBeta(logBeta)}
            onChange={index => setLogBeta(logBetaFromIndex(index))}
            minValue={0}
            maxValue={SLIDER_STEPS}
            step={1}
            format={() => formatSpeed(figures.speed)}
            hint={'Logarithmic: the slider spans fifteen orders of magnitude, from a falling '
              + 'apple to light.'}
          />
          <div className="preset-group">
            <p className="preset-label" id="preset-label">Jump to</p>
            <div className="preset-buttons" role="group" aria-labelledby="preset-label">
              {DEFLECTION_PRESETS.map(preset => (
                <Button
                  key={preset.id}
                  onPress={() => setLogBeta(Math.log10(preset.speed / C))}
                  className={figures.presetId === preset.id ? 'preset active' : 'preset'}
                >
                  {preset.label}<span>{preset.note}</span>
                </Button>
              ))}
            </div>
          </div>
          <div className="gamma-group">
            <p className="preset-label" id="gamma-label">Space-curvature coefficient γ</p>
            <div className="preset-buttons" role="group" aria-labelledby="gamma-label">
              <ToggleButton
                isSelected={ppnGamma === GR_PPN_GAMMA}
                onChange={() => setPpnGamma(GR_PPN_GAMMA)}
                className="preset"
              >
                γ = 1<span>General relativity</span>
              </ToggleButton>
              <ToggleButton
                isSelected={ppnGamma === EINSTEIN_1911_PPN_GAMMA}
                onChange={() => setPpnGamma(EINSTEIN_1911_PPN_GAMMA)}
                className="preset"
              >
                γ = 0<span>Einstein 1911</span>
              </ToggleButton>
            </div>
            <p className="control-hint">
              γ is the PPN coefficient of spatial curvature. Cassini measured γ − 1 ={' '}
              ({CASSINI_GAMMA_OFFSET * CASSINI_DISPLAY_SCALE} ± {CASSINI_GAMMA_UNCERTAINTY * CASSINI_DISPLAY_SCALE})×10⁻⁵, so the two
              contributions are measured equal to about two parts in 10⁵. γ = 0 is Einstein’s 1911
              calculation, which the 1919 eclipse ruled out.
            </p>
          </div>
        </div>
      </section>

      <div className="chart-section">
        <p className="chart-intro">
          The space contribution is the flat line: <strong>0.8756″ at every speed</strong>. It is
          the time contribution that diverges for slow particles, not the space contribution that
          vanishes — which is the opposite of how the claim is usually told.
        </p>
        <ul className="chart-key">
          <li className="key-total">Total</li>
          <li className="key-time">Time curvature</li>
          {ppnGamma === EINSTEIN_1911_PPN_GAMMA
            ? <li className="key-absent">Space curvature — zero at γ = 0, not drawable on a log axis</li>
            : <li className="key-space">Space curvature</li>}
        </ul>
      </div>
        </>}
      >

      <p className="visually-hidden" role="status" aria-live="polite">{announcement}</p>

      <MisconceptionsPanel items={[
        {
          myth: 'Gravity just is time dilation — clocks run slower lower down, and that is the '
            + 'whole of it.',
          reality: 'True in the Newtonian limit and false in general. In the weak field with slow '
            + 'motion the entire force does come from g₀₀ alone, and the variational statement is '
            + 'airtight: a free particle extremises proper time, and in the weak field the '
            + 'relativistic action reduces exactly to the Newtonian one. But the ratio of the '
            + 'space to the time contribution is exactly (v/c)², so the statement degrades as '
            + 'speed rises and fails completely at v = c. Light deflection is the decisive '
            + 'measurement: time curvature alone predicts 0.8756″ at the solar limb, and the '
            + 'measured value is twice that.',
          figures: [
            { label: 'Time curvature only (Einstein 1911)', value: '0.8756″' },
            { label: 'Measured (Einstein 1915, GR)', value: '1.7512″' },
            { label: 'Ratio', value: 'exactly 2' },
            { label: 'Cassini bound on γ − 1', value: '(2.1 ± 2.3)×10⁻⁵' },
          ],
          source: {
            title: 'Will 2014 — The Confrontation between General Relativity and Experiment §3.4.1',
            url: 'https://doi.org/10.12942/lrr-2014-4',
          },
        },
        {
          myth: 'So time dilation causes the spatial curvature.',
          reality: 'Neither causes the other. Φ appears in g₀₀ and in g_ij; both are components of '
            + 'one curved geometry. Saying time dilation causes gravity is like saying the '
            + 'hypotenuse causes the legs. Worse for the causal reading: time dilation exists with '
            + 'zero curvature at all — a Rindler observer in flat Minkowski spacetime sees '
            + 't₀ = t_f e^(gh/c²), full gravitational-style time dilation with an identically zero '
            + 'Riemann tensor. Time dilation is neither sufficient for curvature nor equivalent '
            + 'to it.',
        },
        {
          myth: 'The space contribution vanishes for slow particles, which is why we never notice '
            + 'it.',
          reality: 'It does not vanish; it is constant. The space term is 0.8756″ at the solar '
            + 'limb for a particle of any speed. What changes is the time term, which grows as '
            + '1/β² and swamps it. Move the slider and watch the flat line stay exactly where it '
            + 'is. This is the one thing the ratio table cannot show you.',
        },
        {
          myth: 'Not all gravity even has a Φ.',
          reality: 'Correct, and it is the sharpest limit on the claim. Frame dragging comes from '
            + 'g_tφ. The ergosphere and Lense–Thirring precession have no time-dilation '
            + 'explanation whatsoever. Nor can time dilation produce tidal gravity, which is the '
            + 'coordinate-independent content of gravity: geodesic deviation, ξ̈ᵘ = '
            + '−Rᵘ_ανβ uᵅ uᵛ ξᵝ.',
        },
      ]} />

      <Suspense fallback={<p role="status">Loading equations…</p>}>
        <PhysicsPanel
          equation={String.raw`\alpha(\beta,\gamma) = \frac{2GM}{c^2b}\left(\frac{1}{\beta^2}+\gamma\right),\qquad \beta \equiv v/c`}
          assumptions={[
            'Weak field and small deflection. This is a linearised result: it is meaningful only while α ≪ 1 rad. At the solar limb that means v > 6180 km/s; below it the figure shown is flagged and is not a deflection.',
            'The exact Newtonian comparison for the time term is tan(α/2) = GM/bv². It agrees with the linearisation to better than 0.02% at α = 0.01 rad and differs by a factor of 2 at β = 9.542×10⁻⁴.',
            'The deflector is a static, spherically symmetric mass; the default is the Sun with a ray grazing the limb, b = R☉. No solar oblateness, no corona refraction.',
            'γ is the PPN space-curvature coefficient: 1 in general relativity, 0 in Einstein’s 1911 calculation. It multiplies the space term only.',
            'The (v/c)² ratio between the two contributions is exact within this decomposition and holds at every speed, including where the absolute angle does not.',
            'Angles in the ray figure are exaggerated by the stated factor; drawn true, all three lines coincide.',
          ]}
          sources={[
            { title: 'Will 2014 — The Confrontation between General Relativity and Experiment', url: 'https://doi.org/10.12942/lrr-2014-4' },
            { title: 'Bertotti, Iess & Tortora 2003 — A test of general relativity using radio links with Cassini', url: 'https://www.nature.com/articles/nature01997' },
            { title: 'Misner, Thorne & Wheeler — Gravitation §1.6, the Parable of the Apple', url: 'https://press.princeton.edu/books/hardcover/9780691177793/gravitation' },
            { title: 'Hughes — MIT 8.962 General Relativity, Lecture 9', url: 'https://ocw.mit.edu/courses/8-962-general-relativity-spring-2020/' },
          ]}
        />
      </Suspense>

      <p className="verification-note">
        Verified numerically, not by eye: 1.7512″ and 0.8756″ are computed from 2GM☉/c²R☉ and
        asserted against §8 rows 2 and 3, the space term is asserted constant across the whole
        slider, and the time term’s 1/β² exponent is asserted as a log-log slope at three
        separate places on the axis rather than at β = 1, where the two lines cross and any wrong
        exponent would still pass through the same point.
      </p>
      </SimStage>
    </article>
  );
}
