import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, RotateCw, ZoomIn, ZoomOut } from 'lucide-react';
import { basename, dirname, extname, fs, type FsEntry } from '../../os/fs';
import type { AppProps } from '../../os/shell/OsWindowFrame';
import { useWm } from '../../os/wm/useWm';
import { APP_META } from '../../os/apps/meta';

const IMAGE_EXTS = APP_META.viewer.extensions!;

/** Visor de imágenes con zoom, rotación y navegación por la carpeta. */
export default function Viewer({ win }: AppProps) {
  const [path, setPath] = useState(win.args.path ?? '');
  const [url, setUrl] = useState('');
  const [siblings, setSiblings] = useState<FsEntry[]>([]);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const setTitle = useWm((s) => s.setTitle);

  useEffect(() => {
    if (win.args.path) setPath(win.args.path);
  }, [win.args.path]);

  useEffect(() => {
    if (!path) return;
    let revoke = '';
    fs.fileUrl(path).then((u) => {
      setUrl(u);
      if (u.startsWith('blob:')) revoke = u;
    });
    fs.list(dirname(path)).then((list) => setSiblings(list.filter((e) => IMAGE_EXTS.includes(extname(e.path)))));
    setZoom(1);
    setRotation(0);
    setTitle(win.id, `${basename(path)} — Visor`);
    return () => {
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [path, setTitle, win.id]);

  const index = siblings.findIndex((s) => s.path === path);
  const goto = (d: number) => siblings.length && setPath(siblings[(index + d + siblings.length) % siblings.length].path);

  if (!path) return <div className="flex h-full items-center justify-center text-xs text-gray-500">Abre una imagen desde el Explorador.</div>;

  return (
    <div
      className="flex h-full flex-col bg-black/80 outline-none"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') goto(1);
        if (e.key === 'ArrowLeft') goto(-1);
      }}
    >
      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-auto">
        {url && (
          <img
            src={url}
            alt={basename(path)}
            className="max-h-full max-w-full object-contain transition-transform duration-200"
            style={{ transform: `scale(${zoom}) rotate(${rotation}deg)` }}
            draggable={false}
          />
        )}
        {siblings.length > 1 && (
          <>
            <button type="button" onClick={() => goto(-1)} className="absolute left-2 rounded-full bg-black/60 p-2 text-white hover:bg-black/80" aria-label="Anterior">
              <ChevronLeft size={18} />
            </button>
            <button type="button" onClick={() => goto(1)} className="absolute right-2 rounded-full bg-black/60 p-2 text-white hover:bg-black/80" aria-label="Siguiente">
              <ChevronRight size={18} />
            </button>
          </>
        )}
      </div>
      <div className="flex items-center justify-center gap-2 border-t border-gray-800 py-1.5 text-gray-300">
        <button type="button" onClick={() => setZoom((z) => Math.max(0.2, z - 0.2))} className="rounded p-1 hover:bg-white/10" aria-label="Alejar">
          <ZoomOut size={15} />
        </button>
        <span className="w-12 text-center font-mono text-[11px]">{Math.round(zoom * 100)}%</span>
        <button type="button" onClick={() => setZoom((z) => Math.min(5, z + 0.2))} className="rounded p-1 hover:bg-white/10" aria-label="Acercar">
          <ZoomIn size={15} />
        </button>
        <button type="button" onClick={() => setRotation((r) => r + 90)} className="rounded p-1 hover:bg-white/10" aria-label="Girar">
          <RotateCw size={15} />
        </button>
        {siblings.length > 0 && <span className="font-mono text-[11px] text-gray-500">{index + 1} / {siblings.length}</span>}
      </div>
    </div>
  );
}
