import { useMemo } from 'react';
import { Cpu, Disc3, HardDrive, Printer, ScanLine, Usb, type LucideIcon } from 'lucide-react';
import { useSimStore } from '../../store/useSimStore';
import { RESOURCE_IDS } from '../../engine/constants';
import { waitForGraph } from '../../engine/deadlock';
import type { Process, ResourceId } from '../../types';
import { ProgressBar, SectionTitle } from '../ui/primitives';

const ICONS: Record<ResourceId, LucideIcon> = { HDD: HardDrive, PRINTER: Printer, USB: Usb, R1: Disc3, R2: ScanLine };

export function ResourceManager() {
  const sim = useSimStore((s) => s.sim);
  const byPid = useMemo(() => new Map(sim.processes.map((p) => [p.pid, p])), [sim.processes]);
  const running = sim.running !== null ? byPid.get(sim.running) : undefined;
  const totalTicks = sim.busyTicks + sim.idleTicks + sim.overheadTicks;
  const utilization = totalTicks ? Math.round((sim.busyTicks / totalTicks) * 100) : 0;
  const lastSlot = sim.gantt[sim.gantt.length - 1];

  return (
    <div className="space-y-3 p-3">
      <div className={`rounded-xl border p-3 ${running ? 'border-green-400/40 bg-green-400/5' : 'border-gray-700 bg-gray-900/60'}`}>
        <div className="flex items-center gap-3">
          <div className={`rounded-lg p-2 ${running ? 'bg-green-400/15 text-[#39ff14]' : 'bg-gray-800 text-gray-500'}`}>
            <Cpu size={22} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-200">CPU</span>
              <span className={`font-mono text-[11px] ${running ? 'text-green-300' : 'text-gray-500'}`}>
                {lastSlot?.switching ? 'CAMBIO DE CONTEXTO' : running ? `Ocupada · P${running.pid}` : 'Libre (ociosa)'}
              </span>
            </div>
            {running ? (
              <>
                <div className="truncate text-[11px] text-gray-400">
                  {running.name} · quantum {running.quantumLeft}/{running.quantum}
                </div>
                <div className="mt-1">
                  <ProgressBar value={running.executedTime} max={running.burstTime} color={running.color} />
                </div>
              </>
            ) : (
              <div className="text-[11px] text-gray-500">Sin proceso en ejecución</div>
            )}
          </div>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2 text-center font-mono text-[10px] text-gray-400">
          <div>
            <div className="text-sm text-cyan-300">{utilization}%</div>uso total
          </div>
          <div>
            <div className="text-sm text-cyan-300">{sim.contextSwitches}</div>cambios ctx
          </div>
          <div>
            <div className="text-sm text-cyan-300">{sim.overheadTicks}</div>ticks overhead
          </div>
        </div>
      </div>

      <div>
        <SectionTitle>Cola de listos (Round Robin)</SectionTitle>
        <div className="flex min-h-7 flex-wrap items-center gap-1">
          {sim.readyQueue.length === 0 && <span className="text-[11px] text-gray-500">vacía</span>}
          {sim.readyQueue.map((pid, i) => {
            const p = byPid.get(pid)!;
            return (
              <span
                key={pid}
                className="rounded-md px-1.5 py-0.5 font-mono text-[10px]"
                style={{ background: `${p.color}22`, color: p.color, boxShadow: `inset 0 0 0 1px ${p.color}66` }}
                title={`${p.name} · prioridad ${p.effectivePriority}`}
              >
                {i === 0 && '▶ '}P{pid}
              </span>
            );
          })}
        </div>
      </div>

      <div>
        <SectionTitle>Dispositivos y recursos exclusivos</SectionTitle>
        <div className="space-y-1.5">
          {RESOURCE_IDS.map((id) => {
            const r = sim.resources[id];
            const Icon = ICONS[id];
            const holder = r.holder !== null ? byPid.get(r.holder) : undefined;
            const contested = r.queue.length > 0;
            return (
              <div
                key={id}
                className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 ${
                  holder ? (contested ? 'border-red-500/40 bg-red-500/5' : 'border-amber-400/30 bg-amber-400/5') : 'border-gray-800 bg-gray-900/60'
                }`}
              >
                <Icon size={16} className={holder ? 'text-amber-300' : 'text-green-400'} />
                <span className="min-w-0 flex-1 truncate text-[11px] text-gray-300">{r.name}</span>
                <span className={`font-mono text-[10px] ${holder ? 'text-amber-300' : 'text-green-400'}`}>
                  {holder ? `Ocupado · P${holder.pid}` : 'Libre'}
                </span>
                {contested && (
                  <span className="font-mono text-[10px] text-red-300" title="Cola de espera">
                    ⏳ {r.queue.map((q) => `P${q}`).join(', ')}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <WaitForGraph processes={sim.processes} deadlock={sim.deadlock} />
    </div>
  );
}

/** Grafo de espera en SVG: P → Q si P espera un recurso que posee Q. Las aristas del ciclo, en rojo. */
function WaitForGraph({ processes, deadlock }: { processes: Process[]; deadlock: number[] }) {
  const resources = useSimStore((s) => s.sim.resources);
  const edges = waitForGraph(processes, resources);
  if (edges.length === 0) return null;
  const nodes = [...new Set(edges.flatMap((e) => [e.from, e.to]))];
  const R = 58;
  const C = 80;
  const pos = new Map(nodes.map((pid, i) => {
    const a = (i / nodes.length) * Math.PI * 2 - Math.PI / 2;
    return [pid, { x: C + R * Math.cos(a) + 60, y: C + R * Math.sin(a) }];
  }));

  return (
    <div>
      <SectionTitle>Grafo de espera</SectionTitle>
      <svg viewBox="0 0 280 160" className="w-full rounded-lg border border-gray-800 bg-gray-950/70" role="img" aria-label="Grafo de espera entre procesos">
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="context-stroke" />
          </marker>
        </defs>
        {edges.map((e) => {
          const a = pos.get(e.from)!;
          const b = pos.get(e.to)!;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const len = Math.hypot(dx, dy) || 1;
          const [ux, uy] = [dx / len, dy / len];
          const cyc = deadlock.includes(e.from) && deadlock.includes(e.to);
          // Ligeramente curvas para que A→B y B→A no se superpongan.
          const mx = (a.x + b.x) / 2 - uy * 14;
          const my = (a.y + b.y) / 2 + ux * 14;
          return (
            <g key={`${e.from}-${e.to}`}>
              <path
                d={`M${a.x + ux * 16},${a.y + uy * 16} Q${mx},${my} ${b.x - ux * 18},${b.y - uy * 18}`}
                fill="none"
                stroke={cyc ? '#ff3b3b' : '#64748b'}
                strokeWidth={cyc ? 2 : 1.4}
                markerEnd="url(#arrow)"
              />
              <text x={mx} y={my} fontSize="8" textAnchor="middle" fill={cyc ? '#fca5a5' : '#94a3b8'} className="font-mono">
                {e.resource}
              </text>
            </g>
          );
        })}
        {nodes.map((pid) => {
          const p = pos.get(pid)!;
          const cyc = deadlock.includes(pid);
          return (
            <g key={pid}>
              <circle cx={p.x} cy={p.y} r={15} fill="#030712" stroke={cyc ? '#ff3b3b' : '#00e5ff'} strokeWidth={1.5} />
              <text x={p.x} y={p.y + 3} fontSize="9" textAnchor="middle" fill={cyc ? '#fecaca' : '#a5f3fc'} className="font-mono">
                P{pid}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
