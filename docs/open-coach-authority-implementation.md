# Open Coach authority implementation

Base: `cee2438` (`fix(planning): restore longitudinal and whole-week coherence`). Implementación local, 2026-09-13. Antecedentes: `production-planning-regression-audit.md`, `planning-coherence-repair.md` y `coach-freedom-authority-audit.md`.

## A. Before / after

Antes, la vía estratégica construía todas las tuplas método/adaptación/patrón antes del Weekly. Una posibilidad sin tupla no llegaba al Coach. Session volvía a exigir pools y mappings antes de recibir un diseño. Además, los REST futuros existentes podían quedar congelados por no estar todavía dentro de la semana objetivo.

Ahora, la ruta de planificación, su preflight y la adaptación por Chat usan una intención abierta versionada. Weekly propone decisiones estructuradas; el servidor resuelve su semántica y valida calendario/scope; Session propone movimientos, formato y dosis, y se valida esa propuesta concreta. No se necesita una fila de método, una etiqueta suitable_for o un mapping estímulo/estructura para admitir el diseño abierto.

Las bibliotecas no se han borrado ni ampliado con filas para hacer pasar la aceptación. Los contratos anteriores siguen usando su validador y sus reglas anteriores.

## B. Authority matrix

| Decisión / dato | Autoridad después del cambio |
| --- | --- |
| TRAIN/REST, distribución, adaptación, método, patrón, desarrollar/mantener | Weekly Coach dentro del calendario factual y límites del contrato |
| Movimientos, combinación, formato, sets/reps, tiempo/distancia, esfuerzo, descanso, intensidad, variación | Session Coach; validación de propuesta posterior |
| Identidad, scope, ownership, disponibilidad, entorno | Servidor / fuentes canónicas |
| Equipo, capacidades, restricciones, referencias, fisiología, historial y ejecución | Hechos canónicos con procedencia; el Coach no puede autodeclararlos |
| Compatibilidad de referencia, unidades, cálculo, techo temporal, gramática y cardinalidad | Validadores compartidos |
| Inmutabilidad del pasado/completados/externos/alcance explícito | Protección factual con razón tipada |
| Freshness, firma, vínculo entre intenciones y sesiones, CAS | Autoridad del servidor, conservada |
| Repetición/concentración/interferencia | Contexto y warnings advisory; una reconsideración KEEP/REVISE |

No hay autoridad de planificación duplicada en React. El cliente web solo negocia la versión del contrato. Chat web y móvil comparten `adaptChatPlan` y los mismos validadores.

La frecuencia histórica y el máximo sugerido por la heurística anterior siguen siendo contexto, no un techo fisiológico del contrato abierto. Sus siete slots son un límite de representación: no se impone un mínimo de entrenamiento, un descanso obligatorio ni un máximo deportivo de seis días. Una semana REST elegida explícitamente y firmada es una decisión nueva; no equivale al fallo legacy de enumeración vacía. Sin días gestionados pendientes, se conserva el resultado no-op. Las discrepancias deportivas del validador cliente son advisory en v2; la disponibilidad y la integridad se validan en el servidor.

## C. Future plan preservation repair

`calendarProtectionReason` distingue `PAST`, `COMPLETED`, `EXTERNAL`; el cargador incorpora `EXPLICIT_SCOPE_PRESERVE` y `UNAVAILABLE`. Un REST, RECOVERY o TRAIN futuro Forge-owned no completado deja de ser fijo por su mera existencia.

Se conservan:

- Ejecución completada; una completada futura sigue siendo un error de integridad, no permiso para guardarla.
- Contenido pasado conocido, incluido planificado no ejecutado y texto legacy.
- Estado pasado REST/RECOVERY/UNAVAILABLE. Un placeholder pasado sin prescripción sigue siendo «sin registrar», sin inventar entrenamiento.
- Actividad externa canónica y propiedad externa; no se sobrescriben por regeneración.
- preserveDays elegidos por el servidor para el alcance de una adaptación.
- Indisponibilidad temporal vigente por fecha. Un placeholder antiguo de indisponibilidad no sustituye una declaración canónica vigente.

