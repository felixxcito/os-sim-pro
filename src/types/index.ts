/**
 * Modelos de datos del simulador.
 * Todo el motor (src/engine) trabaja sobre estas estructuras de forma pura:
 * recibe un estado y devuelve uno nuevo, sin efectos secundarios.
 */

export type ProcessState = 'New' | 'Ready' | 'Running' | 'Blocked' | 'Terminated';

/** Recursos exclusivos del sistema (la CPU se gestiona aparte, en el planificador). */
export type ResourceId = 'HDD' | 'PRINTER' | 'USB';

export type AllocationStrategy = 'first-fit' | 'best-fit';

/** RR = Round Robin puro (FIFO). RR_PRIORITY = Round Robin dentro de cada nivel de prioridad. */
export type SchedulingPolicy = 'RR' | 'RR_PRIORITY';

/**
 * Petición de recurso declarada en el PCB.
 * - `io`:   el proceso se bloquea `duration` ticks usando el dispositivo y luego lo libera.
 * - `hold`: el proceso retiene el recurso mientras ejecuta `duration` ticks de CPU
 *           (o hasta terminar si duration = Infinity). Es la base de "retener y esperar".
 */
export interface ResourceRequest {
  resource: ResourceId;
  /** Ticks de CPU ejecutados por el proceso en el momento de pedir el recurso. */
  at: number;
  mode: 'io' | 'hold';
  duration: number;
  status: 'pending' | 'waiting' | 'granted' | 'done';
}

/** Bloque de Control de Proceso (PCB). */
export interface Process {
  pid: number;
  name: string;
  state: ProcessState;
  burstTime: number;
  remainingTime: number;
  arrivalTime: number;
  /** 1 = máxima prioridad, 10 = mínima. */
  priority: number;
  /** Prioridad efectiva tras aplicar envejecimiento (aging). */
  effectivePriority: number;
  /** Quantum asignado a este proceso (Round Robin). */
  quantum: number;
  quantumLeft: number;
  /** Memoria RAM requerida (MB). */
  memorySize: number;
  /** Dirección base en RAM, null si aún no está cargado. */
  memoryBase: number | null;
  resourcesNeeded: ResourceRequest[];
  heldResources: ResourceId[];
  /** Recurso por el que está bloqueado esperando (cola de espera). */
  waitingFor: ResourceId | null;
  /** Ticks restantes de la operación de E/S en curso. */
  ioRemaining: number;
  /** Ticks de CPU a partir de los cuales libera cada recurso retenido en modo hold. */
  releaseAt: Partial<Record<ResourceId, number>>;
  color: string;
  // --- Estadísticas ---
  executedTime: number;
  waitingTime: number;
  blockedTime: number;
  /** Ticks consecutivos sin recibir CPU estando listo (o sin memoria estando nuevo). */
  waitStreak: number;
  startTime: number | null;
  finishTime: number | null;
  /** Etiqueta del escenario educativo al que pertenece. */
  tag?: 'deadlock' | 'starvation' | 'flood';
}

export interface MemoryBlock {
  start: number;
  size: number;
  /** null = hueco libre, 0 = núcleo del SO, >0 = PID. */
  pid: number | null;
}

export interface Resource {
  id: ResourceId;
  name: string;
  holder: number | null;
  queue: number[];
}

export type EventKind =
  | 'arrival'
  | 'admit'
  | 'dispatch'
  | 'context-switch'
  | 'quantum'
  | 'block'
  | 'unblock'
  | 'acquire'
  | 'release'
  | 'terminate'
  | 'memory'
  | 'compact'
  | 'deadlock'
  | 'starvation'
  | 'aging'
  | 'info';

export interface SimEvent {
  id: number;
  tick: number;
  kind: EventKind;
  message: string;
  pid?: number;
}

/** Una celda del diagrama de Gantt: qué ocupó la CPU en un tick. */
export interface GanttSlot {
  tick: number;
  /** PID ejecutado, null = CPU ociosa. */
  pid: number | null;
  /** El tick se consumió en un cambio de contexto (overhead). */
  switching: boolean;
}

export interface HistoryPoint {
  tick: number;
  /** % de uso de CPU (media móvil de los últimos ticks). */
  cpu: number;
  memUsed: number;
  memFragmented: number;
  memFree: number;
  ready: number;
  blocked: number;
}

export interface MemoryStats {
  total: number;
  used: number;
  free: number;
  largestHole: number;
  holes: number;
  /** Memoria libre que no está en el hueco más grande (inutilizable para peticiones grandes). */
  fragmented: number;
  /** Fragmentación externa = 1 - hueco_mayor / libre_total, en %. */
  externalFragmentation: number;
}

export interface SimConfig {
  quantum: number;
  strategy: AllocationStrategy;
  policy: SchedulingPolicy;
  aging: boolean;
  /** Ticks de espera para mejorar en 1 la prioridad efectiva. */
  agingInterval: number;
  /** Ticks que cuesta un cambio de contexto (0 o 1). */
  contextSwitchCost: number;
}

export interface SimState {
  tick: number;
  processes: Process[];
  readyQueue: number[];
  running: number | null;
  /** Último PID que ocupó la CPU (para detectar cambios de contexto). */
  lastPid: number | null;
  memory: MemoryBlock[];
  resources: Record<ResourceId, Resource>;
  config: SimConfig;
  nextPid: number;
  nextEventId: number;
  contextSwitches: number;
  busyTicks: number;
  idleTicks: number;
  overheadTicks: number;
  /** Ticks restantes generando procesos de alta prioridad (escenario de inanición). */
  floodTicks: number;
  /** PIDs que forman el ciclo de interbloqueo, vacío si no hay. */
  deadlock: number[];
  starving: number[];
  gantt: GanttSlot[];
  history: HistoryPoint[];
  events: SimEvent[];
}

export type Rng = () => number;
