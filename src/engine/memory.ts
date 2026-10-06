import type { AllocationStrategy, MemoryBlock, MemoryStats } from '../types';

/**
 * Gestor de memoria: particionamiento dinámico.
 * La RAM es una lista ordenada y contigua de bloques (procesos o huecos) que cubre
 * toda la memoria. Todas las funciones son puras.
 */

/** Une huecos libres adyacentes (coalescencia). */
export function coalesce(blocks: MemoryBlock[]): MemoryBlock[] {
  const out: MemoryBlock[] = [];
  for (const b of blocks) {
    const prev = out[out.length - 1];
    if (prev && prev.pid === null && b.pid === null) {
      out[out.length - 1] = { ...prev, size: prev.size + b.size };
    } else {
      out.push({ ...b });
    }
  }
  return out;
}

/**
 * Elige el hueco donde cargar un proceso.
 * - First-Fit: el primer hueco con tamaño suficiente.
 * - Best-Fit:  el hueco suficiente más pequeño (minimiza el sobrante).
 * Devuelve el índice del bloque o -1 si ningún hueco basta (aunque la suma libre alcance:
 * eso es exactamente la fragmentación externa).
 */
export function findHole(blocks: MemoryBlock[], size: number, strategy: AllocationStrategy): number {
  let chosen = -1;
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.pid !== null || b.size < size) continue;
    if (strategy === 'first-fit') return i;
    if (chosen === -1 || b.size < blocks[chosen].size) chosen = i;
  }
  return chosen;
}

export interface AllocationResult {
  blocks: MemoryBlock[];
  base: number;
}

/** Asigna `size` MB al proceso `pid`. Devuelve null si no hay un hueco contiguo suficiente. */
export function allocate(
  blocks: MemoryBlock[],
  pid: number,
  size: number,
  strategy: AllocationStrategy,
): AllocationResult | null {
  const index = findHole(blocks, size, strategy);
  if (index === -1) return null;
  const hole = blocks[index];
  const parts: MemoryBlock[] = [{ start: hole.start, size, pid }];
  if (hole.size > size) parts.push({ start: hole.start + size, size: hole.size - size, pid: null });
  return {
    blocks: [...blocks.slice(0, index), ...parts, ...blocks.slice(index + 1)],
    base: hole.start,
  };
}

/** Libera la partición de un proceso y fusiona los huecos vecinos. */
export function free(blocks: MemoryBlock[], pid: number): MemoryBlock[] {
  return coalesce(blocks.map((b) => (b.pid === pid ? { ...b, pid: null } : b)));
}

export interface CompactionResult {
  blocks: MemoryBlock[];
  /** Nueva dirección base de cada proceso desplazado. */
  moved: Record<number, number>;
  movedCount: number;
}

/**
 * Compactación: desplaza todas las particiones ocupadas hacia las direcciones bajas,
 * dejando un único hueco libre al final. Elimina la fragmentación externa.
 */
export function compact(blocks: MemoryBlock[]): CompactionResult {
  const total = blocks.reduce((acc, b) => acc + b.size, 0);
  const out: MemoryBlock[] = [];
  const moved: Record<number, number> = {};
  let cursor = 0;
  let movedCount = 0;
  for (const b of blocks) {
    if (b.pid === null) continue;
    if (b.start !== cursor) {
      movedCount++;
      if (b.pid !== 0) moved[b.pid] = cursor;
    }
    out.push({ start: cursor, size: b.size, pid: b.pid });
    cursor += b.size;
  }
  if (cursor < total) out.push({ start: cursor, size: total - cursor, pid: null });
  return { blocks: out, moved, movedCount };
}

export function memoryStats(blocks: MemoryBlock[]): MemoryStats {
  let total = 0;
  let freeMem = 0;
  let largestHole = 0;
  let holes = 0;
  for (const b of blocks) {
    total += b.size;
    if (b.pid === null) {
      freeMem += b.size;
      holes++;
      largestHole = Math.max(largestHole, b.size);
    }
  }
  return {
    total,
    used: total - freeMem,
    free: freeMem,
    largestHole,
    holes,
    fragmented: freeMem - largestHole,
    externalFragmentation: freeMem === 0 ? 0 : Math.round((1 - largestHole / freeMem) * 1000) / 10,
  };
}

/** ¿Hay memoria total suficiente pero ningún hueco contiguo la admite? */
export function isBlockedByFragmentation(blocks: MemoryBlock[], size: number): boolean {
  const s = memoryStats(blocks);
  return s.free >= size && s.largestHole < size;
}
