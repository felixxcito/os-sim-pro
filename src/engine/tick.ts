import type { Rng, SimState } from '../types';
import { Kernel } from './kernel';

/**
 * Un tick del reloj del sistema. Orden de evaluación:
 *  1. Avanza el reloj.
 *  2. Generador de carga del escenario de inanición (si está activo).
 *     Admisión: procesos nuevos que caben en RAM pasan a Listos.
 *  3. E/S: operaciones en curso avanzan; las que terminan desbloquean procesos.
 *  4. CPU: Round Robin (despacho, cambio de contexto, ejecución, quantum).
 *  5. Contabilidad de espera y envejecimiento.
 *  6. Detección de interbloqueo (grafo de espera) e inanición.
 *  7. Historial para los gráficos.
 */
export function step(state: SimState, rng: Rng = Math.random): SimState {
  const k = new Kernel(state);
  k.tick++;
  k.generateFlood(rng);
  k.backgroundWork(rng);
  k.admitArrivals();
  k.progressIO();
  k.runCpu();
  k.accountWaiting();
  k.detectDeadlock();
  k.detectStarvation();
  k.recordHistory();
  return k.toState();
}
