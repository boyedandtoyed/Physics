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
  // L = 0 is a radial plunge, not an orbit. The quadratic degenerates to a double root at r = 0,
  // which is the singularity rather than a circular orbit, so it is rejected here instead of
  // being handed to a caller as a radius.
  if (!(l2 > 0)) return null;
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

/**
 * Angular momentum of the orbit whose turning points are exactly `periapsis` and `apoapsis`.
 *
 * Solves V_eff(r_p) = V_eff(r_a) for L. Seeding instead with the Newtonian vis-viva speed gives
 * an orbit with the wrong shape once the field is strong: at GM/(ac²) = 0.05 the eccentricity
 * collapses from the intended 0.2056 to 0.029, and every measurement taken from it is of a
 * different orbit than the one asked for.
 *
 * `relativistic` false solves the Newtonian potential instead, which reduces to the textbook
 * L² = M a (1 − e²). Both are provided so a Newtonian-versus-GR comparison can hold the orbit's
 * shape fixed and vary only the physics.
 */
export function angularMomentumForTurningPoints(
  periapsis: number, apoapsis: number, mass: number, relativistic = true,
): number {
  if (!(periapsis > 0) || !(apoapsis > periapsis)) {
    throw new RangeError('Apoapsis must exceed a positive periapsis.');
  }
  if (!(mass > 0)) throw new RangeError('Mass must be positive.');
  const numerator = mass * (1 / periapsis - 1 / apoapsis);
  const denominator = relativistic
    ? 1 / (TWO * periapsis * periapsis) - mass / periapsis ** THREE
      - 1 / (TWO * apoapsis * apoapsis) + mass / apoapsis ** THREE
    : 1 / (TWO * periapsis * periapsis) - 1 / (TWO * apoapsis * apoapsis);
  if (!(denominator > 0)) {
    // Inside roughly 8M the relativistic denominator changes sign: no bound orbit has those two
    // turning points, because the barrier cannot hold it.
    throw new RangeError('No bound orbit has those turning points.');
  }
  return Math.sqrt(numerator / denominator);
}

/**
 * Specific angular momentum of the circular orbit at `radius`: L² = M r²/(r − 3M).
 *
 * Diverges as r → 3M from above and does not exist at or below it — 3M is the photon sphere, and
 * no massive particle circles there at any angular momentum. Gives 2√3 M at the ISCO.
 */
export function circularAngularMomentum(radius: number, mass: number): number {
  if (!(mass > 0)) throw new RangeError('Mass must be positive.');
  if (!(radius > THREE * mass)) {
    throw new RangeError('No circular orbit for a massive particle at or inside 3M.');
  }
  return Math.sqrt((mass * radius * radius) / (radius - THREE * mass));
}

/**
 * Specific energy of the circular orbit at `radius`: Ẽ = (1 − 2M/r)/√(1 − 3M/r).
 *
 * This is E/m including rest mass, so it tends to 1 far away and reads √(8/9) at the ISCO. It is
 * a different quantity from `effectivePotential`, which is the Newtonian-like (Ẽ²−1)/2 — the two
 * are related by `specificEnergyFromOrbitEnergy` and the sim asserts they agree.
 */
export function circularSpecificEnergy(radius: number, mass: number): number {
  if (!(mass > 0)) throw new RangeError('Mass must be positive.');
  if (!(radius > THREE * mass)) {
    throw new RangeError('No circular orbit for a massive particle at or inside 3M.');
  }
  return (1 - (TWO * mass) / radius) / Math.sqrt(1 - (THREE * mass) / radius);
}

/**
 * Fraction of rest mass that must be radiated to reach the circular orbit at `radius` from rest
 * at infinity: 1 − Ẽ. At the ISCO this is 5.7191%, which is where the Novikov–Thorne radiative
 * efficiency comes from — the disk model inherits the number from the geometry.
 */
export const circularBindingEfficiency = (radius: number, mass: number): number =>
  1 - circularSpecificEnergy(radius, mass);

/**
 * Radial epicyclic frequency squared, κ² = V_eff''(r_c) = M(r − 6M)/(r³(r − 3M)).
 *
 * The ISCO in one expression: positive above 6M, so a nudged orbit oscillates and returns;
 * exactly zero at 6M; negative below, so the nudge grows. The oscillation period 2π/κ diverges
 * at the ISCO, which is what "marginally stable" means operationally — 225 M at r = 8M, but
 * 1,606 M at r = 6.01M.
 */
export function radialEpicyclicSquared(radius: number, mass: number): number {
  if (!(mass > 0)) throw new RangeError('Mass must be positive.');
  if (!(radius > THREE * mass)) {
    throw new RangeError('No circular orbit for a massive particle at or inside 3M.');
  }
  return (mass * (radius - SIX * mass)) / (radius ** THREE * (radius - THREE * mass));
}

/** A circular orbit is stable exactly where κ² > 0, which is r > 6M. */
export const isStableCircularOrbit = (radius: number, mass: number): boolean =>
  radius > SIX * mass;

/**
 * Ẽ from the Newtonian-like energy the effective potential uses: Ẽ = √(1 + 2E).
 *
 * E = (Ẽ² − 1)/2 is the definition that makes V_eff look Newtonian; this inverts it so the two
 * conventions in PHYSICS_SPEC §2.5 can be compared rather than confused.
 */
export function specificEnergyFromOrbitEnergy(energy: number): number {
  const squared = 1 + TWO * energy;
  if (!(squared >= 0)) throw new RangeError('No timelike geodesic has that energy.');
  return Math.sqrt(squared);
}

/**
 * dt/dτ = Ẽ/(1 − 2M/r): Schwarzschild coordinate time per unit proper time.
 *
 * This is the whole of the "frozen at the horizon" picture. It diverges at r = 2M, so a faller
 * who reaches the horizon at a finite proper time does so only as t → ∞. Nothing happens to the
 * faller there; the divergence is a property of the coordinate, which is why an infall animation
 * driven by t must stop short of the horizon and say so.
 */
export function coordinateTimeRate(
  radius: number, mass: number, specificEnergy: number,
): number {
  if (!(mass > 0)) throw new RangeError('Mass must be positive.');
  if (!(radius > TWO * mass)) {
    throw new RangeError('Schwarzschild t does not label events at or inside the horizon.');
  }
  return specificEnergy / (1 - (TWO * mass) / radius);
}

/** The marginally bound circular orbit, Ẽ = 1 exactly: r_mb = 4M. */
export const marginallyBoundRadius = (mass: number): number => 4 * mass;
