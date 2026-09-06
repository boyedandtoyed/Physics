# Architecture decisions

## 2026-09-06 — Float64 numerical API

Integrators mutate caller-owned Float64Array state and reuse per-instance scratch buffers.
Callbacks fill output buffers without mutating input or retaining references. Instances are
not reentrant. Symplectic solvers require autonomous position-only acceleration, fixed
steps, and non-overlapping position/velocity storage. Signed steps permit reversal and
Yoshida's essential negative middle substep. Mathematical weights stay near the algorithms;
physical constants belong exclusively in core/units.ts.

## 2026-09-06 — Explicit numerical accuracy gates

Finite-step integration cannot generically produce machine-precision ellipse closure.
PHYSICS_SPEC §6.3a distinguishes analytic limits, truncation error, and convergence.
Phase 0 tests use oscillator and Newtonian two-body references. Kerr-dependent accuracy
checks are deferred to Phase 4, not represented as passing placeholders. Reduced Planck's
constant is derived from h/(2π), not the rounded printed decimal.

## 2026-09-06 — Honest empty collection

No simulation is ready in Phase 0, so the registry is empty and the gallery explicitly says
so. The first experiment is described as upcoming, not given a fake launch control. KaTeX
and its accessible disclosure are lazy-loaded on the methodology page. Native theme controls
follow system preference unless explicitly overridden; storage failure is non-fatal.

## 2026-09-06 — Shared tunnel remains host-owned

The newer deployment documentation supersedes stale cloudflared checklist items. Compose
contains only the web service, published to 127.0.0.1:8080. Do not alter Cloudflare or other
projects. Node 20.20.2 already supports Vite 7; no host runtime change is needed.

## 2026-09-06 — Architecture boundaries enforced on the import graph, not per file

BUILD_PLAN §5's boundaries were only partially enforceable in ESLint, which sees one file at
a time. Two rules that matter most cannot be expressed that way: "core/ must not reach React
or a sim through *any* chain of imports", and "no sim may reach another sim". Both are
invisible to a per-file linter once an intermediate hop exists.

dependency-cruiser (`npm run arch`, in CI) now enforces the whole layering on the resolved
graph, with `tsPreCompilationDeps` so type-only imports count as real edges. Seven rules:
core is framework-free (transitive), sims are islands, sims may only reach core/ and ui/,
only the registry knows sims, ui does not depend upward, no cycles, no devDependencies in
shipped code. Each rule was verified to fire against a deliberately violating fixture before
being trusted — including a two-hop `core → hop → ui` leak that the previous ESLint rule
missed. The `sims → registry → other sim` backdoor was found this way and closed.

The ESLint `no-restricted-imports` rule stays as the fast in-editor signal for the common
direct case. Constant centralization is `no-magic-numbers` scoped to core/ and sims/,
excluding units.ts and tests, allowing small algebraic integers (2, 3, 6, 0.5 …) because a
factor of two in an integrator is method arithmetic, not a measured quantity. app/ and ui/
are deliberately out of scope: a layout number is not a physical constant, and forcing names
onto them would dilute the rule until it gets switched off.

## 2026-09-06 — E2E runs against the production bundle, not the dev server

Playwright previously drove `vite run dev`. The dev server has a different module graph, no
minification and different asset handling, so a green run said little about what users receive —
and the axe accessibility scans, which are the point of the suite, were auditing a build that is
never shipped. The `webServer` command now runs `npm run build && vite preview` over `dist/`.
Cost is roughly four seconds of build per run; the benefit is that the chunk-split, minified
bundle with lazily-loaded KaTeX is what gets scanned.

## 2026-09-06 — Font MIME types are patched in a scoped location, not a global types block

nginx 1.28's bundled `mime.types` maps `wasm`, `woff` and `woff2` but not `ttf` or `otf`, so
KaTeX's TrueType fallbacks were served as `application/octet-stream`. The obvious fix — a
`types { ... }` block in the server context — is wrong: `types` *replaces* the inherited map
rather than extending it, which would have silently broken every other content type on the site.
Editing the base image's `mime.types` with `sed` in the Dockerfile was rejected as brittle across
base-image updates. The block is therefore scoped to a regex location matching only `ttf|otf`,
where a wholesale replacement is harmless. That regex location outranks the `/assets/` prefix
location, so the immutable cache header is repeated inside it. `woff2` is re-checked after any
change here to confirm the inherited map is intact.

