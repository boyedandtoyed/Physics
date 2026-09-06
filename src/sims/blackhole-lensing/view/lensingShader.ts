/** Schwarzschild null-geodesic raymarcher with a Novikov-Thorne accretion disk, GLSL ES 3.00.
 *
 * This is the float32 GPU mirror of `model/rayTracer.ts` and `model/camera.ts`. The two must stay
 * in step: the CPU versions prove the algorithm reproduces b_crit, the deflection series and the
 * disk's g factor, and the acceptance harness compares them per pixel. If you change stepping,
 * the force law or the launch conversion here, change it there.
 *
 * Units are r_s = 1 (PHYSICS_SPEC §6.5): the horizon is r = 1 and capture is r <= 1. Working in
 * these units is also what keeps float32 usable — §4.6. Nothing here differences two nearly
 * equal large numbers.
 *
 * The disk lies in y = 0 and orbits about +y. **Physical mode is the default**: the one-sided
 * crescent is correct output, not a bug (§4.3, CLAUDE.md).
 */

export const LENSING_STARS_MODE = 0;
export const LENSING_CAPTURE_MASK_MODE = 1;
export const LENSING_DISK_DIAGNOSTIC_MODE = 2;
export const LENSING_DISK_LUMINANCE_MODE = 3;

/** Diagnostic encoding ranges. The harness decodes with these, so they are exported, not magic. */
export const DIAGNOSTIC_MAX_RADIUS = 16;
export const DIAGNOSTIC_MAX_G = 4;
/** Pre-tone-map luminance readback range. Wide enough for the blueshifted side at full exposure. */
export const DIAGNOSTIC_MAX_LUMINANCE = 64;

