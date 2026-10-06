import { useMemo } from 'react';
import { Combine } from 'lucide-react';
import { useSimStore } from '../../store/useSimStore';
import { isBlockedByFragmentation, memoryStats } from '../../engine/memory';
import { Button, SectionTitle, Segmented, Stat } from '../ui/primitives';

export function MemoryMap() {
  const sim = useSimStore((s) => s.sim);
  const compact = useSimStore((s) => s.compact);
  const setConfig = useSimStore((s) => s.setConfig);
  const stats = useMemo(() => memoryStats(sim.memory), [sim.memory]);
  const byPid = useMemo(() => new Map(sim.processes.map((p) => [p.pid, p])), [sim.processes]);
  const waiting = sim.processes.filter((p) => p.state === 'New' && p.waitStreak > 0);
  const lastIndex = sim.memory.length - 1;

  return (
    <div className="space-y-3 p-3">
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        <Stat label="Total" value={`${stats.total} MB`} />
        <Stat label="Usada" value={`${stats.used} MB`} tone="text-cyan-300" />
        <Stat label="Libre" value={`${stats.free} MB`} tone="text-green-300" />
        <Stat label="Huecos" value={stats.holes} />
        <Stat label="Mayor hueco" value={`${stats.largestHole} MB`} />
        <Stat
          label="Frag. externa"
          value={`${stats.externalFragmentation}%`}
          tone={stats.externalFragmentation > 30 ? 'text-red-400' : stats.externalFragmentation > 0 ? 'text-amber-300' : 'text-green-300'}
        />
      </div>

      <div>
        <SectionTitle
          right={
            <div className="flex items-center gap-2">
              <Segmented
                label="Estrategia de asignación"
                value={sim.config.strategy}
                onChange={(strategy) => setConfig({ strategy })}
                options={[
                  { value: 'first-fit', label: 'First-Fit' },
                  { value: 'best-fit', label: 'Best-Fit' },
                ]}
              />
              <Button tone="green" onClick={compact} icon={<Combine size={13} />} disabled={stats.holes <= 1 && stats.fragmented === 0}>
                Compactar RAM
              </Button>
            </div>
          }
        >
          Particionamiento dinámico
        </SectionTitle>

        {/* Barra de memoria: cada bloque se posiciona por dirección; al compactar, la transición anima el desplazamiento. */}
        <div className="relative h-16 overflow-hidden rounded-lg border border-gray-700 bg-gray-950" role="img" aria-label="Mapa de memoria RAM">
          {sim.memory.map((b, i) => {
            const left = (b.start / stats.total) * 100;
            const width = (b.size / stats.total) * 100;
            const style = { left: `${left}%`, width: `${width}%` };
            const cls = 'absolute top-0 bottom-0 transition-[left,width] duration-700 ease-in-out border-r border-gray-950/80';
            if (b.pid === 0) {
              return (
                <div key="kernel" className={`${cls} flex items-center justify-center bg-slate-700/80`} style={style} title={`Núcleo del SO · ${b.size} MB`}>
                  <span className="font-mono text-[10px] font-bold tracking-widest text-slate-200">KERNEL</span>
                </div>
              );
            }
            if (b.pid === null) {
              const isFragment = i !== lastIndex;
              return (
                <div
                  key={`free-${b.start}`}
                  className={`${cls} ${isFragment ? 'fragment' : 'bg-gray-900'} flex items-center justify-center`}
                  style={style}
                  title={`${isFragment ? 'Hueco (fragmentación externa)' : 'Memoria libre'} · @${b.start} · ${b.size} MB`}
                >
                  {width > 6 && <span className="font-mono text-[9px] text-gray-300/80">{b.size}</span>}
                </div>
              );
            }
            const p = byPid.get(b.pid);
            const color = p?.color ?? '#888';
            return (
              <div
                key={`p-${b.pid}`}
                className={`${cls} flex flex-col items-center justify-center overflow-hidden`}
                style={{ ...style, background: `${color}33`, boxShadow: `inset 0 0 0 1px ${color}aa, inset 0 -3px 0 ${color}` }}
                title={`P${b.pid} ${p?.name ?? ''} · @${b.start} · ${b.size} MB`}
              >
                {width > 3.5 && (
                  <span className="font-mono text-[10px] font-bold" style={{ color }}>
                    P{b.pid}
                  </span>
                )}
                {width > 6 && <span className="font-mono text-[9px] text-gray-400">{b.size}</span>}
              </div>
            );
          })}
        </div>
        <div className="mt-1 flex justify-between font-mono text-[9px] text-gray-600">
          {[0, 0.25, 0.5, 0.75, 1].map((f) => (
            <span key={f}>{Math.round(stats.total * f)}</span>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-gray-400">
          <Legend swatch="bg-slate-700" label="Núcleo" />
          <Legend swatch="bg-cyan-400/40 ring-1 ring-cyan-400" label="Proceso" />
          <Legend swatch="fragment" label="Hueco entre procesos (fragmentación)" />
          <Legend swatch="bg-gray-900 ring-1 ring-gray-700" label="Libre contigua" />
        </div>
      </div>

      <div>
        <SectionTitle>Cola de admisión (esperando memoria)</SectionTitle>
        {waiting.length === 0 ? (
          <p className="text-[11px] text-gray-500">Ningún proceso espera memoria.</p>
        ) : (
          <ul className="space-y-1">
            {waiting.map((p) => {
              const frag = isBlockedByFragmentation(sim.memory, p.memorySize);
              return (
                <li key={p.pid} className="flex items-center justify-between rounded-md bg-gray-900/70 px-2 py-1 text-[11px]">
                  <span className="font-mono">
                    <span style={{ color: p.color }}>P{p.pid}</span> {p.name} · {p.memorySize} MB
                  </span>
                  <span className={frag ? 'text-amber-300' : 'text-gray-500'}>
                    {frag ? 'bloqueado por fragmentación → compacta' : 'memoria insuficiente'}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2.5 w-4 rounded-sm ${swatch}`} />
      {label}
    </span>
  );
}
