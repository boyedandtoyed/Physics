# Physics

## Status

This repository is a fresh scaffold. No engine code has been written yet — this README exists so that whoever (or whatever AI assistant) picks up this project next has enough context to start correctly instead of guessing.

## Purpose

Not yet defined in detail. The intent is a physics engine / physics-related project (the specific domain — 2D vs 3D, real-time simulation vs. educational/visualization tool, target language and platform — will be specified by the project owner in a follow-up prompt). Whoever starts building should confirm this scope before writing significant code.

## Instructions for the next AI assistant or contributor

Before writing code:

1. Ask (or check the latest instructions from the owner) what kind of physics engine this is meant to be: 2D or 3D, general-purpose or specialized (rigid body, particle, fluid, etc.), target language/runtime, and whether it needs a renderer or is math/simulation only.
2. Propose a folder structure and get it confirmed before generating a large number of files.
3. Once the scope is confirmed, replace this whole README with real documentation — do not leave these placeholder instructions in place alongside real code.

While building:

- Keep commits small and message them descriptively (what changed and why), not just "update".
- As each major module is added (e.g. the core simulation loop, collision detection, integrators, math/vector library, any rendering or API layer), update the **Architecture** section below so the README always reflects the real, current structure — never let it drift out of date.
- Do not commit secrets (API keys, tokens) into this repository. Use a `.env` file listed in `.gitignore` for any credentials.

## Architecture

_To be filled in once real code exists. Suggested sections once there is something to document:_

- **Overview** — one paragraph on what the engine does and its main entry point.
- **Core loop** — how a simulation step/frame is advanced (fixed vs. variable timestep, update order).
- **Modules** — one subsection per major module (e.g. math/vectors, rigid bodies, collision detection, constraint solver, integrator), what each owns, and how they call into each other.
- **Data flow** — how state moves through the system for one tick (input → simulation → output/render).
- **External dependencies** — libraries relied on and why.
- **Build & run** — exact commands to install, build, test, and run the project.

Future corrections and extensions should update this section directly rather than adding a second, separate architecture document.
