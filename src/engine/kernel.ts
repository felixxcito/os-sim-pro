import type {
  GanttSlot,
  HistoryPoint,
  MemoryBlock,
  Process,
  ResourceId,
  Rng,
  SimConfig,
  SimEvent,
  SimState,
} from '../types';
import { CPU_WINDOW, EVENT_LIMIT, GANTT_LIMIT, HISTORY_LIMIT, STARVATION_THRESHOLD } from './constants';
import { allocate, free, isBlockedByFragmentation, memoryStats } from './memory';
import { releaseResource, requestResource, type Resources } from './resources';
import { applyAging, selectNext } from './scheduler';
import { detectDeadlock } from './deadlock';
import { createProcess, type ProcessSpec } from './process';
import { detectStarvation, floodSpec } from './starvation';

const cloneProcess = (p: Process): Process => ({
  ...p,
  resourcesNeeded: p.resourcesNeeded.map((r) => ({ ...r })),
  heldResources: [...p.heldResources],
  releaseAt: { ...p.releaseAt },
});

/**
 * Núcleo del simulador. Trabaja sobre una COPIA del estado: dentro de un tick
 * muta sus campos por claridad, pero nunca modifica el SimState recibido.
 * Así `step()` sigue siendo una función pura y testeable.
 */
export class Kernel {
  tick: number;
  procs: Map<number, Process>;
  readyQueue: number[];
  running: number | null;
  lastPid: number | null;
  memory: MemoryBlock[];
  resources: Resources;
  config: SimConfig;
  nextPid: number;
  nextEventId: number;
  contextSwitches: number;
  busyTicks: number;
  idleTicks: number;
  overheadTicks: number;
  floodTicks: number;
  deadlock: number[];
  starving: number[];
  gantt: GanttSlot[];
  history: HistoryPoint[];
  events: SimEvent[];
  /** PID que ejecutó en el tick actual (no acumula espera). */
  executedPid: number | null = null;

  constructor(s: SimState) {
    this.tick = s.tick;
    this.procs = new Map(s.processes.map((p) => [p.pid, cloneProcess(p)]));
    this.readyQueue = [...s.readyQueue];
    this.running = s.running;
    this.lastPid = s.lastPid;
    this.memory = s.memory.map((b) => ({ ...b }));
    this.resources = Object.fromEntries(
      Object.entries(s.resources).map(([id, r]) => [id, { ...r, queue: [...r.queue] }]),
    ) as unknown as Resources;
    this.config = { ...s.config };
    this.nextPid = s.nextPid;
    this.nextEventId = s.nextEventId;
    this.contextSwitches = s.contextSwitches;
    this.busyTicks = s.busyTicks;
    this.idleTicks = s.idleTicks;
    this.overheadTicks = s.overheadTicks;
    this.floodTicks = s.floodTicks;
    this.deadlock = [...s.deadlock];
    this.starving = [...s.starving];
    this.gantt = s.gantt;
    this.history = s.history;
    this.events = [...s.events];
  }

  toState(): SimState {
    return {
      tick: this.tick,
      processes: [...this.procs.values()],
      readyQueue: this.readyQueue,
      running: this.running,
      lastPid: this.lastPid,
      memory: this.memory,
      resources: this.resources,
      config: this.config,
      nextPid: this.nextPid,
      nextEventId: this.nextEventId,
      contextSwitches: this.contextSwitches,
      busyTicks: this.busyTicks,
      idleTicks: this.idleTicks,
      overheadTicks: this.overheadTicks,
      floodTicks: this.floodTicks,
      deadlock: this.deadlock,
      starving: this.starving,
      gantt: this.gantt,
      history: this.history,
      events: this.events.slice(-EVENT_LIMIT),
    };
  }

  log(kind: SimEvent['kind'], message: string, pid?: number) {
    this.events.push({ id: this.nextEventId++, tick: this.tick, kind, message, pid });
  }

  proc(pid: number): Process {
    return this.procs.get(pid)!;
  }

  label(pid: number) {
    return `P${pid} (${this.proc(pid).name})`;
  }

