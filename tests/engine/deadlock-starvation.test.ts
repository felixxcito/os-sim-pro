import { describe, expect, it } from 'vitest';
import { resolveDeadlock } from '../../src/engine/actions';
import { STARVATION_THRESHOLD } from '../../src/engine/constants';
import { detectDeadlock, detectDeadlockMatrix, forceDeadlockScenario as launchDeadlockScenario } from '../../src/engine/managers/ResourceManager';
import { createResources, addProcess, createInitialState } from '../../src/engine/state';
import { forceStarvationScenario as launchStarvationScenario } from '../../src/engine/managers/ProcessManager';
import { step } from '../../src/engine/tick';
import { createProcess } from '../../src/engine/process';
import type { SimState } from '../../src/types';

const run = (s: SimState, ticks: number, rng = () => 0.5) => {
  for (let i = 0; i < ticks; i++) s = step(s, rng);
  return s;
};

describe('detección de interbloqueo', () => {
  it('encuentra el ciclo en el grafo de espera', () => {
    const resources = createResources();
    resources.HDD.holder = 1;
    resources.PRINTER.holder = 2;
    const a = { ...createProcess(1, { name: 'A', burstTime: 5, arrivalTime: 0, quantum: 2, memorySize: 16 }), state: 'Blocked' as const, waitingFor: 'PRINTER' as const };
    const b = { ...createProcess(2, { name: 'B', burstTime: 5, arrivalTime: 0, quantum: 2, memorySize: 16 }), state: 'Blocked' as const, waitingFor: 'HDD' as const };
    const c = { ...createProcess(3, { name: 'C', burstTime: 5, arrivalTime: 0, quantum: 2, memorySize: 16 }), state: 'Blocked' as const, waitingFor: 'HDD' as const };
    expect(detectDeadlock([a, b, c], resources)).toEqual([1, 2]); // C espera pero no está en el ciclo
  });

  it('el algoritmo de matrices (Silberschatz) llega a la misma conclusión que el grafo', () => {
    const resources = createResources();
    resources.HDD.holder = 1;
    resources.PRINTER.holder = 2;
    const a = { ...createProcess(1, { name: 'A', burstTime: 5, arrivalTime: 0, quantum: 2, memorySize: 16 }), state: 'Blocked' as const, waitingFor: 'PRINTER' as const };
    const b = { ...createProcess(2, { name: 'B', burstTime: 5, arrivalTime: 0, quantum: 2, memorySize: 16 }), state: 'Blocked' as const, waitingFor: 'HDD' as const };
    const free = { ...createProcess(3, { name: 'C', burstTime: 5, arrivalTime: 0, quantum: 2, memorySize: 16 }), state: 'Ready' as const };
    const m = detectDeadlockMatrix([a, b, free], resources);
    expect(m.available).toEqual([0, 0, 1, 1]); // Disco e Impresora ocupados; Pantalla y USB libres
    expect(m.deadlocked).toEqual([1, 2]);
    expect(m.rows.find((r) => r.pid === 1)!.request).toEqual([0, 1, 0, 0]);
  });

  it('sin espera circular, el algoritmo de matrices encuentra una secuencia segura', () => {
    const resources = createResources();
    resources.HDD.holder = 2;
    const a = { ...createProcess(1, { name: 'A', burstTime: 5, arrivalTime: 0, quantum: 2, memorySize: 16 }), state: 'Blocked' as const, waitingFor: 'HDD' as const };
    const b = { ...createProcess(2, { name: 'B', burstTime: 5, arrivalTime: 0, quantum: 2, memorySize: 16 }), state: 'Running' as const };
    const m = detectDeadlockMatrix([a, b], resources);
    expect(m.deadlocked).toEqual([]);
    expect(m.rows.every((r) => r.finish)).toBe(true);
  });

  it('una cadena de espera sin ciclo no es interbloqueo', () => {
    const resources = createResources();
    resources.HDD.holder = 2;
    const a = { ...createProcess(1, { name: 'A', burstTime: 5, arrivalTime: 0, quantum: 2, memorySize: 16 }), state: 'Blocked' as const, waitingFor: 'HDD' as const };
    const b = createProcess(2, { name: 'B', burstTime: 5, arrivalTime: 0, quantum: 2, memorySize: 16 });
    expect(detectDeadlock([a, b], resources)).toEqual([]);
  });
});

describe('escenario de interbloqueo', () => {
  it('A y B quedan en espera circular y se detecta', () => {
    let s = launchDeadlockScenario(createInitialState());
    s = run(s, 8);
    expect(s.deadlock).toEqual([1, 2]);
    expect(s.resources.HDD.holder).toBe(1);
    expect(s.resources.PRINTER.holder).toBe(2);
    expect(s.processes.every((p) => p.state === 'Blocked')).toBe(true);
    expect(s.events.some((e) => e.message.includes('DEADLOCK DETECTADO'))).toBe(true);
  });

  it.each([1, 2, 4, 8])('ocurre con %i núcleo(s) aunque otros procesos compitan por la CPU', (cores) => {
    let s = createInitialState({ cores });
    for (let i = 0; i < 5; i++) s = addProcess(s, { name: `bg${i}`, burstTime: 30, arrivalTime: 0, quantum: 3, memorySize: 32 });
    s = launchDeadlockScenario(s);
    s = run(s, 80); // con 1 núcleo, el segundo turno de A llega tras una vuelta completa de la cola
    expect(s.deadlock).toEqual([6, 7]);
  });

  it('también ocurre con otros procesos compitiendo por la CPU', () => {
    let s = createInitialState();
    for (let i = 0; i < 3; i++) s = addProcess(s, { name: `bg${i}`, burstTime: 30, arrivalTime: 0, quantum: 3, memorySize: 32 });
    s = launchDeadlockScenario(s);
    s = run(s, 30);
    expect(s.deadlock).toEqual([4, 5]);
  });

  it('la recuperación aborta una víctima y el otro proceso termina', () => {
    let s = run(launchDeadlockScenario(createInitialState()), 8);
    s = resolveDeadlock(s);
    expect(s.deadlock).toEqual([]);
    expect(s.processes[1].state).toBe('Terminated'); // víctima: la más joven (B)
    expect(s.resources.PRINTER.holder).toBe(1); // A recibe la Impresora
    s = run(s, 20);
    expect(s.processes[0].state).toBe('Terminated');
  });
});

describe('inanición y envejecimiento', () => {
  const victimWait = (aging: boolean) => {
    let s = createInitialState({ aging });
    s = launchStarvationScenario(s);
    let firstRun: number | null = null;
    for (let i = 0; i < 200 && firstRun === null; i++) {
      s = step(s, () => 0.5);
      if (s.processes[0].startTime !== null) firstRun = s.processes[0].startTime;
    }
    return { s, firstRun: firstRun ?? Infinity };
  };

  it('sin aging el proceso de baja prioridad se detecta en inanición', () => {
    let s = launchStarvationScenario(createInitialState({ aging: false }));
    s = run(s, STARVATION_THRESHOLD + 5);
    expect(s.starving).toContain(1);
    expect(s.processes[0].startTime).toBeNull();
  });

  it('con aging recibe CPU mucho antes', () => {
    const without = victimWait(false).firstRun;
    const withAging = victimWait(true).firstRun;
    expect(withAging).toBeLessThan(STARVATION_THRESHOLD);
    expect(without).toBeGreaterThan(withAging * 2);
  });
});
