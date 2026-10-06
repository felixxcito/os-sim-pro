import { addr, FormulaError, parseAddr, type CellValue } from './formula';

export type Fmt = 'general' | 'number' | 'currency' | 'percent';

export interface Cell {
  raw: string;
  bold?: boolean;
  italic?: boolean;
  align?: 'left' | 'center' | 'right';
  fmt?: Fmt;
}

export type Cells = Record<string, Cell>;

/** Funciones en español → nombre interno de Excel (que es el que se guarda en el .xlsx). */
const TO_EXCEL: Record<string, string> = {
  SUMA: 'SUM',
  PROMEDIO: 'AVERAGE',
  CONTAR: 'COUNT',
  CONTARA: 'COUNTA',
  SI: 'IF',
  Y: 'AND',
  O: 'OR',
  NO: 'NOT',
  REDONDEAR: 'ROUND',
  RAIZ: 'SQRT',
  POTENCIA: 'POWER',
  RESIDUO: 'MOD',
  CONCATENAR: 'CONCAT',
  MAYUSC: 'UPPER',
  MINUSC: 'LOWER',
  LARGO: 'LEN',
  HOY: 'TODAY',
};

/** Traduce una fórmula a la sintaxis de Excel (nombres en inglés y "," como separador), sin tocar los textos entre comillas. */
export function toExcelFormula(formula: string): string {
  return formula
    .split(/("(?:[^"]|"")*")/)
    .map((part, i) =>
      i % 2 === 1
        ? part
        : part.replace(/;/g, ',').replace(/\b([A-ZÁÉÍÓÚÑ]+)\s*\(/gi, (m, name: string) => {
            const en = TO_EXCEL[name.toUpperCase()];
            return en ? `${en}(` : m;
          }),
    )
    .join('');
}

export function usedBounds(cells: Cells) {
  let maxC = -1;
  let maxR = -1;
  for (const a of Object.keys(cells)) {
    if (!cells[a].raw) continue;
    const p = parseAddr(a)!;
    maxC = Math.max(maxC, p.c);
    maxR = Math.max(maxR, p.r);
  }
  return { maxC, maxR };
}

const plain = (v: CellValue | undefined) => (v === undefined ? '' : v instanceof FormulaError ? v.code : String(v));

// ------------------------------------------------------------------ CSV

export function toCsv(cells: Cells, values: Record<string, CellValue>): string {
  const { maxC, maxR } = usedBounds(cells);
  const rows: string[] = [];
  for (let r = 0; r <= maxR; r++) {
    const row: string[] = [];
    for (let c = 0; c <= maxC; c++) {
      const s = plain(values[addr(c, r)]);
      row.push(/[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
    }
    rows.push(row.join(','));
  }
  return rows.join('\n') + '\n';
}

export function fromCsv(text: string): Cells {
  const first = text.split('\n')[0] ?? '';
  const sep = (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ';' : ',';
  const cells: Cells = {};
  let r = 0;
  let c = 0;
  let cur = '';
  let quoted = false;
  const push = () => {
    if (cur !== '') cells[addr(c, r)] = { raw: cur };
    cur = '';
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      push();
      c++;
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      push();
      r++;
      c = 0;
    } else cur += ch;
  }
  push();
  return cells;
}

// ------------------------------------------------------------------ XLSX (exceljs, cargado bajo demanda)

const NUMFMT: Record<Fmt, string | undefined> = { general: undefined, number: '#,##0.00', currency: '"$"#,##0.00', percent: '0.00%' };

export async function toXlsx(cells: Cells, values: Record<string, CellValue>): Promise<Uint8Array> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'OS-Sim Pro · Hojas';
  const ws = wb.addWorksheet('Hoja1');
  for (const [a, cell] of Object.entries(cells)) {
    const target = ws.getCell(a);
    const v = values[a];
    if (cell.raw.startsWith('=')) {
      const result = v instanceof FormulaError || v === undefined ? undefined : v;
      target.value = { formula: toExcelFormula(cell.raw.slice(1)), result } as never;
    } else if (cell.raw !== '') {
      target.value = v instanceof FormulaError ? cell.raw : (v as string | number | boolean);
    }
    if (cell.bold || cell.italic) target.font = { bold: cell.bold, italic: cell.italic };
    if (cell.align) target.alignment = { horizontal: cell.align };
    if (cell.fmt && NUMFMT[cell.fmt]) target.numFmt = NUMFMT[cell.fmt]!;
  }
  ws.columns.forEach((col) => (col.width = 14));
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

export async function fromXlsx(buffer: ArrayBuffer): Promise<Cells> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets[0];
  const cells: Cells = {};
  if (!ws) return cells;
  ws.eachRow({ includeEmpty: false }, (row) => {
    row.eachCell({ includeEmpty: false }, (cell) => {
      const v = cell.value as unknown;
      let raw = '';
      if (v === null || v === undefined) raw = '';
      else if (typeof v === 'object' && v instanceof Date) raw = v.toLocaleDateString('es');
      else if (typeof v === 'object' && 'formula' in (v as object)) raw = '=' + (v as { formula: string }).formula;
      else if (typeof v === 'object' && 'sharedFormula' in (v as object)) raw = String((v as { result?: unknown }).result ?? '');
      else if (typeof v === 'object' && 'richText' in (v as object)) raw = (v as { richText: { text: string }[] }).richText.map((t) => t.text).join('');
      else if (typeof v === 'object' && 'text' in (v as object)) raw = String((v as { text: string }).text);
      else if (typeof v === 'object' && 'error' in (v as object)) raw = String((v as { error: string }).error);
      else raw = typeof v === 'boolean' ? (v ? 'VERDADERO' : 'FALSO') : String(v);
      if (!raw) return;
      const fmt = cell.numFmt ?? '';
      cells[cell.address] = {
        raw,
        bold: cell.font?.bold || undefined,
        italic: cell.font?.italic || undefined,
        align: (['left', 'center', 'right'] as const).find((x) => x === cell.alignment?.horizontal),
        fmt: fmt.includes('%') ? 'percent' : /[$€]/.test(fmt) ? 'currency' : fmt.includes('0.00') ? 'number' : undefined,
      };
    });
  });
  return cells;
}
