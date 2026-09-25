# Auditoría de trazabilidad del Orchestrator — 2026-09-25

## A. Ubicación y recorrido actual

`app/api/chat/route.ts:POST` deriva Coach-first a `lib/chat/coachFirstHandler.ts:handleCoachFirst`.
`lib/chat/coachFirstGeneration.ts:generateCoachFirstWeek` coordina Analyzer → Weekly Coach → Builder por slot ejecutable → guardado. Su callback ejecuta `handlePost` en proceso, sin HTTP adicional. La planificación reside en `lib/planning/prepareAllowedWeeklyPlanContract.ts` y la construcción en `lib/sports/sessionGeneration.ts:generateContractSession`.

La auditoría es de código e historial locales. No se consultó Vercel ni se lanzó una generación real. La ejecución satisfactoria en producción es contexto proporcionado por el usuario.

## B. Inventario de logs existentes antes del cambio

En las tablas, **S** significa servidor / logs de Vercel en despliegue; **B** navegador / DevTools. Todos son alcanzables bajo la condición indicada, salvo los logs B que no pertenecen al recorrido conversacional Coach-first. No existe reenvío automático entre ambas consolas. Las rutas `lib/` describen el runtime de este pipeline, no una restricción de importación del módulo.

### Cliente legacy

Todos los siguientes están en `app/FormaPro.tsx:orquestarGeneracionSemana`, runtime B. Siguen presentes y tienen llamadas desde onboarding/continuaciones legacy. El `return` de `enviar` con Coach-first evita ese recorrido para ese turno.

| Log | Condición de emisión |
| --- | --- |
| `=== FORGE ORCHESTRATOR: INICIO ===` | Entrada con código de usuario |
| `ORCHESTRATOR Paso 1 — Block Analyzer: iniciando...` | Preparación previa superada |
| `ORCHESTRATOR Paso 1 — Block Analyzer: resultado:` | Respuesta del Analyzer |
| `ORCHESTRATOR: FALLO en Block Analyzer, abortando` | Analyzer no OK |
| `ORCHESTRATOR_PRESERVATION` | Planner admitido; preparación de preservación |
| `ORCHESTRATOR Paso 3 — calendario:` | Calendario disponible |
| `ORCHESTRATOR_BUILDER_TARGETS` | Objetivos del Builder seleccionados |
| `ORCHESTRATOR Paso 3 — <día>: resultado:` | Cada respuesta del Builder |
| `SESSION BUILDER: semana detenida` | Alguna construcción no OK o sin sesión |
| `ORCHESTRATOR_ASSEMBLY` | Ensamblado tras construcciones |
| `WEEK INTEGRITY: verificando disponibilidad y variedad...` / `resultado:` | Comprobación de integridad y su resultado |
| `ORCHESTRATOR: guardando plan completo:` | Antes de guardar |
| `=== FORGE ORCHESTRATOR: EXITO COMPLETO ===` | Guardado admitido |

### Servidor: coordinación, Analyzer y guardado

| Archivo / función | Logs | Condición / destino |
| --- | --- | --- |
| `app/api/chat/route.ts:handlePost` | `PLANNING_ACTION_REQUEST` | Flag `FORGE_WEEKLY_COACHING_DIAGNOSTICS=1` y acción de planificación; S |
| mismo, `analizar_bloque_semana` | `Error calculando Exposure Report:`, `WEAKNESS FOLLOW-UP:`, `BLOCK ANALYZER: scores de debilidades...`, `TRAINING FREQUENCY SAFETY NET:` | Respectivamente error de exposición, actualización de debilidades, scores calculados, corrección de frecuencia; S |
| mismo, `guardar_plan_semana` | `BLOCKED guardar_plan_semana`, `FOCUS: días externos...`, `FOCUS GUARD: ...` | Modo/cuota bloqueados; aplicación de días externos; violación/verificación de ownership; S |
| mismo, `guardar_plan_semana` | `WEEKLY_SAVE_FAILED` | Fallos de validación/reparación semanal, lectura de cuota, validación final o receipt; S |
| `lib/chat/coachFirstHandler.ts:observe` | `COACH_FIRST_OPERATION` | Observaciones del loop y despacho, incluyendo resultado de `generate_week`; S |
| `lib/chat/coachFirstHandler.ts:handleCoachFirst` | `COACH_FIRST_ERROR` | Excepción del turno; S |
| `lib/planning/enforceWholeWeek.ts:enforceWholeWeek` | `WHOLE_WEEK_COACH_FEEDBACK` | Reparación semanal y flag semanal; S |
| `lib/planning/longitudinalAuthority.ts:ensureLongitudinalTarget` | `BLOCK_STATE_TRANSITION` | Transición longitudinal y flag semanal; S |
| `lib/planning/weeklyCalendarAuthority.ts:rejectWeekly` | `WEEKLY_AUTHORITY_REJECTED` | Rechazo de autoridad; S |

