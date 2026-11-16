import express from 'express';
import cors from 'cors';
import axios from 'axios';
import { timingSafeEqual } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { HttpError, trace, requestLog, errors, startServer } from './http';

const inventoryUrl = process.env.INVENTARIO_URL ?? 'http://127.0.0.1:3000';
const ordersUrl = process.env.PEDIDOS_URL ?? 'http://127.0.0.1:3001';
const client = axios.create({ timeout: Number(process.env.HTTP_TIMEOUT_MS ?? 12000), proxy: false });
interface Operation { traceId: string; metodo: string; ruta: string; rol: string; codigoEstado: number; latenciaMs: number; timestamp: string }
const history: Operation[] = [];
const app = express();
app.disable('x-powered-by');
app.use(trace);
app.use((req, res, next) => {
  const started = performance.now();
  res.on('finish', () => {
    history.push({ traceId: String(res.locals.traceId), metodo: req.method, ruta: req.originalUrl, rol: String(res.locals.role ?? req.get('X-Operador-Rol') ?? 'SIN_ROL'), codigoEstado: res.statusCode, latenciaMs: Math.round((performance.now() - started) * 100) / 100, timestamp: new Date().toISOString() });
    if (history.length > 50) history.splice(0, history.length - 50);
  });
  next();
});
const origins = (process.env.CORS_ORIGIN ?? 'http://localhost:5173,http://127.0.0.1:5173,http://localhost:8080,http://127.0.0.1:8080').split(',');
app.use(requestLog, cors({ origin: origins.includes('*') ? '*' : origins, exposedHeaders: ['X-Trace-ID'], allowedHeaders: ['Content-Type', 'X-Operador-Rol', 'X-Trace-ID', 'X-Idempotency-Key', 'X-Access-Key'] }), express.json({ limit: '100kb' }));
app.use((req, res, next) => {
  const read = ['GET', 'HEAD', 'OPTIONS'].includes(req.method);
  const explicit = req.get('X-Operador-Rol');
  const role = explicit ?? (read ? 'ADMIN' : 'SIN_ROL');
  res.locals.role = role;
  if (explicit !== undefined && !['ADMIN', 'OPERADOR', 'AUDITOR_SQA'].includes(role)) throw new HttpError(403, 'Rol no autorizado');
  if (!read) {
    const expected = process.env.GATEWAY_ACCESS_KEY;
    const provided = req.get('X-Access-Key') ?? '';
    const keyOk = !!expected && Buffer.byteLength(expected) === Buffer.byteLength(provided) && timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
    if (role === 'AUDITOR_SQA' || (!['ADMIN', 'OPERADOR'].includes(role) && !keyOk)) throw new HttpError(403, 'Se requiere un operador autorizado para modificar datos');
  }
  next();
});
function headers(traceId: string) { return { 'X-Trace-ID': traceId }; }
async function health(url: string, sci: string, traceId: string) {
  try {
    const result = await client.get<{ status: string }>(url + '/health', { timeout: 1500, headers: headers(traceId) });
    return { ...result.data, sci, status: result.data.status === 'UP' ? 'UP' : 'DOWN' };
  } catch { return { status: 'DOWN', sci }; }
}
app.get('/health', async (_req, res) => {
  const traceId = String(res.locals.traceId);
  const servicios = await Promise.all([health(inventoryUrl, 'SCI-03', traceId), health(ordersUrl, 'SCI-04', traceId)]);
  const status = servicios.every(service => service.status === 'UP') ? 'UP' : 'DOWN';
  res.status(status === 'UP' ? 200 : 503).json({ status, gatewayStatus: 'UP', sci: 'SCI-02', wbs: 'PT-03', service: 'api-gateway', timestamp: new Date().toISOString(), servicios });
});
app.get('/api/gateway/trazabilidad', (_req, res) => { res.json([...history].reverse()); });
app.get('/api/dashboard/resumen', async (_req, res) => {
  const traceId = String(res.locals.traceId);
  try {
    const [inventory, indicators] = await Promise.all([
      client.get(inventoryUrl + '/api/productos', { headers: headers(traceId) }),
      client.get(ordersUrl + '/api/pedidos/indicadores-ods', { headers: headers(traceId) }),
    ]);
    const resumen = inventory.data.resumenAlertas as { faltantes: number; agotados: number; excedentes: number };
    res.json({ inventario: inventory.data.resumenAlertas, pedidos: indicators.data, ods: { 'IND-ODS-01': indicators.data.porcentajePedidosValidadosContraExistencias, 'IND-ODS-02': resumen.faltantes + resumen.agotados + resumen.excedentes, 'IND-ODS-03': indicators.data.tiempoPromedioRegistroMs }, timestamp: new Date().toISOString() });
  } catch { throw new HttpError(502, 'No se pudo obtener el resumen distribuido'); }
});
app.use(async (req, res, next) => {
  const path = req.path;
  const base = /^\/api\/(productos|products)(\/|$)/.test(path) ? inventoryUrl : /^\/api\/(pedidos|orders)(\/|$)/.test(path) ? ordersUrl : undefined;
  if (!base) { next(); return; }
  // Solo se reenvían rutas del contrato; una URL de cliente nunca elige el host.
  try {
    const result = await client.request({
      url: base + req.originalUrl, method: req.method, data: ['GET', 'HEAD'].includes(req.method) ? undefined : req.body,
      headers: { ...headers(String(res.locals.traceId)), 'X-Operador-Rol': String(res.locals.role), ...(req.get('X-Idempotency-Key') ? { 'X-Idempotency-Key': req.get('X-Idempotency-Key') } : {}) },
      validateStatus: () => true,
    });
    res.status(result.status).json(result.data);
  } catch { throw new HttpError(502, 'Servicio no disponible'); }
});
app.use((_req, res) => { res.status(404).json({ mensaje: 'Ruta no encontrada' }); });
app.use(errors);
startServer(app, 4000, 'SCI-02 API Gateway');
