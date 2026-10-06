import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlignCenter, AlignLeft, AlignRight, BarChart3, Bold, FilePlus2, FileSpreadsheet, FolderOpen, Italic, Redo2, Save, Sigma, Undo2 } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { extname, fs, readBinary, writeBinary } from '../../os/fs';
import { confirmDialog, fileDialog, notify } from '../../os/session';
import type { AppProps } from '../../os/shell/OsWindowFrame';
import { useDocument } from '../../os/useDocument';
import { addr, computeSheet, formatValue, FUNCTION_NAMES, indexToCol, type CellValue } from './formula';
import { fromCsv, fromXlsx, toCsv, toXlsx, type Cell, type Cells, type Fmt } from './sheetIo';

const ROWS = 100;
const COLS = 26;
const COL_W = 104;
const ROW_H = 24;

interface Pos {
  c: number;
  r: number;
}

/** Callback de identidad estable que siempre llama a la versión más reciente (para no romper memo). */
function useStable<A extends unknown[]>(fn: (...args: A) => void) {
  const ref = useRef(fn);
  ref.current = fn;
  return useCallback((...args: A) => ref.current(...args), []);
}

const clamp = (p: Pos): Pos => ({ c: Math.max(0, Math.min(COLS - 1, p.c)), r: Math.max(0, Math.min(ROWS - 1, p.r)) });

