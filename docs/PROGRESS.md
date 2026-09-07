# Progress Log

## Current status — 2026-09-06

**Phase:** 2 — Time and interpretations. **COMPLETE.** All three parts are built, green,
merged to `master` and deployed. Phase 1 is complete, merged (`7bd6e70`) and deployed. Phase 0 is
signed off. **Next phase: 3 — orbits and precession (BUILD_PLAN §3).**
**Branch:** `feat/phase-2-time`, branched from `master`.
**Live:** https://abstract-physics.binodtiwari.com serves the foundation shell (HTTP 200).
**The lensing sim is registered and live.** Reachable from the Collection page at
https://abstract-physics.binodtiwari.com/sims/blackhole-lensing, verified rendering end to end
through the public HTTPS host.

### Phase 1 definition of done (BUILD_PLAN §3)

| Requirement | Measured | Verdict |
|---|---|---|
| 60 fps at 1080p on a mid-range GPU | **64.7 fps** median of 5×20 frames, Quadro M5000, 320 steps/ray, disk on, at the shipped default resolution scale 0.65 (native 1.0 gives 29.3 fps) | met, using the resolution scaling §4.5 marks *required* |
| Shadow radius matches 3√3 GM/c² to within a pixel | **0.013 px** error, holding across three camera distances and fields of view | met, 77× inside the gate |
| A physicist finds nothing to complain about | Four source audits fixed four sets of real errors before implementation; every physical claim is gated on a measurement with a mutation that trips it | see the gate table below |

### Final gate table

| Gate | Value | Mutation that trips it | Mutated |
|---|---|---|---|
| Shadow radius error | **0.013 px** | old `r̂/r⁵` force law | 33.4 px |
| — | — | drop static-observer √(1−rₛ/D) | 2.63 px |
| Shader vs float64 model, radius | **4.1e-4** (gate 1e-3) | — | — |
| Shader vs float64 model, g | **9.0e-5** | — | — |
| Shader vs float64 model, g·T | **2.1e-4** | Shakura–Sunyaev flux law | 29.8% |
| Doppler brightness exponent | **4.0045** | apply g twice | 7.998 |
| Crescent ratio (encoded sRGB) | **3.75** | — | — |
| Temporal stability (scale-invariant) | **0.278** | drop the many-star limit | 1.14 |
| Rim luminance (content check) | **43.5** | narrow kernel until rim blanks | 0.11 |
| Rim sharpness, scale 1.0 vs 0.5 | **117.3 vs 58.1** (2.02×) | — | — |
| Accumulation vs explicit mean | **0.75** of one 8-bit level | — | — |
| Ghosting after camera change | **0** | remove the history reset | 134 |
| Tests | 81 Vitest, 20 Playwright, 57 Python benchmarks | — | — |

**The acceptance suite passes (11 tests).** Run it with `npx playwright test --project=lensing`.
- Shadow radius off a real GPU frame: 99.474 px vs 99.487 px predicted, **0.013 px** error
  against the one-pixel gate, holding across three camera distances and fields of view.
- Disk: shader vs float64 model agree to **3e-5** on emission radius, g and g*T, with **zero**
  hit/miss disagreements over 2500 sampled pixels.
- Doppler exponent measured off the frame: **4.0019** (correct is 4; double-counting reads 8).
- Star-field temporal stability: **rimRms 6.81** against a recorded point-sampling baseline of
  **15.09**; the gate also requires rim luminance > 6, because variance alone rewards a blank frame.
- Accumulation matches an explicit mean of the same jitters to **0.75** of one 8-bit level, and
  discards history on a camera change with ghosting error **0** (**134** without the reset).

## Done and verified

- Vite 7, React 19, TypeScript 5.9 strict / noUncheckedIndexedAccess, reproducible npm lockfile.
- CODATA/reference constants in `src/core/units.ts`; hbar derived from exact h, solar GM kept separate from rounded solar mass.
- In-place float64 RK4, velocity Verlet, Yoshida-4 with reusable scratch buffers and documented callback/aliasing contracts.
- **29 Vitest tests pass:** convergence ratios, reversibility, negative Yoshida substep, non-autonomous RK4 stages, oscillator energy over 1,000 periods, circular/eccentric Newtonian closure, angular momentum, Schwarzschild circular effective-potential equilibrium, formal million-fold-c limit, dimension/alias validation, constants, fourth-order Kepler step-refinement at four (e, a) pairs, and the shell's lazy-route/storage tests.
- **Typecheck and ESLint pass. Production build passes.**
- **72 Vitest tests and 14 Playwright tests pass** (8 of the latter are the lensing acceptance
  suite: shadow radius, per-pixel disk agreement, the Doppler exponent, and the crescent).
- All **57 Python reference benchmark checks pass**; these check formulas, not future simulation
  implementations. §2.4's critical radii are now *derived* by root-finding on the metric rather
  than compared against themselves (see `DECISIONS.md`, Phase 1 source audit).
