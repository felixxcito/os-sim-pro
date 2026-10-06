import { useMemo, useState } from 'react';
import { AlertTriangle, Hourglass, Lock, X } from 'lucide-react';
import { useSimStore } from '../../store/useSimStore';
import type { Process, ProcessState } from '../../types';
import { ProgressBar, Segmented, StateBadge, STATE_STYLES } from '../ui/primitives';

type Filter = 'active' | 'all' | 'done';

const ORDER: Record<ProcessState, number> = { Running: 0, Ready: 1, Blocked: 2, New: 3, Terminated: 4 };

export function ProcessMonitor() {
  const sim = useSimStore((s) => s.sim);
  const kill = useSimStore((s) => s.kill);
  const [filter, setFilter] = useState<Filter>('active');

  const counts = useMemo(() => {
    const c: Record<ProcessState, number> = { New: 0, Ready: 0, Running: 0, Blocked: 0, Terminated: 0 };
    sim.processes.forEach((p) => c[p.state]++);
    return c;
  }, [sim.processes]);

  const rows = useMemo(() => {
    const list = sim.processes.filter((p) =>
      filter === 'all' ? true : filter === 'done' ? p.state === 'Terminated' : p.state !== 'Terminated',
    );
    return [...list].sort((a, b) => ORDER[a.state] - ORDER[b.state] || a.pid - b.pid);
  }, [sim.processes, filter]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-800 px-3 py-2">
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(counts) as ProcessState[]).map((s) => (
            <span key={s} className="inline-flex items-center gap-1 rounded-md bg-gray-900 px-1.5 py-0.5 text-[10px] text-gray-400">
              <span className={`h-1.5 w-1.5 rounded-full ${STATE_STYLES[s].dot}`} />
              {STATE_STYLES[s].label} <b className="font-mono text-gray-200">{counts[s]}</b>
            </span>
          ))}
        </div>
        <Segmented
          label="Filtro de procesos"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'active', label: 'Activos' },
            { value: 'done', label: 'Terminados' },
            { value: 'all', label: 'Todos' },
          ]}
        />
      </div>

      <div className="scrollbar-thin flex-1 overflow-auto">
        <table className="w-full min-w-[720px] text-left text-xs">
          <thead className="sticky top-0 z-10 bg-gray-950/95 text-[10px] uppercase tracking-wider text-gray-500 backdrop-blur">
            <tr>
              <th className="px-3 py-2 font-medium">PID</th>
              <th className="px-2 py-2 font-medium">Proceso</th>
              <th className="px-2 py-2 font-medium">Estado</th>
              <th className="px-2 py-2 font-medium" title="Prioridad base → efectiva (aging)">Prio.</th>
              <th className="px-2 py-2 font-medium">Quantum</th>
              <th className="w-36 px-2 py-2 font-medium">Progreso</th>
              <th className="px-2 py-2 font-medium">RAM</th>
              <th className="px-2 py-2 font-medium">Recursos</th>
              <th className="px-2 py-2 text-right font-medium">Espera</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <ProcessRow
                key={p.pid}
                p={p}
                deadlocked={sim.deadlock.includes(p.pid)}
                starving={sim.starving.includes(p.pid)}
                future={p.state === 'New' && p.arrivalTime > sim.tick}
                onKill={() => kill(p.pid)}
              />
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={10} className="px-3 py-8 text-center text-gray-500">
                  No hay procesos en esta vista.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ProcessRow({
  p,
  deadlocked,
  starving,
  future,
  onKill,
}: {
  p: Process;
  deadlocked: boolean;
  starving: boolean;
  future: boolean;
  onKill: () => void;
}) {
  const highlight = deadlocked
    ? 'bg-red-500/10 shadow-[inset_3px_0_0_#ff3b3b]'
    : starving
      ? 'bg-amber-400/10 shadow-[inset_3px_0_0_#ffb300]'
      : p.state === 'Running'
        ? 'bg-green-400/10 shadow-[inset_3px_0_0_#39ff14]'
        : '';

  return (
    <tr className={`border-b border-gray-800/60 transition-colors hover:bg-white/[0.03] ${highlight} ${p.state === 'Terminated' ? 'opacity-55' : ''}`}>
      <td className="px-3 py-1.5 font-mono">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: p.color, boxShadow: `0 0 6px ${p.color}` }} />
          {p.pid}
        </span>
      </td>
      <td className="max-w-[180px] truncate px-2 py-1.5 text-gray-200" title={p.name}>
        {p.name}
        {p.kind !== 'user' && (
          <span className={`ml-1 rounded px-1 py-px text-[9px] font-semibold uppercase ${p.kind === 'app' ? 'bg-cyan-400/15 text-cyan-300' : 'bg-gray-700/60 text-gray-400'}`}>
            {p.kind === 'app' ? 'app' : 'sistema'}
          </span>
        )}
        {deadlocked && <Lock size={11} className="ml-1 inline text-red-400" aria-label="En interbloqueo" />}
        {starving && <Hourglass size={11} className="ml-1 inline text-amber-300" aria-label="En inanición" />}
      </td>
      <td className="px-2 py-1.5">
        <StateBadge state={p.state} />
        {future && <span className="ml-1 text-[10px] text-gray-500">llega t={p.arrivalTime}</span>}
        {p.awaitingInput && <span className="ml-1 text-[10px] text-gray-500">esperando usuario</span>}
      </td>
      <td className="px-2 py-1.5 font-mono">
        {p.priority}
        {p.effectivePriority !== p.priority && p.state !== 'Terminated' && <span className="text-green-300"> →{p.effectivePriority}</span>}
      </td>
      <td className="px-2 py-1.5">
        <div className="flex gap-0.5" aria-label={`Quantum restante ${p.quantumLeft} de ${p.quantum}`}>
          {Array.from({ length: p.quantum }, (_, i) => (
            <span
              key={i}
              className={`h-2.5 w-1.5 rounded-[2px] ${
                p.state === 'Running' && i < p.quantumLeft ? 'bg-cyan-300 shadow-[0_0_4px_#00e5ff]' : i < p.quantumLeft ? 'bg-cyan-900' : 'bg-gray-800'
              }`}
            />
          ))}
        </div>
      </td>
      <td className="px-2 py-1.5">
        <div className="flex items-center gap-2">
          <ProgressBar value={p.executedTime} max={p.burstTime} color={p.color} />
          <span className="w-10 shrink-0 text-right font-mono text-[10px] text-gray-400">
            {p.executedTime}/{p.burstTime}
          </span>
        </div>
      </td>
      <td className="whitespace-nowrap px-2 py-1.5 font-mono text-[11px] text-gray-400">
        {p.memorySize}
        <span className="text-gray-600">MB</span>
        {p.memoryBase !== null && <span className="text-gray-600"> @{p.memoryBase}</span>}
      </td>
      <td className="whitespace-nowrap px-2 py-1.5 text-[10px]">
        {p.heldResources.map((r) => (
          <span key={r} className="mr-1 rounded bg-cyan-400/10 px-1 py-0.5 font-mono text-cyan-300">
            {r}
          </span>
        ))}
        {p.waitingFor && (
          <span className="inline-flex items-center gap-0.5 rounded bg-red-500/15 px-1 py-0.5 font-mono text-red-300">
            <AlertTriangle size={9} /> {p.waitingFor}
          </span>
        )}
        {p.ioRemaining > 0 && <span className="font-mono text-amber-300">E/S {p.ioRemaining}t</span>}
        {!p.heldResources.length && !p.waitingFor && p.ioRemaining === 0 && <span className="text-gray-600">—</span>}
      </td>
      <td className={`px-2 py-1.5 text-right font-mono ${starving ? 'text-amber-300' : 'text-gray-400'}`}>{p.waitingTime}</td>
      <td className="px-2 py-1.5 text-right">
        {p.state !== 'Terminated' && (
          <button
            type="button"
            onClick={onKill}
            className="rounded p-0.5 text-gray-500 hover:bg-red-500/20 hover:text-red-300"
            aria-label={`Terminar P${p.pid}`}
            title="Finalizar tarea (kill)"
          >
            <X size={12} />
          </button>
        )}
      </td>
    </tr>
  );
}
