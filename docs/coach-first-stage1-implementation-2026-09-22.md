# FORGE — Etapa 1 Coach-first — implementación

Fecha: 2026-09-22. Fuente: `coach-first-architecture-audit-2026-09-22.md` y prompt de implementación de Etapa 1.

Se implementó una entrada productiva aislada bajo `NEXT_PUBLIC_FORGE_COACH_FIRST=1`, **OFF por defecto**. No se activó el flag, no hubo evaluación live, acceso a datos productivos, commit ni push. No se retomó Semantic Intake ni 1A.2. Las pruebas usan proveedores simulados y bases en memoria; no certifican la interpretación de un LLM real.

## Entrada y arquitectura efectiva

Web entra desde `FormaPro.enviar`, antes del shadow y de las ramas pending. Envía el texto original, conversación reciente, adjuntos y contexto pendiente a `/api/chat`, con `action: coach_first`, `messageId` estable para esa petición y Bearer token. No usa el wrapper de retries legacy. Las data URLs de adjuntos se separan en MIME/base64; el texto no recibe etiquetas ni transformación lingüística. Los tokens de generación legacy no se envían al Coach como contexto pendiente.

Móvil puede utilizar el mismo contrato; también se admite `enviar_mensaje_coach` con `datos.mensaje`, `messageId` y el resto del contexto. Un cliente móvil antiguo sin la nueva identidad/contrato falla cerrado con el flag ON. No se modificó una aplicación Expo externa a este repositorio.

El backend verifica el principal con `verifySupabasePrincipal` (Supabase Auth) y resuelve el atleta con `resolveAuthenticatedAthlete`. Un `codigo` contradictorio se rechaza; `authUserId` del cliente no autentica. Todas las tools quedan ligadas al código resuelto en servidor. La conversación aportada por cliente es contexto no confiable, nunca evidencia de autenticación.

El Coach recibe mensaje y metadata por separado, sin contexto longitudinal obligatorio. Puede responder, aclarar, pedir lecturas o emitir operaciones estructuradas. Hay un máximo de 8 rondas, 8 calls por respuesta y 24 calls por turno. Una respuesta directa hace una llamada Coach. La salida JSON se valida técnicamente; no hay reparación semántica, clasificador ni reviewer general.

El timestamp es del servidor y la zona civil es Atlantic/Canary, coherente con las autoridades actuales. No se usa el reloj del cliente para fechar writes. Se admiten hasta tres adjuntos JPEG/PNG/WebP/PDF, dos millones de caracteres base64 por adjunto; los recibe el Coach, sin extractor lateral.

## Autoridades reutilizadas y tools

| Capacidad | Implementación y autoridad |
|---|---|
| `read_context` | Proyecciones acotadas de sesión, semana, Availability, estado, restricciones, objetivos, eventos, historia, carga y planning. Reutiliza `getCanonicalRestrictions`, `loadAthletePrescriptionContext`, `loadTrainingLoad` y proyecciones existentes. Cache por turno invalidada tras acciones. |
| `update_availability` | Adaptador estructurado sobre `updateChatAvailability`, resolución/fallback, scope, digest, CAS y readback existentes. |
| `update_session` | `applyChatCoachActions`, contrato deportivo, `parseStructuredSession`/`renderContractSession`, dosis/referencias, `validatePlanMutation`, `mutatePlanWithCAS`; readback adicional en Coach-first. |
| `record_execution` | Enlazada: autoridad existente de `record_performed` en `chatCoachActions`. Externa: writer estructurado acotado en `recordCompletion.ts`, sobre el almacén existente `usuarios.workout_history`, con CAS/readback. |
| `record_athlete_data` | Única variante admitida: `reported_event`. CAS de `perfil.reported_events`, sin tabla nueva ni profile patch genérico. |
| `transition_restriction` | Devuelve `confirmation_required` y remite al flujo protegido existente. El chat no ejecuta altas ni crea diagnósticos. |
| `generate_week` | Coordinador backend de preflight → Analyzer → `planBoundedWeek` → `generateTrainingSession` → validación whole-week → persistencia existente. |

