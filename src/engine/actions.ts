import type { SimConfig, SimState } from '../types';
import { Kernel } from './kernel';
import { compact, memoryStats } from './managers/MemoryManager';
import { chooseVictim } from './managers/ResourceManager';
import { logEvent } from './state';

/** Acciones del usuario que no dependen del reloj. Todas puras: SimState → SimState. */

export function compactMemory(state: SimState): SimState {
  const before = memoryStats(state.memory);
  const { blocks, moved, movedCount } = compact(state.memory);
  if (movedCount === 0) return logEvent(state, 'compact', 'Compactación: la memoria ya es contigua, nada que mover');
  const processes = state.processes.map((p) => (p.pid in moved ? { ...p, memoryBase: moved[p.pid] } : p));
  const after = memoryStats(blocks);
  return logEvent(
    { ...state, memory: blocks, processes },
    'compact',
    `Compactación: ${movedCount} particiones desplazadas · ${before.holes} huecos → ${after.holes} · hueco mayor ${before.largestHole} → ${after.largestHole} MB`,
  );
}

export function killProcess(state: SimState, pid: number, reason = 'terminado por el usuario'): SimState {
  const k = new Kernel(state);
  const p = k.procs.get(pid);
  if (!p) return state;
  k.terminate(p, reason);
  k.detectDeadlock();
  return k.toState();
}

export function updateConfig(state: SimState, patch: Partial<SimConfig>): SimState {
  return { ...state, config: { ...state.config, ...patch } };
}

/** Recuperación del interbloqueo: aborta a la víctima (menor prioridad; si empatan, la más joven). */
export function resolveDeadlock(state: SimState): SimState {
  if (state.deadlock.length === 0) return state;
  const victim = chooseVictim(state.processes, state.deadlock);
  if (!victim) return state;
  const k = new Kernel(state);
  k.log('deadlock', `Recuperación: se aborta a la víctima ${k.label(victim.pid)} para romper la espera circular`, victim.pid);
  k.terminate(k.proc(victim.pid), 'abortado (víctima del interbloqueo)');
  k.detectDeadlock();
  return k.toState();
}

/** Interacción del usuario con una ventana: trabajo de CPU para su proceso. */
export function addWork(state: SimState, pid: number, ticks = 1): SimState {
  const k = new Kernel(state);
  const p = k.procs.get(pid);
  if (!p) return state;
  k.addWork(p, ticks);
  return k.toState();
}
