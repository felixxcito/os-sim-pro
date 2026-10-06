import { Suspense, useRef, type ComponentType, type PointerEvent as ReactPointerEvent } from 'react';
import { Combine, Gauge, Loader2, Maximize2, Minimize2, Minus, X } from 'lucide-react';
import { Button } from '../../components/ui/primitives';
import { useSimStore } from '../../store/useSimStore';
import { APP_META } from '../apps/meta';
import { TASKBAR_HEIGHT, useWm, type OsWindow } from '../wm/useWm';
import { AppIcon } from './icons';

export interface AppProps {
  win: OsWindow;
}

/** Ventana del SO. Su contenido solo se muestra cuando el proceso ya tiene memoria asignada. */
export function OsWindowFrame({ win, Body }: { win: OsWindow; Body: ComponentType<AppProps> }) {
  const { focus, close, toggleMinimize, toggleMaximize, move, resize } = useWm();
  const focused = useWm((s) => s.focused === win.id);
  const proc = useSimStore((s) => s.sim.processes.find((p) => p.pid === win.pid));
  const interact = useSimStore((s) => s.interact);
  const meta = APP_META[win.appId];
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const lastActivity = useRef(0);
  const full = win.maximized;

  /** Cada interacción del usuario (con un límite de frecuencia) genera trabajo de CPU para el proceso. */
  const onActivity = () => {
    const now = performance.now();
    if (now - lastActivity.current < 400) return;
    lastActivity.current = now;
    interact(win.pid, 1);
  };

  const onDragStart = (e: ReactPointerEvent) => {
    if (full || (e.target as HTMLElement).closest('button')) return;
    drag.current = { dx: e.clientX - win.x, dy: e.clientY - win.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onDragMove = (e: ReactPointerEvent) => {
    if (!drag.current) return;
    const x = Math.min(Math.max(e.clientX - drag.current.dx, -win.w + 120), window.innerWidth - 120);
    const y = Math.min(Math.max(e.clientY - drag.current.dy, 0), window.innerHeight - TASKBAR_HEIGHT - 32);
    move(win.id, x, y);
  };

  const onResizeStart = (e: ReactPointerEvent) => {
    e.stopPropagation();
    const start = { x: e.clientX, y: e.clientY, w: win.w, h: win.h };
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const onMove = (ev: PointerEvent) => resize(win.id, start.w + ev.clientX - start.x, start.h + ev.clientY - start.y);
    const onUp = () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
    };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
  };

  const style = full
    ? { left: 0, top: 0, width: '100%', height: `calc(100% - ${TASKBAR_HEIGHT}px)`, zIndex: win.z }
    : { left: win.x, top: win.y, width: win.w, height: win.h, zIndex: win.z };
  const loaded = proc && proc.state !== 'New';

  return (
    <section
      role="dialog"
      aria-label={win.title}
      onPointerDownCapture={() => {
        if (!focused) focus(win.id);
        onActivity();
      }}
      onKeyDownCapture={onActivity}
      className={`glass absolute flex flex-col overflow-hidden border shadow-2xl ${full ? '' : 'rounded-xl'} ${win.minimized ? 'hidden' : ''}`}
      style={{
        ...style,
        borderColor: focused ? `${meta.accent}88` : 'rgb(55 65 81 / 0.7)',
        boxShadow: focused ? `0 0 0 1px ${meta.accent}33, 0 0 28px ${meta.accent}22, 0 25px 50px -12px rgb(0 0 0 / 0.7)` : undefined,
      }}
    >
      <header
        onPointerDown={onDragStart}
        onPointerMove={onDragMove}
        onPointerUp={() => (drag.current = null)}
        onDoubleClick={() => toggleMaximize(win.id)}
        className={`flex h-9 shrink-0 items-center gap-2 border-b border-gray-800 bg-gray-900/85 px-2 select-none ${full ? '' : 'cursor-grab active:cursor-grabbing'}`}
      >
        <AppIcon appId={win.appId} size={20} />
        <h2 className="ml-1 flex-1 truncate text-xs font-semibold tracking-wide text-gray-200">{win.title}</h2>
        {proc && (
          <span className="hidden font-mono text-[10px] text-gray-500 sm:inline" title="Proceso del núcleo">
            PID {proc.pid} · {proc.memorySize} MB
          </span>
        )}
        <div className="flex items-center gap-0.5">
          <WinButton label="Minimizar" onClick={() => toggleMinimize(win.id)}>
            <Minus size={13} />
          </WinButton>
          <WinButton label={full ? 'Restaurar' : 'Maximizar'} onClick={() => toggleMaximize(win.id)}>
            {full ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
          </WinButton>
          <WinButton label="Cerrar" onClick={() => close(win.id)} danger>
            <X size={13} />
          </WinButton>
        </div>
      </header>
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {loaded ? (
          <Suspense fallback={<Loading />}>
            <Body win={win} />
          </Suspense>
        ) : (
          <MemoryWait pid={win.pid} memory={meta.memory} />
        )}
      </div>
      {!full && (
        <div
          onPointerDown={onResizeStart}
          className="absolute right-0 bottom-0 z-10 h-4 w-4 cursor-nwse-resize"
          style={{ background: `linear-gradient(135deg, transparent 50%, ${meta.accent}88 50%)` }}
          aria-hidden
        />
      )}
    </section>
  );
}

function Loading() {
  return (
    <div className="flex h-full items-center justify-center gap-2 text-xs text-gray-500">
      <Loader2 size={16} className="animate-spin" /> Cargando…
    </div>
  );
}

/** La app aún no tiene memoria: el proceso espera en la cola de admisión (estado Nuevo). */
function MemoryWait({ pid, memory }: { pid: number; memory: number }) {
  const compact = useSimStore((s) => s.compact);
  const waited = useSimStore((s) => s.sim.processes.find((p) => p.pid === pid)?.waitStreak ?? 0);
  const openApp = useWm((s) => s.openApp);
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <Loader2 size={28} className="animate-spin text-cyan-300" />
      <div className="text-sm font-semibold text-gray-100">Esperando memoria…</div>
      <p className="max-w-sm text-xs text-gray-400">
        El proceso P{pid} necesita {memory} MB contiguos y está en la cola de admisión (estado <b>Nuevo</b>).
        {waited > 2 && ' Puede que la RAM esté llena o fragmentada.'}
      </p>
      {waited > 2 && (
        <div className="flex gap-2">
          <Button tone="green" icon={<Combine size={13} />} onClick={compact}>
            Compactar RAM
          </Button>
          <Button tone="cyan" icon={<Gauge size={13} />} onClick={() => openApp('taskmanager', { tab: 'memory' })}>
            Ver memoria
          </Button>
        </div>
      )}
    </div>
  );
}

function WinButton({ label, onClick, children, danger }: { label: string; onClick: () => void; children: React.ReactNode; danger?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`rounded-md p-1 text-gray-400 transition-colors ${danger ? 'hover:bg-red-500/80 hover:text-white' : 'hover:bg-white/10 hover:text-gray-100'}`}
    >
      {children}
    </button>
  );
}
