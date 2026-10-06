import { describe, expect, it } from 'vitest';
import { addWork, killProcess } from '../../src/engine/actions';
import { createInitialState, createOsState, spawnProcess, SYSTEM_SERVICES } from '../../src/engine/state';
import { step } from '../../src/engine/tick';
import type { SimState } from '../../src/types';

const run = (s: SimState, ticks: number, rng = () => 0.99) => {
  for (let i = 0; i < ticks; i++) s = step(s, rng);
  return s;
};

const openApp = (s: SimState, memorySize = 128) =>
  spawnProcess(s, { name: 'Escritor', burstTime: 3, arrivalTime: s.tick, quantum: 3, memorySize, kind: 'app', interactive: true });

describe('procesos interactivos (aplicaciones)', () => {
  it('al agotar su trabajo se bloquean esperando al usuario, sin terminar', () => {
    const { state, pid } = openApp(createInitialState());
    const s = run(state, 6);
    const p = s.processes.find((x) => x.pid === pid)!;
    expect(p.state).toBe('Blocked');
    expect(p.awaitingInput).toBe(true);
    expect(p.memoryBase).not.toBeNull(); // sigue ocupando memoria
    expect(p.blockedTime).toBe(0); // esperar al usuario no cuenta como bloqueo por E/S
  });

  it('la interacción del usuario añade CPU y lo devuelve a la cola de listos', () => {
    let { state: s, pid } = openApp(createInitialState());
    s = run(s, 6);
    s = addWork(s, pid, 2);
    let p = s.processes.find((x) => x.pid === pid)!;
    expect(p.state).toBe('Ready');
    expect(s.readyQueue).toContain(pid);
    s = run(s, 2);
    p = s.processes.find((x) => x.pid === pid)!;
    expect(p.executedTime).toBe(5);
    expect(p.awaitingInput).toBe(true);
  });

  it('el trabajo acumulado está acotado', () => {
    let { state: s, pid } = openApp(createInitialState());
    s = run(s, 6);
    for (let i = 0; i < 50; i++) s = addWork(s, pid, 1);
    expect(s.processes.find((x) => x.pid === pid)!.remainingTime).toBe(8);
  });

  it('cerrar la ventana termina el proceso y libera su memoria', () => {
    let { state: s, pid } = openApp(createInitialState());
    s = run(s, 2);
    s = killProcess(s, pid, 'ventana cerrada');
    expect(s.processes.find((x) => x.pid === pid)!.state).toBe('Terminated');
    expect(s.memory.some((b) => b.pid === pid)).toBe(false);
  });

  it('una app que no cabe en memoria espera en estado Nuevo', () => {
    let { state: s } = openApp(createInitialState(), 800);
    const big = openApp(s, 512);
    s = run(big.state, 3);
    expect(s.processes.find((x) => x.pid === big.pid)!.state).toBe('New');
  });
});

describe('arranque del SO', () => {
  it('inicia los servicios del sistema y los mantiene vivos', () => {
    const s = run(createOsState(), 40, () => 0.05);
    const services = s.processes.filter((p) => p.kind === 'system');
    expect(services).toHaveLength(SYSTEM_SERVICES.length);
    expect(services.every((p) => p.state !== 'Terminated')).toBe(true);
    expect(s.busyTicks).toBeGreaterThan(10); // el trabajo de fondo genera carga de CPU
  });
});
