import { useEffect, useRef } from 'react';
import { useSimStore } from '../../store/useSimStore';
import { requestBrowserTab } from '../../apps/browser/bus';
import { APP_COMPONENTS } from '../apps/components';
import { APP_META } from '../apps/meta';
import { initDownloads } from '../downloads';
import { notify, useSession } from '../session';
import { useWm } from '../wm/useWm';
import { ContextMenuHost } from './ContextMenu';
import { DesktopSurface } from './DesktopSurface';
import { DialogHost } from './Dialogs';
import { OsTaskbar } from './OsTaskbar';
import { OsWindowFrame } from './OsWindowFrame';
import { BootScreen, LockScreen, ShutdownScreen } from './Screens';
import { Toasts } from './Toasts';
import { Wallpaper } from './Wallpaper';

/** Raíz del SO simulado: arranque → bloqueo → escritorio → apagado. */
export function OsRoot() {
  const phase = useSession((s) => s.phase);
  return (
    <div className="h-full w-full select-none" onContextMenu={(e) => e.preventDefault()}>
      {phase === 'boot' && <BootScreen />}
      {phase === 'lock' && <LockScreen />}
      {phase === 'desktop' && <DesktopSession />}
      {phase === 'shutdown' && <ShutdownScreen />}
      <DialogHost />
      <ContextMenuHost />
    </div>
  );
}

function DesktopSession() {
  const wallpaper = useSession((s) => s.settings.wallpaper);
  const windows = useWm((s) => s.windows);
  useKernelBridge();

  return (
    <main className="relative h-full w-full overflow-hidden">
      <Wallpaper kind={wallpaper} />
      <DesktopSurface />
      {windows.map((w) => (
        <OsWindowFrame key={w.id} win={w} Body={APP_COMPONENTS[w.appId]} />
      ))}
      <Toasts />
      <OsTaskbar />
    </main>
  );
}

/** Mantiene sincronizados el núcleo simulado y el escritorio. */
function useKernelBridge() {
  const hadDeadlock = useRef(false);

  useEffect(() => {
    // El reloj del sistema corre mientras haya sesión.
    const sim = useSimStore.getState();
    if (!sim.running) sim.play();

    const offDownloads = initDownloads();
    const offNewTab = window.osApi?.events.onNewTab((url) => requestBrowserTab(url)) ?? (() => {});

    // Si el núcleo termina el proceso de una ventana (p. ej. "Finalizar tarea"), la ventana se cierra.
    const offSim = useSimStore.subscribe((state, prev) => {
      if (state.sim === prev.sim) return;
      const procs = new Map(state.sim.processes.map((p) => [p.pid, p]));
      for (const w of useWm.getState().windows) {
        const p = procs.get(w.pid);
        if (!p || p.state === 'Terminated') {
          useWm.getState().close(w.id, { keepProcess: true });
          notify({ title: `${APP_META[w.appId].name} se ha cerrado`, body: `El proceso P${w.pid} fue finalizado por el núcleo`, tone: 'warning' });
        }
      }
      const deadlock = state.sim.deadlock.length > 0;
      if (deadlock && !hadDeadlock.current) {
        notify({
          title: '¡Interbloqueo detectado!',
          body: `Espera circular entre ${state.sim.deadlock.map((p) => 'P' + p).join(' ↔ ')}`,
          tone: 'error',
          action: { label: 'Ver recursos', run: () => useWm.getState().openApp('taskmanager', { tab: 'resources' }) },
        });
      }
      hadDeadlock.current = deadlock;
    });

    return () => {
      offDownloads();
      offNewTab();
      offSim();
    };
  }, []);
}