`protectedCalendarSessionIndices` deja de interpretar la mera existencia de un REST futuro como protección. Puede recibir días pasados explícitos. La persistencia moderna usa índices derivados de los slots firmados, no de flags del cliente.

Los recibos nuevos guardan `planning.preservationVersion:2`. En reconstrucción histórica, ausencia de esa versión significa semántica v1, mediante `legacyProtectedCalendarSession`. No se reinterpreta la preservación de una admisión ya firmada.

## D. Open Weekly intent contract

`AllowedWeeklyPlanContract.contractVersion:2`, `policyVersion:'open-coach-v1'`. La ruta exige que el cliente declare `weeklyContractVersion:2`; un cliente antiguo recibe upgrade requerido, no una respuesta de otra semántica presentada como v1.

`dayOptions` mantiene únicamente descansos de referencia y slots factual/protegidos. No es el universo de entrenamiento. `openFacts` contiene disponibilidad, contexto por disciplina y señales por día. El prompt combina esos hechos con contexto de coaching y métodos conocidos como ejemplos.

Un día abierto propone, por ejemplo:

```json
{
  "day": "martes",
  "state": "TRAIN",
  "intent": {
    "kind": "open_coach",
    "version": 1,
    "discipline": "box",
    "adaptationId": "upper_body_control",
    "stimulusId": "technical_push_density",
    "pattern": "horizontal_push",
    "method": { "kind": "coach_defined", "label": "Controlled pushing practice" },
    "role": "PRIMARY"
  },
  "decision": { "role": "PRIMARY", "reason": "Exposición controlada según el contexto." }
}
```

Es un ejemplo sintético, no una prescripción para AIRAN. La adaptación, estímulo y método de esta prueba no requieren filas añadidas a las bibliotecas.

Los días protegidos se identifican con `{day,optionId}`. REST tiene decisión/razón sin intent. Los estados ejecutables incluyen intent. El servidor genera un identificador determinista desde la intención resuelta; el Coach no lo obtiene seleccionando una tupla preautorizada.

## E. Semantic resolution

`openCoachIntent.ts` resuelve una gramática pequeña, no un catálogo exhaustivo de métodos:

- `method.kind:'known'`: atajo semántico; el ID debe corresponder a disciplina, adaptación, estímulo y patrón declarados. Un cambio de significado debe expresarse como coach_defined, no falsificar un ID conocido.
- `method.kind:'coach_defined'`: etiqueta descriptiva acotada y campos estructurados. No se consulta TRANSFER_METHODS para otorgar permiso.
- Disciplina: se contrasta contra scope/ownership y disponibilidad del día.
- Adaptación y estímulo: identificadores deportivos estructurados, sin requerir GOAL_DEMANDS/STIMULUS_LIBRARY como allowlist.
- Patrón: vocabulario de movimiento resoluble por el adaptador actual. El diseño debe contener un movimiento principal cuya semántica coincida.
- Entorno, equipo, skill, referencia y requisitos de ejecución: se concretan a partir de los movimientos resueltos, no de la etiqueta del método.

Los campos adicionales que pretendan introducir `safeForKnee`, equipo disponible u otros hechos no pertenecen al schema y se rechazan. Un label «low impact» no altera las propiedades del movimiento ni las restricciones.

## F. Hard negative validation

La admisión Weekly significa **admitida para diseño de Session**, no «cualquier sesión con ese nombre está permitida». La firma semanal no basta para guardar un entrenamiento: sigue siendo necesario un recibo de sesión que valide el diseño concreto.

La validación de Session mantiene identidad, esquema, unidades, cantidad, cardinalidad, intervalos/work-rest, presupuesto temporal, restricciones y referencias. Todos los movimientos, incluidos accesorios, preparación y variantes, pasan por resolución y comprobación de requisitos.

