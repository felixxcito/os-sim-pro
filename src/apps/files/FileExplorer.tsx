import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ClipboardPaste,
  Copy,
  ExternalLink,
  FilePlus2,
  FolderOpen,
  FolderPlus,
  HardDrive,
  LayoutGrid,
  List,
  Pencil,
  RotateCcw,
  Scissors,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import { create } from 'zustand';
import { Button } from '../../components/ui/primitives';
import { APP_META, type AppId } from '../../os/apps/meta';
import { basename, bytesToBase64, dirname, formatSize, fs, join, SYSTEM_FOLDERS, type FsEntry } from '../../os/fs';
import { openPath } from '../../os/openFile';
import { confirmDialog, notify } from '../../os/session';
import { openContextMenu, type MenuItem } from '../../os/shell/ContextMenu';
import { newFolder, newTextFile, renameEntry, trashEntry, useDir } from '../../os/shell/DesktopSurface';
import { AppIcon, FileIcon } from '../../os/shell/icons';
import type { AppProps } from '../../os/shell/OsWindowFrame';
import { useWm } from '../../os/wm/useWm';

/** Portapapeles de archivos compartido entre ventanas del Explorador. */
const useFileClipboard = create<{ path: string | null; mode: 'copy' | 'cut' }>(() => ({ path: null, mode: 'copy' }));

async function paste(dir: string) {
  const { path, mode } = useFileClipboard.getState();
  if (!path) return;
  const src = await fs.stat(path);
  if (!src) return notify({ title: 'El archivo copiado ya no existe', tone: 'error' });
  const target = await fs.unique(dir, src.name);
  if (mode === 'cut') {
    if (target.startsWith(path + '/')) return notify({ title: 'No se puede mover una carpeta dentro de sí misma', tone: 'error' });
    await fs.rename(path, target);
    useFileClipboard.setState({ path: null });
  } else {
    if (src.isDir) return notify({ title: 'Copiar carpetas no está disponible; usa Cortar para moverlas', tone: 'warning' });
    await fs.write(target, await fs.read(path, 'base64'), 'base64');
  }
}

const OPEN_WITH: AppId[] = ['writer', 'sheets', 'notepad', 'browser', 'viewer'];

