# FORGE — Auditoría arquitectónica Coach-first

22 de septiembre de 2026. Auditoría estática del árbol de trabajo posterior a la reversión selectiva de 1A.2. HEAD leído: `7f7e777e12ff1c95be07d96eaa40d8bb08bd88c2`. Las referencias de línea corresponden a este árbol, que contiene Fase 1A sin commit; no describen únicamente HEAD.

Alcance: recorrido de llamadas desde `FormaPro.enviar`, servicios compartidos, autoridades de escritura y planificación. No se ha ejecutado el producto, ninguna evaluación live, llamadas a proveedores, consultas a Supabase ni generación de semanas. No se ha cambiado código, tests o prompts. Las estimaciones de llamadas y latencia son deducciones del código, no mediciones nuevas. Los 45/45 tests de Semantic Intake, TypeScript y diff check corresponden al cierre anterior de la reversión; esta auditoría no los ha vuelto a ejecutar.

## 1. Resumen ejecutivo

**Recomendación: adoptar Coach-first en dos etapas productivas y retirar Semantic Intake como arquitectura de producto.** No hay una dependencia técnica que obligue a interpretar y certificar el lenguaje antes del Coach. Sí hay autoridades deterministas valiosas que deben seguir autorizando y validando cada acción después de la interpretación.

El sistema ya contiene parte de la solución: `runChatCoach` es compartido, `answerGroundedChat` recibe el mensaje original y `chatCoachActions` admite acciones estructuradas que pasan por contratos, restricciones y CAS. El problema está en las rutas que rodean ese núcleo: preguntas pendientes que consumen el turno, dos clasificadores previos, extractores con escrituras concurrentes, interpretación lingüística de Availability y cargas de contexto longitudinal incluso para consultas locales.

La migración mínima transforma ese núcleo en un Coach con lecturas progresivas y acciones tipadas. No añade intérprete previo, reviewer semántico previo, clasificador de scope, parser temporal o diccionario de frases. Tampoco convierte todas las frases en memoria. Conserva las autoridades de calendario, ownership, restricciones, dosis, referencias, ejecución y persistencia.

**Límite esencial:** un schema válido, una cita literal o un CAS correcto no demuestran que una interpretación sea verdadera. La nueva arquitectura reduce vías de error y limita sus consecuencias; no puede garantizar ausencia de alucinación semántica. Los datos reportados conservan ese estatus, y las decisiones ambiguas o de mayor impacto requieren aclaración o confirmación vinculada a una propuesta concreta.

## 2. Call graph productivo actual

### Entrada web y respuesta normal

```text
app/FormaPro.tsx:1828 enviar(texto)
 ├─ guardas técnicas: mensaje vacío / petición en curso
 ├─ observeSemanticShadow [flag; independiente; resultado descartado]
 ├─ pendientes objetivo / hábito / prescripción / ownership → endpoint → RETURN
 ├─ fecha + etiquetas sueño/entreno + contexto textual cliente
 ├─ imágenes → extracción de métricas / sesión [rutas independientes]
 ├─ safety nets asíncronos, con posibles escrituras:
 │    PR / fisiología / coaching notes / ejecución / carga externa / cambio de modo
 ├─ confirmación pendiente por regex → confirmar_pending_action [asíncrona]
 ├─ disponibilidad pendiente → guardar_disponibilidad_actualizada → RETURN
 ├─ includeToday pendiente → dispararGeneracion → RETURN
 ├─ procesar_mensaje_contexto [await]
 │    clasificarIntencion [LLM]
 │    → forgeEventAggregator → clasificarMensajeEnBackend [LLM]
 │    → active_events + forgeContextBuilder + lecturas canónicas
 │    → si GENERAR_SEMANA_COMPLETA: dispararGeneracion → RETURN
 └─ apiCall(coachGrounding:true, coachMessage:texto)
      app/api/chat/route.ts:5455 → groundedReply:837
      → lib/chat/runChatCoach.ts:10
         loadChatGrounding [contexto amplio]
         extractCoachingFacts / persistCoachingKnowledge [regex; escritura]
         applyChatStateChange [parser de indisponibilidad; escritura]
         affectedFuturePlans; posible recarga completa
         → answerGroundedChat
            Coach [LLM, contrato de salida; reparación si JSON inválido]
            GROUNDING_REVIEW [LLM]
         → applyChatCoachActions [si autorizadas]
            contrato / target / CHAT_ACTION_REVIEW / validación / CAS
         → posible LEARNING_REVIEW [LLM] + persistencia de conocimiento
         → historial conversacional con CAS → respuesta grounded
```

El cliente construye `system` y `messages`, pero la rama grounded utiliza `coachMessage:texto`, no esos prompts enriquecidos. La transformación previa sí afecta al clasificador y al agregador. No debe atribuirse al Coach grounded la lectura del gran prompt del cliente. Tampoco puede suponerse que el contenido multimodal preparado en `messages` llegue a ese Coach: la llamada efectiva se apoya en el texto original y en las extracciones laterales.

Los safety nets no son todos bloqueantes: sus promesas pueden finalizar antes, durante o después del grounding. Eso introduce carreras entre escrituras, lecturas y mensajes de confirmación. No constituyen una transacción del turno.

### Sesiones, ejecución y memoria

- `answerGroundedChat` → `applyChatCoachActions` (`lib/chat/chatCoachActions.ts:91`): `adapt_session`, `record_performed`, `record_response`; resuelve fecha e ID, construye contrato, renderiza una propuesta admitida, revisa acción, recarga estado y usa `validatePlanMutation` → `mutatePlanWithCAS`. Conserva prescripción base/adaptada y evidencias de ejecución/respuesta.
- En paralelo desde `enviar`, `verificar_sesion_completada_deterministico` (`route.ts:3454`) combina regex, `splitExecutionReports` y Haiku. Escribe `workout_history` y llama a `recordPlanCompletion`. Este último identifica el target por fecha/día y cardinalidad, no por una asociación semántica demostrada con una sesión Forge. Puede guardar historial y fallar al completar el plan; el cliente ya muestra ese estado parcial.
- `verificar_carga_externa_deterministico` (`route.ts:3685`) consulta Focus, usa otro extractor LLM y registra carga externa con fecha actual. `registrar_sesion` (`route.ts:1810`) es otra entrada explícita a la autoridad de completion.
- `runChatCoach` escribe conocimiento antes del Coach mediante `athleteCoachingKnowledge`; después puede admitir citas con `LEARNING_REVIEW`. El extractor lateral `detectar_coaching_note` (`route.ts:3115`) escribe notas por otra vía.
- `resolver_restriccion_atleta` y `completar_reevaluacion_atleta` (`route.ts:3675–3682`) llaman a `transitionAthleteState`: transición explícita restricted → reassessment → normal. No son una licencia para resolver una restricción desde cualquier frase del Coach.

### Disponibilidad, objetivos y generación

