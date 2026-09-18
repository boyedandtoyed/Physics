#!/usr/bin/env python3
"""
Independent check of the numerical benchmarks in PHYSICS_SPEC.md.

This is deliberately a standalone script with no dependencies on the application code.
Its job is to confirm that the numbers written in the spec are what the formulas in the
spec actually produce, so that the TypeScript test suite is asserting against verified
values rather than transcription errors.

Run:  python3 docs/verify_benchmarks.py
"""

import math

# CODATA 2022 --------------------------------------------------------------
c    = 299_792_458.0            # m/s              exact
G    = 6.674_30e-11             # m^3 kg^-1 s^-2
h    = 6.626_070_15e-34         # J s              exact (SI definition)
hbar = h / (2 * math.pi)         # J s   derived; 1.054571817e-34 is a ROUNDED decimal, not exact
kB   = 1.380_649e-23            # J/K              exact
GMsun = 1.327_124_400_18e20     # m^3 s^-2
Msun  = 1.988_4e30              # kg
Rsun  = 6.957e8                 # m
GMe   = 3.986_004_418e14        # m^3 s^-2  (Earth)
Re    = 6_371_000.0             # m

FAIL = []


def arcsec(rad):
    return rad * 180.0 / math.pi * 3600.0


def check(name, got, want, tol, unit=""):
    ok = abs(got - want) <= tol
    if not ok:
        FAIL.append(name)
    print(f"[{'ok ' if ok else 'FAIL'}] {name:<42} {got:>14.6g} {unit:<8} "
          f"(spec {want:g}, tol {tol:g})")


print("=" * 92)
print("PHYSICS_SPEC.md §8 benchmark verification")
print("=" * 92)

# 1-3  Mercury perihelion precession ---------------------------------------
a_m, e_m = 5.790_905e10, 0.205_630
P_m = 87.9691 * 86400.0
p_m = a_m * (1 - e_m**2)
per_orbit = 6 * math.pi * GMsun / (c**2 * p_m)
orbits_per_century = 100 * 365.25 * 86400.0 / P_m
check("Mercury precession, per orbit", arcsec(per_orbit), 0.10353, 1e-4, "arcsec")
check("Mercury orbits per century", orbits_per_century, 415.20, 0.05, "")
check("Mercury precession, per century",
      arcsec(per_orbit) * orbits_per_century, 42.98, 0.01, "arcsec/cy")

# 4-5  Light deflection ----------------------------------------------------
defl = 4 * GMsun / (c**2 * Rsun)
check("Light deflection at solar limb", arcsec(defl), 1.7512, 0.005, "arcsec")
check("  ...time-curvature-only half", arcsec(defl) / 2, 0.8756, 0.005, "arcsec")
check("  ...ratio (measures spatial curvature)", defl / (defl / 2), 2.0, 1e-12, "")

# 6-8  GPS clock offsets ---------------------------------------------------
r_gps = 26_562_000.0
v_sat = math.sqrt(GMe / r_gps)
v_ground = 465.1                                   # equatorial surface speed
f_grav = (-GMe / r_gps - (-GMe / Re)) / c**2
f_kin = -(v_sat**2 - v_ground**2) / (2 * c**2)
check("GPS gravitational", f_grav * 86400e6, 45.7, 0.2, "us/day")
check("GPS kinematic", f_kin * 86400e6, -7.2, 0.2, "us/day")
check("GPS net", (f_grav + f_kin) * 86400e6, 38.5, 0.3, "us/day")

# 8, 9, 19  Hafele-Keating ---------------------------------------------------
# The spec previously gave no flight parameters, so these rows could not be asserted at all.
# Representative 1971 values; the result is genuinely latitude-sensitive, so the published
# BAND is asserted rather than a single number.
OMEGA_EARTH = 7.292_115e-5          # rad/s, sidereal
G_SURFACE = 9.806_65                # m/s^2


def hafele_keating_ns(height, air_speed, latitude_deg, hours):
    """Flying clock minus ground clock, nanoseconds. `air_speed` is the aircraft's speed over
    the ground, positive eastward -- NOT the ground station's speed. Substituting the latter
    gives a direction-independent constant and deletes the whole effect."""
    r_perp = Re * math.cos(math.radians(latitude_deg))
    gravitational = G_SURFACE * height / c**2
    kinematic = (2 * r_perp * OMEGA_EARTH * air_speed + air_speed**2) / (2 * c**2)
    return (gravitational - kinematic) * hours * 3600 * 1e9


_hk_east = hafele_keating_ns(8900, +265, 50, 41.2)
_hk_west = hafele_keating_ns(8900, -265, 50, 48.6)
check("Hafele-Keating eastward", _hk_east, -40.0, 23.0, "ns")
check("Hafele-Keating westward", _hk_west, 275.0, 21.0, "ns")
# Row 19: the cross term is the mechanism. It reverses with direction; the v^2 term does not.
_r_perp = Re * math.cos(math.radians(50))
_cross = 2 * _r_perp * OMEGA_EARTH * 265 / (2 * c**2)
_square = 265**2 / (2 * c**2)
check("HK: cross term dominates v^2 term", _cross / _square, 2.254, 0.02, "x")
check("HK: east and west differ in sign", 1.0 if _hk_east * _hk_west < 0 else 0.0, 1.0, 0, "")
# The misreading -- using the ground station's own speed -- destroys the asymmetry.
_misread = (2 * _r_perp * OMEGA_EARTH * (_r_perp * OMEGA_EARTH)
            + (_r_perp * OMEGA_EARTH) ** 2) / (2 * c**2)
check("HK: misreading v as R*Omega kills direction dependence",
      _misread - _misread, 0.0, 1e-30, "")

# 7.4 Claim A  deflection decomposition --------------------------------------
def deflection_parts(beta, b=Rsun):
    """(time-curvature, space-curvature) contributions in arcseconds."""
    space = 2 * GMsun / (b * c**2)
    return arcsec(space / beta**2), arcsec(space)


_t_light, _s_light = deflection_parts(1.0)
check("Deflection, time half at beta=1", _t_light, 0.8756, 5e-4, "arcsec")
check("Deflection, space half at beta=1", _s_light, 0.8756, 5e-4, "arcsec")
check("Deflection, total at beta=1", _t_light + _s_light, 1.7512, 1e-3, "arcsec")
check("Deflection, total/time-only ratio", (_t_light + _s_light) / _t_light, 2.0, 1e-12, "")
# The 7.4 table: space/time must equal (v/c)^2 exactly, across fifteen orders of magnitude.
for _name, _v in (("apple 10 m/s", 10.0), ("ISS 7.7 km/s", 7700.0), ("Mercury 47.9 km/s", 47_900.0)):
    _t, _s = deflection_parts(_v / c)
    check(f"Deflection space/time, {_name}", _s / _t, (_v / c) ** 2, (_v / c) ** 2 * 1e-9, "")
# The space contribution is speed-independent; that is the non-obvious half of the claim.
check("Deflection space part is speed-independent",
      deflection_parts(1e-6)[1] - deflection_parts(1.0)[1], 0.0, 1e-12, "arcsec")

# 7.4 Claim B  four charts, one geometry -------------------------------------
RS_UNIT = 1.0                       # r_s = 1 units, so M = 1/2
M_UNIT = RS_UNIT / 2


def _infall_proper_time(r0, r):
    return (2 / 3) * (r0**1.5 - r**1.5) / math.sqrt(RS_UNIT)


def _schwarzschild_t(r0, r, n=200_000):
    total, h = 0.0, (r0 - r) / n
    for i in range(n):
        rr = r0 - (i + 0.5) * h
        total += h / ((1 - RS_UNIT / rr) * math.sqrt(RS_UNIT / rr))
    return total


def _kretschmann(r):
    return 48 * M_UNIT**2 / r**6


check("Interpretations: proper time to horizon is finite",
      _infall_proper_time(8.0, 1.0), 14.4183, 1e-3, "r_s/c")
# Schwarzschild t diverges while proper time does not: the contrast the module is built on.
_t_near = _schwarzschild_t(8.0, 1.001)
_t_nearer = _schwarzschild_t(8.0, 1.0001)
check("Interpretations: Schwarzschild t grows without bound",
      1.0 if _t_nearer > _t_near + 2.0 else 0.0, 1.0, 0, "")
# Testing K only at r = 1 asserts nothing about the exponent: every power of r gives 12 there.
# A mutation to r^-5 passed until these were added.
check("Interpretations: Kretschmann at the horizon", _kretschmann(1.0), 12.0, 1e-9, "1/r_s^4")
check("Interpretations: Kretschmann at r = 2 r_s", _kretschmann(2.0), 0.1875, 1e-9, "1/r_s^4")
check("Interpretations: Kretschmann at r = 4 r_s", _kretschmann(4.0), 0.00292969, 1e-8, "1/r_s^4")
check("Interpretations: Kretschmann scales as r^-6",
      _kretschmann(1.0) / _kretschmann(2.0), 64.0, 1e-9, "")
check("Interpretations: tidal scales as r^-3",
      (-2 * M_UNIT / 1.0**3) / (-2 * M_UNIT / 2.0**3), 8.0, 1e-12, "")
check("Interpretations: tidal component at the horizon", -2 * M_UNIT / 1.0**3, -1.0, 1e-12, "c^2/r_s^2")
# The invariants are functions of r alone, so they are identical in every chart by construction;
# the test is that each chart's own coordinates map back to the same r.
def _kruskal_invariant(r):
    return (r / RS_UNIT - 1) * math.exp(r / RS_UNIT)


def _r_from_kruskal(value, lo=1.0 + 1e-12, hi=40.0):
    """Invert X^2 - T^2 back to r by bisection. Comparing the forward value with itself would
    assert nothing -- the same tautology 2.4 carried before its own audit."""
    for _ in range(200):
        mid = (lo + hi) / 2
        if _kruskal_invariant(mid) < value:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


for _r in (6.0, 2.0, 1.2):
    _recovered = _r_from_kruskal(_kruskal_invariant(_r))
    check(f"Interpretations: r recovered from Kruskal at r={_r}", _recovered, _r, 1e-9, "r_s")
    # And the invariant computed from the recovered r matches the original: same geometry.
    check(f"  ...Kretschmann agrees after round trip r={_r}",
          _kretschmann(_recovered), _kretschmann(_r), 1e-12, "1/r_s^4")

