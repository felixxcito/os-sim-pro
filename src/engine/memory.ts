/** Compatibilidad: los algoritmos de memoria viven en managers/MemoryManager.ts. */
export {
  allocate,
  coalesce,
  compact,
  findHole,
  free,
  isBlockedByFragmentation,
  memoryStats,
  type AllocationResult,
  type CompactionResult,
} from './managers/MemoryManager';
