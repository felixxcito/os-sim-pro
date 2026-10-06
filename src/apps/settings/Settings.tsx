import { useEffect, useState } from 'react';
import { Cpu, ExternalLink, Info, Palette } from 'lucide-react';
import { Button, Segmented } from '../../components/ui/primitives';
import { useSimStore, SPEEDS } from '../../store/useSimStore';
import type { SysInfo } from '../../os/osApi';
import { fs } from '../../os/fs';
import { useSession } from '../../os/session';
import type { AppProps } from '../../os/shell/OsWindowFrame';
import { Wallpaper, WALLPAPERS } from '../../os/shell/Wallpaper';
import { PhotoIcon } from '../../components/ui/primitives';

const TABS = [
  { id: 'personalizar', label: 'Personalizar', icon: Palette },
  { id: 'sistema', label: 'Núcleo y memoria', icon: Cpu },
  { id: 'acerca', label: 'Acerca de', icon: Info },
] as const;

export default function Settings({ win }: AppProps) {
  const [tab, setTab] = useState<string>(win.args.tab ?? 'personalizar');
  useEffect(() => {
    if (win.args.tab) setTab(win.args.tab);
  }, [win.args.tab]);

  return (
    <div className="flex h-full">
      <nav className="w-44 shrink-0 space-y-0.5 border-r border-gray-800 bg-gray-950/50 p-2">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs ${tab === t.id ? 'bg-violet-500/15 text-violet-200' : 'text-gray-300 hover:bg-white/5'}`}
            >
              <Icon size={14} /> {t.label}
            </button>
          );
        })}
      </nav>
      <div className="scrollbar-thin min-w-0 flex-1 overflow-auto p-5">
        {tab === 'personalizar' && <Personalize />}
        {tab === 'sistema' && <Kernel />}
        {tab === 'acerca' && <About />}
      </div>
    </div>
  );
}

function Personalize() {
  const { settings, updateSettings } = useSession();
  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-3 text-sm font-semibold text-gray-100">Fondo de pantalla</h3>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {WALLPAPERS.map((w) => (
            <button
              key={w.id}
              type="button"
              onClick={() => updateSettings({ wallpaper: w.id })}
              className={`overflow-hidden rounded-lg border-2 text-left ${settings.wallpaper === w.id ? 'border-violet-400' : 'border-transparent hover:border-gray-600'}`}
            >
              <div className="relative h-24">
                <Wallpaper kind={w.id} />
              </div>
              <div className="bg-gray-900 px-2 py-1 text-[11px] text-gray-300">{w.name}</div>
            </button>
          ))}
        </div>
      </section>
      <section>
        <h3 className="mb-3 text-sm font-semibold text-gray-100">Cuenta</h3>
        <div className="flex items-center gap-3">
          <PhotoIcon size={56} ring="#b388ff" className="rounded-full" />
          <label className="text-xs text-gray-400">
            Nombre de usuario
            <input
              value={settings.user}
              onChange={(e) => updateSettings({ user: e.target.value.slice(0, 24) || 'Felix' })}
              className="mt-1 block rounded-md border border-gray-700 bg-gray-900 px-2 py-1 text-sm text-gray-100 focus:border-violet-400 focus:outline-none"
            />
          </label>
        </div>
      </section>
    </div>
  );
}

function Kernel() {
  const { sim, speedMs, setSpeed, setConfig } = useSimStore();
  const c = sim.config;
  const row = 'flex items-center justify-between gap-4 rounded-lg border border-gray-800 bg-gray-900/50 px-3 py-2.5 text-xs';
  return (
    <div className="space-y-2">
      <h3 className="mb-3 text-sm font-semibold text-gray-100">Núcleo del sistema</h3>
      <div className={row}>
        <span className="text-gray-300">Velocidad del reloj del sistema</span>
        <Segmented label="Velocidad" value={speedMs} onChange={setSpeed} options={SPEEDS.map((s) => ({ value: s.ms, label: s.label }))} />
      </div>
      <div className={row}>
        <span className="text-gray-300">Quantum de Round Robin: {c.quantum} ticks</span>
        <input type="range" min={1} max={8} value={c.quantum} onChange={(e) => setConfig({ quantum: Number(e.target.value) })} className="w-40 accent-violet-400" aria-label="Quantum" />
      </div>
      <div className={row}>
        <span className="text-gray-300">Política de planificación</span>
        <Segmented label="Política" value={c.policy} onChange={(policy) => setConfig({ policy })} options={[{ value: 'RR', label: 'Round Robin' }, { value: 'RR_PRIORITY', label: 'RR + Prioridad' }]} />
      </div>
      <div className={row}>
        <span className="text-gray-300">Asignación de memoria</span>
        <Segmented label="Asignación" value={c.strategy} onChange={(strategy) => setConfig({ strategy })} options={[{ value: 'first-fit', label: 'First-Fit' }, { value: 'best-fit', label: 'Best-Fit' }]} />
      </div>
      <div className={row}>
        <span className="text-gray-300">Coste del cambio de contexto</span>
        <Segmented label="Coste" value={c.contextSwitchCost} onChange={(contextSwitchCost) => setConfig({ contextSwitchCost })} options={[{ value: 0, label: '0 ticks' }, { value: 1, label: '1 tick' }]} />
      </div>
      <div className={row}>
        <span className="text-gray-300">Envejecimiento (aging) contra la inanición</span>
        <Segmented label="Aging" value={c.aging ? 'on' : 'off'} onChange={(v) => setConfig({ aging: v === 'on' })} options={[{ value: 'off', label: 'Desactivado' }, { value: 'on', label: 'Activado' }]} />
      </div>
    </div>
  );
}

function About() {
  const [info, setInfo] = useState<SysInfo | null>(null);
  useEffect(() => {
    window.osApi?.sys.info().then(setInfo);
  }, []);
  const rows: [string, string][] = [
    ['Sistema', 'OS-Sim Pro 2.0'],
    ['Autor', 'Felix · Proyecto universitario de Sistemas Operativos'],
    ['Modo', info ? `Ejecutable de escritorio (${info.platform} ${info.arch})` : 'Navegador web'],
    ['Disco virtual', fs.kind === 'electron' ? info?.diskRoot ?? '…' : 'IndexedDB del navegador'],
    ...(info
      ? ([
          ['Electron / Chromium / Node', `${info.electron} / ${info.chrome} / ${info.node}`],
          ['Equipo anfitrión', `${info.host} · ${info.cpus} CPU · ${(info.totalMem / 1024 ** 3).toFixed(1)} GB RAM`],
        ] as [string, string][])
      : []),
  ];
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <PhotoIcon size={72} ring="#00e5ff" className="rounded-2xl" />
        <div>
          <div className="neon-text-cyan font-mono text-xl font-bold tracking-widest">OS-SIM PRO</div>
          <div className="text-xs text-gray-400">Simulador de sistema operativo de escritorio</div>
        </div>
      </div>
      <dl className="divide-y divide-gray-800 rounded-lg border border-gray-800 text-xs">
        {rows.map(([k, v]) => (
          <div key={k} className="flex gap-4 px-3 py-2">
            <dt className="w-44 shrink-0 text-gray-500">{k}</dt>
            <dd className="min-w-0 break-all text-gray-200">{v}</dd>
          </div>
        ))}
      </dl>
      {window.osApi && (
        <Button icon={<ExternalLink size={13} />} onClick={() => window.osApi?.fs.revealRoot()}>
          Abrir el disco virtual en el sistema real
        </Button>
      )}
    </div>
  );
}
