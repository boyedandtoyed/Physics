#!/usr/bin/env python3
"""Mutation-test the deflection-decomposition tests (PHYSICS_SPEC 7.4 Claim A).

For each physical claim in src/core/deflection.ts, re-introduce a plausible wrong version of
that claim, run the test file, and require that it FAILS. A mutation that survives means the
claim is asserted by nothing.
"""
import json, pathlib, subprocess, sys

ROOT = pathlib.Path(__file__).resolve().parent
REPO = ROOT.parents[1]
TD = REPO / 'src/core/deflection.ts'
UN = REPO / 'src/core/units.ts'

# (id, claim under test, file, old, new)
MUTATIONS = [
    # --- the scale 2GM/c^2 b ---
    ("scale-factor2", "the scale carries the factor 2", TD,
     "return (TWO * gm) / (C ** TWO * impactParameter);",
     "return gm / (C ** TWO * impactParameter);"),
    ("scale-c-power", "the scale divides by c^2, not c", TD,
     "return (TWO * gm) / (C ** TWO * impactParameter);",
     "return (TWO * gm) / (C * impactParameter);"),
    ("scale-b-power", "the deflection goes as 1/b, not 1/b^2", TD,
     "return (TWO * gm) / (C ** TWO * impactParameter);",
     "return (TWO * gm) / (C ** TWO * impactParameter ** TWO) * SOLAR_RADIUS;"),
    ("scale-b-linear", "the deflection goes as 1/b, not b", TD,
     "return (TWO * gm) / (C ** TWO * impactParameter);",
     "return (TWO * gm * impactParameter) / (C ** TWO * SOLAR_RADIUS ** TWO);"),
    ("scale-mass-power", "the deflection is linear in GM", TD,
     "return (TWO * gm) / (C ** TWO * impactParameter);",
     "return (TWO * gm ** TWO / SOLAR_GM) / (C ** TWO * impactParameter);"),

    # --- the two contributions ---
    ("time-beta-exponent", "the time term goes as 1/beta^2, not 1/beta", TD,
     "const timeCurvature = scale / beta ** TWO;",
     "const timeCurvature = scale / beta;"),
    ("time-beta-fourth", "the exponent is 2, not 4 (both give 1 at beta = 1)", TD,
     "const timeCurvature = scale / beta ** TWO;",
     "const timeCurvature = scale / beta ** 4;"),
    ("time-beta-multiply", "the time term DIVIDES by beta^2", TD,
     "const timeCurvature = scale / beta ** TWO;",
     "const timeCurvature = scale * beta ** TWO;"),
    ("space-depends-on-beta", "the space term is INDEPENDENT of beta - the exhibit's point", TD,
     "const spaceCurvature = scale * ppnGamma;",
     "const spaceCurvature = scale * ppnGamma * beta ** TWO;"),
    ("space-inverse-beta", "the space term does not grow for slow particles either", TD,
     "const spaceCurvature = scale * ppnGamma;",
     "const spaceCurvature = scale * ppnGamma / beta ** TWO;"),
    ("space-drops-gamma", "gamma multiplies the space term", TD,
     "const spaceCurvature = scale * ppnGamma;",
     "const spaceCurvature = scale;"),
    ("gamma-on-time", "gamma attaches to the SPACE term, not the time term", TD,
     "  const timeCurvature = scale / beta ** TWO;\n  const spaceCurvature = scale * ppnGamma;",
     "  const timeCurvature = scale * ppnGamma / beta ** TWO;\n  const spaceCurvature = scale;"),
    ("total-difference", "the total is the SUM of the two contributions", TD,
     "const total = timeCurvature + spaceCurvature;",
     "const total = timeCurvature - spaceCurvature;"),
    ("total-time-only", "the total includes the space term", TD,
     "const total = timeCurvature + spaceCurvature;",
     "const total = timeCurvature;"),
    ("ratio-inverted", "spaceOverTime is space/time, not time/space", TD,
     "    spaceOverTime: spaceCurvature / timeCurvature,",
     "    spaceOverTime: timeCurvature / spaceCurvature,"),

    # --- the validity band ---
    ("valid-always", "the invalid band is actually flagged", TD,
     "    weakDeflectionValid: total <= WEAK_DEFLECTION_LIMIT_RADIANS,",
     "    weakDeflectionValid: true,"),
    ("valid-inverted", "the flag is true INSIDE the weak band", TD,
     "    weakDeflectionValid: total <= WEAK_DEFLECTION_LIMIT_RADIANS,",
     "    weakDeflectionValid: total >= WEAK_DEFLECTION_LIMIT_RADIANS,"),
    ("valid-limit-value", "the band is 0.01 rad", TD,
     "export const WEAK_DEFLECTION_LIMIT_RADIANS = 0.01;",
     "export const WEAK_DEFLECTION_LIMIT_RADIANS = 1;"),
    ("threshold-no-gamma-headroom", "the threshold accounts for the constant space term", TD,
     "  const headroom = WEAK_DEFLECTION_LIMIT_RADIANS - scale * ppnGamma;",
     "  const headroom = WEAK_DEFLECTION_LIMIT_RADIANS;"),
    ("threshold-no-sqrt", "the threshold inverts a square", TD,
     "  return Math.min(1, Math.sqrt(scale / headroom));",
     "  return Math.min(1, scale / headroom);"),

    # --- the exact Newtonian comparison ---
    ("newton-no-half-angle", "the exact form is tan(alpha/2) = GM/bv^2", TD,
     "  return TWO * Math.atan(deflectionScale(geometry) / (TWO * beta ** TWO));",
     "  return Math.atan(deflectionScale(geometry) / beta ** TWO);"),
    ("newton-linearized", "the exact form is not just the linearization again", TD,
     "  return TWO * Math.atan(deflectionScale(geometry) / (TWO * beta ** TWO));",
     "  return deflectionScale(geometry) / beta ** TWO;"),
    ("newton-tan-not-atan", "the exact form inverts the tangent", TD,
     "  return TWO * Math.atan(deflectionScale(geometry) / (TWO * beta ** TWO));",
     "  return TWO * Math.tan(deflectionScale(geometry) / (TWO * beta ** TWO));"),

    # --- constants and conversion ---
    ("arcsec-conversion", "radians convert to arcseconds", TD,
     "  return radians * ARCSECONDS_PER_RADIAN;",
     "  return radians * DEGREES_IN_HALF_TURN / Math.PI;"),
    ("gamma-default", "the default gamma is general relativity's 1", TD,
     "export const GR_PPN_GAMMA = 1;",
     "export const GR_PPN_GAMMA = 2;"),
    ("einstein-1911-gamma", "Einstein 1911 is gamma = 0", TD,
     "export const EINSTEIN_1911_PPN_GAMMA = 0;",
     "export const EINSTEIN_1911_PPN_GAMMA = 1;"),
    ("cassini-uncertainty", "the Cassini bound is 2.3e-5, not loose", TD,
     "export const CASSINI_GAMMA_UNCERTAINTY = 2.3e-5;",
     "export const CASSINI_GAMMA_UNCERTAINTY = 2.3e-1;"),

    # --- domain guards ---
    ("guard-beta-upper", "beta > 1 is rejected", TD,
     "  if (!(beta > 0) || beta > 1) {\n    throw new RangeError('beta = v/c must lie in (0, 1].');\n  }\n  const { ppnGamma = GR_PPN_GAMMA } = geometry;",
     "  const { ppnGamma = GR_PPN_GAMMA } = geometry;"),
    ("guard-geometry", "non-positive GM and impact parameter are rejected", TD,
     "  if (!(gm > 0) || !(impactParameter > 0)) {\n    throw new RangeError('GM and impact parameter must be positive.');\n  }\n",
     ""),
]

