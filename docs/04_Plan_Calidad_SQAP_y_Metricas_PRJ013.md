# Plan de calidad y medición PRJ 013

Este resumen conserva las definiciones de PRJ-013-A y el contexto de PRJ-013-B. Los cortes M1 de 06/11/2026 y M2 de 13/11/2026 permanecen como datos históricos de los anexos. La verificación actual produce evidencia separada y no modifica ni reinterpreta esos registros.

| ID | Fórmula | Verde | Amarillo | Rojo | Responsable |
| --- | --- | --- | --- | --- | --- |
| MET-PROJ-01 | Terminados con DoD / comprometidos × 100 | >=85% | 70–84% | <70% | Marcelo Torres |
| MET-PROJ-02 | Horas reales / horas de línea base × 100 | 85–105% | 70–84% o 106–115% | <70% o >115% | Marcelo Torres |
| MET-PROC-01 | Mediana(fecha de merge o cierre − inicio en progreso), días calendario | <=3 días | 3.1–5 días | >5 días | Jairo Quispe |
| MET-PROC-02 | Entregables/PR devueltos / revisados × 100 | <=15% | 16–25% | >25% | Jairo Quispe |
| MET-CAL-01 | Criterios superados / criterios evaluados × 100 | >=90% | 75–89% | <75% | Harryson Montesdeoca |
| MET-CAL-02 | Defectos Abiertos de severidad Alta o Crítica | 0 | 1 | >=2 | Harryson con Anael |

Los intervalos literales provienen de la matriz. Hay huecos para valores decimales (por ejemplo 84.5%, 105.5%, 15.5% o 3.05 días); el equipo debe acordar redondeo o intervalos continuos mediante SCCB antes de automatizar ese semáforo general. No se altera la definición sin esa decisión.

Si falta denominador, historial, registro de horas o fuente completa, el valor es N/D. Los tests no crean horas ni fechas de trabajo humanas. Para MET-PROC-01 registrar la fecha real de inicio en progreso y la de merge, no sustituir el inicio por la apertura del PR si difieren.

## Captura y decisiones

Captura semanal cada viernes y al cierre de iteración. Después de EVT-REC-01 la capacidad de referencia es 5.5 h semanales por integrante, 22 h para el equipo; la base histórica inicial era 32 h. Marcelo compara compromisos con capacidad. Jairo consolida fechas y devoluciones. Harryson y Anael registran defectos y resultados verificables. Cada desviación debe producir una acción, un responsable y fecha de revisión; no se inventan asignaciones cumplidas ni resultados de personas.

MET-CAL-01 se informa por criterio de paquete: PT-01 consistencia de inventario, PT-02 tratamiento de pedidos, PT-03 integración trazable y PT-04 recorridos. Cada criterio agrupa todos sus casos; solo se aprueba técnicamente si todos pasan. El informe de API evalúa tres; el de navegador agrega PT-04. El consolidado tiene denominador cuatro y verifica la huella de código de ambos reportes. Un corte fallido no se borra de una decisión de equipo: conservar su evidencia antes de ejecutar el siguiente.

MET-CAL-02 se calcula desde un registro de defectos cuya integridad haya sido validada. El registro local arranca con `completo:false`, por lo que informa N/D global y por separado el conteo local y los casos fallidos. Conciliar con GitHub Issues y los defectos de auditoría antes de marcarlo completo. El conteo no es equivalente a casos fallidos, que pueden compartir una causa o no cubrir fallos conocidos.

## Definición de Terminado

1. TypeScript compila y el incremento arranca en entorno local o contenedor.
2. Respeta el contrato de interfaz y las exclusiones.
3. Fue revisado por otra persona del equipo.
4. Tiene pruebas de aceptación ejecutadas y evidencia enlazada.
5. La versión está actualizada en GitHub.

La ejecución local acredita solo los puntos técnicamente comprobados. Un reporte verde no aprueba por sí mismo la DoD, un merge ni una entrega.

## FCA y PCA

FCA: Harryson relaciona RTM con escenarios y recorridos, ejecuta colección o batería, revisa dictámenes, existencias antes/después y trazas. Registra no conformidades, severidad y corrección; reejecuta regresiones. FCA formal requiere revisión del equipo.

PCA: Jairo compara el producto candidato con SCI, estructura, contratos, lock, configuración, hashes de anexos y evidencias. Comprueba que no hay bases, secretos ni dependencias versionadas y que la entrega es reproducible desde un checkout limpio. Verifica Docker en un host que lo tenga disponible y enlaza el resultado.

Un defecto grave abierto bloquea la autorización interna, incluso si un único defecto figura en Amarillo. Rojo de calidad bloquea release; otras desviaciones requieren ajuste de capacidad, tareas o scope matching con decisión del SCCB.