```text
dispararGeneracion [FormaPro.tsx:1796]
 → preparar_generacion_semana → beginWeeklyGeneration [token/snapshots]
 → check_week_closure → elegir semana actual/siguiente
 → obtener_confirmacion_disponibilidad → guardar pendiente y RETURN
 siguiente turno → updateChatAvailability → confirmación/patch/snapshot
 → orquestarGeneracionSemana [FormaPro.tsx:957]
    preflight_generacion_semana
     → resolveWeeklyGenerationPreflight + requisitos objetivo/evento/hábito
    analizar_bloque_semana [route.ts:2041]
     → restricciones + contexto atleta + estado canónico + Focus + exposición
     → Block Analyzer
    planificar_semana [2257]
     → planBoundedWeek / contrato de calendario / Weekly Coach
    construir_sesion_dia [2320], por target
     → generateTrainingSession / Session Builder / admisión / recibos
    guardar_plan_semana [4550]
     → admisión + restricciones frescas + validación whole-week
     → reparación acotada si procede → recibo → CAS/create → readback
```

El bucle real de Builders (`FormaPro.tsx:1052–1057`) hace `for ... await` y entrega `acceptedCurrentWeek` acumulado. **Es secuencial**, aunque el comentario superior hable de `Promise.all`. No debe prometerse paralelización sin preservar esa dependencia.

Objetivos: `responder_objetivo_principal` → `saveGoalAnswer` → autoridad de objetivo/fingerprint/CAS. Eventos: `target_event` → `eventAction` → `declareTargetEvent`/`resolveEventAuthority`, ligado al objetivo y catálogo. `registrar_evento` → `athlete_events` es otra entidad legacy; `active_events` agrupa reportes conversacionales. Ninguna de estas equivalencias permite afirmar que ya existe una colección general de futuros `reported_event`.

### Ramas residuales: no confundir presencia con ejecución

`data.grounded` evita `forgeValidator`, persistencia de `[STATE_UPDATE]`, `procesarTags`, compactación y `extractarMemoria` en la respuesta normal (`FormaPro.tsx:2194–2351`). Las rutas de tags y sus safety nets de modificación/referencia futura existen para flujos legacy, pero no se ejecutan por ese camino grounded.

`detectar_propuesta_sesion` sigue siendo invocado por el cliente después de responder, pero el servidor (`route.ts:2756`) devuelve siempre `STRUCTURED_SESSION_REQUIRED`: **no genera propuesta, no llama al proveedor y no escribe**. `respuestaEstatica` se calcula en `procesar_mensaje_contexto`, pero el camino normal inspeccionado no la usa para saltarse al Coach. Las variables `esPlanificacionSemanal` y `esProgramacion` de `enviar` no tienen consumidores posteriores: son residuo, no una puerta efectiva.

La entrada móvil `enviar_mensaje_coach` (`route.ts:1233`) llama al mismo `groundedReply`, sin los interceptores web. Compara `authUserId` del cuerpo con el registro. Esa comparación no equivale por sí sola a verificar un token de sesión en servidor. La rama web acepta `codigo`; `POST` delega directamente a `handlePost`. Esta lectura no certifica autenticación de despliegue o controles externos: el adaptador de tools debe vincular identidad a una sesión verificada, no heredar confianza en parámetros del cliente.

## 3. Puertas semánticas y rutas laterales

Inventario del grafo inspeccionado. «Bloquea» significa que puede evitar la llamada al Coach de ese turno; un escritor concurrente puede alterar su contexto sin bloquearla.

| Archivo / función | Decisión lingüística o transformación | ¿Bloquea? | Estado afectado | Destino Coach-first |
|---|---|---|---|---|
| `FormaPro.tsx:1839`, pendientes; `goalAnswers.saveGoalAnswer` | Número/opción exacta, prefijo «mi objetivo es», objetivo reconocido; cancelación por frase | Sí, return | Objetivo/perfil; continuación semanal | Coach entiende; conservar token, conflicto y CAS |
| `runningHabitualDeclarations.parseHabitualRunningAnswer/isHabitualRunningConfirmation` | Entero aislado o respuesta negativa/confirmación de lista | Sí, pendiente | Declaraciones de hábito y confirmación | Valor/unidad/estado tipados; mantener límites y procedencia |
| `prescriptionAnswers.parsePrescriptionAnswer/savePrescriptionAnswer` | Sí/no y frases de equipo, pares de palabras; respuestas de referencia | Sí, pendiente | Señales/capacidades/referencias | Tool tipada; conservar pregunta serializable y validación de referencia |
| `coachOwnership.parseOwnershipConfirmation` | Forge/externo por regex y lista; rechaza conectores ambiguos | Sí, pendiente | Training sources y distribución | Confirmación estructurada de ownership; mantener permisos |
| `FormaPro.enviar`, etiquetas sueño/entreno y fecha | Regex de sueño/ejecución, instrucciones «hoy» añadidas, selección de resumen | No directo | Texto enviado al clasificador/agregador; historial local | Retirar etiquetas lingüísticas; enviar metadata temporal separada |
| Extracción de imágenes (`route.ts:3047,3192`) | LLM extrae métricas/sesión; confianza para autosave de métricas | No | Fisiología / candidato UI | Entrada multimodal al Coach y acciones tipadas; sin autosave por confianza solamente |
| `strengthRecordParser.parseStrengthRecord` → `verificar_pr_deterministico` | Keywords PR, aliases de movimientos, número kg | No, async | Marcas/registro PR | Sustituir extracción; conservar validador de referencia y unidades |
| `sleepMetricsParser`; `physiology/adapters.manualPatch` | Regex de métricas, unidades y veto a expresiones temporales | No, async | Fisiología canónica mediante `writePhysiology` | Sustituir lenguaje; mantener autoridad fisiológica, fuente, fecha y rangos |
| `detectar_coaching_note` | LLM con categorías y dominios cerrados; umbral de longitud | No, async | `athlete_coaching_notes`, confianza acumulada | Eliminar extractor automático; observación explícita cuando útil |
| `verificar_sesion_completada_deterministico`; `reportExecutionDate` | Veto sueño/negación, segmentación y fechas por regex; LLM de ejecución | No, async; puede preguntar aparte | Historial + completion del plan | Tool ejecución; separar externo y sesión enlazada |
| `verificar_carga_externa_deterministico` | LLM clasifica entre disciplinas externas y presupone fecha actual | No, async | Carga externa | Unificar con registro de ejecución tipado |
| `verificar_datos_cambio_modo_deterministico` cuando hay cambio en curso | Extracción LLM de datos de onboarding/modo | No, async | Perfil/distribución/sources/modo | Flujo explícito de configuración; no escritor oculto por turno |
| `FormaPro`, `CONTIENE_CONFIRMACION` | Regex de aceptación corta, ≤8 palabras | No, async | Ejecuta `pending_action` | Confirmación ligada a proposal ID/revisión; sin diccionario de síes |
| `chatAvailability.updateChatAvailability`; `availabilityResponse` | Confirmación exacta, categorías/aliases, gramática de cambios | Sí en espera | Perfil semanal o distribución/sources | Tool tipada; no parser como autoridad |
| `weeklyAvailabilityDeclaration.resolveWeeklyAvailabilityResponse` | Días, negación, descanso, evento, incertidumbre; patch/full | Sí en espera | Declaración semanal | Retirar interpretación; conservar validación de declaración almacenada |
| `weeklyGenerationPreflight.parseIncludeToday` | Frases/regex para incluir hoy | Sí, return/pregunta | Decisión de admisión de calendario | Booleano del Coach o pregunta; mantener preflight |
| `route.clasificarIntencion` | LLM de etiqueta única; familias cerradas, confianza ≥0.6 | Sí para generación | Dispara flujo semanal, pending UI | Retirar router semántico previo |
| `forgeEventAggregator` → `clasificarMensajeEnBackend` | Segundo LLM: TRAINING_REPORT/SLEEP_REPORT/OTHER; un bucket activo | No directo; await | `active_events`; reemplaza bucket anterior | Retirar agrupación como autoridad; conservar conversación sin reducir intents |
| `forgeContextBuilder/buildConversationFacts` | Bucket/fechas/keywords convertidos en instrucciones de hechos «hoy» | No directo; await | Contexto; lecturas amplias | Proyecciones con procedencia solicitadas por tools |
| `getResponseMode`, `knowledgeRouter`, capabilities por intent | Selección cerrada de lectura y respuesta | No veto efectivo de respuesta normal | Contexto/lecturas; respuesta estática no usada aquí | Lecturas tipadas; retirar cálculo duplicado |
| `runChatCoach` → `extractCoachingFacts/persistCoachingKnowledge` | Regex/aliases; veto global a preguntas/citas; recursos/capacidades/dolor | No al texto, sí escribe antes | `coaching_knowledge`, `prescription_signals` | Persistencia seleccionada por Coach, sin extractor paralelo |
| `chatStateChange` → `parseTemporaryAvailability` | Gramática de semana/día/no puedo | No; modifica antes | `perfil.prescription_access` | Excepciones de disponibilidad tipadas |
| `longitudinalContext.projectChatLongitudinal` | Ranking por solapamiento de palabras + recencia | No | Selección de contexto, sin write | Lecturas acotadas; no autoridad ni clasificador de scope |
| Shadow 1A | Intérprete + reviewer + máximo de scopes | No; resultado descartado | Diagnósticos, sin estado productivo | Retirar del producto, no evolucionar |

