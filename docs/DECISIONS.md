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
