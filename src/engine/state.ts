import type { Process, Resource, ResourceId, Rng, SimConfig, SimEvent, SimState } from '../types';
import { DEFAULT_CONFIG, EVENT_LIMIT, KERNEL_SIZE, RESOURCE_IDS, RESOURCE_NAMES, TOTAL_MEMORY } from './constants';
import { createProcess, randomSpec, type ProcessSpec } from './process';

export function createResources(): Record<ResourceId, Resource> {
  const resources = {} as Record<ResourceId, Resource>;
  for (const id of RESOURCE_IDS) resources[id] = { id, name: RESOURCE_NAMES[id], holder: null, queue: [] };
  return resources;
}

export function createInitialState(config: Partial<SimConfig> = {}): SimState {
  return {
    tick: 0,
    processes: [],
    readyQueue: [],
    running: null,
    lastPid: null,
    memory: [
      { start: 0, size: KERNEL_SIZE, pid: 0 },
      { start: KERNEL_SIZE, size: TOTAL_MEMORY - KERNEL_SIZE, pid: null },
    ],
    resources: createResources(),
    config: { ...DEFAULT_CONFIG, ...config },
    nextPid: 1,
    nextEventId: 1,
    contextSwitches: 0,
    busyTicks: 0,
    idleTicks: 0,
    overheadTicks: 0,
    floodTicks: 0,
    deadlock: [],
    starving: [],
    gantt: [],
    history: [],
    events: [],
  };
}

/** Añade un evento a la bitácora del núcleo (inmutable). */
export function logEvent(state: SimState, kind: SimEvent['kind'], message: string, pid?: number): SimState {
  const event: SimEvent = { id: state.nextEventId, tick: state.tick, kind, message, pid };
  return {
    ...state,
    nextEventId: state.nextEventId + 1,
    events: [...state.events, event].slice(-EVENT_LIMIT),
  };
}

/** Registra un proceso nuevo (estado New) en la tabla de procesos. */
export function addProcess(state: SimState, spec: ProcessSpec): SimState {
  const proc: Process = createProcess(state.nextPid, spec);
  const next = { ...state, processes: [...state.processes, proc], nextPid: state.nextPid + 1 };
  return logEvent(next, 'arrival', `Nuevo proceso ${proc.name} (P${proc.pid}) · ${proc.memorySize} MB · ráfaga ${proc.burstTime}`, proc.pid);
}

export function addRandomProcess(state: SimState, rng: Rng = Math.random, delay = 0): SimState {
  return addProcess(state, randomSpec(rng, state.tick + delay, state.config.quantum));
}

/** Registra un proceso y devuelve también su PID (para enlazarlo con una ventana). */
export function spawnProcess(state: SimState, spec: ProcessSpec): { state: SimState; pid: number } {
  const pid = state.nextPid;
  return { state: addProcess(state, spec), pid };
}

/** Servicios con los que arranca el SO (procesos interactivos de sistema). */
export const SYSTEM_SERVICES: { name: string; memorySize: number; priority: number }[] = [
  { name: 'systemd', memorySize: 32, priority: 1 },
  { name: 'escritorio', memorySize: 64, priority: 2 },
  { name: 'audiod', memorySize: 16, priority: 3 },
  { name: 'red-wifi', memorySize: 16, priority: 3 },
  { name: 'indexador', memorySize: 48, priority: 8 },
];

/** Procesos de carga de trabajo con los que arranca el sistema (además de los servicios). */
export const BOOT_WORKLOAD = 6;

/**
 * Estado de arranque del SO: 5 servicios del sistema (interactivos, nunca terminan) más
 * BOOT_WORKLOAD procesos de usuario que llegan escalonados: 11 procesos precargados.
 * Las aplicaciones se añaden después, al abrir ventanas.
 */
export function createOsState(rng: Rng = Math.random): SimState {
  let state = createInitialState();
  for (const svc of SYSTEM_SERVICES) {
    state = addProcess(state, { ...svc, burstTime: 2, arrivalTime: 0, quantum: state.config.quantum, kind: 'system', interactive: true });
  }
  for (let i = 0; i < BOOT_WORKLOAD; i++) state = addRandomProcess(state, rng, 1 + i * 2);
  return state;
}

/** Estado inicial con una carga de trabajo de 12 procesos escalonados. */
export function createSeededState(rng: Rng = Math.random): SimState {
  let state = createInitialState();
  for (let i = 0; i < 12; i++) state = addRandomProcess(state, rng, Math.floor(i * 1.5));
  return state;
}
