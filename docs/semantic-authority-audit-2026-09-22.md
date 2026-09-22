# Auditoría arquitectónica: autoridad semántica en FORGE

Fecha: 2026-09-22. Base inspeccionada: `7f7e777e12ff1c95be07d96eaa40d8bb08bd88c2`.

## Alcance y grado de evidencia

Auditoría estática del repositorio. No se modifica código, tests ni prompts; no se ejecutan llamadas a Supabase, proveedores LLM, generación de planes ni commits. El único entregable escrito es este documento. Las referencias `archivo:línea` corresponden a esta base.

Se rastrearon entradas Web, API, autoridades compartidas, context builders, escritores y consumidores. La búsqueda amplia de nombres `parse*`, `parser*`, `normalize*`, `normalizar*`, `detect*`, `classify*`, `clasificar*`, `resolve*`, `extract*`, `RegExp`, `includes`, `startsWith`, `match`, `matchAll` y `test` sobre `app`, `lib`, `components` encontró **2.499 coincidencias en 2.080 líneas de 172 archivos**, entre 238 archivos TypeScript/TSX no-test. Se revisaron además catálogos, enums, regex, confirmaciones, callers, documentación y tests relevantes. Una coincidencia textual no equivale a una puerta semántica: el inventario agrupa funciones de una misma frontera y separa presentación, infraestructura y código legacy. Esto no es una prueba formal de ausencia de otras rutas ni una auditoría de despliegue.

El caso FORGE12 —media maratón 15/11, reporte de 5 km 27/09, viernes 4×5 min y domingo 75 min Z2— es **evidencia aportada por el usuario**. El código permite demostrar dónde falta el canal de eventos secundarios; no permite identificar retrospectivamente qué rama recorrió esa petición, su payload completo o el estado de producción. No se presentan fixtures llamados FORGE12 como logs del incidente.

La segunda pasada desde la raíz, incluyendo JS/MJS y excluyendo tests, dependencias y `.next`, encontró **2.516 coincidencias en 2.095 líneas de 177 archivos**, entre 250 archivos buscados. Incluye utilidades/fixtures que no son autoridades de producción. Búsqueda reproducible, sin escritura: `rg -n 'parse\w*|parser\w*|normalize\w*|normalizar\w*|detect\w*|classify\w*|clasificar\w*|resolve\w*|extract\w*|RegExp|\.(includes|startsWith|match|matchAll|test)\(' . -g '*.ts' -g '*.tsx' -g '*.js' -g '*.mjs' -g '!*.test.*' -g '!*.type-test.*' -g '!node_modules/**' -g '!.next/**' --stats`. Las regex de negación/días y los catálogos se inspeccionaron en las funciones encontradas; estas cifras miden cobertura de búsqueda, no número de bugs.

## Dictamen

La arquitectura es híbrida. El chat habitual grounded sí recibe el mensaje humano original y distingue evidencia, interpretación y decisión; un fallo de extracción no debe impedir su respuesta. Sin embargo, varios estados de la interfaz interceptan el mensaje antes de ese chat. La disponibilidad semanal mezcla comprensión, resolución de intención y escritura; un resultado aceptado también puede perder el resto del mensaje.

La frontera de competiciones es más restrictiva que la de conversación: `eventAuthority` es una proyección de **un solo `perfil.targetEvent` firmado**, ligado a una familia de objetivo. No existe en esa autoridad una colección de eventos reportados que puedan afectar temporalmente la semana sin sustituir el objetivo principal. La reparación del fallback de disponibilidad no repara esta ausencia.

Hay determinismo legítimo y reutilizable: identidad, fechas civiles, restricciones estructuradas, ownership, contratos, referencias compatibles, integridad, CAS, recibos y readback. El problema no es su existencia, sino usar reconocimiento de lenguaje o cobertura de un catálogo como condición para que un hecho humano llegue al decisor deportivo.

## A. Mapa del mensaje y call graph

```text
FormaPro.enviar(texto)                                  app/FormaPro.tsx:1826
 ├─ pendingGoalQuestion → responder_objetivo_principal   :1829 → route.ts:5170
 ├─ pendingRunningHabitualQuestion → responder_habito    :1852 → route.ts:5113
 ├─ pendingPrescriptionQuestion → responder_dato        :1870 → route.ts:5136
 ├─ pendingCoachOwnership → confirmar_ownership         :1887 → route.ts:5180
 │    [estas ramas consumen la respuesta y retornan]
 ├─ side effects paralelos: PR/sueño/notas/ejecución/
 │  carga externa/cambio de modo                        :2004–2062
 ├─ esperandoConfirmacionDisponibilidad                 :2082
 │    → verificar_correccion_disponibilidad              route.ts:5109
 │    → updateChatAvailability                          chatAvailability.ts:74
 │    → resolveWeeklyAvailabilityResponse               weeklyAvailabilityDeclaration.ts:31
 │    → scope + snapshot + CAS + readback
 │    ├─ failure/partial → pregunta + return (sin Coach)
 │    └─ success → dispararGeneracion + return (sin Coach)
 ├─ esperandoConfirmacionEmpezarHoy                     FormaPro.tsx:2112
 │    → preflight → parseIncludeToday → return
 ├─ confirmación corta → confirmar_pending_action       :2076, :2117
 │    [efecto paralelo; esta rama no retorna aquí]
 └─ procesar_mensaje_contexto                           :2138 → route.ts:4127
      ├─ clasificarIntencion (LLM)                      route.ts:191
      ├─ forgeEventAggregator (LLM + ventanas)           :295
      ├─ forgeContextBuilder                            :404
      ├─ GENERAR_SEMANA_COMPLETA, confidence >= .6       :4167
      │    → orquestador + return                       FormaPro.tsx:2143
      └─ chat normal coachGrounding:true                 FormaPro.tsx:2186
           → groundedReply                              route.ts:5455, :837
           → runChatCoach                               lib/chat/runChatCoach.ts:10
              ├─ loadChatGrounding                      groundedCoach.ts:24
              ├─ extract/persistCoachingKnowledge       athleteCoachingKnowledge.ts:11, :35
              ├─ applyChatStateChange                   chatStateChange.ts:8
              │    → parseTemporaryAvailability         temporaryTrainingAccess.ts:13
              ├─ reload si cambió/estado incierto
              ├─ answerGroundedChat(original)           groundedCoach.ts:247
              ├─ structured output + factual review
              ├─ applyChatCoachActions                  chatCoachActions.ts:94
              │    → target/scope/contrato/review/CAS
              ├─ learning con citas verificadas
              └─ historial CAS (últimos 15 mensajes)    runChatCoach.ts:107

Orquestador                                            FormaPro.tsx:962, :985, :991
 → preparar_generacion_semana → token/semana
 → preflight_generacion_semana                          route.ts:5141
 → analizar_bloque_semana                               route.ts:2041
    → estado + restricciones + notas + loadEventContext
    → Block Analyzer LLM → boundEventAnalysis
 → planificar_semana                                    route.ts:2257
    → preflight + prepareAllowedWeeklyPlanContract
    → composeBoundedWeek → Weekly Coach LLM
    → validar propuesta + recibo calendario
 → construir_sesion_dia                                 route.ts:2320
    → generateTrainingSession                           sessionAuthority.ts:66
    → contrato fresco + generateContractSession          sessionGeneration.ts:27
    → Session Builder LLM → validar/renderizar/recibo
 → guardar_plan_semana                                  route.ts:4550
    → validación semanal + identidad + CAS/readback
```

**No es una cadena en la que cada LLM recibe el mensaje anterior completo.** Analyzer y Planner son acciones separadas, que releen estado. La petición de Analyzer en `FormaPro.tsx:985` lleva código de atleta, no el reporte original; la de Planner lleva análisis, token, semana y decisión temporal.

El endpoint móvil `enviar_mensaje_coach` converge en `groundedReply` (`route.ts:1233,1255`). Las intercepciones React no se ejecutan por usar ese endpoint: hay diferencias entre superficies antes de llegar al backend común.

**Ruta legacy distinta:** `actualizar_usuario` puede agrupar mensajes y extraer memoria (`route.ts:1393–1468`); la llamada genérica al proveedor utiliza `system/messages` más `canonicalEventPrompt` (`:5463`). El chat grounded normal no utiliza ese `system` de cliente: toma `coachMessage`. Tampoco ejecuta `forgeValidator`, tags, STATE_UPDATE o compactación legacy (`FormaPro.tsx:2190–2219`). No atribuir esos filtros al prompt efectivo del chat habitual.

## B. Inventario de fronteras

Convenciones: **S** interpretación semántica; **V** validación estructural/autoridad; **N** normalización; **L** interpretación LLM con filtro determinista. «Bloquea» distingue respuesta, generación o escritura. «Original» se refiere al Coach consumidor; ver G para límites de historia. En las filas agrupadas se indica el conjunto de funciones que comparte entrada y autoridad.

