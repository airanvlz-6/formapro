# Session v4 + coach-executable-v1: autoridad del Coach

## Alcance e incidente

El Coach decide la prescripción deportiva. Forge conserva la integridad del contrato, las restricciones explícitas, la disponibilidad declarada y la procedencia de los datos. La falta de conocimiento de Forge no se transforma en incapacidad del atleta.

Incidente comunicado: `83b329c4-4602-4c35-88c3-d1ea982f272f`; lunes, martes y jueves completaron en attempt 1; viernes falló en ambos intentos con `SESSION_CONTRACT_INVALID`, `validateSessionAgainstTrainingContract/dose`, `DOSE_FORMAT_INVALID`. El payload exacto sigue siendo **PRODUCTION_PAYLOAD_UNKNOWN**. Ninguna receta sintética de este trabajo reconstruye ese incidente ni identifica su movimiento.

El working tree estaba limpio al comenzar. Se continuó sobre la implementación existente. No se cambian periodo, ciclo, Athlete State Engine ni catálogos deportivos. No hay migración, commit, push, deploy ni escrituras en datos reales.

## Auditoría antes y después

La [captura de emisiones anterior a los cambios](open-coach-gates-before.md) conserva fuentes y expresiones originales. El [inventario posterior](open-coach-gates-after.md) acompaña la misma clasificación con las emisiones finales. La tabla siguiente clasifica la frontera completa: preparación del contrato, generación, admisión, render, analytics, revisión semanal y persistencia. Los sufijos dinámicos (`:signal`, `:movement`, `:field`) representan todos los valores del mismo predicado, no una selección de movimientos.

“Alcanzable” significa alcanzable como **rechazo duro** en Session v4 + coach-executable-v1 emitido por el backend. Una función que permanece disponible para contratos históricos o para emitir un diagnóstico no constituye un gate moderno.

