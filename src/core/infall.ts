/** Radial infall from rest at infinity, expressed in four coordinate charts.
 *
 * PHYSICS_SPEC §7.4 Claim B and §5. The point of the module this serves is that one geometry
 * looks completely different in Schwarzschild, Gullstrand-Painleve, Eddington-Finkelstein and
 * Kruskal-Szekeres coordinates, while every invariant is the same — so the arithmetic here has to
 * make the invariants recoverable through each chart's *own* route, never by handing r around.
 *
 * Geometrized units throughout: r_s = 1, c = 1, hence M = 1/2. Radii are in r_s, times in r_s/c.
 * Framework-free, float64.
 */

const TWO = 2;
const THREE = 3;
const HALF = 0.5;

/** r_s = 1 by construction here; named so the formulae read as they do in the spec. */
export const HORIZON = 1;
/** M = r_s/2 in geometrized units. */
export const MASS = HALF;
/** §7.4's stated starting radius, and the one its 14.4183 assertion is measured from. */
export const DEFAULT_START_RADIUS = 8;

function outsideOrigin(radius: number): void {
  if (!Number.isFinite(radius) || radius <= HORIZON) {
    throw new RangeError('The infall must start strictly outside the horizon.');
  }
}

function onTrajectory(radius: number, startRadius: number): void {
  if (!Number.isFinite(radius) || radius <= 0 || radius > startRadius) {
    throw new RangeError('Radius must lie on the infall, in (0, r0].');
  }
}

/** sqrt(r/r_s), the variable every closed form here is written in. */
const root = (radius: number): number => Math.sqrt(radius / HORIZON);

/**
 * Proper time elapsed falling from `startRadius` to `radius`.
 *
 *     tau = (2/3) (r0^{3/2} - r^{3/2}) / sqrt(r_s)
 *
 * Finite at the horizon and beyond — 14.4183 r_s/c from 8 r_s, §7.4.
 */
export function properTime(radius: number, startRadius = DEFAULT_START_RADIUS): number {
  outsideOrigin(startRadius);
  onTrajectory(radius, startRadius);
  return (TWO / THREE) * (root(startRadius) ** THREE - root(radius) ** THREE) * Math.sqrt(HORIZON);
}

/** The inverse: where the faller is after `tau` of its own time. */
export function radiusAtProperTime(tau: number, startRadius = DEFAULT_START_RADIUS): number {
  outsideOrigin(startRadius);
  const cubed = root(startRadius) ** THREE - (THREE * tau) / (TWO * Math.sqrt(HORIZON));
  if (!(cubed >= 0)) throw new RangeError('Proper time runs past the singularity.');
  return HORIZON * cubed ** (TWO / THREE);
}

/** Proper time from `startRadius` to the horizon. 14.4183 r_s/c from 8 r_s. */
export function properTimeToHorizon(startRadius = DEFAULT_START_RADIUS): number {
  return properTime(HORIZON, startRadius);
}

/** F(w) = (2/3)w^3 + 2w + ln|(w-1)/(w+1)|, the antiderivative behind t(r). */
function schwarzschildAntiderivative(w: number): number {
  return (TWO / THREE) * w ** THREE + TWO * w + Math.log(Math.abs((w - 1) / (w + 1)));
}

/**
 * Schwarzschild coordinate time, with the origin at `startRadius`.
 *
 *     t(r) = -r_s [ F(w) - F(w0) ]
 *
 * Diverges logarithmically at the horizon: the faller never arrives, in this chart. That
 * divergence against a finite proper time is the whole contrast §7.4 asks the module to show.
 */
