import type { Process, Rng, SchedulingPolicy, SimState } from '../types';
import { STARVATION_THRESHOLD } from './constants';
import { addProcess, logEvent } from './state';

/**
 * Inanición (starvation).
 * Con Round Robin por prioridades, si siempre hay procesos de alta prioridad listos,
 * uno de baja prioridad nunca es elegido. Se detecta por tiempo de espera continuo.
 * Solución: envejecimiento (aging), que mejora la prioridad efectiva con la espera.
 */

export const FLOOD_DURATION = 60;

/**
 * - Listo: en RR puro la espera está acotada por una vuelta de la cola ((n-1)·q), así que no
 *   puede haber inanición de CPU; solo se vigila con RR por prioridades.
 * - Nuevo: un proceso que no consigue memoria durante el doble del umbral sufre inanición de memoria
 *   (típico de procesos grandes con RAM fragmentada).
 */
export function detectStarvation(processes: Process[], tick: number, policy: SchedulingPolicy): number[] {
  return processes
    .filter((p) =>
      p.state === 'Ready'
        ? policy === 'RR_PRIORITY' && p.waitStreak >= STARVATION_THRESHOLD
        : p.state === 'New' && p.arrivalTime <= tick && p.waitStreak >= STARVATION_THRESHOLD * 2,
    )
    .map((p) => p.pid);
}

/** Lanza un proceso de baja prioridad y satura la CPU con procesos cortos de alta prioridad. */
export function launchStarvationScenario(state: SimState, rng: Rng = Math.random): SimState {
  let s: SimState = {
    ...state,
    config: { ...state.config, policy: 'RR_PRIORITY' },
    floodTicks: FLOOD_DURATION,
  };
  s = logEvent(
    s,
    'starvation',
    `Escenario de inanición: planificador RR con prioridades + ráfaga de procesos prioritarios durante ${FLOOD_DURATION} ticks`,
  );
  s = addProcess(s, {
    name: 'backup-lowprio',
    burstTime: 6,
    arrivalTime: state.tick + 2,
    priority: 10,
    quantum: state.config.quantum,
    memorySize: 64,
    tag: 'starvation',
  });
  // La CPU ya está saturada cuando llega el proceso de baja prioridad.
  for (let i = 0; i < 4; i++) s = addProcess(s, floodSpec(rng, state.tick, state.config.quantum));
  return s;
}

/** Especificación de un proceso del "flood": corto y de prioridad máxima. */
export function floodSpec(rng: Rng, tick: number, quantum: number) {
  return {
    name: `svc-hiprio`,
    burstTime: 2 + Math.floor(rng() * 3),
    arrivalTime: tick,
    priority: 1 + Math.floor(rng() * 2),
    quantum,
    memorySize: 16 * (1 + Math.floor(rng() * 2)),
    tag: 'flood' as const,
  };
}