| Code / familia de códigos | Source y predicado | Authority | Antes: hard alcanzable | Después: hard alcanzable / comportamiento |
|---|---|---|---|---|
| `JSON_REQUIRED`, `JSON_INVALID` | `structuredSession.parseStructuredSession`: respuesta ausente, mayor de 64 KB o JSON no interpretable | TECHNICAL_INTEGRITY | Sí | Sí; un repair, máximo dos intentos |
| `PROPOSAL_STRUCTURE_UNINTERPRETABLE`, `BLOCK_STRUCTURE_UNINTERPRETABLE`, `MOVEMENT_OBJECT_INVALID`, `MOVEMENT_PRESCRIPTION_SHAPE_INVALID`, `MOVEMENT_IDENTITY_UNRESOLVED` | `minimalSessionRepresentation`: no existe un árbol de bloques, movimientos e instrucciones interpretable | TECHNICAL_INTEGRITY / REPRESENTATION | Sí | Sí únicamente cuando falta ese contenido; acepta nombre, dose alias, dosis textual y etiquetas opcionales |
| `MAIN_STRUCTURE_REQUIRED` | `minimalSessionRepresentation`: ausencia de etiqueta main | REPRESENTATION | Sí | No; el trabajo de los bloques puede mostrarse sin imponer esa etiqueta |
| `PROPOSAL_SHAPE_INVALID`, `BLOCK_INVALID`, `MOVEMENT_SHAPE_INVALID`, `GENERATED_VARIANT_SHAPE_INVALID` | `inspectSessionRepresentation`: schema histórico, campos extra, orden, cantidad de bloques, forma de variante | REPRESENTATION | Sí en la segunda inspección proyectada; otros eran ya advisories | No; inspección orientativa y normalización mínima. No se vuelve a utilizar la inspección estricta como admisión |
| `DUPLICATE_MOVEMENT`, `GENERATED_EXACT_IDENTITY_DUPLICATED` | inspector / validador: repetición de ID | SPORT_POLICY / REPRESENTATION | No en ejecución moderna | No; conserva el trabajo repetido |
| `HIDDEN_WORK_OR_CONFLICTING_REPRESENTATION`, `MOVEMENT_IDENTITY_CONFLICT` | `executableProjection`: representaciones simultáneas incompatibles o trabajo ejecutable fuera del árbol que se va a mostrar | TECHNICAL_INTEGRITY | Sí | Sí para ambigüedad/conflicto real. Alias únicos y cantidades expresables se normalizan; nombre abierto no se sustituye por un candidato conocido |
| `STIMULUS_MISMATCH`, `SESSION_DISCIPLINE_SCOPE_MISMATCH` | `validateCoachExecution`: cambia la vinculación del contrato admitido | TECHNICAL_INTEGRITY / EXPLICIT_USER_CONSTRAINT | Sí | Sí; una etiqueta de estímulo omitida se vincula al contrato, pero no se cambia una vinculación contradictoria |
| `INTENT_NOT_SATISFIED` | `structuredSession`: coincidencia exacta de patrón y pool | SPORT_POLICY | No; ya era advisory moderno | No; `assessSessionIntent` observa SATISFIED/UNKNOWN/CONTRADICTED, no decide la composición |
| `MOVEMENT_SEMANTICS_UNRESOLVED`, `MOVEMENT_UNKNOWN` | `resolvedMovement` no encuentra descriptor | SEMANTIC_KNOWLEDGE | Sí | No; nombre/instrucción permanecen; metadata no inventada |
| `STRUCTURE_REPRESENTATION_UNRESOLVED`, `STRUCTURE_NOT_ALLOWED` | estructura no está en Workout Structure Library | SEMANTIC_KNOWLEDGE / REPRESENTATION | Sí para estructura desconocida | No; se muestra la estructura o instrucción elegida |
| `STRUCTURE_*` provenientes de `validateStructureSemantics` | cardinalidad, patrones o composición de formatos conocidos | SPORT_POLICY / REPRESENTATION | Sí | No se llama desde la admisión moderna |
| `MOVEMENT_OUTSIDE_POOL`, `MOVEMENT_DISCIPLINE`, `GENERATED_STIMULUS_INCOMPATIBLE` | pertenencia/correspondencia deportiva | SPORT_POLICY | No en v4 | No; se mantienen solo para contratos históricos |
| `GENERATED_MOVEMENT_NOT_AUTHORIZED`, `GENERATED_LOCAL_ID_CONFLICT`, `GENERATED_TEMPO_DOSE_MISMATCH` | autorización de variante o coherencia de la representación histórica | SPORT_POLICY / REPRESENTATION | Sí | No como gates modernos; la receta y su dosis siguen visibles |
| `GENERATED_SEMANTICS_UNRESOLVED:*`, `GENERATED_DISPLAY_SEMANTICS_MISMATCH` | resolver de variantes no conoce familia, modificador o nombre | SEMANTIC_KNOWLEDGE | Sí | No; el resolver conserva su resultado UNKNOWN, no concede metadata falsa |
| `GENERATED_RESTRICTION_UNKNOWN:*`, `UNKNOWN_SAFETY:*` | no existe evidencia suficiente de compatibilidad biomecánica | SEMANTIC_KNOWLEDGE | Sí | No; la restricción se entrega al Coach. Se mantienen incompatibilidades positivas conocidas |
| `MOVEMENT_RESTRICTED:*` | exclusión explícita del movimiento, incompatibilidad conocida con flags activos o área restringida | EXPLICIT_USER_CONSTRAINT | Sí | Sí; variantes no resueltas pueden conservar la evidencia positiva de su base conocida, sin heredar garantías de seguridad |
| `EXPLICIT_DISCIPLINE_RESTRICTED` | nota activa que excluye la disciplina del contrato | EXPLICIT_USER_CONSTRAINT | Mediante otros caminos | Sí, comprobación directa |
| `REQUIREMENT_UNKNOWN:*`, `PRESCRIPTION_DATA_MISSING:*` | insuficiencia de conocimiento sobre requisitos | SEMANTIC_KNOWLEDGE | Recursos UNKNOWN ya estaban exentos, otras categorías no | No en la admisión moderna |
| `FACTUAL_REQUIREMENT_UNAVAILABLE:*` | recurso requerido y evidencia explícita de ausencia/incapacidad | EXPLICIT_USER_CONSTRAINT | Sí | Sí. Nivel principiante/intermedio no demuestra una incapacidad concreta; UNKNOWN nunca cambia a AVAILABLE |
| `RESTRICTION_UNRESOLVED`, `RESTRICTION_AREA_UNSUPPORTED` | `trainingFeasibility`: nota/área no catalogada antes del Builder | SEMANTIC_KNOWLEDGE | Sí | No en emisión moderna; conserva texto en contexto. Contratos históricos mantienen su comportamiento |
| `DOSE_FORMAT_INVALID`, `DOSE_FIELDS_INVALID`, `DOSE_SIDE_INVALID`, `DOSE_TEMPO_INVALID`, `DOSE_INTENSITY_INVALID`, `DOSE_INVALID:*` | inspector: representación de cantidades/extensiones | REPRESENTATION | Sí | No como gates semánticos; texto legible se conserva, números/tipos verdaderamente inválidos usan gates técnicos explícitos |
| `DOSE_INSTRUCTION_UNRESOLVED`, `DOSE_INSTRUCTION_REFERENCE_REQUIRED` | gramática limitada de `resolveExecutableDose` | REPRESENTATION / NUMERIC_TRUTH | Sí | No por gramática desconocida. Cantidades inequívocas enriquecen; referencias ausentes no inventan datos |
| `DOSE_INSTRUCTION_CONFLICT` | instrucción completamente resuelta contradice cantidades explícitas simultáneas | TECHNICAL_INTEGRITY | Sí | Sí; no se escoge silenciosamente una de dos dosis contradictorias |
| `DOSE_SAFETY_BOUND:*`, `DOSE_TOTAL_*_BOUND`, `DOSE_SESSION_TOTAL_BOUND:*` | máximos genéricos de representación/reps/tonnage/distancia | SPORT_POLICY / ANALYTICS | Sí | No en admisión moderna; permanecen diagnósticos del inspector histórico |
| `DOSE_FORMAT_TIME_CONFLICT`, `DOSE_FORMAT_CYCLE_CONFLICT`, `DOSE_FORMAT_INTERVAL_MISMATCH`, `DOSE_FORMAT_FIELDS_CONFLICT`, `DOSE_FORMAT_MAIN_ONLY`, `DOSE_FORMAT_WORK_EXCEEDS_CLOCK`, `DOSE_VOLUME_TIME_CONFLICT` | `validateExecutableFormat`: plantilla del formato y supuestos sobre reparto de trabajo | REPRESENTATION / ANALYTICS | Sí | No se llama desde admisión moderna. Se conserva la receta; desconocer distribución por rondas no demuestra imposibilidad |
| `SESSION_DOSE_INCOMPLETE:*`, `DOSE_FORMAT_NOT_ALLOWED`, `DOSE_VOLUME_CONFLICT`, `DOSE_SIDE_REPS_REQUIRED`, `DOSE_RUNNING_RIR_UNSUPPORTED`, `DOSE_COOLDOWN_LOADED_STRENGTH`, `DOSE_PREPARATION_IDENTICAL_TO_MAIN`, `SINGLE_BLOCK_COMPOSITION_NOT_AUTHORIZED` | dosis/composición histórica y requisitos universales por formato | SPORT_POLICY / REPRESENTATION | Algunas variantes de reloj/intervalos sí; otras ya históricas | No en ejecución moderna |
| `EXECUTION_INSTRUCTION_INCOMPLETE` | sin cantidades de trabajo, intensidad ni instrucción legible | TECHNICAL_INTEGRITY | Sí | Sí; por ejemplo objeto vacío o solo sets numérico sin instrucción adicional |
| `EXECUTION_TEXT_INVALID`, `EXECUTION_NUMBER_INVALID:*`, `EXECUTION_TEMPO_INVALID`, `EXECUTION_INTENSITY_INVALID`, `EXECUTION_FORMAT_INVALID` | nuevo límite mínimo: texto vacío/tipo imposible, números no finitos/negativos o objeto tipado ininterpretable | TECHNICAL_INTEGRITY | Bajo códigos del inspector | Sí; un repair. No depende de un movimiento ni de un template deportivo |
| `BENCHMARK_RESOLUTION:REFERENCE_NOT_ALLOWED` | referencia ausente | NUMERIC_TRUTH | Sí | No por ausencia sola; mantiene porcentaje simbólico o trabajo independiente sin conversión |
| `BENCHMARK_RESOLUTION:ONE_RM_MOVEMENT_REQUIRED`, `RUNNING_REFERENCE_MISMATCH`, `REFERENCE_KIND_MISMATCH`, `GENERATED_REFERENCE_NOT_AUTHORIZED` | referencia real explícitamente incompatible o intento de heredar RM de otra identidad | NUMERIC_TRUTH | Sí | Incompatibilidad conocida sigue hard mediante `sessionDose.referenceCompatibilityErrors`; desconocimiento semántico no es incompatibilidad |
| `NUMERIC_REFERENCE_INSTRUCTION_REQUIRED` | referencia ausente y ninguna otra parte ejecutable | TECHNICAL_INTEGRITY / NUMERIC_TRUTH | Bajo códigos de suficiencia | Sí; pide al Coach una instrucción utilizable, no un dato inventado |
| `NUMERIC_TRUTH:UNSUPPORTED_OBJECTIVE_VALUE`, `NUMERIC_TRUTH:REFERENCE_EXPRESSION_CONFLICT` | añade valores objetivos a un referenceId o contradice su valor verificado | NUMERIC_TRUTH | Bajo códigos anteriores de referencia | Sí. Una carga propuesta en texto es un target del Coach, no un RM ni una medición del atleta |
| `SESSION_DURATION_ESTIMATE:UNBOUNDED_WITH_FINITE_BUDGET`, `SESSION_DOSE_TIME_*` | duración o política temporal deportiva no demostrable | ANALYTICS / SPORT_POLICY | El primero ya era histórico; otros dependían de política | No en ejecución moderna; UNKNOWN no equivale a cero |
| `SESSION_BUDGET_EXCEEDED` | duración mínima demostrable excede el máximo explícito del atleta | EXPLICIT_USER_CONSTRAINT | Sí | Sí; no usa estimaciones deportivas para declarar una contradicción |
| `D3_*`, `RUNNING_METHOD_DOSE_*`, `METHOD_INTENSITY_OUTSIDE_DOMAIN` | autoridades de método C2/B3 y fase de evento | SPORT_POLICY | No en la emisión moderna: open_coach no recibe esas dosis ejecutables | No se invocan en la admisión moderna; las ramas de emisión histórica siguen aisladas |
| `SESSION_COACH_REASON_REQUIRED`, `SESSION_DUPLICATE`, `RETRY_STILL_DUPLICATE` | explicación obligatoria/repetición de sesión | SPORT_POLICY / REPRESENTATION | No en modern execution | No; repetición orientativa |
| `TRAINING_LOAD_MOVEMENT_UNKNOWN`, `STRUCTURE_UNKNOWN` | `plannedPrescriptionLoad`: falta de catálogo | ANALYTICS | La excepción de movimiento podía abortar; estructura producía analytics desconocidos | No excepción moderna; preserva segmentos e identidad, patrón y carga externa desconocidos |
| `WEEK_ADAPTATION_DOSE_UNSATISFIED`, `WEEK_SESSION_ROLE_CONTRADICTION`, `WEEK_SESSION_OBJECTIVE_UNJUSTIFIED`, `WEEK_EXACT_DUPLICATE` | whole-week: nueva comprobación de dosis, función, intención o duplicación | SPORT_POLICY / ANALYTICS | Algunos sí; duplicación con coherenceVersion 1 ya era advisory | No para sesiones coach-executable-v1. Warnings no generan repairs obligatorios |
| `WEEK_PRIMARY_ADAPTATION_MISSING`, `WEEK_OBJECTIVE_UNCOVERED`, concentración/interferencia/exposición UNKNOWN | cobertura y análisis semanal | SPORT_POLICY / ANALYTICS | En Weekly Coach moderno ya warnings/info | Se mantienen como warnings/info; el Coach puede conservar conscientemente su semana |
| `WEEK_SESSION_ID_DUPLICATE`, `WEEK_REST_CONTENT`, `WEEK_STRUCTURE_UNKNOWN` sin árbol de prescripción en TRAIN no protegido | whole-week: identidad, estado y existencia real de contenido | TECHNICAL_INTEGRITY | Sí | Sí |

