# Physics Specification

**This file is the single source of truth for every equation in the product.**

Rules for using it:

- If you need a formula that is not here, research it from a primary source, **add it to this
  file with a citation, then implement it.** Never implement physics that is not written down
  here first.
- Every number marked **ASSERT** must have a corresponding test.
- Where this spec states an approximation or a limit of validity, that limitation must be
  surfaced in the product UI, not buried.
- Conventions: geometrized units $G=c=1$ in the core; $r_s = 2GM/c^2$; dimensionless spin
  $\chi = a/M \in [-1,1]$. Two normalizations are used and must never be mixed within a module —
  see §6.6.

---

## 1. Constants (CODATA 2022)

| Quantity | Symbol | Value |
|---|---|---|
| Speed of light | $c$ | 299 792 458 m/s (exact) |
| Planck constant | $h$ | 6.626 070 15 ×10⁻³⁴ J·s (exact) |
| Reduced Planck | $\hbar$ | 1.054 571 817×10⁻³⁴ J·s (exact) |
| Elementary charge | $e$ | 1.602 176 634×10⁻¹⁹ C (exact) |
| Boltzmann | $k_B$ | 1.380 649×10⁻²³ J/K (exact) |
| Gravitational constant | $G$ | 6.674 30(15)×10⁻¹¹ m³ kg⁻¹ s⁻² |
| Electron mass | $m_e$ | 9.109 383 7139×10⁻³¹ kg |
| Electron rest energy | $m_e c^2$ | 510 998.950 69 eV |
| Fine structure constant | $\alpha$ | 7.297 352 5643×10⁻³ = 1/137.035 999 177 |
| Solar mass | $M_\odot$ | 1.988 4×10³⁰ kg |
| $GM_\odot$ | | 1.327 124 400 18×10²⁰ m³s⁻² |
| $GM_\odot/c^2$ | | 1476.6 m |
| Solar radius | $R_\odot$ | 6.957×10⁸ m |

Put these in `core/units.ts` as the only place constants are defined. No magic numbers anywhere
else in the codebase — this is enforced by lint rule.

---

## 2. Schwarzschild geometry

### 2.1 Metric

$$ds^2 = -\left(1-\frac{r_s}{r}\right)c^2dt^2 + \left(1-\frac{r_s}{r}\right)^{-1}dr^2 + r^2 d\Omega^2, \qquad r_s = \frac{2GM}{c^2}$$

### 2.2 Null geodesics — the equation the raymarcher integrates

Spherical symmetry ⇒ every ray is planar. With $u \equiv 1/r$ and impact parameter
$b \equiv L/E$:

$$\left(\frac{du}{d\phi}\right)^2 = \frac{1}{b^2} - u^2 + 2Mu^3$$

Differentiating gives the second-order form to integrate in the shader:

$$\boxed{\frac{d^2u}{d\phi^2} + u = 3Mu^2 = \frac{3GM}{c^2}u^2}$$

In $r_s = 1$ normalization ($M = 1/2$): $\;u'' = -u + \tfrac{3}{2}u^2$.

**Why this form and not 4D integration:** 1 ODE and 2 state variables instead of 8, no
Christoffel symbols in the shader, $\phi$ is monotonic and bounded, and $u$ stays $O(1/r_s)$
instead of $r$ blowing up. This is what `oseiskar/black-hole` and `rantonels/starless` do.

**Massive-particle version** (for orbits): $\;\dfrac{d^2u}{d\phi^2} + u = \dfrac{GM}{h^2} + \dfrac{3GM}{c^2}u^2$, $\;h = r^2\dot\phi$.
The $3GMu^2/c^2$ term is the entire GR correction and produces perihelion precession.

### 2.3 Alternative formulation for the renderer — the "flat Cartesian" trick

`starless` integrates a fictitious Newtonian system in flat 3-D Cartesian coordinates whose
trajectories are *exactly* the Schwarzschild null geodesics:

$$\ddot{\mathbf r} = -\frac{3}{2}h^2\frac{\hat{\mathbf r}}{r^5}, \qquad h^2 = |\mathbf r \times \mathbf v|^2 \;\text{(conserved, evaluated once at ray launch)}$$

Advantages: **no coordinate singularity at $r = 2M$ at all** (the flat metric is used; $r=2M$ is
just a capture test), no orbital-plane rotation matrices, no turning-point sign flips, trivially
GPU-friendly. **Use this for the Schwarzschild real-time renderer.**

### 2.4 Critical radii — ASSERT all of these

| Quantity | Value |
|---|---|
| Event horizon | $r_s = 2GM/c^2$ |
| **Photon sphere** | $3GM/c^2 = 1.5\,r_s$ |
| **Critical impact parameter (shadow)** | $b_{\rm crit} = 3\sqrt3\,GM/c^2 = 5.19615M = 2.598\,r_s$ |
| **ISCO** | $6GM/c^2 = 3\,r_s$ |
| Marginally bound orbit | $4GM/c^2$ |
| ISCO orbital velocity (local) | $c/2$ |
| ISCO radiative efficiency | $1-\sqrt{8/9} = 5.7191\%$ |
| Photon-ring demagnification per half-orbit | $e^{-\pi} \approx 1/23.14$ |
| Lensing ring band | $5.02M < b < 6.17M$ |
| Photon ring band | $5.19M < b < 5.23M$ |

