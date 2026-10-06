import { useMemo, useState } from 'react';
import { useSimStore } from '../../store/useSimStore';

const WINDOW = 60;

/**
 * Diagrama de Gantt de la CPU: una fila por proceso, una columna por tick.
 * Cada celda indica qué proceso ocupó la CPU; la última fila muestra ocio y cambios de contexto.
 */
export function GanttChart() {
  const gantt = useSimStore((s) => s.sim.gantt);
  const processes = useSimStore((s) => s.sim.processes);
  const [hover, setHover] = useState<string | null>(null);
  const slots = gantt.slice(-WINDOW);
  const byPid = useMemo(() => new Map(processes.map((p) => [p.pid, p])), [processes]);
  const pids = [...new Set(slots.flatMap((g) => g.cores.map((c) => c.pid)).filter((p): p is number => p !== null))].sort((a, b) => a - b);
  const coreCount = slots[slots.length - 1]?.cores.length ?? 1;

  if (slots.length === 0) {
    return <Empty text="Inicia la simulación (Play o Paso) para construir el diagrama de Gantt." />;
  }

  const first = slots[0].tick;
  const cols = `64px repeat(${WINDOW}, minmax(0, 1fr))`;

  return (
    <div className="flex h-full flex-col">
      <div className="scrollbar-thin flex-1 overflow-auto">
        <div className="min-w-[560px] space-y-[2px]">
          {pids.map((pid) => {
            const p = byPid.get(pid);
            return (
              <div key={pid} className="grid items-center gap-[2px]" style={{ gridTemplateColumns: cols }}>
                <span className="truncate pr-1 font-mono text-[10px] text-gray-400" title={p?.name}>
                  P{pid} <span className="text-gray-600">{p?.name}</span>
                </span>
                {Array.from({ length: WINDOW }, (_, i) => {
                  const slot = slots[i];
                  const core = slot?.cores.findIndex((c) => c.pid === pid) ?? -1;
                  const on = core !== -1;
                  return (
                    <span
                      key={i}
                      className="h-3.5 rounded-[2px]"
                      style={{ background: on ? p?.color : 'rgb(31 41 55 / 0.35)', boxShadow: on ? `0 0 4px ${p?.color}88` : undefined }}
                      onMouseEnter={() => on && setHover(`t=${slot.tick} · P${pid} ${p?.name ?? ''} · CPU${core}`)}
                      onMouseLeave={() => setHover(null)}
                    />
                  );
                })}
              </div>
            );
          })}
          {Array.from({ length: coreCount }, (_, core) => (
            <div key={core} className={`grid items-center gap-[2px] ${core === 0 ? 'pt-1' : ''}`} style={{ gridTemplateColumns: cols }}>
              <span className="font-mono text-[10px] text-gray-500">CPU{core}</span>
              {Array.from({ length: WINDOW }, (_, i) => {
                const c = slots[i]?.cores[core];
                const proc = c?.pid != null ? byPid.get(c.pid) : undefined;
                const kind = !c ? 'none' : c.switching ? 'cs' : c.pid === null ? 'idle' : 'busy';
                return (
                  <span
                    key={i}
                    className={`h-2 rounded-[2px] ${kind === 'cs' ? 'fragment' : ''}`}
                    style={{ background: kind === 'busy' ? (proc?.color ?? '#0891b2') : kind === 'idle' ? '#374151' : kind === 'none' ? 'transparent' : undefined }}
                    onMouseEnter={() =>
                      c && setHover(`t=${slots[i].tick} · CPU${core}: ${kind === 'cs' ? 'cambio de contexto' : kind === 'idle' ? 'ociosa' : `P${c.pid} ${proc?.name ?? ''}`}`)
                    }
                    onMouseLeave={() => setHover(null)}
                  />
                );
              })}
            </div>
          ))}
          <div className="grid gap-[2px] font-mono text-[9px] text-gray-600" style={{ gridTemplateColumns: cols }}>
            <span />
            {Array.from({ length: WINDOW }, (_, i) => (
              <span key={i} className="text-center">
                {(first + i) % 10 === 0 ? first + i : ''}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="flex h-5 items-center justify-between text-[10px] text-gray-500">
        <span>{hover ?? `Últimos ${WINDOW} ticks · pasa el ratón por una celda`}</span>
        <span className="flex gap-3">
          <Key className="bg-[#0891b2]" label="Ocupada (color del proceso)" />
          <Key className="bg-gray-700" label="Ociosa" />
          <Key className="fragment" label="Cambio de contexto" />
        </span>
      </div>
    </div>
  );
}

function Key({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`h-2 w-3 rounded-[2px] ${className}`} />
      {label}
    </span>
  );
}

export function Empty({ text }: { text: string }) {
  return <div className="flex h-full items-center justify-center text-center text-xs text-gray-500">{text}</div>;
}
