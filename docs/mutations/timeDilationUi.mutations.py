#!/usr/bin/env python3
"""Mutation-test the time-dilation calculator's DISPLAY layer.

The physics core has its own harness (timeDilation.mutations.py, 45/45). This one targets
everything the panels compute on top of it: slider mappings, derived consequences and formatting.

For each physical claim in src/sims/time-dilation/description/describeClocks.ts, re-introduce a plausible wrong version of
that claim, run the test file, and require that it FAILS. A mutation that survives means the
claim is asserted by nothing.
"""
import json, pathlib, subprocess, sys

ROOT = pathlib.Path(__file__).resolve().parent
REPO = ROOT.parents[1]
TD = REPO / 'src/sims/time-dilation/description/describeClocks.ts'
UN = REPO / 'src/core/units.ts'

# (id, claim under test, file, old, new)
MUTATIONS = [
    # --- the radius slider must never offer a clock at or inside the horizon ---
    ("radius-includes-horizon", "the slider's radius is always strictly outside r_s", TD,
     "  return HORIZON + DECIMAL_BASE ** logHeight;",
     "  return DECIMAL_BASE ** logHeight;"),
    ("radius-not-logarithmic", "the slider is logarithmic in r - r_s", TD,
     "  return HORIZON + DECIMAL_BASE ** logHeight;",
     "  return HORIZON + logHeight - MIN_LOG_HEIGHT;"),
    ("slider-clamp-low", "an index below the range is clamped, not extrapolated", TD,
     "  if (index <= 0) return MIN_LOG_HEIGHT;\n",
     ""),
    ("slider-clamp-high", "an index above the range is clamped, not extrapolated", TD,
     "  if (index >= HEIGHT_STEPS) return MAX_LOG_HEIGHT;\n",
     ""),
    ("slider-inverse", "the index inverts the log-height mapping", TD,
     "  const fraction = (logHeight - MIN_LOG_HEIGHT) / (MAX_LOG_HEIGHT - MIN_LOG_HEIGHT);\n  return Math.min(HEIGHT_STEPS, Math.max(0, Math.round(fraction * HEIGHT_STEPS)));",
     "  const fraction = logHeight / (MAX_LOG_HEIGHT - MIN_LOG_HEIGHT);\n  return Math.min(HEIGHT_STEPS, Math.max(0, Math.round(fraction * HEIGHT_STEPS)));"),

    # --- the clock figures ---
    ("slowdown-not-reciprocal", "the slowdown is 1/rate", TD,
     "    slowdown: 1 / rate,",
     "    slowdown: rate,"),
    ("elapsed-not-scaled", "elapsed proper time is rate times the far interval", TD,
     "    secondsPerFarYear: rate * SECONDS_PER_YEAR,",
     "    secondsPerFarYear: SECONDS_PER_YEAR,"),
    ("elapsed-divided", "elapsed proper time is MULTIPLIED by the rate, not divided", TD,
     "    secondsPerFarYear: rate * SECONDS_PER_YEAR,",
     "    secondsPerFarYear: SECONDS_PER_YEAR / rate,"),
    ("year-is-days", "a year is 365.25 days, not 365.25 seconds", TD,
     "const SECONDS_PER_YEAR = DAYS_PER_JULIAN_YEAR * SECONDS_PER_DAY;",
     "const SECONDS_PER_YEAR = DAYS_PER_JULIAN_YEAR;"),
    ("reference-inverted", "the reference ratio is deep over far", TD,
     "    ratioToReference: clockRateRatio(radius, REFERENCE_RADIUS, HORIZON),",
     "    ratioToReference: clockRateRatio(REFERENCE_RADIUS, radius, HORIZON),"),

    # --- the plotted curve ---
    ("curve-endpoints", "the curve spans the whole slider range", TD,
     "    const logHeight = MIN_LOG_HEIGHT\n      + ((MAX_LOG_HEIGHT - MIN_LOG_HEIGHT) * index) / (samples - 1);",
     "    const logHeight = MIN_LOG_HEIGHT\n      + ((MAX_LOG_HEIGHT - MIN_LOG_HEIGHT) * index) / samples;"),
    ("curve-guard", "a degenerate sample count is rejected", TD,
     "  if (!Number.isInteger(samples) || samples < 2) {\n    throw new RangeError('Need at least two samples.');\n  }\n",
     ""),

    # --- presets must be the real critical radii ---
    ("preset-photon", "the photon-sphere preset is the photon sphere", TD,
     "  { id: 'photon', label: 'Photon sphere', radius: PHOTON_SPHERE_RADIUS, note: '1.5 r_s' },",
     "  { id: 'photon', label: 'Photon sphere', radius: 1.6, note: '1.5 r_s' },"),
    ("preset-isco", "the ISCO preset is the ISCO", TD,
     "  { id: 'isco', label: 'ISCO', radius: ISCO_RADIUS, note: '3 r_s' },",
     "  { id: 'isco', label: 'ISCO', radius: 3.2, note: '3 r_s' },"),
    ("preset-inside-horizon", "no preset sits at or inside the horizon", TD,
     "  { id: 'near', label: 'Just outside', radius: HORIZON + NEAREST_HEIGHT, note: '1.000001 r_s' },",
     "  { id: 'near', label: 'Just outside', radius: HORIZON, note: '1.000001 r_s' },"),

    # --- GPS ---
    ("gps-range-error-formula", "the range error is c times the net offset", TD,
     "    rangeErrorMetresPerDay: netSeconds * C,",
     "    rangeErrorMetresPerDay: netSeconds,"),
    ("gps-range-error-units", "the net is converted from microseconds before multiplying by c", TD,
     "  const netSeconds = offsets.net / MICROSECONDS_PER_SECOND;",
     "  const netSeconds = offsets.net;"),
    ("gps-range-error-sign", "the range error keeps the sign of the net offset", TD,
     "    rangeErrorMetresPerDay: netSeconds * C,",
     "    rangeErrorMetresPerDay: Math.abs(netSeconds) * C,"),
    ("gps-fractional-rate", "the fractional rate is the offset per second, not per day", TD,
     "    fractionalRate: netSeconds / SECONDS_PER_DAY,",
     "    fractionalRate: netSeconds,"),
    ("gps-altitude", "altitude is measured from the Earth's surface, not the centre", TD,
     "    altitudeKm: (orbitRadius - EARTH_MEAN_RADIUS) / METRES_PER_KILOMETRE,",
     "    altitudeKm: orbitRadius / METRES_PER_KILOMETRE,"),
    ("gps-offset-frequency", "the pre-launch frequency is detuned DOWN", TD,
     "  return GPS_NOMINAL_FREQUENCY_HZ * (1 - fractionalRate);",
     "  return GPS_NOMINAL_FREQUENCY_HZ * (1 + fractionalRate);"),
    ("gps-ashby-value", "Ashby's fractional rate is 4.4647e-10", TD,
     "export const ASHBY_FRACTIONAL_RATE = 4.4647e-10;",
     "export const ASHBY_FRACTIONAL_RATE = 4.4e-10;"),
    ("gps-slider-clamp", "the GPS slider clamps an out-of-range index", TD,
     "  if (index >= GPS_RADIUS_STEPS) return MAX_GPS_RADIUS;\n",
     ""),
    ("gps-slider-cannot-reach-real-orbit", "the real GPS orbit is reachable on the slider", TD,
     "export const MAX_GPS_RADIUS = 5e7;",
     "export const MAX_GPS_RADIUS = 2e7;"),

    # --- Hafele-Keating ---
    ("hk-leg-swap", "eastward uses the eastward leg", TD,
     "  const leg = direction === 'eastward' ? HAFELE_KEATING_EASTWARD : HAFELE_KEATING_WESTWARD;",
     "  const leg = direction === 'eastward' ? HAFELE_KEATING_WESTWARD : HAFELE_KEATING_EASTWARD;"),
    ("hk-band-check", "the band check compares against the published uncertainty", TD,
     "  return Math.abs(net - predicted.value) <= predicted.uncertainty;",
     "  return true;"),
    ("hk-band-value", "the band is centred on the published value", TD,
     "  return Math.abs(net - predicted.value) <= predicted.uncertainty;",
     "  return Math.abs(net) <= predicted.uncertainty;"),
    ("hk-band-strict", "the band is inclusive of its own edge", TD,
     "  return Math.abs(net - predicted.value) <= predicted.uncertainty;",
     "  return Math.abs(net - predicted.value) < predicted.uncertainty * 0.5;"),
    ("hk-ratio", "the cross-to-quadratic ratio is |cross| / quadratic", TD,
     "    crossToQuadratic: Math.abs(offsets.sagnacCross) / offsets.quadratic,",
     "    crossToQuadratic: offsets.quadratic / Math.abs(offsets.sagnacCross),"),
    ("hk-predictions-swap", "each leg is compared against its own published prediction", TD,
     "  const predicted = HAFELE_KEATING_PREDICTIONS[direction];",
     "  const predicted = HAFELE_KEATING_PREDICTIONS[direction === 'eastward' ? 'westward' : 'eastward'];"),

    # --- formatting: the sign is the physics ---
    ("format-drops-plus", "a positive offset is shown with its sign", TD,
     "  `${value >= 0 ? '+' : ''}${value.toPrecision(SIGNIFICANT)} μs/day`;",
     "  `${value.toPrecision(SIGNIFICANT)} μs/day`;"),
    ("format-rate-near-unity", "a rate near 1 keeps enough places to say something", TD,
     "  if (rate > 1 - NEAR_UNITY) return rate.toFixed(NEAR_UNITY_PLACES);",
     "  if (rate > 1 - NEAR_UNITY) return rate.toFixed(2);"),
    ("format-elapsed-units", "elapsed time picks a unit rather than always reporting years", TD,
     "  if (seconds >= SECONDS_PER_DAY) return `${(seconds / SECONDS_PER_DAY).toPrecision(SIGNIFICANT)} days`;",
     "  if (seconds >= SECONDS_PER_DAY) return `${(seconds / SECONDS_PER_YEAR).toPrecision(SIGNIFICANT)} years`;"),

    # --- the spoken summaries ---
    ("summary-drops-horizon-caveat", "the summary states that no clock exists at the horizon", TD,
     "    'No static clock exists at or inside the horizon, so the rate reaches zero only as a limit.',",
     "    '',"),
    ("summary-drops-consequence", "the GPS summary states the position-error consequence", TD,
     "    `Uncorrected, that is ${(figures.rangeErrorMetresPerDay / METRES_PER_KILOMETRE).toPrecision(3)}`\n    + ' kilometres of position error per day.',",
     "    '',"),
    ("summary-drops-mechanism", "the flight summary names the Sagnac cross term", TD,
     "    `The asymmetry comes from the Sagnac cross term, which is`",
     "    `The asymmetry comes from somewhere, which is`"),
]

def run_tests():
    """Run the suite and report which tests failed.

    A mutation that makes the suite CRASH — a throw at import or collection time — produces zero
    assertion results, which an earlier version of this harness scored as "no failures", i.e. as a
    survivor. That is exactly backwards: a crash is the most emphatic kill there is. The run's exit
    code and test count are therefore both treated as evidence.
    """
    r = subprocess.run(
        ['npx', 'vitest', 'run', 'src/sims/time-dilation/description/describeClocks.test.ts', '--reporter=json',
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
