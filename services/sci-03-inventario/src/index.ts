import express, { type Request, type Response } from 'express';
import cors from 'cors';
import { DataTypes, Model, Op, Sequelize, Transaction, type CreationOptional, type InferAttributes, type InferCreationAttributes } from 'sequelize';
import { resolve, dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import { HttpError, errors, trace, requestLog, positiveId, positiveQuantity, serializeWrite, startServer } from './http';

const storage = process.env.DB_STORAGE ?? resolve(__dirname, '../database.sqlite');
if (storage !== ':memory:') mkdirSync(dirname(storage), { recursive: true });
const sequelize = new Sequelize({ dialect: 'sqlite', storage, logging: false, retry: { max: 5 } });

class Producto extends Model<InferAttributes<Producto>, InferCreationAttributes<Producto>> {
  declare id: CreationOptional<number>;
  declare sku: string;
  declare nombre: string;
  declare categoria: string;
  declare precio: number;
  declare stockActual: number;
  declare stockMinimo: CreationOptional<number>;
  declare stockMaximo: CreationOptional<number>;
  declare unidad: CreationOptional<string>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}
Producto.init({
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  sku: { type: DataTypes.STRING, allowNull: false, unique: true },
  nombre: { type: DataTypes.STRING, field: 'name', allowNull: false },
  categoria: { type: DataTypes.STRING, field: 'category', allowNull: false },
  precio: { type: DataTypes.FLOAT, field: 'price', allowNull: false, validate: { min: 0.01 } },
  stockActual: { type: DataTypes.INTEGER, field: 'stock', allowNull: false, validate: { min: 0, isInt: true } },
  stockMinimo: { type: DataTypes.INTEGER, defaultValue: 5, allowNull: false },
  stockMaximo: { type: DataTypes.INTEGER, defaultValue: 100, allowNull: false },
  unidad: { type: DataTypes.STRING, defaultValue: 'unid', allowNull: false },
  createdAt: DataTypes.DATE,
  updatedAt: DataTypes.DATE,
}, { sequelize, tableName: 'products' });

class OperacionStock extends Model<InferAttributes<OperacionStock>, InferCreationAttributes<OperacionStock>> {
  declare id: string;
  declare productoId: number;
  declare cantidad: number;
  declare tipo: string;
  declare resultado: string;
}
OperacionStock.init({
  id: { type: DataTypes.STRING, primaryKey: true },
  productoId: { type: DataTypes.INTEGER, allowNull: false },
  cantidad: { type: DataTypes.INTEGER, allowNull: false },
  tipo: { type: DataTypes.STRING, allowNull: false },
  resultado: { type: DataTypes.TEXT, allowNull: false },
}, { sequelize, tableName: 'stock_operations', timestamps: true });

function state(p: Producto): string {
  if (p.stockActual === 0) return 'AGOTADO';
  if (p.stockActual <= p.stockMinimo) return 'CRITICO_FALTANTE';
  if (p.stockActual > p.stockMaximo) return 'EXCEDENTE_RIESGO_MERMA';
  return 'OPTIMO';
}
function json(p: Producto) {
  return { ...p.toJSON(), estadoInventario: state(p), name: p.nombre, category: p.categoria, price: p.precio, stock: p.stockActual };
}
function input(body: Record<string, unknown>, current?: Producto) {
  const data = {
    sku: body.sku ?? current?.sku,
    nombre: body.nombre ?? body.name ?? current?.nombre,
    categoria: body.categoria ?? body.category ?? current?.categoria,
    precio: body.precio ?? body.price ?? current?.precio,
    stockActual: body.stockActual ?? body.stock ?? current?.stockActual,
    stockMinimo: body.stockMinimo ?? current?.stockMinimo ?? 5,
    stockMaximo: body.stockMaximo ?? current?.stockMaximo ?? 100,
    unidad: body.unidad ?? current?.unidad ?? 'unid',
  };
  if (!data.sku && body.name && !body.nombre) data.sku = 'LEG-' + crypto.randomUUID();
  for (const key of ['sku', 'nombre', 'categoria', 'unidad'] as const) {
    if (typeof data[key] !== 'string' || !(data[key] as string).trim() || (data[key] as string).length > 255) throw new HttpError(400, key + ' es obligatorio (máximo 255 caracteres)');
  }
  if (typeof data.precio !== 'number' || !Number.isFinite(data.precio) || data.precio < 0.01 || data.precio > 1e9) throw new HttpError(400, 'precio debe ser mayor a cero y como máximo 1000000000');
  for (const key of ['stockActual', 'stockMinimo', 'stockMaximo'] as const) {
    if (typeof data[key] !== 'number' || !Number.isSafeInteger(data[key]) || (data[key] as number) < 0 || (data[key] as number) > 2_000_000_000) throw new HttpError(400, key + ' debe ser un entero no negativo válido');
  }
  if ((data.stockMinimo as number) > (data.stockMaximo as number)) throw new HttpError(400, 'stockMinimo no puede superar stockMaximo');
  return { sku: (data.sku as string).trim(), nombre: (data.nombre as string).trim(), categoria: (data.categoria as string).trim(), precio: Math.round((data.precio as number) * 100) / 100, stockActual: data.stockActual as number, stockMinimo: data.stockMinimo as number, stockMaximo: data.stockMaximo as number, unidad: (data.unidad as string).trim() };
}
async function find(value: unknown) {
  const p = await Producto.findByPk(positiveId(value));
  if (!p) throw new HttpError(404, 'Producto no encontrado');
  return p;
}
const app = express();
app.disable('x-powered-by');
app.use(trace, requestLog, cors({ exposedHeaders: ['X-Trace-ID'] }), express.json({ limit: '100kb' }));
app.get('/health', async (_req, res) => {
  await sequelize.authenticate();
  res.json({ status: 'UP', sci: 'SCI-03', wbs: 'PT-01', service: 'inventario', timestamp: new Date().toISOString() });
});
const router = express.Router();
router.get('/', async (req, res) => {
  const products = await Producto.findAll({ order: [['id', 'ASC']] });
  const productos = products.map(json);
  const resumenAlertas = { totalProductos: products.length, stockTotal: products.reduce((sum, p) => sum + p.stockActual, 0), agotados: products.filter(p => state(p) === 'AGOTADO').length, faltantes: products.filter(p => state(p) === 'CRITICO_FALTANTE').length, excedentes: products.filter(p => state(p) === 'EXCEDENTE_RIESGO_MERMA').length };
  res.json(req.baseUrl.endsWith('/products') ? productos : { productos, resumenAlertas });
});
router.get('/:id', async (req, res) => { res.json(json(await find(req.params.id))); });
router.post('/', async (req, res) => {
  const values = input(req.body ?? {});
  res.status(201).json(json(await serializeWrite(() => Producto.create(values))));
});
router.put('/:id', async (req, res) => {
  const product = await serializeWrite(async () => {
    const current = await find(req.params.id);
    return current.update(input(req.body ?? {}, current));
  });
  res.json(json(product));
});
router.delete('/:id', async (req, res) => {
  await serializeWrite(async () => { await (await find(req.params.id)).destroy(); });
  res.json({ mensaje: 'Producto eliminado correctamente' });
});
async function stockChange(req: Request, res: Response) {
  const id = positiveId(req.params.id);
  const cantidad = positiveQuantity(req.body?.cantidad);
  const tipo = req.path.endsWith('/descontar-stock') ? 'DESCUENTO' : 'REPOSICION';
  const key: unknown = req.body?.operacionId;
  if (key !== undefined && (typeof key !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(key))) throw new HttpError(400, 'operacionId inválido');
  const result = await serializeWrite(() => sequelize.transaction({ type: Transaction.TYPES.IMMEDIATE }, async transaction => {
    if (typeof key === 'string') {
      const previous = await OperacionStock.findByPk(key, { transaction });
      if (previous) {
        if (previous.productoId !== id || previous.cantidad !== cantidad || previous.tipo !== tipo) throw new HttpError(409, 'operacionId ya utilizado con otros datos');
        return { status: 200, body: JSON.parse(previous.resultado) as Record<string, unknown> };
      }
    }
    const p = await Producto.findByPk(id, { transaction });
    if (!p) throw new HttpError(404, 'Producto no encontrado');
    if (tipo === 'REPOSICION' && p.stockActual + cantidad > 2_000_000_000) throw new HttpError(400, 'Stock fuera de rango');
    const [affected] = await Producto.update({ stockActual: sequelize.literal('stock ' + (tipo === 'DESCUENTO' ? '-' : '+') + ' ' + cantidad) as unknown as number }, { where: { id, ...(tipo === 'DESCUENTO' ? { stockActual: { [Op.gte]: cantidad } } : {}) }, transaction });
    if (!affected) return { status: 409, body: { viable: false, mensaje: 'Stock insuficiente', stockDisponible: p.stockActual } };
    await p.reload({ transaction });
    const body = { viable: true, producto: json(p), stockDisponible: p.stockActual };
    if (typeof key === 'string') await OperacionStock.create({ id: key, productoId: id, cantidad, tipo, resultado: JSON.stringify(body) }, { transaction });
    return { status: 200, body };
  }));
  res.status(result.status).json(result.body);
}
router.patch('/:id/descontar-stock', stockChange);
router.patch('/:id/reponer-stock', stockChange);
app.use('/api/productos', router);
app.use('/api/products', router);
app.use((_req, res) => { res.status(404).json({ mensaje: 'Ruta no encontrada' }); });
app.use(errors);

async function start() {
  const qi = sequelize.getQueryInterface();
  if ((await qi.showAllTables()).includes('products')) {
    const columns = await qi.describeTable('products');
    const additions = { sku: { type: DataTypes.STRING, allowNull: true }, stockMinimo: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 5 }, stockMaximo: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 100 }, unidad: { type: DataTypes.STRING, allowNull: false, defaultValue: 'unid' } };
    for (const [name, definition] of Object.entries(additions)) if (!columns[name]) await qi.addColumn('products', name, definition);
    await sequelize.query("UPDATE products SET sku = 'LEG-' || id WHERE sku IS NULL OR TRIM(sku) = ''");
    const indexes = await qi.showIndex('products') as { unique?: boolean; fields?: { attribute: string }[] }[];
    if (!indexes.some(index => index.unique && index.fields?.some(field => field.attribute === 'sku'))) await qi.addIndex('products', ['sku'], { unique: true, name: 'products_sku_unique' });
  }
  await sequelize.sync();
  if (await Producto.count() === 0) await Producto.bulkCreate([
    { sku: 'ARR-001', nombre: 'Arroz integral 1 kg', categoria: 'Granos', precio: 1.85, stockActual: 42 },
    { sku: 'LEC-001', nombre: 'Leche entera 1 lt', categoria: 'Lácteos', precio: 1.1, stockActual: 4, unidad: 'lt' },
    { sku: 'BAN-001', nombre: 'Banano', categoria: 'Frutas', precio: 0.65, stockActual: 125, unidad: 'kg' },
    { sku: 'ACE-001', nombre: 'Aceite vegetal 1 lt', categoria: 'Despensa', precio: 2.9, stockActual: 0 },
    { sku: 'PAN-001', nombre: 'Pan integral', categoria: 'Panadería', precio: 1.75, stockActual: 2 },
    { sku: 'LEN-001', nombre: 'Lenteja 500 g', categoria: 'Granos', precio: 1.25, stockActual: 30 },
  ]);
  startServer(app, 3000, 'SCI-03 Inventario', () => sequelize.close());
}
void start().catch(error => { console.error(error); process.exit(1); });
