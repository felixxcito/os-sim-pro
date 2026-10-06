import { create } from 'zustand';

export type AppId = 'control' | 'processes' | 'memory' | 'resources' | 'analysis' | 'log';

export interface WindowState {
  id: AppId;
  open: boolean;
  minimized: boolean;
  maximized: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
}

export const TASKBAR_HEIGHT = 52;
export const ICON_COLUMN = 104;
export const MOBILE_BREAKPOINT = 900;
const GAP = 8;

/** Distribución tipo dashboard, en fracciones del área útil del escritorio. */
const SLOTS: Record<AppId, [number, number, number, number]> = {
  control: [0, 0, 0.25, 0.57],
  processes: [0.25, 0, 0.47, 0.57],
  resources: [0.72, 0, 0.28, 0.57],
  memory: [0, 0.57, 0.42, 0.43],
  analysis: [0.42, 0.57, 0.58, 0.43],
  log: [0.5, 0.2, 0.42, 0.5],
};

export const APP_ORDER: AppId[] = ['control', 'processes', 'memory', 'resources', 'analysis', 'log'];

export const isMobile = () => typeof window !== 'undefined' && window.innerWidth < MOBILE_BREAKPOINT;

function layout(id: AppId) {
  const W = Math.max(window.innerWidth, MOBILE_BREAKPOINT) - ICON_COLUMN - GAP;
  const H = Math.max(window.innerHeight, 560) - TASKBAR_HEIGHT - GAP;
  const [fx, fy, fw, fh] = SLOTS[id];
  return {
    x: Math.round(ICON_COLUMN + fx * W),
    y: Math.round(GAP + fy * H),
    w: Math.round(fw * W - GAP),
    h: Math.round(fh * H - GAP),
  };
}

function initialWindows(): Record<AppId, WindowState> {
  const mobile = isMobile();
  const out = {} as Record<AppId, WindowState>;
  APP_ORDER.forEach((id, i) => {
    const open = mobile ? id === 'control' : id !== 'log';
    out[id] = { id, open, minimized: false, maximized: false, z: i + 1, ...layout(id) };
  });
  return out;
}

interface WindowStore {
  windows: Record<AppId, WindowState>;
  topZ: number;
  focused: AppId | null;
  open: (id: AppId) => void;
  close: (id: AppId) => void;
  focus: (id: AppId) => void;
  toggleMinimize: (id: AppId) => void;
  toggleMaximize: (id: AppId) => void;
  move: (id: AppId, x: number, y: number) => void;
  resize: (id: AppId, w: number, h: number) => void;
  arrange: () => void;
}

export const useWindowStore = create<WindowStore>((set, get) => {
  const patch = (id: AppId, p: Partial<WindowState>) =>
    set((s) => ({ windows: { ...s.windows, [id]: { ...s.windows[id], ...p } } }));

  return {
    windows: initialWindows(),
    topZ: APP_ORDER.length,
    focused: 'processes',

    focus: (id) => {
      const z = get().topZ + 1;
      set({ topZ: z, focused: id });
      patch(id, { z });
    },
    open: (id) => {
      patch(id, { open: true, minimized: false });
      get().focus(id);
    },
    close: (id) => {
      patch(id, { open: false, maximized: false });
      if (get().focused === id) set({ focused: null });
    },
    toggleMinimize: (id) => {
      const w = get().windows[id];
      if (w.minimized || get().focused !== id) {
        patch(id, { minimized: false, open: true });
        get().focus(id);
      } else {
        patch(id, { minimized: true });
        set({ focused: null });
      }
    },
    toggleMaximize: (id) => {
      patch(id, { maximized: !get().windows[id].maximized });
      get().focus(id);
    },
    move: (id, x, y) => patch(id, { x, y }),
    resize: (id, w, h) => patch(id, { w: Math.max(280, w), h: Math.max(180, h) }),
    arrange: () =>
      set((s) => {
        const windows = { ...s.windows };
        for (const id of APP_ORDER) {
          const open = id !== 'log' || windows.log.open;
          windows[id] = { ...windows[id], ...layout(id), open, minimized: false, maximized: false };
        }
        return { windows };
      }),
  };
});