### Gates técnicos/factuales conservados fuera de la propuesta

Estos caminos no arbitran una selección deportiva. Se conservan antes y después:

| Code / familia | Source / predicado | Authority | Antes / después |
|---|---|---|---|
| `CONTRACT_INPUT_MALFORMED`, `CONTRACT_MALFORMED`, `CONTRACT_VERSION_INVALID`, `EXECUTION_POLICY_INVALID`, `OPEN_DESIGN_VERSION_MISMATCH`, `OPEN_DESIGN_FACTS_REQUIRED`, `DOSE_CONTEXT_VERSION_INVALID`, `CONTRACT_SOURCE_INVALID` | `allowedTrainingContract`, `trainingFeasibility`: estructura/versionado del contrato servidor | TECHNICAL_INTEGRITY | Hard / hard |
| `GENERATED_MOVEMENT_AUTHORITY_INVALID`, `METHOD_INTENSITY_AUTHORITY_INVALID`, `RUNNING_METHOD_DOSE_AUTHORITY_INVALID`, `SESSION_DOSE_AUTHORITY_MISMATCH` | consistencia de extensiones del contrato emitido; no validación de la propuesta deportiva | TECHNICAL_INTEGRITY | Hard / hard cuando exista la extensión |
| `MOVEMENT_ID_UNKNOWN`, `STRUCTURE_ID_UNKNOWN`, `*_IDS_DUPLICATED`, `*_POOL_MISMATCH`, `RANKING_MISMATCH`, `RESTRICTION_FILTERING_MISMATCH` | consistencia de los ejemplos/metadata del contrato servidor, no membership de la propuesta del Coach | TECHNICAL_INTEGRITY | Hard / hard para un contrato alterado. Elegir un movimiento fuera de esos ejemplos sí está permitido |
| `OPEN_INTENT_SEMANTICS_MISMATCH`, códigos de schema de `resolvePrescriptionIntent`, `SESSION_STATE_MISMATCH` | vinculación a la intención semanal ya admitida y al estado del slot | TECHNICAL_INTEGRITY | Hard / hard; no exige patrón del movimiento seleccionado |
| `PRESCRIPTION_NOT_ALLOWED`, `DISCIPLINE_OUTSIDE_MANAGED_SCOPE`, `DISCIPLINE_UNSUPPORTED`, `FOCUS_AVAILABILITY_UNRESOLVED`, `DAY_NOT_AVAILABLE`, `TARGET_WEEK_INVALID`, `TARGET_DAY_INVALID` | autoridad, dominio soportado por el adaptador y disponibilidad factual | TECHNICAL_INTEGRITY / EXPLICIT_USER_CONSTRAINT | Hard / hard; disponibilidad resuelta vacía produce cero Builders, no entra aquí |
| `RESTRICTIONS_INVALID*`, `RESTRICTIONS_AMBIGUOUS_STATE`, `EXTERNAL_CONTEXT_*`, `EXPOSURE_INVALID`, errores de lectura `*_READ_FAILED` / `*_CONTEXT_READ_FAILED` | snapshot ilegible, identidad/tipos inválidos o fallo de almacenamiento | TECHNICAL_INTEGRITY | Hard / hard; fallo de lectura no equivale a ausencia de restricciones |
| `OPEN_INTENT_REQUIRES_WEEKLY_AUTHORITY`, `WEEKLY_*`, `CALENDAR_*`, `EXTERNAL_SLOT_NOT_AUTHORIZED`, `SESSION_SCOPE_REVOKED` | `sessionAuthority`, `weeklyCalendarAuthority`: firma, target, ownership, protección, contrato admitido y fecha | TECHNICAL_INTEGRITY / EXPLICIT_USER_CONSTRAINT | Hard / hard |
| `SESSION_RECEIPT_REQUIRED`, `SESSION_RECEIPT_INVALID`, `SESSION_RECEIPT_CONTEXT_MISMATCH`, `WEEKLY_SESSION_CHAIN_MISMATCH`, `SESSION_CONTENT_MISMATCH` | HMAC, caducidad, usuario/semana, orden de siblings y comparación exacta con render del proposal firmado | TECHNICAL_INTEGRITY | Hard / hard |
| `SESSION_RESTRICTIONS_CHANGED_REGENERATE`, `SESSION_TEMPORARY_AVAILABILITY_CHANGED`, `SESSION_DOSE_CONTEXT_CHANGED_REGENERATE`, `RUNNING_METHOD_DOSE_CONTEXT_CHANGED_REGENERATE` | relectura de hechos contra snapshot firmado | TECHNICAL_INTEGRITY / EXPLICIT_USER_CONSTRAINT | Hard / hard |
| errores de identidad, revisión, calendario incompleto y CAS de `planMutation` / `planPersistence` | candidato completo autorizado y comparación atómica con revisión existente | TECHNICAL_INTEGRITY | Hard / hard; nunca se guarda una semana parcial |
| `TRANSFER_REQUIRES_WEEKLY_AUTHORITY`, `STRATEGIC_METHOD_MISMATCH`, `INTENT_POOL_EMPTY`, `STRUCTURE_SPACE_UNSATISFIABLE`, pools vacíos históricos | ramas de intent adaptation/legacy | SPORT_POLICY / TECHNICAL_INTEGRITY | No alcanzables con intent open_coach emitido; permanecen históricas |

