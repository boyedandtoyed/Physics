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
| Reduced Planck | $\hbar$ | $h/(2\pi)$ exactly; 1.054 571 817×10⁻³⁴ J·s is a rounded decimal |
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

$$\boxed{\ddot{\mathbf r} = -3Mh^2\frac{\hat{\mathbf r}}{r^4} = -3Mh^2\frac{\mathbf r}{r^5}}, \qquad h^2 = |\mathbf r \times \mathbf v|^2 \;\text{(conserved, evaluated once at ray launch)}$$

In $r_s=1$ normalization ($M=1/2$), which is what the shader uses (§6.5):
$\;\ddot{\mathbf r} = -\tfrac32 h^2\hat{\mathbf r}/r^4 = -\tfrac32 h^2\mathbf r/r^5$.

> **Transcription warning — this file previously had this equation wrong.** It read
> $-\tfrac32 h^2\hat{\mathbf r}/r^5$, with a *unit* vector over $r^5$. `starless` writes the
> force in code as `-1.5 * h2 * points / r**5`, where `points` is the position **vector**, so
> that expression is $\hat{\mathbf r}/r^4$, not $\hat{\mathbf r}/r^5$. Copying it with a hat
> loses a factor of $r$. The literal form is also dimensionally inconsistent, and it does not
> reduce to §2.2.
>
> **Derivation (Binet).** For any central acceleration $a_r$ with $h=r^2\dot\phi$ conserved,
> $u''+u = -a_r/(h^2u^2)$. Requiring §2.2's $u''+u = 3Mu^2$ gives $a_r = -3Mh^2u^4 = -3Mh^2/r^4$.
> (Check the same identity against Kepler: $a_r=-GMu^2 \Rightarrow u''+u = GM/h^2$. ✓)
>
> **Verified numerically two independent ways**, in $r_s=1$ units, and both are regression
> tests, not one-off checks:
>
> | Observable | As previously written | Corrected | Target |
> |---|---|---|---|
> | $b_{\rm crit}$ (capture threshold) | 1.732051 | **2.598076** | $3\sqrt3M = 2.598076$ |
> | Deflection at $b=2000$ | $4.4\times10^{-7}$ | **0.00100074** | $4M/b = 0.001$ |
>
> The old form yields a shadow **33% too small**. Anyone implementing from the previous text
> would have failed the §2.4 $b_{\rm crit}$ assertion with no clue why.

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

$$\boxed{I_\nu^{\rm obs} = g^3 I^{\rm em}_{\nu_{\rm em}}} \qquad \boxed{I^{\rm obs}_{\rm bol} = g^4 I^{\rm em}_{\rm bol}}$$

(Both statements are about *specific* and *bolometric intensity*. An earlier revision wrote the
second as $F^{\rm obs}_{\rm bol}$, mixing flux with intensity; per pixel the solid angle is fixed
so they are proportional, but the invariant statement is the one about $I$.)

#### The $g$ factor — use the closed form

For a **static observer at $r_{\rm obs}$** and a **circular Keplerian emitter at $r_{\rm em}$** in
Schwarzschild, $g$ has an exact closed form in quantities a raymarcher already has:

$$\boxed{g = \frac{\sqrt{1-3M/r_{\rm em}}}{\left(1-\Omega\,b_\phi\right)\sqrt{1-r_s/r_{\rm obs}}}},
\qquad \Omega = \sqrt{M/r_{\rm em}^3}, \qquad b_\phi \equiv L_z/E$$

derived from $g = (-p_\mu u^\mu)_{\rm obs}/(-p_\mu u^\mu)_{\rm em}$ with $u^t = (1-3M/r)^{-1/2}$.
$b_\phi$ is the photon's **axial** angular momentum per unit energy — the component about the disk
axis, not the total impact parameter. $b_\phi > 0$ is the prograde (approaching) side.

The older factorisation is still correct and is a useful cross-check:

$$g_{\rm grav} = \sqrt{\frac{1-r_s/r_{\rm em}}{1-r_s/r_{\rm obs}}}, \qquad \mathcal D = \frac{1}{\gamma(1-\boldsymbol\beta\cdot\hat n)}, \qquad g_{\rm total} = g_{\rm grav}\cdot\mathcal D$$

but **only when $\boldsymbol\beta$ and $\hat n$ are measured in the local static frame at the
emission point** — $\beta = \sqrt{M/r}\,/\sqrt{1-r_s/r}$ (which is exactly $c/2$ at the ISCO,
§2.4) and $n_{\hat\phi} = b_\phi\sqrt{1-r_s/r}\,/\,r$. Using a coordinate velocity, or $\hat n$ in
the observer's frame, is wrong. The two forms agree to $5\times10^{-16}$; **ASSERT** this.

#### Disk temperature — Novikov–Thorne, which is *not* Shakura–Sunyaev

**Do not use the Newtonian profile and call it Novikov–Thorne.** An earlier revision of this file
printed $T \propto r^{-3/4}[1-\sqrt{r_{\rm in}/r}]^{1/4}$ under the heading "Novikov–Thorne /
Shakura–Sunyaev". That expression is Shakura & Sunyaev (1973) — the **Newtonian** solution. The
relativistic Novikov–Thorne profile is that solution multiplied by relativistic correction
factors, and the difference is not cosmetic: the Newtonian form over-radiates by **43%** in total
and implies a radiative efficiency of **8.33%**, contradicting §2.4's asserted **5.7191%**.