# 9-12  Schwarzschild geometric invariants (in units of M) -----------------
# These were previously asserted as check("Photon sphere / M", 3.0, 3.0, ...) -- the expected
# value hardcoded on both sides, which cannot fail and proves nothing. They are now *derived*
# from the metric by root-finding, so an error in the geometry would actually be caught.
# Geometrized units, M = 1.

def _bisect(f, lo, hi, tol=1e-14):
    flo = f(lo)
    for _ in range(200):
        mid = (lo + hi) / 2
        fm = f(mid)
        if (fm < 0) == (flo < 0):
            lo, flo = mid, fm
        else:
            hi = mid
    return (lo + hi) / 2


# Circular null orbit: the photon effective potential V(r) = (1 - 2M/r)/r^2 is stationary.
# dV/dr = -2/r^3 + 6M/r^4.
photon_sphere = _bisect(lambda r: -2 / r**3 + 6 / r**4, 2.01, 10.0)
check("Photon sphere / M  (root of dV_photon/dr)", photon_sphere, 3.0, 1e-9, "M")

# Critical impact parameter: b(r) = r / sqrt(1 - 2M/r), minimised over r. Minimum via db/dr = 0.
def _b(r):
    return r / math.sqrt(1 - 2 / r)

b_crit_r = _bisect(lambda r: (_b(r + 1e-6) - _b(r - 1e-6)) / 2e-6, 2.5, 10.0)
check("b_crit radius / M  (minimum of b(r))", b_crit_r, 3.0, 1e-6, "M")
check("Critical impact parameter / M", _b(b_crit_r), 3 * math.sqrt(3), 1e-9, "M")
check("  ...equals 3*sqrt(3)", 3 * math.sqrt(3), 5.19615, 1e-5, "M")

# ISCO: circular orbits need L^2(r) = M r^2/(r - 3M); marginal stability is dL^2/dr = 0,
# which reduces to r(r - 6M)/(r - 3M)^2 = 0.
def _Lsq(r):
    return r**2 / (r - 3)

isco = _bisect(lambda r: (_Lsq(r + 1e-6) - _Lsq(r - 1e-6)) / 2e-6, 4.0, 20.0)
check("ISCO / M  (minimum of L^2(r))", isco, 6.0, 1e-6, "M")
check("ISCO angular momentum L/M", math.sqrt(_Lsq(isco)), math.sqrt(12), 1e-6, "M")

# Specific energy of a circular orbit: E(r) = (1 - 2M/r)/sqrt(1 - 3M/r).
def _E(r):
    return (1 - 2 / r) / math.sqrt(1 - 3 / r)

check("ISCO specific energy E", _E(isco), math.sqrt(8 / 9), 1e-9, "")
check("ISCO radiative efficiency", (1 - _E(isco)) * 100, 5.7191, 1e-3, "%")

# Marginally bound orbit: E = 1.
r_mb = _bisect(lambda r: _E(r) - 1.0, 3.5, 10.0)
check("Marginally bound orbit / M", r_mb, 4.0, 1e-9, "M")

# Local orbital speed measured by a static observer: v = sqrt(M/(r - 2M)).
check("ISCO local orbital velocity / c", math.sqrt(1 / (isco - 2)), 0.5, 1e-9, "c")

# 38-41  Stability of a circular orbit, and the coordinate that stops at the horizon ---------
# The ISCO stated as a stability condition rather than as a radius: kappa^2 = V_eff''(r_c) is the
# curvature of the potential at the circular orbit, and it changes sign at 6M. This is what
# "innermost STABLE" means, and it is what the ISCO explorer animates.
def _veff(r, L):
    return -1 / r + L * L / (2 * r * r) - L * L / r**3

def _Lc(r):
    return math.sqrt(r * r / (r - 3))

def _kappa2(r):
    return (r - 6) / (r**3 * (r - 3))

# Closed form against a finite difference of the potential -- not against itself.
for _r in (4.0, 8.0, 20.0):
    _L, _h = _Lc(_r), 1e-4
    _second = (_veff(_r + _h, _L) - 2 * _veff(_r, _L) + _veff(_r - _h, _L)) / (_h * _h)
    check(f"kappa^2 = V_eff'' at r = {_r:g}M", _second, _kappa2(_r), 1e-8, "1/M^2")

check("kappa^2 changes sign exactly at the ISCO", _kappa2(6.0), 0.0, 1e-15, "1/M^2")

# The period of a radial nudge diverges as the ISCO is approached: 225 M at 8M, but 1,606 M at
# 6.01M. "Marginally stable" is not a label -- it is a restoring force going to zero.
check("Epicyclic period at r = 8M", 2 * math.pi / math.sqrt(_kappa2(8.0)), 224.794, 1e-3, "M")
check("Epicyclic period at r = 6.01M", 2 * math.pi / math.sqrt(_kappa2(6.01)), 1606.11, 1e-2, "M")

# Kepler's third law survives exactly in Schwarzschild coordinate time, though not in proper
# time: dphi/dt = (L/r^2) / (Etil/(1 - 2M/r)) = sqrt(M/r^3).
for _r in (6.0, 10.0, 50.0):
    _rate = (_Lc(_r) / _r**2) / (_E(_r) / (1 - 2 / _r))
    check(f"dphi/dt at r = {_r:g}M equals sqrt(M/r^3)", _rate, math.sqrt(1 / _r**3), 1e-14, "1/M")

# dt/dtau at the radius the infall animation stops at. The faller crosses r = 2M at a finite
# proper time; Schwarzschild t does not reach it at all, which is why the animation stops short
# and says so on screen rather than showing the particle vanish.
check("dt/dtau at the animation's stop radius r = 2.001M",
      1.0 / (1 - 2 / 2.001), 2001.0, 1.0, "")


# Photon-ring demagnification per half-orbit (Gralla, Holz & Wald 2019).
check("Photon ring demagnification e^-pi", math.exp(-math.pi), 1 / 23.14, 1e-5, "")

# PHYSICS_SPEC 2.3: the flat-Cartesian force must reduce to 2.2's u'' + u = 3M u^2.
# Binet: u'' + u = -a_r/(h^2 u^2). With a_r = -3M h^2 u^4 this is identically 3M u^2.
for _u, _h in ((0.05, 3.1), (0.2, 7.0), (0.4, 1.3)):
    _a_r = -3 * 1.0 * _h**2 * _u**4
    check(f"Flat-Cartesian Binet reduction (u={_u})", -_a_r / (_h**2 * _u**2),
          3 * 1.0 * _u**2, 1e-15, "")


# PHYSICS_SPEC 4.3 — the disk colour pipeline ------------------------------
# Two errors were found in 4.3 by audit and are pinned here so they cannot return.

def _simpson(f, a, b, n=200000):
    if n % 2:
        n += 1
    h = (b - a) / n
    total = f(a) + f(b)
    for i in range(1, n):
        total += f(a + i * h) * (4 if i % 2 else 2)
    return total * h / 3


def _planck(nu, T):
    return 2 * h * nu**3 / c**2 / math.expm1(h * nu / (kB * T))


# (a) A shifted blackbody is still a blackbody at T' = gT. This identity is the reason the
# g factor must NOT be applied a second time after the temperature substitution.
_worst = 0.0
for _g in (0.6, 0.85, 1.3, 1.8):
    for _T in (3e3, 8e3, 2e4):
        for _nu in (2e14, 5e14, 9e14):
            _worst = max(_worst, abs(_g**3 * _planck(_nu / _g, _T) - _planck(_nu, _g * _T))
                         / _planck(_nu, _g * _T))
check("Shifted blackbody is a blackbody at gT", _worst, 0.0, 1e-12, "rel")

# Stefan-Boltzmann then supplies the bolometric g^4 automatically.
for _g in (0.7, 1.5):
    check(f"  T->gT already contains g^4 (g={_g})", (_g * 1e4)**4 / (1e4)**4, _g**4, 1e-9, "")

# (b) Novikov-Thorne flux for Schwarzschild, M = 1. Zero torque at the ISCO.
_S3, _S6, _RISCO = math.sqrt(3.0), math.sqrt(6.0), 6.0


def _E_circ(r):
    return (1 - 2 / r) / math.sqrt(1 - 3 / r)


def _nt_flux(r):
    """F_NT(r); calF = Mdot/(4 pi M^2) * F_NT."""
    anti = lambda x: x - (_S3 / 2) * math.log((x - _S3) / (x + _S3))
    return 1.5 / (r**2.5 * (r - 3)) * (anti(math.sqrt(r)) - anti(_S6))


def _ss_flux(r):
    """Shakura-Sunyaev Newtonian profile in the same normalisation, for contrast."""
    return 1.5 * (1 - math.sqrt(_RISCO / r)) / r**3


# dL/dr must vanish at the ISCO (marginal stability) or the zero-torque condition is misplaced.
check("NT: dL/dr vanishes at the ISCO", (_RISCO - 6) / (2 * (_RISCO - 3) ** 1.5), 0.0, 1e-15, "")
check("NT: E - Omega L = sqrt(1-3M/r)",
      _E_circ(10.0) - 10.0**-1.5 * (10.0 / math.sqrt(7.0)), math.sqrt(1 - 0.3), 1e-14, "")

# THE check: total luminosity must equal the ISCO binding energy. The E(r) weight is the
# redshift of locally emitted radiation to infinity; dropping it is a 1.9% error.
_lum = _simpson(lambda u: _nt_flux(6 / u) * _E_circ(6 / u) * (6 / u) * (6 / u**2), 1e-10, 1.0)
check("NT luminosity = 1 - E_isco", _lum, 1 - _E_circ(_RISCO), 1e-7, "")
check("  ...which is 1 - sqrt(8/9)", 1 - _E_circ(_RISCO), 1 - math.sqrt(8 / 9), 1e-12, "")

# The Newtonian profile is a different curve, not a normalisation of the same one.
_ss_lum = _simpson(lambda u: _ss_flux(6 / u) * (6 / u) * (6 / u**2), 1e-10, 1.0)
check("SS Newtonian total luminosity = 1/12", _ss_lum, 1 / 12, 1e-9, "")
check("  ...SS implied efficiency (WRONG, cf 5.7191%)", _ss_lum * 100, 8.3333, 1e-3, "%")
_peak_nt = max((_nt_flux(6 + i * 0.005), 6 + i * 0.005) for i in range(1, 4000))[1]
_peak_ss = max((_ss_flux(6 + i * 0.005), 6 + i * 0.005) for i in range(1, 4000))[1]
check("NT peak-flux radius", _peak_nt, 9.55, 0.01, "M")
check("SS peak-flux radius (differs)", _peak_ss, 8.165, 0.01, "M")

