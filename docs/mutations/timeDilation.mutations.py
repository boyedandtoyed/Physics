#!/usr/bin/env python3
"""Mutation-test the part-1 time-dilation tests.

For each physical claim in src/core/timeDilation.ts, re-introduce a plausible wrong version of
that claim, run the test file, and require that it FAILS. A mutation that survives means the
claim is asserted by nothing.
"""
import json, pathlib, subprocess, sys

ROOT = pathlib.Path(__file__).resolve().parent
REPO = ROOT.parents[1]
TD = REPO / 'src/core/timeDilation.ts'
UN = REPO / 'src/core/units.ts'

# (id, claim under test, file, old, new)
MUTATIONS = [
    # --- schwarzschildRadius: r_s = 2GM/c^2 ---
    ("rs-factor2", "r_s carries the factor 2", TD,
     "return (TWO * G * massKilograms) / C ** TWO;",
     "return (G * massKilograms) / C ** TWO;"),
    ("rs-cpower", "r_s divides by c^2, not c", TD,
     "return (TWO * G * massKilograms) / C ** TWO;",
     "return (TWO * G * massKilograms) / C;"),

    # --- staticClockRate: sqrt(1 - r_s/r) ---
    ("rate-no-sqrt", "the rate is the square ROOT of 1 - r_s/r", TD,
     "return Math.sqrt(1 - schwarzschild / radius);",
     "return 1 - schwarzschild / radius;"),
    ("rate-cuberoot", "the exponent is 1/2, not 1/3 (same value at r=r_s)", TD,
     "return Math.sqrt(1 - schwarzschild / radius);",
     "return (1 - schwarzschild / radius) ** (1 / 3);"),
    ("rate-inverted-ratio", "the ratio is r_s/r, not r/r_s", TD,
     "return Math.sqrt(1 - schwarzschild / radius);",
     "return Math.sqrt(1 - radius / schwarzschild);"),
    ("rate-sign", "the metric term is subtracted, not added", TD,
     "return Math.sqrt(1 - schwarzschild / radius);",
     "return Math.sqrt(1 + schwarzschild / radius);"),
    ("rate-halved-rs", "no stray factor of 2 in r_s/r", TD,
     "return Math.sqrt(1 - schwarzschild / radius);",
     "return Math.sqrt(1 - schwarzschild / (TWO * radius));"),
    ("rate-no-horizon-guard", "no static clock exists inside the horizon", TD,
     "  if (radius < schwarzschild) {\n    throw new RangeError('No static clock exists inside the horizon.');\n  }\n",
     ""),

    # --- clockRateRatio ---
    ("ratio-inverted", "the ratio is lower/upper: the deeper clock is the slow one", TD,
     "return staticClockRate(lower, schwarzschild) / staticClockRate(upper, schwarzschild);",
     "return staticClockRate(upper, schwarzschild) / staticClockRate(lower, schwarzschild);"),

    # --- radiusForClockRate: r = r_s/(1 - rate^2) ---
    ("invert-no-square", "the inverse squares the rate", TD,
     "return schwarzschild / (1 - rate ** TWO);",
     "return schwarzschild / (1 - rate);"),
    ("invert-no-guard", "rate = 1 (r = infinity) is rejected", TD,
     "  if (!(rate > 0) || rate >= 1) {",
     "  if (!(rate > 0) || rate > 1) {"),

    # --- properTimeAt ---
    ("proper-time-inverted", "proper time is rate * coordinate time, not divided by it", TD,
     "return staticClockRate(radius, schwarzschild) * coordinateSeconds;",
     "return coordinateSeconds / staticClockRate(radius, schwarzschild);"),

    # --- GPS gravitational: GM(1/R - 1/r)/c^2 ---
    ("gps-grav-sign", "the satellite is HIGHER in the potential: 1/R - 1/r, not 1/r - 1/R", TD,
     "const potentialDifference = (EARTH_GM / groundRadius - EARTH_GM / orbitRadius) / C ** TWO;",
     "const potentialDifference = (EARTH_GM / orbitRadius - EARTH_GM / groundRadius) / C ** TWO;"),
    ("gps-grav-linear", "the potential difference is divided by c^2, not c", TD,
     "const potentialDifference = (EARTH_GM / groundRadius - EARTH_GM / orbitRadius) / C ** TWO;",
     "const potentialDifference = (EARTH_GM / groundRadius - EARTH_GM / orbitRadius) / C;"),
    ("gps-grav-no-recip", "the potential goes as 1/r, not r", TD,
     "const potentialDifference = (EARTH_GM / groundRadius - EARTH_GM / orbitRadius) / C ** TWO;",
     "const potentialDifference = (EARTH_GM * groundRadius - EARTH_GM * orbitRadius) / C ** TWO / EARTH_MEAN_RADIUS ** TWO;"),

    # --- GPS kinematic ---
    ("gps-kin-drop-ground", "the kinematic term is a DIFFERENCE: the ground station moves too", TD,
     "const speedDifference = -(satelliteSpeed ** TWO - groundSpeed ** TWO) / (TWO * C ** TWO);",
     "const speedDifference = -(satelliteSpeed ** TWO) / (TWO * C ** TWO);"),
    ("gps-kin-no-half", "the kinematic term carries the 1/2", TD,
     "const speedDifference = -(satelliteSpeed ** TWO - groundSpeed ** TWO) / (TWO * C ** TWO);",
     "const speedDifference = -(satelliteSpeed ** TWO - groundSpeed ** TWO) / (C ** TWO);"),
    ("gps-kin-sign", "motion makes the moving clock SLOW: the term is negative", TD,
     "const speedDifference = -(satelliteSpeed ** TWO - groundSpeed ** TWO) / (TWO * C ** TWO);",
     "const speedDifference = (satelliteSpeed ** TWO - groundSpeed ** TWO) / (TWO * C ** TWO);"),
    ("gps-orbital-speed", "circular orbital speed is sqrt(GM/r)", TD,
     "const satelliteSpeed = Math.sqrt(EARTH_GM / orbitRadius);",
     "const satelliteSpeed = EARTH_GM / orbitRadius;"),
    ("gps-orbital-speed-linear", "orbital speed falls as 1/sqrt(r), not sqrt(r)", TD,
     "const satelliteSpeed = Math.sqrt(EARTH_GM / orbitRadius);",
     "const satelliteSpeed = Math.sqrt(EARTH_GM * orbitRadius) / EARTH_MEAN_RADIUS;"),

    # --- perpendicularRadius: R cos(lat) ---
    ("perp-drop-cos", "the cross term uses the distance from the ROTATION AXIS", TD,
     "return EARTH_MEAN_RADIUS * Math.cos((latitudeDegrees * Math.PI) / DEGREES_IN_HALF_TURN);",
     "return EARTH_MEAN_RADIUS;"),
    ("perp-sin", "R_perp = R cos(lat), not R sin(lat)", TD,
     "return EARTH_MEAN_RADIUS * Math.cos((latitudeDegrees * Math.PI) / DEGREES_IN_HALF_TURN);",
     "return EARTH_MEAN_RADIUS * Math.sin((latitudeDegrees * Math.PI) / DEGREES_IN_HALF_TURN);"),
    ("perp-degrees", "latitude is converted to radians", TD,
     "return EARTH_MEAN_RADIUS * Math.cos((latitudeDegrees * Math.PI) / DEGREES_IN_HALF_TURN);",
     "return EARTH_MEAN_RADIUS * Math.cos(latitudeDegrees);"),

    # --- Hafele-Keating ---
    ("hk-grav-drop-h", "the gravitational term is g*h/c^2, linear in altitude", TD,
     "const gravitational = (STANDARD_GRAVITY * leg.heightMetres) / C ** TWO;",
     "const gravitational = (STANDARD_GRAVITY * Math.sqrt(leg.heightMetres)) / C ** TWO;"),
    ("hk-grav-sign", "altitude makes the flying clock FAST", TD,
     "const gravitational = (STANDARD_GRAVITY * leg.heightMetres) / C ** TWO;",
     "const gravitational = -(STANDARD_GRAVITY * leg.heightMetres) / C ** TWO;"),
    ("hk-cross-drop", "the east/west asymmetry comes from the 2*R_perp*Omega*v cross term", TD,
     "const cross = (TWO * perpendicular * EARTH_ANGULAR_VELOCITY * leg.airSpeed) / (TWO * C ** TWO);",
     "const cross = 0;"),
    ("hk-cross-abs", "the cross term reverses sign with flight direction", TD,
     "const cross = (TWO * perpendicular * EARTH_ANGULAR_VELOCITY * leg.airSpeed) / (TWO * C ** TWO);",
     "const cross = (TWO * perpendicular * EARTH_ANGULAR_VELOCITY * Math.abs(leg.airSpeed)) / (TWO * C ** TWO);"),
    ("hk-cross-uses-R", "the cross term uses R_perp, not the full Earth radius", TD,
     "const perpendicular = perpendicularRadius(leg.latitudeDegrees);",
     "const perpendicular = EARTH_MEAN_RADIUS;"),
    ("hk-cross-factor2", "the cross term's numerator carries the factor 2", TD,
     "const cross = (TWO * perpendicular * EARTH_ANGULAR_VELOCITY * leg.airSpeed) / (TWO * C ** TWO);",
     "const cross = (perpendicular * EARTH_ANGULAR_VELOCITY * leg.airSpeed) / (TWO * C ** TWO);"),
    ("hk-quad-sign", "the v^2 term does NOT reverse with direction", TD,
     "const quadratic = leg.airSpeed ** TWO / (TWO * C ** TWO);",
     "const quadratic = leg.airSpeed * Math.abs(leg.airSpeed) / (TWO * C ** TWO);"),
    ("hk-quad-no-half", "the v^2 term carries the 1/2", TD,
     "const quadratic = leg.airSpeed ** TWO / (TWO * C ** TWO);",
     "const quadratic = leg.airSpeed ** TWO / (C ** TWO);"),
    ("hk-net-sign", "the kinematic terms are SUBTRACTED from the gravitational one", TD,
     "    net: (gravitational - cross - quadratic) * elapsed,",
     "    net: (gravitational + cross + quadratic) * elapsed,"),
    ("hk-elapsed-hours", "the offset accumulates over the flight duration", TD,
     "const elapsed = leg.hours * SECONDS_PER_HOUR * NANOSECONDS_PER_SECOND;",
     "const elapsed = SECONDS_PER_HOUR * NANOSECONDS_PER_SECOND;"),

    # ================= ROUND 2: adversarial =================
    # These are built to SURVIVE a test suite that gates a radial law at one radius, or at the
    # radius where the normalised variable equals 1. Each agrees with the truth somewhere.

    ("adv-endpoints-agree", "the radial law is checked BETWEEN its endpoints, not just at them", TD,
     "return Math.sqrt(1 - schwarzschild / radius);",
     "return 1 - Math.sqrt(schwarzschild / radius);"),
    ("adv-weakfield-exact", "the law is the sqrt, not its own first-order expansion", TD,
     "return Math.sqrt(1 - schwarzschild / radius);",
     "return 1 - schwarzschild / (TWO * radius);"),
    ("adv-second-order", "the expansion is not truncated at second order either", TD,
     "return Math.sqrt(1 - schwarzschild / radius);",
     "return 1 - schwarzschild / (TWO * radius) - (schwarzschild / radius) ** TWO / 8;"),
    ("adv-rs-over-r-swap", "r_s/r appears, not a form that coincides only at r = r_s", TD,
     "return Math.sqrt(1 - schwarzschild / radius);",
     "return Math.sqrt(1 - (schwarzschild / radius) ** TWO) * (radius > schwarzschild ? 1 : 0);"),

    # Unit-conversion claims: the published figures are the only thing pinning these.
    ("units-gps-perday", "the GPS offset is reported in microseconds per day", TD,
     "const perDay = SECONDS_PER_DAY * MICROSECONDS_PER_SECOND;",
     "const perDay = SECONDS_PER_DAY * NANOSECONDS_PER_SECOND;"),
    ("units-gps-perhour", "the GPS offset is per DAY, not per hour", TD,
     "const perDay = SECONDS_PER_DAY * MICROSECONDS_PER_SECOND;",
     "const perDay = SECONDS_PER_HOUR * MICROSECONDS_PER_SECOND;"),
    ("units-hk-nanoseconds", "Hafele-Keating is reported in nanoseconds", TD,
     "const elapsed = leg.hours * SECONDS_PER_HOUR * NANOSECONDS_PER_SECOND;",
     "const elapsed = leg.hours * SECONDS_PER_HOUR * MICROSECONDS_PER_SECOND;"),

    # Composition claims: the reported parts must actually sum to the reported whole.
    ("compose-gps-net", "the GPS net is the SUM of the two competing terms", TD,
     "    net: (potentialDifference + speedDifference) * perDay,",
     "    net: (potentialDifference - speedDifference) * perDay,"),
    ("compose-hk-net-drops-quad", "the HK net includes the quadratic term", TD,
     "    net: (gravitational - cross - quadratic) * elapsed,",
     "    net: (gravitational - cross) * elapsed,"),
    ("compose-hk-kinematic-field", "the reported kinematic field is cross + quadratic", TD,
     "    kinematic: -(cross + quadratic) * elapsed,",
     "    kinematic: -cross * elapsed,"),
    ("gps-ground-radius", "the ground clock sits at the Earth radius", TD,
     "  const groundRadius = EARTH_MEAN_RADIUS;",
     "  const groundRadius = GPS_ORBIT_RADIUS;"),

    # A constant, not a formula. Recorded to show the tolerance honestly, not expected to die.
    ("const-solar-day", "sidereal vs solar rotation rate (0.27%) — inside the published band", UN,
     "export const EARTH_ANGULAR_VELOCITY = 7.292_115e-5;",
     "export const EARTH_ANGULAR_VELOCITY = 7.272_205e-5;"),
]

def run_tests():
    r = subprocess.run(
        ['npx', 'vitest', 'run', 'src/core/timeDilation.test.ts', '--reporter=json',
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
    return data.get('numTotalTests'), failed

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
