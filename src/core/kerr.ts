/** Kerr geometry: horizons, the ergosphere, the ZAMO field, photon orbits, the shadow and the
 * Penrose process. PHYSICS_SPEC §3.
 *
 * Geometric units (G = c = 1) with **M = 1** throughout, so `spin` is a/M and every radius is in
 * M. The geometry is scale-free in exactly the way §2.5's Schwarzschild one is: only a/M and r/M
 * enter, so the pictures are mass-independent and only the labels beside them change.
 *
 * Framework-free, float64. Nothing here knows about a canvas.
 */

const TWO = 2;
const THREE = 3;
const FOUR = 4;
const HALF = 0.5;
/** a/M = 1 is the extremal limit: the horizon is degenerate and the metric is singular there. */
export const MAX_SPIN = 0.998;
/** Cube root, as an exponent. */
const THIRD = 1 / 3;
/** Teo's closed form carries a factor 2/3 inside the arccos. */
const TWO_THIRDS = 2 / 3;
const NINE = 9;
const TWENTY_SEVEN = 27;
/** Golden-section ratio used to bracket an interior extremum. */
const GOLDEN_LO = 0.382;
const GOLDEN_HI = 0.618;
const GOLDEN_STEPS = 200;
const BISECTION_STEPS = 80;
/** η is O(27); this is far below any real feature and far above the endpoint rounding. */
const CLOSURE_TOLERANCE = 1e-12;
/** Relative to ε²: below this a negative radial momentum squared is a turning point. */
const TURNING_TOLERANCE = 1e-12;

function requireSpin(spin: number): void {
  if (!Number.isFinite(spin) || spin < 0 || spin >= 1) {
    throw new RangeError('Spin a/M must be in [0, 1): a = M is extremal and singular.');
  }
}

/**
 * Δ = (r − r₊)(r − r₋), **not** r² − 2Mr + a².
 *
 * The two are the same polynomial and they are not the same computation. At a/M = 0.998 the
 * literal form evaluated at r₊ = 1.0632 returns 1.4×10⁻¹⁷ rather than 0, and √Δ of that is
 * 3.7×10⁻⁹ — which is the entire width of a light cone that is supposed to have closed to a
 * point. Vieta does the cancellation exactly: r₊ + r₋ = 2M and r₊r₋ = a².
 */
export function delta(radius: number, spin: number): number {
  const root = Math.sqrt(Math.max(1 - spin * spin, 0));
  return (radius - (1 + root)) * (radius - (1 - root));
}

/**
 * Σ² = (r²+a²)² − a²Δ sin²θ, in the equatorial plane where sin θ = 1.
 *
 * Written this way rather than as g_φφ r² because it is the form with no cancellation: near the
 * horizon Δ → 0 and the two terms are of very different size.
 */
export const sigmaSquared = (radius: number, spin: number): number =>
  (radius * radius + spin * spin) ** TWO - spin * spin * delta(radius, spin);

/** Outer and inner horizons, r± = M ± √(M²−a²). */
export function horizonRadii(spin: number): { outer: number; inner: number } {
  requireSpin(spin);
  const root = Math.sqrt(1 - spin * spin);
  return { outer: 1 + root, inner: 1 - root };
}

/**
 * The ergosphere boundary (static limit), r_E(θ) = M + √(M² − a²cos²θ).
 *
 * **Equatorially this is exactly 2M for every spin** — the ergosphere does not shrink towards the
 * horizon as the hole spins up, which is the way it is most often drawn wrongly. Only its polar
 * extent moves, from 2M at a = 0 (where it coincides with the horizon and the region is empty)
 * down to r₊ at the poles.
 */
export function ergosphereRadius(spin: number, polarAngle: number): number {
  requireSpin(spin);
  const cosine = Math.cos(polarAngle);
  return 1 + Math.sqrt(1 - spin * spin * cosine * cosine);
}

/** The equatorial static limit, 2M, named because three separate checks land on it. */
export const EQUATORIAL_ERGOSPHERE_RADIUS = TWO;

/** The ZAMO (locally non-rotating) angular velocity, ω = 2Mar/Σ², equatorially. */
export function omegaZamo(radius: number, spin: number): number {
  requireSpin(spin);
  if (!(radius > 0)) throw new RangeError('Radius must be positive.');
  return (TWO * spin * radius) / sigmaSquared(radius, spin);
}

