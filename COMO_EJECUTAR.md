# Cómo ejecutar OS-Sim Pro — paso a paso

## 1. Requisitos (una sola vez)

| Herramienta | Versión | Cómo comprobarla |
|---|---|---|
| **Node.js** | 20 o superior (probado con 24) | `node -v` |
| **npm** | viene con Node.js | `npm -v` |
| **Git** | cualquiera reciente | `git --version` |

Si no tienes Node.js, descárgalo desde <https://nodejs.org> (versión **LTS**) e instálalo.
En macOS también puedes usar Homebrew: `brew install node`.

## 2. Descargar el proyecto

**Opción A — con Git** (el repositorio es privado: necesitas haber iniciado sesión en GitHub
con una cuenta que tenga acceso):

```bash
git clone https://github.com/felixxcito/os-sim-pro.git
cd os-sim-pro
```

**Opción B — sin Git:** en la página del repositorio pulsa **Code → Download ZIP**,
descomprímelo y abre una terminal dentro de la carpeta `os-sim-pro`.

## 3. Instalar las dependencias

```bash
npm install
```

Tarda entre 20 segundos y 1 minuto. Crea la carpeta `node_modules` (no se sube a Git).

## 4. Arrancar el simulador

```bash
npm run dev
```

En la terminal aparecerá algo como:

```
  VITE ready in 300 ms
  ➜  Local:   http://localhost:5173/
```

Abre **http://localhost:5173** en Chrome, Edge, Firefox o Safari.
Para detener el servidor, vuelve a la terminal y pulsa **Ctrl + C**.

## 5. Usar el simulador

1. Pulsa **Play** en el *Panel de Control* (o la tecla **Espacio**). Con **Paso** (o **→**) avanzas un tick.
2. Los iconos del escritorio abren las ventanas con **doble clic** (un toque en móvil).
   El botón de cuadrícula de la barra de tareas vuelve a organizar las ventanas como dashboard.
3. Escenarios para la demostración:
   - **+5 procesos** → la RAM se fragmenta (huecos rayados) → **Compactar RAM**.
   - **Interbloqueo** → aparece **¡DEADLOCK DETECTADO!** → *Abortar víctima*.
   - **Inanición** → banner ámbar → **Activar Aging** y observa la prioridad de `backup-lowprio` bajar.
4. Ventana **Análisis**: pestañas Gantt, Espera vs ejecución, Uso en el tiempo, Distribución y Tabla.

## 6. Comandos útiles (opcional)

| Comando | Para qué sirve |
|---|---|
| `npm test` | Ejecuta los 21 tests del motor (planificador, memoria, deadlock, inanición) |
| `npm run typecheck` | Comprueba los tipos de TypeScript |
| `npm run build` | Genera la versión de producción en `dist/` |
| `npm run preview` | Sirve la versión de producción en http://localhost:4173 |

## 7. Problemas frecuentes

| Problema | Solución |
|---|---|
| `command not found: npm` o `node` | Instala Node.js (paso 1) y abre una terminal nueva. |
| `Port 5173 is in use` | Vite usará otro puerto automáticamente (mira la URL que imprime) o cierra el otro servidor. |
| Errores durante `npm install` | Borra `node_modules` y `package-lock.json` y vuelve a ejecutar `npm install`. Comprueba que Node sea ≥ 20. |
| La página sale en blanco | Revisa la terminal donde corre `npm run dev`; recarga con **Ctrl/Cmd + Shift + R**. |
| `git clone` pide usuario/contraseña o da 404 | El repo es privado: inicia sesión en GitHub (`gh auth login`) con una cuenta invitada como colaboradora, o usa la opción ZIP. |
