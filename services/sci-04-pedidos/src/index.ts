import express from 'express';
import cors from 'cors';
import axios from 'axios';
import { DataTypes, Model, Sequelize, type CreationOptional, type InferAttributes, type InferCreationAttributes, type WhereOptions } from 'sequelize';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { resolve, dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import { HttpError, errors, trace, requestLog, positiveId, positiveQuantity, serializeWrite, startServer } from './http';

const storage = process.env.DB_STORAGE ?? resolve(__dirname, '../database.sqlite');
if (storage !== ':memory:') mkdirSync(dirname(storage), { recursive: true });
const sequelize = new Sequelize({ dialect: 'sqlite', storage, logging: false, retry: { max: 5 } });
const inventory = axios.create({ baseURL: process.env.INVENTARIO_URL ?? 'http://127.0.0.1:3000', timeout: Number(process.env.HTTP_TIMEOUT_MS ?? 5000), proxy: false });
type Estado = 'CONFIRMADO' | 'RECHAZADO_SIN_STOCK' | 'RECHAZADO_PRODUCTO_INEXISTENTE' | 'ERROR_INTEGRACION';
const estados: Estado[] = ['CONFIRMADO', 'RECHAZADO_SIN_STOCK', 'RECHAZADO_PRODUCTO_INEXISTENTE', 'ERROR_INTEGRACION'];
interface Producto { id: number; nombre: string; precio: number; stockActual: number }
class Pedido extends Model<InferAttributes<Pedido>, InferCreationAttributes<Pedido>> {
  declare id: CreationOptional<number>;
  declare clienteNombre: string;
  declare productoId: number;
  declare productoNombre: CreationOptional<string>;
  declare cantidadSolicitada: number;
  declare precioUnitario: CreationOptional<number>;
  declare total: CreationOptional<number>;
  declare esViable: CreationOptional<boolean>;
  declare estado: CreationOptional<Estado>;
  declare motivoResolucion: CreationOptional<string>;
  declare tiempoProcesamientoMs: CreationOptional<number>;
  declare validadoContraExistencias: CreationOptional<boolean>;
  declare pendienteResolucion: CreationOptional<boolean>;
  declare idempotencyKey: string;
  declare traceId: string;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}
Pedido.init({
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  clienteNombre: { type: DataTypes.STRING, allowNull: false },
  productoId: { type: DataTypes.INTEGER, allowNull: false },
  productoNombre: { type: DataTypes.STRING, allowNull: false, defaultValue: '' },
  cantidadSolicitada: { type: DataTypes.INTEGER, allowNull: false },
  precioUnitario: { type: DataTypes.FLOAT, defaultValue: 0 },
  total: { type: DataTypes.FLOAT, defaultValue: 0 },
  esViable: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  estado: { type: DataTypes.STRING, allowNull: false, defaultValue: 'ERROR_INTEGRACION' },
  motivoResolucion: { type: DataTypes.STRING, defaultValue: 'Operación pendiente de resolución' },
  tiempoProcesamientoMs: { type: DataTypes.INTEGER, defaultValue: 0 },
  validadoContraExistencias: { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false },
  pendienteResolucion: { type: DataTypes.BOOLEAN, defaultValue: true, allowNull: false },
  idempotencyKey: { type: DataTypes.STRING, allowNull: false, unique: true },
  traceId: { type: DataTypes.STRING, allowNull: false },
  createdAt: DataTypes.DATE,
  updatedAt: DataTypes.DATE,
}, { sequelize, tableName: 'pedidos' });

function json(p: Pedido) {
  return { ...p.toJSON(), productId: p.productoId, quantity: p.cantidadSolicitada, status: p.estado === 'CONFIRMADO' ? 'completed' : p.estado === 'ERROR_INTEGRACION' ? 'pending' : 'cancelled' };
}
async function resolveOrder(order: Pedido): Promise<Pedido> {
  const start = performance.now();
  const headers = { 'X-Trace-ID': order.traceId };
  try {
    // Un reintento usa la misma reserva, incluso si la respuesta anterior se perdió.
    // La consulta inicial satisface el contrato de disponibilidad; la decisión final
    // corresponde exclusivamente al descuento condicional y atómico en inventario.
    let product: Producto | undefined;
    try {
      product = (await inventory.get<Producto>('/api/productos/' + order.productoId, { headers })).data;
    } catch (error) {
      if (!axios.isAxiosError(error) || error.response?.status !== 404) throw error;
    }
    try {
      const result = await inventory.patch<{ producto: Producto }>('/api/productos/' + order.productoId + '/descontar-stock', { cantidad: order.cantidadSolicitada, operacionId: 'pedido-' + order.idempotencyKey }, { headers });
      product = result.data.producto;
      order.set({ productoNombre: product.nombre, precioUnitario: product.precio, total: Math.round(product.precio * order.cantidadSolicitada * 100) / 100, esViable: true, estado: 'CONFIRMADO', motivoResolucion: 'Disponibilidad validada y stock descontado de forma atómica', validadoContraExistencias: true, pendienteResolucion: false });
    } catch (error) {
      if (!axios.isAxiosError(error) || ![404, 409].includes(error.response?.status ?? 0)) throw error;
      if (error.response?.status === 404) {
        order.set({ esViable: false, estado: 'RECHAZADO_PRODUCTO_INEXISTENTE', motivoResolucion: 'Producto no encontrado en el inventario', validadoContraExistencias: true, pendienteResolucion: false });
      } else {
        const available = (error.response?.data as { stockDisponible?: number })?.stockDisponible;
        if (typeof available !== 'number') throw error;
        order.set({ productoNombre: product?.nombre ?? '', precioUnitario: product?.precio ?? 0, total: 0, esViable: false, estado: 'RECHAZADO_SIN_STOCK', motivoResolucion: 'Disponibilidad insuficiente: solicitado ' + order.cantidadSolicitada + ', disponible ' + available, validadoContraExistencias: true, pendienteResolucion: false });
      }
    }
  } catch (error) {
    console.error('Integración pendiente', order.id, axios.isAxiosError(error) ? error.code : error);
    order.set({ esViable: false, estado: 'ERROR_INTEGRACION', motivoResolucion: 'No se pudo confirmar la operación. Se reconciliará con el mismo identificador, sin duplicar el descuento.', validadoContraExistencias: false, pendienteResolucion: true });
  }
  order.tiempoProcesamientoMs = Math.round(performance.now() - start);
  return order.save();
}
const app = express();
app.disable('x-powered-by');
app.use(trace, requestLog, cors({ exposedHeaders: ['X-Trace-ID'] }), express.json({ limit: '100kb' }));
app.get('/health', async (_req, res) => {
  await sequelize.authenticate();
  res.json({ status: 'UP', sci: 'SCI-04', wbs: 'PT-02', service: 'pedidos', timestamp: new Date().toISOString() });
});
const router = express.Router();
router.get('/indicadores-ods', async (_req, res) => {
  const orders = await Pedido.findAll();
  const total = orders.length;
  const confirmed = orders.filter(p => p.estado === 'CONFIRMADO').length;
  const rejected = orders.filter(p => p.estado.startsWith('RECHAZADO_')).length;
  res.json({
    totalPedidosProcesados: total, pedidosViablesConfirmados: confirmed, pedidosNoViablesRechazados: rejected,
    erroresIntegracion: orders.filter(p => p.estado === 'ERROR_INTEGRACION').length,
    porcentajePedidosValidadosContraExistencias: total ? orders.filter(p => p.validadoContraExistencias).length / total * 100 : null,
    tasaViabilidadPorcentaje: total ? confirmed / total * 100 : null,
    tiempoPromedioRegistroMs: total ? orders.reduce((sum, p) => sum + p.tiempoProcesamientoMs, 0) / total : null,
  });
});
router.get('/', async (req, res) => {
  const where: WhereOptions<InferAttributes<Pedido>> = {};
  if (req.query.estado !== undefined) {
    if (typeof req.query.estado !== 'string' || !estados.includes(req.query.estado as Estado)) throw new HttpError(400, 'estado inválido');
    where.estado = req.query.estado as Estado;
  }
  if (req.query.viable !== undefined) {
    if (!['true', 'false'].includes(String(req.query.viable))) throw new HttpError(400, 'viable debe ser true o false');
    where.esViable = req.query.viable === 'true';
  }
  res.json((await Pedido.findAll({ where, order: [['id', 'DESC']] })).map(json));
});
router.get('/:id', async (req, res) => {
  const order = await Pedido.findByPk(positiveId(req.params.id));
  if (!order) throw new HttpError(404, 'Pedido no encontrado');
  res.json(json(order));
});
router.post('/', async (req, res) => {
  const body = req.body ?? {};
  const productoId = positiveId(body.productoId ?? body.productId);
  if (typeof (body.productoId ?? body.productId) !== 'number') throw new HttpError(400, 'productoId debe ser numérico');
  const cantidadSolicitada = positiveQuantity(body.cantidadSolicitada ?? body.quantity);
  const clienteNombre: unknown = body.clienteNombre ?? (req.baseUrl.endsWith('/orders') ? 'Operador legado' : undefined);
  if (typeof clienteNombre !== 'string' || !clienteNombre.trim() || clienteNombre.length > 255) throw new HttpError(400, 'clienteNombre es obligatorio (máximo 255 caracteres)');
  const key = req.get('X-Idempotency-Key') ?? randomUUID();
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(key)) throw new HttpError(400, 'X-Idempotency-Key inválido');
  const order = await serializeWrite(async () => {
    let current = await Pedido.findOne({ where: { idempotencyKey: key } });
    if (current) {
      if (current.productoId !== productoId || current.cantidadSolicitada !== cantidadSolicitada || current.clienteNombre !== clienteNombre.trim()) throw new HttpError(409, 'X-Idempotency-Key ya utilizado con otros datos');
      if (!current.pendienteResolucion) return current;
    } else {
      // El intento queda persistido antes de cualquier mutación remota.
      current = await Pedido.create({ clienteNombre: clienteNombre.trim(), productoId, cantidadSolicitada, idempotencyKey: key, traceId: String(res.locals.traceId) });
    }
    return resolveOrder(current);
  });
  res.status(order.estado === 'ERROR_INTEGRACION' ? 503 : order.esViable ? 201 : 200).json(json(order));
});
app.use('/api/pedidos', router);
app.use('/api/orders', router);
app.use((_req, res) => { res.status(404).json({ mensaje: 'Ruta no encontrada' }); });
app.use(errors);

