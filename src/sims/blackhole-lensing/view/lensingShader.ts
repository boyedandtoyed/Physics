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

// Procedural star field sampled on the escape direction. Generated rather than textured so the
// page ships no external asset and stays inside a strict content policy.
vec3 starField(vec3 dir) {
  vec3 colour = vec3(0.0);
  for (int layer = 0; layer < 3; layer++) {
    float scale = 60.0 + 90.0 * float(layer);
    vec3 cell = floor(dir * scale);
    float present = hash(cell + float(layer) * 37.0);
    if (present > 0.972) {
      vec3 jitter = vec3(hash(cell + 1.7), hash(cell + 3.1), hash(cell + 5.3)) - 0.5;
      vec3 centre = (cell + 0.5 + jitter * 0.8) / scale;
      float d = length(normalize(centre) - dir) * scale;
      float brightness = smoothstep(1.0, 0.0, d) * (0.35 + 0.65 * hash(cell + 11.0));
      float temperature = hash(cell + 23.0);
      vec3 tint = mix(vec3(1.0, 0.78, 0.62), vec3(0.72, 0.83, 1.0), temperature);
      colour += tint * brightness;
    }
  }
  return colour;
}

// Split a [0,1] value across two 8-bit channels so the harness can read it back to ~1e-5.
vec2 encode16(float value) {
  float s = clamp(value, 0.0, 1.0) * 65535.0;
  float hi = floor(s / 256.0);
  return vec2(hi / 255.0, (s - hi * 256.0) / 255.0);
}

void main() {
  vec2 ndc = (gl_FragCoord.xy / uResolution) * 2.0 - 1.0;
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
  float axialImpact = hLength > 0.0 ? -totalImpact * (hVector.y / hLength) : 0.0;

  // --- Integrate ------------------------------------------------------------------------------
  vec3 p = uCameraPosition;
  vec3 v = velocity;
  bool captured = false;
  bool escaped = false;
  bool hitDisk = false;
  float emissionRadius = 0.0;

  for (int i = 0; i < uMaxSteps; i++) {
    float r = length(p);
    if (r <= HORIZON) { captured = true; break; }
    if (r > FAR_RADIUS && dot(p, v) > 0.0) { escaped = true; break; }

    float dl = stepLength(r);
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
        hitDisk = true;
        emissionRadius = cylindrical;
        break;
      }
    }
    p = next.p;
    v = next.v;
  }

  float g = hitDisk ? redshiftFactor(emissionRadius, axialImpact, distance) : 0.0;

  // PHYSICS_SPEC 4.3: a shifted blackbody IS a blackbody at T' = gT. The g^3 (per band) and
  // g^4 (bolometric) are ALREADY contained in that substitution -- do not apply g again.
  // Chromaticity comes from the luminance-normalised table; brightness from sigma T'^4.
  float shiftedTemperature = 0.0;
  float luminance = 0.0;
  if (hitDisk) {
    float flux = novikovThorneFlux(emissionRadius);
    float temperature = uPeakTemperature * pow(max(flux, 0.0) / uPeakFlux, 0.25);
    shiftedTemperature = g * temperature;
    float relative = shiftedTemperature / uPeakTemperature;
    luminance = uExposure * relative * relative * relative * relative;
  }

  if (uMode == ${LENSING_CAPTURE_MASK_MODE}) {
    // Capture mask: the shadow boundary with no star field to interfere with edge detection.
    fragColor = vec4(vec3(captured ? 0.0 : 1.0), 1.0);
    return;
  }

  if (uMode == ${LENSING_DISK_DIAGNOSTIC_MODE}) {
    // Emission radius and g, each as a 16-bit pair, so the harness can compare the shader
    // against the float64 model per pixel instead of eyeballing the picture.
    // A zero radius means "no disk hit"; the inner edge is at the ISCO, so it is unambiguous.
    if (!hitDisk) { fragColor = vec4(0.0); return; }
    fragColor = vec4(encode16(emissionRadius / DIAG_MAX_RADIUS), encode16(g / DIAG_MAX_G));
    return;
  }

  if (uMode == ${LENSING_DISK_LUMINANCE_MODE}) {
    // Pre-tone-map luminance and the shifted temperature, so a test can confirm the brightness
    // really scales as g^4 and not g^8. That specific double-count is the error the 4.3 audit
    // found, and an eye cannot tell the two apart.
    if (!hitDisk) { fragColor = vec4(0.0); return; }
    fragColor = vec4(encode16(luminance / DIAG_MAX_LUM),
                     encode16(shiftedTemperature / (2.0 * uPeakTemperature)));
    return;
  }

  vec3 colour = vec3(0.0);
  if (escaped) colour = starField(normalize(v));

  if (hitDisk) {
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
