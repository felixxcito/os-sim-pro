import type { Process, Rng, SchedulingPolicy, SimConfig, SimEvent, SimState } from '../../types';
import { STARVATION_THRESHOLD } from '../constants';
import { addProcess, logEvent } from '../state';

/**
 * ============================================================================
 *  ADMINISTRADOR DE PROCESOS — ciclo de vida y planificación de CPU
 * ============================================================================
 *
 * Diagrama de estados (modelo de 5 estados, Stallings §3.2):
 *
 *     New ──admitir (hay memoria)──▶ Ready ──despachar──▶ Running ──terminar──▶ Terminated
 *                                     ▲  ▲                   │  │
 *                                     │  └──fin de quantum───┘  │ pide E/S o un recurso ocupado
 *                                     └──────E/S completada─── Blocked ◀┘
 *
 * Cada proceso se describe con su PCB (Process Control Block, tipo `Process`):
 * PID, nombre, estado, ráfaga total (burstTime), tiempo restante, llegada,
 * prioridad, quantum, memoria, recursos retenidos/pedidos y estadísticas.
 *
 * PLANIFICADOR ROUND ROBIN (Silberschatz §5.3.3)
 *   - La cola de listos es FIFO circular.
 *   - El proceso despachado ejecuta como máximo `quantum` ticks seguidos.
 *   - Si agota el quantum y aún le queda ráfaga, es EXPROPIADO: vuelve al final
 *     de la cola (Running → Ready) y se produce un CAMBIO DE CONTEXTO: se guarda
 *     su PCB y se carga el del siguiente. Ese cambio puede costar ticks (overhead).
 *   - Ventaja: tiempo de respuesta acotado: ningún proceso espera más de
 *     (n − 1) · q ticks entre dos turnos. Un quantum muy grande degenera en FCFS;
 *     uno muy pequeño dispara el overhead de cambios de contexto.
 *
 * VARIANTE CON PRIORIDADES + INANICIÓN
 *   Con RR_PRIORITY se elige siempre al de mejor prioridad (RR solo entre empates).
 *   Si llegan continuamente procesos prioritarios, uno de baja prioridad puede no
 *   ejecutarse NUNCA: inanición (starvation). La solución clásica es el
 *   ENVEJECIMIENTO (aging): la prioridad efectiva mejora con el tiempo de espera,
 *   hasta que el proceso acaba superando a los recién llegados.
 */

export type LogFn = (kind: SimEvent['kind'], message: string, pid?: number) => void;

// ---------------------------------------------------------------------------
//  Algoritmos (funciones puras)
// ---------------------------------------------------------------------------

/**
 * Selección del siguiente proceso:
 *   - RR:          cabeza de la cola FIFO.
 *   - RR_PRIORITY: menor valor de prioridad efectiva (1 = máxima); empates por orden de cola.
 */
export function selectNext(readyQueue: number[], processes: Map<number, Process>, policy: SchedulingPolicy): number | null {
  if (readyQueue.length === 0) return null;
  if (policy === 'RR') return readyQueue[0];
  let best = readyQueue[0];
  for (const pid of readyQueue) {
    if (processes.get(pid)!.effectivePriority < processes.get(best)!.effectivePriority) best = pid;
  }
  return best;
}

/** El proceso agotó su quantum y aún le queda trabajo: debe ser expropiado. */
export const quantumExpired = (p: Process) => p.quantumLeft <= 0 && p.remainingTime > 0;

/**
 * Envejecimiento de UN proceso: cada `interval` ticks de espera continua, su prioridad
 * efectiva mejora en 1 (hasta 0, por encima de cualquier prioridad base).
 * Al ser despachado se restablece su prioridad base.
 */
export function applyAging(p: Process, interval: number): Process {
  if (p.waitStreak === 0 || p.waitStreak % interval !== 0 || p.effectivePriority <= 0) return p;
  return { ...p, effectivePriority: p.effectivePriority - 1 };
}

