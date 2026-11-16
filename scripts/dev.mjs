import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
const root = fileURLToPath(new URL('../', import.meta.url));
if (existsSync(resolve(root, '.env'))) loadEnvFile(resolve(root, '.env'));
const production = process.argv.includes('--production');
const children = [];
let closing = false;
function stop(code = 0) {
  if (closing) return;
  closing = true;
  for (const child of children) {
    if (process.platform === 'win32' && child.pid && !production) {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    } else child.kill();
  }
  process.exitCode = code;
}
for (const [folder, port] of [['sci-03-inventario', 3000], ['sci-04-pedidos', 3001], ['sci-02-api-gateway', 4000], ['sci-01-panel-admin', 5173]]) {
  const frontend = folder === 'sci-01-panel-admin';
  const entry = frontend ? resolve(root, 'node_modules/vite/bin/vite.js') : production ? resolve(root, 'services', folder, 'dist/index.js') : resolve(root, 'node_modules/tsx/dist/cli.mjs');
  const args = frontend ? [entry, ...(production ? ['preview'] : []), '--host', '127.0.0.1', '--port', String(port), '--strictPort'] : production ? [entry] : [entry, 'watch', 'src/index.ts'];
  const child = spawn(process.execPath, args, { cwd: resolve(root, 'services', folder), stdio: 'inherit', env: { ...process.env, PORT: String(port) }, windowsHide: true });
  children.push(child);
  child.on('error', error => { console.error(error); stop(1); });
  child.on('exit', code => { if (!closing) stop(code ?? 1); });
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
console.log('Panel: http://localhost:5173 · Gateway: http://localhost:4000');
