/** Photon geodesics in Cartesian Kerr–Schild coordinates. PHYSICS_SPEC §3.4 and §3.4a.
 *
 * This is the float64 model. The shader mirrors it in float32 and the two are compared per pixel,
 * the same arrangement the Schwarzschild raymarcher uses.
 *
 * Geometric units with M = 1, so `spin` is a/M and all lengths are in M.
 *
 * Everything here is analytic. The Hamiltonian's spatial gradient needs ∂ᵢH and ∂ᵢk_j, which need
 * ∂ᵢr for the *implicitly* defined Kerr–Schild radius; those derivatives are derived in the
 * comments below and checked against central differences in the tests. A finite-difference
 * gradient is not an option here — the shader is float32 and a central difference there loses
 * half the mantissa before the ray has gone anywhere.
 */

const TWO = 2;
const THREE = 3;
const FOUR = 4;
const HALF = 0.5;
const SIX = 6;
/** RK4 weights. */
const RK4_SIXTH = 1 / 6;
const RK4_THIRD = 1 / 3;

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** A photon's state: position (t is not carried, nothing here depends on it) and momentum. */
export interface RayState {
  position: Vec3;
  /** Covariant spatial momentum p_i. */
  momentum: Vec3;
  /** p_t = −E, conserved exactly because the metric is static. */
  energy: number;
}

/**
 * The Kerr–Schild radius: the positive root of
 *
 *     r⁴ − (x²+y²+z²−a²) r² − a²z² = 0
 *
 * i.e. r² = ½[(R²−a²) + √((R²−a²)² + 4a²z²)] with R² = x²+y²+z².
 *
 * The discriminant is a sum of squares, so the root is real everywhere and the branch is never in
 * doubt. Written with the stable quadratic form: when R² ≫ a² the subtraction under the root is
 * between numbers of very different size and the naive form loses the z-dependence entirely,
 * which flattens the oblate spheroid into a sphere and quietly turns Kerr into Schwarzschild.
 */
export function kerrSchildRadius(position: Vec3, spin: number): number {
  const { x, y, z } = position;
  const rSquaredMinusA = x * x + y * y + z * z - spin * spin;
  const discriminant = Math.sqrt(rSquaredMinusA * rSquaredMinusA + FOUR * spin * spin * z * z);
  // For rSquaredMinusA < 0 the stable branch is the other one; 2c/(−b+√disc) is the same root.
  const rSquared = rSquaredMinusA >= 0
    ? HALF * (rSquaredMinusA + discriminant)
    : (TWO * spin * spin * z * z) / (discriminant - rSquaredMinusA);
  return Math.sqrt(Math.max(rSquared, 0));
}

/** Everything the metric needs at a point, computed once: r, H, k_i, and their gradients. */
export interface MetricSample {
  radius: number;
  /** H = M r³ / (r⁴ + a²z²). */
  h: number;
  /** Spatial part of the null vector; k_t = 1 and k^t = −1 always. */
  k: Vec3;
  /** ∂ᵢ H. */
  gradH: Vec3;
  /** ∂ᵢ k_j, as [∂ₓk, ∂_y k, ∂_z k]. */
  gradK: [Vec3, Vec3, Vec3];
}

/**
 * The metric functions and their exact spatial gradients.
 *
 * Written in terms of **q ≡ a²z²/r⁴**, which is between 0 (equatorial or non-spinning) and
 * a²/r² ≤ 1. In that variable D = r⁴(1+q) and everything collapses:
 *
 *     H    = 1/(r(1+q))                                      [= M/r at a = 0]
 *     ∂ₓr  = x/(r(1+q)),  ∂_y r = y/(r(1+q)),  ∂_z r = z(r²+a²)/(r³(1+q))
 *     ∂ₓH  = x(3q−1)/(r³(1+q)³),   ∂_y H = y(3q−1)/(r³(1+q)³)
 *     ∂_z H = z[(3q−1)(r²+a²)/(1+q) − 2a²] / (r⁵(1+q)²)
 *
 * The literal forms carry D² and D³ in their denominators. D³ is r¹² at a = 0, which at the
 * 1500 M escape radius is 10³⁸ — **float32 overflows there**, and the shader is float32. In the
 * (1+q) form nothing larger than r⁵ appears and the shader is a literal transcription of this
 * function rather than a re-derivation of it.
 */
