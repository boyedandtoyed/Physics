# Progress Log

## Current status — 2026-09-06

**Phase:** 0 — Foundation, substantially implemented but NOT signed off.
**Branch:** `feat/phase-0-foundation`.
**Live:** https://abstract-physics.binodtiwari.com serves the foundation shell (HTTP 200).
No playable simulation is shipped. Do not start Phase 1 until the remaining gates below pass.

## Done and verified

- Vite 7, React 19, TypeScript 5.9 strict / noUncheckedIndexedAccess, reproducible npm lockfile.
- CODATA/reference constants in `src/core/units.ts`; hbar derived from exact h, solar GM kept separate from rounded solar mass.
- In-place float64 RK4, velocity Verlet, Yoshida-4 with reusable scratch buffers and documented callback/aliasing contracts.
- **17 Vitest tests pass:** convergence ratios, reversibility, negative Yoshida substep, non-autonomous RK4 stages, oscillator energy over 1,000 periods, circular/eccentric Newtonian closure, angular momentum, Schwarzschild circular effective-potential equilibrium, formal million-fold-c limit, dimension/alias validation, constants.
- **Typecheck and ESLint pass. Production build passes.**
- All **32 Python reference benchmark checks pass**; these check formulas, not future simulation implementations.
- Gallery with explicit unavailability state, routing/not-found handling, typed lazy sim registry, system/light/dark themes, keyboard skip navigation, responsive layout.
- Methodology page with lazy-loaded KaTeX and React Aria physics disclosure, assumptions and primary sources.
- **3 Playwright tests pass**, including light/dark axe scans, keyboard disclosure, theme persistence, narrow-screen overflow check, system dark mode and not-found route. No page errors in tested flows.
- Docker multi-stage Node→nginx, web-only compose on `127.0.0.1:8080`, healthy container `physics-web-1`.
- Local deep link `/method` returns 200 with no-cache HTML; missing `/assets/missing.js` returns 404. Public HTTPS root returns 200.
- Existing Cloudflare tunnel untouched. Domain already uses the correct hyphen; no DNS action needed.
- Gitleaks v8.24.3 Docker scan of Git history and source found no leaks. Owner explicitly approved using this pinned scanner.
- GitHub Actions workflow authored (typecheck/lint/tests/Python/build/Playwright/axe/Gitleaks/Docker build); **remote execution not verified**.

## Next tasks — finish Phase 0

1. Verify remote CI after push. `gh` is not authenticated; run `gh auth login` interactively if needed. SSH push capability is checked separately at session close; see session result below.
2. Strengthen architecture enforcement: current ESLint prevents obvious core→React/ui/sims/app imports, but does not yet fully enforce cross-sim boundaries, transitive boundaries, or physical-constant centralization. Do this before adding the first sim.
3. Add lazy-route fixture tests (successful/error loaders), storage-unavailable startup test, and numerical refinement coverage for Newtonian ellipses. Current Newtonian closure uses Yoshida at 4096 steps/orbit, error <1e-8; the million-fold-c limit is an algebraic force check, not a full GR orbit integration.
4. Complete visual inspection and asset cache/MIME verification against the deployed container. A standalone screenshot run could not launch Chromium in this environment; no screenshot was produced. The earlier Playwright suite passed. Resolve browser-launch prerequisites through the normal permission process.
5. Consider stronger CI action/image digest pinning and a production-preview browser run (current E2E uses Vite dev). Validate full release gates before marking Phase 0 complete.
6. Then begin Phase 1 with a careful primary-source audit of the rendering equations/normalization before implementing the shader. No Phase 1 files exist.

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
npm test
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
