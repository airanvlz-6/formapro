# Fase 1A: semantic intake y context scoping en shadow

**Actualización posterior:** evaluación live completada con 120 ejecuciones; decisión **NOT READY**. Ver [informe live](semantic-intake-live-evaluation-2026-09-22.md). El texto siguiente conserva el estado de la entrega inicial offline; la falta de credencial descrita allí quedó resuelta exclusivamente en tooling local.

Base: `7f7e777e12ff1c95be07d96eaa40d8bb08bd88c2`. Fecha: 2026-09-22.

Implementación aislada, desactivada por defecto. No cambia autoridades productivas. **Contrato y aislamiento comprobados offline; calidad semántica A–J contra el proveedor pendiente**, porque `ANTHROPIC_API_KEY` no está disponible en este entorno. Los fixtures no sustituyen la evaluación real del modelo.

## Arquitectura implementada

```text
FormaPro.enviar(texto), antes de los branches de preguntas pendientes
  ├─ flujo productivo existente, sin await del shadow ni lectura de su resultado
  └─ flag público → observeSemanticShadow
       → POST /api/semantic-intake-shadow
          → flag servidor
          → verificar principal (Supabase Auth getUser, sin DB de atleta)
          → validar input y vincular actor a principal verificado
          → LLM con salida estructurada: interpretación multi-elemento
          → validar schema, citas exactas, IDs, fechas, UNKNOWN
          → derivar requisitos suficientes (máximo de scopes semánticos)
          → LLM revisión de soporte, cobertura y suficiencia
          → SemanticShadowResult + métricas sin texto/IDs
```

El endpoint independiente devuelve la interpretación para inspección; el cliente productivo **descarta el resultado**. No se introduce una rama de routing basada en scope, intención, review o error. El flujo actual puede seguir rechazando una disponibilidad que el shadow comprenda: es deliberado en 1A.

El runner no recibe base de datos, loaders, dispatchers ni writers. No llama a `runChatCoach`, Availability, preflight, planificación, acciones de sesión, ejecución ni restricciones. Las únicas dependencias del núcleo son contrato de transporte y selección de requisitos. El nuevo endpoint usa un cliente **anon de Auth**, no service-role ni consultas de perfil. La instrumentación no cambia autenticación del chat existente.

La superficie Web observa envíos humanos en `enviar`, incluidos los que luego consumen las preguntas pendientes. No observa mensajes sintéticos de `enviarSilencioso` ni nuevas sesiones de generación. El contrato/endpoint es compartible por Expo; esta fase no modifica un cliente Expo externo al repositorio. Adjuntos sin texto no se interpretan: el input textual vacío queda inválido solo en shadow, sin afectar el envío productivo.

## Archivos

Modificado:

- `app/FormaPro.tsx`: dos imports y llamada no esperada detrás de flag, antes de preguntas pendientes. Ninguna condición productiva se sustituye.

Añadidos:

- `lib/chat/semanticInterpretation.ts`: tipos, schema estático, prompts exclusivos shadow, decodificación y validación de evidencia.
- `lib/chat/contextRequirements.ts`: scopes y proyección de requisitos serializables.
- `lib/chat/semanticIntakeShadow.ts`: ejecución aislada, revisión, fallback de contexto y diagnósticos.
- `lib/chat/semanticShadowProvider.ts`: transporte Anthropic estructurado con timeout, sin herramientas/reintentos.
- `lib/chat/semanticShadowHandler.ts`: handler con dependencias inyectables, límite de body, actor verificado y no-store.
- `app/api/semantic-intake-shadow/route.ts`: composición de Auth, provider y logger; flag de servidor.
- `lib/chat/semanticShadowClient.ts`: contexto mínimo acotado y envío cuyo resultado no se consume.
- `lib/chat/semanticIntakeFixtures.mjs`: ejemplos A–J y salidas esperadas exclusivamente offline.
- `lib/chat/semanticIntakeShadow.test.mjs`: 41 tests de contrato, evidencia, scopes, fallos, cliente/handler/provider y separación de autoridades.
- `lib/chat/evaluateSemanticIntake.mjs`: evaluación real opt-in con inputs sintéticos A–J y juez semántico, sin writers.
- Este documento.

