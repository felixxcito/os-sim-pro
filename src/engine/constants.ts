import type { ResourceId, SimConfig } from '../types';

export const TOTAL_MEMORY = 1024; // MB
export const KERNEL_SIZE = 128; // MB reservados al núcleo
export const STARVATION_THRESHOLD = 25; // ticks esperando sin CPU
export const HISTORY_LIMIT = 240;
export const GANTT_LIMIT = 400;
export const EVENT_LIMIT = 300;
export const TERMINATED_LIMIT = 80; // procesos terminados que se conservan para estadísticas
export const CPU_WINDOW = 10; // ticks para la media móvil de CPU

export const RESOURCE_NAMES: Record<ResourceId, string> = {
  HDD: 'Disco HDD',
  PRINTER: 'Impresora (E/S)',
  USB: 'Puerto USB (E/S)',
  R1: 'R1 · Unidad de cinta',
  R2: 'R2 · Escáner',
};

export const RESOURCE_IDS = Object.keys(RESOURCE_NAMES) as ResourceId[];

/** Dispositivos que usan los procesos aleatorios (R1/R2 se reservan al escenario de interbloqueo). */
export const IO_DEVICES: ResourceId[] = ['HDD', 'PRINTER', 'USB'];

export const DEFAULT_CONFIG: SimConfig = {
  quantum: 3,
  strategy: 'first-fit',
  policy: 'RR',
  aging: false,
  agingInterval: 2,
  contextSwitchCost: 0,
};

export const PROCESS_COLORS = [
  '#00e5ff',
  '#39ff14',
  '#ff00e5',
  '#ffb300',
  '#7c4dff',
  '#00ffa3',
  '#ff6e40',
  '#40c4ff',
  '#eeff41',
  '#ff4081',
  '#64ffda',
  '#b388ff',
];

export const colorFor = (pid: number) => PROCESS_COLORS[pid % PROCESS_COLORS.length];