### Servidor: Weekly Coach / Planner

| Archivo / función | Logs | Condición / destino |
| --- | --- | --- |
| `lib/planning/prepareAllowedWeeklyPlanContract.ts:loadWeeklyPlanningContext` | `WEEKLY_AVAILABILITY_RESOLVED`, `GOAL_RESOLUTION_DIAGNOSTIC`, `WEEK_STRATEGY_ADMISSION` | Resolución de disponibilidad y objetivo; S |
| misma función | `WEEKLY_FUTURE_COMPLETION_REJECTED` | Detección de completado futuro; S |
| mismo archivo, `prepareAllowedWeeklyPlanContract` | `WEEKLY_COACH_OPTIONS`, `WEEKLY_COACHING_INPUT` | Contrato construido y flag semanal; S |
| mismo archivo, `planBoundedWeek` | `ORCHESTRATOR Paso 2 — Weekly Coach` | Propuesta admitida; sin flag; S |
| misma función | `WEEKLY_COACH_SELECTION`, `WEEKLY_COACH_RATIONALE`, `WEEKLY_COACHING_SELECTION` | Selección admitida y flag semanal; S |
| misma función | `WEEKLY_STRATEGY_DIAGNOSTIC` | Estrategia final diagnosticada; S |
| `lib/planning/weeklyPlannerDiagnostics.ts:emitWeeklyPlannerDiagnostic` | `WEEKLY_PLANNER_DIAGNOSTIC` | Intentos del Planner, incluidos parseo/rechazo; S |
| `lib/planning/openWeeklyCoachContract.ts:emitOpenWeeklyValidation` | `WEEKLY_INTENT_VALIDATION` | Validación de selección abierta; S |
| `lib/planning/weeklyAvailabilityDiagnostics.ts:weeklyAvailabilityFailure` | `WEEKLY_AVAILABILITY_UNRESOLVED` | Disponibilidad no resoluble; S |
| `lib/planning/allowedWeeklyPlanContract.ts:buildAllowedWeeklyPlanContract` | `WEEKLY_DOSE_CANDIDATE_REJECTIONS` | `includeFeasible` (flag semanal); S |
| `lib/planning/weeklyFeasibilityDiagnostic.ts:emitWeeklyFeasibilityDiagnostic` | `WEEKLY_FEASIBILITY_REJECTION_DIAGNOSTIC` | Diagnóstico de rechazo o factibilidad habilitada; S |
| `lib/planning/authorizedMethodCandidates.ts:resolveAuthorizedMethodCandidates/report` | `WEEKLY_TRANSFER_CANDIDATE_DETAIL` | Evaluación con relaciones de transferencia; S |
| `lib/planning/weeklyRemainingDiagnostic.ts:emitRemainingDiagnostic/emitRemainingDetails` | `WEEKLY_REMAINING_SELECTION_DIAGNOSTIC`; `WEEKLY_FEASIBILITY_REJECTION_DETAIL`, `WEEKLY_RESTRICTION_PROJECTION_DETAIL`, `WEEKLY_RESTRICTION_AREAS_DETAIL`, `WEEKLY_RESTRICTION_ORIGIN_DETAIL`, `WEEKLY_METHOD_PIPELINE_DETAIL`, `WEEKLY_CALENDAR_AVAILABILITY_DETAIL` y sus `_SUMMARY` | Diagnóstico del conjunto restante y filas disponibles; S |