`chatCoachActions` conserva su comportamiento legacy por defecto. La ejecución interna Coach-first proporciona un loader local de autoridades y omite únicamente reviewer y extracción lingüística del límite de tiempo. El límite de tiempo llega como número validado. No se duplicó el motor de acciones. `sessionDoseContext` solo estrecha su tipo de entrada a los campos realmente consumidos.

Las lecturas permiten fechas a un máximo de 366 días del día actual; el límite es 1–60 y la respuesta está acotada a 120 KB. `load` representa una ventana de hasta 60 días. `history` devuelve los últimos N registros e indica truncado. Ausencia de sesión/semana se expresa como unknown; errores de lectura no se convierten en datos vacíos verificados. El contexto amplio se carga únicamente cuando se solicita `planning` o la generación lo necesita.

## Exclusión legacy y rollback

Con ON, el POST rechaza las operaciones legacy enumeradas en `legacyConversationOperations` antes de llegar a sus writers. Incluye clasificadores/extractores del turno, corrección lingüística de disponibilidad, confirmación pending, extracción de imagen, PR/sueño/ejecución/carga externa, respuestas lingüísticas de onboarding de prescripción, updates genéricos de usuario y las cuatro entradas públicas del orquestador semanal. Las cuatro etapas de planning solo se invocan internamente con contexto confiable del atleta autenticado. No se hace una petición HTTP al endpoint antiguo para interpretar el mensaje.

El cliente retorna tras Coach-first: no ejecuta pending interceptors, fan-out de extractores, etiquetado temporal ni writers posteriores. La ruta shadow comprueba también el flag del servidor; su contrato 1A permanece igual. No se ejecutan `runChatCoach`/`answerGroundedChat` en el turno nuevo, porque su camino actual incorpora grounding/review y efectos no necesarios. Sí se reutilizan sus autoridades de acción.

Con OFF continúa el recorrido anterior. Dos excepciones de compatibilidad son intencionales: una petición explícitamente Coach-first nunca se redirige a legacy, y la generación legacy se bloquea si hay eventos nuevos relevantes que no sabe proyectar. Los eventos cancelados o fechados fuera de la semana no bloquean esa semana; un evento sin fecha exige reconciliación. No se borra el reporte para desbloquearla. El flag global también bloquea usos no conversacionales de los endpoints genéricos enumerados; esos formularios no se han migrado en Etapa 1.

## Availability y eventos

`update_availability` admite confirmación sin write, patch, replace semanal completo y excepción fechada. El adaptador exige claves/días estructurales, semana válida y digest. No entrega el mensaje a `parseChatAvailability`, `resolveWeeklyAvailabilityResponse` ni a parsers de confirmación. Las ramas legacy conservan sus parsers solo con OFF.

Patch conserva disciplinas omitidas; `[]` significa cero. Replace requiere todas las disciplinas autorizadas. Un override histórico inválido conserva el fallback habitual válido. Las excepciones fechadas se guardan en `prescription_access` sin sustituir la base semanal; retirarlas recupera esa base. No se alteran training sources/ownership. Error de write/readback se considera incierto y no provoca retry.

Un evento contiene id, descripción, estado, revision 1 y procedencia (mensaje/id/operationId/timestamp); fecha, intervalo, detalles e intención se guardan solo si llegan. No se añade prioridad, distancia, sportId ni importancia por defecto. No cambia `objetivo_principal` ni `EVENT_GOAL_CATALOG`. Se admite cualquier descripción, incluidas modalidades desconocidas. El límite actual es 256 eventos; no se elimina evidencia automáticamente.

El ejemplo multi-intent conserva Box martes/jueves, Carrera lunes/miércoles/viernes/domingo, sábado sin entrenamiento y evento del domingo con 5 km. El test entrega esas operaciones desde un Coach simulado y comprueba el estado persistido: no existe una gramática de frases que lo haga pasar. Pending llega como contexto y no consume el mensaje antes del Coach.

