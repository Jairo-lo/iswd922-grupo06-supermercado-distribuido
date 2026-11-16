# Matriz de trazabilidad de requisitos

Los identificadores RF son referencias locales del incremento, pendientes de conciliación con la matriz aprobada por el equipo. Cada caso CA se ejecuta en la batería de integración o de navegador; los escenarios de navegador no reemplazan la aceptación humana de PT-04.

| Necesidad de negocio | Requisito | Paquete | SCI | Endpoint o componente | Verificación | R ejecutor y revisor |
| --- | --- | --- | --- | --- | --- | --- |
| Catálogo consistente | RF-01 CRUD, SKU único y validación de datos | PT-01 | SCI-03 | /api/productos y /:id | CA01-02 a CA01-04; CA01-07 migración | Anael; Harryson QA |
| ODS 12.3 detectar faltantes/excedentes | RF-02 Estados y umbrales, semilla en base vacía | PT-01 | SCI-03 | listado, resumenAlertas | CA01-01; CA04-01 | Anael; Harryson |
| Evitar existencias negativas | RF-03 Reposición y descuento atómico e idempotente | PT-01 | SCI-03 | /:id/descontar-stock y reponer-stock | CA01-05, CA01-06 | Anael; Jairo integración |
| ODS 12 pedidos contra disponibilidad | RF-04 Confirmar y persistir pedido viable | PT-02 | SCI-04 | POST /api/pedidos | CA02-01, CA02-05, CA02-06 | Anael; Harryson |
| Trazabilidad de intentos no viables | RF-05 Rechazar sin stock o producto inexistente | PT-02 | SCI-04 | POST/GET /api/pedidos | CA02-02 a CA02-04 | Anael; Harryson |
| Conservar registros ante interrupciones | RF-06 Persistencia y reconciliación sin doble descuento | PT-02 | SCI-04/03 | reserva por operacionId; recuperación al reinicio | CA02-07, CA02-08, CA03-05 | Anael y Jairo; Harryson |
| Integrar servicios sin llamadas directas de la UI | RF-07 Gateway y compatibilidad heredada | PT-03 | SCI-02 | /api/productos, /api/pedidos, alias ingleses | CA03-01, CA03-04, CA04-01 | Jairo con Anael; Harryson |
| Control de acceso y auditoría | RF-08 Roles, X-Trace-ID y últimas 50 operaciones | PT-03 | SCI-02 | middleware, /api/gateway/trazabilidad | CA03-02, CA03-03, CA02-01, CA04-04 | Jairo; Harryson |
| ODS 12 y ODS 8 seguimiento de operación | RF-09 Indicadores calculados y salud distribuida | PT-03 | SCI-02/04 | /health, /api/dashboard/resumen, indicadores-ods | CA03-01, CA03-05, CA04-01 | Jairo con Anael; Harryson |
| Gestión unificada | RF-10 Crear, editar, reponer y consultar existencias | PT-04 | SCI-01 | sección Inventario | CA04-02 | Anael; Harryson |
| Dictamen visible y registro histórico | RF-11 Pedidos viables/no viables y filtros | PT-04 | SCI-01 | sección Pedidos | CA04-03, CA04-06 reintento | Anael; Harryson |
| Auditoría y acceso móvil | RF-12 Roles, prueba de bloqueo y diseño adaptable | PT-04 | SCI-01 | Trazabilidad, barra de rol, navegación | CA04-04, CA04-05 | Anael; Jairo y Harryson |

Marcelo Torres conserva A en el control interno de compromisos y la decisión de entrega. La revisión debe provenir de un integrante distinto del autor real de cada cambio. Las pruebas identifican a los responsables previstos; no acreditan que esas personas hayan ejecutado o aprobado esta revisión.