## 2026-09-06 — CI supply chain pinned by SHA and digest

Actions are referenced by commit SHA with the version in a trailing comment, and gitleaks by
image digest. A mutable tag means a third party can change what executes against this workflow's
token without any change landing in this repository. The gitleaks repo mount is read-only; a
scanner needs no write access to what it scans.

## 2026-09-06 — Phase 1 source audit: PHYSICS_SPEC §2.3 was wrong, and §2.4 was not asserted

The audit BUILD_PLAN requires before writing shader code found two defects. Both would have
surfaced later as a mysteriously failing acceptance test, which is exactly what the audit is for.

**§2.3's flat-Cartesian force law was wrong.** It read
$\ddot{\mathbf r} = -\tfrac32 h^2\hat{\mathbf r}/r^5$ — a *unit* vector over $r^5$. `starless`
writes this in code as `-1.5 * h2 * points / r**5` where `points` is the position **vector**, so
the expression is $\hat{\mathbf r}/r^4$. Transcribing it with a hat silently loses a factor of
$r$. The literal form is dimensionally inconsistent and does not reduce to §2.2.

The correct law is $\ddot{\mathbf r} = -3Mh^2\hat{\mathbf r}/r^4$, which is $-\tfrac32
h^2\hat{\mathbf r}/r^4$ in the $r_s=1$ shader normalization. Derived from Binet
($u''+u = -a_r/(h^2u^2)$, cross-checked against Kepler) and confirmed numerically two
independent ways: the capture threshold gives $b_{\rm crit} = 2.598076$ against the required
$3\sqrt3 M = 2.598076$ (the old form gave 1.732051, a shadow **33% too small**), and weak-field
deflection converges to $4M/b$ as $b$ grows (the old form was off by two orders of magnitude).
The Binet reduction is now a permanent check in `verify_benchmarks.py`.

**§2.4's "ASSERT all of these" was not asserting anything.** The checks read
`check("Photon sphere / M", 3.0, 3.0, ...)` — the expected value hardcoded on both sides of a
comparison that cannot fail. Photon sphere, ISCO, $b_{\rm crit}$ and ISCO efficiency are now
derived by root-finding on the metric: the photon sphere from $dV_{\rm photon}/dr = 0$,
$b_{\rm crit}$ by minimising $b(r) = r/\sqrt{1-2M/r}$, the ISCO by minimising
$L^2(r) = Mr^2/(r-3M)$, plus the marginally bound orbit, ISCO local velocity $c/2$ and specific
energy $\sqrt{8/9}$. Verified by mutation: perturbing the photon potential or $L^2(r)$ fails six
checks. Benchmark count went 32 -> 43.

Consequence for Phase 1: implement the boxed §2.3 equation, not any remembered form of it, and
treat $b_{\rm crit} = 3\sqrt3 M$ measured off the rendered frame as the acceptance test.

## 2026-09-06 — Ray launch uses the static observer's frame, not the raw pixel direction

The naive reading of §2.3 is to launch the flat-Cartesian ray straight down the pixel direction
with |v| = 1. That is wrong twice over, and both corrections were measured on a rendered frame:

1. **Static-observer factor.** The pixel direction is a direction in the camera's *local
   orthonormal frame*, so b = D sin(theta)/sqrt(1 - r_s/D). Dropping the square root puts the
   shadow edge 2.63 px off at D = 20 in a 900 px frame — a clear acceptance-test failure.
2. **h is not b.** Matching first integrals gives 1/h^2 = 1/b^2 + 2M/D^3. Worth 0.042% at
   D = 20: below the one-pixel gate on its own, but exact and nearly free, so it is kept.

Both were verified by mutation against the acceptance test rather than argued from the algebra
alone. With both applied the measured shadow radius is 99.474 px against a predicted 99.487 px,
an error of 0.013 px.

## 2026-09-06 — The acceptance test measures a capture mask, and the measuring stick is itself tested

Measuring the shadow edge against a star field means detecting "black hole" against "mostly black
sky", which is not a robust edge. The shader therefore has a `capture-mask` mode: identical
integration and identical launch conditions, differing only in the final colour assignment
(escaped white, captured black). It is a diagnostic view, not a separate code path, so it cannot
drift away from what the star-field mode renders.

