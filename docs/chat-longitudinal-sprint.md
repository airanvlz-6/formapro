# Chat longitudinal — auditoría previa a cambios

Fecha: 2026-09-21. Árbol inicialmente limpio. Sin acceso a trazas ni datos del atleta de producción; el incidente se investiga por código y fixtures, no como reproducción de esa petición.

## Pipeline encontrado

| Etapa / archivo / función | Entrada → salida | Efecto sobre respuesta / bloqueo / escritura |
|---|---|---|
| `app/FormaPro.tsx`, `enviar` / `enviarSilencioso` | texto, UI → peticiones | Rama de generación semanal y confirmaciones propias; no son coaching ordinario. |
| `app/api/chat/route.ts`, `procesar_mensaje_contexto` | mensaje → clasificación, eventos, contexto, respuesta estática | Classifier/Aggregator pueden fallar antes del Coach. STATIC en cliente omite LLM. Contexto construido en cliente no entra en groundedReply. |
| `route.ts`, `groundedReply` / rama `coachGrounding` / `enviar_mensaje_coach` | mensaje autenticado → `runChatCoach` | Prompt cliente ignorado; proveedor Sonnet, 6000 tokens. Web captura cualquier excepción con fallback genérico; móvil devuelve error 500. |
| `lib/chat/groundedCoach.ts`, `loadChatGrounding` | usuario, fecha, DB → facts/advisory/conversation | Cualquier error requerido o scope no resuelto bloquea. Lecturas orientativas toleran fallos. |
| `lib/chat/athleteCoachingKnowledge.ts`, `persistCoachingKnowledge` | reporte actual → extracción determinista → CAS/readback | Recursos, incapacidad explícita, molestia presente. Excepción impide siquiera generar coaching. |
| `lib/chat/chatStateChange.ts`, `applyChatStateChange` | declaración explícita → disponibilidad temporal | Verificación, CAS, readback. Excepción bloquea coaching. |
| `lib/chat/adaptChatPlan.ts`, `adaptChatPlan` | días afectados → generación/admisión existente | Sin impacto no llama proveedor. Preparación puede lanzar; errores por semana producen pending. No modificar esta autoridad. |
| `runChatCoach` | escrituras → nueva lectura | Error de recarga bloquea respuesta. |
| `groundedCoach.ts`, `answerGroundedChat` | facts + advisory + últimos 6 mensajes + reporte → JSON LLM | Dos intentos; esquema y citas exactas obligatorios, incluido grounding no vacío. Extracción inválida descarta incluso answer utilizable. |
| `validateChatDecision` + GROUNDING_REVIEW | JSON/prosa → respuesta admitida | Grounding exacto; revisión semántica de hechos y escrituras. Rechazo o error termina en fallback. |
| `runChatCoach`, guardado historial | conversación → CAS, últimos 15 mensajes | Error retornado conserva answer; excepción lanzada lo pierde. |
| `FormaPro.tsx`, `forgeValidator`, `procesarTags`, `setMensajes` | content → texto visible | Reescritura de días y parser legacy posteriores al backend; posible excepción. Cliente vuelve a escribir historial y extraer memoria. |

## Origen exacto y causalidad

La frase «No he podido verificar toda la información necesaria para responder y confirmar los cambios. Revisa el plan antes de dar por guardada una adaptación.» es literal determinista en el catch de `coachGrounding === true && !action` en `app/api/chat/route.ts` (línea inicial 5447). Predicate: cualquier excepción de groundedReply. No permite distinguir lectura, esquema, proveedor, revisión, mutation o historial. No se puede conocer qué dato faltaba en aquella petición ni asegurar que existiera coaching válido sin sus trazas. La recitación anterior tampoco demuestra por sí sola qué rama la produjo.

## Contexto anterior, procedencia y límites

