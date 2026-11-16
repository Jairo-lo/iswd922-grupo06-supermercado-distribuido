# Estado de verificación del incremento

Corte técnico local del 15/11/2026, zona America/Guayaquil. Reporte consolidado generado en 2026-11-15T21:25:14.624Z (UTC). Rama de trabajo: `codex/iswd922-supermercado`. La publicación se realiza en esa rama; no implica merge a main ni aprobación formal de la entrega.

La implementación supera 26 de 26 casos automatizados: 20 de API/integración y 6 de navegador. Se comprobaron los cuatro paquetes PT-01 a PT-04. Esto acredita comportamiento técnico en el entorno local y queda pendiente de aceptación y revisión cruzada del equipo.

| Verificación | Resultado | Evidencia |
| --- | --- | --- |
| Compilación TypeScript y build de los cuatro workspaces | PASS | `npm run verify`, código de salida 0 |
| Lint del panel React | PASS | `npm run verify`, código de salida 0 |
| Inventario y migración | PASS, 7 casos | [acceptance-results.json](evidencias/acceptance-results.json) |
| Pedidos, rechazos, concurrencia y recuperación | PASS, 8 casos | [acceptance-results.json](evidencias/acceptance-results.json) |
| Gateway, roles, trazas y salud | PASS, 5 casos | [acceptance-results.json](evidencias/acceptance-results.json) |
| Panel de escritorio/móvil y reintento sin duplicado | PASS, 6 casos | [ui-acceptance.json](evidencias/ui-acceptance.json) |
| Arranque de las cuatro aplicaciones con bases locales | PASS; siete productos heredados conservados | [local-smoke.json](evidencias/local-smoke.json) |
| npm audit | 0 vulnerabilidades reportadas en el corte | [npm-audit.json](evidencias/npm-audit.json) |
| Lock consistente con instalación reproducible | PASS en `npm ci --dry-run --ignore-scripts` | [configuration-checks.json](evidencias/configuration-checks.json) |
| Compose y workflow CI | Sintaxis YAML, rutas y dependencias válidas | [configuration-checks.json](evidencias/configuration-checks.json) |
| Construcción/arranque de contenedores Docker | PASS; cuatro contenedores healthy, diez comprobaciones y persistencia tras reinicio | [docker-functional.json](evidencias/docker-functional.json) y [contenedores](evidencias/docker-containers.jsonl) |
| Colección Postman | 17 solicitudes y cuerpos/variables revisados; no ejecutada en la aplicación Postman | [Colección](../tests/postman/GRUPO06_Supermercado_SQA_Collection.json) |
| Anexos originales | Sin modificación, cuatro hashes verificados | [fuentes-sha256.json](evidencias/fuentes-sha256.json) |

## Métricas del corte

MET-CAL-01 técnico: 100%, cuatro criterios por paquete superados de cuatro evaluados. Los 26 casos sustentan estos cuatro criterios. PT-04 tiene recorridos automatizados; su aceptación humana queda pendiente. El [consolidado](evidencias/verificacion-consolidada.json) vincula ambos reportes con la misma huella de código.

MET-CAL-02 global: N/D. El registro local no ha sido conciliado con todos los Issues y no se ha marcado completo. Se informan cero casos fallidos en esta ejecución y cero defectos graves registrados localmente; ninguno de esos datos acredita cero defectos graves abiertos en todo el proyecto.

MET-PROJ-01, MET-PROJ-02, MET-PROC-01 y MET-PROC-02: no se generan nuevos valores, al faltar compromisos, horas y revisiones humanas de este corte. Los valores M1/M2 permanecen en los anexos originales sin modificación.

## Alcance de las pruebas

Se verificaron creación, validación, unicidad, edición, reposición idempotente, descuentos concurrentes, pedidos confirmados/rechazados/inexistentes, filtros, reintentos, persistencia tras reinicios, caída de inventario y recuperación de una respuesta perdida sin duplicar stock. La migración conservó un registro de prueba heredado y se volvió a ejecutar sin duplicados. El arranque local conservó además los siete productos reales del checkout y sus valores originales de nombre, precio, stock y categoría.

En navegador se verificaron el resumen y sus llamadas exclusivas al Gateway, creación/edición/reposición, pedidos y filtros, bloqueo de seguridad, modo auditor, navegación móvil sin desbordamiento de página y un reintento después de que el servidor procesara el pedido y el navegador perdiera la respuesta. Las capturas [escritorio](evidencias/panel-escritorio.png) y [móvil](evidencias/panel-movil.png) se inspeccionaron visualmente.

Los procesos de prueba y de arranque local se detuvieron al finalizar. Las bases de ensayo y logs están en `.test-runs/`, fuera de Git. La evidencia de cada ejecución de API se conserva también junto a sus logs; el informe de `docs/evidencias` corresponde al corte más reciente.

## Pendientes de autorización y entorno

El equipo debe completar revisión cruzada, conciliación de defectos, FCA/PCA formal y decisión de línea base. No se han inventado aprobaciones, firmas, horas, tiempos de ciclo ni aceptación del patrocinador o usuario de referencia. La construcción y ejecución Docker ya se comprobaron localmente; el resultado remoto se consulta en GitHub Actions.

Los roles declarados en cabeceras son un control de demostración académica. El entorno local queda limitado a localhost. Los indicadores ODS reflejan operaciones y alertas, sin afirmar impacto ambiental medido ni detección anticipada acreditada.

## Validación Docker posterior

Docker Desktop 4.99.0 y motor Linux 29.9.3 disponibles sobre WSL 2, Compose 5.7.0. Se comprobó la disponibilidad de credenciales de Docker Hub y la descarga autenticada de imágenes. No se guardan contraseñas ni tokens en el repositorio.

El primer arranque detectó que SQLite 6 necesita GLIBC_2.38 y la imagen bookworm no la proveía. Los cuatro Dockerfiles usan ahora node:22-trixie-slim, compatible con el módulo nativo. Se reconstruyeron y arrancaron las cuatro imágenes.

Pasaron diez comprobaciones sobre los contenedores: salud, Nginx, creación/edición de productos, reposición, pedido viable, rechazo sin descuento, roles y trazas, indicadores, navegador sobre el panel compilado y persistencia después de reiniciar inventario/pedidos. Los contenedores quedan en ejecución. Docker usa sus propios volúmenes; contiene la semilla y un producto/pedidos identificados como prueba Docker. Las bases locales no se alteraron en esta validación.

Las capturas nuevas de Playwright se guardan en carpetas por ejecución para evitar sobrescribir archivos que puedan estar abiertos en Windows. El reporte ui-acceptance.json identifica su ubicación.
