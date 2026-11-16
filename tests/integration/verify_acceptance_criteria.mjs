import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';
import { createEcosystem, root, sleep } from '../helpers/ecosystem.mjs';
import { sourceFingerprint } from '../../scripts/source-fingerprint.mjs';

const results = [];
const started = new Date().toISOString();
const reportDir = resolve(root, 'docs/evidencias');
await mkdir(reportDir, { recursive: true });
const eco = await createEcosystem();
let productId;
let confirmedId;
const baseProduct = { sku: 'FCA-001', nombre: 'Arroz prueba FCA', categoria: 'Pruebas', precio: 2.5, stockActual: 10, stockMinimo: 2, stockMaximo: 20, unidad: 'unid' };
async function call(path, method = 'GET', body, headers = {}, url = eco.urls.gateway) {
  const response = await fetch(url + path, { method, headers: { 'X-Operador-Rol': 'ADMIN', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(10000) });
  const data = await response.json();
  return { status: response.status, data, trace: response.headers.get('X-Trace-ID') };
}
async function check(id, pt, description, action) {
  try { await action(); results.push({ id, pt, description, passed: true }); console.log('PASS ' + id + ' ' + description); }
  catch (error) { results.push({ id, pt, description, passed: false, error: error.message }); console.error('FAIL ' + id + ' ' + error.message); }
}
let proxy;
try {
  await check('CA01-01', 'PT-01', 'Salud de inventario y semilla en cuatro estados', async () => {
    const health = await call('/health', 'GET', undefined, {}, eco.urls.inventory);
    assert.equal(health.data.sci, 'SCI-03'); assert.equal(health.data.status, 'UP');
    const { data } = await call('/api/productos');
    assert.ok(data.productos.length >= 6);
    assert.deepEqual(new Set(data.productos.map(p => p.estadoInventario)), new Set(['OPTIMO', 'CRITICO_FALTANTE', 'EXCEDENTE_RIESGO_MERMA', 'AGOTADO']));
  });
  await check('CA01-02', 'PT-01', 'Creación persistente de producto', async () => {
    const result = await call('/api/productos', 'POST', baseProduct);
    assert.equal(result.status, 201); productId = result.data.id;
    assert.equal((await call('/api/productos/' + productId)).data.stockActual, 10);
  });
  await check('CA01-03', 'PT-01', 'Entradas inválidas rechazadas sin crear registros', async () => {
    for (const values of [{ precio: 0 }, { stockActual: -1 }, { stockActual: 1.5 }, { nombre: ' ' }, { stockMinimo: 30 }, { precio: '2' }]) {
      assert.equal((await call('/api/productos', 'POST', { ...baseProduct, sku: 'INVALID', ...values })).status, 400);
    }
    assert.equal((await call('/api/productos/abc')).status, 400);
    assert.equal((await call('/api/productos/9999999')).status, 404);
  });
  await check('CA01-04', 'PT-01', 'SKU único y edición consistente', async () => {
    assert.equal((await call('/api/productos', 'POST', baseProduct)).status, 409);
    assert.equal((await call('/api/productos/' + productId, 'PUT', { nombre: 'Arroz FCA actualizado', stockActual: 12 })).status, 200);
    assert.equal((await call('/api/productos/' + productId)).data.stockActual, 12);
    await call('/api/productos/' + productId, 'PUT', { stockActual: 10 });
  });
  await check('CA01-05', 'PT-01', 'Reposición idempotente y cantidades inválidas', async () => {
    const path = '/api/productos/' + productId + '/reponer-stock';
    for (const cantidad of [0, -1, 0.5, '2', null]) assert.equal((await call(path, 'PATCH', { cantidad })).status, 400);
    await call(path, 'PATCH', { cantidad: 2, operacionId: 'reponer-fca' });
    await call(path, 'PATCH', { cantidad: 2, operacionId: 'reponer-fca' });
    assert.equal((await call('/api/productos/' + productId)).data.stockActual, 12);
    await call('/api/productos/' + productId, 'PUT', { stockActual: 10 });
  });
  await check('CA01-06', 'PT-01', 'Descuentos concurrentes no producen stock negativo', async () => {
    const p = (await call('/api/productos', 'POST', { ...baseProduct, sku: 'FCA-CONCURRENT-STOCK', stockActual: 3 })).data;
    const responses = await Promise.all(Array.from({ length: 10 }, () => call('/api/productos/' + p.id + '/descontar-stock', 'PATCH', { cantidad: 1 })));
    assert.equal(responses.filter(r => r.status === 200).length, 3);
    assert.equal(responses.filter(r => r.status === 409).length, 7);
    assert.equal((await call('/api/productos/' + p.id)).data.stockActual, 0);
  });
  await check('CA02-01', 'PT-02', 'Pedido viable descuenta stock y conserva traza', async () => {
    const result = await call('/api/pedidos', 'POST', { clienteNombre: 'Cliente FCA', productoId: productId, cantidadSolicitada: 2 }, { 'X-Idempotency-Key': 'fca-confirmado', 'X-Trace-ID': 'fca-trace-confirmado' });
    assert.equal(result.status, 201); assert.equal(result.data.estado, 'CONFIRMADO'); assert.equal(result.data.total, 5);
    assert.equal(result.data.traceId, result.trace); assert.equal(result.trace, 'fca-trace-confirmado'); confirmedId = result.data.id;
    assert.equal((await call('/api/productos/' + productId)).data.stockActual, 8);
  });
  await check('CA02-02', 'PT-02', 'Pedido sin stock queda registrado sin alterar inventario', async () => {
    const result = await call('/api/pedidos', 'POST', { clienteNombre: 'Cliente FCA', productoId: productId, cantidadSolicitada: 100 });
    assert.equal(result.status, 200); assert.equal(result.data.esViable, false); assert.equal(result.data.estado, 'RECHAZADO_SIN_STOCK');
    assert.match(result.data.motivoResolucion, /solicitado 100, disponible 8/);
    assert.equal((await call('/api/productos/' + productId)).data.stockActual, 8);
    assert.equal((await call('/api/pedidos/' + result.data.id)).data.estado, 'RECHAZADO_SIN_STOCK');
  });
  await check('CA02-03', 'PT-02', 'Producto inexistente genera rechazo trazable', async () => {
    const result = await call('/api/pedidos', 'POST', { clienteNombre: 'Cliente FCA', productoId: 9999999, cantidadSolicitada: 1 });
    assert.equal(result.data.estado, 'RECHAZADO_PRODUCTO_INEXISTENTE');
    assert.equal(result.data.validadoContraExistencias, true);
  });
  await check('CA02-04', 'PT-02', 'Validación de pedidos y filtros', async () => {
    for (const values of [{ cantidadSolicitada: 0 }, { cantidadSolicitada: 1.2 }, { clienteNombre: '' }, { productoId: '1' }]) {
      assert.equal((await call('/api/pedidos', 'POST', { clienteNombre: 'FCA', productoId: productId, cantidadSolicitada: 1, ...values })).status, 400);
    }
    assert.ok((await call('/api/pedidos?viable=true')).data.every(p => p.esViable));
    assert.ok((await call('/api/pedidos?estado=RECHAZADO_SIN_STOCK')).data.every(p => p.estado === 'RECHAZADO_SIN_STOCK'));
    assert.equal((await call('/api/pedidos?viable=invalid')).status, 400);
  });
  await check('CA02-05', 'PT-02', 'Reintento del mismo pedido no duplica registro ni descuento', async () => {
    const result = await call('/api/pedidos', 'POST', { clienteNombre: 'Cliente FCA', productoId: productId, cantidadSolicitada: 2 }, { 'X-Idempotency-Key': 'fca-confirmado' });
    assert.equal(result.data.id, confirmedId);
    assert.equal((await call('/api/productos/' + productId)).data.stockActual, 8);
    assert.equal((await call('/api/pedidos', 'POST', { clienteNombre: 'Otro cliente', productoId: productId, cantidadSolicitada: 2 }, { 'X-Idempotency-Key': 'fca-confirmado' })).status, 409);
  });
  await check('CA02-06', 'PT-02', 'Pedidos concurrentes se resuelven contra disponibilidad real', async () => {
    const p = (await call('/api/productos', 'POST', { ...baseProduct, sku: 'FCA-CONCURRENT-ORDER', stockActual: 3 })).data;
    const responses = await Promise.all(Array.from({ length: 8 }, (_, i) => call('/api/pedidos', 'POST', { clienteNombre: 'Concurrente ' + i, productoId: p.id, cantidadSolicitada: 1 })));
    assert.equal(responses.filter(r => r.data.estado === 'CONFIRMADO').length, 3);
    assert.equal(responses.filter(r => r.data.estado === 'RECHAZADO_SIN_STOCK').length, 5);
    assert.equal((await call('/api/productos/' + p.id)).data.stockActual, 0);
  });
  await check('CA03-01', 'PT-03', 'Salud consolidada y agregación ODS coherente', async () => {
    const health = await call('/health');
    assert.equal(health.data.status, 'UP'); assert.equal(health.data.sci, 'SCI-02'); assert.equal(health.data.servicios.length, 2);
    const { data } = await call('/api/dashboard/resumen');
    assert.equal(data.pedidos.porcentajePedidosValidadosContraExistencias, 100);
    assert.equal(data.ods['IND-ODS-02'], data.inventario.faltantes + data.inventario.agotados + data.inventario.excedentes);
    assert.ok(data.pedidos.tiempoPromedioRegistroMs >= 0);
  });
  await check('CA03-02', 'PT-03', 'Lecturas predeterminadas y escrituras con rol obligatorio', async () => {
    assert.equal((await fetch(eco.urls.gateway + '/api/productos')).status, 200);
    assert.equal((await fetch(eco.urls.gateway + '/api/productos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(baseProduct) })).status, 403);
    assert.equal((await call('/api/productos', 'POST', baseProduct, { 'X-Operador-Rol': 'AUDITOR_SQA' })).status, 403);
    assert.equal((await call('/api/productos', 'GET', undefined, { 'X-Operador-Rol': 'AUDITOR_SQA' })).status, 200);
    assert.equal((await call('/api/productos', 'GET', undefined, { 'X-Operador-Rol': 'INVITADO_SIN_PERMISO', 'X-Trace-ID': 'fca-trace-denied' })).status, 403);
  });
  await check('CA03-03', 'PT-03', 'Bitácora contiene el rechazo y limita su tamaño a 50', async () => {
    let history = (await call('/api/gateway/trazabilidad')).data;
    assert.ok(history.some(item => item.traceId === 'fca-trace-denied' && item.codigoEstado === 403));
    await Promise.all(Array.from({ length: 55 }, () => call('/api/pedidos')));
    await sleep(50);
    history = (await call('/api/gateway/trazabilidad')).data;
    assert.equal(history.length, 50); assert.ok(history.every(item => item.metodo && item.ruta && typeof item.latenciaMs === 'number'));
  });
  await check('CA03-04', 'PT-03', 'Alias del sistema anterior siguen operativos', async () => {
    const products = await call('/api/products');
    assert.ok(Array.isArray(products.data)); assert.equal(typeof products.data[0].name, 'string');
    const result = await call('/api/orders', 'POST', { productId: productId, quantity: 1 });
    assert.equal(result.status, 201); assert.equal(result.data.status, 'completed');
  });
  await check('CA02-07', 'PT-02', 'Persistencia después de reiniciar ambos servicios', async () => {
    const before = (await call('/api/productos/' + productId)).data.stockActual;
    await eco.stop('orders'); await eco.stop('inventory');
    await eco.start('inventory'); await eco.start('orders');
    assert.equal((await call('/api/productos/' + productId)).data.stockActual, before);
    assert.equal((await call('/api/pedidos/' + confirmedId)).data.estado, 'CONFIRMADO');
  });
  await check('CA03-05', 'PT-03', 'Caída de inventario degrada salud y conserva intento de pedido', async () => {
    await eco.stop('inventory');
    try {
      assert.equal((await call('/health')).status, 503);
      assert.equal((await call('/api/productos')).status, 502);
      const result = await call('/api/pedidos', 'POST', { clienteNombre: 'Inventario caído', productoId: productId, cantidadSolicitada: 1 }, { 'X-Idempotency-Key': 'fca-down' });
      assert.equal(result.status, 503); assert.equal(result.data.estado, 'ERROR_INTEGRACION');
      const indicators = (await call('/api/pedidos/indicadores-ods')).data;
      assert.ok(indicators.porcentajePedidosValidadosContraExistencias < 100);
    } finally { await eco.start('inventory'); }
  });
  await check('CA02-08', 'PT-02', 'Respuesta de descuento perdida se reconcilia tras reinicio sin duplicarlo', async () => {
    await eco.stop('orders');
    const p = (await call('/api/productos', 'POST', { ...baseProduct, sku: 'FCA-LOST-RESPONSE', stockActual: 10 })).data;
    let dropped = false;
    proxy = createServer(async (req, res) => {
      try {
        const buffers = []; for await (const chunk of req) buffers.push(chunk);
        const response = await fetch(eco.urls.inventory + req.url, { method: req.method, headers: { 'Content-Type': 'application/json', 'X-Trace-ID': String(req.headers['x-trace-id'] ?? '') }, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(buffers) });
        const data = await response.text();
        if (!dropped && req.url.endsWith('/descontar-stock') && Buffer.concat(buffers).toString().includes('pedido-fca-lost')) { dropped = true; res.destroy(); return; }
        res.writeHead(response.status, { 'Content-Type': 'application/json' }); res.end(data);
      } catch { res.writeHead(502); res.end('{}'); }
    });
    proxy.listen(0, '127.0.0.1'); await once(proxy, 'listening');
    await eco.start('orders', { INVENTARIO_URL: 'http://127.0.0.1:' + proxy.address().port });
    const payload = { clienteNombre: 'Respuesta perdida', productoId: p.id, cantidadSolicitada: 2 };
    const first = await call('/api/pedidos', 'POST', payload, { 'X-Idempotency-Key': 'fca-lost' });
    assert.equal(first.status, 503); assert.equal(first.data.estado, 'ERROR_INTEGRACION');
    assert.equal((await call('/api/productos/' + p.id)).data.stockActual, 8);
    await eco.stop('orders');
    await eco.start('orders');
    const result = (await call('/api/pedidos/' + first.data.id)).data;
    assert.equal(result.estado, 'CONFIRMADO'); assert.equal(result.total, 5);
    assert.equal((await call('/api/productos/' + p.id)).data.stockActual, 8);
    await new Promise(resolve => proxy.close(resolve)); proxy = undefined;
  });
  await check('CA01-07', 'PT-01', 'Migración no destructiva e idempotente de una base heredada', async () => {
    await eco.stop('inventory');
    const storage = resolve(eco.dir, 'legacy-fixture.sqlite');
    const fixture = new DatabaseSync(storage);
    fixture.exec("CREATE TABLE products (id INTEGER PRIMARY KEY AUTOINCREMENT, name VARCHAR(255) NOT NULL, price FLOAT NOT NULL, stock INTEGER NOT NULL, category VARCHAR(255) NOT NULL, createdAt DATETIME NOT NULL, updatedAt DATETIME NOT NULL); INSERT INTO products VALUES (42, 'Producto legado', 1.25, 7, 'Pruebas', '2026-11-01 00:00:00', '2026-11-01 00:00:00');");
    fixture.close();
    await eco.start('inventory', { DB_STORAGE: storage });
    let response = (await call('/api/productos', 'GET', undefined, {}, eco.urls.inventory)).data;
    assert.equal(response.productos.length, 1);
    assert.equal(response.productos[0].id, 42); assert.equal(response.productos[0].sku, 'LEG-42');
    assert.equal(response.productos[0].stockActual, 7); assert.equal(response.productos[0].precio, 1.25);
    await eco.stop('inventory'); await eco.start('inventory', { DB_STORAGE: storage });
    response = (await call('/api/productos', 'GET', undefined, {}, eco.urls.inventory)).data;
    assert.equal(response.productos.length, 1); assert.equal(response.productos[0].sku, 'LEG-42');
  });
} finally {
  if (proxy) { proxy.closeAllConnections(); await new Promise(resolve => proxy.close(resolve)); }
  await eco.close();
}
const criteria = ['PT-01', 'PT-02', 'PT-03'].map(pt => ({ pt, passed: results.filter(r => r.pt === pt).every(r => r.passed), cases: results.filter(r => r.pt === pt).length }));
let defectSource = { completo: false, defectos: [] };
try { defectSource = JSON.parse(await readFile(resolve(root, process.env.DEFECT_REGISTER_PATH ?? 'docs/registro_defectos.json'), 'utf8')); } catch {}
const severe = defectSource.defectos.filter(d => d.estado === 'Abierto' && ['Alta', 'Crítica'].includes(d.severidad)).length;
const report = {
  fingerprint: await sourceFingerprint(),
  started, finished: new Date().toISOString(), logs: eco.dir.replaceAll('\\', '/'), results, criteria,
  metrics: {
    'MET-CAL-01': { valor: criteria.filter(c => c.passed).length / criteria.length * 100, unidad: '%', alcance: 'PT-01, PT-02 y PT-03 evaluados automáticamente; PT-04 requiere pruebas de navegador y aceptación humana' },
    'MET-CAL-02': { valor: defectSource.completo ? severe : null, unidad: 'defectos', gravesRegistradosLocalmente: severe, casosFallidosEnEstaEjecucion: results.filter(r => !r.passed).length, alcance: 'N/D si falta un registro completo y validado; los tests no sustituyen GitHub Issues' },
  },
};
await writeFile(resolve(eco.dir, 'acceptance-results.json'), JSON.stringify(report, null, 2) + '\n');
await writeFile(resolve(reportDir, 'acceptance-results.json'), JSON.stringify(report, null, 2) + '\n');
console.log('FCA funcional automatizada: ' + results.filter(r => r.passed).length + '/' + results.length + ' casos. MET-CAL-01 (3 paquetes evaluados): ' + report.metrics['MET-CAL-01'].valor + '%');
console.log('MET-CAL-02: ' + (report.metrics['MET-CAL-02'].valor ?? 'N/D') + ' · requiere registro de defectos completo.');
process.exitCode = results.some(r => !r.passed) ? 1 : 0;