## Sesiones, ejecución y restricciones

Una adaptación exige fecha, sessionId y revisión reales. Se vuelve a comprobar scope, estado no completado, restricciones y perfil; se validan contrato, dosis y referencias y se persiste con CAS. Se conserva la distinción original/adaptado/ejecutado. Los tests incluyen REST, TRAIN ejecutable, target externo, target completado y movimiento prohibido. No se regenera la semana ni se diagnostica una lesión para hacer el cambio local.

La ejecución externa conserva fecha, descripción, disciplina, origen, operationId y cantidades presentes, sin tocar `weekly_plan`. La enlazada requiere target/revisión y asociación explícita estructurada; guarda evidencia del reporte y medidas declaradas, sin copiar la prescripción. La autenticación y target son verificables; la correspondencia semántica con lo dicho por el atleta sigue siendo responsabilidad del Coach. No se afirma que un booleano del modelo pruebe significado.

La máquina de restricciones existente no se modifica. `ya estoy bien` no dispara alta. Las transiciones protegidas siguen disponibles por su flujo existente; la tool devuelve el requisito, no simula una transición exitosa.

## Generación y efectos del Analyzer

La preparación utiliza snapshots firmados de `beginWeeklyGeneration`, includeToday booleano y preflight existente, conservando sesiones protegidas/completadas, scope, restricciones, objetivo, ciclo, recuperación y contratos de planning. La generación se limita a semana actual o siguiente, como la autoridad existente.

El mismo snapshot de eventos y disponibilidad efectiva, con sus digests, semana e includeToday, se proyecta en Analyzer, Weekly Coach, Builders y reparaciones whole-week. Antes de cada etapa y justo antes del CAS final se vuelve a comprobar que eventos y Availability no cambiaron. Los recibos calendario/sesión/whole-week siguen siendo los existentes; no se aceptan recibos emitidos por el modelo.

| Efecto previo | Momento/riesgo anterior | Tratamiento Coach-first |
|---|---|---|
| `usuarios.athlete_development` | Recalcula seguimiento y hace update antes de llamar al Analyzer. Aunque el cálculo sea estable para las mismas entradas, no había CAS/recibo de generación; una llamada fallida podía haber escrito. | Se mantiene el cálculo en memoria para el análisis, **se suprime su persistencia** en este camino. |
| `athlete_coaching_notes.status=considerada` y `updated_at` | Después de interpretar la respuesta del Analyzer, antes de Weekly/Builders/save. Repetir cambia timestamp y no implica que se haya generado un plan. | **No se escribe** en Coach-first, incluso si el Analyzer devuelve ids de notas incorporadas. |
| Reserva `usuarios.ciclo_actual` de `ensureLongitudinalTarget` | Antes de Builders, dentro del planning existente. Puede quedar reservada aunque falle construcción. | Se conserva la autoridad CAS existente, indexada por semana/positions: volver a esa semana reutiliza el target, no suma otro avance. No se declara rollback global. |
| Outcomes, generation log y auditoría semanal | Después del commit del plan en el writer existente; no son una transacción global. | Se mantienen después de commit **y readback Coach-first**. Fallos se conservan como warnings; no se reejecuta el turno. La auditoría vincula operationId y digests al recibo whole-week. |

La separación mínima elegida para los dos efectos propios del Analyzer es no persistirlos, tampoco después del éxito. No se implementó una cola/outbox ni se reescribió Analyzer. Por tanto, las notas siguen pendientes y el seguimiento se recalcula al analizar; no se promete sincronización auxiliar que no existe. Podrían diferirse detrás de un recibo en una futura consolidación, pero hacerlo con garantías durables requeriría una política adicional de reconciliación.