`docs/semantic-authority-audit-2026-09-22.md` es el entregable previo, que ya estaba sin seguimiento al iniciar esta fase; no se modifica aquí. No se cambia `app/api/chat/route.ts`, `runChatCoach`, sus prompts, parsers de producción ni tests existentes.

## Contrato exacto

Fuente ejecutable: `lib/chat/semanticInterpretation.ts`. `JsonValue` admite null, boolean, número finito, string, arrays y objetos JSON; no contiene funciones. Validación limita profundidad y tamaño, y rechaza claves de contaminación de prototipo.

```ts
type SemanticInput = {
  version: 1;
  message: {
    messageId: string;
    actor: { kind: 'athlete'; id: string };
    reportedAt: string; // timestamp ISO con zona
    timezone: string;
    text: string; // íntegro, no truncado; máximo 16000 caracteres
  };
  conversation: {
    pendingQuestion: {
      kind: string; text: string | null; referenceIds: string[];
    } | null;
    references: {
      id: string; kind: string; text: string;
      source: 'conversation_snapshot' | 'client_snapshot';
      authority: 'UNVERIFIED_CONTEXT';
    }[];
  };
};

type SemanticEvidence = {
  messageId: string;
  actor: { kind: 'athlete'; id: string };
  reportedAt: string;
  quote: string;
  start: number; // UTF-16, inclusivo
  end: number;   // UTF-16, exclusivo
};

type SemanticField = {
  name: string;
  status: 'EXPLICIT' | 'INTERPRETED' | 'UNKNOWN';
  value: JsonValue;
  evidence: SemanticEvidence[];
};

type SemanticElement = {
  id: string;
  type: string;
  operation: string | null;
  minimumContextScope: ContextScope;
  fields: SemanticField[];
  evidence: SemanticEvidence[];
  unknownFields: string[];
  relatesTo: string[];
  contextReferenceIds: string[];
  effectiveTime: null | {
    expression: string;
    startDate: string | null;
    endDate: string | null;
    status: 'EXPLICIT' | 'RELATIVE' | 'UNRESOLVED';
    evidence: SemanticEvidence[];
    referenceTimestamp: string;
    timezone: string;
  };
};

type SemanticInterpretation = {
  version: 1;
  authority: 'SHADOW_CANDIDATES_ONLY';
  contextScope: ContextScope;
  scopeAlternatives: ContextScope[];
  scopeReason: string;
  intents: SemanticElement[];
  factCandidates: SemanticElement[];
  preferences: SemanticElement[];
  unresolved: { reason: string; evidence: SemanticEvidence[] }[];
  requiresClarification: boolean;
};
```

El wire del proveedor conserva este shape salvo dos diferencias explícitas:

1. Cada campo lleva `valueJson: string`, que se decodifica a `value: JsonValue`. Es el patrón de hojas JSON opacas de `coachOutputContract`, que evita enumerar taxonomías deportivas en el schema compilado.
2. La evidencia de wire contiene solo `{quote}`. El código busca la cita literal en el mensaje actual y calcula offsets, adjuntando ID, actor y timestamp. No se obliga al modelo a contar caracteres. Si la misma cita aparece varias veces, se referencia su primera aparición; en 1B conviene exigir desambiguación cuando las ocurrencias tengan contextos distintos.

El root, cada elemento y cada objeto estructural rechazan campos extra. `type`, `operation` y nombres de campos **son vocabulario abierto**. No hay switch por `reported_event`, snatch, disponibilidad, 5 km ni fixture A–J en el motor. Los enums finitos son estados técnicos/contextuales, no listas de maneras admitidas de hablar.

