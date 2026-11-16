export type Role = 'ADMIN' | 'OPERADOR' | 'AUDITOR_SQA';
export interface Producto {
  id: number; sku: string; nombre: string; categoria: string; precio: number; stockActual: number;
  stockMinimo: number; stockMaximo: number; unidad: string; estadoInventario: string;
}
export type ProductoInput = Omit<Producto, 'id' | 'estadoInventario'>;
export interface Pedido {
  id: number; clienteNombre: string; productoId: number; productoNombre: string; cantidadSolicitada: number;
  precioUnitario: number; total: number; esViable: boolean; estado: string; motivoResolucion: string;
  tiempoProcesamientoMs: number; traceId: string; createdAt: string;
}
export interface Summary {
  inventario: { totalProductos: number; stockTotal: number; agotados: number; faltantes: number; excedentes: number };
  pedidos: { totalPedidosProcesados: number; pedidosViablesConfirmados: number; pedidosNoViablesRechazados: number; erroresIntegracion: number; porcentajePedidosValidadosContraExistencias: number | null; tasaViabilidadPorcentaje: number | null; tiempoPromedioRegistroMs: number | null };
  timestamp: string;
}
export interface Health { status: string; gatewayStatus: string; servicios: { sci: string; status: string }[] }
export interface Trace { traceId: string; metodo: string; ruta: string; rol: string; codigoEstado: number; latenciaMs: number; timestamp: string }
export class ApiError extends Error {
  status: number;
  traceId: string | null;
  constructor(status: number, message: string, traceId: string | null) {
    super(message);
    this.status = status;
    this.traceId = traceId;
  }
}
const base = (import.meta.env.VITE_API_GATEWAY_URL ?? 'http://localhost:4000').replace(/\/$/, '');
export async function request<T>(path: string, role: Role | 'INVITADO_SIN_PERMISO', method = 'GET', body?: unknown, key?: string, acceptUnavailable = false): Promise<T> {
  const result = await fetch(base + path, {
    method, headers: { 'X-Operador-Rol': role, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(key ? { 'X-Idempotency-Key': key } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000),
  });
  const data = await result.json();
  if (!result.ok && !acceptUnavailable) throw new ApiError(result.status, String(data.mensaje ?? data.motivoResolucion ?? 'No se pudo completar la operación'), result.headers.get('X-Trace-ID'));
  return data as T;
}