- DB/perfil: historial, workout_history, coaching_knowledge, señales de capacidad/material, disponibilidad, objetivo/ciclo/referencias; estado/restricciones canónicos, ejecuciones, planes, eventos y notas.
- Lectura compartida: últimas 4 filas semanales (no ventana exacta), completadas con descripcion_real, modificaciones (30), frecuencia, exposición, ejecución de carrera y fisiología. Readiness puede ser unknown. No equivale a ausencia de incidentes.
- Chat carga semana actual y hasta 21 días posteriores, objetivo, ciclo, restricciones, referencias, señales, conocimiento, eventos, disponibilidad; añade esas historias canónicas completas al prompt.
- Advisory: 2 block_outcomes y 8 notas pending/considerada; no prueba humana ni diagnóstico.
- Historial se corta a 15 mensajes de 12000 caracteres y el prompt conserva solo 6. No hay selección longitudinal. workout_history se lee pero sus reportes originales no se proyectan (solo vistas compartidas). Preferencias del perfil no se proyectan explícitamente.
- Contexto legacy de eventos/memoria montado en cliente no llega a groundedReply. No consultar indiscriminadamente texto legacy sin procedencia. Conversación assistant es interpretación, nunca evidencia humana. No hay garantía de conservar semanas de conversación ya truncada.

## Fallbacks antes

| Fuente / predicate | Sustituye u omite Coach | Tratamiento previsto |
|---|---|---|
| Web catch groundedReply, cualquier throw | Sí | Separar fallos de escritura y de respuesta/proveedor. |
| Móvil catch groundedReply | Error 500 | Mismo aislamiento backend. |
| Esquema/grounding/evidence inválido tras 2 intentos | Sí | Metadatos no deben invalidar prosa semánticamente apoyada. |
| Revisión detecta afirmaciones no apoyadas | Sí | Mantener reparación y rechazo de prosa insegura. |
| Provider error/timeout/respuesta vacía | Sí | Fallback técnico justificado. |
| STATIC en enviar, clasificación READ | Omite LLM | No omitir Coach conversacional por clasificación. |
| preparar contexto legacy lanza | Omite LLM | Dejar continuar con grounding backend. |
| forgeValidator/procesarTags lanza; catch cliente | Sí / Error. Intentalo de nuevo. | Respuesta grounded no pasa por escritores legacy. |
| adaptation pending, CAS historial sin filas | No | Mantener estados estructurados no destructivos. |
| Restricción ownership/generación, confirmación pending, onboarding | Flujos de acciones explícitas | Mantener, no son fallbacks del Coach. |

## Alcance autorizado

Cambios solo Chat, integración cliente/endpoint y proyección de lectura propia. Sin migración, sin cambios a Athlete State, contratos, Weekly/Session ni librerías deportivas. Baseline y resultados finales se registran abajo.

## Extensión — auditoría previa de adaptación activa

`weekly_plan.sessions` ya es JSON y conserva `titulo_real`/`descripcion_real` separados. `recordPlanCompletion` modifica solo ejecución. `prescriptionHistorySummary` diferencia PLANNED_ONLY/EXECUTED y nunca deriva cantidades ejecutadas del plan. `loadAthletePrescriptionContext` arma exposición desde descripcion_real. Los registros de carrera tienen otra autoridad verificada que no se sustituye.

`session_modification_events` conserva original/modified título, descripción y tipo, pero se escribe después del plan en `confirmar_pending_action`; no hay atomicidad para el original. Además esa ruta clasifica motivos como restricciones y puede crear Athlete State. No sirve para una molestia puntual sin diagnóstico. `actualizar_sesion_plan` conserva realizado pero pierde la prescripción anterior si no hay ledger. `pending_actions.accion` permite guardar una propuesta, no representa por sí solo prescripción vigente ejecutada. No hay session_logs genéricos consultados por este pipeline.

`generateTrainingSession` rechaza open_coach sin recibo semanal. No se elimina esa protección ni se cambia el Builder: un adaptador exclusivamente Chat reutiliza buildAllowedTrainingContract, parseStructuredSession, validateSessionAgainstTrainingContract/renderContractSession con v4 y coach-executable-v1. No inventa un árbitro deportivo. Reutiliza validatePlanMutation y mutatePlanWithCAS.

Justificación de la extensión mínima compatible: la sesión JSON admite metadatos y la infraestructura los conserva. Chat añadirá historial de prescripción dentro de la misma escritura CAS; el original y la adaptación quedan juntos incluso si falla el ledger secundario. La proyección compartida prescriptionHistorySummary expondrá ese historial opcional y el reporte realizado con procedencia, sin cambiar los resultados anteriores para sesiones sin metadatos Chat. Ningún cambio a generación, disponibilidad, periodización, Athlete State ni esquema SQL.

## Resultado implementado

