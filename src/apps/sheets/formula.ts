/**
 * Motor de fórmulas de "Hojas" (propio, sin dependencias).
 *   tokenizar → analizar (descenso recursivo, con precedencia) → evaluar sobre la hoja.
 * El recálculo de la hoja sigue el grafo de dependencias y detecta referencias circulares
 * (#CICLO!), el mismo concepto que la espera circular de un interbloqueo.
 */

export type ErrorCode = '#DIV/0!' | '#REF!' | '#NOMBRE?' | '#VALOR!' | '#CICLO!' | '#ERROR!';

export class FormulaError {
  constructor(readonly code: ErrorCode) {}
  toString() {
    return this.code;
  }
}

export type CellValue = number | string | boolean | FormulaError;

// ------------------------------------------------------------------ Direcciones

export const colToIndex = (col: string) => [...col.toUpperCase()].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
export const indexToCol = (i: number): string => (i < 0 ? '' : indexToCol(Math.floor(i / 26) - 1) + String.fromCharCode(65 + (i % 26)));
export const addr = (c: number, r: number) => `${indexToCol(c)}${r + 1}`;

export function parseAddr(a: string): { c: number; r: number } | null {
  const m = /^\$?([A-Za-z]{1,3})\$?(\d+)$/.exec(a);
  return m ? { c: colToIndex(m[1]), r: Number(m[2]) - 1 } : null;
}

// ------------------------------------------------------------------ Tokenizador

type Token =
  | { t: 'num'; v: number }
  | { t: 'str'; v: string }
  | { t: 'ref'; v: string }
  | { t: 'id'; v: string }
  | { t: 'op'; v: string }
  | { t: 'eof' };

export function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) {
      i++;
    } else if (/[0-9.]/.test(ch)) {
      const m = /^\d*\.?\d+(?:[eE][+-]?\d+)?/.exec(src.slice(i));
      if (!m) throw new FormulaError('#ERROR!');
      out.push({ t: 'num', v: Number(m[0]) });
      i += m[0].length;
    } else if (ch === '"') {
      let j = i + 1;
      let s = '';
      while (j < src.length) {
        if (src[j] === '"' && src[j + 1] === '"') {
          s += '"';
          j += 2;
        } else if (src[j] === '"') break;
        else s += src[j++];
      }
      if (j >= src.length) throw new FormulaError('#ERROR!');
      out.push({ t: 'str', v: s });
      i = j + 1;
    } else if (/[A-Za-z_$ÁÉÍÓÚÑáéíóúñ]/.test(ch)) {
      const m = /^[A-Za-z_$ÁÉÍÓÚÑáéíóúñ][A-Za-z0-9_$.ÁÉÍÓÚÑáéíóúñ]*/.exec(src.slice(i))!;
      const word = m[0];
      out.push(parseAddr(word) ? { t: 'ref', v: word.replace(/\$/g, '').toUpperCase() } : { t: 'id', v: word.toUpperCase() });
      i += word.length;
    } else {
      const two = src.slice(i, i + 2);
      if (['<=', '>=', '<>'].includes(two)) {
        out.push({ t: 'op', v: two });
        i += 2;
      } else if ('+-*/^&=<>(),;:%'.includes(ch)) {
        out.push({ t: 'op', v: ch === ';' ? ',' : ch });
        i++;
      } else {
        throw new FormulaError('#ERROR!');
      }
    }
  }
  out.push({ t: 'eof' });
  return out;
}

// ------------------------------------------------------------------ Analizador

export type Node =
  | { k: 'num'; v: number }
  | { k: 'str'; v: string }
  | { k: 'bool'; v: boolean }
  | { k: 'ref'; a: string }
  | { k: 'range'; from: string; to: string }
  | { k: 'unary'; op: string; e: Node }
  | { k: 'bin'; op: string; l: Node; r: Node }
  | { k: 'call'; name: string; args: Node[] };