## Conexión arquitectónica

`validateSessionAgainstTrainingContract` valida el contrato y entra en una rama moderna propia: normalización mínima, preservación de trabajo sin referencia, comprobación de representaciones contradictorias y `validateCoachExecution`. Retorna antes de los validadores deportivos históricos. No existe una denylist de errores que haya que ampliar tras cada incidente.

El consumidor directo `validateSessionDose` utiliza la misma frontera moderna. Los renderizadores profesional y humano vuelven a validar esa misma propuesta, conservan nombres y dosis, y no requieren un descriptor conocido. El renderer humano mantiene las etiquetas canónicas existentes cuando sí las conoce.

Los adaptadores de referencia, requisitos y biomecánica conservan su conocimiento deportivo explícito. El nuevo gate consume incompatibilidades positivas; no añade taxonomía de especialidades, equipos, movimientos, patrones o formatos autorizados.

```mermaid
flowchart LR
  W[Weekly admitido y hechos del atleta] --> C[Coach decide sesión]
  C --> P[JSON y representación mínima]
  P --> F[Integridad y contradicciones explícitas]
  F --> R[Render de la prescripción]
  R --> S[Receipt de la propuesta]
  S --> I[Integridad de siete días]
  I --> D[Persistencia con identidad y CAS]
  P -. conocimiento opcional .-> A[Metadata y analytics UNKNOWN permitidos]
```

