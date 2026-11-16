import { test, expect, type Page } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createEcosystem, freePort, root, waitFor } from '../helpers/ecosystem.mjs';
import { sourceFingerprint } from '../../scripts/source-fingerprint.mjs';

let eco: Awaited<ReturnType<typeof createEcosystem>>;
let frontend: ChildProcess;
let base: string;
const captureDir = resolve(root, 'docs/evidencias/capturas', Date.now() + '-' + process.pid);
const results: { id: string; passed: boolean; error?: string }[] = [];
test.beforeAll(async () => {
  eco = await createEcosystem('ui');
  const port = await freePort();
  base = 'http://127.0.0.1:' + port;
  frontend = spawn(process.execPath, [resolve(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: resolve(root, 'services/sci-01-panel-admin'), env: { ...process.env, VITE_API_GATEWAY_URL: eco.urls.gateway }, stdio: 'ignore', windowsHide: true,
  });
  await waitFor(base, frontend);
  await mkdir(captureDir, { recursive: true });
});
test.afterEach(async ({}, info) => {
  results.push({ id: info.title.split(' ')[0], passed: info.status === 'passed', ...(info.error ? { error: info.error.message } : {}) });
});
test.afterAll(async () => {
  if (frontend && frontend.exitCode === null) { const exited = once(frontend, 'exit'); frontend.kill(); await exited; }
  if (eco) await eco.close();
  await writeFile(resolve(root, 'docs/evidencias/ui-acceptance.json'), JSON.stringify({ timestamp: new Date().toISOString(), fingerprint: await sourceFingerprint(), criterion: 'PT-04', screenshots: captureDir, results, humanAcceptance: 'Pendiente de revisión cruzada y aceptación por el equipo' }, null, 2) + '\n');
});
async function navigate(page: Page, name: string) {
  await page.getByRole('navigation').getByRole('button', { name: new RegExp(name) }).click();
}
test('CA04-01 Resumen muestra indicadores reales y consulta solo el gateway', async ({ page }) => {
  const errors: string[] = [];
  const apiUrls: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (/\/api\/|\/health/.test(request.url())) apiUrls.push(request.url()); });
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.goto(base);
  await expect(page.getByText('Servicios conectados', { exact: true })).toBeVisible();
  await expect(page.getByText('Disponible', { exact: true })).toHaveCount(3);
  await expect(page.getByRole('heading', { name: 'Pedidos y disponibilidad' })).toBeVisible();
  await expect(page.locator('.metric').first().locator('strong')).toHaveText('6');
  await expect(page.getByText('N/D', { exact: true })).toHaveCount(2);
  expect(errors).toEqual([]);
  expect(apiUrls.length).toBeGreaterThan(0);
  expect(apiUrls.every(url => url.startsWith(eco.urls.gateway))).toBeTruthy();
  await page.screenshot({ path: resolve(captureDir, 'panel-escritorio.png'), fullPage: true });
});
test('CA04-02 Inventario permite crear, editar y reponer existencias', async ({ page }) => {
  await page.goto(base); await navigate(page, 'Inventario');
  await page.getByRole('textbox', { name: 'SKU', exact: true }).fill('UI-FCA-001');
  await page.getByRole('textbox', { name: 'Nombre', exact: true }).fill('Producto recorrido UI');
  await page.getByRole('textbox', { name: 'Categoría', exact: true }).fill('Pruebas');
  await page.getByRole('spinbutton', { name: 'Precio USD' }).fill('2.50');
  await page.getByRole('spinbutton', { name: 'Existencias', exact: true }).fill('10');
  await page.getByRole('button', { name: 'Crear producto', exact: true }).click();
  const row = page.getByRole('row').filter({ hasText: 'UI-FCA-001' });
  await expect(row).toContainText('Producto recorrido UI');
  await row.getByRole('button', { name: 'Editar Producto recorrido UI', exact: true }).click();
  await page.getByRole('textbox', { name: 'Nombre', exact: true }).fill('Producto UI actualizado');
  await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  await expect(row).toContainText('Producto UI actualizado');
  await row.getByRole('button', { name: 'Reponer Producto UI actualizado', exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Cantidad a reponer' }).fill('3');
  await page.getByRole('button', { name: 'Confirmar reposición' }).click();
  await expect(row).toContainText('13 unid');
});
test('CA04-03 Pedidos muestran confirmación, rechazo e historial', async ({ page, request }) => {
  const created = await request.post(eco.urls.gateway + '/api/productos', { headers: { 'X-Operador-Rol': 'ADMIN' }, data: { sku: 'UI-ORDER', nombre: 'Producto pedido UI', categoria: 'Pruebas', precio: 2, stockActual: 3 } });
  const product = await created.json();
  await page.goto(base); await navigate(page, 'Pedidos');
  await page.getByRole('textbox', { name: 'Cliente', exact: true }).fill('Cliente recorrido UI');
  await page.getByLabel('Producto', { exact: true }).selectOption(String(product.id));
  await page.getByRole('spinbutton', { name: 'Cantidad solicitada' }).fill('2');
  await page.getByRole('button', { name: 'Validar y registrar pedido' }).click();
  await expect(page.getByRole('status')).toContainText('CONFIRMADO');
  await page.getByRole('spinbutton', { name: 'Cantidad solicitada' }).fill('10');
  await page.getByRole('button', { name: 'Validar y registrar pedido' }).click();
  await expect(page.getByRole('status')).toContainText('RECHAZADO_SIN_STOCK');
  await expect(page.getByRole('row').filter({ hasText: 'Cliente recorrido UI' })).toHaveCount(2);
  const after = await (await request.get(eco.urls.gateway + '/api/productos/' + product.id)).json();
  expect(after.stockActual).toBe(1);
  await page.getByLabel('Estado', { exact: true }).selectOption('RECHAZADO_SIN_STOCK');
  await expect(page.getByRole('row').filter({ hasText: 'Cliente recorrido UI' })).toHaveCount(1);
});
test('CA04-04 Auditoría demuestra bloqueo y deshabilita escrituras del auditor', async ({ page }) => {
  await page.goto(base); await navigate(page, 'Trazabilidad');
  await page.getByRole('button', { name: 'Probar bloqueo de seguridad' }).click();
  await expect(page.getByRole('alert')).toContainText('403 Forbidden');
  await expect(page.getByRole('row').filter({ hasText: 'INVITADO_SIN_PERMISO' })).toContainText('403');
  await page.getByLabel('Rol de operador', { exact: true }).selectOption('AUDITOR_SQA');
  await navigate(page, 'Inventario');
  await expect(page.getByRole('button', { name: 'Crear producto', exact: true })).toBeDisabled();
  await navigate(page, 'Pedidos');
  await expect(page.getByRole('button', { name: 'Validar y registrar pedido' })).toBeDisabled();
});
test('CA04-05 Panel móvil conserva navegación y formularios utilizables', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base);
  await expect(page.getByRole('heading', { name: 'Resumen ejecutivo', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await page.screenshot({ path: resolve(captureDir, 'panel-movil.png'), fullPage: true });
  for (const name of ['Inventario', 'Pedidos', 'Trazabilidad']) {
    await navigate(page, name);
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  }
});

test('CA04-06 Reintento del panel tras perder respuesta no duplica el pedido', async ({ page, request }) => {
  const created = await request.post(eco.urls.gateway + '/api/productos', { headers: { 'X-Operador-Rol': 'ADMIN' }, data: { sku: 'UI-RETRY', nombre: 'Producto reintento UI', categoria: 'Pruebas', precio: 2, stockActual: 5 } });
  const product = await created.json();
  const keys: string[] = [];
  let drop = true;
  await page.route('**/api/pedidos', async route => {
    if (route.request().method() !== 'POST') { await route.continue(); return; }
    keys.push(route.request().headers()['x-idempotency-key']);
    if (drop) { drop = false; await route.fetch(); await route.abort('failed'); }
    else await route.continue();
  });
  await page.goto(base); await navigate(page, 'Pedidos');
  await page.getByRole('textbox', { name: 'Cliente', exact: true }).fill('Respuesta UI perdida');
  await page.getByLabel('Producto', { exact: true }).selectOption(String(product.id));
  await page.getByRole('spinbutton', { name: 'Cantidad solicitada' }).fill('2');
  const submit = page.getByRole('button', { name: 'Validar y registrar pedido' });
  await submit.click();
  await expect(page.getByRole('alert')).toContainText('No se pudo completar');
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(page.getByRole('status')).toContainText('CONFIRMADO');
  await expect(page.getByRole('row').filter({ hasText: 'Respuesta UI perdida' })).toHaveCount(1);
  const after = await (await request.get(eco.urls.gateway + '/api/productos/' + product.id)).json();
  expect(after.stockActual).toBe(3);
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBe(keys[1]);
});
