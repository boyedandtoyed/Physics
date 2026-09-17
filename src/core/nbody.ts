/** Newtonian N-body with the optional §2.5 relativistic correction. PHYSICS_SPEC §2.6.
 *
 * Sim units: **G = 1**, masses and lengths in arbitrary sim units, c = 1. The geometry is
 * scale-free, so the only numbers that mean anything are ratios — which is why the presets are
 * built from real GM ratios out of `units.ts` rather than from invented figures.
 *
 * Framework-free, float64. Nothing here knows about a canvas.
 */
import {
  EARTH_AU,
  EARTH_GM,
  JUPITER_GM,
  MARS_AU,
  MARS_GM,
  MERCURY_AU,
  MERCURY_GM,
  MOON_GM,
  SOLAR_GM,
  VENUS_AU,
  VENUS_GM,
} from './units';

const TWO = 2;
const THREE = 3;
const HALF = 0.5;

export interface Body {
  /** Sim-unit mass. **0 is legal**: a test particle feels the field and exerts nothing. */
  mass: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Anything entering this radius is absorbed. 0 for a body that absorbs nothing. */
  absorbRadius: number;
  /** For the UI: which palette entry produced this body. The core does not read it. */
  kind: string;
  /** For the UI: a label to draw beside it, where the body is a named thing. Optional. */
  name?: string;
}

/** Separations below this are a numerical event, not a physical one, and are refused. */
export const MIN_SEPARATION = 1e-9;

/**
 * The speed of light **in sim units**, which fixes how relativistic the sandbox is.
 *
 * G = 1 alone does not set this: the correction term is 3Gm h²/(c²r⁵), and with c left implicitly
 * at 1 the sandbox sits deep in the strong field at every scale it can draw. A mass-1 body at
 * r = 3 then has a "correction" equal to 100% of the Newtonian term, and the binary-hole preset
 * reaches **1000%** — at which point the post-Newtonian expansion has failed completely and what
 * the toggle produces is not a correction to anything.
 *
 * 10 puts the same configurations at 1% and 10%: a genuine perturbation that precesses visibly
 * and stays inside the expansion's domain, with the strong-field cases still reachable by moving
 * things closer. It is a unit convention of this sandbox, not a physical constant, which is why
 * it lives here rather than in `units.ts`.
 */
export const SIM_LIGHT_SPEED = 10;

/**
 * Accelerations of every body, into `out` as (ax, ay) pairs.
 *
 *     a_i = -Σ_j G m_j r_ij / r_ij³   [ - Σ_j 3 G m_j h_ij² r_ij / (c² r_ij⁵) ]
 *
 * **The correction's coefficient is 3Gm_j.** −3/2 h²r/r⁵ is §2.3's specialisation to r_s = 1,
 * where M = 1/2; in sim units with a black hole of m = 10 it is wrong by a factor 2m = 20.
 *
 * `velocities` is required only when `relativistic` is set, and **that is the whole problem with
 * the toggle**: h_ij = |r_ij × v_ij| makes the force velocity-dependent, so this is no longer the
 * autonomous a(q) that `createSymplectic` documents itself as requiring, and Yoshida-4's bounded
 * energy error does not apply. It is left that way deliberately — the alternative is to freeze h
 * per pair, which is only meaningful for a single dominant mass — and the extra drift is measured
 * rather than hidden. See PHYSICS_SPEC §2.6.
 *
 * No softening and no cutoff. A cutoff would make the force discontinuous, which is precisely
 * what destroys the energy conservation a symplectic integrator is chosen for.
 */