`measureShadowRadius` lives in the sim's model rather than inline in the Playwright spec, so it
can be unit-tested against synthetic discs of exactly known radius. It recovers those to better
than 0.5 px and refuses to report at all when the centre is not inside the shadow or the disc is
clipped by the frame. A measurement routine nobody has checked is not evidence.

## 2026-09-06 — The acceptance harness is a separate build, not a route

The sim is not in `registry/sims.ts` and must not be until it is finished, but the acceptance
test needs a real GPU frame from a real page. `harness/lensing.ts` plus `lensing-harness.html`
provide one, built only when `PHYSICS_HARNESS=1`, which only Playwright's second web server sets.
The shipped Docker image never contains it — verified by checking `dist/` after a normal build.

It sits outside `src/` deliberately: that keeps `only-the-registry-knows-sims` true for
everything in the app, and a new dependency-cruiser rule forbids anything under `src/` from
importing the harness, so the fixture cannot leak into the product.

## 2026-09-06 — Phase 1 §4.3 audit: the g factor was applied twice, and "Novikov–Thorne" wasn't

The §4.3 audit, run before any disk code, found two errors of the same character as the §2.3
one: each produces a picture that looks convincing and is quantitatively wrong.

**1. The colour pipeline double-counted the redshift.** It said to shift the temperature to
T' = gT *and then* multiply radiance by g^4 (bolometric) or g^3 (per band). But
g^3 B_{nu/g}(T) = B_nu(gT) identically — the substitution T -> gT *is* the g^3, and
Stefan–Boltzmann turns it into exactly g^4 bolometrically. Applying g again makes brightness
scale as **g^8**. Verified to 3.6e-15 over a grid of g, T and nu.

The consequence is not subtle. At the ISCO viewed edge-on from r_obs = 20 r_s, the true
approaching/receding bolometric contrast is **76.8**; the double-counted pipeline gives **5899**.
That would have looked spectacular, which is exactly why it needed a number rather than an eye.
§4.3 now says to take luminance-normalised chromaticity at T' = gT and brightness from sigma T'^4,
and states explicitly not to multiply again.

**2. The "Novikov–Thorne" temperature profile was Shakura–Sunyaev.** The printed
T ∝ r^-3/4 [1 - sqrt(r_in/r)]^1/4 is the Newtonian solution. Novikov–Thorne is that times
relativistic correction factors. The difference is large and, worse, self-contradictory: the
Newtonian form over-radiates by 43% in total and implies a radiative efficiency of 8.33%, while
§2.4 of the same document asserts 5.7191%. The flux ratio SS/NT is 7.2 at r = 6.5M and 2.7 at 8M,
and the peak sits at 8.16M instead of 9.55M.

§4.3 now carries the Page–Thorne integral and its closed-form Schwarzschild specialisation,
derived here: with E - Omega L = sqrt(1-3M/r) and dL/dr = (r-6M)/[2(r-3M)^{3/2}] the integral is
elementary under x = sqrt(r). **The derivation is confirmed by an independent invariant** —
int F_NT(r) E(r) r dr = 1 - E_isco = 1 - sqrt(8/9), to 1.8e-9. The E(r) weight is the redshift of
locally emitted radiation to infinity; dropping it is a 1.9% error, which is how the check earned
its keep. All of this is now pinned in `verify_benchmarks.py`.

**3. Two smaller fixes.** The bolometric relation was written F^obs ∝ g^4 I^em, mixing flux with
intensity. And the g_grav · D factorisation is exact only when beta and n-hat are measured in the
*local static frame at the emission point*; §4.3 never said so. Rather than rely on that, §4.3 now
gives the closed form g = sqrt(1-3M/r) / [(1 - Omega b_phi) sqrt(1 - r_s/r_obs)], which needs no
frame transformation and uses b_phi = L_z/E, a quantity the raymarcher already carries. It agrees
with the decomposition to 5e-16.

Also corrected in passing: `verify_benchmarks.py` declared hbar as "exact", contradicting §1 and
`units.ts`. It is now derived from the exact h as h/(2*pi).

## 2026-09-06 — Disk correctness is measured off the frame, and each audit finding has a guard

The §4.3 audit found two errors. Both are now caught by measurements taken from a real GPU frame,
and both guards were verified by deliberately re-introducing the error:

