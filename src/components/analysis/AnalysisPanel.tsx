import { useState } from 'react';
import { useOS } from '../../store/useOS';
import { Segmented, Stat } from '../ui/primitives';
import { GanttChart } from './GanttChart';
import { ProcessActivityChart, ProcessTable, ResourceDonuts, UsageOverTime } from './ResourceCharts';

type Tab = 'gantt' | 'activity' | 'usage' | 'donut' | 'table';

export function AnalysisPanel() {
  const { metrics } = useOS();
  const [tab, setTab] = useState<Tab>('gantt');
  const fmt = (v: number | null) => (v === null ? '—' : v.toFixed(1));
  const kpis = {
    wait: fmt(metrics.avgWaiting),
    turnaround: fmt(metrics.avgTurnaround),
    throughput: metrics.tick ? (metrics.throughput * 10).toFixed(2) : '—',
    cpu: metrics.tick ? `${Math.round(metrics.cpuUtilization * 100)}%` : '—',
  };

  return (
    <div className="flex h-full flex-col gap-2 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmented
          label="Gráfico"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'gantt', label: 'Gantt' },
            { value: 'activity', label: 'Espera vs ejecución' },
            { value: 'usage', label: 'Uso en el tiempo' },
            { value: 'donut', label: 'Distribución' },
            { value: 'table', label: 'Tabla' },
          ]}
        />
        <div className="flex gap-1.5">
          <Stat label="Espera media" value={kpis.wait} tone="text-cyan-300" />
          <Stat label="Retorno medio" value={kpis.turnaround} tone="text-cyan-300" />
          <Stat label="Throughput /10t" value={kpis.throughput} />
          <Stat label="Uso CPU" value={kpis.cpu} tone="text-green-300" />
        </div>
      </div>
      <div className="min-h-[220px] flex-1">
        {tab === 'gantt' && <GanttChart />}
        {tab === 'activity' && <ProcessActivityChart />}
        {tab === 'usage' && <UsageOverTime />}
        {tab === 'donut' && <ResourceDonuts />}
        {tab === 'table' && <ProcessTable />}
      </div>
    </div>
  );
}