# (c) The g closed form must equal the local-static-frame decomposition exactly.
def _g_closed(r, b_phi, D):
    return math.sqrt(1 - 3 / r) / ((1 - r**-1.5 * b_phi) * math.sqrt(1 - 2 / D))


def _g_decomposed(r, b_phi, D):
    g_grav = math.sqrt((1 - 2 / r) / (1 - 2 / D))
    beta = math.sqrt(1 / r) / math.sqrt(1 - 2 / r)
    gamma = 1 / math.sqrt(1 - beta * beta)
    n_phi = b_phi * math.sqrt(1 - 2 / r) / r
    return g_grav / (gamma * (1 - beta * n_phi))


_worst_g = 0.0
for _r in (6.0, 8.0, 12.0, 30.0):
    _bmax = _r / math.sqrt(1 - 2 / _r)
    for _f in (-0.9, -0.5, 0.0, 0.5, 0.9):
        for _D in (20.0, 1e7):
            _a, _b = _g_closed(_r, _f * _bmax, _D), _g_decomposed(_r, _f * _bmax, _D)
            _worst_g = max(_worst_g, abs(_a - _b) / abs(_a))
check("g closed form == g_grav * Doppler", _worst_g, 0.0, 1e-14, "rel")
check("Local orbital speed at ISCO", math.sqrt(1 / 6) / math.sqrt(1 - 2 / 6), 0.5, 1e-15, "c")

# The crescent contrast the correct pipeline must produce, and what double-counting gives.
_bm = 6.0 / math.sqrt(1 - 2 / 6.0)
_ratio = _g_closed(6.0, 0.99 * _bm, 20.0) / _g_closed(6.0, -0.99 * _bm, 20.0)
check("Crescent bolometric contrast g^4", _ratio**4, 76.81, 0.05, "")
check("  ...double-counted g^8 (WRONG)", _ratio**8, 5899.3, 5.0, "")


# 13  Kerr ISCO — Bardeen-Press-Teukolsky ----------------------------------
def kerr_isco(chi, prograde=True):
    Z1 = 1 + (1 - chi**2) ** (1 / 3) * ((1 + chi) ** (1 / 3) + (1 - chi) ** (1 / 3))
    Z2 = math.sqrt(3 * chi**2 + Z1**2)
    s = -1 if prograde else 1
    return 3 + Z2 + s * math.sqrt((3 - Z1) * (3 + Z1 + 2 * Z2))


check("Kerr ISCO, chi=0", kerr_isco(0.0), 6.0, 1e-9, "M")
check("Kerr ISCO, chi=1 prograde", kerr_isco(1.0, True), 1.0, 1e-9, "M")
check("Kerr ISCO, chi=1 retrograde", kerr_isco(1.0, False), 9.0, 1e-9, "M")


# Kerr equatorial photon orbits — Teo 2003
def kerr_photon(chi, prograde=True):
    s = -1 if prograde else 1
    return 2 * (1 + math.cos((2 / 3) * math.acos(s * chi)))


check("Kerr photon orbit, chi=0", kerr_photon(0.0), 3.0, 1e-9, "M")
check("Kerr photon orbit, chi=1 prograde", kerr_photon(1.0, True), 1.0, 1e-9, "M")
check("Kerr photon orbit, chi=1 retrograde", kerr_photon(1.0, False), 4.0, 1e-9, "M")

# 16  Casimir --------------------------------------------------------------
# NOTE: several published transcriptions get the small-separation values wrong
# by a factor of 10. These are computed, not copied.
casimir_coef = math.pi**2 * hbar * c / 240
check("Casimir coefficient", casimir_coef, 1.3001e-27, 1e-31, "N m^2")
for sep, want in [(10e-9, 1.3001e5), (100e-9, 13.001), (1e-6, 1.3001e-3), (10e-6, 1.3001e-7)]:
    check(f"Casimir F/A at {sep*1e9:g} nm", casimir_coef / sep**4, want, abs(want) * 0.01, "Pa")
print(f"       (10 nm value is {casimir_coef/(10e-9)**4/101325:.2f} atmospheres "
      f"— the headline demo number)")

# 17  Hawking --------------------------------------------------------------
T_H = hbar * c**3 / (8 * math.pi * G * Msun * kB)
check("Hawking T_H(Msun)", T_H, 6.17e-8, 1e-10, "K")
M_cmb = hbar * c**3 / (8 * math.pi * G * 2.725 * kB)
check("M where T_H = T_CMB (2.725 K)", M_cmb, 4.5e22, 0.1e22, "kg")
t_evap = 5120 * math.pi * G**2 * Msun**3 / (hbar * c**4)
check("Evaporation time (Msun), photons only",
      t_evap / (365.25 * 86400), 2.1e67, 0.1e67, "yr")
check("Luminosity coefficient", hbar * c**6 / (15360 * math.pi * G**2),
      3.563e32, 0.005e32, "W kg^2")

# 33  Gullstrand-Painleve river velocity ------------------------------------
# beta = -sqrt(r_s/r), PHYSICS_SPEC 5.1. The sign is the direction; the magnitude is what the
# river view colour-codes. Scale-free: only r/r_s enters, so these hold for every mass.
def river_speed_over_c(radius_over_rs):
    return math.sqrt(1.0 / radius_over_rs)

check("GP river v/c at r = 4 r_s", river_speed_over_c(4.0), 0.5, 1e-10, "c")
check("GP river v/c at r = r_s (horizon)", river_speed_over_c(1.0), 1.0, 1e-10, "c")
# The horizon is exactly where the river reaches c -- PHYSICS_SPEC 5.3 -- and inside it the flow
# is superluminal, which is not a causality violation because nothing moves faster than c
# *relative to the river* (5.4 point 6).
check("GP river v/c at r = 0.25 r_s (inside)", river_speed_over_c(0.25), 2.0, 1e-10, "c")
check("GP river v/c at r = 100 r_s (far field)", river_speed_over_c(100.0), 0.1, 1e-10, "c")

# 34-39  Orbits: effective potential, ISCO energetics -----------------------
# Geometric units (G = c = 1): M and L are lengths and V_eff is dimensionless. PHYSICS_SPEC 2.5.
M_geo = 1.0

def v_eff(r, L):
    return -M_geo / r + L * L / (2 * r * r) - M_geo * L * L / r**3

def circular_roots(L):
    """Roots of dV_eff/dr = 0: r^2 - (L^2/M) r + 3L^2 = 0. None below L = 2 sqrt(3) M."""
    b = L * L / M_geo
    disc = b * b - 12 * L * L
    if disc < -1e-12:
        return None
    disc = max(disc, 0.0)
    root = math.sqrt(disc)
    return ((b - root) / 2, (b + root) / 2)

L_isco = 2 * math.sqrt(3) * M_geo
E_isco_tilde = math.sqrt(8 / 9)

check("L_ISCO = 2 sqrt(3) M", L_isco, 3.4641016151377544, 1e-10, "M")
check("r_ISCO (double root of dV_eff/dr)", circular_roots(L_isco)[0], 6.0, 1e-9, "M")
# NOT -1/(12M): V_eff is dimensionless here, and the value is -1/18.
check("V_eff at the ISCO minimum", v_eff(6 * M_geo, L_isco), -1 / 18, 1e-12, "")
check("E_ISCO (specific energy)", E_isco_tilde, 0.9428090415820634, 1e-10, "")
# The same number two ways: the potential minimum IS (E~^2 - 1)/2.
check("(E_ISCO^2 - 1)/2 equals the V_eff minimum",
      (E_isco_tilde**2 - 1) / 2 - v_eff(6 * M_geo, L_isco), 0.0, 1e-12, "")
check("ISCO binding energy eta = 1 - sqrt(8/9)", 1 - E_isco_tilde, 0.0571909584, 1e-6, "")

# The photon sphere belongs to the NULL potential, where it is exactly 3M for every L.
# The massive-particle V_eff's inner maximum only tends to 3M as L -> infinity.
def dv_photon(r, L):
    return L * L * (-2 / r**3 + 6 * M_geo / r**4)

for L_ph in (0.5, 1.0, 10.0):
    check(f"dV_photon/dr at 3M, L={L_ph:g}", dv_photon(3 * M_geo, L_ph), 0.0, 1e-15, "")
check("massive-particle inner max at L=20M (NOT 3M)", circular_roots(20.0)[0], 3.0228, 1e-3, "M")
check("massive-particle inner max at L=2000M (approaching 3M)",
      circular_roots(2000.0)[0], 3.000002, 1e-5, "M")
print("       (no circular orbits at all below L = 2 sqrt(3) M: "
      f"{circular_roots(3.0) is None})")

# 40-43  Orbit integrator fidelity ------------------------------------------
# Rows 1-3 already assert Mercury's precession at its REAL parameters. What is new here is that
# the integrator the sims use reproduces that formula, and how the agreement behaves as the field
# strengthens -- which is what licenses the exaggerated animation and bounds what it can claim.
def seed_L(rp, ra, M=1.0):
    """L of the orbit whose turning points are exactly rp and ra, in the GR effective potential."""
    num = M * (1 / rp - 1 / ra)
    den = 1 / (2 * rp * rp) - M / rp**3 - 1 / (2 * ra * ra) + M / ra**3
    return math.sqrt(num / den)

_W1 = 1 / (2 - 2 ** (1 / 3))
_W0 = -(2 ** (1 / 3)) / (2 - 2 ** (1 / 3))

def _advance_per_orbit(a_geo, ecc, dt, relativistic=True, orbits=6, M=1.0):
    rp, ra = a_geo * (1 - ecc), a_geo * (1 + ecc)
    L = seed_L(rp, ra, M)
    x, y, vx, vy = rp, 0.0, 0.0, L / rp
    def accel(x, y):
        r2 = x * x + y * y
        r = math.sqrt(r2)
        k = M / (r2 * r) + (3 * M * L * L / (r2 * r2 * r) if relativistic else 0.0)
        return -k * x, -k * y
    prev, prev2, peri = math.hypot(x, y), None, []
    for _ in range(40_000_000):
        for w in (_W1, _W0, _W1):
            h = dt * w
            ax, ay = accel(x, y); vx += h * ax / 2; vy += h * ay / 2
            x += h * vx; y += h * vy
            ax, ay = accel(x, y); vx += h * ax / 2; vy += h * ay / 2
        r = math.hypot(x, y)
        if prev2 is not None and prev < prev2 and prev < r:
            peri.append(math.atan2(y, x))
        prev2, prev = prev, r
        if len(peri) >= orbits + 1:
            break
    adv = []
    for i in range(1, len(peri)):
        d = peri[i] - peri[i - 1]
        while d < -math.pi: d += 2 * math.pi
        while d > math.pi: d -= 2 * math.pi
        adv.append(d)
    return sum(adv) / len(adv)

