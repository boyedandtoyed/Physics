/** The deforming "spacetime fabric" grid: its mesh, and the CPU twin of its vertex shader.
 *
 * The displacement runs in the **vertex shader** — the CPU sends mass positions once a frame and
 * the GPU evaluates the height at every one of a few thousand vertices. Doing it the other way
 * round means re-uploading the whole mesh sixty times a second to compute, on one core, exactly
 * what a GPU does in parallel for nothing.
 *
 * `fabricHeight` here is the same arithmetic as `FABRIC_GLSL`, kept beside it and tested against
 * the same closed forms in `core/embedding.ts`. Two implementations of one function is a thing
 * worth being uncomfortable about; the alternative is that nothing in the test suite says
 * anything at all about what the sheet on screen is showing.
 *
 * PHYSICS_SPEC §2.9 is what each mode means and, more to the point, what it does not.
 */
import { embeddingHeight } from '../../core/embedding';
import { uniformSpherePotential } from '../../core/embedding';

/** Uniform array size. Beyond this the sheet stops responding to new masses, so the sim caps
 * placement at the same number rather than silently ignoring the thirty-third. */
export const MAX_FABRIC_MASSES = 32;

export interface FabricMass {
  x: number;
  y: number;
  /** Sim mass. For the Flamm mode this is ignored; the geometry is set by `radius` = r_s. */
  mass: number;
  /** The body's drawn radius, which is the uniform sphere's R — or r_s in the Flamm mode. */
  radius: number;
}

export type FabricMode =
  /** Sum of exact uniform-sphere Newtonian potentials. Honest for any number of masses. */
  | 'potential'
  /** The exact Flamm paraboloid of ONE Schwarzschild mass, hung so its far edge is at zero. */
  | 'flamm';

export interface FabricParams {
  mode: FabricMode;
  masses: readonly FabricMass[];
  /** Vertical scale. A display choice, applied after the physics and never to it. */
  heightScale: number;
  /** The sheet is clipped this far down. A heavy mass would otherwise take the grid off screen,
   * since the potential reaches -3M/2R at its centre and R is small for a black hole. */
  floor: number;
  /** Flamm only: the radius the surface is hung from, so the outer edge sits at height zero. */
  outerRadius: number;
}

const TWO = 2;
const MIN_RADIUS = 1e-6;

/**
 * Height of the sheet at a point of the equatorial plane. The CPU twin of `FABRIC_GLSL`.
 *
 * Clipping at `floor` is a rendering decision and is the only place the two modes are treated
 * alike; everything above it is the closed form from `core/embedding.ts`.
 */
export function fabricHeight(x: number, y: number, params: FabricParams): number {
  const { mode, masses, heightScale, floor, outerRadius } = params;
  let height = 0;
  if (mode === 'flamm') {
    const source = masses[0];
    if (!source) return 0;
    const schwarzschild = Math.max(source.radius, MIN_RADIUS);
    const distance = Math.hypot(x - source.x, y - source.y);
    // The embedding does not exist inside the horizon. The throat is the floor of the funnel and
    // the mesh stops there rather than continuing into a region the surface does not cover.
    const radius = Math.max(distance, schwarzschild);
    const outer = Math.max(outerRadius, schwarzschild);
    height = embeddingHeight(radius, schwarzschild) - embeddingHeight(outer, schwarzschild);
  } else {
    for (const source of masses) {
      const distance = Math.hypot(x - source.x, y - source.y);
      height += uniformSpherePotential(
        distance, source.mass, Math.max(source.radius, MIN_RADIUS),
      );
    }
  }
  return Math.max(height * heightScale, -Math.abs(floor));
}

/**
 * The displacement, in GLSL, for the vertex shader to `#include` by concatenation.
 *
 * Kept as a string constant beside its CPU twin so the two can be read together. `uMasses[i]` is
 * packed (x, y, mass, radius); `uMode` is 0 for the potential sum and 1 for Flamm.
 */
export const FABRIC_GLSL = `
const int MAX_FABRIC_MASSES = ${MAX_FABRIC_MASSES};
uniform vec4 uMasses[MAX_FABRIC_MASSES];
uniform int uMassCount;
uniform int uMode;
uniform float uHeightScale;
uniform float uFloor;
uniform float uOuterRadius;

float fabricHeight(vec2 p) {
  float height = 0.0;
  if (uMode == 1) {
    // Flamm: one mass, radius carries r_s, hung so the outer edge of the mesh sits at zero.
    vec4 source = uMasses[0];
    float rs = max(source.w, 1e-6);
    float r = max(length(p - source.xy), rs);
    float outer = max(uOuterRadius, rs);
    height = 2.0 * sqrt(rs * (r - rs)) - 2.0 * sqrt(rs * (outer - rs));
  } else {
    for (int i = 0; i < MAX_FABRIC_MASSES; i++) {
      if (i >= uMassCount) break;
      vec4 source = uMasses[i];
      float bodyRadius = max(source.w, 1e-6);
      float r = length(p - source.xy);
      height += r >= bodyRadius
        ? -source.z / max(r, 1e-6)
        : -source.z * (3.0 * bodyRadius * bodyRadius - r * r)
          / (2.0 * bodyRadius * bodyRadius * bodyRadius);
    }
  }
  return max(height * uHeightScale, -abs(uFloor));
}
`;

