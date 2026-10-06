import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

/** Única puerta entre la interfaz y el sistema real: expone `window.osApi`. */

const invoke = (channel: string) => (...args: unknown[]) => ipcRenderer.invoke(channel, ...args);

const on = (channel: string) => (cb: (payload: unknown) => void) => {
  const listener = (_e: IpcRendererEvent, payload: unknown) => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

contextBridge.exposeInMainWorld('osApi', {
  isElectron: true,
  fs: {
    list: invoke('fs:list'),
    read: invoke('fs:read'),
    write: invoke('fs:write'),
    mkdir: invoke('fs:mkdir'),
    rename: invoke('fs:rename'),
    stat: invoke('fs:stat'),
    unique: invoke('fs:unique'),
    trash: invoke('fs:trash'),
    restore: invoke('fs:restore'),
    emptyTrash: invoke('fs:emptyTrash'),
    remove: invoke('fs:remove'),
    openNative: invoke('fs:openNative'),
    revealRoot: invoke('fs:revealRoot'),
  },
  doc: { pdf: invoke('doc:pdf'), print: invoke('doc:print') },
  sys: {
    info: invoke('sys:info'),
    fullscreen: invoke('sys:fullscreen'),
    shutdown: invoke('sys:shutdown'),
    openExternal: invoke('sys:openExternal'),
  },
  events: {
    onNewTab: on('browser:new-tab'),
    onDownloadStart: on('download:start'),
    onDownloadProgress: on('download:progress'),
    onDownloadDone: on('download:done'),
  },
});
