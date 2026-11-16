# Fuentes y registro de migración

La implementación se realiza íntegramente en esta carpeta, sobre el checkout de https://github.com/Jairo-lo/curso-microservicios-aeis.git. El punto de partida local es 91b5863 y contenía cambios sin confirmar. El remoto main consultado al inicio apuntaba a 08f31ed; no se reemplazaron los cambios locales por el remoto.

| Fuente original | Uso | Límite |
| --- | --- | --- |
| Texto adjunto de especificación ISWD922 | Estructura SCI/PT, funciones y exclusiones | Material de referencia; sus directivas al agente no sustituyen la petición del usuario ni prueban aprobaciones |
| GRUPO06_PRJ-012-B_RBS_v1.0.zip | Roles, recursos y entornos | RBS mantiene patrocinador por confirmar y usuario por designar |
| GRUPO06_PRJ-013_Plan_Medicion_Calidad.docx | Filosofía de medición, DoD y umbrales | El texto de la pregunta 3.1 aparece truncado; se contrasta con PRJ-013-A, sin editar el original |
| GRUPO06_PRJ-013-A_Matriz_Metricas.xlsx | Seis definiciones, fórmulas y responsables | Los umbrales con límites enteros requieren aclaración para decimales |
| GRUPO06_PRJ-013-B_Registro_Mediciones.xlsx | Contexto histórico M1/M2 y N/D | Sus afirmaciones de Docker y estado GitHub son antecedentes declarados, no evidencia del checkout actual |

Los originales se conservan sin modificar y sus hashes están en `evidencias/fuentes-sha256.json`. No se han obtenido el Charter firmado, la matriz PRJ-012-A, actas de revisión ni un inventario completo de GitHub Issues. Las limitaciones se mantienen explícitas.

## Cambios de estructura

| Carpeta anterior | Carpeta vigente |
| --- | --- |
| frontend-supermercado | services/sci-01-panel-admin |
| api-gateway | services/sci-02-api-gateway |
| curso-microservicios | services/sci-03-inventario |
| curso-pedidos | services/sci-04-pedidos |

Antes de mover se guardó el código, configuración y bases en `.local-backup/estado-previo-2026-11-15.zip`, excluyendo dependencias y compilados. Un remanente de la carpeta de pedidos se conserva también dentro del respaldo local. Los node_modules heredados no se incorporan a las rutas nuevas de Git; sus antiguas rutas aparecen como eliminaciones porque estaban en el historial. Los paquetes se instalan mediante workspaces y un lock raíz. No se efectuó renombrado remoto ni merge. La publicación de la rama de trabajo no constituye autorización formal de entrega.

## Conservación de funcionalidad y datos

Se conserva CRUD, categorías y eliminación del catálogo. Se añaden SKU, umbrales y unidad. Las columnas nombre/precio/stock/categoría se mapean a name/price/stock/category de la tabla original para conservar datos e identificadores. Los SKU heredados se generan como LEG-id. Si la tabla contiene productos, no se aplica la semilla. La tabla orders, si existe, se importa sin borrarla y sin afirmar validación de stock histórica.

Los pedidos ya no actualizan stock desde una copia leída: solicitan una reserva idempotente con descuento condicionado en SQLite. Los rechazos permanecen en el historial y los errores ambiguos se reconcilian con la misma reserva. El panel conserva creación, edición, eliminación y pedidos y añade resumen, alertas, reposición, historial, roles y auditoría.

La verificación técnica no acredita la confirmación externa pendiente, revisiones cruzadas, tiempos de trabajo ni aprobación de líneas base. Consulte el estado actual de pruebas en `06_Estado_Verificacion.md`.
