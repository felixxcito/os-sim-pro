import { useEffect, useState } from 'react';
import { ArrowRight, Power } from 'lucide-react';
import { PhotoIcon } from '../../components/ui/primitives';
import { useSession } from '../session';
import { Wallpaper } from './Wallpaper';

const BOOT_LINES = [
  'Cargando núcleo OS-Sim 2.0…',
  '[ OK ] Inicializando memoria: 1024 MB, núcleo 128 MB',
  '[ OK ] Particionamiento dinámico (First-Fit)',
  '[ OK ] Planificador Round Robin, quantum = 3',
  '[ OK ] Registrando dispositivos: HDD, Impresora, USB, R1, R2',
  '[ OK ] Montando disco virtual',
  '[ OK ] Detector de interbloqueos (grafo de espera)',
  '[ OK ] Iniciando servicios: systemd, escritorio, audiod, red-wifi, indexador',
  'Iniciando sesión gráfica…',
];

/** Pantalla de arranque con la bitácora del núcleo. */
export function BootScreen() {
  const setPhase = useSession((s) => s.setPhase);
  const [lines, setLines] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setLines((n) => n + 1), 230);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (lines > BOOT_LINES.length + 1) setPhase('lock');
  }, [lines, setPhase]);

  const pct = Math.min(100, Math.round((lines / (BOOT_LINES.length + 1)) * 100));
  return (
    <div className="flex h-full flex-col items-center justify-center gap-8 bg-black p-6">
      <div className="flex flex-col items-center gap-4">
        <PhotoIcon size={112} ring="#00e5ff" className="rounded-full" />
        <div className="neon-text-cyan font-mono text-2xl font-bold tracking-[0.3em]">OS-SIM PRO</div>
      </div>
      <div className="h-1 w-64 overflow-hidden rounded-full bg-gray-800">
        <div className="h-full bg-cyan-400 shadow-[0_0_10px_#00e5ff] transition-[width] duration-200" style={{ width: `${pct}%` }} />
      </div>
      <pre className="h-44 w-full max-w-xl overflow-hidden font-mono text-[11px] leading-relaxed text-green-400/90">
        {BOOT_LINES.slice(0, lines).join('\n')}
      </pre>
    </div>
  );
}

function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/** Pantalla de bloqueo / inicio de sesión. */
export function LockScreen() {
  const { settings, setPhase } = useSession();
  const now = useNow();
  const enter = () => setPhase('desktop');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Enter' && enter();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="relative h-full overflow-hidden">
      <Wallpaper kind={settings.wallpaper} blur />
      <div className="relative flex h-full flex-col items-center justify-between py-16 text-white">
        <div className="text-center [text-shadow:0_2px_12px_rgb(0_0_0/0.6)]">
          <div className="font-mono text-7xl font-bold tabular-nums">{now.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}</div>
          <div className="mt-2 text-lg capitalize">{now.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
        </div>
        <div className="flex flex-col items-center gap-4">
          <PhotoIcon size={128} ring="#00e5ff" className="rounded-full" />
          <div className="text-2xl font-semibold [text-shadow:0_2px_8px_rgb(0_0_0/0.7)]">{settings.user}</div>
          <button
            type="button"
            autoFocus
            onClick={enter}
            className="flex items-center gap-2 rounded-full border border-white/30 bg-white/15 px-6 py-2.5 text-sm font-medium backdrop-blur-md transition hover:bg-white/25 focus-visible:outline-2 focus-visible:outline-cyan-300"
          >
            Iniciar sesión <ArrowRight size={16} />
          </button>
          <span className="text-xs text-white/60">o pulsa Enter</span>
        </div>
        <div />
      </div>
    </div>
  );
}

/** Animación de apagado: en el ejecutable cierra la app; en el navegador invita a reiniciar. */
export function ShutdownScreen() {
  const setPhase = useSession((s) => s.setPhase);
  const [done, setDone] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => {
      if (window.osApi) void window.osApi.sys.shutdown();
      else setDone(true);
    }, 1800);
    return () => clearTimeout(id);
  }, []);
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 bg-black text-gray-300">
      {done ? (
        <>
          <div className="text-sm">Es seguro cerrar esta pestaña.</div>
          <button type="button" onClick={() => setPhase('boot')} className="flex items-center gap-2 rounded-full border border-gray-700 px-4 py-2 text-xs hover:bg-white/10">
            <Power size={14} /> Encender de nuevo
          </button>
        </>
      ) : (
        <>
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-700 border-t-cyan-400" />
          <div className="text-sm">Apagando…</div>
        </>
      )}
    </div>
  );
}