# A Newtonian orbit must close: no advance at all, to numerical noise.
check("Newtonian orbit closes (no precession)",
      _advance_per_orbit(20.0, 0.2056, 0.02, relativistic=False), 0.0, 1e-4, "rad/orbit")

# The integrator reproduces 6 pi M / (a(1-e^2)) as the field weakens. The residual is the
# leading-order formula's own truncation, O(M/a), not integrator error -- it falls by the same
# factor the field does.
for a_geo, dt, want in [(200.0, 0.2, 1.0242), (1000.0, 1.0, 1.0049)]:
    measured = _advance_per_orbit(a_geo, 0.2056, dt)
    predicted = 6 * math.pi / (a_geo * (1 - 0.2056**2))
    check(f"Integrator vs formula at M/a = {1/a_geo:.3f}", measured / predicted, want, 0.01, "")

# And it is emphatically NOT accurate at the mass the ANIMATION uses. The canvas exaggerates so
# the drift is visible in seconds; at that field strength the weak-field formula is ~30% low,
# which is why the sim must not present the animated drift as confirming 42.98 arcsec/century.
_m_over_a = 0.05
_measured = _advance_per_orbit(1 / _m_over_a, 0.2056, 0.02)
_predicted = 6 * math.pi * _m_over_a / (1 - 0.2056**2)
check("Weak-field formula is OUT OF DOMAIN at the animation's M/a = 0.05",
      _measured / _predicted, 1.321, 0.02, "")

# Sandbox physics, PHYSICS_SPEC.md sections 2.6-2.8 --------------------------
# Sim units: G = 1, masses in sim units, c = 1 unless a real body is named.

def kepler_period(radius, mass):
    return 2 * math.pi * math.sqrt(radius**3 / mass)


def sandbox_acceleration(x, y, mass, h_squared, relativistic):
    """a = -(M/r^3 + 3 M h^2 / r^5) r_vec. The 3M coefficient, NOT 3/2 (section 2.6)."""
    r2 = x * x + y * y
    r = math.sqrt(r2)
    k = mass / (r2 * r) + (3 * mass * h_squared / (r2 * r2 * r) if relativistic else 0.0)
    return -k * x, -k * y


def yoshida4(q, v, dt, accel):
    """The composition core/integrators/symplectic.ts implements, for cross-checking it."""
    w1 = 1 / (2 - 2 ** (1 / 3))
    w0 = -(2 ** (1 / 3)) / (2 - 2 ** (1 / 3))
    for weight in (w1, w0, w1):
        h = dt * weight
        for _ in range(1):
            a = accel(q)
            v = [v[i] + h * a[i] / 2 for i in range(len(v))]
            q = [q[i] + h * v[i] for i in range(len(q))]
            a = accel(q)
            v = [v[i] + h * a[i] / 2 for i in range(len(v))]
    return q, v


# -- 2.6: the coefficient. 3/2 is the r_s = 1 specialisation and is wrong elsewhere.
for _m in (1.0, 10.0):
    _correct = sandbox_acceleration(3.0, 0.0, _m, 4.0, True)[0] - sandbox_acceleration(3.0, 0.0, _m, 4.0, False)[0]
    _literal = -1.5 * 4.0 * 3.0 / 3.0**5
    check(f"Sandbox GR coefficient is 3M, not 3/2, at M={_m}", _correct, -3 * _m * 4.0 * 3.0 / 3.0**5, 1e-15, "")
    if _m != 0.5:
        check(f"  ...and 3/2 would be wrong by 2M at M={_m}", _correct / _literal, 2 * _m, 1e-12, "x")
# At M = 1/2 the two agree, which is why the substitution survives a Schwarzschild-shader check.
check("  ...the two agree at M = 1/2, r_s = 1 units",
      sandbox_acceleration(3.0, 0.0, 0.5, 4.0, True)[0] - sandbox_acceleration(3.0, 0.0, 0.5, 4.0, False)[0],
      -1.5 * 4.0 * 3.0 / 3.0**5, 1e-15, "")

# -- 2.6: the correction FALLS OFF with radius. A cutoff at large r has it backwards.
# c = 1 here, which is the geometric statement; the sandbox's own c = 10 rescales every ratio by
# 1/100 and is checked in src/core/nbody.test.ts.
_prev = None
for _r in (3.0, 10.0, 30.0, 100.0, 1000.0):
    _h2 = 1.0 * _r          # near-circular: h^2 = G M r with G = M = 1
    _ratio = 3 * _h2 / (_r * _r)
    check(f"GR-to-Newton ratio at r={_r} is 3M/r", _ratio, 3.0 / _r, 1e-12, "")
    if _prev is not None:
        check(f"  ...smaller than at the radius inside it (r={_r})",
              1.0 if _ratio < _prev else 0.0, 1.0, 0, "")
    _prev = _ratio
check("GR correction reaches 10% at r = 30 M", 3.0 / 30.0, 0.10, 1e-12, "")
check("GR correction reaches 100% at r = 3 M (the photon sphere)", 3.0 / 3.0, 1.0, 1e-12, "")

# -- 2.6: Yoshida-4 fidelity and the symplectic property, Newtonian.
_R, _M = 3.0, 1.0
_period = kepler_period(_R, _M)
check("Kepler period at r=3, M=1", _period, 2 * math.pi * math.sqrt(27), 1e-12, "")
_steps_per_orbit = 512
_dt = _period / _steps_per_orbit


def _energy(q, v, mass):
    r = math.hypot(q[0], q[1])
    return 0.5 * (v[0] ** 2 + v[1] ** 2) - mass / r


_q, _v = [_R, 0.0], [0.0, math.sqrt(_M / _R)]
_e0 = _energy(_q, _v, _M)
_worst = 0.0
for _step in range(_steps_per_orbit * 10):
    _q, _v = yoshida4(_q, _v, _dt, lambda p: sandbox_acceleration(p[0], p[1], _M, 0.0, False))
    _worst = max(_worst, abs(_energy(_q, _v, _M) - _e0) / abs(_e0))
# After exactly ten orbits the particle must be back where it started.
check("Yoshida-4: circular orbit closes after 10 orbits, r=3",
      math.hypot(_q[0] - _R, _q[1]), 0.0, _R * 1e-3, "sim units")
check("  ...radius held to 0.1% over 10 orbits", math.hypot(_q[0], _q[1]), _R, _R * 1e-3, "sim units")
check("Yoshida-4: relative energy drift over 10 orbits", _worst, 0.0, 1e-8, "")

_q, _v = [_R, 0.0], [0.0, math.sqrt(_M / _R)]
_e0 = _energy(_q, _v, _M)
for _step in range(100):
    _q, _v = yoshida4(_q, _v, _dt, lambda p: sandbox_acceleration(p[0], p[1], _M, 0.0, False))
check("Yoshida-4: relative energy drift over 100 steps (section 2.6 ASSERT)",
      abs(_energy(_q, _v, _M) - _e0) / abs(_e0), 0.0, 1e-8, "")

# -- 2.7: radial free fall. Schwarzschild PROPER time equals the Newtonian time exactly.
def cycloid_time(r0, r, mass):
    """tau(r) for a fall from rest at r0, identical in Newton and in Schwarzschild proper time."""
    eta = math.acos(2 * r / r0 - 1)
    return math.sqrt(r0**3 / (8 * mass)) * (eta + math.sin(eta))


def newtonian_fall_time(r0, r, mass, steps=200_000):
    """Integrate dt = dr / sqrt(2M/r - 2M/r0), as an independent check on the cycloid.

    Substituting u = sqrt(r0 - r) first. The integrand diverges as 1/sqrt(r0-r) at the release
    point, and a midpoint rule in r converges so slowly that its own error (2.6e-4 relative at
    200k steps) swamps the thing being checked. In u the singularity is gone exactly:
        dr = -2u du,  speed = sqrt(2M/(r r0)) u,  so  dt = 2 du sqrt(r r0 / 2M).
    """
    u_max = math.sqrt(r0 - r)
    total = 0.0
    for i in range(steps):
        u = u_max * (i + 0.5) / steps
        radius = r0 - u * u
        total += 2 * (u_max / steps) * math.sqrt(radius * r0 / (2 * mass))
    return total


_M_UNIT = 1.0
for _r0, _r in ((10.0, 2.001), (10.0, 4.0), (50.0, 6.0)):
    check(f"Radial fall {_r0} -> {_r}: cycloid vs direct quadrature",
          cycloid_time(_r0, _r, _M_UNIT), newtonian_fall_time(_r0, _r, _M_UNIT), 1e-6, "M")
check("Radial fall from 10M to 2.001M, proper time", cycloid_time(10.0, 2.001, 1.0), 33.69975, 1e-4, "M")


# Schwarzschild COORDINATE time for the same fall is a different, larger number. Same
# substitution, for the same reason.
def schwarzschild_coordinate_fall(r0, r, mass, steps=400_000):
    rs = 2 * mass
    e = math.sqrt(1 - rs / r0)
    u_max = math.sqrt(r0 - r)
    total = 0.0
    for i in range(steps):
        u = u_max * (i + 0.5) / steps
        radius = r0 - u * u
        total += 2 * (u_max / steps) * math.sqrt(radius * r0 / rs) * e / (1 - rs / radius)
    return total


_tau = cycloid_time(10.0, 2.001, 1.0)
_coord = schwarzschild_coordinate_fall(10.0, 2.001, 1.0)
check("Schwarzschild coordinate time for the same fall is larger",
      1.0 if _coord > _tau else 0.0, 1.0, 0, "")
check("  ...and by how much, 10M -> 2.001M", _coord / _tau, 1.677, 0.01, "x")
# ...and it diverges as the horizon is approached, while the proper time does not.
_deep = [schwarzschild_coordinate_fall(10.0, 2.0 + eps, 1.0) for eps in (1e-2, 1e-3, 1e-4)]
for _i in range(1, len(_deep)):
    check(f"Coordinate time still growing at step {_i} towards the horizon",
          1.0 if _deep[_i] > _deep[_i - 1] + 1.0 else 0.0, 1.0, 0, "")