La revisión tiene contrato `{supported:boolean, complete:boolean, scopeSufficient:boolean, issues:ReviewIssue[]}`. `ReviewIssue` solo clasifica fallos técnicos/epistémicos: `UNSUPPORTED_CLAIM`, `MISSING_CLAUSE`, `REFERENCE_AMBIGUOUS`, `INSUFFICIENT_SCOPE`, `SPORTING_DECISION`. No elige ejercicios, dosis ni qué eventos importan.

## ContextScope y ContextRequirements

```ts
type ContextScope =
  | 'LOCAL_SESSION'
  | 'WEEK_CONTEXT'
  | 'LONGITUDINAL_PLANNING';

type ContextRequirements = {
  version: 1;
  scope: ContextScope;
  requested: ContextRequirement[];
  selection:
    | 'semantic_assessment'
    | 'uncertainty_escalation'
    | 'failure_fallback';
  evidenceElementIds: string[];
  loading: 'NOT_LOADED';
  authority: 'CONTEXT_ONLY';
  historyPolicy:
    | 'MINIMAL_EXECUTION'
    | 'RELEVANT_WEEK'
    | 'RELEVANT_LONGITUDINAL';
};
```

| Scope | Requisitos exactos |
|---|---|
| LOCAL_SESSION | originalMessage, targetSession, currentWeek, necessaryNeighbours, currentState, relevantRestrictions, readinessWhenRelevant, recentExecutionMinimal, relevantCapabilities |
| WEEK_CONTEXT | Los anteriores + availability, completedAndPendingSessions, recentLoad, currentPhysiology, activeGoal, activeBlock, relevantReportedEvents |
| LONGITUDINAL_PLANNING | Los anteriores + cycle, relevantHistory, exposuresAndLoad, physiologyTrends, outcomes, goalsAndEvents, weaknesses, evolution, relevantKnowledgeProvenance |

`ContextRequirement` es la unión exacta de esos IDs. La selección toma el máximo entre `contextScope`, `scopeAlternatives` y `minimumContextScope` de **todos** los elementos. Ese máximo es un cálculo estructural sobre evaluaciones semánticas del LLM, no una clasificación de palabras. Ante output inválido, review rechazada o proveedor fallido solicita longitudinal como recomendación shadow. No hay loaders nuevos: `NOT_LOADED` evita confundir una solicitud de contexto con datos ya disponibles.

La entrada de interpretación Web tiene solo dos turnos anteriores, de hasta 1500 caracteres cada uno, y estado de pregunta pendiente. No se carga ciclo, fisiología, perfil ni historial longitudinal. Los recortes son referencias auxiliares, nunca el mensaje actual. El runner acepta hasta seis referencias acotadas para otros clientes. En 1B habrá que alimentar target real y referencias autoritativas mínimas; esta fase no inventa sus loaders.

## Multi-intent, evidencia y UNKNOWN

- Los arrays independientes conservan elementos simultáneos y `relatesTo` vincula IDs sin fusionar cláusulas. IDs duplicados o referencias colgantes invalidan el output completo; no se rescatan fragmentos parciales silenciosamente.
- El prompt exige cobertura de todas las cláusulas, aun contestando una pregunta pendiente. La revisión semántica verifica cobertura; omisión → resultado no admitido en shadow y scope suficiente de fallback. No se entrega interpretación parcialmente validada como exitosa.
- Cada elemento y campo conocido exige evidencia literal del mensaje actual. La infraestructura adjunta actor verificado, messageId y reportedAt. Contexto anterior solo puede desambiguar mediante IDs existentes, con autoridad `UNVERIFIED_CONTEXT`.
- `UNKNOWN` exige `value:null`; un campo conocido no puede declararse a la vez en `unknownFields`. Tipo formal/distancia/diagnóstico ausentes no se completan por catálogo. Una fecha sin resolver conserva expresión y evidencia con fechas null. Timestamp de reporte y tiempo efectivo son distintos.
- `INTERPRETED` declara interpretación; **no la convierte en FACT**. Toda la interpretación sigue teniendo `SHADOW_CANDIDATES_ONLY`, incluso cuando pasa la revisión.
- Cita exacta y revisión LLM reducen errores, pero no demuestran veracidad ni completitud de forma absoluta. No existe una garantía determinista de “no invención” semántica. Por eso ningún candidato es consumido como estado o permiso.

