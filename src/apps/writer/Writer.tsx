import { useState } from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import { TextStyleKit } from '@tiptap/extension-text-style';
import Highlight from '@tiptap/extension-highlight';
import { TableKit } from '@tiptap/extension-table';
import Image from '@tiptap/extension-image';
import { CharacterCount, Placeholder } from '@tiptap/extensions';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  FilePlus2,
  FileDown,
  FolderOpen,
  Highlighter,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Printer,
  Redo2,
  RemoveFormatting,
  Save,
  Strikethrough,
  Table2,
  Underline,
  Undo2,
} from 'lucide-react';
import { basename, extname, fs, notifyFsChange, readBinary, writeBinary } from '../../os/fs';
import { confirmDialog, fileDialog, notify, promptDialog } from '../../os/session';
import type { AppProps } from '../../os/shell/OsWindowFrame';
import { useDocument } from '../../os/useDocument';
import { useSimStore } from '../../store/useSimStore';

const FONTS = ['Inter', 'Arial', 'Calibri', 'Georgia', 'Times New Roman', 'Courier New', 'Verdana'];
const SIZES = [10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48];

const PAGE_CSS = `body{font-family:Calibri,Inter,Arial,sans-serif;font-size:11pt;line-height:1.5;color:#111;margin:0}
h1{font-size:24pt;margin:0 0 8pt}h2{font-size:18pt;margin:12pt 0 6pt}h3{font-size:14pt;margin:10pt 0 4pt}
p{margin:0 0 6pt}ul,ol{padding-left:24pt}table{border-collapse:collapse;width:100%}td,th{border:1px solid #999;padding:4pt 6pt;vertical-align:top}
th{background:#eee}img{max-width:100%}blockquote{border-left:3px solid #ccc;margin:0;padding-left:12pt;color:#555}mark{padding:0 2px}`;

const printable = (editor: Editor, title: string) =>
  `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>${PAGE_CSS}</style></head><body>${editor.getHTML()}</body></html>`;

