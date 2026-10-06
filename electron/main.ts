import { app, BrowserWindow, ipcMain, Menu, net, protocol, session, shell, type WebContents } from 'electron';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { VirtualDisk } from './disk.js';

/**
 * Proceso principal de Electron: crea la "pantalla" del SO simulado y le da acceso
 * controlado al disco virtual, a las descargas del navegador y a la impresión.
 */

const DEV_URL = process.env.VITE_DEV_SERVER_URL;
const DIST = path.join(import.meta.dirname, '..', 'dist');
const BROWSER_PARTITION = 'persist:navegador';
/** Prueba de humo: OSSIM_SMOKE=captura.png abre la app oculta, ejecuta OSSIM_SMOKE_JS, guarda una captura y sale. */
const SMOKE = process.env.OSSIM_SMOKE;
const WINDOWED = Boolean(SMOKE || process.env.OSSIM_WINDOWED);

// app:// sirve la interfaz empaquetada; osdisk:// sirve archivos del disco virtual (imágenes, PDF…).
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
  { scheme: 'osdisk', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

app.setName('OS-Sim Pro');
let win: BrowserWindow | null = null;
let disk: VirtualDisk;

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    fullscreen: !WINDOWED,
    show: !SMOKE,
    paintWhenInitiallyHidden: true,
    backgroundColor: '#030712',
    title: 'OS-Sim Pro',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(import.meta.dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: true,
      plugins: true, // visor de PDF de Chromium
    },
  });
  if (DEV_URL) win.loadURL(DEV_URL);
  else win.loadURL('app://os/index.html');
  win.on('closed', () => (win = null));
  if (SMOKE) runSmoke(win, SMOKE);
}

async function runSmoke(w: BrowserWindow, out: string) {
  const errors: string[] = [];
  w.webContents.on('console-message', (e) => e.level === 'error' && errors.push(e.message));
  await new Promise<void>((r) => w.webContents.once('did-finish-load', () => r()));
  await new Promise((r) => setTimeout(r, 1500));
  const script = process.env.OSSIM_SMOKE_JS;
  if (script) {
    const result = await w.webContents.executeJavaScript(await fs.readFile(script, 'utf8'));
    console.log('SMOKE_RESULT', JSON.stringify(result));
  }
  await new Promise((r) => setTimeout(r, 1200));
  const img = await w.webContents.capturePage();
  await fs.writeFile(out, img.toPNG());
  console.log('SMOKE_ERRORS', JSON.stringify(errors));
  app.quit();
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(isMac ? [{ role: 'appMenu' as const }] : []),
      { role: 'editMenu' },
      {
        label: 'Ver',
        submenu: [
          { role: 'togglefullscreen', accelerator: 'F11' },
          { role: 'reload' },
          { role: 'toggleDevTools', accelerator: 'F12' },
          { role: 'resetZoom' },
          { role: 'zoomIn' },
          { role: 'zoomOut' },
        ],
      },
    ]),
  );
}

const send = (channel: string, payload: unknown) => win?.webContents.send(channel, payload);

/** Seguridad de los <webview> del navegador simulado: sin Node, sin preload, popups → pestaña nueva. */
function hardenWebviews(contents: WebContents) {
  contents.on('will-attach-webview', (_e, webPreferences, params) => {
    delete webPreferences.preload;
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
    params.partition = BROWSER_PARTITION;
  });
  if (contents.getType() === 'webview') {
    contents.setWindowOpenHandler(({ url }) => {
      send('browser:new-tab', url);
      return { action: 'deny' };
    });
  }
}

/** Descargas del navegador → carpeta /Descargas del disco virtual, con progreso hacia la interfaz. */
function setupDownloads() {
  let nextId = 1;
  session.fromPartition(BROWSER_PARTITION).on('will-download', async (_e, item) => {
    const id = nextId++;
    const virtual = await disk.uniqueName('/Descargas', item.getFilename());
    item.setSavePath(disk.resolve(virtual));
    send('download:start', { id, name: path.posix.basename(virtual), path: virtual, total: item.getTotalBytes() });
    item.on('updated', () => send('download:progress', { id, received: item.getReceivedBytes(), total: item.getTotalBytes() }));
    item.once('done', (_ev, state) => send('download:done', { id, state, path: virtual }));
  });
}

async function htmlToWindow(html: string) {
  const w = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
  await w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  return w;
}

function registerIpc() {
  const handle = (channel: string, fn: (...args: any[]) => unknown) => ipcMain.handle(channel, (_e, ...args) => fn(...args));

  handle('fs:list', (p: string) => disk.list(p));
  handle('fs:read', (p: string, enc?: 'utf8' | 'base64') => disk.read(p, enc));
  handle('fs:write', (p: string, data: string, enc?: 'utf8' | 'base64') => disk.write(p, data, enc));
  handle('fs:mkdir', (p: string) => disk.mkdir(p));
  handle('fs:rename', (a: string, b: string) => disk.rename(a, b));
  handle('fs:stat', (p: string) => disk.stat(p));
  handle('fs:unique', (dir: string, name: string) => disk.uniqueName(dir, name));
  handle('fs:trash', (p: string) => disk.trash(p));
  handle('fs:restore', (name: string) => disk.restore(name));
  handle('fs:emptyTrash', () => disk.emptyTrash());
  handle('fs:remove', (p: string) => disk.remove(p));
  handle('fs:openNative', (p: string) => shell.openPath(disk.resolve(p)));
  handle('fs:revealRoot', () => shell.openPath(disk.root));

  handle('doc:pdf', async (html: string, target: string) => {
    const w = await htmlToWindow(html);
    const pdf = await w.webContents.printToPDF({ pageSize: 'A4', printBackground: true, margins: { top: 0.6, bottom: 0.6, left: 0.6, right: 0.6 } });
    w.destroy();
    const virtual = await disk.uniqueName(path.posix.dirname(target), path.posix.basename(target));
    await fs.writeFile(disk.resolve(virtual), pdf);
    return virtual;
  });
  handle('doc:print', async (html: string) => {
    const w = await htmlToWindow(html);
    return new Promise<boolean>((resolve) =>
      w.webContents.print({ printBackground: true }, (ok) => {
        w.destroy();
        resolve(ok);
      }),
    );
  });

  handle('sys:info', () => ({
    platform: process.platform,
    arch: process.arch,
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    host: os.hostname(),
    cpus: os.cpus().length,
    totalMem: os.totalmem(),
    diskRoot: disk.root,
  }));
  handle('sys:fullscreen', () => win?.setFullScreen(!win.isFullScreen()));
  handle('sys:shutdown', () => app.quit());
  handle('sys:openExternal', (url: string) => (/^https?:\/\//.test(url) ? shell.openExternal(url) : undefined));
}

app.whenReady().then(async () => {
  disk = new VirtualDisk(path.join(app.getPath('userData'), 'OS-Sim-Disk'));
  await disk.init();

  protocol.handle('app', (req) => {
    const { pathname } = new URL(req.url);
    const file = path.join(DIST, decodeURIComponent(pathname));
    if (!file.startsWith(DIST)) return new Response('Prohibido', { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });
  protocol.handle('osdisk', (req) => {
    const { pathname } = new URL(req.url);
    try {
      return net.fetch(pathToFileURL(disk.resolve(decodeURIComponent(pathname))).toString());
    } catch {
      return new Response('Prohibido', { status: 403 });
    }
  });

  buildMenu();
  registerIpc();
  setupDownloads();
  app.on('web-contents-created', (_e, contents) => hardenWebviews(contents));
  createWindow();
  app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow());
});

app.on('window-all-closed', () => app.quit());
