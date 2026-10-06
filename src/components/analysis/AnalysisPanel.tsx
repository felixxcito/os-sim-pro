import { useMemo, useState } from 'react';
import { useSimStore } from '../../store/useSimStore';
import { Segmented, Stat } from '../ui/primitives';
import { GanttChart } from './GanttChart';
import { ProcessActivityChart, ProcessTable, ResourceDonuts, UsageOverTime } from './ResourceCharts';

type Tab = 'gantt' | 'activity' | 'usage' | 'donut' | 'table';

export function AnalysisPanel() {
  const sim = useSimStore((s) => s.sim);
  const [tab, setTab] = useState<Tab>('gantt');

  const kpis = useMemo(() => {
    const done = sim.processes.filter((p) => p.state === 'Terminated' && p.finishTime !== null);
    const avg = (xs: number[]) => (xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1) : '—');
    const total = sim.busyTicks + sim.idleTicks + sim.overheadTicks;
    return {
      wait: avg(done.map((p) => p.waitingTime)),
      turnaround: avg(done.map((p) => p.finishTime! - p.arrivalTime)),
      throughput: sim.tick ? ((done.length / sim.tick) * 10).toFixed(2) : '—',
      cpu: total ? `${Math.round((sim.busyTicks / total) * 100)}%` : '—',
      done: done.length,
    };
  }, [sim]);

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