## Movimiento, dosis y UNKNOWN

- Los nombres abiertos y las variantes no catalogadas no se insertan artificialmente en Movement Library. Se guardan en el proposal firmado y se muestran como instrucciones del Coach.
- La gramática de `resolveDoseInstruction` solo enriquece cantidades que conoce. No reconocer “3 carries cortos”, “carga moderada”, “10 min suave” o cualquier otra instrucción legible no provoca retry.
- Cantidades textuales, dosis textual, alias de representación único y formatos legibles se conservan. Los bloques conservan el orden elegido por el Coach.
- No se inventa material AVAILABLE, skill, propiedad biomecánica, patrón, reps, tonnage ni duración. En analytics, falta de conocimiento de carga externa es UNKNOWN, no “no aplicable”.
- La ausencia explícita de banco sigue contradiciendo bench press y una variante identificable de su base. No saber la geometría de otra variante no prueba incompatibilidad.
- Una etiqueta de nivel general no demuestra que un atleta no pueda realizar un movimiento concreto.
- Un porcentaje con RM exacto se resuelve; sin RM no produce kg. Una referencia de HR/ritmo ausente puede eliminarse de la parte ejecutable cuando la gramática completa demuestra trabajo independiente; el original permanece como procedencia. No se inventa RPE para sustituirlo.
- Prescripción, referencia objetiva y ejecución son entidades distintas. Un target numérico del Coach no crea un benchmark ni un dato de rendimiento real.