export default function FileExplorer({ win, trashMode = false }: AppProps & { trashMode?: boolean }) {
  const setTitle = useWm((s) => s.setTitle);
  const openApp = useWm((s) => s.openApp);
  const start = trashMode ? '/Papelera' : win.args.path ?? '/Documentos';
  const [history, setHistory] = useState({ stack: [start], index: 0 });
  const dir = history.stack[history.index];
  const { entries } = useDir(dir);
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const upload = useRef<HTMLInputElement>(null);
  const inTrash = dir === '/Papelera' || dir.startsWith('/Papelera/');
  const clip = useFileClipboard();

  const go = (path: string) => {
    setHistory((h) => ({ stack: [...h.stack.slice(0, h.index + 1), path], index: h.index + 1 }));
    setSelected(null);
  };

  useEffect(() => {
    if (win.args.path && win.args.path !== dir && !trashMode) go(win.args.path);
  }, [win.args.path]);

  useEffect(() => {
    setTitle(win.id, trashMode ? 'Papelera' : `Explorador — ${dir === '/' ? 'Este equipo' : basename(dir)}`);
  }, [dir, setTitle, win.id, trashMode]);

  const visible = useMemo(() => entries.filter((e) => e.name.toLowerCase().includes(query.toLowerCase())), [entries, query]);
  const current = visible.find((e) => e.path === selected) ?? null;

  const open = (e: FsEntry) => (e.isDir ? go(e.path) : void openPath(e.path));

  const restore = async (e: FsEntry) => {
    const to = await fs.restore(e.name);
    notify({ title: 'Restaurado', body: to, tone: 'success' });
  };
  const destroy = async (e: FsEntry) => {
    if (await confirmDialog(`¿Eliminar "${e.name}" definitivamente?`, 'Esta acción no se puede deshacer.', true)) await fs.remove(e.path);
  };

  const itemMenu = (ev: React.MouseEvent, e: FsEntry) => {
    setSelected(e.path);
    const items: MenuItem[] = inTrash
      ? [
          { label: 'Restaurar', icon: <RotateCcw size={14} />, onClick: () => restore(e) },
          { label: 'Eliminar definitivamente', icon: <Trash2 size={14} />, danger: true, onClick: () => destroy(e) },
        ]
      : [
          { label: 'Abrir', icon: <FolderOpen size={14} />, onClick: () => open(e) },
          ...(!e.isDir
            ? OPEN_WITH.map((app) => ({
                label: `Abrir con ${APP_META[app].name}`,
                icon: <AppIcon appId={app} size={14} />,
                onClick: () => openApp(app, { path: e.path }),
              }))
            : []),
          { separator: true },
          { label: 'Cortar', icon: <Scissors size={14} />, onClick: () => useFileClipboard.setState({ path: e.path, mode: 'cut' }) },
          { label: 'Copiar', icon: <Copy size={14} />, disabled: e.isDir, onClick: () => useFileClipboard.setState({ path: e.path, mode: 'copy' }) },
          { label: 'Renombrar', icon: <Pencil size={14} />, shortcut: 'F2', onClick: () => renameEntry(e) },
          { separator: true },
          { label: 'Mover a la papelera', icon: <Trash2 size={14} />, danger: true, shortcut: 'Supr', onClick: () => trashEntry(e) },
        ];
    openContextMenu(ev, items);
  };

  const backgroundMenu = (ev: React.MouseEvent) =>
    openContextMenu(
      ev,
      inTrash
        ? [{ label: 'Vaciar papelera', icon: <Trash2 size={14} />, danger: true, onClick: emptyTrash }]
        : [
            { label: 'Nueva carpeta', icon: <FolderPlus size={14} />, onClick: () => newFolder(dir).then(select) },
            { label: 'Nuevo archivo de texto', icon: <FilePlus2 size={14} />, onClick: () => newTextFile(dir).then(select) },
            { label: 'Pegar', icon: <ClipboardPaste size={14} />, disabled: !clip.path, onClick: () => paste(dir) },
            { label: 'Importar archivos del equipo…', icon: <Upload size={14} />, onClick: () => upload.current?.click() },
          ],
    );

  const select = async (path: string) => {
    setSelected(path);
    const e = await fs.stat(path);
    if (e) await renameEntry(e);
  };

  const emptyTrash = async () => {
    if (await confirmDialog('¿Vaciar la papelera?', 'Los archivos se eliminarán definitivamente.', true)) {
      await fs.emptyTrash();
      notify({ title: 'Papelera vaciada' });
    }
  };

  const onKey = async (e: React.KeyboardEvent) => {
    if ((e.target as HTMLElement).tagName === 'INPUT') return;
    if (e.key === 'Backspace' && !e.metaKey) return go(dirname(dir));
    if (!current) return;
    if (e.key === 'Enter') open(current);
    if (inTrash) return;
    if (e.key === 'Delete' || (e.key === 'Backspace' && e.metaKey)) await trashEntry(current);
    if (e.key === 'F2') await renameEntry(current);
    if ((e.ctrlKey || e.metaKey) && e.key === 'c') useFileClipboard.setState({ path: current.path, mode: 'copy' });
    if ((e.ctrlKey || e.metaKey) && e.key === 'x') useFileClipboard.setState({ path: current.path, mode: 'cut' });
  };

  const importFiles = async (files: FileList | null) => {
    for (const f of Array.from(files ?? [])) {
      const target = await fs.unique(dir, f.name);
      await fs.write(target, bytesToBase64(new Uint8Array(await f.arrayBuffer())), 'base64');
    }
    if (files?.length) notify({ title: `${files.length} archivo(s) importado(s)`, body: dir, tone: 'success' });
  };

  const crumbs = dir.split('/').filter(Boolean);

  return (
    <div className="flex h-full flex-col text-gray-200" onKeyDown={onKey} tabIndex={-1}>
      <div className="flex items-center gap-1 border-b border-gray-800 bg-gray-900/60 px-2 py-1.5">
        <IconBtn label="Atrás" disabled={history.index === 0} onClick={() => setHistory((h) => ({ ...h, index: h.index - 1 }))}>
          <ArrowLeft size={15} />
        </IconBtn>
        <IconBtn label="Adelante" disabled={history.index >= history.stack.length - 1} onClick={() => setHistory((h) => ({ ...h, index: h.index + 1 }))}>
          <ArrowRight size={15} />
        </IconBtn>
        <IconBtn label="Subir" disabled={dir === '/'} onClick={() => go(dirname(dir))}>
          <ArrowUp size={15} />
        </IconBtn>
        <div className="mx-1 flex min-w-0 flex-1 items-center gap-0.5 rounded-md border border-gray-700 bg-gray-950/70 px-2 py-1 text-xs">
          <button type="button" className="text-gray-400 hover:text-cyan-300" onClick={() => go('/')}>
            <HardDrive size={13} />
          </button>
          {crumbs.map((c, i) => (
            <span key={i} className="flex items-center gap-0.5 truncate">
              <span className="text-gray-600">›</span>
              <button type="button" className="truncate hover:text-cyan-300" onClick={() => go('/' + crumbs.slice(0, i + 1).join('/'))}>
                {c}
              </button>
            </span>
          ))}
        </div>
        <label className="flex w-40 items-center gap-1 rounded-md border border-gray-700 bg-gray-950/70 px-2 py-1">
          <Search size={12} className="text-gray-500" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar" className="w-full bg-transparent text-xs focus:outline-none" />
        </label>
      </div>
      <div className="flex items-center gap-1 border-b border-gray-800 px-2 py-1">
        {inTrash ? (
          <>
            <Button tone="red" icon={<Trash2 size={13} />} onClick={emptyTrash} disabled={entries.length === 0}>
              Vaciar papelera
            </Button>
            <Button icon={<RotateCcw size={13} />} disabled={!current} onClick={() => current && restore(current)}>
              Restaurar
            </Button>
          </>
        ) : (
          <>
            <Button icon={<FolderPlus size={13} />} onClick={() => newFolder(dir).then(select)}>
              Nueva carpeta
            </Button>
            <Button icon={<FilePlus2 size={13} />} onClick={() => newTextFile(dir).then(select)}>
              Nuevo .txt
            </Button>
            <Button icon={<Upload size={13} />} onClick={() => upload.current?.click()} title="Copiar archivos desde tu computadora">
              Importar
            </Button>
            <Button icon={<ClipboardPaste size={13} />} disabled={!clip.path} onClick={() => paste(dir)}>
              Pegar
            </Button>
            {current && (
              <Button tone="red" icon={<Trash2 size={13} />} onClick={() => trashEntry(current)}>
                Eliminar
              </Button>
            )}
          </>
        )}
        <div className="flex-1" />
        {window.osApi && (
          <IconBtn label="Abrir el disco virtual en el sistema real" onClick={() => window.osApi?.fs.revealRoot()}>
            <ExternalLink size={14} />
          </IconBtn>
        )}
        <IconBtn label="Vista de iconos" active={view === 'grid'} onClick={() => setView('grid')}>
          <LayoutGrid size={14} />
        </IconBtn>
        <IconBtn label="Vista de lista" active={view === 'list'} onClick={() => setView('list')}>
          <List size={14} />
        </IconBtn>
        <input ref={upload} type="file" multiple hidden onChange={(e) => void importFiles(e.target.files).then(() => (e.target.value = ''))} />
      </div>

      <div className="flex min-h-0 flex-1">
        {!trashMode && (
          <nav className="w-40 shrink-0 space-y-0.5 border-r border-gray-800 p-2 text-xs" aria-label="Lugares">
            {SYSTEM_FOLDERS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => go('/' + f)}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left ${dir.startsWith('/' + f) ? 'bg-amber-400/15 text-amber-100' : 'hover:bg-white/5'}`}
              >
                <FileIcon entry={{ isDir: true, path: '/' + f }} size={18} />
                {f}
              </button>
            ))}
          </nav>
        )}
        <div
          className="scrollbar-thin min-w-0 flex-1 overflow-auto p-2"
          onContextMenu={backgroundMenu}
          onPointerDown={(e) => e.target === e.currentTarget && setSelected(null)}
        >
          {visible.length === 0 && <p className="py-12 text-center text-xs text-gray-500">{query ? 'Sin resultados' : 'Esta carpeta está vacía'}</p>}
          {view === 'grid' ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(92px,1fr))] gap-1">
              {visible.map((e) => (
                <button
                  key={e.path}
                  type="button"
                  onClick={() => setSelected(e.path)}
                  onDoubleClick={() => open(e)}
                  onContextMenu={(ev) => itemMenu(ev, e)}
                  title={e.name}
                  className={`flex flex-col items-center gap-1.5 rounded-lg p-2 text-center ${selected === e.path ? 'bg-cyan-400/15 ring-1 ring-cyan-400/50' : 'hover:bg-white/5'} ${
                    clip.mode === 'cut' && clip.path === e.path ? 'opacity-50' : ''
                  }`}
                >
                  <FileIcon entry={e} size={44} />
                  <span className="line-clamp-2 text-[11px] leading-tight break-all">{e.name}</span>
                </button>
              ))}
            </div>
          ) : (
            visible.length > 0 && (
              <table className="w-full text-left text-xs">
                <thead className="text-[10px] tracking-wider text-gray-500 uppercase">
                  <tr>
                    <th className="px-2 py-1 font-medium">Nombre</th>
                    <th className="px-2 py-1 font-medium">Modificado</th>
                    <th className="px-2 py-1 text-right font-medium">Tamaño</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((e) => (
                    <tr
                      key={e.path}
                      onClick={() => setSelected(e.path)}
                      onDoubleClick={() => open(e)}
                      onContextMenu={(ev) => itemMenu(ev, e)}
                      className={`cursor-default ${selected === e.path ? 'bg-cyan-400/15' : 'hover:bg-white/5'}`}
                    >
                      <td className="flex items-center gap-2 px-2 py-1">
                        <FileIcon entry={e} size={20} /> <span className="truncate">{e.name}</span>
                      </td>
                      <td className="px-2 py-1 text-gray-400">{new Date(e.mtime).toLocaleString('es')}</td>
                      <td className="px-2 py-1 text-right font-mono text-gray-400">{e.isDir ? '—' : formatSize(e.size)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          )}
        </div>
      </div>
      <div className="flex justify-between border-t border-gray-800 px-3 py-1 text-[11px] text-gray-500">
        <span>{visible.length} elementos</span>
        <span className="truncate">{current ? `${current.name}${current.isDir ? '' : ' · ' + formatSize(current.size)}` : join(dir)}</span>
      </div>
    </div>
  );
}

function IconBtn({
  label,
  onClick,
  children,
  disabled,
  active,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-md p-1.5 disabled:opacity-30 ${active ? 'bg-white/15 text-white' : 'text-gray-400 hover:bg-white/10 hover:text-gray-100'}`}
    >
      {children}
    </button>
  );
}