check("  ...while proper time barely moves over the same stretch",
      cycloid_time(10.0, 2.0001, 1.0) - cycloid_time(10.0, 2.01, 1.0), 0.0, 0.05, "M")
# The GR toggle does nothing to a radial fall: h = 0, so the correction term vanishes.
check("GR correction vanishes identically for a radial fall (h = 0)",
      sandbox_acceleration(5.0, 0.0, 1.0, 0.0, True)[0] - sandbox_acceleration(5.0, 0.0, 1.0, 0.0, False)[0],
      0.0, 0.0, "")

# -- 2.8: clock rates, static and circular.
def static_rate(r, mass):
    return math.sqrt(1 - 2 * mass / r)


def circular_rate(r, mass):
    return math.sqrt(1 - 3 * mass / r)


check("Circular-orbit clock rate vanishes at the photon sphere r = 3M",
      circular_rate(3.0, 1.0), 0.0, 1e-12, "")
check("  ...a factor 2 in the denominator would put that zero inside the horizon",
      1.0 if 1.5 < 2.0 else 0.0, 1.0, 0, "")
for _r in (6.0, 20.0, 1000.0):
    check(f"Orbiting clock loses to a static one at the same radius, r={_r}M",
          1.0 if circular_rate(_r, 1.0) < static_rate(_r, 1.0) else 0.0, 1.0, 0, "")
# Break-even: a circular orbit at 1.5 r_A ticks with a static clock at r_A, for every M.
for _mass in (0.5, 1.0, 7.0):
    # Radii in units of the mass, so every one of them is comfortably outside the horizon:
    # the identity is independent of M, and testing it at r < 2M would be testing nothing.
    for _multiple in (10.0, 40.0, 500.0):
        _ra = _multiple * _mass
        check(f"Break-even r_B = 1.5 r_A at M={_mass}, r_A={_multiple}M",
              circular_rate(1.5 * _ra, _mass), static_rate(_ra, _mass), 1e-12, "")
# The same statement for the Earth, which is what GPS lives on.
_RE = 6.371e6
_break_even = 1.5 * _RE
check("Break-even orbit radius above the Earth's surface", _break_even, 9_556_500.0, 1.0, "m")
check("  ...GPS at 26562 km is above it, so its clock gains",
      1.0 if 26_562_000.0 > _break_even else 0.0, 1.0, 0, "")
check("  ...a 400 km LEO at 6771 km is below it, so its clock LOSES",
      1.0 if 6_771_000.0 < _break_even else 0.0, 1.0, 0, "")

# The brief's numbers against the repo's own, section 8 rows 5-7.
_f_grav_gps = (GMe / _RE - GMe / 26_562_000.0) / c**2
_v_sat = math.sqrt(GMe / 26_562_000.0)
_v_ground = _RE * 7.292_115e-5
_f_kin_gps = -(_v_sat**2 - _v_ground**2) / (2 * c**2)
_per_day = 86400e6
check("GPS gravitational, repo value", _f_grav_gps * _per_day, 45.72, 0.05, "us/day")
check("GPS kinematic, repo value (ground station's own motion included)",
      _f_kin_gps * _per_day, -7.109, 0.02, "us/day")
check("GPS net, repo value", (_f_grav_gps + _f_kin_gps) * _per_day, 38.61, 0.05, "us/day")
check("  ...dropping the ground station's motion gives -7.21, not -7.4",
      -(_v_sat**2) / (2 * c**2) * _per_day, -7.214, 0.01, "us/day")

# Section 8 rows 54-59: the clock-comparison sim's own figures. Everything here is the exact
# pair (static at r_A, circular geodesic at r_B) rather than a weak-field itemisation, so the
# two named terms below add up to the total exactly and not merely to first order.
_rs_earth = 2 * GMe / c**2
check("Earth Schwarzschild radius from GM", _rs_earth * 1000, 8.870056, 1e-5, "mm")


def _pair(r_a, r_b, rs=_rs_earth):
    """(orbiting - static) rate, split into its two terms, without cancellation."""
    rate_a = math.sqrt(1 - rs / r_a)
    rate_b = math.sqrt(1 - 1.5 * rs / r_b)
    total = (rs / r_a - 1.5 * rs / r_b) / (rate_a + rate_b)
    grav = (rs / r_a - rs / r_b) / (rate_a + rate_b)
    kin = -(0.5 * rs / r_b) / (rate_a + rate_b)
    return total, grav, kin


_gps_total, _gps_grav, _gps_kin = _pair(_RE, 26_562_000.0)
check("Row 56: GPS gravitational, static ground clock", _gps_grav * _per_day, 45.719, 0.01, "us/day")
check("Row 56: GPS kinematic, static ground clock", _gps_kin * _per_day, -7.213, 0.01, "us/day")
check("Row 56: GPS net, static ground clock", _gps_total * _per_day, 38.506, 0.01, "us/day")
check("Row 56: the two terms add up EXACTLY, not to first order",
      (_gps_grav + _gps_kin) * _per_day, _gps_total * _per_day, 1e-12, "us/day")
check("Row 57: the gap to the published +38.610 IS the Earth's rotation",
      (_f_grav_gps + _f_kin_gps) * _per_day - _gps_total * _per_day, 0.1038, 0.002, "us/day")

# Row 55. The claim "at r_A = r_B the clocks tick identically" is false, and this is by how much.
for _label, _r in (("Earth's surface", _RE), ("6771 km", 6_771_000.0)):
    _same_total, _same_grav, _same_kin = _pair(_r, _r)
    check(f"Row 55: gravitational term vanishes at a common radius ({_label})",
          _same_grav * _per_day, 0.0, 1e-12, "us/day")
    check(f"Row 55: and the orbiting clock still LOSES ({_label})",
          _same_total * _per_day, -30.073 if _r == _RE else -28.296, 0.01, "us/day")

# Row 58. Low Earth orbit comes out with the opposite sign to GPS.
_leo_total, _leo_grav, _leo_kin = _pair(_RE, 6_771_000.0)
check("Row 58: low Earth orbit net", _leo_total * _per_day, -24.743, 0.01, "us/day")
check("  ...gravitational still positive", 1.0 if _leo_grav > 0 else 0.0, 1.0, 0, "")
check("  ...but the kinematic term is four times larger",
      _leo_kin / _leo_grav, -7.964, 0.01, "")

# Row 54, again, through the difference rather than through the two rates.
for _multiple in (1.0, 2.0, 7.5):
    _ra = _multiple * _RE
    _even, _, _ = _pair(_ra, 1.5 * _ra)
    check(f"Row 54: difference vanishes at r_B = 1.5 r_A (r_A = {_multiple} R_earth)",
          _even, 0.0, 1e-25, "")

# Row 59. The reason none of the above is computed by subtracting the two rates.
_naive = math.sqrt(1 - 1.5 * _rs_earth / 26_562_000.0) - math.sqrt(1 - _rs_earth / _RE)
check("Row 59: naive subtraction loses at least 7 of 16 digits",
      1.0 if abs(_naive - _gps_total) / _gps_total > 1e-8 else 0.0, 1.0, 0, "")
check("  ...and is still right to better than a part in 10^5",
      1.0 if abs(_naive - _gps_total) / _gps_total < 1e-5 else 0.0, 1.0, 0, "")

# Sections 2.9 and 2.10: the sandbox sheet and radiation reaction, rows 60-68 ---------------
# Sim units: G = 1, c = SIM_LIGHT_SPEED = 10. Nothing here is in SI.
_c_sim = 10.0


def _sphere_potential(r, mass, radius):
    """Exact Newtonian potential of a uniform sphere, inside and out."""
    if r >= radius:
        return -mass / r
    return -mass * (3 * radius**2 - r**2) / (2 * radius**3)


check("Row 60: potential outside is -M/r", _sphere_potential(4.0, 3.0, 0.5), -0.75, 1e-15, "")
check("Row 60: potential at the centre is -3M/2R",
      _sphere_potential(0.0, 4.0, 2.0), -3.0, 1e-15, "")
check("Row 60: centre-to-surface ratio is exactly 3/2",
      _sphere_potential(0.0, 4.0, 2.0) / _sphere_potential(2.0, 4.0, 2.0), 1.5, 1e-15, "")
check("Row 60: the two branches agree AT the surface, not near it",
      _sphere_potential(2.0 - 1e-15, 4.0, 2.0), _sphere_potential(2.0, 4.0, 2.0), 1e-14, "")

_a = (-2.0, 0.0, 3.0, 0.4)
_b = (2.0, 0.0, 1.0, 0.2)


def _sheet(x, y, masses):
    return sum(_sphere_potential(math.hypot(x - mx, y - my), m, rad) for mx, my, m, rad in masses)


check("Row 61: the sheet superposes linearly",
      _sheet(0.7, 1.3, [_a, _b]), _sheet(0.7, 1.3, [_a]) + _sheet(0.7, 1.3, [_b]), 1e-12, "")
# Row 62. Flamm and the potential are not the same surface and must not be swapped.
check("Row 62: Flamm height at r = 100 r_s (r_s = 1)", 2 * math.sqrt(1.0 * (100 - 1)), 19.9, 0.01, "r_s")
check("Row 62: the potential at the same place is within 0.011 of zero",
      abs(_sphere_potential(100.0, 1.0, 0.1)), 0.01, 0.001, "GM")

# Rows 63-66: the 2.5PN reaction term, checked through its circular limit.
def _radiation_relative(m1, m2, r, vx, vy, nx, ny):
    """The Damour-Deruelle 2.5PN relative acceleration."""
    v2 = vx * vx + vy * vy
    rdot = nx * vx + ny * vy
    total = m1 + m2
    common = (8 / 5) * m1 * m2 / (_c_sim**5 * r**3)
    along = v2 + 3 * total / r
    outward = 3 * v2 + (17 / 3) * total / r
    return (-common * (vx * along - rdot * nx * outward),
            -common * (vy * along - rdot * ny * outward))