/** Hoja de cálculo tipo Excel con motor de fórmulas propio. Abre y guarda .xlsx y .csv. */
export default function Sheets({ win }: AppProps) {
  const [cells, setCells] = useState<Cells>({});
  const [anchor, setAnchor] = useState<Pos>({ c: 0, r: 0 });
  const [focus, setFocus] = useState<Pos>({ c: 0, r: 0 });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [chart, setChart] = useState<'bar' | 'line' | null>(null);
  const undo = useRef<Cells[]>([]);
  const redo = useRef<Cells[]>([]);
  const grid = useRef<HTMLDivElement>(null);
  const cellInput = useRef<HTMLInputElement>(null);

  const raws = useMemo(() => Object.fromEntries(Object.entries(cells).map(([a, c]) => [a, c.raw])), [cells]);
  const values = useMemo(() => computeSheet(raws), [raws]);

  const doc = useDocument(win, {
    extensions: ['xlsx', 'csv'],
    defaultName: 'Libro.xlsx',
    load: async (path) => {
      const next = extname(path) === 'csv' ? fromCsv(await fs.read(path)) : await fromXlsx(await readBinary(path));
      setCells(next);
      undo.current = [];
      redo.current = [];
    },
    save: async (path) => {
      if (extname(path) === 'csv') await fs.write(path, toCsv(cells, values));
      else await writeBinary(path, await toXlsx(cells, values));
    },
  });

  const range = {
    c1: Math.min(anchor.c, focus.c),
    c2: Math.max(anchor.c, focus.c),
    r1: Math.min(anchor.r, focus.r),
    r2: Math.max(anchor.r, focus.r),
  };
  const rangeAddrs = () => {
    const out: string[] = [];
    for (let r = range.r1; r <= range.r2; r++) for (let c = range.c1; c <= range.c2; c++) out.push(addr(c, r));
    return out;
  };
  const active = addr(anchor.c, anchor.r);
  const rangeLabel = range.c1 === range.c2 && range.r1 === range.r2 ? active : `${addr(range.c1, range.r1)}:${addr(range.c2, range.r2)}`;

  const commitCells = (next: Cells) => {
    undo.current = [...undo.current.slice(-49), cells];
    redo.current = [];
    setCells(next);
    doc.markDirty();
  };

  const setRaw = (a: string, raw: string) => {
    const next = { ...cells };
    const prev = next[a] ?? { raw: '' };
    if (raw === '' && !prev.bold && !prev.italic && !prev.align && !prev.fmt) delete next[a];
    else next[a] = { ...prev, raw };
    commitCells(next);
  };

  const styleRange = (patch: (c: Cell) => Partial<Cell>) => {
    const next = { ...cells };
    for (const a of rangeAddrs()) next[a] = { ...(next[a] ?? { raw: '' }), ...patch(next[a] ?? { raw: '' }) };
    commitCells(next);
  };

  const move = (dc: number, dr: number, extend = false) => {
    const nf = clamp({ c: focus.c + dc, r: focus.r + dr });
    setFocus(nf);
    if (!extend) setAnchor(nf);
  };

  const startEdit = (initial?: string, focusCell = true) => {
    setDraft(initial ?? cells[active]?.raw ?? '');
    setEditing(true);
    if (focusCell) setTimeout(() => cellInput.current?.focus(), 0);
  };

  const commit = (dc = 0, dr = 1) => {
    if (editing) setRaw(active, draft);
    setEditing(false);
    const n = clamp({ c: anchor.c + dc, r: anchor.r + dr });
    setAnchor(n);
    setFocus(n);
    grid.current?.focus();
  };

  const cancel = () => {
    setEditing(false);
    grid.current?.focus();
  };

  const doUndo = () => {
    const prev = undo.current.pop();
    if (!prev) return;
    redo.current.push(cells);
    setCells(prev);
  };
  const doRedo = () => {
    const next = redo.current.pop();
    if (!next) return;
    undo.current.push(cells);
    setCells(next);
  };

  const copy = async () => {
    const lines: string[] = [];
    for (let r = range.r1; r <= range.r2; r++) {
      const row: string[] = [];
      for (let c = range.c1; c <= range.c2; c++) row.push(formatValue(values[addr(c, r)]));
      lines.push(row.join('\t'));
    }
    await navigator.clipboard.writeText(lines.join('\n')).catch(() => {});
  };

  const paste = async () => {
    const text = await navigator.clipboard.readText().catch(() => '');
    if (!text) return;
    const next = { ...cells };
    text.replace(/\r/g, '').split('\n').forEach((line, dr) =>
      line.split('\t').forEach((v, dc) => {
        const a = addr(anchor.c + dc, anchor.r + dr);
        if (anchor.c + dc < COLS && anchor.r + dr < ROWS) next[a] = { ...(next[a] ?? {}), raw: v };
      }),
    );
    commitCells(next);
  };

  const autosum = () => {
    let r = anchor.r - 1;
    while (r >= 0 && typeof values[addr(anchor.c, r)] === 'number') r--;
    const from = r + 1;
    if (from >= anchor.r) return startEdit('=SUMA()');
    setRaw(active, `=SUMA(${addr(anchor.c, from)}:${addr(anchor.c, anchor.r - 1)})`);
  };

  const onGridKey = (e: React.KeyboardEvent) => {
    if (editing) return;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key;
    if (mod && k.toLowerCase() === 's') return doc.onKeyDown(e);
    if (mod && k.toLowerCase() === 'o') return doc.onKeyDown(e);
    const handled = (() => {
      if (k === 'ArrowUp') move(0, mod ? -ROWS : -1, e.shiftKey);
      else if (k === 'ArrowDown') move(0, mod ? ROWS : 1, e.shiftKey);
      else if (k === 'ArrowLeft') move(mod ? -COLS : -1, 0, e.shiftKey);
      else if (k === 'ArrowRight') move(mod ? COLS : 1, 0, e.shiftKey);
      else if (k === 'Enter') move(0, e.shiftKey ? -1 : 1);
      else if (k === 'Tab') move(e.shiftKey ? -1 : 1, 0);
      else if (k === 'F2') startEdit();
      else if (k === 'Delete' || k === 'Backspace') {
        const next = { ...cells };
        for (const a of rangeAddrs()) if (next[a]) next[a] = { ...next[a], raw: '' };
        commitCells(next);
      } else if (mod && k.toLowerCase() === 'b') styleRange((c) => ({ bold: !c.bold }));
      else if (mod && k.toLowerCase() === 'i') styleRange((c) => ({ italic: !c.italic }));
      else if (mod && k.toLowerCase() === 'z') doUndo();
      else if (mod && k.toLowerCase() === 'y') doRedo();
      else if (mod && k.toLowerCase() === 'c') void copy();
      else if (mod && k.toLowerCase() === 'v') void paste();
      else if (!mod && k.length === 1) startEdit(k);
      else return false;
      return true;
    })();
    if (handled) e.preventDefault();
  };

  const onEditKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit(0, e.shiftKey ? -1 : 1);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      commit(e.shiftKey ? -1 : 1, 0);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    }
  };

  /** Clic en una celda: selecciona; si se está escribiendo una fórmula, inserta la referencia. */
  const onCellDown = (e: React.MouseEvent, p: Pos) => {
    if (editing && draft.startsWith('=') && /[(=,;:+\-*/^&<>]$/.test(draft)) {
      e.preventDefault();
      setDraft((d) => d + addr(p.c, p.r));
      return;
    }
    if (editing) commitInPlace();
    if (e.shiftKey) setFocus(p);
    else {
      setAnchor(p);
      setFocus(p);
    }
    selecting.current = true;
  };
  const commitInPlace = () => {
    setRaw(active, draft);
    setEditing(false);
  };
  const selecting = useRef(false);
  useEffect(() => {
    const up = () => (selecting.current = false);
    window.addEventListener('mouseup', up);
    return () => window.removeEventListener('mouseup', up);
  }, []);

  const stableCellDown = useStable(onCellDown);
  const stableCellEnter = useStable((p: Pos) => selecting.current && setFocus(p));
  const stableEditKey = useStable(onEditKey);
  const stableDouble = useStable(() => startEdit());

  const newBook = async () => {
    if (doc.dirty && !(await confirmDialog('Hay cambios sin guardar', '¿Crear un libro nuevo y descartarlos?', true))) return;
    setCells({});
    doc.setPath(null);
  };

  const exportCsv = async () => {
    const target = await fileDialog({ mode: 'save', dir: '/Documentos', name: 'Libro.csv', extensions: ['csv'] });
    if (!target) return;
    await fs.write(target, toCsv(cells, values));
    notify({ title: 'CSV exportado', body: target, tone: 'success' });
  };

  // Estadísticas de la selección (como la barra de estado de Excel).
  const nums = rangeAddrs().map((a) => values[a]).filter((v): v is number => typeof v === 'number');
  const sum = nums.reduce((a, b) => a + b, 0);
  const cur = cells[active];

  const chartData = useMemo(() => {
    if (!chart) return [];
    const out: { label: string; value: number }[] = [];
    for (let r = range.r1; r <= range.r2; r++) {
      const label = range.c2 > range.c1 ? formatValue(values[addr(range.c1, r)]) : String(r + 1);
      const v = values[addr(range.c2, r)];
      if (typeof v === 'number') out.push({ label, value: v });
    }
    return out;
  }, [chart, range.r1, range.r2, range.c1, range.c2, values]);

  return (
    <div className="flex h-full flex-col bg-gray-950 text-gray-200" onKeyDown={(e) => editing && doc.onKeyDown(e)}>
      {/* Barra de herramientas */}
      <div className="flex flex-wrap items-center gap-1 border-b border-gray-800 bg-gray-900 px-2 py-1">
        <Tool label="Nuevo libro" onClick={newBook}>
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
        <Tool label="Exportar CSV" onClick={exportCsv}>
          <FileSpreadsheet size={15} />
        </Tool>
        <Sep />
        <Tool label="Deshacer (Ctrl+Z)" onClick={doUndo}>
          <Undo2 size={15} />
        </Tool>
        <Tool label="Rehacer (Ctrl+Y)" onClick={doRedo}>
          <Redo2 size={15} />
        </Tool>
        <Sep />
        <Tool label="Negrita (Ctrl+B)" active={cur?.bold} onClick={() => styleRange((c) => ({ bold: !c.bold }))}>
          <Bold size={15} />
        </Tool>
        <Tool label="Cursiva (Ctrl+I)" active={cur?.italic} onClick={() => styleRange((c) => ({ italic: !c.italic }))}>
          <Italic size={15} />
        </Tool>
        {(
          [
            ['left', AlignLeft],
            ['center', AlignCenter],
            ['right', AlignRight],
          ] as const
        ).map(([a, Icon]) => (
          <Tool key={a} label={`Alinear ${a}`} active={cur?.align === a} onClick={() => styleRange(() => ({ align: a }))}>
            <Icon size={15} />
          </Tool>
        ))}
        <select
          aria-label="Formato de número"
          value={cur?.fmt ?? 'general'}
          onChange={(e) => styleRange(() => ({ fmt: e.target.value as Fmt }))}
          className="rounded border border-gray-700 bg-gray-950 px-1.5 py-1 text-[11px]"
        >
          <option value="general">General</option>
          <option value="number">Número (0,00)</option>
          <option value="currency">Moneda ($)</option>
          <option value="percent">Porcentaje (%)</option>
        </select>
        <Sep />
        <Tool label="Autosuma" onClick={autosum}>
          <Sigma size={15} />
        </Tool>
        <select
          aria-label="Insertar función"
          value=""
          onChange={(e) => e.target.value && startEdit(`=${e.target.value}(`)}
          className="w-28 rounded border border-gray-700 bg-gray-950 px-1.5 py-1 text-[11px]"
        >
          <option value="">fx Función…</option>
          {FUNCTION_NAMES.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
        <Tool label="Gráfico de la selección" active={chart !== null} onClick={() => setChart((c) => (c ? null : 'bar'))}>
          <BarChart3 size={15} />
        </Tool>
      </div>

      {/* Barra de fórmulas */}
      <div className="flex items-center gap-2 border-b border-gray-800 bg-gray-900/70 px-2 py-1">
        <span className="w-24 rounded border border-gray-700 bg-gray-950 px-2 py-0.5 text-center font-mono text-[11px]">{rangeLabel}</span>
        <span className="font-serif text-sm text-green-300 italic">fx</span>
        <input
          value={editing ? draft : (cur?.raw ?? '')}
          onFocus={() => !editing && startEdit(undefined, false)}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onEditKey}
          spellCheck={false}
          aria-label="Barra de fórmulas"
          className="flex-1 rounded border border-gray-700 bg-gray-950 px-2 py-0.5 font-mono text-xs select-text focus:border-green-400 focus:outline-none"
        />
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Cuadrícula */}
        <div ref={grid} tabIndex={0} onKeyDown={onGridKey} className="scrollbar-thin min-w-0 flex-1 overflow-auto outline-none">
          <div className="relative" style={{ width: 44 + COLS * COL_W, height: ROW_H * (ROWS + 1) }}>
            <div className="sticky top-0 z-20 flex" style={{ height: ROW_H }}>
              <div className="sticky left-0 z-30 w-11 shrink-0 border-r border-b border-gray-700 bg-gray-800" />
              {Array.from({ length: COLS }, (_, c) => (
                <div
                  key={c}
                  className={`flex shrink-0 items-center justify-center border-r border-b border-gray-700 text-[11px] font-semibold ${c >= range.c1 && c <= range.c2 ? 'bg-green-500/25 text-green-200' : 'bg-gray-800 text-gray-400'}`}
                  style={{ width: COL_W }}
                >
                  {indexToCol(c)}
                </div>
              ))}
            </div>
            {Array.from({ length: ROWS }, (_, r) => (
              <Row
                key={r}
                r={r}
                cells={cells}
                values={values}
                range={r >= range.r1 && r <= range.r2 ? range : null}
                anchorC={anchor.r === r ? anchor.c : -1}
                editing={editing && anchor.r === r}
                draft={draft}
                inputRef={cellInput}
                onDraft={setDraft}
                onEditKey={stableEditKey}
                onCellDown={stableCellDown}
                onCellEnter={stableCellEnter}
                onCellDouble={stableDouble}
              />
            ))}
          </div>
        </div>
        {chart && (
          <aside className="flex w-80 shrink-0 flex-col border-l border-gray-800 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold">Gráfico de {rangeLabel}</span>
              <select value={chart} onChange={(e) => setChart(e.target.value as 'bar' | 'line')} className="rounded border border-gray-700 bg-gray-950 px-1 py-0.5 text-[11px]" aria-label="Tipo de gráfico">
                <option value="bar">Barras</option>
                <option value="line">Líneas</option>
              </select>
            </div>
            {chartData.length === 0 ? (
              <p className="text-[11px] text-gray-500">Selecciona una columna de números (o dos columnas: etiquetas y valores).</p>
            ) : (
              <div className="min-h-0 flex-1">
                <ResponsiveContainer width="100%" height="100%">
                  {chart === 'bar' ? (
                    <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 8, left: -12 }}>
                      <CartesianGrid vertical={false} stroke="#1f2937" />
                      <XAxis dataKey="label" tick={{ fill: '#9ca3af', fontSize: 10 }} stroke="#4b5563" />
                      <YAxis tick={{ fill: '#9ca3af', fontSize: 10 }} stroke="#4b5563" />
                      <Tooltip contentStyle={{ background: '#030712', border: '1px solid #1f2937', fontSize: 11 }} />
                      <Bar dataKey="value" name="Valor" fill="#0891b2" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                    </BarChart>
                  ) : (
                    <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 8, left: -12 }}>
                      <CartesianGrid vertical={false} stroke="#1f2937" />
                      <XAxis dataKey="label" tick={{ fill: '#9ca3af', fontSize: 10 }} stroke="#4b5563" />
                      <YAxis tick={{ fill: '#9ca3af', fontSize: 10 }} stroke="#4b5563" />
                      <Tooltip contentStyle={{ background: '#030712', border: '1px solid #1f2937', fontSize: 11 }} />
                      <Line dataKey="value" name="Valor" stroke="#0891b2" strokeWidth={2} dot={{ r: 4 }} isAnimationActive={false} />
                    </LineChart>
                  )}
                </ResponsiveContainer>
              </div>
            )}
          </aside>
        )}
      </div>

      <div className="flex justify-end gap-4 border-t border-gray-800 bg-gray-900 px-3 py-0.5 font-mono text-[10px] text-gray-400">
        {nums.length > 1 && (
          <>
            <span>Suma: {sum.toLocaleString('es', { maximumFractionDigits: 2 })}</span>
            <span>Promedio: {(sum / nums.length).toLocaleString('es', { maximumFractionDigits: 2 })}</span>
          </>
        )}
        <span>Recuento: {nums.length}</span>
        <span className="text-gray-600">{doc.path ?? 'Sin guardar'}</span>
      </div>
    </div>
  );
}