### B1. Lenguaje de entrada y flujo conversacional

| Componente / archivo:línea | Input → output / decisión | ¿Puede bloquear? | ¿Puede perder información? | ¿Coach ve original? | Autoridad actual → debida |
|---|---|---|---|---|---|
| Estados pendientes `app/FormaPro.tsx:1829,1852,1870,1887` | Texto → respuesta a pregunta pendiente | Sí, retorna antes de chat | Sí, mensaje mixto o cambio de tema | No en esa rama | S en UI → transporte de intención interpretada por backend |
| Confirmación simple `app/FormaPro.tsx:2076` | ≤8 palabras con sí/vale/ok/etc. → confirmar pendingId | Ejecuta confirmación; no bloquea chat | Puede confundir asentimiento con frase negada/condicional | Sí si continúa | S + operación → interpretación contextual; validar operación/identidad aparte |
| `clasificarIntencion`, `app/api/chat/route.ts:191,4167` | Mensaje → enum/familia/confianza | Sí, desvía al orquestador | Intención múltiple reducida a una | No al Chat si genera; sí al clasificador | L + routing → typed intents múltiples con evidencia |
| `clasificarMensajeEnBackend`, `route.ts:242` | Mensaje → TRAINING_REPORT/SLEEP_REPORT/OTHER | Extracciones asociadas | Sí, categoría única | Original en chat grounded; grupo reducido en extractor | L + includes sobre output → agrupación advisory, no desaparición de hechos |
| `forgeEventAggregator`, `route.ts:295` | Categoría + texto + active_events → grupo/corrección | Selecciona corpus del extractor | Ventanas 15 min/3 min y separación temática | Chat grounded independiente | S temporal/agrupación → conservar mensaje e IDs; agrupación derivada |
| `forgeContextBuilder`, `route.ts:404` | Evento activo/anterior + datos → contexto | Condiciona ruta legacy | Sí, selección contextual | Grounded reconstruye contexto propio | Context builder legacy → proyección de evidencia compartida |
| Sueño/entreno y resumen UI `FormaPro.tsx:1925,1992` | Regex → etiqueta temporal/omitir historia | No bloquea grounded | En legacy puede imponer “hoy” u omitir contexto | Sí en grounded (`coachMessage:texto`) | S → intérprete; no fabricar fecha desde keywords |
| `esProgramacion/esPlanificacionSemanal`, `FormaPro.tsx:2001` | Includes plan/semana/sesión → booleanos | No se demuestra puerta desde estas declaraciones | Riesgo si se reutilizan como autoridad | Sí | Heurística local; no confundir declaración con caller decisivo |
| `extractCoachingFacts`, `lib/chat/athleteCoachingKnowledge.ts:11` | Texto/regex/aliases → recursos, capacidades, molestias | Escritura de hechos; no respuesta | Excluye preguntas/comillas/ayer/creo; semántica temporal limitada | Sí, siempre en runChatCoach | S con persistencia previa → candidatos con evidencia, revisión semántica y validación |
| `persistCoachingKnowledge`, mismo archivo `:35` | Hechos regex o citas revisadas → knowledge/signals | CAS/readback | Puede sustituir señal por interpretación regex | Sí | V legítima mezclada con extracción → mantener writer, separar candidato |
| `projectChatLongitudinal`, `lib/chat/longitudinalContext.ts:4` | Tokens compartidos+recencia → 18 entradas, 1800 caracteres | No, selección de contexto | Sí, evidencia relevante sin coincidencia lexical | Actual sí; historia acotada | S recuperación advisory → mantener límites, referencias recuperables |
| `conversationOnly/contextualConversation`, `lib/chat/conversationEvidence.ts:1,14` | Historial → 15 textos de hasta 12000 caracteres y metadata | No | Arrays multimodales excluidos; truncamiento | Actual separado; últimos 6 en generación | V/N+presupuesto → mantener roles/provenance; explicitar cobertura |
| `conversationalMemoryOnly`, mismo archivo `:9` | Extracción → objetivo/distribución/marca/etc. anulados | Escritura legacy | Sí si no hay autoridad alternativa, como eventos | Chat actual sí | V de protección legítima → mantener y añadir canales de promoción, no reabrir writer genérico |
| `procesarTags/forgeValidator`, `FormaPro.tsx:1558,2190` | Prosa Coach/tags JSON → acciones/display | Legacy | Sí, remoción/corrección de salida | Post-Coach | S/V legacy → contracts; grounded ya evita esta ruta |
| `parseSessionProposal`, `lib/sports/proposalParser.ts:28` | Frases Coach + atleta → propuesta | No caller de producción encontrado | Potencial, no puerta activa demostrada | Post-Coach | S legacy → no resucitar como autoridad |
| `detectar_propuesta_sesion`, `route.ts:2756` | Prosa → ruta deshabilitada | Rechaza creación legacy | No crea prescripción | Post-Coach | V de contención → KEEP |

### B2. Disponibilidad, tiempo, objetivos y eventos

| Componente / archivo:línea | Input → output / decisión | ¿Puede bloquear? | ¿Puede perder información? | ¿Coach ve original? | Autoridad actual → debida |
|---|---|---|---|---|---|
| `resolveWeeklyAvailabilityResponse/parseWeeklyAvailabilityDeclaration`, `lib/sports/weeklyAvailabilityDeclaration.ts:10,31,123` | Lenguaje → CONFIRM/PATCH/FULL_SNAPSHOT/UNRESOLVED + días | Generación desde UI | Sí: evento se salta, causa se separa, incertidumbre/sintaxis vetan | No en confirmación | S → intérprete; resolver puro solo sobre operaciones tipadas |
| `isExistingAvailabilityConfirmation`, `lib/sports/availabilityResponse.ts:5,9` | Lista exacta → confirmación | Continuación | Sinónimos/mensajes compuestos | No en confirmación | S → interpretación contextual o botón tipado |
| `parseAvailabilityChange`, mismo archivo `:16` | Gramática finita → cambios/exclusiones | Guardado habitual | Desconocidos y cambios mixtos | Depende del caller | S → MOVE comprensión, KEEP operación |
| `parseChatAvailability`, `lib/sports/chatAvailability.ts:42` | Tokens actividad/días/recuentos → mapa | Guardado | Palabras no previstas invalidan | No en rama UI | S → candidato; no whitelist de habla humana |
| `updateChatAvailability`, mismo archivo `:74` | Texto/objeto + snapshot/semana → persistencia | Sí, scope/formato/unresolved/CAS | Persiste mapa, no resto de intención ni cita | No en rama UI | S+V+writer → separar las cinco responsabilidades de E |
| `normalizeAvailabilityDays/ForStorage`, `lib/sports/trainingAvailability.ts:7,46` | Arrays/CSV/JSON legacy → estructura | Sí, dato inválido | Rechazo esperado de prosa si se usa como parser de chat | No aplica al validar estructura | N/V → KEEP en frontera tipada |
| `resolveWeeklyDeclaration`, `weeklyAvailabilityDeclaration.ts:133` | Override almacenado → válido/ausente/inválido | Solo si no hay base usable al cargar calendario | No necesita comprender texto | No aplica | V → KEEP, incluido fallback reparado |
| `parseTemporaryAvailability`, `lib/sports/temporaryTrainingAccess.ts:13` | Frase exacta semana+día+no puedo entrenar → fecha unavailable | Cambia estado antes del Coach | Todo lo demás retorna null | Sí en chat normal | S → MOVE; fecha/scope/CAS permanecen |
| `availableDaysAtWeek`, mismo archivo `:6` | Base + override + bloqueos fechados → días | Admisión calendario | No, proyección estructurada | No aplica | V → KEEP |
| `parseIncludeToday`, `lib/planning/weeklyGenerationPreflight.ts:9` | Booleano o lista de frases → includeToday/null | Generación hasta aclaración | Mensaje mixto no se conserva aquí | No en rama temporal | S/V → booleano validado; interpretar frase fuera |
| `parseOwnershipConfirmation`, `lib/sports/coachOwnership.ts:11` | Frases y disciplina limitada → forge/external/ambiguous | Generación/delegación | Sí | No en pregunta pendiente | S → MOVE; permiso explícito, scope y writer KEEP |
| `saveGoalAnswer`, `lib/athlete/goalAnswers.ts:46,65` | Número, texto exacto, “Mi objetivo es:” o alias → objetivo | Generación | Habla normal fuera de sintaxis no admitida | No en pregunta pendiente | S+V → intérprete; conservar elección explícita y antecedentes |
| `resolveGoalId`, `lib/sports/goalTransferModel.ts:11,37,46` | Texto normalizado → seis GoalId o null | Estrategia, con fallback | No entiende frases completas | Planner ve proyección, no chat | S si clasifica prosa; catálogo válido como capacidad de dominio |
| `resolveGoalAuthority`, `lib/athlete/goalResolution.ts:10` | Candidatos primarios → resolved/missing/conflict/unsupported | Puede exigir resolución | No borra candidatos, pero limita admisión | No conversación | V+alias semántico → separar identidad declarada de cobertura |
| `resolvePlanningStrategy`, `lib/athlete/strategyResolution.ts:19` | Objetivo+especialidad+distancia → familia | Sí si no resuelve | Fallback general puede perder especificidad sin borrar objetivo | Solo datos proyectados | Adaptador de cobertura → KEEP/ADAPT, no convertir fallback en comprensión |
| `declaredSportStrategy/structuredEventStrategy`, `lib/sports/declaredSportStrategy.ts:5,19` | Selecciones persistidas exactas → familia | Capacidad de planificación | No reconoce distancias fuera de 10K/media en este adaptador | No aplica a captura de eventos | Catálogo legítimo → KEEP como cobertura, no admisión de hechos |
| `declareTargetEvent/readTargetEvent/resolveEventAuthority`, `lib/athlete/eventAuthority.ts:16,34,59,84` | Formulario firmado único → target/autoridad | Preparación específica; no siempre generación general | No representa eventos adicionales | No recibe chat | V+modelo restringido → ADAPT colección, evidencia y roles |
| `EVENT_GOAL_CATALOG`, `lib/sports/eventGoalCatalog.ts:2` | goalId → disciplina/tipo | `EVENT_GOAL_NOT_SUPPORTED` | Excluye evento no catalogado de esta escritura | No | Capacidad de dominio → no decidir existencia/relevancia de un evento |
| `boundEventAnalysis`, `eventAuthority.ts:116` | JSON Analyzer → campos permitidos + objetivo sobrescrito | No aborta, altera resultado | Sí, sustituye objetivo por `eventAuthorityText` | Post-Analyzer | V mezclada con contenido → validar hechos, conservar decisión justificada |
| `parseSessionTime/parseRunning/resolveReferenceMovement`, `lib/athlete/athletePrescriptionContext.ts:27,49,95` | Campos legacy → presupuesto/referencias con provenance | Dosis/suficiencia | Formatos o aliases no conocidos quedan desconocidos | No consume mensaje actual | N/V de adaptador → KEEP; extracción de habla fuera |
| `explicitChatTimeCeiling`, `lib/chat/chatCoachActions.ts:37` | “solo tengo N min” y variantes → segundos | Limita contrato/adaptación | No ata el límite a la fecha mencionada | Sí | S → candidato de límite con fecha; conservar validador numérico |
| `parsePrescriptionAnswer`, `lib/athlete/prescriptionAnswers.ts:18` | Objeto o frases cerradas → señales | Captura/admisión sesión | Texto adicional/otras formulaciones | No en pregunta UI | S para string, V para objeto → separar |
| `parseHabitualRunningAnswer/isHabitualRunningConfirmation`, `lib/athlete/runningHabitualDeclarations.ts:11,14` | Confirmaciones exactas/entero/sentinel → hecho declarado | Continuación generación | “suelo hacer 40 minutos” no es entero literal | No en rama UI | S/V → interpretar valor contextual; validar unidad y confirmación |