## Feedback persistente y conversación

Flujo conectado en el backend compartido de web y móvil:

`PRESCRIPTION → ATHLETE EXECUTION → REPORT → extractCoachingFacts → usuarios.perfil.coaching_knowledge / prescription_signals → NEXT COACH CONTEXT`.

`runChatCoach` recibe únicamente el mensaje actual del atleta autenticado. `persistCoachingKnowledge` guarda hechos literales con quote, source `athlete_report`, fecha, alcance, ID idempotente y, cuando existe, signal canónico. Utiliza CAS del JSON de perfil y readback. No extrae hechos de la respuesta del Coach ni altera Athlete State.

Ejemplos comprobados:

| Reporte | Persistencia / siguiente contexto |
|---|---|
| No pude hacerlo porque no tengo trineo | `equipment.sled = unavailable`, declaración literal y procedencia |
| No puedo hacer ring muscle-ups todavía | `skill.movement.ring_muscle_up = unavailable`; no invalida toda la gimnasia |
| No tengo aparato especial | conocimiento con nombre abierto; no inventa una entrada del catálogo |
| Hoy no tengo remo | observación fechada; no convierte una situación temporal en ausencia permanente |
| Me molesta la rodilla en este ejercicio | `discomfort_observation`; no lesión, diagnóstico ni prohibición clínica permanente |
| Ya tengo remo | actualiza el recurso y marca la declaración anterior como superseded |

