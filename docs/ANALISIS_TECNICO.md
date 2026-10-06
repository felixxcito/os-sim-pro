# OS-Sim Pro — Documento de Análisis Técnico

**Proyecto:** Simulador de Sistema Operativo de escritorio
**Autor:** Felix
**Tecnologías:** TypeScript (modo estricto), React 19, Zustand, Recharts, Electron (ejecutable .exe / .dmg), Vitest

---

## 1. Visión general

OS-Sim Pro es un sistema operativo de escritorio simulado. Arranca con su propia secuencia de *boot*, pide inicio de sesión y muestra un escritorio con aplicaciones reales: navegador web con descargas, procesador de texto (.docx), hoja de cálculo (.xlsx), explorador de archivos, terminal, etc.

Lo que lo convierte en un simulador académico es que **todo lo que ocurre en el escritorio pasa por un núcleo simulado**:

| Acción en el escritorio | Efecto en el núcleo |
|---|---|
| Abrir una ventana | Se crea un proceso (PCB) en estado **New** que pide memoria |
| La RAM no tiene hueco contiguo | La ventana muestra "Esperando memoria" (cola de admisión) |
| Escribir o hacer clic en una ventana | Se añade ráfaga de CPU al proceso: compite en **Round Robin** |
| Descargar un archivo | Tarea de E/S sobre el **Disco duro** (recurso exclusivo) |
| Imprimir un documento | Tarea de E/S sobre la **Impresora** |
| Cerrar una ventana / "Finalizar tarea" | El proceso termina, libera su memoria y sus recursos |

### Arquitectura

```
                    ┌───────────────────────── Interfaz (React) ─────────────────────────┐
                    │ Escritorio · Ventanas · Apps · Administrador de tareas · Gráficos   │
                    └───────────────▲───────────────────────────────┬────────────────────┘
                                    │ useOS() / useSimStore         │ acciones
                    ┌───────────────┴───────────────────────────────▼────────────────────┐
                    │                Kernel  (ciclo de reloj: step(state) → state)       │
                    │  ┌────────────────┐   ┌────────────────┐   ┌───────────────────┐   │
                    │  │ ProcessManager │   │ MemoryManager  │   │  ResourceManager  │   │
                    │  │ PCB · RR ·     │   │ First/Best-Fit │   │ colas · grafo de  │   │
                    │  │ aging          │   │ compactación   │   │ espera · matrices │   │
                    │  └────────────────┘   └────────────────┘   └───────────────────┘   │
                    └────────────────────────────────────────────────────────────────────┘
```

Código: `src/engine/managers/{ProcessManager,MemoryManager,ResourceManager}.ts`, orquestados por `src/engine/kernel.ts`. El hook `src/store/useOS.ts` expone el estado a la interfaz.

**Decisión de diseño — núcleo puro.** `step(estado) → nuevo estado` no modifica el estado de entrada: el `Kernel` trabaja sobre una copia. Esto permite:
- probar cada algoritmo con tests deterministas (generador aleatorio inyectable);
- que React detecte los cambios por referencia;
- reproducir exactamente un escenario (por ejemplo, el interbloqueo) en cada ejecución.

### Ciclo de reloj (un *tick*)

`setInterval` (500 ms a 1×) llama a `step()`, que en cada tick ejecuta en este orden:

1. Avanza el reloj; si está activo, el escenario de inanición genera carga.
2. **Memoria:** los procesos `New` que caben en RAM pasan a `Ready`.
3. **E/S:** las operaciones en curso avanzan; las que terminan liberan el dispositivo y desbloquean al proceso.
4. **CPU (4 núcleos):** cada núcleo libre despacha de la cola de listos compartida (Round Robin), atiende las peticiones de recursos, ejecuta y aplica el fin de quantum.
5. Contabilidad de esperas y **envejecimiento**.
6. **Detección** de interbloqueo e inanición.
7. Historial para las gráficas (uso de CPU, RAM ocupada y fragmentada).

---

## 2. Administración de procesos

### 2.1 PCB (Process Control Block)

| Campo | Significado |
|---|---|
| `pid`, `name`, `kind` | Identificador, nombre, tipo (app, sistema o usuario) |
| `state` | `New` · `Ready` · `Running` · `Blocked` · `Terminated` |
| `burstTime`, `remainingTime`, `executedTime` | Ráfaga total, ráfaga pendiente y ráfaga ejecutada |
| `arrivalTime`, `startTime`, `finishTime` | Instantes para calcular los tiempos de respuesta y de retorno |
| `priority`, `effectivePriority` | Prioridad base (1 = máxima) y prioridad tras el envejecimiento |
| `quantum`, `quantumLeft` | Quantum asignado y quantum restante |
| `memorySize`, `memoryBase` | Memoria pedida y dirección base (registro de reubicación) |
| `heldResources`, `waitingFor`, `resourcesNeeded` | Recursos retenidos, recurso esperado y peticiones futuras |
| `waitingTime`, `blockedTime`, `waitStreak` | Estadísticas de espera |