Se rechazan contradicciones conocidas y semántica necesaria irresuelta. La ausencia de mapping ya no genera un rechazo de posibilidad deportiva. Una estructura opaca devuelve `STRUCTURE_REPRESENTATION_UNRESOLVED`; un movimiento sin identidad resoluble devuelve `MOVEMENT_SEMANTICS_UNRESOLVED`.

## G. Session Coach changes

El contrato de sesión nuevo es `contractVersion:4` y exige intención open_coach, contexto de dosis Coach y señales de suficiencia. El servidor carga esos hechos antes de crear el contrato. No se admite open_coach bajo versiones 1–3 ni se emite esta sesión fuera de una autoridad semanal firmada.

El Coach recibe intención, estrategia semanal seleccionada, hechos, restricciones, referencias, tiempo, historia, exposición y sesiones hermanas autenticadas. Los pools conservan ejemplos canónicos y formatos conocidos; ya no certifican que todo ejemplo tiene equipo/skill disponible. El prompt lo declara expresamente y la admisión se decide sobre la propuesta.

La generación mantiene los intentos acotados y exige explicación breve. La explicación no se convierte en evidencia de seguridad. La repetición con historia se comunica como advisory para v4; no se aplica un veto deportivo por duplicación de texto. La revisión de semana completa puede conservarla con razón.

## H. Libraries as knowledge, not permission

| Biblioteca | Uso en la vía abierta |
| --- | --- |
| GOAL_DEMANDS | Orientación y contexto de objetivos/roles |
| TRANSFER_METHODS | Ejemplos y atajos de resolución exacta |
| STIMULUS_LIBRARY | Conocimiento existente; pertenencia no necesaria para el intent abierto |
| MOVEMENT_LIBRARY | Identidades, familias, propiedades y requisitos verificables |
| WORKOUT_STRUCTURE_LIBRARY | Gramática representable de formato, cardinalidad y timing |
| STRUCTURES_BY_STIMULUS | Conocimiento legacy; no autorización del diseño v4 |

No se usan suitable_for ni etiquetas de disciplina del movimiento como veto deportivo en v4. Se mantienen los requisitos reales del movimiento y la disciplina de delegación del calendario. No se inventan equivalencias de transferencia o de referencia.

## I. UNKNOWN semantics

| Situación | Resultado |
| --- | --- |
| Método no catalogado | Puede proponerse como coach_defined y resolverse |
| Mapping deportivo ausente | No impide validar una estructura concreta |
| Equipo/skill requerido desconocido o ambiguo | `REQUIREMENT_UNKNOWN`; no se afirma contraindicación ni se inventa disponibilidad |
| Equipo/capacidad requerida conocida ausente | `FACTUAL_REQUIREMENT_UNAVAILABLE` |
| Biomecánica desconocida bajo restricción activa | `UNKNOWN_SAFETY` o error semántico de variante; no admisión |
| Incompatibilidad conocida con restricción | `MOVEMENT_RESTRICTED` |
| Identidad/familia o formato no resoluble | Error de representación/resolución, no diagnóstico de incapacidad del atleta |

La validación se repite con el diseño concreto y conserva el estado de la señal. El preflight ya no elimina todo un repertorio porque los ejemplos catalogados no formen un pool suficiente.

## J. Restrictions/equipment/references

Se conserva la semántica existente de entorno y procedencia de señales, incluidas declaraciones de box completo y acceso por fecha. La lista vacía o incompleta no se convierte en equipo conocido ausente. Cada requerimiento ALL/ANY se comprueba sobre las señales actuales.

Las capacidades técnicas se asocian al dominio del movimiento resuelto, no se autodeclaran a través del método. Los flags y exclusiones activos se comprueban sobre todos los movimientos; una variante no puede eludir la exclusión de su familia.

