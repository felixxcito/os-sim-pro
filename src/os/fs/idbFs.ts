import { basename, dirname, extname, join, SYSTEM_FOLDERS, type Encoding, type FileSystemProvider, type FsEntry } from './types';

/**
 * Disco virtual sobre IndexedDB para el modo web (npm run dev:web) y las pruebas en navegador.
 * Cada archivo o carpeta es un registro con su ruta como clave.
 */

interface Row {
  path: string;
  isDir: boolean;
  data?: string;
  enc?: Encoding;
  size: number;
  mtime: number;
}

const DB = 'os-sim-disk';
const STORE = 'files';
const TRASH_INDEX = '/Papelera/.papelera.json';

const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
  txt: 'text/plain',
  html: 'text/html',
};

const sizeOf = (data: string, enc: Encoding) => (enc === 'base64' ? Math.floor((data.length * 3) / 4) : new Blob([data]).size);

export class IdbFs implements FileSystemProvider {
  readonly kind = 'indexeddb' as const;
  private db: Promise<IDBDatabase>;

  constructor() {
    this.db = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'path' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    void this.seed();
  }

  private async tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.db;
    return new Promise((resolve, reject) => {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  private get = (path: string) => this.tx<Row | undefined>('readonly', (s) => s.get(path));
  private put = (row: Row) => this.tx('readwrite', (s) => s.put(row));
  private del = (path: string) => this.tx('readwrite', (s) => s.delete(path));
  private all = () => this.tx<Row[]>('readonly', (s) => s.getAll());

  private async seed() {
    if (await this.get('/Escritorio')) return;
    for (const f of SYSTEM_FOLDERS) await this.put({ path: `/${f}`, isDir: true, size: 0, mtime: Date.now() });
    await this.write('/Escritorio/Bienvenido.txt', 'Bienvenido a OS-Sim Pro (modo web).\n\nLos archivos se guardan en el almacenamiento del navegador.\n');
  }

  private toEntry(r: Row): FsEntry {
    return { name: basename(r.path), path: r.path, isDir: r.isDir, size: r.size, mtime: r.mtime };
  }

  async list(dir: string): Promise<FsEntry[]> {
    await this.seed();
    const prefix = dir === '/' ? '/' : dir + '/';
    return (await this.all())
      .filter((r) => r.path.startsWith(prefix) && !r.path.slice(prefix.length).includes('/') && r.path !== dir)
      .filter((r) => !basename(r.path).startsWith('.'))
      .map((r) => this.toEntry(r))
      .sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name, 'es'));
  }

  async read(path: string, enc: Encoding = 'utf8'): Promise<string> {
    const r = await this.get(path);
    if (!r || r.isDir) throw new Error(`No existe: ${path}`);
    const data = r.data ?? '';
    if ((r.enc ?? 'utf8') === enc) return data;
    if (enc === 'base64') {
      const bytes = new TextEncoder().encode(data);
      let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return btoa(bin);
    }
    return new TextDecoder().decode(Uint8Array.from(atob(data), (c) => c.charCodeAt(0)));
  }

  async write(path: string, data: string, enc: Encoding = 'utf8') {
    await this.mkdir(dirname(path));
    await this.put({ path, isDir: false, data, enc, size: sizeOf(data, enc), mtime: Date.now() });
  }

  async mkdir(path: string) {
    if (path === '/') return;
    const parts = path.split('/').filter(Boolean);
    for (let i = 1; i <= parts.length; i++) {
      const p = '/' + parts.slice(0, i).join('/');
      if (!(await this.get(p))) await this.put({ path: p, isDir: true, size: 0, mtime: Date.now() });
    }
  }

  async rename(from: string, to: string) {
    const rows = (await this.all()).filter((r) => r.path === from || r.path.startsWith(from + '/'));
    for (const r of rows) {
      await this.del(r.path);
      await this.put({ ...r, path: to + r.path.slice(from.length), mtime: Date.now() });
    }
  }

  async stat(path: string) {
    const r = await this.get(path);
    return r ? this.toEntry(r) : null;
  }

  async unique(dir: string, name: string) {
    const ext = extname(name);
    const base = ext ? name.slice(0, -(ext.length + 1)) : name;
    let candidate = name;
    for (let i = 1; await this.get(join(dir, candidate)); i++) candidate = ext ? `${base} (${i}).${ext}` : `${base} (${i})`;
    return join(dir, candidate);
  }

  private async trashIndex(): Promise<Record<string, string>> {
    try {
      return JSON.parse(await this.read(TRASH_INDEX));
    } catch {
      return {};
    }
  }

  async trash(path: string) {
    const target = await this.unique('/Papelera', basename(path));
    await this.rename(path, target);
    const index = await this.trashIndex();
    index[basename(target)] = path;
    await this.write(TRASH_INDEX, JSON.stringify(index));
    return target;
  }

  async restore(name: string) {
    const index = await this.trashIndex();
    const original = index[name] ?? `/Documentos/${name}`;
    const target = (await this.get(original)) ? await this.unique(dirname(original), basename(original)) : original;
    await this.rename(`/Papelera/${name}`, target);
    delete index[name];
    await this.write(TRASH_INDEX, JSON.stringify(index));
    return target;
  }

  async emptyTrash() {
    for (const r of await this.all()) if (r.path.startsWith('/Papelera/')) await this.del(r.path);
  }

  async remove(path: string) {
    if (dirname(path) === '/') throw new Error('No se pueden eliminar las carpetas del sistema');
    for (const r of await this.all()) if (r.path === path || r.path.startsWith(path + '/')) await this.del(r.path);
  }

  async fileUrl(path: string) {
    const r = await this.get(path);
    if (!r) return '';
    const type = MIME[extname(path)] ?? 'application/octet-stream';
    const bytes = (r.enc ?? 'utf8') === 'base64' ? Uint8Array.from(atob(r.data ?? ''), (c) => c.charCodeAt(0)) : new TextEncoder().encode(r.data ?? '');
    return URL.createObjectURL(new Blob([bytes], { type }));
  }
}