El sistema arranca con **11 procesos precargados**: 5 servicios del sistema y 6 procesos de carga.

### 2.2 Planificador Round Robin en multiprocesador

La CPU tiene **4 núcleos** (configurable a 1, 2, 4 u 8 en *Configuración → Núcleo y memoria*). Es un **multiprocesador simétrico (SMP)**:
- hay una sola cola de listos compartida por todos los núcleos;
- en cada tick, cada núcleo libre toma el siguiente proceso, así que hasta 4 procesos avanzan en paralelo;
- un proceso nunca ocupa dos núcleos en el mismo tick;
- cada núcleo lleva su propio quantum y su propio cambio de contexto;
- la utilización de la CPU se mide en ticks-núcleo: ticks ocupados / (ticks × núcleos).

```
cada tick:
  para cada núcleo; si está libre:
      P ← cabeza de la cola de listos            (RR: FIFO)
      si P ≠ último proceso en CPU → CAMBIO DE CONTEXTO (guardar PCB anterior, cargar el de P)
      P.quantumLeft ← quantum
  ejecutar 1 tick de P: remaining−−, quantumLeft−−
  si remaining = 0          → Terminated (libera memoria y recursos)
  si quantumLeft = 0        → Running → Ready (al final de la cola)   ← expropiación
```

- **Quantum configurable** de 1 a 8 ticks.
- **Coste del cambio de contexto:** 0 o 1 tick. Con 1 tick se ve el *overhead* en el Gantt (celdas rayadas) y baja la utilización de la CPU.
- **Gantt:** una fila por proceso y una fila por núcleo (CPU0…CPU3), coloreada con el proceso que ejecutó.
- **Propiedad:** el tiempo de espera entre dos turnos está acotado por (n − 1) · q. Por eso Round Robin puro **no produce inanición**.

*Tests de ejemplo:*
- con 1 núcleo, tres procesos con ráfaga 4 y q = 2 producen el Gantt `1 1 2 2 3 3 1 1 2 2 3 3` con 5 cambios de contexto;
- con 2 núcleos, cuatro procesos se ejecutan de dos en dos: `(1,2) (1,2) (3,4) (3,4) …`.

### 2.3 Inanición y envejecimiento

Con la variante **RR + prioridad**, siempre se elige el proceso con mejor prioridad efectiva. `forceStarvationScenario()` hace lo siguiente:
- lanza `backup-lowprio` con prioridad 10;
- durante 60 ticks genera, cada 2 ticks, un proceso de prioridad 1–2 por núcleo: más trabajo del que la CPU puede atender.

El proceso de baja prioridad nunca es elegido. Se detecta cuando lleva ≥ 25 ticks esperando y aparece el banner **INANICIÓN**.

**`applyAging()`:** cada 2 ticks de espera continua, la prioridad efectiva mejora en 1 (de 10 a 9, a 8…). Al llegar a ~1 empata con los recién llegados y, como lleva más tiempo en la cola, gana. Al ser despachado recupera su prioridad base.

*Evidencia (test):* con aging, el proceso postergado recibe CPU en menos de 25 ticks; sin aging, tarda más del doble.

---

## 3. Administración de memoria

### 3.1 Particionamiento dinámico

La RAM (**4 GB = 4096 MB**, de los que 256 MB son del núcleo) es una lista ordenada de bloques `{inicio, tamaño, pid | hueco}`.

**Política de colocación:**
- **Primer ajuste (First-Fit):** usa el primer hueco suficiente. Es O(n) y se detiene antes.
- **Mejor ajuste (Best-Fit):** usa el hueco suficiente más pequeño. Recorre todos los huecos: minimiza el sobrante, pero deja astillas.

**Al liberar:** el bloque se marca como hueco y se aplica **coalescencia** con los huecos vecinos.

### 3.2 Fragmentación externa

$$FE = 1 - \frac{\text{hueco mayor}}{\text{memoria libre total}}$$

*Ejemplo (test):* hay huecos de 80, 40 y 200 MB.
- Memoria libre total: 320 MB. Hueco mayor: 200 MB. FE = 37,5 %.
- Un proceso de **250 MB no cabe** aunque haya 320 MB libres: eso es la fragmentación externa.

En el mapa de memoria:
- los huecos **entre** procesos se dibujan **rayados en gris**;
- la cola de admisión indica "bloqueado por fragmentación → compacta".

### 3.3 Compactación — `compactMemory()`

```
cursor ← 0
para cada bloque ocupado, en orden de dirección:
    si bloque.inicio ≠ cursor → mover el bloque a cursor (actualizar su registro base en el PCB)
    cursor ← cursor + tamaño
crear un único hueco [cursor, fin]
```

Resultado: FE = 0 % y el proceso de 250 MB ya cabe (test). En la interfaz, los bloques se **deslizan animados** hacia la izquierda y todo el gris queda al final.