%1RM requiere referencia exacta del movimiento canónico. Sin ella, esa expresión falla; RPE/RIR compatibles pueden pasar. Las variantes no heredan el RM familiar. En v4, una referencia de carrera no se transfiere automáticamente a otro cíclico como bike/remo: no hay una autoridad de compatibilidad que justifique esa transferencia.

No se modifica ni se interpreta como dato real la evidencia ilustrativa de dolor/tolerancia del encargo. No se consultan ni modifican atletas reales.

## K. Receipts/versioning

| Frontera | Versión / comportamiento |
| --- | --- |
| Request/respuesta de Weekly nuevo | weeklyContractVersion 2 |
| Contrato Weekly | 2 / open-coach-v1 |
| Intención | kind open_coach / version 1 |
| Contrato Session | 4 |
| Preservación en planning firmado | preservationVersion 2 |
| Envelope criptográfico semanal | protocolVersion 2 conservado; contractVersion discrimina semántica |
| Propuesta de dosis estructurada | schemaVersion 2 conservado; contrato distingue reglas |
| Legacy | Weekly v1 / Session v1–3 conservan sus reglas; preservación histórica reconstruida con v1 |

La emisión revalida las selecciones estructuradas. El recibo semanal firma slots/intenciones resueltos, digest del contrato y contexto, snapshot/revisión, scope, generación y contexto longitudinal. El de Session firma su contrato v4 y propuesta concreta y enlaza el recibo semanal y las sesiones hermanas previas.

Freshness reconstruye **la misma versión** de contrato desde hechos actuales. Cambios de equipo, disponibilidad, restricciones, referencias, snapshot o contexto invalidan la cadena. Se mantienen CAS y las reservas longitudinales. No hay migración ni reinterpretación silenciosa de recibos.

## L. Whole-week integration

`selectedWeekStrategy`, vecinos de Session y `wholeWeekAdapter` reconocen open_coach. La contribución se obtiene de intención y semántica concreta, sin exigir un managed method como token de participación.

La segunda llamada al Session ve las sesiones admitidas anteriormente y sus movimientos/dosis, con procedencia PLANNED_CURRENT_WEEK. No se convierten en ejecución histórica. La prueba de recorrido verifica también el digest de la primera sesión en el recibo de la segunda.

Se conserva un máximo de una reconsideración KEEP/REVISE. La aceptación local incluye dos sesiones repetidas y un KEEP explícito, sin anti-bench, día obligatorio, running obligatorio ni cuotas de modalidad. Las revisiones siguen dentro del contrato firmado y vuelven a validar restricciones, dosis y referencias.

## M. Diagnostics

`WEEKLY_INTENT_VALIDATION` registra run, día, tipo de propuesta, semántica estructurada resuelta, admisión para diseño o rechazo, etapa, códigos y categoría. No registra labels, explicaciones, prompts ni recibos completos. Los logs existentes de Session identifican etapa de resolución y códigos de incumplimiento; las razones nuevas distinguen UNKNOWN, ausencia factual y representación.

Los diagnósticos no tienen autoridad. Un fallo del sink no cambia el resultado. Una intención propuesta/rechazada se distingue de una no elegida por el Coach; en la vía nueva no existe la eliminación implícita por falta de una opción preenumerada.

## N. Tests

`lib/planning/openCoachAuthority.test.mjs` cubre:

- Método, adaptación y estímulo sin filas de catálogo que llegan a diseño RPE válido.
- Mapping ausente y falta de suitable_for sin veto; formato opaco rechazado.
- Equipo ausente frente a desconocido con códigos distintos.
- Restricción conocida incompatible frente a biomecánica desconocida.
- %1RM sin referencia rechazado y alternativa RPE válida.
- Variante no literal resuelta y familia desconocida rechazada.
- REST futuro reconsiderable; pasado, completados, externos, preserveDays e indisponibilidad conservados.
- Recorrido real de autoridades Weekly → Session v4 → firma → validación de guardado, sin escritura real.
- Contexto entre dos sesiones, reconsideración KEEP única y freshness ante cambio factual.
- Techo temporal, patrón principal, scope/disponibilidad y rechazo de hechos autodeclarados en el schema.
- Descanso explícito firmado durante regeneración y siete propuestas TRAIN sin cuota deportiva artificial.