export function accelerations(
  bodies: readonly Body[],
  out: Float64Array,
  relativistic = false,
  velocities?: Float64Array,
): void {
  const count = bodies.length;
  if (out.length < count * TWO) throw new RangeError('Output is too small for this many bodies.');
  out.fill(0, 0, count * TWO);
  for (let i = 0; i < count; i++) {
    const self = bodies[i] as Body;
    for (let j = 0; j < count; j++) {
      if (i === j) continue;
      const other = bodies[j] as Body;
      if (other.mass === 0) continue;
      const dx = self.x - other.x;
      const dy = self.y - other.y;
      const r2 = dx * dx + dy * dy;
      const r = Math.sqrt(r2);
      if (!(r > MIN_SEPARATION)) {
        throw new RangeError('Two bodies are on top of each other; absorb or separate them first.');
      }
      let k = other.mass / (r2 * r);
      if (relativistic) {
        if (!velocities) throw new RangeError('The relativistic term needs the velocities.');
        const dvx = (velocities[i * TWO] as number) - (velocities[j * TWO] as number);
        const dvy = (velocities[i * TWO + 1] as number) - (velocities[j * TWO + 1] as number);
        // h = |r × v| for the pair, read from the velocities as they stand at this substep.
        const h = dx * dvy - dy * dvx;
        k += (THREE * other.mass * h * h)
          / (r2 * r2 * r * SIM_LIGHT_SPEED * SIM_LIGHT_SPEED);
      }
      out[i * TWO] = (out[i * TWO] as number) - k * dx;
      out[i * TWO + 1] = (out[i * TWO + 1] as number) - k * dy;
    }
  }
}

/** The rationals of the quadrupole reaction term and of Peters' two closed forms, named because
 * `no-magic-numbers` is on over core/ and because each one is a coefficient worth recognising. */
const FOUR = 4;
const FIVE = 5;
const EIGHT = 8;
const SEVENTEEN = 17;
const THIRTY_TWO = 32;
const TWO_FIFTY_SIX = 256;
const RADIATION_PREFACTOR = EIGHT / FIVE;
const SEVENTEEN_THIRDS = SEVENTEEN / THREE;

/**
 * Quadrupole radiation reaction: the 2.5PN term, added to `out` rather than replacing it.
 * PHYSICS_SPEC §2.10.
 *
 * This is the only dissipative force in the sandbox and it is what makes an inspiral an
 * inspiral. The §2.6 correction is **conservative** — it precesses an orbit and never shrinks
 * it — so a binary run with that alone orbits forever, which is what the binary-hole preset
 * used to say in its own note.
 *
 * Relative acceleration of a pair, in the standard Damour-Deruelle form (G = 1):
 *
 *     a_rel = -(8/5)(m1 m2 / c^5 r^3) [ v (v^2 + 3M/r) - rdot n (3v^2 + (17/3)M/r) ]
 *
 * split between the two bodies as an equal and opposite force, which is what conserves momentum
 * at this order. **The circular limit is what this repo benchmarks**: setting rdot = 0 and
 * v^2 = M/r gives dE/dt = -(32/5) m1^2 m2^2 M / (c^5 r^5) exactly, Peters' quadrupole rate, and
 * from it Peters' merger time. The rdot terms are carried in their standard form but no
 * published number in this repo pins them down, so the preset that uses this is quasi-circular
 * and says so.
 *
 * **Pairwise summation is an approximation for N > 2.** Radiation reaction is not additive over
 * pairs in general — the radiation field is sourced by the whole system's quadrupole moment. For
 * a two-body inspiral, which is the only configuration this ships a preset for, it is exact.
 */
export function radiationReaction(
  bodies: readonly Body[], velocities: Float64Array, out: Float64Array,
): void {
  const count = bodies.length;
  if (out.length < count * TWO) throw new RangeError('Output is too small for this many bodies.');
  const c5 = SIM_LIGHT_SPEED ** FIVE;
  for (let i = 0; i < count; i++) {
    const self = bodies[i] as Body;
    if (self.mass === 0) continue;
    for (let j = i + 1; j < count; j++) {
      const other = bodies[j] as Body;
      if (other.mass === 0) continue;
      const dx = self.x - other.x;
      const dy = self.y - other.y;
      const r = Math.hypot(dx, dy);
      if (!(r > MIN_SEPARATION)) {
        throw new RangeError('Two bodies are on top of each other; absorb or separate them first.');
      }
      const nx = dx / r;
      const ny = dy / r;
      const dvx = (velocities[i * TWO] as number) - (velocities[j * TWO] as number);
      const dvy = (velocities[i * TWO + 1] as number) - (velocities[j * TWO + 1] as number);
      const speedSquared = dvx * dvx + dvy * dvy;
      const radial = nx * dvx + ny * dvy;
      const total = self.mass + other.mass;
      const common = (RADIATION_PREFACTOR * self.mass * other.mass) / (c5 * r * r * r);
      const along = speedSquared + THREE * (total / r);
      const outward = THREE * speedSquared + SEVENTEEN_THIRDS * (total / r);
      const relativeX = -common * (dvx * along - radial * nx * outward);
      const relativeY = -common * (dvy * along - radial * ny * outward);
      // Equal and opposite: a_1 = a_rel m_2/M, a_2 = -a_rel m_1/M.
      out[i * TWO] = (out[i * TWO] as number) + (relativeX * other.mass) / total;
      out[i * TWO + 1] = (out[i * TWO + 1] as number) + (relativeY * other.mass) / total;
      out[j * TWO] = (out[j * TWO] as number) - (relativeX * self.mass) / total;
      out[j * TWO + 1] = (out[j * TWO + 1] as number) - (relativeY * self.mass) / total;
    }
  }
}

