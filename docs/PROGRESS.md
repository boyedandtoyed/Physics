# Progress Log

**This is the handoff document. Every session reads it first and updates it as it works.**

Keep it current *during* the session, not at the end — a session can be cut off without warning.
It must always answer: what is done, what is half-done and exactly where, what is next, what was
decided, what is broken.

---

## Current status

**Phase:** 0 — Foundation. Not started.
**Repo state:** Documentation only. No application code yet.
**Deployed:** Tunnel live at abstract-physics.binodtiwari.com (returns 502 until Phase 0 ships).

## What exists

| Item | State |
|---|---|
| `PROMPT.md` | Complete — the kickoff prompt |
| `CLAUDE.md` | Complete — standing rules |
| `docs/BUILD_PLAN.md` | Complete — phases, stack, architecture, deploy, checkpoint protocol |
| `docs/PHYSICS_SPEC.md` | Complete — equations, constants, benchmarks, honest-physics rules |
| `docs/PROGRESS.md` | This file |
| `docs/DEPLOY.md` | Complete — tunnel architecture, host setup, port registry |
| `docs/verify_benchmarks.py` | Complete — verifies all 32 benchmarks; all pass |
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

## Deployment status — DONE, ready to receive the app

The host tunnel is set up and live as of 2026-09-06. **You do not need to configure Cloudflare.**

- Tunnel `binod-home` (`cd90781c-9c68-42a4-a7ce-0f25e8defa1d`), running as an enabled systemd
  service, config at `/etc/cloudflared/config.yml`.
- `abstract-physics.binodtiwari.com` resolves and routes to `127.0.0.1:8080`.
- It currently returns **502** — correct: the tunnel works, nothing is listening on 8080 yet.
  **Phase 0 is done when that 502 becomes the app shell.**
- Publish the container as `127.0.0.1:8080:80`. Port 8080 is this project's allocation; see the
  port registry in `docs/DEPLOY.md` and do not take another site's port.
- Do not create a tunnel, and do not put cloudflared in this project's compose file.

## Open questions for the owner

1. **Domain:** the original brief said `abstract_physics.binodtiwari.com` (underscore), an
   invalid hostname. Settled as `abstract-physics.binodtiwari.com`. No action outstanding.
2. **Apex site:** `binodtiwari.com` (the portfolio, previously on port 3000) is not currently
   served — it was on the retired tunnel. Out of scope for this project unless the owner says
   otherwise.
3. **Old tunnel `d61228a8` is orphaned** and its dormant subdomains still CNAME to it. Cleanup
   is the owner's, documented in `DEPLOY.md`.

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
