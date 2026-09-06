# The Prompt

Paste everything between the `---` markers into a fresh Claude Code session, run from
inside the `Physics` repo. Everything it needs beyond this is in `docs/`, which it is
told to read first.

---

You are building **Abstract Physics** — a browser-based, physically accurate space-physics
simulator, in the spirit of PhET Interactive Simulations but for relativity, spacetime,
black holes and quantum field theory. It will be a real product that real people use, served
from `abstract-physics.binodtiwari.com` behind an existing Cloudflare tunnel, in Docker.

This is a multi-week, multi-session project. You will not finish it in one session, and you
are not expected to. **Your job this session is to complete as much as you can of the current
phase, to a standard that does not need re-doing, and to leave the repo in a state where the
next session can resume with zero guesswork.**

## Read these first, in this order, before you write any code

1. `CLAUDE.md` — standing rules for every session in this repo. Non-negotiable.
2. `docs/BUILD_PLAN.md` — the phase roadmap, the tech stack, the architecture, the deploy
   setup, and the session checkpoint protocol.
3. `docs/PHYSICS_SPEC.md` — every equation, constant, and numerical benchmark you are to
   implement, with sources. **Do not invent physics. Do not approximate silently. If a
   formula you need is not in this file, research it, add it to this file with a citation,
   then implement it.**
4. `docs/PROGRESS.md` — what previous sessions actually completed. If this file says Phase 2
   is done, do not rebuild Phase 2. Trust it, verify it briefly by running the tests, then
   move on.

## Non-negotiable standards

**Accuracy over appearance.** This is a physics product. Every simulation must be driven by
the real equations at the level of approximation stated in `PHYSICS_SPEC.md`, and every stated
approximation must be visible to the user in the UI. A pretty sim that is physically wrong is
a defect, not a feature. Where a quantity has a published measured value (Mercury's perihelion
precession, light deflection at the solar limb, the GPS clock offset, the Lamb shift), there
must be a test asserting your code reproduces it to the stated tolerance.

**No pop-science.** Several standard popular explanations in this subject area are known to be
wrong or badly misleading — the "virtual particle pair at the horizon" story for Hawking
radiation, "virtual particles constantly popping in and out of the vacuum", "the Casimir effect
is the vacuum pushing plates together", "gravity is just time dilation". `PHYSICS_SPEC.md`
§7 covers each of these with the correct treatment and the sources. Where the popular story is
wrong, the product's job is to show the correct mechanism and to explicitly flag the myth as a
myth. This is the product's main differentiator — be rigorous about it.

**No bias, and no flattery of anyone's pet theory — including the project owner's.** If the
physics says something is wrong, the product says it is wrong, with the calculation that shows
why. See `PHYSICS_SPEC.md` §7.4, which addresses a specific set of interpretive claims the owner
raised; handle them exactly as written there — take the parts that map onto real formalisms
seriously, and show clearly where each one breaks down and by how much.

**Cite in the UI.** Every simulation has a "The physics" panel with the governing equations
(rendered with KaTeX), the assumptions and limits of the model, and links to primary sources
— papers and textbooks, not blog posts, wherever a primary source exists.

## What to do this session

1. Read the four documents above.
2. Read `docs/PROGRESS.md` to find the current phase and the next unstarted task.
3. Announce, in one short paragraph, what you are going to do this session before you start.
4. Do it. Work in small, coherent commits — each commit should leave the build green.
5. Follow the checkpoint protocol in `BUILD_PLAN.md` §9 continuously, not just at the end.

If `docs/PROGRESS.md` does not exist yet, you are the first session: start at Phase 0 in
`BUILD_PLAN.md` and create `docs/PROGRESS.md` as your first commit.

## The checkpoint protocol — read this now, not later

You are running on a metered budget and may be cut off mid-task without warning. Therefore:

- **Commit early and often.** Never let more than ~30 minutes of work sit uncommitted.
- **Keep `docs/PROGRESS.md` current as you go.** It is the handoff document. It must always
  answer: what is done, what is half-done and exactly where, what is next, what decisions were
  made and why, what is broken and what you tried.
- **When you judge you are at roughly 20% of your remaining budget, stop taking on new work.**
  Finish the immediate edit, make the build green, update `docs/PROGRESS.md` fully, commit,
  push, and write a short session summary as the final message. Do not start a new module with
  a fifth of your budget left.
- **Never leave the repo broken at the end of a session.** If you cannot make something work,
  revert it to the last green state, and record what you tried and why it failed in
  `PROGRESS.md`. A working Phase 1 beats a broken Phase 3.
- **Push to GitHub before you finish**, every session, without being asked.

## Two things to fix before you deploy anything

1. **The domain in the original brief was `abstract_physics.binodtiwari.com`, with an
   underscore. That hostname is invalid** — underscores are not permitted in hostnames under
   RFC 1123, public CAs will not issue a certificate for it, and browsers will reject it. Use
   `abstract-physics.binodtiwari.com` (hyphen). Everything in `docs/` already assumes the
   hyphen. Flag this to the owner in your first session summary in case the DNS record and
   tunnel route need updating.
2. **Never commit secrets.** There is an OpenRouter API key in a plain text file in the parent
   directory of this repo (`../physiscs_api.txt`). It must never be committed, copied into the
   repo, or embedded in a client bundle. Make sure `.gitignore` covers `*.txt` credentials,
   `.env*`, and `*.pem` from your very first commit, and run a secret scan before every push.

## Scope, and the order things get built

The full product is large — read the phase list in `BUILD_PLAN.md` §3. But the owner's
instruction is explicit and it governs your priorities:

> *"We can progressively build into it, so we don't care much — just the start should be as
> good as possible."*

So: **Phase 0 and Phase 1 are to be excellent, not merely present.** A deployed site with one
simulation that is genuinely accurate, genuinely beautiful, accessible, tested against known
values, and running on the real domain in Docker is worth vastly more than six half-built
simulations. Build the skeleton so that adding simulation number seven is a one-folder,
one-registry-entry operation, then build simulation number one properly.

Do not scaffold empty folders for future phases. Build what you build completely.

---

## How to use this, and what to expect

**Where things live:**

| File | What it is | Who reads it |
|---|---|---|
| `PROMPT.md` | This file — the kickoff prompt | You, to copy from |
| `CLAUDE.md` | Standing rules, auto-loaded by Claude Code every session | Every session, automatically |
| `docs/BUILD_PLAN.md` | Phases, stack, architecture, deploy, checkpoint protocol | Every session |
| `docs/PHYSICS_SPEC.md` | Equations, constants, benchmarks, honest-physics rules | Every session that touches physics |
| `docs/PROGRESS.md` | Living handoff log, written by each session | Every session, first thing |
| `docs/DECISIONS.md` | Architecture decision record — why, not what | When revisiting a choice |

**For sessions after the first**, you do not need to paste the whole prompt again. This is
enough:

> Continue work on Abstract Physics. Read `CLAUDE.md`, `docs/PROGRESS.md`, `docs/BUILD_PLAN.md`
> and `docs/PHYSICS_SPEC.md`, then pick up the next unstarted task and follow the checkpoint
> protocol in `BUILD_PLAN.md` §9.

**A note on model choice.** Phases 1–3 involve GPU shader work and numerical integration where
subtle errors are expensive to find later. Use the strongest model you have available for the
physics core and the raymarcher. Routine UI and wiring work is fine on a cheaper model.