/**
 * A square grid as a line list, in the plane, two floats per vertex.
 *
 * The shader supplies the height, so the mesh itself never changes and is uploaded once. A
 * Cartesian grid rather than a radial one because the gravity sandbox has no distinguished
 * centre: radial spokes around an origin no mass sits at would be a claim about the scene.
 */
export function cartesianGridVertices(halfWidth: number, divisions: number): Float32Array {
  if (!(halfWidth > 0) || divisions < 2) {
    throw new RangeError('A grid needs a positive extent and at least two divisions.');
  }
  // Each of the (divisions + 1) lines in each direction is a strip of `divisions` segments, so
  // that the shader's displacement is sampled at every crossing rather than only at the ends.
  const lines = divisions + 1;
  const data = new Float32Array(TWO * lines * divisions * TWO * TWO);
  let cursor = 0;
  const at = (index: number) => -halfWidth + (TWO * halfWidth * index) / divisions;
  for (let i = 0; i <= divisions; i++) {
    for (let j = 0; j < divisions; j++) {
      // Along x.
      data[cursor] = at(j);
      data[cursor + 1] = at(i);
      data[cursor + 2] = at(j + 1);
      data[cursor + 3] = at(i);
      cursor += 4;
      // Along y.
      data[cursor] = at(i);
      data[cursor + 1] = at(j);
      data[cursor + 2] = at(i);
      data[cursor + 3] = at(j + 1);
      cursor += 4;
    }
  }
  return data;
}

/**
 * A polar grid as a line list: rings of constant r and spokes of constant phi.
 *
 * For the freefall sandbox, where there *is* a distinguished centre and the surface being drawn
 * is the Flamm paraboloid of the one mass at it. Radii are spaced in the square of the parameter
 * so the rings stay evenly spaced ON the surface, which is nearly vertical at the throat.
 */
export function polarGridVertices(
  inner: number, outer: number, rings: number, spokes: number, segments = 96,
): Float32Array {
  if (!(outer > inner) || !(inner > 0) || rings < 2 || spokes < 3) {
    throw new RangeError('A polar grid needs an annulus and a real mesh.');
  }
  const radiusAt = (index: number) => {
    const t = index / rings;
    return inner + (outer - inner) * t * t;
  };
  const data = new Float32Array((rings + 1) * segments * 4 + spokes * rings * 4);
  let cursor = 0;
  for (let ring = 0; ring <= rings; ring++) {
    const radius = radiusAt(ring);
    for (let segment = 0; segment < segments; segment++) {
      const a = (segment / segments) * Math.PI * TWO;
      const b = ((segment + 1) / segments) * Math.PI * TWO;
      data[cursor] = radius * Math.cos(a);
      data[cursor + 1] = radius * Math.sin(a);
      data[cursor + 2] = radius * Math.cos(b);
      data[cursor + 3] = radius * Math.sin(b);
      cursor += 4;
    }
  }
  for (let spoke = 0; spoke < spokes; spoke++) {
    const phi = (spoke / spokes) * Math.PI * TWO;
    const cos = Math.cos(phi);
    const sin = Math.sin(phi);
    for (let ring = 0; ring < rings; ring++) {
      data[cursor] = radiusAt(ring) * cos;
      data[cursor + 1] = radiusAt(ring) * sin;
      data[cursor + 2] = radiusAt(ring + 1) * cos;
      data[cursor + 3] = radiusAt(ring + 1) * sin;
      cursor += 4;
    }
  }
  return data;
}

/** Packs the masses for the uniform array, truncating at the limit the shader can hold. */
export function packMasses(masses: readonly FabricMass[]): Float32Array {
  const data = new Float32Array(MAX_FABRIC_MASSES * 4);
  const count = Math.min(masses.length, MAX_FABRIC_MASSES);
  for (let i = 0; i < count; i++) {
    const source = masses[i] as FabricMass;
    data[i * 4] = source.x;
    data[i * 4 + 1] = source.y;
    data[i * 4 + 2] = source.mass;
    data[i * 4 + 3] = Math.max(source.radius, MIN_RADIUS);
  }
  return data;
}
