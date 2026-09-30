# CORE-REG — preparación del despliegue

Fecha: 2026-09-30. Continúa los informes `core-reg-1-delivery.md` y `core-reg-2-delivery.md`. No sustituye sus decisiones de producto: cuenta autenticada Free o de pago, formulario determinista, chat conversacional, legado de solo lectura.

**Preparación local; producción no intervenida.** No se ha hecho commit, push, despliegue, backfill, migración remota ni llamada real a un proveedor LLM. El ensayo entre conexiones de PostgreSQL/Supabase y el esquema efectivo del destino siguen siendo puertas de autorización, no resultados certificados por PGlite.

## 1. Cambios

- `core-reg-pagination.sql` añade cuatro vistas **no materializadas** sobre las autoridades existentes. `workout_current_records` selecciona primero la última revisión por atleta/ejecución; `workout_read_rows` conserva además las v1 inmutables; `workout_history_entries` combina las fuentes de la cronología; `workout_history_version` cuenta las filas append-only para detectar cambios durante una lectura. Ninguna guarda entrenamientos ni es una nueva fuente de verdad. Un índice de última revisión complementa los existentes.
- Historial usa keyset por fecha civil de ejecución e identidad, con orden binario explícito `C`; las fechas desconocidas quedan al final. Primero se resuelve la revisión vigente, después el borrado y la ventana temporal. Las revisiones antiguas no ocupan plazas. Las páginas solicitan como máximo 200 filas y continúan hasta una página vacía o el elemento de adelanto, incluso con un límite PostgREST inferior.
- El cursor lleva versión de formato, atleta, filtros, clave y contador de revisiones. Una mutación durante el recorrido devuelve `WORKOUT_CURSOR_STALE` (409); el cliente reinicia la lectura completa del mes hasta dos veces. No concatena páginas de estados distintos. Una lectura posterior empieza con el estado vigente; no conserva una instantánea antigua ni necesita backfill. Un cursor de la implementación anterior debe reiniciarse.
- El calendario consulta solo el mes visible, recarga al cambiar de mes y descarta respuestas de navegaciones anteriores. Conserva las acciones existentes y el refresco después del recibo del formulario.
- Crear/editar/borrar/recuperar recibos utiliza búsquedas exactas por ejecución o request ID. No recorre el historial de revisiones. El recibo se consulta antes del registro vigente para no combinar un recibo concurrente con una lectura vacía anterior.
- Carrera, evidencia reciente y carga consumen las revisiones actuales mediante páginas. Los lectores de contexto acumulativo que necesitan todas las ejecuciones lógicas conservan ese alcance, pero no transfieren revisiones canónicas sustituidas. El presupuesto existente de 200 ítems en la respuesta de evidencia del Coach sigue explícito, con `omittedItems`; ya no es un fallo de lectura por alcanzar 1.000 revisiones. Un array JSON heredado no se trata como un resultado truncado por PostgREST.

### Continuidad histórica

- No se actualizan `usuarios.workout_history`, `weekly_plan` ni las filas de carrera v1. Se prueban sus contenidos poblados antes y después de ambas migraciones.
- Cada fuente conserva su procedencia y verificación: v2 canónica, carrera v1 firmada, historial heredado no verificado y reportes/completados históricos del plan. Un completado sin fecha conocida conserva fecha desconocida; no toma como fecha ejecutada la fecha prescrita.
- Una prescripción sin evidencia de ejecución no entra en la cronología de entrenamientos realizados. El Coach mantiene separados planificación y ejecución, sin copiar dosis prescritas.
- Se deduplica por igualdad explícita de `executionId`/`workout_id`, referencias canónicas exactas a plan/sesión o `operationId` de un reporte. Coincidir en fecha o texto no demuestra identidad. Una asociación v1 que solo tenga `sessionId`, sin plan/semana verificable, no se usa para ocultar otro registro.
- Las versiones v1 contradictorias se verifican juntas antes de su proyección; se conservan los diagnósticos de conflicto y no se sustituye la evidencia conflictiva por cantidades de un duplicado heredado.
- Las acciones de edición/borrado en Historial siguen limitadas a `running_execution_records.v2`. El backend rechaza mutaciones de IDs heredados. No existe conversión automática.

## 2. SQL y comprobaciones preparadas

Orden de los artefactos:

