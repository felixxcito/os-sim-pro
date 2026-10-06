import { create } from 'zustand';
import type { SimState } from '../types';
import { addRandomProcess, createSeededState } from '../engine/state';
import { step } from '../engine/tick';

export const SPEEDS = [
  { label: '0.5x', ms: 1000 },
  { label: '1x', ms: 500 },
  { label: '2x', ms: 250 },
  { label: '4x', ms: 120 },
] as const;

interface SimStore {
  sim: SimState;
  running: boolean;
  speedMs: number;
  play: () => void;
  pause: () => void;
  stepOnce: () => void;
  reset: () => void;
  setSpeed: (ms: number) => void;
  addRandom: () => void;
}

/** El intervalo del reloj vive fuera del estado: no es serializable ni debe re-renderizar. */
let clock: ReturnType<typeof setInterval> | null = null;

const stopClock = () => {
  if (clock) clearInterval(clock);
  clock = null;
};

export const useSimStore = create<SimStore>((set, get) => {
  const startClock = () => {
    stopClock();
    clock = setInterval(() => get().stepOnce(), get().speedMs);
  };

  return {
    sim: createSeededState(),
    running: false,
    speedMs: 500,

    play: () => {
      startClock();
      set({ running: true });
    },
    pause: () => {
      stopClock();
      set({ running: false });
    },
    stepOnce: () => set((s) => ({ sim: step(s.sim) })),
    reset: () => {
      stopClock();
      set({ sim: createSeededState(), running: false });
    },
    setSpeed: (ms) => {
      set({ speedMs: ms });
      if (get().running) startClock();
    },
    addRandom: () => set((s) => ({ sim: addRandomProcess(s.sim) })),
  };
});
