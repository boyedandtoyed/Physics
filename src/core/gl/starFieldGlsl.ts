/** The lensed star-field background, as a GLSL ES 3.00 source fragment. PHYSICS_SPEC §4.4.
 *
 * Shared by every raymarcher: the Schwarzschild one of Phase 1 and the Kerr one of Phase 4 need
 * the same background and the same anisotropic reconstruction, and the field is a measured
 * artefact — its temporal stability is a Phase 1 acceptance gate with a mutation that trips it
 * (PROGRESS.md's gate table, rimRms 6.81 against a point-sampled baseline of 15.09). A second
 * copy would be a second thing to get wrong, and the gate only watches one of them.
 *
 * A source string rather than a module because there is no linker for GLSL: a shader that wants
 * this interpolates it into its own source. `core/gl/context.ts` already carries the fullscreen
 * triangle the same way.
 *
 * Provides: `hash`, `cellHash`, `starDirection`, `starColour`, `meanStarRadiance`, `starField`,
 * `tangentBasis`, and the constant `TAU`.
 */
export const STAR_FIELD_GLSL = `
float hash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

// --- Star field, PHYSICS_SPEC 4.4 -------------------------------------------------------------
// Cells are EQUAL-AREA by construction: bands of equal d(cos theta) all have the same solid
// angle, so giving every band the same number of azimuthal cells makes every cell exactly
// 4*pi/(BANDS*SECTORS) steradians. The previous version hashed floor(dir * scale) on a cube
// lattice, whose cells vary several-fold in solid angle and are strongly anisotropic near the
// cube corners -- that is what made distant stars render as elongated blobs.
// SECTORS ~ pi * BANDS keeps cells roughly square at the equator.
const int   STAR_BANDS   = 110;
const int   STAR_SECTORS = 346;
const float STAR_OCCUPANCY = 0.16;       // fraction of cells holding a star
const float STAR_FLUX      = 2.4;        // flux per star, before the reconstruction kernel
const float STAR_SIGMA     = 0.5;        // reconstruction kernel width, pixels
const float TAU = 6.2831853072;

float cellHash(int band, int sector, float salt) {
  return hash(vec3(float(band) * 0.7371, float(sector) * 0.3131, salt));
}

vec3 starDirection(int band, int sector) {
  float c = (float(band) + cellHash(band, sector, 1.7)) / float(STAR_BANDS) * 2.0 - 1.0;
  float phi = ((float(sector) + cellHash(band, sector, 3.1)) / float(STAR_SECTORS) - 0.5) * TAU;
  float s = sqrt(max(0.0, 1.0 - c * c));
  return vec3(s * cos(phi), c, s * sin(phi));
}

vec3 starColour(int band, int sector) {
  // Indicative tint only: hotter stars bluer. Not a calibrated stellar colour model, and the
  // disk's colours -- which ARE calibrated -- come from the blackbody table, not from here.
  float t = cellHash(band, sector, 5.3);
  return mix(vec3(1.0, 0.78, 0.62), vec3(0.72, 0.83, 1.0), t)
       * (0.35 + 0.65 * cellHash(band, sector, 7.9));
}

/** Mean surface brightness of the field, per unit solid angle. In the limit where a pixel's
 * footprint holds many stars this is the correct filtered value, and it is what the discrete
 * sum converges to. */
vec3 meanStarRadiance() {
  // Average of the tint endpoints times the average brightness factor.
  vec3 meanTint = 0.5 * (vec3(1.0, 0.78, 0.62) + vec3(0.72, 0.83, 1.0)) * 0.675;
  float starsPerSteradian = STAR_OCCUPANCY * float(STAR_BANDS) * float(STAR_SECTORS) / (2.0 * TAU);
  return meanTint * STAR_FLUX * starsPerSteradian;
}

/** Anisotropically filtered star field.
 *
 * inverseJacobian maps a tangential direction offset to a pixel-space offset, so a star at
 * omega_s contributes K(J^+ (omega_s - omega_0)) with K normalised to unit integral in PIXEL
 * space -- which is what conserves flux as the map stretches (PHYSICS_SPEC 4.4).
 *
 * Only a 3x3 cell neighbourhood is summed. Once the footprint spans more than about one cell the
 * sum would be incomplete, so the result blends to the analytic mean above; that is the correct
 * limit, not a fudge, and it is exactly what removes the scintillation near the shadow rim where
 * the map compresses hardest.
 */
vec3 starField(vec3 dir, mat2 inverseJacobian, vec3 e1, vec3 e2, float solidAnglePerPixel) {
  float cellSolidAngle = 2.0 * TAU / (float(STAR_BANDS) * float(STAR_SECTORS));
  float cellsSpanned = solidAnglePerPixel / cellSolidAngle;

  vec3 discrete = vec3(0.0);
  int band0 = int(floor((clamp(dir.y, -1.0, 1.0) * 0.5 + 0.5) * float(STAR_BANDS)));
  float phi = atan(dir.z, dir.x);
  int sector0 = int(floor((phi / TAU + 0.5) * float(STAR_SECTORS)));
  float norm = 1.0 / (TAU * STAR_SIGMA * STAR_SIGMA);

  for (int db = -1; db <= 1; db++) {
    int band = band0 + db;
    if (band < 0 || band >= STAR_BANDS) continue;
    for (int ds = -1; ds <= 1; ds++) {
      int sector = (sector0 + ds + STAR_SECTORS) % STAR_SECTORS;
      if (cellHash(band, sector, 0.0) > STAR_OCCUPANCY) continue;
      vec3 delta = starDirection(band, sector) - dir;
      vec2 offset = inverseJacobian * vec2(dot(delta, e1), dot(delta, e2));
      discrete += starColour(band, sector) * STAR_FLUX * norm * exp(-0.5 * dot(offset, offset)
                  / (STAR_SIGMA * STAR_SIGMA));
    }
  }

  vec3 mean = meanStarRadiance() * solidAnglePerPixel;
  return mix(discrete, mean, clamp(cellsSpanned - 0.5, 0.0, 1.0));
}

void tangentBasis(vec3 d, out vec3 e1, out vec3 e2) {
  vec3 helper = abs(d.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  e1 = normalize(cross(helper, d));
  e2 = cross(d, e1);
}
`;
