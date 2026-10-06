import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useSimStore } from '../../store/useSimStore';
import { memoryStats } from '../../engine/memory';
import { Empty } from './GanttChart';

/** Paleta categórica validada (CVD y contraste) sobre la superficie oscura, en orden fijo. */
export const SERIES = { s1: '#0891b2', s2: '#8b5cf6', s3: '#ec4899', neutral: '#4b5563' };
const SURFACE = '#0b1120';
const AXIS = { stroke: '#4b5563', tick: { fill: '#9ca3af', fontSize: 10 }, tickLine: false };
const TOOLTIP = {
  contentStyle: { background: '#030712', border: '1px solid #1f2937', borderRadius: 8, fontSize: 11 },
  labelStyle: { color: '#e5e7eb' },
  itemStyle: { color: '#d1d5db' },
  cursor: { fill: 'rgb(255 255 255 / 0.04)', stroke: '#6b7280' },
};
const LEGEND = { wrapperStyle: { fontSize: 11, color: '#9ca3af' }, iconSize: 10 };

/** Gráfico 1: tiempo de ejecución, espera y bloqueo por proceso (barras horizontales apiladas). */
export function ProcessActivityChart() {
  const processes = useSimStore((s) => s.sim.processes);
  const tick = useSimStore((s) => s.sim.tick);
  const data = useMemo(
    () =>
      processes
        .filter((p) => p.arrivalTime <= tick)
        .slice(-16)
        .map((p) => ({ name: `P${p.pid} ${p.name}`, Ejecución: p.executedTime, Espera: p.waitingTime, Bloqueado: p.blockedTime })),
    [processes, tick],
  );
  if (tick === 0) return <Empty text="Aún no hay actividad que comparar." />;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }} barCategoryGap={3}>
        <CartesianGrid horizontal={false} stroke="#1f2937" />
        <XAxis type="number" {...AXIS} allowDecimals={false} label={{ value: 'ticks', position: 'insideBottomRight', fill: '#6b7280', fontSize: 10, offset: -2 }} />
        <YAxis type="category" dataKey="name" width={110} {...AXIS} interval={0} />
        <Tooltip {...TOOLTIP} />
        <Legend {...LEGEND} />
        <Bar dataKey="Ejecución" stackId="t" fill={SERIES.s1} stroke={SURFACE} strokeWidth={2} isAnimationActive={false} />
        <Bar dataKey="Espera" stackId="t" fill={SERIES.s2} stroke={SURFACE} strokeWidth={2} isAnimationActive={false} />
        <Bar dataKey="Bloqueado" stackId="t" fill={SERIES.s3} stroke={SURFACE} strokeWidth={2} radius={[0, 4, 4, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Gráfico 2a: % de CPU y de RAM ocupada/fragmentada a lo largo del tiempo (misma escala 0–100 %). */
export function UsageOverTime() {
  const history = useSimStore((s) => s.sim.history);
  if (history.length < 2) return <Empty text="Ejecuta algunos ticks para ver la evolución." />;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={history} margin={{ top: 8, right: 16, bottom: 4, left: -8 }}>
        <CartesianGrid vertical={false} stroke="#1f2937" />
        <XAxis dataKey="tick" {...AXIS} minTickGap={24} />
        <YAxis domain={[0, 100]} unit="%" {...AXIS} width={44} />
        <Tooltip {...TOOLTIP} labelFormatter={(t) => `Tick ${t}`} formatter={(v) => `${v}%`} />
        <Legend {...LEGEND} />
        <Line type="monotone" dataKey="cpu" name="CPU (media 10 ticks)" stroke={SERIES.s1} strokeWidth={2} dot={false} isAnimationActive={false} />
        <Line type="monotone" dataKey="memUsed" name="RAM ocupada" stroke={SERIES.s2} strokeWidth={2} dot={false} isAnimationActive={false} />
        <Line type="monotone" dataKey="memFragmented" name="RAM fragmentada" stroke={SERIES.s3} strokeWidth={2} strokeDasharray="5 3" dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Gráfico 2b: donas con la distribución actual de la RAM y el uso acumulado de la CPU. */
export function ResourceDonuts() {
  const sim = useSimStore((s) => s.sim);
  const mem = memoryStats(sim.memory);
  const memData = [
    { name: 'Ocupada', value: mem.used, color: SERIES.s1 },
    { name: 'Fragmentada', value: mem.fragmented, color: SERIES.s3 },
    { name: 'Libre contigua', value: mem.largestHole, color: SERIES.neutral },
  ];
  const cpuData = [
    { name: 'Ejecutando', value: sim.busyTicks, color: SERIES.s1 },
    { name: 'Cambio de contexto', value: sim.overheadTicks, color: SERIES.s2 },
    { name: 'Ociosa', value: sim.idleTicks, color: SERIES.neutral },
  ];

  return (
    <div className="grid h-full grid-cols-1 gap-2 sm:grid-cols-2">
      <Donut title="Memoria RAM (MB)" data={memData} center={`${Math.round((mem.used / mem.total) * 100)}%`} sub="ocupada" />
      <Donut
        title="CPU acumulada (ticks)"
        data={cpuData}
        center={sim.tick ? `${Math.round((sim.busyTicks / Math.max(1, sim.busyTicks + sim.idleTicks + sim.overheadTicks)) * 100)}%` : '—'}
        sub="utilización"
      />
    </div>
  );
}

function Donut({ title, data, center, sub }: { title: string; data: { name: string; value: number; color: string }[]; center: string; sub: string }) {
  const empty = data.every((d) => d.value === 0);
  return (
    <div className="flex min-h-[200px] flex-col rounded-lg border border-gray-800 bg-gray-950/50 p-2">
      <div className="text-[11px] font-semibold text-gray-300">{title}</div>
      <div className="relative flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={empty ? [{ name: 'Sin datos', value: 1, color: '#1f2937' }] : data}
              dataKey="value"
              nameKey="name"
              innerRadius="58%"
              outerRadius="82%"
              paddingAngle={0}
              stroke={SURFACE}
              strokeWidth={2}
              isAnimationActive={false}
            >
              {(empty ? [{ color: '#1f2937' }] : data).map((d, i) => (
                <Cell key={i} fill={d.color} />
              ))}
            </Pie>
            {!empty && <Tooltip {...TOOLTIP} />}
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono text-lg font-bold text-gray-100">{center}</span>
          <span className="text-[10px] text-gray-500">{sub}</span>
        </div>
      </div>
      <ul className="flex flex-wrap justify-center gap-x-3 gap-y-0.5 text-[10px] text-gray-400">
        {data.map((d) => (
          <li key={d.name} className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm" style={{ background: d.color }} />
            {d.name} <span className="font-mono text-gray-300">{d.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Tabla clásica de planificación: llegada, inicio, fin, retorno y espera de cada proceso. */
export function ProcessTable() {
  const processes = useSimStore((s) => s.sim.processes);
  return (
    <div className="scrollbar-thin h-full overflow-auto">
      <table className="w-full min-w-[560px] text-left font-mono text-[11px]">
        <thead className="sticky top-0 bg-gray-950 text-[10px] uppercase tracking-wider text-gray-500">
          <tr>
            {['PID', 'Proceso', 'Llegada', 'Ráfaga', 'Inicio', 'Fin', 'Retorno', 'Espera', 'Bloqueado', 'Respuesta'].map((h) => (
              <th key={h} className="px-2 py-1.5 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="text-gray-300">
          {processes.map((p) => (
            <tr key={p.pid} className="border-b border-gray-800/60">
              <td className="px-2 py-1" style={{ color: p.color }}>
                P{p.pid}
              </td>
              <td className="px-2 py-1 font-sans">{p.name}</td>
              <td className="px-2 py-1">{p.arrivalTime}</td>
              <td className="px-2 py-1">{p.burstTime}</td>
              <td className="px-2 py-1">{p.startTime ?? '—'}</td>
              <td className="px-2 py-1">{p.finishTime ?? '—'}</td>
              <td className="px-2 py-1">{p.finishTime !== null ? p.finishTime - p.arrivalTime : '—'}</td>
              <td className="px-2 py-1">{p.waitingTime}</td>
              <td className="px-2 py-1">{p.blockedTime}</td>
              <td className="px-2 py-1">{p.startTime !== null ? p.startTime - p.arrivalTime : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
