import type { Process, Resource, ResourceId, SimState } from '../../types';
import { RESOURCE_IDS } from '../constants';
import { addProcess, createResources, logEvent } from '../state';

/**
 * ============================================================================
 *  ADMINISTRADOR DE RECURSOS E INTERBLOQUEO
 * ============================================================================
 *
 * Recursos del sistema:
 *   - CPU y RAM: los asignan el planificador (ProcessManager) y el MemoryManager.
 *   - Dispositivos EXCLUSIVOS de una instancia: Disco duro, Impresora, Pantalla y USB.
 *     Cada uno tiene un único poseedor y una cola FIFO de procesos bloqueados.
 *
 * Un INTERBLOQUEO (deadlock) ocurre si y solo si se dan a la vez las cuatro
 * condiciones de Coffman (1971):
 *   1. Exclusión mutua      → los dispositivos no se comparten.
 *   2. Retener y esperar    → un proceso retiene un recurso mientras pide otro.
 *   3. No expropiación      → nadie puede quitarle el recurso a su poseedor.
 *   4. Espera circular      → P1 espera a P2, P2 espera a P1 (o un ciclo mayor).
 *
 * Este módulo lo DETECTA de dos maneras equivalentes (Silberschatz §8.7):
 *   a) Ciclo en el GRAFO DE ESPERA (wait-for graph), válido con recursos de una
 *      sola instancia.
 *   b) ALGORITMO DE DETECCIÓN con matrices Available / Allocation / Request,
 *      variante del algoritmo del Banquero que sirve también con varias instancias.
 */

export type Resources = Record<ResourceId, Resource>;

export { createResources };

// ---------------------------------------------------------------------------
//  Petición y liberación (funciones puras)
// ---------------------------------------------------------------------------

export interface RequestOutcome {
  resources: Resources;
  granted: boolean;
}

/** Petición: si el recurso está libre se concede; si no, el proceso entra en su cola de espera (y se bloquea). */
export function requestResource(resources: Resources, id: ResourceId, pid: number): RequestOutcome {
  const r = resources[id];
  if (r.holder === null || r.holder === pid) {
    return { resources: { ...resources, [id]: { ...r, holder: pid } }, granted: true };
  }
  const queue = r.queue.includes(pid) ? r.queue : [...r.queue, pid];
  return { resources: { ...resources, [id]: { ...r, queue } }, granted: false };
}

export interface ReleaseOutcome {
  resources: Resources;
  /** PID que recibe el recurso (cabeza de la cola), o null. */
  nextHolder: number | null;
}

/** Liberación: el recurso pasa al primero de la cola (FIFO → sin inanición entre los que esperan). */
export function releaseResource(resources: Resources, id: ResourceId, pid: number): ReleaseOutcome {
  const r = resources[id];
  if (r.holder !== pid) {
    // El proceso no lo poseía: solo se le saca de la cola (p. ej. porque fue terminado).
    return { resources: { ...resources, [id]: { ...r, queue: r.queue.filter((q) => q !== pid) } }, nextHolder: null };
  }
  const [nextHolder = null, ...rest] = r.queue;
  return { resources: { ...resources, [id]: { ...r, holder: nextHolder, queue: rest } }, nextHolder };
}

// ---------------------------------------------------------------------------
//  a) Detección por grafo de espera
// ---------------------------------------------------------------------------

export interface WaitEdge {
  from: number;
  to: number;
  resource: ResourceId;
}

/**
 * Grafo de espera: se obtiene del grafo de asignación de recursos eliminando los
 * nodos-recurso. Hay arista P → Q cuando P está bloqueado esperando un recurso que posee Q.
 */
export function waitForGraph(processes: Process[], resources: Resources): WaitEdge[] {
  const edges: WaitEdge[] = [];
  for (const p of processes) {
    if (p.state !== 'Blocked' || p.waitingFor === null) continue;
    const holder = resources[p.waitingFor].holder;
    if (holder !== null && holder !== p.pid) edges.push({ from: p.pid, to: holder, resource: p.waitingFor });
  }
  return edges;
}

