# Progress Log

## Current status — 2026-09-18

**Phase:** 5 — Spacetime geometry and causal structure (BUILD_PLAN §5). **COMPLETE** for its
Kruskal/Penrose half: `kruskal-diagram`, `penrose-schwarzschild`, `penrose-kerr`. Phases 0, 1, 2,
3, 3-Visual, 3-Sandbox, 3-Immersive and 4 are complete. **What remains in Phase 5 is the
geodesic-deviation / tidal-tensor visualiser**, the one bullet of BUILD_PLAN §5 this session did
not cover; the embedding diagram already exists as `/sims/spacetime-curvature`. Next after that:
**Phase 6 — Quantum field theory, honestly**.

**Branch:** `master`, pushed. **Deployed 2026-09-18** — `physics-web:rc-97cc06e`
(`sha256:156dd5a4…`), built, staged, verified through the Cloudflare edge and promoted. Staging
and production run the **identical image ID**. The full **210-test suite passed against staging
before promotion and against production after**.

**Live:** https://abstract-physics.binodtiwari.com serves **eighteen simulations**.

**Totals at the Phase 5 close:** **879 Vitest**, **405 Python benchmark checks**, **210
Playwright app tests**, **20 acceptance tests**. Typecheck, ESLint, dependency rules and the
production build are green.

### Phase 5 — Kruskal, Penrose and Kerr causal structure *(2026-09-18)*

| Route | What it is |
|---|---|
| `/sims/kruskal-diagram` | The maximally extended Schwarzschild spacetime, all four regions, light at 45° everywhere |
| `/sims/penrose-schwarzschild` | The conformal diagram, with every boundary and corner named |
| `/sims/penrose-kerr` | The Kerr block tower at a/M = ½, three repetitions, Cauchy horizon flagged |

**New core:** `core/kruskal.ts` — the Kruskal *chart*, as distinct from `core/infall.ts`'s one
worldline. `core/kerr.ts` gains `surfaceGravity`, `massInflationRatio`, `radialTortoise` and
`tortoiseDerivative`. **New spec:** §7.4a, §7.4b, §8 rows 69–77.

**`core/infall.ts` was read first, as instructed, and it cannot draw these diagrams.** Three
measured reasons, all now recorded in §7.4a: its normalisation is a **boost** anchored to one
fall's horizon crossing, so it returns X = 5.525, T = −4.810 where the standard chart at
r = 2 r_s, t = 0 has X = e, T = 0; it routes through `schwarzschildTime`, which rightly throws
inside the horizon, so it cannot reach regions II and III at all; and `radiusFromKruskal` refuses
UV < 0, which is every event inside. `core/kruskal.ts` therefore provides the chart, imports
`lambertW0` rather than rewriting it, and is tied to the benchmarked module by a test asserting
the two agree on **UV exactly** — a boost multiplies V and divides U, so the product is invariant.

**Five things in the brief were wrong, and are corrected in the spec rather than in a comment:**

1. *"A static observer follows a vertical line in Kruskal coordinates."* It follows a
   **hyperbola**. dr/dt = 0 means UV constant, which is X² − T² constant — the same curve a
   Rindler observer follows in flat space, and for the same reason: hovering outside a horizon
   takes proper acceleration forever. A vertical line X = const is not a curve of constant r at
   all, and above |T| = X it is not even timelike.
2. *"Verify X² − T² near r = 2M+ε is positive, not negative from float cancellation."* Measured,
   it does not go negative — at r = (1+10⁻⁶)r_s and t = 40 it returns **exactly zero**, and so
   does the usual rescue **(X − T)(X + T)**, because by then the two coordinates are bitwise
   equal and the subtraction has already destroyed what the factorisation would need. The fix is
   not a better formula in X and T; it is not forming them. Row 72 asserts both.
3. *"The infalling observer crosses ℐ⁺ in finite conformal time."* It cannot. Null infinity is
   where escaping **light** ends up, and is a null boundary no massive body reaches. The faller
   crosses the **horizon** and terminates on r = 0.
4. *"Top and bottom corners: i⁺, i⁻."* The top of the diagram is the **singularity**. i⁺ is the
   corner of region I where ℐ⁺ meets the future horizon. Putting timelike infinity at the top
   quietly asserts that something inside the horizon has an infinite future, when every worldline
   in region II ends in finite proper time.
5. *"No new benchmarks needed"* for Kerr. The horizon radii were benchmarked in Phase 4; the
   **surface gravities, the mass-inflation ratio and the tortoise coefficients were not**. Rows
   75–77 add them: κ₊ = 0.2320508076/M, κ₋ = −3.2320508076/M, |κ₋|/κ₊ = 13.9282 = r₊/r₋ exactly.

**What the Kerr diagram computes and what it does not, stated on screen.** Computed: both
horizons, both surface gravities, the exact r*(r) whose coefficients are exactly 1/2κ±, and from
it every contour's position and direction. Taken from Carter 1966: the arrangement of the blocks.
Kerr admits **no single conformal map** of the whole manifold — each horizon must be regularised
by its own κ — so a derived-looking diagram would misrepresent its own provenance. That is not
abstract: using κ₊ throughout puts the Cauchy horizon at 0.43 across its block instead of 0.94,
drawn in the middle of the region rather than at its boundary, and a test asserts both numbers.

**Two computed facts the diagrams turn on**, both new benchmarks. W₀ has a square-root branch
point at −1/e, so near the Schwarzschild singularity the error in r is the **square root** of the
error in UV: UV = −1 known to machine epsilon returns r = 1.3×10⁻⁸ and no iteration improves it.
And r*(0) for Kerr is **finite** — 0.2688 M — while both horizons are at r* = ∓∞, which is why
the ring is a timelike line at a definite place, avoidable, and why the spacetime continues past
it. The equatorial slice drawn is exactly the one slice in which it cannot be dodged, and says so.

**Defects found by driving the pages:**

- `radiusAtProperTime(0, r₀)` can return r₀ plus an ulp, which `core/infall` correctly refuses —
  so clicking at certain radii took the Kruskal sim into its error boundary. Clamped at both ends.
- r* **decreases** with r between the Kerr horizons, where Δ < 0, so the bisection placing
  contours assumed the wrong direction and put every contour in that band at the wrong end.
- `window` shadowed the global in the Kerr sim, breaking `window.devicePixelRatio`.
- The constant-t lines stack up near 45° on the Kruskal diagram; a dozen translucent lines
  composited into an opaque one that hid the horizon they were crowding towards.
- The Penrose diagram is twice as wide as it is tall and a canvas rarely is, and `squareBounds`
  puts its extent on the **short** axis — so a fixed extent either wasted the width or clipped
  the i⁰ labels off a narrow canvas.
- **The missing-glyph guard fired for the third time**, on U+208A/U+208B in the Kerr sim's
  permanent label and block names — the pair that once turned "r₊" into "r." across four sims and
  survived a screenshot because it reads as a typo. Seventeen occurrences in the page, seven in
  the labels.

**Three of my own test expectations were wrong and are fixed rather than loosened**: an
asymptotic series asserted as exact, float32 vertex buffers compared against float64 tolerances
(twice), and a static observer's worldline asserted strictly inside region I at a time where
`arctan` has saturated and the correct answer *is* the corner.

**RESOLVED 2026-09-19 — the `.readout` / `.chooser` panel CSS debt.** Promoted to
`ui/components.css`, which `main.tsx` already loads globally: 366 lines removed from twelve sim
stylesheets, 160 added in one place. Genuine per-sim overrides were kept and are now labelled as
overrides — the effective-potential and Mercury panels' `.mode-warning` spacing, and the gravity
sandbox's denser `.preset-button` for a row of seven.

**The duplication was hiding a shipped defect.** `.switch-indicator`, `.mode-warning` and
`.stage-help` were defined **only** in `blackhole-lensing/lensing.css`, and unscoped — so they
shipped inside that sim's lazy chunk. On a cold load of any other route the toggle was an
unstyled `div`, measured at **318 × 0 px with no background**; the gravity sandbox's three
switches were invisible entirely, labels with nothing beside them. Nine sims render a toggle.
Every sim looked after its own `.readout`, so nobody owned the switch. Five e2e tests now assert
the shared components are styled on a cold load of four different routes.

**Still open:** every browser check here runs on SwiftShader — the user's Chrome has no WebGL.

### Phase 3-Immersive — the sandboxes in three dimensions *(2026-09-18)* — COMPLETE

| Route | What changed |
|---|---|
| `/sims/gravity-sandbox` | Perspective scene, orbit camera, a sheet deformed in the vertex shader by every mass on it, glowing bodies with 300-sample trails, dark-disc black holes, radiation reaction, and three new presets |
| `/sims/freefall-sandbox` | The same scene with the genuine Flamm funnel, plus gravity-field arrows and a Gullstrand–Painlevé river layer |
| `/` | A live star field and slowly turning funnel behind the collection, and a baked still on each of the fifteen cards |

**New shared UI:** `ui/gl/camera3d.ts` (pose to matrices, and pixels back to the equatorial
plane), `ui/gl/fabric.ts` (the displacement, its CPU twin and the meshes), `ui/gl/Scene3D.ts`
(fabric, coloured 3D lines, instanced glow billboards, a star-field pass and an optional
screen-space distortion). **New core:** `core/embedding.ts` gains the uniform-sphere potential and
the sheet; `core/nbody.ts` gains `radiationReaction` and Peters' two closed forms;
`core/schwarzschild.ts` gains `hoverAcceleration`. **New spec:** §2.9, §2.10, §8 rows 60–68.

**Four things in the brief were wrong, and are corrected in the spec rather than in a comment:**

1. *"Render the Flamm paraboloid… multiple masses = sum of depressions."* Flamm's embedding is
   exact for **one** Schwarzschild mass, is not linear, and rises outward as $+2\sqrt{r_s r}$ —
   so a sum of them is neither a geometry nor the right shape, and **no multi-mass embedding
   diagram exists at all**, because general relativity is not linear. What superposes exactly is
   the Newtonian potential, which is the field the sandbox integrates. §2.9 sets out both; the
   gravity sandbox draws the potential and the freefall sandbox draws the real Flamm surface,
   and each says on screen which it is.
2. *"Its well deepens as M increases on the slider."* That is the exact misconception the
   freefall sim exists to refute, and its own panel says so: in geometric units every
   Schwarzschild well is the same well. What moves is where the **surface** sits on it — and
   there is no mass slider, only a body selector.
3. *"Kerr inspiral… GR correction on."* Nothing in the sandbox has spin, and the §2.6 correction
   is **conservative**: it does no net work around a closed orbit, so it precesses and can never
   shrink one. §2.10 adds the 2.5PN quadrupole term, whose circular limit reproduces Peters 1964
   exactly; the preset merges in the 659 sim units Peters predicts.
4. *"Bake the thumbnails with OffscreenCanvas in a Vite plugin."* A build plugin runs in Node,
   which has neither OffscreenCanvas nor a GPU, so it cannot render a WebGL frame — it would
   have had to launch a browser anyway. `scripts/bake-thumbnails.mjs` drives the real pages with
   the Playwright already in the repo and commits fifteen PNGs, so the build stays a pure bundle
   step and a change to a card is visible in a diff.

**The screen-space distortion ships OFF.** It is a radial pull on finished pixels, not lensing —
no ray is traced and nothing is bent around anything — and CLAUDE.md says physical is the default
and a non-physical mode is labelled as one. Same for the freefall funnel's vertical exaggeration,
which defaults to 1: heights are in M, the same unit as the plane.