No se han añadido regex, sinónimos, confirmaciones, variantes ortográficas ni ramas por palabras para resolver significados. Las regex nuevas validan timestamps/fechas civiles; `includes` valida enums/IDs/consistencia estructural; `indexOf` localiza una cita literal. Los textos A–J y los nombres esperados en fixtures se usan solo para pruebas/evaluación; nunca se importan al intérprete productivo.

## Demostración A–J y límite de la evidencia

Las siguientes salidas se verifican **contra respuestas de proveedor simuladas** que atraviesan el runner, decoder, selección de requirements y revisión inyectada. Demuestran transporte y conservación del significado expresado en las fixtures, no que una llamada real al LLM haya producido esas salidas.

| Caso | Scope esperado | Elementos que sobreviven en el contrato offline |
|---|---|---|
| A | LOCAL_SESSION | Adaptación; observación hombro ligada a split jerk pesado; diagnóstico, severidad y restricción permanente null |
| B | LOCAL_SESSION (WEEK_CONTEXT también válido según target) | Máximo 40 minutes, viernes 25/09/2026; no límite aplicado a otros días |
| C | WEEK_CONTEXT | Confirmación con excepción + descanso sábado 26/09 + evento domingo 27/09, 5 km, relación causal; pace/priority/goal null |
| D | WEEK_CONTEXT | Motivación de hacerlo con su mujer e importancia declarada; referencia al evento previo; sin eliminarlo ni cambiar objetivo primario |
| E | LONGITUDINAL_PLANNING | Intención de generar próxima semana; no generación ejecutada |
| F | LONGITUDINAL_PLANNING | Mejorar snatch y mantener preparación 10K relacionados; sin reemplazo automático |
| G | LOCAL_SESSION | Ejecución box hoy por su cuenta; forgeSessionId y dosis null; sin completar plan |
| H | WEEK_CONTEXT | Cansancio subjetivo esta semana; readinessScore null |
| I | WEEK_CONTEXT | Evento descrito como prueba domingo; formalType/distancia/goal/priority null |
| J | LONGITUDINAL_PLANNING | Generación + carrera 8 km domingo + descanso sábado; tres cláusulas conservadas |

También hay fixtures de carrera sin distancia, molestia sin diagnóstico, dominio nuevo no catalogado, incertidumbre entre scopes, citas falsas, fechas inválidas, campo conocido sin evidencia, desconocido con valor inventado y rechazo por omisión de cláusula.

Evaluador real preparado:

```powershell
node lib/chat/evaluateSemanticIntake.mjs --live
```

Requiere `ANTHROPIC_API_KEY` en entorno o `.env.local`. Solo envía inputs sintéticos A–J, **no envía las salidas esperadas al intérprete**. Ejecuta intérprete, revisión y juez semántico con criterios por caso; el juez no exige nombres de fields/type ni frases exactas. Guarda únicamente el artefacto de evaluación sintética en `docs/semantic-intake-shadow-evaluation-2026-09-22.json`, si llega a ejecutarse. No toca Supabase ni canoniza hechos.

Intento realizado: `node lib/chat/evaluateSemanticIntake.mjs --live --case=A` → `SEMANTIC_EVAL_CREDENTIAL_UNAVAILABLE`, exit 2. No hubo llamada de proveedor ni artefacto de resultados. No se certifica aceptación semántica real de A–J. El evaluador tiene además límites: una ejecución por ejemplo no mide fiabilidad estadística y el juez usa la misma familia de modelo.

## Flags y métricas

Flags, ambos desactivados si no valen exactamente `1`:

```text
NEXT_PUBLIC_FORGE_SEMANTIC_INTAKE_SHADOW=1  # instrumentación Web, fijado en build Next
FORGE_SEMANTIC_INTAKE_SHADOW=1             # endpoint servidor
```