/**
 * Busca ciclos en el grafo de espera. Con recursos de UNA instancia,
 * existe un ciclo ⇔ existe interbloqueo (Silberschatz §8.7.1).
 *
 * Como cada proceso espera a lo sumo un recurso y cada recurso tiene un solo
 * poseedor, cada nodo tiene grado de salida ≤ 1: basta con seguir la cadena desde
 * cada nodo hasta llegar a un nodo sin salida (no hay ciclo) o repetir uno (ciclo).
 * Complejidad: O(n²) en el peor caso, más que suficiente para este tamaño.
 *
 * Devuelve los PID que forman parte de algún ciclo, ordenados.
 */
export function detectDeadlock(processes: Process[], resources: Resources): number[] {
  const next = new Map(waitForGraph(processes, resources).map((e) => [e.from, e.to]));
  const inCycle = new Set<number>();
  for (const start of next.keys()) {
    const path: number[] = [];
    const seen = new Set<number>();
    let cur: number | undefined = start;
    while (cur !== undefined && !seen.has(cur)) {
      seen.add(cur);
      path.push(cur);
      cur = next.get(cur);
    }
    if (cur !== undefined) path.slice(path.indexOf(cur)).forEach((pid) => inCycle.add(pid));
  }
  return [...inCycle].sort((a, b) => a - b);
}

// ---------------------------------------------------------------------------
//  b) Algoritmo de detección con matrices (variante del Banquero)
// ---------------------------------------------------------------------------

export interface MatrixAnalysis {
  /** Recursos (columnas de las matrices). */
  resources: ResourceId[];
  /** Instancias totales de cada recurso. */
  total: number[];
  /** Vector Available = total − Σ Allocation. */
  available: number[];
  rows: { pid: number; allocation: number[]; request: number[]; finish: boolean; order: number | null }[];
  /** Procesos que nunca pueden terminar: están (o dependen de) un interbloqueo. */
  deadlocked: number[];
}

/**
 * Algoritmo de detección de Silberschatz (§8.7.2), derivado del algoritmo del Banquero:
 *
 *   1. Work ← Available;  Finish[i] ← (Allocation[i] = 0)
 *   2. Buscar i con Finish[i] = falso  y  Request[i] ≤ Work.
 *      Si no existe, ir a 4.
 *   3. Work ← Work + Allocation[i];  Finish[i] ← verdadero;  volver a 2.
 *      (Suponemos optimistamente que Pi obtiene lo que pide, termina y devuelve lo suyo.)
 *   4. Si algún Finish[i] = falso, el sistema está en interbloqueo y Pi está bloqueado.
 *
 * A diferencia del Banquero (que EVITA el interbloqueo usando las necesidades
 * máximas), aquí se usan las peticiones ACTUALES, por lo que sirve para detectar.
 * Complejidad: O(m · n²) con m recursos y n procesos.
 */
export function detectDeadlockMatrix(processes: Process[], resources: Resources): MatrixAnalysis {
  const ids = RESOURCE_IDS;
  const live = processes.filter((p) => p.state !== 'Terminated');
  const total = ids.map(() => 1); // dispositivos de una sola instancia
  const rows = live.map((p) => ({
    pid: p.pid,
    allocation: ids.map((id) => (resources[id].holder === p.pid ? 1 : 0)),
    request: ids.map((id) => (p.state === 'Blocked' && p.waitingFor === id ? 1 : 0)),
    finish: false,
    order: null as number | null,
  }));
  const available = ids.map((_, j) => total[j] - rows.reduce((acc, r) => acc + r.allocation[j], 0));

  const work = [...available];
  // Un proceso que no retiene nada no puede formar parte de un interbloqueo.
  for (const r of rows) r.finish = r.allocation.every((a) => a === 0);
  let order = 0;
  for (let progress = true; progress; ) {
    progress = false;
    for (const r of rows) {
      if (r.finish || !r.request.every((q, j) => q <= work[j])) continue;
      r.allocation.forEach((a, j) => (work[j] += a));
      r.finish = true;
      r.order = order++;
      progress = true;
    }
  }
  return { resources: ids, total, available, rows, deadlocked: rows.filter((r) => !r.finish).map((r) => r.pid) };
}