Las pérdidas de cláusulas son estructurales: una respuesta a pendiente consume el mensaje completo; la clasificación principal devuelve una etiqueta; el bucket de reportes mantiene un tipo; los vetos globales de negación/pregunta afectan a otras cláusulas. En el parser semanal, la rama `event.test(clause)` acumula días de evento y hace `continue`: no persiste descripción ni distancia de la carrera. Es una explicación concreta del riesgo del 5K; no una afirmación de haber reproducido el caso en esta auditoría.

Después del Coach también hay semántica que retirar: `explicitChatTimeCeiling` interpreta frases de minutos; `CHAT_ACTION_REVIEW` vuelve a juzgar la petición; `LEARNING_REVIEW` intenta certificar citas. Las ramas legacy `procesarTags` interpretan tags generados, `verificar_modificacion_sesion_deterministico` usa un clasificador de triggers cerrado y `verificar_referencia_sesion_futura` hace coincidencias textuales con títulos. Deben sustituirse o retirarse al migrar sus consumidores, no contarse todas como pasos actuales de grounded.

## 4. Clasificación de componentes

| Componente | Decisión | Razón / frontera que queda |
|---|---|---|
| Semantic Intake 1A / `semanticInterpretation` | REMOVE | Duplicación de interpretación; sin autoridad productiva actual |
| Semantic reviewer 1A | REMOVE | No certifica significado; introduce otra llamada y falsos rechazos |
| `factCandidates` universal | REMOVE | No hace falta inventariar toda conversación antes de responder |
| Evidence offsets | REMOVE como requisito | Verifican localización literal, no sujeto, hipótesis ni implicación; conservar message ID/raw source para auditoría |
| EXPLICIT / INTERPRETED / UNKNOWN | SIMPLIFY | No contrato semántico universal; campos desconocidos y estatus reportado/confirmado por dominio |
| `contextRequirements`, `scopeAlternatives` | REMOVE del runtime | Escalada al máximo y fallback longitudinal; reutilizar solo ejemplos de necesidades en documentación/tests futuros |
| Semantic shadow | REMOVE del producto | No mantener dos LLM extra permanentemente; resultados históricos bastan |
| Parsers de Availability/confirmación | REPLACE_BY_TOOL | Operaciones confirm/patch/replace sobre datos estructurados |
| Weekly availability declaration | SIMPLIFY | Mantener almacenamiento, normalización estructural y fallback; retirar lenguaje |
| Parsers temporales / includeToday | REPLACE_BY_TOOL | Fechas civiles/booleanos del Coach, calendario validado |
| Goal/event parsers | REPLACE_BY_TOOL | Declaración/reportes estructurados; separar evento de primary goal |
| Modification parsers y tags | REMOVE al migrar consumidores | Acciones tipadas ya disponibles como punto de partida |
| Execution extractors | REPLACE_BY_TOOL | Reporte con fecha, procedencia y asociación explícita opcional |
| Physiology/PR extractors | REPLACE_BY_TOOL | Reutilizar writers y validadores de magnitudes; no reconocer frases |
| Router/clasificadores/generation detection | REMOVE | El Coach elige reads/actions y maneja varios intents |
| Pending-question branches | SIMPLIFY | Requisito pendiente serializable como contexto; sin capturar todo el turno |
| `runChatCoach` | SIMPLIFY | Conservar backend compartido; retirar writes previos, full-load obligatorio y learning automático |
| `answerGroundedChat` | SIMPLIFY | Un Coach con tools; retirar reviewer general obligatorio y sobre de interpretación/evidencia universal |
| Coach output contract | SIMPLIFY | Texto + tool calls/resultados tipados; conservar parsing/schema, separar candidato de confirmado |
| Grounding/action/learning reviewers actuales | REMOVE como autoridad obligatoria | No son barrera técnica demostrable; conservar casos de evaluación, no añadir un reviewer sustituto |
| Canonical athlete state | KEEP | Estado/procedencia y transiciones explícitas; no inferir normalidad |
| Training sources / prescription scope | KEEP | Ownership y permisos de actuación, distintos del scope de contexto |
| Restrictions / readiness | KEEP | Restricciones frescas; readiness unknown sigue unknown |
| Load/history | KEEP + lectura proporcional | Separar planeado, ejecutado, externo y legado; no sumar fuentes duplicadas |
| `eventAuthority` | SIMPLIFY | Preservar integridad del target existente; añadir reportes independientes; catálogo no decide existencia |
| Planning context | SIMPLIFY | Una preparación por generación, fresca y coherente; proyectar eventos reportados |
| CAS/revision/readback/idempotencia | KEEP | Conflicto o write incierto no equivale a éxito ni autoriza replay |
| Plan/session/whole-week validators | KEEP | Validan acciones y contratos deportivos, no intención humana |
| Movement/stimulus/reference libraries | KEEP | Conocimiento deportivo real; adapters de dominio, no aliases del lenguaje del usuario |