1. Prerrequisito **ya desplegado y comprobado**, `docs/sql/b32c-running-execution-records.sql`. No ejecutarlo otra vez.
2. `docs/sql/core-reg-preflight.sql`: solo lectura. Comprueba versión PostgreSQL (15+), autoridades, columnas, objetos previos, índices/restricciones, RLS, políticas, roles, membresías y privilegios. Devuelve conteos/fingerprints de carrera v1, arrays de perfil y sesiones del plan, sin imprimir entrenamientos.
3. `docs/sql/core-reg-1-workouts.sql`: migración transaccional existente, sin cambios en esta fase. Columnas, restricción v2, índices de idempotencia y revisión, escritor con bloqueo por atleta, revocación de INSERT directo. El SQL no verifica HMAC; lo hacen los lectores/escritor backend.
4. `docs/sql/core-reg-pagination.sql`: migración transaccional adicional, de una sola aplicación, con vistas invoker, índice y función de normalización de fecha. Revoca también los grants por defecto de `service_role` sobre los objetos nuevos antes de conceder SELECT/EXECUTE mínimos.
5. `docs/sql/core-reg-postflight.sql`: solo lectura. Falla ante RLS desactivada, índices inválidos, restricción ausente, search_path/SECURITY DEFINER inesperados o privilegios efectivos incorrectos. Inspecciona las definiciones y repite fingerprints y comprobaciones de duplicados.

PRE/POST se ejecutan en PGlite poblado en la suite. Los fingerprints son para comparar durante una ventana sin escritores concurrentes; no son firmas de autenticidad ni sustituyen el lector HMAC. Revisar también el propietario efectivo de `mutate_workout`, su posibilidad de escribir bajo RLS, SELECT de `service_role` sobre perfiles/planes y que nadie no confiable pueda escribir en su search_path. Los permisos se revisan **efectivamente**, incluidas membresías, no solo por ACL nominal.

No reaplicar a ciegas: si PRE muestra `mutate_workout` o vistas ya existentes, comparar definiciones y estado con el artefacto autorizado. Detenerse ante un despliegue parcial/divergente; no añadir `IF NOT EXISTS` para ocultarlo. Los contenedores históricos malformados requieren una decisión separada; no se reparan mediante conversión.

## 3. Ensayo real de concurrencia pendiente

`node scripts/core-reg-concurrency.mjs --check` devuelve actualmente:

```json
{"psqlAvailable":false,"testEndpointConfigured":false,"writes":false}
```

Se preparó `scripts/core-reg-concurrency.mjs`. Abre **dos procesos/conexiones psql**, retiene el bloqueo advisory del primer escritor y solapa el segundo. Exige un commit y un replay al crear con la misma clave; después un commit y un conflicto de revisión al editar. Comprueba dos filas finales y aislamiento del segundo atleta. No equivale al Promise.all de PGlite.

Para ejecutarlo, después de autorizar una base **vacía y desechable de pruebas** e instalar/disponer de `psql`:

```powershell
# Proporcionar mediante el gestor seguro de secretos; nunca pegar credenciales en logs.
# CORE_REG_TEST_DATABASE_URL = URL de PostgreSQL de PRUEBAS
# CORE_REG_TEST_HOST = hostname exacto de PRUEBAS si no es localhost
$env:CORE_REG_TEST_ACK='EMPTY_DISPOSABLE_DATABASE'
node scripts/core-reg-concurrency.mjs
```

El script no lee `.env.local`, no borra tablas y se niega a usar una base que ya contenga cualquiera de las tres autoridades. Conserva las filas sintéticas para inspección. Requiere permisos de creación en ese entorno; no se concede ni modifica acceso en producción. Para un Supabase de staging con tablas existentes, crear una base/instancia de pruebas separada o acordar un ensayo específico antes de ejecutar: no eludir la comprobación de base vacía.

## 4. Secuencia exacta propuesta de despliegue

**Los pasos remotos requieren la autorización posterior del usuario. No se han ejecutado.**

