import { create } from 'zustand';
import type { SimConfig, SimState } from '../types';
import { compactMemory, killProcess, resolveDeadlock, updateConfig } from '../engine/actions';
import { launchDeadlockScenario } from '../engine/deadlock';
import type { ProcessSpec } from '../engine/process';
import { addProcess, addRandomProcess, createSeededState } from '../engine/state';
import { launchStarvationScenario } from '../engine/starvation';
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
  toggle: () => void;
  stepOnce: () => void;
  reset: () => void;
  setSpeed: (ms: number) => void;
  addRandom: (count?: number) => void;
  addCustom: (spec: Omit<ProcessSpec, 'arrivalTime' | 'quantum'>) => void;
  kill: (pid: number) => void;
  compact: () => void;
  launchDeadlock: () => void;
  resolveDeadlock: () => void;
  launchStarvation: () => void;
  setConfig: (patch: Partial<SimConfig>) => void;
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
  const apply = (fn: (s: SimState) => SimState) => set((st) => ({ sim: fn(st.sim) }));

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
    toggle: () => (get().running ? get().pause() : get().play()),
    stepOnce: () => apply((s) => step(s)),
    reset: () => {
      stopClock();
      set({ sim: createSeededState(), running: false });
    },
    setSpeed: (ms) => {
      set({ speedMs: ms });
      if (get().running) startClock();
    },
    addRandom: (count = 1) =>
      apply((s) => {
        for (let i = 0; i < count; i++) s = addRandomProcess(s, Math.random, i);
        return s;
      }),
    addCustom: (spec) => apply((s) => addProcess(s, { ...spec, arrivalTime: s.tick, quantum: s.config.quantum })),
    kill: (pid) => apply((s) => killProcess(s, pid)),
    compact: () => apply(compactMemory),
    launchDeadlock: () => apply(launchDeadlockScenario),
    resolveDeadlock: () => apply(resolveDeadlock),
    launchStarvation: () => apply((s) => launchStarvationScenario(s)),
    setConfig: (patch) =>
      apply((s) => {
        let next = updateConfig(s, patch);
        // El quantum forma parte del PCB: se propaga a los procesos vivos (salvo escenarios fijos).
        if (patch.quantum !== undefined) {
          next = {
            ...next,
            processes: next.processes.map((p) =>
              p.state === 'Terminated' || p.tag === 'deadlock'
                ? p
                : { ...p, quantum: patch.quantum!, quantumLeft: Math.min(p.quantumLeft, patch.quantum!) },
            ),
          };
        }
        return next;
      }),
  };
});
