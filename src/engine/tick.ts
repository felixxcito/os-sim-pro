import type { Rng, SimState } from '../types';

/** Avanza el reloj del sistema un tick. (La lógica completa se integra en la fase 2.) */
export function step(state: SimState, _rng: Rng = Math.random): SimState {
  return { ...state, tick: state.tick + 1 };
}
