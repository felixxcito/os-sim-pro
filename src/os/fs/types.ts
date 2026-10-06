export interface FsEntry {
  name: string;
  /** Ruta virtual estilo POSIX, p. ej. "/Documentos/tarea.docx". */
  path: string;
  isDir: boolean;
  size: number;
  mtime: number;
}

export type Encoding = 'utf8' | 'base64';

/** Sistema de archivos del SO simulado. Dos implementaciones: Electron (disco real) e IndexedDB (web). */
export interface FileSystemProvider {
  readonly kind: 'electron' | 'indexeddb';
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
  /** URL que el navegador puede cargar (imágenes, PDF). */
  fileUrl(path: string): Promise<string>;
}

export const SYSTEM_FOLDERS = ['Escritorio', 'Documentos', 'Descargas', 'Imágenes', 'Música', 'Papelera'] as const;

export const dirname = (p: string) => {
  const i = p.lastIndexOf('/');
  return i <= 0 ? '/' : p.slice(0, i);
};
export const basename = (p: string) => p.slice(p.lastIndexOf('/') + 1);
export const extname = (p: string) => {
  const b = basename(p);
  const i = b.lastIndexOf('.');
  return i <= 0 ? '' : b.slice(i + 1).toLowerCase();
};
export const join = (...parts: string[]) => ('/' + parts.join('/')).replace(/\/+/g, '/').replace(/(.)\/$/, '$1');

/** Normaliza una ruta (resuelve "." y ".."), relativa a `cwd` si no empieza por "/". */
export function resolvePath(cwd: string, input: string): string {
  const raw = input.startsWith('/') ? input : `${cwd}/${input}`;
  const out: string[] = [];
  for (const seg of raw.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') out.pop();
    else out.push(seg);
  }
  return '/' + out.join('/');
}