export function sampleMetric(position: Vec3, spin: number): MetricSample {
  const { x, y, z } = position;
  const a = spin;
  const radius = kerrSchildRadius(position, spin);
  const r2 = radius * radius;
  const r3 = r2 * radius;
  const s = r2 + a * a;
  // q = a²z²/r⁴, the oblateness. Zero on the equator and for a non-spinning hole.
  const q = (a * a * z * z) / (r2 * r2);
  const onePlusQ = 1 + q;

  const drdx = x / (radius * onePlusQ);
  const drdy = y / (radius * onePlusQ);
  const drdz = (z * s) / (r3 * onePlusQ);

  const h = 1 / (radius * onePlusQ);
  const threeQMinusOne = THREE * q - 1;
  const gradH: Vec3 = {
    x: (x * threeQMinusOne) / (r3 * onePlusQ ** THREE),
    y: (y * threeQMinusOne) / (r3 * onePlusQ ** THREE),
    z: (z * ((threeQMinusOne * s) / onePlusQ - TWO * a * a))
      / (r2 * r3 * onePlusQ * onePlusQ),
  };

  const kx = (radius * x + a * y) / s;
  const ky = (radius * y - a * x) / s;
  const kz = z / radius;

  // ∂ᵢk_x = [(x ∂ᵢr + r δᵢ_x + a δᵢ_y) S − (rx+ay)(2r ∂ᵢr)] / S²
  const dk = (dr: number, deltaX: number, deltaY: number, deltaZ: number): Vec3 => ({
    x: ((x * dr + radius * deltaX + a * deltaY) * s - (radius * x + a * y) * (TWO * radius * dr))
      / (s * s),
    y: ((y * dr + radius * deltaY - a * deltaX) * s - (radius * y - a * x) * (TWO * radius * dr))
      / (s * s),
    z: (deltaZ * radius - z * dr) / r2,
  });

  return {
    radius,
    h,
    k: { x: kx, y: ky, z: kz },
    gradH,
    gradK: [dk(drdx, 1, 0, 0), dk(drdy, 0, 1, 0), dk(drdz, 0, 0, 1)],
  };
}

/**
 * The Hamiltonian ℋ = ½ g^{μν}p_μp_ν, which for a photon is zero and stays zero.
 *
 * Because g^{μν} = η^{μν} − 2H k^μk^ν exactly (§3.4a), this needs no matrix at all:
 *
 *     ℋ = ½(−p_t² + p·p) − H κ²,    κ ≡ k^αp_α = −p_t + k·p
 *
 * Deviation from zero along an integration is the error telemetry §3.4 asks for.
 */
export function hamiltonian(state: RayState, spin: number): number {
  const sample = sampleMetric(state.position, spin);
  return hamiltonianFrom(state, sample);
}

function kappaOf(state: RayState, sample: MetricSample): number {
  return -state.energy
    + sample.k.x * state.momentum.x + sample.k.y * state.momentum.y + sample.k.z * state.momentum.z;
}

function hamiltonianFrom(state: RayState, sample: MetricSample): number {
  const { x, y, z } = state.momentum;
  const flat = -state.energy * state.energy + x * x + y * y + z * z;
  const kappa = kappaOf(state, sample);
  return HALF * flat - sample.h * kappa * kappa;
}

/** dx^i/dλ and dp_i/dλ. `energy` (= p_t) is constant and is not integrated. */
export interface RayRates {
  position: Vec3;
  momentum: Vec3;
}

/**
 * Hamilton's equations.
 *
 *     ẋ^i = p_i − 2Hκ k^i
 *     ṗ_i = (∂ᵢH) κ² + 2Hκ (∂ᵢk_j) p_j
 *
 * ṗ_t = 0 identically — the metric is static — so E is conserved to machine precision by
 * construction rather than by the integrator, and only ℋ and the Carter constant measure error.
 */
export function rayRates(state: RayState, spin: number): RayRates {
  const sample = sampleMetric(state.position, spin);
  return ratesFrom(state, sample);
}

function ratesFrom(state: RayState, sample: MetricSample): RayRates {
  const p = state.momentum;
  const kappa = kappaOf(state, sample);
  const factor = TWO * sample.h * kappa;
  const position: Vec3 = {
    x: p.x - factor * sample.k.x,
    y: p.y - factor * sample.k.y,
    z: p.z - factor * sample.k.z,
  };
  const [dx, dy, dz] = sample.gradK;
  const dot = (g: Vec3): number => g.x * p.x + g.y * p.y + g.z * p.z;
  const kappaSq = kappa * kappa;
  const momentum: Vec3 = {
    x: sample.gradH.x * kappaSq + factor * dot(dx),
    y: sample.gradH.y * kappaSq + factor * dot(dy),
    z: sample.gradH.z * kappaSq + factor * dot(dz),
  };
  return { position, momentum };
}