- Gallery with explicit unavailability state, routing/not-found handling, typed lazy sim registry, system/light/dark themes, keyboard skip navigation, responsive layout.
- Methodology page with lazy-loaded KaTeX and React Aria physics disclosure, assumptions and primary sources.
- **3 Playwright tests pass**, including light/dark axe scans, keyboard disclosure, theme persistence, narrow-screen overflow check, system dark mode and not-found route. No page errors in tested flows.
- Docker multi-stage Node→nginx, web-only compose on `127.0.0.1:8080`, healthy container `physics-web-1`.
- Local deep link `/method` returns 200 with no-cache HTML; missing `/assets/missing.js` returns 404. Public HTTPS root returns 200.
- Full header/MIME sweep against the running container passes, including `font/ttf` after the nginx fix below. Seven screenshots inspected across themes and viewports with no page errors or overflow.
- **3 Playwright tests pass against the production build** (`vite preview` over `dist/`), not the dev server.
- Existing Cloudflare tunnel untouched. Domain already uses the correct hyphen; no DNS action needed.
- Gitleaks v8.24.3 Docker scan of Git history and source found no leaks. Owner explicitly approved using this pinned scanner.
- GitHub Actions workflow (typecheck/lint/arch/tests/Python/build/Playwright/axe/Gitleaks/Docker
  build) **verified green on remote CI**, actions pinned by commit SHA and gitleaks by digest.

## Phase 1 — where to pick up

## Phase 2 — where to pick up

**The audit is done (commit `4fa3b28`). Part 1's physics core is landed; no Phase 2 UI exists
yet.** All the physics the three interactives need is in `PHYSICS_SPEC.md` and asserted in
`verify_benchmarks.py` (57 → 84 checks), so implementation runs from tested formulae rather than
from prose.

> **Correction, 2026-09-06.** This section previously read "no Phase 2 UI exists yet" *and*
> "implementation not started". The second half was false: the session that wrote it was killed by
> a usage limit with `src/core/timeDilation.ts`, its 15 tests, the `units.ts` constants and the §8
> conventions block finished but **uncommitted**. A later session found them in the working tree
> and committed them unchanged as `d28d97e`. The lesson is the one BUILD_PLAN §9 already states and
> that session did not follow: commit at every checkpoint, not at the end of a work item. Work that
> exists only in the working tree is invisible to this file, and this file is what the next session
> trusts.

**DONE: part 1's physics core** (`src/core/timeDilation.ts`, `d28d97e`). Static Schwarzschild clock
rates and their inverse, the GPS gravitational/kinematic split, and Hafele–Keating decomposed into
its Sagnac cross term and quadratic term. 16 Vitest tests, all mutation-tested — see the gate table
below. **Part 1's UI is not built.**

**DONE: part 2, the deflection decomposition interactive** (`/sims/deflection-decomposition`,
commits `dc52dfa` → `3dc64ab`). Core, figures, chart geometry, view, 8 Playwright tests. See the
Phase 2 gate table below.

**DONE: part 3, the Interpretations module** (`/sims/interpretations`, commits `d8764db` →
`43c75ec`). Four charts, one worldline, invariants recovered by four independent routes.

**DONE: part 1's UI, the time-dilation calculator** (`/sims/time-dilation`). Three sections over
the untouched core: near-horizon static clocks with the rate curve and tick strip, GPS with its
gain/loss split and the range-error consequence, and Hafele–Keating against its published bands.

### Phase 2 definition of done (BUILD_PLAN §3)

| Requirement | Verified | Verdict |
|---|---|---|
| Time-dilation calculator + visualiser: GPS, Hafele–Keating, near-horizon clocks | `/sims/time-dilation`, 32 display tests over a 16-test core | met |
| Benchmarks §8.5–8.9 asserted | rows 5–7 at **+45.7 / −7.11 / +38.5 μs/day**; rows 8–9 inside **−40±23** and **+275±21 ns**; row 19 as the **2.25×** cross-to-quadratic ratio | met |
| Deflection decomposition, 0.875″ → 1.75″ | `/sims/deflection-decomposition`, ratio **exactly 2**, space term constant across all fifteen decades | met |
| Interpretations module, four charts, identical invariants | `/sims/interpretations`, four independent recoveries agreeing to **8.7e-15** against a 1e-10 gate | met |
| Plus the tidal panel no "expansion" story reproduces | geodesic-deviation figure, 2:1 stretch-to-squeeze drawn to scale, **−1.0 c²/rₛ²** finite at the horizon | met |

**Totals at Phase 2 close:** 238 Vitest, 40 Playwright (app) + 11 lensing acceptance, 84 Python
benchmarks, **147 mutations across four harnesses, all killed.** Typecheck, ESLint, dependency
rules and the production build are green.

### Phase 2 part 1 gate table

| Gate | Value | Mutation that trips it | Mutated |
|---|---|---|---|
| GPS gravitational | **+45.73 μs/day** (§8 row 5) | drop the 1/R − 1/r ordering | sign flips |
| GPS kinematic | **−7.106 μs/day** (§8 row 6) | drop the ground-station term | −7.21 |
| GPS net | **+38.62 μs/day** (§8 row 7) | sum instead of difference | fails |
| Uncorrected position drift | **11.6 km/day** = c × net | drop the c | fails |
| Ashby pre-launch offset cross-check | **4.4688e-10** vs published 4.4647e-10, **0.09%** high | detune up instead of down | 0.0091 Hz, caught |
| Hafele–Keating eastward | **−44.5 ns**, inside −40±23 | swap the legs | outside |
| Hafele–Keating westward | **+255.6 ns**, inside +275±21 | hardcode `insideBand: true` | caught by the predicate test |
| Cross ÷ quadratic (§8 row 19) | **2.25×**, reverses sign | absolute value of v | asymmetry vanishes |
| Near-horizon rate at 1.000001 rₛ | **9.999995e-4**, slowdown **1000.0005×** | rate as sqrt(d) not sqrt(d/(1+d)) | exactly 1000 |
| tick marks vs label | **exact at 1, 28, 40** | draw count + 1 fenceposts | 41 under "40 ticks" |
| Display-layer mutations killed | **36 / 36** | — | — |

