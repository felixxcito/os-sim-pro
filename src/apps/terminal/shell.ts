import { memoryStats } from '../../engine/memory';
import { basename, formatSize, fs, resolvePath } from '../../os/fs';
import { openPath } from '../../os/openFile';
import { useSimStore } from '../../store/useSimStore';

export interface ShellResult {
  out: string;
  cwd: string;
  clear?: boolean;
}

const HELP = `Comandos disponibles:
  help                 muestra esta ayuda
  ls [ruta]            lista archivos            cd <ruta>      cambia de carpeta
  pwd                  carpeta actual            mkdir <nombre> crea una carpeta
  touch <archivo>      crea un archivo vacío     cat <archivo>  muestra un archivo
  echo <texto> [> f]   escribe texto (o en f)    rm <ruta>      mueve a la papelera
  mv <origen> <dest>   mueve o renombra          open <ruta>    abre con su aplicación
  ps                   procesos del núcleo       top            resumen de CPU y memoria
  kill <PID>           finaliza un proceso       free           memoria RAM
  df                   uso del disco virtual     compact        compacta la RAM
  date                 fecha y hora              whoami         usuario actual
  clear                limpia la pantalla`;

/** Divide una línea respetando comillas: echo "hola mundo" > a.txt */
export function splitArgs(line: string): string[] {
  const out: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(line))) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

const pad = (s: string | number, n: number) => String(s).padEnd(n).slice(0, n);

/** Intérprete de la Terminal: opera sobre el disco virtual y sobre el núcleo simulado. */
export async function runCommand(line: string, cwd: string): Promise<ShellResult> {
  const [cmd, ...args] = splitArgs(line.trim());
  const at = (p?: string) => resolvePath(cwd, p ?? '.');
  const ok = (out = '') => ({ out, cwd });
  const sim = useSimStore.getState();

  switch (cmd) {
    case undefined:
      return ok();
    case 'help':
      return ok(HELP);
    case 'pwd':
      return ok(cwd);
    case 'clear':
      return { out: '', cwd, clear: true };
    case 'whoami':
      return ok('felix');
    case 'date':
      return ok(new Date().toLocaleString('es'));
    case 'ls': {
      const list = await fs.list(at(args[0]));
      return ok(list.map((e) => (e.isDir ? `\u001b[d]${e.name}/` : `${pad(e.name, 40)} ${formatSize(e.size)}`)).join('\n') || '(vacío)');
    }
    case 'cd': {
      const target = at(args[0] ?? '/');
      const st = await fs.stat(target);
      if (target !== '/' && (!st || !st.isDir)) return ok(`cd: no existe la carpeta: ${args[0]}`);
      return { out: '', cwd: target };
    }
    case 'mkdir':
      if (!args[0]) return ok('uso: mkdir <nombre>');
      await fs.mkdir(at(args[0]));
      return ok();
    case 'touch':
      if (!args[0]) return ok('uso: touch <archivo>');
      if (!(await fs.stat(at(args[0])))) await fs.write(at(args[0]), '');
      return ok();
    case 'cat': {
      if (!args[0]) return ok('uso: cat <archivo>');
      const st = await fs.stat(at(args[0]));
      if (!st || st.isDir) return ok(`cat: ${args[0]}: no es un archivo`);
      return ok(await fs.read(at(args[0])));
    }
    case 'echo': {
      const gt = args.indexOf('>');
      if (gt === -1) return ok(args.join(' '));
      const target = args[gt + 1];
      if (!target) return ok('echo: falta el archivo después de >');
      await fs.write(at(target), args.slice(0, gt).join(' ') + '\n');
      return ok();
    }
    case 'rm': {
      if (!args[0]) return ok('uso: rm <ruta>');
      if (!(await fs.stat(at(args[0])))) return ok(`rm: no existe: ${args[0]}`);
      await fs.trash(at(args[0]));
      return ok(`${basename(at(args[0]))} → Papelera`);
    }
    case 'mv': {
      if (args.length < 2) return ok('uso: mv <origen> <destino>');
      const dest = at(args[1]);
      const st = await fs.stat(dest);
      await fs.rename(at(args[0]), st?.isDir ? `${dest}/${basename(at(args[0]))}` : dest);
      return ok();
    }
    case 'open':
      if (!args[0]) return ok('uso: open <ruta>');
      await openPath(at(args[0]));
      return ok();
    case 'ps': {
      const rows = sim.sim.processes.filter((p) => p.state !== 'Terminated');
      const head = `${pad('PID', 5)} ${pad('NOMBRE', 20)} ${pad('TIPO', 8)} ${pad('ESTADO', 11)} ${pad('PRIO', 5)} ${pad('RAM', 7)} CPU`;
      return ok(
        [head, ...rows.map((p) => `${pad(p.pid, 5)} ${pad(p.name, 20)} ${pad(p.kind, 8)} ${pad(p.state, 11)} ${pad(p.priority, 5)} ${pad(p.memorySize + 'MB', 7)} ${p.executedTime}t`)].join('\n'),
      );
    }
    case 'kill': {
      const pid = Number(args[0]);
      const p = sim.sim.processes.find((x) => x.pid === pid && x.state !== 'Terminated');
      if (!p) return ok(`kill: no existe el proceso ${args[0] ?? ''}`);
      sim.kill(pid, 'kill desde la terminal');
      return ok(`Proceso ${pid} (${p.name}) finalizado`);
    }
    case 'free':
    case 'top': {
      const m = memoryStats(sim.sim.memory);
      const lines = [
        `Tick ${sim.sim.tick} · CPU ${sim.sim.history.at(-1)?.cpu ?? 0}% (${sim.sim.running.length} núcleos) · ${sim.sim.contextSwitches} cambios de contexto`,
        `Memoria: total ${m.total} MB · usada ${m.used} MB · libre ${m.free} MB · huecos ${m.holes} · frag. externa ${m.externalFragmentation}%`,
      ];
      if (cmd === 'top') {
        sim.sim.running.forEach((pid, core) => {
          const p = sim.sim.processes.find((x) => x.pid === pid);
          lines.push(`  CPU${core}: ${p ? `P${p.pid} ${p.name}` : 'ociosa'}`);
        });
        lines.push(`Cola de listos: ${sim.sim.readyQueue.map((p) => 'P' + p).join(' ') || '—'}`);
      }
      return ok(lines.join('\n'));
    }
    case 'compact':
      sim.compact();
      return ok('Memoria compactada');
    case 'df': {
      let total = 0;
      let files = 0;
      const walk = async (dir: string) => {
        for (const e of await fs.list(dir)) {
          if (e.isDir) await walk(e.path);
          else {
            total += e.size;
            files++;
          }
        }
      };
      await walk('/');
      return ok(`Disco virtual (${fs.kind === 'electron' ? 'disco real' : 'IndexedDB'}): ${files} archivos · ${formatSize(total)} usados`);
    }
    default:
      return ok(`${cmd}: comando no encontrado. Escribe "help".`);
  }
}