1. **Pipeline actual:** mensaje autenticado → lectura backend/proyección longitudinal → declaraciones explícitas verificadas y disponibilidad temporal → Coach (interpretación, decisión, acciones opcionales) → revisión independiente de prosa → adaptaciones/ejecución/respuesta verificadas → CAS → aprendizaje opcional verificado → historial CAS → respuesta y estados. Ningún writer devuelve el texto del Coach ni tiene autoridad para sustituirlo.
2. **Fallback exacto anterior:** catch web de groundedReply; era determinista, no escrito por el modelo. Eliminado su texto ambiguo. El fallback restante informa de coaching no disponible y no confirma guardado.
3. **Incidente:** el código demostraba acoplamiento destructivo, extracción estricta y pérdida de contexto. No hay evidencia para atribuir retrospectivamente el caso a un error concreto ni identificar qué dato faltaba. REPORTE_ENTRENO ya era LLM en responseEngine; STATIC no prueba el origen de aquella recitación.
4. **Antes:** existían restricciones, planes, completadas, modificaciones, reportes, notas y conocimiento, con las limitaciones de lectura descritas arriba.
5. **Llegaba antes:** facts y advisory del servidor, seis mensajes; no el prompt/contexto legacy que preparaba el cliente.
6. **Separación:** los errores de conocimiento, disponibilidad, acciones, recarga e historial se convierten en estados. Extracción inválida se descarta sin descartar prosa que supera revisión semántica. Prosa sin envoltorio JSON también puede revisarse; JSON roto no se presenta como coaching.
7. **Llegada actual:** añade selección longitudinal de 18 entradas, 1800 caracteres por entrada, con fuente, categoría epistémica, fecha desconocida cuando falta y truncamiento explícito. Conserva seis turnos recientes incluso si un seguimiento corto no coincide léxicamente. Incluye reportes de workout_history antes descartados. Plan proyectado sin recibos/copias completas de contratos; últimos 64 conocimientos, 14 prescripciones y 14 completadas, con límites/conteos. Las autoridades completas de equipo/restricciones siguen disponibles.
8. **Mutation/coaching:** ninguna mutación es requisito para contestar. Una lectura fallida permite coaching provisional sobre el reporte, indicando UNKNOWN. No se transforma fallo de lectura en ausencia de restricciones. Revisión factual negativa sigue reparando/rechazando prosa no apoyada.
9. **Aprendizaje:** declaraciones soportadas conservan extractor/CAS/readback existentes. Otras citas pasan LEARNING_REVIEW y verificación literal, y se guardan como observaciones fechadas sin señales canónicas nuevas. No se promueven máximos, diagnóstico, recuperación clínica ni objetivos. Weekly ya consume coaching_knowledge y Session las señales explícitas; esas rutas no se rediseñan.
10. **Preguntas:** el prompt induce interpretar/conectar/acotar/decidir/preguntar, sin formato visible fijo ni recitación. Solo pregunta si falta un dato que cambia la decisión; integra el seguimiento ya reportado.
11. **Adaptación activa:** actions opcionales permiten adaptar localmente o días seleccionados, REST, registrar realizado y añadir respuesta posterior. No se regenera la semana por fatiga, dolor ni disponibilidad. El Coach elige. Se reutilizan admisión v4/coach-executable-v1 y persistencia CAS; no se modifica Session Builder.
12. **Historia:** chatPrescriptionHistory conserva original completo, adaptación, id, source=coach_chat, timestamp y motivo en la misma escritura que actualiza la sesión vigente. chatExecutionEvidence conserva citas PERFORMED/RESPONSE, fecha del reporte, fecha de ejecución y relación a la prescripción vigente. No se añaden tablas. Dosis legacy heredada se limpia de la prescripción actual y permanece en el original.
13. **Lectura compartida mínima:** prescriptionHistorySummary añade campos opcionales de linaje y ejecución. loadAthletePrescriptionContext y runningDoseEvidence usan disciplina realizada cuando existe evidencia Chat; los registros anteriores sin esos campos mantienen comportamiento. Se demuestra bike realizado sin carrera fantasma, tanto después de una adaptación como al reportar una ejecución distinta directamente.
14. **Cliente:** no omite Coach por STATIC; errores de contexto legacy no bloquean; respuesta grounded evita forgeValidator/procesarTags, extractor de memoria y segunda escritura/compactación del historial. El refresco de Mi Plan tras acciones no puede ocultar la respuesta si falla.
15. **Observabilidad:** CHAT_COACHING_PIPELINE contiene UUID, conteos, flags, fallbackReason y categorías de fallo. No contiene mensaje, prompt, perfil, respuesta del proveedor ni error crudo. mutationSucceeded significa que al menos una escritura fue confirmada; el resultado individual de cada acción permite distinguir éxito parcial. Activación: FORGE_CHAT_COACH_DIAGNOSTICS=1; estados resumidos también retornados al cliente.

