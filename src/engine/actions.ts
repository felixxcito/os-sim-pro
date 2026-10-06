import type { SimConfig, SimState } from '../types';
import { Kernel } from './kernel';
import { compact, memoryStats } from './memory';
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
  return k.toState();
}

export function updateConfig(state: SimState, patch: Partial<SimConfig>): SimState {
  return { ...state, config: { ...state.config, ...patch } };
}
