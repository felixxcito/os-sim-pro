import { describe, expect, it } from 'vitest';
import { addProcess, createInitialState } from '../../src/engine/state';
import { step } from '../../src/engine/tick';
import type { SimState } from '../../src/types';

const run = (s: SimState, ticks: number) => {
  for (let i = 0; i < ticks; i++) s = step(s);
  return s;
};

/** PID que ocupó el núcleo 0 en cada tick (o 'cs' si fue un cambio de contexto). */
const core0 = (s: SimState, cs = false) => s.gantt.map((g) => (cs && g.cores[0].switching ? 'cs' : g.cores[0].pid));

const base = (n: number, burst: number, quantum = 2, cores = 1) => {
  let s = createInitialState({ quantum, cores });
  for (let i = 0; i < n; i++) {
    s = addProcess(s, { name: `p${i + 1}`, burstTime: burst, arrivalTime: 0, quantum, memorySize: 32 });
  }
  return s;
};

describe('Round Robin', () => {
  it('respeta el quantum y alterna los procesos en orden circular', () => {
    const s = run(base(3, 4, 2), 12);
    expect(core0(s)).toEqual([1, 1, 2, 2, 3, 3, 1, 1, 2, 2, 3, 3]);
  });

  it('cuenta los cambios de contexto', () => {
    const s = run(base(3, 4, 2), 12);
    expect(s.contextSwitches).toBe(5);
  });

  it('un cambio de contexto con coste consume un tick de CPU', () => {
    let s = base(2, 2, 1);
    s = { ...s, config: { ...s.config, contextSwitchCost: 1 } };
    s = run(s, 6);
    expect(core0(s, true)).toEqual([1, 'cs', 2, 'cs', 1, 'cs']);
    expect(s.overheadTicks).toBe(3);
  });

  it('termina procesos, libera su memoria y calcula tiempos de espera', () => {
    const s = run(base(2, 3, 2), 10);
    const [p1, p2] = s.processes;
    expect(p1.state).toBe('Terminated');
    expect(p2.state).toBe('Terminated');
    expect(p1.finishTime).toBe(5); // 1,1,2,2,1
    expect(p1.waitingTime).toBe(2);
    expect(s.memory.filter((b) => b.pid !== null && b.pid !== 0)).toHaveLength(0);
  });

  it('una E/S bloquea al proceso y cede la CPU', () => {
    let s = createInitialState({ quantum: 5, cores: 1 });
    s = addProcess(s, {
      name: 'io', burstTime: 4, arrivalTime: 0, quantum: 5, memorySize: 32,
      requests: [{ resource: 'HDD', at: 1, mode: 'io', duration: 2 }],
    });
    s = addProcess(s, { name: 'cpu', burstTime: 4, arrivalTime: 0, quantum: 5, memorySize: 32 });
    s = run(s, 2);
    expect(s.processes[0].state).toBe('Blocked');
    expect(s.resources.HDD.holder).toBe(1);
    expect(core0(s)).toEqual([1, 2]);
    s = run(s, 2);
    expect(s.processes[0].state).toBe('Ready');
    expect(s.resources.HDD.holder).toBeNull();
  });
});

describe('multiprocesador (varios núcleos)', () => {
  it('con 2 núcleos ejecuta dos procesos en paralelo por tick', () => {
    const s = run(base(4, 4, 2, 2), 8);
    expect(s.gantt.map((g) => g.cores.map((c) => c.pid))).toEqual([
      [1, 2],
      [1, 2],
      [3, 4],
      [3, 4],
      [1, 2],
      [1, 2],
      [3, 4],
      [3, 4],
    ]);
    expect(s.processes.every((p) => p.state === 'Terminated')).toBe(true);
  });

  it('un proceso nunca ocupa dos núcleos en el mismo tick', () => {
    const s = run(base(3, 7, 1, 4), 12);
    for (const g of s.gantt) {
      const pids = g.cores.map((c) => c.pid).filter((p) => p !== null);
      expect(new Set(pids).size).toBe(pids.length);
    }
    // 3 procesos en 4 núcleos: siempre queda un núcleo ocioso mientras haya trabajo
    expect(s.gantt[0].cores.filter((c) => c.pid === null)).toHaveLength(1);
  });

  it('el uso de CPU se mide sobre todos los núcleos', () => {
    const s = run(base(1, 10, 3, 4), 4);
    expect(s.history.at(-1)!.cpu).toBe(25); // 1 de 4 núcleos ocupado
  });
});