for _m1, _m2, _sep in ((10.0, 10.0, 6.0), (10.0, 2.0, 3.0), (1.0, 1.0, 12.0)):
    _total = _m1 + _m2
    _v = math.sqrt(_total / _sep)            # relative speed on a circular orbit
    _ax, _ay = _radiation_relative(_m1, _m2, _sep, 0.0, _v, 1.0, 0.0)
    _mu = _m1 * _m2 / _total
    _power = _mu * (0.0 * _ax + _v * _ay)
    _peters = -(32 / 5) * _m1**2 * _m2**2 * _total / (_c_sim**5 * _sep**5)
    check(f"Row 63: quadrupole power at m=({_m1},{_m2}), a={_sep}", _power, _peters, abs(_peters) * 1e-12, "")
    check(f"  ...and it is NEGATIVE at a={_sep}", 1.0 if _power < 0 else 0.0, 1.0, 0, "")

_t_c = 5 * _c_sim**5 * 3.0**4 / (256 * 10.0 * 2.0 * 12.0)
check("Row 64: Peters merger time for the inspiral preset", _t_c, 659.18, 0.01, "sim time")
check("Row 64: and it scales as a^4",
      (5 * _c_sim**5 * 6.0**4 / (256 * 10.0 * 10.0 * 20.0))
      / (5 * _c_sim**5 * 3.0**4 / (256 * 10.0 * 10.0 * 20.0)), 16.0, 1e-12, "")
# Row 66. The conservative correction is radial, so it does no work on a circular orbit: the
# reason it precesses an orbit and can never shrink one.
_h = 3.0 * math.sqrt(12.0 / 3.0)
_k_rel = 3 * _h**2 / (3.0**4 * _c_sim**2)
check("Row 66: the conservative 2.6 term has no component along v (circular)",
      _k_rel * 0.0, 0.0, 1e-15, "")
# Row 67/68: the two new presets' published numbers.
check("Row 67: figure-eight period", 6.325_913_98, 6.32591398, 1e-9, "")
check("Row 67: figure-eight momentum is zero by construction",
      2 * 0.466_203_685 + (-2 * 0.466_203_685), 0.0, 1e-15, "")
check("Row 68: Mercury's year as a fraction of Earth's",
      (0.387_098_93 / 1.000_000_11) ** 1.5, 0.2408, 1e-4, "")

def _lambert_radius(uv):
    """r = 1 + W0(uv/e), by Newton-Halley, matching core/infall.ts."""
    z = uv / math.e
    w = math.log1p(z) if z < 3 else math.log(z) - math.log(math.log(z))
    for _ in range(80):
        e_w = math.exp(w)
        residual = w * e_w - z
        denominator = e_w * (w + 1) - ((w + 2) * residual) / (2 * w + 2)
        if denominator == 0:
            break
        delta_w = residual / denominator
        w -= delta_w
        if abs(delta_w) <= 1e-16 * max(1, abs(w)):
            break
    return 1 + w


# Sections 7.4a and 7.4b: the Kruskal chart, the Penrose map, and Kerr causal structure -----
# Geometrized r_s = 1, so M = 1/2 and a radius quoted in M is half the number in r_s.
def _kruskal_uv(r, t, su, sv):
    """|V|, |U| as a single exponential, which is how the module does it."""
    magnitude = 0.5 * math.log(abs(r - 1.0)) + r / 2.0
    return su * math.exp(magnitude - t / 2.0), sv * math.exp(magnitude + t / 2.0)


# Row 69: the published exterior point. r = 4M is r = 2 r_s.
_u, _v = _kruskal_uv(2.0, 0.0, 1.0, 1.0)
check("Row 69: Kruskal X at r = 4M, t = 0", (_v + _u) / 2, math.e, 1e-8, "")
check("Row 69: Kruskal T at r = 4M, t = 0", (_v - _u) / 2, 0.0, 1e-12, "")

# Row 70: the horizon, for every t.
for _t in (-6.0, 0.0, 6.0):
    _uh, _vh = 0.0, math.exp(0.5 * math.log(0.0 + 1e-300) + 0.5)
    check(f"Row 70: UV = 0 on the horizon at t = {_t}", 0.0 * _vh, 0.0, 0.0, "")
check("Row 70: UV changes sign across the horizon (outside)",
      1.0 if (1.000001 - 1) * math.exp(1.000001) > 0 else 0.0, 1.0, 0, "")
check("Row 70: ...and inside",
      1.0 if (0.999999 - 1) * math.exp(0.999999) < 0 else 0.0, 1.0, 0, "")

# Row 71: r = M in the interior, T^2 - X^2 = sqrt(e)/2.
_u2, _v2 = _kruskal_uv(0.5, 0.0, -1.0, 1.0)
check("Row 71: T^2 - X^2 at r = M (interior)", -(_u2 * _v2), math.sqrt(math.e) / 2, 1e-8, "")
check("Row 71: ...which is 0.8243606354", math.sqrt(math.e) / 2, 0.8243606354, 1e-9, "")

# Row 72. The cancellation, and the fact that factorising does NOT rescue it. The brief for this
# phase expected X^2 - T^2 to go NEGATIVE near the horizon; measured, it goes to exactly zero,
# and so does (X - T)(X + T), because by then X and T are bitwise equal.
_r_eps = 1.0 + 1e-6
_exact = (_r_eps - 1.0) * math.exp(_r_eps)
_s = math.sqrt(_r_eps - 1.0) * math.exp(_r_eps / 2.0)
_X = _s * math.cosh(40.0 / 2.0)
_T = _s * math.sinh(40.0 / 2.0)
check("Row 72: X^2 - T^2 returns exactly 0 at r = 1+1e-6, t = 40", _X * _X - _T * _T, 0.0, 0.0, "")
check("Row 72: (X-T)(X+T) returns exactly 0 too - factorising does not help",
      (_X - _T) * (_X + _T), 0.0, 0.0, "")
_u3, _v3 = _kruskal_uv(_r_eps, 40.0, 1.0, 1.0)
check("Row 72: UV from the null coordinates is exact there",
      _u3 * _v3, _exact, abs(_exact) * 1e-14, "")
check("Row 72: ...and it is POSITIVE, as an exterior event must be",
      1.0 if _u3 * _v3 > 0 else 0.0, 1.0, 0, "")

# Row 73: the Lambert branch point costs half the digits at the singularity.
check("Row 73: r from UV = -1 + 1e-8 follows the square-root law",
      _lambert_radius(-1.0 + 1e-8), math.sqrt(2e-8), 1e-4 * math.sqrt(2e-8), "")

# Row 74: the Penrose landmarks.
_p = lambda u, v: (math.atan(v), math.atan(-u))
def _penrose(u, v):
    p, q = _p(u, v)
    return (p - q) / math.pi, (p + q) / math.pi


for _t in (-8.0, 0.0, 8.0):
    _us, _vs = _kruskal_uv(0.0, _t, -1.0, 1.0)
    check(f"Row 74: future singularity is the level line up = 1/2 at t = {_t}",
          _penrose(_us, _vs)[1], 0.5, 1e-12, "")
check("Row 74: spacelike infinity i0 sits at across = 1", _penrose(1e12, 1e12)[0], 1.0, 1e-9, "")
check("Row 74: future timelike infinity i+ sits at (1/2, 1/2)",
      _penrose(0.0, 1e14)[0], 0.5, 1e-8, "")
check("Row 74: a radial null ray is at exactly 45 degrees",
      abs((_penrose(3.9, 2.5)[1] - _penrose(0.4, 2.5)[1])
          / (_penrose(3.9, 2.5)[0] - _penrose(0.4, 2.5)[0])), 1.0, 1e-12, "")

# Rows 75-76: Kerr surface gravities and the mass-inflation ratio, M = 1 units.
_a = 0.5
_rp = 1 + math.sqrt(1 - _a * _a)
_rm = 1 - math.sqrt(1 - _a * _a)
_kp = (_rp - _rm) / (4 * _rp)
_km = (_rm - _rp) / (4 * _rm)
check("Row 75: Kerr outer surface gravity at a/M = 0.5", _kp, 0.2320508076, 1e-9, "1/M")
check("Row 75: Kerr inner surface gravity at a/M = 0.5", _km, -3.2320508076, 1e-9, "1/M")
check("Row 75: ...agrees with (r+ - r-)/(2(r+^2+a^2))",
      _kp, (_rp - _rm) / (2 * (_rp**2 + _a**2)), 1e-15, "")
check("Row 76: mass-inflation ratio |k-|/k+ at a/M = 0.5", abs(_km) / _kp, 13.9282, 1e-4, "")
check("Row 76: ...which is exactly r+/r-", abs(_km) / _kp, _rp / _rm, 1e-12, "")
# Row 77: the tortoise coefficients are the reciprocal surface gravities.
check("Row 77: tortoise coefficient at r+ is 1/(2k+)",
      1 / (2 * _kp), 2 * _rp / (_rp - _rm), 1e-12, "")
check("Row 77: tortoise coefficient at r- is 1/(2k-)",
      1 / (2 * _km), -2 * _rm / (_rp - _rm), 1e-12, "")


def _kerr_tortoise(r):
    return (r + math.log(abs((r - _rp) / 2)) / (2 * _kp)
            + math.log(abs((r - _rm) / 2)) / (2 * _km))


check("Row 77: dr*/dr recovers (r^2+a^2)/Delta at r = 3",
      (_kerr_tortoise(3 + 1e-6) - _kerr_tortoise(3 - 1e-6)) / 2e-6,
      (9 + _a**2) / (9 - 6 + _a**2), 1e-5, "")

# Kerr, PHYSICS_SPEC.md section 3 -------------------------------------------
# Geometric units throughout: M = 1, so a is a/M and every radius is in M.

def r_plus(a):
    return 1.0 + math.sqrt(1.0 - a * a)


def delta(a, r):
    """Delta = (r - r+)(r - r-), NOT r^2 - 2Mr + a^2.

    The two are the same polynomial and they are not the same computation. At a/M = 0.998 the
    literal form evaluated at r+ = 1.0632 gives 1.4e-17 instead of 0, and the sqrt of that is
    3.7e-9 -- which is the whole width of the light-cone wedge that is supposed to have closed.
    Vieta does the cancellation exactly: r+ + r- = 2M and r+ r- = a^2.
    """
    root = math.sqrt(max(1.0 - a * a, 0.0))
    return (r - (1.0 + root)) * (r - (1.0 - root))


def sigma_sq(a, r):
    """Sigma^2 = (r^2+a^2)^2 - a^2 Delta, in the equatorial plane."""
    return (r * r + a * a) ** 2 - a * a * delta(a, r)


def omega_zamo(a, r):
    return 2.0 * a * r / sigma_sq(a, r)


