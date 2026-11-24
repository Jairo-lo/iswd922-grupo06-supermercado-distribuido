# Configuración y líneas base

| SCI | Ruta controlada | Paquete | Responsable SCM |
| --- | --- | --- | --- |
| SCI-01 | services/sci-01-panel-admin | PT-04 | Jairo Quispe |
| SCI-02 | services/sci-02-api-gateway | PT-03 | Jairo Quispe |
| SCI-03 | services/sci-03-inventario | PT-01 | Jairo Quispe |
| SCI-04 | services/sci-04-pedidos | PT-02 | Jairo Quispe |

Se versionan código, configuración, archivo lock raíz, contratos, casos y evidencias. No se versionan node_modules, dist, bases activas, secretos ni respaldos locales. Las tablas heredadas se conservan; la migración de inventario añade columnas y SKU sin usar sync alter/force ni eliminar registros. La tabla nueva de pedidos importa registros heredados sin acreditar validación histórica.

## Contratos controlados

El contrato público está descrito en README y en la colección Postman. La versión de referencia 1.0 usa rutas españolas y mantiene alias ingleses. Cambiar nombres, tipos, códigos HTTP, semántica de null, estados de pedido, reglas de stock o propagación de X-Trace-ID requiere evaluación de impacto. Los errores de negocio de pedidos se persisten y devuelven 200; los de integración devuelven 503 y permanecen pendientes de reconciliación. La idempotencia opera mediante un registro de reserva transaccional y una clave única del pedido.

Las reservas confirmadas y los intentos pendientes deben conservarse junto a sus bases. Respaldar ambas bases coordinadamente antes de una migración; no restaurar inventario y pedidos desde cortes incompatibles. SQLite y la bitácora en memoria corresponden a una instancia por servicio del entorno académico.

## Líneas base propuestas

| Línea base | Contenido | Evidencia de aprobación requerida |
| --- | --- | --- |
| LB-01 Requisitos aprobados | Charter, exclusiones, RTM y criterios | Acta o revisión del equipo y responsable QA |
| LB-02 Interfaces acordadas | Endpoints, JSON, roles, reservas y Compose | Revisión cruzada de contratos por SCM |
| LB-03 Producto candidato | SHA de código, lock, resultados FCA/PCA y defectos | Revisión independiente y autorización interna |

Estas líneas base son propuestas de control; este incremento no las marca aprobadas ni crea tags o releases. Las ramas de trabajo utilizan nombres funcionales, como `feature/iswd922-supermercado`, sin referencias a herramientas de autoría. La rama principal es `main`. El producto técnico `5b2b164c2336c8f5b0fc99bb3123f57c706018f2` está integrado por avance rápido en main; su publicación no acredita aprobación formal de línea base.

## Comité de control de cambios

SCCB: Marcelo Torres, Jairo Quispe, Harryson Montesdeoca y Anael Molina. Registrar una SCR antes de modificar alcance o interfaces de una línea base aprobada. Evaluar alcance, esfuerzo restante frente a 22 h/semana, cronograma, requisitos afectados y riesgo. El scope matching retira o reprograma trabajo con decisión registrada; no incorpora pagos, facturación fiscal ni reparto.

Marcelo coordina la decisión interna; Jairo analiza contratos y configuración; Harryson verifica trazabilidad y calidad; Anael estima y aplica el cambio. No permitir autoaprobación. La plantilla de PR recoge fechas y observaciones para las métricas de proceso. Registrar en el acta quién decide y la evidencia de revisión antes de autorizar una entrega.
