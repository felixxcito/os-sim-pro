import type { Process, ResourceId, ResourceRequest, Rng } from '../types';
import { colorFor, IO_DEVICES } from './constants';

export interface ProcessSpec {
  name: string;
  burstTime: number;
  arrivalTime: number;
  priority?: number;
  quantum: number;
  memorySize: number;
  requests?: Omit<ResourceRequest, 'status'>[];
  tag?: Process['tag'];
  kind?: Process['kind'];
  interactive?: boolean;
}

/** Construye un PCB nuevo en estado New. */
export function createProcess(pid: number, spec: ProcessSpec): Process {
  const priority = spec.priority ?? 5;
  return {
    pid,
    name: spec.name,
    kind: spec.kind ?? 'user',
    interactive: spec.interactive ?? false,
    awaitingInput: false,
    cpu: null,
    state: 'New',
    burstTime: spec.burstTime,
    remainingTime: spec.burstTime,
    arrivalTime: spec.arrivalTime,
    priority,
    effectivePriority: priority,
    quantum: spec.quantum,
    quantumLeft: spec.quantum,
    memorySize: spec.memorySize,
    memoryBase: null,
    resourcesNeeded: (spec.requests ?? [])
      .map((r) => ({ ...r, status: 'pending' as const }))
      .sort((a, b) => a.at - b.at),
    heldResources: [],
    waitingFor: null,
    ioRemaining: 0,
    releaseAt: {},
    color: colorFor(pid),
    executedTime: 0,
    waitingTime: 0,
    blockedTime: 0,
    waitStreak: 0,
    startTime: null,
    finishTime: null,
    tag: spec.tag,
  };
}

const NAMES = [
  'chrome.exe',
  'spotify',
  'vscode',
  'kworker',
  'python3',
  'dockerd',
  'nginx',
  'postgres',
  'zoom',
  'gcc',
  'node',
  'explorer.exe',
  'antivirus',
  'backup.sh',
  'systemd',
  'java',
  'sshd',
  'ffmpeg',
];

const randInt = (rng: Rng, min: number, max: number) => Math.floor(rng() * (max - min + 1)) + min;
const pick = <T,>(rng: Rng, items: readonly T[]): T => items[Math.floor(rng() * items.length)];

/** Proceso aleatorio "realista": ráfaga, prioridad, memoria y E/S opcional. */
export function randomSpec(rng: Rng, arrivalTime: number, quantum: number): ProcessSpec {
  const burstTime = randInt(rng, 4, 16);
  const requests: ProcessSpec['requests'] = [];
  if (rng() < 0.45) {
    const resource: ResourceId = pick(rng, IO_DEVICES);
    requests.push({
      resource,
      at: randInt(rng, 1, burstTime - 1),
      mode: 'io',
      duration: randInt(rng, 2, 5),
    });
  }
  return {
    name: pick(rng, NAMES),
    burstTime,
    arrivalTime,
    priority: randInt(rng, 1, 10),
    quantum,
    memorySize: randInt(rng, 2, 16) * 32,
    requests,
  };
}