### Servidor: Session Builder

| Archivo / función | Logs | Condición / destino |
| --- | --- | --- |
| `lib/sports/builderDiagnostics.ts:builderTrace.record` | `SESSION_BUILDER_ATTEMPT` | Registro de fase/intento realmente ejecutado; S |
| misma función | `SESSION_DUPLICATE_MOVEMENT_DETAIL`, `SESSION_PRESCRIPTION_DATA_MISSING_DETAIL` | Violaciones de duplicación / detalles de datos faltantes; S |
| mismo archivo, `builderTrace.shape` | `SESSION_SHAPE_VIOLATION` | Error de forma; S |
| `lib/sports/sessionGeneration.ts:generateContractSession` | `METHOD_INTENSITY_AUTHORITY`, `SESSION_REPRESENTATION_ADVISORY`, `SESSION_INTENT_ASSESSMENT`, `REQUIREMENT_ASSESSMENT` | Autoridad de intensidad / advisory / evaluación aplicable; S |
| `lib/sports/sessionDoseDiagnostics.ts:emitSessionCoachingDiagnostic` | `SESSION_COACH_INPUT`, `SESSION_COACH_DECISION`, `SESSION_AUTHORITY_RESOLUTION`, `BUILDER_OUTPUT`, `SESSION_MOVEMENT_COACH_INPUT`, `SESSION_MOVEMENT_PROPOSAL`, `MOVEMENT_RESOLUTION`, `MOVEMENT_FEASIBILITY`, `SESSION_MOVEMENT_ADMISSION`, `SESSION_WEEK_CONTEXT` | Emisor invocado en la fase correspondiente y `FORGE_SESSION_COACHING_DIAGNOSTICS=1`; S |
| mismo archivo, `emitSessionDoseAuthority` | `SESSION_DOSE_AUTHORITY` | Autoridad temporal disponible; S |
| `lib/sports/equipmentAuthorityDiagnostic.ts:emitEquipmentAuthorityDiagnostic` | `EQUIPMENT_AUTHORITY_SUMMARY`, `EQUIPMENT_AUTHORITY_DETAIL` | Proyección de equipamiento y elementos presentes; S |
| `lib/sports/preBuilderPrescriptionDiagnostic.ts:emitPreBuilderPrescriptionDiagnostic` | `PRE_BUILDER_PRESCRIPTION_REJECTION`, `PRE_BUILDER_PRESCRIPTION_CANDIDATE` | Diagnóstico pre-Builder de rechazo/candidatos; S |
| `lib/sports/sessionHumanRenderer.ts` | `HUMAN_PRESENTATION_FALLBACK` | Fallback de presentación; S en generación |

Otros logs relacionados fuera de `generate_week`: `BLOCK WEEK SUMMARY generado`, `BLOCK HISTORY (deterministico)`, `WEAKNESS EXPOSURE registrado` en `route.ts:handlePost` (cierre/registro de bloque); error de guardado en `lib/planning/completedBlockOutcome.ts`; safety net de modificación con Session Builder en `route.ts:handlePost`. Todos son S bajo su acción correspondiente. No se reenvían sus payloads al cliente.

## C–D. Causa y mecanismo anterior

El commit `f9d2b0bef49638d1350a80e18b7984b0b5926bc2` añadió logs directamente al orchestrator React alrededor de `apiCall`. El navegador coordinaba y registraba cada respuesta; no había un transporte de logs del servidor.

El commit `4ab6e406d7db3ce6f3d56a688c850063d6763454` introdujo Coach-first: petición única a `/api/chat`, coordinación server-side y retorno temprano en `enviar`. Los logs antiguos del cliente permanecen, pero no representan este pipeline. Weekly Coach y Builder siguen emitiendo logs en servidor. Por eso no aparecen automáticamente en DevTools. No se restauró código antiguo.

