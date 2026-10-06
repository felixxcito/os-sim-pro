import { useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { Maximize2, Minimize2, Minus, X } from 'lucide-react';
import { TASKBAR_HEIGHT, useWindowStore, type WindowState } from '../../store/useWindowStore';
import { PhotoIcon } from '../ui/primitives';
import type { AppDef } from './apps';

/** Ventana arrastrable y redimensionable del escritorio simulado. */
export function Window({ app, win, mobile }: { app: AppDef; win: WindowState; mobile: boolean }) {
  const { focus, close, toggleMinimize, toggleMaximize, move, resize } = useWindowStore();
  const focused = useWindowStore((s) => s.focused === app.id);
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const Body = app.component;
  const Glyph = app.glyph;
  const full = mobile || win.maximized;

  const onDragStart = (e: ReactPointerEvent) => {
    if (full || (e.target as HTMLElement).closest('button')) return;
    drag.current = { dx: e.clientX - win.x, dy: e.clientY - win.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onDragMove = (e: ReactPointerEvent) => {
    if (!drag.current) return;
    const x = Math.min(Math.max(e.clientX - drag.current.dx, -win.w + 120), window.innerWidth - 120);
    const y = Math.min(Math.max(e.clientY - drag.current.dy, 0), window.innerHeight - TASKBAR_HEIGHT - 32);
    move(app.id, x, y);
  };
  const onDragEnd = () => (drag.current = null);

  const onResizeStart = (e: ReactPointerEvent) => {
    e.stopPropagation();
    const start = { x: e.clientX, y: e.clientY, w: win.w, h: win.h };
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const onMove = (ev: PointerEvent) => resize(app.id, start.w + ev.clientX - start.x, start.h + ev.clientY - start.y);
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

  return (
    <section
      role="dialog"
      aria-label={app.title}
      onPointerDown={() => !focused && focus(app.id)}
      className={`glass absolute flex flex-col overflow-hidden border shadow-2xl transition-shadow ${full ? '' : 'rounded-xl'} ${
        win.minimized ? 'hidden' : ''
      }`}
      style={{
        ...style,
        borderColor: focused ? `${app.accent}88` : 'rgb(55 65 81 / 0.7)',
        boxShadow: focused ? `0 0 0 1px ${app.accent}33, 0 0 28px ${app.accent}22, 0 25px 50px -12px rgb(0 0 0 / 0.7)` : undefined,
      }}
    >
      <header
        onPointerDown={onDragStart}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
        onDoubleClick={() => !mobile && toggleMaximize(app.id)}
        className={`flex h-9 shrink-0 items-center gap-2 border-b border-gray-800 bg-gray-900/80 px-2 select-none ${full ? '' : 'cursor-grab active:cursor-grabbing'}`}
      >
        <PhotoIcon size={20} ring={app.accent} className="rounded-md" />
        <Glyph size={13} style={{ color: app.accent }} />
        <h2 className="flex-1 truncate text-xs font-semibold tracking-wide text-gray-200">{app.title}</h2>
        <div className="flex items-center gap-0.5">
          <WinButton label="Minimizar" onClick={() => toggleMinimize(app.id)}>
            <Minus size={13} />
          </WinButton>
          {!mobile && (
            <WinButton label={win.maximized ? 'Restaurar' : 'Maximizar'} onClick={() => toggleMaximize(app.id)}>
              {win.maximized ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
            </WinButton>
          )}
          <WinButton label="Cerrar" onClick={() => close(app.id)} danger>
            <X size={13} />
          </WinButton>
        </div>
      </header>
      <div className="scrollbar-thin min-h-0 flex-1 overflow-auto">
        <Body />
      </div>
      {!full && (
        <div
          onPointerDown={onResizeStart}
          className="absolute right-0 bottom-0 h-4 w-4 cursor-nwse-resize"
          style={{ background: `linear-gradient(135deg, transparent 50%, ${app.accent}88 50%)` }}
          aria-hidden
        />
      )}
    </section>
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
