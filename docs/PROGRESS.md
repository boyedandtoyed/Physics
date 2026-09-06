# Progress Log

## Current status — 2026-09-06

**Phase:** 1 — The black hole. Steps 1, 2 and 3 of 5 are done and verified. Phase 0 is signed off
and merged to `master`.
**Branch:** `feat/phase-1-blackhole` (branched from `master` at `49a6bf2`).
**Live:** https://abstract-physics.binodtiwari.com serves the foundation shell (HTTP 200).
**The lensing sim is deliberately NOT in `registry/sims.ts`** and must not be until step 5 is
finished — the gallery must not advertise an unfinished simulation.

**The acceptance suite passes (8 tests).** Run it with `npx playwright test --project=lensing`.
- Shadow radius off a real GPU frame: 99.474 px vs 99.487 px predicted, **0.013 px** error
  against the one-pixel gate, holding across three camera distances and fields of view.
- Disk: shader vs float64 model agree to **3e-5** on emission radius, g and g*T, with **zero**
  hit/miss disagreements over 2500 sampled pixels.
- Doppler exponent measured off the frame: **4.0019** (correct is 4; double-counting reads 8).

## Done and verified

- Vite 7, React 19, TypeScript 5.9 strict / noUncheckedIndexedAccess, reproducible npm lockfile.
- CODATA/reference constants in `src/core/units.ts`; hbar derived from exact h, solar GM kept separate from rounded solar mass.
- In-place float64 RK4, velocity Verlet, Yoshida-4 with reusable scratch buffers and documented callback/aliasing contracts.
- **29 Vitest tests pass:** convergence ratios, reversibility, negative Yoshida substep, non-autonomous RK4 stages, oscillator energy over 1,000 periods, circular/eccentric Newtonian closure, angular momentum, Schwarzschild circular effective-potential equilibrium, formal million-fold-c limit, dimension/alias validation, constants, fourth-order Kepler step-refinement at four (e, a) pairs, and the shell's lazy-route/storage tests.
- **Typecheck and ESLint pass. Production build passes.**
- **72 Vitest tests and 11 Playwright tests pass** (8 of the latter are the lensing acceptance
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

**NEXT: step 4** — screen-space-Jacobian anisotropic star sampling (§4.4), resolution scaling and
temporal accumulation (§4.5). Then step 5 (controls, KaTeX physics panel, keyboard camera,
screen-reader summary), and only then register the sim.

§4.4 is also where the **known star-field limitation** below should be fixed. Audit §4.4/§4.5
against their sources first, as for §2.3 and §4.3 — both audits found real errors.

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

**Known limitation, for step 4:** the procedural star field hashes on a cube-cell grid, so cells
have very uneven solid angle and distant stars render as elongated blobs rather than points. The
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
