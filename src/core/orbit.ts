/** Schwarzschild orbits: the effective potential, its critical points, and the Cartesian force.
 *
 * PHYSICS_SPEC §2.5. Geometric units (G = c = 1) throughout, so M and L carry units of length and
 * V_eff is dimensionless. The geometry is scale-free — only r/M and L/M enter — which is why the
 * explorers can show one picture and change only the labels beside it.
 *
 * Framework-free, float64.
 */

const TWO = 2;
const THREE = 3;
const SIX = 6;
const HALF = 0.5;
/** E_ISCO^2 = 8/9 exactly, so the specific energy is sqrt of this ratio. */
const ISCO_ENERGY_NUMERATOR = 8;
const ISCO_ENERGY_DENOMINATOR = 9;
/** Bisection depth for a turning point: 80 halvings takes a 1000M window below float64 spacing. */
const BISECTION_STEPS = 80;
/** Discriminant of r^2 - (L^2/M)r + 3L^2 = 0 is (L^2/M)^2 - 12 L^2; the 12 is 4 x the 3L^2 term. */
const DISCRIMINANT_COEFFICIENT = 12;

/** Marginally bound: |E| below this reads as parabolic rather than as bound or unbound. */
export const MARGINAL_ENERGY = 1e-4;

/**
 * V_eff(r) = -M/r + L^2/(2r^2) - M L^2 / r^3.
 *
 * The last term is the whole of general relativity here: it produces both the perihelion
 * precession and the ISCO, and without it the other two terms are exactly Newtonian.
 */
export function effectivePotential(radius: number, mass: number, angularMomentum: number): number {
  if (!(radius > 0)) throw new RangeError('Radius must be positive.');
  if (!(mass > 0)) throw new RangeError('Mass must be positive.');
  const l2 = angularMomentum * angularMomentum;
  return -mass / radius + l2 / (TWO * radius * radius) - (mass * l2) / radius ** THREE;
}

/** dV_eff/dr = M/r^2 - L^2/r^3 + 3ML^2/r^4. Its roots are the circular orbits. */
export function effectivePotentialSlope(
  radius: number, mass: number, angularMomentum: number,
): number {
  if (!(radius > 0)) throw new RangeError('Radius must be positive.');
  const l2 = angularMomentum * angularMomentum;
  return mass / radius ** TWO - l2 / radius ** THREE + (THREE * mass * l2) / radius ** 4;
}

export interface CircularOrbits {
  /** The unstable maximum. Tends to 3M as L grows, and never reaches it. */
  inner: number;
  /** The stable minimum — a real orbit. */
  outer: number;
}

/**
 * Circular orbits: the roots of r^2 - (L^2/M) r + 3L^2 = 0.
 *
 * Returns null below L = 2sqrt(3) M, where the discriminant is negative and there are **no
 * circular orbits at all** — not merely no stable ones. That is the fact the ISCO is usually
 * stated without.
 */
export function circularOrbits(mass: number, angularMomentum: number): CircularOrbits | null {
  if (!(mass > 0)) throw new RangeError('Mass must be positive.');
  const l2 = angularMomentum * angularMomentum;
  const b = l2 / mass;
  const discriminant = b * b - DISCRIMINANT_COEFFICIENT * l2;
  // Exactly at L_ISCO the discriminant is zero up to rounding; clamp so the double root is found
  // rather than lost to a negative epsilon.
  if (discriminant < -Number.EPSILON * b * b) return null;
  const root = Math.sqrt(Math.max(discriminant, 0));
  return { inner: (b - root) / TWO, outer: (b + root) / TWO };
}

/** r_ISCO = 6M. */
export const iscoRadius = (mass: number): number => SIX * mass;
/** L_ISCO = 2 sqrt(3) M — the angular momentum at which the two circular orbits merge. */
export const iscoAngularMomentum = (mass: number): number => TWO * Math.sqrt(THREE) * mass;
/** Specific energy of the ISCO orbit, sqrt(8/9). Dimensionless, independent of M. */
export const ISCO_SPECIFIC_ENERGY = Math.sqrt(ISCO_ENERGY_NUMERATOR / ISCO_ENERGY_DENOMINATOR);
/**
 * Binding energy at the ISCO, 1 - sqrt(8/9) = 5.7191%.
 *
 * This is where the Novikov-Thorne radiative efficiency comes from (§4.3): it is a property of
 * the geometry, not an assumption of the accretion model.
 */
export const ISCO_BINDING_EFFICIENCY = 1 - ISCO_SPECIFIC_ENERGY;

/**
 * The null effective potential, V = L^2 (1/r^2 - 2M/r^3).
 *
 * Kept separate from the massive-particle one because conflating them is a common error: the
 * photon sphere is at exactly 3M for **every** L, whereas the massive-particle potential's
 * unstable maximum only tends to 3M as L grows without bound.
 */