def run_tests():
    """Run the suite and report which tests failed.

    A mutation that makes the suite CRASH — a throw at import or collection time — produces zero
    assertion results, which an earlier version of this harness scored as "no failures", i.e. as a
    survivor. That is exactly backwards: a crash is the most emphatic kill there is. The run's exit
    code and test count are therefore both treated as evidence.
    """
    r = subprocess.run(
        ['npx', 'vitest', 'run', 'src/core/deflection.test.ts', '--reporter=json',
         '--outputFile=' + str(ROOT / 'out.json')],
        cwd=REPO, capture_output=True, text=True)
    try:
        data = json.loads((ROOT / 'out.json').read_text())
    except Exception:
        return None, ['<could not parse vitest output>']
    failed = []
    for suite in data.get('testResults', []):
        for t in suite.get('assertionResults', []):
            if t.get('status') == 'failed':
                failed.append(t.get('title'))
    total = data.get('numTotalTests') or 0
    if not failed and (r.returncode != 0 or total == 0):
        failed.append('<suite did not run: crashed at import or collection>')
    return total, failed

def main():
    only = sys.argv[1] if len(sys.argv) > 1 else None
    originals = {p: p.read_text() for p in (TD, UN)}
    total, failed = run_tests()
    if failed:
        print(f'BASELINE NOT GREEN: {failed}')
        return 1
    print(f'baseline: {total} tests, all passing\n')
    results = []
    try:
        for mid, claim, path, old, new in MUTATIONS:
            if only and only != mid:
                continue
            src = originals[path]
            if src.count(old) != 1:
                results.append((mid, claim, 'PATCH-FAILED', [f'anchor matched {src.count(old)}x']))
                print(f'  !! {mid}: anchor matched {src.count(old)} times')
                continue
            path.write_text(src.replace(old, new, 1))
            _, failed = run_tests()
            path.write_text(src)
            verdict = 'KILLED' if failed else 'SURVIVED'
            results.append((mid, claim, verdict, failed))
            mark = 'x' if failed else '!!'
            print(f'  {mark} {mid:26s} {verdict:9s} {len(failed)} test(s) fail')
            if not failed:
                print(f'       SURVIVOR — nothing asserts: {claim}')
    finally:
        for p, s in originals.items():
            p.write_text(s)
    (ROOT / 'results.json').write_text(json.dumps(
        [{'id': m, 'claim': c, 'verdict': v, 'failing': f} for m, c, v, f in results], indent=2))
    survivors = [r for r in results if r[2] != 'KILLED']
    print(f'\n{len(results) - len(survivors)}/{len(results)} mutations killed')
    if survivors:
        print('SURVIVORS:')
        for m, c, v, _ in survivors:
            print(f'  {m} ({v}): {c}')
    return 1 if survivors else 0

sys.exit(main())
