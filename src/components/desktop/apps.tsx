import type { ComponentType } from 'react';
import { BarChart3, Cpu, MemoryStick, Network, SlidersHorizontal, Terminal, type LucideIcon } from 'lucide-react';
import type { AppId } from '../../store/useWindowStore';
import { ControlPanel } from '../panels/ControlPanel';
import { ProcessMonitor } from '../panels/ProcessMonitor';
import { MemoryMap } from '../panels/MemoryMap';
import { ResourceManager } from '../panels/ResourceManager';
import { EventLog } from '../panels/EventLog';
import { AnalysisPanel } from '../analysis/AnalysisPanel';

export interface AppDef {
  id: AppId;
  title: string;
  short: string;
  glyph: LucideIcon;
  accent: string;
  component: ComponentType;
}

/** Aplicaciones del escritorio. Todas usan la foto como icono; el glifo y el color las distinguen. */
export const APPS: Record<AppId, AppDef> = {
  control: { id: 'control', title: 'Panel de Control', short: 'Control', glyph: SlidersHorizontal, accent: '#39ff14', component: ControlPanel },
  processes: { id: 'processes', title: 'Monitor de Procesos', short: 'Procesos', glyph: Cpu, accent: '#00e5ff', component: ProcessMonitor },
  memory: { id: 'memory', title: 'Mapa de Memoria RAM', short: 'Memoria', glyph: MemoryStick, accent: '#ff00e5', component: MemoryMap },
  resources: { id: 'resources', title: 'Gestor de Recursos', short: 'Recursos', glyph: Network, accent: '#ffb300', component: ResourceManager },
  analysis: { id: 'analysis', title: 'Análisis y Estadísticas', short: 'Análisis', glyph: BarChart3, accent: '#7c4dff', component: AnalysisPanel },
  log: { id: 'log', title: 'Bitácora del Kernel', short: 'Terminal', glyph: Terminal, accent: '#64ffda', component: EventLog },
};