## Fallbacks después

| Origen/predicate | Sustituye coaching válido | Estado final |
|---|---|---|
| Conocimiento/extracción rechazados, error o CAS | No | Sin aprendizaje confirmado; coaching conservado. |
| Disponibilidad/acción fallida o no confirmada | No | Resultado separado; alternativa ejecutable válida sigue visible si CAS falla. No repetir automáticamente. |
| Falta de grounding completo | No por sí sola | Contexto UNKNOWN y reporte actual. |
| Guardado/lectura de historial falla | No | historySaved=false. |
| STATIC de clasificación | No | Cliente continúa al Coach. |
| Contexto legacy falla | No | Continúa lectura del servidor. |
| Extracción secundaria o parser legacy de cliente | No | No se ejecutan para grounded. |
| Refresco del plan falla | No | Texto ya válido no se sustituye. |
| Proveedor falla/no produce respuesta utilizable | Puede | Error técnico; sin afirmación de guardado. |
| Revisión de prosa detecta contradicciones tras reparación | Sí | No se presenta prosa factual no apoyada como coaching válido. |
| Acciones explícitas de onboarding/generación/confirmación | Sin cambios | Fuera del flujo conversacional de este sprint. |

## Pruebas y alcance de la evidencia

- Baseline: `node --test` sobre todos los `lib/**/*.test.mjs`: **2537/2537**, cero fallos (312261 ms).
- Primer pase completo tras implementación: **2575/2575**, cero fallos.
- Chat enfocado final: **66/66** (42 pruebas añadidas al conjunto previo de 24). Incluye A–E de separación, fuentes/truncamiento/seguimiento 48h, siete dominios, adaptación A–G, negativos, unknown movement/dose, scope, REST, varias sesiones futuras y reintentos.
- Regresión focal de Chat + weeklyCoachingContext + runningDoseBaseline + athletePrescriptionContext: **130/130** en el pase intermedio. La suite completa vuelve a cubrir esos archivos.
- Los tests de transporte y comportamiento del pipeline usan dobles del proveedor, pero ejecutan extracción, contratos, renderizado, CAS y proyecciones reales con DB sintética. No son prueba de calidad semántica de un modelo real ni E2E de navegador/producción.
- `lib/chat/evaluateLongitudinalCoach.mjs` genera respuestas reales y evalúa propiedades semánticas sin igualar prosa ni codificar respuestas; incluye fixtures longitudinales y siete dominios. Ejecución explícita con `node --env-file=.env.local lib/chat/evaluateLongitudinalCoach.mjs`: **NO EJECUTADA**, falta ANTHROPIC_API_KEY. Solo imprime resultados de evaluación, nunca prompt/perfil real. No hay datos de producción en sus fixtures.
- TypeScript y diff check: resultados definitivos al cierre de validación, abajo.

## Archivos modificados

- `app/FormaPro.tsx`, `app/api/chat/route.ts`: integración y transporte Chat.
- `lib/chat/groundedCoach.ts`, `runChatCoach.ts`, `athleteCoachingKnowledge.ts`: separación, prompt y aprendizaje.
- `lib/chat/chatCoachActions.ts`, `longitudinalContext.ts`: adaptador activo y proyección de lectura.
- `lib/chat/groundedCoach.test.mjs`, `longitudinalFixtures.mjs`, `evaluateLongitudinalCoach.mjs`: pruebas y evaluación.
- `lib/athlete/prescriptionHistorySummary.ts`, `loadAthletePrescriptionContext.ts`, `runningDoseEvidence.ts`: exclusivamente proyecciones de lectura compatibles.
- Este informe.

## Limitaciones

