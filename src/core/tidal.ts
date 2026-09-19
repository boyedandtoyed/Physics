/** Geodesic deviation and the tidal tensor in Schwarzschild. PHYSICS_SPEC §7.6.
 *
 * The Jacobi equation for a separation vector ξ carried along a geodesic with tangent u is
 *
 *     D²ξ^α/dτ² = -R^α_{βγδ} u^β ξ^γ u^δ  =  -E^α_γ ξ^γ
 *
 * where E is the electric part of the Weyl tensor. **The minus sign is the whole physics.** For
 * a radially infalling observer in Schwarzschild the eigenvalues of E are
 *
 *     E_rr = -2M/r³,   E_⊥⊥ = +M/r³  (twice),   so  E_rr + 2E_⊥⊥ = 0
 *
 * and feeding those through the minus sign gives
 *
 *     d²ξ_r/dτ²  = +2M/r³ ξ_r    — the radial direction STRETCHES
 *     d²ξ_⊥/dτ²  = -M/r³  ξ_⊥    — the transverse directions SQUEEZE
 *
 * which is spaghettification: pulled head to toe, pressed in at the sides. Dropping the minus
 * sign inverts both and produces a body squashed lengthwise and splayed sideways, which is not
 * what any of the literature describes and is the error this module exists to not make.
 *
 * Framework-free, float64. `mass` defaults to 1 so the benchmarks read in M; the sims work in
 * r_s = 1 where M = 1/2, matching `core/infall.ts`.
 */
import { G, C, RHO_STEEL, SIGMA_STEEL } from './units';

const TWO = 2;
const THREE = 3;

export interface TidalEigenvalues {
  /** E_rr = -2M/r³. Negative, which through the Jacobi equation's minus sign means stretching. */
  radial: number;
  /** E_⊥⊥ = +M/r³, twice degenerate. Positive, so compressing. */
  transverse: number;
}

/** The electric Weyl tensor's eigenvalues for a radial infaller. Diverges at r = 0 only. */
export function tidalEigenvalues(radius: number, mass = 1): TidalEigenvalues {
  if (!(radius > 0)) throw new RangeError('The tidal tensor diverges at r = 0.');
  const cube = radius ** THREE;
  return { radial: (-TWO * mass) / cube, transverse: mass / cube };
}

/**
 * E_rr + 2E_⊥⊥, which vanishes identically.
 *
 * Returned rather than asserted so the tests and the UI can show the residual is zero to
 * machine precision. It is not a coincidence: Schwarzschild is a vacuum solution, so the Ricci
 * tensor vanishes and the tidal tensor — being the Weyl part — is trace-free. A body in free
 * fall is distorted, never compressed overall, and that is the statement.
 */
export function traceResidual(radius: number, mass = 1): number {
  const { radial, transverse } = tidalEigenvalues(radius, mass);
  return radial + TWO * transverse;
}

/** Frobenius norm of E, √(E_rr² + 2E_⊥⊥²) = √6 M/r³. The scalar the ellipse is coloured by. */
export function tidalStrength(radius: number, mass = 1): number {
  const { radial, transverse } = tidalEigenvalues(radius, mass);
  return Math.sqrt(radial * radial + TWO * transverse * transverse);
}

/** The acceleration the Jacobi equation gives each component: −E ξ. */
export function jacobiAcceleration(
  separation: { radial: number; transverse: number }, radius: number, mass = 1,
): { radial: number; transverse: number } {
  const eigen = tidalEigenvalues(radius, mass);
  return {
    radial: -eigen.radial * separation.radial,
    transverse: -eigen.transverse * separation.transverse,
  };
}

/**
 * Radius at which the tidal stress across a body reaches its tensile strength. SI throughout.
 *
 *     σ = ρ (GM/r³) L²   ⟹   r = (G M ρ L² / σ)^{1/3}
 *
 * Derivation, because the formula is easy to get wrong: a rod of half-length L, density ρ and
 * cross-section A feels a tidal acceleration (2GM/r³)x at distance x from its centre. The force
 * the material must carry at x is the integral of ρA times that from x out to L, which is
 * ρA(GM/r³)(L² − x²); it is largest at the centre, where the stress is ρ(GM/r³)L². Note L
 * SQUARED and ρ in the numerator — a longer or denser body tears further out, a stronger one
 * survives closer in.
 *
 * The ratio to the horizon goes as M^{-2/3}, so a big enough hole tears you apart only after you
 * are inside it. For a 1 m steel rod the crossover is at 317 M☉.
 */
export function spaghettificationRadius(
  massKilograms: number,
  halfLength: number,
  density = RHO_STEEL,
  tensileStrength = SIGMA_STEEL,
): number {
  if (!(massKilograms > 0) || !(halfLength > 0)) {
    throw new RangeError('A mass and a body of positive size are needed.');
  }
  if (!(density > 0) || !(tensileStrength > 0)) {
    throw new RangeError('Density and tensile strength must be positive.');
  }
  return Math.cbrt((G * massKilograms * density * halfLength * halfLength) / tensileStrength);
}

/** Schwarzschild radius in metres, from a mass in kilograms. */
export const horizonRadiusMetres = (massKilograms: number): number =>
  (TWO * G * massKilograms) / C ** TWO;

/**
 * r_spaghetti / r_s. Above 1 the body tears outside the horizon; below 1 it crosses intact.
 *
 * Scales as M^{-2/3}: the famous statement that a supermassive hole's horizon is a gentle place
 * and a stellar-mass one's is not.
 */
export const spaghettificationRatio = (
  massKilograms: number, halfLength: number,
  density = RHO_STEEL, tensileStrength = SIGMA_STEEL,
): number => spaghettificationRadius(massKilograms, halfLength, density, tensileStrength)
  / horizonRadiusMetres(massKilograms);

/**
 * The mass at which the tearing radius equals the horizon, for a given body.
 *
 *     M = (c³L/G) √(ρ/8σ)
 *
 * 317 M☉ for a 1 m steel rod — the boundary the sim's two extreme cases sit either side of.
 */
export function spaghettificationCrossoverMass(
  halfLength: number, density = RHO_STEEL, tensileStrength = SIGMA_STEEL,
): number {
  const EIGHT = 8;
  return ((C ** THREE * halfLength) / G) * Math.sqrt(density / (EIGHT * tensileStrength));
}

export interface Deviation {
  radial: number;
  transverse: number;
  radialRate: number;
  transverseRate: number;
}

/**
 * The Wronskian of two solutions of ξ'' = −E(τ)ξ: W = ξ₁ξ₂' − ξ₁'ξ₂.
 *
 * **Exactly conserved**, by Abel's identity — the equation has no first-derivative term, so
 * dW/dτ = ξ₁ξ₂'' − ξ₁''ξ₂ = −Eξ₁ξ₂ + Eξ₁ξ₂ = 0. This, and not the area of the drawn ellipse, is
 * what is conserved here; it is a phase-space area, and it is the honest invariant to check an
 * integrator against.
 */
export const wronskian = (
  first: { value: number; rate: number }, second: { value: number; rate: number },
): number => first.value * second.rate - first.rate * second.value;