Fallos tras iniciar planning se devuelven como partial/unknown/conflict terminal. Un resultado incierto no confirma plan ni reintenta generación. El readback del plan ocurre antes de los efectos auxiliares posteriores. El operationId se devuelve, se observa y queda relacionado con el turno y la auditoría cuando esta escritura concluye.

## Concurrencia, recibos y observabilidad

Antes del proveedor se reclama el `messageId` mediante CAS de `perfil.coach_first_turns`; el id deriva del atleta y messageId y se verifica un digest del payload. Dos reclamaciones concurrentes no ejecutan dos turnos. Una reclamación aplicada cuya respuesta se pierda tampoco se reejecuta. No hay expiración ni eliminación automática de claims: el límite de 512 turnos falla cerrado. Es un diario técnico, no aprendizaje ni escritura automática de hechos del atleta.

Cada tool recibe un operationId del servidor. Al finalizar se guardan recibos compactos de acciones/estados; los writers conservan su CAS/readback. Un conflicto o resultado partial/unknown termina el loop, sin ejecutar las siguientes acciones. Las acciones independientes anteriores pueden haber quedado guardadas: no se finge atomicidad del turno completo. Una caída antes de finalizar el diario deja el claim y exige reconciliación, nunca retry ciego.

`COACH_FIRST_OPERATION` registra ruta, llamadas Coach, tools/reads, acciones aceptadas/rechazadas, autoridad, resultado, CAS conflict, unknown/partial, operationId y duración. `CHAT_ROUTE` identifica el recorrido legacy. No se registran claves, razonamiento interno ni mensajes desde esta instrumentación. El contador Coach no pretende incluir las llamadas internas de Analyzer/Weekly/Builders y sus reparaciones; su tracing existente sigue separado.

## Validación offline

Nuevo archivo `lib/chat/coachFirst.test.mjs`: **23/23 PASS** (13.040 s en ejecución aislada). Cubre A–N: fast path y texto intacto; multi-intent/pending; patch/zero/fallback/excepciones; TRAIN/REST, restricciones, scope y completadas; ejecución externa/enlazada; transición protegida; identidad real con Auth simulado; POST real que bloquea operaciones legacy; CAS/concurrencia/replay incierto; evento desconocido; propagación del snapshot a generación y aborto al cambiar; rollback; Analyzer real sin sus dos writes; fallo de readback tras write.

Regresión focalizada: **511/511 PASS** (67.634 s), antes de añadir los tres últimos tests nuevos. Comando:

```powershell
node --test --test-reporter=tap lib/chat/coachFirst.test.mjs lib/sports/chatAvailability.test.mjs lib/chat/groundedCoach.test.mjs lib/planning/weeklySave.test.mjs lib/planning/weeklyAuthorityBinding.test.mjs lib/planning/weeklyGenerationPreflight.test.mjs lib/athlete/athleteStateTransition.test.mjs lib/auth/athleteIdentity.test.mjs lib/auth/legacyContainment.test.mjs lib/physiology/recoveryContext.test.mjs lib/planning/sessionEnvironmentConfirmation.test.mjs lib/chat/semanticIntakeShadow.test.mjs
```

Los tests anteriores que ejecutan fragmentos AST/VM ahora proporcionan las nuevas dependencias con flag OFF. No se relajaron assertions para hacerlos pasar. La primera suite completa detectó esos mocks incompletos; fueron corregidos. El test de restricciones nuevo exige el código concreto de restricción, y la VM comparte la clase Error para reproducir el comportamiento del proceso real.

Suite completa final (`node --test --test-reporter=tap lib/**/*.test.mjs`): **2806 tests, 2804 PASS, 2 FAIL preexistentes**, 362.660 s. Incluye los 23 tests Coach-first y las regresiones de autoridades. No quedan fallos nuevos detectados en esa ejecución.

`npx tsc --noEmit --incremental false`: PASS. `git diff --check`: PASS, sin errores de whitespace. Git no incluye archivos untracked en este último comando. No se ejecutaron evaluaciones live ni pruebas contra Supabase real.