## E–H. Solución y formato exacto

Se envuelve únicamente el callback de planificación de `handleCoachFirst`. Cada llamada real a los cuatro handlers registra `started` y `returned` o `threw`; las llamadas que no ocurrieron no generan eventos. `returned` NO equivale a admisión o commit. No se copian resultados, errores, argumentos, IDs de usuario, prompts ni códigos libres.

Flag existente: `FORGE_WEEKLY_COACHING_DIAGNOSTICS=1` en el servidor, también en producción. Con flag apagada se usa el callback original y no se añade `debug`. No se verificó ni cambió la configuración de Vercel. El cliente imprime únicamente si el servidor envió el campo. No se añade configuración global ni flag pública.

No había un contenedor debug del turno Coach-first. Se añade exclusivamente `debug.orchestratorTrace` en la frontera de respuesta HTTP, después del loop; nunca a resultados de herramientas, contexto, journal o conversación persistida. Límite: primeros 64 eventos por petición, sin síntesis posterior ni espera. Se entrega al finalizar la respuesta, **no en streaming**; si no llega una respuesta HTTP utilizable, no puede mostrarse en DevTools.

Formato (ejemplo ilustrativo de una invocación; la duración real varía):

```json
{"debug":{"orchestratorTrace":[
  {"step":"Paso 1 — Block Analyzer","layer":"server","invocation":1,"status":"started"},
  {"step":"Paso 1 — Block Analyzer","layer":"server","invocation":1,"status":"returned","durationMs":1234}
]}}
```

`step` pertenece a: `Paso 1 — Block Analyzer`, `Paso 2 — Weekly Coach`, `Paso 3 — Session Builder`, `Paso 4 — Guardado`. `invocation` es ordinal del handler dentro de esta petición, no un número de retry LLM. `durationMs` solo aparece al terminar. `status` pertenece a `started | returned | threw`. Los intentos internos del Builder permanecen en sus logs existentes de servidor.

Llamada exacta del cliente: `console.log('[FORGE ORCHESTRATOR DEBUG]', event)`. Salida correspondiente al primer evento del ejemplo:

```text
[FORGE ORCHESTRATOR DEBUG] {step: "Paso 1 — Block Analyzer", layer: "server", invocation: 1, status: "started"}
```

Archivos del cambio:

- `lib/diagnostics/orchestratorTrace.ts`: colector acotado y logger pasivo.
- `lib/chat/coachFirstHandler.ts`: flag, callback observado y campo de respuesta.
- `app/FormaPro.tsx`: imprimir tras parsear la respuesta Coach-first.
- `lib/chat/coachFirst.test.mjs`: pruebas y resolución del módulo en fixture.
- `docs/orchestrator-browser-trace-audit.md`: este informe.

## I–K. Verificación y estado

- `node --test lib/chat/coachFirst.test.mjs`: 177/177 pasan.
- `npx tsc --noEmit --incremental false`: correcto.
- `git diff --check`: correcto.
- Pruebas nuevas: generador real con fronteras DB/handlers simuladas; trace ON/OFF conserva resultados, contexto, argumentos, orden y operaciones DB en éxito, rechazo y excepción. No aparecen eventos de pasos omitidos. Límite 64, aislamiento entre peticiones, ausencia de trace, identidad de respuestas/errores y fallo del logger comprobados.
- Handler real con dependencias simuladas: flag en `NODE_ENV=production`, transporte HTTP y exclusión del trace de resultados del Coach/persistencia comprobados.
- Llamadas adicionales al proveedor: **0**. Consultas/escrituras DB adicionales: **0**. Retries adicionales: **0**. Solo reloj, memoria acotada, serialización y consola. No se midió latencia en producción.
- Listo para commit/push: **SÍ**, para este cambio local. No se ha hecho commit, push ni despliegue. Los archivos preexistentes de Semantic Intake no se han modificado.
