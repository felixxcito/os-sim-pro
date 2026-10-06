import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import type { AppProps } from '../shell/OsWindowFrame';
import type { AppId } from './meta';

/** Cada app se carga bajo demanda (code splitting): el escritorio arranca rápido. */
export const APP_COMPONENTS: Record<AppId, LazyExoticComponent<ComponentType<AppProps>>> = {
  files: lazy(() => import('../../apps/files/FileExplorer')),
  trash: lazy(() => import('../../apps/files/Trash')),
  browser: lazy(() => import('../../apps/browser/Browser')),
  writer: lazy(() => import('../../apps/writer/Writer')),
  sheets: lazy(() => import('../../apps/sheets/Sheets')),
  notepad: lazy(() => import('../../apps/notepad/Notepad')),
  calculator: lazy(() => import('../../apps/calculator/Calculator')),
  terminal: lazy(() => import('../../apps/terminal/Terminal')),
  viewer: lazy(() => import('../../apps/viewer/Viewer')),
  settings: lazy(() => import('../../apps/settings/Settings')),
  taskmanager: lazy(() => import('../../apps/taskmanager/TaskManager')),
};
