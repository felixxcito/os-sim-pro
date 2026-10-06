import { describe, expect, it } from 'vitest';
import { allocate, compact, findHole, free, isBlockedByFragmentation, memoryStats } from '../../src/engine/memory';
import type { MemoryBlock } from '../../src/types';

// Kernel [0,100) | P1 [100,150) | hueco 80 | P2 [230,260) | hueco 40 | P3 [300,400) | hueco 200
const fragmented: MemoryBlock[] = [
  { start: 0, size: 100, pid: 0 },
  { start: 100, size: 50, pid: 1 },
  { start: 150, size: 80, pid: null },
  { start: 230, size: 30, pid: 2 },
  { start: 260, size: 40, pid: null },
  { start: 300, size: 100, pid: 3 },
  { start: 400, size: 200, pid: null },
];

describe('asignación de memoria', () => {
  it('First-Fit elige el primer hueco suficiente', () => {
    expect(findHole(fragmented, 35, 'first-fit')).toBe(2); // hueco de 80
  });

  it('Best-Fit elige el hueco suficiente más ajustado', () => {
    expect(findHole(fragmented, 35, 'best-fit')).toBe(4); // hueco de 40
  });

  it('divide el hueco y devuelve la dirección base', () => {
    const res = allocate(fragmented, 9, 60, 'first-fit')!;
    expect(res.base).toBe(150);
    expect(res.blocks[2]).toEqual({ start: 150, size: 60, pid: 9 });
    expect(res.blocks[3]).toEqual({ start: 210, size: 20, pid: null });
  });

  it('falla si ningún hueco contiguo basta', () => {
    expect(allocate(fragmented, 9, 250, 'best-fit')).toBeNull();
  });
});

describe('fragmentación externa', () => {
  it('calcula huecos, hueco mayor y porcentaje', () => {
    const s = memoryStats(fragmented);
    expect(s.free).toBe(320);
    expect(s.holes).toBe(3);
    expect(s.largestHole).toBe(200);
    expect(s.fragmented).toBe(120);
    expect(s.externalFragmentation).toBe(37.5);
  });

  it('detecta que hay memoria total pero no contigua', () => {
    expect(isBlockedByFragmentation(fragmented, 250)).toBe(true);
    expect(isBlockedByFragmentation(fragmented, 150)).toBe(false);
  });

  it('liberar fusiona huecos adyacentes', () => {
    const blocks = free(fragmented, 2);
    expect(blocks.find((b) => b.start === 150)).toEqual({ start: 150, size: 150, pid: null });
    expect(memoryStats(blocks).holes).toBe(2);
  });
});

describe('compactación', () => {
  it('deja un único hueco al final y conserva el tamaño total', () => {
    const { blocks, moved, movedCount } = compact(fragmented);
    expect(blocks.map((b) => b.pid)).toEqual([0, 1, 2, 3, null]);
    expect(blocks[4]).toEqual({ start: 280, size: 320, pid: null });
    expect(moved).toEqual({ 2: 150, 3: 180 });
    expect(movedCount).toBe(2);
    expect(memoryStats(blocks).externalFragmentation).toBe(0);
  });

  it('tras compactar cabe el proceso que antes no cabía', () => {
    expect(allocate(compact(fragmented).blocks, 9, 250, 'first-fit')).not.toBeNull();
  });
});