interface RowProps {
  r: number;
  cells: Cells;
  values: Record<string, CellValue>;
  range: { c1: number; c2: number; r1: number; r2: number } | null;
  anchorC: number;
  editing: boolean;
  draft: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onDraft: (v: string) => void;
  onEditKey: (e: React.KeyboardEvent) => void;
  onCellDown: (e: React.MouseEvent, p: Pos) => void;
  onCellEnter: (p: Pos) => void;
  onCellDouble: () => void;
}

/** Fila memorizada: al escribir en una celda solo se vuelve a pintar su fila. */
const Row = memo(
  function Row({ r, cells, values, range, anchorC, editing, draft, inputRef, onDraft, onEditKey, onCellDown, onCellEnter, onCellDouble }: RowProps) {
    return (
      <div className="flex" style={{ height: ROW_H }}>
        <div className={`sticky left-0 z-10 flex w-11 shrink-0 items-center justify-center border-r border-b border-gray-700 text-[11px] ${range ? 'bg-green-500/25 text-green-200' : 'bg-gray-800 text-gray-400'}`}>
          {r + 1}
        </div>
        {Array.from({ length: COLS }, (_, c) => {
          const a = addr(c, r);
          const cell = cells[a];
          const v = values[a];
          const inRange = range && c >= range.c1 && c <= range.c2;
          const isAnchor = c === anchorC;
          const isNum = typeof v === 'number';
          const isErr = typeof v === 'object';
          return (
            <div
              key={c}
              onMouseDown={(e) => onCellDown(e, { c, r })}
              onMouseEnter={() => onCellEnter({ c, r })}
              onDoubleClick={onCellDouble}
              className={`relative shrink-0 overflow-hidden border-r border-b border-gray-800 px-1.5 text-xs leading-[23px] whitespace-nowrap ${inRange ? 'bg-green-500/10' : ''} ${
                isErr ? 'text-red-400' : ''
              }`}
              style={{
                width: COL_W,
                fontWeight: cell?.bold ? 700 : undefined,
                fontStyle: cell?.italic ? 'italic' : undefined,
                textAlign: cell?.align ?? (isNum ? 'right' : 'left'),
                boxShadow: isAnchor ? 'inset 0 0 0 2px #39ff14' : undefined,
              }}
            >
              {isAnchor && editing ? (
                <input
                  ref={inputRef}
                  autoFocus
                  value={draft}
                  onChange={(e) => onDraft(e.target.value)}
                  onKeyDown={onEditKey}
                  spellCheck={false}
                  className="absolute inset-0 z-10 bg-gray-900 px-1.5 font-mono text-xs text-gray-100 outline-none"
                />
              ) : (
                formatValue(v, cell?.fmt)
              )}
            </div>
          );
        })}
      </div>
    );
  },
  (a, b) =>
    a.cells === b.cells &&
    a.values === b.values &&
    a.anchorC === b.anchorC &&
    a.editing === b.editing &&
    (!a.editing || a.draft === b.draft) &&
    JSON.stringify(a.range) === JSON.stringify(b.range),
);

function Tool({ label, onClick, children, active }: { label: string; onClick: () => void; children: React.ReactNode; active?: boolean }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`rounded p-1 ${active ? 'bg-green-400/20 text-green-200' : 'text-gray-300 hover:bg-white/10'}`}
    >
      {children}
    </button>
  );
}

const Sep = () => <span className="mx-0.5 h-5 w-px bg-gray-700" />;