/**
 * Peters' merger time for a circular binary: t_c = 5 c^5 a^4 / (256 m1 m2 M), with G = 1.
 *
 * Peters 1964, eq. (5.10). Exported so the sim can print how long an inspiral should take and
 * the tests can check that it does.
 */
export function petersMergerTime(massA: number, massB: number, separation: number): number {
  const total = massA + massB;
  return (FIVE * SIM_LIGHT_SPEED ** FIVE * separation ** FOUR)
    / (TWO_FIFTY_SIX * massA * massB * total);
}

/** Peters' circular energy-loss rate, dE/dt = -(32/5) m1^2 m2^2 M / (c^5 a^5). Negative. */
export function petersEnergyLossRate(
  massA: number, massB: number, separation: number,
): number {
  const total = massA + massB;
  return -(THIRTY_TWO / FIVE) * (massA * massA * massB * massB * total)
    / (SIM_LIGHT_SPEED ** FIVE * separation ** FIVE);
}

/** Total energy, kinetic plus pairwise potential. Constant to integration error, Newtonian. */
export function totalEnergy(bodies: readonly Body[]): number {
  let energy = 0;
  for (let i = 0; i < bodies.length; i++) {
    const self = bodies[i] as Body;
    energy += HALF * self.mass * (self.vx * self.vx + self.vy * self.vy);
    for (let j = i + 1; j < bodies.length; j++) {
      const other = bodies[j] as Body;
      const r = Math.hypot(self.x - other.x, self.y - other.y);
      if (r > MIN_SEPARATION) energy -= (self.mass * other.mass) / r;
    }
  }
  return energy;
}

/** Total linear momentum. Conserved exactly by the Newtonian force; a removal breaks it. */
export function totalMomentum(bodies: readonly Body[]): { x: number; y: number } {
  let x = 0;
  let y = 0;
  for (const body of bodies) {
    x += body.mass * body.vx;
    y += body.mass * body.vy;
  }
  return { x, y };
}

/** Local escape speed at body `index`, from the potential every other body puts it in. */
export function escapeSpeed(bodies: readonly Body[], index: number): number {
  const self = bodies[index] as Body;
  let potential = 0;
  for (let j = 0; j < bodies.length; j++) {
    if (j === index) continue;
    const other = bodies[j] as Body;
    const r = Math.hypot(self.x - other.x, self.y - other.y);
    if (r > MIN_SEPARATION) potential += other.mass / r;
  }
  return Math.sqrt(TWO * potential);
}

/**
 * Size of the relativistic correction relative to the Newtonian term, for body `index`.
 *
 * The number §2.6 says to display instead of applying a cutoff: it is 3GM/rc² for a near-circular
 * orbit, so it **grows inward**. 10% at 30 M, 100% at the photon sphere.
 */
export function relativisticFraction(bodies: readonly Body[], index: number): number {
  const self = bodies[index] as Body;
  let worst = 0;
  for (let j = 0; j < bodies.length; j++) {
    if (j === index) continue;
    const other = bodies[j] as Body;
    if (other.mass === 0) continue;
    const dx = self.x - other.x;
    const dy = self.y - other.y;
    const r2 = dx * dx + dy * dy;
    if (!(r2 > MIN_SEPARATION * MIN_SEPARATION)) continue;
    const h = dx * (self.vy - other.vy) - dy * (self.vx - other.vx);
    // (3 m h²/c²r⁵) ÷ (m/r³) = 3h²/(c²r²). The mass cancels: the ratio belongs to the orbit.
    worst = Math.max(worst, (THREE * h * h) / (r2 * SIM_LIGHT_SPEED * SIM_LIGHT_SPEED));
  }
  return worst;
}

