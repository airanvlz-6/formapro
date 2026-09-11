# FORGE12: preservación de prescripciones pasadas no ejecutadas

## Causa exacta

La pérdida se origina en `loadWeeklyPlanningContext`, en `lib/planning/prepareAllowedWeeklyPlanContract.ts`, al construir `fixedSessions`.

El predicado `isProtectedCalendarSession` de `lib/planning/weeklyCalendar.ts` admitía sesiones completadas y estados REST/RECOVERY/UNAVAILABLE, pero no un TRAIN pasado con prescripción conocida y `completada=false`. Por eso lunes y martes sobrevivían; miércoles no. Al devolver false, la rama `else if (past)` creaba el objeto «Sin registrar» y descartaba el contenido planificado. No era un fallo de CAS ni del generation log.

Invariante defectuoso: un TRAIN no completado no era historia protegida, aunque ya hubiera sido prescrito en un día pasado. Se confundía ausencia de ejecución con ausencia de prescripción.

## Recorrido del dato

1. `beginWeeklyGeneration` lee `weekly_plan` y captura el plan completo con su revisión en `generation.snapshots`; firma ese contexto. El contenido de miércoles todavía está íntegro.
2. `loadWeeklyPlanningContext` recibe ese snapshot, calcula `past` respecto al inicio de la regeneración y decide `fixedSessions`. Aquí ocurría la degradación.
3. `buildAllowedWeeklyPlanContract` convierte los días conservados en opciones únicas `fixed`, con `protected=true`. Antes, miércoles era UNAVAILABLE con contenido sustituto; ahora es TRAIN con su contenido histórico original, sin convertirlo en un target nuevo.
4. `planBoundedWeek` clona las filas fijas. Cuando la fila coincide exactamente con el snapshot, marca `weeklyProtected`. `issueWeeklyCalendar` firma `protectedSessionDigest` del original.
5. `weeklySaveAdmission` obtiene los índices supervivientes exclusivamente de ese digest firmado y el snapshot. Antes no había digest del miércoles original; ahora sí.
6. En `guardar_plan_semana`, `prepareWeeklyEntries` descarta cualquier propuesta conflictiva del miércoles y `entrySession` toma la fila completa del snapshot. Los supervivientes no pasan por la admisión de contenido nuevo. Antes, el reemplazo «Sin registrar» pasaba por `admitSessionContent`, que añadía `completada=false`: es exactamente el objeto observado en producción.
7. `admitWeeklyCandidate` conserva la identidad de la sesión superviviente. La validación de mutación y `mutatePlanWithCAS` persisten esa fila íntegra usando la revisión esperada. No se modifica este mecanismo ni el generation log.

## Nuevo invariante y cambio mínimo

Se amplía únicamente la decisión de preservación del calendario: un TRAIN pasado con prescripción conocida se conserva aunque no esté completado. La presencia se reconoce mediante contenido estructurado (bloques o intent de adaptación) o texto legacy no vacío de título/descripción. Un placeholder vacío no adquiere protección por ser pasado. No se interpreta la prosa para inferir dosis, método ejecutado ni resultados.

| Estado | Tratamiento en regeneración parcial |
| --- | --- |
| Pasado EXECUTED | Conservar íntegro, como antes |
| Pasado PLANNED_ONLY | Conservar íntegro; sigue no ejecutado |
| Pasado UNREGISTERED | Conservar su semántica sin registrar |
| Futuro reemplazable | Reenumerar las opciones del Planner |

No se añaden campos de estado a persistencia: son categorías semánticas sobre los datos existentes. No cambian D1/D2A/D3/B3/C2/HM, whole-week, fixedPrescriptionKey ni las reglas introducidas por af02bb9. Solo se actualiza la expectativa anterior de su test que documentaba el descarte del miércoles; las pruebas de duplicación y rechazo temprano siguen intactas.

## Reproducción y comprobaciones

`lib/planning/pastPlannedPreservation.test.mjs` usa los módulos reales y una base en memoria. No hace llamadas de red ni SQL.

El fixture fija la semana 2026-09-07 y regeneración 2026-09-11: lunes carrera completada, martes fuerza/box completada, miércoles running_specific/resistencia_especifica planificado de 87 minutos sin ejecución, jueves realmente sin_registrar, viernes/sábado reemplazables, domingo descanso. Una declaración fácil confirmada de 50 minutos permite el único Builder nuevo del viernes bajo las autoridades existentes. La identidad de prueba es aislada; textos, estructura completa y metadatos anidados son sentinelas sintéticos para comprobar copia exacta, no reconstrucciones de datos productivos ausentes.

Tres regresiones nuevas:

1. Distinguen explícitamente EXECUTED, PLANNED_ONLY, UNREGISTERED y futuro reemplazable. Comprueban además que placeholders vacíos (incluido schemaVersion sin contenido) no se protegen ciegamente, y que una prescripción legacy sí se conserva.
2. Reinstalan únicamente el predicado anterior en el runtime de prueba: el loader real produce la degradación exacta y la admisión real añade `completada=false`. Con el predicado corregido, conserva lunes a jueves sin cambiar el snapshot.
3. Ejecutan captura de snapshot → Planner y calendario firmado reales → supervivientes → un Builder real → whole-week → admisión de identidad → validación estricta → adaptador CAS real con transporte en memoria. El payload de revisión 7 conserva EXACTAMENTE los cuatro días históricos, incluso frente a una sustitución hostil del miércoles en la propuesta entrante.

La última regresión comprueba identidad, metadatos anidados, `completada=false`, `actual=null`, ausencia de `titulo_real` y `descripcion_real`, jueves sin_registrar, viernes 3.000 segundos y sábado/domingo REST. El único Builder target es viernes; no se llama a reparación ni aparece WEEK_EXACT_DUPLICATE.

La evidencia de ejecución reconoce una sola carrera completada (lunes); miércoles sigue PLANNED_ONLY. Los 87 minutos no entran en duración ejecutada ni en recentMethodExposure. Tras el payload persistido se vuelve a cargar el contexto y se comprueba que solo running_base tiene permiso de prescripción; las dosis de los otros métodos siguen nulas. No se fabrica historia ni dosis B3.

Whole-week conserva su semántica de cobertura de prescripciones, que puede incluir una prescripción histórica no ejecutada. No se interpreta esa cobertura como adaptación realizada. Esto corrige y sustituye la descripción de descarte de días pasados en el informe anterior de af02bb9, sin modificar su solución a duplicados.

## Validación

- Focalizados preservation/calendar/weekly generation/save/whole-week/B3/history: 134/134, sin fallos ni omitidos.
- TypeScript `npx tsc --noEmit`: correcto.
- Suite completa `node --test --test-concurrency=4 'lib/**/*.test.mjs'`: 2.186/2.186, cero fallos, omitidos o cancelados (187,5 s).
- `git diff --check`: correcto.

Commit local únicamente. Sin push, SQL ni modificaciones de registros productivos.
