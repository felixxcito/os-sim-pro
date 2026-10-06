import { useEffect, useMemo, useRef, useState } from 'react';
import { Lock, Power, RotateCcw, Search } from 'lucide-react';
import { PhotoIcon } from '../../components/ui/primitives';
import { APP_IDS, APP_META } from '../apps/meta';
import { fs, type FsEntry } from '../fs';
import { openPath } from '../openFile';
import { useSession } from '../session';
import { TASKBAR_HEIGHT, useWm } from '../wm/useWm';
import { AppIcon, FileIcon } from './icons';

/** Menú de inicio: búsqueda de apps y documentos, documentos recientes y energía. */
export function StartMenu({ onClose }: { onClose: () => void }) {
  const openApp = useWm((s) => s.openApp);
  const closeAll = useWm((s) => s.closeAll);
  const { settings, setPhase } = useSession();
  const [q, setQ] = useState('');
  const [recent, setRecent] = useState<FsEntry[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    Promise.all(['/Documentos', '/Descargas', '/Escritorio'].map((d) => fs.list(d).catch(() => [])))
      .then((lists) => setRecent(lists.flat().filter((e) => !e.isDir).sort((a, b) => b.mtime - a.mtime).slice(0, 8)))
      .catch(() => {});
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      if (!ref.current?.contains(t) && !t.closest('[data-start-button]')) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const term = q.trim().toLowerCase();
  const apps = useMemo(() => APP_IDS.filter((id) => !term || APP_META[id].name.toLowerCase().includes(term)), [term]);
  const files = recent.filter((f) => !term || f.name.toLowerCase().includes(term));

  const power = (action: 'lock' | 'restart' | 'shutdown') => {
    onClose();
    if (action === 'lock') return setPhase('lock');
    closeAll();
    setPhase(action === 'restart' ? 'boot' : 'shutdown');
  };

  return (
    <div
      ref={ref}
      className="glass fixed left-2 z-[99995] flex w-[min(560px,_calc(100vw-16px))] flex-col rounded-2xl border border-cyan-400/25 shadow-2xl"
      style={{ bottom: TASKBAR_HEIGHT + 8, maxHeight: `calc(100vh - ${TASKBAR_HEIGHT + 24}px)` }}
    >
      <div className="p-4 pb-2">
        <label className="flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-900/80 px-3 py-2 focus-within:border-cyan-400">
          <Search size={15} className="text-gray-500" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              if (apps[0]) openApp(apps[0]);
              else if (files[0]) void openPath(files[0].path);
              onClose();
            }}
            placeholder="Buscar aplicaciones y documentos"
            className="w-full bg-transparent text-sm text-gray-100 placeholder:text-gray-500 focus:outline-none"
          />
        </label>
      </div>
      <div className="scrollbar-thin min-h-0 flex-1 overflow-auto px-4">
        <h3 className="mb-2 text-[11px] font-semibold tracking-wider text-gray-400 uppercase">Aplicaciones</h3>
        <div className="grid grid-cols-4 gap-1 sm:grid-cols-6">
          {apps.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                openApp(id);
                onClose();
              }}
              className="flex flex-col items-center gap-1.5 rounded-lg p-2 text-center hover:bg-white/10"
            >
              <AppIcon appId={id} size={40} />
              <span className="line-clamp-2 text-[10px] leading-tight text-gray-200">{APP_META[id].name}</span>
            </button>
          ))}
        </div>
        {files.length > 0 && (
          <>
            <h3 className="mt-3 mb-1 text-[11px] font-semibold tracking-wider text-gray-400 uppercase">Recientes</h3>
            <ul className="grid grid-cols-1 gap-0.5 pb-2 sm:grid-cols-2">
              {files.map((f) => (
                <li key={f.path}>
                  <button
                    type="button"
                    onClick={() => {
                      void openPath(f.path);
                      onClose();
                    }}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-white/10"
                  >
                    <FileIcon entry={f} size={26} />
                    <span className="min-w-0">
                      <span className="block truncate text-xs text-gray-200">{f.name}</span>
                      <span className="block truncate font-mono text-[10px] text-gray-500">{f.path}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        {apps.length === 0 && files.length === 0 && <p className="py-6 text-center text-xs text-gray-500">Sin resultados para “{q}”</p>}
      </div>
      <div className="flex items-center justify-between border-t border-gray-800 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <PhotoIcon size={32} ring="#00e5ff" className="rounded-full" avatar />
          <span className="text-sm font-medium text-gray-100">{settings.user}</span>
        </div>
        <div className="flex gap-1">
          <PowerButton label="Bloquear" onClick={() => power('lock')}>
            <Lock size={15} />
          </PowerButton>
          <PowerButton label="Reiniciar" onClick={() => power('restart')}>
            <RotateCcw size={15} />
          </PowerButton>
          <PowerButton label="Apagar" onClick={() => power('shutdown')} danger>
            <Power size={15} />
          </PowerButton>
        </div>
      </div>
    </div>
  );
}

function PowerButton({ label, onClick, children, danger }: { label: string; onClick: () => void; children: React.ReactNode; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`rounded-lg p-2 text-gray-300 ${danger ? 'hover:bg-red-500/20 hover:text-red-300' : 'hover:bg-white/10'}`}
    >
      {children}
    </button>
  );
}
