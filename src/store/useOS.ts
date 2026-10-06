import { useMemo } from 'react';
import { memoryStats } from '../engine/managers/MemoryManager';
import { detectDeadlockMatrix, waitForGraph } from '../engine/managers/ResourceManager';
import type { MemoryBlock, Process } from '../types';
import { useSimStore } from './useSimStore';

/**
 * ============================================================================
 *  useOS — controlador principal para la interfaz
 * ============================================================================
 *
 * Une el estado del núcleo (ProcessManager + MemoryManager + ResourceManager, que
 * avanzan con el reloj de `useSimStore`) y lo expone ya preparado para la UI y para
 * las gráficas de Recharts:
 *
 *   logs       → bitácora del núcleo
 *   memoryMap  → bloques de la RAM con su proceso, color y si son fragmentación
 *   ganttData  → ocupación de la CPU por tick + tiempos de ejecución/espera/bloqueo por proceso
 *   metrics    → utilización de CPU, tiempos medios, throughput, fragmentación…
 *   deadlock   → ciclo del grafo de espera y análisis por matrices
 *   actions    → reloj (play/pausa/paso), quantum, compactación, escenarios…
 */

export interface MemoryMapBlock extends MemoryBlock {
  kind: 'kernel' | 'process' | 'fragment' | 'free';
  name?: string;
  color?: string;
  /** Posición y ancho en % para dibujar la barra horizontal. */
  left: number;
  width: number;
}

export function useOS() {
  const store = useSimStore();
  const { sim } = store;

  const byPid = useMemo(() => new Map<number, Process>(sim.processes.map((p) => [p.pid, p])), [sim.processes]);

  const memoryMap = useMemo<MemoryMapBlock[]>(() => {
    const total = sim.memory.reduce((a, b) => a + b.size, 0);
    const last = sim.memory.length - 1;
    return sim.memory.map((b, i) => {
      const p = b.pid ? byPid.get(b.pid) : undefined;
      return {
        ...b,
        // Un hueco que NO es el último está entre procesos: es fragmentación externa.
        kind: b.pid === 0 ? 'kernel' : b.pid === null ? (i === last ? 'free' : 'fragment') : 'process',
        name: b.pid === 0 ? 'Núcleo' : p?.name,
        color: p?.color,
        left: (b.start / total) * 100,
        width: (b.size / total) * 100,
      };
    });
  }, [sim.memory, byPid]);

  const ganttData = useMemo(
    () => ({
      /** Qué proceso ocupó la CPU en cada tick (null = ociosa). */
      slots: sim.gantt,
      /** Para el gráfico de barras: tiempos acumulados de cada proceso. */
      perProcess: sim.processes
        .filter((p) => p.arrivalTime <= sim.tick)
        .map((p) => ({ pid: p.pid, name: `P${p.pid} ${p.name}`, ejecucion: p.executedTime, espera: p.waitingTime, bloqueo: p.blockedTime })),
    }),
    [sim.gantt, sim.processes, sim.tick],
  );

  const metrics = useMemo(() => {
    const done = sim.processes.filter((p) => p.state === 'Terminated' && p.finishTime !== null);
    const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
    const ticks = sim.busyTicks + sim.idleTicks + sim.overheadTicks;
    const mem = memoryStats(sim.memory);
    return {
      tick: sim.tick,
      cpuUtilization: ticks ? sim.busyTicks / ticks : 0,
      cpuNow: sim.history[sim.history.length - 1]?.cpu ?? 0,
      contextSwitches: sim.contextSwitches,
      avgWaiting: avg(done.map((p) => p.waitingTime)),
      avgTurnaround: avg(done.map((p) => p.finishTime! - p.arrivalTime)),
      avgResponse: avg(done.filter((p) => p.startTime !== null).map((p) => p.startTime! - p.arrivalTime)),
      throughput: sim.tick ? done.length / sim.tick : 0,
      completed: done.length,
      memory: mem,
    };
  }, [sim]);

  const deadlock = useMemo(
    () => ({
      cycle: sim.deadlock,
      edges: waitForGraph(sim.processes, sim.resources),
      matrix: detectDeadlockMatrix(sim.processes, sim.resources),
    }),
    [sim.deadlock, sim.processes, sim.resources],
  );

  return {
    state: sim,
    running: store.running,
    processes: sim.processes,
    logs: sim.events,
    history: sim.history,
    memoryMap,
    ganttData,
    metrics,
    deadlock,
    starving: sim.starving,
    actions: {
      play: store.play,
      pause: store.pause,
      step: store.stepOnce,
      reset: store.reset,
      setSpeed: store.setSpeed,
      setQuantum: (quantum: number) => store.setConfig({ quantum }),
      setStrategy: (strategy: 'first-fit' | 'best-fit') => store.setConfig({ strategy }),
      setAging: (aging: boolean) => store.setConfig({ aging }),
      compactMemory: store.compact,
      forceDeadlockScenario: store.launchDeadlock,
      resolveDeadlock: store.resolveDeadlock,
      forceStarvationScenario: store.launchStarvation,
      addRandomProcess: store.addRandom,
      kill: store.kill,
    },
  };
}