## 5. Arquitectura mínima propuesta

```text
cliente web/móvil → backend compartido [identidad, límites técnicos, reloj]
 → Coach: mensaje original + conversación reciente + metadata mínima
    ├─ respuesta o aclaración
    ├─ read tipado → proyección canónica acotada → Coach
    └─ action tipada → validación/autorización → persistencia → resultado
                                                   → Coach / recibo visible
```

El backend conserva el texto original completo y los adjuntos. Una pregunta pendiente es contexto, no un handler que absorbe la próxima frase. El único código anterior al Coach comprueba transporte, autenticación, límites y referencias explícitas de UI; no interpreta lenguaje.

Para el ejemplo box/carrera/descanso/5K, el Coach puede preparar un patch de disponibilidad y un evento reportado, pedir la semana si necesita adaptarla y ejecutar acciones ordenadas. No tiene que reducir todo a un intent ni completar toda la planificación para registrar el evento. Cada resultado conserva éxito/conflicto/desconocido. Una operación fallida no borra ni vuelve a interpretar las demás cláusulas. Antes de generar se exige readback de los datos de los que depende esa generación.

## 6. Capacidades mínimas de tools

Siete capacidades lógicas; no son schemas definitivos ni siete subsistemas nuevos. La lectura agrupa recursos. Las escrituras reutilizan autoridades existentes y evitan una tool genérica de SQL o edición arbitraria de perfil.

| Capacidad | Propósito y contexto mínimo | Argumentos conceptuales | Validación / confirmación | Writes y límites |
|---|---|---|---|---|
| `read_context` | Sesión, semana, estado, eventos o historia pertinente | Recursos, ID/fecha/intervalo, campos, límite/cursor | Identidad, ownership de lectura, rangos y presupuesto; no confirmación | Ninguno. No decide intención, no carga todo por incertidumbre, devuelve unknown/truncado |
| `update_availability` | Confirmar snapshot, patch, replace semanal o excepción; base efectiva y scope | Semana, operación, días por disciplina, excepciones, digest/revisión | Fechas, permisos, integridad de snapshot, diferencia unknown/[]; confirmar cambios de ownership por operación separada de configuración | Disponibilidad operativa; nunca cambia el objetivo, ejecuta sesiones ni toma control de otra disciplina |
| `update_session` | Adaptar/restar solo target autorizado; sesión, restricciones, capacidades/referencias y dosis relevantes | Target ID/fecha, revisión, propuesta tipada, motivo, límites declarados | Scope, futuro/no completada, contrato/dosis/restricciones, CAS/readback. Petición clara y acotada no exige otra confirmación; cambios amplios o target ambiguo sí | Prescripción/adaptación y procedencia; nunca ejecución, alta médica o nueva semana implícita |
| `record_execution` | Registrar trabajo externo o enlazado y respuesta posterior | Fecha/intervalo concreto, descripción, medidas conocidas, source message, target opcional, operation ID | Unidades/fecha no futura, dedup, identidad; target existente y asociación explícita. Si asociación ambigua, preguntar o registrar externo sin completar Forge | Evidencia/historial/carga; completion solo con enlace autorizado. No infiere dosis desde el plan |
| `record_athlete_data` | Reporte duradero acotado: evento, preferencia, observación, medición, capacidad o propuesta de objetivo | Variante, contenido y atributos conocidos, effective date, origen, revisión para corrección | Validador distinto por variante; unidades/rangos en mediciones, permisos de referencias, conflictos. Objetivo principal/cambio de ownership requieren confirmación vinculada | Almacén/adaptador correspondiente. No arbitrary profile patch, restricciones médicas ni promoción de reporte a hecho verificado |
| `transition_restriction` | Solicitar una transición explícita de estado protegido; estado/restricciones actuales | ID/revisión, transición permitida, confirmación/procedencia | Máquina de estados y política existente; confirmación requerida para resolución/reevaluación según transición. Si falta autoridad, no ejecutar | Solo transición admitida. No diagnostica, no acepta un «sí» genérico como alta ni elude restricciones |
| `generate_week` | Invocar planning existente; contexto completo de generación | Semana, includeToday, revisiones de availability/objetivo/eventos, operation ID | Scope, calendario, disponibilidad resuelta, datos suficientes, límites de intentos y todos los validadores. Confirmación antes de sobrescribir cambios materiales no solicitados | Semana validada; no inventa datos faltantes ni reescribe ejecuciones/externos |

`record_athlete_data` es una unión de operaciones cerradas de almacenamiento, no una gramática humana. Cada variante expone su permiso y writer. La configuración de ownership puede conservar su flujo explícito existente en la primera etapa; no se esconde dentro de `update_availability`. Así no se amplía inadvertidamente el alcance al crear tools conversacionales.

No separar `get_current_session`, `get_current_week`, `get_relevant_history` en cinco autoridades: son proyecciones del mismo servicio de lectura. Tampoco fusionar sesión/semana/restricción en una mutación universal: sus permisos, impactos y garantías son distintos.

## 7. Frontera anti-alucinación

Antes de cualquier write: identidad verificada en servidor; pertenencia del recurso; permiso/scope actual; operación y campos permitidos; tipos/unidades/fechas; target existente; restricciones frescas; contrato deportivo aplicable; revisión esperada; idempotencia; resultado comprobable y readback. La propuesta del LLM es una entrada no confiable, no un recibo de autoridad.

Estas comprobaciones pueden impedir completar una sesión ajena, actuar fuera de semana, prescribir un movimiento restringido o sobrescribir una revisión nueva. **No pueden detectar por sí solas una distancia inventada pero plausible, un sujeto mal entendido o un domingo equivocado que sea fecha válida.** No se propone releer la frase con regex, offsets, un segundo intérprete o un reviewer obligatorio para simular esa garantía.

Contención semántica: conservar procedencia y texto original; guardar reportes como reportes; no rellenar campos desconocidos; hacer visible lo que se registra; permitir corrección con revisión; pedir aclaración cuando falte un dato imprescindible. Confirmar una propuesta concreta cuando cambia objetivo principal/ownership, resuelve estado protegido, modifica ampliamente una semana o hay una referencia/fecha de impacto ambiguo. La confirmación se liga a ID, revisión y contenido; puede expresarse naturalmente al Coach o con un control UI. No se valida mediante lista de frases.

