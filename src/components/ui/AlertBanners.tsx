import { Hourglass, ShieldAlert } from 'lucide-react';
import { useSimStore } from '../../store/useSimStore';
import { RESOURCE_NAMES } from '../../engine/constants';
import type { ResourceId } from '../../types';
import { Button } from './primitives';

/** Alertas globales sobre el escritorio: interbloqueo (rojo) e inanición (ámbar). */
export function AlertBanners({ compact = false }: { compact?: boolean }) {
  const sim = useSimStore((s) => s.sim);
  const resolve = useSimStore((s) => s.resolveDeadlock);
  const setConfig = useSimStore((s) => s.setConfig);
  if (!sim.deadlock.length && !sim.starving.length) return null;
  const byPid = new Map(sim.processes.map((p) => [p.pid, p]));

  return (
    <div className={`pointer-events-none flex flex-col items-center gap-2 px-4 ${compact ? '' : 'absolute inset-x-0 top-3 z-[9998]'}`}>
      {sim.deadlock.length > 0 && (
        <div role="alert" className="alarm pointer-events-auto flex max-w-2xl flex-wrap items-center gap-3 rounded-xl border-2 border-red-500 bg-red-950/90 px-4 py-2.5 backdrop-blur">
          <ShieldAlert className="text-red-400" size={26} />
          <div className="min-w-0 flex-1">
            <div className="font-mono text-base font-black tracking-wider text-red-300">¡DEADLOCK DETECTADO!</div>
            <div className="text-xs text-red-200/90">
              Espera circular:{' '}
              {sim.deadlock
                .map((pid) => {
                  const p = byPid.get(pid)!;
                  const holder = p.waitingFor ? sim.resources[p.waitingFor].holder : null;
                  const name = (id: ResourceId) => RESOURCE_NAMES[id];
                  return `P${pid} retiene ${p.heldResources.map(name).join(' + ') || '—'} y espera ${p.waitingFor ? name(p.waitingFor) : '—'} (de P${holder})`;
                })
                .join(' · ')}
            </div>
          </div>
          <Button tone="red" onClick={resolve}>
            Abortar víctima
          </Button>
        </div>
      )}
      {sim.starving.length > 0 && (
        <div role="status" className="pointer-events-auto flex max-w-2xl flex-wrap items-center gap-3 rounded-xl border border-amber-400/70 bg-amber-950/85 px-4 py-2 backdrop-blur">
          <Hourglass className="text-amber-300" size={20} />
          <div className="min-w-0 flex-1 text-xs text-amber-100">
            <b className="font-mono tracking-wide text-amber-300">INANICIÓN</b> ·{' '}
            {sim.starving
              .slice(0, 3)
              .map((pid) => {
                const p = byPid.get(pid)!;
                return `P${pid} ${p.name} (${p.waitStreak} ticks esperando ${p.state === 'New' ? 'memoria' : 'CPU'})`;
              })
              .join(' · ')}
            {sim.starving.length > 3 && ` · +${sim.starving.length - 3}`}
          </div>
          {!sim.config.aging ? (
            <Button tone="green" onClick={() => setConfig({ aging: true })}>
              Activar Aging
            </Button>
          ) : (
            <span className="text-[11px] text-green-300">Aging activo: su prioridad está subiendo…</span>
          )}
        </div>
      )}
    </div>
  );
}