  spawn(spec: ProcessSpec): Process {
    const p = createProcess(this.nextPid++, spec);
    this.procs.set(p.pid, p);
    this.log('arrival', `Nuevo proceso ${p.name} (P${p.pid}) · ${p.memorySize} MB · ráfaga ${p.burstTime}`, p.pid);
    return p;
  }

  enqueueReady(p: Process) {
    p.state = 'Ready';
    if (!this.readyQueue.includes(p.pid)) this.readyQueue.push(p.pid);
  }

  // ---------------------------------------------------------------- Memoria

  /** Admite procesos nuevos cargándolos en RAM (New → Ready). */
  admitArrivals() {
    const candidates = [...this.procs.values()]
      .filter((p) => p.state === 'New' && p.arrivalTime <= this.tick)
      .sort((a, b) => a.arrivalTime - b.arrivalTime || a.pid - b.pid);

    for (const p of candidates) {
      const res = allocate(this.memory, p.pid, p.memorySize, this.config.strategy);
      if (res) {
        this.memory = res.blocks;
        p.memoryBase = res.base;
        p.waitStreak = 0;
        p.effectivePriority = p.priority;
        this.enqueueReady(p);
        this.log('admit', `${this.label(p.pid)} cargado en RAM @${res.base} MB (${this.config.strategy})`, p.pid);
        continue;
      }
      if (p.waitStreak === 0) {
        const s = memoryStats(this.memory);
        const reason = isBlockedByFragmentation(this.memory, p.memorySize)
          ? `fragmentación externa: ${s.free} MB libres pero el mayor hueco es de ${s.largestHole} MB`
          : `memoria insuficiente (${s.free} MB libres)`;
        this.log('memory', `${this.label(p.pid)} no cabe (${p.memorySize} MB) → ${reason}`, p.pid);
      }
      // Con aging activo, un proceso que lleva demasiado esperando memoria "reserva" la
      // siguiente liberación: no se admite a nadie más detrás de él.
      if (this.config.aging && p.waitStreak >= STARVATION_THRESHOLD) {
        if (p.waitStreak === STARVATION_THRESHOLD) {
          this.log('aging', `Aging: se reserva la memoria para ${this.label(p.pid)} (espera ${p.waitStreak} ticks)`, p.pid);
        }
        break;
      }
    }
  }

  // ---------------------------------------------------------------- Recursos

  /** El proceso recibe un recurso por el que esperaba (o al pedirlo libre). */
  grant(pid: number, rid: ResourceId) {
    const p = this.proc(pid);
    const req = p.resourcesNeeded.find((r) => r.resource === rid && r.status === 'waiting');
    if (!req) return;
    req.status = 'granted';
    p.waitingFor = null;
    p.heldResources.push(rid);
    this.log('acquire', `${this.label(pid)} obtiene ${this.resources[rid].name}`, pid);
    if (req.mode === 'io') {
      p.ioRemaining = req.duration;
    } else {
      p.releaseAt[rid] = p.executedTime + req.duration;
      this.enqueueReady(p);
      this.log('unblock', `${this.label(pid)} desbloqueado → Listo`, pid);
    }
  }

  release(pid: number, rid: ResourceId) {
    const p = this.proc(pid);
    const { resources, nextHolder } = releaseResource(this.resources, rid, pid);
    this.resources = resources;
    if (p.heldResources.includes(rid)) {
      p.heldResources = p.heldResources.filter((r) => r !== rid);
      delete p.releaseAt[rid];
      const req = p.resourcesNeeded.find((r) => r.resource === rid && r.status === 'granted');
      if (req) req.status = 'done';
      this.log('release', `${this.label(pid)} libera ${this.resources[rid].name}`, pid);
    }
    if (nextHolder !== null) this.grant(nextHolder, rid);
  }

  /** Avanza las operaciones de E/S en curso (Blocked → Ready al terminar). */
  progressIO() {
    const inIO = [...this.procs.values()].filter((p) => p.state === 'Blocked' && p.ioRemaining > 0);
    for (const p of inIO) {
      p.ioRemaining--;
      if (p.ioRemaining > 0) continue;
      const req = p.resourcesNeeded.find((r) => r.mode === 'io' && r.status === 'granted');
      if (req) this.release(p.pid, req.resource);
      this.enqueueReady(p);
      this.log('unblock', `${this.label(p.pid)} terminó su E/S → Listo`, p.pid);
    }
  }

