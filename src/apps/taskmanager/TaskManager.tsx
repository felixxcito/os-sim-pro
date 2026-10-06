import { lazy, Suspense, useEffect, useState } from 'react';
import { Activity, Cpu, FlaskConical, MemoryStick, Network, ScrollText } from 'lucide-react';
import { ControlPanel } from '../../components/panels/ControlPanel';
import { EventLog } from '../../components/panels/EventLog';
import { MemoryMap } from '../../components/panels/MemoryMap';
import { ProcessMonitor } from '../../components/panels/ProcessMonitor';
import { ResourceManager } from '../../components/panels/ResourceManager';
import { AlertBanners } from '../../components/ui/AlertBanners';
import type { AppProps } from '../../os/shell/OsWindowFrame';

const AnalysisPanel = lazy(() => import('../../components/analysis/AnalysisPanel').then((m) => ({ default: m.AnalysisPanel })));

const TABS = [
  { id: 'processes', label: 'Procesos', icon: Cpu },
  { id: 'performance', label: 'Rendimiento', icon: Activity },
  { id: 'memory', label: 'Memoria', icon: MemoryStick },
  { id: 'resources', label: 'Recursos', icon: Network },
  { id: 'lab', label: 'Laboratorio', icon: FlaskConical },
  { id: 'log', label: 'Bitácora', icon: ScrollText },
] as const;

type Tab = (typeof TABS)[number]['id'];

/**
 * Administrador de tareas: la vista del núcleo simulado. Cada app abierta aparece aquí como
 * proceso; "Finalizar tarea" (✕) termina el proceso y cierra su ventana.
 */
export default function TaskManager({ win }: AppProps) {
  const [tab, setTab] = useState<Tab>((win.args.tab as Tab) ?? 'processes');
  useEffect(() => {
    if (win.args.tab) setTab(win.args.tab as Tab);
  }, [win.args.tab]);

  return (
    <div className="flex h-full">
      <nav className="flex w-40 shrink-0 flex-col gap-0.5 border-r border-gray-800 bg-gray-950/60 p-2" aria-label="Secciones">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs ${
                tab === t.id ? 'bg-fuchsia-500/15 text-fuchsia-200 shadow-[inset_2px_0_0_#ff00e5]' : 'text-gray-300 hover:bg-white/5'
              }`}
            >
              <Icon size={14} /> {t.label}
            </button>
          );
        })}
      </nav>
      <div className="relative min-w-0 flex-1 overflow-hidden">
        <div className="scrollbar-thin h-full overflow-auto">
          {tab === 'processes' && <ProcessMonitor />}
          {tab === 'performance' && (
            <Suspense fallback={null}>
              <AnalysisPanel />
            </Suspense>
          )}
          {tab === 'memory' && <MemoryMap />}
          {tab === 'resources' && <ResourceManager />}
          {tab === 'lab' && <ControlPanel />}
          {tab === 'log' && <EventLog />}
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-2">
          <AlertBanners compact />
        </div>
      </div>
    </div>
  );
}