### B3. Ejecución, restricciones, fisiología y conocimiento

| Componente / archivo:línea | Input → output / decisión | ¿Puede bloquear? | ¿Puede perder información? | ¿Coach ve original? | Autoridad actual → debida |
|---|---|---|---|---|---|
| `parseStrengthRecord`, `lib/sports/strengthRecordParser.ts:13,30`; writer `route.ts:3921` | Palabras récord+catálogo+primer kg → marca | Registro, no chat | Tipo NRM/repeticiones/contexto; primer peso no necesariamente corresponde | Sí | S → candidato con ejercicio, carga, reps, cita y fecha; comparar marcas después |
| `parseSleepMetrics`, `lib/sports/sleepMetricsParser.ts:21` | Regex → métricas y sospechosos | Campos, no chat | Formulaciones no reconocidas | Sí | S + rangos → separar extracción; conservar límites existentes sin reevaluarlos médicamente |
| `parseCanonicalReport/manualPatch/conversationalPatch/historicalPatch`, `lib/physiology/adapters.ts:5,25,28,40,50` | Texto literal/unidades/fecha → patch | Persistencia | Keywords temporales y formato pueden excluir dato verdadero | Sí | S + V → intérprete con citas; unidades/rangos/consistencia KEEP |
| `validateExtraction`, `lib/validators/extractionRules.ts:16,41,58,67` | Extracción LLM + texto → campos anulados | Memoria/metricas legacy | Vocabulario lesión/fatiga/sueño cerrado | Grounded independiente | S usado como prueba factual → sustituir por evidencia y validación tipada |
| `verificar_sesion_completada_deterministico`, `route.ts:3454,3466,3479` | Longitud/sueño/negación + LLM → reporte | Registro y completado | Filtro previo puede excluir reporte | Sí por vía normal paralela | L + filtros S → intérprete; asociación con sesión V |
| `resolveReportExecutionDate/splitExecutionReports`, `lib/execution/reportExecutionDate.ts:9,30` | Frase+fecha actual → fragmentos/fecha/null | Registro/completado | “anoche”, “hace”, formatos ambiguos dejan fecha sin resolver; el bloqueo de registro ocurre después del extractor | Chat sí; extractor recibe fragmentos salvo filtros de sueño/negación | S temporal → interpretación contextual; fechas y no-futuro V |
| `recordCompletion/resolveCompletionDate`, `lib/planning/recordCompletion.ts:9`; `route.ts:1810` | Fecha/ejecución tipada → historia y completado | Escritura | No confundir ejecución externa con plan propio | No aplica | V → KEEP |
| `verificar_carga_externa_deterministico`, `route.ts:3685` | LLM sobre lista disciplinas externas → fila | Registro, no chat | Otros deportes; fecha fijada a hoy; resumen sin cita | Sí, carrera de lecturas posible | L + persistencia → candidatos fechados y revisados, coverage separada |
| `detectar_coaching_note`, `route.ts:3115,3153` | LLM → issue/movement/type; dedup por movement | Captura, no chat | Reduce dolor a zona; dedup no conserva nueva issue al incrementar contador | Sí, pero Planner recibe nota reducida | L + resumen persistente → citas y vínculo de observaciones, no igualdad anatómica como identidad |
| Modification safety net, `route.ts:3254,3270,3305,3320` | LLM trigger → lista/confianza ≥.6 → propuesta | Adaptación legacy | Feedback/no trigger excluido; injury/fatigue/equipment retornan unrepresented | Post-Coach | L + política deportiva → retirar veto por categoría; validar hechos/scope/restricciones |
| Referencia futura `route.ts:3580,3604` | Título incluido en respuesta + texto movimiento → alerta | No crea ajuste | Sinónimos/variantes no coincidentes | Post-Coach | S de alerta → IDs/propuesta estructurada |
| `getCanonicalRestrictions/projectCanonicalRestrictions`, `lib/athlete/getCanonicalRestrictions.ts:36,63` | Estados/notas hard/reassessment → snapshot | Sí si lectura/estado ambiguo | No deduce restricciones desde dolor textual: separación correcta | Contexto estructurado | V → KEEP; añadir observaciones sin convertirlas automáticamente en prohibiciones |
| `guardar_readiness_checkin`, `route.ts:3751` | Score 1–5/fecha → dato subjetivo | Solo formato | No convierte “cansado” en score, correcto | Por estado persistido | V → KEEP; reporte libre debe coexistir sin score inventado |
| `verificar_datos_cambio_modo_deterministico`, `route.ts:952` | LLM captura + campos requeridos/availability → transición | Transición, no chat normal | Descripción reducida a formulario | Sí si flujo continúa | L+V → separar comprensión de autorización explícita |
| `extraer_metricas_imagen/extraer_sesion_imagen`, `route.ts:3047,3192` | Visión → JSON y gates unidad/confianza | Captura | Imagen a resumen; ambigüedad de fuente | Grounded recibe texto, no imagen en coachMessage | L+V → evidencia de documento y revisión; no tratar confidence como prueba |
| `captureAthleteTestFacts/captureOnboardingGoal`, `lib/athlete/testCapture.ts:3`, `onboardingGoal.ts:9` | Respuestas de formulario → hechos/rol primario | Formularios | Restricción a opciones es legítima allí | No chat | V de formulario → KEEP; no imponer al chat |
| `projectPrescriptionSignals`, `lib/athlete/prescriptionSignals.ts:22` | Campos de formulario/aliases → material/nivel/capacidades | Suficiencia | Señales fuera de catálogo quedan sin representación | No original, sí provenance | Adaptador → KEEP; ampliar mediante capacidades, no motores por deporte |
| `resolveTrainingEnvironment/SessionTrainingEnvironment`, `lib/sports/trainingEnvironment.ts:30`, `sessionTrainingEnvironment.ts:11` | Entorno/override/asignación → capacidades | Suficiencia | Desconocido no es ausencia | No original | N/V de dominio → KEEP con UNKNOWN explícito |
| `buildExposureReport`, `lib/sports/exposureEngine.ts:47,54` | Texto sesiones realizadas + aliases → exposición | Influye contexto/decisiones | Ausencia de match ≠ ausencia real de exposición | No corpus completo en Planner | S derivada → advisory con cobertura y migración a ejecución estructurada |
| `legacySessionView/contextualSessionIntensity/legacyDurationMinutes`, `lib/sports/sessionPresentation.ts:5,15,19` | Texto título/descripción → comparación/intensidad/duración | Consumidores legacy | “max”/minutos del título no prueban dosis | No | S legacy → limitar a presentación, campos ejecutados tipados para carga |
| `historicalRunning`, `lib/execution/historicalRunning.ts:53,91` | Registros legacy/modernos → evidencia reconciliada | Admisión numérica | Dato legacy ambiguo no sirve como dosis exacta | No original | N/V + clasificaciones legacy → KEEP reconciliación/provenance; desconocido explícito |
| Dedup sesión/debilidad, `lib/validators/sessionDuplicationValidator.ts:40`, `weaknessDeduplicationValidator.ts:50` | Texto normalizado/similitud → duplicado | Registro/mezcla | Puede fusionar observaciones distintas | Chat independiente | S de identidad → IDs/evidencia; similitud solo candidata |