export function parse(src: string): Node {
  const toks = tokenize(src);
  let p = 0;
  const peek = () => toks[p];
  const isOp = (v: string) => peek().t === 'op' && (peek() as { v: string }).v === v;
  const expect = (v: string) => {
    if (!isOp(v)) throw new FormulaError('#ERROR!');
    p++;
  };

  // comparación < concatenación < suma < producto < potencia < unario < porcentaje < primario
  const comparison = (): Node => {
    let l = concat();
    while (['=', '<>', '<', '>', '<=', '>='].some(isOp)) {
      const op = (toks[p++] as { v: string }).v;
      l = { k: 'bin', op, l, r: concat() };
    }
    return l;
  };
  const concat = (): Node => {
    let l = additive();
    while (isOp('&')) {
      p++;
      l = { k: 'bin', op: '&', l, r: additive() };
    }
    return l;
  };
  const additive = (): Node => {
    let l = term();
    while (isOp('+') || isOp('-')) {
      const op = (toks[p++] as { v: string }).v;
      l = { k: 'bin', op, l, r: term() };
    }
    return l;
  };
  const term = (): Node => {
    let l = power();
    while (isOp('*') || isOp('/')) {
      const op = (toks[p++] as { v: string }).v;
      l = { k: 'bin', op, l, r: power() };
    }
    return l;
  };
  const power = (): Node => {
    const base = unary();
    if (isOp('^')) {
      p++;
      return { k: 'bin', op: '^', l: base, r: power() }; // asociativa a la derecha
    }
    return base;
  };
  const unary = (): Node => {
    if (isOp('-') || isOp('+')) {
      const op = (toks[p++] as { v: string }).v;
      return { k: 'unary', op, e: unary() };
    }
    return percent();
  };
  const percent = (): Node => {
    let e = primary();
    while (isOp('%')) {
      p++;
      e = { k: 'bin', op: '/', l: e, r: { k: 'num', v: 100 } };
    }
    return e;
  };
  const primary = (): Node => {
    const tok = toks[p++];
    switch (tok.t) {
      case 'num':
        return { k: 'num', v: tok.v };
      case 'str':
        return { k: 'str', v: tok.v };
      case 'ref':
        if (isOp(':')) {
          p++;
          const to = toks[p++];
          if (to.t !== 'ref') throw new FormulaError('#REF!');
          return { k: 'range', from: tok.v, to: to.v };
        }
        return { k: 'ref', a: tok.v };
      case 'id': {
        if (isOp('(')) {
          p++;
          const args: Node[] = [];
          if (!isOp(')')) {
            do args.push(comparison());
            while (isOp(',') && ++p);
          }
          expect(')');
          return { k: 'call', name: tok.v, args };
        }
        if (tok.v === 'TRUE' || tok.v === 'VERDADERO') return { k: 'bool', v: true };
        if (tok.v === 'FALSE' || tok.v === 'FALSO') return { k: 'bool', v: false };
        throw new FormulaError('#NOMBRE?');
      }
      case 'op':
        if (tok.v === '(') {
          const e = comparison();
          expect(')');
          return e;
        }
        throw new FormulaError('#ERROR!');
      default:
        throw new FormulaError('#ERROR!');
    }
  };

  const ast = comparison();
  if (peek().t !== 'eof') throw new FormulaError('#ERROR!');
  return ast;
}

// ------------------------------------------------------------------ Evaluación

export type Getter = (a: string) => CellValue;

const isErr = (v: unknown): v is FormulaError => v instanceof FormulaError;

function toNumber(v: CellValue): number | FormulaError {
  if (isErr(v)) return v;
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v === '') return 0;
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) ? n : new FormulaError('#VALOR!');
}

const toText = (v: CellValue) => (typeof v === 'boolean' ? (v ? 'VERDADERO' : 'FALSO') : String(v));

function expandRange(from: string, to: string): string[] {
  const a = parseAddr(from)!;
  const b = parseAddr(to)!;
  const out: string[] = [];
  for (let r = Math.min(a.r, b.r); r <= Math.max(a.r, b.r); r++)
    for (let c = Math.min(a.c, b.c); c <= Math.max(a.c, b.c); c++) out.push(addr(c, r));
  return out;
}

/** Valores de los argumentos, aplanando rangos (para SUMA, PROMEDIO…). */
function flatArgs(args: Node[], get: Getter): CellValue[] {
  return args.flatMap((a) => (a.k === 'range' ? expandRange(a.from, a.to).map(get) : [evalNode(a, get)]));
}

