import type { AppDef } from './apps';
import { PhotoIcon } from '../ui/primitives';

/** Icono de escritorio: la foto del usuario con el glifo y el color de la aplicación. */
export function DesktopIcon({ app, onOpen, active }: { app: AppDef; onOpen: () => void; active: boolean }) {
  const Glyph = app.glyph;
  return (
    <button
      type="button"
      onDoubleClick={onOpen}
      onClick={(e) => {
        // En pantallas táctiles basta un toque; con ratón se respeta el doble clic de escritorio.
        if ((e.nativeEvent as PointerEvent).pointerType === 'touch' || e.detail === 0) onOpen();
      }}
      className="group flex w-20 flex-col items-center gap-1.5 rounded-xl p-1.5 text-center outline-none hover:bg-white/10 focus-visible:bg-white/15 focus-visible:ring-1 focus-visible:ring-cyan-300"
      aria-label={`Abrir ${app.title}`}
      title={`${app.title} (doble clic)`}
    >
      <span className="relative">
        <PhotoIcon size={56} ring={app.accent} className="rounded-2xl transition-transform group-hover:scale-105" />
        <span
          className="absolute -right-1.5 -bottom-1.5 flex h-6 w-6 items-center justify-center rounded-full border border-gray-950"
          style={{ background: app.accent, boxShadow: `0 0 10px ${app.accent}` }}
        >
          <Glyph size={13} className="text-gray-950" strokeWidth={2.5} />
        </span>
        {active && <span className="absolute -top-1 -left-1 h-2.5 w-2.5 rounded-full bg-[#39ff14] shadow-[0_0_6px_#39ff14]" />}
      </span>
      <span className="text-[11px] font-medium leading-tight text-white [text-shadow:0_1px_3px_rgb(0_0_0/0.9)]">{app.short}</span>
    </button>
  );
}