Los tests existentes solo se actualizan cuando negociaban el contrato anterior o exigían protección por mera existencia. Los casos cuyo propósito es validar una sesión protegida pasan a declarar preserveDays explícito; mantienen sus expectativas de rechazo frente a corrupción. La caracterización de la auditoría conserva el comportamiento histórico mediante preservationVersion 1.

Verificación final local:

- Suite completa: **2332/2332 aprobados**, 0 fallos, 0 omitidos (224869.6212 ms), descubriendo todos los `.test.mjs`/`.test.cjs` de `lib` y `app` mediante `rg --files --no-ignore` y ejecutando Node con concurrencia 4.
- Pruebas focalizadas: 33/33 (intención abierta, calendario, regresión de producción y confirmación de entorno); 57/57 (contrato semanal y diagnósticos), incluidas después en la suite completa.
- `node node_modules/typescript/bin/tsc --noEmit --incremental false`: exit 0, sin errores.
- `git diff --check`: exit 0. Archivos nuevos de esta implementación comprobados también con `git diff --no-index --check`, sin errores de whitespace.

Estas pruebas verifican integridad y conexión local. No prueban por sí solas calidad deportiva ni aceptación en producción; los criterios posteriores están en P. Los logs de ejecución permanecen en el directorio temporal del sistema, fuera del repositorio.

## O. Known limitations

1. No se afirma aceptación en producción ni reproducción de los hechos ausentes del run AIRAN. El valor de su objetivo y las causas individuales de sus antiguos descartes siguen desconocidos.
2. La gramática actual resuelve patrones conocidos y movimientos canónicos o variantes estructuradas de familias conocidas. Un nombre libre, una nueva familia sin semántica verificable o un modificador no soportado requiere resolución adicional; no se acepta por confianza en el LLM. No se creó un motor general de biomecánica ni cientos de ejercicios.
3. Las estructuras usan formatos representables existentes. Se elimina el mapping deportivo como veto, pero no se admite una gramática arbitraria sin resolver timing/cardinalidad.
4. Las etiquetas de adaptación/método explican intención deportiva; no constituyen una prueba fisiológica de que esa adaptación se vaya a lograr. El Coach responde por la elección y la revisión de coherencia; Forge comprueba hechos e integridad.
5. El calendario conserva siete días únicos, disponibilidad y propiedad, pero no cuotas deportivas. Legacy conserva sus límites históricos y su resultado terminal sin nueva prescripción. En v2, REST explícito no requiere llamadas ficticias al Builder ni equivale a un fallo.
6. La estimación temporal sigue siendo operativa y conservadora, no una medición fisiológica. La compatibilidad entre referencias de carrera y otras modalidades necesita conocimiento explícito adicional.
7. Los dominios iniciales y su vocabulario de requisitos siguen siendo los existentes. La intención abierta no concede nuevas disciplinas fuera del scope ni autoriza al cliente a extender capacidades del servidor.

## P. Production acceptance procedure

Para una fase posterior autorizada:

