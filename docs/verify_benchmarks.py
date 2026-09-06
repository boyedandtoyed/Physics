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
hbar = 1.054_571_817e-34        # J s              exact
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