**What building part 1 found.** The new CLAUDE.md rule 3 earned itself immediately: the green
suite passed while the page had three defects, all found by driving it.

1. **The presets did not land on the radii they name.** "Photon sphere" routed through the integer
   slider index and snapped to 1.50119 rₛ, reading 0.5778 instead of 0.5774. State is now the
   exact value with the slider showing the nearest index.
2. **The tick strip drew count + 1 marks under a label saying count** — 41 fenceposts for
   "40 ticks" — and would have divided by zero at one tick.
3. **All three Phase 2 sims scrolled sideways on a phone**, by 68, 7 and 205 px. Grid items default
   to `min-width: auto`, so a `.physics-panel` holding a wide KaTeX display and a `.table-scroll`
   holding a min-width table could not shrink and widened the whole page — their own `overflow-x`
   containers were powerless. A slider thumb also overhung its track end by half its width. Both
   were latent in the lensing sim and only triggered by longer content. The mobile e2e test
   covered only the gallery; there is now a route-level guard over all four sims at 360 and 390 px.

**And one in the tooling.** The mutation harness scored a *crash* as a survival: a mutation that
throws at import time produces zero assertion results, and the scorer read "no failed assertions"
as "survived". A crash is the most emphatic kill there is. Fixed in all four harnesses; all four
re-run clean.

### Phase 2 part 3 gate table

| Gate | Value | Mutation that trips it | Mutated |
|---|---|---|---|
| Proper time to horizon from 8 rₛ | **14.4183 rₛ/c** (§7.4) | drop the −rₛ^{3/2} term | 15.08 |
| Schwarzschild t at the horizon | **∞** | drop the log in F(w) | finite |
| Invariant agreement, 4 charts, same event | **≤ 8.7e-15** (gate 1e-10) | any transformation error | ≫ gate |
| Areal radius agreement, 4 charts | **< 1e-12** | Lambert argument UV instead of UV/e | fails |
| Wrong comparison (same coordinate value 13) | **745×** spread in K | — asserted as a guard | — |
| K, tidal at the horizon | **12**, **−1.0** | wrong power of r | fails at 4 radii |
| Kruskal UV vs exact | **≤ 6e-12** worst | X²−T² instead | 7e-9 at r = 8 rₛ |
| infall mutations killed | **37 / 37** | — | — |
| Tests | 204 Vitest, 27 Playwright (app) | — | — |

**The methodological point, recorded because it is the thing most likely to be undone later.**
K = 48M²/r⁶ and the tidal component depend on the areal radius *alone*, and r is a coordinate in
three of the four charts. Comparing the charts at the same r compares a number with itself and
passes however wrong the transformations are — the same defect as the r = 1 rₛ Kretschmann check
found in the Phase 2 audit. The module therefore compares at the same physical **events**, labelled
by the faller's proper time, and each chart recovers r through its own inverse: a root-find on
t(r), proper time, a root-find on v(r), and W₀(UV/e). The constraint is expressed in the types —
a route's `fromCoordinates` is handed only its own chart's coordinates, never the radius. Beside
it, the module *shows* the wrong comparison and a test asserts its 745× spread, so the correct one
cannot quietly become vacuous.

**What building part 3 found:**

1. **The Kruskal panel rendered empty**, and no unit test would have caught it. With the time
   origin at r₀ the whole worldline sits between X ≈ 10⁴ and 10⁶. The plane is now anchored at
   V = 1 at the horizon crossing — a boost, so every invariant is untouched — which also turns out
   to make the chart *canonical*, independent of r₀.
2. **X² − T² cannot carry this calculation.** X and T agree to one part in 10⁸ over most of the
   trajectory. The boost moves the ill-conditioning between the ends but never removes it; only
   the product UV is accurate at both. Asserted arithmetically.
3. **Two equivalent mutants** in the first mutation run pointed at dead code rather than weak
   tests: a redundant +∞ branch that also wrongly returned a number inside the horizon, and a
   direction auto-detection that always computed the same answer. Both deleted, the properties
   they assumed asserted directly.
4. **`chartGeometry` had to move to `ui/`** — sims must never import each other. The
   dependency-cruiser rule was verified to actually fire by reintroducing the violation.

### Phase 2 gate table

| Gate | Value | Mutation that trips it | Mutated |
|---|---|---|---|
| Light deflection, solar limb | **1.7512″** (§8 row 2) | drop the space term | 0.8756″ |
| Time-only (Einstein 1911) | **0.8756″** | γ on the time term instead | ratio ≠ 2 |
| Deflection ratio | **exactly 2** (§8 row 3) | `1/β` instead of `1/β²` | slope −1 |
| Space term across the slider | **constant 0.8756″** | make it ∝ β² | fails at 6 speeds |
| Time term log-log slope | **−2.000000000** | any wrong exponent | slope ≠ −2 |
| Linearisation vs exact Newtonian | **<0.02%** at α = 0.01 rad | drop the half-angle | factor 2 |
| Weak-deflection threshold | **β = 0.0206**, v = 6178 km/s | ignore the constant space term | 0.0206 → 0.0206 fails |
| time-dilation mutations killed | **45 / 45** | — | — |
| deflection mutations killed | **29 / 29** | — | — |
| Tests | 158 Vitest, 18 Playwright (app) | — | — |