---

## 4. Administración de recursos e interbloqueo

### 4.1 Recursos

| Recurso | Quién lo asigna |
|---|---|
| CPU | El planificador (ProcessManager) |
| RAM | El MemoryManager |
| Disco duro, Impresora, Pantalla, USB | El ResourceManager. Son exclusivos, de una instancia y con cola FIFO de espera |

Los procesos **piden recursos dinámicamente mientras se ejecutan**: cada PCB declara en qué tick de su ráfaga pide cada recurso. Hay dos modos:
- **`io`:** el proceso se bloquea N ticks usando el dispositivo y luego lo libera.
- **`hold`:** el proceso retiene el recurso mientras sigue ejecutando, lo que hace posible la condición de *retener y esperar*.

### 4.2 Generación — `forceDeadlockScenario()`

| Proceso | Primer recurso | Segundo recurso |
|---|---|---|
| A | al ser despachado obtiene el **Disco** | en su 2.º turno pide la **Impresora** |
| B | al ser despachado obtiene la **Impresora** | en su 2.º turno pide el **Disco** |

Ambos tienen quantum = 2. Como la cola de listos es FIFO, entre el primer y el segundo turno de A, B tiene que ser despachado (o lo fue a la vez en otro núcleo), y viceversa. Así, cada uno retiene su primer recurso antes de que el otro pida el segundo. El escenario se reproduce siempre, con 1, 2, 4 u 8 núcleos (test). Se cumplen las **cuatro condiciones de Coffman**:
- exclusión mutua;
- retener y esperar;
- no expropiación;
- espera circular A → B → A.

### 4.3 Detección

**a) Grafo de espera.** Hay una arista P → Q si P espera un recurso que posee Q. Con recursos de una instancia, **hay un ciclo si y solo si hay interbloqueo**. Como cada nodo tiene grado de salida ≤ 1, basta con seguir la cadena desde cada nodo hasta repetir uno.

**b) Algoritmo de detección con matrices** (Silberschatz §8.7.2, derivado del algoritmo del Banquero):

```
Work ← Available ;  Finish[i] ← (Allocation[i] = 0)
mientras exista i con Finish[i] = falso  y  Request[i] ≤ Work:
    Work ← Work + Allocation[i] ;  Finish[i] ← verdadero
los i con Finish[i] = falso están en interbloqueo
```

Complejidad: O(m · n²). El Gestor de recursos muestra en vivo las matrices `Allocation`, `Request`, el vector `Available` y la columna `Finish`. Los dos métodos coinciden (test).

**Alertas:**
- banner rojo **¡DEADLOCK DETECTADO!**;
- notificación del sistema;
- aristas rojas en el grafo.

**Recuperación:** se aborta a la víctima (la de menor prioridad o, si empatan, la más joven). Sus recursos se entregan al siguiente proceso de la cola.

---

## 5. Métricas y gráficas

| Métrica | Fórmula |
|---|---|
| Tiempo de retorno | fin − llegada |
| Tiempo de espera | ticks en `Ready` (o en `New` sin memoria) |
| Tiempo de respuesta | primer despacho − llegada |
| Utilización de CPU | ticks ocupados / ticks totales |
| Throughput | procesos terminados / ticks |

**Gráficas (Recharts):**
- diagrama de **Gantt**;
- barras de **espera frente a ejecución** por proceso;
- líneas de **% de CPU y RAM ocupada/fragmentada** en el tiempo;
- **donas** de distribución de RAM y CPU;
- tabla clásica de planificación.

---

## 6. Verificación

`npm test` ejecuta **48 pruebas automáticas**:

| Área | Qué se comprueba |
|---|---|
| Planificador | Orden Round Robin, cambios de contexto, coste del cambio, E/S, multinúcleo (paralelismo, un proceso por núcleo, uso de CPU) |
| Memoria | First-Fit frente a Best-Fit, métricas de fragmentación, coalescencia, compactación |
| Interbloqueo | Ciclo en el grafo, matrices, escenario forzado con 1, 2, 4 y 8 núcleos y con otros procesos, recuperación |
| Inanición | Detección; con aging se recibe CPU antes |
| Procesos interactivos | Apps que esperan al usuario, admisión por memoria, ≥ 10 procesos al arrancar |
| Ofimática | Motor de fórmulas (precedencia, funciones en es/en, ciclos `#CICLO!`); ida y vuelta .docx / .xlsx / .csv |

---

## 7. Referencias

- A. Silberschatz, P. B. Galvin, G. Gagne. *Operating System Concepts*, 10.ª ed., Wiley. Caps. 3, 5, 8 y 9.
- W. Stallings. *Operating Systems: Internals and Design Principles*, 9.ª ed., Pearson. Caps. 3, 6, 7 y 9.
- E. G. Coffman, M. Elphick, A. Shoshani. "System Deadlocks". *ACM Computing Surveys*, 1971.
