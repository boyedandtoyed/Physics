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
