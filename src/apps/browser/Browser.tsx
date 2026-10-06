import { useEffect, useRef, useState } from 'react';
import type { WebviewTag } from 'electron';
import { ArrowLeft, ArrowRight, Download, FolderOpen, Globe, Home, Loader2, Lock, Plus, RotateCw, Search, X } from 'lucide-react';
import { PhotoIcon } from '../../components/ui/primitives';
import { useDownloads } from '../../os/downloads';
import { formatSize, fs } from '../../os/fs';
import { openPath } from '../../os/openFile';
import type { AppProps } from '../../os/shell/OsWindowFrame';
import { useWm } from '../../os/wm/useWm';
import { useSimStore } from '../../store/useSimStore';
import { consumeBrowserRequests, useBrowserBus } from './bus';

const HOME = 'os://inicio';
const SEARCH = 'https://www.google.com/search?q=';
const isElectron = Boolean(window.osApi);

const SHORTCUTS = [
  { name: 'Google', url: 'https://www.google.com' },
  { name: 'YouTube', url: 'https://www.youtube.com' },
  { name: 'Wikipedia', url: 'https://es.wikipedia.org' },
  { name: 'GitHub', url: 'https://github.com' },
  { name: 'Gmail', url: 'https://mail.google.com' },
  { name: 'Archivo de prueba', url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf' },
];

interface Tab {
  id: number;
  url: string;
  title: string;
  favicon?: string;
  loading: boolean;
  canBack: boolean;
  canForward: boolean;
}

let tabSeq = 1;

/** Convierte lo escrito en la barra de direcciones en una URL o una búsqueda. */
export function toUrl(input: string): string {
  const t = input.trim();
  if (!t) return HOME;
  if (/^(https?|osdisk|os|file|data):/i.test(t)) return t;
  if (!/\s/.test(t) && /^[\w-]+(\.[\w-]+)+(:\d+)?(\/.*)?$/.test(t)) return `https://${t}`;
  if (/^localhost(:\d+)?(\/.*)?$/.test(t)) return `http://${t}`;
  return SEARCH + encodeURIComponent(t);
}

export default function Browser({ win }: AppProps) {
  const [tabs, setTabs] = useState<Tab[]>(() => [newTab(HOME)]);
  const [active, setActive] = useState(tabs[0].id);
  const [address, setAddress] = useState('');
  const [showDownloads, setShowDownloads] = useState(false);
  const views = useRef(new Map<number, WebviewTag | HTMLIFrameElement>());
  const setTitle = useWm((s) => s.setTitle);
  const interact = useSimStore((s) => s.interact);
  const requests = useBrowserBus((s) => s.requests);
  const current = tabs.find((t) => t.id === active) ?? tabs[0];

  function newTab(url: string): Tab {
    return { id: tabSeq++, url, title: url === HOME ? 'Nueva pestaña' : url, loading: url !== HOME, canBack: false, canForward: false };
  }

  const patch = (id: number, p: Partial<Tab>) => setTabs((ts) => ts.map((t) => (t.id === id ? { ...t, ...p } : t)));

  const openTab = (url: string) => {
    const t = newTab(url);
    setTabs((ts) => [...ts, t]);
    setActive(t.id);
  };

  // Archivo o URL con los que se abrió la ventana (p. ej. un PDF del Explorador).
  useEffect(() => {
    const { path, url } = win.args;
    if (url) navigate(url);
    else if (path) fs.fileUrl(path).then(navigate);
  }, [win.args.path, win.args.url]);

  useEffect(() => {
    for (const r of consumeBrowserRequests(win.id)) openTab(r.url);
  }, [requests, win.id]);

  useEffect(() => {
    setAddress(current.url === HOME ? '' : current.url);
    setTitle(win.id, `${current.title || 'Navegador'} — Navegador`);
  }, [current.url, current.title, setTitle, win.id]);

  function navigate(raw: string) {
    const url = toUrl(raw);
    const view = views.current.get(active);
    patch(active, { url, title: url, loading: url !== HOME });
    if (url !== HOME && view && 'loadURL' in view) void view.loadURL(url).catch(() => {});
  }

  const closeTab = (id: number) => {
    views.current.delete(id);
    setTabs((ts) => {
      const rest = ts.filter((t) => t.id !== id);
      if (rest.length === 0) {
        const t = newTab(HOME);
        setActive(t.id);
        return [t];
      }
      if (id === active) setActive(rest[Math.max(0, ts.findIndex((t) => t.id === id) - 1)].id);
      return rest;
    });
  };

  const view = views.current.get(active);
  const wv = view && 'goBack' in view ? (view as WebviewTag) : null;

  const onKey = (e: React.KeyboardEvent) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    if (e.key === 't') {
      e.preventDefault();
      openTab(HOME);
    } else if (e.key === 'w') {
      e.preventDefault();
      closeTab(active);
    } else if (e.key === 'l') {
      e.preventDefault();
      (document.getElementById(`addr-${win.id}`) as HTMLInputElement | null)?.select();
    }
  };

  return (
    <div className="flex h-full flex-col bg-gray-950" onKeyDown={onKey}>
      {/* Pestañas */}
      <div className="scrollbar-thin flex items-end gap-0.5 overflow-x-auto bg-gray-900/90 px-1.5 pt-1.5">
        {tabs.map((t) => (
          <div
            key={t.id}
            role="tab"
            aria-selected={t.id === active}
            onClick={() => setActive(t.id)}
            onAuxClick={(e) => e.button === 1 && closeTab(t.id)}
            className={`group flex w-48 shrink-0 cursor-default items-center gap-2 rounded-t-lg px-2.5 py-1.5 text-[11px] ${
              t.id === active ? 'bg-gray-800 text-gray-100' : 'text-gray-400 hover:bg-gray-800/50'
            }`}
          >
            {t.loading ? (
              <Loader2 size={12} className="shrink-0 animate-spin text-cyan-300" />
            ) : t.favicon ? (
              <img src={t.favicon} alt="" className="h-3.5 w-3.5 shrink-0" />
            ) : (
              <Globe size={12} className="shrink-0" />
            )}
            <span className="flex-1 truncate">{t.title}</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                closeTab(t.id);
              }}
              className="rounded p-0.5 opacity-60 hover:bg-white/10 hover:opacity-100"
              aria-label="Cerrar pestaña"
            >
              <X size={11} />
            </button>
          </div>
        ))}
        <button type="button" onClick={() => openTab(HOME)} className="mb-1 rounded p-1 text-gray-400 hover:bg-white/10" aria-label="Nueva pestaña" title="Nueva pestaña (Ctrl+T)">
          <Plus size={14} />
        </button>
      </div>

      {/* Barra de navegación */}
      <div className="flex items-center gap-1 bg-gray-800 px-2 py-1.5">
        <NavBtn label="Atrás" disabled={!current.canBack} onClick={() => wv?.goBack()}>
          <ArrowLeft size={15} />
        </NavBtn>
        <NavBtn label="Adelante" disabled={!current.canForward} onClick={() => wv?.goForward()}>
          <ArrowRight size={15} />
        </NavBtn>
        <NavBtn label="Recargar" onClick={() => (wv ? wv.reload() : view && ((view as HTMLIFrameElement).src = current.url))}>
          <RotateCw size={14} />
        </NavBtn>
        <NavBtn label="Inicio" onClick={() => navigate(HOME)}>
          <Home size={14} />
        </NavBtn>
        <form
          className="flex flex-1 items-center gap-2 rounded-full border border-gray-700 bg-gray-950 px-3 py-1 focus-within:border-cyan-400"
          onSubmit={(e) => {
            e.preventDefault();
            navigate(address);
          }}
        >
          {current.url.startsWith('https://') ? <Lock size={12} className="text-green-400" /> : <Search size={12} className="text-gray-500" />}
          <input
            id={`addr-${win.id}`}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            onFocus={(e) => e.target.select()}
            placeholder="Busca en Google o escribe una dirección"
            className="w-full bg-transparent text-xs text-gray-100 select-text focus:outline-none"
            spellCheck={false}
          />
        </form>
        <div className="relative">
          <NavBtn label="Descargas" onClick={() => setShowDownloads((s) => !s)}>
            <Download size={15} />
          </NavBtn>
          {showDownloads && <DownloadsPanel onClose={() => setShowDownloads(false)} />}
        </div>
      </div>

      {!isElectron && current.url !== HOME && (
        <div className="bg-amber-500/15 px-3 py-1 text-[11px] text-amber-200">
          Modo web: muchas páginas no se dejan mostrar dentro de otra página. En el ejecutable (.exe / .app) el navegador es completo y permite descargas.
        </div>
      )}

      {/* Contenido */}
      <div className="relative min-h-0 flex-1 bg-white">
        {tabs.map((t) => (
          <div key={t.id} className="absolute inset-0" style={{ display: t.id === active ? 'block' : 'none' }}>
            {t.url === HOME ? (
              <StartPage onGo={navigate} />
            ) : isElectron ? (
              <WebviewTab
                tab={t}
                register={(el) => (el ? views.current.set(t.id, el) : views.current.delete(t.id))}
                onUpdate={(p) => patch(t.id, p)}
                onLoad={() => interact(win.pid, 3)}
              />
            ) : (
              <iframe
                ref={(el) => {
                  if (el) views.current.set(t.id, el);
                }}
                src={t.url}
                title={t.title}
                className="h-full w-full border-0"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                onLoad={() => {
                  patch(t.id, { loading: false });
                  interact(win.pid, 3);
                }}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Una pestaña con un <webview> real (proceso de renderizado aislado de Chromium). */
function WebviewTab({
  tab,
  register,
  onUpdate,
  onLoad,
}: {
  tab: Tab;
  register: (el: WebviewTag | null) => void;
  onUpdate: (p: Partial<Tab>) => void;
  onLoad: () => void;
}) {
  const ref = useRef<WebviewTag | null>(null);
  const [initial] = useState(tab.url);
  const cb = useRef({ onUpdate, onLoad });
  cb.current = { onUpdate, onLoad };

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    register(el);
    const nav = () => {
      try {
        cb.current.onUpdate({ url: el.getURL(), canBack: el.canGoBack(), canForward: el.canGoForward() });
      } catch {
        /* el webview aún no está listo */
      }
    };
    const handlers: [string, (e: any) => void][] = [
      ['did-start-loading', () => {
        cb.current.onUpdate({ loading: true });
        cb.current.onLoad();
      }],
      ['did-stop-loading', () => {
        cb.current.onUpdate({ loading: false });
        nav();
      }],
      ['did-navigate', nav],
      ['did-navigate-in-page', nav],
      ['page-title-updated', (e) => cb.current.onUpdate({ title: e.title })],
      ['page-favicon-updated', (e) => cb.current.onUpdate({ favicon: e.favicons?.[0] })],
      ['did-fail-load', (e) => e.errorCode !== -3 && cb.current.onUpdate({ loading: false, title: 'No se pudo cargar la página' })],
    ];
    for (const [ev, fn] of handlers) el.addEventListener(ev, fn);
    return () => {
      for (const [ev, fn] of handlers) el.removeEventListener(ev, fn);
      register(null);
    };
  }, []);

  // allowpopups debe llegar como atributo de texto para que Electron lo lea al adjuntar el webview.
  const popups = { allowpopups: 'true' } as Record<string, string>;
  return <webview ref={ref as never} src={initial} partition="persist:navegador" {...popups} className="h-full w-full" style={{ display: 'flex' }} />;
}

function StartPage({ onGo }: { onGo: (url: string) => void }) {
  const [q, setQ] = useState('');
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 bg-gradient-to-b from-gray-900 to-gray-950 p-6">
      <PhotoIcon size={88} ring="#00e5ff" className="rounded-full" />
      <form
        className="flex w-full max-w-xl items-center gap-2 rounded-full border border-gray-700 bg-gray-900 px-4 py-2.5 shadow-xl focus-within:border-cyan-400"
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim()) onGo(q);
        }}
      >
        <Search size={16} className="text-gray-500" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Busca en Google o escribe una dirección"
          className="w-full bg-transparent text-sm text-gray-100 select-text focus:outline-none"
        />
      </form>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        {SHORTCUTS.map((s) => (
          <button key={s.url} type="button" onClick={() => onGo(s.url)} className="flex w-24 flex-col items-center gap-2 rounded-xl p-3 text-center hover:bg-white/5">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-gray-800 text-base font-bold text-cyan-300">{s.name[0]}</span>
            <span className="text-[11px] text-gray-300">{s.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function DownloadsPanel({ onClose }: { onClose: () => void }) {
  const items = useDownloads((s) => s.items);
  const openApp = useWm((s) => s.openApp);
  return (
    <div className="glass absolute top-9 right-0 z-20 w-80 rounded-xl border border-gray-700 p-2 shadow-2xl">
      <div className="mb-1 flex items-center justify-between px-1">
        <span className="text-xs font-semibold text-gray-100">Descargas</span>
        <button
          type="button"
          onClick={() => {
            openApp('files', { path: '/Descargas' });
            onClose();
          }}
          className="flex items-center gap-1 text-[11px] text-cyan-300 hover:underline"
        >
          <FolderOpen size={12} /> Abrir carpeta
        </button>
      </div>
      {items.length === 0 && <p className="px-1 py-4 text-center text-[11px] text-gray-500">{isElectron ? 'Aún no has descargado nada.' : 'Las descargas solo funcionan en el ejecutable.'}</p>}
      <ul className="scrollbar-thin max-h-72 space-y-1 overflow-auto">
        {items.map((d) => (
          <li key={d.id} className="rounded-lg bg-gray-900/70 px-2 py-1.5">
            <button type="button" disabled={d.state !== 'completed'} onClick={() => void openPath(d.path)} className="w-full text-left disabled:cursor-default">
              <div className="truncate text-xs text-gray-200">{d.name}</div>
              <div className="font-mono text-[10px] text-gray-500">
                {d.state === 'progressing'
                  ? `${formatSize(d.received)}${d.total ? ' / ' + formatSize(d.total) : ''}`
                  : d.state === 'completed'
                    ? `Completada · ${formatSize(d.total || d.received)}`
                    : 'Fallida'}
              </div>
              {d.state === 'progressing' && d.total > 0 && (
                <div className="mt-1 h-1 overflow-hidden rounded bg-gray-800">
                  <div className="h-full bg-cyan-400" style={{ width: `${(d.received / d.total) * 100}%` }} />
                </div>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function NavBtn({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick} className="rounded-full p-1.5 text-gray-300 hover:bg-white/10 disabled:opacity-30">
      {children}
    </button>
  );
}