export function photonPotential(radius: number, mass: number, angularMomentum: number): number {
  if (!(radius > 0)) throw new RangeError('Radius must be positive.');
  const l2 = angularMomentum * angularMomentum;
  return l2 * (1 / (radius * radius) - (TWO * mass) / radius ** THREE);
}

export function photonPotentialSlope(
  radius: number, mass: number, angularMomentum: number,
): number {
  if (!(radius > 0)) throw new RangeError('Radius must be positive.');
  const l2 = angularMomentum * angularMomentum;
  return l2 * (-TWO / radius ** THREE + (SIX * mass) / radius ** 4);
}

export const photonSphereRadius = (mass: number): number => THREE * mass;

/**
 * Cartesian acceleration for the orbit integrator.
 *
 *     a = -(M/r^3 + 3 M L^2 / r^5) * r_vec
 *
 * Derived from r_ddot = -V_eff'(r) with the centrifugal term restored to the kinematics: in polar
 * coordinates r_ddot = L^2/r^3 + a_r, so a_r = -M/r^2 - 3ML^2/r^4. This is -grad(Phi) with
 * Phi = -M/r - M L^2 / r^3, so the Hamiltonian is separable and Yoshida-4 applies directly
 * (§2.5). L is a constant of the motion and is passed in; the resulting force is central, so the
 * Cartesian dynamics conserves it and the choice is self-consistent.
 *
 * Set `relativistic` false for the Newtonian comparison: dropping the 3ML^2/r^5 term leaves the
 * inverse-square law exactly, and the orbit closes.
 */
export function orbitAcceleration(
  x: number, y: number, mass: number, angularMomentum: number, relativistic = true,
): [number, number] {
  const r2 = x * x + y * y;
  if (!(r2 > 0)) throw new RangeError('The particle is at the centre.');
  const r = Math.sqrt(r2);
  const newtonian = mass / (r2 * r);
  const correction = relativistic
    ? (THREE * mass * angularMomentum * angularMomentum) / (r2 * r2 * r)
    : 0;
  const k = newtonian + correction;
  return [-k * x, -k * y];
}

/** Specific angular momentum of a planar state, L = x*vy - y*vx. Conserved by a central force. */
export const specificAngularMomentum = (
  x: number, y: number, vx: number, vy: number,
): number => x * vy - y * vx;

export type OrbitClass = 'bound' | 'unbound' | 'marginal';

/** Bound (E < 0), unbound (E > 0), or marginally bound within MARGINAL_ENERGY of zero. */
export function classifyOrbit(energy: number): OrbitClass {
  if (Math.abs(energy) < MARGINAL_ENERGY) return 'marginal';
  return energy < 0 ? 'bound' : 'unbound';
}

/** Specific energy of a planar state: E = |v|^2/2 + V_eff evaluated with the state's own L. */
export function orbitEnergy(
  x: number, y: number, vx: number, vy: number, mass: number,
): number {
  const l = specificAngularMomentum(x, y, vx, vy);
  const r = Math.hypot(x, y);
  // The kinetic term here is radial only: the tangential part is already inside V_eff via L.
  const radialSpeed = (x * vx + y * vy) / r;
  return HALF * radialSpeed * radialSpeed + effectivePotential(r, mass, l);
}

/**
 * Turning points: radii where V_eff(r) = E, i.e. where the radial motion reverses.
 *
 * Found by bisection on each bracketing interval rather than by solving the cubic, because the
 * cubic's roots are ill-conditioned near the ISCO where two of them merge.
 */
export function turningPoints(
  energy: number, mass: number, angularMomentum: number,
  { from = 2.0001, to = 1000, samples = 4000 }: { from?: number; to?: number; samples?: number } = {},
): number[] {
  if (!(to > from) || samples < 2) throw new RangeError('Invalid search window.');
  const f = (r: number) => effectivePotential(r, mass, angularMomentum) - energy;
  const roots: number[] = [];
  let previousR = from * mass;
  let previousF = f(previousR);
  for (let i = 1; i <= samples; i++) {
    const r = from * mass + ((to - from) * mass * i) / samples;
    const value = f(r);
    if (previousF === 0) roots.push(previousR);
    else if (previousF * value < 0) {
      let lo = previousR;
      let hi = r;
      for (let step = 0; step < BISECTION_STEPS; step++) {
        const mid = (lo + hi) / TWO;
        if (f(lo) * f(mid) <= 0) hi = mid;
        else lo = mid;
      }
      roots.push((lo + hi) / TWO);
    }
    previousR = r;
    previousF = value;
  }
  return roots;
}
