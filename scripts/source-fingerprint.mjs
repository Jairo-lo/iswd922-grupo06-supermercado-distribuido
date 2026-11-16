import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
export async function sourceFingerprint() {
  const names = ['package.json', 'package-lock.json', 'docker-compose.yml', 'playwright.config.ts'];
  async function walk(folder) {
    for (const entry of await readdir(resolve(root, folder), { withFileTypes: true })) {
      if (['node_modules', 'dist', 'assets', 'public'].includes(entry.name)) continue;
      const name = folder + '/' + entry.name;
      if (entry.isDirectory()) await walk(name);
      else if (/\.(ts|tsx|css|json|mjs|html)$/.test(name) || entry.name === 'Dockerfile') names.push(name);
    }
  }
  for (const folder of ['services', 'scripts', 'tests']) await walk(folder);
  const hash = createHash('sha256');
  for (const name of names.sort()) {
    try { hash.update(name + '\n'); hash.update(await readFile(resolve(root, name))); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return hash.digest('hex');
}