General form (Novikov & Thorne 1973; Page & Thorne 1974), zero-torque at $r_{\rm in}=r_{\rm ISCO}$:

$$\mathcal F(r) = \frac{\dot M}{4\pi M^2}F(r), \qquad
F(r) = \frac{-\partial_r\Omega}{(E-\Omega L)^2}\frac{M^2}{\sqrt{-G}}\int_{r_{\rm in}}^{r}(E-\Omega L)\,\partial_\rho L\;d\rho$$

with $E$, $L$, $\Omega$ the specific energy, axial angular momentum and angular velocity of
equatorial circular geodesics and $-G = \alpha^2 g_{rr}g_{\phi\phi}$.

**Specialised to Schwarzschild** ($M=1$; $\Omega = r^{-3/2}$, $E = (1-2/r)/\sqrt{1-3/r}$,
$L = r/\sqrt{r-3}$, $\sqrt{-G} = r$), two simplifications make it elementary —
$E-\Omega L = \sqrt{1-3M/r}$ and $\partial_r L = (r-6M)/[2(r-3M)^{3/2}]$, the latter vanishing at
the ISCO as marginal stability requires — and the integral is done in closed form by $x=\sqrt r$:

$$\boxed{F_{\rm NT}(r) = \frac{3}{2\,r^{5/2}(r-3M)}\left[\sqrt r-\sqrt6-\frac{\sqrt3}{2}\ln\frac{(\sqrt r-\sqrt3)(\sqrt6+\sqrt3)}{(\sqrt r+\sqrt3)(\sqrt6-\sqrt3)}\right]}$$

$$T_{\rm eff}(r) = \left[\mathcal F(r)/\sigma\right]^{1/4}$$

**ASSERT** — this is the check that makes the profile trustworthy, and it ties the disk to §2.4:

$$\int_{r_{\rm ISCO}}^{\infty} F_{\rm NT}(r)\,E(r)\,r\,dr \;=\; 1-E_{\rm ISCO} \;=\; 1-\sqrt{8/9} = 0.0571909584$$

(verified to $1.8\times10^{-9}$). The $E(r)$ weight is the redshift of locally emitted radiation to
infinity; omitting it gives 0.05829 and is a 1.9% error. Peak flux sits at $r=9.55M$, not the
Newtonian $8.16M$.

**Colour pipeline:**
1. Disk temperature: **Novikov–Thorne**, the boxed $F_{\rm NT}$ above. Never the Newtonian form.
2. A Doppler-shifted blackbody **is still a blackbody**, at $T' = g\,T$. This is exact:
   $g^3B_{\nu/g}(T) = B_\nu(gT)$ identically.
3. **Therefore do not apply $g$ again.** The substitution $T\to gT$ *already contains* the whole
   factor — $g^3$ per band and $g^4$ bolometrically, the latter because Stefan–Boltzmann turns
   $T\to gT$ into exactly $g^4$. An earlier revision said "shift the temperature *and* multiply
   radiance by $g^4$", which applies the shift twice and makes brightness scale as $g^8$. At the
   ISCO viewed edge-on from $r_{\rm obs}=20r_s$ the true approaching/receding bolometric contrast
   is **76.8**; the double-counted pipeline gives **5899**, too large by a factor of 76.8.
   Concretely: look up **luminance-normalised chromaticity** at $T'=g\,T$, and take the brightness
   from $\sigma T'^4$. Do not multiply that product by another $g^4$.
4. Spectral radiance → CIE XYZ → sRGB with proper tone mapping (below).

#### Blackbody → sRGB, concretely