### B4. Determinismo de salida y autoridades que no interpretan el mensaje

| Componente / archivo:línea | Input → output / decisión | ¿Puede bloquear? | ¿Puede perder información? | ¿Coach ve original? | Autoridad actual → debida |
|---|---|---|---|---|---|
| `coachOutputContract`, `lib/chat/coachOutputContract.ts:4,17,32` | JSON/fence → envelope, actionsJson | Output inválido/reparación | Metadata inválida no debe borrar answer útil | Sí | V de transporte → KEEP |
| `normalizeWeeklyPlannerTransport`, `lib/planning/weeklyPlannerTransport.ts:2` | Fence completo → JSON | Output, no lenguaje atleta | No semántica humana | No aplica | N → KEEP |
| `resolvePrescriptionIntent/resolveOpenCoachIntent`, `lib/sports/prescriptionIntent.ts:16`, `openCoachIntent.ts:13` | Intent estructurado → válido/errores | Prescripción | Cobertura de patrón no debe borrar observación | No aplica | V de contrato → KEEP/ADAPT extensibilidad |
| `parseStructuredSession`, `lib/sports/structuredSession.ts:127` | Propuesta Builder → estructura validable | Sesión inválida | No interpreta petición del atleta | Post-LLM | V → KEEP |
| `resolveDoseInstruction/ExecutableDose`, `lib/sports/sessionExecution.ts:11,45` | Instrucción/dosis generada → ejecución | Si no ejecutable | No debe exigir catálogo para toda prosa abierta | Post-LLM | V ejecutabilidad → KEEP contrato abierto vigente |
| `prescriptionScope`, `lib/sports/prescriptionScope.ts:11,23`; `sessionAuthority.ts:255` | IDs/perfil/sources → permiso | Sí | Aliases de IDs no equivalen a entender eventos | No aplica | N/V → KEEP; no derivar ownership de frase incidental |
| `resolveDataSufficiency`, `lib/prescription/dataSufficiency.ts:24` | Requisitos/capacidades/evidencia → known/fallback/ask | Dosis sin evidencia suficiente | No, falta explícita | No aplica | V independiente de dominio → KEEP |
| Movement/stimulus/variants/restriction policy, `lib/sports/movementLibrary.ts:267`, `movementVariants.ts:45`, `movementRestrictionPolicy.ts:16` | Catálogo/propiedades → compatibilidad | Prescripción | Desconocido requiere tratamiento explícito | Post-LLM | Conocimiento legítimo de dominio → KEEP; catálogo no decide si relato existe |
| Dosis/tiempo/referencias, `lib/sports/sessionTimeDoseAuthority.ts:20,44`, `methodIntensityAuthority.ts:71`, `runningReferenceAuthority.ts:28` | Números/evidencias → límites/compatibilidad | Sí | No descartar unidades/provenance | No aplica | V y política de dominio → KEEP límites existentes, separar elección deportiva |
| Preparación carrera `lib/sports/runningEventPreparation.ts:7`; activación `prepareAllowedWeeklyPlanContract.ts:60,132` | Target media/historia → fase/constraints | En rutas que aplican política | No cubre eventos secundarios | No | Política deportiva determinista versionada, no parser; revisar por separado de validadores invariantes |
| Weekly/whole-week validators, `lib/planning/allowedWeeklyPlanContract.ts:327`, `wholeWeekValidation.ts:1`, `planValidationPipeline.ts:1` | Propuestas/semana → admisión/repair | Sí, plan inválido | No input humano | Post-LLM | V → KEEP; no equiparar preferencias con invariantes |
| CAS/recibos, `lib/planning/planPersistence.ts:64`, `sessionAuthority.ts:186`; `eventActions.ts:73` | Mutación validada → commit/readback | Sí, conflictos | No, protege estado | No aplica | V → KEEP |
| Renderers, `lib/sports/humanPresentationLabels.ts:34`, `app/plan/page.tsx:73`, `FormaPro.tsx:589,3957` | Estructura/prosa → etiquetas/cards/autorrelleno | No gate principal de Coach | Autorrelleno puede omitir valores | No aplica | N/presentación → KEEP sin autoridad de planificación |

### B5. Fronteras adicionales de perfil y políticas derivadas

| Componente / archivo:línea | Input → output / decisión | ¿Puede bloquear? | ¿Puede perder información? | ¿Coach ve original? | Autoridad actual → debida |
|---|---|---|---|---|---|
| Categoría Focus en UI, `app/FormaPro.tsx:2692` | Disciplina libre → carrera/fuerza/híbrido o funcional por regex | Redirige cuestionario | Sí, taxonomía reducida aunque conserva especialidad textual | No es llamada al Coach | S en cliente → backend interpreta; UI solo presenta decisión serializable |
| `ensurePlanningSpecialty`, `lib/sports/canonicalSpecialty.ts:6,20` | Perfil legacy → especialidad existente o reparación carrera | Mutación si falta dato canónico | No intenta entender especialidad libre | No aplica | V/adaptador de compatibilidad → KEEP, no ampliar inferencia por categoría |
| `aplicarTrainingFrequencySafetyNet`, `lib/sports/trainingFrequencySafetyNet.ts:24` | Días numéricos/frecuencia → máximo derivado | Puede limitar consumidores que lo apliquen | Frecuencia histórica es proxy, no intención | No original | Política deportiva, no parser ni ley fisiológica; separar revisión de política de validación estructural |
| Compactación/extracción de historial UI, `app/FormaPro.tsx:2217,2284,2322` | Historial legacy → resumen/keys admitidas por includes | Memoria legacy | Sí: lista de claves y compresión | Grounded no ejecuta compactación por esta ruta | L+filtro S → converger en evidencia compartida; no reintroducir autoridad de cliente |
| `humanWeeklyObjective/humanCoachingProjection`, `lib/sports/humanCoachingProjection.ts:15,32` | Estrategia/contrato → texto con fallback de etiquetas | No | Puede simplificar explicación, no hechos canónicos | Post-Coach | N/presentación → KEEP sin realimentación como evidencia |

La política de preparación de media maratón no debe atribuirse sin más a la ruta abierta actual: `prepareAllowedWeeklyPlanContract.ts:132` condiciona la incorporación de restricciones D3 al contrato por disciplina a `!request.openCoachVersion`. La decisión de preparación puede seguir en el contexto semanal (`:147`); presencia de contexto y enforcement son cosas distintas. Esta auditoría no autoriza retirar esa política ni certificarla como invariante fisiológica.

Las palabras `event`, “evento” y “registrar_evento” aparecen también en historia deportiva (`route.ts:5286`, `athlete_events`), aggregator (`active_events`) y eventos internos (`forge_events`, `route.ts:283`). **No son `targetEvent` ni constituyen un camino automático a `eventAuthority`.**

## C. Puertas concretas y clasificación de impacto

La severidad describe el efecto técnico del branch, no un ranking de módulos.

