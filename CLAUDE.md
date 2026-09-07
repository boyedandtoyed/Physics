# Standing rules for every session in this repo

This file is loaded automatically at the start of every Claude Code session here. It is short
on purpose. The details live in `docs/`.

## Before anything else

Read, in order: `docs/PROGRESS.md` → `docs/BUILD_PLAN.md` → `docs/PHYSICS_SPEC.md`.
`PROGRESS.md` tells you what previous sessions actually finished. **Trust it. Do not rebuild
completed work.** Verify quickly by running the tests, then move on to the next unstarted task.

## The four rules that matter most

**1. Physics accuracy is the product.** Every simulation is driven by the real equations in
`docs/PHYSICS_SPEC.md`, at the stated level of approximation, with that approximation visible in
the UI. If a formula you need is not in `PHYSICS_SPEC.md`, research it from a primary source,
add it there with a citation, *then* implement it. Never invent physics. Never approximate
silently. Where a published measured value exists, there is a test asserting we reproduce it —
see `PHYSICS_SPEC.md` §8.

**2. No pop-science, and no flattering anyone's pet theory — including the owner's.** Several
standard popular explanations in this domain are wrong: the pair-at-the-horizon story for
Hawking radiation, "virtual particles constantly popping into existence", "the Casimir effect is
the vacuum pushing", "gravity is just time dilation", "massive objects are expanding toward
you". `PHYSICS_SPEC.md` §7 gives the correct treatment of each, with sources, and §7.4
specifically addresses two interpretive claims the owner raised. Handle them exactly as written
there: take the parts that map onto real formalisms seriously, show where each breaks down, and
give the number that breaks it. Where a popular framing is wrong, don't omit it — show it,
label it as a myth, and show the calculation.

**3. A green suite is not evidence that a page works.** Typecheck, lint and unit tests cannot
see a rendered page, and in this repo they have repeatedly failed to. **Any change touching UI
is not done until it has been loaded in a real browser and driven.** The mandatory checks, all
of them, every time:

- **Load the actual page** — the production build (`npm run build && npm run preview`), not the
  dev server, and not a jsdom test standing in for it.
- **Both themes.** Light and dark. A contrast failure exists in exactly one of them.
- **Exercise every control to its limits**, including both endpoints and any value that makes a
  term zero, infinite, or degenerate. A slider is not verified until you have pressed Home and
  End on it and confirmed the readout is the value you intended.
- **Read the console.** Zero errors and zero warnings. Capture `pageerror` too.
- **Look at a screenshot of the result.** Not a DOM assertion about it — the image.

Then encode what you found as an e2e test so it stays fixed.

This rule is written from six defects that shipped past a fully green suite in one session: an
infinite tick loop that hung the tab when a series went to zero (`log10(0)`), a chart panel that
rendered completely empty, a slider that could not reach its own endpoint and so opened on the
wrong value, two shared `ui/` components with no styles of their own, and a WCAG AA contrast
failure visible only in dark mode. Every one was invisible to `npm test` and obvious within
seconds of looking at the page.

**4. Leave the repo green and the handoff current.** Follow the checkpoint protocol in
`docs/BUILD_PLAN.md` §9. Commit often. Update `docs/PROGRESS.md` as you go. Stop taking on new
work at ~20% of remaining budget, then land, document, commit, and push. Never end a session
with a broken build.

## Code rules

- TypeScript strict, `noUncheckedIndexedAccess`. No `any` without a comment justifying it.
- **`core/` must not import from `sims/` or `ui/`. Sims must never import each other.**
- All physical constants live in `core/units.ts`. No magic numbers anywhere else.
- Physics core is **float64**. Shaders are float32 — work in $u=1/r$, avoid catastrophic
  cancellation, pass float64-derived quantities in as uniforms.
- One route and one lazy chunk per sim.
- Every sim ships with: a "The physics" panel (equations in KaTeX, assumptions, primary-source
  links), a "Common misconceptions" panel where one applies, keyboard operability, and a live
  screen-reader summary.
- Tests before or alongside physics code, not after. The integrator quality tests
  (`PHYSICS_SPEC.md` §6.3) and the golden benchmarks (§8) are what make the product credible.

## Never

- Commit secrets. There is an OpenRouter key in `../physiscs_api.txt`, outside this repo — it
  must never enter the repo, the Docker image, or a client bundle. Secret-scan before every push.
- Use `abstract_physics.binodtiwari.com` — the underscore makes it an invalid hostname (RFC 1123);
  CAs won't issue a cert and browsers reject it. It is **`abstract-physics.binodtiwari.com`**.
- Break the existing Cloudflare tunnel. Confirm its management mode before changing its config.
- Scaffold empty folders for future phases. Build what you build completely.
- Ship a "cinematic" or artistic mode as the default. Physical is the default; non-physical
  modes are labelled as such.

## Commit style

Small, coherent, imperative subject lines describing what changed and why. Every commit leaves
the build green.