// ---------------------------------------------------------------------------
//  Escenario forzado
// ---------------------------------------------------------------------------

/**
 * Induce intencionalmente una ESPERA CIRCULAR entre dos procesos:
 *   Proceso A: obtiene el DISCO nada más ser despachado y, en su siguiente turno, pide la IMPRESORA.
 *   Proceso B: obtiene la IMPRESORA nada más ser despachado y, en su siguiente turno, pide el DISCO.
 *
 * ¿Por qué ocurre siempre (con 1 o con varios núcleos)? Ambos tienen quantum = 2: piden
 * el primer recurso al empezar (tras 0 ticks de CPU) y el segundo tras 2 ticks, es decir,
 * ya en su SEGUNDO turno. Como la cola de listos es FIFO, entre el primer y el segundo
 * turno de A el proceso B tiene que ser despachado (o lo fue a la vez en otro núcleo), y
 * viceversa. Así cada uno retiene su primer recurso antes de que el otro pida el segundo:
 * A espera la impresora que tiene B, y B espera el disco que tiene A → A → B → A.
 */
export function forceDeadlockScenario(state: SimState): SimState {
  const common = { burstTime: 10, arrivalTime: state.tick, priority: 1, quantum: 2, memorySize: 32, tag: 'deadlock' as const };
  let s = logEvent(state, 'info', 'Escenario de interbloqueo: A retiene el Disco y pedirá la Impresora; B retiene la Impresora y pedirá el Disco');
  s = addProcess(s, {
    ...common,
    name: 'Proceso A',
    requests: [
      { resource: 'HDD', at: 0, mode: 'hold', duration: 8 },
      { resource: 'PRINTER', at: 2, mode: 'hold', duration: 6 },
    ],
  });
  s = addProcess(s, {
    ...common,
    name: 'Proceso B',
    requests: [
      { resource: 'PRINTER', at: 0, mode: 'hold', duration: 8 },
      { resource: 'HDD', at: 2, mode: 'hold', duration: 6 },
    ],
  });
  return s;
}

/** Recuperación: elige como víctima al de menor prioridad (y, si empatan, al más joven). */
export function chooseVictim(processes: Process[], cycle: number[]): Process | null {
  const victims = processes.filter((p) => cycle.includes(p.pid));
  if (!victims.length) return null;
  return victims.reduce((a, b) => (b.priority > a.priority || (b.priority === a.priority && b.pid > a.pid) ? b : a));
}

// ---------------------------------------------------------------------------
//  Clase con estado
// ---------------------------------------------------------------------------

export class ResourceManager {
  constructor(public resources: Resources = createResources()) {}

  /** Devuelve true si se concedió; false si el proceso quedó en la cola de espera. */
  request(pid: number, id: ResourceId): boolean {
    const out = requestResource(this.resources, id, pid);
    this.resources = out.resources;
    return out.granted;
  }

  /** Libera el recurso y devuelve a quién se le entregó (o null). */
  release(pid: number, id: ResourceId): number | null {
    const out = releaseResource(this.resources, id, pid);
    this.resources = out.resources;
    return out.nextHolder;
  }

  holderOf(id: ResourceId) {
    return this.resources[id].holder;
  }

  /** Recursos en cuyas colas espera el proceso. */
  queuedIn(pid: number): ResourceId[] {
    return RESOURCE_IDS.filter((id) => this.resources[id].queue.includes(pid));
  }

  detectDeadlock(processes: Process[]): number[] {
    return detectDeadlock(processes, this.resources);
  }

  detectDeadlockMatrix(processes: Process[]): MatrixAnalysis {
    return detectDeadlockMatrix(processes, this.resources);
  }
}