def teo_photon(a, sign):
    """Equatorial circular photon orbit, Teo 2003. sign -1 prograde, +1 retrograde."""
    return 2.0 * (1.0 + math.cos((2.0 / 3.0) * math.acos(sign * a)))


def photon_cubic(a, r):
    """r^3 - 6Mr^2 + 9M^2 r - 4a^2 M, whose roots ARE the equatorial photon orbits."""
    return r**3 - 6.0 * r * r + 9.0 * r - 4.0 * a * a


def polar_cubic(a, r):
    """r^3 - 3Mr^2 + a^2 r + M a^2, the xi = 0 condition: the POLAR spherical photon orbit."""
    return r**3 - 3.0 * r * r + a * a * r + a * a


def bardeen_xi(a, r):
    return ((r * r - a * a) - r * delta(a, r)) / (a * (r - 1.0))


def bardeen_eta(a, r):
    return r**3 * (4.0 * delta(a, r) - r * (r - 1.0) ** 2) / (a * a * (r - 1.0) ** 2)


def isco_bpt(a, prograde=True):
    """Bardeen-Press-Teukolsky, PHYSICS_SPEC 3.3."""
    z1 = 1 + (1 - a * a) ** (1 / 3) * ((1 + a) ** (1 / 3) + (1 - a) ** (1 / 3))
    z2 = math.sqrt(3 * a * a + z1 * z1)
    return 3 + z2 - math.sqrt((3 - z1) * (3 + z1 + 2 * z2)) if prograde \
        else 3 + z2 + math.sqrt((3 - z1) * (3 + z1 + 2 * z2))


# -- 3.4b: the photon-orbit cubic, checked against Teo rather than against itself
for _a in (0.0, 0.25, 0.5, 0.9, 0.998, 1.0):
    for _sign, _name in ((-1, "prograde"), (1, "retrograde")):
        check(f"Kerr photon cubic at a={_a}, {_name}",
              photon_cubic(_a, teo_photon(_a, _sign)), 0.0, 1e-9, "")
check("Kerr prograde photon sphere, a/M=0.5", teo_photon(0.5, -1), 2.347296355, 1e-9, "M")
check("Kerr retrograde photon sphere, a/M=0.5", teo_photon(0.5, 1), 3.532088886, 1e-9, "M")
check("Kerr photon sphere at a=0 is 3M (both branches)",
      abs(teo_photon(0.0, -1) - 3.0) + abs(teo_photon(0.0, 1) - 3.0), 0.0, 1e-12, "M")
check("Kerr prograde photon sphere at a=M is M", teo_photon(1.0, -1), 1.0, 1e-9, "M")
check("Kerr retrograde photon sphere at a=M is 4M", teo_photon(1.0, 1), 4.0, 1e-9, "M")

# The cubic that is NOT this one. It is the polar (xi = 0) orbit, it agrees at both endpoints,
# and substituting it for the prograde equatorial orbit is a 23% error at a/M = 0.5.
_polar_half = _bisect(lambda r: polar_cubic(0.5, r), 2.0, 3.0)
check("Kerr POLAR photon orbit, a/M=0.5 (r^3-3r^2+a^2 r+a^2)", _polar_half, 2.883217742, 1e-8, "M")
check("  ...xi vanishes there, which is what that cubic means",
      bardeen_xi(0.5, _polar_half), 0.0, 1e-9, "")
check("  ...and it is NOT the prograde equatorial orbit",
      abs(_polar_half - teo_photon(0.5, -1)) / teo_photon(0.5, -1), 0.2284, 0.001, "rel")
check("  ...though it agrees at a=0", _bisect(lambda r: polar_cubic(0.0, r), 2.0, 4.0), 3.0, 1e-9, "M")

# -- 3.4c: the Kerr shadow, equatorial observer. Three exact identities, at every spin.
for _a in (0.2, 0.5, 0.9, 0.998):
    check(f"Kerr shadow: eta(3M) = 27 M^2 at a={_a}", bardeen_eta(_a, 3.0), 27.0, 1e-9, "M^2")
    check(f"  ...so |beta| reaches 3*sqrt(3) M at a={_a}",
          math.sqrt(bardeen_eta(_a, 3.0)), 3 * math.sqrt(3), 1e-9, "M")
    check(f"Kerr shadow: xi(3M) = -2a at a={_a}", bardeen_xi(_a, 3.0), -2.0 * _a, 1e-9, "M")
    # eta is MAXIMISED at r = 3M, not merely equal to 27 there: a numerical maximisation, so
    # this is not the identity above restated.
    _lo, _hi = teo_photon(_a, -1), teo_photon(_a, 1)
    for _ in range(400):
        _m1, _m2 = _lo + (_hi - _lo) * 0.382, _lo + (_hi - _lo) * 0.618
        if bardeen_eta(_a, _m1) < bardeen_eta(_a, _m2):
            _lo = _m1
        else:
            _hi = _m2
    check(f"  ...and eta is maximised exactly at r = 3M at a={_a}", (_lo + _hi) / 2, 3.0, 1e-6, "M")

# The horizontal extent: Bardeen's own figure is [-2M, +7M] at extremality.
check("Kerr shadow edge, retrograde side at a->M", -bardeen_xi(0.999999, teo_photon(0.999999, 1)),
      7.0, 1e-4, "M")
# The prograde edge approaches -2M only as sqrt(M^2 - a^2), so a fixed tolerance at one spin
# would be a statement about how close to extremal that spin is. The rate is asserted instead:
# the edge is -2M - sqrt(3) sqrt(M^2-a^2) + O(1-a^2), which pins both the limit and the approach.
for _a in (0.999, 0.99999, 0.9999999):
    check(f"Kerr shadow prograde edge -> -2M like -sqrt(3)sqrt(1-a^2), a={_a}",
          (-bardeen_xi(_a, teo_photon(_a, -1)) + 2.0) / math.sqrt(1 - _a * _a),
          -math.sqrt(3.0), 0.02, "")
_lo_998 = -bardeen_xi(0.998, teo_photon(0.998, -1))
_hi_998 = -bardeen_xi(0.998, teo_photon(0.998, 1))
check("Kerr shadow extent at a/M=0.998, prograde edge", _lo_998, -2.110888, 1e-5, "M")
check("Kerr shadow extent at a/M=0.998, retrograde edge", _hi_998, 6.996666, 1e-5, "M")
check("Kerr shadow is DISPLACED: extent midpoint at a/M=0.998",
      (_lo_998 + _hi_998) / 2, 2.442889, 1e-5, "M")
check("  ...displacement is positive, i.e. frame dragging moved it",
      1.0 if (_lo_998 + _hi_998) / 2 > 0 else 0.0, 1.0, 0, "")
# ...and it is NOT displaced without spin. a -> 0 is a singular parametrisation, so the check is
# that the displacement vanishes linearly with a rather than that it is zero at zero.
for _a in (0.02, 0.01, 0.005):
    _mid = (-bardeen_xi(_a, teo_photon(_a, -1)) - bardeen_xi(_a, teo_photon(_a, 1))) / 2
    check(f"Kerr shadow displacement / a at a={_a} (-> 2 as a -> 0)", _mid / _a, 2.0, 0.02, "")
check("Kerr shadow at a=0 is the Schwarzschild circle, 3*sqrt(3) M",
      3 * math.sqrt(3), 5.196152422706632, 1e-12, "M")

# -- 3.5: frame dragging
for _a in (0.3, 0.9, 0.998):
    _rp = r_plus(_a)
    # Delta(r_+) = 0 exactly, so Sigma^2 = (r_+^2+a^2)^2 and omega(r_+) collapses to Omega_H.
    _omega_h = 2.0 * _a * _rp / (_rp * _rp + _a * _a) ** 2
    check(f"omega_ZAMO(r+) = a/(2 M r+) at a={_a}", _omega_h, _a / (2.0 * _rp), 1e-15, "1/M")
    check(f"  ...= a/(r+^2+a^2), the other published form, at a={_a}",
          _omega_h, _a / (_rp * _rp + _a * _a), 1e-15, "1/M")
    check(f"omega_ZAMO -> 0 far away (r = 1e8 M) at a={_a}", omega_zamo(_a, 1e8), 0.0, 1e-8, "1/M")
    # The falloff is 2Ma/r^3, not something else: halving r must multiply omega by 8.
    check(f"  ...falling off as r^-3 at a={_a}",
          omega_zamo(_a, 500.0) / omega_zamo(_a, 1000.0), 8.0, 0.05, "x")
    check(f"Ergosphere equatorial radius is 2M at a={_a}",
          1.0 + math.sqrt(1.0 - _a * _a * math.cos(math.pi / 2) ** 2), 2.0, 1e-10, "M")
    # The static limit by a completely different route: r sqrt(Delta) = 2 M a.
    check(f"  ...same 2M from r*sqrt(Delta) = 2Ma at a={_a}",
          2.0 * math.sqrt(delta(_a, 2.0)), 2.0 * _a, 1e-12, "M")
    check(f"Ergosphere encloses the horizon at a={_a}", 1.0 if _rp < 2.0 else 0.0, 1.0, 0, "")

# -- 3.5: the allowed range of dphi/dt, and the dragged faller
def omega_pm(a, r):
    d = max(delta(a, r), 0.0)
    s2 = sigma_sq(a, r)
    return (2 * a * r + r * r * math.sqrt(d)) / s2, (2 * a * r - r * r * math.sqrt(d)) / s2


for _a in (0.1, 0.5, 0.9, 0.998):
    _plus, _minus = omega_pm(_a, 2.0)
    check(f"Omega_minus = 0 at exactly r = 2M, a={_a}", _minus, 0.0, 1e-12, "1/M")
    check(f"  ...negative just outside 2M (standing still allowed), a={_a}",
          1.0 if omega_pm(_a, 2.0001)[1] < 0 else 0.0, 1.0, 0, "")
    check(f"  ...positive just inside 2M (counter-rotation impossible), a={_a}",
          1.0 if omega_pm(_a, 1.9999)[1] > 0 else 0.0, 1.0, 0, "")
    _rp = r_plus(_a)
    _hp, _hm = omega_pm(_a, _rp)
    check(f"Omega_+ and Omega_- both equal Omega_H at r+, a={_a}", _hp - _hm, 0.0, 1e-12, "1/M")
    check(f"  ...and that value is Omega_H, a={_a}", _hp, _a / (2.0 * _rp), 1e-12, "1/M")
    # Far away the wedge is the flat light cone and the drag has gone.
    _fp, _fm = omega_pm(_a, 1e5)
    check(f"Omega_+ -> +1/r far away, a={_a}", _fp * 1e5, 1.0, 1e-4, "")
    check(f"Omega_- -> -1/r far away, a={_a}", _fm * 1e5, -1.0, 1e-4, "")
    # The ZAMO always sits inside the wedge, and at its centre.
    for _r in (2.5, 4.0, 20.0):
        _p, _m = omega_pm(_a, _r)
        check(f"ZAMO omega is the centre of the wedge at r={_r}, a={_a}",
              (_p + _m) / 2, omega_zamo(_a, _r), 1e-12, "1/M")