1. Identificar explícitamente staging y producción, operador, versión PostgreSQL, proyecto Supabase, revisión/artefacto de aplicación y ventana de mantenimiento. Revisar la selección de archivos: este working tree contiene trabajo ajeno y archivos sin seguimiento; no publicar el árbol completo ni incluir `.env.local`, logs de evaluación o scripts temporales de edición. Incluir los nuevos archivos de API, formulario, contratos, lectores y SQL de CORE-REG-1/2/preparación.
2. Obtener autorización para el entorno de pruebas. Ejecutar el ensayo anterior, PRE/POST sobre el esquema de staging equivalente al destino y el flujo autenticado con dos atletas sintéticos (uno Free): crear, respuesta perdida/reintentar, recuperar recibo, editar, conflicto, borrar, aislamiento, historial heredado y navegación por meses. Usar solo formularios/API deterministas, sin proveedor LLM. Revisar el plan SQL con `EXPLAIN (ANALYZE, BUFFERS)` en staging poblado para el atleta de mayor volumen. Si algo falla, no continuar a producción.
3. Obtener autorización para inspección PRE de producción. Ejecutar `psql -X -v ON_ERROR_STOP=1 -f docs/sql/core-reg-preflight.sql` con la conexión de producción previamente verificada, configurada de forma segura fuera del comando. Guardar resultado protegido e identificar diferencias. No ejecutarlo contra una conexión por defecto no identificada.
4. Con PRE aprobado, backup/PITR y procedimiento de restauración confirmados por el operador, solicitar autorización específica de migraciones y release. Confirmar que la clave usada para verificar HMAC se conserva: cambiar `SUPABASE_SERVICE_ROLE_KEY` invalida las firmas existentes con el diseño actual. La rotación de claves necesita un plan separado.
5. Poner el registro y los escritores antiguos en mantenimiento; detener también cambios concurrentes del perfil/planes durante la captura de fingerprints. No dejar clientes antiguos insertando directamente mientras se revoca INSERT. Mantener acceso restringido hasta completar SQL y aplicación.
6. Configurar en la sesión de migración `lock_timeout='5s'` y un `statement_timeout` acordado (por ejemplo `5min` tras el ensayo). Ejecutar una sola vez, con `ON_ERROR_STOP=1`, `core-reg-1-workouts.sql` **solo si PRE confirmó que no estaba aplicado**. A continuación, en otra ejecución controlada, `core-reg-pagination.sql` **solo si no estaba aplicado**. Cada archivo contiene BEGIN/COMMIT; no envolverlos en otra transacción ni continuar tras un error.
7. Ejecutar `core-reg-postflight.sql` y comparar los tres fingerprints con PRE. Los duplicados deben ser cero; permisos, definiciones y RLS deben coincidir. Solicitar la recarga de esquema PostgREST con `NOTIFY pgrst, 'reload schema';` dentro de esta fase autorizada y comprobar que sus endpoints reconocen función, columnas y vistas. No abrir todavía las escrituras.
8. Publicar el artefacto revisado de aplicación compatible con ambas migraciones, mantener mantenimiento y comprobar lecturas autenticadas con cuenta de prueba autorizada: visitantes rechazados, cuentas Free admitidas, cronología/carrera heredada legible, formulario presente, chat sin registro. El despliegue de código no se realiza antes del esquema requerido.
9. Autorizar por separado cualquier smoke de **escritura en producción**, si se desea. No está incluido en esta tarea ni en las comprobaciones de solo lectura. Los ensayos sintéticos de CRUD se hacen en staging.
10. Reabrir acceso gradualmente cuando SQL, autenticación, lectura e interfaz sean correctos. Vigilar errores `WORKOUT_READ_FAILED`, `WORKOUT_HISTORY_READ_FAILED`, `WORKOUT_STORED_INTEGRITY_INVALID`, cursores stale reiterados y latencia. No registrar payloads, firmas ni claves. Ante errores de integridad/permisos, cerrar el registro y aplicar el procedimiento siguiente.

## 5. Recuperación

- **Fallo dentro de una migración:** `ON_ERROR_STOP` detiene el proceso; cerrar la sesión revierte su transacción no confirmada. En una sesión interactiva abortada, ejecutar `ROLLBACK`. Confirmar objetos y fingerprints antes de reintentar. Se ensaya localmente un fallo después del ALTER con datos v1 poblados: no quedan columnas ni datos modificados.
- **CORE-REG-1 confirmado, paginación fallida:** mantener mantenimiento. El primer COMMIT no se revierte por fallar el segundo archivo. Preservar columnas, índices, recibos y filas; inspeccionar PRE y corregir/aplicar únicamente la parte pendiente bajo nueva revisión. No ejecutar la primera migración otra vez ni borrar objetos para que “pase”.
- **Aplicación falla después del SQL:** conservar el esquema y toda evidencia. Mantener bloqueadas las escrituras y reparar hacia delante o volver a un artefacto probado que entienda v2 y sus tombstones. No volver sin más al código anterior a CORE-REG-1: puede interpretar mal v2 o depender de INSERT directo. No restaurar grants antiguos como atajo.
- **Después de aceptar entrenamientos reales:** nunca DROP de columnas/tablas/vistas como rollback de datos, ni restauración destructiva sobre el primario. Si fuera necesario usar backup/PITR, restaurar en una instancia separada para inspección/reconciliación autorizada. La corrección no debe perder escrituras aceptadas.