No se han cambiado archivos de entorno ni activado flags. Con flag Web off no se obtiene token, no se crea ID y no se hace petición shadow. Con flag servidor off se devuelve `disabled` antes de Auth/modelo. Un caller Expo autorizado puede usar directamente el endpoint con su Bearer real y el mismo contrato; no se confía en un actor enviado por cliente.

Evento de consola: `SEMANTIC_INTAKE_SHADOW` con:

- version, mode, status;
- scope, requested, selection;
- interpreterMs, reviewMs, totalMs;
- interpretationInputCharacters, interpretationContextCharacters, approximateInputTokens;
- intentCount, factCandidateCount, preferenceCount, unresolvedCount.

No se loguean texto, citas, fields, razones libres, actor, messageId, token ni excepciones del proveedor. `approximateInputTokens` es longitud de prompt+input dividida por cuatro, no uso real de tokens. Los tiempos son del runner, no tiempo de red de navegador/Auth ni métricas de producto. Timeouts: 30 s por llamada de proveedor, 65 s en cliente; no reintento. La petición es independiente y no bloquea coaching.

No hay medición real de latencia LLM en este entorno sin credencial. Los tiempos offline son de mocks y no se usan como promesa de rendimiento. El objetivo de futuro permanece: loaders locales proporcionales y sin reconstrucción longitudinal por defecto.

## Reutilización y conservación de autoridades

- `parseCoachObject`: transporte JSON/fence completo, sin rescatar fragmentos.
- Patrón `output_config.format` estático y hojas JSON de `coachOutputContract`; se replica solo el pequeño adaptador de transporte para no modificar `groundedReply` ni su comportamiento.
- `conversationOnly`: separación de roles y selección acotada, con referencias explicitadas como no verificadas.
- Contratos existentes de provenance y revisión factual inspiran la separación evidencia/interpretación. No se llama a `persistCoachingKnowledge`: hacerlo crearía autoridad de escritura.
- `prescriptionScope` y restricciones canónicas no se reinterpretan ni cambian. El nuevo scope tiene `CONTEXT_ONLY`; no sustituye permisos ni exige cargar esas autoridades en 1A. Se solicitan como requisitos para futuros loaders.
- Availability, parseIncludeToday, pending questions, generación, Coach, validadores de planes y writers existentes siguen siendo la única autoridad productiva.

## Validación ejecutada

| Comprobación | Resultado |
|---|---|
| Nuevos `semanticIntakeShadow.test.mjs` | **41/41 PASS** |
| `weeklyAvailabilityFallback.test.mjs` | **30/30 PASS** |
| `weeklyAvailabilityRegression.test.mjs` | **32/32 PASS** |
| `weeklyAvailabilitySnapshotRegression.test.mjs` | **16/16 PASS** |
| Cuatro suites weeklyAvailability, incluida Declaration | **130/130 PASS** |
| Lote ampliado relacionado, 24 suites | **773/774**, 1 fallo preexistente confirmado en HEAD |
| TypeScript `node node_modules/typescript/bin/tsc --noEmit --incremental false` | **PASS** |
| `git diff --check` | **PASS** (aviso de conversión LF/CRLF, sin errores whitespace) |
| Evaluación real A–J | **NO EJECUTADA: falta credencial del proveedor** |

No se encontró un manifiesto versionado que identifique exactamente el lote mencionado de 231 tests. Se ejecutó un lote ampliado explícito de 774 casos en las fronteras relacionadas, no se afirma haber reconstruido ese comando histórico exacto. Manifiesto reproducible:

```text
lib/chat/groundedCoach.test.mjs
lib/chat/coachOutputContract.test.mjs
lib/chat/coachFactualReview.test.mjs
lib/sports/chatAvailability.test.mjs
lib/sports/weeklyAvailabilitySnapshotRegression.test.mjs
lib/sports/weeklyAvailabilityRegression.test.mjs
lib/sports/weeklyAvailabilityFallback.test.mjs
lib/sports/weeklyAvailabilityDeclaration.test.mjs
lib/sports/trainingAvailability.test.mjs
lib/sports/sessionIntentAuthority.test.mjs
lib/sports/sessionExecution.test.mjs
lib/planning/weeklyTemporalOrder.test.mjs
lib/planning/weeklySave.test.mjs
lib/planning/weeklyGenerationPreflight.test.mjs
lib/planning/weeklyCoachingContext.test.mjs
lib/planning/weeklyCalendar.test.mjs
lib/planning/weeklyAvailabilityFlow.test.mjs
lib/planning/weeklyAvailabilityDiagnostics.test.mjs
lib/planning/weeklyAvailability.test.mjs
lib/planning/openCoachAuthority.test.mjs
lib/athlete/strategyResolution.test.mjs
lib/athlete/onboardingAvailability.test.mjs
lib/athlete/goalResolution.test.mjs
lib/athlete/eventAuthority.test.mjs
```

Ejecutar con `node --test --test-concurrency=4 <archivos anteriores>`.

Fallo existente: `lib/planning/weeklyAvailabilityDiagnostics.test.mjs:43`, test “explicit source diagnostics describe the actual overriding non-string member”. Espera `reason === 'non_string_member'`, recibe `'null'`. La suite aislada da 12/13. Se repitió con las fuentes leídas en memoria mediante `git show HEAD:<ruta>` (sin checkout, sin escribir fuentes ni tocar .git): **mismo 12/13 y mismo fallo**. No se modificó el diagnóstico, el parser ni la expectativa. Resolverlo requiere un cambio separado de esta instrumentación shadow.

Los tests nuevos comprueban también flag off sin llamadas, error de proveedor sin propagación al producto, logger que falla, body excedido, actor suplantado reemplazado por principal real, output con comandos extra rechazado, JSON numérico infinito rechazado, refs/IDs inválidos, alcance de día preservado y ausencia de dependencias de escritura en el runner.

## Riesgos y criterio antes de 1B

1. **Falta evaluación semántica real.** Ejecutar A–J, variantes no vistas, negaciones, terceros y elipsis; revisión humana de muestras. No habilitar consumo productivo basándose en 41 mocks/contratos.
2. **Revisión correlacionada:** intérprete y revisor pueden coincidir en el mismo error. Citas literales no bastan para probar causalidad, temporalidad o diagnóstico; conservar candidatos como tales.
3. **Contexto mínimo no autoritativo:** dos turnos pueden no resolver “esta carrera”; un target real requiere lectura mínima autorizada en 1B. Escalar requisitos no es haber cargado contexto. No sustituir la autoridad de scope de prescripción.
4. **Identidad temporal:** el actor está autenticado, pero messageId/timestamp/timezone son del cliente y no están ligados aún a un ledger productivo. Antes de persistir, anclar recepción/tiempo efectivo, correcciones e idempotencia en servidor. No reutilizar el ID shadow como recibo de escritura.
5. **Cobertura Web:** la observación no cambia acciones antiguas ni mensajes sin texto; no hay garantía de observar clientes externos que no envíen al endpoint. Expo debe usar el contrato compartido, no copiar lógica semántica.
6. **Disponibilidad del proveedor y coste:** dos llamadas por observación, tres por caso en evaluador. Flags off y ausencia de retry evitan trabajo automático inesperado; hacen falta mediciones reales antes de optimizar o activar a escala.
7. **Privacidad:** logs nuevos solo metadata; el mensaje sí se envía al proveedor al activar shadow. Los diagnósticos antiguos siguen intactos. No guardar respuestas shadow como hechos sin un diseño posterior explícito.
8. **Contratos todavía sin autoridad:** factCandidate, preference, intent y UNRESOLVED no son comandos. 1B deberá diseñar admisión/escritura por operación y validar permisos, concurrencia, restricciones y readback, conservando todas las invariantes actuales.

Confirmación: cero writers nuevos, cero dual-write, cero decisiones productivas basadas en shadow, cero sustituciones de parsers, cero cambios de prompts del Coach, cero generación o modificación de planes ejecutada en esta tarea. No commit/push ni despliegue. Rollback: ambos flags off; la observación puede retirarse sin migrar estado.