  /**
   * Procesa las peticiones de recursos que tocan en este punto de la ejecución.
   * Devuelve true si el proceso quedó bloqueado (deja la CPU).
   */
  handleRequests(p: Process): boolean {
    for (const req of p.resourcesNeeded) {
      if (req.status !== 'pending' || req.at > p.executedTime) continue;
      const rid = req.resource;
      const { resources, granted } = requestResource(this.resources, rid, p.pid);
      this.resources = resources;
      if (!granted) {
        req.status = 'waiting';
        p.state = 'Blocked';
        p.waitingFor = rid;
        const holder = this.resources[rid].holder!;
        this.log('block', `${this.label(p.pid)} pide ${this.resources[rid].name}, ocupado por P${holder} → Bloqueado`, p.pid);
        return true;
      }
      req.status = 'granted';
      if (!p.heldResources.includes(rid)) p.heldResources.push(rid);
      this.log('acquire', `${this.label(p.pid)} obtiene ${this.resources[rid].name}`, p.pid);
      if (req.mode === 'io') {
        p.state = 'Blocked';
        p.ioRemaining = req.duration;
        this.log('block', `${this.label(p.pid)} inicia E/S en ${this.resources[rid].name} (${req.duration} ticks) → Bloqueado`, p.pid);
        return true;
      }
      p.releaseAt[rid] = p.executedTime + req.duration;
    }
    return false;
  }

  // ---------------------------------------------------------------- CPU

  terminate(p: Process, reason = 'terminó') {
    if (p.state === 'Terminated') return;
    const wasRunning = this.running === p.pid;
    p.state = 'Terminated';
    p.finishTime = this.tick;
    p.waitingFor = null;
    p.ioRemaining = 0;
    this.readyQueue = this.readyQueue.filter((pid) => pid !== p.pid);
    if (wasRunning) this.running = null;
    if (p.memoryBase !== null) {
      this.memory = free(this.memory, p.pid);
      p.memoryBase = null;
    }
    // Sale de cualquier cola de espera y libera lo que retiene (despertando a otros).
    for (const rid of Object.keys(this.resources) as ResourceId[]) {
      if (this.resources[rid].queue.includes(p.pid)) this.release(p.pid, rid);
    }
    for (const rid of [...p.heldResources]) this.release(p.pid, rid);
    const turnaround = p.finishTime - p.arrivalTime;
    this.log('terminate', `${this.label(p.pid)} ${reason} · retorno ${turnaround} · espera ${p.waitingTime}`, p.pid);
  }

  /** Despacha el siguiente proceso. Devuelve true si el tick se consumió en un cambio de contexto. */
  dispatch(): boolean {
    const next = selectNext(this.readyQueue, this.procs, this.config.policy);
    if (next === null) return false;
    this.readyQueue = this.readyQueue.filter((pid) => pid !== next);
    const p = this.proc(next);
    p.state = 'Running';
    p.quantumLeft = p.quantum;
    p.effectivePriority = p.priority;
    p.waitStreak = 0;
    if (p.startTime === null) p.startTime = this.tick;
    this.running = next;
    const switched = this.lastPid !== null && this.lastPid !== next;
    const prev = this.lastPid;
    this.lastPid = next;
    if (!switched) {
      this.log('dispatch', `Despachador: ${this.label(next)} → CPU`, next);
      return false;
    }
    this.contextSwitches++;
    this.log('context-switch', `Cambio de contexto: guarda PCB de P${prev} → carga PCB de ${this.label(next)}`, next);
    return this.config.contextSwitchCost > 0;
  }