/** Bodies whose index should be removed, because they entered something's absorb radius. */
export function findAbsorptions(bodies: readonly Body[]): number[] {
  const doomed = new Set<number>();
  for (let i = 0; i < bodies.length; i++) {
    const self = bodies[i] as Body;
    if (!(self.absorbRadius > 0)) continue;
    for (let j = 0; j < bodies.length; j++) {
      if (i === j || doomed.has(j)) continue;
      const other = bodies[j] as Body;
      // The absorber never absorbs something heavier than itself: that would delete the hole.
      if (other.mass > self.mass) continue;
      if (Math.hypot(self.x - other.x, self.y - other.y) < self.absorbRadius) doomed.add(j);
    }
  }
  return [...doomed].sort((a, b) => a - b);
}

/** Circular-orbit speed for a test body at `radius` around `mass`, sim units. */
export const circularSpeed = (radius: number, mass: number): number => Math.sqrt(mass / radius);

/** Orbital period, 2π√(r³/GM). Sim units, G = 1. */
export const orbitalPeriod = (radius: number, mass: number): number =>
  TWO * Math.PI * Math.sqrt((radius * radius * radius) / mass);

/**
 * Boost to the barycentre frame and recentre on it.
 *
 * A Galilean boost plus a translation: nothing physical changes, and the system stops drifting
 * out of frame. Without it the Sun–Earth–Jupiter preset carries a net momentum of 0.21 sim
 * units — the Sun starts at rest while two planets orbit it — and the whole system walks off the
 * canvas over a long run, which reads as a bug in the integrator rather than as the initial
 * condition it is.
 */
export function zeroMomentum(bodies: readonly Body[]): Body[] {
  const total = bodies.reduce((sum, b) => sum + b.mass, 0);
  if (!(total > 0)) return bodies.map(b => ({ ...b }));
  const momentum = totalMomentum(bodies);
  let cx = 0;
  let cy = 0;
  for (const b of bodies) {
    cx += (b.mass * b.x) / total;
    cy += (b.mass * b.y) / total;
  }
  return bodies.map(b => ({
    ...b,
    x: b.x - cx,
    y: b.y - cy,
    vx: b.vx - momentum.x / total,
    vy: b.vy - momentum.y / total,
  }));
}

export interface Preset {
  id: string;
  label: string;
  /** What the numbers are and are not, shown beside the button. */
  note: string;
  bodies: Body[];
}

const PLANET_ABSORB = 0.12;
const HOLE_ABSORB_PER_MASS = 0.05;
/** Sun–Earth–Jupiter is drawn at readable radii; only the MASSES are to scale. */
const EARTH_ORBIT = 3;
const JUPITER_ORBIT = 7;
const BINARY_SEPARATION = 6;
const BINARY_MASS = 10;
const MOON_ORBIT = 2.4;
/** The star's absorb radius: big enough to read as a disc, small enough not to eat the orbits. */
const STAR_ABSORB = 0.35;

/** The inner planets, placed at their real semi-major axes scaled by ONE factor.
 *
 * Scaling every radius by the same number leaves every *ratio* exact — including the orbital
 * periods, since T ∝ r^{3/2} scales out of a ratio. Mercury's year is 0.2408 of Earth's on
 * screen because it is 0.2408 of Earth's in the sky. Only the absolute period is sim units. */
const INNER_PLANET_SCALE = 4.2;
/** Drawn radius of the Sun in the inner-planet preset. At true scale it would be 0.009. */
const SUN_ABSORB = 0.3;
const PLANET_DOT = 0.05;

/** Chenciner–Montgomery figure eight, Simó's numerical initial conditions. Equal unit masses,
 * G = 1, and a period of 6.32591398. Published to eight figures and used verbatim: the orbit is
 * a genuine solution only at these numbers, and it is linearly stable but not robust to a
 * rounded start. */
