import {
  File,
  FileArchive,
  FileCode,
  FileText,
  FileType2,
  Folder,
  Globe,
  Image,
  Music,
  Sheet,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import { PhotoIcon } from '../../components/ui/primitives';
import { APP_META, type AppId } from '../apps/meta';
import { extname, type FsEntry } from '../fs';

/** Icono de app: la foto con el glifo y el color de la aplicación. */
export function AppIcon({ appId, size = 48, className = '' }: { appId: AppId; size?: number; className?: string }) {
  const meta = APP_META[appId];
  return <BadgedPhoto size={size} glyph={meta.glyph} accent={meta.accent} className={className} />;
}

const TYPES: { exts: string[]; glyph: LucideIcon; accent: string }[] = [
  { exts: ['docx', 'doc', 'wdoc', 'odt', 'rtf'], glyph: FileText, accent: '#40c4ff' },
  { exts: ['xlsx', 'xls', 'csv', 'ods'], glyph: Sheet, accent: '#39ff14' },
  { exts: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'], glyph: Image, accent: '#ff4081' },
  { exts: ['pdf'], glyph: FileType2, accent: '#ff3b3b' },
  { exts: ['html', 'htm'], glyph: Globe, accent: '#00e5ff' },
  { exts: ['zip', 'rar', '7z', 'tar', 'gz', 'dmg', 'exe', 'msi'], glyph: FileArchive, accent: '#ffb300' },
  { exts: ['mp3', 'wav', 'ogg', 'm4a', 'flac'], glyph: Music, accent: '#b388ff' },
  { exts: ['js', 'ts', 'json', 'css', 'py', 'java', 'c', 'cpp', 'md'], glyph: FileCode, accent: '#64ffda' },
  { exts: ['txt', 'log'], glyph: FileText, accent: '#eeff41' },
];

export function typeOf(entry: Pick<FsEntry, 'isDir' | 'path'>): { glyph: LucideIcon; accent: string } {
  if (entry.isDir) return entry.path === '/Papelera' ? { glyph: Trash2, accent: '#9ca3af' } : { glyph: Folder, accent: '#ffb300' };
  const ext = extname(entry.path);
  return TYPES.find((t) => t.exts.includes(ext)) ?? { glyph: File, accent: '#94a3b8' };
}

/** Icono de archivo o carpeta: también con la foto, más el glifo del tipo y la extensión. */
export function FileIcon({ entry, size = 48 }: { entry: Pick<FsEntry, 'isDir' | 'path'>; size?: number }) {
  const t = typeOf(entry);
  const ext = entry.isDir ? '' : extname(entry.path).toUpperCase();
  return (
    <span className="relative inline-block">
      <BadgedPhoto size={size} glyph={t.glyph} accent={t.accent} rounded={entry.isDir ? 'rounded-lg' : 'rounded-md'} />
      {ext && size >= 40 && (
        <span className="absolute top-0.5 left-0.5 rounded bg-gray-950/80 px-1 font-mono text-[8px] font-bold text-white">{ext.slice(0, 4)}</span>
      )}
    </span>
  );
}

export function BadgedPhoto({
  size,
  glyph: Glyph,
  accent,
  className = '',
  rounded,
}: {
  size: number;
  glyph: LucideIcon;
  accent: string;
  className?: string;
  rounded?: string;
}) {
  const badge = Math.max(12, Math.round(size * 0.42));
  return (
    <span className={`relative inline-block shrink-0 ${className}`} style={{ width: size, height: size }}>
      <PhotoIcon size={size} ring={size >= 32 ? accent : undefined} className={rounded ?? (size >= 40 ? 'rounded-2xl' : 'rounded-md')} />
      <span
        className="absolute -right-1 -bottom-1 flex items-center justify-center rounded-full border border-gray-950"
        style={{ width: badge, height: badge, background: accent, boxShadow: size >= 32 ? `0 0 8px ${accent}` : undefined }}
      >
        <Glyph size={Math.round(badge * 0.58)} className="text-gray-950" strokeWidth={2.5} />
      </span>
    </span>
  );
}