/**
 * Ω_H = a/(2Mr₊) = a/(r₊²+a²).
 *
 * The two published forms are the same number, because r₊² + a² = 2Mr₊ is the horizon equation
 * itself. Both appear in the literature; this returns the first and the tests assert the second.
 */
export function horizonAngularVelocity(spin: number): number {
  const { outer } = horizonRadii(spin);
  return spin / (TWO * outer);
}

/** The lapse α = r√Δ/Σ, equatorially. Zero at the horizon: the LNRF degenerates there. */
export function lapse(radius: number, spin: number): number {
  const d = delta(radius, spin);
  if (d < 0) throw new RangeError('Inside the horizon there is no static or ZAMO frame.');
  return (radius * Math.sqrt(d)) / Math.sqrt(sigmaSquared(radius, spin));
}

/**
 * The range of dφ/dt available to any timelike or null worldline at radius r, equatorially:
 *
 *     Ω± = ω ± α/ϖ = (2Mar ± r²√Δ) / Σ²
 *
 * The centre of the wedge is the ZAMO's ω and its half-width is the local light cone's opening
 * in φ. **Ω₋ = 0 at exactly r = 2M for every spin**, so outside the ergosphere standing still is
 * one of the options and inside it every worldline has dφ/dt > 0 — not "difficult": unavailable.
 * At r₊ the wedge closes to the single value Ω_H, which is what "the horizon rotates rigidly"
 * means. PHYSICS_SPEC §3.5.
 */
export function angularVelocityRange(
  radius: number, spin: number,
): { min: number; max: number } {
  requireSpin(spin);
  const d = Math.max(delta(radius, spin), 0);
  const s2 = sigmaSquared(radius, spin);
  const drag = (TWO * spin * radius) / s2;
  const halfWidth = (radius * radius * Math.sqrt(d)) / s2;
  return { min: drag - halfWidth, max: drag + halfWidth };
}

/**
 * dr/dt and dφ/dt for a particle dropped from rest at infinity with **exactly zero angular
 * momentum**, equatorially (E = μ, L_z = 0). PHYSICS_SPEC §3.5.
 *
 *     dr/dt = −√(1−α²) Δ/Σ,   dφ/dt = ω
 *
 * At a = 0 this is the Schwarzschild radial fall and dφ/dt is identically zero. For a ≠ 0 the
 * angular momentum is zero for the whole trajectory and φ still advances. That is the whole
 * demonstration: nothing is pushing it sideways.
 */
export function draggedInfallRates(
  radius: number, spin: number,
): { radial: number; angular: number } {
  requireSpin(spin);
  const d = Math.max(delta(radius, spin), 0);
  const s2 = sigmaSquared(radius, spin);
  const lapseSquared = (radius * radius * d) / s2;
  return {
    radial: -Math.sqrt(Math.max(1 - lapseSquared, 0)) * (d / Math.sqrt(s2)),
    angular: (TWO * spin * radius) / s2,
  };
}

/** ϖ = Σ/r, the circumferential radius, equatorially. */
export const varpi = (radius: number, spin: number): number =>
  Math.sqrt(sigmaSquared(radius, spin)) / radius;

/**
 * ωϖ = 2Ma/Σ. This is the quantity that has to exceed the lapse for negative energy to exist,
 * and it is why the ergosphere is the boundary of the Penrose process.
 */
export const omegaVarpi = (radius: number, spin: number): number =>
  (TWO * spin) / Math.sqrt(sigmaSquared(radius, spin));

/** True inside the ergosphere, where g_tt > 0 and no observer can remain static. */
export const insideErgosphere = (radius: number, spin: number): boolean =>
  omegaVarpi(radius, spin) > lapse(radius, spin);

// --- photon orbits, PHYSICS_SPEC §3.4b -------------------------------------------------------

export type Sense = 'prograde' | 'retrograde';

/**
 * Equatorial circular photon orbit (Teo 2003):
 * r = 2M{1 + cos[⅔ arccos(∓a/M)]}, with M ≤ r₁ ≤ 3M ≤ r₂ ≤ 4M.
 */
