import type { ResourceId, SimConfig } from '../types';

export const TOTAL_MEMORY = 4096; // MB (4 GB)
export const KERNEL_SIZE = 256; // MB reservados al núcleo
export const DEFAULT_CORES = 4;
export const STARVATION_THRESHOLD = 25; // ticks esperando sin CPU
export const HISTORY_LIMIT = 240;
export const GANTT_LIMIT = 400;
export const EVENT_LIMIT = 300;
export const TERMINATED_LIMIT = 80; // procesos terminados que se conservan para estadísticas
export const CPU_WINDOW = 10; // ticks para la media móvil de CPU

export const RESOURCE_NAMES: Record<ResourceId, string> = {
  HDD: 'Disco duro',
  PRINTER: 'Impresora',
  SCREEN: 'Pantalla',
  USB: 'Puerto USB',
};

export const RESOURCE_IDS = Object.keys(RESOURCE_NAMES) as ResourceId[];

/**
 * Dispositivos de E/S que usan los procesos de carga aleatorios. El Disco y la Impresora
 * quedan para el escenario de interbloqueo, las descargas y la impresión, de modo que la
 * espera circular Disco ↔ Impresora se reproduzca siempre igual.
 */
export const IO_DEVICES: ResourceId[] = ['SCREEN', 'USB'];

export const DEFAULT_CONFIG: SimConfig = {
  quantum: 3,
  strategy: 'first-fit',
  policy: 'RR',
  aging: false,
  agingInterval: 2,
  contextSwitchCost: 0,
  cores: DEFAULT_CORES,
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
