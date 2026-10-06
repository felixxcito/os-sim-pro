import type { Wallpaper as Kind } from '../session';

export const WALLPAPERS: { id: Kind; name: string }[] = [
  { id: 'photo', name: 'Foto' },
  { id: 'photo-blur', name: 'Foto desenfocada' },
  { id: 'photo-bw', name: 'Foto en blanco y negro' },
  { id: 'neon', name: 'Neón' },
  { id: 'midnight', name: 'Medianoche' },
];

/** Fondo de pantalla. Por defecto, la foto del usuario. */
export function Wallpaper({ kind, blur = false }: { kind: Kind; blur?: boolean }) {
  const isPhoto = kind.startsWith('photo');
  const filter = [kind === 'photo-blur' || blur ? 'blur(14px)' : '', kind === 'photo-bw' ? 'grayscale(1) contrast(1.1)' : ''].filter(Boolean).join(' ');
  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden>
      {isPhoto ? (
        <div className="wallpaper absolute -inset-6" style={{ filter: filter || undefined }} />
      ) : kind === 'neon' ? (
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_20%_10%,#00e5ff55,transparent_50%),radial-gradient(ellipse_at_80%_90%,#ff00e555,transparent_50%),linear-gradient(#030712,#0b1120)]" />
      ) : (
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_120%,#1e3a8a,transparent_60%),linear-gradient(#020617,#0f172a)]" />
      )}
      <div className={`absolute inset-0 ${isPhoto ? 'wallpaper-veil' : ''}`} />
      <div className="scanlines pointer-events-none absolute inset-0" />
    </div>
  );
}