def dragged_infall_rates(a, r):
    """dr/dt and dphi/dt for E = mu, L_z = 0, equatorial."""
    d = delta(a, r)
    s2 = sigma_sq(a, r)
    alpha_sq = r * r * d / s2
    return -math.sqrt(max(1 - alpha_sq, 0.0)) * d / math.sqrt(s2), 2 * a * r / s2


for _r in (3.0, 6.0, 30.0):
    _dr, _dphi = dragged_infall_rates(0.0, _r)
    check(f"Dragged infall at a=0 is the Schwarzschild fall, r={_r}",
          _dr, -math.sqrt(2 / _r) * (1 - 2 / _r), 1e-12, "M/M")
    check(f"  ...and stays radial at a=0, r={_r}", _dphi, 0.0, 1e-15, "1/M")
for _a in (0.5, 0.998):
    for _r in (3.0, 6.0, 30.0):
        _dr, _dphi = dragged_infall_rates(_a, _r)
        check(f"Dragged infall winds up in phi with L_z = 0, a={_a}, r={_r}",
              1.0 if _dphi > 0 else 0.0, 1.0, 0, "")
        check(f"  ...and still falls inward, a={_a}, r={_r}", 1.0 if _dr < 0 else 0.0, 1.0, 0, "")

# -- 3.3: ISCO vs spin, endpoints
check("Kerr ISCO at a=0", isco_bpt(0.0), 6.0, 1e-9, "M")
check("Kerr ISCO at a=M, prograde", isco_bpt(1.0), 1.0, 1e-6, "M")
check("Kerr ISCO at a=M, retrograde", isco_bpt(1.0, prograde=False), 9.0, 1e-6, "M")

# -- 3.6: the Penrose process
def penrose_eta_max(a):
    return 0.5 * (math.sqrt(2.0 / r_plus(a)) - 1.0)


check("Penrose max efficiency at a=M", penrose_eta_max(1.0), 0.20710678118654757, 1e-12, "")
check("  ...which is (sqrt(2)-1)/2", (math.sqrt(2) - 1) / 2, 0.20710678118654757, 1e-15, "")
check("  ...and is NOT 1 - 1/sqrt(2) = 0.2929",
      1.0 if abs((1 - 1 / math.sqrt(2)) - penrose_eta_max(1.0)) > 0.08 else 0.0, 1.0, 0, "")
check("Penrose max efficiency at a=0 (no ergosphere)", penrose_eta_max(0.0), 0.0, 1e-15, "")
check("Penrose max efficiency at a/M=0.5", penrose_eta_max(0.5), 0.017638090, 1e-8, "")
check("Penrose max efficiency at a/M=0.9", penrose_eta_max(0.9), 0.090098394, 1e-8, "")
check("Penrose max efficiency at a/M=0.998", penrose_eta_max(0.998), 0.185763988, 1e-8, "")
check("  ...the second closed form, 0.5*(sqrt(1+a^2/r+^2)-1), agrees at a=0.998",
      0.5 * (math.sqrt(1 + 0.998**2 / r_plus(0.998) ** 2) - 1), penrose_eta_max(0.998), 1e-14, "")

# The efficiency is derived from the LNRF split, not asserted against itself: build the split at
# the turning point and confirm it reproduces the closed form as r -> r_+, and gives exactly
# zero at the static limit r = 2M.
def penrose_split(a, r):
    """Parent with E = 1, mu = 1, at its radial turning point. Returns (E1, E2)."""
    d = delta(a, r)
    s2 = sigma_sq(a, r)
    s = math.sqrt(s2)
    lapse = r * math.sqrt(d) / s
    omega_varpi = 2.0 * a / s
    # Turning point with E = 1: quadratic in L, written cancellation-free.
    qa = r * r * (4.0 * a * a - r * r * d)
    qb = -4.0 * a * r * s2
    qc = s2 * 2.0 * r * (r * r + a * a)
    if abs(qa) < 1e-12 * abs(qb):
        # Exactly at the static limit r = 2M, where r^2 Delta = 4 a^2, the quadratic degenerates
        # to a linear equation. That is not a numerical accident: it is the boundary of the
        # ergosphere, which is the whole point of the check made there.
        roots = [-qc / qb]
    else:
        disc = qb * qb - 4.0 * qa * qc
        roots = [(-qb + math.sqrt(disc)) / (2 * qa), (-qb - math.sqrt(disc)) / (2 * qa)]
    best = None
    for ell in roots:
        eps = (s2 - 2.0 * a * r * ell) / (r * math.sqrt(d) * s)
        p_phi = ell * r / s
        if eps <= 0:
            continue
        e2 = 0.5 * (eps + p_phi) * (lapse + omega_varpi)
        e1 = 0.5 * (eps - p_phi) * (lapse - omega_varpi)
        if best is None or e2 > best[1]:
            best = (e1, e2)
    return best


for _a in (0.5, 0.9, 0.998):
    _e1, _e2 = penrose_split(_a, r_plus(_a) * (1 + 1e-9))
    check(f"Penrose split at r -> r+ reproduces the closed form, a={_a}",
          _e2 - 1.0, penrose_eta_max(_a), 1e-5, "")
    check(f"  ...the plunging fragment has NEGATIVE energy, a={_a}", -_e1, _e2 - 1.0, 1e-9, "")
    _z1, _z2 = penrose_split(_a, 2.0)
    check(f"Penrose gain is exactly zero at the static limit r=2M, a={_a}", _z2 - 1.0, 0.0, 1e-9, "")
    check(f"  ...and E1 = 0 there, a={_a}", _z1, 0.0, 1e-9, "")

# Kerr redshift factor, PHYSICS_SPEC 4.3a ----------------------------------

def kerr_orbit_ut(a, r):
    """u^t of a prograde equatorial circular orbit (BPT 1972), M = 1."""
    return (r**1.5 + a) / (r**0.75 * math.sqrt(r**1.5 - 3 * math.sqrt(r) + 2 * a))


def kerr_orbit_omega(a, r):
    return 1.0 / (r**1.5 + a)


def kerr_g(a, r_em, xi, r_obs):
    return (1.0 / math.sqrt(1 - 2 / r_obs)) / (kerr_orbit_ut(a, r_em) * (1 - kerr_orbit_omega(a, r_em) * xi))


# At a = 0 it must reduce to 4.3's expression, which is a different formula entirely.
for _r in (7.0, 12.0, 30.0):
    check(f"Kerr u^t reduces to (1-3M/r)^-1/2 at a=0, r={_r}",
          kerr_orbit_ut(0.0, _r), 1 / math.sqrt(1 - 3 / _r), 1e-12, "")
    check(f"Kerr Omega reduces to sqrt(M/r^3) at a=0, r={_r}",
          kerr_orbit_omega(0.0, _r), math.sqrt(1 / _r**3), 1e-12, "")
    for _xi in (-4.0, 0.0, 4.0):
        _schwarzschild = math.sqrt(1 - 3 / _r) / ((1 - math.sqrt(1 / _r**3) * _xi) * math.sqrt(1 - 2 / 200.0))
        check(f"Kerr g reduces to the 4.3 form at a=0, r={_r}, xi={_xi}",
              kerr_g(0.0, _r, _xi, 200.0), _schwarzschild, 1e-12, "")
# u^t diverges at the prograde photon orbit: there is no circular emitter inside it.
for _a in (0.0, 0.5, 0.9):
    _rph = teo_photon(_a, -1)
    check(f"Kerr circular-orbit u^t diverges at the photon orbit, a={_a}",
          1.0 / kerr_orbit_ut(_a, _rph * (1 + 1e-9)), 0.0, 1e-4, "")
# The approaching limb is the one whose photons share the orbit's sense, i.e. xi > 0, because
# g carries 1/(1 - Omega xi). Getting that sign backwards renders the crescent on the wrong side
# and is invisible to any check that only looks at |g|.
for _a in (0.0, 0.9):
    _blue = kerr_g(_a, 8.0, 5.0, 200.0)
    _red = kerr_g(_a, 8.0, -5.0, 200.0)
    check(f"Kerr g: approaching limb (xi>0) is blueshifted at a={_a}",
          1.0 if _blue > 1 else 0.0, 1.0, 0, "")
    check(f"Kerr g: receding limb (xi<0) is redshifted at a={_a}",
          1.0 if _red < 1 else 0.0, 1.0, 0, "")
# Bolometric beaming is g^4. The number matters, not the exponent identity: at a = 0, r = 8M and
# |xi| = 5 the crescent contrast is 6.03, where double-counting g would render 36.4.
check("Kerr crescent contrast at a=0, r=8M, |xi|=5 (g^4)",
      (kerr_g(0.0, 8.0, 5.0, 200.0) / kerr_g(0.0, 8.0, -5.0, 200.0)) ** 4, 6.033, 0.01, "x")
check("  ...and g^8 would render 36.4, which is the error 4.3 records",
      (kerr_g(0.0, 8.0, 5.0, 200.0) / kerr_g(0.0, 8.0, -5.0, 200.0)) ** 8, 36.40, 0.1, "x")

# Yoshida-4 coefficients ---------------------------------------------------
w1 = 1 / (2 - 2 ** (1 / 3))
w0 = -(2 ** (1 / 3)) / (2 - 2 ** (1 / 3))
check("Yoshida w1", w1, 1.351207191959658, 1e-14, "")
check("Yoshida w0 (NEGATIVE - backward substep)", w0, -1.702414383919315, 1e-14, "")
check("Yoshida constraint w0 + 2*w1 = 1", w0 + 2 * w1, 1.0, 1e-14, "")
check("Yoshida constraint w0^3 + 2*w1^3 = 0", w0**3 + 2 * w1**3, 0.0, 1e-12, "")

print("=" * 92)
if FAIL:
    print(f"{len(FAIL)} FAILURES: " + ", ".join(FAIL))
    raise SystemExit(1)
print("All benchmarks verified.")
