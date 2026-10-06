import { create } from 'zustand';
import type { ReactNode } from 'react';

export type Phase = 'boot' | 'lock' | 'desktop' | 'shutdown';
export type Wallpaper = 'photo' | 'photo-blur' | 'photo-bw' | 'neon' | 'midnight';

export interface Settings {
  user: string;
  wallpaper: Wallpaper;
  accent: string;
}

export interface OsNotification {
  id: number;
  title: string;
  body?: string;
  tone?: 'info' | 'success' | 'warning' | 'error';
  time: number;
  action?: { label: string; run: () => void };
}

const SETTINGS_KEY = 'os-sim-settings';
const DEFAULTS: Settings = { user: 'Felix', wallpaper: 'photo', accent: '#00e5ff' };

function loadSettings(): Settings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') };
  } catch {
    return DEFAULTS;
  }
}

interface SessionStore {
  phase: Phase;
  settings: Settings;
  notifications: OsNotification[];
  toasts: number[];
  setPhase: (p: Phase) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  notify: (n: Omit<OsNotification, 'id' | 'time'>) => void;
  dismissToast: (id: number) => void;
  clearNotifications: () => void;
}

let nextId = 1;

/** `?desktop` en la URL salta el arranque y el bloqueo (pruebas y demostraciones). */
const initialPhase = (): Phase => {
  try {
    return new URLSearchParams(location.search).has('desktop') ? 'desktop' : 'boot';
  } catch {
    return 'boot';
  }
};

export const useSession = create<SessionStore>((set, get) => ({
  phase: initialPhase(),
  settings: loadSettings(),
  notifications: [],
  toasts: [],
  setPhase: (phase) => set({ phase }),
  updateSettings: (patch) => {
    const settings = { ...get().settings, ...patch };
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      /* almacenamiento no disponible: el ajuste vale solo para esta sesión */
    }
    set({ settings });
  },
  notify: (n) => {
    const id = nextId++;
    set((s) => ({ notifications: [{ ...n, id, time: Date.now() }, ...s.notifications].slice(0, 50), toasts: [...s.toasts, id] }));
    setTimeout(() => get().dismissToast(id), 6000);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t !== id) })),
  clearNotifications: () => set({ notifications: [], toasts: [] }),
}));

export const notify = (n: Omit<OsNotification, 'id' | 'time'>) => useSession.getState().notify(n);

// ------------------------------------------------------------ Diálogos modales del sistema

export type DialogRequest =
  | { kind: 'prompt'; title: string; label?: string; value: string; resolve: (v: string | null) => void }
  | { kind: 'confirm'; title: string; body?: ReactNode; danger?: boolean; resolve: (ok: boolean) => void }
  | {
      kind: 'file';
      mode: 'open' | 'save';
      title: string;
      dir: string;
      name: string;
      extensions?: string[];
      resolve: (path: string | null) => void;
    };

export const useDialogs = create<{ current: DialogRequest | null; close: () => void }>((set) => ({
  current: null,
  close: () => set({ current: null }),
}));

export function promptDialog(title: string, value = '', label?: string): Promise<string | null> {
  return new Promise((resolve) => useDialogs.setState({ current: { kind: 'prompt', title, value, label, resolve } }));
}

export function confirmDialog(title: string, body?: ReactNode, danger = false): Promise<boolean> {
  return new Promise((resolve) => useDialogs.setState({ current: { kind: 'confirm', title, body, danger, resolve } }));
}

export function fileDialog(opts: { mode: 'open' | 'save'; title?: string; dir?: string; name?: string; extensions?: string[] }): Promise<string | null> {
  return new Promise((resolve) =>
    useDialogs.setState({
      current: {
        kind: 'file',
        mode: opts.mode,
        title: opts.title ?? (opts.mode === 'open' ? 'Abrir archivo' : 'Guardar como'),
        dir: opts.dir ?? '/Documentos',
        name: opts.name ?? '',
        extensions: opts.extensions,
        resolve,
      },
    }),
  );
}