**What building part 2 found, beyond its own physics.** Three defects that one sim had been
hiding, all now fixed in the shared layer rather than worked around locally:

1. **Shared components had no styles of their own.** `NumberSlider`'s track and thumb and
   `MisconceptionsPanel`'s list and “Myth” tag lived in `lensing.css`. The second sim to use them
   shipped a slider with no visible track. Now `src/ui/components.css`.
2. **The misconceptions trigger button failed WCAG AA in dark mode** (4.46:1) — it had no
   background reset and fell back to the UA grey. The lensing sim passed axe only because its
   heading is 24px and so qualifies for the 3:1 large-text threshold.
3. **The site chrome's `header`/`footer` selectors were unscoped**, so both sims' semantic
   `<header>` inherited `display:flex` and a border-bottom and laid their title block out as a
   wrapping row. Now `.site-header` / `.site-footer`.

And two of my own, found by driving the page rather than by any test:

4. **γ = 0 hung the tab.** The space contribution is exactly zero there, `log10(0)` is `-Infinity`,
   and the decade-tick loop counted upwards from it forever. Axis helpers now refuse a non-finite
   axis; the chart drops a line it cannot draw and says so.
5. **The slider could not reach its own top.** React Aria snaps to a grid anchored at the minimum,
   so with a float step the exhibit opened at β = 0.9844 instead of at light — the single value it
   exists to show. It moves in integer indices now, with both endpoints pinned.

**The lesson for the remaining sims:** typecheck, lint and unit tests were green through all five.
Only rendering the page and reading the screenshot found 3, 4 and 5.

The formulae and their tolerances are settled — see §8's Hafele–Keating block, §7.4 Claim A's
boxed α(β), and §7.4 Claim B's four-chart table. What remains is entirely UI and its tests.

### Phase 2 audit findings *(2026-09-06, commit `4fa3b28`)*

Fifth audit, fifth set of findings. None was a wrong number; three were **omissions that make a
stated ASSERT impossible**, which in a document whose rule is "every value marked ASSERT must have
a corresponding test" is its own kind of error.

1. **§8 rows 8–9 could not be asserted at all** — published predictions given, no flight
   parameters, and the answer is strongly latitude-dependent. Added representative 1971 values;
   they land at −44.5 ns and +256 ns, inside the published −40±23 and +275±21 bands.
2. **A notation trap that deletes the effect.** Both kinematic terms were written with
   `v_ground`, which reads as *the ground station's* speed RΩ. Substituting that gives a
   direction-independent constant and the east/west asymmetry vanishes — the one thing rows 8, 9
   and 19 exist to show. Now `v_air`, with R the distance from the rotation axis.
3. **§7.4 Claim A gave the ratio table but never α(v)**, which is what the slider plots. It
   follows uniquely from the section's own assertions, and says something the table does not: the
   space-curvature contribution is the same 0.8756″ at *every* speed.
4. **§7.4 Claim B named four charts without their transformations.** Added, with the radial-infall
   trajectory and the module's thesis turned into assertions.
5. **A weak test of my own, caught by mutation.** The first Kretschmann check tested only
   r = 1 rₛ, where every power of r gives 12, so a mutation to r⁻⁵ passed — the same tautology
   §2.4 carried before its own audit. Now checked at three radii plus the scaling law.

**One known limitation carried forward**, recorded in full in `DECISIONS.md`: the disk outer-edge
step cap trades radius agreement (2.0e-5 → 4.1e-4) for artefact removal and is float32-fragile for
grazing rays. The replacement is written down — event detection by cubic Hermite root-finding on
the step already taken, which never divides by a small velocity — and is deliberately *not*
implemented yet.

### Step 1 — primary-source audit *(done 2026-09-06, commit `08b0223`)*

Verified §2.2 by differentiating the first integral, §2.4's critical radii, and the §6.5
normalization table. **Found two defects**; both are recorded in `DECISIONS.md`:

- **§2.3's flat-Cartesian force law was wrong.** It read `-1.5 h^2 rhat/r^5` with a *unit* vector;
  `starless` writes `points / r**5` where `points` is the position **vector**, i.e. `rhat/r^4`.
  Corrected to `-3M h^2 rhat/r^4`, derived via Binet and confirmed two independent ways
  (b_crit 2.598076 vs the old form's 1.732051; weak-field deflection converging to 4M/b).
  Later reconfirmed on the GPU: the old law renders the shadow 33% too small.
- **§2.4's "ASSERT all of these" asserted nothing** — `check("Photon sphere / M", 3.0, 3.0, ...)`
  compared the expected value with itself. Now derived by root-finding on the metric. Mutating
  the photon potential or L^2(r) fails six checks. Benchmarks went 32 -> 43.

### Step 4 — anti-aliasing, scaling, accumulation *(done 2026-09-06, commits `b72f227`, `bd08d9d`, `23542b2`)*

**The §4.4/§4.5 audit found five things**; two were prescriptions that cannot be carried out.

1. **`dFdx`/`dFdy` are undefined here.** GLSL ES 3.00 §8.9 leaves implicit derivatives undefined
   under non-uniform control flow, and a raymarcher's loop diverges by construction. Neighbours
   are **traced explicitly**, only for escaped pixels.
2. **`textureGrad()` presupposes a texture** the renderer deliberately does not have. For point
   sources the exact filter is `K(J⁺(ω_s − ω_0))` with `K` normalised in *pixel* space.
3. **"Nearly free visually" was false at hard edges.**
4. **Accumulation's reset requirement was unstated.**
5. 1920×1080×256 = 530.8 M, not 532 M.

| Measurement | Value | Guard mutation | Mutated |
|---|---|---|---|
| Temporal stability, rimRms | **6.81** (baseline 15.09) | drop the many-star limit | 11.87, fails |
| Rim luminance | **21.22** | narrow kernel until rim blanks | 0.11, fails |
| Rim edge sharpness, scale 1.0 vs 0.5 | **110.6 vs 51.6** (2.14×) | — | — |
| Ghosting after camera change | **0** | remove the history reset | 134, fails |
| Accumulation vs explicit mean | **0.75** of one 8-bit level | — | — |

**The stability gate needed two halves, and only a mutation showed it.** Narrowing the kernel until
the rim went black scored rimRms 1.78 — better than correct code — because a blank frame has
nothing to vary. It is now paired with a minimum rim luminance.

The star field is rebuilt on **equal-area** cells (equal-`d(cos θ)` bands, fixed azimuthal count),
which fixed the elongated-blob artefact of the old cube lattice.

### Step 3 — accretion disk *(done 2026-09-06, commits `8a8c45b`, `d1192ca`, `51bdfb9`)*

**The §4.3 audit found two errors, both of the "renders convincingly, is wrong" kind.** Full
detail in `DECISIONS.md`; the short version:

1. **The colour pipeline applied `g` twice.** It said to shift the temperature to `T' = gT` *and*
   multiply radiance by `g^4`. But `g^3 B_{nu/g}(T) = B_nu(gT)` identically — the substitution
   *is* the `g^3`, and Stefan–Boltzmann makes it exactly `g^4` bolometrically. The literal
   pipeline scales brightness as `g^8`. At the ISCO edge-on from 20 r_s the true crescent
   contrast is **76.8**; double-counted it is **5899**.
2. **The "Novikov–Thorne" profile was Shakura–Sunyaev**, i.e. Newtonian. That form over-radiates
   by **43%** and implies **8.33%** radiative efficiency, contradicting §2.4's own asserted
   **5.7191%** in the same document. §4.3 now carries the Page–Thorne integral and its
   closed-form Schwarzschild specialisation, derived and confirmed against an independent
   invariant: `int F_NT(r) E(r) r dr = 1 - sqrt(8/9)` to 1.8e-9.

Smaller fixes: the bolometric relation confused flux with intensity; the `g_grav * Doppler`
factorisation never stated that beta and n-hat must be in the *local static frame*, so §4.3 now
gives a closed form for `g` needing no frame transformation; and `hbar` was declared exact.

New code: `core/schwarzschild.ts` (NT flux, circular-orbit energy, `redshiftFactor`),
`core/color/blackbody.ts` (Planck, Wyman/Sloan/Shirley CMF fits, CIE XYZ, linear sRGB),
`model/camera.ts` (camera basis and launch, shared by CPU and shader), disk crossing with secant
refinement in `model/rayTracer.ts`, and the disk in the shader.

**Each audit finding has its own guard, and each was verified by re-introducing the error:**

| Mutation | Measured | Gate | Result |
|---|---|---|---|
| apply `g` twice | exponent **7.998** | 4.0 ± 0.2 | fails |
| Shakura–Sunyaev flux | temperature error **29.8%** | < 0.2% | fails |
| none (correct) | exponent 4.0019, temp error 0.002% | — | passes |

**One guard was not enough.** The Shakura–Sunyaev mutation initially passed everything, because
emission radius and `g` are identical under either flux law. Only comparing `g*T(r)` catches it.

Two corrections to my own work, both worth knowing about:
- I asserted in the spec that the Planckian locus at 6504 K should hit sRGB's D65 white point. It
  should not: D65 is a *daylight* illuminant ~0.0054 off the blackbody locus. The implementation
  matches the published locus to 0.0001, and a test now pins the distinction.
- The per-pixel comparison reported a 1.8% `g` error against a 2e-5 radius agreement. The cause
  was the harness, not the renderer: diagnostics pack 16 bits across blue and **alpha**, and a
  context created `alpha: false` makes `readPixels` return 255 for alpha. See `DECISIONS.md`.

### Step 2 — minimal correct raymarcher *(done 2026-09-06, commit `5908d25`)*

WebGL2 fragment-shader raymarcher, flat-Cartesian per §2.3, RK4 in Nyström form, adaptive
stepping per §4.2 with the photon-sphere Gaussian narrowing. Star field only, no disk.

| File | What it is |
|---|---|
| `src/core/schwarzschild.ts` | Critical radii in r_s = 1 units, shadow angle, the b -> h conversion |
| `src/core/gl/context.ts` | WebGL2 program/context helpers; every failure reports the driver log |
| `sims/blackhole-lensing/view/lensingShader.ts` | The GLSL. float32, r_s = 1 |
| `sims/blackhole-lensing/view/LensingRenderer.ts` | Renderer class, no React |
| `sims/blackhole-lensing/model/rayTracer.ts` | **float64 CPU mirror of the shader** |
| `sims/blackhole-lensing/model/shadowMeasurement.ts` | The acceptance measurement |
| `harness/lensing.ts`, `lensing-harness.html` | Test fixture, built only under `PHYSICS_HARNESS=1` |
| `e2e/lensing.spec.ts` | The acceptance test |

**The launch conditions are the subtle part — read `DECISIONS.md` before touching them.** A pixel
direction is a direction in the camera's *local orthonormal frame*, so
`b = D sin(theta)/sqrt(1 - r_s/D)`, and the flat system's conserved `h` is not `b` but
`1/h^2 = 1/b^2 + 2M/D^3`. Dropping the first puts the edge 2.63 px off; dropping the second is
worth 0.042%.

The acceptance test is discriminating, not merely green — verified by mutation:

| Shader mutation | Measured | Error | Result |
|---|---|---|---|
| none (correct) | 99.474 px | 0.013 px | passes |
| drop the static-observer sqrt factor | 102.119 px | 2.632 px | fails |
| revert to the old `rhat/r^5` force law | 66.043 px | 33.444 px | fails |

**Known limitation, for step 5:** exposure, tone mapping and star brightness are untuned display
parameters. The physics underneath is verified, so tuning them is a step 5 task with measured
gates to catch regressions. Do not change anything that alters `luminance` before tone mapping. The
tangential smearing *near* the hole is real lensing and correct; the blockiness far from it is
not. §4.4's anisotropic sampling work is the right place to fix this. The shadow measurement uses
the `capture-mask` mode and is unaffected.

## Phase 0 gates — all closed 2026-09-06

1. ~~Verify remote CI after push.~~ **DONE 2026-09-06.** `gh auth login` turned out to be
   unnecessary: the repository is public, so run status reads from the unauthenticated REST API
   (`/repos/boyedandtoyed/Physics/actions/runs`). Run `34018255845` on `3902b97` concluded
   **success** with all 17 steps green, including `npm run arch`, Playwright against the
   production build, both gitleaks scans under the pinned digest and read-only mount, and
   `docker compose build`. Also worth recording: runs on `5c98d55` and `a7417ec` had **already
   concluded success** before this session — the previous "remote execution not verified" note
   was stale, not a failure.
2. ~~Strengthen architecture enforcement.~~ **DONE 2026-09-06, commit `1e13fe1`.** dependency-cruiser
   (`npm run arch`, wired into CI) enforces BUILD_PLAN §5 on the resolved import graph with
   `tsPreCompilationDeps`, so type-only imports count. Seven rules: core is framework-free
   (transitive), sims are islands, sims may only reach core/ and ui/, only the registry knows sims,
   ui does not depend upward, no cycles, no devDependencies in shipped code. **Each rule was
   verified to fire against a deliberately violating fixture**, not trusted because the config
   parsed — that is how the `sims → registry → other sim` backdoor was found and closed, and it
   confirms a two-hop `core → hop → ui` leak is caught where the old ESLint rule missed it.
   Constant centralization is `no-magic-numbers` over core/ and sims/, excluding units.ts and
   tests. See `DECISIONS.md` for why app/ and ui/ are out of that rule's scope.
3. ~~Add lazy-route fixture tests, storage-unavailable startup test, and Newtonian refinement
   coverage.~~ **DONE 2026-09-06.** `src/app/App.test.tsx` (jsdom, opted in per-file so the core
   suite stays in the fast node environment) covers a resolving lazy loader including the Suspense
   fallback, a rejecting loader hitting the error boundary, registry entries rendering in the
   gallery, and startup with `localStorage` throwing on both read and write. **All four were
   mutation-checked**: breaking `getDerivedStateFromError` and the storage guard makes the
   relevant tests fail, so they are not passing vacuously. `keplerReturnError` in
   `integrators.test.ts` adds step-refinement coverage at (e, a) = (0, 1), (0.3, 1), (0.5, 2.5),
   (0.7, 0.4): halving the step divides the closure error by 16.0 ± 5%, showing the residual is
   truncation error rather than a wrong model, and the varying semi-major axis makes closure
   itself a Kepler third-law check. The million-fold-c limit remains an algebraic force check,
   not a full GR orbit integration.
4. ~~Complete visual inspection and asset cache/MIME verification against the deployed
   container.~~ **DONE 2026-09-06.** Chromium launches in this environment now; the earlier
   blocker is gone. Seven full-page screenshots were captured against the container on
   `127.0.0.1:8080` (gallery/method/not-found x light/dark, desktop 1440 and mobile 375) and
   inspected: KaTeX renders in both themes, the disclosure is open by default, mobile stacks
   without horizontal overflow, and the run reported no page errors, no failed requests and no
   4xx/5xx. Screenshots are verification artifacts, not committed.
   Header/MIME verification against the container found and fixed one real defect: **nginx
   1.28's `mime.types` has no `ttf`/`otf` entry, so KaTeX's TrueType fallbacks were served as
   `application/octet-stream`.** `nginx.conf` now maps them in a regex location scoped to those
   extensions, because a `types` block replaces the inherited map wholesale — `woff2` was
   re-checked afterwards to confirm the rest of the map survived. Verified after rebuild:
   `index.html`, `/`, `/method` and unknown routes serve `text/html` with `Cache-Control:
   no-cache`; `/assets/*` serve `public, max-age=31536000, immutable` with `application/javascript`,
   `text/css`, `font/woff2` and now `font/ttf`; `wasm` was already `application/wasm`; gzip
   negotiates on the JS bundle; a missing asset is a genuine 404, not the SPA fallback.
5. ~~Stronger CI pinning and a production-preview browser run.~~ **DONE 2026-09-06.** Playwright
   now builds and serves `dist/` via `vite preview` instead of the dev server, so the E2E and axe
   scans exercise the artifact that actually ships; all 3 tests pass against it. CI actions are
   pinned to commit SHAs (`actions/checkout` `11d5960`, `actions/setup-node` `49933ea`, both v4,
   version recorded in a comment) and gitleaks to digest
   `sha256:e1b35e12a8c6fa8901f060459cfb6b2fc4c484d3afbe3b029733a3bbfab07055`, with its repo mount
   made read-only to match the documented local command. Both scans were re-run locally against
   the pinned digest with the read-only mount and report no leaks.
6. **NEXT — Phase 1.** Begin with a primary-source audit of the rendering equations and
   normalization before writing any shader. Read PHYSICS_SPEC §2.3 (flat-Cartesian formulation,
   the one to use), §4.2 (adaptive stepping), §4.3 (the g^3/g^4 colour pipeline), §4.4
   (screen-space-Jacobian anisotropic sampling — retrofitting this is painful, do it from the
   start), §4.6 (float32 near the horizon) and §6.5 (r_s = 1 in shaders, M = 1 in the core, with
   the conversion in exactly one function — `massLengthToSchwarzschild` already exists).
   Golden values to assert off the rendered frame: photon sphere 1.5 r_s, ISCO 3 r_s,
   b_crit = 3*sqrt(3) M. No Phase 1 files exist yet.

## Decisions and specification clarifications

See `docs/DECISIONS.md`.
- Finite-step orbit closure is not generally machine-precision; §6.3a documents reference equations, truncation/convergence interpretation, and cited sources.
- Kerr spherical-orbit checks remain Phase 4 work, not fake passing tests.
- Corrected README's factor-of-ten Casimir typo: 100 nm pressure magnitude is 13.001 Pa.
- Web-only compose overrides stale cloudflared checklist entries. Do not touch the host tunnel or dormant projects.
- No global store or future simulation directories until needed. Math rendering is lazy-loaded rather than downloaded by the gallery.

## Commands for resuming

```sh
npm ci
npm run typecheck
npm run lint
npm run arch
npm test
npx playwright test --project=lensing   # the Phase 1 acceptance gate
npm run build
npx playwright install chromium
npx playwright test
python3 docs/verify_benchmarks.py
docker compose ps
```

Before each push, scan committed history after the last commit:

```sh
docker run --rm -v "$PWD:/repo:ro" zricethezav/gitleaks:v8.24.3 git /repo --redact
docker run --rm -v "$PWD:/repo:ro" zricethezav/gitleaks:v8.24.3 dir /repo/src --redact
```

The image is local now. Never read or copy credentials into the repository. Docker uses an allowlisted build context.

## Session log

### 2026-09-06 — Foundation implementation and first deployment

Read kickoff and specifications, established a feature branch, implemented/tests-first numerical
foundation, built the shell, added CI and deployed with explicit owner approval. Removed only
a stale empty `.git/HEAD.lock` after owner approval. A planning subagent hit a credit limit;
implementation continued directly. Browser installation recovered automatically from a mirror
timeout. No tests remain failing. Live screenshot and remote CI remain unverified, as above.

**Push result:** SSH push succeeded to `origin/feat/phase-0-foundation` with implementation
commits `3f7c5b0` and `5c98d55`. Git history was scanned after the implementation commit;
no leaks found. GitHub CLI is unauthenticated, so remote CI status remains unverified.

### 2026-09-06 — Phase 0 gates closed and signed off

Closed all five outstanding gates in the order the previous session listed them, taking gate 2
first because architecture enforcement is far cheaper to add before the first sim exists than
after.

Approach worth repeating: **no gate was accepted on the strength of a config parsing or a test
passing.** Every dependency-cruiser rule was checked against a deliberately violating fixture,
which is how the `sims -> registry -> other sim` backdoor surfaced; the new shell tests were
mutation-checked by breaking `getDerivedStateFromError` and the storage guard to confirm they
fail; and the Newtonian closure claim was replaced with step-refinement evidence rather than a
single tolerance at one step size.

Two real defects were found this way, neither previously known:

1. KaTeX's `.ttf` fallbacks were served as `application/octet-stream` — nginx 1.28's `mime.types`
   has no ttf/otf entry. Fixed in a scoped regex location; see `DECISIONS.md` for why not a
   server-level `types` block.
2. A sim could have reached every other sim transitively through the registry. Closed before any
   sim exists to exploit it.

One correction to the record: PROGRESS.md said remote CI execution was unverified. It had in fact
already passed twice; the repository is public, so no `gh` authentication was ever needed to check.

Environment note: Chromium launches here now, so the previously blocked screenshot run completed.
Seven full-page captures across themes and viewports were inspected, with no page errors, failed
requests or horizontal overflow. Screenshots are verification artifacts and are not committed.

**Result:** typecheck, lint, arch, 29 unit tests, 32 Python benchmarks, production build, 3
Playwright/axe tests against `dist/`, both gitleaks scans and `docker compose build` all pass
locally and on remote CI (run `34018255845`, conclusion success).

### 2026-09-06 — Phase 1 opened: source audit and a gated raymarcher

Closed the five Phase 0 gates, merged to `master`, then began Phase 1 in the required order.

The source audit earned its place immediately: PHYSICS_SPEC §2.3's renderer force law was wrong,
in the specific way that would have produced a plausible-looking image that quietly failed the
phase acceptance test by 33%. It was caught before a line of shader code existed, by deriving the
law from Binet and checking it against two independent observables. A second finding — that
§2.4's critical radii were "asserted" against themselves — means the benchmark suite now actually
constrains the geometry.

The raymarcher then landed with its acceptance harness built in the same step, as instructed
rather than deferred, and the harness was mutation-tested against two deliberately wrong shaders
before its passing result was believed.

Nothing is registered in the gallery. Steps 3 (disk), 4 (anisotropic sampling, resolution
scaling, accumulation) and 5 (controls, physics panel, a11y) remain.

### 2026-09-06 — Phase 1 step 3: the accretion disk

Audited §4.3 before writing code, as instructed and as §2.3 had been. It found two errors again,
and this time both were the kind that produce a beautiful, confident, wrong picture: a redshift
factor applied twice (brightness scaling as g^8 instead of g^4, a crescent contrast of 5899
instead of 76.8), and a Newtonian flux profile shipped under the Novikov-Thorne name, whose
implied 8.33% radiative efficiency contradicted §2.4's own 5.7191% in the same file.

The instruction to make disk correctness measurable before tuning appearance was the right call
and paid off twice over. Building the guards surfaced that one guard did not cover the other
finding — the Shakura-Sunyaev mutation sailed through every test until a shifted-temperature
comparison was added — and it surfaced a bug in the measuring apparatus itself, where an
`alpha: false` context corrupted the diagnostic readback and mimicked a 1% physics error for long
enough to be worth documenting.

Nothing was tuned for looks until all of that passed. Exposure and peak temperature are display
parameters and are labelled as such.

Still not registered in the gallery. Steps 4 (anisotropic sampling, resolution scaling,
accumulation) and 5 (controls, physics panel, a11y) remain.

### 2026-09-06 — Phase 1 step 4: anti-aliasing, scaling, accumulation

Audited §4.4/§4.5 first. Third audit, third set of findings — this time not wrong numbers but two
prescriptions that cannot be carried out: hardware derivatives are undefined in a raymarcher's
divergent loop, and `textureGrad()` needs a texture this renderer deliberately does not have.

Making stability a number before tuning it earned its keep in an unexpected way. Establishing the
baseline was routine; *verifying the guard* is what exposed that the metric was unsound. A mutation
that blanked the rim scored better than the correct filter, because variance rewards an empty
frame. The gate now has two halves, each verified by the mutation that trips it. That failure would
have been invisible without running the mutation.

**A note against myself:** the step 4 handoff commit corrupted this file. A `str.replace` on an
empty slice — the two `s.index` anchors were in the wrong order — inserted a paragraph between
every character, leaving 127,332 lines. It was committed and pushed, and CI passed because nothing
validates the markdown. Restored from `23542b2` and re-applied with asserted anchors. Lesson worth
keeping: the checks in CI cover code, not documentation, so doc edits need their own verification.

### 2026-09-06 — Phase 1 complete, merged and deployed

Step 5 built the UI: controls for mass, distance, inclination, disk, quality and the
physical-vs-cinematic toggle; the physics panel; a misconceptions panel led by the shadow-versus-
horizon confusion, showing 1.000 rₛ against 2.598 rₛ side by side; keyboard camera and a live
screen-reader description. axe passes in both themes.

Appearance was tuned only after the gates existed, and the stability gate had to be repaired
first: it was an absolute variance threshold, so brightening the stars would have tripped it
though nothing about the filtering changed. It is now `rimRms / rimMean`, which is immune to
brightness and still catches a blank frame.

Three defects surfaced during the build, the first the most interesting. Progressive refinement
oscillated between resolution scales — slow at full, fast when reduced — re-rendering forever,
which froze every Playwright actionability check while the page looked perfectly fine to a human.
It now ratchets downward only. The disk's outer edge was scalloped because a grazing ray could
step across the plane and back inside one step. And React Aria's disclosure headings skipped a
level, which axe caught.

CI failed once on this branch, on time rather than behaviour: the browser tests drive a raymarcher
and CI has no GPU, so WebGL falls back to SwiftShader on two vCPUs. Reproduced locally by pinning
to two cores — the stability measurement takes 57 s against Playwright's 30 s default — and fixed
by giving those projects a realistic timeout.

Merged to `master` at `7bd6e70`, container rebuilt, and the live site verified end to end: the
Collection page lists the simulation, the link resolves, and the canvas renders through the public
HTTPS host.

### 2026-09-06 — Phase 1 landed; Phase 2 audited

Phase 1 merged at `7bd6e70`, container rebuilt, live site verified end to end through the public
HTTPS host: the Collection page lists the simulation, the link resolves, the canvas renders.

Then audited the Phase 2 sections before writing any Phase 2 code, as with every prior step. The
pattern held for a fifth time. Nothing was numerically wrong this time; three sections named an
ASSERT while omitting what the assertion needs, and one carried a notation ambiguity whose natural
misreading removes the effect being demonstrated.

The finding worth carrying forward is the one against myself. My first Kretschmann check tested a
single radius at which every exponent gives the same answer, so a deliberately wrong power passed
it. I only found that because I wrote the mutation — the check read perfectly well. That is now
three separate occasions in this project where writing the mutation, not writing the test, is what
exposed a bad gate.

Stopped here rather than starting part 1: the audit is a complete, coherent unit with everything
green, and beginning a three-part interactive at the end of a long session would have left a
half-built stage. All formulae and tolerances the three parts need are now settled and tested.