No pedir confirmación duplicada para toda observación o adaptación local solicitada inequívocamente. Tampoco conceder por confirmación permisos que no existan ni saltarse hard constraints. Un fallo de lectura de restricciones no significa ausencia de restricciones. En write incierto, mostrar estado no confirmado y consultar por operation ID; no repetir automáticamente ni activar fallback legacy.

La prosa también puede alucinar. Para datos guardados, títulos de sesiones y estados de operación se pueden mostrar resultados estructurados del servidor, sin hacer que un renderer decida el coaching. Eliminar reviewers reduce filtros probabilísticos existentes; su efecto debe evaluarse en la migración, sin afirmar equivalencia de seguridad por decreto.

## 8. Conversación y memoria

| Clase | Persistencia mínima | Ejemplo y caducidad |
|---|---|---|
| A. Conversación efímera | Historial reciente con rol/message ID/fecha; no autoridad canónica | «Estoy cansado hoy»: contexto actual; no rasgo permanente ni diagnóstico |
| B. Estado semanal | Semana/días/excepciones, revisión y origen | Disponibilidad de esta semana; no sobrescribe automáticamente hábito |
| C. Ejecución | Hecho reportado de trabajo realizado, fecha, externo/enlace y medidas conocidas | «Hice box por mi cuenta»: ejecución externa; no completar sesión Forge por coincidir el día |
| D. Longitudinal relevante | Solo observaciones/capacidades útiles, fuente, vigencia y correcciones | Material disponible o tendencia sustentada; repetición no es automáticamente mayor confianza |
| E. Preferencias | Preferencia declarada, alcance, fecha y supersesión | Preferencia estable distinta de imposibilidad o restricción |
| F. Objetivos/eventos | Primary goal explícito; colección independiente de eventos reportados | Carrera domingo sobrevive al chat sin sustituir objetivo del ciclo |
| G. Restricciones | Estado protegido y transiciones existentes | Molestia en jerk puede justificar adaptación hoy; no crea diagnóstico permanente ni alta automática |

Eliminar la obligación de `factCandidates` y el learning automático evita que cualquier frase termine en perfil. Guardar el historial no convierte sus mensajes en hechos. El texto del asistente conserva rol de interpretación; no es evidencia del atleta. Las fuentes legadas siguen marcadas como tales; no se «limpian» ni elevan silenciosamente durante esta migración.

## 9. Contexto proporcional y fast path

Entrada mínima: mensaje original, turnos recientes necesarios para referencias, actor ligado por servidor, fecha/hora y timezone, capacidades disponibles y requisitos pendientes con IDs. Puede adjuntarse una sesión seleccionada explícitamente en UI sin analizar el texto. No cargar historial/ciclo/fisiología antes de saber que son necesarios.

- **Pregunta normal:** una llamada Coach; respuesta directa si no necesita afirmar datos del atleta. Si los necesita, read concreto y continuación. No se adivina una sesión para ahorrar una lectura.
- **Cambio local de jerk:** read de target y restricciones actuales, capacidades/referencias/dosis necesarias. Vecinos o carga solo si la modificación afecta coherencia. El writer vuelve a comprobar invariantes aunque el Coach no pida esos campos. No historial longitudinal completo.
- **5K y ajuste semanal:** semana, disponibilidad efectiva, completadas/pendientes, evento y carga reciente relevante. No convertir automáticamente el evento en primary goal o taper obligatorio.
- **Siguiente bloque/Open/carrera:** lecturas de ciclo, objetivos, eventos, exposiciones, cargas, historial, fisiología relevante y resultados. Aquí sí procede contexto longitudinal.

La selección la hace el mismo Coach mediante reads. No hay llamada previa para clasificar scope ni regla «si incierto, cargar longitudinal». Las tools imponen límites técnicos de tamaño/intervalo, devuelven cobertura y permiten ampliar. Dentro de un turno se reutiliza el snapshot leído; antes de escribir se verifica frescura. No se cachean permisos o restricciones de forma que se salte una revisión nueva.

Hoy `loadChatGrounding` llama siempre a `loadAthletePrescriptionContext`, planes, fuentes, eventos y suplemento semanal. El loader del atleta lee planes, modificaciones, restricciones, recovery y ejecuciones, y calcula proyecciones de exposición/historia. `projectChatLongitudinal` añade ranking lexical. Esa es una carga concreta que se puede evitar; no hace falta sustituirla por otro clasificador.

## 10. Availability: conservar el fallback, retirar el parser

`readAvailabilityConfirmation` resuelve disponibilidad efectiva por semana y scope. `availableDaysAtWeek` compone declaración semanal válida con base habitual y bloqueos por fecha. Una declaración semanal histórica inválida no debe convertirse en cero días: se mantiene la recuperación de la base habitual y su diagnóstico. Este comportamiento es una invariante de migración.

`updateChatAvailability` mezcla hoy interpretación y persistencia. La rama semanal admite full snapshot sin depender del previo y patch sobre disponibilidad efectiva; hace CAS de perfil y readback. La ruta habitual puede actualizar fuentes y distribución en varias escrituras: **no equivale a una transacción única** y merece tratamiento explícito del estado parcial.

Propuesta: conservar esas resoluciones/validaciones detrás de `update_availability`, con `confirmSnapshot`, `patch`, `replaceWeek` y excepciones estructuradas. No pasar texto al antiguo parser desde la tool. Ausente = no cambiar; desconocido = no resuelto; array vacío explícito = cero entrenamiento. Una confirmación valida el digest del snapshot mostrado; un patch no borra disciplinas omitidas; un replace declara su cobertura completa; excepciones tienen fechas y alcance. La admisión de disciplinas usa ownership del servidor, no una lista de palabras del usuario.

El descanso sábado, box martes/jueves, carrera en otros días y evento domingo son decisiones coexistentes. El evento se conserva por su operación propia; Availability no absorbe la cláusula ni decide cuánto afecta a la carga. No se rediseña la disponibilidad almacenada para resolver lenguaje.

## 11. Eventos extensibles, separados del objetivo

`EVENT_GOAL_CATALOG` contiene `half_marathon`, `10k`, `crossfit`, `max_strength`, `hyrox`. `declareTargetEvent`/`resolveEventAuthority` ligan el evento principal a goal ID, disciplina, fecha y ownership. **5K no está en ese catálogo**, pero añadirlo no resolvería el problema abierto de 8K, trail, partido o evento desconocido.

Representación mínima propuesta: ID de reporte, descripción, fecha o intervalo opcional, detalles conocidos opcionales, intención/importancia solo si declarada, origen/message ID y estatus reportado/tentativo/cancelado con revisión. La fecha de registro la fija el servidor; fecha del evento puede ser desconocida. Distancia/unidad son detalles opcionales, no requisitos de existencia. No hace falta inventar `sportId`, distancia, prioridad o nivel competitivo.