export function photonOrbitRadius(spin: number, sense: Sense): number {
  requireSpin(spin);
  const sign = sense === 'prograde' ? -1 : 1;
  return TWO * (1 + Math.cos(TWO_THIRDS * Math.acos(sign * spin)));
}

/**
 * r³ − 6Mr² + 9M²r − 4a²M, whose roots ARE the equatorial photon orbits.
 *
 * This is the cubic, and it is not the similar-looking r³ − 3Mr² + a²r + Ma², which is the ξ = 0
 * condition — the POLAR spherical photon orbit. The two agree at a = 0 and at a = M and nowhere
 * else; see `polarPhotonOrbitCubic` and PHYSICS_SPEC §3.4b.
 */
export const photonOrbitCubic = (radius: number, spin: number): number =>
  radius ** THREE - 6 * radius * radius + NINE * radius - FOUR * spin * spin;

/** r³ − 3Mr² + a²r + Ma²: the ξ = 0 condition, i.e. the POLAR spherical photon orbit. */
export const polarPhotonOrbitCubic = (radius: number, spin: number): number =>
  radius ** THREE - THREE * radius * radius + spin * spin * radius + spin * spin;

/** ISCO radius, Bardeen–Press–Teukolsky. PHYSICS_SPEC §3.3. */
export function iscoRadius(spin: number, sense: Sense = 'prograde'): number {
  requireSpin(spin);
  const z1 = 1 + (1 - spin * spin) ** THIRD
    * ((1 + spin) ** THIRD + (1 - spin) ** THIRD);
  const z2 = Math.sqrt(THREE * spin * spin + z1 * z1);
  const root = Math.sqrt((THREE - z1) * (THREE + z1 + TWO * z2));
  return THREE + z2 + (sense === 'prograde' ? -root : root);
}

// --- the shadow, PHYSICS_SPEC §3.4c ----------------------------------------------------------

/** ξ = L_z/E for the spherical photon orbit at radius r (Bardeen 1973). */
export function bardeenXi(radius: number, spin: number): number {
  if (spin === 0) throw new RangeError('The Bardeen parametrisation is singular at a = 0.');
  return ((radius * radius - spin * spin) - radius * delta(radius, spin))
    / (spin * (radius - 1));
}

/**
 * η = Q/E² for the spherical photon orbit at radius r (Bardeen 1973), in factored form.
 *
 * Bardeen writes η = r³[4MΔ − r(r−M)²] / [a²(r−M)²]. That bracket is **exactly** minus the
 * photon-orbit cubic of §3.4b:
 *
 *     4Δ − r(r−1)² = −(r³ − 6r² + 9r − 4a²)
 *
 * so η vanishes precisely at the two equatorial photon orbits, which is the statement that the
 * shadow closes on the α axis there. Evaluated literally the bracket is a catastrophic
 * cancellation — at a/M = 0.1 the two terms are ≈10.225 and differ by 2×10⁻⁴, and the a² in the
 * denominator then multiplies the error by a hundred. Sampling the boundary that way gave
 * β = 0.42 M at a point where β is exactly zero.
 *
 * Factoring by the cubic's own three roots removes the cancellation and the a² together, since
 * r₁r₂r₃ = 4a² and r₁+r₂+r₃ = 6 by Vieta:
 *
 *     η(r) = −4r³ (r−r₁)(r−r₂)(r−r₃) / [ r₁r₂r₃ (r−M)² ]
 *
 * r₁ and r₂ are the prograde and retrograde orbits; r₃ = 6M − r₁ − r₂ is the root inside the
 * horizon that squaring introduced.
 */
export function bardeenEta(radius: number, spin: number): number {
  if (spin === 0) throw new RangeError('The Bardeen parametrisation is singular at a = 0.');
  const inner = photonOrbitRadius(spin, 'prograde');
  const outer = photonOrbitRadius(spin, 'retrograde');
  const spurious = 6 - inner - outer;
  const product = inner * outer * spurious;
  return -(FOUR * radius ** THREE * (radius - inner) * (radius - outer) * (radius - spurious))
    / (product * (radius - 1) ** TWO);
}

/** Bardeen's η written literally, kept only so a test can show why it is not what is used. */
export function bardeenEtaUnfactored(radius: number, spin: number): number {
  const d = delta(radius, spin);
  return (radius ** THREE * (FOUR * d - radius * (radius - 1) ** TWO))
    / (spin * spin * (radius - 1) ** TWO);
}