const addScaled = (base: Vec3, rate: Vec3, step: number): Vec3 => ({
  x: base.x + rate.x * step, y: base.y + rate.y * step, z: base.z + rate.z * step,
});

/** One classical RK4 step of size `step` in the affine parameter. */
export function rk4Step(state: RayState, spin: number, step: number): RayState {
  const k1 = rayRates(state, spin);
  const s2: RayState = {
    energy: state.energy,
    position: addScaled(state.position, k1.position, step * HALF),
    momentum: addScaled(state.momentum, k1.momentum, step * HALF),
  };
  const k2 = rayRates(s2, spin);
  const s3: RayState = {
    energy: state.energy,
    position: addScaled(state.position, k2.position, step * HALF),
    momentum: addScaled(state.momentum, k2.momentum, step * HALF),
  };
  const k3 = rayRates(s3, spin);
  const s4: RayState = {
    energy: state.energy,
    position: addScaled(state.position, k3.position, step),
    momentum: addScaled(state.momentum, k3.momentum, step),
  };
  const k4 = rayRates(s4, spin);
  const blend = (a: Vec3, b: Vec3, c: Vec3, d: Vec3, base: Vec3): Vec3 => ({
    x: base.x + step * (RK4_SIXTH * (a.x + d.x) + RK4_THIRD * (b.x + c.x)),
    y: base.y + step * (RK4_SIXTH * (a.y + d.y) + RK4_THIRD * (b.y + c.y)),
    z: base.z + step * (RK4_SIXTH * (a.z + d.z) + RK4_THIRD * (b.z + c.z)),
  });
  return {
    energy: state.energy,
    position: blend(k1.position, k2.position, k3.position, k4.position, state.position),
    momentum: blend(k1.momentum, k2.momentum, k3.momentum, k4.momentum, state.momentum),
  };
}

/** Axial angular momentum L_z = p_φ = x p_y − y p_x. Conserved: φ is cyclic. */
export const axialAngularMomentum = (state: RayState): number =>
  state.position.x * state.momentum.y - state.position.y * state.momentum.x;

/**
 * Adaptive step, PHYSICS_SPEC §4.2's rule carried over: proportional to the distance to the
 * horizon so the step shrinks where the geometry varies fastest, capped so a ray far away does
 * not take a step longer than the scene.
 */
export function adaptiveStep(
  radius: number, spin: number, fraction: number, maximum: number,
): number {
  const outer = 1 + Math.sqrt(Math.max(1 - spin * spin, 0));
  return Math.min(maximum, Math.max(fraction * Math.abs(radius - outer), fraction * outer / SIX));
}

export interface TraceResult {
  /** 'captured' crossed the horizon, 'escaped' left the outer boundary, 'exhausted' ran out. */
  outcome: 'captured' | 'escaped' | 'exhausted';
  state: RayState;
  steps: number;
  /** Largest |ℋ| seen, in units of E². The integration's own error, not a tolerance. */
  hamiltonianDrift: number;
}

export interface TraceOptions {
  spin: number;
  /** Stop when r falls below r₊ times this. Kerr–Schild is regular there; this is not a cliff. */
  captureFactor?: number;
  escapeRadius: number;
  maxSteps: number;
  stepFraction?: number;
  maxStep?: number;
}

const DEFAULT_CAPTURE_FACTOR = 0.98;
const DEFAULT_STEP_FRACTION = 0.08;
const DEFAULT_MAX_STEP = 0.5;

