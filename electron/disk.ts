import { promises as fs } from 'node:fs';
import path from 'node:path';

/**
 * Disco virtual del SO simulado: una carpeta real dentro de los datos de la app.
 * Todas las rutas que llegan del renderer son "virtuales" (estilo POSIX, raíz "/")
 * y se confinan a esta carpeta para que ninguna operación pueda salir de ella.
 */

export const DEFAULT_FOLDERS = ['Escritorio', 'Documentos', 'Descargas', 'Imágenes', 'Música', 'Papelera'];
const TRASH = 'Papelera';
const TRASH_INDEX = '.papelera.json';

export interface DiskEntry {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  mtime: number;
}

export class VirtualDisk {
  constructor(readonly root: string) {}

  /** Convierte una ruta virtual en absoluta, rechazando cualquier intento de salir de la raíz. */
  resolve(virtualPath: string): string {
    const clean = path.posix.normalize('/' + String(virtualPath ?? '').replace(/\\/g, '/'));
    const abs = path.resolve(this.root, '.' + clean);
    if (abs !== this.root && !abs.startsWith(this.root + path.sep)) {
      throw new Error(`Ruta fuera del disco virtual: ${virtualPath}`);
    }
    return abs;
  }

  toVirtual(abs: string): string {
    const rel = path.relative(this.root, abs).split(path.sep).join('/');
    return '/' + rel;
  }

  async init() {
    await fs.mkdir(this.root, { recursive: true });
    for (const f of DEFAULT_FOLDERS) await fs.mkdir(path.join(this.root, f), { recursive: true });
    const welcome = path.join(this.root, 'Escritorio', 'Bienvenido.txt');
    try {
      await fs.access(welcome);
    } catch {
      await fs.writeFile(
        welcome,
        'Bienvenido a OS-Sim Pro.\n\nEste es tu disco virtual: todo lo que guardes en Documentos, Descargas o el Escritorio\nse conserva entre sesiones.\n\nAbre el Administrador de tareas para ver cada aplicación como un proceso del simulador.\n',
        'utf8',
      );
    }
  }

  async list(dir: string): Promise<DiskEntry[]> {
    const abs = this.resolve(dir);
    const names = await fs.readdir(abs);
    const entries: DiskEntry[] = [];
    for (const name of names) {
      if (name.startsWith('.')) continue;
      const full = path.join(abs, name);
      const st = await fs.stat(full);
      entries.push({ name, path: this.toVirtual(full), isDir: st.isDirectory(), size: st.size, mtime: st.mtimeMs });
    }
    return entries.sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name, 'es'));
  }

  async read(file: string, encoding: 'utf8' | 'base64' = 'utf8'): Promise<string> {
    return fs.readFile(this.resolve(file), encoding);
  }

  async write(file: string, data: string, encoding: 'utf8' | 'base64' = 'utf8'): Promise<void> {
    const abs = this.resolve(file);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, data, encoding);
  }

  async mkdir(dir: string) {
    await fs.mkdir(this.resolve(dir), { recursive: true });
  }

  async rename(from: string, to: string) {
    await fs.rename(this.resolve(from), this.resolve(to));
  }

  async stat(p: string): Promise<DiskEntry | null> {
    try {
      const abs = this.resolve(p);
      const st = await fs.stat(abs);
      return { name: path.basename(abs), path: this.toVirtual(abs), isDir: st.isDirectory(), size: st.size, mtime: st.mtimeMs };
    } catch {
      return null;
    }
  }

  /** Nombre libre en una carpeta: "foto.png" → "foto (1).png" si ya existe. */
  async uniqueName(dir: string, name: string): Promise<string> {
    const ext = path.extname(name);
    const base = name.slice(0, name.length - ext.length);
    let candidate = name;
    for (let i = 1; await this.stat(path.posix.join(dir, candidate)); i++) candidate = `${base} (${i})${ext}`;
    return path.posix.join(dir, candidate);
  }

  // ------------------------------------------------------------- Papelera

  private async trashIndex(): Promise<Record<string, string>> {
    try {
      return JSON.parse(await this.read(`/${TRASH}/${TRASH_INDEX}`));
    } catch {
      return {};
    }
  }

  async trash(p: string): Promise<string> {
    const target = await this.uniqueName(`/${TRASH}`, path.posix.basename(p));
    await this.rename(p, target);
    const index = await this.trashIndex();
    index[path.posix.basename(target)] = p;
    await this.write(`/${TRASH}/${TRASH_INDEX}`, JSON.stringify(index, null, 2));
    return target;
  }

  async restore(name: string): Promise<string> {
    const index = await this.trashIndex();
    const original = index[name] ?? `/Documentos/${name}`;
    const target = (await this.stat(original)) ? await this.uniqueName(path.posix.dirname(original), path.posix.basename(original)) : original;
    await this.rename(`/${TRASH}/${name}`, target);
    delete index[name];
    await this.write(`/${TRASH}/${TRASH_INDEX}`, JSON.stringify(index, null, 2));
    return target;
  }

  /** Vacía la papelera del disco virtual (elimina solo lo que hay dentro de /Papelera). */
  async emptyTrash() {
    const abs = this.resolve(`/${TRASH}`);
    for (const name of await fs.readdir(abs)) await fs.rm(path.join(abs, name), { recursive: true, force: true });
  }

  async remove(p: string) {
    const abs = this.resolve(p);
    if (abs === this.root || path.dirname(abs) === this.root) throw new Error('No se pueden eliminar las carpetas del sistema');
    await fs.rm(abs, { recursive: true, force: true });
  }
}