  /** Un tick de CPU con Round Robin. */
  runCpu() {
    let used = false;
    let switching = false;
    this.executedPid = null;

    for (let guard = 0; !used && guard < 64; guard++) {
      if (this.running === null) {
        if (this.readyQueue.length === 0) break;
        if (this.dispatch()) {
          switching = true;
          used = true;
          this.overheadTicks++;
          break;
        }
      }
      const p = this.proc(this.running!);
      if (this.handleRequests(p)) {
        this.running = null;
        continue; // la CPU queda libre: se despacha otro en este mismo tick
      }

      p.remainingTime--;
      p.executedTime++;
      p.quantumLeft--;
      this.busyTicks++;
      used = true;
      this.executedPid = p.pid;

      for (const rid of [...p.heldResources]) {
        const at = p.releaseAt[rid];
        if (at !== undefined && p.executedTime >= at) this.release(p.pid, rid);
      }

      if (p.remainingTime <= 0) {
        this.terminate(p);
      } else if (p.quantumLeft <= 0) {
        this.running = null;
        this.enqueueReady(p);
        this.log('quantum', `${this.label(p.pid)} agotó su quantum (${p.quantum}) → final de la cola`, p.pid);
      }
    }

    if (!used) this.idleTicks++;
    this.gantt = [...this.gantt, { tick: this.tick, pid: this.executedPid, switching }].slice(-GANTT_LIMIT);
  }

  /** Contabiliza esperas, bloqueos y envejecimiento. */
  accountWaiting() {
    for (const p of this.procs.values()) {
      if (p.pid === this.executedPid) continue;
      const waiting = p.state === 'Ready' || (p.state === 'New' && p.arrivalTime <= this.tick);
      if (p.state === 'Blocked') p.blockedTime++;
      if (!waiting) continue;
      p.waitingTime++;
      p.waitStreak++;
      if (!this.config.aging) continue;
      const before = p.effectivePriority;
      const aged = applyAging(p, this.config.agingInterval);
      if (aged.effectivePriority !== before) {
        p.effectivePriority = aged.effectivePriority;
        if (p.tag === 'starvation' || p.waitStreak >= STARVATION_THRESHOLD) {
          this.log('aging', `Aging: ${this.label(p.pid)} prioridad ${before} → ${p.effectivePriority}`, p.pid);
        }
      }
    }
  }

  // ---------------------------------------------------------------- Escenarios

  /** Escenario de inanición: genera un proceso prioritario cada 2 ticks mientras dure. */
  generateFlood(rng: Rng) {
    if (this.floodTicks <= 0) return;
    this.floodTicks--;
    if (this.tick % 2 === 0) this.spawn(floodSpec(rng, this.tick, this.config.quantum));
    if (this.floodTicks === 0) this.log('starvation', 'Fin de la saturación de procesos prioritarios');
  }

  detectDeadlock() {
    const cycle = detectDeadlock([...this.procs.values()], this.resources);
    const isNew = cycle.some((pid) => !this.deadlock.includes(pid));
    if (cycle.length && isNew) {
      const desc = cycle
        .map((pid) => `P${pid} espera ${this.resources[this.proc(pid).waitingFor!].name}`)
        .join(' · ');
      this.log('deadlock', `¡DEADLOCK DETECTADO! Espera circular entre ${cycle.map((p) => 'P' + p).join(' ↔ ')} (${desc})`);
    }
    this.deadlock = cycle;
  }

  detectStarvation() {
    const starving = detectStarvation([...this.procs.values()], this.tick);
    for (const pid of starving) {
      if (!this.starving.includes(pid)) {
        this.log('starvation', `INANICIÓN: ${this.label(pid)} lleva ${this.proc(pid).waitStreak} ticks sin recibir CPU/memoria`, pid);
      }
    }
    this.starving = starving;
  }

  recordHistory() {
    const s = memoryStats(this.memory);
    const window = this.gantt.slice(-CPU_WINDOW);
    const busy = window.filter((g) => g.pid !== null).length;
    const point: HistoryPoint = {
      tick: this.tick,
      cpu: window.length ? Math.round((busy / window.length) * 100) : 0,
      memUsed: Math.round((s.used / s.total) * 1000) / 10,
      memFragmented: Math.round((s.fragmented / s.total) * 1000) / 10,
      memFree: Math.round((s.largestHole / s.total) * 1000) / 10,
      ready: this.readyQueue.length,
      blocked: [...this.procs.values()].filter((p) => p.state === 'Blocked').length,
    };
    this.history = [...this.history, point].slice(-HISTORY_LIMIT);
  }
}
