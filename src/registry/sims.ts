import type { ComponentType } from 'react';

export interface SimulationEntry {
  id: string;
  title: string;
  description: string;
  tags: readonly string[];
  load: () => Promise<{ default: ComponentType }>;
}

// Only finished simulations belong here. Each loader owns its lazy route chunk.
export const simulations: readonly SimulationEntry[] = [
  {
    id: 'blackhole-lensing',
    title: 'When light meets a black hole',
    description:
      'Ray-traced Schwarzschild lensing with a Novikov–Thorne accretion disk. The shadow radius '
      + 'measured off the rendered frame matches 3√3 GM/c² to 0.013 pixels.',
    tags: ['General relativity', 'Schwarzschild', 'Gravitational lensing'],
    load: () => import('../sims/blackhole-lensing'),
  },
  {
    id: 'deflection-decomposition',
    title: 'Does time dilation cause gravity?',
    description:
      'The claim is exactly half right, and the half is measurable. Light deflection at the solar '
      + 'limb, split into the 0.8756″ from curved time and the 0.8756″ from curved space.',
    tags: ['General relativity', 'Light deflection', 'Interpretations'],
    load: () => import('../sims/deflection-decomposition'),
  },
  {
    id: 'interpretations',
    title: 'One geometry, four pictures',
    description:
      'The same infall in Schwarzschild, Gullstrand–Painlevé, Eddington–Finkelstein and Kruskal '
      + 'coordinates. Every picture disagrees; every invariant agrees to one part in 10¹⁰.',
    tags: ['General relativity', 'Coordinate charts', 'Interpretations'],
    load: () => import('../sims/interpretations'),
  },
  {
    id: 'time-dilation',
    title: 'Every clock is somewhere',
    description:
      'Gravitational time dilation, from a clock beside a black hole to the one in your pocket. '
      + 'GPS, Hafele–Keating, and the near-horizon limit, each against its published value.',
    tags: ['General relativity', 'Time dilation', 'GPS'],
    load: () => import('../sims/time-dilation'),
  },
  {
    id: 'spacetime-curvature',
    title: 'The picture everyone has seen',
    description:
      'The embedding diagram, drawn exactly — and the three things it does not show. The funnel '
      + 'is the curvature of space, which is very nearly not why anything falls.',
    tags: ['General relativity', 'Geometry', 'Misconceptions'],
    load: () => import('../sims/spacetime-curvature'),
  },
  {
    id: 'gp-river',
    title: 'Space is not flowing',
    description:
      'The Gullstrand–Painlevé river, animated: flat space with an inward current at the escape '
      + 'velocity, exactly c at the horizon. An exact slicing of Schwarzschild — and not a current.',
    tags: ['General relativity', 'Gullstrand–Painlevé', 'Interpretations'],
    load: () => import('../sims/gp-river'),
  },
  {
    id: 'effective-potential',
    title: 'One term, two consequences',
    description:
      'The Schwarzschild effective potential, with the orbit it produces beside it. The −ML²/r³ '
      + 'term gives both the perihelion precession and the ISCO; switch it off and both vanish.',
    tags: ['General relativity', 'Orbits', 'Effective potential'],
    load: () => import('../sims/effective-potential'),
  },
  {
    id: 'mercury-precession',
    title: 'The 43 arcseconds that were left over',
    description:
      'Mercury\u2019s perihelion, precessing. Run at an exaggerated mass because the real drift is '
      + 'a tenth of an arcsecond per orbit \u2014 with the benchmark computed at the real parameters.',
    tags: ['General relativity', 'Orbits', 'Perihelion precession'],
    load: () => import('../sims/mercury-precession'),
  },
  {
    id: 'gravity-sandbox',
    title: 'Put something in orbit',
    description:
      'An N-body playground. Click to place a mass, drag to throw it, and watch Yoshida-4 hold '
      + 'the energy to one part in 10\u2078 \u2014 with an optional post-Newtonian correction whose '
      + 'cost to that is shown rather than hidden.',
    tags: ['Gravity', 'N-body', 'Sandbox'],
    load: () => import('../sims/gravity-sandbox'),
  },
  {
    id: 'freefall-sandbox',
    title: 'Drop it and see',
    description:
      'Four central bodies from the Earth to a black hole, and the same well around all of them. '
      + 'What changes is not the well\u2019s depth \u2014 in geometric units it is the same well \u2014 but '
      + 'how far down into it the surface reaches.',
    tags: ['Gravity', 'Free fall', 'Sandbox'],
    load: () => import('../sims/freefall-sandbox'),
  },
  {
    id: 'clock-comparison',
    title: 'Which clock is ahead?',
    description:
      'One clock held still, one in orbit, and a dial that turns once per microsecond of the '
      + 'difference. Height makes the orbiting clock gain and motion makes it lose; they cross '
      + 'at exactly 1.5 r_A, with GPS above the crossing and the space station below it.',
    tags: ['General relativity', 'Time dilation', 'GPS'],
    load: () => import('../sims/clock-comparison'),
  },
  {
    id: 'kruskal-diagram',
    title: 'The chart where nothing goes wrong',
    description:
      'The maximally extended Schwarzschild spacetime, with light at 45\u00b0 everywhere. A static '
      + 'observer is a hyperbola, not a vertical line; inside the horizon r = 0 stops being a '
      + 'place and becomes a moment, and the light cones show why.',
    tags: ['General relativity', 'Causal structure', 'Kruskal'],
    load: () => import('../sims/kruskal-diagram'),
  },
  {
    id: 'penrose-schwarzschild',
    title: 'All of it, on one page',
    description:
      'The Penrose conformal diagram: infinity brought onto the paper without bending a single '
      + 'light ray. Every boundary named \u2014 and i\u207a is the corner of region I, not the '
      + 'top of the picture, which is the singularity.',
    tags: ['General relativity', 'Causal structure', 'Penrose diagram'],
    load: () => import('../sims/penrose-schwarzschild'),
  },
  {
    id: 'penrose-kerr',
    title: 'The one with a door at the bottom',
    description:
      'Kerr\u2019s causal diagram at a/M = 0.5: two horizons, a timelike ring singularity that '
      + 'can be missed, and a pattern that repeats without end \u2014 behind a Cauchy horizon '
      + 'that general relativity predicts is unstable.',
    tags: ['General relativity', 'Kerr', 'Causal structure'],
    load: () => import('../sims/penrose-kerr'),
  },
  {
    id: 'geodesic-deviation',
    title: 'Gravity you can feel is the part that differs',
    description:
      'A ring of test particles falling in, stretched along the fall and squeezed across it. '
      + 'The tidal tensor is trace-free, so the ellipse is distorted and never compressed \u2014 '
      + 'and a stellar-mass hole tears a steel rod apart ten horizons out.',
    tags: ['General relativity', 'Tidal forces', 'Geodesic deviation'],
    load: () => import('../sims/geodesic-deviation'),
  },
  {
    id: 'kerr-shadow',
    title: 'The shadow is not a circle',
    description:
      'A spinning black hole, ray-traced in Kerr\u2013Schild coordinates. Spin flattens the '
      + 'silhouette on the approaching side and slides it across the sky \u2014 and leaves its '
      + 'height at exactly 3\u221a3 M, whatever the spin.',
    tags: ['General relativity', 'Kerr', 'Frame dragging'],
    load: () => import('../sims/kerr-shadow'),
  },
  {
    id: 'frame-dragging',
    title: 'You cannot stand still',
    description:
      'Frame dragging, drawn as what it forbids. Inside the ergosphere there is no worldline '
      + 'with d\u03c6/dt \u2264 0 at all \u2014 and the ergosphere is a circle at exactly 2M seen from '
      + 'above, whatever the spin.',
    tags: ['General relativity', 'Kerr', 'Frame dragging'],
    load: () => import('../sims/frame-dragging'),
  },
  {
    id: 'penrose-process',
    title: 'Twenty per cent, and not a scrap more',
    description:
      'Energy out of a black hole. A fragment with negative energy plunges, its partner leaves '
      + 'with more than came in, and the hole\u2019s rotation pays \u2014 up to \u00bd(\u221a2\u22121) = 20.71%, '
      + 'derived rather than capped.',
    tags: ['General relativity', 'Kerr', 'Energy extraction'],
    load: () => import('../sims/penrose-process'),
  },
  {
    id: 'isco-explorer',
    title: 'Where orbits stop coming back',
    description:
      'Circular orbits exist down to 3M; what ends at 6M is their stability. Nudge one either '
      + 'side of the ISCO and watch \u03ba\u00b2 change sign \u2014 in Schwarzschild time, which never reaches '
      + 'the horizon.',
    tags: ['General relativity', 'Orbits', 'ISCO'],
    load: () => import('../sims/isco-explorer'),
  },
];