const numbersOf = (vals: CellValue[]) => vals.filter((v): v is number => typeof v === 'number');

type Fn = (args: Node[], get: Getter) => CellValue;

const aggregate = (fn: (nums: number[]) => CellValue): Fn => (args, get) => {
  const vals = flatArgs(args, get);
  const err = vals.find(isErr);
  return err ?? fn(numbersOf(vals));
};

const unaryNum = (fn: (n: number, args: Node[], get: Getter) => CellValue): Fn => (args, get) => {
  if (args.length < 1) return new FormulaError('#VALOR!');
  const n = toNumber(evalNode(args[0], get));
  return isErr(n) ? n : fn(n, args, get);
};

const FUNCTIONS: Record<string, Fn> = {
  SUM: aggregate((n) => n.reduce((a, b) => a + b, 0)),
  AVERAGE: aggregate((n) => (n.length ? n.reduce((a, b) => a + b, 0) / n.length : new FormulaError('#DIV/0!'))),
  MIN: aggregate((n) => (n.length ? Math.min(...n) : 0)),
  MAX: aggregate((n) => (n.length ? Math.max(...n) : 0)),
  COUNT: (args, get) => numbersOf(flatArgs(args, get)).length,
  COUNTA: (args, get) => flatArgs(args, get).filter((v) => v !== '').length,
  IF: (args, get) => {
    const cond = evalNode(args[0], get);
    if (isErr(cond)) return cond;
    const truthy = typeof cond === 'string' ? cond !== '' : Boolean(cond);
    const branch = truthy ? args[1] : args[2];
    return branch ? evalNode(branch, get) : truthy;
  },
  AND: (args, get) => flatArgs(args, get).every((v) => Boolean(v)),
  OR: (args, get) => flatArgs(args, get).some((v) => Boolean(v)),
  NOT: (args, get) => !evalNode(args[0], get),
  ROUND: unaryNum((n, args, get) => {
    const d = args[1] ? toNumber(evalNode(args[1], get)) : 0;
    if (isErr(d)) return d;
    const f = 10 ** d;
    return Math.round(n * f) / f;
  }),
  ABS: unaryNum((n) => Math.abs(n)),
  SQRT: unaryNum((n) => (n < 0 ? new FormulaError('#VALOR!') : Math.sqrt(n))),
  POWER: unaryNum((n, args, get) => {
    const e = toNumber(evalNode(args[1], get));
    return isErr(e) ? e : n ** e;
  }),
  MOD: unaryNum((n, args, get) => {
    const d = toNumber(evalNode(args[1], get));
    if (isErr(d)) return d;
    return d === 0 ? new FormulaError('#DIV/0!') : ((n % d) + d) % d;
  }),
  PI: () => Math.PI,
  CONCAT: (args, get) => {
    const vals = flatArgs(args, get);
    return vals.find(isErr) ?? vals.map(toText).join('');
  },
  UPPER: (args, get) => toText(evalNode(args[0], get)).toUpperCase(),
  LOWER: (args, get) => toText(evalNode(args[0], get)).toLowerCase(),
  LEN: (args, get) => toText(evalNode(args[0], get)).length,
  TODAY: () => new Date().toLocaleDateString('es'),
};