**Defects found by driving the pages, all invisible to a green suite:**

- The gravity sandbox's draw loop closed over its colour palette without listing it as a
  dependency, so the canvas froze on whichever theme was current at mount.
- The star field rendered as large flat blocks: `starField`'s Jacobian maps radians to **pixels**,
  and a bare identity means one pixel per radian, so every star's half-pixel kernel spanned half
  the sky. The first fix attempt lowered the backdrop's opacity to solve a contrast problem that
  was really the blocks — the canvas is transparent everywhere a star is not, and can sit at high
  opacity over body text at no cost to contrast.
- `window.matchMedia` was called unguarded by the promoted theme hook. Where that API is absent
  it threw out of render and took the whole collection page down through its error boundary; it
  had been latent since the hook was promoted and only surfaced when the backdrop put it on a
  route that is rendered in a unit test.
- A wide 8:1 figures row baked as a card still, which `object-fit: cover` then cropped to three
  letters of a label.

**Two tests of mine were wrong and are fixed rather than loosened.** One asserted an asymptotic
series is exact — the hover acceleration exceeds GM/r² by 1/2r + 3/8r² + O(1/r³), and eight
places of the leading term alone fails at r = 100. One compared float32 buffer contents against a
float64 tolerance. Both now state the error budget they are actually working against.

**Known debt, unchanged and deliberately not touched this session:** six sims carry a
near-identical copy of the `.readout` / `.chooser` panel CSS, and the clock comparison makes a
seventh. It is a shared component in everything but name, and promoting it to
`ui/components.css` is a single mechanical change that should happen before an eighth copy.

**Still open:** every browser check in this repo, local and deployed, runs on SwiftShader — the
user's Chrome has no WebGL at all. Nothing physical depends on it, but the *appearance* of the
ray-traced sims and of the new 3D scenes at full resolution is unverified.

### Phase 3-Sandbox — interactive gravity *(2026-09-16)* — COMPLETE

Three sandboxes built on the existing infrastructure: the shared stage with its `permanentLabel`
slot, the promoted `ui/gl/LineRenderer`, and `core/integrators/symplectic`.

| Route | What it is |
|---|---|
| `/sims/gravity-sandbox` | N-body Newtonian playground, click to place and drag to throw, with an optional post-Newtonian correction whose cost to energy conservation is shown rather than hidden |
| `/sims/freefall-sandbox` | One central mass, four bodies from the Earth to a black hole, and the same well around all of them |
| `/sims/clock-comparison` | A static clock and an orbiting one, with the microsecond difference on a dial of its own |

**New core:** `core/nbody.ts` (accelerations with the §2.6 correction, energy, momentum,
absorption, presets, `zeroMomentum`); `core/timeDilation.ts` gains `circularClockRate`,
`breakEvenRadius`, `clockRateDifference`, `clockDriftPerDay`, `orbitAngularVelocity` and
`schwarzschildFromParameter`. **New spec:** §2.6, §2.7, §2.8 and §8 rows 54–59.

**New shared UI:** `ui/gl/canvasMapping.ts` promoted out of the gravity sandbox once the freefall
one needed the same pixel↔sim map; `ui/useDarkTheme.ts` promoted out of three sims that each had
their own copy.

**Four things in the brief were wrong, and are corrected in the spec rather than in a comment:**

1. *"The post-Newtonian correction is not valid beyond 10 M."* Backwards. The ratio is
   3GM/rc², which is **largest close in**, not far out. No cutoff was added: a cutoff would make
   the force discontinuous and destroy the energy conservation the sandbox is built to show.
2. *√(1 − 3GM/(2rc²))* for the circular clock rate. The 2 is spurious; the correct form is
   √(1 − 3GM/rc²), which vanishes at the photon sphere. With the 2 the zero sits **inside the
   horizon**, which is the quickest way to catch the error.
3. *"At r_A = r_B the clocks tick identically."* False, and the most natural wrong thing to
   assert. The gravitational factors cancel exactly and the **whole kinematic term is left
   over**: the orbiting clock loses 30.073 µs/day at the Earth's surface. The break-even radius
   is r_B = 1.5 r_A, independent of the central mass, and that is where the 10⁻¹² gate now sits.
4. *GPS at +45.9 / −7.4 / +38.5 µs/day.* The kinematic term is −7.109 against a rotating ground
   station (Ashby 2003) or −7.213 against a static one; −7.4 is neither, and is 2.5% out, which
   would fail the brief's own 1% gate. Both figures are shown, and the 0.104 µs/day between them
   is demonstrated to be the Earth's rotation and nothing else.

**Defects found by driving the pages, all invisible to a green suite** — CLAUDE.md rule 3 earning
its place again:

- Trails sampled per *frame* rather than per *step*, and absorption checked only after a whole
  batch, so a body could pass through a black hole between frames.
- A trail buffer holding 8 M of proper time against a 44 M fall.
- Drag-to-throw mapping to 4.5 c in geometric units, now scaled through the frame extent.
- Click-to-expand firing on every mass placed, fixed with a `clickToExpand` prop on `StageCanvas`.
- Playwright's default 720 px viewport putting 6 of 15 click targets below the window — the test
  passed while clicking nothing.
- The clock sim's draw loop closing over its palette without listing it as a dependency: the
  canvas froze on whichever theme was current at mount, and showed a white clock face on a dark
  page.
- The clock sim using `.chooser` and `.readout` without defining them. Those are per-sim
  conventions, not shared components; unstyled, the buttons fell back to the user agent's default
  and failed AA contrast in dark mode at 4.46:1.

**Known debt:** six sims now carry a near-identical copy of the `.readout` / `.chooser` panel
CSS, scoped to their own class. It is a shared component in everything but name. Promoting it to
`ui/components.css` is a single mechanical change and should happen before a seventh copy.

**Still open from the Phase 4 deploy:** every browser check in this repo, local and deployed, has
run on SwiftShader — the user's Chrome has no WebGL at all. Nothing physical depends on it (the
acceptance gates are measured off the same frames), but the *appearance* of the two ray-traced
sims at full resolution is unverified.

### Phase 4 — Kerr *(2026-09-14)* — COMPLETE

Commits `a80da0f` → `8e08a8e`.

| Route | What it is |
|---|---|
| `/sims/kerr-shadow` | The Kerr shadow, ray-traced in Cartesian Kerr–Schild |
| `/sims/frame-dragging` | The ZAMO field, the ergosphere, and the range of dφ/dt it forbids |
| `/sims/penrose-process` | Energy extraction, with the efficiency derived rather than capped |

BUILD_PLAN §4's bullets, checked one by one: Kerr–Schild Cartesian with adaptive RK4 (§3.4) ✅;
frame dragging ✅; ergosphere ✅; **ISCO-vs-spin curve (BPT, §3.3)** ✅ — it was the one bullet the
three sims did not cover, and it is now a chart in `kerr-shadow` carrying all six critical radii
against spin; **Teo photon orbits as the accuracy probe** ✅, checked against the cubic
`r³ − 6Mr² + 9M²r − 4a²M`, which is a different expression, to 10⁻⁹ across the whole curve;
Penrose process demo ✅.

#### The platform fix, done first (`a80da0f`)

`SimStage` takes a `permanentLabel` prop: one row of the stage, above the canvas, outside the
panel's scroll area, present in every layout including the expanded view. The three existing
labels moved onto it and **no sim manages an above-canvas permanent label any more.**

**The fourth instance of the bug appeared inside the fix.** The narrow-screen control drawer is
`position: sticky; bottom: 0`, so it rises to the top of its containing block; with the label
inside `.stage-canvas-wrap` that block began at the label, and at 390 px the drawer painted over
all three labels completely. The stage is now rows `[label][columns]` and the drawer's containing
block is `.stage-columns`, which starts below the label.

**The lesson is the assertion, not the CSS.** `toBeVisible()` does not see occlusion, and the
first version of the test passed against a label that was entirely covered. The test hit-tests
three points of the label with `elementFromPoint` at 390 px unscrolled, and again in the expanded
view. It fails against the previous structure.

#### The renderer promotion (`f562f61`)

Phase 4 needed two more 2D line sims, which fired the trigger the Phase 3 close recorded.
`src/ui/gl/LineRenderer.ts` is the superset — viewports, data-space bounds, line/point/fan modes,
the trail age-fade with a per-sim floor — and resolves its uniform locations once rather than on
every draw.

**The debt note was wrong about the count, and the audit corrected it.** Only **three** of the
"four near-identical renderers" were instances of this pattern. `RiverRenderer` advects static
geometry in the vertex shader and colours it by a physical speed ramp, with vertex layout
(direction, phase, end); `GridRenderer` is a 3D wireframe with an MVP matrix and eye-space depth
cueing. Neither is (x, y, age) geometry uploaded per frame. They keep sharing what they genuinely
share, `core/gl/context.ts`. Two further promotions followed for the same reason and were
verified the same way: `core/gl/starFieldGlsl.ts` and `core/imageMeasure.ts`, both moved out of
the Phase 1 sim once the Kerr one needed them, with the **Phase 1 acceptance gates re-run
unchanged** — shadow error still 0.013 px, every number identical.

#### The source audit: two errors in the brief, both of the survive-your-endpoints kind

1. **The prograde photon-sphere cubic.** `r³ − 3Mr² + a²r + Ma²` is a real Kerr equation — it is
   the ξ = 0 condition, i.e. the **polar** spherical photon orbit — but it is not the prograde
   equatorial one. It agrees at a = 0 (3M) and at a = M (M) **and nowhere else**: at a/M = 0.5 it
   gives 2.883218 M against the true 2.347296 M, a 23% error. The equatorial cubic is
   `r³ − 6Mr² + 9M²r − 4a²M`, checked against Teo's closed form rather than against itself. Both
   are now asserted by name so neither can be quietly swapped for the other.
2. **The Penrose maximum efficiency.** `1 − 1/√2` is 0.29289, not the 20.7% quoted beside it.
   The closed form that gives 20.7% is `½(√2 − 1) = 1/√2 − 1/2`. The general-spin result
   **η_max(a) = ½(√(2M/r_+) − 1)** is derived in §3.6 from the LNRF split rather than quoted,
   confirmed numerically against a turning-point split at three spins, and pinned at both
   endpoints. (29% is a real Kerr number — the rotational fraction of an extremal hole's mass —
   but it is not the efficiency of one split.)

Three exact shadow identities came out of the derivation and are what actually gate a renderer:
**η(3M) = 27M² for every spin**, so the shadow's vertical half-extent is 3√3 M at every spin;
**ξ(3M) = −2a**, so the displacement is exactly linear in a; and the horizontal extent tends to
Bardeen's own **[−2M, +7M]** at extremality, with the prograde edge approaching −2M as
−√3·√(M²−a²) — asserted as a rate rather than as a tolerance at one spin.