const EIGHT_X = 0.970_004_36;
const EIGHT_Y = -0.243_087_53;
const EIGHT_VX = 0.466_203_685;
const EIGHT_VY = 0.432_365_73;
export const FIGURE_EIGHT_PERIOD = 6.325_913_98;

/** The inspiral preset: a 10-mass hole and a 2-mass companion at separation 3. */
const INSPIRAL_PRIMARY = 10;
const INSPIRAL_SECONDARY = 2;
const INSPIRAL_SEPARATION = 3;

/** Kepler's third law on the scaled radii: the ratio survives the scaling exactly. */
export const MERCURY_YEAR_RATIO = (MERCURY_AU / EARTH_AU) ** (THREE / TWO);

const body = (partial: Partial<Body> & Pick<Body, 'mass' | 'x' | 'y'>): Body => ({
  vx: 0, vy: 0, absorbRadius: PLANET_ABSORB, kind: 'planet', ...partial,
});

/**
 * Two bodies on a mutual circular orbit about their common barycentre, placed on the x axis and
 * with the barycentre at rest at the origin. Exact for the Newtonian two-body problem.
 */
export function binary(massA: number, massB: number, separation: number): [Body, Body] {
  const total = massA + massB;
  const speed = Math.sqrt(total / separation);
  const xa = -(massB / total) * separation;
  const xb = (massA / total) * separation;
  return [
    body({ mass: massA, x: xa, y: 0, vy: -(massB / total) * speed }),
    body({ mass: massB, x: xb, y: 0, vy: (massA / total) * speed }),
  ];
}

/** Mass ratios taken from the measured GM values in units.ts, never from rounded masses. */
export const MOON_TO_EARTH = MOON_GM / EARTH_GM;
export const SUN_TO_EARTH = SOLAR_GM / EARTH_GM;
export const JUPITER_TO_EARTH = JUPITER_GM / EARTH_GM;