| Mutation | What the harness reads | Gate | Result |
|---|---|---|---|
| apply `g` a second time | Doppler exponent **7.998** | 4.0 ± 0.2 | fails |
| Shakura–Sunyaev flux law | shifted-temperature error **29.8%** | < 0.2% | fails |
| correct code | exponent 4.0019, temperature error 0.002% | — | passes |

The exponent is measured, not inferred: mirror-image pixels sample the same emission radius, so
the luminance ratio is purely `(g_left/g_right)^n`, and `n` is read straight off the frame.

**The second guard exists because the first was not enough.** The Shakura–Sunyaev mutation
initially passed every test: emission radius and `g` are identical whichever flux law is used, so
only a comparison of the shifted temperature `g*T(r)` catches it. A guard for one finding is not a
guard for the other.

Alongside those, `measureDisk` compares the shader against the float64 model per pixel — emission
radius, `g` and `g*T` — and agrees to ~3e-5 with zero hit/miss disagreements over 2500 samples.
`measureCrescent` then checks the asymmetry survives the colour table and tone mapping into the
finished image, because §4.3 requires physical mode to be the default and DNGR's softened,
symmetric disk to be explicitly rejected.

## 2026-09-06 — `alpha: false` silently corrupted the diagnostic readback

Worth recording because it cost real time and mimicked a physics bug. The per-pixel comparison
reported the emission radius agreeing to 2e-5 while `g` disagreed by 1.8% — a thousandfold
mismatch that no float32 argument explains.

The cause was the measuring apparatus, not the renderer. The diagnostic modes pack two 16-bit
values across RGBA, the second spanning blue and **alpha**. The WebGL context was created with
`alpha: false`, so the drawing buffer has no alpha channel and `readPixels` returns 255 for every
pixel — destroying the low byte of the second value. That predicts an error of up to
`4 * 255/65535 = 0.0156` in `g`, which is exactly what was observed.

The tell was that the model was *exactly* antisymmetric across mirror pixels, as the geometry
demands, while the shader was not. Symmetry that the physics guarantees is a good place to look
when a discrepancy has no numerical explanation.

`createContext` now takes an explicit `alpha` option, documented with this failure, and it stays
off for the shipped renderer, which wants an opaque buffer.

## 2026-09-06 — Phase 1 §4.4/§4.5 audit: a prescription that cannot compile, and an over-claim

Third audit, third set of findings. These are less dramatic than the §2.3 force law or the §4.3
double-counted `g` — none of them produces a wrong number — but two of them would have sent the
implementation down a path that does not work.

**1. `dFdx`/`dFdy` are undefined in this shader.** §4.4 said to "finite-difference the
neighbouring pixels' escape directions". The natural GPU reading is hardware derivatives, and
that is invalid here: GLSL ES 3.00 §8.9 makes implicit derivatives undefined under non-uniform
control flow, and a raymarcher's loop diverges by construction — every pixel breaks at a
different iteration, on capture, on a disk hit, or on escape. The neighbours must be *traced*,
not differenced from the quad. Two extra rays, and only for pixels that escaped.

**2. `textureGrad()` presupposes a texture we deliberately do not have.** The star field is
procedural, chosen in step 2 so the page ships no asset and stays inside a strict content policy.
The prescription is therefore not executable as written. For a field of *point* sources there is
something better than an approximation anyway: the exactly-filtered contribution of a star is
`K(J^+ (omega_s - omega_0))` for a pixel-space reconstruction kernel `K` normalised to unit
integral. Flux conservation falls out — where the map stretches, each star contributes less to a
given pixel and proportionally more stars land in the footprint.

**3. "Nearly free visually" was justified by a false premise.** §4.5 defended 0.5-0.7x resolution
scaling on the grounds that the image is "a smooth warped skybox". The star field is smooth; the
shadow rim and the disk's inner edge are hard discontinuities, and bilinear upsampling softens
precisely those. The claim now carries an ASSERT: the shadow gate is evaluated at scale 1.0 and
the degradation at reduced scale is measured rather than assumed.

**4. Temporal accumulation had an unstated precondition.** "Accumulate while the camera is
static" describes when it helps but not what the implementation must do: the history has to be
*discarded* on any camera or parameter change, or the accumulator smears old geometry into the
new frame. The jitter also has to be zero-mean, or accumulation converges to a biased image
rather than the supersampled one.

**5.** 1920x1080x256 = 530.8 M, not 532 M.

