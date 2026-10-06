/**
 * Fondo de pantalla del sistema: siempre la foto del usuario (no se puede cambiar).
 * `blur` solo se usa en la pantalla de bloqueo.
 */
export function Wallpaper({ blur = false }: { blur?: boolean }) {
  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden>
      <div className="wallpaper absolute -inset-6" style={{ filter: blur ? 'blur(14px)' : undefined }} />
      <div className="wallpaper-veil absolute inset-0" />
      <div className="scanlines pointer-events-none absolute inset-0" />
    </div>
  );
}