Así 5K, 8K, media, trail, CrossFit, HYROX, partido, torneo, prueba física y evento sin nombre usan la misma operación. Descripción libre no autoriza prescripción en un dominio no soportado. Los adapters deportivos pueden enriquecer/admitir una planificación cuando tienen conocimiento; el motor compartido consume requisitos/capacidades/evidencia.

Primary goal permanece como decisión separada. `eventAuthority` puede seguir protegiendo el target confirmado existente y proyectarlo junto a reportes adicionales con su procedencia, sin promoverlos a objetivos. La selección deportiva de relevancia corresponde al Coach/planning; la integridad, fechas, revisión y alcance al servidor. No crear ramas «si 5K…» en admisión o almacenamiento.

## 12. Fechas

Entregar al Coach timestamp actual del servidor, timezone del atleta/aplicación, fecha civil local derivada y, al leer una semana, su inicio/fin y calendario. No imponer hoy según la hora del navegador. Actualmente conviven `Europe/Madrid` en etiquetado/carga/restricciones y `Atlantic/Canary` en completion/generación; la migración debe fijar el contrato temporal por operación sin reinterpretar retrospectivamente datos guardados.

El Coach produce fecha civil o intervalo si hay suficiente contexto; si «el viernes después del box» no identifica un día concreto necesario para actuar, pregunta. Un evento sin fecha puede registrarse como tal; una completion no puede inventar fecha. El validador comprueba civilidad real, orden de intervalo, límites de semana y futuro/pasado permitido. Validar formato ISO es técnico y se conserva; reconocer «mañana» mediante regex se retira. No se propone IR temporal, catálogo de expresiones ni motor lingüístico alternativo.

## 13. Cambios de sesión

La base reutilizable es `chatCoachActions`, no el viejo clasificador de triggers. `renderAlternative` usa `resolvePrescriptionIntent`, `buildSessionDoseContext`, `buildAllowedTrainingContract`, `parseStructuredSession` y `renderContractSession`. La persistencia usa validación de mutación y CAS, con recarga antes de escribir. El backend ya distingue PLANNED, ADAPTED/CURRENT, PERFORMED y RESPONSE.

Para «hoy no puedo hacer jerk pesado; cámbiamelo»: el Coach resuelve target con una lectura, interpreta motivo, conserva el objetivo/estímulo en lo posible y propone el cambio mínimo admitido. No convierte molestia en diagnóstico, ni necesita una categoría de trigger cerrada. La tool valida el contrato y restricciones activas; si la alternativa exige datos desconocidos, devuelve requisito concreto. El resultado registra cambio y revisión. Una declaración posterior de lo realizado usa `record_execution`, conservando la diferencia entre lo prescrito y lo ejecutado.

Retirar `explicitChatTimeCeiling` a favor de un límite declarado estructurado. Retirar el reviewer semántico obligatorio de acción solo cuando la ruta nueva tenga todas las garantías técnicas y pruebas de sus pérdidas; no sustituirlo por un parser del texto. Los intentos de actuar sobre sesión completada, externa o ambigua siguen bloqueados. Una modificación local no dispara generación semanal por defecto.

## 14. Generación semanal

Reutilizar Analyzer → `planBoundedWeek` → `generateTrainingSession` → whole-week admission/persistencia. Trasladar la coordinación actualmente en React al servicio de `generate_week`, para que web y móvil consuman la misma autoridad. Esto es consolidación del flujo, no un nuevo planificador.

Antes de generar: scope y fuentes; disponibilidad efectiva y excepciones; semana objetivo/includeToday; snapshots y revisiones; completadas y protegidas; restricciones; readiness/recovery con estados unknown; objetivo/ciclo/estrategia; capacidad y referencias suficientes; carga interna/externa, historia/exposición relevante; resultados anteriores; eventos reportados vigentes con fechas conocidas o incertidumbre explícita.

Los writes conversacionales necesarios se completan y verifican antes de construir ese contexto. Proyectar eventos desde almacenamiento, no desde un resumen del asistente. Mantener la misma proyección identificada por revisión/digest en Analyzer, Weekly Coach, Builders y admisión final. Si cambia durante la generación, invalidar/reconciliar antes del guardado. Un Builder recibe la información de evento pertinente y decisiones semanales, no necesita reinterpretar la frase inicial.

No convertir cualquier evento en una hard constraint deportiva ni obligar a taper: el Coach decide impacto y justifica su propuesta; los validadores comprueban las restricciones y el contrato admitido. Mantener recibos, presupuestos de intentos, protección de sesiones completadas y ownership externo. No paralelizar Builders ignorando `acceptedCurrentWeek`. Los catálogos de movimientos, estímulos y compatibilidad de referencias conservan su conocimiento; la frontera descrita en `docs/sufficiency-pre-gate.md` sigue aplicando.

## 15. Destino de Semantic Intake 1A

Retirarlo del runtime al consolidar Coach-first. No continuar 1A.2, no promover el shadow, no conservarlo como paso de preautorización. No mantenerlo ejecutándose como observabilidad permanente: añade proveedor/coste sin autoridad útil para el diseño elegido.

Conservar documentos, resultados parciales y corpus como evidencia histórica. Los escenarios naturales/adversariales y categorías de fallo sirven para evaluar comportamiento del Coach y efectos de tools en la migración; no se reutiliza el contrato de interpretación ni se ajustan fixtures con gramáticas. El harness antiguo puede conservarse temporalmente como tooling archivado e inactivo, o retirarse junto con sus dependencias. Eso no exige volver a ejecutarlo.

`contextRequirements` aporta una lista útil de recursos, pero su selección por máximo y fallback longitudinal contradicen el fast path. Reutilizar la idea documental de contexto proporcional, no esa función productiva. Offsets y EXPLICIT/INTERPRETED no se convierten en una segunda autoridad de escritura.

## 16. Archivos candidatos a eliminar

**Lista exacta del paquete 1A que puede desaparecer al retirar íntegramente su runtime y harness** (no se elimina nada en esta auditoría):

```text
app/api/semantic-intake-shadow/route.ts
lib/chat/semanticInterpretation.ts
lib/chat/semanticIntakeShadow.ts
lib/chat/contextRequirements.ts
lib/chat/semanticShadowClient.ts
lib/chat/semanticShadowHandler.ts
lib/chat/semanticShadowProvider.ts
lib/chat/semanticIntakeShadow.test.mjs
lib/chat/evaluateSemanticIntake.mjs
lib/chat/semanticEvaluationClassification.mjs
lib/chat/semanticEvaluationClassification.test.mjs
lib/chat/semanticIntakeFixtures.mjs
lib/chat/semanticIntakeLiveCorpus.mjs
lib/chat/summarizeSemanticIntakeLive.mjs
```

Si se conserva corpus/tooling histórico, conservar conjuntamente los archivos que importe; no borrar sus dependencias dejando comandos rotos. Retirar únicamente el import/hook/flag shadow de `app/FormaPro.tsx`, **nunca borrar ni revertir todo ese archivo**. Los documentos `semantic-intake-*`/`semantic-authority-audit-*` quedan como evidencia. Los seis archivos exclusivos de 1A.2 ya fueron eliminados; no son candidatos nuevos.

