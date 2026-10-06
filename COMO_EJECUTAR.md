# Cómo ejecutar OS-Sim Pro — paso a paso

Hay dos formas:
- **A. Descargar el ejecutable** (lo más fácil, recomendado para la presentación).
- **B. Ejecutarlo desde el código fuente**.

---

## A. Descargar el ejecutable

> El repositorio es **privado**: para descargar hay que iniciar sesión en GitHub con una cuenta que tenga acceso.

1. Entra a **https://github.com/felixxcito/os-sim-pro/releases**.
2. En la versión más reciente (**v2.1.0**), abre *Assets* y descarga el archivo de tu sistema:

| Tu computadora | Archivo |
|---|---|
| Windows | `OS-Sim-Pro-Setup-2.1.0.exe` (instalador) o `OS-Sim-Pro-2.1.0-portable.exe` (se abre sin instalar) |
| Mac con chip Apple (M1, M2, M3…) | `OS-Sim-Pro-2.1.0-mac-arm64.dmg` |
| Mac con procesador Intel | `OS-Sim-Pro-2.1.0-mac-x64.dmg` |

¿No sabes qué Mac tienes? Menú  → *Acerca de esta Mac*: si dice "Chip Apple M…" es arm64; si dice "Intel", es la otra.

### Windows

1. Haz doble clic en el `.exe`.
2. Si aparece **"Windows protegió tu PC"** (SmartScreen), pulsa **Más información → Ejecutar de todas formas**. Aparece porque la app no está firmada con un certificado comercial; es normal en proyectos universitarios.
3. Con el instalador, elige la carpeta y termina. Se crea un acceso directo **OS-Sim Pro** en el escritorio.

### Mac

1. Abre el `.dmg` y arrastra **OS-Sim Pro** a la carpeta **Aplicaciones**.
2. La primera vez, macOS dirá que no puede verificar al desarrollador. Para abrirla:
   - **Clic derecho** sobre la app → **Abrir** → **Abrir**; o
   - **Ajustes del Sistema → Privacidad y seguridad**, baja hasta el aviso de OS-Sim Pro y pulsa **Abrir igualmente**.
3. Si dice que la app **"está dañada"**, abre la Terminal y ejecuta:

```bash
xattr -cr "/Applications/OS-Sim Pro.app"
```

---

## B. Desde el código fuente

### 1. Requisitos (una sola vez)

| Herramienta | Versión | Comprobar |
|---|---|---|
| Node.js | 20 o superior (probado con 24) | `node -v` |
| Git | cualquiera | `git --version` |

Node.js se descarga en <https://nodejs.org> (versión LTS).

### 2. Descargar el proyecto

```bash
git clone https://github.com/felixxcito/os-sim-pro.git
```

```bash
cd os-sim-pro
```

Sin Git: en la página del repo, **Code → Download ZIP**, descomprime y abre una terminal en la carpeta.

### 3. Instalar dependencias

```bash
npm install
```

La primera vez descarga Electron (~100 MB). Tarda 1–3 minutos.

### 4. Abrir la aplicación de escritorio

```bash
npm run dev
```

Se abre OS-Sim Pro a pantalla completa. **F11** entra o sale de la pantalla completa. Para cerrar la app: **Inicio → Apagar**, o **Cmd+Q / Alt+F4**.

### 5. (Opcional) Versión web en el navegador

```bash
npm run dev:web
```

Abre http://localhost:5173. Con `http://localhost:5173/?desktop` se salta el arranque. En la versión web el navegador interno es limitado y no hay descargas; para la experiencia completa usa el ejecutable o `npm run dev`.

### 6. Generar tu propio ejecutable

```bash
npm run dist
```

El resultado queda en la carpeta `release/` (`.dmg` en Mac, `.exe` en Windows).

---

## Uso rápido

| Acción | Cómo |
|---|---|
| Iniciar sesión | Pulsa **Enter** o el botón *Iniciar sesión* |
| Abrir apps | **Doble clic** en un icono del escritorio, o menú **Inicio** (Ctrl+Esc) |
| Guardar / abrir documentos | **Ctrl/Cmd+S** y **Ctrl/Cmd+O** en Escritor, Hojas y Bloc de notas |
| Ver el núcleo | **Administrador de tareas**: Procesos, Rendimiento, Memoria, Recursos, Laboratorio, Bitácora |
| Escenarios para la demo | **Administrador de tareas → Laboratorio**: *Interbloqueo*, *Inanición*, *+5 procesos*, *Compactar RAM* |
| Archivos | Se guardan en el disco virtual (Escritorio, Documentos, Descargas…). En *Configuración → Acerca de* aparece su ubicación real |

---

## Problemas frecuentes

| Problema | Solución |
|---|---|
| `command not found: npm` | Instala Node.js y abre una terminal nueva |
| Errores en `npm install` | Borra `node_modules` y `package-lock.json` y repite; comprueba que Node sea ≥ 20 |
| Windows bloquea el `.exe` | *Más información → Ejecutar de todas formas* |
| Mac: "no se puede verificar el desarrollador" | Clic derecho → Abrir, o *Privacidad y seguridad → Abrir igualmente* |
| Mac: "la app está dañada" | `xattr -cr "/Applications/OS-Sim Pro.app"` |
| Una web no carga en el navegador interno | Comprueba la conexión (icono Wi-Fi de la barra de tareas); algunas webs piden iniciar sesión |
| `git clone` da 404 | El repo es privado: inicia sesión en GitHub con una cuenta con acceso, o usa el ZIP |
