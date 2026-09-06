import type { ComponentType } from 'react';

export interface SimulationEntry {
  id: string;
  title: string;
  description: string;
  tags: readonly string[];
  load: () => Promise<{ default: ComponentType }>;
}

// Only finished simulations belong here. Each loader owns its lazy route chunk.
export const simulations: readonly SimulationEntry[] = [];
