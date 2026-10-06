import { create } from 'zustand';
import type { ResourceId, SimConfig, SimState } from '../types';
import { addWork, compactMemory, killProcess, resolveDeadlock, updateConfig } from '../engine/actions';
import { launchDeadlockScenario } from '../engine/deadlock';
import type { ProcessSpec } from '../engine/process';
import { addProcess, addRandomProcess, createOsState, spawnProcess } from '../engine/state';
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
  kill: (pid: number, reason?: string) => void;
  /** Abre una app: crea su proceso interactivo y devuelve el PID. */
  spawnApp: (name: string, memorySize: number, priority: number) => number;
  /** Interacción del usuario con la ventana del proceso. */
  interact: (pid: number, ticks?: number) => void;
  /** Tarea corta de E/S (descargas → HDD, impresión → impresora). */
  spawnIoTask: (name: string, resource: ResourceId, duration: number) => void;
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
    sim: createOsState(),
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
      set({ sim: createOsState() });
      if (get().running) startClock();
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
    kill: (pid, reason) => apply((s) => killProcess(s, pid, reason)),
    spawnApp: (name, memorySize, priority) => {
      const { state, pid } = spawnProcess(get().sim, {
        name,
        memorySize,
        priority,
        burstTime: 4,
        arrivalTime: get().sim.tick,
        quantum: get().sim.config.quantum,
        kind: 'app',
        interactive: true,
      });
      set({ sim: state });
      return pid;
    },
    interact: (pid, ticks = 1) => apply((s) => addWork(s, pid, ticks)),
    spawnIoTask: (name, resource, duration) =>
      apply((s) =>
        addProcess(s, {
          name,
          burstTime: 2,
          arrivalTime: s.tick,
          priority: 3,
          quantum: s.config.quantum,
          memorySize: 16,
          requests: [{ resource, at: 1, mode: 'io', duration }],
        }),
      ),
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