| Puerta | Impacto | Evidencia y alcance |
|---|---|---|
| Respuesta disponibilidad → parser → error → return | **CRÍTICA** | `FormaPro.tsx:2082–2100`; impide que Coach razone y que continúe generación por sintaxis no entendida |
| Respuesta disponibilidad → success → mapa → generación | **CRÍTICA** | `:2109`; mensaje original no acompaña a Analyzer; evento/causa pueden desaparecer aun con éxito |
| Evento solo formulario/target singular → contexto de planificación | **CRÍTICA** | `eventActions.ts:21`, `eventAuthority.ts:91–103`; un evento real sin representación no condiciona semana |
| Preguntas pendientes objetivo/hábito/material/ownership | **CRÍTICA** cuando detienen prescripción; **ALTA** para cláusulas omitidas | `FormaPro.tsx:1829–1918`; se responde a una única pregunta y retorna; validación de permisos sigue siendo necesaria |
| Inclusión de hoy por frases exactas → canContinue:false | **CRÍTICA** | `weeklyGenerationPreflight.ts:9,45`; elección temporal genuina bloqueada hasta hablar en sintaxis admitida |
| Objetivo descriptivo → alias/familia → sin estrategia | **CRÍTICA** si no hay fallback | `strategyResolution.ts:19`; con especialidad carrera puede resolver `running_general`, por lo que no todo objetivo libre bloquea |
| Confirmación ≤8 palabras → pending action | **CRÍTICA** potencial | `FormaPro.tsx:2076,2117`; interpretar asentimiento tiene efecto real; validadores posteriores no prueban por sí solos intención humana |
| Regex de recurso/capacidad → signals antes de Coach | **CRÍTICA** potencial | `runChatCoach.ts:33`, `athleteCoachingKnowledge.ts:57`; una interpretación incorrecta altera evidencia de prescripción |
| Router LLM generación ≥.6 → orquestador | **CRÍTICA** si mensaje mixto | `route.ts:4167`, `FormaPro.tsx:2143`; no es regex, pero tampoco preserva automáticamente hechos junto a la orden |
| Trigger whitelist de modificación legacy | **CRÍTICA** en ese writer | `route.ts:3305–3321`; bloquea ajustes por categoría antes de evaluar propuesta. No es la puerta de `applyChatCoachActions` grounded |
| Negación/sueño → gate previo al extractor; fecha → gate de escritura posterior | **ALTA** | `route.ts:3466–3486`; puede perder evidencia de ejecución que alimenta planificación; chat paralelo puede responder |
| Extracción limitada de fisiología/PR/notas/externo | **ALTA** | Captura parcial o promoción errónea afecta memoria; no impide respuesta ordinaria |
| Ranking lexical/truncamiento/resumen/dedup | **ALTA** | `longitudinalContext.ts:21`, `route.ts:3153`; contexto histórico no recuperado o fusionado |
| Regex display/cards | **MEDIA** si autorrelleno incorrecto; **BAJA** formato | `FormaPro.tsx:3957`; no demostrada autoridad directa sobre planificación |
| JSON, fecha civil, scope, CAS, restricciones estructuradas | **BAJA** como problema semántico | Pueden y deben bloquear escrituras inválidas; no deben bloquear comprensión/respuesta por falta de persistencia |

## D. Eventos, competiciones y FORGE12

### D1. Respuestas verificadas a las doce preguntas

1. **No hay extractor de chat a eventos próximos canónicos.** Hay detección de una cláusula con carrera/competición/prueba/evento en disponibilidad (`weeklyAvailabilityDeclaration.ts:15,52`), aprendizaje de citas, notas y tags históricos. Ninguno escribe una colección de eventos consumida por `eventAuthority`.
2. El detector de disponibilidad reconoce verbos tengo/tendré/hay/participo/participaré/compito/competiré seguidos de carrera/competición/prueba/evento. No extrae distancia, identidad, prioridad ni fecha de competición: añade weekday a `eventDays` y hace `continue`.
3. `TargetEvent.eventType` admite race/competition/test/other; `discipline` es string. La escritura real requiere `EVENT_GOAL_CATALOG`: half_marathon, 10k, crossfit, max_strength, hyrox. No hay campo de distancia libre en TargetEvent. El catálogo vincula evento a familia de objetivo; `other` en el tipo no proporciona un writer genérico.
4. Un evento no reconocido no entra en esta autoridad. Puede seguir como conversación/observación, o provocar UNRESOLVED si se estaba contestando disponibilidad. Declarar un goalId fuera del catálogo falla `EVENT_GOAL_NOT_SUPPORTED`.
5. **En la autoridad actual, sí:** el único origen admitido por `readTargetEvent` es `structured_event_form`, con firma, digest, atleta y confirmación. Crear un evento de historia deportiva no crea un TargetEvent válido.
6. Chat normal no tiene acción para crear evento secundario/temporal. `runChatCoach.ts:52` declara `goal_or_event_change` entre los cambios automáticos no soportados; `chatCoachActions.ts:104` limita acciones a adapt_session, record_performed, record_response.
7. **No:** `perfil.targetEvent` y `authority.targetEvent` son singulares. No existen `upcomingEvents[]` en esa proyección.
8. El tipo enumera primary/secondary, pero `declareTargetEvent` fija primary y `resolveEventAuthority` devuelve NOT_PRIMARY para secondary. La distinción tipada no equivale a soporte operativo de varios eventos.
9. Analyzer recibe `JSON.stringify(eventContext.authority)` y campos/notas adicionales (`route.ts:2182`). En cuanto a eventos canónicos, recibe solo targetEvent. No recibe mensaje actual, historial íntegro ni una lista de competiciones próximas.
10. Weekly Coach recibe `strategy.eventAuthority`, contexto semanal y `athleteCoachingKnowledge` (`prepareAllowedWeeklyPlanContract.ts:66,166`; `weeklyCoachingContext.ts:128`). Puede ver una cita aprendida del evento si se capturó, pero no tiene colección verificada de eventos próximos ni garantía de recibirla.
11. Session Builder **sí puede recibir contexto del objetivo de competición**: weekStrategy en doseContext, perfil de servidor y analysis no autoritativo (`sessionDoseContext.ts:22,54`; `sessionAuthority.ts:168`; `route.ts:2341`). No recibe automáticamente el reporte original ni evento secundario ausente del estado. No es correcto decir que Builder no recibe ningún contexto de competición.
12. Se identifica el hueco exacto de interfaces en D2. Sin payload/logs no se puede afirmar qué branch histórico eliminó primero la frase FORGE12.

### D2. Traza del 5 km

Datos aportados: target principal media maratón 2026-11-15; competición reportada para domingo 2026-09-27, 5 km; autoridad observada solo con media; sesiones observadas viernes 4×5 min umbral y domingo 75 min Z2.

**Si la frase llega durante confirmación de disponibilidad:**

1. `FormaPro.tsx:2083` envía el texto a `verificar_correccion_disponibilidad_deterministico`.
2. `route.ts:5110` llama a `updateChatAvailability`; este llama a `resolveWeeklyAvailabilityResponse`.
3. En `weeklyAvailabilityDeclaration.ts:52`, «el domingo tengo una carrera de 5 km» coincide con `event`. Se recoge domingo en `eventDays` y se salta la cláusula. **“5 km” nunca se convierte en hecho de evento.**
4. Si es la única cláusula, no hay disponibilidad, exclusión ni confirmación; termina UNRESOLVED (`:103`). Por tanto, **esa frase aislada no demuestra el éxito de disponibilidad relatado**. Un mensaje con otras cláusulas o un estado previo diferente es necesario para reconstruirlo.
5. Si otras cláusulas resuelven disponibilidad, el domingo puede continuar permitido sin que exista evento. `eventDays` solo detecta conflicto con una exclusión/descanso explícito; no crea competición ni reserva sesión de carrera.
6. El writer persiste `weekly_availability[week]` con disponibilidad/exclusiones; no la cláusula descartada. El success de UI llama a generación y retorna (`FormaPro.tsx:2109–2111`) antes de `runChatCoach`.
7. Analyzer se invoca sin el mensaje (`FormaPro.tsx:985`). `loadEventContext` lee **solo** `perfil.targetEvent` y candidatos legacy (`eventActions.ts:21`); `resolveEventAuthority` devuelve el objetivo firmado existente. La media del 15/11 sigue siendo el único evento.
8. `boundEventAnalysis` fija ese mismo eventAuthority; Planner reconstruye la autoridad desde estado, y Builder recibe contratos basados en ello. Ningún validador puede detectar una carrera cuya evidencia no recibió.

**Si llega como chat ordinario:** el Coach sí ve el texto completo y puede hablar del 5 km, incluso proponer adaptación local. No hay writer de evento; la rama opcional de aprendizaje podría conservar una cita como `reported_observation`, no como competición fechada canónica. Una generación posterior vuelve a leer el target singular. Puede perderse la competición aunque la respuesta conversacional haya sido buena.

