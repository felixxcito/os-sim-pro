import { useCallback, useEffect, useState } from 'react';
import { FilePlus2, FileText, FolderOpen, FolderPlus, Image, Pencil, RefreshCw, Sheet, SquareTerminal, Trash2 } from 'lucide-react';
import { APP_IDS, APP_META, type AppId } from '../apps/meta';
import { fs, onFsChange, type FsEntry } from '../fs';
import { openPath } from '../openFile';
import { confirmDialog, notify, promptDialog } from '../session';
import { TASKBAR_HEIGHT, useWm } from '../wm/useWm';
import { openContextMenu } from './ContextMenu';
import { AppIcon, FileIcon } from './icons';

const DESKTOP = '/Escritorio';

export function useDir(dir: string) {
  const [entries, setEntries] = useState<FsEntry[]>([]);
  const refresh = useCallback(() => {
    fs.list(dir).then(setEntries).catch(() => setEntries([]));
  }, [dir]);
  useEffect(() => {
    refresh();
    const off = onFsChange((d) => d === dir && refresh());
    return () => {
      off();
    };
  }, [dir, refresh]);
  return { entries, refresh };
}

export async function renameEntry(entry: FsEntry) {
  const name = await promptDialog('Renombrar', entry.name, 'Nuevo nombre');
  if (!name || name === entry.name) return;
  if (name.includes('/')) return notify({ title: 'Nombre no válido', body: 'No puede contener "/"', tone: 'error' });
  const target = entry.path.slice(0, entry.path.lastIndexOf('/') + 1) + name;
  if (await fs.stat(target)) return notify({ title: 'Ya existe un archivo con ese nombre', tone: 'error' });
  await fs.rename(entry.path, target);
}

export async function trashEntry(entry: FsEntry) {
  await fs.trash(entry.path);
  notify({ title: 'Movido a la Papelera', body: entry.name, action: { label: 'Abrir Papelera', run: () => useWm.getState().openApp('trash') } });
}

export async function newTextFile(dir: string) {
  const path = await fs.unique(dir, 'Nuevo documento.txt');
  await fs.write(path, '');
  return path;
}

export async function newFolder(dir: string) {
  const path = await fs.unique(dir, 'Nueva carpeta');
  await fs.mkdir(path);
  return path;
}

type Item = { kind: 'app'; id: AppId } | { kind: 'file'; entry: FsEntry };

/** Escritorio: accesos directos a las apps y archivos de /Escritorio. */
export function DesktopSurface() {
  const openApp = useWm((s) => s.openApp);
  const { entries, refresh } = useDir(DESKTOP);
  const [selected, setSelected] = useState<string | null>(null);

  const items: Item[] = [
    ...APP_IDS.filter((id) => APP_META[id].desktop).map((id) => ({ kind: 'app' as const, id })),
    ...entries.map((entry) => ({ kind: 'file' as const, entry })),
  ];
  const keyOf = (it: Item) => (it.kind === 'app' ? `app:${it.id}` : it.entry.path);
  const open = (it: Item) => (it.kind === 'app' ? openApp(it.id) : void openPath(it.entry.path));

  const onKey = async (e: React.KeyboardEvent) => {
    const it = items.find((i) => keyOf(i) === selected);
    if (!it) return;
    if (e.key === 'Enter') open(it);
    if (it.kind !== 'file') return;
    if (e.key === 'Delete' || (e.key === 'Backspace' && e.metaKey)) await trashEntry(it.entry);
    if (e.key === 'F2') await renameEntry(it.entry);
  };

  const backgroundMenu = (e: React.MouseEvent) =>
    openContextMenu(e, [
      { label: 'Nuevo archivo de texto', icon: <FilePlus2 size={14} />, onClick: async () => renameEntryByPath(await newTextFile(DESKTOP)) },
      { label: 'Nueva carpeta', icon: <FolderPlus size={14} />, onClick: async () => renameEntryByPath(await newFolder(DESKTOP)) },
      { label: 'Nuevo documento (Escritor)', icon: <FileText size={14} />, onClick: () => openApp('writer') },
      { label: 'Nueva hoja de cálculo (Hojas)', icon: <Sheet size={14} />, onClick: () => openApp('sheets') },
      { separator: true },
      { label: 'Abrir terminal', icon: <SquareTerminal size={14} />, onClick: () => openApp('terminal', { path: DESKTOP }) },
      { label: 'Abrir carpeta Escritorio', icon: <FolderOpen size={14} />, onClick: () => openApp('files', { path: DESKTOP }) },
      { label: 'Cambiar fondo de pantalla…', icon: <Image size={14} />, onClick: () => openApp('settings', { tab: 'personalizar' }) },
      { label: 'Actualizar', icon: <RefreshCw size={14} />, onClick: refresh },
    ]);

  const itemMenu = (e: React.MouseEvent, it: Item) => {
    setSelected(keyOf(it));
    if (it.kind === 'app') {
      openContextMenu(e, [{ label: `Abrir ${APP_META[it.id].name}`, icon: <FolderOpen size={14} />, onClick: () => open(it) }]);
      return;
    }
    openContextMenu(e, [
      { label: 'Abrir', icon: <FolderOpen size={14} />, onClick: () => open(it) },
      { label: 'Renombrar', icon: <Pencil size={14} />, shortcut: 'F2', onClick: () => renameEntry(it.entry) },
      { separator: true },
      {
        label: 'Mover a la papelera',
        icon: <Trash2 size={14} />,
        danger: true,
        shortcut: 'Supr',
        onClick: async () => (await confirmDialog(`¿Mover "${it.entry.name}" a la papelera?`)) && trashEntry(it.entry),
      },
    ]);
  };

  return (
    <div
      className="absolute inset-0 p-3"
      style={{ bottom: TASKBAR_HEIGHT }}
      onContextMenu={backgroundMenu}
      onPointerDown={(e) => e.target === e.currentTarget && setSelected(null)}
    >
      <nav
        aria-label="Escritorio"
        tabIndex={0}
        onKeyDown={onKey}
        className="grid h-full w-fit content-start gap-1 outline-none"
        style={{ gridAutoFlow: 'column', gridTemplateRows: 'repeat(auto-fill, 100px)', gridAutoColumns: '88px' }}
      >
        {items.map((it) => {
          const key = keyOf(it);
          const label = it.kind === 'app' ? APP_META[it.id].name : it.entry.name;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setSelected(key)}
              onDoubleClick={() => open(it)}
              onContextMenu={(e) => itemMenu(e, it)}
              title={label}
              className={`flex h-[96px] flex-col items-center gap-1.5 rounded-lg p-1.5 text-center outline-none ${
                selected === key ? 'bg-cyan-400/20 ring-1 ring-cyan-300/60' : 'hover:bg-white/10'
              }`}
            >
              {it.kind === 'app' ? <AppIcon appId={it.id} size={50} /> : <FileIcon entry={it.entry} size={50} />}
              <span className="line-clamp-2 text-[11px] leading-tight font-medium break-all text-white [text-shadow:0_1px_3px_rgb(0_0_0/0.95)]">{label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

async function renameEntryByPath(path: string) {
  const entry = await fs.stat(path);
  if (entry) await renameEntry(entry);
}
