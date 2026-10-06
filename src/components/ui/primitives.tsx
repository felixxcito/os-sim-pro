import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { ProcessState } from '../../types';

export const STATE_STYLES: Record<ProcessState, { label: string; className: string; dot: string }> = {
  New: { label: 'Nuevo', className: 'bg-sky-500/15 text-sky-300 ring-sky-400/40', dot: 'bg-sky-400' },
  Ready: { label: 'Listo', className: 'bg-amber-400/15 text-amber-300 ring-amber-400/40', dot: 'bg-amber-400' },
  Running: { label: 'Ejecutando', className: 'bg-green-500/20 text-green-300 ring-green-400/60', dot: 'bg-[#39ff14]' },
  Blocked: { label: 'Bloqueado', className: 'bg-red-500/15 text-red-300 ring-red-400/50', dot: 'bg-red-500' },
  Terminated: { label: 'Terminado', className: 'bg-gray-500/15 text-gray-400 ring-gray-500/30', dot: 'bg-gray-500' },
};

export function StateBadge({ state }: { state: ProcessState }) {
  const s = STATE_STYLES[state];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${s.className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot} ${state === 'Running' ? 'animate-pulse' : ''}`} />
      {s.label}
    </span>
  );
}

export function ProgressBar({ value, max, color = '#00e5ff' }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-800">
      <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${pct}%`, background: color, boxShadow: `0 0 6px ${color}` }} />
    </div>
  );
}

type Tone = 'cyan' | 'green' | 'red' | 'amber' | 'gray';

const TONES: Record<Tone, string> = {
  cyan: 'border-cyan-400/40 bg-cyan-400/10 text-cyan-200 hover:bg-cyan-400/20 hover:border-cyan-300',
  green: 'border-green-400/40 bg-green-400/10 text-green-200 hover:bg-green-400/20 hover:border-green-300',
  red: 'border-red-500/50 bg-red-500/10 text-red-200 hover:bg-red-500/20 hover:border-red-400',
  amber: 'border-amber-400/40 bg-amber-400/10 text-amber-200 hover:bg-amber-400/20 hover:border-amber-300',
  gray: 'border-gray-600/60 bg-gray-800/60 text-gray-200 hover:bg-gray-700/60',
};

export function Button({
  tone = 'gray',
  icon,
  children,
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone; icon?: ReactNode }) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-cyan-400 disabled:cursor-not-allowed disabled:opacity-40 ${TONES[tone]} ${className}`}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg border border-gray-700 bg-gray-900/80 p-0.5">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
            o.value === value ? 'bg-cyan-400/20 text-cyan-200 shadow-[0_0_8px_rgb(0_229_255/0.35)]' : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Stat({ label, value, tone = 'text-gray-100' }: { label: string; value: ReactNode; tone?: string }) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900/70 px-2.5 py-1.5">
      <div className="text-[10px] uppercase tracking-wider text-gray-500">{label}</div>
      <div className={`font-mono text-sm font-semibold tabular-nums ${tone}`}>{value}</div>
    </div>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-400">{children}</h3>
      {right}
    </div>
  );
}

/**
 * Imagen de icono del sistema. Todos los iconos usan la misma imagen (icon-*.png);
 * con `avatar` se muestra la foto del usuario (inicio de sesión, menú inicio, cuenta).
 */
export function PhotoIcon({ size = 20, ring, className = '', avatar = false }: { size?: number; ring?: string; className?: string; avatar?: boolean }) {
  const file = avatar ? 'avatar' : 'icon';
  return (
    <img
      src={`/assets/${file}-${size > 48 ? 256 : 64}.png`}
      alt=""
      width={size}
      height={size}
      draggable={false}
      className={`shrink-0 object-cover ${className}`}
      style={{ width: size, height: size, boxShadow: ring ? `0 0 0 2px ${ring}, 0 0 12px ${ring}66` : undefined }}
    />
  );
}