## 6. Pruebas locales

Las suites ejecutan los componentes/handlers reales con identidades sintéticas y SQL PGlite, sin red hacia Supabase ni LLM.

| Comprobación final | Resultado | Evidencia |
| --- | --- | --- |
| Focalizadas y regresiones consolidadas | **717/717**, cero fallos/omitidas | `.core-reg-deploy-consolidated.log` |
| TypeScript después de terminar el build | **Exit 0**, sin diagnósticos | `.core-reg-deploy-typescript-after-build.log` |
| Next 16.2.6, webpack, modo compile | **Exit 0**, compilación correcta | `.core-reg-deploy-build-final.log` |
| SQL PRE/POST, continuidad poblada, volumen, seguridad y rollback | **6/6**, incluidas en las 717 | `workoutPagination.test.mjs` |
| Ensayo real de concurrencia | **Pendiente**, sin psql/destino de pruebas | `scripts/core-reg-concurrency.mjs --check` |
| Sintaxis del ensayo preparado | `node --check scripts/core-reg-concurrency.mjs`, exit 0 | Sin conexiones ni escrituras |
| `git diff --check` | **Exit 0** | Avisos LF/CRLF, sin errores de whitespace |

Comando consolidado:

```text
node --test --test-concurrency=2 lib/execution/*.test.mjs lib/auth/*.test.mjs lib/chat/coachFirst.test.mjs lib/chat/groundedCoach.test.mjs lib/chat/coachOutputContract.test.mjs lib/chat/coachOperationDiagnostics.test.mjs lib/chat/conversationSession.test.mjs lib/chat/coachFirstLongitudinalRecovery.test.mjs lib/core/recentTrainingEvidence.test.mjs lib/planning/recordCompletion.test.mjs lib/planning/writerConvergence.test.mjs lib/trainingLoad/*.test.mjs lib/diagnostics/groundingTrace.test.mjs lib/athlete/athletePrescriptionContext.test.mjs lib/planning/productionPlanningAudit.test.mjs lib/sports/runningExecutionReuse.test.mjs lib/sports/runningDoseEvidenceAuthority.test.mjs lib/athlete/runningHabitualDeclarations.test.mjs
```

Compilación local: `NEXT_TELEMETRY_DISABLED=1 node node_modules/next/dist/bin/next build --webpack --experimental-build-mode compile`. Después, **secuencialmente**, `node node_modules/typescript/bin/tsc --noEmit --incremental false`. El modo compile no genera un despliegue ni completa generate/generate-env. La configuración existente omite el chequeo TS en build, por lo que se ejecutó TypeScript independientemente.

Incidencias resueltas durante la validación: fixtures que conocían solo la tabla anterior, expectativas del límite retirado y una aserción sobre el orden de finalización de lectores concurrentes. Se preservaron las verificaciones de autenticación, fallos de almacenamiento e integridad. La primera ejecución simultánea de TypeScript/build produjo TS6053 porque Next regeneraba `.next/types`; la repetición secuencial pasa sin modificar fuentes ni configuración. Los logs intermedios se conservan, pero el resultado vigente es la ejecución consolidada y TypeScript posterior al build. No sumar ejecuciones parciales solapadas.

Cobertura añadida: 3.900 filas / 1.300 ejecuciones actuales / 1.200 activas; cap de servidor de 17 filas; revisión vigente antes de filtro; cursor ligado al atleta/ventana, invalidación concurrente y reinicio de UI; consultas exactas tras muchas revisiones; continuidad poblada antes/después; deduplicación explícita y conflictos v1; permisos efectivos y SQL PRE/POST; rollback transaccional; calendario mensual y ausencia de acciones para legado.

Fallo preexistente separado: `groundingInputIncident.test.mjs`, primer caso, `bodies[0].codigo` sobre undefined, línea 40; **3/4**. Es el mismo fixture `fetch` frente a `authenticatedFetch` documentado en CORE-REG-1/2. No se modificó ni eliminó.

