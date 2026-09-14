/** Kerr null-geodesic raymarcher in Cartesian Kerr–Schild coordinates, GLSL ES 3.00.
 *
 * This is the float32 GPU mirror of `core/kerrSchild.ts`. The two must stay in step: the float64
 * version is the one whose shadow is compared against Bardeen's analytic curve, and the
 * acceptance harness measures the shadow off a GPU frame and compares it against the same curve.
 * If you change the metric functions, the stepping or the launch here, change them there.
 *
 * Units are **M = 1** (PHYSICS_SPEC §6.5, the core convention rather than the shader one — the
 * Schwarzschild raymarcher works in r_s = 1 because its force law is written that way; Kerr's
 * a/M is dimensionless and every published Kerr formula is in M). The spin axis is **+z** and
 * the ring lies in z = 0.
 *
 * float32 (§4.6): the metric functions are written in terms of q = a²z²/r⁴ rather than
 * D = r⁴ + a²z². The literal Bardeen–Kerr–Schild gradients carry D³, which is r¹² at a = 0 —
 * 10³⁸ at the escape radius, and float32 overflows there. Nothing below exceeds r⁵.
 */
import { STAR_FIELD_GLSL } from '../../../core/gl/starFieldGlsl';

export const KERR_STARS_MODE = 0;
export const KERR_CAPTURE_MASK_MODE = 1;
export const KERR_HAMILTONIAN_MODE = 2;

/** Diagnostic encoding range for the Hamiltonian drift readback, in units of E². */
export const DIAGNOSTIC_MAX_DRIFT = 1e-2;

