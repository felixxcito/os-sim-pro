import { useState, type FormEvent } from 'react';
import {
  Combine,
  Flame,
  Hourglass,
  Lock,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Shuffle,
  SkipForward,
  Sparkles,
} from 'lucide-react';
import { useSimStore, SPEEDS } from '../../store/useSimStore';
import type { ResourceId } from '../../types';
import { IO_DEVICES, RESOURCE_NAMES } from '../../engine/constants';
import { Button, SectionTitle, Segmented } from '../ui/primitives';

export function ControlPanel() {
  const { sim, running, speedMs, toggle, stepOnce, reset, setSpeed, addRandom, launchDeadlock, launchStarvation, compact, setConfig } =
    useSimStore();
  const { config } = sim;
  const status = sim.deadlock.length ? 'DEADLOCK' : running ? 'EJECUTANDO' : 'PAUSADO';

  return (
    <div className="space-y-4 p-3">
      <div className="rounded-xl border border-green-400/20 bg-black/50 p-3">
        <div className="flex items-end justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-gray-500">Reloj del sistema</div>
            <div className="neon-text-green font-mono text-4xl font-bold tabular-nums leading-none">
              {String(sim.tick).padStart(4, '0')}
            </div>
            <div className="mt-1 text-[10px] text-gray-500">ticks</div>
          </div>
          <span
            className={`rounded-md px-2 py-1 font-mono text-[10px] font-bold tracking-widest ${
              status === 'DEADLOCK'
                ? 'alarm bg-red-500/20 text-red-300'
                : running
                  ? 'bg-green-400/15 text-green-300'
                  : 'bg-gray-700/40 text-gray-400'
            }`}
          >
            ● {status}
          </span>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Button tone={running ? 'amber' : 'green'} onClick={toggle} icon={running ? <Pause size={14} /> : <Play size={14} />}>
            {running ? 'Pausa' : 'Play'}
          </Button>
          <Button tone="cyan" onClick={stepOnce} disabled={running} icon={<SkipForward size={14} />}>
            Paso
          </Button>
          <Button onClick={reset} icon={<RotateCcw size={14} />}>
            Reiniciar
          </Button>
        </div>
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[11px] text-gray-500">Velocidad</span>
          <Segmented label="Velocidad" value={speedMs} onChange={setSpeed} options={SPEEDS.map((s) => ({ value: s.ms, label: s.label }))} />
        </div>
      </div>

      <div>
        <SectionTitle>Planificación y memoria</SectionTitle>
        <div className="space-y-2 text-[11px]">
          <Row label={`Quantum (RR): ${config.quantum}`}>
            <input
              type="range"
              min={1}
              max={8}
              value={config.quantum}
              onChange={(e) => setConfig({ quantum: Number(e.target.value) })}
              className="w-28 accent-cyan-400"
              aria-label="Quantum"
            />
          </Row>
          <Row label="Política">
            <Segmented
              label="Política de planificación"
              value={config.policy}
              onChange={(policy) => setConfig({ policy })}
              options={[
                { value: 'RR', label: 'Round Robin' },
                { value: 'RR_PRIORITY', label: 'RR + Prioridad' },
              ]}
            />
          </Row>
          <Row label="Asignación">
            <Segmented
              label="Estrategia de asignación"
              value={config.strategy}
              onChange={(strategy) => setConfig({ strategy })}
              options={[
                { value: 'first-fit', label: 'First-Fit' },
                { value: 'best-fit', label: 'Best-Fit' },
              ]}
            />
          </Row>
          <Row label="Coste cambio contexto">
            <Segmented
              label="Coste del cambio de contexto"
              value={config.contextSwitchCost}
              onChange={(contextSwitchCost) => setConfig({ contextSwitchCost })}
              options={[
                { value: 0, label: '0 ticks' },
                { value: 1, label: '1 tick' },
              ]}
            />
          </Row>
          <Row label="Envejecimiento (Aging)">
            <button
              type="button"
              role="switch"
              aria-checked={config.aging}
              onClick={() => setConfig({ aging: !config.aging })}
              className={`relative h-5 w-10 rounded-full transition-colors ${config.aging ? 'bg-green-400/70 shadow-[0_0_10px_#39ff14]' : 'bg-gray-700'}`}
            >
              <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${config.aging ? 'left-5.5' : 'left-0.5'}`} />
            </button>
          </Row>
        </div>
      </div>

      <div>
        <SectionTitle>Acciones rápidas</SectionTitle>
        <div className="grid grid-cols-2 gap-2">
          <Button tone="cyan" onClick={() => addRandom()} icon={<Shuffle size={14} />}>
            Proceso aleatorio
          </Button>
          <Button tone="cyan" onClick={() => addRandom(5)} icon={<Sparkles size={14} />}>
            +5 procesos
          </Button>
          <Button tone="red" onClick={launchDeadlock} icon={<Lock size={14} />}>
            Interbloqueo
          </Button>
          <Button tone="amber" onClick={launchStarvation} icon={<Hourglass size={14} />}>
            Inanición
          </Button>
          <Button tone="green" onClick={compact} icon={<Combine size={14} />} className="col-span-2">
            Compactar RAM
          </Button>
        </div>
        {sim.floodTicks > 0 && (
          <p className="mt-2 flex items-center gap-1.5 text-[11px] text-amber-300">
            <Flame size={12} /> Saturando CPU con procesos prioritarios: {sim.floodTicks} ticks restantes
          </p>
        )}
      </div>

      <CustomProcessForm />
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-gray-400">{label}</span>
      {children}
    </div>
  );
}

function CustomProcessForm() {
  const addCustom = useSimStore((s) => s.addCustom);
  const [name, setName] = useState('mi_proceso');
  const [burst, setBurst] = useState(8);
  const [priority, setPriority] = useState(5);
  const [memory, setMemory] = useState(96);
  const [device, setDevice] = useState<ResourceId | ''>('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    addCustom({
      name: name.trim() || 'proceso',
      burstTime: burst,
      priority,
      memorySize: memory,
      requests: device ? [{ resource: device, at: Math.max(1, Math.floor(burst / 2)), mode: 'io', duration: 3 }] : [],
    });
  };

  const field = 'w-full rounded-md border border-gray-700 bg-gray-900 px-2 py-1 font-mono text-xs text-gray-100 focus:border-cyan-400 focus:outline-none';

  return (
    <form onSubmit={submit} className="rounded-xl border border-gray-800 bg-gray-900/60 p-3">
      <SectionTitle>Crear proceso</SectionTitle>
      <div className="grid grid-cols-2 gap-2 text-[11px] text-gray-400">
        <label className="col-span-2">
          Nombre
          <input className={field} value={name} onChange={(e) => setName(e.target.value)} maxLength={20} />
        </label>
        <label>
          Ráfaga (ticks)
          <input className={field} type="number" min={1} max={50} value={burst} onChange={(e) => setBurst(Number(e.target.value))} />
        </label>
        <label>
          Prioridad (1–10)
          <input className={field} type="number" min={1} max={10} value={priority} onChange={(e) => setPriority(Number(e.target.value))} />
        </label>
        <label>
          Memoria (MB)
          <input className={field} type="number" min={16} max={896} step={16} value={memory} onChange={(e) => setMemory(Number(e.target.value))} />
        </label>
        <label>
          E/S
          <select className={field} value={device} onChange={(e) => setDevice(e.target.value as ResourceId | '')}>
            <option value="">Ninguna</option>
            {IO_DEVICES.map((id) => (
              <option key={id} value={id}>
                {RESOURCE_NAMES[id]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <Button type="submit" tone="green" className="mt-3 w-full" icon={<Plus size={14} />}>
        Añadir a la cola
      </Button>
    </form>
  );
}