/**
 * η(3M) = 27M² for every spin, so the Kerr shadow's vertical half-extent seen edge-on is
 * 3√3 M regardless of a. Exported as the constant it is, because a renderer that reproduces only
 * the shadow's size has demonstrated nothing about spin.
 */
export const SHADOW_VERTICAL_HALF_EXTENT = Math.sqrt(TWENTY_SEVEN);

/** A point on the shadow boundary in Bardeen's celestial coordinates. */
export interface ShadowPoint {
  alpha: number;
  beta: number;
  /** The spherical photon orbit radius this point comes from. */
  radius: number;
}

/**
 * The shadow boundary for an observer at infinity at polar angle `inclination`.
 *
 * Traced by the spherical photon orbits over r ∈ [r₁, r₂], where η vanishes at both ends and the
 * curve closes on the α axis. Only the upper half is returned; the curve is symmetric in β.
 *
 * At a = 0 the parametrisation is singular and the curve is the circle of radius 3√3 M — handled
 * explicitly rather than approached, because dividing by a² is not a limit a renderer can take.
 */
export function shadowBoundary(
  spin: number, inclination: number, samples: number,
): ShadowPoint[] {
  requireSpin(spin);
  if (samples < THREE) throw new RangeError('The shadow needs at least three samples.');
  const sine = Math.sin(inclination);
  if (!(Math.abs(sine) > 0)) throw new RangeError('A pole-on observer needs a different chart.');
  if (spin === 0) {
    // The exact Schwarzschild circle. Half of it, to match the Kerr branch's upper half.
    return Array.from({ length: samples }, (_, index) => {
      const angle = Math.PI * (index / (samples - 1));
      return {
        alpha: SHADOW_VERTICAL_HALF_EXTENT * Math.cos(angle),
        beta: SHADOW_VERTICAL_HALF_EXTENT * Math.sin(angle),
        radius: THREE,
      };
    });
  }
  const inner = photonOrbitRadius(spin, 'prograde');
  const outer = photonOrbitRadius(spin, 'retrograde');
  const cotangent = Math.cos(inclination) / sine;
  const points: ShadowPoint[] = [];
  for (let index = 0; index < samples; index++) {
    // Chebyshev spacing, clustered at both ends. β goes as √(r−r₁) at the ends, so uniform
    // spacing puts the first sample a visible distance up a vertical cusp: with 601 uniform
    // samples at a/M = 0.1 the boundary started at β = 0.42 M where β is exactly zero, and the
    // drawn outline had a notch in it at each end.
    const angle = (Math.PI * index) / (samples - 1);
    const radius = inner + (outer - inner) * HALF * (1 - Math.cos(angle));
    if (Math.abs(radius - 1) < Number.EPSILON) continue;
    const xi = bardeenXi(radius, spin);
    const under = bardeenEta(radius, spin)
      + spin * spin * Math.cos(inclination) ** TWO - xi * xi * cotangent * cotangent;
    // η is exactly zero at both ends, so `under` there is whatever the other two terms round to
    // — of order 1e-33 for an equatorial observer, and negative as often as not. Rejecting that
    // drops both endpoints and leaves the closed curve open. Anything genuinely negative, which
    // is what happens off the equator where part of the range carries no boundary at all, is
    // still rejected; η is of order 27, so this threshold cannot swallow one.
    if (under < -CLOSURE_TOLERANCE) continue;
    points.push({ alpha: -xi / sine, beta: Math.sqrt(Math.max(under, 0)), radius });
  }
  return points;
}

/**
 * The shadow's horizontal extent [α_min, α_max] for an equatorial observer, from the two
 * equatorial photon orbits. At a → M this is Bardeen's own [−2M, +7M].
 */
export function shadowExtent(spin: number): { min: number; max: number; midpoint: number } {
  requireSpin(spin);
  if (spin === 0) {
    return {
      min: -SHADOW_VERTICAL_HALF_EXTENT, max: SHADOW_VERTICAL_HALF_EXTENT, midpoint: 0,
    };
  }
  const min = -bardeenXi(photonOrbitRadius(spin, 'prograde'), spin);
  const max = -bardeenXi(photonOrbitRadius(spin, 'retrograde'), spin);
  return { min, max, midpoint: (min + max) * HALF };
}

