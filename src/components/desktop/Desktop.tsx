import { useEffect, useRef, useState } from 'react';
import { APP_ORDER, isMobile, useWindowStore } from '../../store/useWindowStore';
import { useSimStore } from '../../store/useSimStore';
import { AlertBanners } from '../ui/AlertBanners';
import { APPS } from './apps';
import { DesktopIcon } from './DesktopIcon';
import { Taskbar } from './Taskbar';
import { Window } from './Window';

function useIsMobile() {
  const [mobile, setMobile] = useState(isMobile);
  useEffect(() => {
    const onResize = () => setMobile(isMobile());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  // Al pasar de móvil a escritorio se recupera la distribución tipo dashboard.
  const wasMobile = useRef(mobile);
  useEffect(() => {
    if (wasMobile.current && !mobile) useWindowStore.getState().arrange();
    wasMobile.current = mobile;
  }, [mobile]);
  return mobile;
}

/** Atajos globales: Espacio = play/pausa, → = paso a paso. */
function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, select, textarea, button, [role="switch"]')) return;
      const sim = useSimStore.getState();
      if (e.code === 'Space') {
        e.preventDefault();
        sim.toggle();
      } else if (e.key === 'ArrowRight' && !sim.running) {
        sim.stepOnce();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

export function Desktop() {
  const windows = useWindowStore((s) => s.windows);
  const open = useWindowStore((s) => s.open);
  const mobile = useIsMobile();
  useShortcuts();

  return (
    <main className="wallpaper relative h-full w-full overflow-hidden">
      <div className="wallpaper-veil absolute inset-0" />
      <div className="scanlines pointer-events-none absolute inset-0" />

      <nav
        aria-label="Escritorio"
        className={
          mobile
            ? 'relative grid grid-cols-3 gap-3 p-4 pt-6 sm:grid-cols-6'
            : 'absolute top-2 left-2 flex flex-col gap-1'
        }
      >
        {APP_ORDER.map((id) => (
          <DesktopIcon key={id} app={APPS[id]} onOpen={() => open(id)} active={windows[id].open} />
        ))}
      </nav>

      {APP_ORDER.filter((id) => windows[id].open).map((id) => (
        <Window key={id} app={APPS[id]} win={windows[id]} mobile={mobile} />
      ))}

      <AlertBanners />
      <Taskbar mobile={mobile} />
    </main>
  );
}
