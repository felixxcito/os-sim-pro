# OS-Sim Pro — Simulador avanzado de Sistema Operativo

Simulador interactivo de la atención de procesos y la administración de recursos de un SO de escritorio.
Se presenta como un **escritorio simulado**: la foto del usuario es el fondo de pantalla y el icono de todas
las aplicaciones; cada icono abre una ventana del dashboard (Control, Procesos, Memoria, Recursos, Análisis, Terminal).

**Stack:** React 19 + Vite + TypeScript (estricto) · Tailwind CSS v4 · Zustand · Recharts · lucide-react · Vitest

## Ejecutar

```bash
npm install
npm run dev      # http://localhost:5173  (guía completa: COMO_EJECUTAR.md)
npm test         # tests del motor (Vitest)
npm run build    # typecheck + build de producción
```

Atajos: **Espacio** = Play/Pausa · **→** = avanzar un tick (en pausa). Iconos del escritorio: doble clic (un toque en móvil).

## Arquitectura

```
src/
  types/            Modelos: PCB (Process), MemoryBlock, Resource, SimState, eventos, historial
  engine/           Lógica PURA del SO (sin React) → testeable y explicable
    kernel.ts         Núcleo: un tick sobre una copia del estado (admisión, E/S, CPU, contabilidad)
    tick.ts           step(state) → state: orden de evaluación de un tick
    scheduler.ts      Round Robin (FIFO) y RR por prioridades + envejecimiento
    memory.ts         Particionamiento dinámico: First-Fit / Best-Fit, fragmentación, compactación
    resources.ts      Recursos exclusivos con cola FIFO de espera
    deadlock.ts       Grafo de espera, detección de ciclos y escenario A/B
    starvation.ts     Detección de inanición y escenario de saturación
    actions.ts        Acciones del usuario: compactar, kill, recuperar interbloqueo, config
  store/            Zustand: useSimStore (reloj setInterval + acciones), useWindowStore (ventanas)
  components/
    desktop/          Escritorio, iconos, ventanas arrastrables, barra de tareas
    panels/           Control, Monitor de procesos, Mapa de memoria, Recursos, Bitácora
    analysis/         Gantt, barras, líneas y donas (Recharts), tabla de planificación
tests/engine/       21 tests del planificador, memoria, interbloqueo e inanición
```

**Patrones:** el motor es un *reductor puro* (`SimState → SimState`), al estilo Redux: el store solo
programa el reloj y aplica funciones del motor. `Kernel` encapsula un tick como *Unit of Work*
sobre una copia, por lo que nunca muta el estado previo (permite tests deterministas inyectando `rng`).

### Orden de un tick

1. Avanza el reloj · genera carga del escenario de inanición si está activo
2. **Admisión**: procesos `New` que caben en RAM → `Ready`
3. **E/S**: las operaciones en curso avanzan; al terminar, liberan el dispositivo → `Ready`
4. **CPU (Round Robin)**: despacho, cambio de contexto (coste 0 o 1 tick), ejecución, peticiones de recursos, fin de quantum
5. Contabilidad de espera/bloqueo y **envejecimiento**
6. Detección de **interbloqueo** e **inanición**
7. Historial para los gráficos

## Algoritmos

| Módulo | Implementación |
|---|---|
| Planificador | Round Robin con quantum configurable (1–8). Variante RR + prioridad (empates en orden de cola). Cada cambio de PCB se registra como *context switch*. |
| Memoria | 1024 MB, 128 MB de núcleo. Particionamiento dinámico con **First-Fit** (primer hueco suficiente) o **Best-Fit** (hueco más ajustado). Al liberar se fusionan huecos adyacentes. |
| Fragmentación | `externa = 1 − hueco_mayor / libre_total`. Los huecos entre procesos se pintan rayados en gris. Se avisa cuando un proceso no cabe *aunque haya memoria total suficiente*. |
| Compactación | Desplaza las particiones hacia direcciones bajas y deja un único hueco; la barra anima el desplazamiento. |
| Recursos | HDD, Impresora, USB (E/S) y R1/R2 (exclusivos). Petición en modo `io` (bloquea N ticks) o `hold` (retiene mientras ejecuta: *retener y esperar*). |
| Interbloqueo | Grafo de espera P→Q si P espera un recurso de Q. Con recursos de una instancia, **ciclo ⇔ deadlock**. Recuperación: abortar a la víctima (menor prioridad / más joven). |
| Inanición | Con RR por prioridades y saturación de procesos prioritarios, el de prioridad 10 no recibe CPU. **Aging**: cada 2 ticks de espera mejora 1 nivel su prioridad efectiva (se restablece al ejecutar). También detecta inanición de memoria. |

## Guion de demostración

1. **Play** y observa la tabla (colores semáforo), el quantum restante y el Gantt.
2. Sube a **+5 procesos**: la RAM se llena y aparecen huecos rayados → *Frag. externa* sube y en la
   cola de admisión aparece "bloqueado por fragmentación". Pulsa **Compactar RAM**.
3. Cambia **First-Fit ↔ Best-Fit** y compara los huecos resultantes.
4. **Interbloqueo**: en pocos ticks, A retiene R1 y espera R2; B retiene R2 y espera R1 →
   banner rojo **¡DEADLOCK DETECTADO!**, aristas rojas en el grafo de espera. Pulsa *Abortar víctima*.
5. **Inanición**: `backup-lowprio` (prioridad 10) queda esperando mientras llegan procesos prioritarios →
   banner ámbar. Activa **Aging** y observa en la tabla cómo baja su prioridad efectiva (`10 →9 →…`) hasta ejecutar.
6. Pon el coste de cambio de contexto a **1 tick** y compara el uso de CPU en *Análisis → Distribución*.
