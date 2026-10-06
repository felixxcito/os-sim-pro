# OS-Sim Pro — Simulador de Sistema Operativo de escritorio

Proyecto universitario de Sistemas Operativos (Felix). Es un **programa de escritorio ejecutable** (.exe para Windows, .dmg para Mac) que simula un sistema operativo completo:

- arranque, inicio de sesión y escritorio con la foto del usuario como fondo de pantalla (fijo) e iconos con la imagen del chocolate Savoy Carré;
- ventanas, barra de tareas, menú inicio, notificaciones, Papelera;
- **Navegador web real** con pestañas y descargas;
- **Escritor**: procesador de texto tipo Word que abre y guarda `.docx` y exporta a PDF;
- **Hojas**: hoja de cálculo tipo Excel con fórmulas, que abre y guarda `.xlsx` y `.csv`;
- Explorador de archivos, Bloc de notas, Calculadora, Visor de imágenes, Terminal y Configuración.

Debajo de todo hay un **núcleo simulado**. Cada ventana abierta es un proceso con PID, memoria asignada y turnos de CPU. El **Administrador de tareas** muestra en vivo:
- planificación **Round Robin** con quantum configurable y cambios de contexto;
- memoria con **First-Fit / Best-Fit**, **fragmentación externa** y **compactación** animada;
- recursos (CPU, RAM, Disco, Impresora, Pantalla, USB) con **detección de interbloqueo** por grafo de espera y por matrices;
- **inanición** y **envejecimiento (aging)**;
- gráficas: Gantt, uso de CPU y RAM, espera frente a ejecución.

📄 **Guía de instalación y uso:** [COMO_EJECUTAR.md](COMO_EJECUTAR.md)
📘 **Documento de análisis técnico** (algoritmos, complejidad, evidencias): [docs/ANALISIS_TECNICO.md](docs/ANALISIS_TECNICO.md)

## Descargar el ejecutable

En la pestaña **Releases** del repositorio:

| Sistema | Archivo |
|---|---|
| Windows | `OS-Sim-Pro-Setup-2.0.1.exe` (instalador) o `OS-Sim-Pro-2.0.1-portable.exe` (sin instalar) |
| Mac con chip Apple (M1/M2/M3…) | `OS-Sim-Pro-2.0.1-mac-arm64.dmg` |
| Mac con Intel | `OS-Sim-Pro-2.0.1-mac-x64.dmg` |

## Desarrollo

```bash
npm install
npm run dev        # abre la app de escritorio (Electron) con recarga en caliente
npm run dev:web    # versión web en http://localhost:5173 (añade ?desktop para saltar el arranque)
npm test           # 41 tests: planificador, memoria, interbloqueo, inanición, fórmulas, .docx/.xlsx
npm run dist       # genera el ejecutable para tu sistema en release/
```

**Stack:** TypeScript estricto · React 19 · Vite · Tailwind CSS · Zustand · Recharts · TipTap · docx · mammoth · exceljs · Electron · Vitest.

## Arquitectura

```
electron/            Proceso principal: ventana, disco virtual, descargas, impresión/PDF (IPC seguro)
src/engine/          NÚCLEO (lógica pura, sin interfaz)
  managers/
    ProcessManager.ts   PCB, Round Robin, cambio de contexto, applyAging(), inanición
    MemoryManager.ts    First/Best-Fit, fragmentación externa, compactMemory()
    ResourceManager.ts  colas de dispositivos, forceDeadlockScenario(), detección (grafo + matrices)
  kernel.ts            ciclo de reloj que orquesta los tres administradores
  tick.ts              step(estado) → nuevo estado
src/store/
  useSimStore.ts       reloj (setInterval) y acciones
  useOS.ts             hook que expone logs, memoryMap, ganttData y métricas a la interfaz
src/os/              Escritorio: ventanas, arranque, menú inicio, barra de tareas, sistema de archivos
src/apps/            Navegador, Escritor, Hojas, Explorador, Terminal, Administrador de tareas…
src/components/      Paneles del simulador y gráficas
tests/               Vitest
```

## Guion de demostración

1. Abre el **Administrador de tareas**: cada app que abras aparece como proceso (tipo `app`).
2. Escribe en el **Escritor**: el proceso recibe ráfagas de CPU y compite en Round Robin.
3. **Laboratorio → +5 procesos**: la RAM se llena y aparecen huecos grises (fragmentación). Ve a **Memoria → Compactar RAM** y mira cómo los huecos se juntan al final.
4. **Laboratorio → Interbloqueo**: A retiene el Disco y espera la Impresora; B, al revés. Aparece el banner **¡DEADLOCK DETECTADO!**. En **Recursos** se ven el grafo (en rojo) y la tabla de matrices (Finish = NO). Pulsa *Abortar víctima*.
5. **Laboratorio → Inanición**: `backup-lowprio` no recibe CPU. Activa **Aging** y observa cómo su prioridad baja hasta que se ejecuta.
6. Descarga un archivo desde el **Navegador**: aparece en Descargas y como tarea de E/S en el Disco.