Chat incluye estos registros en FACTS; Weekly los recibe en sus hechos/contexto firmados; Session recibe tanto las señales específicas como el perfil servidor en su contexto. La próxima generación conserva la diferencia entre declaración vigente, evidencia fechada e interpretación deportiva.

El prompt de chat incorpora **ASK WHEN USEFUL, NOT REQUIRE EVERYTHING BEFORE PRESCRIBING**: preguntas sobre instalación/material, capacidades o ejercicio/momento de una molestia pueden mejorar el coaching; no son un formulario obligatorio previo a prescribir.

## Retries y revisión semanal

Se mantiene el presupuesto de dos intentos de Session Builder, es decir, un único repair. Con la ruta moderna, solo los errores técnicos, contradicciones explícitas o de verdad numérica llegan a ese repair. Un fallo de proveedor no simula una respuesta válida.

La revisión semanal puede observar cobertura, exposición, repetición o intensidad y el Coach puede KEEP o reconsiderar voluntariamente. Los warnings no obligan a sustituir sesiones ni impiden guardar una semana que ya pasó la integridad factual. Un fallo de esa reconsideración conserva la semana admitida. Un error real de firma, estado, identidad, disponibilidad o CAS sigue bloqueando el guardado.

## Validación local

El test de semana completa usa el orchestrator real extraído de `FormaPro.tsx`, las autoridades compartidas, receipts, revisión de siete días, identidad y persistencia. Solo sustituye proveedor y transporte de base de datos por implementaciones en memoria.

La semana fundamental contiene siete sesiones: canonical con reps/RPE, running por distancia, Spanish squat cualitativo, running por tiempo, variante no catalogada de carry, erg e isométrico unilateral con instrucción RIR. El perfil de ese caso no aporta inventario explícito: UNKNOWN no fuerza interrogatorio ni retry. También permanecen las semanas híbrida, solo carrera, solo box, dos días, cero días y regeneración a cero mediante CAS.