export function schwarzschildTime(radius: number, startRadius = DEFAULT_START_RADIUS): number {
  outsideOrigin(startRadius);
  onTrajectory(radius, startRadius);
  if (radius < HORIZON) {
    // Not merely infinite: inside the horizon `t` is a spatial coordinate and this chart has
    // nothing to say. Returning a number here would invite it into the invariant comparison.
    throw new RangeError('Schwarzschild time is not defined inside the horizon.');
  }
  // At r = r_s the logarithm supplies the divergence on its own; no special case is needed, and
  // one would be untestable because it agrees with the formula it replaces.
  return -HORIZON * (
    schwarzschildAntiderivative(root(radius)) - schwarzschildAntiderivative(root(startRadius))
  );
}

/** Tortoise coordinate r* = r + r_s ln|r/r_s - 1|. Carries the logarithm that cancels in v. */
export function tortoise(radius: number): number {
  if (!(radius > 0)) throw new RangeError('Radius must be positive.');
  return radius + HORIZON * Math.log(Math.abs(radius / HORIZON - 1));
}

/**
 * Gullstrand-Painleve time along this trajectory, which is exactly the faller's proper time.
 *
 * The GP transformation's `2w` and logarithm cancel the same terms in t(r) identically; what
 * survives is (2/3)r_s(w0^3 - w^3), which is tau. Given the origin t_ff(r0) = 0 this is an
 * equality, not an approximation — §5.2, §7.4.
 */
export function gullstrandPainleveTime(
  radius: number,
  startRadius = DEFAULT_START_RADIUS,
): number {
  return properTime(radius, startRadius);
}

/** Eddington-Finkelstein advanced time v = t + r*. Finite at the horizon: the logarithms cancel. */
export function eddingtonFinkelsteinV(
  radius: number,
  startRadius = DEFAULT_START_RADIUS,
): number {
  outsideOrigin(startRadius);
  onTrajectory(radius, startRadius);
  // Written so the divergent logarithms are cancelled algebraically rather than numerically:
  // t carries -r_s ln|w-1| + r_s ln(w+1) and r* carries +r_s ln|w-1| + r_s ln(w+1).
  const w = root(radius);
  const w0 = root(startRadius);
  const finitePart = -(TWO / THREE) * w ** THREE - TWO * w + w ** TWO
    + TWO * Math.log(w + 1);
  const origin = -(TWO / THREE) * w0 ** THREE - TWO * w0 + w0 ** TWO + TWO * Math.log(w0 + 1);
  return HORIZON * (finitePart - origin) + eddingtonOriginOffset(startRadius);
}

/** v(r0) = t(r0) + r*(r0) = r*(r0), since the t origin is at r0. */
function eddingtonOriginOffset(startRadius: number): number {
  return tortoise(startRadius);
}

/** Retarded time u = t - r*. Diverges at the horizon; only ever used through exp(-u/2). */
export function eddingtonFinkelsteinU(
  radius: number,
  startRadius = DEFAULT_START_RADIUS,
): number {
  return schwarzschildTime(radius, startRadius) - tortoise(radius);
}

export interface KruskalPoint {
  /** V = X + T = exp(v/2r_s). Regular and positive across the horizon. */
  V: number;
  /** U = X - T = exp(-u/2r_s). Positive outside, zero on the horizon. */
  U: number;
  T: number;
  X: number;
}

/**
 * Kruskal-Szekeres, carried in its null coordinates.
 *
 * (T, X) are provided for drawing only. Every calculation goes through U and V, because
 * X and T agree to one part in 1e8 near the horizon and X^2 - T^2 then keeps almost none of its
 * significant figures — 9e-6 relative error at r = 1.001 r_s against a 1e-10 tolerance, measured.
 * The product UV is accurate to 2e-15 everywhere. PHYSICS_SPEC §7.4.
 */
export function kruskal(radius: number, startRadius = DEFAULT_START_RADIUS): KruskalPoint {
  const V = Math.exp(eddingtonFinkelsteinV(radius, startRadius) / (TWO * HORIZON));
  const U = Math.exp(-eddingtonFinkelsteinU(radius, startRadius) / (TWO * HORIZON));
  return { V, U, T: (V - U) / TWO, X: (V + U) / TWO };
}