1. Desplegar coordinadamente cliente/servidor que negocien Weekly v2; comprobar que el cliente antiguo recibe upgrade requerido.
2. Con hechos reales y procedencia, regenerar una semana futura con REST Forge-owned pendientes; comprobar razones de protección y libertad de reconsideración.
3. Observar una intención coach_defined semánticamente resoluble ausente de TRANSFER_METHODS y su posterior diseño concreto. Conservar diagnósticos por etapa sin prompts/recibos completos.
4. Probar controles negativos de equipo ausente, restricción incompatible, seguridad irresuelta y referencia incompatible; no confundir unknown con contraindicación.
5. Verificar que Session usa objetivo/fase/historia y sesiones hermanas, y que la revisión KEEP/REVISE ocurre como máximo una vez.
6. Revisar calidad del entrenamiento y explicación con contexto real. No usar sábado TRAIN, running, variedad o ausencia de bench como proxies de éxito.
7. Verificar freshness/CAS, conservación de pasado/completados/externos y compatibilidad de lectura de planes antiguos antes de declarar resultado en producción.

Esta implementación no ejecuta ese procedimiento ni guarda datos de atletas.

## Q. Files changed

Producción:

- `app/FormaPro.tsx`, `app/api/chat/route.ts`: negociación y conexión del contrato nuevo.
- `lib/chat/adaptChatPlan.ts`: misma autoridad abierta para adaptación acotada.
- `lib/planning/openWeeklyCoachContract.ts`: propuesta, resolución semanal, prompt y diagnóstico.
- `lib/planning/allowedWeeklyPlanContract.ts`: discriminación explícita v1/v2.
- `lib/planning/prepareAllowedWeeklyPlanContract.ts`: hechos, preservación y emisión de selecciones abiertas.
- `lib/planning/weeklyCalendar.ts`, `weeklyCalendarAuthority.ts`: razones de protección, replay versionado y firma/freshness.
- `lib/planning/weeklyGenerationPreflight.ts`: preparar hechos sin cerrar posibilidades por catálogo.
- `lib/planning/weeklyRegeneration.ts`: distinguir descanso explícito firmado de enumeración sin nueva prescripción.
- `lib/planning/selectedWeekObjective.ts`, `wholeWeekAdapter.ts`: contexto y contribución de intenciones abiertas.
- `lib/sports/openCoachIntent.ts`, `prescriptionIntent.ts`: gramática y resolución de intención.
- `lib/sports/trainingFeasibility.ts`, `allowedTrainingContract.ts`: separar ejemplos y validación; contrato v4.
- `lib/sports/structuredSession.ts`, `prescriptionDataSufficiency.ts`, `sessionDose.ts`: validación concreta, UNKNOWN y referencias.
- `lib/sports/sessionAuthority.ts`, `sessionGeneration.ts`, `sessionProfessionalRenderer.ts`: hechos antes del diseño, generación, recibos y representación.

Tests: `openCoachAuthority.test.mjs`; ajustes asociados en `groundedCoach.test.mjs`, `allowedWeeklyPlanContract.test.mjs`, `weeklyAuthorityBinding.test.mjs`, `weeklyFeasibilityDiagnostic.test.mjs`, `weeklySave.test.mjs`, `weeklyTemporalOrder.test.mjs`, `productionPlanningAudit.test.mjs`, `sessionEnvironmentConfirmation.test.mjs`, `weeklyCalendar.test.mjs` y helper `trainingContractTestRuntime.mjs`. `coachFreedomAuthorityAudit.test.mjs` conserva la caracterización histórica con versión explícita.

Documentación: este informe. El informe de auditoría anterior ya estaba presente sin commit al comenzar; no se presenta como código implementado en esta fase.

| Estado | Resultado |
| --- | --- |
| FUTURE FORGE-OWNED PLAN REGENERATION | VERIFIED LOCALLY |
| WEEKLY COACH OPEN INTENT | VERIFIED LOCALLY |
| SESSION COACH OPEN DESIGN | VERIFIED LOCALLY |
| NEGATIVE CONSTRAINT AUTHORITY | PRESERVED |
| LEGACY RECEIPT COMPATIBILITY | PRESERVED |

Estados basados en pruebas locales de las fronteras descritas; ninguna fila afirma PROVEN IN PRODUCTION. Sin commit, push, deploy, migraciones, tablas nuevas ni modificaciones de atletas reales.
