import { create } from 'zustand';
import { formatSize, notifyFsChange } from './fs';
import { openPath } from './openFile';
import { notify } from './session';
import { useSimStore } from '../store/useSimStore';

export interface Download {
  id: number;
  name: string;
  path: string;
  received: number;
  total: number;
  state: 'progressing' | 'completed' | 'cancelled' | 'interrupted';
}

export const useDownloads = create<{ items: Download[] }>(() => ({ items: [] }));

const update = (id: number, patch: Partial<Download>) =>
  useDownloads.setState((s) => ({ items: s.items.map((d) => (d.id === id ? { ...d, ...patch } : d)) }));

/**
 * Conecta las descargas reales del navegador (proceso principal de Electron) con el SO simulado:
 * cada descarga es una tarea de E/S sobre el Disco HDD y termina en /Descargas.
 */
export function initDownloads() {
  const api = window.osApi;
  if (!api) return () => {};
  const offs = [
    api.events.onDownloadStart((d) => {
      useDownloads.setState((s) => ({ items: [{ ...d, received: 0, state: 'progressing' as const }, ...s.items].slice(0, 30) }));
      const duration = Math.min(8, 2 + Math.round(d.total / (5 * 1024 * 1024)));
      useSimStore.getState().spawnIoTask(`descarga:${d.name.slice(0, 18)}`, 'HDD', duration);
      notify({ title: 'Descarga iniciada', body: `${d.name}${d.total ? ' · ' + formatSize(d.total) : ''}` });
    }),
    api.events.onDownloadProgress((d) => update(d.id, { received: d.received, total: d.total })),
    api.events.onDownloadDone((d) => {
      update(d.id, { state: d.state });
      notifyFsChange(d.path);
      if (d.state === 'completed') {
        notify({
          title: 'Descarga completada',
          body: d.path,
          tone: 'success',
          action: { label: 'Abrir', run: () => void openPath(d.path) },
        });
      } else {
        notify({ title: 'Descarga fallida', body: d.path, tone: 'error' });
      }
    }),
  ];
  return () => offs.forEach((off) => off());
}