**Conclusión forense limitada:** la pérdida demostrada es entre **reporte humano → autoridad de eventos/contexto de generación**; en la rama de disponibilidad existe además una instrucción concreta `continue` que elimina la cláusula del resultado tipado. No se ha demostrado que el LLM desoyera un 5 km presente en su prompt, ni que el catálogo seleccionara las dosis 75 min/4×5 min. Esas dosis son el resultado observado, no una consecuencia determinista reproducida aquí. El objetivo principal no debería ser sustituido por el 5 km.

### D3. Casos equivalentes

| Reporte | Disponibilidad actual | Evento canónico actual |
|---|---|---|
| Carrera popular 8 km | Con “tengo una carrera” se salta como cláusula de evento; distancia no extraída | Sin writer ni goalId de evento libre |
| Trail 13 km | “tengo un trail” no coincide con regex event; puede quedar unresolved/mezclado con otras cláusulas | Sin colección; catálogo no cubre trail libre |
| Competición CrossFit sábado | Con verbo reconocido+competición se salta; sin verbo depende de gramática restante | CrossFit existe en catálogo, pero solo formulario del objetivo; no secundario desde chat |
| HYROX | Palabra HYROX sola no coincide con detector de evento/disponibilidad | Catálogo sí, requiere objetivo/formulario y ownership hyrox para preparación gestionada |
| Partido/torneo | No está en vocabulario de evento del parser | Sin writer genérico; puede sobrevivir como cita, sin proyección de evento |
| Test físico | “tengo una prueba” coincide; “tengo un test físico” no | max_strength existe, pero no equivale a cualquier test; no inferir disciplina |
| Evento sin nombre formal | Si dice “tengo un evento” se salta; otras descripciones no garantizadas | `other` en tipo no basta; requiere captura abierta con incertidumbres |

La no coincidencia no implica siempre rechazo de todo mensaje: otras cláusulas pueden hacer que se acepte una estructura parcial. Tampoco coincidencia implica captura del evento.

## E. Disponibilidad después de la reparación del fallback

La reparación es de **lectura de estado histórico**: `resolveWeeklyDeclaration` invalida solo el override mal formado; `availableDaysAtWeek` usa base habitual cuando no hay override válido, manteniendo bloqueos fechados. `loadWeeklyCalendarContext` conserva el diagnóstico y bloquea si tampoco hay base usable (`weeklyCalendarAuthority.ts:52–67`). No se debe volver a hacer fallback silencioso para una **nueva respuesta humana ambigua**.

| Responsabilidad | Implementación actual | Frontera futura mínima |
|---|---|---|
| Comprensión | Regex de actividad, negación, evento, incertidumbre, coordinación y días (`weeklyAvailabilityDeclaration.ts:10–92`) | Sale del parser: intérprete con mensaje completo y contexto |
| Intención | CONFIRM/PATCH/FULL_SNAPSHOT; inferir “solo”, “sin cambios”, listas completas (`:97–119`) | Sale del parser: operación candidata con evidencia; aclarar diferencia snapshot/patch cuando cambie resultado |
| Operación estructurada | Mezcla con previous, exclusiones y cero explícito | Permanece resolver puro de operación tipada; no inferirla por tokens |
| Validación | Semana/días válidos, scope, no unresolved, snapshot actualizado | Permanece; UNKNOWN ≠ descanso ni disponibilidad cero |
| Persistencia | Weekly JSON+CAS+readback (`chatAvailability.ts:133`); habitual distribucion/sources y verificación | Permanece, separada de comprensión; conservar límites temporales y ownership |

`source:'explicit_user_declaration'` hoy certifica qué ruta construyó el objeto, no conserva la cita ni prueba que la operación interpretada fuera la intención completa del usuario. Añadir evidencia no significa guardar una decisión LLM como verdad: debe poder trazarse y corregirse.

## F. Objetivos, restricciones y feedback

Los resultados siguientes asumen chat normal; bajo pregunta pendiente se aplican antes las puertas de C. No se realizan interpretaciones médicas.

| Mensaje | Quién lo entiende / qué llega | Pérdida o bloqueo posible | Autoridad persistente actual |
|---|---|---|---|
| “Quiero correr una media en noviembre.” | Chat LLM ve original; router puede clasificar intención | No fecha civil exacta; no writer de evento. `resolveGoalId` no reconoce la frase completa; estrategia puede usar fallback carrera | Objetivo primario existe, pero cambio exige ruta dedicada. Noviembre no autoriza inventar día ni reemplazar target |
| “Esta carrera no es importante, solo quiero hacerla con mi mujer.” | Chat puede interpretar motivación | No vínculo estable con evento; no prioridad/importancia por evento reportado; nota/cita puede omitirse del Analyzer | knowledge/nota advisory, no autoridad de evento secundaria |
| “Esta semana me noto muy cansado.” | Chat LLM + posible learning | No score numérico automático. Filtro legacy `fatiga sistémica/acumulada/general` no equivale al texto; whitelist modificación legacy no admite cualquier cansancio | Check-in/physiology estructurados y observaciones; no convertir cansancio en número o diagnóstico |
| “Me molesta la rodilla al hacer sentadilla profunda.” | Regex discomfort conserva cita; Coach ve original; extractor nota reduce movement a rodilla | Dedupe puede fusionar contextos; falta relación canónica cita→movimiento→condición. Dolor no es automáticamente hard constraint | knowledge y notas blandas; restricciones tienen autoridad separada, no actualizada por applyChatStateChange |
| “No quiero correr mañana.” | Chat entiende intención, puede proponer REST/adaptación | `parseTemporaryAvailability` exige “esta semana [día] no puedo entrenar”; no persiste esta preferencia como unavailable. REST requiere target válido | Adaptación local vía acciones; sin autoridad genérica de preferencia temporal de disciplina |
| “El viernes solo tengo 40 minutos.” | Chat ve frase; `explicitChatTimeCeiling` captura 2400 s | Regex no vincula viernes al límite: aplica a alternativas de ese mensaje; disponibilidad semanal no representa minutos | Presupuesto perfil/contrato de sesión; no escritor chat genérico de límite fechado |
| “Hoy hice el entrenamiento del box por mi cuenta.” | Chat y extractor de ejecución; fecha hoy reconocible | Externo debe diferenciarse del plan Forge; carga externa solo Focus/lista delegada; varias capturas paralelas | workout_history/external_training_records/chatExecutionEvidence; no asumir que completa sesión propia |
| “Quiero mejorar el snatch sin dejar de preparar el 10K.” | Chat + nota técnica; posible cita aprendida | Lista objetivo único no resuelve relación mantener/mejorar; pendingGoal puede rechazar formulación. Nota no garantiza llegada al Analyzer | Goal primario, secundarios de perfil/knowledge/notas; falta operación conversacional atómica con roles y evidencia |

## G. ¿Qué evidencia ve cada Coach?

| Nivel | Original / resumen / estructura | Estado persistente y omisiones | Filtros previos |
|---|---|---|---|
| Chat grounded | **Sí, mensaje actual original** en `groundedCoach.ts:270`; últimos 6 turnos serializados con metadata; contexto longitudinal acotado | Perfil, plan, historia, restricciones, readiness/fisiología, referencias, material, knowledge y eventAuthority (`:31–67`). Historial total no ilimitado; multimodal no pasa en coachMessage | Intercepciones UI antes de llamar; mutaciones regex previas; ranking y truncamiento. Clasificación READ no sustituye original |
| Chat genérico legacy | `system/messages` del cliente + canonicalEventPrompt (`route.ts:5475`) | Contexto UI, aggregator, resúmenes y tags; no equivale al grounded | Etiquetas sueño/entreno, prefijos/capacidades y compactación; ruta distinta |
| Block Analyzer | **No mensaje actual**. Estructura canónica + resúmenes narrativos de exposición/bloque/notas | Target singular, objetivo, ciclo, restricciones completas, 10 notas blandas (`route.ts:2155,2182`); no `historial` ni knowledge íntegro | Target firmado/catálogo, selección/dedup de notas, exposición textual; output objetivo sobrescrito |
| Weekly Coach | **No mensaje actual**. Contrato + `COACHING_CONTEXT` (`allowedWeeklyPlanContract.ts:302`, `openWeeklyCoachContract.ts:94`) | Estrategia/evento, disponibilidad, fisiología/readiness, historia, notas (8), debilidades, externo y knowledge (`weeklyCoachingContext.ts:112–135`) | Preflight, goal/strategy, scope, disponibilidad. Citas pueden llegar como knowledge: no garantiza representación de eventos |
| Session Builder | **No reporte actual automáticamente**. Contract + serverProfile/historia/readiness/requestContext (`sessionAuthority.ts:168`; `sessionGeneration.ts:108`) | weekStrategy/eventAuthority dentro de doseContext cuando existe; target en perfil; contexto del día/vecinos/analysis. No colección de próximos eventos | Calendario/recibo/intent admitidos, contrato de sesión, scope/restricciones/referencias |