- Sin reproducción del incidente con datos/trazas reales, sin validación semántica con proveedor, sin prueba en navegador, sin prueba en producción.
- Sin commit, push, despliegue ni migración. Weekly Planner, Block Analyzer, Session Builder, librerías y contratos de generación sin cambios.
- El contexto no recupera conversaciones ya borradas/truncadas. Las preferencias no estructuradas solo entran con procedencia de conversación/conocimiento; no se importa memoria legacy como hecho.
- Adaptaciones limitadas a sesiones identificadas dentro del horizonte de planes leído por Chat y al ownership/cobertura del backend existente. No se crea un segundo planificador ni se amplían sus especialidades silenciosamente.
- CAS protege cada escritura de plan, no una transacción entre perfil, varias sesiones y otras tablas. El lote se detiene ante conflicto/error/resultado ambiguo. Un cambio entre la última lectura de restricciones y CAS sigue siendo una ventana existente entre tablas.
- Límites por sesión: 32 adaptaciones, 64 evidencias. No se elimina historia para continuar escribiendo al llegar al límite. El original completo permanece en DB, la lectura al modelo es compacta.
- PERFORMED conserva evidencia textual; no alimenta cantidades numéricas verificadas de running_execution_records ni fabrica carga cuantificada a partir de propuestas.
- Calidad de razonamiento, asociación semántica de reportes y detección de contradicciones libres dependen del proveedor. Los tests locales verifican aislamiento e integridad, no convierten una revisión LLM en garantía médica o de verdad absoluta.

## Cierre definitivo — solo validación (2026-09-21)

Se conservaron los 14 archivos del sprint: 9 archivos versionados modificados y 5 nuevos. Durante este cierre no se modificó código ni se añadieron pruebas. Comparación SHA-256 antes/después: **0 archivos funcionales cambiados**. La única edición de cierre es este registro de resultados.

| Comprobación sobre el working tree actual | PASS | FAIL | TOTAL | Resultado |
|---|---:|---:|---:|---|
| `node --test lib/chat/groundedCoach.test.mjs` | 66 | 0 | 66 | PASS |
| Regresión explícita Weekly/Session, coach-executable-v1, disponibilidad, persistencia, whole-week e históricos (20 archivos) | 525 | 0 | 525 | PASS |
| Restricciones e integración del Analyzer (`getCanonicalRestrictions.test.mjs`, `productionPlanningAudit.test.mjs`) | 29 | 0 | 29 | PASS |
| Suite completa: los 113 archivos `lib/**/*.test.mjs`, `node --test --test-concurrency=4` | 2579 | 0 | 2579 | PASS |
| `npx tsc --noEmit` | — | — | — | PASS, exit 0 |
| `git -c core.safecrlf=false diff --check` | — | — | — | PASS, exit 0 |

Suite completa definitiva: **242496 ms**, exit 0; 0 skipped, 0 cancelled, 0 todo. Los subconjuntos anteriores pertenecen a esta suite; no se suman para inflar el total. No se encontró una suite denominada Block Analyzer independiente: su integración se comprobó en las suites indicadas.

Los 20 archivos de regresión explícita fueron: `openCoachAuthority`, `allowedWeeklyPlanContract`, `weeklyCoachDecisions`, `weeklyGenerationPreflight`, `weeklySave`, `weeklyAvailability`, `weeklyAvailabilityFlow`, `wholeWeekValidation`, `wholeWeekRepair`, `wholeWeekOrchestration`, `wholeWeekFailure`, `weeklyCoachingContext`, `planMutation`, `sessionAuthority`, `sessionExecution`, `sessionContractIntegration`, `sessionRepresentation`, `historicalRunning`, `runningDoseBaseline` y `athletePrescriptionContext` (todos `.test.mjs`).

Revisión final de código + pruebas: los fallos de mutation, knowledge e historial conservan coaching válido; un CAS fallido conserva la alternativa ejecutable visible y no afirma guardado. El fallo real del proveedor o la falta de respuesta fiable mantienen fallback técnico. El caso original 6x800 → adaptación 40 min bike → ejecución 42 min bike conserva original, adaptación y evidencia realizada, y las proyecciones futuras no contabilizan esos intervalos como carrera ejecutada.

SEMANTIC PROVIDER EVALUATION: NOT RUN

Falta API key válida para esa evaluación. No se simula ni se registra como PASS; la calidad real del Coach queda pendiente. Tampoco hay validación en navegador, staging o producción. Se mantienen las limitaciones de atomicidad entre tablas, cobertura/horizonte y evidencia textual detalladas arriba.

READY FOR STAGING: YES

Recomendación exclusivamente técnica para llevar posteriormente este estado a staging y validar allí proveedor real y flujo integrado. Este cierre no prepara staging ni recomienda producción. No hubo commit, push, deploy, migración, modificación de Supabase ni acceso a datos de producción.