export const LENSING_FRAGMENT_SHADER = `#version 300 es
precision highp float;

out vec4 fragColor;

uniform vec2  uResolution;
uniform vec3  uCameraPosition;
uniform vec3  uCameraRight;
uniform vec3  uCameraUp;
uniform vec3  uCameraForward;
uniform float uTanHalfFov;
uniform int   uMaxSteps;
uniform int   uMode;
uniform float uDiskInner;
uniform float uDiskOuter;
uniform float uPeakFlux;
uniform float uPeakTemperature;
uniform float uExposure;
uniform bool  uDiskEnabled;
uniform sampler2D uColourTable;
uniform float uLutMinTemperature;
uniform float uLutMaxTemperature;
/** Sub-pixel sample offset, in pixels. Zero-mean over an accumulation sequence (PHYSICS_SPEC
 * 4.5), and the lever the temporal-stability metric uses: correct filtering makes a pixel the
 * average over its footprint, so jittering inside one pixel must barely change it. */
uniform vec2  uJitter;
/** 0 = physical (default). 1 = cinematic: the Doppler term is removed and only the gravitational
 * shift remains, which is what DNGR did for the film to get a symmetric disk. Non-physical, and
 * the UI must say so. Diagnostic modes force this to 0 so the gates always see physical output. */
uniform float uCinematic;

const float HORIZON        = 1.0;
const float MASS           = 0.5;          // r_s = 2M
const float FORCE_COEFF    = 1.5;          // 3M, PHYSICS_SPEC 2.3
const float STEP_SCALE     = 0.16;
const float PHOTON_U       = 0.6666666667; // r_s / r_photon = 1 / 1.5
const float NARROW_DEPTH   = 0.7;
const float NARROW_WIDTH   = 12.0;
const float FAR_RADIUS     = 4000.0;
const float TANGENT_EPS    = 1e-7;
const float SQRT3          = 1.7320508076;
const float SQRT6          = 2.4494897428;
const int   CROSSING_REFINEMENTS = 3;
/** Below this height the step is capped so a ray cannot straddle the disk plane inside one step.
 * Without it a grazing ray steps over the plane and back, the sign-change test never fires, and
 * the disk's outer edge renders scalloped. */
const float DISK_APPROACH_HEIGHT = 3.0;
const float DISK_APPROACH_FRACTION = 0.5;
const float DISK_MIN_STEP = 0.02;
const float DIAG_MAX_RADIUS = ${DIAGNOSTIC_MAX_RADIUS}.0;
const float DIAG_MAX_G      = ${DIAGNOSTIC_MAX_G}.0;
const float DIAG_MAX_LUM    = ${DIAGNOSTIC_MAX_LUMINANCE}.0;

// rdd = -3M h^2 * r_vec / r^5, equivalently -3M h^2 rhat / r^4.
// NOTE: the unit-vector-over-r^5 form is wrong and yields a shadow 33% too small.
vec3 acceleration(vec3 p, float hSquared) {
  float r2 = dot(p, p);
  float inv = inversesqrt(r2);
  float invR5 = inv * inv * inv * inv * inv;
  return (-FORCE_COEFF * hSquared * invR5) * p;
}

// PHYSICS_SPEC 4.2. The spec states dphi = C/(1 + K u) for the u-phi formulation; the Cartesian
// analogue carries a leading r so the far field does not cost unbounded steps.
float stepLength(float r) {
  float u = HORIZON / r;
  float base = STEP_SCALE * r / (1.0 + u);
  float d = u - PHOTON_U;
  return base * (1.0 - NARROW_DEPTH * exp(-NARROW_WIDTH * d * d));
}

struct State { vec3 p; vec3 v; };

// RK4 in Nystrom form, out of place so a step can be retried at a shorter length.
State rk4Step(vec3 p, vec3 v, float dl, float h2) {
  vec3 k1 = acceleration(p, h2);
  vec3 k2 = acceleration(p + (0.5 * dl) * v, h2);
  vec3 k3 = acceleration(p + (0.5 * dl) * (v + (0.5 * dl) * k1), h2);
  vec3 k4 = acceleration(p + dl * (v + (0.5 * dl) * k2), h2);
  State s;
  s.p = p + dl * (v + dl * (k1 + k2 + k3) / 6.0);
  s.v = v + dl * (k1 + 2.0 * k2 + 2.0 * k3 + k4) / 6.0;
  return s;
}

// --- Novikov-Thorne, PHYSICS_SPEC 4.3 ---------------------------------------------------------
// Published in M = 1 units, so the radius is doubled on the way in. This is NOT the Newtonian
// Shakura-Sunyaev [1 - sqrt(r_in/r)] profile, which over-radiates by 43%.
float ntAntiderivative(float x) {
  return x - (SQRT3 * 0.5) * log((x - SQRT3) / (x + SQRT3));
}

float novikovThorneFlux(float radius) {
  if (radius <= uDiskInner) return 0.0;
  float r = 2.0 * radius;                        // r/M
  float integral = ntAntiderivative(sqrt(r)) - ntAntiderivative(SQRT6);
  return 1.5 / (r * r * sqrt(r) * (r - 3.0)) * integral;
}

// g = sqrt(1 - 3M/r_em) / [(1 - Omega b_phi) sqrt(1 - r_s/r_obs)], PHYSICS_SPEC 4.3.
float redshiftFactor(float emissionRadius, float axialImpact, float observerRadius) {
  float omega = sqrt(MASS / (emissionRadius * emissionRadius * emissionRadius));
  float denominator = 1.0 - omega * axialImpact;
  if (denominator <= 0.0) return 0.0;
  return sqrt(1.0 - 3.0 * MASS / emissionRadius)
       / (denominator * sqrt(1.0 - HORIZON / observerRadius));
}

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

// Split a [0,1] value across two 8-bit channels so the harness can read it back to ~1e-5.
vec2 encode16(float value) {
  float s = clamp(value, 0.0, 1.0) * 65535.0;
  float hi = floor(s / 256.0);
  return vec2(hi / 255.0, (s - hi * 256.0) / 255.0);
}

struct Trace {
  bool captured;
  bool escaped;
  bool hitDisk;
  float emissionRadius;
  float axialImpact;
  vec3 escapeDirection;
};

Trace traceRay(vec2 ndc) {
  Trace result;
  result.captured = false;
  result.escaped = false;
  result.hitDisk = false;
  result.emissionRadius = 0.0;
  result.axialImpact = 0.0;
  result.escapeDirection = vec3(0.0, 0.0, 1.0);

  float aspect = uResolution.x / uResolution.y;
  vec3 viewDir = normalize(
      uCameraForward
    + uCameraRight * (ndc.x * uTanHalfFov * aspect)
    + uCameraUp    * (ndc.y * uTanHalfFov));

  // --- Launch conditions, PHYSICS_SPEC 2.2/2.3 -----------------------------------------------
  // The camera is a static observer, so the pixel direction is a direction in its *local
  // orthonormal frame*. Two conversions are needed, and skipping either moves the shadow edge:
  //   b = D sin(theta) / sqrt(1 - r_s/D)     the static-observer factor  (2.5% at D = 20)
  //   1/h^2 = 1/b^2 + 2M/D^3                 flat-system h is not b      (0.042% at D = 20)
  float distance = length(uCameraPosition);
  vec3 radial = uCameraPosition / distance;
  float cosTheta = dot(viewDir, radial);
  float sinTheta = sqrt(max(0.0, 1.0 - cosTheta * cosTheta));

  vec3 tangentRaw = viewDir - cosTheta * radial;
  float tangentLen = length(tangentRaw);
  vec3 tangent = tangentLen > TANGENT_EPS ? tangentRaw / tangentLen : vec3(0.0);

  float impact = distance * sinTheta * inversesqrt(1.0 - HORIZON / distance);
  float hSquared = 0.0;
  float totalImpact = 0.0;
  vec3 velocity = radial * (cosTheta >= 0.0 ? 1.0 : -1.0);
  if (impact > 0.0) {
    float h = inversesqrt(1.0 / (impact * impact) + 2.0 * MASS / (distance * distance * distance));
    float sinFlat = min(1.0, h / distance);
    float cosFlat = sqrt(max(0.0, 1.0 - sinFlat * sinFlat)) * (cosTheta >= 0.0 ? 1.0 : -1.0);
    velocity = radial * cosFlat + tangent * sinFlat;
    hSquared = h * h;
    totalImpact = impact;
  }

  vec3 hVector = cross(uCameraPosition, velocity);
  float hLength = length(hVector);
  // We trace backwards, so the physical photon's L_z is the negative of the traced one.
  result.axialImpact = hLength > 0.0 ? -totalImpact * (hVector.y / hLength) : 0.0;

  vec3 p = uCameraPosition;
  vec3 v = velocity;

  for (int i = 0; i < uMaxSteps; i++) {
    float r = length(p);
    if (r <= HORIZON) { result.captured = true; return result; }
    if (r > FAR_RADIUS && dot(p, v) > 0.0) {
      result.escaped = true;
      result.escapeDirection = normalize(v);
      return result;
    }

    float dl = stepLength(r);
    if (uDiskEnabled && abs(p.y) < DISK_APPROACH_HEIGHT && abs(v.y) > 0.0) {
      dl = min(dl, max(DISK_MIN_STEP, DISK_APPROACH_FRACTION * abs(p.y) / abs(v.y)));
    }
    State next = rk4Step(p, v, dl, hSquared);

    if (uDiskEnabled && p.y != 0.0 && sign(next.p.y) != sign(p.y)) {
      // Land on y = 0 by secant iteration, then test the annulus. Linear interpolation across a
      // whole step would misplace the emission radius by far more than the harness tolerates.
      float lo = 0.0;
      float hi = dl;
      State landing = next;
      for (int k = 0; k < CROSSING_REFINEMENTS; k++) {
        float guess = lo + (hi - lo) * (abs(p.y) / (abs(p.y) + abs(landing.p.y)));
        landing = rk4Step(p, v, guess, hSquared);
        if (sign(landing.p.y) == sign(p.y)) { lo = guess; } else { hi = guess; }
      }
      float cylindrical = length(landing.p.xz);
      if (cylindrical >= uDiskInner && cylindrical <= uDiskOuter) {
        result.hitDisk = true;
        result.emissionRadius = cylindrical;
        return result;
      }
    }
    p = next.p;
    v = next.v;
  }
  return result;
}

void main() {
  vec2 pixel = gl_FragCoord.xy + uJitter;
  vec2 ndcScale = 2.0 / uResolution;
  vec2 ndc = pixel * ndcScale - 1.0;

  Trace centre = traceRay(ndc);

  float g = 0.0;
  if (centre.hitDisk) {
    float observer = length(uCameraPosition);
    float physical = redshiftFactor(centre.emissionRadius, centre.axialImpact, observer);
    // b_phi = 0 is the same emitter with no line-of-sight motion: gravitational shift and
    // transverse Doppler only. Mixing towards it is exactly "soften the beaming".
    float withoutDoppler = redshiftFactor(centre.emissionRadius, 0.0, observer);
    g = mix(physical, withoutDoppler, uMode == ${LENSING_STARS_MODE} ? uCinematic : 0.0);
  }

  // PHYSICS_SPEC 4.3: a shifted blackbody IS a blackbody at T' = gT. The g^3 (per band) and
  // g^4 (bolometric) are ALREADY contained in that substitution -- do not apply g again.
  // Chromaticity comes from the luminance-normalised table; brightness from sigma T'^4.
  float shiftedTemperature = 0.0;
  float luminance = 0.0;
  if (centre.hitDisk) {
    float flux = novikovThorneFlux(centre.emissionRadius);
    float temperature = uPeakTemperature * pow(max(flux, 0.0) / uPeakFlux, 0.25);
    shiftedTemperature = g * temperature;
    float relative = shiftedTemperature / uPeakTemperature;
    luminance = uExposure * relative * relative * relative * relative;
  }

  if (uMode == ${LENSING_CAPTURE_MASK_MODE}) {
    fragColor = vec4(vec3(centre.captured ? 0.0 : 1.0), 1.0);
    return;
  }

  if (uMode == ${LENSING_DISK_DIAGNOSTIC_MODE}) {
    if (!centre.hitDisk) { fragColor = vec4(0.0); return; }
    fragColor = vec4(encode16(centre.emissionRadius / DIAG_MAX_RADIUS), encode16(g / DIAG_MAX_G));
    return;
  }

  if (uMode == ${LENSING_DISK_LUMINANCE_MODE}) {
    if (!centre.hitDisk) { fragColor = vec4(0.0); return; }
    fragColor = vec4(encode16(luminance / DIAG_MAX_LUM),
                     encode16(shiftedTemperature / (2.0 * uPeakTemperature)));
    return;
  }

  vec3 colour = vec3(0.0);

  if (centre.escaped) {
    // --- Screen-space Jacobian, PHYSICS_SPEC 4.4 ---------------------------------------------
    // Traced explicitly, NOT via dFdx/dFdy: the loop above breaks at a different iteration per
    // pixel, and GLSL ES 3.00 section 8.9 leaves implicit derivatives undefined under
    // non-uniform control flow. Only escaped pixels pay for the two extra rays.
    // A forward neighbour may be captured or hit the disk near a silhouette. Falling back to a
    // constant there made the estimate flip as the jitter moved the edge across the neighbour,
    // which showed up as the worst pixels getting *worse*. Take the backward difference instead:
    // both directions failing means an isolated escaped pixel, which does not occur in practice.
    Trace forwardX = traceRay(ndc + vec2(ndcScale.x, 0.0));
    vec3 dx;
    bool haveX = true;
    if (forwardX.escaped) {
      dx = forwardX.escapeDirection - centre.escapeDirection;
    } else {
      Trace backwardX = traceRay(ndc - vec2(ndcScale.x, 0.0));
      haveX = backwardX.escaped;
      dx = centre.escapeDirection - backwardX.escapeDirection;
    }

    Trace forwardY = traceRay(ndc + vec2(0.0, ndcScale.y));
    vec3 dy;
    bool haveY = true;
    if (forwardY.escaped) {
      dy = forwardY.escapeDirection - centre.escapeDirection;
    } else {
      Trace backwardY = traceRay(ndc - vec2(0.0, ndcScale.y));
      haveY = backwardY.escaped;
      dy = centre.escapeDirection - backwardY.escapeDirection;
    }

    vec3 e1, e2;
    tangentBasis(centre.escapeDirection, e1, e2);

    if (haveX && haveY) {
      mat2 jacobian = mat2(vec2(dot(dx, e1), dot(dx, e2)), vec2(dot(dy, e1), dot(dy, e2)));
      float det = determinant(jacobian);
      // A near-singular Jacobian means the map has collapsed one axis; the many-star limit with
      // the larger axis as the footprint scale is the stable answer.
      float area = abs(det) > 1e-20 ? abs(det) : max(dot(dx, dx), dot(dy, dy));
      colour = abs(det) > 1e-20
        ? starField(centre.escapeDirection, inverse(jacobian), e1, e2, area)
        : meanStarRadiance() * area;
    } else {
      colour = meanStarRadiance() * max(dot(dx, dx), dot(dy, dy));
    }
  }

  if (centre.hitDisk) {
    float lut = clamp(
      (shiftedTemperature - uLutMinTemperature) / (uLutMaxTemperature - uLutMinTemperature),
      0.0, 1.0);
    colour = texture(uColourTable, vec2(lut, 0.5)).rgb * luminance;
  }

  // Reinhard tone map. Display-only: it is applied after all physical arithmetic, never before.
  colour = colour / (1.0 + colour);
  fragColor = vec4(colour, 1.0);
}
`;
