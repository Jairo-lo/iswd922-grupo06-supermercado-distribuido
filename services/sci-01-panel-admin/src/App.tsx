import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { ApiError, request, type Health, type Pedido, type Producto, type ProductoInput, type Role, type Summary, type Trace } from './services/api';

type Tab = 'resumen' | 'inventario' | 'pedidos' | 'trazabilidad';
const tabs: { id: Tab; title: string; detail: string }[] = [
  { id: 'resumen', title: 'Resumen ejecutivo', detail: 'ODS 12 y ODS 8' },
  { id: 'inventario', title: 'Inventario', detail: 'PT-01 · SCI-03' },
  { id: 'pedidos', title: 'Pedidos', detail: 'PT-02 · SCI-04' },
  { id: 'trazabilidad', title: 'Trazabilidad', detail: 'PT-03 · SCI-02' },
];
const emptyProduct: ProductoInput = { sku: '', nombre: '', categoria: '', precio: 1, stockActual: 0, stockMinimo: 5, stockMaximo: 100, unidad: 'unid' };
const money = (value: number) => new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' }).format(value);
const number = (value: number | null | undefined, suffix = '') => value == null ? 'N/D' : value.toLocaleString('es-EC', { maximumFractionDigits: 1 }) + suffix;
const labels: Record<string, string> = { OPTIMO: 'Óptimo', AGOTADO: 'Agotado', CRITICO_FALTANTE: 'Faltante crítico', EXCEDENTE_RIESGO_MERMA: 'Excedente' };
function App() {
  const [tab, setTab] = useState<Tab>('resumen');
  const [role, setRole] = useState<Role>('ADMIN');
  const roleRef = useRef(role);
  const pendingOrder = useRef<{ signature: string; key: string } | null>(null);
  const [products, setProducts] = useState<Producto[]>([]);
  const [orders, setOrders] = useState<Pedido[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [traces, setTraces] = useState<Trace[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(null);
  const [form, setForm] = useState<ProductoInput>({ ...emptyProduct });
  const [editing, setEditing] = useState<number | null>(null);
  const [stockEdit, setStockEdit] = useState<{ id: number; nombre: string; cantidad: number } | null>(null);
  const [orderForm, setOrderForm] = useState({ clienteNombre: '', productoId: 0, cantidadSolicitada: 1 });
  const [lastOrder, setLastOrder] = useState<Pedido | null>(null);
  const [filter, setFilter] = useState('');
  const [updated, setUpdated] = useState('');
  const canWrite = role !== 'AUDITOR_SQA';
  const refresh = useCallback(async () => {
    const currentRole = roleRef.current;
    const results = await Promise.allSettled([
      request<{ productos: Producto[] }>('/api/productos', currentRole),
      request<Pedido[]>('/api/pedidos', currentRole),
      request<Summary>('/api/dashboard/resumen', currentRole),
      request<Health>('/health', currentRole, 'GET', undefined, undefined, true),
      request<Trace[]>('/api/gateway/trazabilidad', currentRole),
    ]);
    if (currentRole !== roleRef.current) return;
    if (results[0].status === 'fulfilled') setProducts(results[0].value.productos);
    if (results[1].status === 'fulfilled') setOrders(results[1].value);
    if (results[2].status === 'fulfilled') setSummary(results[2].value);
    if (results[3].status === 'fulfilled') setHealth(results[3].value); else setHealth(null);
    if (results[4].status === 'fulfilled') setTraces(results[4].value);
    if (results.some(r => r.status === 'rejected')) setNotice({ error: true, text: 'No se pudieron actualizar todos los datos. Comprueba los servicios; los datos anteriores pueden estar desactualizados.' });
    else setUpdated(new Date().toLocaleTimeString('es-EC'));
    setLoading(false);
  }, []);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => { void refresh(); }, 15000);
    return () => clearInterval(timer);
  }, [refresh]);
  async function run(action: () => Promise<void>) {
    setBusy(true); setNotice(null);
    try { await action(); }
    catch (error) { setNotice({ error: true, text: error instanceof ApiError ? error.message + (error.traceId ? ' · Traza ' + error.traceId : '') : 'No se pudo completar la operación con el gateway' }); }
    finally { setBusy(false); await refresh(); }
  }
  function saveProduct(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      await request('/api/productos' + (editing ? '/' + editing : ''), role, editing ? 'PUT' : 'POST', form);
      setNotice({ error: false, text: editing ? 'Producto actualizado correctamente' : 'Producto creado correctamente' });
      setForm({ ...emptyProduct }); setEditing(null);
    });
  }
  function editProduct(p: Producto) {
    setEditing(p.id);
    setForm({ sku: p.sku, nombre: p.nombre, categoria: p.categoria, precio: p.precio, stockActual: p.stockActual, stockMinimo: p.stockMinimo, stockMaximo: p.stockMaximo, unidad: p.unidad });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function saveOrder(event: FormEvent) {
    event.preventDefault();
    const signature = JSON.stringify(orderForm);
    if (pendingOrder.current?.signature !== signature) pendingOrder.current = { signature, key: crypto.randomUUID() };
    const key = pendingOrder.current.key;
    setLastOrder(null);
    void run(async () => {
      const order = await request<Pedido>('/api/pedidos', role, 'POST', orderForm, key);
      pendingOrder.current = null;
      setLastOrder(order);
      setNotice({ error: !order.esViable, text: 'Pedido #' + order.id + ' · ' + order.estado + ': ' + order.motivoResolucion });
    });
  }
  const visibleOrders = orders.filter(order => !filter || order.estado === filter);
  const active = tabs.find(item => item.id === tab)!;
  return <div className="super-app">
    <header className="topbar">
      <div className="brand"><span className="brand-mark" aria-hidden="true">S</span><div><strong>Supermercado</strong><small>Sistema distribuido · Grupo 06</small></div></div>
      <div className="topbar-actions"><span className={'connection ' + (health?.status === 'UP' ? 'up' : 'down')}>{health?.status === 'UP' ? 'Servicios conectados' : 'Revisar conexión'}</span>
        <label className="role-label">Rol de operador<select aria-label="Rol de operador" value={role} onChange={event => { const value = event.target.value as Role; roleRef.current = value; setRole(value); void refresh(); }}><option value="ADMIN">Administrador</option><option value="OPERADOR">Operador</option><option value="AUDITOR_SQA">Auditor SQA</option></select></label>
      </div>
    </header>
    <aside className="sidebar"><p className="nav-label">ADMINISTRACIÓN</p><nav aria-label="Navegación principal">{tabs.map(item => <button key={item.id} className={'nav-item ' + (tab === item.id ? 'selected' : '')} aria-current={tab === item.id ? 'page' : undefined} onClick={() => setTab(item.id)}><span>{item.title}</span><small>{item.detail}</small></button>)}</nav><div className="sidebar-footer">Producción y consumo responsables<br /><strong>ODS 12 · Meta 12.3</strong></div></aside>
    <main className="workspace">
      <div className="page-heading"><div><p className="eyebrow">{active.detail}</p><h1>{active.title}</h1><p>{tab === 'resumen' ? 'Disponibilidad, operaciones y alertas para decidir a tiempo.' : tab === 'inventario' ? 'Gestiona el catálogo y conserva las existencias actualizadas.' : tab === 'pedidos' ? 'Cada solicitud se valida contra el inventario disponible.' : 'Consulta operaciones y comprueba las reglas de acceso.'}</p></div><button className="button secondary" disabled={busy} onClick={() => { void refresh(); }}>Actualizar</button></div>
      {notice && <div className={'notice ' + (notice.error ? 'notice-error' : 'notice-success')} role="alert"><span>{notice.text}</span><button aria-label="Cerrar aviso" onClick={() => setNotice(null)}>×</button></div>}
      {loading && <p role="status">Cargando información del supermercado…</p>}
      {!canWrite && <p className="readonly">Modo de auditoría: consulta de información. Las modificaciones requieren un rol de operación.</p>}
      {tab === 'resumen' && <>
        <section className="metrics" aria-label="Indicadores operativos">
          {[['Productos', summary?.inventario.totalProductos], ['Existencias totales', summary?.inventario.stockTotal], ['Faltantes y agotados', summary ? summary.inventario.faltantes + summary.inventario.agotados : null], ['Excedentes detectados', summary?.inventario.excedentes]].map(([label, value]) => <article className="metric" key={String(label)}><p>{label}</p><strong>{number(value as number | null)}</strong><small>Inventario actualizado</small></article>)}
        </section>
        <div className="two-columns"><section className="panel"><div className="panel-heading"><h2>Pedidos y disponibilidad</h2><span className="tag">ODS 12</span></div><dl className="indicators">{[
          ['Pedidos validados contra existencias', number(summary?.pedidos.porcentajePedidosValidadosContraExistencias, '%')],
          ['Pedidos confirmados', number(summary?.pedidos.pedidosViablesConfirmados)],
          ['Solicitudes rechazadas', number(summary?.pedidos.pedidosNoViablesRechazados)],
          ['Errores de integración', number(summary?.pedidos.erroresIntegracion)],
          ['Tiempo promedio de registro y validación', number(summary?.pedidos.tiempoPromedioRegistroMs, ' ms')],
        ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><p className="support">ODS 8 · Meta 8.2. El tiempo corresponde al procesamiento del pedido. N/D indica que aún no hay operaciones.</p></section>
        <section className="panel"><div className="panel-heading"><h2>Estado de los servicios</h2><span className="tag">En vivo</span></div>{[{ sci: 'SCI-02', nombre: 'API Gateway', status: health?.gatewayStatus ?? 'DOWN' }, ...(health?.servicios ?? [{ sci: 'SCI-03', status: 'DOWN' }, { sci: 'SCI-04', status: 'DOWN' }]).map(s => ({ ...s, nombre: s.sci === 'SCI-03' ? 'Inventario' : 'Pedidos' }))].map(s => <div className="service-row" key={s.sci}><div><strong>{s.nombre}</strong><small>{s.sci}</small></div><span className={'status-pill ' + (s.status === 'UP' ? 'OPTIMO' : 'AGOTADO')}>{s.status === 'UP' ? 'Disponible' : 'Sin conexión'}</span></div>)}<p className="support">Actualización cada 15 segundos. Última actualización completa: {updated || 'pendiente'}.</p></section></div>
        <section className="panel"><div className="panel-heading"><h2>Alertas para revisión</h2><span className="tag">Meta 12.3</span></div><p className="support">Los umbrales identifican faltantes y excedentes. El sistema no mide por sí solo una reducción real del desperdicio.</p><div className="alerts-list">{products.filter(p => p.estadoInventario !== 'OPTIMO').map(p => <div className="alert-product" key={p.id}><div><strong>{p.nombre}</strong><small>{p.sku} · {p.stockActual} {p.unidad}</small></div><span className={'status-pill ' + p.estadoInventario}>{labels[p.estadoInventario]}</span></div>)}{products.every(p => p.estadoInventario === 'OPTIMO') && <p>Sin alertas de inventario.</p>}</div></section>
      </>}
      {tab === 'inventario' && <>
        <section className="panel"><div className="panel-heading"><h2>{editing ? 'Editar producto' : 'Nuevo producto'}</h2><span className="tag">Catálogo</span></div><form onSubmit={saveProduct}><fieldset disabled={busy || !canWrite} className="form-fields">
          {(['sku', 'nombre', 'categoria', 'unidad'] as const).map(key => <label key={key}>{({ sku: 'SKU', nombre: 'Nombre', categoria: 'Categoría', unidad: 'Unidad' })[key]}<input required maxLength={255} name={key} value={form[key]} onChange={event => setForm({ ...form, [key]: event.target.value })} /></label>)}
          {(['precio', 'stockActual', 'stockMinimo', 'stockMaximo'] as const).map(key => <label key={key}>{({ precio: 'Precio USD', stockActual: 'Existencias', stockMinimo: 'Stock mínimo', stockMaximo: 'Stock máximo' })[key]}<input required type="number" name={key} min={key === 'precio' ? '0.01' : '0'} step={key === 'precio' ? '0.01' : '1'} value={form[key]} onChange={event => setForm({ ...form, [key]: Number(event.target.value) })} /></label>)}
        </fieldset><div className="form-actions"><button className="button" disabled={busy || !canWrite} type="submit">{busy ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear producto'}</button>{editing && <button className="button secondary" type="button" onClick={() => { setEditing(null); setForm({ ...emptyProduct }); }}>Cancelar edición</button>}</div></form></section>
        {stockEdit && <section className="panel" aria-label="Reposición de existencias"><h2>Reponer {stockEdit.nombre}</h2><form className="inline-form" onSubmit={event => { event.preventDefault(); void run(async () => { await request('/api/productos/' + stockEdit.id + '/reponer-stock', role, 'PATCH', { cantidad: stockEdit.cantidad }); setStockEdit(null); setNotice({ error: false, text: 'Existencias repuestas correctamente' }); }); }}><label>Cantidad a reponer<input type="number" min="1" step="1" required value={stockEdit.cantidad} onChange={event => setStockEdit({ ...stockEdit, cantidad: Number(event.target.value) })} /></label><button className="button" disabled={busy || !canWrite}>Confirmar reposición</button><button type="button" className="button secondary" onClick={() => setStockEdit(null)}>Cancelar</button></form></section>}
        <section className="panel"><div className="panel-heading"><h2>Productos y existencias</h2><span className="tag">{products.length} productos</span></div><div className="table-scroll"><table><thead><tr><th>SKU / Producto</th><th>Categoría</th><th>Precio</th><th>Stock</th><th>Mín. / Máx.</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{products.map(p => <tr key={p.id}><td><strong>{p.nombre}</strong><small>{p.sku}</small></td><td>{p.categoria}</td><td>{money(p.precio)}</td><td>{p.stockActual} {p.unidad}</td><td>{p.stockMinimo} / {p.stockMaximo}</td><td><span className={'status-pill ' + p.estadoInventario}>{labels[p.estadoInventario]}</span></td><td><div className="row-actions"><button disabled={busy || !canWrite} onClick={() => editProduct(p)} aria-label={'Editar ' + p.nombre}>Editar</button><button disabled={busy || !canWrite} onClick={() => setStockEdit({ id: p.id, nombre: p.nombre, cantidad: 1 })} aria-label={'Reponer ' + p.nombre}>Reponer</button><button className="danger-link" disabled={busy || !canWrite} onClick={() => { if (window.confirm('¿Eliminar ' + p.nombre + '? El historial de pedidos se conserva.')) void run(async () => { await request('/api/productos/' + p.id, role, 'DELETE'); setNotice({ error: false, text: 'Producto eliminado' }); }); }} aria-label={'Eliminar ' + p.nombre}>Eliminar</button></div></td></tr>)}</tbody></table></div>{!products.length && !loading && <p className="empty">No hay productos en el catálogo.</p>}</section>
      </>}
      {tab === 'pedidos' && <>
        <section className="panel"><div className="panel-heading"><h2>Registrar pedido</h2><span className="tag">Validación de disponibilidad</span></div><form onSubmit={saveOrder}><fieldset disabled={busy || !canWrite} className="order-fields"><label>Cliente<input required maxLength={255} value={orderForm.clienteNombre} onChange={event => setOrderForm({ ...orderForm, clienteNombre: event.target.value })} /></label><label>Producto<select aria-label="Producto" required value={orderForm.productoId || ''} onChange={event => setOrderForm({ ...orderForm, productoId: Number(event.target.value) })}><option value="">Selecciona un producto</option>{products.map(p => <option key={p.id} value={p.id}>{p.nombre} · {p.stockActual} {p.unidad} disponibles</option>)}</select></label><label>Cantidad solicitada<input type="number" required min="1" step="1" value={orderForm.cantidadSolicitada} onChange={event => setOrderForm({ ...orderForm, cantidadSolicitada: Number(event.target.value) })} /></label></fieldset><p className="support">Puedes solicitar más unidades que el stock disponible. Un pedido rechazado no altera el inventario.</p><button className="button" disabled={busy || !canWrite || !products.length}>{busy ? 'Validando…' : 'Validar y registrar pedido'}</button></form>{lastOrder && <div className={'order-result ' + (lastOrder.esViable ? 'notice-success' : 'notice-error')} role="status"><strong>Pedido #{lastOrder.id} · {lastOrder.estado}</strong><p>{lastOrder.motivoResolucion}</p><small>{lastOrder.tiempoProcesamientoMs} ms · Total {money(lastOrder.total)}</small></div>}</section>
        <section className="panel"><div className="panel-heading"><h2>Historial de pedidos</h2><label className="filter-label">Estado<select aria-label="Estado" value={filter} onChange={event => setFilter(event.target.value)}><option value="">Todos</option>{['CONFIRMADO', 'RECHAZADO_SIN_STOCK', 'RECHAZADO_PRODUCTO_INEXISTENTE', 'ERROR_INTEGRACION'].map(state => <option key={state}>{state}</option>)}</select></label></div><div className="table-scroll"><table><thead><tr><th>Pedido / Cliente</th><th>Producto</th><th>Cantidad</th><th>Total</th><th>Resolución</th><th>Tiempo</th></tr></thead><tbody>{visibleOrders.map(order => <tr key={order.id}><td><strong>#{order.id} · {order.clienteNombre}</strong><small>{new Date(order.createdAt).toLocaleString('es-EC')}</small></td><td>{order.productoNombre || 'Producto #' + order.productoId}</td><td>{order.cantidadSolicitada}</td><td>{money(order.total)}</td><td className="resolution"><span className={'status-pill ' + (order.esViable ? 'OPTIMO' : 'AGOTADO')}>{order.estado}</span><small>{order.motivoResolucion}</small></td><td>{order.tiempoProcesamientoMs} ms</td></tr>)}</tbody></table></div>{!visibleOrders.length && <p className="empty">No hay pedidos para este filtro.</p>}</section>
      </>}
      {tab === 'trazabilidad' && <>
        <section className="panel"><div className="panel-heading"><h2>Control de accesos</h2><span className="tag">Rol actual: {role}</span></div><p>Una solicitud con un rol no autorizado debe ser rechazada y quedar registrada en la bitácora.</p><button className="button secondary" disabled={busy} onClick={() => { void run(async () => { try { await request('/api/productos', 'INVITADO_SIN_PERMISO'); throw new Error('Se esperaba un rechazo'); } catch (error) { if (!(error instanceof ApiError) || error.status !== 403) throw error; setNotice({ error: false, text: 'Bloqueo comprobado: 403 Forbidden · Traza ' + error.traceId }); } }); }}>Probar bloqueo de seguridad</button></section>
        <section className="panel"><div className="panel-heading"><h2>Últimas operaciones</h2><span className="tag">Hasta 50 registros</span></div><div className="table-scroll"><table><thead><tr><th>Fecha / Traza</th><th>Método</th><th>Ruta</th><th>Rol</th><th>HTTP</th><th>Latencia</th></tr></thead><tbody>{traces.map((trace, index) => <tr key={trace.traceId + '-' + index}><td><small>{new Date(trace.timestamp).toLocaleTimeString('es-EC')}</small><code>{trace.traceId}</code></td><td>{trace.metodo}</td><td>{trace.ruta}</td><td>{trace.rol}</td><td><span className={'status-pill ' + (trace.codigoEstado < 400 ? 'OPTIMO' : 'AGOTADO')}>{trace.codigoEstado}</span></td><td>{trace.latenciaMs} ms</td></tr>)}</tbody></table></div></section>
      </>}
      <footer className="page-footer">Sistema Distribuido de Gestión de Supermercado · ISWD922 · Grupo 06</footer>
    </main>
  </div>;
}
export default App;