export const KERR_FRAGMENT_SHADER = `#version 300 es
precision highp float;

out vec4 fragColor;

uniform vec2  uResolution;
uniform vec3  uCameraPosition;
uniform vec3  uCameraRight;
uniform vec3  uCameraUp;
uniform vec3  uCameraForward;
uniform float uTanHalfFov;
uniform float uSpin;
uniform int   uMaxSteps;
uniform int   uMode;
uniform bool  uRingEnabled;
uniform float uRingInner;
uniform float uRingOuter;
uniform float uExposure;
uniform vec2  uJitter;
/** 0 = physical (default). 1 removes the Doppler term and leaves only the gravitational shift,
 *  which is what DNGR did for the film. Non-physical, and the UI says so. */
uniform float uCinematic;

const float FAR_RADIUS   = 1500.0;
const float STEP_FRACTION = 0.045;
const float MAX_STEP      = 12.0;
const float RING_APPROACH_HEIGHT = 3.0;
const float RING_APPROACH_FRACTION = 0.5;
const float RING_MIN_STEP = 0.01;
const int   CROSSING_REFINEMENTS = 4;
/** Capture just inside the horizon. Kerr–Schild is regular there, so this is a stopping rule
 *  and not a coordinate cliff — nothing in the integration blows up at r+. */
const float CAPTURE_FACTOR = 0.98;
const float DIAG_MAX_DRIFT = ${DIAGNOSTIC_MAX_DRIFT};

${STAR_FIELD_GLSL}

// --- Cartesian Kerr-Schild, PHYSICS_SPEC 3.4a -------------------------------------------------

// r is the positive root of r^4 - (R^2 - a^2) r^2 - a^2 z^2 = 0. The stable branch matters: the
// other one differences two nearly equal numbers far out, which loses the z dependence entirely
// and flattens the oblate spheroid into a sphere -- Kerr silently becoming Schwarzschild.
float ksRadius(vec3 p, float a) {
  float base = dot(p, p) - a * a;
  float disc = sqrt(base * base + 4.0 * a * a * p.z * p.z);
  float r2 = base >= 0.0 ? 0.5 * (base + disc) : (2.0 * a * a * p.z * p.z) / (disc - base);
  return sqrt(max(r2, 0.0));
}

struct Metric {
  float r;
  float h;
  vec3 k;
  vec3 gradH;
  mat3 gradK;   // row i is d_i k
};

Metric sampleMetric(vec3 p, float a) {
  Metric m;
  float r = ksRadius(p, a);
  float r2 = r * r;
  float r3 = r2 * r;
  float s = r2 + a * a;
  float q = (a * a * p.z * p.z) / (r2 * r2);
  float oq = 1.0 + q;

  m.r = r;
  m.h = 1.0 / (r * oq);

  vec3 dr = vec3(p.x / (r * oq), p.y / (r * oq), (p.z * s) / (r3 * oq));

  float t = 3.0 * q - 1.0;
  m.gradH = vec3(
    (p.x * t) / (r3 * oq * oq * oq),
    (p.y * t) / (r3 * oq * oq * oq),
    (p.z * ((t * s) / oq - 2.0 * a * a)) / (r2 * r3 * oq * oq));

  m.k = vec3((r * p.x + a * p.y) / s, (r * p.y - a * p.x) / s, p.z / r);

  // d_i k_x = [(x d_i r + r delta_ix + a delta_iy) S - (rx+ay)(2r d_i r)] / S^2, etc.
  for (int i = 0; i < 3; i++) {
    float d = dr[i];
    float ex = i == 0 ? 1.0 : 0.0;
    float ey = i == 1 ? 1.0 : 0.0;
    float ez = i == 2 ? 1.0 : 0.0;
    m.gradK[i] = vec3(
      ((p.x * d + r * ex + a * ey) * s - (r * p.x + a * p.y) * (2.0 * r * d)) / (s * s),
      ((p.y * d + r * ey - a * ex) * s - (r * p.y - a * p.x) * (2.0 * r * d)) / (s * s),
      (ez * r - p.z * d) / r2);
  }
  return m;
}

// H_geo = 1/2(-p_t^2 + p.p) - H kappa^2, with kappa = -p_t + k.p. Zero for a photon, and its
// departure from zero is the integration's own error telemetry (PHYSICS_SPEC 3.4).
float hamiltonianOf(vec3 p, vec3 mom, float pt, float a) {
  Metric m = sampleMetric(p, a);
  float kappa = -pt + dot(m.k, mom);
  return 0.5 * (-pt * pt + dot(mom, mom)) - m.h * kappa * kappa;
}

struct Rates { vec3 dp; vec3 dm; };

// xdot^i = p_i - 2 H kappa k^i ;  pdot_i = (d_i H) kappa^2 + 2 H kappa (d_i k_j) p_j
// pdot_t is identically zero: the metric is static, so E is conserved by construction.
Rates geodesicRates(vec3 p, vec3 mom, float pt, float a) {
  Metric m = sampleMetric(p, a);
  float kappa = -pt + dot(m.k, mom);
  float f = 2.0 * m.h * kappa;
  // NOT named "out": that is a reserved word in GLSL and the driver rejects it as a variable.
  Rates rates;
  rates.dp = mom - f * m.k;
  rates.dm = m.gradH * (kappa * kappa)
           + f * vec3(dot(m.gradK[0], mom), dot(m.gradK[1], mom), dot(m.gradK[2], mom));
  return rates;
}

struct State { vec3 p; vec3 m; };

State rk4Step(vec3 p, vec3 mom, float pt, float a, float dl) {
  Rates k1 = geodesicRates(p, mom, pt, a);
  Rates k2 = geodesicRates(p + (0.5 * dl) * k1.dp, mom + (0.5 * dl) * k1.dm, pt, a);
  Rates k3 = geodesicRates(p + (0.5 * dl) * k2.dp, mom + (0.5 * dl) * k2.dm, pt, a);
  Rates k4 = geodesicRates(p + dl * k3.dp, mom + dl * k3.dm, pt, a);
  State s;
  s.p = p + dl * (k1.dp + 2.0 * k2.dp + 2.0 * k3.dp + k4.dp) / 6.0;
  s.m = mom + dl * (k1.dm + 2.0 * k2.dm + 2.0 * k3.dm + k4.dm) / 6.0;
  return s;
}

float horizonRadius(float a) { return 1.0 + sqrt(max(1.0 - a * a, 0.0)); }

float stepLength(float r, float a) {
  float rp = horizonRadius(a);
  return min(MAX_STEP, max(STEP_FRACTION * abs(r - rp), STEP_FRACTION * rp / 6.0));
}

// --- the emitting ring, PHYSICS_SPEC 4.3a -----------------------------------------------------
// Prograde equatorial circular orbit, BPT 1972. u^t diverges at the prograde photon orbit, which
// is the formula's own statement that no circular emitter exists inside it.
float orbitOmega(float r, float a) { return 1.0 / (pow(r, 1.5) + a); }

float orbitUt(float r, float a) {
  float inner = pow(r, 1.5) - 3.0 * sqrt(r) + 2.0 * a;
  if (inner <= 0.0) return 0.0;
  return (pow(r, 1.5) + a) / (pow(r, 0.75) * sqrt(inner));
}

float redshiftFactor(float rEmit, float xi, float rObs, float a) {
  float ut = orbitUt(rEmit, a);
  if (ut <= 0.0) return 0.0;
  float denominator = 1.0 - orbitOmega(rEmit, a) * xi;
  if (denominator <= 0.0) return 0.0;
  return (1.0 / sqrt(max(1.0 - 2.0 / rObs, 1e-6))) / (ut * denominator);
}

vec2 encode16(float value) {
  float s = clamp(value, 0.0, 1.0) * 65535.0;
  float hi = floor(s / 256.0);
  return vec2(hi / 255.0, (s - hi * 256.0) / 255.0);
}

struct Trace {
  bool captured;
  bool escaped;
  bool hitRing;
  float emissionRadius;
  float xi;
  float drift;
  vec3 escapeDirection;
};

Trace traceRay(vec2 ndc) {
  Trace result;
  result.captured = false;
  result.escaped = false;
  result.hitRing = false;
  result.emissionRadius = 0.0;
  result.xi = 0.0;
  result.drift = 0.0;
  result.escapeDirection = vec3(0.0, 0.0, 1.0);

  float a = uSpin;
  float aspect = uResolution.x / uResolution.y;
  vec3 viewDir = normalize(
      uCameraForward
    + uCameraRight * (ndc.x * uTanHalfFov * aspect)
    + uCameraUp    * (ndc.y * uTanHalfFov));

  // --- Launch, PHYSICS_SPEC 3.4a --------------------------------------------------------------
  // p_t = -1, so E = -p_t = +1 and the ray is FUTURE-DIRECTED, fired inward from the camera.
  // That is the standard raymarcher construction and it is the numerically clean one here --
  // ingoing Kerr-Schild is regular on the future horizon, not the past one. It substitutes
  // t -> -t alone, and Kerr's isometry is t -> -t TOGETHER WITH phi -> -phi, so the traced scene
  // is the phi-reflection of the real one. The reflection is undone once, at the camera, by the
  // left-handed image basis in view/camera.ts. See core/kerrSchild.ts launchPhoton.
  //
  // The spatial momentum's SCALE is solved from H_geo = 0 rather than assumed, so the ray is
  // null in the actual metric at the camera rather than in the flat approximation to it.
  vec3 p = uCameraPosition;
  Metric m0 = sampleMetric(p, a);
  float kn = dot(m0.k, viewDir);
  float qa = 0.5 - m0.h * kn * kn;
  float qb = -2.0 * m0.h * kn;
  float qc = -(0.5 + m0.h);
  float scale;
  if (abs(qa) < 1e-12) {
    scale = -qc / qb;
  } else {
    float root = sqrt(max(qb * qb - 4.0 * qa * qc, 0.0));
    float first = (-qb + root) / (2.0 * qa);
    float second = (-qb - root) / (2.0 * qa);
    scale = first > 0.0 ? first : second;
  }
  vec3 mom = scale * viewDir;
  float pt = -1.0;

  // xi = L_z / E, with E = -p_t = +1. Bardeen's alpha is -xi.
  result.xi = p.x * mom.y - p.y * mom.x;

  float captureRadius = horizonRadius(a) * CAPTURE_FACTOR;

  for (int i = 0; i < uMaxSteps; i++) {
    float r = ksRadius(p, a);
    if (r <= captureRadius) { result.captured = true; return result; }
    if (r > FAR_RADIUS && dot(p, mom) > 0.0) {
      result.escaped = true;
      result.escapeDirection = normalize(mom);
      return result;
    }

    float dl = stepLength(r, a);
    if (uRingEnabled && abs(p.z) < RING_APPROACH_HEIGHT && abs(mom.z) > 0.0) {
      dl = min(dl, max(RING_MIN_STEP, RING_APPROACH_FRACTION * abs(p.z) / abs(mom.z)));
    }
    State next = rk4Step(p, mom, pt, a, dl);

    if (uRingEnabled && p.z != 0.0 && sign(next.p.z) != sign(p.z)) {
      float lo = 0.0;
      float hi = dl;
      State landing = next;
      for (int k = 0; k < CROSSING_REFINEMENTS; k++) {
        float guess = lo + (hi - lo) * (abs(p.z) / (abs(p.z) + abs(landing.p.z)));
        landing = rk4Step(p, mom, pt, a, guess);
        if (sign(landing.p.z) == sign(p.z)) { lo = guess; } else { hi = guess; }
      }
      float cylindrical = ksRadius(landing.p, a);
      if (cylindrical >= uRingInner && cylindrical <= uRingOuter) {
        result.hitRing = true;
        result.emissionRadius = cylindrical;
        return result;
      }
    }
    p = next.p;
    mom = next.m;
    result.drift = max(result.drift, abs(hamiltonianOf(p, mom, pt, a)));
  }
  return result;
}

void main() {
  vec2 pixel = gl_FragCoord.xy + uJitter;
  vec2 ndcScale = 2.0 / uResolution;
  vec2 ndc = pixel * ndcScale - 1.0;

  Trace centre = traceRay(ndc);

  if (uMode == ${KERR_CAPTURE_MASK_MODE}) {
    fragColor = vec4(vec3(centre.captured ? 0.0 : 1.0), 1.0);
    return;
  }
  if (uMode == ${KERR_HAMILTONIAN_MODE}) {
    fragColor = vec4(encode16(centre.drift / DIAG_MAX_DRIFT), 0.0, 1.0);
    return;
  }

  vec3 colour = vec3(0.0);

  if (centre.escaped) {
    // Screen-space Jacobian, traced explicitly rather than via dFdx/dFdy: the loop breaks at a
    // different iteration per pixel and GLSL ES 3.00 8.9 leaves implicit derivatives undefined
    // under non-uniform control flow (PHYSICS_SPEC 4.4).
    Trace forwardX = traceRay(ndc + vec2(ndcScale.x, 0.0));
    vec3 dx; bool haveX = true;
    if (forwardX.escaped) { dx = forwardX.escapeDirection - centre.escapeDirection; }
    else {
      Trace backwardX = traceRay(ndc - vec2(ndcScale.x, 0.0));
      haveX = backwardX.escaped;
      dx = centre.escapeDirection - backwardX.escapeDirection;
    }
    Trace forwardY = traceRay(ndc + vec2(0.0, ndcScale.y));
    vec3 dy; bool haveY = true;
    if (forwardY.escaped) { dy = forwardY.escapeDirection - centre.escapeDirection; }
    else {
      Trace backwardY = traceRay(ndc - vec2(0.0, ndcScale.y));
      haveY = backwardY.escaped;
      dy = centre.escapeDirection - backwardY.escapeDirection;
    }

    vec3 e1, e2;
    tangentBasis(centre.escapeDirection, e1, e2);
    if (haveX && haveY) {
      mat2 jacobian = mat2(vec2(dot(dx, e1), dot(dx, e2)), vec2(dot(dy, e1), dot(dy, e2)));
      float det = determinant(jacobian);
      float area = abs(det) > 1e-20 ? abs(det) : max(dot(dx, dx), dot(dy, dy));
      colour = abs(det) > 1e-20
        ? starField(centre.escapeDirection, inverse(jacobian), e1, e2, area)
        : meanStarRadiance() * area;
    } else {
      colour = meanStarRadiance() * max(dot(dx, dx), dot(dy, dy));
    }
  }

  if (centre.hitRing) {
    float observer = ksRadius(uCameraPosition, uSpin);
    float physical = redshiftFactor(centre.emissionRadius, centre.xi, observer, uSpin);
    // xi = 0 is the same emitter with no line-of-sight motion: gravitational and transverse
    // shift only. Mixing towards it is exactly "soften the beaming", and it is not physical.
    float withoutDoppler = redshiftFactor(centre.emissionRadius, 0.0, observer, uSpin);
    float g = mix(physical, withoutDoppler, uCinematic);
    // Uniform emissivity: the RING'S BRIGHTNESS PROFILE IS NOT PHYSICAL and the UI says so.
    // What is physical is g and the g^4 bolometric beaming (PHYSICS_SPEC 4.3a) -- applying g
    // again would scale brightness as g^8.
    float luminance = uExposure * g * g * g * g;
    // Indicative tint, warm to blue with the shift. Not a calibrated blackbody: there is no
    // temperature profile to shift, because the emissivity is uniform by construction.
    vec3 tint = mix(vec3(1.0, 0.55, 0.22), vec3(0.72, 0.86, 1.0), clamp((g - 0.5) / 1.0, 0.0, 1.0));
    colour = tint * luminance;
  }

  // Reinhard tone map. Display-only: applied after all physical arithmetic, never before.
  colour = colour / (1.0 + colour);
  fragColor = vec4(colour, 1.0);
}
`;
