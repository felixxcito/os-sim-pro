import {
  Calculator,
  FileText,
  FolderOpen,
  Gauge,
  Globe,
  Image,
  NotebookPen,
  Settings,
  Sheet,
  SquareTerminal,
  Trash2,
  type LucideIcon,
} from 'lucide-react';

export type AppId =
  | 'files'
  | 'browser'
  | 'writer'
  | 'sheets'
  | 'notepad'
  | 'calculator'
  | 'terminal'
  | 'viewer'
  | 'settings'
  | 'taskmanager'
  | 'trash';

export interface AppMeta {
  id: AppId;
  name: string;
  /** Nombre del proceso en el núcleo. */
  process: string;
  glyph: LucideIcon;
  accent: string;
  /** Memoria que reserva el proceso al abrir la ventana (MB). */
  memory: number;
  priority: number;
  size: { w: number; h: number };
  /** Extensiones de archivo que abre esta app. */
  extensions?: string[];
  /** Solo una ventana a la vez (se enfoca la existente). */
  single?: boolean;
  desktop?: boolean;
}

/** Todas las apps usan la foto como icono; el glifo y el color las distinguen. */
export const APP_META: Record<AppId, AppMeta> = {
  files: { id: 'files', name: 'Explorador', process: 'explorador', glyph: FolderOpen, accent: '#ffb300', memory: 48, priority: 3, size: { w: 860, h: 540 }, desktop: true },
  browser: { id: 'browser', name: 'Navegador', process: 'navegador', glyph: Globe, accent: '#00e5ff', memory: 256, priority: 4, size: { w: 1100, h: 700 }, extensions: ['html', 'htm', 'pdf'], desktop: true },
  writer: { id: 'writer', name: 'Escritor', process: 'escritor', glyph: FileText, accent: '#40c4ff', memory: 128, priority: 4, size: { w: 980, h: 680 }, extensions: ['docx', 'wdoc'], desktop: true },
  sheets: { id: 'sheets', name: 'Hojas', process: 'hojas', glyph: Sheet, accent: '#39ff14', memory: 128, priority: 4, size: { w: 1040, h: 640 }, extensions: ['xlsx', 'csv'], desktop: true },
  notepad: { id: 'notepad', name: 'Bloc de notas', process: 'bloc-notas', glyph: NotebookPen, accent: '#eeff41', memory: 16, priority: 5, size: { w: 640, h: 460 }, extensions: ['txt', 'md', 'json', 'log', 'js', 'ts', 'css'], desktop: true },
  calculator: { id: 'calculator', name: 'Calculadora', process: 'calculadora', glyph: Calculator, accent: '#ff6e40', memory: 16, priority: 5, size: { w: 320, h: 480 }, single: true },
  terminal: { id: 'terminal', name: 'Terminal', process: 'terminal', glyph: SquareTerminal, accent: '#64ffda', memory: 32, priority: 3, size: { w: 760, h: 460 }, desktop: true },
  viewer: { id: 'viewer', name: 'Visor', process: 'visor', glyph: Image, accent: '#ff4081', memory: 64, priority: 5, size: { w: 820, h: 600 }, extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'] },
  settings: { id: 'settings', name: 'Configuración', process: 'configuracion', glyph: Settings, accent: '#b388ff', memory: 32, priority: 5, size: { w: 760, h: 540 }, single: true, desktop: true },
  taskmanager: { id: 'taskmanager', name: 'Administrador de tareas', process: 'admin-tareas', glyph: Gauge, accent: '#ff00e5', memory: 64, priority: 2, size: { w: 1180, h: 720 }, single: true, desktop: true },
  trash: { id: 'trash', name: 'Papelera', process: 'papelera', glyph: Trash2, accent: '#9ca3af', memory: 16, priority: 5, size: { w: 760, h: 480 }, single: true, desktop: true },
};

export const APP_IDS = Object.keys(APP_META) as AppId[];

export function appForExtension(ext: string): AppId | null {
  for (const meta of Object.values(APP_META)) if (meta.extensions?.includes(ext)) return meta.id;
  return null;
}
