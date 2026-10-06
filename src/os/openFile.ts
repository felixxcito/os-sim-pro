import { appForExtension } from './apps/meta';
import { extname, fs } from './fs';
import { notify } from './session';
import { useWm } from './wm/useWm';

/** Abre un archivo o carpeta con la aplicación asociada a su extensión. */
export async function openPath(path: string) {
  const entry = await fs.stat(path);
  if (!entry) {
    notify({ title: 'No se encontró el archivo', body: path, tone: 'error' });
    return;
  }
  const wm = useWm.getState();
  if (entry.isDir) {
    wm.openApp(path.startsWith('/Papelera') ? 'trash' : 'files', { path });
    return;
  }
  const app = appForExtension(extname(path));
  if (app) {
    wm.openApp(app, { path });
    return;
  }
  if (window.osApi) {
    // Formatos sin app propia (zip, mp3, exe…) se abren con el programa del sistema anfitrión.
    await window.osApi.fs.openNative(path);
    notify({ title: 'Abierto con el sistema anfitrión', body: entry.name });
    return;
  }
  notify({ title: 'Sin aplicación asociada', body: `No hay una app para archivos .${extname(path) || '?'}`, tone: 'warning' });
}