// --- the Penrose process, PHYSICS_SPEC §3.6 ---------------------------------------------------

/**
 * η_max(a) = ½(√(2M/r₊) − 1) — the maximum fraction of its own energy a particle dropped from
 * rest at infinity can gain by splitting inside the ergosphere.
 *
 * 0 at a = 0 (no ergosphere) and ½(√2 − 1) = 0.207107 at a = M: the classical 20.7%.
 * **Not** 1 − 1/√2, which is 0.2929 — see PHYSICS_SPEC §3.6.
 */
export function penroseMaxEfficiency(spin: number): number {
  const { outer } = horizonRadii(spin);
  return HALF * (Math.sqrt(TWO / outer) - 1);
}

/** One Penrose split: the parent's turning point, and the two fragments it produces. */
export interface PenroseSplit {
  /** Split radius, in M. */
  radius: number;
  /** The parent's conserved angular momentum at its turning point, given E = 1. */
  parentAngularMomentum: number;
  /** Energy of the fragment that plunges. Negative inside the ergosphere; that is the effect. */
  plungingEnergy: number;
  /** Energy of the fragment that escapes. Exceeds the parent's whenever the other is negative. */
  escapingEnergy: number;
  /** (E₂ − E_in)/E_in. Zero at the static limit, η_max(a) as r → r₊. */
  gain: number;
}

/**
 * The LNRF split of PHYSICS_SPEC §3.6, at the parent's radial turning point.
 *
 * The parent has unit rest mass and E = 1 (dropped from rest at infinity); the turning-point
 * condition fixes its angular momentum. It splits into two photons along ±φ̂ in the LNRF, which
 * is the configuration that maximises the escaping energy once p^(r) = 0.
 *
 * The quadratic for L is written cancellation-free — Δ and Σ² are never subtracted from anything
 * of their own size — because near the horizon the naive form loses every significant digit.
 */
export function penroseSplit(radius: number, spin: number): PenroseSplit {
  requireSpin(spin);
  const { outer } = horizonRadii(spin);
  if (!(radius > outer)) throw new RangeError('The split must happen outside the horizon.');
  const d = delta(radius, spin);
  const s2 = sigmaSquared(radius, spin);
  const s = Math.sqrt(s2);
  const alpha = (radius * Math.sqrt(d)) / s;
  const drag = (TWO * spin) / s;

  const qa = radius * radius * (FOUR * spin * spin - radius * radius * d);
  const qb = -FOUR * spin * radius * s2;
  const qc = s2 * TWO * radius * (radius * radius + spin * spin);
  // At exactly r = 2M the quadratic degenerates to a linear equation: r²Δ = 4a² there, which is
  // the static limit itself. That is a boundary the sim can be driven to, not an edge case.
  const roots: number[] = [];
  if (Math.abs(qa) < Number.EPSILON * Math.abs(qb)) {
    if (qb !== 0) roots.push(-qc / qb);
  } else {
    const discriminant = qb * qb - FOUR * qa * qc;
    if (!(discriminant >= 0)) throw new RangeError('No turning point at this radius.');
    const root = Math.sqrt(discriminant);
    roots.push((-qb + root) / (TWO * qa), (-qb - root) / (TWO * qa));
  }

  let best: PenroseSplit | null = null;
  for (const angularMomentum of roots) {
    const localEnergy = (s2 - TWO * spin * radius * angularMomentum)
      / (radius * Math.sqrt(d) * s);
    if (!(localEnergy > 0)) continue;
    const localMomentum = (angularMomentum * radius) / s;
    const escapingEnergy = HALF * (localEnergy + localMomentum) * (alpha + drag);
    const plungingEnergy = HALF * (localEnergy - localMomentum) * (alpha - drag);
    if (best === null || escapingEnergy > best.escapingEnergy) {
      best = {
        radius,
        parentAngularMomentum: angularMomentum,
        plungingEnergy,
        escapingEnergy,
        gain: escapingEnergy - 1,
      };
    }
  }
  if (best === null) throw new RangeError('No physical split at this radius.');
  return best;
}

