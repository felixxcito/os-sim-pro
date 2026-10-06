import type { AppProps } from '../../os/shell/OsWindowFrame';
import FileExplorer from './FileExplorer';

/** Papelera: el Explorador fijado en /Papelera con acciones de restaurar y vaciar. */
export default function Trash(props: AppProps) {
  return <FileExplorer {...props} trashMode />;
}
