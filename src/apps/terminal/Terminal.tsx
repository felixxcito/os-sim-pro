import { useEffect, useRef, useState } from 'react';
import { useSession } from '../../os/session';
import type { AppProps } from '../../os/shell/OsWindowFrame';
import { runCommand } from './shell';

interface Line {
  id: number;
  prompt?: string;
  text: string;
}

let seq = 1;

export default function Terminal({ win }: AppProps) {
  const user = useSession((s) => s.settings.user.toLowerCase());
  const [cwd, setCwd] = useState(win.args.path ?? '/Documentos');
  const [lines, setLines] = useState<Line[]>([{ id: seq++, text: 'OS-Sim Pro · Terminal. Escribe "help" para ver los comandos.' }]);
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [hIndex, setHIndex] = useState(-1);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const prompt = `${user}@os-sim:${cwd}$`;

  useEffect(() => {
    box.current?.scrollTo({ top: box.current.scrollHeight });
  }, [lines]);

  const submit = async () => {
    const cmd = input;
    setInput('');
    setHIndex(-1);
    if (cmd.trim()) setHistory((h) => [cmd, ...h].slice(0, 50));
    setLines((l) => [...l, { id: seq++, prompt, text: cmd }]);
    setBusy(true);
    try {
      const res = await runCommand(cmd, cwd);
      setCwd(res.cwd);
      if (res.clear) setLines([]);
      else if (res.out) setLines((l) => [...l, { id: seq++, text: res.out }]);
    } catch (e) {
      setLines((l) => [...l, { id: seq++, text: `error: ${(e as Error).message}` }]);
    } finally {
      setBusy(false);
      field.current?.focus();
    }
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !busy) void submit();
    else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const i = Math.min(history.length - 1, hIndex + 1);
      if (history[i] !== undefined) {
        setHIndex(i);
        setInput(history[i]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const i = hIndex - 1;
      setHIndex(Math.max(-1, i));
      setInput(i >= 0 ? history[i] : '');
    } else if (e.key === 'l' && e.ctrlKey) {
      e.preventDefault();
      setLines([]);
    }
  };

  return (
    <div ref={box} className="scrollbar-thin h-full overflow-auto bg-black/85 p-3 font-mono text-[12px] leading-relaxed text-gray-200 select-text" onClick={() => field.current?.focus()}>
      {lines.map((l) => (
        <div key={l.id} className="break-all whitespace-pre-wrap">
          {l.prompt && <span className="text-green-400">{l.prompt} </span>}
          {l.text.split('\n').map((t, i) => (
            <div key={i} className={t.startsWith('\u001b[d]') ? 'text-cyan-300' : undefined}>
              {t.replace('\u001b[d]', '')}
            </div>
          ))}
        </div>
      ))}
      <div className="flex">
        <span className="shrink-0 text-green-400">{prompt}&nbsp;</span>
        <input
          ref={field}
          autoFocus
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKey}
          spellCheck={false}
          aria-label="Comando"
          className="min-w-0 flex-1 bg-transparent text-gray-100 caret-green-400 focus:outline-none"
        />
      </div>
    </div>
  );
}