## 7. Archivos de esta fase

Código modificado sobre el working tree recibido:

- `app/historia/page.tsx`
- `lib/execution/workoutRegistry.ts`, `workoutHandler.ts`, `workoutHistory.ts`, `runningExecutionStore.ts`
- `lib/core/recentTrainingEvidence.ts`
- `lib/trainingLoad/loadTrainingLoad.ts`
- `lib/diagnostics/groundingTrace.ts`

Fixtures/pruebas adaptadas, sin retirar controles de integridad o titularidad:

- `lib/execution/workoutRegistry.test.mjs`, `workoutForm.test.mjs`, `runningExecution.test.mjs`
- `lib/auth/productAccess.test.mjs`
- `lib/core/recentTrainingEvidence.test.mjs`
- `lib/chat/coachFirst.test.mjs`, `groundedCoach.test.mjs`
- `lib/athlete/athletePrescriptionContext.test.mjs`
- `lib/trainingLoad/loadTrainingLoad.test.mjs`
- `lib/sports/trainingContractTestRuntime.mjs`

Nuevos:

- `lib/execution/workoutReads.ts`
- `lib/execution/workoutPagination.test.mjs`
- `lib/execution/workoutSqlTestDatabase.mjs`
- `docs/sql/core-reg-pagination.sql`, `core-reg-preflight.sql`, `core-reg-postflight.sql`
- `scripts/core-reg-concurrency.mjs`
- Este informe, logs `.core-reg-deploy-*.log`, inventario final y auxiliares `.core-reg-*.cjs` de esta edición. Los auxiliares de reemplazos son artefactos de trabajo **no idempotentes; no reejecutar**.

## 8. Puertas pendientes y límites

- Sin conexión autorizada ni herramientas para PostgreSQL/Supabase de pruebas: concurrencia real pendiente. La disponibilidad se comprobó sin escrituras. PGlite no certifica conexiones competidoras ni roles del destino.
- Esquema, políticas, grants heredados, PostgREST, fingerprints y tiempos de consulta de producción pendientes de PRE/POST autorizado. Se prepararon consultas; no se afirma que el destino ya sea compatible.
- Falta E2E manual/visual en navegador con Supabase de staging. La prueba local de componentes no sustituye esa sesión.
- Las claves detectan cambios canónicos durante el recorrido; no son snapshots permanentes. El legado debe permanecer inmutable, como exige la decisión de producto. Las herramientas ajenas que alteren tablas históricas directamente quedan fuera del protocolo.
- La cronología heredada vive en arrays JSON existentes: PostgreSQL debe expandirlos para filtrarlos. No se transfieren enteros al calendario, pero su coste SQL depende del volumen real; medir en staging. Los lectores acumulativos del Coach conservan su alcance histórico explícito.
- No desplegar un working tree con cambios ajenos sin seleccionar y revisar el artefacto. No se ha creado una release ni un commit en esta tarea.

El siguiente paso es autorizar **las verificaciones de staging y PRE del destino**, no un despliegue ciego. No pasar a producción hasta resolver esas puertas.

## 9. Estado del working tree

Inicio: **28 archivos seguidos modificados, 73 sin seguimiento, 0 staged**. Final: **31 archivos seguidos modificados, 111 sin seguimiento, 0 staged**. Incluye CORE-REG-1, CORE-REG-2, esta preparación y los artefactos ajenos preexistentes; no se han eliminado, reseteado ni restaurado. Inventario completo: `.core-reg-deploy-final-status.txt`.

Rama `main`, un commit **preexistente** por delante de `origin/main`. No se ha hecho commit/push ni se ha creado una release. Los procesos de validación de esta tarea han terminado. Se detiene el trabajo antes de toda operación remota.

SHA-256 de los SQL revisados:

| Archivo | SHA-256 |
| --- | --- |
| core-reg-1-workouts.sql | `3F610185BCF8DC87928BBB52988A3D0CE9E3E24FFDB8F7D5835A6E860A94FA2D` |
| core-reg-pagination.sql | `21849CE89D0A4690B7AD58CE06AD9C9564D3530F91826679A0C0FF95C05F1137` |
| core-reg-preflight.sql | `8AFF37D23B28C44FB175C034E8307C9EE49FE6B59376034D9BF2AD63559BD7AE` |
| core-reg-postflight.sql | `5A010C33D6C89E4461D12A9A4EE24D3B37A57D2167F31523C829E8C0AA42E0E8` |
