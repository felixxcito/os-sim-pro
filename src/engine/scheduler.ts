import type { Process, SchedulingPolicy } from '../types';

/**
 * Planificador de CPU (Round Robin).
 * La cola de listos es un array de PIDs en orden de llegada a la cola.
 */

/**
 * Elige el siguiente proceso a despachar.
 * - RR:          el primero de la cola (FIFO circular).
 * - RR_PRIORITY: el de mejor prioridad efectiva; empates por orden de cola (RR dentro del nivel).
 * Devuelve el PID elegido o null si la cola está vacía.
 */
export function selectNext(
  readyQueue: number[],
  processes: Map<number, Process>,
  policy: SchedulingPolicy,
): number | null {
  if (readyQueue.length === 0) return null;
  if (policy === 'RR') return readyQueue[0];
  let best = readyQueue[0];
  for (const pid of readyQueue) {
    const p = processes.get(pid)!;
    if (p.effectivePriority < processes.get(best)!.effectivePriority) best = pid;
  }
  return best;
}

/** Un proceso agotó su quantum y aún le queda ráfaga: vuelve al final de la cola. */
export const quantumExpired = (p: Process) => p.quantumLeft <= 0 && p.remainingTime > 0;

/**
 * Envejecimiento (aging): cada `interval` ticks de espera mejora en 1 la prioridad
 * efectiva, hasta 0 (por encima de cualquier prioridad base). Evita la inanición.
 */
export function applyAging(p: Process, interval: number): Process {
  if (p.waitStreak === 0 || p.waitStreak % interval !== 0 || p.effectivePriority <= 0) return p;
  return { ...p, effectivePriority: p.effectivePriority - 1 };
}