/**
 * Detección de inanición:
 *  - Listo: en RR puro la espera está acotada por (n−1)·q, así que no puede haber inanición de CPU;
 *    solo se vigila con RR por prioridades (espera continua ≥ umbral).
 *  - Nuevo: un proceso que no consigue memoria durante el doble del umbral sufre inanición
 *    de memoria (típico de procesos grandes con la RAM fragmentada).
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

export const FLOOD_DURATION = 60;

/** Proceso del "flood" del escenario de inanición: corto y de prioridad máxima. */
export function floodSpec(rng: Rng, tick: number, quantum: number) {
  return {
    name: 'svc-hiprio',
    burstTime: 2 + Math.floor(rng() * 3),
    arrivalTime: tick,
    priority: 1 + Math.floor(rng() * 2),
    quantum,
    memorySize: 16 * (1 + Math.floor(rng() * 2)),
    tag: 'flood' as const,
  };
}

/**
 * Escenario de inanición: activa RR con prioridades, lanza un proceso de prioridad 10
 * ("backup-lowprio") y satura la CPU con procesos cortos de prioridad 1–2 durante
 * FLOOD_DURATION ticks (uno cada 2 ticks, más trabajo del que la CPU puede atender).
 * Sin aging, el de baja prioridad no recibe CPU mientras dure la saturación.
 */
export function forceStarvationScenario(state: SimState, rng: Rng = Math.random): SimState {
  let s: SimState = { ...state, config: { ...state.config, policy: 'RR_PRIORITY' }, floodTicks: FLOOD_DURATION };
  s = logEvent(s, 'starvation', `Escenario de inanición: planificador RR con prioridades + ráfaga de procesos prioritarios durante ${FLOOD_DURATION} ticks`);
  s = addProcess(s, {
    name: 'backup-lowprio',
    burstTime: 6,
    arrivalTime: state.tick + 2,
    priority: 10,
    quantum: state.config.quantum,
    memorySize: 64,
    tag: 'starvation',
  });
  for (let i = 0; i < 4; i++) s = addProcess(s, floodSpec(rng, state.tick, state.config.quantum));
  return s;
}

// ---------------------------------------------------------------------------
//  Clase con estado
// ---------------------------------------------------------------------------

export interface ProcessTable {
  processes: Process[];
  readyQueue: number[];
  running: number | null;
  lastPid: number | null;
  contextSwitches: number;
  busyTicks: number;
  idleTicks: number;
  overheadTicks: number;
}

const clonePcb = (p: Process): Process => ({
  ...p,
  resourcesNeeded: p.resourcesNeeded.map((r) => ({ ...r })),
  heldResources: [...p.heldResources],
  releaseAt: { ...p.releaseAt },
});

export class ProcessManager {
  procs: Map<number, Process>;
  readyQueue: number[];
  running: number | null;
  lastPid: number | null;
  contextSwitches: number;
  busyTicks: number;
  idleTicks: number;
  overheadTicks: number;

  constructor(
    table: ProcessTable,
    private config: SimConfig,
    private log: LogFn,
  ) {
    this.procs = new Map(table.processes.map((p) => [p.pid, clonePcb(p)]));
    this.readyQueue = [...table.readyQueue];
    this.running = table.running;
    this.lastPid = table.lastPid;
    this.contextSwitches = table.contextSwitches;
    this.busyTicks = table.busyTicks;
    this.idleTicks = table.idleTicks;
    this.overheadTicks = table.overheadTicks;
  }

  get(pid: number): Process {
    return this.procs.get(pid)!;
  }

  all(): Process[] {
    return [...this.procs.values()];
  }

  label(pid: number) {
    return `P${pid} (${this.get(pid).name})`;
  }

  add(p: Process) {
    this.procs.set(p.pid, p);
  }

  /** Transición → Ready: entra al final de la cola de listos. */
  enqueueReady(p: Process) {
    p.state = 'Ready';
    if (!this.readyQueue.includes(p.pid)) this.readyQueue.push(p.pid);
  }

  removeFromReady(pid: number) {
    this.readyQueue = this.readyQueue.filter((x) => x !== pid);
  }