export function presets(): Preset[] {
  const [earth, moon] = binary(1, MOON_TO_EARTH, MOON_ORBIT);
  const earthMoon: Body[] = [
    { ...earth, kind: 'planet' },
    { ...moon, kind: 'satellite', absorbRadius: 0 },
  ];

  // Sun at the origin with the planets on circular orbits about it. Masses to scale, radii not:
  // at true scale Jupiter is 5.2 AU out and the Sun is 1/10000 of that across.
  //
  // **Normalised to the Sun, not to the Earth.** The ratios are identical either way — only the
  // unit of mass changes, and the sandbox is scale-free in mass — but with the Earth as the unit
  // the Sun is 332946, the orbital period at r = 3 collapses to 0.057 sim time, and the fixed
  // step resolves it at **1.6 steps per orbit**. The orbits rendered as ten-sided polygons and
  // the integration behind them was meaningless. With the Sun as the unit it is 941.
  const sunMass = 1;
  const solar: Body[] = [
    body({ mass: sunMass, x: 0, y: 0, kind: 'star', absorbRadius: STAR_ABSORB }),
    body({
      mass: 1 / SUN_TO_EARTH, x: EARTH_ORBIT, y: 0,
      vy: circularSpeed(EARTH_ORBIT, sunMass), kind: 'planet',
    }),
    body({
      mass: JUPITER_TO_EARTH / SUN_TO_EARTH, x: -JUPITER_ORBIT, y: 0,
      vy: -circularSpeed(JUPITER_ORBIT, sunMass), kind: 'planet',
    }),
  ];

  const [holeA, holeB] = binary(BINARY_MASS, BINARY_MASS, BINARY_SEPARATION);
  const holes: Body[] = [
    { ...holeA, kind: 'hole', absorbRadius: BINARY_MASS * HOLE_ABSORB_PER_MASS },
    { ...holeB, kind: 'hole', absorbRadius: BINARY_MASS * HOLE_ABSORB_PER_MASS },
  ];

  // Inner planets. Masses from the measured GM values, radii from the real semi-major axes
  // scaled by one factor, both normalised to the Sun.
  const planet = (gm: number, au: number, label: string): Body => body({
    mass: gm / SOLAR_GM,
    x: au * INNER_PLANET_SCALE,
    y: 0,
    vy: circularSpeed(au * INNER_PLANET_SCALE, 1),
    kind: 'planet',
    absorbRadius: PLANET_DOT,
    name: label,
  });
  const innerPlanets: Body[] = [
    body({ mass: 1, x: 0, y: 0, kind: 'star', absorbRadius: SUN_ABSORB, name: 'Sun' }),
    planet(MERCURY_GM, MERCURY_AU, 'Mercury'),
    planet(VENUS_GM, VENUS_AU, 'Venus'),
    planet(EARTH_GM, EARTH_AU, 'Earth'),
    planet(MARS_GM, MARS_AU, 'Mars'),
  ];

  const figureEight: Body[] = [
    body({
      mass: 1, x: EIGHT_X, y: EIGHT_Y, vx: EIGHT_VX, vy: EIGHT_VY,
      kind: 'planet', absorbRadius: 0,
    }),
    body({
      mass: 1, x: -EIGHT_X, y: -EIGHT_Y, vx: EIGHT_VX, vy: EIGHT_VY,
      kind: 'planet', absorbRadius: 0,
    }),
    body({
      mass: 1, x: 0, y: 0, vx: -TWO * EIGHT_VX, vy: -TWO * EIGHT_VY,
      kind: 'planet', absorbRadius: 0,
    }),
  ];

  const [primary, secondary] = binary(INSPIRAL_PRIMARY, INSPIRAL_SECONDARY, INSPIRAL_SEPARATION);
  const inspiral: Body[] = [
    { ...primary, kind: 'hole', absorbRadius: INSPIRAL_PRIMARY * HOLE_ABSORB_PER_MASS },
    { ...secondary, kind: 'hole', absorbRadius: INSPIRAL_SECONDARY * HOLE_ABSORB_PER_MASS },
  ];

  return [
    {
      id: 'earth-moon',
      label: 'Earth and Moon',
      note: `Mass ratio ${MOON_TO_EARTH.toFixed(6)}, from the measured GM values — not a rounded `
        + '0.012. Separation and speeds are sim units; only the ratio is real.',
      bodies: zeroMomentum(earthMoon),
    },
    {
      id: 'sun-earth-jupiter',
      label: 'Sun, Earth, Jupiter',
      note: `Mass ratios to scale — Sun/Earth ${Math.round(SUN_TO_EARTH).toLocaleString()}, `
        + `Jupiter/Earth ${JUPITER_TO_EARTH.toFixed(1)}, with the Sun as the unit. `
        + 'Distances are not: at true scale Jupiter would be off screen and the Sun invisible.',
      bodies: zeroMomentum(solar),
    },
    {
      id: 'binary-holes',
      label: 'Binary black holes',
      note: 'Two equal masses on a mutual circular orbit about their barycentre. With radiation '
        + 'off this orbit is closed forever; the §2.6 correction precesses it but cannot shrink '
        + 'it, because it is conservative. Turn radiation on to see the difference.',
      bodies: zeroMomentum(holes),
    },
    {
      id: 'inner-planets',
      label: 'Inner planets',
      note: `Sun, Mercury, Venus, Earth and Mars. Masses from the measured GM values; radii are `
        + `the real semi-major axes scaled by one factor, so every ratio is exact — Mercury's `
        + `year is ${MERCURY_YEAR_RATIO.toFixed(4)} of Earth's here because it is that in the sky.`,
      bodies: zeroMomentum(innerPlanets),
    },
    {
      id: 'figure-eight',
      label: 'Figure eight',
      note: 'The Chenciner–Montgomery choreography: three equal masses chasing each other round '
        + `one curve, period ${FIGURE_EIGHT_PERIOD}. A genuine exact solution of the three-body `
        + 'problem, at these initial conditions and no others.',
      bodies: figureEight,
    },
    {
      id: 'inspiral',
      label: 'Inspiral',
      note: 'A 10-mass hole and a 2-mass companion, quasi-circular. Turn RADIATION on: Peters '
        + `gives ${petersMergerTime(INSPIRAL_PRIMARY, INSPIRAL_SECONDARY, INSPIRAL_SEPARATION)
          .toFixed(0)} sim-time units to merger from here, and the sandbox should take that long.`,
      bodies: zeroMomentum(inspiral),
    },
  ];
}
