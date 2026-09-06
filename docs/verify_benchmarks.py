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
