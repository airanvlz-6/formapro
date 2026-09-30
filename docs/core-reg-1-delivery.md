# CORE-REG-1 — recuperación y verificación

Fecha: 2026-09-30. Se continuó el working tree existente, sin reiniciar la implementación, sin commit, push, despliegue ni proveedores LLM reales. El documento `core-reg-1-audit-proposal.md` describe la auditoría anterior: sus afirmaciones de «implementación pendiente» no describen el estado actual.

## 1. Estado funcional comprobado

| Componente | Evidencia y alcance |
| --- | --- |
| Contratos y validación | Implementados en `workoutContracts.ts`, `workoutRegistry.ts` y el adaptador de carrera. Confirmación explícita, clave estable, fecha civil no futura, campos permitidos, métricas no negativas y RPE 0–10. Disciplina abierta; extensión de carrera explícita. Resultado obligatorio en el código actual. |
| Creación | API autenticada `POST /api/workouts`; sin suscripción ni LLM. Probadas dos ejecuciones iguales el mismo día con claves distintas, registro retroactivo y vínculo exacto con un plan propio. |
| Edición | `PUT`, sustitución completa de datos declarados, ID estable y nueva revisión firmada. Se prueba conflicto de revisión, repetición y eliminación de opcionales omitidos. |
| Eliminación lógica | `DELETE` añade una revisión tombstone; conserva filas previas. Probadas ejecución libre y vinculada, repetición, ausencia de resurrección y retirada de evidencia/carga activa. |
| Idempotencia | Clave por atleta, digest del contenido y arbitraje SQL. Probados reintentos, conflicto de contenido, claves aisladas entre atletas y pérdida de respuesta después de escribir. |
| Persistencia | Función SQL transaccional, bloqueo por atleta, índices únicos de solicitud y revisión, validación de titularidad de la prescripción bajo bloqueo. La suite ejecuta el SQL real en PGlite efímero. No equivale a validar concurrencia entre conexiones de PostgreSQL/Supabase desplegado. |
| Historial/evidencia | Lector común con cronología, cursor, ID exacto y procedencia heredada; integrado en Historia, Coach, contexto del atleta, evidencia reciente y carga. Se prueban lectura inmediata tras corrección y ausencia de evidencia activa tras borrado. |
| Carrera estructurada | Validación deportiva conservada; lectura v1 firmada y proyección v2. Correcciones revalidan unidades y coherencia de métricas. Se prueban coexistencia v1/v2 y eliminación. |
| Escrituras del chat | `record_execution` y `record_performed` requieren confirmación fuera de la propuesta LLM. Rutas antiguas de finalización sin escritura ni proveedor. Parche genérico de perfil excluye `workout_history`. |

Estas conclusiones proceden de inspección y pruebas locales; no certifican el estado de producción ni una experiencia completa de registro en la interfaz.

## 2. Incompleto y decisiones pendientes

- **Interfaz de confirmación:** los botones de `app/FormaPro.tsx` aún envían `datos.sesion` a `registrar_sesion`, sin el contrato `requestId/confirmed/workout`; recibirán rechazo. No hay flujo general de alta/edición/borrado conectado a `/api/workouts`. No se amplió esta recuperación de pruebas a una implementación nueva de UI.
- **Conversación:** las instrucciones de `coachFirstLoop.ts` aún piden registrar reportes y esperar recibos. La herramienta devuelve `confirmation_required`, pero no existe continuación de confirmación canónica integrada. El bucle conserva la mutación pendiente y puede agotar rondas si el modelo no pide aclaración. No anuncia éxito sin recibo.
- **Escala:** los lectores canónicos rechazan 1000 o más filas del almacén, incluidas revisiones. El cursor de salida no elimina ese límite de lectura. Requiere evolución antes de alcanzar ese volumen por atleta.
- **Compatibilidad:** el escritor antiguo de carrera rechaza nuevas asociaciones `planSessionId` que no incluyan la referencia exacta exigida por el registro general; las v1 existentes se conservan. Referencias a biblioteca siguen rechazadas explícitamente.
- **Contrato:** la propuesta de auditoría tenía `result` opcional; la implementación recuperada lo exige. Debe ratificarse con el cliente. No se cambió ese contrato durante esta recuperación.
- **Datos y despliegue:** sin backfill, sin comprobación de los entrenamientos reales del incidente, sin verificación del esquema efectivo. No se puede afirmar que el incidente del usuario esté reparado en producción.
- **Cobertura:** PGlite demuestra ejecución de SQL y arbitraje de solicitudes de la suite, no una carrera real con múltiples conexiones. Falta validación de permisos efectivos, roles y concurrencia en un entorno Supabase autorizado.