/** Nombres en español (como en Excel/LibreOffice en español). */
const ALIASES: Record<string, string> = {
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

export const FUNCTION_NAMES = [...Object.keys(ALIASES), ...Object.keys(FUNCTIONS)].sort();

function compare(op: string, a: CellValue, b: CellValue): boolean {
  const x = typeof a === 'string' ? a.toLowerCase() : a;
  const y = typeof b === 'string' ? b.toLowerCase() : b;
  switch (op) {
    case '=':
      return x === y;
    case '<>':
      return x !== y;
    case '<':
      return x < y;
    case '>':
      return x > y;
    case '<=':
      return x <= y;
    default:
      return x >= y;
  }
}

export function evalNode(n: Node, get: Getter): CellValue {
  switch (n.k) {
    case 'num':
      return n.v;
    case 'str':
      return n.v;
    case 'bool':
      return n.v;
    case 'ref':
      return get(n.a);
    case 'range':
      return new FormulaError('#VALOR!'); // un rango suelto solo es válido como argumento
    case 'unary': {
      const v = toNumber(evalNode(n.e, get));
      return isErr(v) ? v : n.op === '-' ? -v : v;
    }
    case 'call': {
      const fn = FUNCTIONS[ALIASES[n.name] ?? n.name];
      return fn ? fn(n.args, get) : new FormulaError('#NOMBRE?');
    }
    case 'bin': {
      const l = evalNode(n.l, get);
      const r = evalNode(n.r, get);
      if (isErr(l)) return l;
      if (isErr(r)) return r;
      if (n.op === '&') return toText(l) + toText(r);
      if (['=', '<>', '<', '>', '<=', '>='].includes(n.op)) return compare(n.op, l, r);
      const a = toNumber(l);
      const b = toNumber(r);
      if (isErr(a)) return a;
      if (isErr(b)) return b;
      switch (n.op) {
        case '+':
          return a + b;
        case '-':
          return a - b;
        case '*':
          return a * b;
        case '/':
          return b === 0 ? new FormulaError('#DIV/0!') : a / b;
        case '^':
          return a ** b;
      }
      return new FormulaError('#ERROR!');
    }
  }
}

/** Valor literal de una celda que no es fórmula: número si se puede, si no texto. */
export function literal(raw: string): CellValue {
  const t = raw.trim();
  if (t === '') return '';
  if (/^-?\d+([.,]\d+)?$/.test(t)) return Number(t.replace(',', '.'));
  if (/^-?\d+([.,]\d+)?%$/.test(t)) return Number(t.slice(0, -1).replace(',', '.')) / 100;
  const up = t.toUpperCase();
  if (up === 'VERDADERO' || up === 'TRUE') return true;
  if (up === 'FALSO' || up === 'FALSE') return false;
  return raw;
}

/** Evalúa una expresión aislada (sin celdas). La usa la Calculadora. */
export function evaluateFormula(expr: string): CellValue {
  try {
    return evalNode(parse(expr.replace(/^=/, '')), () => new FormulaError('#REF!'));
  } catch (e) {
    return e instanceof FormulaError ? e : new FormulaError('#ERROR!');
  }
}

/**
 * Recalcula toda la hoja. Evaluación perezosa con memoización: cada celda se calcula una vez,
 * siguiendo sus dependencias. Si al evaluar una celda se vuelve a pedir una que está "en curso",
 * hay una referencia circular → #CICLO!.
 */
export function computeSheet(raw: Record<string, string>): Record<string, CellValue> {
  const values: Record<string, CellValue> = {};
  const visiting = new Set<string>();
  const parsed = new Map<string, Node | FormulaError>();

  const get = (a: string): CellValue => {
    if (a in values) return values[a];
    const src = raw[a] ?? '';
    if (!src.startsWith('=')) return (values[a] = literal(src));
    if (visiting.has(a)) return new FormulaError('#CICLO!');
    visiting.add(a);
    let ast = parsed.get(a);
    if (!ast) {
      try {
        ast = parse(src.slice(1));
      } catch (e) {
        ast = e instanceof FormulaError ? e : new FormulaError('#ERROR!');
      }
      parsed.set(a, ast);
    }
    let v = ast instanceof FormulaError ? ast : evalNode(ast, get);
    visiting.delete(a);
    // Una celda que depende de un ciclo también queda marcada como ciclo.
    if (v instanceof FormulaError && v.code === '#CICLO!') v = new FormulaError('#CICLO!');
    return (values[a] = v);
  };

  for (const a of Object.keys(raw)) get(a);
  return values;
}

export function formatValue(v: CellValue | undefined, fmt?: 'general' | 'number' | 'currency' | 'percent'): string {
  if (v === undefined || v === '') return '';
  if (v instanceof FormulaError) return v.code;
  if (typeof v === 'boolean') return v ? 'VERDADERO' : 'FALSO';
  if (typeof v === 'number') {
    if (fmt === 'number') return v.toLocaleString('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (fmt === 'currency') return v.toLocaleString('es', { style: 'currency', currency: 'USD' });
    if (fmt === 'percent') return (v * 100).toLocaleString('es', { maximumFractionDigits: 2 }) + ' %';
    return String(Math.round(v * 1e10) / 1e10);
  }
  return v;
}
