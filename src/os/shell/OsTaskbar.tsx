import { useEffect, useMemo, useRef, useState } from 'react';
import { Bell, Download, Hourglass, Lock, Volume2, Wifi, WifiOff } from 'lucide-react';
import { PhotoIcon } from '../../components/ui/primitives';
import { memoryStats } from '../../engine/memory';
import { useSimStore } from '../../store/useSimStore';
import { useDownloads } from '../downloads';
import { useSession } from '../session';
import { TASKBAR_HEIGHT, useWm } from '../wm/useWm';
import { AppIcon } from './icons';
import { StartMenu } from './StartMenu';
import { NotificationCard } from './Toasts';

export function OsTaskbar() {
  const { windows, focused, toggleMinimize, openApp } = useWm();
  const [start, setStart] = useState(false);
  const [panel, setPanel] = useState<'notifications' | 'calendar' | null>(null);
  const sim = useSimStore((s) => s.sim);
  const mem = useMemo(() => memoryStats(sim.memory), [sim.memory]);
  const cpu = sim.history[sim.history.length - 1]?.cpu ?? 0;
  const downloads = useDownloads((s) => s.items.filter((d) => d.state === 'progressing').length);
  const unread = useSession((s) => s.notifications.length);
  const online = useOnline();
  const now = useClock();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'Escape') setStart((s) => !s);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      {start && <StartMenu onClose={() => setStart(false)} />}
      {panel && <TrayPanel kind={panel} onClose={() => setPanel(null)} />}
      <footer className="glass fixed inset-x-0 bottom-0 z-[99994] flex items-center gap-1.5 border-t border-cyan-400/20 px-2" style={{ height: TASKBAR_HEIGHT }}>
        <button
          type="button"
          data-start-button
          onClick={() => setStart((s) => !s)}
          aria-expanded={start}
          aria-label="Inicio"
          title="Inicio (Ctrl+Esc)"
          className={`flex items-center gap-2 rounded-lg px-1.5 py-1 ${start ? 'bg-white/15' : 'hover:bg-white/10'}`}
        >
          <PhotoIcon size={32} ring="#00e5ff" className="rounded-full" />
          <span className="neon-text-cyan hidden font-mono text-xs font-bold tracking-widest md:inline">OS-SIM</span>
        </button>
        <div className="mx-1 h-6 w-px bg-gray-700" />

        <nav className="scrollbar-thin flex min-w-0 flex-1 items-center gap-1 overflow-x-auto" aria-label="Ventanas abiertas">
          {windows.map((w) => {
            const active = focused === w.id && !w.minimized;
            return (
              <button
                key={w.id}
                type="button"
                onClick={() => toggleMinimize(w.id)}
                title={w.title}
                className={`flex max-w-44 shrink-0 items-center gap-2 rounded-lg border px-2 py-1 text-[11px] transition-colors ${
                  active ? 'border-white/20 bg-white/15 text-white' : 'border-transparent text-gray-300 hover:bg-white/10'
                } ${w.minimized ? 'opacity-60' : ''}`}
              >
                <AppIcon appId={w.appId} size={22} />
                <span className="truncate">{w.title}</span>
              </button>
            );
          })}
        </nav>

        <div className="flex shrink-0 items-center gap-1 text-[11px]">
          {sim.deadlock.length > 0 && (
            <button type="button" onClick={() => openApp('taskmanager', { tab: 'resources' })} className="alarm flex items-center gap-1 rounded-md bg-red-500/25 px-1.5 py-1 text-red-200" title="Interbloqueo detectado">
              <Lock size={12} /> DEADLOCK
            </button>
          )}
          {sim.starving.length > 0 && (
            <button type="button" onClick={() => openApp('taskmanager', { tab: 'processes' })} className="flex items-center gap-1 rounded-md bg-amber-400/20 px-1.5 py-1 text-amber-200" title="Procesos en inanición">
              <Hourglass size={12} /> {sim.starving.length}
            </button>
          )}
          {downloads > 0 && (
            <button type="button" onClick={() => openApp('files', { path: '/Descargas' })} className="flex items-center gap-1 rounded-md px-1.5 py-1 text-cyan-300 hover:bg-white/10" title="Descargas en curso">
              <Download size={14} className="animate-bounce" /> {downloads}
            </button>
          )}
          <button
            type="button"
            onClick={() => openApp('taskmanager', { tab: 'performance' })}
            className="hidden items-center gap-2 rounded-md px-1.5 py-1 font-mono text-gray-300 hover:bg-white/10 lg:flex"
            title="Abrir el Administrador de tareas"
          >
            <Meter label="CPU" value={cpu} />
            <Meter label="RAM" value={Math.round((mem.used / mem.total) * 100)} />
          </button>
          <span className="flex items-center gap-1.5 px-1 text-gray-300" title={online ? 'Conectado a internet' : 'Sin conexión'}>
            {online ? <Wifi size={15} /> : <WifiOff size={15} className="text-red-300" />}
            <Volume2 size={15} />
          </span>
          <button
            type="button"
            onClick={() => setPanel((p) => (p === 'notifications' ? null : 'notifications'))}
            className="relative rounded-md p-1.5 text-gray-300 hover:bg-white/10"
            aria-label="Centro de notificaciones"
            data-tray-button
          >
            <Bell size={15} />
            {unread > 0 && <span className="absolute top-0.5 right-0.5 h-2 w-2 rounded-full bg-cyan-400" />}
          </button>
          <button
            type="button"
            onClick={() => setPanel((p) => (p === 'calendar' ? null : 'calendar'))}
            className="rounded-md px-2 py-0.5 text-right leading-tight text-gray-200 hover:bg-white/10"
            data-tray-button
          >
            <div className="tabular-nums">{now.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}</div>
            <div className="text-[10px] text-gray-400 tabular-nums">{now.toLocaleDateString('es')}</div>
          </button>
        </div>
      </footer>
    </>
  );
}