/** Integrate one photon until it is captured, escapes, or runs out of steps. */
export function traceRay(initial: RayState, options: TraceOptions): TraceResult {
  const {
    spin, escapeRadius, maxSteps,
    captureFactor = DEFAULT_CAPTURE_FACTOR,
    stepFraction = DEFAULT_STEP_FRACTION,
    maxStep = DEFAULT_MAX_STEP,
  } = options;
  const outer = 1 + Math.sqrt(Math.max(1 - spin * spin, 0));
  const captureRadius = outer * captureFactor;
  const scale = initial.energy * initial.energy;
  let state = initial;
  let drift = 0;
  for (let step = 0; step < maxSteps; step++) {
    const radius = kerrSchildRadius(state.position, spin);
    if (radius <= captureRadius) return { outcome: 'captured', state, steps: step, hamiltonianDrift: drift };
    if (radius >= escapeRadius) return { outcome: 'escaped', state, steps: step, hamiltonianDrift: drift };
    state = rk4Step(state, spin, adaptiveStep(radius, spin, stepFraction, maxStep));
    drift = Math.max(drift, Math.abs(hamiltonian(state, spin)) / scale);
  }
  return { outcome: 'exhausted', state, steps: maxSteps, hamiltonianDrift: drift };
}

/**
 * Launch a backward-traced photon from `origin` along `direction` — the direction the camera is
 * looking, so the ray travels from the camera towards the hole, **future-directed**, with
 * `p_t = −1` and therefore E = −p_t = +1.
 *
 * ℋ = 0 is solved for the scale of the spatial momentum rather than assumed, so the ray is null
 * in the actual metric at the camera rather than in the flat approximation to it: with
 * p_i = s n_i and κ = −p_t + s(k·n) = 1 + s(k·n),
 *
 *     ℋ = ½(−1 + s²) − H(1 + s k·n)² = 0
 *       ⇒ (½ − H(k·n)²) s² − 2H(k·n) s − (½ + H) = 0
 *
 * **This ray is future-directed, and that means the picture it builds is mirrored.** A genuine
 * backward trace integrates the arriving photon's momentum *negated*, which is past-directed;
 * ingoing Kerr–Schild is regular on the future horizon and not on the past one, so a
 * past-directed ray is not integrable here — at a = 0 the null condition's regular branch turns
 * over and the central ray escapes instead of falling in. Firing a future-directed ray inward
 * instead is the standard raymarcher construction and is numerically clean, but it substitutes
 * t → −t alone, and **t → −t alone is not an isometry of Kerr** (the isometry is t → −t together
 * with φ → −φ). The traced scene is therefore the φ-reflection of the real one: the image of a
 * hole spinning the other way.
 *
 * The reflection is undone once, at the camera, by `cameraFrame` building a left-handed image
 * basis — see `sims/kerr-shadow/view/camera.ts`. Nothing physical is negated: the metric, the
 * spin and the ring's sense are all the real ones.
 *
 * **A shadow measurement cannot catch this on its own.** A reflection mislabels the α axis by
 * exactly the reflection it introduces, so the measured extent agrees with Bardeen either way.
 * Only a quantity that breaks the mirror tells them apart — which limb of the ring is blueshifted
 * — and the two must land on the same side, because the flat edge of the shadow and the
 * approaching limb are both the prograde side.
 */
export function launchPhoton(origin: Vec3, direction: Vec3, spin: number): RayState {
  const length = Math.hypot(direction.x, direction.y, direction.z);
  if (!(length > 0)) throw new RangeError('A photon needs a direction.');
  const n: Vec3 = { x: direction.x / length, y: direction.y / length, z: direction.z / length };
  const sample = sampleMetric(origin, spin);
  const kn = sample.k.x * n.x + sample.k.y * n.y + sample.k.z * n.z;
  const qa = HALF - sample.h * kn * kn;
  const qb = -TWO * sample.h * kn;
  const qc = -(HALF + sample.h);
  let s: number;
  if (Math.abs(qa) < Number.EPSILON) {
    s = -qc / qb;
  } else {
    const root = Math.sqrt(Math.max(qb * qb - FOUR * qa * qc, 0));
    const first = (-qb + root) / (TWO * qa);
    const second = (-qb - root) / (TWO * qa);
    s = first > 0 ? first : second;
  }
  return { position: origin, momentum: { x: s * n.x, y: s * n.y, z: s * n.z }, energy: -1 };
}

/**
 * ξ = L_z/E of a traced ray, and Bardeen's α = −ξ for an equatorial observer.
 *
 * E = −p_t, so the sign of p_t is carried here and nowhere else. ξ is unchanged by reversing the
 * momentum, so it is a property of the geodesic rather than of the direction it is traversed in.
 */
export const impactRatio = (state: RayState): number =>
  axialAngularMomentum(state) / -state.energy;

export const bardeenAlpha = (state: RayState): number => -impactRatio(state);
