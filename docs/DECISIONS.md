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