## 3. Cambios de esta recuperación

- `lib/chat/coachFirst.test.mjs`: recuperada la prueba del bucle real para el contrato nuevo: una propuesta sin recibo permanece pendiente, no admite prosa de éxito, no escribe y conserva diagnósticos de mutación.
- `lib/execution/reportExecutionDate.test.mjs`: ambas rutas retiradas se verifican sin DB/LLM y con `historyRecorded/planCompleted/detectado` falsos; los casos de fecha se conservan.
- `lib/auth/productAccess.test.mjs`: fixture del nuevo lector `/api/workouts`, con Bearer y resolución real de identidad sintética. Se mantienen todas las aserciones de autenticación, titularidad, navegación y contenido.
- Este informe y logs `.core-reg-recovery-*`. El pequeño probe `.core-reg-recovery-baseline.cjs` carga fuentes de `HEAD` solo en memoria para clasificar el fallo preexistente, sin sustituir archivos del working tree.

No se modificó código de aplicación ni SQL durante esta recuperación. Los cambios funcionales enumerados en la sección 1 ya estaban presentes al comenzar. No se ejecutó el script anterior `.core-reg-update-tests.mjs`.

## 4. Validación

- Focalizadas: `node --test lib/execution/*.test.mjs lib/chat/coachFirst.test.mjs lib/chat/groundedCoach.test.mjs lib/core/recentTrainingEvidence.test.mjs lib/planning/recordCompletion.test.mjs lib/planning/writerConvergence.test.mjs lib/trainingLoad/*.test.mjs lib/diagnostics/groundingTrace.test.mjs`: **463/463** antes de reforzar las pruebas. Log `.core-reg-recovery-focused.log`.
- TypeScript: `node node_modules/typescript/bin/tsc --noEmit --incremental false`: correcto, sin diagnósticos. Log `.core-reg-recovery-typescript.log`.
- Regresiones ampliadas: autenticación completa, conversación, recuperación longitudinal, salida/diagnósticos del Coach, incidente de grounding, contexto del atleta, dosis/hábitos de carrera, auditoría de planificación, mutaciones/CAS, escritores heredados y reutilización de carrera. Primera ejecución: **345/348**; dos fixtures obsoletos de Historia y un fallo preexistente.
- Fallo preexistente: `lib/chat/groundingInputIncident.test.mjs:23`, `bodies[0].codigo` sobre undefined. El fixture proporciona `fetch` mientras el `apiCall` actual usa `authenticatedFetch`. Reproducido también con `app/FormaPro.tsx` y `app/api/chat/route.ts` de `HEAD` mediante el probe de solo lectura: **3/4**, mismo error y línea. No se relajó ni eliminó esa prueba.
- El fallo de diagnóstico `unknown` frente a `workouts.read` de los logs anteriores **no se reproduce**; la lista de etapas ya estaba actualizada al recuperar el trabajo.

Reejecución tras los cambios: `node --test --test-concurrency=2 lib/chat/coachFirst.test.mjs lib/execution/reportExecutionDate.test.mjs lib/auth/productAccess.test.mjs`: **240/240**, sin omitidas. Log `.core-reg-recovery-updated.log`. Incluye las dos regresiones de Historia corregidas y la nueva cobertura del límite de confirmación. Las cifras de ejecuciones se solapan y no deben sumarse como pruebas únicas. Permanece el fallo preexistente descrito arriba; no quedan fallos detectados atribuibles a CORE-REG-1 en las pruebas ejecutadas.

`git diff --check` correcto al inicio y al final; únicamente avisos de normalización LF/CRLF, sin errores de whitespace. No se ejecutó la suite global completa ni un build de producción.

## 5. SQL y comprobaciones PRE/POST

Preparado: `docs/sql/core-reg-1-workouts.sql`. Migración aditiva, transaccional y de una sola aplicación: añade metadatos/índices/restricción a `running_execution_records`, crea `mutate_workout`, revoca INSERT directo del servicio y concede solo EXECUTE de esa función al servicio. No borra ni vuelve a firmar las v1. Aplicada únicamente en la base efímera de las pruebas.

Las siguientes consultas son de **solo lectura**, preparadas para un entorno autorizado. No se han ejecutado contra producción. No aplicar la migración si PRE detecta divergencias. Guardar los resultados PRE para compararlos con POST. La migración no debe repetirse a ciegas y revertir código no debe eliminar evidencia almacenada.

### PRE

