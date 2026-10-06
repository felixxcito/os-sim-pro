import { IdbFs } from './idbFs';
import { dirname, type Encoding, type FileSystemProvider } from './types';

export * from './types';

/** Proveedor activo: disco real en el ejecutable, IndexedDB en el navegador. */
function createProvider(): FileSystemProvider {
  const api = window.osApi;
  if (!api) return new IdbFs();
  return {
    kind: 'electron',
    list: api.fs.list,
    read: api.fs.read,
    write: api.fs.write,
    mkdir: api.fs.mkdir,
    rename: api.fs.rename,
    stat: api.fs.stat,
    unique: api.fs.unique,
    trash: api.fs.trash,
    restore: api.fs.restore,
    emptyTrash: api.fs.emptyTrash,
    remove: api.fs.remove,
    fileUrl: async (path: string) => 'osdisk://disco' + path.split('/').map(encodeURIComponent).join('/'),
  };
}

const provider = createProvider();

// ------------------------------------------------------------ Notificación de cambios

type Listener = (dir: string) => void;
const listeners = new Set<Listener>();

/** Suscribe a cambios en el disco (el Explorador y el Escritorio se refrescan con esto). */
export function onFsChange(fn: Listener) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function notifyFsChange(...paths: string[]) {
  const dirs = new Set(paths.flatMap((p) => [p, dirname(p)]));
  for (const d of dirs) listeners.forEach((fn) => fn(d));
}

/** Fachada: todas las escrituras avisan a los observadores. */
export const fs = {
  kind: provider.kind,
  list: provider.list.bind(provider),
  read: provider.read.bind(provider),
  stat: provider.stat.bind(provider),
  unique: provider.unique.bind(provider),
  fileUrl: provider.fileUrl.bind(provider),
  async write(path: string, data: string, enc?: Encoding) {
    await provider.write(path, data, enc);
    notifyFsChange(path);
  },
  async mkdir(path: string) {
    await provider.mkdir(path);
    notifyFsChange(path);
  },
  async rename(from: string, to: string) {
    await provider.rename(from, to);
    notifyFsChange(from, to);
  },
  async trash(path: string) {
    const t = await provider.trash(path);
    notifyFsChange(path, t);
    return t;
  },
  async restore(name: string) {
    const t = await provider.restore(name);
    notifyFsChange('/Papelera/' + name, t);
    return t;
  },
  async emptyTrash() {
    await provider.emptyTrash();
    notifyFsChange('/Papelera/x');
  },
  async remove(path: string) {
    await provider.remove(path);
    notifyFsChange(path);
  },
};

// ------------------------------------------------------------ Binarios (docx, xlsx, imágenes)

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(bin);
}

export function base64ToBytes(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

export async function writeBinary(path: string, data: ArrayBuffer | Uint8Array | Blob) {
  const bytes = data instanceof Blob ? new Uint8Array(await data.arrayBuffer()) : new Uint8Array(data as ArrayBuffer);
  await fs.write(path, bytesToBase64(bytes), 'base64');
}

export async function readBinary(path: string): Promise<ArrayBuffer> {
  const bytes = base64ToBytes(await fs.read(path, 'base64'));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export const formatSize = (n: number) =>
  n < 1024 ? `${n} B` : n < 1024 ** 2 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 ** 2).toFixed(1)} MB`;