/** Procesador de texto tipo Word. Abre y guarda .docx; exporta a PDF; imprime. */
export default function Writer({ win }: AppProps) {
  const spawnIoTask = useSimStore((s) => s.spawnIoTask);
  const [, force] = useState(0);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: { openOnClick: false, autolink: true } }),
      TextStyleKit,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Highlight.configure({ multicolor: true }),
      TableKit.configure({ table: { resizable: true } }),
      Image.configure({ allowBase64: true }),
      Placeholder.configure({ placeholder: 'Empieza a escribir tu documento…' }),
      CharacterCount,
    ],
    content: '',
    onUpdate: () => doc.markDirty(),
    onSelectionUpdate: () => force((n) => n + 1),
    onTransaction: () => force((n) => n + 1),
  });

  const doc = useDocument(win, {
    ready: Boolean(editor),
    extensions: ['docx', 'html', 'txt'],
    defaultName: 'Documento.docx',
    load: async (path) => {
      if (!editor) return;
      const ext = extname(path);
      if (ext === 'docx') {
        const mammoth = (await import('mammoth/mammoth.browser.js')).default;
        const { value } = await mammoth.convertToHtml({ arrayBuffer: await readBinary(path) });
        editor.commands.setContent(value);
      } else if (ext === 'html' || ext === 'htm') {
        editor.commands.setContent(await fs.read(path));
      } else {
        const text = await fs.read(path);
        editor.commands.setContent(text.split('\n').map((l) => `<p>${l.replace(/[<&]/g, (c) => (c === '<' ? '&lt;' : '&amp;'))}</p>`).join(''));
      }
    },
    save: async (path) => {
      if (!editor) return;
      const ext = extname(path);
      if (ext === 'docx') {
        const { toDocx } = await import('./toDocx');
        await writeBinary(path, await toDocx(editor.getJSON(), basename(path)));
      } else if (ext === 'html') {
        await fs.write(path, printable(editor, basename(path)));
      } else {
        await fs.write(path, editor.getText({ blockSeparator: '\n' }));
      }
    },
  });

  if (!editor) return null;

  const title = doc.path ? basename(doc.path) : 'Documento';
  const chain = () => editor.chain().focus();
  const textStyle = editor.getAttributes('textStyle');
  const block = editor.isActive('heading', { level: 1 }) ? 'h1' : editor.isActive('heading', { level: 2 }) ? 'h2' : editor.isActive('heading', { level: 3 }) ? 'h3' : 'p';

  const newDoc = async () => {
    if (doc.dirty && !(await confirmDialog('Hay cambios sin guardar', '¿Crear un documento nuevo y descartarlos?', true))) return;
    editor.commands.clearContent();
    doc.setPath(null);
  };

  const exportPdf = async () => {
    const target = await fileDialog({ mode: 'save', dir: '/Documentos', name: title.replace(/\.\w+$/, '') + '.pdf', extensions: ['pdf'] });
    if (!target) return;
    if (window.osApi) {
      const saved = await window.osApi.doc.pdf(printable(editor, title), target);
      notify({ title: 'PDF exportado', body: saved, tone: 'success' });
      notifyFsChange(saved);
    } else {
      printInFrame(printable(editor, title));
    }
  };

  const print = async () => {
    spawnIoTask(`impresion:${title.slice(0, 16)}`, 'PRINTER', 4);
    notify({ title: 'Enviado a la impresora', body: `${title} · tarea de E/S en la Impresora del núcleo` });
    if (window.osApi) await window.osApi.doc.print(printable(editor, title));
    else printInFrame(printable(editor, title));
  };

  const insertImage = async () => {
    const path = await fileDialog({ mode: 'open', dir: '/Imágenes', extensions: ['png', 'jpg', 'jpeg', 'gif'] });
    if (!path) return;
    const ext = extname(path) === 'jpg' ? 'jpeg' : extname(path);
    const b64 = await fs.read(path, 'base64');
    chain().setImage({ src: `data:image/${ext};base64,${b64}` }).run();
  };

  const setLink = async () => {
    const url = await promptDialog('Insertar enlace', editor.getAttributes('link').href ?? 'https://');
    if (url === null) return;
    if (!url) chain().unsetLink().run();
    else chain().extendMarkRange('link').setLink({ href: url }).run();
  };

  const words = editor.storage.characterCount?.words?.() ?? 0;
  const chars = editor.storage.characterCount?.characters?.() ?? 0;

  return (
    <div className="flex h-full flex-col bg-gray-900" onKeyDown={doc.onKeyDown}>
      {/* Barra de archivo */}
      <div className="flex items-center gap-1 border-b border-gray-800 bg-gray-900 px-2 py-1">
        <Tool label="Nuevo" onClick={newDoc}>
          <FilePlus2 size={15} />
        </Tool>
        <Tool label="Abrir (Ctrl+O)" onClick={doc.open}>
          <FolderOpen size={15} />
        </Tool>
        <Tool label="Guardar (Ctrl+S)" onClick={doc.save}>
          <Save size={15} />
        </Tool>
        <button type="button" onClick={doc.saveAs} className="rounded px-2 py-1 text-[11px] text-gray-300 hover:bg-white/10">
          Guardar como…
        </button>
        <Tool label="Exportar a PDF" onClick={exportPdf}>
          <FileDown size={15} />
        </Tool>
        <Tool label="Imprimir" onClick={print}>
          <Printer size={15} />
        </Tool>
        <Sep />
        <Tool label="Deshacer" onClick={() => chain().undo().run()} disabled={!editor.can().undo()}>
          <Undo2 size={15} />
        </Tool>
        <Tool label="Rehacer" onClick={() => chain().redo().run()} disabled={!editor.can().redo()}>
          <Redo2 size={15} />
        </Tool>
      </div>

      {/* Barra de formato */}
      <div className="flex flex-wrap items-center gap-1 border-b border-gray-800 bg-gray-900/80 px-2 py-1">
        <select
          aria-label="Estilo de párrafo"
          value={block}
          onChange={(e) => {
            const v = e.target.value;
            if (v === 'p') chain().setParagraph().run();
            else chain().toggleHeading({ level: Number(v[1]) as 1 | 2 | 3 }).run();
          }}
          className="rounded border border-gray-700 bg-gray-950 px-1.5 py-1 text-[11px] text-gray-200"
        >
          <option value="p">Normal</option>
          <option value="h1">Título 1</option>
          <option value="h2">Título 2</option>
          <option value="h3">Título 3</option>
        </select>
        <select
          aria-label="Fuente"
          value={textStyle.fontFamily ?? ''}
          onChange={(e) => (e.target.value ? chain().setFontFamily(e.target.value).run() : chain().unsetFontFamily().run())}
          className="w-28 rounded border border-gray-700 bg-gray-950 px-1.5 py-1 text-[11px] text-gray-200"
        >
          <option value="">Fuente</option>
          {FONTS.map((f) => (
            <option key={f} value={f} style={{ fontFamily: f }}>
              {f}
            </option>
          ))}
        </select>
        <select
          aria-label="Tamaño"
          value={textStyle.fontSize ? String(parseInt(textStyle.fontSize) * 0.75) : ''}
          onChange={(e) => (e.target.value ? chain().setFontSize(`${Number(e.target.value) / 0.75}px`).run() : chain().unsetFontSize().run())}
          className="w-16 rounded border border-gray-700 bg-gray-950 px-1.5 py-1 text-[11px] text-gray-200"
        >
          <option value="">11</option>
          {SIZES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <Sep />
        <Tool label="Negrita (Ctrl+B)" active={editor.isActive('bold')} onClick={() => chain().toggleBold().run()}>
          <Bold size={15} />
        </Tool>
        <Tool label="Cursiva (Ctrl+I)" active={editor.isActive('italic')} onClick={() => chain().toggleItalic().run()}>
          <Italic size={15} />
        </Tool>
        <Tool label="Subrayado (Ctrl+U)" active={editor.isActive('underline')} onClick={() => chain().toggleUnderline().run()}>
          <Underline size={15} />
        </Tool>
        <Tool label="Tachado" active={editor.isActive('strike')} onClick={() => chain().toggleStrike().run()}>
          <Strikethrough size={15} />
        </Tool>
        <label className="flex cursor-pointer items-center rounded p-1 hover:bg-white/10" title="Color del texto">
          <span className="text-sm font-bold underline decoration-2" style={{ color: textStyle.color ?? '#e5e7eb', textDecorationColor: textStyle.color ?? '#e5e7eb' }}>
            A
          </span>
          <input type="color" className="sr-only" value={textStyle.color ?? '#000000'} onChange={(e) => chain().setColor(e.target.value).run()} aria-label="Color del texto" />
        </label>
        <label className="flex cursor-pointer items-center rounded p-1 hover:bg-white/10" title="Resaltado">
          <Highlighter size={15} className="text-yellow-300" />
          <input type="color" className="sr-only" defaultValue="#fff59d" onChange={(e) => chain().toggleHighlight({ color: e.target.value }).run()} aria-label="Color de resaltado" />
        </label>
        <Sep />
        {(
          [
            ['left', AlignLeft],
            ['center', AlignCenter],
            ['right', AlignRight],
            ['justify', AlignJustify],
          ] as const
        ).map(([a, Icon]) => (
          <Tool key={a} label={`Alinear ${a}`} active={editor.isActive({ textAlign: a })} onClick={() => chain().setTextAlign(a).run()}>
            <Icon size={15} />
          </Tool>
        ))}
        <Sep />
        <Tool label="Viñetas" active={editor.isActive('bulletList')} onClick={() => chain().toggleBulletList().run()}>
          <List size={15} />
        </Tool>
        <Tool label="Numeración" active={editor.isActive('orderedList')} onClick={() => chain().toggleOrderedList().run()}>
          <ListOrdered size={15} />
        </Tool>
        <Sep />
        <Tool label="Insertar tabla 3×3" onClick={() => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>
          <Table2 size={15} />
        </Tool>
        <Tool label="Insertar imagen" onClick={insertImage}>
          <ImagePlus size={15} />
        </Tool>
        <Tool label="Enlace" active={editor.isActive('link')} onClick={setLink}>
          <Link2 size={15} />
        </Tool>
        <Tool label="Línea horizontal" onClick={() => chain().setHorizontalRule().run()}>
          <Minus size={15} />
        </Tool>
        <Tool label="Quitar formato" onClick={() => chain().unsetAllMarks().clearNodes().run()}>
          <RemoveFormatting size={15} />
        </Tool>
        {editor.isActive('table') && (
          <>
            <Sep />
            <button type="button" className="rounded px-1.5 py-1 text-[11px] text-gray-300 hover:bg-white/10" onClick={() => chain().addRowAfter().run()}>
              + fila
            </button>
            <button type="button" className="rounded px-1.5 py-1 text-[11px] text-gray-300 hover:bg-white/10" onClick={() => chain().addColumnAfter().run()}>
              + columna
            </button>
            <button type="button" className="rounded px-1.5 py-1 text-[11px] text-red-300 hover:bg-white/10" onClick={() => chain().deleteTable().run()}>
              borrar tabla
            </button>
          </>
        )}
      </div>

      {/* Página */}
      <div className="scrollbar-thin min-h-0 flex-1 overflow-auto bg-gray-700/40 py-6 select-text" onClick={(e) => e.target === e.currentTarget && editor.commands.focus('end')}>
        <EditorContent editor={editor} className="doc-page mx-auto min-h-[1056px] w-[816px] max-w-[calc(100%-24px)] bg-white px-[72px] py-[64px] text-gray-900 shadow-2xl" />
      </div>
      <div className="flex justify-between border-t border-gray-800 px-3 py-0.5 font-mono text-[10px] text-gray-500">
        <span>Página {Math.max(1, Math.ceil(words / 450))} · {words} palabras · {chars} caracteres</span>
        <span>{doc.path ?? 'Sin guardar'}</span>
      </div>
    </div>
  );
}

function printInFrame(html: string) {
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;width:0;height:0;border:0';
  document.body.appendChild(frame);
  frame.contentDocument!.write(html);
  frame.contentDocument!.close();
  frame.contentWindow!.focus();
  frame.contentWindow!.print();
  setTimeout(() => frame.remove(), 1000);
}

function Tool({ label, onClick, children, active, disabled }: { label: string; onClick: () => void; children: React.ReactNode; active?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`rounded p-1 transition-colors disabled:opacity-30 ${active ? 'bg-sky-400/25 text-sky-200' : 'text-gray-300 hover:bg-white/10'}`}
    >
      {children}
    </button>
  );
}

const Sep = () => <span className="mx-0.5 h-5 w-px bg-gray-700" />;
