import { useEffect, useRef } from 'react';
import { useSimStore } from '../../store/useSimStore';
import type { EventKind } from '../../types';

const KIND_COLOR: Partial<Record<EventKind, string>> = {
  'context-switch': 'text-cyan-300',
  dispatch: 'text-cyan-200',
  quantum: 'text-sky-300',
  block: 'text-red-300',
  unblock: 'text-green-300',
  acquire: 'text-amber-200',
  release: 'text-amber-100/70',
  terminate: 'text-gray-400',
  memory: 'text-orange-300',
  compact: 'text-green-300',
  deadlock: 'text-red-400 font-bold',
  starvation: 'text-amber-300 font-semibold',
  aging: 'text-lime-300',
  admit: 'text-teal-300',
};

/** Bitácora del núcleo, estilo terminal. */
export function EventLog() {
  const events = useSimStore((s) => s.sim.events);
  const box = useRef<HTMLDivElement>(null);
  const lastId = events[events.length - 1]?.id;

  useEffect(() => {
    const el = box.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lastId]);

  return (
    <div ref={box} className="scrollbar-thin h-full overflow-auto bg-black/60 p-3 font-mono text-[11px] leading-relaxed" role="log">
      {events.map((e) => (
        <div key={e.id} className="flex gap-2">
          <span className="shrink-0 text-gray-600">[{String(e.tick).padStart(4, '0')}]</span>
          <span className={KIND_COLOR[e.kind] ?? 'text-gray-300'}>{e.message}</span>
        </div>
      ))}
      <div className="text-green-400">
        root@os-sim:~$ <span className="animate-pulse">▋</span>
      </div>
    </div>
  );
}
