# PLAN vs EXECUTION — semántica canónica (2026-10-06)

**PLAN** = qué quería Forge que hicieras (`weekly_plan`, solo lectura aquí).
**EXECUTION** = qué hiciste realmente (`running_execution_records`, vía `/api/workouts`).

"Sesión completada" **no** es sinónimo de "el atleta entrenó ese día". Son dos preguntas con dos proyecciones:

| Pregunta | Proyección | Qué cuenta |
|---|---|---|
| ¿Se realizó esta sesión **prescrita**? | `projectWorkoutPlans` → `completada`, `forge_context.execution` | Solo una ejecución vigente con `prescription.relation='performed'` sobre `planId:sessionId`. |
| ¿Entrenó el atleta ese **día civil**? | `describeDayActivity` / `describeWeekActivity` (`lib/execution/workoutActivity.ts`) → `dayTrained` | **Toda** ejecución canónica vigente no borrada con `executedOn` = fecha, vinculada o no. |

`performedExecutions` (`workoutProjections.ts`) es la única definición de "performed"; ambas capas la comparten.

## Casos

| Caso | `completada` / `prescribedSessionPerformed` | `dayTrained` |
|---|---|---|
| Prescrita y realizada (`performed`) | true | true |
| Prescrita, el atleta hace otra cosa (libre) | false | true |
| Prescrita, sustituida (`replaced`) | false | true |
| Día sin sesión, entrena | — (nada que completar; `unplannedTraining`) | true |
| Día de descanso prescrito, entrena | false (`restDay`, `unplannedTraining`) | true |
| Prescrita, sin ninguna ejecución | false | false |

Forge **no** pregunta ni infiere si una ejecución libre sustituye la sesión. `performed` significa "la sesión prescrita fue la referencia", no "se hizo idéntica": comentarios, RPE, molestias, métricas y cambios reales se conservan en `data`.

## Salidas (todas aditivas)

- **Today** (`obtener_today_state`): `todaySession.{completada,planId,sessionId}` (`completada` = prescrita realizada); `activity:{date,dayTrained,executionCount,prescribedSessionPerformed,unplannedTraining,restDay,executions[]}`; `recentActivity` = ejecución canónica más reciente (con `fecha`) o, si es más nueva, el completado legacy del plan. La frecuencia de readiness cuenta todas las ejecuciones canónicas + `workout_history` legacy sin duplicar. El día de la semana ahora sale del día civil Atlantic/Canary (antes Europe/Madrid).
- **Plan V2** (`obtener_plan_semana_v2`): `planId`, `sessions[].{session_id,date}`, `forge_context.execution` (estado de la sesión prescrita) y `weekActivity[]` por día civil.
- **Adherencia** (`calcular_adherencia`): `adherencia7/28/Bloque` y `diasSemana` no cambian; `activity:{trainedDays7,trainedDays28,executions7,executions28}` y `prescribed:{last7,last28:{planned,performed,rate}}` (`null` si falla la lectura del plan).
- **Totales** (`recuperar_usuario`): `canonical_activity:{totalSessions,canonicalExecutions,legacyOnlyEntries,canonicalTrainedDays}` (o `null` + `canonical_activity_error`). `workout_history` se sigue devolviendo sin cambios.
- `obtener_readiness_calculado` usa la misma frecuencia real.

Un fallo de lectura canónica devuelve 503 `WORKOUT_READ_FAILED` (Today, Plan V2, readiness, adherencia); nunca se degrada a "no entrenó".

## Deuda explícita (no tocada)

- `workout_history` no se elimina: lo leen la racha, el briefing, la celebración, el Block Analyzer y el Training Frequency Safety Net (`route.ts`, bloque de análisis), que sigue contando solo `workout_history`. Migrarlo es una decisión aparte (toca generación).
- Web `app/progreso/page.tsx` sigue usando `datos.workout_history`.
- No hay modelo de carga nuevo: solo se deja la autoridad (`currentExecutions`, `combineActualActivity`).

## Estado de producción de `mutate_workout`

**No verificable desde el repo ni sin acceso a la base de producción.** `docs/sql/core-reg-1-workouts.sql` lleva la cabecera "Pending authorized deployment" y `docs/core-reg-deployment.md` (2026-09-30) dice "producción no intervenida". Verificación segura, solo lectura, a ejecutar por quien tenga acceso: `docs/sql/core-reg-postflight.sql` (falla si faltan función, restricción, índices o privilegios) o `SELECT proname FROM pg_proc WHERE proname='mutate_workout'` y `SELECT to_regclass('public.workout_read_rows')`. Esta tarea no despliega SQL.
