import type { Resource, ResourceId } from '../types';

/**
 * Gestor de recursos exclusivos (Disco, E/S).
 * Cada recurso tiene un único poseedor y una cola FIFO de procesos bloqueados.
 */

export type Resources = Record<ResourceId, Resource>;

export interface RequestOutcome {
  resources: Resources;
  granted: boolean;
}

/** Solicita un recurso: se concede si está libre; si no, el proceso entra en la cola de espera. */
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
  /** PID que recibe el recurso al liberarse (cabeza de la cola), o null. */
  nextHolder: number | null;
}

/** Libera un recurso y lo entrega al primer proceso de su cola de espera. */
export function releaseResource(resources: Resources, id: ResourceId, pid: number): ReleaseOutcome {
  const r = resources[id];
  if (r.holder !== pid) {
    // Si el proceso estaba solo en la cola (p. ej. fue terminado), se le saca de ella.
    return { resources: { ...resources, [id]: { ...r, queue: r.queue.filter((q) => q !== pid) } }, nextHolder: null };
  }
  const [nextHolder = null, ...rest] = r.queue;
  return { resources: { ...resources, [id]: { ...r, holder: nextHolder, queue: rest } }, nextHolder };
}