/** A test body on an equatorial orbit, as its two conserved quantities and its rest mass. */
export interface EquatorialOrbit {
  /** E = −p_t. **Negative is legal inside the ergosphere** — that is the Penrose process. */
  energy: number;
  /** L_z = p_φ. */
  angularMomentum: number;
  /** 0 for a photon, 1 for a unit-mass particle. */
  mass: number;
  /** +1 outgoing, −1 ingoing. */
  radialSign: 1 | -1;
}

/**
 * dr/dt and dφ/dt in Boyer–Lindquist coordinate time, equatorially, from the LNRF.
 *
 *     ε = (E − ωL)/α,   p^(φ) = L/ϖ,   p^(r) = ±√(ε² − μ² − p^(φ)²)
 *     dr/dt = (p^(r)/ε)·α√Δ/r,        dφ/dt = ω + (p^(φ)/ε)·α/ϖ
 *
 * ε is the LNRF energy and is positive for anything physical, **including a fragment whose
 * conserved E is negative**: E = αε + ωL, so a negative E inside the ergosphere is a statement
 * about ω, not about the fragment's own energy in its own neighbourhood.
 *
 * Returns `null` where the body cannot be — ε² < μ² + p^(φ)², i.e. beyond a turning point.
 */
export function equatorialRates(
  radius: number, spin: number, orbit: EquatorialOrbit,
): { radial: number; angular: number } | null {
  requireSpin(spin);
  const d = delta(radius, spin);
  if (!(d > 0)) return null;
  const s2 = sigmaSquared(radius, spin);
  const s = Math.sqrt(s2);
  const alpha = (radius * Math.sqrt(d)) / s;
  const varpiValue = s / radius;
  const drag = (TWO * spin * radius) / s2;

  const localEnergy = (orbit.energy - drag * orbit.angularMomentum) / alpha;
  if (!(localEnergy > 0)) return null;
  const localAngular = orbit.angularMomentum / varpiValue;
  const radialSquared = localEnergy * localEnergy
    - orbit.mass * orbit.mass - localAngular * localAngular;
  // A body sitting exactly AT its turning point has radialSquared = 0 by construction and
  // computes to a few units in the last place either side of it. Rejecting a rounding-level
  // negative would refuse to start the Penrose fragments at the split radius, which is the one
  // place they are defined. Anything genuinely beyond the turning point is still refused: the
  // scale is ε², so this threshold cannot swallow a real one.
  if (radialSquared < -TURNING_TOLERANCE * localEnergy * localEnergy) return null;
  const localRadial = orbit.radialSign * Math.sqrt(Math.max(radialSquared, 0));
  return {
    radial: (localRadial / localEnergy) * ((alpha * Math.sqrt(d)) / radius),
    angular: drag + (localAngular / localEnergy) * (alpha / varpiValue),
  };
}

/** The two fragments of a Penrose split, as orbits that can be integrated. PHYSICS_SPEC §3.6. */
export function penroseFragments(
  split: PenroseSplit, spin: number,
): { plunging: EquatorialOrbit; escaping: EquatorialOrbit } {
  const { radius } = split;
  const s = Math.sqrt(sigmaSquared(radius, spin));
  const varpiValue = s / radius;
  const d = delta(radius, spin);
  const alpha = (radius * Math.sqrt(d)) / s;
  const drag = (TWO * spin) / s;
  // Photon 2 leaves along +φ̂ and photon 1 along −φ̂, both with p^(r) = 0. Their local energies
  // follow from the split; L = ϖ p^(φ) with p^(φ) = ±p^(t).
  const escapingLocal = split.escapingEnergy / (alpha + drag);
  const plungingLocal = alpha - drag === 0 ? 0 : split.plungingEnergy / (alpha - drag);
  return {
    escaping: {
      energy: split.escapingEnergy,
      angularMomentum: varpiValue * escapingLocal,
      mass: 0,
      radialSign: 1,
    },
    plunging: {
      energy: split.plungingEnergy,
      angularMomentum: -varpiValue * plungingLocal,
      mass: 0,
      radialSign: -1,
    },
  };
}

/** The parent's orbit: unit rest mass, E = 1, and the L its turning point at `radius` fixes. */
export const penroseParent = (split: PenroseSplit): EquatorialOrbit => ({
  energy: 1,
  angularMomentum: split.parentAngularMomentum,
  mass: 1,
  radialSign: -1,
});