Dos fallos preexistentes se dejan intactos: `weeklyAvailabilityDiagnostics.test.mjs`, diferencia null/non_string_member ya conocida; y `weeklyRemainingDiagnostic.test.mjs`, “real adapter, controlled restrictions…”, false/true. El segundo se reprodujo ejecutando el test con las versiones HEAD de los módulos modificados de su grafo cargadas en memoria, sin cambiar el árbol de trabajo ni volver HEAD atrás.

## Archivos de esta implementación

Nuevos: `lib/chat/coachFirstFlag.ts`, `coachFirstLoop.ts`, `coachFirstHandler.ts`, `coachFirstReads.ts`, `coachFirstTools.ts`, `coachFirstStore.ts`, `coachFirstGeneration.ts`, `coachFirst.test.mjs` y este informe.

Modificados: `app/FormaPro.tsx`, `app/api/chat/route.ts`, `app/api/semantic-intake-shadow/route.ts`, `lib/chat/chatCoachActions.ts`, `lib/sports/chatAvailability.ts`, `lib/sports/sessionDoseContext.ts`, `lib/planning/recordCompletion.ts`; y los harness de `lib/auth/legacyContainment.test.mjs`, `lib/physiology/recoveryContext.test.mjs`, `lib/planning/sessionEnvironmentConfirmation.test.mjs`.

`FormaPro.tsx` ya contenía cambios de Fase 1A; se conservaron. La ruta shadow y numerosos archivos 1A/documentos históricos ya eran untracked. El estado git final no debe confundirse con una lista de archivos creados íntegramente en esta etapa.

## Límites y trabajo restante para Etapa 2

- No se evaluó live la semántica, variabilidad, latencia real ni experiencia web/móvil desplegada. Los tests con Coach simulado prueban contratos y efectos, no comprensión de frases. No hay aprobación implícita para llamadas futuras al proveedor.
- Activación todavía OFF. La adopción móvil exige consumir el contrato autenticado nuevo. Antes de retirar legacy hay que migrar/verificar los consumidores de endpoints bloqueados, incluidos ajustes de perfil y botones de generación antiguos.
- La variante de datos del atleta es solo reported_event; no se migraron mediciones, PR, preferencias, objetivos ni respuestas de capacidades. Las transiciones de restricciones remiten al flujo protegido. No se promete que todas las preguntas pending legacy puedan persistirse con las tools actuales.
- Eventos son registros añadidos con procedencia; aún no hay edición/cancelación dirigida por id y revision de un evento anterior. No se debe interpretar un nuevo registro cancelado como borrado automático de otro.
- El diario tiene límite conservador de 512 turnos y los eventos 256. No hay reconciliador automático, recuperación de respuesta perdida ni retención duradera ilimitada. No habilitar uso general sin resolver esa operación del diario.
- La conversación nueva permanece en estado del cliente y se aporta en turnos siguientes; no se ha migrado la persistencia de historial legacy. Un reload puede perder ese contexto reciente. Los hechos explícitamente guardados sí permanecen en sus almacenes.
- Las medidas conocidas de ejecución se guardan con su origen. El agregador legacy de workout_history todavía mantiene duración/carga como desconocidas por su política de unidades no verificadas; no se le ha atribuido compatibilidad cuantitativa inexistente.
- Relectura de contexto y CAS de plan no constituyen una transacción entre perfil, fuentes, restricciones y plan. Subsiste una ventana entre última comprobación y commit, y los logs auxiliares pueden fallar después del plan. Se exponen incertidumbre/warnings; no se promete exactamente una vez global.
- La reserva longitudinal por semana puede sobrevivir a un fallo de Builders; es el comportamiento idempotente de la autoridad existente. Los dos writes auxiliares propios del Analyzer quedan suprimidos, no diferidos.
- Las comprobaciones de tamaño se hacen tras parsear JSON; el despliegue debe conservar límites HTTP adecuados. El coordinador reutiliza los límites/reparaciones existentes del planning; el timeout de 120 s del Coach no es un deadline global transaccional de generación.
- Etapa 2: validar adopción/operación del contrato compartido, resolver los límites anteriores que afecten al despliegue, migrar consumidores todavía necesarios y retirar selectivamente shadow1A, interceptores lingüísticos, clasificadores y extractores cuando no tengan consumidores. Conservar autoridades, adapters deportivos, evidencia histórica y compatibilidad de rollback. Repetir regresiones e integración web/móvil antes de activar; no borrar indiscriminadamente código mixto.