/** Principal branch of the Lambert W function, for z >= -1/e. Newton-Halley to machine epsilon. */
export function lambertW0(z: number): number {
  const LIMIT = -1 / Math.E;
  if (!Number.isFinite(z) || z < LIMIT) {
    throw new RangeError('Lambert W0 is real only for z >= -1/e.');
  }
  if (z === 0) return 0;
  const SERIES_CUTOFF = 3;
  const MAX_ITERATIONS = 60;
  const TOLERANCE = 1e-16;
  let w = z < SERIES_CUTOFF ? Math.log1p(z) : Math.log(z) - Math.log(Math.log(z));
  for (let step = 0; step < MAX_ITERATIONS; step++) {
    const exponential = Math.exp(w);
    const residual = w * exponential - z;
    const denominator = exponential * (w + 1) - ((w + TWO) * residual) / (TWO * w + TWO);
    if (denominator === 0) break;
    const delta = residual / denominator;
    w -= delta;
    if (Math.abs(delta) <= TOLERANCE * Math.max(1, Math.abs(w))) break;
  }
  return w;
}

/**
 * Areal radius recovered from Kruskal's own coordinates: r = r_s [1 + W0(UV/e)].
 *
 * This is the route that makes the module's central assertion non-vacuous. r is a coordinate in
 * the other three charts, so only here is the recovery genuinely independent arithmetic.
 */
export function radiusFromKruskal(point: Pick<KruskalPoint, 'U' | 'V'>): number {
  const product = point.U * point.V;
  if (!(product >= 0)) throw new RangeError('UV must be non-negative outside the horizon.');
  return HORIZON * (1 + lambertW0(product / Math.E));
}

/**
 * Bisection for the radius at which a coordinate takes a given value.
 *
 * Both `t(r)` and `v(r)` are strictly DECREASING in r along this infall — the faller starts at
 * r0 with the smallest coordinate time and accumulates more as it descends. That is asserted in
 * the tests rather than detected here: auto-detecting a direction that is always the same is
 * generality nothing exercises, and a mutation to it cannot be caught.
 */
function invertOverInfall(
  evaluate: (radius: number) => number,
  target: number,
  startRadius: number,
): number {
  const ITERATIONS = 200;
  let low = HORIZON;
  let high = startRadius;
  for (let step = 0; step < ITERATIONS; step++) {
    const middle = (low + high) / TWO;
    if (evaluate(middle) > target) low = middle;
    else high = middle;
  }
  return (low + high) / TWO;
}

/** Areal radius recovered from Schwarzschild t alone, by inverting t(r). */
export function radiusFromSchwarzschildTime(
  time: number,
  startRadius = DEFAULT_START_RADIUS,
): number {
  return invertOverInfall(radius => schwarzschildTime(radius, startRadius), time, startRadius);
}

/** Areal radius recovered from Eddington-Finkelstein v alone, by inverting v(r). */
export function radiusFromEddingtonV(
  advancedTime: number,
  startRadius = DEFAULT_START_RADIUS,
): number {
  return invertOverInfall(
    radius => eddingtonFinkelsteinV(radius, startRadius), advancedTime, startRadius,
  );
}

/** Kretschmann scalar K = 48 M^2 / r^6. Finite at the horizon, divergent only at r = 0. */
export function kretschmann(radius: number): number {
  if (!(radius > 0)) throw new RangeError('Radius must be positive.');
  const FORTY_EIGHT = 48;
  const SIX = 6;
  return (FORTY_EIGHT * MASS ** TWO) / radius ** SIX;
}

/** Radial tidal component -2M/r^3. -1.0 c^2/r_s^2 at the horizon; no coordinate can remove it. */
export function radialTidal(radius: number): number {
  if (!(radius > 0)) throw new RangeError('Radius must be positive.');
  return (-TWO * MASS) / radius ** THREE;
}