En el chat normal, `FormaPro.tsx:2186` envía tanto un prompt legacy construido en UI como `coachMessage:texto`; la rama `coachGrounding` utiliza **el segundo** para construir su propio prompt. Afirmar que las instrucciones READ o el resumen sueño de UI gobiernan ese Coach sería confundir payload redundante con consumo efectivo.

Para Builder hay contexto indirecto, no una garantía de continuidad conversacional. Una cita conservada en perfil puede existir en el payload, pero eso no la convierte en evento validado ni obliga a cada consumidor a contemplarla.

## H. Hechos, interpretaciones, decisiones y contenido generado

| Separación existente | Evidencia | Lo que falta |
|---|---|---|
| FACT canónico vs ADVISORY | `groundedCoach.ts:225–241`: snapshots y grounding exacto; no promocionar conversación a canonical | Modelo común de fact candidate con cita, mensaje estable, fecha de reporte y de vigencia |
| Evidencia/interpretación/decisión/answer | `coachOutputContract.ts:4–9`; review distingue unsupported_fact/interpretation/recommendation | La separación de salida de chat no se propaga íntegra a las autoridades de planificación |
| Citas literales | `runChatCoach.ts:82–100`, `chatCoachActions.ts:129`: includes de quote y revisión | Contención literal no prueba sujeto, negación, temporalidad ni si es hipotético; requiere interpretación contextual |
| Conocimiento declarado | `athleteCoachingKnowledge.ts:8,52`: fuente, cita, effectiveDate, scope, supersededBy, evidenceId | Regex puede certificar interpretación incorrecta; effectiveDate=today no representa necesariamente vigencia real |
| Evento firmado | `eventAuthority.ts:16,34,59`: provenance, confirmation, revision, digest/signature | Firma prueba integridad/origen, no comprensión; un solo origen/formulario, sin cita ni secundarios |
| Planificado/adaptado/realizado/respuesta | `chatCoachActions.ts:19,118,141`; `longitudinalContext.ts:10` | Writers legacy y registros externos no comparten toda esa granularidad |
| Temporalidad de conversación | `conversationEvidence.ts:14` conserva timestamps presentes o UNKNOWN | `runChatCoach.ts:112` guarda role/content sin añadir timestamp/ID; no reconstruir fecha de evento a partir de índice de historial |
| Referencias/estado compartido | `athletePrescriptionContext.ts:15`, running evidence y physiology sources | Provenance desigual entre campos legacy y estructurados; origen de DB no significa dato humano verificado |

**Rutas de promoción a vigilar:** PR regex escribe historial de marcas; extractor de coaching notes escribe issue de LLM sin conservar cita; carga externa escribe números del LLM con `source:user_report` y fecha actual; extracción legacy puede guardar lesiones/notas aunque anule otros campos. No se demuestra invención en una ejecución concreta, pero esas rutas no ofrecen la misma trazabilidad que el contrato grounded.

**Rutas de desaparición:** availability `continue` para eventos; catálogo target sin writer alternativo; sintaxis de preguntas pendientes; filtros de fecha/negación; dedup por zona; ventana/recorte histórico; proyección Planner sin conversación. Impedir invención y evitar pérdida requieren ambas fronteras, no elegir solo una.

## I. Frontera arquitectónica mínima propuesta — sin implementar

```text
USER MESSAGE (ID, actor, timestamp, texto íntegro, adjuntos/evidencia)
  → SEMANTIC INTERPRETATION (sin escrituras, con contexto)
  → TYPED INTENTS + FACT CANDIDATES + cláusulas sin resolver
  → DETERMINISTIC VALIDATION (identidad, schema, scope, fechas, consistencia)
  → CANONICAL STATE / COACH CONTEXT (hechos aceptados + incertidumbres)
  → COACHING DECISION (razón y fact IDs)
  → PLAN VALIDATORS
  → PERSISTENCE (CAS + readback + recibo)
```

**Intérprete:** comprende confirmación, negación, co-referencia, temporalidad, objetivos simultáneos, preferencias y eventos sin taxonomía formal. Devuelve múltiples candidatos, cada uno con `messageId`, cita/offsets, actor, fecha de reporte, tiempo efectivo explícito o interpretación temporal trazable, campos desconocidos y relación con pregunta pendiente. No escribe, no prescribe por el hecho de extraer y no completa distancias, intensidad, fechas, prioridades ni diagnósticos ausentes. La intención de generación puede coexistir con una carrera reportada.

**Validador:** acepta esquemas/identidades/unidades/fechas válidas y comprueba contradicciones contra snapshots, permisos, límites vigentes y revisiones. Una fecha relativa debe conservar fecha de referencia/zona y su carácter interpretado; si no se desambigua, queda pendiente. La validación de cita literal es necesaria pero insuficiente: el intérprete/revisor semántico debe justificar que esa cita apoya esos campos. El código no decide el significado de “con mi mujer” ni la importancia deportiva.

**Estado/contexto:** separar `primaryGoalId` de `reportedEvents[]`. Evento mínimo extensible: ID, descripción libre, intervalo/fecha o pendiente, participantes/sujeto, características explícitas (p. ej. distancia y unidad), intención declarada, status y provenance por campo. No exigir `goalId` conocido para conservar que existe. El vínculo con un dominio/enriquecimiento es opcional; la capacidad de prescribir ese dominio es otra cuestión. Secondary/upcoming no debe ser sinónimo de objetivo nuevo. Un evento fuera de ownership sigue siendo contexto de carga/agenda, sin otorgar permiso para planificar ese deporte.

**Coach:** decide implicaciones deportivas de hechos aceptados y reportes con incertidumbre explícita: participación, preferencia declarada y relación con objetivo principal. Puede proponer cambios de carga sin inventar ritmo competitivo ni intensidad. Las decisiones citan fact IDs y no se reutilizan como hechos del atleta. Si falta algo que cambiaría la decisión, pregunta preservando el resto del mensaje.

**Persistencia y clientes:** writer separado acepta solo operaciones admitidas ligadas a snapshot/evidencias; resultado distinguishes proposed/committed/unverified. Backend común para Web y Expo; UI presenta requisitos serializables, nunca decide por texto renderizado ni conserva una autoridad paralela en estado React. Mantener conocimiento de dominio explícito en adapters, como exige `docs/sufficiency-pre-gate.md`.

## J. Reutilización

| Pieza | Decisión | Justificación |
|---|---|---|
| `coachOutputContract` y salida estructurada grounded | **KEEP / ADAPT** | Mantener transporte/separación factual; añadir contrato de interpretación independiente de answer |
| `runChatCoach` y factual review | **KEEP / ADAPT** | Respuesta no depende de escritura; compartir evidencia con generación y preservar cláusulas pendientes |
| Regex de availability, confirmaciones, temporalidad y extracción | **MOVE / REPLACE** | Mover comprensión al intérprete; reemplazar función decisoria del match, conservar utilidades numéricas/fechas |
| `eventAuthority/eventActions` | **ADAPT** | Conservar firma/revisión/ownership/readback; separar objetivo singular de eventos reportados múltiples |
| `canonicalWeekStrategy`, planning context y doseContext | **ADAPT** | Transportar hechos/eventos vigentes y provenance; no reconstruir semántica en cada nivel |
| `prescriptionScope`, identity, recibos, CAS/readback | **KEEP** | Invariantes de permiso, concurrencia e integridad ajenas a fluidez del lenguaje |
| `getCanonicalRestrictions`, physiology authority | **KEEP / ADAPT entrada** | No convertir molestias/silencio en restricción/resolución; candidatos validados antes de writer |
| `coaching_knowledge` y provenance | **ADAPT** | Reutilizar citas/evidenceId/supersession; añadir sujeto, fechas separadas y vínculo estable de mensaje |
| `conversationEvidence/longitudinalContext` | **ADAPT** | Mantener roles/UNKNOWN/límites; conservar evidencia fuera de recortes y permitir recuperar por ID |
| `resolveDataSufficiency` | **KEEP** | Motor de requisitos/capacidades/evidencia independiente de deportes; no reintroducir listas centrales |
| Movement/stimulus/equipment/reference libraries | **KEEP** | Conocimiento explícito útil; desconocido no niega existencia de evento o intención |
| Readiness/training load | **KEEP** | Cálculos derivados y provenance; no inventar score desde cansancio ni ejecución desde plan |
| Plan/whole-week/session validators | **KEEP** | Validan invariantes y restricciones; revisar políticas deportivas separadamente, no desactivar seguridad |
| Writers legacy de tags/notas/external load | **ADAPT / REPLACE entrada** | Converger en evidencia+operación; no reactivar parser de prosa como permiso de escritura |
| Catálogos de estrategia/evento | **KEEP como adaptadores / ADAPT frontera** | Capacidad de prescripción no es ontología universal de hechos humanos |