Fuera de 1A, hay candidatos condicionales como `lib/execution/reportExecutionDate.ts`, `lib/sports/sleepMetricsParser.ts` y `lib/sports/strengthRecordParser.ts` una vez migrados todos sus consumidores. No se autoriza borrarlos todavía: adapters de fisiología y rutas legacy siguen importando parsers. Se retiran funciones lingüísticas de `availabilityResponse.ts`, `weeklyAvailabilityDeclaration.ts`, `temporaryTrainingAccess.ts`, `weeklyGenerationPreflight.ts`, `goalAnswers.ts`, `prescriptionAnswers.ts`, `runningHabitualDeclarations.ts` y `coachOwnership.ts`, conservando validación/estado tipado donde conviven.

`route.ts`, `groundedCoach.ts`, `runChatCoach.ts`, `chatCoachActions.ts`, `chatAvailability.ts`, `eventAuthority.ts` y `athleteCoachingKnowledge.ts` requieren simplificación selectiva, no eliminación indiscriminada. No borrar libraries/autoridades porque compartan nombres con un parser. La retirada productiva exige revisar referencias web/móvil, jobs y tests de cada export; esta lista distingue eliminación de paquete aislado de limpieza condicionada de código mixto.

## 17. Complejidad y llamadas

Unidad de conteo: invocación al proveedor, no petición HTTP del cliente ni consulta SQL. «Normal» supone mensaje textual que no cae en pending/generación, grounding disponible y salida válida. No incluye retries de red ni shadow salvo donde se indica.

| Recorrido | Actual observado en código | Propuesta |
|---|---|---|
| Pregunta normal | 2 clasificadores seriales antes del Coach + 1 Coach + 1 factual review = **4** en camino de respuesta; learning opcional +1 | **1** si basta conversación; **2** si necesita read y continuación |
| Extractores laterales del mismo turno | Notas +1 si longitud ≥15; ejecución +1 por fragmento admitido; externo +1 en Focus; otros condicionados por modo/imagen/PR | **0** extractores paralelos; operaciones decididas por el Coach |
| Cambio local | Base 4 + normalmente 1 action review por acción; reparación de contrato/learning pueden sumar | Normalmente **2–3** turnos Coach: read → propuesta/tool → respuesta; puede ser 2 con target/contexto disponible |
| Cambio semanal sin regenerar | Pending Availability puede evitar Coach y hacer 0 LLM en ese turno, pero requiere gramática; ajuste por chat suma base y reviews por acción | **2–3** turnos con read semanal y una o varias acciones; no llamada previa de scope |
| Generación semanal / planificación longitudinal | Detección 2 antes de interceptar, o continuación pendiente sin esas 2; después Analyzer + Weekly Coach + N Builders, con intentos/reparaciones adicionales | **2–3** turnos Coach alrededor de reads/tool, más **A + W + ΣBᵢ + R** del planning reutilizado |
| Shadow 1A habilitado | Hasta **2** llamadas extra, independiente de la respuesta | **0** |

`A`, `W`, `Bᵢ` y `R` representan invocaciones reales de Analyzer, Weekly Coach, cada Builder y reparaciones. La expresión nominal 1 + 1 + N es solo el camino sin retries/reparaciones; no es un límite garantizado. Una petición longitudinal de conversación sin generar no necesita Builders. Un cambio semanal que sí regenera entra en la última fila, no en el coste de un patch.

La llamada normal puede alcanzar aproximadamente 6–8 invocaciones totales con notas, ejecución/Focus y learning, sin contar shadow, fragmentación o retries. No todas están en el camino crítico. `LEARNING_REVIEW`, aunque posterior al coaching, se espera antes de devolver HTTP. La salida grounded admite hasta dos intentos de generación por contrato inválido; no se multiplica indiscriminadamente el factual reviewer por todos los componentes.

Por agrupaciones funcionales, una conversación normal atraviesa aproximadamente **9–12 capas**: interceptores cliente, etiquetado, fan-out de extractores, router, agregador, builder de contexto, grounding amplio, extractores/escritores internos, Coach, reviewer y memoria/persistencia; las acciones añaden su cadena. Propuesta: **3 capas** para respuesta directa (entrada técnica, Coach, salida) y **5** para acción (entrada, Coach, read/dispatcher, autoridad/validador/persistencia, resultado). Son agrupaciones arquitectónicas explícitas, no recuento de funciones.

La mejora esperable proviene de eliminar los dos clasificadores seriales, la revisión general obligatoria, writers laterales y full grounding indiscriminado. No se prometen milisegundos ni p95: hay que medir primer token, respuesta completa, llamadas, lecturas, tokens y resultados de mutación en la migración. Los turnos con tool loop o generación seguirán costando más que una respuesta directa.

## 18. Migración: exactamente dos etapas productivas

### Etapa 1 — Coach-first bajo flag, con autoridades existentes

**Cambia:** entrada compartida con mensaje original; tools y reads proporcionales; pending como contexto; evento reportado separado; coordinación semanal en backend reutilizando planning. Para el turno de la cohorte nueva se desactivan interceptores lingüísticos, clasificadores y writers paralelos antiguos. Se simplifica el núcleo grounded para que no conserve escrituras pre-Coach ocultas. No llamar desde una tool al endpoint antiguo que vuelve a parsear lenguaje.

**Permanece:** fallback de Availability, contratos y almacenamiento compatible, autoridades deportivas, scope, restricciones, recibos, CAS/readback, evidencia histórica. El flujo antiguo sigue disponible para usuarios fuera de la cohorte; no actúan ambos sobre el mismo turno.

**Pruebas:** regresiones offline de Availability/fallback/patch/full/zero, ownership, calendario/includeToday, fechas/zona horaria, sesiones/whole-week, restricciones/transiciones, dosis/referencias, ejecución externa/enlazada, concurrencia/reintento incierto y mobile/backend compartido. Escenarios naturales con múltiples cláusulas, corrección, hipótesis, terceros y el evento no catalogado deben evaluar acción/estado final, no reconocimiento de frases. Validar que no se dispara ningún writer legacy en la ruta nueva. Evaluaciones futuras con proveedor requieren autorización independiente; no forman parte de esta auditoría.

**Invariantes:** una autoridad de escritura por operación; identidad verificada; datos reportados no elevados silenciosamente; ninguna acción fuera de scope; protección de ejecuciones y fallback intactos.

**Rollback:** desactivar flag para turnos nuevos. Nunca reejecutar por legacy un turno que ya escribió o cuyo resultado sea incierto. Mantener reportes ya guardados y compatibilidad de lectura/proyección para que el fallback no ignore eventos nuevos; si no puede consumirlos con seguridad, bloquear solo la generación afectada hasta reconciliar. No borrar evidencia ni volver HEAD atrás.

