import type { Process, Resource, ResourceId, SimState } from '../types';
import { addProcess, logEvent } from './state';

/**
 * Interbloqueo (deadlock).
 * Detección mediante el GRAFO DE ESPERA (wait-for graph): existe una arista P → Q cuando
 * P está bloqueado esperando un recurso que posee Q. Como los recursos son de una sola
 * instancia, un ciclo en este grafo es condición necesaria y suficiente de interbloqueo.
 */

export interface WaitEdge {
  from: number;
  to: number;
  resource: ResourceId;
}

export function waitForGraph(processes: Process[], resources: Record<ResourceId, Resource>): WaitEdge[] {
  const edges: WaitEdge[] = [];
  for (const p of processes) {
    if (p.state !== 'Blocked' || p.waitingFor === null) continue;
    const holder = resources[p.waitingFor].holder;
    if (holder !== null && holder !== p.pid) edges.push({ from: p.pid, to: holder, resource: p.waitingFor });
  }
  return edges;
}

/** Devuelve los PIDs que forman parte de algún ciclo del grafo de espera (vacío si no hay). */
export function detectDeadlock(processes: Process[], resources: Record<ResourceId, Resource>): number[] {
  // Cada proceso espera como mucho un recurso → cada nodo tiene grado de salida ≤ 1,
  // así que basta con seguir la cadena desde cada nodo hasta repetir o terminar.
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

/**
 * Escenario educativo clásico:
 *   Proceso A: toma R1 y, tras ser expropiado, pide R2.
 *   Proceso B: toma R2 y, tras ser expropiado, pide R1.
 * Con quantum = 2, cada uno adquiere su primer recurso en su primer turno y pide el
 * segundo en el siguiente: se cumplen las 4 condiciones de Coffman (exclusión mutua,
 * retener y esperar, no expropiación de recursos y espera circular).
 */
export function launchDeadlockScenario(state: SimState): SimState {
  const common = { burstTime: 10, arrivalTime: state.tick, priority: 1, quantum: 2, memorySize: 32, tag: 'deadlock' as const };
  let s = logEvent(state, 'info', 'Escenario de interbloqueo: A retiene R1 y pedirá R2; B retiene R2 y pedirá R1');
  s = addProcess(s, {
    ...common,
    name: 'Proceso A',
    requests: [
      { resource: 'R1', at: 1, mode: 'hold', duration: 8 },
      { resource: 'R2', at: 2, mode: 'hold', duration: 6 },
    ],
  });
  s = addProcess(s, {
    ...common,
    name: 'Proceso B',
    requests: [
      { resource: 'R2', at: 1, mode: 'hold', duration: 8 },
      { resource: 'R1', at: 2, mode: 'hold', duration: 6 },
    ],
  });
  return s;
}
