# Abstract Physics

A browser-based, physically accurate space-physics simulator — general relativity, spacetime
geometry, black holes, electromagnetism and quantum field theory. PhET Interactive Simulations
is the model for the product shape: many small, focused, deeply interactive simulations sharing
one shell, each rigorous, each accessible.

**Target:** `https://abstract-physics.binodtiwari.com` — Docker, behind a Cloudflare tunnel.

**Status:** specification complete, implementation not started. See
[`docs/PROGRESS.md`](docs/PROGRESS.md).

## What makes it different

Most black hole visualizations on the web are either pretty and wrong, or correct and unusable.
This one is built from the actual equations, tested against published measured values, and
explicit about the difference between what the mathematics says and what the popular
explanations claim.

That last part is the thesis, not a footnote. Several standard popular explanations in this
subject are known to be wrong or badly misleading — the virtual-pair-at-the-horizon story for
Hawking radiation, "virtual particles constantly popping in and out of the vacuum", "the Casimir
effect is the vacuum pushing plates together", "gravity is just time dilation", "massive objects
are expanding toward you". Each of these gets a correct treatment, a labelled myth panel, and
the calculation that settles it. See [`docs/PHYSICS_SPEC.md`](docs/PHYSICS_SPEC.md) §7.

Every simulation ships with the governing equations rendered on screen, its assumptions and
limits of validity stated, and links to primary sources. Every published measured value the
product touches — Mercury's perihelion precession at 42.98″/century, light deflection at 1.75″,
the GPS clock offset at 38.5 μs/day, the Casimir force at 1.30 Pa across 100 nm — has a test
asserting the code reproduces it.

## Repository map

| File | What it is |
|---|---|
| [`PROMPT.md`](PROMPT.md) | The kickoff prompt for a Claude Code session |
| [`CLAUDE.md`](CLAUDE.md) | Standing rules, auto-loaded every session |
| [`docs/BUILD_PLAN.md`](docs/BUILD_PLAN.md) | Phases, tech stack, architecture, deployment, session checkpoint protocol |
| [`docs/PHYSICS_SPEC.md`](docs/PHYSICS_SPEC.md) | Every equation, constant and numerical benchmark, with sources |
| [`docs/PROGRESS.md`](docs/PROGRESS.md) | Living handoff log — read this first |
| `docs/DECISIONS.md` | Architecture decision record (created when the first non-obvious choice is made) |

## Working on this

This is a long project built across many sessions. Start a session with:

> Continue work on Abstract Physics. Read `CLAUDE.md`, `docs/PROGRESS.md`, `docs/BUILD_PLAN.md`
> and `docs/PHYSICS_SPEC.md`, then pick up the next unstarted task and follow the checkpoint
> protocol in `BUILD_PLAN.md` §9.

For the very first session, paste the full prompt from [`PROMPT.md`](PROMPT.md) instead.

The rules that govern every session, in short: physics accuracy is the product; no pop-science
and no flattering anyone's pet theory; commit often, keep `PROGRESS.md` current, and never end a
session with a broken build.

## Stack

Vite 7 · React 19 · TypeScript 5.9 strict · WebGL2 (GLSL ES 3.0) for the raymarcher · WebGPU
where available with a mandatory WebGL2 fallback · Zustand · KaTeX · Vitest + Playwright ·
Docker + nginx + cloudflared.

The simulation layer is framework-agnostic by design — simulation code does not know React
exists.

## License

Not yet chosen.
