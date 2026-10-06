import {
  AlignmentType,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type IRunOptions,
  type ParagraphChild,
} from 'docx';
import type { JSONContent } from '@tiptap/react';

/**
 * Conversor del documento del editor (JSON de TipTap) a Word (.docx).
 * Cubre lo que ofrece la barra del Escritor: títulos, alineación, listas, tablas,
 * imágenes, enlaces y formato de texto (negrita, cursiva, subrayado, tachado, color, tamaño, fuente, resaltado).
 */

const ALIGN: Record<string, (typeof AlignmentType)[keyof typeof AlignmentType]> = {
  left: AlignmentType.LEFT,
  center: AlignmentType.CENTER,
  right: AlignmentType.RIGHT,
  justify: AlignmentType.JUSTIFIED,
};

const HEADINGS = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4];

const hex = (c?: string) => {
  if (!c) return undefined;
  if (c.startsWith('#')) return c.slice(1).padEnd(6, '0').slice(0, 6).toUpperCase();
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(c);
  return m ? m.slice(1, 4).map((n) => Number(n).toString(16).padStart(2, '0')).join('').toUpperCase() : undefined;
};

/** "16px" / "12pt" → medios puntos (unidad de docx). */
const halfPoints = (size?: string) => {
  if (!size) return undefined;
  const n = parseFloat(size);
  if (!n) return undefined;
  return Math.round((size.endsWith('pt') ? n : n * 0.75) * 2);
};

function runOptions(node: JSONContent): IRunOptions {
  const opts: Record<string, unknown> = { text: node.text ?? '' };
  for (const mark of node.marks ?? []) {
    const a = mark.attrs ?? {};
    switch (mark.type) {
      case 'bold':
        opts.bold = true;
        break;
      case 'italic':
        opts.italics = true;
        break;
      case 'underline':
        opts.underline = {};
        break;
      case 'strike':
        opts.strike = true;
        break;
      case 'code':
        opts.font = 'Courier New';
        break;
      case 'textStyle':
        if (a.color) opts.color = hex(a.color);
        if (a.fontSize) opts.size = halfPoints(a.fontSize);
        if (a.fontFamily) opts.font = String(a.fontFamily).split(',')[0].replace(/["']/g, '').trim();
        break;
      case 'highlight':
        opts.shading = { type: ShadingType.CLEAR, color: 'auto', fill: hex(a.color) ?? 'FFFF00' };
        break;
    }
  }
  return opts as IRunOptions;
}

function dataUrlToImage(src: string): { data: Uint8Array; type: 'png' | 'jpg' | 'gif' | 'bmp' } | null {
  const m = /^data:image\/(png|jpe?g|gif|bmp);base64,(.+)$/.exec(src);
  if (!m) return null;
  const type = m[1] === 'jpeg' || m[1] === 'jpg' ? 'jpg' : (m[1] as 'png' | 'gif' | 'bmp');
  return { data: Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0)), type };
}

function inline(nodes: JSONContent[] = []): ParagraphChild[] {
  const out: ParagraphChild[] = [];
  for (const n of nodes) {
    if (n.type === 'text') {
      const link = n.marks?.find((m) => m.type === 'link');
      const run = new TextRun({ ...runOptions(n), ...(link ? { style: 'Hyperlink', color: '0563C1', underline: {} } : {}) });
      out.push(link ? new ExternalHyperlink({ link: String(link.attrs?.href ?? ''), children: [run] }) : run);
    } else if (n.type === 'hardBreak') {
      out.push(new TextRun({ text: '', break: 1 }));
    } else if (n.type === 'image') {
      const img = dataUrlToImage(String(n.attrs?.src ?? ''));
      if (img) out.push(new ImageRun({ type: img.type, data: img.data, transformation: { width: 420, height: 280 } }));
    }
  }
  return out;
}

function paragraph(n: JSONContent, extra: Record<string, unknown> = {}): Paragraph {
  return new Paragraph({
    children: inline(n.content),
    alignment: ALIGN[n.attrs?.textAlign as string],
    ...(n.type === 'heading' ? { heading: HEADINGS[Math.min(3, (n.attrs?.level ?? 1) - 1)] } : {}),
    ...extra,
  });
}

function blocks(nodes: JSONContent[] = [], level = 0): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];
  for (const n of nodes) {
    switch (n.type) {
      case 'paragraph':
      case 'heading':
        out.push(paragraph(n));
        break;
      case 'bulletList':
      case 'orderedList':
        for (const item of n.content ?? []) {
          for (const child of item.content ?? []) {
            if (child.type === 'paragraph') {
              out.push(paragraph(child, { numbering: { reference: n.type === 'bulletList' ? 'viñetas' : 'numeros', level: Math.min(level, 2) } }));
            } else {
              out.push(...blocks([child], level + 1));
            }
          }
        }
        break;
      case 'blockquote':
        for (const p of n.content ?? []) out.push(paragraph(p, { indent: { left: 720 }, style: 'Quote' }));
        break;
      case 'codeBlock':
        out.push(new Paragraph({ children: [new TextRun({ text: (n.content ?? []).map((t) => t.text).join(''), font: 'Courier New' })] }));
        break;
      case 'horizontalRule':
        out.push(new Paragraph({ border: { bottom: { style: 'single', size: 6, color: '999999', space: 1 } }, children: [] }));
        break;
      case 'image':
        out.push(new Paragraph({ children: inline([n]) }));
        break;
      case 'table':
        out.push(
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: (n.content ?? []).map(
              (row) =>
                new TableRow({
                  children: (row.content ?? []).map(
                    (cell) =>
                      new TableCell({
                        children: (blocks(cell.content).filter((b) => b instanceof Paragraph) as Paragraph[]).concat(
                          cell.content?.length ? [] : [new Paragraph('')],
                        ),
                        ...(cell.type === 'tableHeader' ? { shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'E7E6E6' } } : {}),
                      }),
                  ),
                }),
            ),
          }),
        );
        break;
    }
  }
  return out;
}

const listLevels = (format: (typeof LevelFormat)[keyof typeof LevelFormat], text: (l: number) => string) =>
  [0, 1, 2].map((level) => ({
    level,
    format,
    text: text(level),
    alignment: AlignmentType.LEFT,
    style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } },
  }));

export async function toDocx(json: JSONContent, title = 'Documento'): Promise<Blob> {
  const doc = new Document({
    creator: 'OS-Sim Pro · Escritor',
    title,
    numbering: {
      config: [
        { reference: 'viñetas', levels: listLevels(LevelFormat.BULLET, (l) => ['•', '◦', '▪'][l]) },
        { reference: 'numeros', levels: listLevels(LevelFormat.DECIMAL, (l) => `%${l + 1}.`) },
      ],
    },
    styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } },
    sections: [{ children: blocks(json.content) }],
  });
  return Packer.toBlob(doc);
}