  /**
   * DESPACHADOR: Ready → Running. Repone el quantum, restablece la prioridad base
   * (fin del envejecimiento) y registra el cambio de contexto si cambia el proceso en CPU.
   * Devuelve true si este tick se consume en el cambio de contexto (overhead).
   */
  dispatch(tick: number): boolean {
    const next = selectNext(this.readyQueue, this.procs, this.config.policy);
    if (next === null) return false;
    this.removeFromReady(next);
    const p = this.get(next);
    p.state = 'Running';
    p.quantumLeft = p.quantum;
    p.effectivePriority = p.priority;
    p.waitStreak = 0;
    if (p.startTime === null) p.startTime = tick;
    this.running = next;
    const prev = this.lastPid;
    this.lastPid = next;
    if (prev === null || prev === next) {
      this.log('dispatch', `Despachador: ${this.label(next)} → CPU`, next);
      return false;
    }
    this.contextSwitches++;
    this.log('context-switch', `Cambio de contexto: guarda PCB de P${prev} → carga PCB de ${this.label(next)}`, next);
    return this.config.contextSwitchCost > 0;
  }

  /** Un tick de CPU para el proceso en ejecución: avanza su ráfaga y consume quantum. */
  executeTick(p: Process) {
    p.remainingTime--;
    p.executedTime++;
    p.quantumLeft--;
    this.busyTicks++;
  }

  /** Fin de quantum: Running → Ready (al final de la cola). La siguiente selección provoca el cambio de contexto. */
  preempt(p: Process) {
    this.running = null;
    this.enqueueReady(p);
    this.log('quantum', `${this.label(p.pid)} agotó su quantum (${p.quantum}) → final de la cola`, p.pid);
  }

  /** Proceso interactivo sin trabajo: se bloquea esperando al usuario (no termina). */
  blockForInput(p: Process) {
    p.state = 'Blocked';
    p.awaitingInput = true;
    p.remainingTime = 0;
    this.running = null;
  }

  /** Añade ráfaga de CPU (interacción del usuario); si esperaba al usuario, vuelve a Ready. */
  addWork(p: Process, ticks: number, cap = 8) {
    if (p.state === 'Terminated') return;
    const added = Math.max(0, Math.min(ticks, cap - p.remainingTime));
    p.remainingTime += added;
    p.burstTime += added;
    if (p.awaitingInput && p.remainingTime > 0) {
      p.awaitingInput = false;
      this.enqueueReady(p);
    }
  }

  /** Contabiliza el tiempo de espera (Ready o Nuevo sin memoria) y de bloqueo de cada proceso. */
  accountWaiting(tick: number, executedPid: number | null) {
    for (const p of this.procs.values()) {
      if (p.pid === executedPid) continue;
      if (p.state === 'Blocked' && !p.awaitingInput) p.blockedTime++;
      if (this.isWaiting(p, tick)) {
        p.waitingTime++;
        p.waitStreak++;
      }
    }
    if (this.config.aging) this.applyAging(tick, executedPid);
  }

  private isWaiting(p: Process, tick: number) {
    return p.state === 'Ready' || (p.state === 'New' && p.arrivalTime <= tick);
  }

  /**
   * ENVEJECIMIENTO: a todos los procesos que esperan se les mejora la prioridad
   * efectiva en 1 cada `agingInterval` ticks de espera continua.
   * Resuelve la inanición: tarde o temprano el proceso postergado supera a los recién llegados.
   */
  applyAging(tick: number, executedPid: number | null = null) {
    for (const p of this.procs.values()) {
      if (p.pid === executedPid || !this.isWaiting(p, tick)) continue;
      const before = p.effectivePriority;
      p.effectivePriority = applyAging(p, this.config.agingInterval).effectivePriority;
      if (p.effectivePriority !== before && (p.tag === 'starvation' || p.waitStreak >= STARVATION_THRESHOLD)) {
        this.log('aging', `Aging: ${this.label(p.pid)} prioridad ${before} → ${p.effectivePriority}`, p.pid);
      }
    }
  }

  detectStarvation(tick: number): number[] {
    return detectStarvation(this.all(), tick, this.config.policy);
  }
}
