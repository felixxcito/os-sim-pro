import { useCallback, useEffect, useRef, useState } from 'react';
import { APP_META } from './apps/meta';
import { basename } from './fs';
import { confirmDialog, fileDialog, notify } from './session';
import { useWm, type OsWindow } from './wm/useWm';

interface Options {
  extensions: string[];
  defaultName: string;
  /** Carga el archivo en el editor. */
  load: (path: string) => Promise<void>;
  /** Escribe el contenido actual en `path`. */
  save: (path: string) => Promise<void>;
  /** El editor está listo para recibir contenido (por defecto, sí). */
  ready?: boolean;
}

/**
 * Ciclo de vida de un documento en una ventana: abrir, guardar, guardar como,
 * marca de cambios sin guardar (•) en el título y atajos Ctrl/Cmd+S y Ctrl/Cmd+O.
 */
export function useDocument(win: OsWindow, opts: Options) {
  const [path, setPath] = useState<string | null>(win.args.path ?? null);
  const [dirty, setDirty] = useState(false);
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const setTitle = useWm((s) => s.setTitle);
  const appName = APP_META[win.appId].name;

  useEffect(() => {
    setTitle(win.id, `${dirty ? '• ' : ''}${path ? basename(path) : 'Sin título'} — ${appName}`);
  }, [path, dirty, appName, setTitle, win.id]);

  const ready = opts.ready ?? true;
  useEffect(() => {
    if (!win.args.path || !ready) return;
    optsRef.current
      .load(win.args.path)
      .then(() => {
        setPath(win.args.path!);
        setDirty(false);
      })
      .catch((e) => notify({ title: 'No se pudo abrir el archivo', body: String(e?.message ?? e), tone: 'error' }));
  }, [win.args.path, ready]);

  const saveAs = useCallback(async () => {
    const target = await fileDialog({
      mode: 'save',
      dir: path ? path.slice(0, path.lastIndexOf('/')) || '/Documentos' : '/Documentos',
      name: path ? basename(path) : optsRef.current.defaultName,
      extensions: optsRef.current.extensions,
    });
    if (!target) return false;
    try {
      await optsRef.current.save(target);
      setPath(target);
      setDirty(false);
      notify({ title: 'Guardado', body: target, tone: 'success' });
      return true;
    } catch (e) {
      notify({ title: 'Error al guardar', body: String((e as Error)?.message ?? e), tone: 'error' });
      return false;
    }
  }, [path]);

  const save = useCallback(async () => {
    if (!path) return saveAs();
    try {
      await optsRef.current.save(path);
      setDirty(false);
      notify({ title: 'Guardado', body: path, tone: 'success' });
      return true;
    } catch (e) {
      notify({ title: 'Error al guardar', body: String((e as Error)?.message ?? e), tone: 'error' });
      return false;
    }
  }, [path, saveAs]);

  const open = useCallback(async () => {
    if (dirty && !(await confirmDialog('Hay cambios sin guardar', '¿Descartarlos y abrir otro archivo?', true))) return;
    const target = await fileDialog({ mode: 'open', dir: '/Documentos', extensions: optsRef.current.extensions });
    if (!target) return;
    try {
      await optsRef.current.load(target);
      setPath(target);
      setDirty(false);
    } catch (e) {
      notify({ title: 'No se pudo abrir el archivo', body: String((e as Error)?.message ?? e), tone: 'error' });
    }
  }, [dirty]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    const k = e.key.toLowerCase();
    if (k === 's') {
      e.preventDefault();
      void (e.shiftKey ? saveAs() : save());
    } else if (k === 'o') {
      e.preventDefault();
      void open();
    }
  };

  return { path, dirty, markDirty: () => setDirty(true), save, saveAs, open, onKeyDown, setPath };
}
