# Progress Log

**This is the handoff document. Every session reads it first and updates it as it works.**

Keep it current *during* the session, not at the end — a session can be cut off without warning.
It must always answer: what is done, what is half-done and exactly where, what is next, what was
decided, what is broken.

---

## Current status

**Phase:** 0 — Foundation. Not started.
**Repo state:** Documentation only. No application code yet.
**Deployed:** No.

## What exists

| Item | State |
|---|---|
| `PROMPT.md` | Complete — the kickoff prompt |
| `CLAUDE.md` | Complete — standing rules |
| `docs/BUILD_PLAN.md` | Complete — phases, stack, architecture, deploy, checkpoint protocol |
| `docs/PHYSICS_SPEC.md` | Complete — equations, constants, benchmarks, honest-physics rules |
| `docs/PROGRESS.md` | This file |
| `docs/DECISIONS.md` | Not yet created — create it when the first non-obvious choice is made |
| Application code | None |

## Next task

**Phase 0, in this order:**

1. Scaffold Vite + React 19 + TypeScript 5.9 strict. `.gitignore` covering `.env*`, `*.pem`,
   `*credentials*.json`, `*api*.txt`, `node_modules`, `dist` — **in the first commit.**
2. `core/units.ts` — CODATA 2022 constants from `PHYSICS_SPEC.md` §1.
3. `core/integrators/` — RK4, velocity Verlet, Yoshida-4, **with the §6.3 quality tests**
   (time-reversibility, convergence order, circular-orbit closure, Newtonian-limit regression).
   These are the first real code in the repo and everything downstream depends on them being
   right.
4. App shell: routing, sim registry, gallery, theme, KaTeX.
5. Dockerfile + docker-compose with the cloudflared service. **Confirm the existing tunnel's
   management mode with the owner before touching its config.**
6. CI: typecheck, lint, test, build, secret scan.
7. Deploy. Verify `https://abstract-physics.binodtiwari.com` serves the shell.

## Open questions for the owner

1. **Domain:** the original brief said `abstract_physics.binodtiwari.com` (underscore). That is
   an invalid hostname — RFC 1123 disallows underscores, CAs won't issue a certificate, browsers
   reject it. Proceeding with **`abstract-physics.binodtiwari.com`**. The DNS record and tunnel
   route may need updating to match.
2. **Cloudflare tunnel:** is the existing tunnel dashboard-managed (token) or locally managed
   (`config.yml` + credentials JSON)? Needed before adding the public-hostname route.
3. **Where is this hosted** — the same machine as the tunnel, a home server, or a VPS? Affects
   the GPU-less build assumptions and the deploy pipeline.

## Decisions already made (see BUILD_PLAN for reasoning)

- Raymarcher: raw WebGL2 + GLSL ES 3.0, **not** Three.js
- Schwarzschild rays: flat-Cartesian formulation (no coordinate singularity)
- Kerr: Hamiltonian ODEs in Cartesian Kerr–Schild, RK4 adaptive; Carter constant as telemetry
  only, not as EOM
- Orbits: effective-potential reduction + velocity Verlet, float64
- WebGPU: primary where available, **mandatory** WebGL2 fallback
- Threading: Workers + transferable buffers + OffscreenCanvas; **no COOP/COEP** unless forced
- Physical rendering mode is the default; cinematic modes are labelled non-physical

## Session log

*(Append one entry per session: date, what was done, what was left, anything the next session
needs to know. Newest at the top.)*

### (no sessions yet)