§4.5 now also requires temporal stability to be a *number* with a recorded baseline, and requires
the guard to be verified by re-introducing point sampling — the same discipline that caught the
`g` and flux-profile regressions in step 3.

## 2026-09-06 — Step 4: what the §4.4/§4.5 measurements actually showed

Every claim below is a measured number with a mutation that trips it, per §4.5's own ASSERT.

**Anisotropic filtering works, and the gate needed two halves.** Baseline for the point-sampled
cube-cell field on a fixed scene: rimRms **15.09**, frameRms **8.94**. After the rebuild: **6.81**
and **3.97**.

Verifying the guard taught me the gate was unsound. A mutation that narrowed the reconstruction
kernel until the rim went black scored rimRms **1.78** — *better* than the correct filter — because
a blank frame has nothing to vary. **A variance metric alone rewards rendering nothing.** The gate
is now variance AND a minimum rim luminance, and each half is verified by the mutation that should
trip it: the blank frame fails on rimMean 0.11, and dropping the many-star limit fails on rimRms
11.87.

**Resolution scaling is not "nearly free".** Steepest radial luminance step across the shadow rim:
**110.6** at scale 1.0 against **51.6** at 0.5 — a **2.14×** loss of edge sharpness. The star field
is smooth and upsamples well; the silhouette does not. Diagnostic modes therefore always render at
scale 1.0 and bypass accumulation entirely — they encode data, not colour, and averaging or
bilinearly filtering an encoded value corrupts it.

**The accumulation reset is not optional.** With it, a frame taken after a camera change differs
from a fresh frame by **0**. Without it, by **134** of 255. That is the ghosting the earlier §4.5
described only implicitly by saying accumulation applies "when the camera is static".

**Accumulation converges.** Against an explicit mean of the same Halton jitters, the accumulator
differs by **0.75** of one 8-bit level — the buffer is half-float where the driver allows it,
because averaging in 8-bit biases the result rather than converging to the supersampled image.

**Star field rebuilt on equal-area cells.** Bands of equal d(cos theta) have equal solid angle, so
giving each the same number of azimuthal cells makes every cell exactly 4*pi/(N*M) steradians. The
old cube lattice varied several-fold in cell solid angle and was strongly anisotropic near the
corners, which is what rendered distant stars as elongated blobs.

Step 2 and 3 gates are unchanged throughout: shadow error 0.013354 px, disk agreement 2-3e-5,
Doppler exponent 4.0019, crescent 3.02.

## 2026-09-06 — Step 5 audit: the performance budget counted one ray per pixel, not three

**§4.5's step count contradicted §4.4.** The 531 M steps/frame figure assumes one ray per pixel,
but the screen-space Jacobian §4.4 requires needs two extra traced rays for every escaped pixel.
An all-sky 1080p frame at 256 steps is ~1.6 G steps. The two sections were written independently
and never reconciled; §4.5 now says so.

**The fps claim itself holds.** Measured on the project machine's Quadro M5000 through ANGLE/
OpenGL 4.5: 32.4 fps at 1080p native with the disk on, inside §4.5's predicted 30-60 fps band.
BUILD_PLAN's 60 fps target is met at resolution scale 0.7 (72.6 fps) — one of the two mitigations
§4.5 already marks *required*, so the target is met as written rather than by relaxing it.

**A measurement trap worth recording.** `gl.finish()` does not block in Chromium: commands cross
into the GPU process and the call returns before the work completes. Timing on `finish()` alone
reported **8700 fps at 1080p** — 0.1 ms for 1.6 billion integration steps, which is impossible on
its face and is why it was caught. Forcing a one-pixel `readPixels` after each frame produces a
real round trip. Any future performance number in this project must sync that way.

**Accessibility gap specific to this sim.** BUILD_PLAN §6 requires a screen-reader description of
scene state, and a WebGL canvas is inherently opaque to assistive technology — it has no
structure to read. The canvas therefore carries `role="img"` with a label summarising the physics,
backed by a throttled ARIA live region carrying the numbers that change. `prefers-reduced-motion`
suppresses the idle accumulation loop rather than only easing a transition, since the loop is the
motion.

## 2026-09-06 — Step 5: the UI, and three defects the build surfaced