**Salida:** corpus y regresiones acordados sin invenciones/sujeto/fecha/ejecución erróneos aceptados en la muestra de aceptación; errores técnicos fallan cerrados; observación de reducción de llamadas y latencia; contextos y writes proporcionales; rollback comprobado. Cero fallos en una muestra no demuestra garantía universal.

### Etapa 2 — Coach-first como entrada productiva y retirada

**Cambia:** activar autoridad semántica única en clientes; retirar shadow1A y harness de runtime, ramas pending lingüísticas, clasificadores, extractores paralelos, tags y endpoints residuales ya sin consumidores. Conservar corpus/evidencia histórica. Eliminar código duplicado del cliente, no reglas deportivas.

**Permanece:** mismos validadores y writers consolidados, estados/recibos compatibles, adapters de dominio, observabilidad de resultados y cobertura de contexto.

**Pruebas:** repetir suite de autoridades y recorridos integrados web/móvil; comprobar referencias/consumidores antes de retirar cada export; replay offline de operaciones estructuradas y conflictos; verificar ausencia de llamadas a intake/reviewers retirados y de vías alternativas de escritura. No añadir frases ni regex para aprobar casos.

**Invariantes:** las de etapa1 y ninguna dependencia de React/DOM/texto renderizado para admitir una acción.

**Rollback:** desplegar la versión anterior compatible con datos nuevos; conservar operation IDs y readbacks. No restaurar automáticamente escrituras antiguas sobre operaciones en vuelo. La compatibilidad debe verificarse antes de borrar rutas, no improvisarse después.

**Salida:** una sola entrada semántica, ausencia de consumidores legacy pendientes, mismas invariantes de acción verificadas, mejora observada de conversación/contexto/latencia y ninguna dependencia productiva de Semantic Intake.

## 19. Invariantes que no se pueden perder

- Identidad y permisos vinculados en servidor; un `codigo`, un source label o un tool call no autentican al usuario.
- Ownership de disciplinas/fuentes y scope de prescripción independientes del lenguaje y del contexto solicitado.
- Planificado ≠ adaptado ≠ ejecutado ≠ respuesta; fuente externa no completa automáticamente Forge.
- Sesiones completadas y bloques externos protegidos; semana objetivo y calendario civil explícitos.
- Restricciones canónicas frescas; unknown no equivale a libre; resolución mediante transiciones autorizadas.
- Disponibilidad efectiva con fallback válido, distinción cero/desconocido, patch no destructivo y digest de confirmación.
- Dosis/referencias/capacidades con procedencia; sin inventar máximos, fisiología, readiness ni compatibilidad deportiva.
- Recibos, revisiones, CAS/readback y tratamiento de resultados inciertos; ninguna promesa de guardado desde la propuesta.
- Shared backend y contratos serializables para web/móvil; domain adapters conservan conocimiento legítimo sin cerrar especialidades en autoridades compartidas.
- Evento reportado independiente del objetivo; incertidumbre explícita; no catálogo obligatorio para su existencia.

## 20. Riesgos reales y límites

1. **Interpretación plausible equivocada.** Las garantías técnicas no cubren entailment. Mitigar con procedencia, status reportado, aclaración/confirmación selectiva y posibilidad de corregir; medir explícitamente sujeto, temporalidad, omisiones e invención.
2. **Doble escritura durante transición.** Hoy varios extractores escriben mientras el Coach lee. El flag debe excluirlos por turno también en backend; ocultar UI no basta.
3. **Seguridad de entrada incompleta.** La inspección de `/api/chat` no demuestra verificación de sesión para todas sus acciones. No envolverlo entero en tools confiando en `codigo` o `authUserId` del cuerpo.
4. **Autoridades parcialmente transaccionales.** Availability habitual y transición de restricciones incluyen varias escrituras; CAS de un campo no hace atómica toda la operación. Preservar estados parciales y readback, sin prometer exactamente-una-vez global.
5. **Pérdida de eventos entre etapas del planning.** Guardarlos no basta si Analyzer/Weekly/Builder o fallback no los proyectan. La revisión del contexto debe viajar y comprobarse hasta admisión final.
6. **Contexto insuficiente por fast path.** La lectura pequeña no permite omitir restricciones o datos imprescindibles. La autoridad solicita requisitos técnicos faltantes sin convertirse en parser semántico.
7. **Retirada de reviewers.** Puede aumentar errores de prosa o acciones plausibles que antes se filtraban. No se niega ese coste; se valida empíricamente la nueva frontera sin reintroducir un certificador universal.
8. **Tiempo y legado.** Madrid/Canary y reportes antiguos sin fecha/asociación fiable pueden contaminar inferencias. Mantener límites/procedencia, no reconstruir historia como si fuese verificada.
9. **Coste del tool loop.** Reads pequeños repetidos pueden superar una carga grande. Agrupar recursos conocidos, cache por turno y ampliar por necesidad; no usar clasificador previo para compensarlo.
10. **Cobertura deportiva.** Representar cualquier evento no habilita automáticamente generar cualquier deporte. Mantener admisión y conocimiento de dominio; no convertir carrera/box en lista universal.
11. **Código residual y adjuntos.** Un endpoint presente puede estar deshabilitado, mientras una ruta distinta sigue viva. Verificar consumidores antes de retirar; garantizar que los adjuntos lleguen a la entrada nueva.

## 21. Decisión final

**A) Sí**, el Coach puede ser la autoridad semántica manteniendo invariantes deterministas. «Autoridad semántica» significa interpretar conversación y proponer acciones; no autoridad para autenticarse, concederse permisos, declarar hechos verificados o saltarse contratos.

**B)** La arquitectura mínima es un Coach compartido con mensaje original y contexto inicial pequeño, una capacidad de lectura progresiva y acciones tipadas sobre autoridades existentes; validación técnica y persistencia comprobada después de la propuesta. No necesita pipeline semántico previo.

**C)** Se pueden retirar el paquete1A de runtime, clasificadores previos, extractores automáticos paralelos, parsers humanos de confirmación/tiempo/availability, tags y ramas pending que consumen turnos. La eliminación es selectiva en archivos mixtos. Se conservan validadores, conocimiento deportivo, calendario, scope, restricciones y persistencia.

**D) No existe una razón técnica identificada en el grafo auditado para mantener un semantic interpreter obligatorio delante del Coach.** No aporta una garantía demostrable de significado que no pueda fallar a su vez; tampoco sustituye ninguna de las autoridades de acción necesarias.

**E) Previsiblemente sí:** la conversación será más natural, y el camino normal tendrá menos llamadas seriales y menos cargas redundantes. La mejora de velocidad y los resultados semánticos deben medirse durante las dos etapas; no están demostrados por esta auditoría estática. La decisión es avanzar al diseño Coach-first descrito, **sin continuar Semantic Intake y sin implementar nada en esta tarea**.