Se prueban por separado: ausencia explícita de recurso, restricción activa conocida, referencia incompatible/fabricada, presupuesto real, JSON inutilizable, firma/contenido alterados, siblings incorrectos, freshness, disponibilidad y CAS. Las pruebas del inspector histórico siguen demostrando qué shapes producen sus diagnósticos, sin convertirlos en veto moderno.

Comprobación focalizada: **157/157** pruebas aprobadas. Primera pasada completa verde: **2537/2537**. La última ejecución sobre el código final y TypeScript se registran al terminar. Los logs están fuera del repositorio, en TEMP.

Archivos de este trabajo (32):

- `lib/athlete/prescriptionSignals.ts`
- `lib/chat/groundedCoach.test.mjs`
- `lib/chat/groundedCoach.ts`
- `lib/chat/runChatCoach.ts`
- `lib/planning/allowedWeeklyPlanContract.ts`
- `lib/planning/openCoachAuthority.test.mjs`
- `lib/planning/openWeeklyCoachContract.ts`
- `lib/planning/prepareAllowedWeeklyPlanContract.ts`
- `lib/planning/weeklyAvailabilityFlow.test.mjs`
- `lib/planning/weeklyCoachingContext.ts`
- `lib/planning/wholeWeekAdapter.ts`
- `lib/planning/wholeWeekValidation.ts`
- `lib/sports/humanCoachingProjection.ts`
- `lib/sports/minimalSessionRepresentation.ts`
- `lib/sports/prescriptionDataSufficiency.ts`
- `lib/sports/sessionDose.ts`
- `lib/sports/sessionExecutableDose.ts`
- `lib/sports/sessionExecution.test.mjs`
- `lib/sports/sessionExecution.ts`
- `lib/sports/sessionGeneration.ts`
- `lib/sports/sessionIntentAuthority.test.mjs`
- `lib/sports/sessionProfessionalRenderer.ts`
- `lib/sports/sessionRepresentation.test.mjs`
- `lib/sports/structuredSession.ts`
- `lib/sports/trainingFeasibility.ts`
- `lib/trainingLoad/prescriptionLoadAdapter.ts`
- `lib/trainingLoad/trainingLoad.ts`
- `docs/open-coach-execution-authority.md`
- `docs/open-coach-gates-after.md`
- `docs/open-coach-gates-before.md`
- `lib/chat/athleteCoachingKnowledge.ts`
- `lib/sports/coachExecutionAdmission.ts`

## Limitaciones

1. No hay prueba de producción: payload del viernes desconocido y ningún nuevo run real observado.
2. El extractor de conocimiento es deliberadamente acotado a declaraciones literales soportadas. Preguntas, citas, hipótesis y reportes históricos ambiguos no se convierten automáticamente en hechos actuales. El resto permanece en conversación y puede requerir una pregunta útil.
3. Una observación de dolor conserva su texto/fecha; no identifica automáticamente el ejercicio si el atleta dice “este ejercicio”, ni genera diagnóstico. El Coach debe aclararlo cuando sea útil.
4. Una situación temporal de material conserva evidencia fechada; no se infiere su duración ni se genera una restricción permanente. La adaptación automática de calendario sigue limitada a la indisponibilidad temporal ya soportada.
5. El lenguaje deportivo abierto no recibe una garantía de corrección clínica, conocimiento de equipo ni cuantificación exacta. Las afirmaciones del Coach no se promueven a hechos objetivos por estar en una prescripción.
6. Dos representaciones simultáneas contradictorias, contenido sin identidad/instrucción o un fallo real de autorización siguen pudiendo exigir repair o impedir persistencia. Esto no se resuelve guardando una semana parcial.
7. Los contratos históricos mantienen sus gates y su schema. Los dominios/adaptadores de referencia actuales siguen siendo los existentes; abrir movimientos no crea nuevos datos de RM/HR/ritmo.
8. Las escrituras comprobadas son simuladas. No se verificó transporte real, proveedor real, latencia de producción ni comportamiento de un nuevo deploy.

DESIGNED: YES

CONNECTED: YES

VERIFIED LOCALLY: PENDING FINAL CHECKS

PROVEN IN PRODUCTION: NO
