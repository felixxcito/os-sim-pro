import { create } from 'zustand';
import { useWm } from '../../os/wm/useWm';

/** Peticiones de "abrir en pestaña nueva" (enlaces target=_blank, archivos HTML/PDF). */
export const useBrowserBus = create<{ requests: { id: number; url: string; windowId: string }[] }>(() => ({ requests: [] }));

let seq = 1;

export function requestBrowserTab(url: string) {
  const wm = useWm.getState();
  const browsers = wm.windows.filter((w) => w.appId === 'browser').sort((a, b) => b.z - a.z);
  if (browsers.length === 0) {
    wm.openApp('browser', { url });
    return;
  }
  const target = browsers[0];
  useBrowserBus.setState((s) => ({ requests: [...s.requests, { id: seq++, url, windowId: target.id }] }));
  wm.focus(target.id);
  if (target.minimized) wm.toggleMinimize(target.id);
}

export function consumeBrowserRequests(windowId: string) {
  const mine = useBrowserBus.getState().requests.filter((r) => r.windowId === windowId);
  if (mine.length) useBrowserBus.setState((s) => ({ requests: s.requests.filter((r) => r.windowId !== windowId) }));
  return mine;
}