**Progressive refinement must ratchet, not oscillate.** The renderer starts at a fraction of the
target resolution and grows only while frames stay fast, because one full-resolution frame on a
software renderer or weak integrated GPU blocks the main thread for seconds — long enough to
freeze input and assistive technology before the user can reach a control. The first attempt
allowed the scale to grow *and* shrink, which flip-flopped: at full scale the frame was slow, at
the reduced scale it was fast, so it alternated forever, and because each flip set React state the
component never stopped re-rendering. The page looked fine to a human and every Playwright
actionability check timed out. Once a frame has been slow the scale is now locked downward.

**The disk's outer edge was scalloped.** A ray grazing the disk plane could step across it and
back inside one step, so the sign-change test never fired. The step is now capped near the plane
in both the shader and the CPU model. This costs agreement: the shader-vs-model figures went from
2e-5 to 4e-4 (gate 1e-3), because the cap divides by |v_y|, which is small for grazing rays and
therefore float32-sensitive. Verified it is not step-budget exhaustion — identical at 500, 900 and
1400 steps — and that a gentler cap does not recover it (4.26e-4), so the cost is inherent to
having any y-dependent step. Worth it: the artefact was plainly visible.

**Heading order.** React Aria's `Heading` inside a `Disclosure` does not default to a level that
follows the page's `h1`, so axe reported an invalid heading order on both panels. Both now pass
`level={2}` explicitly.

**Appearance tuning, with before/after on every gate.** Exposure 1.6 → 0.9 and star flux
0.85 → 2.4. The stability gate had to be made scale-invariant first: it was an absolute variance
threshold, so brightening the stars would have tripped it even though nothing about the filtering
changed. The gate is now `rimRms / rimMean`, which is immune to brightness and still catches a
blank frame (the mean collapses faster than the variance).

**Measured frame rate, 1080p, Quadro M5000, 320 steps/ray, disk on, median of five runs of twenty
frames:** 29.3 fps at native, **64.7 fps** at the shipped default scale of 0.65. BUILD_PLAN's
60 fps target is met with §4.5's required resolution scaling, and the figure is measured, not
asserted.

**Test note:** React Aria puts `role="switch"` on a visually hidden input, so a Playwright click
must target the label, not the role. Not a product defect — the pattern is correct and axe accepts
it — but it looks like one from a failing test.

## 2026-09-06 — KNOWN LIMITATION: the disk step cap is a stopgap, not the right fix

**What is there now.** Near the disk plane the integration step is capped at
`0.5 * |y| / |v_y|`, so a ray cannot straddle the plane inside one step. This removed a visible
artefact — the disk's outer edge rendered scalloped, because a grazing ray stepped across the
plane and back and the sign-change test never fired.

**What it costs.** Shader-versus-float64-model agreement on emission radius went from **2.0e-5 to
4.1e-4** (gate 1e-3). The cause is the division by `|v_y|`, which is small precisely for the
grazing rays that need the cap, so the step length is float32-fragile exactly where it matters.
Confirmed it is not step-budget exhaustion (identical at 500, 900 and 1400 steps/ray) and not the
cap's aggressiveness (a gentler cap gives 4.26e-4). The cost is inherent to making the step length
depend on `y`.

**The better fix, for a later pass — do not confuse this with a TODO to tune constants.**
Replace step-size capping with **event detection on the step already taken**:

1. Take the RK4 step unconditionally, at the normal adaptive length.
2. Build the cubic Hermite interpolant of `y(t)` over that step from the four values already in
   hand — `y0, v_y0` at the start and `y1, v_y1` at the end.
3. Root-find `y(t) = 0` on the interpolant over `t ∈ [0, 1]`.

This is strictly better on three counts. It catches a **crossing-and-return inside one step**,
which the sign-change test cannot see at all and which the cap only avoids by making steps small
enough that it becomes unlikely. It **never divides by a small velocity**, so the fragility
disappears and the agreement figure should return to the 1e-5 range. And it **costs nothing extra**
in integration steps, because it reuses the endpoints of a step that was taken anyway — the cap,
by contrast, buys its safety with many short steps near the plane.

The cubic is the natural interpolant here because the integrator already supplies both the value
and the derivative at both ends, which determines it uniquely. A quadratic would not capture a
crossing-and-return; a linear interpolation is what the current secant refinement effectively
assumes between its endpoints.

Not implemented now: Phase 1 is landing, the artefact is gone, and the agreement figure is inside
its gate with margin. Recorded so the next pass changes the approach rather than the constants.
