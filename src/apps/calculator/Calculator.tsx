import { useEffect, useState } from 'react';
import { evaluateFormula } from '../sheets/formula';

const KEYS = ['C', '(', ')', '/', '7', '8', '9', '*', '4', '5', '6', '-', '1', '2', '3', '+', '±', '0', '.', '='];

/** Calculadora: reutiliza el motor de fórmulas de Hojas para evaluar la expresión. */
export default function Calculator() {
  const [expr, setExpr] = useState('');
  const [result, setResult] = useState('0');
  const [history, setHistory] = useState<string[]>([]);

  const press = (k: string) => {
    if (k === 'C') {
      setExpr('');
      setResult('0');
    } else if (k === '=') {
      const value = evaluateFormula(expr || '0');
      const shown = typeof value === 'number' ? String(Math.round(value * 1e10) / 1e10) : String(value);
      setHistory((h) => [`${expr} = ${shown}`, ...h].slice(0, 6));
      setResult(shown);
      setExpr(typeof value === 'number' ? shown : '');
    } else if (k === '±') {
      setExpr((e) => (e.startsWith('-(') ? e.slice(2, -1) : `-(${e || '0'})`));
    } else if (k === 'Backspace') {
      setExpr((e) => e.slice(0, -1));
    } else {
      setExpr((e) => e + k);
    }
  };

  useEffect(() => {
    if (!expr) return;
    const v = evaluateFormula(expr);
    if (typeof v === 'number') setResult(String(Math.round(v * 1e10) / 1e10));
  }, [expr]);

  const onKey = (e: React.KeyboardEvent) => {
    const map: Record<string, string> = { Enter: '=', Escape: 'C', Delete: 'C', ',': '.' };
    const k = map[e.key] ?? e.key;
    if (KEYS.includes(k) || k === 'Backspace') {
      e.preventDefault();
      press(k);
    }
  };

  return (
    <div className="flex h-full flex-col bg-gray-950/60 p-3 outline-none" tabIndex={0} onKeyDown={onKey} autoFocus>
      <div className="mb-1 h-12 overflow-hidden text-right font-mono text-[10px] text-gray-500">
        {history.map((h, i) => (
          <div key={i} className="truncate">
            {h}
          </div>
        ))}
      </div>
      <div className="truncate text-right font-mono text-sm text-gray-400">{expr || ' '}</div>
      <div className="neon-text-green mb-3 truncate text-right font-mono text-4xl font-bold tabular-nums">{result}</div>
      <div className="grid flex-1 grid-cols-4 gap-1.5">
        {KEYS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => press(k)}
            className={`rounded-lg text-lg font-semibold transition-colors ${
              k === '=' ? 'bg-cyan-400/80 text-gray-950 hover:bg-cyan-300' : /[0-9.]/.test(k) ? 'bg-gray-800 text-gray-100 hover:bg-gray-700' : 'bg-gray-900 text-cyan-200 hover:bg-gray-800'
            }`}
          >
            {k}
          </button>
        ))}
      </div>
    </div>
  );
}
