/** Schwarzschild null-geodesic raymarcher, GLSL ES 3.00.
 *
 * This is the float32 GPU mirror of `model/rayTracer.ts`. The two must stay in step: the CPU
 * version is what proves the algorithm reproduces b_crit and the deflection series, and the
 * acceptance test measures the shadow off *this* shader's output. If you change stepping or the
 * force law here, change it there.
 *
 * Units are r_s = 1 (PHYSICS_SPEC §6.5): the horizon is r = 1 and capture is r <= 1. Working in
 * these units is also what keeps float32 usable — §4.6. Nothing here differences two nearly
 * equal large numbers.
 */

export const LENSING_STARS_MODE = 0;
export const LENSING_CAPTURE_MASK_MODE = 1;

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

const float HORIZON        = 1.0;
const float MASS           = 0.5;          // r_s = 2M
const float FORCE_COEFF    = 1.5;          // 3M, PHYSICS_SPEC 2.3
const float STEP_SCALE     = 0.16;
const float PHOTON_U       = 0.6666666667; // r_s / r_photon = 1 / 1.5
const float NARROW_DEPTH   = 0.7;
const float NARROW_WIDTH   = 12.0;
const float FAR_RADIUS     = 4000.0;
const float TANGENT_EPS    = 1e-7;

// rdd = -3M h^2 * r_vec / r^5, equivalently -3M h^2 rhat / r^4.
// NOTE: the unit-vector-over-r^5 form is wrong and yields a shadow 33% too small.
vec3 acceleration(vec3 p, float hSquared) {
  float r2 = dot(p, p);
  float inv = inversesqrt(r2);          // 1/r
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
      // Loose blackbody-ish tint: hotter stars bluer. Indicative only, not a calibrated colour.
      float temperature = hash(cell + 23.0);
      vec3 tint = mix(vec3(1.0, 0.78, 0.62), vec3(0.72, 0.83, 1.0), temperature);
      colour += tint * brightness;
    }
  }
  return colour;
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
  vec3 velocity = radial * (cosTheta >= 0.0 ? 1.0 : -1.0);
  if (impact > 0.0) {
    float h = inversesqrt(1.0 / (impact * impact) + 2.0 * MASS / (distance * distance * distance));
    float sinFlat = min(1.0, h / distance);
    float cosFlat = sqrt(max(0.0, 1.0 - sinFlat * sinFlat)) * (cosTheta >= 0.0 ? 1.0 : -1.0);
    velocity = radial * cosFlat + tangent * sinFlat;
    hSquared = h * h;    // |r x v|^2 = (D sinFlat)^2 = h^2
  }

  // --- Integrate, RK4 in Nystrom form ---------------------------------------------------------
  vec3 p = uCameraPosition;
  vec3 v = velocity;
  bool captured = false;
  bool escaped = false;

  for (int i = 0; i < uMaxSteps; i++) {
    float r = length(p);
    if (r <= HORIZON) { captured = true; break; }
    if (r > FAR_RADIUS && dot(p, v) > 0.0) { escaped = true; break; }

    float dl = stepLength(r);
    vec3 k1 = acceleration(p, hSquared);
    vec3 k2 = acceleration(p + (0.5 * dl) * v, hSquared);
    vec3 k3 = acceleration(p + (0.5 * dl) * (v + (0.5 * dl) * k1), hSquared);
    vec3 k4 = acceleration(p + dl * (v + (0.5 * dl) * k2), hSquared);
    p += dl * (v + dl * (k1 + k2 + k3) / 6.0);
    v += dl * (k1 + 2.0 * k2 + 2.0 * k3 + k4) / 6.0;
  }

  if (uMode == 1) {
    // Capture mask: the shadow boundary with no star field to interfere with edge detection.
    // Same integration, different final colour -- this is a diagnostic view, not a separate path.
    fragColor = vec4(vec3(captured ? 0.0 : 1.0), 1.0);
    return;
  }

  vec3 colour = vec3(0.0);
  if (escaped) colour = starField(normalize(v));
  // A ray that neither escaped nor was captured ran out of steps; leaving it black is honest,
  // and the step budget is exposed as a quality control.
  fragColor = vec4(colour, 1.0);
}
`;