```sql
-- Deben existir la tabla factual y las autoridades referenciadas.
SELECT to_regclass('public.running_execution_records') AS factual,
       to_regclass('public.weekly_plan') AS plans,
       to_regclass('public.usuarios') AS athletes;
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('running_execution_records', 'weekly_plan')
ORDER BY table_name, ordinal_position;
-- Revisar tipos de id/user_codigo/sessions y las columnas v1.
-- Si ya hay columnas v2 o mutate_workout, investigar despliegue parcial/previo.
SELECT to_regprocedure('public.mutate_workout(text,text,integer,jsonb)') AS existing_rpc;
SELECT indexname, indexdef FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'running_execution_records';
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
WHERE conrelid = 'public.running_execution_records'::regclass;
SELECT relrowsecurity, relowner::regrole FROM pg_class
WHERE oid = 'public.running_execution_records'::regclass;
SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role');
-- Esperado: 0; no convertir datos defectuosos mediante backfill implícito.
SELECT count(*) AS invalid_version
FROM public.running_execution_records
WHERE record->>'version' IS DISTINCT FROM '1';
-- Guardar ambas cifras para comparar sin exponer contenido de atletas.
SELECT count(*) AS v1_count,
       md5(coalesce(string_agg(md5(ROW(user_codigo,execution_id,content_digest,record,signature,created_at)::text),
           '' ORDER BY user_codigo,execution_id,content_digest),'')) AS v1_fingerprint
FROM public.running_execution_records WHERE record->>'version' = '1';
```

Revisar también permisos heredados/membresías de roles, que el propietario de la función podrá escribir bajo RLS, y que no quedan aplicaciones desplegadas que dependan de INSERT directo. El nombre de tabla en el repositorio no demuestra esas condiciones en el destino.

### POST

```sql
-- Repetir v1_count/v1_fingerprint de PRE: deben ser idénticos
-- si se ejecutan en una ventana sin escrituras v1 concurrentes.
SELECT count(*) AS v1_count,
       md5(coalesce(string_agg(md5(ROW(user_codigo,execution_id,content_digest,record,signature,created_at)::text),
           '' ORDER BY user_codigo,execution_id,content_digest),'')) AS v1_fingerprint
FROM public.running_execution_records WHERE record->>'version' = '1';
SELECT indexname, indexdef FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'running_execution_records';
-- Deben figurar workout_request_once, workout_revision_once, workout_chronology.
SELECT conname, convalidated, pg_get_constraintdef(oid) FROM pg_constraint
WHERE conrelid = 'public.running_execution_records'::regclass AND conname = 'workout_v2_shape';
SELECT relrowsecurity FROM pg_class
WHERE oid = 'public.running_execution_records'::regclass; -- true
SELECT prosecdef, proconfig, proowner::regrole FROM pg_proc
WHERE oid = 'public.mutate_workout(text,text,integer,jsonb)'::regprocedure;
-- SECURITY DEFINER true; search_path pg_catalog, public; propietario autorizado.
SELECT role_name,
 has_table_privilege(role_name,'public.running_execution_records','SELECT') AS can_select,
 has_table_privilege(role_name,'public.running_execution_records','INSERT') AS can_insert,
 has_table_privilege(role_name,'public.running_execution_records','UPDATE') AS can_update,
 has_table_privilege(role_name,'public.running_execution_records','DELETE') AS can_delete,
 has_function_privilege(role_name,'public.mutate_workout(text,text,integer,jsonb)','EXECUTE') AS can_execute
FROM (VALUES ('anon'),('authenticated'),('service_role')) AS roles(role_name);
-- anon/authenticated: todo false. service_role: SELECT/EXECUTE true, DML false.
SELECT user_codigo, request_id, count(*) FROM public.running_execution_records
WHERE record_version = 2 GROUP BY user_codigo, request_id HAVING count(*) > 1;
SELECT user_codigo, execution_id, revision, count(*) FROM public.running_execution_records
WHERE record_version = 2 GROUP BY user_codigo, execution_id, revision HAVING count(*) > 1;
-- Ambas consultas de duplicados deben devolver cero filas.
```

Las consultas PRE/POST se ejecutaron además mediante `node .core-reg-recovery-sql-checks.mjs` en PGlite desechable, antes/después de aplicar el SQL local: correctas; comprobados índices, restricción validada, RLS, SECURITY DEFINER, permisos y fingerprint de base vacía. La suite de registro comprueba por separado conservación de una fila v1 poblada. Log `.core-reg-recovery-sql.log`. Esto no valida PRE/POST sobre el esquema real del destino.

