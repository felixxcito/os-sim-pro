import type { Encoding, FsEntry } from './fs/types';

export interface DownloadStart {
  id: number;
  name: string;
  path: string;
  total: number;
}
export interface DownloadProgress {
  id: number;
  received: number;
  total: number;
}
export interface DownloadDone {
  id: number;
  state: 'completed' | 'cancelled' | 'interrupted';
  path: string;
}

export interface SysInfo {
  platform: string;
  arch: string;
  electron: string;
  chrome: string;
  node: string;
  host: string;
  cpus: number;
  totalMem: number;
  diskRoot: string;
}

/** API expuesta por electron/preload.cts (solo existe dentro del ejecutable). */
export interface OsApi {
  isElectron: true;
  fs: {
    list(dir: string): Promise<FsEntry[]>;
    read(path: string, enc?: Encoding): Promise<string>;
    write(path: string, data: string, enc?: Encoding): Promise<void>;
    mkdir(path: string): Promise<void>;
    rename(from: string, to: string): Promise<void>;
    stat(path: string): Promise<FsEntry | null>;
    unique(dir: string, name: string): Promise<string>;
    trash(path: string): Promise<string>;
    restore(name: string): Promise<string>;
    emptyTrash(): Promise<void>;
    remove(path: string): Promise<void>;
    openNative(path: string): Promise<string>;
    revealRoot(): Promise<string>;
  };
  doc: {
    pdf(html: string, target: string): Promise<string>;
    print(html: string): Promise<boolean>;
  };
  sys: {
    info(): Promise<SysInfo>;
    fullscreen(): Promise<void>;
    shutdown(): Promise<void>;
    openExternal(url: string): Promise<void>;
  };
  events: {
    onNewTab(cb: (url: string) => void): () => void;
    onDownloadStart(cb: (d: DownloadStart) => void): () => void;
    onDownloadProgress(cb: (d: DownloadProgress) => void): () => void;
    onDownloadDone(cb: (d: DownloadDone) => void): () => void;
  };
}

declare global {
  interface Window {
    osApi?: OsApi;
  }
}
