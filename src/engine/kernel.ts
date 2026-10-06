import type { CoreSlot, GanttSlot, HistoryPoint, Process, ResourceId, Rng, SimEvent, SimState } from '../types';
import { CPU_WINDOW, EVENT_LIMIT, GANTT_LIMIT, HISTORY_LIMIT, STARVATION_THRESHOLD, TERMINATED_LIMIT } from './constants';
import { MemoryManager } from './managers/MemoryManager';
import { floodSpec, ProcessManager } from './managers/ProcessManager';
import { ResourceManager, type Resources } from './managers/ResourceManager';
import { createProcess, type ProcessSpec } from './process';

/**
 * ============================================================================
 *  NÚCLEO — integra los tres administradores en el ciclo de reloj
 * ============================================================================
 *
 *   ProcessManager  → PCB, cola de listos, Round Robin, cambios de contexto, aging
 *   MemoryManager   → particiones, First/Best-Fit, fragmentación, compactación
 *   ResourceManager → dispositivos exclusivos, colas de espera, interbloqueo
 *
 * El núcleo trabaja sobre una COPIA del estado (los administradores clonan lo que
 * reciben): dentro de un tick muta sus campos por claridad, pero nunca modifica el
 * SimState de entrada. Por eso `step()` sigue siendo una función pura y testeable.
 */
export class Kernel {
  tick: number;
  pm: ProcessManager;
  mm: MemoryManager;
  rm: ResourceManager;
  config: SimState['config'];
  nextPid: number;
  nextEventId: number;
  floodTicks: number;
  deadlock: number[];
  starving: number[];
  gantt: GanttSlot[];
  history: HistoryPoint[];
  events: SimEvent[];
  /** PIDs que usaron CPU en el tick actual (no acumulan espera ni pueden repetir núcleo). */
  executed = new Set<number>();

  constructor(s: SimState) {
    this.tick = s.tick;
    this.config = { ...s.config };
    this.pm = new ProcessManager(s, this.config, (kind, msg, pid) => this.log(kind, msg, pid));
    this.mm = new MemoryManager(
      s.memory.map((b) => ({ ...b })),
      this.config.strategy,
    );
    this.rm = new ResourceManager(
      Object.fromEntries(Object.entries(s.resources).map(([id, r]) => [id, { ...r, queue: [...r.queue] }])) as unknown as Resources,
    );
    this.nextPid = s.nextPid;
    this.nextEventId = s.nextEventId;
    this.floodTicks = s.floodTicks;
    this.deadlock = [...s.deadlock];
    this.starving = [...s.starving];
    this.gantt = s.gantt;
    this.history = s.history;
    this.events = [...s.events];
  }

  /** Acceso directo a la tabla de procesos (lo usan las acciones del usuario). */
  get procs() {
    return this.pm.procs;
  }

