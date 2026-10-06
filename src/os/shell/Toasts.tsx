import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { useSession, type OsNotification } from '../session';
import { TASKBAR_HEIGHT } from '../wm/useWm';

const TONE = {
  info: { icon: Info, color: 'text-cyan-300', border: 'border-cyan-400/30' },
  success: { icon: CheckCircle2, color: 'text-green-300', border: 'border-green-400/30' },
  warning: { icon: AlertTriangle, color: 'text-amber-300', border: 'border-amber-400/40' },
  error: { icon: XCircle, color: 'text-red-300', border: 'border-red-500/40' },
};

export function NotificationCard({ n, onClose }: { n: OsNotification; onClose?: () => void }) {
  const t = TONE[n.tone ?? 'info'];
  const Icon = t.icon;
  return (
    <div className={`glass flex gap-2.5 rounded-xl border ${t.border} p-3 shadow-2xl`}>
      <Icon size={18} className={`mt-0.5 shrink-0 ${t.color}`} />
      <div className="min-w-0 flex-1">
        <div className="text-xs font-semibold text-gray-100">{n.title}</div>
        {n.body && <div className="mt-0.5 truncate text-[11px] text-gray-400">{n.body}</div>}
        {n.action && (
          <button type="button" onClick={n.action.run} className="mt-1.5 rounded-md bg-white/10 px-2 py-0.5 text-[11px] text-gray-100 hover:bg-white/20">
            {n.action.label}
          </button>
        )}
      </div>
      {onClose && (
        <button type="button" onClick={onClose} className="self-start rounded p-0.5 text-gray-500 hover:text-gray-200" aria-label="Cerrar notificación">
          <X size={13} />
        </button>
      )}
    </div>
  );
}

/** Notificaciones emergentes sobre la barra de tareas. */
export function Toasts() {
  const { notifications, toasts, dismissToast } = useSession();
  const shown = toasts.map((id) => notifications.find((n) => n.id === id)).filter((n): n is OsNotification => !!n);
  return (
    <div className="pointer-events-none fixed right-3 z-[99990] flex w-80 flex-col gap-2" style={{ bottom: TASKBAR_HEIGHT + 12 }} aria-live="polite">
      {shown.slice(-4).map((n) => (
        <div key={n.id} className="pointer-events-auto">
          <NotificationCard n={n} onClose={() => dismissToast(n.id)} />
        </div>
      ))}
    </div>
  );
}