Colour-matching functions: the multi-lobe piecewise-Gaussian fits of **Wyman, Sloan & Shirley
2013**, *Simple Analytic Approximations to the CIE XYZ Color Matching Functions*, JCGT 2(2)
([PDF](https://jcgt.org/published/0002/02/01/paper.pdf)). With
$G(\lambda;\mu,\sigma_1,\sigma_2) = \exp\!\left[-\tfrac12\left(\tfrac{\lambda-\mu}{\sigma}\right)^2\right]$,
$\sigma = \sigma_1$ for $\lambda<\mu$ else $\sigma_2$, $\lambda$ in nm:

$$\bar x = 1.056\,G(599.8, 37.9, 31.0) + 0.362\,G(442.0, 16.0, 26.7) - 0.065\,G(501.1, 20.4, 26.2)$$
$$\bar y = 0.821\,G(568.8, 46.9, 40.5) + 0.286\,G(530.9, 16.3, 31.1)$$
$$\bar z = 1.217\,G(437.0, 11.8, 36.0) + 0.681\,G(459.0, 26.0, 13.8)$$

Then $X=\int B_\lambda(T)\bar x\,d\lambda$ and likewise $Y, Z$, over 360–830 nm. **Normalise by
$Y$** so the table stores chromaticity only — the luminance comes from $\sigma T'^4$, and storing
it twice is the double-count of step 3 in another guise.

Linear sRGB (IEC 61966-2-1, D65 primaries):

$$\begin{pmatrix}R\\G\\B\end{pmatrix} = \begin{pmatrix}3.2406 & -1.5372 & -0.4986\\ -0.9689 & 1.8758 & 0.0415\\ 0.0557 & -0.2040 & 1.0570\end{pmatrix}\begin{pmatrix}X\\Y\\Z\end{pmatrix}$$

Negative components mean the colour is outside the sRGB gamut; desaturate toward white by adding
the most negative component to all three, rather than clipping, which shifts hue. Transfer
function: $C' = 1.055\,C^{1/2.4}-0.055$ for $C>0.0031308$, else $12.92\,C$.

**ASSERT:** the Planckian locus at 6504 K must land within 0.001 of $(x,y)=(0.3135,0.3237)$, and
CIE $x$ must decrease monotonically as $T$ rises.

> **Not a bug: 6504 K is not D65.** sRGB's white point D65 is $(0.3127,0.3290)$, a *daylight*
> illuminant, and it lies about **0.0054** off the Planckian locus — daylight is scattered
> sunlight, not a blackbody. A correct implementation misses D65 by roughly that much, and
> "fixing" it by tuning the colour-matching functions would be fitting to the wrong target. This
> file asserted the D65 value in an earlier revision and was wrong to.

This produces the characteristic **one-sided bright crescent** — the approaching side is
dramatically brighter. Note that DNGR deliberately *softened* this for the film because Nolan
wanted a symmetric disk. **We do not. Physical mode is the default.** A "cinematic" toggle is
permitted but must be labelled as non-physical.

### 4.4 Anti-aliasing — the thing naive shaders get wrong

Point-sampling the star field through a lensing map scintillates badly under camera motion. Near
the shadow rim the map compresses a large solid angle into one pixel, so a point sample reports
whichever single star it happened to land on, and that choice flickers as the camera moves.

DNGR's solution is a propagated elliptical ray bundle giving a per-pixel anisotropic filter
footprint. The mechanism is the **equation of geodesic deviation**, integrated alongside the
central ray, yielding the ellipse's major-axis angle $\mu$ and its angular diameters
$\delta_\pm$ on the celestial sphere (James et al. 2015, §3 and Appendix A.3).

**Cheap GPU approximation:** build a screen-space Jacobian $J = [\partial\omega/\partial x,\;
\partial\omega/\partial y]$ from neighbouring escape directions, and filter with it.

> **Two corrections to an earlier revision of this section, both of which make the naive reading
> unimplementable.**
>
> **1. The neighbours must be traced explicitly. Hardware derivatives are invalid here.** The
> obvious reading of "finite-difference the neighbouring pixels" is `dFdx`/`dFdy`. That is
> **undefined** in this shader: GLSL ES 3.00 §8.9 makes implicit derivatives undefined under
> non-uniform control flow, and a raymarcher's loop necessarily diverges — each pixel breaks on
> capture, on a disk hit, or on escape, at a different iteration.
> ([Khronos GLSL #52](https://github.com/KhronosGroup/GLSL/issues/52).) Trace two extra rays, at
> $+1$ pixel in $x$ and in $y$, and difference those. Only escaped pixels need them, so the cost
> is paid where it is used.
>
> **2. `textureGrad()` presupposes a texture.** A procedural star field has none, and for a field
> of *point* sources there is something better than an approximation — the exact filter is
> available in closed form. A star at direction $\omega_s$ near a pixel whose escape direction is
> $\omega_0$ appears, to first order, at pixel-space offset
> $$\Delta p = J^{+}(\omega_s - \omega_0), \qquad J^{+} = \text{pseudo-inverse of } J$$
> and its contribution is $K(\Delta p)$ for a pixel reconstruction kernel $K$ normalised so
> $\int K\,d^2p = 1$. Because $K$ is normalised **in pixel space**, flux is conserved
> automatically: where the map stretches, a given star contributes less to any one pixel, and
> proportionally more stars fall inside the footprint. That is exactly the anti-aliasing wanted,
> and for point sources it is not an approximation at all.

Do this from the start; retrofitting it is painful.

### 4.5 Performance budget

At 1080p, 256 steps/ray = $1920\times1080\times256 \approx$ **531 M** integration-steps/frame
(an earlier revision said 532 M) ≈ 30–60 fps on a mid-range discrete GPU; integrated GPUs
(Intel Iris, base Apple M-series) run 3–6× slower. Mitigations, both required:

> **The 531 M figure is a lower bound, because §4.4 needs three rays, not one.** The screen-space
> Jacobian requires two extra traced rays for every pixel whose ray escapes. An all-sky frame is
> therefore ~1.6 G integration-steps, not 531 M. The two sections were written independently and
> did not agree; this is the reconciliation.

**Measured on the project machine** (NVIDIA Quadro M5000, Maxwell, via ANGLE/OpenGL 4.5), disk on,
256 steps/ray, 12 timed frames each, forced to synchronise with a pixel readback:

| Configuration | fps | ms/frame |
|---|---|---|
| 1080p, scale 1.0 | **32.4** | 30.8 |
| 1080p, scale 0.7 | **72.6** | 13.8 |
| 1080p, scale 0.5 | 131.7 | 7.6 |
| 720p, scale 1.0 | 79.7 | 12.5 |

The 30–60 fps prediction above is confirmed at native resolution. **BUILD_PLAN's 60 fps at 1080p
is met at scale 0.7**, which is one of the two mitigations this section already marks *required* —
so the target is met as specified, not by relaxing it. Timing note: `gl.finish()` alone does not
block in Chromium, and timing without a readback reported 8700 fps.

**Resolution scaling.** Render the lensing pass at 0.5–0.7× and bilinearly upsample. Note the
quadratic saving: 0.5× is 4× less work, 0.7× is 2×.

> **Correction: "nearly free visually" is true only of the star field.** An earlier revision
> justified this by calling the image "a smooth warped skybox". The lensed star field is smooth,
> but the frame also contains two *hard discontinuities* — the shadow rim and the disk's inner
> edge — and bilinear upsampling softens exactly those. **ASSERT** the cost by measuring it: the
> §2.4 shadow-radius gate must be evaluated at scale 1.0, and the degradation at reduced scale
> must be recorded rather than assumed negligible.

**Temporal accumulation.** Average jittered sub-pixel samples across frames while the camera is
static. Two requirements the earlier revision left unstated:

- **The history must be discarded on any change to the camera or parameters.** Otherwise the
  accumulator smears old geometry across the new frame — the ghosting failure mode of every
  temporal method. "Static camera" is not a description of when it helps; it is a precondition
  the implementation must enforce.
- **The jitter must be sub-pixel and zero-mean**, or accumulation converges to a biased image
  rather than the supersampled one.

**ASSERT — temporal stability must be a number, not an impression.** Define it as the per-pixel
temporal variance of the rendered luminance over a sequence of frames in a region that correct
filtering makes static. Record the baseline before the change and require the improvement to
appear in that number; a filter that "looks smoother" but does not move it has not been shown to
work. Verify the guard by re-introducing point sampling and confirming the metric degrades.

Expose steps/ray and resolution scale as quality controls.

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

### 6.3a Phase 0 numerical reference problems and test interpretation

Finite-step methods have truncation error: “machine precision” in §6.3 means the
analytic Newtonian limit, not exact numerical closure at arbitrary step size. Use
step-halving to distinguish truncation error from roundoff. Kerr spherical-orbit
checks require the Phase 4 model and are deferred until then, not passing placeholders.

For the harmonic oscillator in dimensionless units, $q'=v$, $v'=-q$,
$q(0)=1$, $v(0)=0$, the reference is $(q,v)=(\cos t,-\sin t)$ and
$E=(q^2+v^2)/2$. Measure global convergence at fixed final time: ratios tend to
16 for RK4/Yoshida and 4 for Verlet. Time reversal uses the same fixed number of
steps with negative $\Delta t$; the $10^{-10}$ gate applies to the symplectic
methods, not RK4. Source: Hairer, Lubich & Wanner, *Geometric Numerical Integration*,
2nd ed. (Springer, 2006), chapters I and II,
[doi:10.1007/3-540-30666-8](https://doi.org/10.1007/3-540-30666-8).

For $y'=f(t,y)$, classical RK4 is
$k_1=f(t,y)$, $k_2=f(t+h/2,y+hk_1/2)$,
$k_3=f(t+h/2,y+hk_2/2)$, $k_4=f(t+h,y+hk_3)$,
$y_{n+1}=y_n+h(k_1+2k_2+2k_3+k_4)/6$.
Source: Butcher, *Numerical Methods for Ordinary Differential Equations*, 3rd ed.
(Wiley, 2016), [doi:10.1002/9781119121534](https://doi.org/10.1002/9781119121534).

Newtonian two-body tests use $\ddot{\mathbf r}=-\mu\mathbf r/r^3$,
$T=2\pi\sqrt{a^3/\mu}$, specific energy $E=v^2/2-\mu/r$ and
angular momentum $\mathbf L=\mathbf r\times\mathbf v$. For an ellipse launched
at periapsis, $r_p=a(1-e)$ and $v_p=\sqrt{\mu(1+e)/(a(1-e))}$.
Source: Murray & Dermott, *Solar System Dynamics* (1999), chapter 2,
[doi:10.1017/CBO9781139174817](https://doi.org/10.1017/CBO9781139174817).
These are test problems, not a shipped relativistic orbit model. Numerical closure
must use a stated step size and tolerance and improve with refinement.

For a radial test of §2.5, differentiating the specified effective potential gives
$r''=-\mu/r^2+L^2/r^3-3\mu L^2/(c^2r^4)$, with $\phi'=L/r^2$.
A circular orbit satisfies $L^2=\mu r^2/(r-3\mu/c^2)$. In $M=1$ units,
use $r=10>r_{ISCO}$, $\mu=c=1$. In the formal Newtonian limit, replace
$c$ by $10^6c$ and verify the relativistic force correction decreases by $10^{-12}$;
combine this limit test with the independent Kepler closure tests above. These equations
are algebraic consequences of §2.5, not an additional force model.

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

**ASSERT** (verified numerically against the formula — do not trust transcriptions of these,
several sources get the small-separation rows wrong by a factor of 10):

| $a$ | $F/A$ | |
|---|---|---|
| 10 nm | **1.3001×10⁵ Pa = 130 kPa** | ≈ 1.3 atmospheres — the headline demo |
| 100 nm | **13.001 Pa** | |
| 1 μm | **1.3001 mPa** | |
| 10 μm | **0.13001 μPa** | |

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

#### The deflection as a function of speed — the formula the interactive needs

An earlier revision gave the ratio table above but never the deflection itself, which is what the
slider has to plot. It follows uniquely from what this section already asserts. The
space-curvature contribution does not depend on the particle's speed, and the ratio of the two
contributions is $(v/c)^2$, so with $\beta = v/c$:

$$\boxed{\alpha(\beta) = \underbrace{\frac{2GM}{c^2b}\frac{1}{\beta^2}}_{\text{time curvature}} + \underbrace{\frac{2GM}{c^2b}}_{\text{space curvature}} = \frac{2GM}{c^2b}\left(1+\frac{1}{\beta^2}\right)}$$

Both limits are already in this document and both must be **ASSERT**ed. As $\beta\to0$ the time
term becomes $2GM/(bv^2)$, the Newtonian deflection — consistent with §7.4's statement that in the
slow limit the entire effect comes from $g_{00}$. At $\beta=1$ the two terms are equal and sum to
$4GM/(c^2b) = 1.7512″$ at the solar limb, matching §8 row 2, with the time-only half at
$0.8756″$ and the ratio exactly 2.

Note what the formula says that the table alone does not: **the space-curvature contribution is
the same 0.8756″ for every speed**. It is the time contribution that blows up for slow particles,
not the space contribution that vanishes.

##### The space coefficient is measured, not assumed: PPN $\gamma$

The claim "the factor of 2 is a direct measurement of spatial curvature" is only worth making if
the interactive can show the measurement. In the PPN formalism $\gamma$ is exactly the coefficient
of the spatial-curvature term, and light deflection is

$$\alpha_{\rm light} = \frac{1+\gamma}{2}\cdot\frac{4GM}{c^2b} = \underbrace{\frac{2GM}{c^2b}}_{\text{time}} + \underbrace{\gamma\,\frac{2GM}{c^2b}}_{\text{space}}$$

so the boxed $\alpha(\beta)$ above generalizes, with the $\gamma$ attaching to the space term only:

$$\boxed{\alpha(\beta,\gamma) = \frac{2GM}{c^2b}\left(\frac{1}{\beta^2}+\gamma\right)}$$

General relativity predicts $\gamma=1$ exactly; Einstein's 1911 calculation is $\gamma=0$. The
$\gamma$ coefficient of the light-deflection formula is standard PPN — Will, *The Confrontation
between General Relativity and Experiment*, Living Rev. Relativity **17**, 4 (2014), §3.4.1,
[doi:10.12942/lrr-2014-4](https://doi.org/10.12942/lrr-2014-4). The $\beta$-dependence is the
section's own decomposition, unchanged. Cassini gives
$\gamma-1=(2.1\pm2.3)\times10^{-5}$ (Bertotti, Iess & Tortora 2003), i.e. the space term is
measured equal to the time term to about two parts in $10^5$. **ASSERT:** $\gamma=0$ reproduces
0.8756″, $\gamma=1$ reproduces 1.7512″, and the Cassini bound admits no value outside
$\pm0.0001″$ of 1.7512″.

##### Where this formula stops being true — required in the UI

$\alpha(\beta)$ is a **linearized, small-deflection** result, and the slow end of the slider
violates it spectacularly. At the solar limb $2GM/c^2b = 4.2450\times10^{-6}$ rad, so
$\alpha<0.01$ rad requires $\beta>0.0206$, i.e. $v>6180$ km/s. Taken literally at an apple's
10 m/s the formula returns $\sim7.87\times10^{14}$ arcseconds — about $6.1\times10^{8}$ full turns, which
is not a deflection at all. A 10 m/s particle aimed at the solar limb is simply captured; the
Newtonian two-body problem, not a bending angle, describes it.

This is not a reason to hide the slow end — it is the honest content of the exhibit. The correct
statement is that the *ratio* $\text{space}/\text{time}=\beta^2$ holds throughout and is what the
exhibit is about, while the *absolute* angle is meaningful only in the weak-deflection band. The UI
must therefore mark the invalid band explicitly rather than plotting a number it knows is wrong.
The exact Newtonian comparison for the time term is $\tan(\alpha/2)=GM/(bv^2)$, whose linearization
is the $1/\beta^2$ term; **ASSERT** that the two agree to better than 1% for $\alpha<0.01$ rad and
that they diverge by a factor of 2 at $\beta=9.542\times10^{-4}$ (ratio 1.88 at $\beta=10^{-3}$,
135 at $\beta=10^{-4}$).

**Build this as an interactive:** a slider from "apple" to "light" that shows the two
contributions separately and their sum, converging on 0.875″ → 1.75″. This single interactive
settles the question visually and is one of the strongest exhibits in the product.

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

#### The four charts, explicitly

An earlier revision named the four coordinate systems and the invariant but gave neither the
transformations nor the trajectory, which is everything the module actually has to compute. For
radial infall **from rest at infinity** (geometrized, $r_s = 2M$):

$$\frac{dr}{d\tau} = -\sqrt{\frac{r_s}{r}}, \qquad \tau(r_0\to r) = \frac{2}{3}\frac{r_0^{3/2}-r^{3/2}}{\sqrt{r_s}}, \qquad \frac{dt}{d\tau} = \frac{1}{1-r_s/r}$$

| Chart | Relation to $(t, r)$ | At the horizon |
|---|---|---|
| Schwarzschild | $(t, r)$ | $t \to \infty$ |
| Gullstrand–Painlevé | $t_{ff} = t + \frac{r_s}{c}\left[2\sqrt{r/r_s} + \ln\left\|\frac{\sqrt{r/r_s}-1}{\sqrt{r/r_s}+1}\right\|\right]$; for this trajectory $t_{ff} = \tau$ | finite |
| Eddington–Finkelstein | $v = t + r_*/c$, $\;r_* = r + r_s\ln\left\|r/r_s - 1\right\|$ | finite |
| Kruskal–Szekeres | $T = \sqrt{r/r_s-1}\,e^{r/2r_s}\sinh\frac{ct}{2r_s}$, $\;X = \sqrt{r/r_s-1}\,e^{r/2r_s}\cosh\frac{ct}{2r_s}$, so $X^2-T^2 = (r/r_s-1)e^{r/r_s}$ | finite |

##### The trajectory in closed form, and each chart's time origin

The table gives the transformations but not $t(r)$ along the worldline, which is what the module
must actually evaluate. It follows from the two first integrals above. With $x=r/r_s$ and
$w=\sqrt{x}$,

$$\frac{dt}{dr}=-\frac{\sqrt{r/r_s}}{1-r_s/r}=-\frac{r_s\,w^3}{w^2-1}\cdot\frac{1}{r_s},\qquad
\int\frac{w^4}{w^2-1}\,dw = \frac{w^3}{3}+w+\frac12\ln\left|\frac{w-1}{w+1}\right|$$

$$\boxed{t(r) = t(r_0) - r_s\Big[F(w)-F(w_0)\Big],\qquad F(w)\equiv\tfrac23w^3+2w+\ln\left|\tfrac{w-1}{w+1}\right|}$$

The $\ln(w-1)$ term is what sends $t\to+\infty$ at the horizon. The tortoise coordinate carries
the *same* logarithm with the opposite sign, so it cancels in $v=t+r_*$ and Eddington–Finkelstein
is regular there — that cancellation, not a numerical accident, is why the chart works.
Substituting $F$ into the GP transformation likewise cancels both the $2w$ and the logarithm and
leaves $t_{ff}=\tfrac23 r_s(w_0^3-w^3)=\tau$: **in GP coordinates the free-faller's time
coordinate is its own proper time**, exactly, given the origin $t_{ff}(r_0)=0$.

Each chart's time origin is a convention and none of the invariants depend on it. The module fixes
$t(r_0)=0$ and $t_{ff}(r_0)=\tau(r_0)=0$, and says so in the UI, because a reader comparing two
panels will otherwise read the offset as physics.

##### Kruskal must be carried in null coordinates, not as $(T,X)$

$$V \equiv X+T = e^{v/2r_s},\qquad U \equiv X-T = e^{-u/2r_s},\qquad u\equiv t-r_*,\ v\equiv t+r_*$$

so that $UV = e^{r_*/r_s} = (r/r_s-1)e^{r/r_s}$, which is $X^2-T^2$ written without a subtraction.

This is not a stylistic preference. $X$ and $T$ are each $\tfrac12(V\pm U)$, and $V/U$ runs over
about eleven orders of magnitude along an infall from $8r_s$, so over most of the trajectory $X$
and $T$ agree to within one part in $10^8$ and $X^2-T^2$ loses almost all of its significant
figures.

**The normalisation.** Shifting the Schwarzschild time origin is a boost of the Kruskal plane: it
multiplies $V$ and divides $U$, leaving $UV$ and every invariant untouched. Any choice is equally
correct and they are not equally usable. The module anchors $V=1$ at the horizon crossing, which
has two virtues: the interesting stretch of the worldline lands at order unity and is plottable,
and — because $v(r)-v(r_s)$ does not depend on the time origin — the resulting chart is
**canonical**, the same whatever $r_0$ is. The distant exterior becomes the ill-conditioned end
instead. That is unavoidable: the boost moves the problem, it never removes it.

Measured in float64 with that normalisation: $X^2-T^2$ has a relative error of $7\times10^{-9}$ at
$r=8\,r_s$ and $8\times10^{-11}$ at $6\,r_s$ — breaching the $10^{-10}$ gate — while the product
$UV$ holds $1\times10^{-15}$ at the same points and stays inside $6\times10^{-12}$ everywhere down
to $r=1.00001\,r_s$. **The product $UV$ is what the module uses.** This is the same discipline §6
applies to the shader: work in the variable that does not cancel.

Inverting for the areal radius is then exact via the Lambert $W$ function:

$$(r/r_s-1)e^{r/r_s-1}=UV/e \;\Longrightarrow\; \boxed{r = r_s\left[1+W_0(UV/e)\right]}$$

with $UV\ge0$ outside the horizon, so the principal branch applies and Newton–Halley converges to
machine precision. **ASSERT** that $r$ recovered this way matches the trajectory's own $r$ to
$10^{-12}$ at every sampled event.

##### The comparison must be made at the same EVENTS, not the same coordinate values

This is the one methodological trap in the module, and getting it wrong would make the central
test pass for the wrong reason. $K=48M^2/r^6$ and the tidal component $-2M/r^3$ are functions of
the areal radius $r$ alone, and $r$ is a coordinate in three of the four charts. Comparing the
four charts *at the same $r$* is therefore a tautology: it compares a number with itself and
would pass no matter how badly the transformations were implemented. It is the same defect as the
$r=1\,r_s$ Kretschmann check found in this document's own fifth audit.

The comparison that means something: take a **physical event** on the worldline, labelled by the
free-faller's proper time $\tau$; express it in each of the four charts; then recover the
invariants **from each chart's own coordinates by that chart's own route** — root-finding $t(r)$
for Schwarzschild, $\tau$ for GP, $v(r)$ for Eddington–Finkelstein, and $W_0(UV/e)$ for Kruskal —
and require the four answers to agree.

**ASSERT**, and this is what makes the module honest rather than decorative:

- At every sampled event the four recovered radii agree to $10^{-12}$ and the four Kretschmann
  scalars and tidal components agree to $10^{-10}$.
- **The naive comparison disagrees, by a lot.** Evaluating the three time-like coordinates at the
  same numerical *value* $13\,r_s/c$ lands on three different events — $r = 3.5339$, $2.1386$ and
  $6.4395\,r_s$ respectively — whose Kretschmann scalars differ by a factor of **745**. The module
  shows this side by side with the correct comparison; a test asserts the ratio, so that a future
  refactor which quietly starts comparing coordinate values instead of events fails loudly.

**ASSERT** — this is the module's entire thesis, so it is a test, not a caption:

- The **invariants agree in all four charts** to $10^{-10}$: the Kretschmann scalar
  $K = 48M^2/r^6$ and the radial tidal component $-2M/r^3$ depend on $r$ alone, and $r$ is the
  same areal radius in every chart.
- **Proper time to the horizon is finite** — 14.4183 $r_s/c$ from $r_0 = 8r_s$ — while
  **Schwarzschild $t$ diverges**. That single contrast is what "coordinate pictures are tools,
  invariants are physics" means concretely.
- The tidal component is **finite at the horizon** ($-1.0\,c^2/r_s^2$ for $M = r_s/2$) and
  diverges only as $r\to0$. No uniform-expansion story reproduces a tidal field at all, which is
  the panel that breaks Claim B's literal reading.

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

**Every value in this table has been verified numerically against the formulas above by
[`verify_benchmarks.py`](verify_benchmarks.py) — run `python3 docs/verify_benchmarks.py`.**
Do this again after any edit to this table. It matters: the Casimir values at 10 nm and 100 nm
are widely transcribed a factor of 10 too small, and this script is what caught it.

| # | Benchmark | Formula | Expected | Gate |
|---|---|---|---|---|
| 1 | Mercury perihelion precession | $\Delta\varpi = \dfrac{6\pi GM_\odot}{c^2a(1-e^2)}$ | **42.98″/century** (0.10353″/orbit, 415.20 orbits/cy) | ±0.01″/cy |
| 2 | Light deflection, solar limb | $\alpha = \dfrac{4GM_\odot}{c^2R_\odot}$ | **1.7512″** ($8.4900\times10^{-6}$ rad) | ±0.005″ |
| 3 | Deflection ratio to "time-only" | | **exactly 2** (1.751″ vs 0.875″) | exact |
| 4 | Shapiro delay, Earth–Venus round trip | $\Delta t = \dfrac{4GM}{c^3}\ln\dfrac{4r_1r_2}{b^2}$ | **~200 μs** | order-of-magnitude + formula test |
| 5 | GPS gravitational | | **+45.7 μs/day** | ±0.2 |
| 6 | GPS kinematic | | **−7.2 μs/day** | ±0.2 (depends on ground-station latitude; −7.11 at the equator) |
| 7 | GPS net | | **+38.5 μs/day** | ±0.3 |
| 8 | Hafele–Keating eastward | | predicted −40±23 ns, observed −59±10 ns | reproduce prediction |
| 9 | Hafele–Keating westward | | predicted +275±21 ns, observed +273±7 ns | reproduce prediction |
| 10 | Schwarzschild photon sphere | | $1.5\,r_s$ | exact |
| 11 | Schwarzschild ISCO | | $3\,r_s$ | exact |
| 12 | Critical impact parameter | | $3\sqrt3 M$ | exact |
| 13 | Kerr ISCO, $\chi=0/1$pro/$1$retro | BPT | 6M / 1M / 9M | exact |
| 14 | Gravity Probe B geodetic | | 6606.1 mas/yr (measured 6601.8±18.3) | reproduce prediction |
| 15 | Gravity Probe B frame drag | | 39.2 mas/yr (measured 37.2±7.2) | reproduce prediction |
| 16 | Casimir $F/A$ at 100 nm | $\pi^2\hbar c/240a^4$ | **13.001 Pa** (and 130 kPa at 10 nm ≈ 1.3 atm) | ±1% |
| 17 | Hawking $T_H(M_\odot)$ | | $6.17\times10^{-8}$ K | ±1% |
| 18 | Lamb shift 2S–2P | | ~1057.8 MHz total; Uehling term −27 MHz | reproduce breakdown |
| 19 | Hafele–Keating asymmetry mechanism | $2R\Omega v$ Sagnac cross-term | east/west asymmetry sign | qualitative + sign |

#### Clock calculator implementation conventions

For static Schwarzschild clocks outside the horizon, §2.1 gives
$d\tau/dt=\sqrt{1-r_s/r}$ and the lower/upper rate ratio is
$\sqrt{(1-r_s/r_{lower})/(1-r_s/r_{upper})}$. The zero at the horizon is a
**limit**, not a clock that can hover there: no static timelike observer exists at or inside
$r_s$. The calculator uses $r>r_s$ only. These are rate comparisons, not a ray-traced view of
received ticks; signal travel time is not included.

For the GPS demonstration, retain order $c^{-2}$ in a spherical Earth model:

$$\Delta\tau_{grav}/\Delta t = GM_\oplus(1/R_\oplus-1/r)/c^2,\qquad
\Delta\tau_{kin}/\Delta t = -\big[GM_\oplus/r-(R_\oplus\Omega\cos\lambda)^2\big]/(2c^2).$$

Satellite minus ground, circular orbit, Earth-centered nonrotating frame. Multiply by 86400
seconds for the daily offset. This is an educational approximation, not the operational GPS
clock model: omit oblateness, eccentricity, geoid corrections and signal-propagation corrections.
Source: Neil Ashby (2003), *Relativity in the Global Positioning System*, §5,
[doi:10.12942/lrr-2003-1](https://doi.org/10.12942/lrr-2003-1),
[full text](https://pmc.ncbi.nlm.nih.gov/articles/PMC5253894/).
Use $GM_\oplus=3.986004418\times10^{14}$ m³/s², $R_\oplus=6371000$ m,
$\Omega=7.292115\times10^{-5}$ rad/s, $r_{GPS}=26562000$ m and conventional
$g=9.80665$ m/s². The flight model below additionally assumes constant height, speed and latitude;
its representative flight parameters are not a reconstruction of the measured trajectories.

**Why it matters, stated so the calculator can show it.** GPS positioning is pseudoranging: the
receiver multiplies a clock difference by $c$. An uncorrected clock offset therefore appears
directly as a range error,

$$\Delta s = c\,\Delta\tau_{\rm net},$$

so the net $+38.6$ μs/day computed above becomes **11.6 km/day** of position drift. **ASSERT**
this as $c$ times the net offset, not as an independently remembered number. Ashby (2003) §1 makes
the same point: the satellite clocks are deliberately offset in rate before launch — their
proper frequency is set to 10.22999999543 MHz rather than 10.23 MHz — precisely because the effect
is far too large to leave uncorrected. That factory offset is an independent check on the sign
and magnitude: Ashby's fractional rate correction is $4.4647\times10^{-10}$, and
$10.23\,\text{MHz}\times(1-4.4647\times10^{-10}) = 10.22999999543$ MHz, the published value
exactly. The spherical-Earth model here gives $4.4688\times10^{-10}$ — high by **0.09%**, which is
the geoid correction this approximation drops, and is the right size for that omission.

#### Hafele–Keating, stated so it can actually be asserted

$$\boxed{\frac{\Delta\tau}{\tau} = \frac{gh}{c^2} - \frac{2R_\perp\Omega v_{\rm air}+v_{\rm air}^2}{2c^2}}$$

in the non-rotating ECI frame, where $\Delta\tau$ is the flying clock minus the ground clock. The
ground clock's own $(R_\perp\Omega)^2$ term cancels in that difference, leaving the cross term
$2R_\perp\Omega v_{\rm air}$ — which is what makes east and west asymmetric.

> **Notation trap, corrected.** An earlier revision wrote both terms with $v_{\rm ground}$. That
> reads naturally as *the ground station's* speed $R_\perp\Omega$, and substituting it gives a
> direction-independent constant: **the east/west asymmetry vanishes entirely**, which is the one
> thing this benchmark exists to demonstrate. The velocity in both terms is the **aircraft's speed
> over the ground**, signed positive eastward. $R_\perp = R_\oplus\cos(\text{latitude})$ is the
> distance from the rotation axis, not the Earth's radius.

**Flight parameters** — an earlier revision marked rows 8 and 9 "reproduce prediction" while
giving no flight data, so they could not be asserted at all. Representative values for the 1971
flights: $h \approx 8.9$ km, $v_{\rm air} \approx 265$ m/s, mid-latitude $\approx 50°$, elapsed
41.2 h eastward and 48.6 h westward.

**ASSERT** with those values: eastward $-44.5$ ns and westward $+256$ ns, both inside the
published predictions of $-40\pm23$ ns and $+275\pm21$ ns. The result is genuinely sensitive to
latitude (at the equator the eastward figure is $-90$ ns), so the test asserts the published
*band*, not a single number — the flight profile is not reconstructible from the paper alone.

**ASSERT** row 19 quantitatively rather than qualitatively: at these parameters the
$2R_\perp\Omega v$ cross term is $2.25\times$ the $v^2$ term and reverses sign with direction,
while $v^2$ does not. That ratio *is* the asymmetry mechanism.

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
- Novikov & Thorne 1973, *Astrophysics of Black Holes*, in *Black Holes* (Les Houches), eds. DeWitt & DeWitt — the relativistic thin-disk model
- Page & Thorne 1974, *Disk-Accretion onto a Black Hole. Time-Averaged Structure of Accretion Disk*, ApJ 191, 499 — [ADS](https://ui.adsabs.harvard.edu/abs/1974ApJ...191..499P) — the flux integral of §4.3
- Shakura & Sunyaev 1973, *Black holes in binary systems. Observational appearance*, A&A 24, 337 — the **Newtonian** profile, which is not Novikov–Thorne
- Bambi 2012, *A code to compute the emission of thin accretion disks in non-Kerr space-times* — [arXiv:1210.5679](https://arxiv.org/abs/1210.5679) — states the Page–Thorne flux in the form used here

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
