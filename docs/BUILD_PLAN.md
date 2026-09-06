# Build Plan — Abstract Physics

## 1. What this is

A browser-based, physically accurate space-physics simulator. PhET Interactive Simulations is
the model for the *product shape* — many small, focused, deeply interactive simulations sharing
one shell, each rigorous, each accessible. The subject matter is general relativity, spacetime
geometry, black holes, electromagnetism and quantum field theory.

The differentiator is **accuracy and honesty**. Most black hole visualizations on the web are
either pretty and wrong, or correct and unusable. This one is correct, usable, cites its
sources, and explicitly calls out the popular explanations that are myths. See
`PHYSICS_SPEC.md` §7 — that section is the product thesis, not a footnote.

**Target:** `https://abstract-physics.binodtiwari.com`, Docker, behind an existing Cloudflare
tunnel.

## 2. The prime directive on scope

> *"We can progressively build into it, so we don't care much — just the start should be as good
> as possible."* — project owner

Phases 0 and 1 must be **excellent**. Everything after is incremental. One deployed,
genuinely-accurate, beautiful, accessible, tested simulation beats six half-built ones. Build
the skeleton so that adding simulation number seven is a one-folder + one-registry-entry
operation — then build simulation number one properly.

**Do not scaffold empty folders for future phases.** Build what you build completely.

## 3. Phases

Each phase ends deployed and green. Do not start phase N+1 with phase N broken.

### Phase 0 — Foundation *(target: 1 session)*
- Vite + React 19 + TypeScript 5.9 strict, `noUncheckedIndexedAccess: true`
- Dockerfile (multi-stage: build → nginx), web-only `docker-compose.yml`; use the existing host-owned cloudflared service (§7)
- CI: typecheck, lint, unit tests, build
- `core/units.ts` with CODATA 2022 constants — the only place constants exist
- `core/integrators/` — RK4, velocity Verlet, Yoshida-4 — with the §6.3 quality tests passing
  (time-reversibility, convergence order, Newtonian-limit regression). **These tests are the
  first real code in the repo.** They are what make everything after trustworthy.
- The app shell: routing, sim registry, gallery page, light/dark theme, KaTeX set up
- Deployed and reachable at the real domain

**Definition of done:** the domain serves a page, CI is green, and `npm test` proves the
integrators are correct.

### Phase 1 — The black hole *(target: 2–4 sessions, and this is the one that must be excellent)*
- WebGL2 fragment-shader raymarcher, Schwarzschild, using the flat-Cartesian formulation
  (`PHYSICS_SPEC.md` §2.3) — no coordinate singularity
- Adaptive stepping (§4.2), screen-space-Jacobian anisotropic star sampling (§4.4), resolution
  scaling + temporal accumulation (§4.5)
- Accretion disk: Novikov–Thorne $T(r)$, blackbody LUT, full $g^4$ Doppler + gravitational
  shift. **Physical mode is the default**; the one-sided crescent is correct, not a bug.
- Controls: mass, camera distance/inclination, disk on/off, quality, physical-vs-cinematic
- "The physics" panel: the governing ODE in KaTeX, the assumptions, links to the papers
- Visual regression tests + golden-value tests for photon sphere, ISCO, $b_{\rm crit}$
- Accessible: keyboard-operable camera, screen-reader description of the scene state

**Definition of done:** it runs at 60 fps at 1080p on a mid-range GPU, the shadow radius
measured off the rendered frame matches $3\sqrt3 M$ to within a pixel, and a physicist looking
at it finds nothing to complain about.

### Phase 2 — Time, and the interpretations module
- Gravitational time dilation calculator + visualizer: GPS, Hafele–Keating, near-horizon clocks;
  all benchmarks §8.5–8.9 asserted
- **The deflection decomposition interactive** (`PHYSICS_SPEC.md` §7.4 Claim A) — the
  0.875″ → 1.75″ slider. This is a signature exhibit; give it real design attention.
- **The Interpretations module** (§7.4 Claim B) — one geometry, four coordinate systems, one
  toggle; identical trajectories and invariants, completely different pictures; plus the tidal
  panel that no "expansion" story reproduces

### Phase 3 — Orbits and precession
- Effective-potential orbit sim (§2.5), velocity Verlet, float64
- Mercury precession reproducing 42.98″/century (§8.1)
- ISCO explorer; plunge vs stable orbit; the $V_{\rm eff}$ curve shown live alongside the orbit

### Phase 4 — Kerr
- Rotating black hole: Kerr–Schild Cartesian, RK4 adaptive (§3.4)
- Frame dragging, ergosphere, ISCO-vs-spin curve (BPT, §3.3), Teo photon orbits as the accuracy
  probe
- Penrose process demo