// --- shared numerics --------------------------------------------------------------------------

/** Bisection for a sign change on [lo, hi]. Used to find a cubic's root, never to define one. */
export function bisect(
  f: (x: number) => number, lo: number, hi: number, steps = BISECTION_STEPS,
): number {
  let low = lo;
  let high = hi;
  if (f(low) * f(high) > 0) throw new RangeError('No sign change on this bracket.');
  for (let step = 0; step < steps; step++) {
    const mid = (low + high) * HALF;
    if (f(low) * f(mid) <= 0) high = mid;
    else low = mid;
  }
  return (low + high) * HALF;
}

/** Golden-section maximisation of a unimodal f on [lo, hi]. */
export function maximise(f: (x: number) => number, lo: number, hi: number): number {
  let low = lo;
  let high = hi;
  for (let step = 0; step < GOLDEN_STEPS; step++) {
    const a = low + (high - low) * GOLDEN_LO;
    const b = low + (high - low) * GOLDEN_HI;
    if (f(a) < f(b)) low = a;
    else high = b;
  }
  return (low + high) * HALF;
}

/**
 * Surface gravities of the two horizons: κ± = (r± − r∓) / (4 M r±). PHYSICS_SPEC §7.4b.
 *
 * Uses r±² + a² = 2Mr±, which is the horizon condition itself, so the usual
 * (r± − r∓)/(2(r±² + a²)) needs no separate evaluation. M = 1 here, as everywhere in this module.
 *
 * κ₋ is **negative**, and its magnitude is much the larger: at a/M = ½ the inner horizon's is
 * 13.93 times the outer's. That ratio is not a curiosity — it is the mass-inflation instability.
 */
export function surfaceGravity(spin: number): { outer: number; inner: number } {
  const { outer, inner } = horizonRadii(spin);
  if (!(outer > inner)) {
    throw new RangeError('The horizons have merged; κ vanishes at extremality.');
  }
  return {
    outer: (outer - inner) / (FOUR * outer),
    inner: (inner - outer) / (FOUR * inner),
  };
}

/**
 * How much more sharply the inner horizon blueshifts than the outer one redshifts: |κ₋|/κ₊.
 *
 * An ingoing perturbation arrives at the Cauchy horizon blueshifted as e^{|κ₋|v} while the
 * outgoing tail decays only as a power of v, so the flux measured there diverges — mass
 * inflation, Poisson & Israel 1990. This number is why the region beyond it is not expected to
 * describe anything physical.
 */
export function massInflationRatio(spin: number): number {
  const gravity = surfaceGravity(spin);
  return Math.abs(gravity.inner) / gravity.outer;
}

/**
 * dr* / dr = (r² + a²)/Δ for the equatorial slice. Diverges at both horizons, which is what
 * pushes them to infinite tortoise distance and gives the diagram its block structure.
 */
export function tortoiseDerivative(radius: number, spin: number): number {
  const gap = delta(radius, spin);
  if (gap === 0) throw new RangeError('dr*/dr diverges on a horizon.');
  return (radius * radius + spin * spin) / gap;
}

/**
 * The Kerr radial tortoise coordinate, equatorial:
 *
 *     r* = r + ln|r − r₊|/(2κ₊) + ln|r − r₋|/(2κ₋)
 *
 * The two coefficients are exactly the reciprocal surface gravities — partial fractions of
 * (r² + a²)/Δ give 2Mr±/(r₊ − r₋), and that is 1/(2κ±). Asserted rather than asserted-in-prose.
 *
 * The logarithms are written against 2M so the argument is dimensionless; that choice shifts r*
 * by a constant and nothing in a causal diagram depends on it.
 */
export function radialTortoise(radius: number, spin: number): number {
  const { outer, inner } = horizonRadii(spin);
  const gravity = surfaceGravity(spin);
  if (radius === outer || radius === inner) {
    throw new RangeError('r* is infinite on a horizon.');
  }
  return radius
    + Math.log(Math.abs((radius - outer) / TWO)) / (TWO * gravity.outer)
    + Math.log(Math.abs((radius - inner) / TWO)) / (TWO * gravity.inner);
}
