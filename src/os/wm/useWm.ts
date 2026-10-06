import { create } from 'zustand';
import { APP_META, type AppId } from '../apps/meta';
import { useSimStore } from '../../store/useSimStore';

export const TASKBAR_HEIGHT = 48;

export interface AppArgs {
  /** Archivo o carpeta con el que se abre la app. */
  path?: string;
  /** URL inicial del navegador. */
  url?: string;
  /** Pestaña inicial (Configuración, Administrador de tareas). */
  tab?: string;
}

export interface OsWindow {
  id: string;
  appId: AppId;
  title: string;
  args: AppArgs;
  /** Proceso del núcleo asociado a la ventana. */
  pid: number;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  minimized: boolean;
  maximized: boolean;
}

interface WmStore {
  windows: OsWindow[];
  focused: string | null;
  topZ: number;
  openApp: (appId: AppId, args?: AppArgs) => string;
  close: (id: string, opts?: { keepProcess?: boolean }) => void;
  focus: (id: string) => void;
  toggleMinimize: (id: string) => void;
  toggleMaximize: (id: string) => void;
  move: (id: string, x: number, y: number) => void;
  resize: (id: string, w: number, h: number) => void;
  setTitle: (id: string, title: string) => void;
  setArgs: (id: string, args: AppArgs) => void;
  closeAll: () => void;
}

let seq = 1;

/**
 * Gestor de ventanas: cada ventana es una instancia de una app y está ligada a un proceso
 * del núcleo. Abrir = crear proceso; cerrar = terminarlo (libera su memoria).
 */
export const useWm = create<WmStore>((set, get) => {
  const patch = (id: string, p: Partial<OsWindow>) =>
    set((s) => ({ windows: s.windows.map((w) => (w.id === id ? { ...w, ...p } : w)) }));

  return {
    windows: [],
    focused: null,
    topZ: 10,

    openApp: (appId, args = {}) => {
      const meta = APP_META[appId];
      if (meta.single) {
        const existing = get().windows.find((w) => w.appId === appId);
        if (existing) {
          if (Object.keys(args).length) patch(existing.id, { args });
          patch(existing.id, { minimized: false });
          get().focus(existing.id);
          return existing.id;
        }
      }
      const pid = useSimStore.getState().spawnApp(meta.process, meta.memory, meta.priority);
      const vw = window.innerWidth;
      const vh = window.innerHeight - TASKBAR_HEIGHT;
      const w = Math.min(meta.size.w, vw - 40);
      const h = Math.min(meta.size.h, vh - 40);
      const offset = (get().windows.length % 8) * 28;
      const id = `w${seq++}`;
      const z = get().topZ + 1;
      const win: OsWindow = {
        id,
        appId,
        title: meta.name,
        args,
        pid,
        x: Math.max(8, Math.round((vw - w) / 2) - 90 + offset),
        y: Math.max(8, Math.round((vh - h) / 2) - 50 + offset),
        w,
        h,
        z,
        minimized: false,
        maximized: false,
      };
      set((s) => ({ windows: [...s.windows, win], focused: id, topZ: z }));
      return id;
    },

    close: (id, opts) => {
      const win = get().windows.find((w) => w.id === id);
      if (!win) return;
      set((s) => ({ windows: s.windows.filter((w) => w.id !== id), focused: s.focused === id ? null : s.focused }));
      if (!opts?.keepProcess) useSimStore.getState().kill(win.pid, 'ventana cerrada');
    },
    focus: (id) => {
      const z = get().topZ + 1;
      set({ topZ: z, focused: id });
      patch(id, { z });
    },
    toggleMinimize: (id) => {
      const w = get().windows.find((x) => x.id === id);
      if (!w) return;
      if (w.minimized || get().focused !== id) {
        patch(id, { minimized: false });
        get().focus(id);
      } else {
        patch(id, { minimized: true });
        set({ focused: null });
      }
    },
    toggleMaximize: (id) => {
      const w = get().windows.find((x) => x.id === id);
      if (w) patch(id, { maximized: !w.maximized });
      get().focus(id);
    },
    move: (id, x, y) => patch(id, { x, y }),
    resize: (id, w, h) => patch(id, { w: Math.max(300, w), h: Math.max(200, h) }),
    setTitle: (id, title) => patch(id, { title }),
    setArgs: (id, args) => patch(id, { args }),
    closeAll: () => {
      for (const w of get().windows) get().close(w.id);
    },
  };
});