La implementación bajo flag y sus garantías offline están disponibles para revisión. La interpretación semántica live y la activación general no se declaran validadas.

## Git status final

HEAD permanece en `7f7e777e12ff1c95be07d96eaa40d8bb08bd88c2`. No commit. No push.

```text
 M app/FormaPro.tsx
 M app/api/chat/route.ts
 M lib/auth/legacyContainment.test.mjs
 M lib/chat/chatCoachActions.ts
 M lib/physiology/recoveryContext.test.mjs
 M lib/planning/recordCompletion.ts
 M lib/planning/sessionEnvironmentConfirmation.test.mjs
 M lib/sports/chatAvailability.ts
 M lib/sports/sessionDoseContext.ts
?? app/api/semantic-intake-shadow/
?? docs/coach-first-architecture-audit-2026-09-22.md
?? docs/coach-first-stage1-implementation-2026-09-22.md
?? docs/semantic-authority-audit-2026-09-22.md
?? docs/semantic-intake-1a2-adjudications-2026-09-22.json
?? docs/semantic-intake-1a2-audit-2026-09-22.md
?? docs/semantic-intake-1a2-before-snapshot-2026-09-22.json
?? docs/semantic-intake-1a2-code-2026-09-22.diff
?? docs/semantic-intake-1a2-evaluation-2026-09-22.md
?? docs/semantic-intake-1a2-live-results-2026-09-22.json
?? docs/semantic-intake-1a2-regressions-2026-09-22.json
?? docs/semantic-intake-final-2026-09-22.diff
?? docs/semantic-intake-final-code-2026-09-22.diff
?? docs/semantic-intake-live-adjudications-2026-09-22.json
?? docs/semantic-intake-live-baseline-http400-2026-09-22.json
?? docs/semantic-intake-live-evaluation-2026-09-22.md
?? docs/semantic-intake-live-results-2026-09-22-A-extended-timeout.json
?? docs/semantic-intake-live-results-2026-09-22.json
?? docs/semantic-intake-live-summary-2026-09-22.json
?? docs/semantic-intake-shadow-2026-09-22.md
?? docs/semantic-intake-shadow-evaluation-2026-09-22-A.json
?? docs/semantic-intake-shadow-evaluation-2026-09-22.json
?? lib/chat/coachFirst.test.mjs
?? lib/chat/coachFirstFlag.ts
?? lib/chat/coachFirstGeneration.ts
?? lib/chat/coachFirstHandler.ts
?? lib/chat/coachFirstLoop.ts
?? lib/chat/coachFirstReads.ts
?? lib/chat/coachFirstStore.ts
?? lib/chat/coachFirstTools.ts
?? lib/chat/contextRequirements.ts
?? lib/chat/evaluateSemanticIntake.mjs
?? lib/chat/semanticEvaluationClassification.mjs
?? lib/chat/semanticEvaluationClassification.test.mjs
?? lib/chat/semanticIntakeFixtures.mjs
?? lib/chat/semanticIntakeLiveCorpus.mjs
?? lib/chat/semanticIntakeShadow.test.mjs
?? lib/chat/semanticIntakeShadow.ts
?? lib/chat/semanticInterpretation.ts
?? lib/chat/semanticShadowClient.ts
?? lib/chat/semanticShadowHandler.ts
?? lib/chat/semanticShadowProvider.ts
?? lib/chat/summarizeSemanticIntakeLive.mjs
```