  toState(): SimState {
    // En sesiones largas solo se conserva el historial de los últimos procesos terminados.
    let processes = this.pm.all();
    const done = processes.filter((p) => p.state === 'Terminated');
    if (done.length > TERMINATED_LIMIT) {
      const drop = new Set(done.slice(0, done.length - TERMINATED_LIMIT).map((p) => p.pid));
      processes = processes.filter((p) => !drop.has(p.pid));
    }
    return {
      tick: this.tick,
      processes,
      readyQueue: this.pm.readyQueue,
      running: this.pm.running,
      lastPid: this.pm.lastPid,
      memory: this.mm.blocks,
      resources: this.rm.resources,
      config: this.config,
      nextPid: this.nextPid,
      nextEventId: this.nextEventId,
      contextSwitches: this.pm.contextSwitches,
      busyTicks: this.pm.busyTicks,
      idleTicks: this.pm.idleTicks,
      overheadTicks: this.pm.overheadTicks,
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
    return this.pm.get(pid);
  }

  label(pid: number) {
    return this.pm.label(pid);
  }

  spawn(spec: ProcessSpec): Process {
    const p = createProcess(this.nextPid++, spec);
    this.pm.add(p);
    this.log('arrival', `Nuevo proceso ${p.name} (P${p.pid}) · ${p.memorySize} MB · ráfaga ${p.burstTime}`, p.pid);
    return p;
  }

  // ------------------------------------------------------------ Memoria (paso 2 del tick)

  /**
   * Admisión de largo plazo: los procesos que llegaron (New) se cargan en RAM si el
   * MemoryManager encuentra un hueco contiguo (New → Ready). Si no, esperan.
   */
  admitArrivals() {
    const candidates = this.pm
      .all()
      .filter((p) => p.state === 'New' && p.arrivalTime <= this.tick)
      .sort((a, b) => a.arrivalTime - b.arrivalTime || a.pid - b.pid);

    for (const p of candidates) {
      const base = this.mm.allocate(p.pid, p.memorySize);
      if (base !== null) {
        p.memoryBase = base;
        p.waitStreak = 0;
        p.effectivePriority = p.priority;
        this.pm.enqueueReady(p);
        this.log('admit', `${this.label(p.pid)} cargado en RAM @${base} MB (${this.config.strategy})`, p.pid);
        continue;
      }
      if (p.waitStreak === 0) {
        const s = this.mm.stats();
        const reason =
          this.mm.whyNotFit(p.memorySize) === 'fragmentation'
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

  // ------------------------------------------------------------ Recursos

  /** El proceso recibe un recurso por el que esperaba (al liberarlo su poseedor anterior). */
  grant(pid: number, rid: ResourceId) {
    const p = this.proc(pid);
    const req = p.resourcesNeeded.find((r) => r.resource === rid && r.status === 'waiting');
    if (!req) return;
    req.status = 'granted';
    p.waitingFor = null;
    p.heldResources.push(rid);
    this.log('acquire', `${this.label(pid)} obtiene ${this.rm.resources[rid].name}`, pid);
    if (req.mode === 'io') {
      p.ioRemaining = req.duration;
    } else {
      p.releaseAt[rid] = p.executedTime + req.duration;
      this.pm.enqueueReady(p);
      this.log('unblock', `${this.label(pid)} desbloqueado → Listo`, pid);
    }
  }

  release(pid: number, rid: ResourceId) {
    const p = this.proc(pid);
    const nextHolder = this.rm.release(pid, rid);
    if (p.heldResources.includes(rid)) {
      p.heldResources = p.heldResources.filter((r) => r !== rid);
      delete p.releaseAt[rid];
      const req = p.resourcesNeeded.find((r) => r.resource === rid && r.status === 'granted');
      if (req) req.status = 'done';
      this.log('release', `${this.label(pid)} libera ${this.rm.resources[rid].name}`, pid);
    }
    if (nextHolder !== null) this.grant(nextHolder, rid);
  }

  /** Avanza las operaciones de E/S en curso (Blocked → Ready al terminar). */
  progressIO() {
    const inIO = this.pm.all().filter((p) => p.state === 'Blocked' && p.ioRemaining > 0);
    for (const p of inIO) {
      p.ioRemaining--;
      if (p.ioRemaining > 0) continue;
      const req = p.resourcesNeeded.find((r) => r.mode === 'io' && r.status === 'granted');
      if (req) this.release(p.pid, req.resource);
      this.pm.enqueueReady(p);
      this.log('unblock', `${this.label(p.pid)} terminó su E/S → Listo`, p.pid);
    }
  }

  /**
   * Peticiones dinámicas de recursos: el proceso en ejecución pide los recursos que
   * le tocan en este punto de su ráfaga. Devuelve true si quedó bloqueado (deja la CPU).
   */
  handleRequests(p: Process): boolean {
    for (const req of p.resourcesNeeded) {
      if (req.status !== 'pending' || req.at > p.executedTime) continue;
      const rid = req.resource;
      if (!this.rm.request(p.pid, rid)) {
        req.status = 'waiting';
        p.state = 'Blocked';
        p.waitingFor = rid;
        this.log('block', `${this.label(p.pid)} pide ${this.rm.resources[rid].name}, ocupado por P${this.rm.holderOf(rid)} → Bloqueado`, p.pid);
        return true;
      }
      req.status = 'granted';
      if (!p.heldResources.includes(rid)) p.heldResources.push(rid);
      this.log('acquire', `${this.label(p.pid)} obtiene ${this.rm.resources[rid].name}`, p.pid);
      if (req.mode === 'io') {
        p.state = 'Blocked';
        p.ioRemaining = req.duration;
        this.log('block', `${this.label(p.pid)} inicia E/S en ${this.rm.resources[rid].name} (${req.duration} ticks) → Bloqueado`, p.pid);
        return true;
      }
      p.releaseAt[rid] = p.executedTime + req.duration;
    }
    return false;
  }

  // ------------------------------------------------------------ CPU (paso 1 del tick)

  /** Terminación: libera memoria y recursos (despertando a quien esperaba). */
  terminate(p: Process, reason = 'terminó') {
    if (p.state === 'Terminated') return;
    p.state = 'Terminated';
    p.finishTime = this.tick;
    p.waitingFor = null;
    p.ioRemaining = 0;
    this.pm.removeFromReady(p.pid);
    this.pm.vacate(p);
    if (p.memoryBase !== null) {
      this.mm.release(p.pid);
      p.memoryBase = null;
    }
    for (const rid of this.rm.queuedIn(p.pid)) this.release(p.pid, rid);
    for (const rid of [...p.heldResources]) this.release(p.pid, rid);
    this.log('terminate', `${this.label(p.pid)} ${reason} · retorno ${p.finishTime - p.arrivalTime} · espera ${p.waitingTime}`, p.pid);
  }

  /**
   * Un tick de CPU: cada núcleo (multiprocesador simétrico) ejecuta su proceso o, si está
   * libre, despacha el siguiente de la cola de listos compartida (Round Robin).
   */
  runCpu() {
    this.executed = new Set();
    const cores = this.pm.running.map((_, core) => this.runCore(core));
    this.gantt = [...this.gantt, { tick: this.tick, cores }].slice(-GANTT_LIMIT);
  }

  /** Un tick en un núcleo: despacho, peticiones de recursos, ejecución y fin de quantum. */
  private runCore(core: number): CoreSlot {
    for (let guard = 0; guard < 64; guard++) {
      if (this.pm.running[core] === null) {
        const r = this.pm.dispatch(core, this.tick, this.executed);
        if (r === 'none') break;
        if (r === 'switch') {
          this.pm.overheadTicks++;
          this.executed.add(this.pm.running[core]!);
          return { pid: null, switching: true };
        }
      }
      const p = this.proc(this.pm.running[core]!);
      if (this.handleRequests(p)) {
        this.pm.vacate(p);
        continue; // el núcleo queda libre: se despacha otro en este mismo tick
      }

      this.pm.executeTick(p);
      this.executed.add(p.pid);

      for (const rid of [...p.heldResources]) {
        const at = p.releaseAt[rid];
        if (at !== undefined && p.executedTime >= at) this.release(p.pid, rid);
      }

      if (p.remainingTime <= 0 && p.interactive) this.pm.blockForInput(p);
      else if (p.remainingTime <= 0) this.terminate(p);
      else if (p.quantumLeft <= 0) this.pm.preempt(p);
      return { pid: p.pid, switching: false };
    }
    this.pm.idleTicks++;
    return { pid: null, switching: false };
  }

  accountWaiting() {
    this.pm.accountWaiting(this.tick, this.executed);
  }

  addWork(p: Process, ticks: number, cap = 8) {
    this.pm.addWork(p, ticks, cap);
  }

  // ------------------------------------------------------------ Escenarios y detección (paso 3)

  /** Escenario de inanición: genera un proceso prioritario cada 2 ticks mientras dure. */
  generateFlood(rng: Rng) {
    if (this.floodTicks <= 0) return;
    this.floodTicks--;
    if (this.tick % 2 === 0) for (let c = 0; c < this.pm.cores; c++) this.spawn(floodSpec(rng, this.tick, this.config.quantum));
    if (this.floodTicks === 0) this.log('starvation', 'Fin de la saturación de procesos prioritarios');
  }

  /** Los servicios del sistema despiertan de vez en cuando con un poco de trabajo. */
  backgroundWork(rng: Rng) {
    for (const p of this.pm.procs.values()) {
      if (p.kind !== 'system' || !p.awaitingInput || rng() > 0.04) continue;
      this.pm.addWork(p, 1 + Math.floor(rng() * 3));
    }
  }

  detectDeadlock() {
    const cycle = this.rm.detectDeadlock(this.pm.all());
    const isNew = cycle.some((pid) => !this.deadlock.includes(pid));
    if (cycle.length && isNew) {
      const desc = cycle.map((pid) => `P${pid} espera ${this.rm.resources[this.proc(pid).waitingFor!].name}`).join(' · ');
      this.log('deadlock', `¡DEADLOCK DETECTADO! Espera circular entre ${cycle.map((p) => 'P' + p).join(' ↔ ')} (${desc})`);
    }
    this.deadlock = cycle;
  }

  detectStarvation() {
    const starving = this.pm.detectStarvation(this.tick);
    for (const pid of starving) {
      if (!this.starving.includes(pid)) {
        this.log('starvation', `INANICIÓN: ${this.label(pid)} lleva ${this.proc(pid).waitStreak} ticks esperando ${this.proc(pid).state === 'New' ? 'memoria' : 'CPU'}`, pid);
      }
    }
    this.starving = starving;
  }

  // ------------------------------------------------------------ Estado para la interfaz (paso 4)

  recordHistory() {
    const s = this.mm.stats();
    const window = this.gantt.slice(-CPU_WINDOW);
    const slots = window.flatMap((g) => g.cores);
    const busy = slots.filter((c) => c.pid !== null).length;
    const point: HistoryPoint = {
      tick: this.tick,
      cpu: slots.length ? Math.round((busy / slots.length) * 100) : 0,
      memUsed: Math.round((s.used / s.total) * 1000) / 10,
      memFragmented: Math.round((s.fragmented / s.total) * 1000) / 10,
      memFree: Math.round((s.largestHole / s.total) * 1000) / 10,
      ready: this.pm.readyQueue.length,
      blocked: this.pm.all().filter((p) => p.state === 'Blocked').length,
    };
    this.history = [...this.history, point].slice(-HISTORY_LIMIT);
  }
}
