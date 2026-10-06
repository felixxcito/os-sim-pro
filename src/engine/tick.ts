import type { Rng, SimState } from '../types';
import { Kernel } from './kernel';

/**
 * Un tick del reloj del sistema. Orden de evaluación:
 *  1. Avanza el reloj.
 *  2. Admisión: procesos nuevos que caben en RAM pasan a Listos.
 *  3. E/S: operaciones en curso avanzan; las que terminan desbloquean procesos.
 *  4. CPU: Round Robin (despacho, cambio de contexto, ejecución, quantum).
 *  5. Contabilidad de espera y envejecimiento.
 *  6. Historial para los gráficos.
 */
export function step(state: SimState, _rng: Rng = Math.random): SimState {
  const k = new Kernel(state);
  k.tick++;
  k.admitArrivals();
  k.progressIO();
  k.runCpu();
  k.accountWaiting();
  k.recordHistory();
  return k.toState();
}