## K. Migración incremental — cuatro fases como máximo

### Fase 1. Entrada íntegra y salida de las puertas de disponibilidad

- **Frontera:** mensaje → intérprete sin escrituras → operación disponibilidad/confirmación/temporalidad tipada → writer actual. Registrar evidencia antes de cualquier return; cláusulas ajenas a la pregunta pasan al contexto del Coach, sin promoverlas automáticamente a hechos confirmados.
- **Archivos estimados:** `app/FormaPro.tsx`, `app/api/chat/route.ts`, nuevos `lib/chat/semanticInterpretation.ts` y contrato/evidence store; `chatAvailability.ts`, `weeklyAvailabilityDeclaration.ts`, `availabilityResponse.ts`, `weeklyGenerationPreflight.ts`.
- **Tests necesarios:** mensajes naturales equivalentes, negaciones, PATCH vs snapshot, cero explícito, cambios parciales, incertidumbre, múltiples intenciones, evento junto con confirmación, dato desconocido, cambio de tema, paridad Web/Expo, fallback histórico inválido con base válida y restricciones fechadas. Tests de no escritura del intérprete y de evidencia idéntica hasta Coach.
- **Invariantes:** scope/ownership intactos, no guardar unresolved, no reinterpretar UNKNOWN como cero, CAS y readback, no generación duplicada, no fallback de nueva frase ambigua a dato viejo fingido.
- **Salida:** en fixtures, todo mensaje recibe interpretación/clarificación y conserva cada cláusula; ni error ni success elimina hechos adicionales. Shadow sin escrituras primero; activar por flag tras concordancia de casos conocidos y revisión de diferencias.
- **Rollback:** desactivar nuevo intérprete/escritor por flag; conservar ledger de evidencia. Nunca reejecutar cambios con resultado unverified ni borrar cambios ya confirmados.

### Fase 2. Eventos reportados y contexto compartido de planificación

- **Frontera:** candidatos evento → validación de hechos → colección versionada → Analyzer/Weekly/Builder. Primary target permanece referencia separada. No se añade una excepción “5K”.
- **Archivos estimados:** `eventAuthority.ts`, `eventActions.ts`, `athletePrescriptionContext.ts`, `loadAthletePrescriptionContext.ts`, `groundedCoach.ts`, `canonicalWeekStrategy.ts`, `prepareAllowedWeeklyPlanContract.ts`, `weeklyCoachingContext.ts`, `sessionDoseContext.ts`, `sessionAuthority.ts`, prompts de las acciones en `route.ts`; almacenamiento/migración aditiva a decidir.
- **Tests necesarios:** media 15/11 + carrera 5 km 27/09 conservan dos entidades; 8 km/trail/CrossFit/HYROX/partido/test/descripción libre; ausencia de distancia/intensidad/fecha no se inventa; evento fuera de ownership llega como contexto; cancelación/corrección/duplicados; actualización invalida recibo desactualizado; cada consumidor recibe IDs y evidencia.
- **Invariantes:** no sustituir target al añadir evento, no autorizar taper/dosis por mera captura, no ampliar scope, mantener restricciones y sesiones pasadas/completadas, no deducir competición de disponibilidad.
- **Salida:** traza offline demuestra llegada del evento a los tres niveles; revisión de decisiones exige considerar su evidencia, sin fijar una única respuesta deportiva. Aceptación controlada posterior, solo con autorización específica de ejecución.
- **Rollback:** apagar consumo de colección por flag y volver a autoridad target v1; mantener colección/evidencia para revisión, sin revertir planes ya guardados automáticamente.

### Fase 3. Objetivos, preferencias, feedback y writers paralelos

- **Frontera:** comprensión común → candidatos de objetivo/recurso/tiempo/ejecución/observación → autoridades dedicadas. Migrar pregunta pendiente y escritura regex previa al Coach. Separar cambio de objetivo principal de intención secundaria y reportes clínicos de restricciones estructuradas.
- **Archivos estimados:** `goalAnswers.ts`, `goalResolution.ts`, `strategyResolution.ts`, `chatStateChange.ts`, `athleteCoachingKnowledge.ts`, `chatCoachActions.ts`, `prescriptionAnswers.ts`, `runningHabitualDeclarations.ts`, `reportExecutionDate.ts`, `physiology/adapters.ts`, endpoints PR/notas/externo/completion en `route.ts` y handlers UI.
- **Tests necesarios:** ocho ejemplos de F; citas de terceros, hipótesis, negaciones, múltiples pesos/reps, límite de viernes no aplicado a otro día, reporte externo no completa plan propio, modificación y observación separadas, fechas relativas/zonas, writer único idempotente, CAS con cambios concurrentes, fallo LLM sin perder respuesta.
- **Invariantes:** referencias no inventadas, no diagnóstico ni resolución clínica implícita, planificación ≠ ejecución, no ampliar alcance, hechos con evidencia, objetivos sustituidos conservados como antecedentes.
- **Salida:** writers activos consumen candidatos validados, no selección lexical como prueba factual; shadow y métricas muestran cobertura sin nuevas promociones indebidas.
- **Rollback:** flags por tipo de candidato; writers previos solo para rutas aún no migradas. Evitar dual-write y replay de operaciones inciertas.

### Fase 4. Convergencia, retirada de legacy y cierre de trazabilidad

- **Frontera:** quitar caminos redundantes de clasificación/tags/extracción que ya no tienen autoridad; estabilizar contratos compartidos y políticas deportivas separadas de validadores.
- **Archivos estimados:** `FormaPro.tsx`, `route.ts`, `lib/mobile/buildPrompt.ts`, `conversationEvidence.ts`, `longitudinalContext.ts`, `proposalParser.ts`, diagnósticos y tests de integración/contratos.
- **Tests necesarios:** grafo de callers sin bypass semánticos, parity Web/Expo, permisos/ownership/CAS/readback, recuperación por evidencia, adjuntos, entradas mixtas, presupuestos de contexto, interrupción/reintento, receipts y whole-week existentes.
- **Invariantes:** core independiente de React/DOM/deporte, no catalogar universo del lenguaje, no usar prosa generated como evidencia humana, no rebajar restricciones ni límites existentes.
- **Salida:** cada hecho consumido puede trazarse a origen; cada cláusula no representada queda visible como pendiente/advisory; no quedan decisiones de comprensión en cliente ni writers alternativos sin contrato.
- **Rollback:** mantener adaptadores de lectura y versiones de contrato durante ventana de compatibilidad; flag de consumo al contrato anterior, sin migración destructiva ni borrado de historial.

## Riesgos y controles de migración

1. **Mayor cobertura no garantiza hechos correctos.** Citas, negación, sujeto y tiempo deben revisarse; no basta JSON válido, confidence o firma.
2. **Interpretación temporal:** hoy/mañana/domingo dependen de timestamp y zona; el repositorio mezcla Canarias y Madrid. Unificar la referencia del mensaje sin reinterpretar silenciosamente datos antiguos.
3. **Duplicación/concurrencia:** hoy existen varias capturas en paralelo; introducir otro writer sin convergencia duplica ejecuciones y pierde actualizaciones. Idempotencia por evidencia y CAS antes de activar escritura.
4. **Falsa certeza por catálogo/fallback:** preservar texto declarado y cobertura de adaptación; `running_general` no prueba comprensión de “media en noviembre”.
5. **Confundir seguridad con política deportiva:** no retirar bloqueos de restricciones, scope o compatibilidad de referencias al quitar vetos semánticos; tampoco convertir una recomendación de carga en hecho del atleta.
6. **Eventos contradictorios:** correcciones/cancelaciones/repeticiones y concurrencia requieren IDs/revisiones; prioridad declarada puede ser desconocida. Añadir evento no reemplaza target.
7. **Contexto y latencia:** no enviar todo el historial a todos los modelos. Proyectar hechos vigentes con IDs y cobertura explícita; recuperar citas cuando haga falta.
8. **Rollback limitado:** apagar una feature no deshace una escritura ya confirmada. Conservar evidencia y versiones; correcciones posteriores requieren operaciones explícitas verificadas.

## Verificación de esta auditoría

Se revisó el código y los callers de las fronteras descritas, sin ejecutar tests de producto ni inferencias de proveedores. No se ejecutó una simulación histórica de FORGE12 ni se certifica el estado desplegado. Se comprobó que el estado final solo añade este informe y no cambia código/tests/prompts; la comprobación de whitespace no encontró errores. Las fases anteriores son propuestas, no cambios realizados.
