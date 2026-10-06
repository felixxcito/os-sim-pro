import { useEffect, useState } from 'react';
import { ArrowUp, FolderPlus } from 'lucide-react';
import { Button } from '../../components/ui/primitives';
import { dirname, extname, fs, join, SYSTEM_FOLDERS, type FsEntry } from '../fs';
import { useDialogs, type DialogRequest } from '../session';
import { FileIcon } from './icons';

/** Diálogos modales del sistema: pedir texto, confirmar y abrir/guardar archivos. */
export function DialogHost() {
  const { current, close } = useDialogs();
  if (!current) return null;
  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/50 backdrop-blur-[2px]" role="presentation">
      <div role="dialog" aria-modal="true" aria-label={current.title} className="glass w-[min(92vw,_560px)] rounded-xl border border-gray-700 shadow-2xl">
        <div className="border-b border-gray-800 px-4 py-2.5 text-sm font-semibold text-gray-100">{current.title}</div>
        {current.kind === 'prompt' && <PromptBody req={current} close={close} />}
        {current.kind === 'confirm' && <ConfirmBody req={current} close={close} />}
        {current.kind === 'file' && <FileBody req={current} close={close} />}
      </div>
    </div>
  );
}

function PromptBody({ req, close }: { req: Extract<DialogRequest, { kind: 'prompt' }>; close: () => void }) {
  const [value, setValue] = useState(req.value);
  const done = (v: string | null) => {
    close();
    req.resolve(v);
  };
  return (
    <form
      className="space-y-3 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        done(value.trim() || null);
      }}
    >
      {req.label && <label className="block text-xs text-gray-400">{req.label}</label>}
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onFocus={(e) => {
          const dot = e.target.value.lastIndexOf('.');
          e.target.setSelectionRange(0, dot > 0 ? dot : e.target.value.length);
        }}
        className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 focus:border-cyan-400 focus:outline-none"
      />
      <div className="flex justify-end gap-2">
        <Button onClick={() => done(null)}>Cancelar</Button>
        <Button tone="cyan" type="submit">
          Aceptar
        </Button>
      </div>
    </form>
  );
}

function ConfirmBody({ req, close }: { req: Extract<DialogRequest, { kind: 'confirm' }>; close: () => void }) {
  const done = (ok: boolean) => {
    close();
    req.resolve(ok);
  };
  return (
    <div className="space-y-4 p-4">
      {req.body && <div className="text-sm text-gray-300">{req.body}</div>}
      <div className="flex justify-end gap-2">
        <Button onClick={() => done(false)}>Cancelar</Button>
        <Button tone={req.danger ? 'red' : 'cyan'} onClick={() => done(true)} autoFocus>
          Aceptar
        </Button>
      </div>
    </div>
  );
}

function FileBody({ req, close }: { req: Extract<DialogRequest, { kind: 'file' }>; close: () => void }) {
  const [dir, setDir] = useState(req.dir);
  const [name, setName] = useState(req.name);
  const [entries, setEntries] = useState<FsEntry[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    fs.list(dir).then(setEntries).catch(() => setEntries([]));
  }, [dir]);

  const visible = entries.filter((e) => e.isDir || !req.extensions || req.extensions.includes(extname(e.path)));
  const done = (path: string | null) => {
    close();
    req.resolve(path);
  };

  const submit = async () => {
    if (!name.trim()) return setError('Escribe un nombre de archivo');
    let file = name.trim();
    if (req.mode === 'save' && req.extensions?.length && !req.extensions.includes(extname(file))) file += '.' + req.extensions[0];
    const path = join(dir, file);
    const exists = await fs.stat(path);
    if (req.mode === 'open' && !exists) return setError('El archivo no existe');
    done(path);
  };

  return (
    <div className="flex h-[420px] flex-col">
      <div className="flex min-h-0 flex-1">
        <nav className="w-36 shrink-0 space-y-0.5 border-r border-gray-800 p-2">
          {SYSTEM_FOLDERS.filter((f) => f !== 'Papelera').map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setDir('/' + f)}
              className={`w-full rounded px-2 py-1 text-left text-xs ${dir === '/' + f ? 'bg-cyan-400/15 text-cyan-200' : 'text-gray-300 hover:bg-white/5'}`}
            >
              {f}
            </button>
          ))}
        </nav>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-1 border-b border-gray-800 px-2 py-1.5">
            <button type="button" className="rounded p-1 text-gray-400 hover:bg-white/10" onClick={() => setDir(dirname(dir))} aria-label="Subir">
              <ArrowUp size={14} />
            </button>
            <span className="flex-1 truncate font-mono text-[11px] text-gray-400">{dir}</span>
            <button
              type="button"
              className="rounded p-1 text-gray-400 hover:bg-white/10"
              aria-label="Nueva carpeta"
              onClick={async () => {
                const p = await fs.unique(dir, 'Nueva carpeta');
                await fs.mkdir(p);
                setEntries(await fs.list(dir));
              }}
            >
              <FolderPlus size={14} />
            </button>
          </div>
          <ul className="scrollbar-thin flex-1 overflow-auto p-1">
            {visible.map((e) => (
              <li key={e.path}>
                <button
                  type="button"
                  className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-white/5 ${name === e.name ? 'bg-cyan-400/10' : ''}`}
                  onClick={() => (e.isDir ? setDir(e.path) : setName(e.name))}
                  onDoubleClick={() => !e.isDir && done(e.path)}
                >
                  <FileIcon entry={e} size={22} />
                  <span className="truncate text-gray-200">{e.name}</span>
                </button>
              </li>
            ))}
            {visible.length === 0 && <li className="p-4 text-center text-xs text-gray-500">Carpeta vacía</li>}
          </ul>
        </div>
      </div>
      <form
        className="flex items-center gap-2 border-t border-gray-800 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <input
          autoFocus
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError('');
          }}
          placeholder="Nombre del archivo"
          className="min-w-0 flex-1 rounded-md border border-gray-700 bg-gray-900 px-2 py-1.5 text-xs text-gray-100 focus:border-cyan-400 focus:outline-none"
        />
        {req.extensions && <span className="font-mono text-[10px] text-gray-500">.{req.extensions.join(' .')}</span>}
        <Button onClick={() => done(null)}>Cancelar</Button>
        <Button tone="cyan" type="submit">
          {req.mode === 'open' ? 'Abrir' : 'Guardar'}
        </Button>
      </form>
      {error && <p className="px-3 pb-2 text-xs text-red-300">{error}</p>}
    </div>
  );
}
