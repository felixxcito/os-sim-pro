import { useEffect, useMemo, useRef, useState } from 'react';
import { LayoutGrid, Lock, Pause, Play, RotateCcw, Hourglass } from 'lucide-react';
import { useSimStore } from '../../store/useSimStore';
import { APP_ORDER, TASKBAR_HEIGHT, useWindowStore } from '../../store/useWindowStore';
import { memoryStats } from '../../engine/memory';
import { PhotoIcon } from '../ui/primitives';
import { APPS } from './apps';

export function Taskbar({ mobile }: { mobile: boolean }) {
  const { windows, focused, open, toggleMinimize, arrange } = useWindowStore();
  const sim = useSimStore((s) => s.sim);
  const running = useSimStore((s) => s.running);
  const toggle = useSimStore((s) => s.toggle);
  const reset = useSimStore((s) => s.reset);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const clock = useClock();
  const mem = useMemo(() => memoryStats(sim.memory), [sim.memory]);
  const cpu = sim.history[sim.history.length - 1]?.cpu ?? 0;

  useEffect(() => {
    if (!menu) return;
    const close = (e: PointerEvent) => !menuRef.current?.contains(e.target as Node) && setMenu(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(false);
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', esc);
    };
  }, [menu]);

  return (
    <footer
      className="glass absolute inset-x-0 bottom-0 z-[9999] flex items-center gap-2 border-t border-cyan-400/20 px-2"
      style={{ height: TASKBAR_HEIGHT }}
    >
      <div ref={menuRef} className="relative">
        <button
          type="button"
          onClick={() => setMenu((m) => !m)}
          aria-expanded={menu}
          aria-label="Menú de inicio"
          className="flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-white/10"
        >
          <PhotoIcon size={32} ring="#00e5ff" className="rounded-full" />
          {!mobile && <span className="neon-text-cyan font-mono text-xs font-bold tracking-widest">OS-SIM</span>}
        </button>
        {menu && (
          <div className="glass absolute bottom-12 left-0 w-64 rounded-xl border border-cyan-400/30 p-2 shadow-2xl">
            <div className="mb-2 flex items-center gap-3 rounded-lg bg-white/5 p-2">
              <PhotoIcon size={44} ring="#39ff14" className="rounded-full" />
              <div>
                <div className="text-sm font-semibold text-gray-100">OS-Sim Pro</div>
                <div className="font-mono text-[10px] text-gray-400">kernel 1.0 · RR · {mem.total} MB</div>
              </div>
            </div>
            {APP_ORDER.map((id) => {
              const app = APPS[id];
              const Glyph = app.glyph;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    open(id);
                    setMenu(false);
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-xs text-gray-200 hover:bg-white/10"
                >
                  <PhotoIcon size={24} ring={app.accent} className="rounded-md" />
                  <Glyph size={13} style={{ color: app.accent }} />
                  {app.title}
                </button>
              );
            })}
            <div className="my-1 border-t border-gray-800" />
            <button
              type="button"
              onClick={() => {
                reset();
                setMenu(false);
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-xs text-red-300 hover:bg-red-500/10"
            >
              <RotateCcw size={14} /> Reiniciar simulación
            </button>
          </div>
        )}
      </div>

      <nav className="scrollbar-thin flex min-w-0 flex-1 items-center gap-1 overflow-x-auto" aria-label="Ventanas abiertas">
        {APP_ORDER.filter((id) => windows[id].open).map((id) => {
          const app = APPS[id];
          const active = focused === id && !windows[id].minimized;
          return (
            <button
              key={id}
              type="button"
              onClick={() => toggleMinimize(id)}
              className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] transition-colors ${
                active ? 'border-white/20 bg-white/10 text-white' : 'border-transparent text-gray-400 hover:bg-white/5'
              }`}
              style={active ? { boxShadow: `inset 0 -2px 0 ${app.accent}` } : undefined}
              title={app.title}
            >
              <PhotoIcon size={20} ring={app.accent} className="rounded" />
              {!mobile && app.short}
            </button>
          );
        })}
      </nav>

      <div className="flex shrink-0 items-center gap-2 font-mono text-[11px]">
        {!mobile && (
          <button type="button" onClick={arrange} className="rounded-md p-1.5 text-gray-400 hover:bg-white/10 hover:text-cyan-300" title="Organizar ventanas (vista dashboard)" aria-label="Organizar ventanas">
            <LayoutGrid size={15} />
          </button>
        )}
        {sim.deadlock.length > 0 && (
          <span className="alarm flex items-center gap-1 rounded-md bg-red-500/25 px-1.5 py-0.5 text-red-200" title="Interbloqueo detectado">
            <Lock size={12} /> {!mobile && 'DEADLOCK'}
          </span>
        )}
        {sim.starving.length > 0 && (
          <span className="flex items-center gap-1 rounded-md bg-amber-400/20 px-1.5 py-0.5 text-amber-200" title="Procesos en inanición">
            <Hourglass size={12} /> {sim.starving.length}
          </span>
        )}
        <button
          type="button"
          onClick={toggle}
          className={`rounded-md p-1.5 ${running ? 'text-amber-300 hover:bg-amber-400/10' : 'text-green-400 hover:bg-green-400/10'}`}
          aria-label={running ? 'Pausar' : 'Reanudar'}
        >
          {running ? <Pause size={15} /> : <Play size={15} />}
        </button>
        <span className="neon-text-green tabular-nums">T{String(sim.tick).padStart(4, '0')}</span>
        {!mobile && (
          <>
            <Meter label="CPU" value={cpu} />
            <Meter label="RAM" value={Math.round((mem.used / mem.total) * 100)} />
          </>
        )}
        <span className="pl-1 text-gray-300 tabular-nums">{clock}</span>
      </div>
    </footer>
  );
}

function Meter({ label, value }: { label: string; value: number }) {
  const color = value > 85 ? '#ff3b3b' : value > 60 ? '#ffb300' : '#00e5ff';
  return (
    <span className="flex items-center gap-1 text-gray-400" title={`${label} ${value}%`}>
      {label}
      <span className="h-1.5 w-10 overflow-hidden rounded-full bg-gray-800">
        <span className="block h-full transition-[width] duration-300" style={{ width: `${value}%`, background: color }} />
      </span>
      <span className="w-7 text-right tabular-nums text-gray-300">{value}%</span>
    </span>
  );
}

function useClock() {
  const fmt = () => new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
  const [time, setTime] = useState(fmt);
  useEffect(() => {
    const id = setInterval(() => setTime(fmt()), 15_000);
    return () => clearInterval(id);
  }, []);
  return time;
}