Source for the ring bands and demagnification: Gralla, Holz & Wald 2019, [arXiv:1906.00873](https://arxiv.org/abs/1906.00873).

### 2.5 Effective potential (for the orbit simulator)

$$V_{\rm eff}(r) = -\frac{GM}{r} + \frac{L^2}{2r^2} - \frac{GML^2}{c^2r^3}$$

The $-GML^2/(c^2r^3)$ term is the whole of GR here — it produces **both** perihelion precession
and the ISCO. The ISCO is where $V_{\rm eff}$ loses its minimum, at $L = \sqrt{12}\,GM/c$,
$r = 6GM/c^2$. This Hamiltonian **is** separable, so plain Verlet/Yoshida works — this is the
right formulation for the interactive orbit sim.

---

## 3. Kerr (rotating) geometry

### 3.1 Boyer–Lindquist metric

$$ds^2 = -\left(1-\frac{2Mr}{\Sigma}\right)dt^2 - \frac{4Mar\sin^2\theta}{\Sigma}dt\,d\phi + \frac{\Sigma}{\Delta}dr^2 + \Sigma d\theta^2 + \left(r^2+a^2+\frac{2Ma^2r\sin^2\theta}{\Sigma}\right)\sin^2\theta\, d\phi^2$$

$$\Sigma \equiv \rho^2 = r^2 + a^2\cos^2\theta, \qquad \Delta \equiv r^2 - 2Mr + a^2$$

**3+1 (lapse–shift) form** — more convenient for a renderer, from James, von Tunzelmann,
Franklin & Thorne 2015 ([arXiv:1502.03808](https://arxiv.org/abs/1502.03808), the *Interstellar*/DNGR paper):

$$ds^2 = -\alpha^2dt^2 + \frac{\rho^2}{\Delta}dr^2 + \rho^2d\theta^2 + \tilde\Sigma^2(d\varphi - \omega dt)^2$$
$$\alpha = \rho\sqrt{\frac{\Delta}{\Sigma^2}}\;\text{(lapse)},\qquad \omega = \frac{2ar}{\Sigma^2}\;\text{(frame-drag)},\qquad \Sigma^2 = (r^2+a^2)^2 - a^2\Delta\sin^2\theta$$

### 3.2 Horizons and ergosphere

$$r_\pm = M \pm \sqrt{M^2-a^2}, \qquad r_E(\theta) = M + \sqrt{M^2-a^2\cos^2\theta}$$

Ergosphere is $r_+ < r < r_E(\theta)$ — oblate, touching the horizon at the poles and reaching
$r=2M$ at the equator for any $a$. Inside it $g_{tt}>0$: **no observer can remain static, everything
is forced to co-rotate.** This is the visually strongest Kerr feature and must be shown.

Frame dragging (ZAMO angular velocity): $\Omega_{\rm ZAMO} = -g_{t\phi}/g_{\phi\phi} = 2Mar/\Sigma^2 = \omega$.
Horizon angular velocity: $\Omega_H = a/(r_+^2+a^2)$.

Weak-field Lense–Thirring precession: $\boldsymbol\Omega_{LT} = \dfrac{G}{c^2r^3}\left[3(\mathbf J\cdot\hat r)\hat r - \mathbf J\right]$.
Geodetic precession: $\boldsymbol\Omega_{\rm geo} = \tfrac32\dfrac{GM}{c^2r^3}(\mathbf r\times\mathbf v)$.

### 3.3 ISCO vs spin — Bardeen–Press–Teukolsky

$$Z_1 = 1 + (1-\chi^2)^{1/3}\left[(1+\chi)^{1/3}+(1-\chi)^{1/3}\right], \qquad Z_2 = \sqrt{3\chi^2+Z_1^2}$$
$$\boxed{\frac{r_{\rm ISCO}}{M} = 3 + Z_2 \mp \sqrt{(3-Z_1)(3+Z_1+2Z_2)}}$$

($-$ prograde, $+$ retrograde.) **ASSERT** endpoints: $\chi=0 \Rightarrow 6M$; $\chi=1$ prograde
$\Rightarrow 1M$; $\chi=1$ retrograde $\Rightarrow 9M$. Radiative efficiency $\to 42.3\%$ for
extremal prograde vs $5.72\%$ at $\chi=0$.

Equatorial photon orbits (Teo 2003): $r_{1,2} = 2M\{1+\cos[\tfrac23\arccos(\mp a/M)]\}$,
with $M \le r_1 \le 3M \le r_2 \le 4M$.

**Generate the intermediate-spin table from these formulas in the test harness. Do not
hard-code intermediate values.**

### 3.4 Integration strategy for Kerr — decided

Use the **Hamiltonian / second-order geodesic ODEs in Cartesian Kerr–Schild coordinates**, RK4
with adaptive step. Use $E$, $L_z$, and the Carter constant $Q$ as *runtime error telemetry*,
not as the equations of motion.

Reasoning (this is a real trade-off; it has been decided, don't re-litigate it without cause):
the Carter-separated first-order form contains $\pm\sqrt{R}$, $\pm\sqrt\Theta$ and every radial
and polar turning point requires an exactly-detected sign flip — a SIMD-divergence disaster on
a GPU. Kerr–Schild Cartesian removes both the horizon and the polar-axis coordinate
singularities, so no branching is needed at all. This is GRay2's choice
([arXiv:1706.07062](https://ar5iv.labs.arxiv.org/html/1706.07062)) and GYOTO's stated reason for
avoiding the separated form. Carter-separated + adaptive 5th-order RK (Odyssey's approach) is
correct for an *offline reference* renderer if we build one.

Carter constant, for telemetry: $Q = p_\theta^2 + \cos^2\theta\left(\dfrac{L_z^2}{\sin^2\theta} - a^2(E^2-\mu^2)\right)$.

---

## 4. Rendering the black hole

### 4.1 Backwards ray tracing

For each pixel: build the ray direction in the camera's local orthonormal frame, transform to
the coordinate basis, integrate the geodesic backwards until it (a) hits the horizon → black,
(b) crosses the disk plane → sample emission, or (c) escapes to $r_{\rm far}$ → sample the
celestial sphere at the asymptotic direction. Forward tracing wastes essentially every ray.

### 4.2 Adaptive stepping — required, not optional

Fixed $\Delta\phi$ wastes steps far from the hole and under-resolves near periapsis. Either:

```
dφ = C / (1 + K·u)                                    // cheap and effective
step *= 1.0 - 0.7*exp(-12.0*(u - 0.6667)^2)           // Gaussian shrink at the photon sphere (r_s=1 units)
```

Termination: capture if `u >= 1.0`; bail out on `u < 0` (numerical reversal) and `u >= 20`.

### 4.3 Redshift, Doppler and beaming — the disk colour pipeline

The rigorous statement is that $I_\nu/\nu^3$ is Liouville-invariant along a null geodesic.
Define $g \equiv \nu_{\rm obs}/\nu_{\rm em} = 1/(1+z)$. Then:

$$\boxed{I_\nu^{\rm obs} = g^3 I^{\rm em}_{\nu_{\rm em}}} \qquad \boxed{F^{\rm obs}_{\rm bol} \propto g^4 I^{\rm em}_{\rm bol}}$$

For a Schwarzschild static observer and circular-orbit emitter, $g$ factorizes:

$$g_{\rm grav} = \sqrt{\frac{1-r_s/r_{\rm em}}{1-r_s/r_{\rm obs}}}, \qquad \mathcal D = \frac{1}{\gamma(1+\boldsymbol\beta\cdot\hat n)}, \qquad g_{\rm total} = g_{\rm grav}\cdot\mathcal D$$

**Colour pipeline:**
1. Disk temperature: Novikov–Thorne / Shakura–Sunyaev thin disk, $T(r) \propto r^{-3/4}$ with
   inner-edge cutoff factor $[1-\sqrt{r_{\rm in}/r}]^{1/4}$.
2. A Doppler-shifted blackbody **is still a blackbody**, at $T' = g\,T$ — so shift the
   temperature and look up a blackbody-colour LUT (1000–30 000 K) rather than shifting spectra.
3. Multiply radiance by $g^4$ (bolometric) or $g^3$ (per-band).
4. Spectral radiance → CIE XYZ → sRGB with proper tone mapping.

This produces the characteristic **one-sided bright crescent** — the approaching side is
dramatically brighter. Note that DNGR deliberately *softened* this for the film because Nolan
wanted a symmetric disk. **We do not. Physical mode is the default.** A "cinematic" toggle is
permitted but must be labelled as non-physical.

### 4.4 Anti-aliasing — the thing naive shaders get wrong

Point-sampling the star field through a lensing map scintillates badly under camera motion.
DNGR's solution is a propagated elliptical ray bundle giving a per-pixel anisotropic filter
footprint. **Cheap GPU approximation to implement instead:** finite-difference the neighbouring
pixels' escape directions to build a screen-space Jacobian, and drive `textureGrad()`
anisotropic sampling with it. Do this from the start; retrofitting it is painful.

### 4.5 Performance budget

At 1080p, 256 steps/ray ≈ 532 M integration-steps/frame ≈ 30–60 fps on a mid-range discrete
GPU; integrated GPUs (Intel Iris, base Apple M-series) run 3–6× slower. Mitigations, both
required: render the lensing pass at 0.5–0.7× and bilinearly upsample (the image is a smooth
warped skybox, so this is nearly free visually), and temporally accumulate jittered samples when
the camera is static. Expose steps/ray as a quality slider.

### 4.6 float32 near the horizon

Shader math is float32. Near the horizon and at large $b$, catastrophic cancellation shows up
in $1-r_s/r$. Work in $u=1/r$ (bounded), avoid differences of nearly-equal large numbers, and
if a quantity needs float64, compute it on the CPU and pass it in as a uniform. The physics
core on the CPU is **float64 always** — Mercury's precession test needs per-orbit angular
accuracy better than $10^{-9}$ rad and is impossible in float32.

---

## 5. Gullstrand–Painlevé — the "river model"

Primary source: **Hamilton & Lisle, "The river model of black holes", Am. J. Phys. 76, 519
(2008)**, [arXiv:gr-qc/0411060](https://arxiv.org/abs/gr-qc/0411060v2).

### 5.1 The metric

$$\boxed{ds^2 = -c^2dt_{ff}^2 + (dr + \beta c\,dt_{ff})^2 + r^2d\Omega^2}, \qquad \beta = -\sqrt{\frac{2GM}{rc^2}} = -\sqrt{\frac{r_s}{r}}$$

$\beta$ is the Newtonian escape velocity in units of $c$. Negative = inward (black hole);
positive = white hole.

### 5.2 It is exactly Schwarzschild

Expanding the square recovers Schwarzschild exactly — this is **not** an approximation. The
transformation is purely a re-slicing of time:

$$dt_{ff} = dt + \frac{\sqrt{r_s/r}}{1-r_s/r}\frac{dr}{c}$$

$t_{ff}$ is the proper time of an observer free-falling from rest at infinity. The spatial
slices $t_{ff}=$ const are **exactly flat Euclidean 3-space** — this is the deep fact behind the
"flat space + a flow" picture.

### 5.3 Why we use it

$g_{rr}=1$ everywhere; **no coordinate singularity at $r=r_s$.** GP is horizon-penetrating, so
geodesics integrate smoothly across the horizon. Use GP for any Schwarzschild interior
trajectory. The horizon is exactly where the river reaches $c$: $|\beta| = 1 \Leftrightarrow r = r_s$.

### 5.4 The limits — these must be stated in the UI

Hamilton & Lisle's own caveats, which most popularizations drop:

1. **The flat background is fictitious and unobservable.** Verbatim: *"We emphasize that the
   flat background has no physically observable meaning. It is a fictitious construct that
   emerges from the mathematics."*
2. **Space is not a substance.** The river carries no energy, momentum or stress-energy, has no
   detectable state of motion, and interacts with nothing. It is not an aether.
3. **The flow is a property of a coordinate choice, not of spacetime.** Schwarzschild
   coordinates give a static picture with no flow; Eddington–Finkelstein and Kruskal give
   others. All describe the same geometry. Nothing invariant distinguishes "space is flowing"
   from "space is static and clocks and rulers are distorted." The invariant content is the
   curvature tensor.
4. **No local experiment detects the flow.** A freely-falling lab measures flat Minkowski
   physics to first order. Only *tidal* effects — genuine curvature — are locally detectable,
   and those are absent from the naive river picture.
5. **Exact only for stationary black holes** (Schwarzschild, Reissner–Nordström, Kerr–Newman).
   A general spacetime has no flat spatial slicing.
6. Superluminal river inside the horizon is not a causality violation: nothing moves faster
   than $c$ *relative to the river*, and only that is physical.

**Required UI label:** *"One exact way of slicing Schwarzschild spacetime. The inflow is a
property of this coordinate choice, not a measurable current."*

---

## 6. Numerics

### 6.1 Integrator selection — decided

| Use case | Integrator | Why |
|---|---|---|
| Null geodesics / raymarching | **RK4**, $r$-dependent adaptive step | Rays are short-lived; no secular drift problem. Larger steps than symplectic for the same error. |
| Orbits, anything running >10³ periods | **Velocity Verlet**, or **Yoshida-4** where accuracy demands | Symplectic: energy error bounded and oscillatory forever. RK4's energy error grows secularly and orbits visibly spiral. |
| Offline reference renders | Cash–Karp / RKF45 embedded adaptive | Error estimation for free |

**Velocity Verlet:**
$$v_{n+1/2} = v_n + \tfrac12\Delta t\,a(r_n);\quad r_{n+1} = r_n + \Delta t\,v_{n+1/2};\quad v_{n+1} = v_{n+1/2} + \tfrac12\Delta t\,a(r_{n+1})$$

**Yoshida 4th order** — triple-jump composition $S_4(\tau) = S_2(w_1\tau)S_2(w_0\tau)S_2(w_1\tau)$:
$$w_1 = \frac{1}{2-2^{1/3}} \approx 1.351207191959658, \qquad w_0 = \frac{-2^{1/3}}{2-2^{1/3}} \approx -1.702414383919315$$
**$w_0$ is negative** — a backward sub-step. Many transcriptions drop the sign. Verify
$w_0 + 2w_1 = 1$ in a test.

### 6.2 Tolerances — CI gates

| Check | Gate |
|---|---|
| Constants-of-motion drift $\|\Delta E/E\|$, $\|\Delta L/L\|$, $\|\Delta Q/Q\|$ | $< 10^{-8}$ over full trace |
| Null constraint $\|g_{\mu\nu}p^\mu p^\nu\|/E^2$ | $< 10^{-8}$ |
| Null geodesic imaging, real-time | rel. tol $10^{-3}$–$10^{-4}$ acceptable |
| Null geodesic imaging, offline reference | rel. tol $10^{-6}$–$10^{-8}$ |
| Orbit sims | $10^3$–$10^4$ steps per orbit for Verlet |

Copy GRay's null-constraint error monitor: track $\xi = $ normalized $g_{\mu\nu}p^\mu p^\nu$;
when $|\xi+1| > 10^{-3}$, redo the step at $\Delta\lambda/9$.

Fixed-step symplectic **loses its conservation property under naive step changes** — for
eccentric orbits use a Sundman time transformation ($ds = dt/r$) or a proper adaptive-symplectic
scheme, not an ad-hoc step change.

### 6.3 Integrator quality tests — implement all of these

1. **Time-reversibility**: integrate forward $N$ steps, reverse, integrate back; assert return
   to start within $10^{-10}$. Verlet/Yoshida pass exactly; RK4 does not — this test
   distinguishes them.
2. **Convergence order**: halve $\Delta t$, assert error ratio → $2^p$ (4 for RK4 and Yoshida-4,
   2 for Verlet).
3. **Circular-orbit closure**: an orbit at $r > r_{\rm ISCO}$ must close to $2\pi$ in $\phi$
   with no radial drift.
4. **Newtonian limit regression**: set $c \to 10^6 c$; assert Kepler's third law and closed
   ellipses to machine precision.
5. **Unstable spherical photon orbits in Kerr** (Teo 2003 $\Phi(r)$, $Q(r)$): errors *amplify*
   rather than cancel, so this is the worst-case accuracy probe. Assert $\Delta r/r < 10^{-6}$
   after $N$ orbits.

### 6.4 Horizon coordinate singularity

Options in ascending robustness: terminate at $r=r_+(1+\delta)$, $\delta\sim10^{-6}$ (simple,
loses interior, artifacts for high-order images) → the flat-Cartesian formulation of §2.3 (no
singularity exists; **best for the Schwarzschild renderer**) → GP or Cartesian Kerr–Schild
(**required for Kerr and for any interior trajectory**).

### 6.5 Units and normalization — pick one per module and enforce it

| Convention | $M$ | $r_s$ | $r_{ph}$ | $r_{\rm ISCO}$ | $b_c$ |
|---|---|---|---|---|---|
| $M=1$ | 1 | 2 | 3 | 6 | $3\sqrt3 \approx 5.196$ |
| $r_s=1$ | 0.5 | 1 | 1.5 | 3 | $\tfrac{3\sqrt3}{2} \approx 2.598$ |

**Use $r_s=1$ in shaders** (horizon test is `u >= 1.0`), **$M=1$ in the physics core.** The
conversion lives in exactly one function. Expose only dimensionless $\chi = a/M$ in the UI,
never raw $a$.

---

## 7. Honest physics — the rules that make this product worth building

This section exists because the popular presentation of this subject matter is riddled with
claims that are wrong, and the product's core value proposition is being the one that isn't.
Each subsection gives the myth, the correct treatment, and what to show.

### 7.1 Virtual particles

**The myth:** particle–antiparticle pairs constantly popping in and out of existence everywhere
in the vacuum.

**The physics:** a virtual particle is an **internal line in a Feynman diagram** — a propagator
factor in a term of a perturbative expansion of an S-matrix element. It is a bookkeeping device
for an integral, not an object. Its 4-momentum is an integration variable ranging over all
values, hence **off-shell**: $p^2 \ne m^2c^2$. Virtual particles have no position, no lifetime,
no meaningful probability of being created anywhere, and cannot cause anything.

Sources: Arnold Neumaier, ["Misconceptions about Virtual Particles"](https://www.physicsforums.com/insights/misconceptions-virtual-particles/);
Matt Strassler, ["Virtual Particles: What Are They?"](https://profmattstrassler.com/articles-and-posts/particle-physics-basics/virtual-particles-what-are-they/) — *"A virtual particle is not a particle at all."*

**Strassler's swing analogy is usable directly in the UI:** a real particle is a swing
oscillating at its natural frequency after one push; a "virtual particle" is the swing's motion
while you keep shoving it at the wrong frequency — the motion exists only while the driver is
there and has no natural frequency of its own.

**What to build:** an off-shell explorer. Show a propagator, let the user vary $p^2$, show that
the amplitude is finite and nonzero away from $p^2 = m^2$, and that the pole at $p^2=m^2$ is
where real particles live. This is honest and it is *more* interesting than the myth.

### 7.2 The Casimir effect

$$\frac{E}{A} = -\frac{\pi^2\hbar c}{720\,a^3}, \qquad \boxed{\frac{F}{A} = -\frac{\pi^2\hbar c}{240\,a^4}}$$

**Note the $\pi^2$, not $\pi$.** Coefficient $\pi^2\hbar c/240 = 1.3001\times10^{-27}$ N·m²,
so $F/A\,[\rm Pa] = 1.3001\times10^{-27}/a^4$ with $a$ in metres.

**ASSERT:** $a=10$ nm → 13.0 kPa; $a=100$ nm → 1.30 Pa; $a=1\ \mu$m → 1.30 mPa;
$a=10\ \mu$m → 0.13 μPa.

Sphere–plate (the geometry actually measured — Lamoreaux 1997, Mohideen 1998), PFA, $R \gg a$:
$F(a) = -\pi^3\hbar cR/(360a^3)$.

**The honest framing** (Jaffe, [hep-th/0503158](https://arxiv.org/abs/hep-th/0503158), Phys. Rev. D 72, 021301):
*"Casimir effects can be formulated and Casimir forces can be computed without reference to zero
point energies. They are relativistic, quantum forces between charges and currents."* The force
**vanishes as $\alpha \to 0$**; the universal-looking $\hbar c/a^4$ formula is just the
perfect-conductor limit. Real metals require Lifshitz theory with the plates' reflection
coefficients.

**Required caption:** *"This is a van der Waals force between the plates, computed
relativistically. It is not the vacuum pushing on them."* Ship the ideal formula as the default
and a Lifshitz + Drude "real gold" mode as the advanced view.

### 7.3 Hawking radiation

**The myth:** a virtual pair forms at the horizon, the negative-energy member falls in, the
other escapes. Hawking himself flagged this as heuristic, not derivation.

**Why it fails:** it is not the calculation; it wrongly localizes the radiation at the horizon
(Hawking quanta have wavelengths of order $r_s$, and the emission region is spread over several
$r_s$ — the horizon is not locally special, per the equivalence principle); "negative energy"
is coordinate talk about a global Killing vector, not a local property; it gets the pair
correlations wrong; and it yields no route to the spectrum, the temperature, or the greybody
factors.

**The correct account:** a **Bogoliubov transformation** between two inequivalent mode
decompositions of the same field. $b_j = \sum_i(\alpha^*_{ji}a_i - \beta^*_{ji}a_i^\dagger)$; the
mixing of $a$ with $a^\dagger$ is the entire effect. The in-vacuum is not the out-vacuum, and
$\langle 0_{\rm in}|b_j^\dagger b_j|0_{\rm in}\rangle = \sum_i|\beta_{ji}|^2$. Propagating modes
back through the collapsing geometry gives $|\beta_\omega|^2/|\alpha_\omega|^2 = e^{-2\pi\omega/\kappa}$
with $\kappa = c^4/4GM$, which is exactly the Planck factor:

$$\langle N_\omega\rangle = \frac{\Gamma_\omega}{e^{\hbar\omega/k_BT_H}-1}, \qquad T_H = \frac{\hbar c^3}{8\pi GMk_B} = 6.169\times10^{-8}\,\text{K}\cdot\frac{M_\odot}{M}$$

$\Gamma_\omega$ is the greybody factor — transmission through the Regge–Wheeler barrier — which
is why the spectrum is thermal-*ish*, not exactly Planckian.

$$P = \frac{\hbar c^6}{15360\pi G^2M^2} \approx 3.563\times10^{32}\,\text{W}\cdot(\text{kg}/M)^2, \qquad t_{\rm evap} = \frac{5120\pi G^2M^3}{\hbar c^4} \approx 8.41\times10^{-17}\,\text{s}\cdot(M/\text{kg})^3$$

**ASSERT:** $T_H(M_\odot) = 6.17\times10^{-8}$ K; $T_H = T_{\rm CMB} = 2.725$ K at
$M \approx 4.5\times10^{22}$ kg; $t_{\rm evap}(M_\odot) \approx 2.1\times10^{67}$ yr. State the
photons-only assumption; Page's greybody + lepton corrections speed it up ~3–4× for hot holes.
Give the multiplicative uncertainty rather than fake precision.

**What to build** (all honest, all visually strong): the mode-mixing diagram with $|\beta_\omega|^2$
overlaid on the Planck curve; the exponential late-time redshift pile-up of outgoing null rays
(purely classical, and it *is* the origin of the thermal factor); a Penrose diagram with mode
worldlines; the Regge–Wheeler potential with $\Gamma_\omega$ as barrier transmission; and the
sonic-horizon analogue (Unruh's dumb hole / BEC, where stimulated Hawking radiation has actually
been observed).

**Refuse to build** the pair-at-the-horizon animation, except inside an explicitly labelled
"myth" panel that then shows why it fails.

### 7.4 "Gravity is time dilation" — and the project owner's specific claims

The owner raised two related interpretive claims. Handle both exactly as follows. They are
interesting, they are partly rooted in real formalisms, and they are also partly wrong — the
product should say all three of those things.

#### Claim A: "Time dilation causes gravity."

**Verdict: partially correct — correct as a statement about the Newtonian limit, incorrect as a
general statement, and incorrect as a causal claim.**

Correct in these senses:

- In the weak-field, slow-motion limit the **entire** Newtonian force comes from $g_{00}$ alone.
  With $g_{00} = -(1+2\Phi/c^2)$, the geodesic equation reduces to $\mathbf a = -\nabla\Phi$.
  (Carroll §4; Hughes, MIT 8.962 Lec 9: *"the second term in the geodesic equation is dominated
  by the terms with $\mu=\nu=0$."*)
- The variational restatement is airtight and is the best framing for the UI: a free particle
  extremizes proper time, $S = -mc^2\int d\tau$, and in the weak field
  $S = \text{const} + \int(\tfrac12mv^2 - m\Phi)dt$ — **the relativistic action reduces exactly
  to the Newtonian action.** Objects "fall" because falling extremizes proper time, and the
  position-dependence of the proper-time rate is the gravitational potential.
- It correctly explains why the effect is large despite $\Phi/c^2 \sim 10^{-9}$ at Earth's
  surface: it is multiplied by $c^2$ and integrated over the enormous "distance" $ct$. (This is
  MTW's "Parable of the Apple", *Gravitation* §1.6 & Box 1.6.)

Incorrect in these senses:

- **It is not a causal relation.** $\Phi$ appears in $g_{00}$ *and* in $g_{ij}$; neither derives
  from the other. Both are components of the same curved geometry. Saying "time dilation causes
  gravity" is like saying the hypotenuse causes the legs.
- **It fails for anything relativistic.** The space/time contribution ratio is exactly $(v/c)^2$:

  | System | $v$ | space/time |
  |---|---|---|
  | Falling apple | ~10 m/s | $\sim10^{-15}$ |
  | ISS | 7.7 km/s | $6.6\times10^{-10}$ |
  | Mercury | 47.9 km/s | $2.6\times10^{-8}$ |
  | **Light** | $c$ | **1 — equal** |

  **The decisive check is light deflection.** Time-curvature alone gives $2GM/c^2b$ = **0.875″**
  at the solar limb — Einstein's own 1911 value. The measured value is $4GM/c^2b$ = **1.75″**.
  **The factor of 2 is a direct measurement of spatial curvature.** Equivalently, the PPN
  parameter $\gamma$ *is* the coefficient of spatial curvature, and Cassini measured
  $\gamma-1 = (2.1\pm2.3)\times10^{-5}$.
- **Time dilation exists with zero curvature.** Rindler observers in flat Minkowski spacetime
  see $t_0 = t_f e^{gh/c^2}$ — full gravitational-style time dilation with an identically zero
  Riemann tensor. So time dilation is neither sufficient for nor equivalent to curvature.
- **It cannot produce tidal gravity**, which is the coordinate-independent content of gravity:
  geodesic deviation $\ddot\xi^\mu = -R^\mu{}_{\alpha\nu\beta}u^\alpha u^\nu\xi^\beta$.
- **Not all gravity has a $\Phi$ at all.** Frame dragging comes from $g_{t\phi}$; the ergosphere
  and Lense–Thirring precession have no time-dilation explanation whatsoever.

**Required UI copy:** *"In everyday gravity, essentially all of the effect comes from the way
mass distorts the rate of time — the spatial distortion contributes about a part in $10^{15}$
for a falling apple. But this is a statement about a limit, not a cause: both distortions are
the same curved geometry seen in different components. For light, the two contribute equally,
which is exactly why starlight bends 1.75″ past the Sun instead of 0.875″."*

**Build this as an interactive:** a slider from "apple" to "light" that shows the two
contributions to the deflection separately and their sum, converging on 0.875″ → 1.75″. This
single interactive settles the question visually and is one of the strongest exhibits in the
product.

#### Claim B: "The massive object is literally expanding/coming toward us, while its pull on the spacetime fabric keeps everything balanced."

**Verdict: the intuition maps onto a real, exact formalism — the Gullstrand–Painlevé river model
(§5) — but the literal reading is wrong, and the sim must show precisely where it breaks.**

What is genuinely right about it: in GP coordinates, Schwarzschild spacetime *is* exactly flat
space with an inward flow at the Newtonian escape velocity, and this is not an approximation.
The "things are dragged toward the surface" picture is a fair description of the shift vector.
Free-fall really is being carried by that flow. This is a legitimate, published, exact
reformulation.

Where the literal reading fails:

1. **The flow is a coordinate choice, not a physical current.** The same geometry in
   Schwarzschild coordinates is completely static, with no flow at all. Nothing invariant
   distinguishes the two. Hamilton & Lisle: the flat background *"has no physically observable
   meaning."*
2. **Nothing is expanding.** A literal expansion would have observable consequences the river
   model does not have: it would require a preferred frame, it is not consistent between
   multiple gravitating bodies (which "expansion" does the space between two stars follow?),
   and it cannot produce tidal forces — a uniform expansion has no geodesic deviation, whereas
   real gravity's invariant content *is* geodesic deviation.
3. **It cannot handle orbits.** An inward flow alone explains falling, not the stable closed
   orbits and the ISCO, which come from the angular-momentum barrier in $V_{\rm eff}$ (§2.5).
4. **The equivalence-principle version of "expansion"** — the old "the floor accelerates up to
   meet you" analogy — is only valid *locally*, in a single small lab. Globally it fails
   immediately: two labs on opposite sides of the Earth would both have to "accelerate outward"
   forever without the Earth growing. That contradiction is exactly the tidal effect the
   analogy cannot represent.

**Build this as the "Interpretations" module** — one of the most valuable things in the product.
Same Schwarzschild geometry, four coordinate systems (Schwarzschild, Gullstrand–Painlevé,
Eddington–Finkelstein, Kruskal–Szekeres), one toggle. Show that the trajectories are identical
and the invariants (Kretschmann scalar $R_{\mu\nu\rho\sigma}R^{\mu\nu\rho\sigma} = 48M^2/r^6$,
tidal tensor) are identical, while the *picture* — flowing vs static vs infalling-null —
changes completely. Then show the tidal-force panel that no "expansion" story can reproduce.
The lesson the module teaches: **coordinate pictures are tools, invariants are physics.**

### 7.5 General rule

Where a popular framing is wrong, do not simply omit it — users arrive already believing it.
Show it, label it, and show the calculation that breaks it. A "Common misconceptions" panel per
sim, with the numbers, is a required feature, not a nice-to-have.

---

## 8. Benchmarks — the test suite that proves the product is honest

Store these as a JSON data file (`test/golden/benchmarks.json`), not scattered assertions, so
they are auditable in one place.

| # | Benchmark | Formula | Expected | Gate |
|---|---|---|---|---|
| 1 | Mercury perihelion precession | $\Delta\varpi = \dfrac{6\pi GM_\odot}{c^2a(1-e^2)}$ | **42.98″/century** (0.10353″/orbit, 415.20 orbits/cy) | ±0.01″/cy |
| 2 | Light deflection, solar limb | $\alpha = \dfrac{4GM_\odot}{c^2R_\odot}$ | **1.7512″** ($8.4900\times10^{-6}$ rad) | ±0.005″ |
| 3 | Deflection ratio to "time-only" | | **exactly 2** (1.751″ vs 0.875″) | exact |
| 4 | Shapiro delay, Earth–Venus round trip | $\Delta t = \dfrac{4GM}{c^3}\ln\dfrac{4r_1r_2}{b^2}$ | **~200 μs** | order-of-magnitude + formula test |
| 5 | GPS gravitational | | **+45.7 μs/day** | ±0.2 |
| 6 | GPS kinematic | | **−7.2 μs/day** | ±0.1 |
| 7 | GPS net | | **+38.5 μs/day** | ±0.3 |
| 8 | Hafele–Keating eastward | | predicted −40±23 ns, observed −59±10 ns | reproduce prediction |
| 9 | Hafele–Keating westward | | predicted +275±21 ns, observed +273±7 ns | reproduce prediction |
| 10 | Schwarzschild photon sphere | | $1.5\,r_s$ | exact |
| 11 | Schwarzschild ISCO | | $3\,r_s$ | exact |
| 12 | Critical impact parameter | | $3\sqrt3 M$ | exact |
| 13 | Kerr ISCO, $\chi=0/1$pro/$1$retro | BPT | 6M / 1M / 9M | exact |
| 14 | Gravity Probe B geodetic | | 6606.1 mas/yr (measured 6601.8±18.3) | reproduce prediction |
| 15 | Gravity Probe B frame drag | | 39.2 mas/yr (measured 37.2±7.2) | reproduce prediction |
| 16 | Casimir $F/A$ at 100 nm | $\pi^2\hbar c/240a^4$ | **1.30 Pa** | ±1% |
| 17 | Hawking $T_H(M_\odot)$ | | $6.17\times10^{-8}$ K | ±1% |
| 18 | Lamb shift 2S–2P | | ~1057.8 MHz total; Uehling term −27 MHz | reproduce breakdown |
| 19 | Hafele–Keating asymmetry mechanism | $2R\Omega v$ Sagnac cross-term | east/west asymmetry sign | qualitative + sign |

Hafele–Keating physics to reproduce: $\dfrac{\Delta\tau}{\tau} = \dfrac{gh}{c^2} - \dfrac{2R\Omega v_{\rm ground}+v_{\rm ground}^2}{2c^2}$
in the non-rotating ECI frame — the $2R\Omega v$ cross term is what makes east and west
asymmetric.

---

## 9. Sources

**Primary papers**
- James, von Tunzelmann, Franklin & Thorne 2015, *Gravitational Lensing by Spinning Black Holes in Astrophysics, and in the Movie Interstellar*, CQG 32, 065001 — [arXiv:1502.03808](https://arxiv.org/abs/1502.03808)
- Hamilton & Lisle 2008, *The River Model of Black Holes*, Am. J. Phys. 76, 519 — [arXiv:gr-qc/0411060](https://arxiv.org/abs/gr-qc/0411060v2)
- Gralla, Holz & Wald 2019, *Black Hole Shadows, Photon Rings, and Lensing Rings* — [arXiv:1906.00873](https://arxiv.org/abs/1906.00873)
- Chan, Psaltis & Özel 2013, *GRay* — [arXiv:1303.5057](https://ar5iv.labs.arxiv.org/html/1303.5057); Chan et al. 2017, *GRay2* — [arXiv:1706.07062](https://ar5iv.labs.arxiv.org/html/1706.07062)
- Vincent et al. 2011, *GYOTO* — [arXiv:1109.4769](https://ar5iv.labs.arxiv.org/html/1109.4769)
- Pu et al. 2016, *Odyssey* — [arXiv:1601.02063](https://arxiv.org/abs/1601.02063)
- Teo 2003, *Spherical Photon Orbits Around a Kerr Black Hole*, GRG 35, 1909 — [PDF](https://phyweb.physics.nus.edu.sg/~phyteoe/kerr/paper.pdf)
- Yoshida 1990, *Construction of higher order symplectic integrators*, Phys. Lett. A 150, 262 — [PDF](https://aiichironakano.github.io/phys516/Yoshida-symplectic-PLA00.pdf)
- Wang, Sun & Wu 2021, *Explicit symplectic integrators for Schwarzschild spacetime*, ApJ 907, 66 — [arXiv:2102.00373](https://arxiv.org/abs/2102.00373); Kerr extension — [arXiv:2106.12356](https://arxiv.org/abs/2106.12356)
- Jaffe 2005, *The Casimir Effect and the Quantum Vacuum*, PRD 72, 021301 — [hep-th/0503158](https://arxiv.org/abs/hep-th/0503158)
- Bertotti, Iess & Tortora 2003, *A test of general relativity using radio links with the Cassini spacecraft*, Nature 425, 374
- Everitt et al. 2011, *Gravity Probe B: Final Results*, PRL 106, 221101 — [PDF](https://einstein.stanford.edu/content/sci_papers/papers/PhysRevLett.106.221101.pdf)
- Hafele & Keating 1972, *Around-the-World Atomic Clocks*, Science 177, 168 — [PDF](https://download.itp3.uni-stuttgart.de/rt2324/Hafele_Keating-Experiment.pdf)
- Müller & Camenzind 2004, A&A — relativistic disk imaging — [PDF](https://www.aanda.org/articles/aa/pdf/2004/03/aah4692.pdf)

**Textbooks**
- Misner, Thorne & Wheeler, *Gravitation* (Princeton, 1973/2017), esp. §1.6 & Box 1.6
- Carroll, *Spacetime and Geometry* / [Lecture Notes on GR §4](https://ned.ipac.caltech.edu/level5/March01/Carroll3/Carroll4.html)
- Schutz, *A First Course in General Relativity*, §7.4
- Hartle, *Gravity*, §6.6 & Ch. 9
- Hughes, [MIT 8.962 Lecture 9](https://web.mit.edu/sahughes/www/8.962/lec09.pdf)

**Implementations to read (not copy — read for technique)**
- [rantonels/starless](https://github.com/rantonels/starless) + [writeup](https://rantonels.github.io/starless/)
- [oseiskar/black-hole](https://github.com/oseiskar/black-hole) — WebGL, Three.js
- [Leo Stein's Kerr ISCO calculator](https://duetosymmetry.com/tool/kerr-isco-calculator/) — for cross-checking

**On honest QFT**
- [Neumaier, *Misconceptions about Virtual Particles*](https://www.physicsforums.com/insights/misconceptions-virtual-particles/)
- [Strassler, *Virtual Particles: What Are They?*](https://profmattstrassler.com/articles-and-posts/particle-physics-basics/virtual-particles-what-are-they/)
- [Baez & Bunn, *The Meaning of Einstein's Equation*](https://math.ucr.edu/home/baez/einstein/einstein.pdf)
- [Wright, *Deflection and Delay of Light*](https://www.astro.ucla.edu/~wright/deflection-delay.html)
