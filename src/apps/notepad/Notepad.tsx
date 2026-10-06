import { useState } from 'react';
import { FolderOpen, Save, WrapText } from 'lucide-react';
import { Button } from '../../components/ui/primitives';
import { fs } from '../../os/fs';
import type { AppProps } from '../../os/shell/OsWindowFrame';
import { useDocument } from '../../os/useDocument';

export default function Notepad({ win }: AppProps) {
  const [text, setText] = useState('');
  const [wrap, setWrap] = useState(true);
  const doc = useDocument(win, {
    extensions: ['txt', 'md', 'json', 'log', 'js', 'ts', 'css'],
    defaultName: 'nota.txt',
    load: async (p) => setText(await fs.read(p)),
    save: (p) => fs.write(p, text),
  });
  const lines = text.split('\n');
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;

  return (
    <div className="flex h-full flex-col" onKeyDown={doc.onKeyDown}>
      <div className="flex items-center gap-1 border-b border-gray-800 px-2 py-1">
        <Button icon={<FolderOpen size={13} />} onClick={doc.open} title="Abrir (Ctrl+O)">
          Abrir
        </Button>
        <Button tone="cyan" icon={<Save size={13} />} onClick={doc.save} title="Guardar (Ctrl+S)">
          Guardar
        </Button>
        <Button onClick={doc.saveAs}>Guardar como…</Button>
        <div className="flex-1" />
        <Button tone={wrap ? 'cyan' : 'gray'} icon={<WrapText size={13} />} onClick={() => setWrap((w) => !w)}>
          Ajuste de línea
        </Button>
      </div>
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          doc.markDirty();
        }}
        spellCheck={false}
        autoFocus
        aria-label="Contenido del documento"
        className={`scrollbar-thin flex-1 resize-none bg-gray-950/70 p-3 font-mono text-[13px] leading-relaxed text-gray-100 select-text focus:outline-none ${wrap ? '' : 'whitespace-pre'}`}
        style={{ overflowWrap: wrap ? 'anywhere' : 'normal' }}
      />
      <div className="flex justify-end gap-4 border-t border-gray-800 px-3 py-0.5 font-mono text-[10px] text-gray-500">
        <span>{lines.length} líneas</span>
        <span>{words} palabras</span>
        <span>{text.length} caracteres</span>
        <span>UTF-8</span>
      </div>
    </div>
  );
}
