import type { Application, ErrorRequestHandler, RequestHandler } from 'express';
import { randomUUID } from 'node:crypto';
import morgan from 'morgan';

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function positiveId(value: unknown): number {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new HttpError(400, 'ID inválido');
  return id;
}
export function positiveQuantity(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0 || value > 2_000_000_000) throw new HttpError(400, 'cantidad debe ser un entero positivo válido');
  return value;
}
export const trace: RequestHandler = (req, res, next) => {
  const supplied = req.get('X-Trace-ID');
  res.locals.traceId = supplied && /^[a-zA-Z0-9_-]{1,100}$/.test(supplied) ? supplied : randomUUID();
  res.setHeader('X-Trace-ID', res.locals.traceId as string);
  next();
};
morgan.token('trace', (_req, res) => String(res.getHeader('X-Trace-ID')));
export const requestLog = morgan(':method :url :status :response-time ms trace=:trace');
export const errors: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
  const err = error as { status?: number; name?: string; message?: string };
  const status = err.status ?? (err.name === 'SequelizeUniqueConstraintError' ? 409 : err.name === 'SequelizeValidationError' ? 400 : 500);
  if (status >= 500) console.error(error);
  res.status(status).json({ mensaje: status >= 500 ? 'Error interno del servicio' : err.message, traceId: res.locals.traceId });
};
let tail: Promise<unknown> = Promise.resolve();
export function serializeWrite<T>(work: () => Promise<T>): Promise<T> {
  const result = tail.then(work, work);
  tail = result.catch(() => undefined);
  return result;
}
export function startServer(app: Application, port: number, service: string, close = async () => {}) {
  const server = app.listen(Number(process.env.PORT ?? port), process.env.HOST ?? '127.0.0.1', () => console.log(service + ' listo'));
  server.on('error', error => { console.error(error); process.exit(1); });
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => server.close(() => { void close().finally(() => process.exit(0)); }));
  return server;
}