PHYSICS_SPEC gained §3.4a (Cartesian Kerr–Schild with the exact inverse metric), §3.4b (photon
orbits), §3.4c (Bardeen's shadow), §3.5 (the ZAMO field and Ω±), §3.6 (the Penrose process) and
§4.3a (the Kerr redshift factor). §8 gained rows 42–53. Benchmarks went **113 → 288**.

#### The one that nearly shipped: a mirrored scene

**The Kerr scene was rendered as its own reflection, and almost nothing could see it.**

Backward ray tracing integrates the arriving photon's momentum *negated*, which is past-directed.
Ingoing Kerr–Schild is regular on the *future* horizon and not the past one, so that ray is not
integrable in this chart — at a = 0 the null condition's regular branch turns over and the
central ray escapes instead of falling in. Every raymarcher therefore fires a **future-directed**
ray inward instead, which substitutes `t → −t` alone. **In Kerr that is not an isometry**: the
isometry is `t → −t` *together with* `φ → −φ`. The traced scene is the φ-reflection of the real
one — the image of a hole spinning the other way.

**A shadow measurement cannot catch this.** A reflection mislabels the α axis by exactly the
reflection it introduces, so the measured extent agrees with Bardeen either way — and the float64
model's own test passed against Bardeen in *both* handednesses. The gate that sees it is which
limb of the ring is blueshifted: `g = 1/(1 − Ωξ)` puts it at ξ > 0, i.e. α < 0, which is also
where the shadow's flat prograde edge is. **They must land on the same side**, and that is now an
acceptance test. The reflection is undone once, at the camera, by a left-handed image basis;
nothing physical is negated.

#### Numerical findings, all of them invisible to a tolerance test

- **Bardeen's η loses all its precision at small spin.** The bracket `4MΔ − r(r−M)²` is exactly
  minus the photon-orbit cubic, so it vanishes at both ends of the sampled range; at a/M = 0.1 the
  two terms are ≈10.225 and differ by 2×10⁻⁴, and the a² underneath multiplies that error by a
  hundred. Factoring by the cubic's own three roots (Vieta: r₁r₂r₃ = 4a²) removes the cancellation
  and the a² together. `bardeenEtaUnfactored` is kept **only** so a test can show the difference.
- **Δ must be computed as (r−r_+)(r−r_−), not r² − 2Mr + a².** Same polynomial, different
  computation: at a/M = 0.998 the literal form evaluated at r_+ returns 1.4×10⁻¹⁷ instead of 0,
  and √Δ of that is 3.7×10⁻⁹ — the entire width of a light cone that has closed to a point. The
  benchmark for "the wedge closes at the horizon" failed at that spin and passed at every lower
  one, which is what pointed at it.
- **The literal Kerr–Schild gradients overflow float32.** They carry D³, which is r¹² at a = 0 —
  10³⁸ at the escape radius. Rewritten in q = a²z²/r⁴, where nothing exceeds r⁵; the shader is
  now a literal transcription of the float64 function rather than a re-derivation of it.
- **The shadow outline was open at both ends.** η is exactly zero at the two equatorial photon
  orbits, so the remaining terms round to about 1e-33 there, negative as often as not, and a
  `>= 0` guard dropped both endpoints. Sampling was also uniform in r while β goes as √(r−r₁),
  which put the first sample 0.42 M up a vertical cusp. Chebyshev spacing and a tolerance sized
  against η's own scale fix both; the test measures the longest gap in the drawn polyline.
- **A turning point is a fixed point of the first-order radial equation.** dr/dt = ±√(…) vanishes
  there, so every RK4 stage evaluates zero and the Penrose fragments sat at the split radius for
  twenty thousand M of coordinate time without moving. They do leave in finite time, because
  ∫dr/√(r−r_turn) converges; it is the discretisation that cannot. Each fragment starts 10⁻⁴ M
  off the point now, in its own direction of travel, which changes no conserved quantity.
- **The two-edge shadow measurement cannot beat half a pixel.** It reads 0.38 px small at a = 0
  however many integration steps it is given — that is a hard mask's quantisation, and two
  samples cannot average it down. A circle gives 720, which is how the a = 0 gate reaches
  0.0037 px.

#### The Phase 4 gate table

| Gate | Value | How it is measured |
|---|---|---|
| Shadow radius at a = 0, **on the Kerr integrator** | **0.0037 px** error against 3√3 M | 720 spokes off a GPU frame, spread 0.28 px |
| Shadow extent at a/M = 0.5, 0.9, 0.998 | both edges **< 1 px** from Bardeen | two-edge scan, α from the exact ray launch |
| Displacement at a/M = 0.9 | measured 1.993919 vs analytic 1.993949 M | **3×10⁻⁵ M** |
| Shadow narrows with spin, height does not | 10.309 → 9.100 M wide, ±5.196 M tall throughout | four spins |
| float32 shader vs float64 model | **0** disagreements on capture | 240 sampled columns |
| ℋ across a full frame | max **2.3×10⁻⁵**, mean **5.7×10⁻⁷** of E² | float32, read back off the GPU |
| Ring's bright limb vs the shadow's flat edge | same side, ratio **1.45** | the handedness gate |
| ω(r_+) = Ω_H, all three published forms | **10⁻¹⁵** | four spins |
| Ergosphere equatorial radius | **2M to 10⁻¹⁰** at every spin | three independent routes |
| Ω₋ = 0 at exactly r = 2M | **10⁻¹²** | four spins, sign checked either side |
| Penrose η_max at a = M | **0.20710678** = ½(√2−1) | closed form, LNRF split and both endpoints |
| Penrose gain on the static limit | **exactly 0**, with E₁ = 0 | four spins |
| Gain never above 20.711% | 201 spins × 5 radii, plus all four slider corners | unit and e2e |

#### What driving the pages found that the green suite did not — nine defects

1. **The ring rendered as a filled disc across the whole frame.** GLSL's `sign(0.0)` is `0.0`, so
   every ray launched in the equatorial plane — the whole centre row of an edge-on view — flipped
   between 0 and ±1 on float32 noise and counted as a plane crossing.
2. **The quality ratchet was measuring nothing.** `render()` only *queues* the GPU work, so the
   frame time it timed was the queueing — a few milliseconds however heavy the frame. The ratchet
   upgraded every time and the page asked for the most expensive frame the device could not draw.
   It forces a round trip now, and the upgrade rule is **predictive**: cost goes as the square of
   the scale, so a step is refused when its predicted cost exceeds the slow threshold.
3. **The idle camera drift made the Kerr page unusable.** A frame here costs two orders of
   magnitude more than the Schwarzschild one, and drifting means re-integrating every ray forever;
   a `<select>` took 27 s to become actionable with the main thread otherwise idle. No drift here
   at any setting — and comparing two spins wants the viewpoint held anyway. **486 ms** to
   interactive on a software renderer now.
4. **The light-cone sectors were pie slices from the origin**, metres wide at the rim, and six of
   them buried the markers, the ergosphere and the faller. Annular bands at their own radius now,
   which is also the more honest picture: the cone is local.
5. **The horizon disc was drawn last** and covered the innermost light-cone band — the one that
   carries the prohibition.
6. **Pause did not stop the loop** in the frame-dragging sim. It skipped the integration and kept
   scheduling frames, which is a paused animation that still costs everything an animation costs.
7. **U+208A SUBSCRIPT PLUS is not in the shipped body font.** It renders as a full stop, so
   "r₊" — the outer horizon, quoted by four Kerr sims — silently became "r.". It reads as a typo
   rather than a missing glyph, which is why it survived a screenshot. There is a route-level e2e
   guard over the rendered text of every sim now, **verified by reintroducing the character**: it
   names the route, the code point and the surrounding words. U+209B ("rₛ") is fine; the gap is
   specific to the subscript plus and minus. **The guard reads `textContent`, not `innerText`** —
   the defect recurred once more in an SVG chart legend, and `innerText` is an HTML concept that
   does not reach SVG `<text>`. `textContent` also covers the visually-hidden live regions, which
   a screen reader does read.
8. **The Kerr frame was drawn at the escape radius**, which put the horizon, the ergosphere and
   the split radius inside four pixels. Framed on the release radius.
9. **The frame-dragging views stacked on a desktop** — the breakpoint was on the window rather
   than on the canvas, and a 1440 px window leaves about 800 px of canvas beside the panel.

#### Decisions worth not re-litigating

- **The Kerr sim's ring is not a Novikov–Thorne disk and the UI says so in those words.** §4.3's
  flux profile is the Schwarzschild specialisation of the Page–Thorne integral; the Kerr
  generalisation is spin-dependent and is **not implemented**. The ring emits uniformly between
  r_ISCO(a) and 12 M. What *is* physical is §4.3a's exact g and the g⁴ beaming — and that is the
  whole reason the ring is there, because with a static star field and a vacuum spacetime there is
  nothing moving for a Doppler shift to act on.
- **The Penrose efficiency is derived, not capped.** The brief asked for a clamp. A clamp would
  hide a wrong computation rather than prevent one; the bound is a property of the split, and the
  tests hunt for a counter-example instead.
- **The brief's "dashed ellipse" for the ergosphere is a circle in the view it asked for.** Seen
  down the spin axis the boundary is a circle at exactly 2M at every spin. The oblateness exists
  only in a cut containing the axis, so `frame-dragging` draws both, side by side, and says which
  is which.

### Phase 4 — where to pick up

Everything below is the state at the Phase 4 close. Nothing here is blocked on a decision.

1. ~~Deploy.~~ **DONE 2026-09-15**, see the status block above. The only thing left from it is a
   look at the Kerr sims in a browser with a real GPU — everything so far has run on SwiftShader.
2. **Phase 5 — Spacetime geometry (BUILD_PLAN §5).** The embedding diagram already exists as
   `/sims/spacetime-curvature` (Phase 3-Visual). What remains is the geodesic-deviation / tidal
   tensor visualiser — note the Interpretations module already has a tidal panel, §7.4, which is
   a cross-section rather than a tensor visualiser and should be read before duplicating it — and
   the interactive Kruskal–Szekeres and Penrose diagrams. **`core/infall.ts` already carries the
   Kruskal transformation** and the four-chart machinery, with the null-coordinate warning of
   §7.4 that X² − T² cannot carry the arithmetic. Start there rather than from scratch.
3. **Known debt, recorded rather than paid down.** The Schwarzschild raymarcher's quality ratchet
   has the same "`render()` only queues the work" defect the Kerr one had: its measured frame time
   is the queueing cost, so the resolution scaling §4.5 marks *required* never engages on a slow
   device. It has not mattered in practice — that shader is two orders of magnitude cheaper, and
   on a genuinely slow device the queue backs up until `render()` does block — but the fix is one
   line (`finish()` before measuring, as `kerr-shadow/index.tsx` does) and it should be made when
   that sim is next touched. **Do not make it in isolation**: it changes the frame budget the
   Phase 1 performance figure was measured at, so re-measure the 64.7 fps alongside it.
4. **A rendering limit worth knowing before Phase 5.** The Kerr raymarcher is ~100× the cost of
   the Schwarzschild one per ray, and the screen-space-Jacobian anti-aliasing of §4.4 costs two
   to four extra rays per escaped pixel on top. On a software renderer it falls back to about a
   sixth of the linear resolution. That is §4.5 working as designed, not a defect, but any Phase 5
   sim that reuses the star-field filtering should expect the same multiplier.

### Phase 3 — Orbits and precession *(2026-09-12)* — COMPLETE

### Phase 3 — Orbits and precession *(2026-09-12)* — IN PROGRESS

**Landed: Sim A, the effective-potential explorer** (`/sims/effective-potential`, commits
`0a96621` → `862effe`). V_eff with its critical radii and a movable energy line beside the orbit
that energy produces, integrated with Yoshida-4. `core/orbit.ts` (21 tests), the state layer
(26 tests), 8 Playwright tests. 88 → 99 benchmark checks.

**Three of the brief's stated benchmarks were wrong and were corrected before implementation:**

1. **V_eff at the ISCO is −1/18, not −1/(12M).** In geometric units V_eff is dimensionless, so
   −1/(12M) is dimensionally inconsistent as well as numerically wrong (−0.0833 vs −0.0556). The
   value is confirmed twice: directly, and as (Ẽ²−1)/2 with Ẽ = √(8/9), agreeing to 7×10⁻¹⁸.
2. **"V_eff has a local maximum at r = 3M for any L > 0" is false** for a massive particle. Below
   L = 2√3 M there are *no extrema at all*; above it the inner maximum approaches 3M only
   asymptotically (3.303M at L = 6M, 3.000002M at L = 2000M). The exact 3M belongs to the **null**
   potential L²(1/r² − 2M/r³), whose derivative vanishes at 3M for every L. Both are now asserted.
3. **Mercury precession was already benchmarked** (rows 1–3: 42.98″/century, 0.10353″/orbit,
   415.20 orbits/century), so the proposed row would have duplicated it.

Also: the Yoshida-4 integrator is `createYoshida4` in `core/integrators/symplectic.ts`, not a
`yoshida4.ts`; and PHYSICS_SPEC **§3 is Kerr** — the orbits section BUILD_PLAN Phase 3 cites is
**§2.5**.

**What driving Sim A's page caught that the green suite did not** — four defects, recorded because
they are all the same shape, a degenerate parameter value reachable from a slider:

- **L = 0 crashed the panel**: the circular-orbit quadratic degenerates to a double root at r = 0.
- **The plot rendered empty at high L**: a fixed vertical band inverted once the barrier exceeded
  the clamped ceiling.
- **The default energy landed unbound**: a linear sweep of the drawn band is mostly above E = 0,
  because the barrier is far taller than the well is deep.
- **A turning point was reported that the particle cannot reach**, on the far side of the barrier.

**Landed: Sim B, the Mercury precession sim** (`/sims/mercury-precession`). The orbit integrated
with Yoshida-4 at 1,500 steps per orbit, its rosette, and the swept perihelion angle, beside three
figures that are deliberately never merged into one. `core/mercury.ts` (8 tests),
`angularMomentumForTurningPoints` in `core/orbit.ts` (orbit.ts now 25 tests), the sim's state and
geometry layers (37 tests), 11 Playwright tests. 99 → 103 benchmark checks (new rows 34–37).

**The exaggerated mass is the whole design problem, and it is stated rather than hidden.** At
Mercury's real $GM/ac^2 = 2.55\times10^{-8}$ the perihelion moves 0.1″ per orbit: no animation can
show it. The canvas runs at 0.05 — five million times larger — and carries a permanent label
saying so. At that field strength **the leading-order formula is 32% low**, measured, so the panel
shows the integrator's advance, the formula's value *at the animation's mass* with the shortfall
as a percentage, and Mercury's real 42.98″/century computed from the real Solar GM, as three
separate rows. A misconceptions entry says outright that the animation does not confirm 42.98″.
New benchmark rows 34–37 pin the integrator's convergence instead: a Newtonian orbit closes, and
measured/formula falls to 1.0242 at 0.005 and 1.0049 at 0.001.

**Two physics findings during Sim B:**

1. **Newtonian vis-viva seeding is wrong at an exaggerated mass** — it collapsed the eccentricity
   from 0.206 to 0.029 and gave a 44% formula discrepancy that looked like an integrator bug. The
   launch state is now solved from the turning points, $V_{\rm eff}(r_p)=V_{\rm eff}(r_a)$, which
   reproduces the requested apsides exactly in whichever potential is selected — so the Newtonian
   and relativistic orbits differ only in their physics, not their shape.
2. **The mass slider's own range leaves the domain of a precessing orbit.** Above about
   $GM/ac^2=0.15$ at Mercury's eccentricity the periapsis is inside the potential barrier and the
   particle plunges; at 0.2 with $e=0.6$ the requested periapsis *is* the horizon and no orbit has
   a turning point there at all. Both are now named states with their own on-page explanation.

**What driving Sim B's page caught that the green suite did not** — three defects:

- **An unhandled `RangeError` replaced the whole sim with the error boundary** at
  $GM/ac^2 = 0.2$, $e = 0.6$. A Playwright test now sweeps both sliders to that corner, and a unit
  test walks all 200 × 119 slider positions.
- **The mandatory label was below the fold.** Placed under the canvas it was off screen at the
  default window height; moved to an overlay at the canvas head, the sticky control drawer clipped
  it mid-sentence on a phone. It is now the first row of the stage surface, which cannot be
  occluded in any layout or in the expanded view.
- **The trail read as a single arc, not a rosette** — the age fade floor was 0.04, so four of the
  five orbits held were invisible — and the perihelion arc was drawn exactly on the periapsis
  guide circle, making the two indistinguishable. The guide circle is gone and the swept angle is
  now a filled sector.

**Landed: Sim C, the ISCO explorer** (`/sims/isco-explorer`). V_eff with the particle's energy
line on the left, the orbit on the right, and one control that carries the whole point: a radial
nudge. `core/orbit.ts` gained the circular-orbit layer (43 tests), the state layer has 42 tests
and there are 10 Playwright tests. 103 → 113 benchmark checks (new rows 38–41).

**The ISCO is presented as a stability condition, not a radius.** Circular orbits exist at every
radius above 3M; what changes sign at 6M is κ² = M(r−6M)/(r³(r−3M)), the curvature of V_eff at the
circular orbit. Row 38 asserts that closed form against a numerical second derivative rather than
against itself, and row 39 pins the operational meaning of *marginally* stable: the recovery
period is 224.794 M at 8M but 1,606 M at 6.01M, diverging as the ISCO is approached.

**The clock is Schwarzschild coordinate time throughout, and the run stops at r = 2.001 M.**
Playback is paced by t rather than τ, so the stall near the horizon is the physics and not an
animation effect: over the last 0.009 M of radius, proper time advances by under 0.02 M while
coordinate time advances by more than 4. `coordinateTimeRate` throws inside the horizon by design,
so a step that overshot 2M would take the sim down; the final approach is refined until it lands
outside, and a unit test walks 121 launch radii × 6 nudges to prove none ever asks. The required
label is rendered permanently above the canvas once the particle has plunged.

**Units slip in the brief, flagged and corrected:** "2.001 r_s" is 4.002 M — the marginally bound
circular orbit, most of the way back out to the ISCO. The intent was clearly just outside the
horizon, so the stop is at **2.001 M = 1.0005 r_s**.

**A physical finding worth keeping.** An unstable circular orbit left with *no* nudge still falls
off, after 17.3, 17.1 and 16.4 e-folding times at 4.5M, 5M and 5.5M — the same count across a
threefold range of timescales, because the integrator's own truncation error is a perturbation and
|κ| is what amplifies it. That is not a defect in the animation; it is what unstable means, and
both the panel and a misconceptions entry say so. It is also a strong test: the e-fold count is
only constant if the growth rate really is the κ the closed form gives.

**What driving Sim C's page caught that the green suite did not** — five defects:

- **The V_eff panel was unreadable.** A band taken from the sampled curve is set by the divergence
  at the horizon (−0.45) rather than by the structure (0.0093 deep at r_c = 9M), so the well was a
  flat line. Anchoring on the two circular orbits fixed that but replaced it: at r_c = 9M the
  barrier is 0.0093 above the floor while a −0.06 nudge explores 0.0003 of it, so the energy line
  and its turning points sat invisibly on the floor. The band is now scaled to the larger of the
  excursion and the well's own curvature over r_c/10, and the barrier is allowed to leave the top
  of the frame when nothing can reach it.
- **The orbit was drawn underneath the expanded view's floating control panel** and was simply not
  there. The viewports are now squeezed by the same `min(21rem, 42vw)` rule the stylesheet uses.
- **The plunge label was below the fold** — the third time this exact defect has appeared. Both
  labels are now one stack above the canvas, so the row count does not change when the plunge
  label appears.
- **Two side-by-side viewports are unusable at 390 px**; they now stack, and in the expanded view
  on a phone both move into the upper half, because there the panel is a bottom sheet covering
  46vh rather than a column on the right.
- **The efficiency readout disagreed with the Ẽ beside it** — 5.72% from the circular orbit next
  to Ẽ = 0.943445 from the nudged particle, which is 5.66%. Both now come from the run.

### Phase 3 — COMPLETE *(2026-09-13)*

All three sims landed: `effective-potential`, `mercury-precession`, `isco-explorer`. 441 unit
tests, 113 benchmark checks, 91 Playwright tests, all green; every page driven in both themes at
1280 px and 390 px with zero horizontal overflow, zero axe violations and no console output.

**Known technical debt, recorded rather than paid down now.** Four sims now carry four
near-identical WebGL2 line renderers — the shaders differ, but the context/VAO/uniform plumbing
does not. The shared part that exists (`core/gl/context.ts`) is already shared. **Trigger: when a
fifth sim needs one, promote it to `src/ui/gl/` and migrate all of them**, rather than adding a
fifth copy.

### Phase 3-Visual — 3D rendering and interaction overhaul *(2026-09-07)* — IN PROGRESS

A rendering and UX phase inserted ahead of BUILD_PLAN §3 (orbits and precession), which remains
unstarted. Physics is unchanged throughout: no equation, constant or benchmark moves.

**Landed**

- **Shared stage** (`src/ui/sim/`, commit `5d4118d`). `SimStage` gives every sim a canvas-left /
  panel-right layout with a bottom drawer under 900px, focus mode at 95vw × 95vh with the panel
  floating over the canvas, and Escape/close to restore. `playbackStore` (zustand) holds
  play/pause, a reset token, focus and grain, keyed by sim id. `useOrbitControls` is drag-rotate,
  wheel-zoom and a full keyboard path, controlled so the caller keeps one source of truth.
- **Black hole sim** (commit `2fa8e93`). Full-canvas render, orbit camera, Play/Pause/Reset,
  film grain, click-to-expand. 9 new Playwright tests.
- **Spacetime curvature view** (`/sims/spacetime-curvature`, commits `aefc08b` → `efa8c44`).
  The Flamm paraboloid as an orbit-controlled WebGL2 wireframe with three camera presets, depth
  cueing, and controls for the outer edge and vertical exaggeration. §2.1a was written first, with
  the derivation and the three things popular treatments drop. `core/embedding.ts` (7 tests) and
  `core/gl/matrix.ts` (9 tests) are new; the mesh tests (8) assert every vertex sits on the exact
  embedding. 6 Playwright tests.

- **Gullstrand–Painlevé river** (`/sims/gp-river`, commit `ee17875`). Animated WebGL2 flow field:
  markers advect inward along the exact GP trajectory, colour-coded by |β| = √(rₛ/r), recycling at
  0.1 rₛ. Mass, outer edge and playback rate in the side panel; Play/Pause stops the loop outright.
  `core/river.ts` (13 tests), marker-layout tests (11), 7 Playwright tests. **Benchmark row 33**
  asserts 0.5 c at 4 rₛ and exactly c at the horizon to 1e-10 — 84 → 88 checks.
- **Deflection exhibit and Interpretations module moved onto the shared stage**
  (commits `9f74a92`, `3766243`). Layout only; all 18 of their existing e2e tests pass unchanged.

**Phase 3-Visual is complete apart from the Hawking/Casimir particle effects, which need sims
that do not exist yet (Phase 6).**

#### The WebGL2 conversion audit — no sim qualified

The brief asked for "every sim currently using canvas2D or SVG animation that can be upgraded to a
WebGL2 canvas". Audited: **there is no canvas2D anywhere in the repo and no SVG or CSS animation
anywhere.** All six remaining visuals are static SVG that re-renders on a control change, and each
is inherently 2D — the brief's own exclusion:

| Visual | Verdict |
|---|---|
| `DeflectionChart` | Log-log plot of α(β): a one-variable function. 2D. |
| `RayBending` | Deflection by a spherical mass is **exactly planar** by symmetry. 3D would imply out-of-plane structure that does not exist. |
| `ChartPanel` ×4 | Charts *of coordinates*. The module's thesis is that they are four 2D pictures of one geometry; a 3D scene would be a category error. |
| `TidalPanel` | Cross-section. The 2:1 stretch-to-squeeze ratio it exists to show reads worse as an ellipsoid. |
| `RateCurve` | dτ/dt against r — the brief's own example of what not to convert. |
| `TickStrip` | Two rows of tick marks. |

The stage *layout* is separate from WebGL2, so the deflection and interpretations sims got it.
**Time dilation deliberately did not:** it is a three-part calculator, not a single-visual sim, and
its four sliders belong to three different demonstrations. One shared side panel would divorce
each control from the section it acts on, which is worse for the reader than the status quo.

#### The specified disclaimer contained a physics error, and was corrected

The brief's text read *"The water analogy holds near the horizon but breaks down far from it."*
That is backwards. The Gullstrand–Painlevé form is **exact at every radius** (§5.2: expanding the
square recovers Schwarzschild identically, and the constant-t_ff slices are exactly flat
Euclidean space). Far out the flow becomes negligible as 1/√r, so the picture becomes *trivial*,
not wrong. What actually fails is not radial at all: the river carries no energy or momentum, has
no detectable state of motion, and explains falling and nothing else — not tides, not orbits, not
the ISCO (§5.4 points 1–4). The page says that instead, keeps the Hamilton & Lisle citation
unchanged, carries §5.4's own required label alongside, and a misconception panel addresses the
"breaks down far away" belief directly.

**Four premises in the brief did not match the repo, and are recorded so they are not re-tried:**

1. **WebGPU has never been implemented.** It exists only as a policy paragraph in BUILD_PLAN §4;
   `core/gl/context.ts` calls `getContext('webgl2')` and nothing else. There is no WebGPU path to
   "extend". Everything here is WebGL2, which is the mandatory fallback and what actually ships.
2. **Zustand was not a dependency.** Added.
3. **The Hawking and Casimir sims do not exist** — they are Phase 6. Particle effects for them
   are not implementable, and CLAUDE.md forbids scaffolding future-phase folders, so this item is
   **not done** and is not stubbed.
4. **The star field already exists** (Phase 1: equal-area cells, anisotropic filtering, a
   temporal-stability gate). Nothing to replace.

**Two requested effects would have falsified measured physics and were implemented differently:**

- **A ±2% shimmer on b_crit** would move the shadow edge about 2px and break the 0.013px
  acceptance gate — the product's headline measured claim, and §8 row 12 marks b_crit *exact*.
  The photon ring is emphasised at its fixed radius instead.
- **A spinning disk azimuth and a drifting light source** have nothing to act on: the
  Novikov–Thorne disk is axisymmetric, so rotating that uniform is unobservable, and a vacuum
  Schwarzschild scene has no light source. Making either visible would need non-axisymmetric
  structure that is not in PHYSICS_SPEC. The **camera** drifts instead, which is a viewpoint
  change and claims nothing about the physics.

Film grain defaults to 0 and is labelled non-physical, per CLAUDE.md's "never ship a cinematic
mode as the default".

**What driving the page caught that the green suite did not:** Reset looked fine and silently did
nothing after any camera change. The idle drift wrote the whole camera pose every frame, so its
callback could read the pre-reset pose, let Reset commit, and land afterwards restoring the old
value. It applies a delta through a functional update now.

### Staging deploy path *(2026-09-07)* — one step outstanding

Added before Phase 3 implementation, closing the gap flagged at the Phase 2 close: verification
was running against the production host *after* deploying to it, so there was no point at which a
release candidate could be checked through the real edge before the public saw it.

**Done and verified:**

- `docker-compose.yml` (production) has **no `build:`** — it can only start an already-built
  image, so a promotion cannot quietly rebuild. `docker-compose.staging.yml` is a separate compose
  project (`physics-staging`) on `127.0.0.1:8082`.
- `scripts/release.sh build | stage | promote | rollback | status`. `promote` retags the image ID
  staging is running and refuses if `physics-web:rc` is not that image, so a rebuild after staging
  fails the promotion instead of shipping something the verification never covered.
- `PHYSICS_EDGE_URL=<host> npx playwright test` runs the 40 app specs against a **deployed** host
  with no local servers. Proven by running all 40 against production through the edge — all pass.
- DNS: `cloudflared tunnel route dns binod-home staging-abstract-physics.binodtiwari.com` run;
  CNAME created and confirmed reaching the tunnel (the hostname went 1033 → 404, i.e. it now
  reaches us and falls through to the catch-all).
- Staging container `physics-staging-web-1` healthy on 8082, serving `physics-web:rc-d7a1d40`.
- Production untouched throughout: `physics-web:live` was tagged from the image the running
  container already used, and 8080 and the live host returned 200 at every step.
- `DEPLOY.md`: release section, both compose files, corrected "add a site" recipe, three new
  troubleshooting rows. Port registry lists 8082 and corrects 8080's stale status.

**OUTSTANDING — needs root, cannot be done from this session:** the ingress rule is not yet in
`/etc/cloudflared/config.yml`, so `https://staging-abstract-physics.binodtiwari.com` currently
returns the catch-all **404**. The exact block is validated (`cloudflared --config … tunnel
ingress validate` → OK; prod matches rule #0, staging rule #1, dormant hosts the catch-all) and is
mirrored in `~/.cloudflared/config.yml`. Apply with the command in the session summary — it backs
up the old config and validates before restarting. Until then the release path works locally on
8082; only the edge verification step is blocked.

**Do not** remove the staging rule's position above the catch-all, and do not touch the dormant
hostnames: they are absent from the ingress config entirely and their DNS still points at the
retired tunnel `d61228a8-8e71-457b-988b-cbaacf646760`.

### Phase 1 definition of done (BUILD_PLAN §3)

| Requirement | Measured | Verdict |
|---|---|---|
| 60 fps at 1080p on a mid-range GPU | **64.7 fps** median of 5×20 frames, Quadro M5000, 320 steps/ray, disk on, at the shipped default resolution scale 0.65 (native 1.0 gives 29.3 fps) | met, using the resolution scaling §4.5 marks *required* |
| Shadow radius matches 3√3 GM/c² to within a pixel | **0.013 px** error, holding across three camera distances and fields of view | met, 77× inside the gate |
| A physicist finds nothing to complain about | Four source audits fixed four sets of real errors before implementation; every physical claim is gated on a measurement with a mutation that trips it | see the gate table below |

### Final gate table

| Gate | Value | Mutation that trips it | Mutated |
|---|---|---|---|
| Shadow radius error | **0.013 px** | old `r̂/r⁵` force law | 33.4 px |
| — | — | drop static-observer √(1−rₛ/D) | 2.63 px |
| Shader vs float64 model, radius | **4.1e-4** (gate 1e-3) | — | — |
| Shader vs float64 model, g | **9.0e-5** | — | — |
| Shader vs float64 model, g·T | **2.1e-4** | Shakura–Sunyaev flux law | 29.8% |
| Doppler brightness exponent | **4.0045** | apply g twice | 7.998 |
| Crescent ratio (encoded sRGB) | **3.75** | — | — |
| Temporal stability (scale-invariant) | **0.278** | drop the many-star limit | 1.14 |
| Rim luminance (content check) | **43.5** | narrow kernel until rim blanks | 0.11 |
| Rim sharpness, scale 1.0 vs 0.5 | **117.3 vs 58.1** (2.02×) | — | — |
| Accumulation vs explicit mean | **0.75** of one 8-bit level | — | — |
| Ghosting after camera change | **0** | remove the history reset | 134 |
| Tests | 81 Vitest, 20 Playwright, 57 Python benchmarks | — | — |

**The acceptance suite passes (11 tests).** Run it with `npx playwright test --project=lensing`.
- Shadow radius off a real GPU frame: 99.474 px vs 99.487 px predicted, **0.013 px** error
  against the one-pixel gate, holding across three camera distances and fields of view.
- Disk: shader vs float64 model agree to **3e-5** on emission radius, g and g*T, with **zero**
  hit/miss disagreements over 2500 sampled pixels.
- Doppler exponent measured off the frame: **4.0019** (correct is 4; double-counting reads 8).
- Star-field temporal stability: **rimRms 6.81** against a recorded point-sampling baseline of
  **15.09**; the gate also requires rim luminance > 6, because variance alone rewards a blank frame.
- Accumulation matches an explicit mean of the same jitters to **0.75** of one 8-bit level, and
  discards history on a camera change with ghosting error **0** (**134** without the reset).

## Done and verified

- Vite 7, React 19, TypeScript 5.9 strict / noUncheckedIndexedAccess, reproducible npm lockfile.
- CODATA/reference constants in `src/core/units.ts`; hbar derived from exact h, solar GM kept separate from rounded solar mass.
- In-place float64 RK4, velocity Verlet, Yoshida-4 with reusable scratch buffers and documented callback/aliasing contracts.
- **29 Vitest tests pass:** convergence ratios, reversibility, negative Yoshida substep, non-autonomous RK4 stages, oscillator energy over 1,000 periods, circular/eccentric Newtonian closure, angular momentum, Schwarzschild circular effective-potential equilibrium, formal million-fold-c limit, dimension/alias validation, constants, fourth-order Kepler step-refinement at four (e, a) pairs, and the shell's lazy-route/storage tests.
- **Typecheck and ESLint pass. Production build passes.**
- **72 Vitest tests and 14 Playwright tests pass** (8 of the latter are the lensing acceptance
  suite: shadow radius, per-pixel disk agreement, the Doppler exponent, and the crescent).
- All **57 Python reference benchmark checks pass**; these check formulas, not future simulation
  implementations. §2.4's critical radii are now *derived* by root-finding on the metric rather
  than compared against themselves (see `DECISIONS.md`, Phase 1 source audit).
- Gallery with explicit unavailability state, routing/not-found handling, typed lazy sim registry, system/light/dark themes, keyboard skip navigation, responsive layout.
- Methodology page with lazy-loaded KaTeX and React Aria physics disclosure, assumptions and primary sources.
- **3 Playwright tests pass**, including light/dark axe scans, keyboard disclosure, theme persistence, narrow-screen overflow check, system dark mode and not-found route. No page errors in tested flows.
- Docker multi-stage Node→nginx, web-only compose on `127.0.0.1:8080`, healthy container `physics-web-1`.
- Local deep link `/method` returns 200 with no-cache HTML; missing `/assets/missing.js` returns 404. Public HTTPS root returns 200.
- Full header/MIME sweep against the running container passes, including `font/ttf` after the nginx fix below. Seven screenshots inspected across themes and viewports with no page errors or overflow.
- **3 Playwright tests pass against the production build** (`vite preview` over `dist/`), not the dev server.
- Existing Cloudflare tunnel untouched. Domain already uses the correct hyphen; no DNS action needed.
- Gitleaks v8.24.3 Docker scan of Git history and source found no leaks. Owner explicitly approved using this pinned scanner.
- GitHub Actions workflow (typecheck/lint/arch/tests/Python/build/Playwright/axe/Gitleaks/Docker
  build) **verified green on remote CI**, actions pinned by commit SHA and gitleaks by digest.

## Phase 1 — where to pick up

## Phase 2 — where to pick up

**The audit is done (commit `4fa3b28`). Part 1's physics core is landed; no Phase 2 UI exists
yet.** All the physics the three interactives need is in `PHYSICS_SPEC.md` and asserted in
`verify_benchmarks.py` (57 → 84 checks), so implementation runs from tested formulae rather than
from prose.

> **Correction, 2026-09-06.** This section previously read "no Phase 2 UI exists yet" *and*
> "implementation not started". The second half was false: the session that wrote it was killed by
> a usage limit with `src/core/timeDilation.ts`, its 15 tests, the `units.ts` constants and the §8
> conventions block finished but **uncommitted**. A later session found them in the working tree
> and committed them unchanged as `d28d97e`. The lesson is the one BUILD_PLAN §9 already states and
> that session did not follow: commit at every checkpoint, not at the end of a work item. Work that
> exists only in the working tree is invisible to this file, and this file is what the next session
> trusts.

**DONE: part 1's physics core** (`src/core/timeDilation.ts`, `d28d97e`). Static Schwarzschild clock
rates and their inverse, the GPS gravitational/kinematic split, and Hafele–Keating decomposed into
its Sagnac cross term and quadratic term. 16 Vitest tests, all mutation-tested — see the gate table
below. **Part 1's UI is not built.**

**DONE: part 2, the deflection decomposition interactive** (`/sims/deflection-decomposition`,
commits `dc52dfa` → `3dc64ab`). Core, figures, chart geometry, view, 8 Playwright tests. See the
Phase 2 gate table below.

**DONE: part 3, the Interpretations module** (`/sims/interpretations`, commits `d8764db` →
`43c75ec`). Four charts, one worldline, invariants recovered by four independent routes.

**DONE: part 1's UI, the time-dilation calculator** (`/sims/time-dilation`). Three sections over
the untouched core: near-horizon static clocks with the rate curve and tick strip, GPS with its
gain/loss split and the range-error consequence, and Hafele–Keating against its published bands.

### Phase 2 definition of done (BUILD_PLAN §3)

| Requirement | Verified | Verdict |
|---|---|---|
| Time-dilation calculator + visualiser: GPS, Hafele–Keating, near-horizon clocks | `/sims/time-dilation`, 32 display tests over a 16-test core | met |
| Benchmarks §8.5–8.9 asserted | rows 5–7 at **+45.7 / −7.11 / +38.5 μs/day**; rows 8–9 inside **−40±23** and **+275±21 ns**; row 19 as the **2.25×** cross-to-quadratic ratio | met |
| Deflection decomposition, 0.875″ → 1.75″ | `/sims/deflection-decomposition`, ratio **exactly 2**, space term constant across all fifteen decades | met |
| Interpretations module, four charts, identical invariants | `/sims/interpretations`, four independent recoveries agreeing to **8.7e-15** against a 1e-10 gate | met |
| Plus the tidal panel no "expansion" story reproduces | geodesic-deviation figure, 2:1 stretch-to-squeeze drawn to scale, **−1.0 c²/rₛ²** finite at the horizon | met |

**Totals at Phase 2 close:** 238 Vitest, 40 Playwright (app) + 11 lensing acceptance, 84 Python
benchmarks, **147 mutations across four harnesses, all killed.** Typecheck, ESLint, dependency
rules and the production build are green.

### Phase 2 part 1 gate table

| Gate | Value | Mutation that trips it | Mutated |
|---|---|---|---|
| GPS gravitational | **+45.73 μs/day** (§8 row 5) | drop the 1/R − 1/r ordering | sign flips |
| GPS kinematic | **−7.106 μs/day** (§8 row 6) | drop the ground-station term | −7.21 |
| GPS net | **+38.62 μs/day** (§8 row 7) | sum instead of difference | fails |
| Uncorrected position drift | **11.6 km/day** = c × net | drop the c | fails |
| Ashby pre-launch offset cross-check | **4.4688e-10** vs published 4.4647e-10, **0.09%** high | detune up instead of down | 0.0091 Hz, caught |
| Hafele–Keating eastward | **−44.5 ns**, inside −40±23 | swap the legs | outside |
| Hafele–Keating westward | **+255.6 ns**, inside +275±21 | hardcode `insideBand: true` | caught by the predicate test |
| Cross ÷ quadratic (§8 row 19) | **2.25×**, reverses sign | absolute value of v | asymmetry vanishes |
| Near-horizon rate at 1.000001 rₛ | **9.999995e-4**, slowdown **1000.0005×** | rate as sqrt(d) not sqrt(d/(1+d)) | exactly 1000 |
| tick marks vs label | **exact at 1, 28, 40** | draw count + 1 fenceposts | 41 under "40 ticks" |
| Display-layer mutations killed | **36 / 36** | — | — |

**What building part 1 found.** The new CLAUDE.md rule 3 earned itself immediately: the green
suite passed while the page had three defects, all found by driving it.

1. **The presets did not land on the radii they name.** "Photon sphere" routed through the integer
   slider index and snapped to 1.50119 rₛ, reading 0.5778 instead of 0.5774. State is now the
   exact value with the slider showing the nearest index.
2. **The tick strip drew count + 1 marks under a label saying count** — 41 fenceposts for
   "40 ticks" — and would have divided by zero at one tick.
3. **All three Phase 2 sims scrolled sideways on a phone**, by 68, 7 and 205 px. Grid items default
   to `min-width: auto`, so a `.physics-panel` holding a wide KaTeX display and a `.table-scroll`
   holding a min-width table could not shrink and widened the whole page — their own `overflow-x`
   containers were powerless. A slider thumb also overhung its track end by half its width. Both
   were latent in the lensing sim and only triggered by longer content. The mobile e2e test
   covered only the gallery; there is now a route-level guard over all four sims at 360 and 390 px.

**And one in the tooling.** The mutation harness scored a *crash* as a survival: a mutation that
throws at import time produces zero assertion results, and the scorer read "no failed assertions"
as "survived". A crash is the most emphatic kill there is. Fixed in all four harnesses; all four
re-run clean.

### Phase 2 part 3 gate table

| Gate | Value | Mutation that trips it | Mutated |
|---|---|---|---|
| Proper time to horizon from 8 rₛ | **14.4183 rₛ/c** (§7.4) | drop the −rₛ^{3/2} term | 15.08 |
| Schwarzschild t at the horizon | **∞** | drop the log in F(w) | finite |
| Invariant agreement, 4 charts, same event | **≤ 8.7e-15** (gate 1e-10) | any transformation error | ≫ gate |
| Areal radius agreement, 4 charts | **< 1e-12** | Lambert argument UV instead of UV/e | fails |
| Wrong comparison (same coordinate value 13) | **745×** spread in K | — asserted as a guard | — |
| K, tidal at the horizon | **12**, **−1.0** | wrong power of r | fails at 4 radii |
| Kruskal UV vs exact | **≤ 6e-12** worst | X²−T² instead | 7e-9 at r = 8 rₛ |
| infall mutations killed | **37 / 37** | — | — |
| Tests | 204 Vitest, 27 Playwright (app) | — | — |

**The methodological point, recorded because it is the thing most likely to be undone later.**
K = 48M²/r⁶ and the tidal component depend on the areal radius *alone*, and r is a coordinate in
three of the four charts. Comparing the charts at the same r compares a number with itself and
passes however wrong the transformations are — the same defect as the r = 1 rₛ Kretschmann check
found in the Phase 2 audit. The module therefore compares at the same physical **events**, labelled
by the faller's proper time, and each chart recovers r through its own inverse: a root-find on
t(r), proper time, a root-find on v(r), and W₀(UV/e). The constraint is expressed in the types —
a route's `fromCoordinates` is handed only its own chart's coordinates, never the radius. Beside
it, the module *shows* the wrong comparison and a test asserts its 745× spread, so the correct one
cannot quietly become vacuous.

**What building part 3 found:**

1. **The Kruskal panel rendered empty**, and no unit test would have caught it. With the time
   origin at r₀ the whole worldline sits between X ≈ 10⁴ and 10⁶. The plane is now anchored at
   V = 1 at the horizon crossing — a boost, so every invariant is untouched — which also turns out
   to make the chart *canonical*, independent of r₀.
2. **X² − T² cannot carry this calculation.** X and T agree to one part in 10⁸ over most of the
   trajectory. The boost moves the ill-conditioning between the ends but never removes it; only
   the product UV is accurate at both. Asserted arithmetically.
3. **Two equivalent mutants** in the first mutation run pointed at dead code rather than weak
   tests: a redundant +∞ branch that also wrongly returned a number inside the horizon, and a
   direction auto-detection that always computed the same answer. Both deleted, the properties
   they assumed asserted directly.
4. **`chartGeometry` had to move to `ui/`** — sims must never import each other. The
   dependency-cruiser rule was verified to actually fire by reintroducing the violation.

### Phase 2 gate table

| Gate | Value | Mutation that trips it | Mutated |
|---|---|---|---|
| Light deflection, solar limb | **1.7512″** (§8 row 2) | drop the space term | 0.8756″ |
| Time-only (Einstein 1911) | **0.8756″** | γ on the time term instead | ratio ≠ 2 |
| Deflection ratio | **exactly 2** (§8 row 3) | `1/β` instead of `1/β²` | slope −1 |
| Space term across the slider | **constant 0.8756″** | make it ∝ β² | fails at 6 speeds |
| Time term log-log slope | **−2.000000000** | any wrong exponent | slope ≠ −2 |
| Linearisation vs exact Newtonian | **<0.02%** at α = 0.01 rad | drop the half-angle | factor 2 |
| Weak-deflection threshold | **β = 0.0206**, v = 6178 km/s | ignore the constant space term | 0.0206 → 0.0206 fails |
| time-dilation mutations killed | **45 / 45** | — | — |
| deflection mutations killed | **29 / 29** | — | — |
| Tests | 158 Vitest, 18 Playwright (app) | — | — |

**What building part 2 found, beyond its own physics.** Three defects that one sim had been
hiding, all now fixed in the shared layer rather than worked around locally:

1. **Shared components had no styles of their own.** `NumberSlider`'s track and thumb and
   `MisconceptionsPanel`'s list and “Myth” tag lived in `lensing.css`. The second sim to use them
   shipped a slider with no visible track. Now `src/ui/components.css`.
2. **The misconceptions trigger button failed WCAG AA in dark mode** (4.46:1) — it had no
   background reset and fell back to the UA grey. The lensing sim passed axe only because its
   heading is 24px and so qualifies for the 3:1 large-text threshold.
3. **The site chrome's `header`/`footer` selectors were unscoped**, so both sims' semantic
   `<header>` inherited `display:flex` and a border-bottom and laid their title block out as a
   wrapping row. Now `.site-header` / `.site-footer`.

And two of my own, found by driving the page rather than by any test:

4. **γ = 0 hung the tab.** The space contribution is exactly zero there, `log10(0)` is `-Infinity`,
   and the decade-tick loop counted upwards from it forever. Axis helpers now refuse a non-finite
   axis; the chart drops a line it cannot draw and says so.
5. **The slider could not reach its own top.** React Aria snaps to a grid anchored at the minimum,
   so with a float step the exhibit opened at β = 0.9844 instead of at light — the single value it
   exists to show. It moves in integer indices now, with both endpoints pinned.

**The lesson for the remaining sims:** typecheck, lint and unit tests were green through all five.
Only rendering the page and reading the screenshot found 3, 4 and 5.

The formulae and their tolerances are settled — see §8's Hafele–Keating block, §7.4 Claim A's
boxed α(β), and §7.4 Claim B's four-chart table. What remains is entirely UI and its tests.

### Phase 2 audit findings *(2026-09-06, commit `4fa3b28`)*

Fifth audit, fifth set of findings. None was a wrong number; three were **omissions that make a
stated ASSERT impossible**, which in a document whose rule is "every value marked ASSERT must have
a corresponding test" is its own kind of error.

1. **§8 rows 8–9 could not be asserted at all** — published predictions given, no flight
   parameters, and the answer is strongly latitude-dependent. Added representative 1971 values;
   they land at −44.5 ns and +256 ns, inside the published −40±23 and +275±21 bands.
2. **A notation trap that deletes the effect.** Both kinematic terms were written with
   `v_ground`, which reads as *the ground station's* speed RΩ. Substituting that gives a
   direction-independent constant and the east/west asymmetry vanishes — the one thing rows 8, 9
   and 19 exist to show. Now `v_air`, with R the distance from the rotation axis.
3. **§7.4 Claim A gave the ratio table but never α(v)**, which is what the slider plots. It
   follows uniquely from the section's own assertions, and says something the table does not: the
   space-curvature contribution is the same 0.8756″ at *every* speed.
4. **§7.4 Claim B named four charts without their transformations.** Added, with the radial-infall
   trajectory and the module's thesis turned into assertions.
5. **A weak test of my own, caught by mutation.** The first Kretschmann check tested only
   r = 1 rₛ, where every power of r gives 12, so a mutation to r⁻⁵ passed — the same tautology
   §2.4 carried before its own audit. Now checked at three radii plus the scaling law.

**One known limitation carried forward**, recorded in full in `DECISIONS.md`: the disk outer-edge
step cap trades radius agreement (2.0e-5 → 4.1e-4) for artefact removal and is float32-fragile for
grazing rays. The replacement is written down — event detection by cubic Hermite root-finding on
the step already taken, which never divides by a small velocity — and is deliberately *not*
implemented yet.

### Step 1 — primary-source audit *(done 2026-09-06, commit `08b0223`)*

Verified §2.2 by differentiating the first integral, §2.4's critical radii, and the §6.5
normalization table. **Found two defects**; both are recorded in `DECISIONS.md`:

- **§2.3's flat-Cartesian force law was wrong.** It read `-1.5 h^2 rhat/r^5` with a *unit* vector;
  `starless` writes `points / r**5` where `points` is the position **vector**, i.e. `rhat/r^4`.
  Corrected to `-3M h^2 rhat/r^4`, derived via Binet and confirmed two independent ways
  (b_crit 2.598076 vs the old form's 1.732051; weak-field deflection converging to 4M/b).
  Later reconfirmed on the GPU: the old law renders the shadow 33% too small.
- **§2.4's "ASSERT all of these" asserted nothing** — `check("Photon sphere / M", 3.0, 3.0, ...)`
  compared the expected value with itself. Now derived by root-finding on the metric. Mutating
  the photon potential or L^2(r) fails six checks. Benchmarks went 32 -> 43.

### Step 4 — anti-aliasing, scaling, accumulation *(done 2026-09-06, commits `b72f227`, `bd08d9d`, `23542b2`)*

**The §4.4/§4.5 audit found five things**; two were prescriptions that cannot be carried out.

1. **`dFdx`/`dFdy` are undefined here.** GLSL ES 3.00 §8.9 leaves implicit derivatives undefined
   under non-uniform control flow, and a raymarcher's loop diverges by construction. Neighbours
   are **traced explicitly**, only for escaped pixels.
2. **`textureGrad()` presupposes a texture** the renderer deliberately does not have. For point
   sources the exact filter is `K(J⁺(ω_s − ω_0))` with `K` normalised in *pixel* space.
3. **"Nearly free visually" was false at hard edges.**
4. **Accumulation's reset requirement was unstated.**
5. 1920×1080×256 = 530.8 M, not 532 M.

| Measurement | Value | Guard mutation | Mutated |
|---|---|---|---|
| Temporal stability, rimRms | **6.81** (baseline 15.09) | drop the many-star limit | 11.87, fails |
| Rim luminance | **21.22** | narrow kernel until rim blanks | 0.11, fails |
| Rim edge sharpness, scale 1.0 vs 0.5 | **110.6 vs 51.6** (2.14×) | — | — |
| Ghosting after camera change | **0** | remove the history reset | 134, fails |
| Accumulation vs explicit mean | **0.75** of one 8-bit level | — | — |

**The stability gate needed two halves, and only a mutation showed it.** Narrowing the kernel until
the rim went black scored rimRms 1.78 — better than correct code — because a blank frame has
nothing to vary. It is now paired with a minimum rim luminance.

The star field is rebuilt on **equal-area** cells (equal-`d(cos θ)` bands, fixed azimuthal count),
which fixed the elongated-blob artefact of the old cube lattice.

### Step 3 — accretion disk *(done 2026-09-06, commits `8a8c45b`, `d1192ca`, `51bdfb9`)*

**The §4.3 audit found two errors, both of the "renders convincingly, is wrong" kind.** Full
detail in `DECISIONS.md`; the short version:

1. **The colour pipeline applied `g` twice.** It said to shift the temperature to `T' = gT` *and*
   multiply radiance by `g^4`. But `g^3 B_{nu/g}(T) = B_nu(gT)` identically — the substitution
   *is* the `g^3`, and Stefan–Boltzmann makes it exactly `g^4` bolometrically. The literal
   pipeline scales brightness as `g^8`. At the ISCO edge-on from 20 r_s the true crescent
   contrast is **76.8**; double-counted it is **5899**.
2. **The "Novikov–Thorne" profile was Shakura–Sunyaev**, i.e. Newtonian. That form over-radiates
   by **43%** and implies **8.33%** radiative efficiency, contradicting §2.4's own asserted
   **5.7191%** in the same document. §4.3 now carries the Page–Thorne integral and its
   closed-form Schwarzschild specialisation, derived and confirmed against an independent
   invariant: `int F_NT(r) E(r) r dr = 1 - sqrt(8/9)` to 1.8e-9.

Smaller fixes: the bolometric relation confused flux with intensity; the `g_grav * Doppler`
factorisation never stated that beta and n-hat must be in the *local static frame*, so §4.3 now
gives a closed form for `g` needing no frame transformation; and `hbar` was declared exact.

New code: `core/schwarzschild.ts` (NT flux, circular-orbit energy, `redshiftFactor`),
`core/color/blackbody.ts` (Planck, Wyman/Sloan/Shirley CMF fits, CIE XYZ, linear sRGB),
`model/camera.ts` (camera basis and launch, shared by CPU and shader), disk crossing with secant
refinement in `model/rayTracer.ts`, and the disk in the shader.

**Each audit finding has its own guard, and each was verified by re-introducing the error:**

| Mutation | Measured | Gate | Result |
|---|---|---|---|
| apply `g` twice | exponent **7.998** | 4.0 ± 0.2 | fails |
| Shakura–Sunyaev flux | temperature error **29.8%** | < 0.2% | fails |
| none (correct) | exponent 4.0019, temp error 0.002% | — | passes |

**One guard was not enough.** The Shakura–Sunyaev mutation initially passed everything, because
emission radius and `g` are identical under either flux law. Only comparing `g*T(r)` catches it.

Two corrections to my own work, both worth knowing about:
- I asserted in the spec that the Planckian locus at 6504 K should hit sRGB's D65 white point. It
  should not: D65 is a *daylight* illuminant ~0.0054 off the blackbody locus. The implementation
  matches the published locus to 0.0001, and a test now pins the distinction.
- The per-pixel comparison reported a 1.8% `g` error against a 2e-5 radius agreement. The cause
  was the harness, not the renderer: diagnostics pack 16 bits across blue and **alpha**, and a
  context created `alpha: false` makes `readPixels` return 255 for alpha. See `DECISIONS.md`.

### Step 2 — minimal correct raymarcher *(done 2026-09-06, commit `5908d25`)*

WebGL2 fragment-shader raymarcher, flat-Cartesian per §2.3, RK4 in Nyström form, adaptive
stepping per §4.2 with the photon-sphere Gaussian narrowing. Star field only, no disk.

| File | What it is |
|---|---|
| `src/core/schwarzschild.ts` | Critical radii in r_s = 1 units, shadow angle, the b -> h conversion |
| `src/core/gl/context.ts` | WebGL2 program/context helpers; every failure reports the driver log |
| `sims/blackhole-lensing/view/lensingShader.ts` | The GLSL. float32, r_s = 1 |
| `sims/blackhole-lensing/view/LensingRenderer.ts` | Renderer class, no React |
| `sims/blackhole-lensing/model/rayTracer.ts` | **float64 CPU mirror of the shader** |
| `sims/blackhole-lensing/model/shadowMeasurement.ts` | The acceptance measurement |
| `harness/lensing.ts`, `lensing-harness.html` | Test fixture, built only under `PHYSICS_HARNESS=1` |
| `e2e/lensing.spec.ts` | The acceptance test |

**The launch conditions are the subtle part — read `DECISIONS.md` before touching them.** A pixel
direction is a direction in the camera's *local orthonormal frame*, so
`b = D sin(theta)/sqrt(1 - r_s/D)`, and the flat system's conserved `h` is not `b` but
`1/h^2 = 1/b^2 + 2M/D^3`. Dropping the first puts the edge 2.63 px off; dropping the second is
worth 0.042%.

The acceptance test is discriminating, not merely green — verified by mutation:

| Shader mutation | Measured | Error | Result |
|---|---|---|---|
| none (correct) | 99.474 px | 0.013 px | passes |
| drop the static-observer sqrt factor | 102.119 px | 2.632 px | fails |
| revert to the old `rhat/r^5` force law | 66.043 px | 33.444 px | fails |

**Known limitation, for step 5:** exposure, tone mapping and star brightness are untuned display
parameters. The physics underneath is verified, so tuning them is a step 5 task with measured
gates to catch regressions. Do not change anything that alters `luminance` before tone mapping. The
tangential smearing *near* the hole is real lensing and correct; the blockiness far from it is
not. §4.4's anisotropic sampling work is the right place to fix this. The shadow measurement uses
the `capture-mask` mode and is unaffected.

## Phase 0 gates — all closed 2026-09-06

1. ~~Verify remote CI after push.~~ **DONE 2026-09-06.** `gh auth login` turned out to be
   unnecessary: the repository is public, so run status reads from the unauthenticated REST API
   (`/repos/boyedandtoyed/Physics/actions/runs`). Run `34018255845` on `3902b97` concluded
   **success** with all 17 steps green, including `npm run arch`, Playwright against the
   production build, both gitleaks scans under the pinned digest and read-only mount, and
   `docker compose build`. Also worth recording: runs on `5c98d55` and `a7417ec` had **already
   concluded success** before this session — the previous "remote execution not verified" note
   was stale, not a failure.
2. ~~Strengthen architecture enforcement.~~ **DONE 2026-09-06, commit `1e13fe1`.** dependency-cruiser
   (`npm run arch`, wired into CI) enforces BUILD_PLAN §5 on the resolved import graph with
   `tsPreCompilationDeps`, so type-only imports count. Seven rules: core is framework-free
   (transitive), sims are islands, sims may only reach core/ and ui/, only the registry knows sims,
   ui does not depend upward, no cycles, no devDependencies in shipped code. **Each rule was
   verified to fire against a deliberately violating fixture**, not trusted because the config
   parsed — that is how the `sims → registry → other sim` backdoor was found and closed, and it
   confirms a two-hop `core → hop → ui` leak is caught where the old ESLint rule missed it.
   Constant centralization is `no-magic-numbers` over core/ and sims/, excluding units.ts and
   tests. See `DECISIONS.md` for why app/ and ui/ are out of that rule's scope.
3. ~~Add lazy-route fixture tests, storage-unavailable startup test, and Newtonian refinement
   coverage.~~ **DONE 2026-09-06.** `src/app/App.test.tsx` (jsdom, opted in per-file so the core
   suite stays in the fast node environment) covers a resolving lazy loader including the Suspense
   fallback, a rejecting loader hitting the error boundary, registry entries rendering in the
   gallery, and startup with `localStorage` throwing on both read and write. **All four were
   mutation-checked**: breaking `getDerivedStateFromError` and the storage guard makes the
   relevant tests fail, so they are not passing vacuously. `keplerReturnError` in
   `integrators.test.ts` adds step-refinement coverage at (e, a) = (0, 1), (0.3, 1), (0.5, 2.5),
   (0.7, 0.4): halving the step divides the closure error by 16.0 ± 5%, showing the residual is
   truncation error rather than a wrong model, and the varying semi-major axis makes closure
   itself a Kepler third-law check. The million-fold-c limit remains an algebraic force check,
   not a full GR orbit integration.
4. ~~Complete visual inspection and asset cache/MIME verification against the deployed
   container.~~ **DONE 2026-09-06.** Chromium launches in this environment now; the earlier
   blocker is gone. Seven full-page screenshots were captured against the container on
   `127.0.0.1:8080` (gallery/method/not-found x light/dark, desktop 1440 and mobile 375) and
   inspected: KaTeX renders in both themes, the disclosure is open by default, mobile stacks
   without horizontal overflow, and the run reported no page errors, no failed requests and no
   4xx/5xx. Screenshots are verification artifacts, not committed.
   Header/MIME verification against the container found and fixed one real defect: **nginx
   1.28's `mime.types` has no `ttf`/`otf` entry, so KaTeX's TrueType fallbacks were served as
   `application/octet-stream`.** `nginx.conf` now maps them in a regex location scoped to those
   extensions, because a `types` block replaces the inherited map wholesale — `woff2` was
   re-checked afterwards to confirm the rest of the map survived. Verified after rebuild:
   `index.html`, `/`, `/method` and unknown routes serve `text/html` with `Cache-Control:
   no-cache`; `/assets/*` serve `public, max-age=31536000, immutable` with `application/javascript`,
   `text/css`, `font/woff2` and now `font/ttf`; `wasm` was already `application/wasm`; gzip
   negotiates on the JS bundle; a missing asset is a genuine 404, not the SPA fallback.
5. ~~Stronger CI pinning and a production-preview browser run.~~ **DONE 2026-09-06.** Playwright
   now builds and serves `dist/` via `vite preview` instead of the dev server, so the E2E and axe
   scans exercise the artifact that actually ships; all 3 tests pass against it. CI actions are
   pinned to commit SHAs (`actions/checkout` `11d5960`, `actions/setup-node` `49933ea`, both v4,
   version recorded in a comment) and gitleaks to digest
   `sha256:e1b35e12a8c6fa8901f060459cfb6b2fc4c484d3afbe3b029733a3bbfab07055`, with its repo mount
   made read-only to match the documented local command. Both scans were re-run locally against
   the pinned digest with the read-only mount and report no leaks.
6. **NEXT — Phase 1.** Begin with a primary-source audit of the rendering equations and
   normalization before writing any shader. Read PHYSICS_SPEC §2.3 (flat-Cartesian formulation,
   the one to use), §4.2 (adaptive stepping), §4.3 (the g^3/g^4 colour pipeline), §4.4
   (screen-space-Jacobian anisotropic sampling — retrofitting this is painful, do it from the
   start), §4.6 (float32 near the horizon) and §6.5 (r_s = 1 in shaders, M = 1 in the core, with
   the conversion in exactly one function — `massLengthToSchwarzschild` already exists).
   Golden values to assert off the rendered frame: photon sphere 1.5 r_s, ISCO 3 r_s,
   b_crit = 3*sqrt(3) M. No Phase 1 files exist yet.

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
npm run arch
npm test
npx playwright test --project=lensing   # the Phase 1 acceptance gate
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

### 2026-09-06 — Phase 0 gates closed and signed off

Closed all five outstanding gates in the order the previous session listed them, taking gate 2
first because architecture enforcement is far cheaper to add before the first sim exists than
after.

Approach worth repeating: **no gate was accepted on the strength of a config parsing or a test
passing.** Every dependency-cruiser rule was checked against a deliberately violating fixture,
which is how the `sims -> registry -> other sim` backdoor surfaced; the new shell tests were
mutation-checked by breaking `getDerivedStateFromError` and the storage guard to confirm they
fail; and the Newtonian closure claim was replaced with step-refinement evidence rather than a
single tolerance at one step size.

Two real defects were found this way, neither previously known:

1. KaTeX's `.ttf` fallbacks were served as `application/octet-stream` — nginx 1.28's `mime.types`
   has no ttf/otf entry. Fixed in a scoped regex location; see `DECISIONS.md` for why not a
   server-level `types` block.
2. A sim could have reached every other sim transitively through the registry. Closed before any
   sim exists to exploit it.

One correction to the record: PROGRESS.md said remote CI execution was unverified. It had in fact
already passed twice; the repository is public, so no `gh` authentication was ever needed to check.

Environment note: Chromium launches here now, so the previously blocked screenshot run completed.
Seven full-page captures across themes and viewports were inspected, with no page errors, failed
requests or horizontal overflow. Screenshots are verification artifacts and are not committed.

**Result:** typecheck, lint, arch, 29 unit tests, 32 Python benchmarks, production build, 3
Playwright/axe tests against `dist/`, both gitleaks scans and `docker compose build` all pass
locally and on remote CI (run `34018255845`, conclusion success).

### 2026-09-06 — Phase 1 opened: source audit and a gated raymarcher

Closed the five Phase 0 gates, merged to `master`, then began Phase 1 in the required order.

The source audit earned its place immediately: PHYSICS_SPEC §2.3's renderer force law was wrong,
in the specific way that would have produced a plausible-looking image that quietly failed the
phase acceptance test by 33%. It was caught before a line of shader code existed, by deriving the
law from Binet and checking it against two independent observables. A second finding — that
§2.4's critical radii were "asserted" against themselves — means the benchmark suite now actually
constrains the geometry.

The raymarcher then landed with its acceptance harness built in the same step, as instructed
rather than deferred, and the harness was mutation-tested against two deliberately wrong shaders
before its passing result was believed.

Nothing is registered in the gallery. Steps 3 (disk), 4 (anisotropic sampling, resolution
scaling, accumulation) and 5 (controls, physics panel, a11y) remain.

### 2026-09-06 — Phase 1 step 3: the accretion disk

Audited §4.3 before writing code, as instructed and as §2.3 had been. It found two errors again,
and this time both were the kind that produce a beautiful, confident, wrong picture: a redshift
factor applied twice (brightness scaling as g^8 instead of g^4, a crescent contrast of 5899
instead of 76.8), and a Newtonian flux profile shipped under the Novikov-Thorne name, whose
implied 8.33% radiative efficiency contradicted §2.4's own 5.7191% in the same file.

The instruction to make disk correctness measurable before tuning appearance was the right call
and paid off twice over. Building the guards surfaced that one guard did not cover the other
finding — the Shakura-Sunyaev mutation sailed through every test until a shifted-temperature
comparison was added — and it surfaced a bug in the measuring apparatus itself, where an
`alpha: false` context corrupted the diagnostic readback and mimicked a 1% physics error for long
enough to be worth documenting.

Nothing was tuned for looks until all of that passed. Exposure and peak temperature are display
parameters and are labelled as such.

Still not registered in the gallery. Steps 4 (anisotropic sampling, resolution scaling,
accumulation) and 5 (controls, physics panel, a11y) remain.

### 2026-09-06 — Phase 1 step 4: anti-aliasing, scaling, accumulation

Audited §4.4/§4.5 first. Third audit, third set of findings — this time not wrong numbers but two
prescriptions that cannot be carried out: hardware derivatives are undefined in a raymarcher's
divergent loop, and `textureGrad()` needs a texture this renderer deliberately does not have.

Making stability a number before tuning it earned its keep in an unexpected way. Establishing the
baseline was routine; *verifying the guard* is what exposed that the metric was unsound. A mutation
that blanked the rim scored better than the correct filter, because variance rewards an empty
frame. The gate now has two halves, each verified by the mutation that trips it. That failure would
have been invisible without running the mutation.

**A note against myself:** the step 4 handoff commit corrupted this file. A `str.replace` on an
empty slice — the two `s.index` anchors were in the wrong order — inserted a paragraph between
every character, leaving 127,332 lines. It was committed and pushed, and CI passed because nothing
validates the markdown. Restored from `23542b2` and re-applied with asserted anchors. Lesson worth
keeping: the checks in CI cover code, not documentation, so doc edits need their own verification.

### 2026-09-06 — Phase 1 complete, merged and deployed

Step 5 built the UI: controls for mass, distance, inclination, disk, quality and the
physical-vs-cinematic toggle; the physics panel; a misconceptions panel led by the shadow-versus-
horizon confusion, showing 1.000 rₛ against 2.598 rₛ side by side; keyboard camera and a live
screen-reader description. axe passes in both themes.

Appearance was tuned only after the gates existed, and the stability gate had to be repaired
first: it was an absolute variance threshold, so brightening the stars would have tripped it
though nothing about the filtering changed. It is now `rimRms / rimMean`, which is immune to
brightness and still catches a blank frame.

Three defects surfaced during the build, the first the most interesting. Progressive refinement
oscillated between resolution scales — slow at full, fast when reduced — re-rendering forever,
which froze every Playwright actionability check while the page looked perfectly fine to a human.
It now ratchets downward only. The disk's outer edge was scalloped because a grazing ray could
step across the plane and back inside one step. And React Aria's disclosure headings skipped a
level, which axe caught.

CI failed once on this branch, on time rather than behaviour: the browser tests drive a raymarcher
and CI has no GPU, so WebGL falls back to SwiftShader on two vCPUs. Reproduced locally by pinning
to two cores — the stability measurement takes 57 s against Playwright's 30 s default — and fixed
by giving those projects a realistic timeout.

Merged to `master` at `7bd6e70`, container rebuilt, and the live site verified end to end: the
Collection page lists the simulation, the link resolves, and the canvas renders through the public
HTTPS host.

### 2026-09-06 — Phase 1 landed; Phase 2 audited

Phase 1 merged at `7bd6e70`, container rebuilt, live site verified end to end through the public
HTTPS host: the Collection page lists the simulation, the link resolves, the canvas renders.

Then audited the Phase 2 sections before writing any Phase 2 code, as with every prior step. The
pattern held for a fifth time. Nothing was numerically wrong this time; three sections named an
ASSERT while omitting what the assertion needs, and one carried a notation ambiguity whose natural
misreading removes the effect being demonstrated.

The finding worth carrying forward is the one against myself. My first Kretschmann check tested a
single radius at which every exponent gives the same answer, so a deliberately wrong power passed
it. I only found that because I wrote the mutation — the check read perfectly well. That is now
three separate occasions in this project where writing the mutation, not writing the test, is what
exposed a bad gate.

Stopped here rather than starting part 1: the audit is a complete, coherent unit with everything
green, and beginning a three-part interactive at the end of a long session would have left a
half-built stage. All formulae and tolerances the three parts need are now settled and tested.