Estas consultas no comprueban firmas HMAC: la prueba de integridad corresponde al lector backend. Para ensayar escrituras, repetición, aislamiento y concurrencia usar únicamente una base de pruebas desechable autorizada. No insertar datos sintéticos en producción para validar esta entrega.

## 6. Working tree

Inicio: rama `main`, un commit ya existente por delante de `origin/main`; 20 archivos seguidos modificados y 41 archivos nuevos preexistentes. Sin cambios en staging. Todos se conservaron. Los archivos de evaluaciones live/semantic-intake preexistentes no se ejecutaron ni modificaron.

Final: 21 archivos seguidos modificados y 53 sin seguimiento, sin staging. El inventario final distingue los cambios seguidos y todos los archivos no seguidos, incluidos los ajenos a CORE-REG-1. No hubo commit ni push.

### Inventario final de archivos seguidos modificados

- app/api/chat/route.ts
- app/historia/page.tsx
- lib/athlete/loadAthletePrescriptionContext.ts
- lib/auth/productAccess.test.mjs
- lib/chat/chatCoachActions.ts
- lib/chat/coachFirst.test.mjs
- lib/chat/coachFirstReads.ts
- lib/chat/coachFirstTools.ts
- lib/chat/groundedCoach.test.mjs
- lib/chat/groundedCoach.ts
- lib/chat/longitudinalContext.ts
- lib/core/recentTrainingEvidence.test.mjs
- lib/core/recentTrainingEvidence.ts
- lib/diagnostics/groundingTrace.ts
- lib/execution/reportExecutionDate.test.mjs
- lib/execution/runningExecution.test.mjs
- lib/execution/runningExecutionStore.ts
- lib/planning/recordCompletion.test.mjs
- lib/planning/recordCompletion.ts
- lib/planning/writerConvergence.test.mjs
- lib/trainingLoad/loadTrainingLoad.ts

### Inventario final de archivos nuevos (sin seguimiento)

- .core-reg-additional.log
- .core-reg-final-tests.log
- .core-reg-recovery-baseline.cjs
- .core-reg-recovery-baseline.log
- .core-reg-recovery-final-status.txt
- .core-reg-recovery-focused.log
- .core-reg-recovery-initial-status.txt
- .core-reg-recovery-related.log
- .core-reg-recovery-sql-checks.mjs
- .core-reg-recovery-sql.log
- .core-reg-recovery-test-audit.log
- .core-reg-recovery-typescript.log
- .core-reg-recovery-updated.log
- .core-reg-tests.log
- .core-reg-update-tests.mjs
- app/api/workouts/route.ts
- docs/core-6e-live-result.json
- docs/core-6g-live-result.json
- docs/core-6g-rendered-session.md
- docs/core-7c-live-coach-result.json
- docs/core-functional-e2e-result.json
- docs/core-reg-1-audit-proposal.md
- docs/core-reg-1-delivery.md
- docs/semantic-intake-1a2-adjudications-2026-09-22.json
- docs/semantic-intake-1a2-before-snapshot-2026-09-22.json
- docs/semantic-intake-1a2-code-2026-09-22.diff
- docs/semantic-intake-1a2-live-results-2026-09-22.json
- docs/semantic-intake-1a2-regressions-2026-09-22.json
- docs/semantic-intake-final-2026-09-22.diff
- docs/semantic-intake-final-code-2026-09-22.diff
- docs/semantic-intake-live-adjudications-2026-09-22.json
- docs/semantic-intake-live-baseline-http400-2026-09-22.json
- docs/semantic-intake-live-results-2026-09-22-A-extended-timeout.json
- docs/semantic-intake-live-results-2026-09-22.json
- docs/semantic-intake-live-summary-2026-09-22.json
- docs/semantic-intake-shadow-evaluation-2026-09-22-A.json
- docs/semantic-intake-shadow-evaluation-2026-09-22.json
- docs/sql/core-reg-1-workouts.sql
- lib/chat/evaluateSemanticIntake.mjs
- lib/chat/semanticEvaluationClassification.mjs
- lib/chat/semanticEvaluationClassification.test.mjs
- lib/chat/semanticIntakeLiveCorpus.mjs
- lib/chat/summarizeSemanticIntakeLive.mjs
- lib/execution/workoutContracts.ts
- lib/execution/workoutHandler.ts
- lib/execution/workoutHistory.ts
- lib/execution/workoutIntegrity.ts
- lib/execution/workoutProjections.ts
- lib/execution/workoutRegistry.test.mjs
- lib/execution/workoutRegistry.ts
- lib/execution/workoutRunningAdapter.ts
- lib/planning/runCoachWeekLive.mjs
- lib/sports/runWeekPrescriptionLive.mjs