async function start() {
  await sequelize.sync();
  // Se conserva la tabla heredada. Importar no acredita validación de stock histórica.
  if ((await sequelize.getQueryInterface().showAllTables()).includes('orders')) {
    const [rows] = await sequelize.query('SELECT * FROM orders');
    for (const row of rows as { id: number; productId: number; quantity: number; total: number; status: string; createdAt: string }[]) {
      await Pedido.findOrCreate({ where: { idempotencyKey: 'legacy-' + row.id }, defaults: { clienteNombre: 'Registro legado', productoId: row.productId, cantidadSolicitada: row.quantity, total: Number(row.total), esViable: row.status === 'completed', estado: row.status === 'completed' ? 'CONFIRMADO' : 'ERROR_INTEGRACION', motivoResolucion: 'Importado del sistema anterior; sin evidencia histórica de validación síncrona', validadoContraExistencias: false, pendienteResolucion: false, traceId: 'legacy', idempotencyKey: 'legacy-' + row.id, createdAt: new Date(row.createdAt) } });
    }
  }
  const reconcile = () => serializeWrite(async () => {
    const pending = await Pedido.findAll({ where: { pendienteResolucion: true }, limit: 20, order: [['id', 'ASC']] });
    for (const order of pending) await resolveOrder(order);
  }).catch(error => console.error('No se pudo reconciliar pedidos', error));
  await reconcile();
  const timer = setInterval(() => { void reconcile(); }, Number(process.env.RECONCILE_INTERVAL_MS ?? 30000));
  timer.unref();
  startServer(app, 3001, 'SCI-04 Pedidos', async () => { clearInterval(timer); await sequelize.close(); });
}
void start().catch(error => { console.error(error); process.exit(1); });
