#!/usr/bin/env python3
"""Mutation-test the four-chart infall tests (PHYSICS_SPEC 7.4 Claim B).

For each physical claim in src/core/infall.ts, re-introduce a plausible wrong version of
that claim, run the test file, and require that it FAILS. A mutation that survives means the
claim is asserted by nothing.
"""
import json, pathlib, subprocess, sys

ROOT = pathlib.Path(__file__).resolve().parent
REPO = ROOT.parents[1]
TD = REPO / 'src/core/infall.ts'
UN = REPO / 'src/core/units.ts'

# (id, claim under test, file, old, new)
MUTATIONS = [
    # --- the trajectory ---
    ("tau-drop-rs-term", "tau subtracts r_s^{3/2}: the fall ends at the horizon, not at r=0", TD,
     "  return (TWO / THREE) * (root(startRadius) ** THREE - root(radius) ** THREE) * Math.sqrt(HORIZON);",
     "  return (TWO / THREE) * root(startRadius) ** THREE * Math.sqrt(HORIZON);"),
    ("tau-exponent", "tau goes as r^{3/2}, not r^{1/2}", TD,
     "  return (TWO / THREE) * (root(startRadius) ** THREE - root(radius) ** THREE) * Math.sqrt(HORIZON);",
     "  return (TWO / THREE) * (root(startRadius) - root(radius)) * Math.sqrt(HORIZON);"),
    ("tau-prefactor", "the prefactor is 2/3", TD,
     "  return (TWO / THREE) * (root(startRadius) ** THREE - root(radius) ** THREE) * Math.sqrt(HORIZON);",
     "  return (root(startRadius) ** THREE - root(radius) ** THREE) * Math.sqrt(HORIZON);"),
    ("tau-inverse-exponent", "the inverse of tau raises to 2/3", TD,
     "  return HORIZON * cubed ** (TWO / THREE);",
     "  return HORIZON * cubed ** (THREE / TWO);"),

    # --- Schwarzschild t ---
    ("t-drop-log", "t(r) carries the logarithm that makes it diverge at the horizon", TD,
     "  return (TWO / THREE) * w ** THREE + TWO * w + Math.log(Math.abs((w - 1) / (w + 1)));",
     "  return (TWO / THREE) * w ** THREE + TWO * w;"),
    ("t-log-sign", "the logarithm's argument is (w-1)/(w+1), not its reciprocal", TD,
     "  return (TWO / THREE) * w ** THREE + TWO * w + Math.log(Math.abs((w - 1) / (w + 1)));",
     "  return (TWO / THREE) * w ** THREE + TWO * w + Math.log(Math.abs((w + 1) / (w - 1)));"),
    ("t-linear-term", "the 2w term is present", TD,
     "  return (TWO / THREE) * w ** THREE + TWO * w + Math.log(Math.abs((w - 1) / (w + 1)));",
     "  return (TWO / THREE) * w ** THREE + Math.log(Math.abs((w - 1) / (w + 1)));"),
    ("t-overall-sign", "t increases as the faller descends", TD,
     "  return -HORIZON * (",
     "  return HORIZON * ("),
    ("t-inside-horizon", "the Schwarzschild chart refuses to report a time inside the horizon", TD,
     "  if (radius < HORIZON) {\n    // Not merely infinite: inside the horizon `t` is a spatial coordinate and this chart has\n    // nothing to say. Returning a number here would invite it into the invariant comparison.\n    throw new RangeError('Schwarzschild time is not defined inside the horizon.');\n  }\n",
     ""),
    ("t-diverges-at-horizon", "t is infinite AT the horizon, from the logarithm itself", TD,
     "  return -HORIZON * (\n    schwarzschildAntiderivative(root(radius)) - schwarzschildAntiderivative(root(startRadius))\n  );",
     "  return -HORIZON * (\n    schwarzschildAntiderivative(Math.max(root(radius), 1.000001)) - schwarzschildAntiderivative(root(startRadius))\n  );"),

    # --- tortoise ---
    ("tortoise-drop-log", "r* carries r_s ln|r/r_s - 1|", TD,
     "  return radius + HORIZON * Math.log(Math.abs(radius / HORIZON - 1));",
     "  return radius;"),
    ("tortoise-log-sign", "the tortoise logarithm is added, not subtracted", TD,
     "  return radius + HORIZON * Math.log(Math.abs(radius / HORIZON - 1));",
     "  return radius - HORIZON * Math.log(Math.abs(radius / HORIZON - 1));"),
    ("tortoise-no-offset", "the logarithm's argument is r/r_s - 1, not r/r_s", TD,
     "  return radius + HORIZON * Math.log(Math.abs(radius / HORIZON - 1));",
     "  return radius + HORIZON * Math.log(Math.abs(radius / HORIZON));"),

    # --- GP ---
    ("gp-not-proper-time", "GP coordinate time along this worldline IS the proper time", TD,
     "  return properTime(radius, startRadius);\n}\n\n/** Eddington-Finkelstein advanced time",
     "  return properTime(radius, startRadius) * 1.01;\n}\n\n/** Eddington-Finkelstein advanced time"),

    # --- EF v ---
    ("ef-drop-quadratic", "v's finite part carries the w^2 term", TD,
     "  const finitePart = -(TWO / THREE) * w ** THREE - TWO * w + w ** TWO\n    + TWO * Math.log(w + 1);",
     "  const finitePart = -(TWO / THREE) * w ** THREE - TWO * w\n    + TWO * Math.log(w + 1);"),
    ("ef-log-coefficient", "the surviving logarithm has coefficient 2", TD,
     "  const finitePart = -(TWO / THREE) * w ** THREE - TWO * w + w ** TWO\n    + TWO * Math.log(w + 1);",
     "  const finitePart = -(TWO / THREE) * w ** THREE - TWO * w + w ** TWO\n    + Math.log(w + 1);"),
    ("ef-log-argument", "the surviving logarithm is of (w+1), the regular one", TD,
     "  const finitePart = -(TWO / THREE) * w ** THREE - TWO * w + w ** TWO\n    + TWO * Math.log(w + 1);",
     "  const finitePart = -(TWO / THREE) * w ** THREE - TWO * w + w ** TWO\n    + TWO * Math.log(Math.abs(w - 1));"),
    ("ef-origin", "v's origin is r*(r0), so that v = t + r* throughout", TD,
     "  return tortoise(startRadius);",
     "  return 0;"),
    ("ef-u-sign", "u = t - r*, not t + r*", TD,
     "  return schwarzschildTime(radius, startRadius) - tortoise(radius);",
     "  return schwarzschildTime(radius, startRadius) + tortoise(radius);"),

    # --- Kruskal ---
    ("kruskal-V-sign", "V = exp(+v/2r_s)", TD,
     "  const V = Math.exp(eddingtonFinkelsteinV(radius, startRadius) / (TWO * HORIZON));",
     "  const V = Math.exp(-eddingtonFinkelsteinV(radius, startRadius) / (TWO * HORIZON));"),
    ("kruskal-U-sign", "U = exp(-u/2r_s)", TD,
     "  const U = Math.exp(-eddingtonFinkelsteinU(radius, startRadius) / (TWO * HORIZON));",
     "  const U = Math.exp(eddingtonFinkelsteinU(radius, startRadius) / (TWO * HORIZON));"),
    ("kruskal-half", "the exponent carries the factor 1/2r_s", TD,
     "  const V = Math.exp(eddingtonFinkelsteinV(radius, startRadius) / (TWO * HORIZON));",
     "  const V = Math.exp(eddingtonFinkelsteinV(radius, startRadius) / HORIZON);"),
    ("kruskal-TX-swap", "T = (V-U)/2 and X = (V+U)/2", TD,
     "  return { V, U, T: (V - U) / TWO, X: (V + U) / TWO };",
     "  return { V, U, T: (V + U) / TWO, X: (V - U) / TWO };"),
    ("kruskal-recover-no-e", "the Lambert argument is UV/e", TD,
     "  return HORIZON * (1 + lambertW0(product / Math.E));",
     "  return HORIZON * (1 + lambertW0(product));"),
    ("kruskal-recover-no-offset", "r = r_s(1 + W0(UV/e)), the 1 included", TD,
     "  return HORIZON * (1 + lambertW0(product / Math.E));",
     "  return HORIZON * lambertW0(product / Math.E);"),
    ("kruskal-recover-uses-difference", "recovery uses the product UV, not X^2 - T^2", TD,
     "  const product = point.U * point.V;",
     "  const product = ((point.U + point.V) / TWO) ** TWO - ((point.V - point.U) / TWO) ** TWO;"),

    # --- Lambert W ---
    ("lambert-no-iterate", "Lambert W actually converges rather than returning its seed", TD,
     "    w -= delta;",
     "    w -= delta * 0;"),
    ("lambert-domain", "Lambert W0 rejects z < -1/e", TD,
     "  if (!Number.isFinite(z) || z < LIMIT) {",
     "  if (!Number.isFinite(z)) {"),

    # --- invariants ---
    ("kretschmann-power", "K goes as r^-6", TD,
     "  return (FORTY_EIGHT * MASS ** TWO) / radius ** SIX;",
     "  return (FORTY_EIGHT * MASS ** TWO) / radius ** THREE;"),
    ("kretschmann-coefficient", "K's coefficient is 48 M^2", TD,
     "  return (FORTY_EIGHT * MASS ** TWO) / radius ** SIX;",
     "  return (FORTY_EIGHT * MASS) / radius ** SIX;"),
    ("tidal-power", "the tidal component goes as r^-3", TD,
     "  return (-TWO * MASS) / radius ** THREE;",
     "  return (-TWO * MASS) / radius ** TWO;"),
    ("tidal-sign", "the radial tidal component is negative: stretching", TD,
     "  return (-TWO * MASS) / radius ** THREE;",
     "  return (TWO * MASS) / radius ** THREE;"),
    ("mass-value", "M = r_s/2 in these units", TD,
     "export const MASS = HALF;",
     "export const MASS = HORIZON;"),

    # --- the inversion used by two charts ---
    ("invert-comparison", "the bisection brackets on the correct side of the target", TD,
     "    if (evaluate(middle) > target) low = middle;",
     "    if (evaluate(middle) < target) low = middle;"),
    ("invert-bracket-low", "the bisection searches down to the horizon", TD,
     "  let low = HORIZON;",
     "  let low = HORIZON * 2;"),
]

def run_tests():
    r = subprocess.run(
        ['npx', 'vitest', 'run', 'src/core/infall.test.ts', '--reporter=json',
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