### Phase 5 — Spacetime geometry
- Embedding diagrams (the "rubber sheet" — done correctly, with its limitations stated: it is a
  spatial slice, it is not the cause of gravity, and the usual demo secretly uses Earth's gravity)
- Geodesic deviation / tidal tensor visualizer
- Kruskal–Szekeres and Penrose diagrams, interactive

### Phase 6 — Quantum field theory, honestly
- Casimir effect (§7.2) with ideal + Lifshitz/Drude modes
- Off-shell propagator explorer (§7.1) — the honest replacement for "virtual particles popping"
- Running coupling $\alpha(Q^2)$; Lamb shift term breakdown
- Hawking radiation module (§7.3): mode mixing, exponential redshift pile-up, Regge–Wheeler
  greybody barrier, the number panel, and the labelled myth panel
- Schrödinger/Klein–Gordon wave packet evolution, split-step Fourier

### Phase 7 — Product polish
- Deep-linkable sim state in URL params, save/restore
- Embed mode for LMS/course pages
- Full a11y audit (axe-core in CI), keyboard maps, alt-text descriptions per sim
- Performance budget enforcement, mobile/touch, offline-capable PWA

## 4. Stack — decided

| Layer | Choice | Notes |
|---|---|---|
| Build | **Vite 7** | Rolldown build if stable |
| Framework | **React 19 + TypeScript 5.9** | `strict`, `noUncheckedIndexedAccess` |
| State | **Zustand 5**, or a hand-rolled PhET-style `Property<T>` (~80 lines) | Sim state is *not* in a store — see below |
| 3D scene | **Three.js r180+** for scene-graph sims only | If used, write shaders in **TSL** from day one — `WebGPURenderer` does not support `ShaderMaterial` |
| Raymarcher | **Raw WebGL2 + GLSL ES 3.0**, minimal wrapper | It's one fullscreen triangle and one fragment shader; Three.js adds ~600 KB and a layer of indirection for nothing |
| Math rendering | **KaTeX 0.16+** | Much faster than MathJax |
| a11y primitives | **React Aria Components** or Radix | Non-negotiable — this is why React over Svelte |
| Test | **Vitest 3**, fast-check, **Playwright 1.5x** | |
| CI a11y | axe-core / @axe-core/playwright | |

**WebGPU policy:** primary target where available, **mandatory WebGL2 fallback**. WebGPU is
~87% globally but the missing 13% is concentrated in Firefox-on-Linux — disproportionately this
product's audience (physics students and educators on university Linux machines). Fragment-shader
raymarchers: **WebGL2 only, it buys nothing.** Grid PDE solvers: WebGL2 ping-pong baseline, optional
WebGPU compute for large grids. FFT/reductions/N-body: WebGPU compute only, with a WASM+Worker CPU
fallback. Detect properly — `requestAdapter()` can return `null` even when `navigator.gpu` exists:

```ts
const hasWebGPU = 'gpu' in navigator && !!(await navigator.gpu.requestAdapter().catch(() => null));
```

**WASM policy:** default to TypeScript. Modern JIT'd JS on typed arrays is within ~1.2–2× of
WASM for straight-line float math; the quoted "8–10×" gains are against naive allocating JS, not
tight typed-array loops. Reach for Rust + `wasm-bindgen` + `simd128` only with a profile in
hand, and only for heavy CPU numerics (large FFTs, 3D grids, many-body). GPU sims: WASM is
irrelevant.

**Threading policy:** Workers + **transferable ArrayBuffers** + OffscreenCanvas by default.
**Do not set COOP/COEP** unless a sim genuinely needs `SharedArrayBuffer` — cross-origin
isolation breaks third-party fonts, embeds, and being iframed by an LMS, which matters for an
education product. If SAB becomes necessary, isolate those sims on a separate subdomain. Always
ship the non-SAB path and feature-detect `crossOriginIsolated`.

## 5. Architecture

**The one rule that keeps this maintainable over months: simulation code must not know React
exists.** Each sim is a plain TypeScript class:

```ts
interface Simulation<P extends ParamSet> {
  init(canvas: HTMLCanvasElement | OffscreenCanvas, params: P): Promise<void>;
  step(dt: number): void;
  render(): void;
  setParams(p: Partial<P>): void;
  getState(): SimState;      // for tests, save/restore, deep links
  dispose(): void;
}
```

React renders the chrome — sliders, readouts, description panels, routing. It never re-renders
per frame.

```
src/
  app/                 # shell: routing, nav, layout, theme
  registry/sims.ts     # manifest: id, title, tags, lazy loader, thumbnail
  core/                # framework-agnostic, ZERO React
    units.ts           # CODATA constants — the only place they exist
    property.ts        # observable primitive
    integrators/       # rk4, verlet, yoshida4, split-step
    gl/                # WebGL2 helpers: fbo, pingpong, program cache
    gpu/               # WebGPU helpers
    workers/           # worker pool, transferable buffers
  ui/                  # React: accessible Slider, Readout, ScreenSummary,
                       # PlayArea, ControlArea, ResetAllButton, PhysicsPanel
  sims/
    blackhole-lensing/
      model/           # pure TS, unit-tested, no DOM
      view/            # canvas/GL renderer
      description/     # a11y strings + responsive alerts
      index.tsx        # React wrapper, default export, lazy-loaded
    time-dilation/
    interpretations/
    ...
  test/golden/         # benchmarks.json — the §8 table as data
```

Hard rules, enforced with `dependency-cruiser` or `eslint-plugin-boundaries`:

- `core/` may not import from `sims/` or `ui/`.
- **Sims may never import each other.** Ever.
- One route per sim, one lazy chunk per sim. Visiting the Casimir sim must not download the
  black hole shaders.
- `registry/sims.ts` is the only file that knows all sims exist.
- No magic numbers outside `core/units.ts`.

## 6. Accessibility — borrowed from PhET, and required

PhET's accessibility work is the reason their sims are used in real classrooms. Copy the
approach, not just the checkbox:

- Every sim has a **screen summary** — a text description of the current state, updated live
- **Alternative input**: everything doable with the mouse is doable with the keyboard
- **Responsive descriptions**: state changes announce via ARIA live regions, throttled
- Visible focus indicators, respect `prefers-reduced-motion`, sufficient contrast in both themes
- axe-core runs in CI and fails the build on violations

## 7. Deployment

**Full detail is in [`DEPLOY.md`](DEPLOY.md) — read it before touching anything deployment-related.**
Summary of the shape:

This PC hosts several sites on subdomains of `binodtiwari.com` behind **one** shared Cloudflare
tunnel, running as a host systemd service. **cloudflared is therefore NOT part of this project's
compose file.** This project is one compose stack publishing one port on localhost; the shared
tunnel routes the hostname to it. Port **8080** is this project's allocation — see the port
registry in `DEPLOY.md` and do not take another project's port.

```yaml
# docker-compose.yml — web only
services:
  web:
    build: .
    restart: unless-stopped
    ports:
      - "127.0.0.1:8080:80"     # localhost only; the tunnel is the only way in
```

The domain **must** be `abstract-physics.binodtiwari.com` with a hyphen. `abstract_physics...`
is an invalid hostname under RFC 1123; public CAs will not issue a certificate for it and
browsers reject it.

**Multi-stage Dockerfile:** node build stage -> nginx serving `dist/`. Nginx config: gzip/brotli,
long cache on hashed assets, `no-cache` on `index.html`, correct MIME for `.wasm`, SPA fallback
to `index.html`.

Cloudflare terminates TLS at its edge, so the container serves plain HTTP. Do not put a
certificate in the container, and do not bind to `0.0.0.0`.

The host-level tunnel setup (login, tunnel creation, config.yml, `route dns`, service install)
is a one-time operation owned by the project owner and is documented step by step in `DEPLOY.md`.
Do not create a second tunnel.

## 8. Security

- `.gitignore` from the first commit: `.env*`, `*.pem`, `*credentials*.json`, `*api*.txt`,
  `node_modules`, `dist`
- **There is an OpenRouter API key in `../physiscs_api.txt`, outside this repo. It must never
  enter the repo, the image, or a client bundle.**
- Run a secret scan (`gitleaks` or `git secrets`) before every push; add it to CI
- No secrets in client-side code, ever — this is a static site, everything shipped is public

## 9. Session checkpoint protocol

This project spans many sessions on a metered budget. Sessions can end abruptly. The protocol:

1. **Read `docs/PROGRESS.md` first, every session.** Trust it. Do not rebuild finished work.
2. **Announce the session plan** in one paragraph before starting.
3. **Commit every coherent unit of work** — never more than ~30 minutes uncommitted. Every
   commit leaves the build green.
4. **Update `docs/PROGRESS.md` as you go**, not at the end. It must always answer:
   - what is done and verified
   - what is half-done, and *exactly* where — file, function, what remains
   - what is next
   - what decisions were made and why (or a pointer to `DECISIONS.md`)
   - what is broken, what was tried, what failed
5. **At ~20% of remaining budget, stop taking on new work.** Finish the current edit, make it
   green, update `PROGRESS.md` completely, commit, push, and write a session summary.
6. **Never end a session with the repo broken.** If something can't be made to work, revert to
   the last green state and record the attempt in `PROGRESS.md`. A working Phase 1 beats a
   broken Phase 3.
7. **Push to GitHub every session**, unprompted.

`docs/DECISIONS.md` is an architecture decision record: one short entry per non-obvious choice —
context, decision, consequences. When a later session wants to revisit "why WebGL2 and not
Three.js for the raymarcher", the answer is there and the debate doesn't repeat.
