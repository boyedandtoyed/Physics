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
];
