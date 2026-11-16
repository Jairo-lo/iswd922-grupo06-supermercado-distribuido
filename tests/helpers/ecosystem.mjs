import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { mkdir, open } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
export const root = fileURLToPath(new URL('../../', import.meta.url));
export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
export async function freePort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}
export async function waitFor(url, child) {
  for (let i = 0; i < 120; i++) {
    if (child?.exitCode !== null && child?.exitCode !== undefined) throw new Error('El servicio terminó antes de estar disponible: ' + url);
    try { const response = await fetch(url, { signal: AbortSignal.timeout(1500) }); if (response.ok) return; } catch {}
    await sleep(250);
  }
  throw new Error('Servicio no disponible: ' + url);
}
export async function createEcosystem(label = 'acceptance') {
  const dir = resolve(root, '.test-runs', label + '-' + Date.now());
  await mkdir(dir, { recursive: true });
  const ports = { inventory: await freePort(), orders: await freePort(), gateway: await freePort() };
  const urls = Object.fromEntries(Object.entries(ports).map(([key, port]) => [key, 'http://127.0.0.1:' + port]));
  const children = new Map();
  async function start(name, overrides = {}) {
    const folders = { inventory: 'sci-03-inventario', orders: 'sci-04-pedidos', gateway: 'sci-02-api-gateway' };
    const log = await open(resolve(dir, name + '.log'), 'a');
    const child = spawn(process.execPath, [resolve(root, 'services', folders[name], 'dist/index.js')], { cwd: root, env: { ...process.env, HOST: '127.0.0.1', PORT: String(ports[name]), DB_STORAGE: resolve(dir, name + '.sqlite'), INVENTARIO_URL: urls.inventory, PEDIDOS_URL: urls.orders, GATEWAY_ACCESS_KEY: '', CORS_ORIGIN: '*', HTTP_TIMEOUT_MS: '1500', RECONCILE_INTERVAL_MS: '600000', ...overrides }, stdio: ['ignore', log.fd, log.fd], windowsHide: true });
    child.on('error', error => console.error(error));
    children.set(name, child);
    await log.close();
    await waitFor(urls[name] + '/health', child);
  }
  async function stop(name) {
    const child = children.get(name);
    if (!child || child.exitCode !== null) return;
    const exited = once(child, 'exit');
    child.kill();
    await exited;
    children.delete(name);
  }
  async function close() { for (const name of [...children.keys()].reverse()) await stop(name); }
  try { await start('inventory'); await start('orders'); await start('gateway'); }
  catch (error) { await close(); throw error; }
  return { dir, ports, urls, start, stop, close };
}