function TrayPanel({ kind, onClose }: { kind: 'notifications' | 'calendar'; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const { notifications, clearNotifications } = useSession();
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      if (!ref.current?.contains(t) && !t.closest('[data-tray-button]')) onClose();
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [onClose]);

  return (
    <div ref={ref} className="glass fixed right-2 z-[99995] w-80 rounded-2xl border border-gray-700 p-3 shadow-2xl" style={{ bottom: TASKBAR_HEIGHT + 8 }}>
      {kind === 'calendar' ? (
        <Calendar />
      ) : (
        <>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-200">Notificaciones</span>
            {notifications.length > 0 && (
              <button type="button" onClick={clearNotifications} className="text-[11px] text-cyan-300 hover:underline">
                Borrar todo
              </button>
            )}
          </div>
          <div className="scrollbar-thin max-h-96 space-y-2 overflow-auto">
            {notifications.length === 0 && <p className="py-6 text-center text-xs text-gray-500">No hay notificaciones</p>}
            {notifications.map((n) => (
              <NotificationCard key={n.id} n={n} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Calendar() {
  const today = new Date();
  const [month, setMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const first = (month.getDay() + 6) % 7; // semana empieza en lunes
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const isToday = (d: number) => d === today.getDate() && month.getMonth() === today.getMonth() && month.getFullYear() === today.getFullYear();
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <button type="button" className="rounded px-2 text-gray-400 hover:bg-white/10" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} aria-label="Mes anterior">
          ‹
        </button>
        <span className="text-sm font-semibold text-gray-100 capitalize">{month.toLocaleDateString('es', { month: 'long', year: 'numeric' })}</span>
        <button type="button" className="rounded px-2 text-gray-400 hover:bg-white/10" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} aria-label="Mes siguiente">
          ›
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px]">
        {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((d) => (
          <span key={d} className="text-gray-500">
            {d}
          </span>
        ))}
        {cells.map((d, i) => (
          <span key={i} className={`rounded-md py-1 tabular-nums ${d && isToday(d) ? 'bg-cyan-400 font-bold text-gray-950' : 'text-gray-300'}`}>
            {d ?? ''}
          </span>
        ))}
      </div>
    </div>
  );
}

function Meter({ label, value }: { label: string; value: number }) {
  const color = value > 85 ? '#ff3b3b' : value > 60 ? '#ffb300' : '#00e5ff';
  return (
    <span className="flex items-center gap-1 text-gray-400">
      {label}
      <span className="h-1.5 w-8 overflow-hidden rounded-full bg-gray-800">
        <span className="block h-full transition-[width] duration-300" style={{ width: `${value}%`, background: color }} />
      </span>
      <span className="w-7 text-right text-gray-300 tabular-nums">{value}%</span>
    </span>
  );
}

function useOnline() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return online;
}

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 10_000);
    return () => clearInterval(id);
  }, []);
  return now;
}
