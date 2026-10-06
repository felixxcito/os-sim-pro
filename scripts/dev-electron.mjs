// Arranca Vite en modo desarrollo, compila el proceso principal y abre Electron apuntando al servidor.
import { spawn, execSync } from 'node:child_process';
import { createServer } from 'vite';
import electron from 'electron';

const server = await createServer();
await server.listen();
const url = server.resolvedUrls.local[0];
execSync('npx tsc -p electron/tsconfig.json', { stdio: 'inherit' });

const child = spawn(electron, ['.'], { stdio: 'inherit', env: { ...process.env, VITE_DEV_SERVER_URL: url } });
child.on('close', async (code) => {
  await server.close();
  process.exit(code ?? 0);
});
