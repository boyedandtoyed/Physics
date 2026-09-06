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
