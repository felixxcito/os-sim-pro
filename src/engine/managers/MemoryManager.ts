import type { AllocationStrategy, MemoryBlock, MemoryStats } from '../../types';
import { KERNEL_SIZE, TOTAL_MEMORY } from '../constants';

/**
 * ============================================================================
 *  ADMINISTRADOR DE MEMORIA — Particionamiento dinámico (variable)
 * ============================================================================
 *
 * Modelo (Silberschatz, cap. 9 "Main Memory"; Stallings, cap. 7):
 *   La RAM es un vector contiguo de TOTAL_MEMORY MB. Se representa como una lista
 *   ORDENADA por dirección de "bloques" que la cubren por completo y sin solaparse:
 *
 *       [ KERNEL 0..128 ][ P3 128..224 ][ hueco 224..288 ][ P7 288..416 ][ hueco … ]
 *
 *   - pid = 0    → núcleo del SO (zona reservada, nunca se mueve ni se libera)
 *   - pid > 0    → partición asignada a ese proceso
 *   - pid = null → hueco libre
 *
 * A diferencia del particionamiento fijo, cada partición mide exactamente lo que
 * pide el proceso: no hay fragmentación INTERNA, pero al liberarse procesos de
 * tamaños distintos aparecen huecos dispersos → fragmentación EXTERNA:
 * puede haber memoria libre total suficiente y, aun así, ningún hueco contiguo
 * lo bastante grande para un proceso nuevo.
 *
 * Todas las funciones de algoritmo son PURAS (no mutan su entrada) para poder
 * probarlas aisladamente; la clase MemoryManager las envuelve con estado.
 */

// ---------------------------------------------------------------------------
//  Algoritmos (funciones puras)
// ---------------------------------------------------------------------------

/**
 * Coalescencia: fusiona huecos libres adyacentes en uno solo.
 * Sin este paso, liberar dos particiones vecinas dejaría dos huecos pequeños
 * en lugar de uno grande, agravando artificialmente la fragmentación.
 * Complejidad: O(n) en el número de bloques.
 */
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
 * Selección del hueco (política de colocación):
 *
 * - PRIMER AJUSTE (First-Fit): recorre los huecos por dirección y toma el
 *   primero cuyo tamaño ≥ solicitado. Es el más rápido (se detiene antes) y,
 *   según Knuth, tiende a concentrar huecos pequeños al principio de la memoria.
 *
 * - MEJOR AJUSTE (Best-Fit): examina TODOS los huecos y toma el más pequeño que
 *   todavía basta. Minimiza el sobrante inmediato, pero genera muchas astillas
 *   diminutas casi inutilizables.
 *
 * Devuelve el índice del bloque elegido o -1. Un -1 con memoria libre total
 * suficiente es exactamente la definición operativa de fragmentación externa.
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

/**
 * Asignación: divide el hueco elegido en [partición del proceso][resto libre].
 * La dirección base de la partición es la que el proceso usaría en su registro
 * de reubicación (registro base) para traducir direcciones lógicas a físicas.
 */
export function allocate(blocks: MemoryBlock[], pid: number, size: number, strategy: AllocationStrategy): AllocationResult | null {
  const index = findHole(blocks, size, strategy);
  if (index === -1) return null;
  const hole = blocks[index];
  const parts: MemoryBlock[] = [{ start: hole.start, size, pid }];
  if (hole.size > size) parts.push({ start: hole.start + size, size: hole.size - size, pid: null });
  return { blocks: [...blocks.slice(0, index), ...parts, ...blocks.slice(index + 1)], base: hole.start };
}

/** Liberación: la partición pasa a ser hueco y se fusiona con sus vecinos libres. */
export function free(blocks: MemoryBlock[], pid: number): MemoryBlock[] {
  return coalesce(blocks.map((b) => (b.pid === pid ? { ...b, pid: null } : b)));
}

export interface CompactionResult {
  blocks: MemoryBlock[];
  /** Nueva dirección base de cada proceso desplazado (hay que actualizar su PCB). */
  moved: Record<number, number>;
  movedCount: number;
}

/**
 * COMPACTACIÓN (Silberschatz §9.2.3): solución clásica a la fragmentación externa.
 * Desplaza todas las particiones ocupadas hacia las direcciones bajas, una tras
 * otra, de modo que todo el espacio libre queda reunido en UN único hueco al final.
 *
 * Solo es posible con reubicación dinámica (en tiempo de ejecución): al mover un
 * proceso se cambia su registro base. Su coste es proporcional a la memoria que
 * se copia, por eso los SO reales la hacen solo cuando hace falta.
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

/**
 * Métricas. La fragmentación externa se mide como
 *        FE = 1 − (hueco mayor / memoria libre total)
 * Vale 0 % cuando toda la memoria libre es contigua y tiende a 100 % cuando
 * la memoria libre está pulverizada en muchos huecos pequeños.
 */
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

/** ¿El proceso no cabe SOLO por culpa de la fragmentación (hay memoria total, pero no contigua)? */
export function isBlockedByFragmentation(blocks: MemoryBlock[], size: number): boolean {
  const s = memoryStats(blocks);
  return s.free >= size && s.largestHole < size;
}

export function initialMemory(): MemoryBlock[] {
  return [
    { start: 0, size: KERNEL_SIZE, pid: 0 },
    { start: KERNEL_SIZE, size: TOTAL_MEMORY - KERNEL_SIZE, pid: null },
  ];
}

// ---------------------------------------------------------------------------
//  Clase con estado (la usa el núcleo en cada tick)
// ---------------------------------------------------------------------------

export class MemoryManager {
  constructor(
    public blocks: MemoryBlock[] = initialMemory(),
    public strategy: AllocationStrategy = 'first-fit',
  ) {}

  /** Intenta cargar un proceso en RAM. Devuelve su dirección base o null si no hay hueco contiguo. */
  allocate(pid: number, size: number): number | null {
    const res = allocate(this.blocks, pid, size, this.strategy);
    if (!res) return null;
    this.blocks = res.blocks;
    return res.base;
  }

  /** Libera la partición de un proceso terminado (deja un hueco y lo fusiona con sus vecinos). */
  release(pid: number) {
    this.blocks = free(this.blocks, pid);
  }

  /** Compacta la memoria: todos los huecos se reúnen en un único bloque libre al final. */
  compactMemory(): CompactionResult {
    const res = compact(this.blocks);
    this.blocks = res.blocks;
    return res;
  }

  stats(): MemoryStats {
    return memoryStats(this.blocks);
  }

  /** Motivo por el que un proceso de `size` MB no puede entrar ahora mismo. */
  whyNotFit(size: number): 'fragmentation' | 'insufficient' {
    return isBlockedByFragmentation(this.blocks, size) ? 'fragmentation' : 'insufficient';
  }
}
