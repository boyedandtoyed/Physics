/** Playback and presentation state shared by every simulation.
 *
 * Keyed by sim id so two sims can never fight over one another's state, and so a sim that is
 * unmounted (its lazy chunk swapped out on a route change) comes back where it was.
 *
 * This holds *presentation* state only — whether the loop is running, whether the canvas is
 * expanded, how much grain is applied. No physical quantity lives here; those stay in each sim's
 * own state and in `core/`.
 */
import { create } from 'zustand';

export interface SimPresentation {
  /** False stops requestAnimationFrame entirely — no idle GPU draw. */
  playing: boolean;
  /** Bumped by `reset`; renderers watch it to return to their initial view. */
  resetToken: number;
  /** Canvas expanded to fill the viewport, side panel floating over it. */
  focused: boolean;
  /** Film grain, 0 to 1. Zero by default: CLAUDE.md forbids a cinematic default. */
  grain: number;
}

export const DEFAULT_PRESENTATION: SimPresentation = {
  playing: true,
  resetToken: 0,
  focused: false,
  grain: 0,
};

interface PlaybackState {
  sims: Record<string, SimPresentation>;
  get: (simId: string) => SimPresentation;
  setPlaying: (simId: string, playing: boolean) => void;
  togglePlaying: (simId: string) => void;
  reset: (simId: string) => void;
  setFocused: (simId: string, focused: boolean) => void;
  setGrain: (simId: string, grain: number) => void;
}

const update = (
  state: PlaybackState,
  simId: string,
  patch: Partial<SimPresentation>,
): Pick<PlaybackState, 'sims'> => ({
  sims: {
    ...state.sims,
    [simId]: { ...(state.sims[simId] ?? DEFAULT_PRESENTATION), ...patch },
  },
});

export const usePlaybackStore = create<PlaybackState>((set, getState) => ({
  sims: {},
  get: (simId) => getState().sims[simId] ?? DEFAULT_PRESENTATION,
  setPlaying: (simId, playing) => set(state => update(state, simId, { playing })),
  togglePlaying: (simId) => set(state => update(state, simId, {
    playing: !(state.sims[simId] ?? DEFAULT_PRESENTATION).playing,
  })),
  reset: (simId) => set(state => update(state, simId, {
    resetToken: (state.sims[simId] ?? DEFAULT_PRESENTATION).resetToken + 1,
  })),
  setFocused: (simId, focused) => set(state => update(state, simId, { focused })),
  setGrain: (simId, grain) => set(state => update(state, simId, {
    grain: Math.min(1, Math.max(0, grain)),
  })),
}));

/** Subscribe to one sim's presentation state. */
export function usePresentation(simId: string): SimPresentation {
  return usePlaybackStore(state => state.sims[simId] ?? DEFAULT_PRESENTATION);
}
