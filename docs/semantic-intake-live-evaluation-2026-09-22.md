# Evaluación live de semantic intake — 2026-09-22

## Registro previo a correcciones

1. El artefacto que existía al comenzar mostraba `networkFailure=true`, sin causa detallada (2026-09-22T09:36:29.236Z, caso A, una petición sin estado HTTP). Reproducción actual sin credencial: fetch HTTPS dentro del sandbox falla con `EACCES`; fuera del sandbox devuelve HTTP 401. Evidencia consistente con bloqueo de red del sandbox, no con fallo del contrato HTTP. No se puede reconstruir retrospectivamente la excepción que el runner anterior descartó. La primera ejecución del runner volvió a escribir su artefacto original; el dato previo aquí descrito procede de la lectura inicial, no de un backup inexistente.
2. Primera ejecución live A–J fuera del sandbox: 10/10 HTTP 400 antes de interpretación. Evidencia preservada en `semantic-intake-live-baseline-http400-2026-09-22.json`. Diagnóstico técnico filtrado: la gramática compilada del schema excede capacidad del proveedor. Sin errores brutos ni datos de credenciales en artefactos.
3. Comparación con `/api/chat`: mismo endpoint, cabeceras, modelo `claude-sonnet-4-5`, max_tokens 6000 y output_config.format. Chat tiene timeout 120 s y schema más pequeño; shadow 30 s y elementos anidados repetidos. La documentación oficial confirma límites combinados de complejidad: https://platform.claude.com/docs/en/build-with-claude/structured-outputs .
4. Deduplicación estructural mediante referencias JSON Schema en el adaptador de transporte shadow: de 5885 a 2556 caracteres, ocho definiciones reutilizadas. Dos intentos intermedios confundieron mapas de propiedades con nodos schema y fueron rechazados con HTTP 400; se corrigió la identificación estructural del nodo. El test expande todas las referencias y exige igualdad exacta con el schema original. No cambia el contrato, el intérprete, el significado de campos ni los prompts; no contiene reglas del lenguaje natural.
5. Primera petición con schema finalmente válido agotó 30 s. Prueba diagnóstica local con timeout 120 s (el de `/api/chat`): A respondió PASS, 11921 ms de interpretación + 2518 ms de revisión, 14499 ms total. Es compatible con compilación inicial o latencia transitoria, no prueba concluyente de la causa. No se aumentó el timeout productivo: las 120 ejecuciones principales usan el original de 30 s por llamada. El schema ya había recibido peticiones; no se presentan estos percentiles como arranque frío.

## Hallazgos documentados durante la ejecución, sin cambiar prompts

- El contrato exige `requiresClarification=true` cuando hay `unresolved`, pero el modelo devuelve repetidamente `false`. El schema estático y el prompt no expresan toda esta relación cruzada. Resultado: candidato descartado y requisitos longitudinales de fallback; no bloqueo del flujo productivo.
- También hay fechas null con status RELATIVE y fechas pobladas con status UNRESOLVED. Se conservan como fallos contractuales; no se normalizan para aprobarlos.
- K20/1: miércoles se convirtió en 24/09 (jueves), aceptado por shadow y juez. K17/1: salida tranquila se concretó como `easy_run`, aceptada por ambas revisiones. K30/1: fechas de lunes convertidas a martes. K16/1: guardia convertida en turno nocturno y salida por la mañana sin evidencia. Se conservan resultados originales y adjudicaciones separadas.
- El juez es del mismo modelo que el intérprete/revisor. La inspección directa de candidatos detecta errores que el juez aprueba; por tanto su PASS no constituye certificación. Las adjudicaciones son revisión de Codex, no revisión humana.

## Decisión: NOT READY para Fase 1B

Resultado principal tras inspección: **28 PASS, 0 SAFE_AMBIGUITY, 12 UNSAFE_INVENTION, 0 LOST_INFORMATION como categoría principal, 3 WRONG_SUBJECT, 15 WRONG_TEMPORALITY, 0 INSUFFICIENT_CONTEXT confirmado y 62 OTHER_FAILURE**. Son 120 ejecuciones únicas (40 casos ×3). De43 candidatos aceptados por shadow,15 presentan fallos semánticos identificados. No se consumieron productivamente. Las categorías son principales y mutuamente excluyentes; las incidencias secundarias y juicios originales permanecen en los JSON, por lo que cero en una categoría principal no certifica ausencia de ese riesgo.

PASS significa significado conservado y contexto suficiente según esta evaluación, no aprobación de latencia/proporcionalidad ni de Fase1A completa. Por ejemplo C obtiene PASS semántico en las tres repeticiones, pero selecciona LONGITUDINAL_PLANNING en lugar del WEEK_CONTEXT deseado. Hay18 aceptaciones por encima del mínimo nominal (B permite también semanal). El fallback de77 rechazos explica77 de94 selecciones longitudinales; las otras17 son aceptadas. Las ambigüedades reales existen en el corpus, pero no se ocultan sus rechazos contractuales bajo SAFE_AMBIGUITY.

La evaluación termina con evidencia suficiente para **NO conectar este intake a autoridades productivas**. Hay invenciones y temporalidad incorrecta que superan el revisor shadow, fallos de sujeto en candidatos brutos y rechazo frecuente de salidas semánticamente aprovechables por incompatibilidad entre prompt/schema y validación cruzada. No se considera terminada la aceptación semántica de Fase 1A; sí se entrega su validación live y diagnóstico. No se ha iniciado Fase 1B.

Antes de repetir una aceptación se necesita resolver de forma general la coherencia contrato/prompt (especialmente unresolved/clarification y fechas), conservar tipo formal UNKNOWN sin resolverlo por familiaridad deportiva, comprobar atribución y temporalidad, y mejorar la evaluación independiente. El juez también debe considerar el scope efectivo calculado y no únicamente contextScope. No se proponen whitelists, aliases ni arreglos por fixture. Ninguno de esos cambios semánticos se ha realizado durante este lote.

## Cambios y límites de esta entrega

- `evaluateSemanticIntake.mjs`: fallback local de credencial únicamente después de `--live` y si falta variable de entorno; diagnósticos técnicos filtrados, 3 repeticiones ×40 casos, concurrencia3, captura sintética y checkpoints. El timeout ampliado existe solo como opción diagnóstica local, no como cambio de runtime.
- `semanticShadowProvider.ts`: única modificación al núcleo shadow, deduplicación estructural del schema con `$defs/$ref`; conserva modelo, timeout30s, contenido, permisos, decoder y prompts. Prueba de equivalencia exacta por expansión de referencias.
- `semanticIntakeShadow.test.mjs`: prueba de transporte ahora verifica equivalencia semántica exacta del schema con referencias, manteniendo comprobaciones de no herramientas, no retry y respuesta incompleta.
- Nuevos `semanticIntakeLiveCorpus.mjs`, `summarizeSemanticIntakeLive.mjs`, `semanticEvaluationClassification.mjs` y cuatro tests de contabilización. Son tooling local; no los importa el producto.
- Corrección de bookkeeping: el runner inicial seleccionaba una categoría secundaria sobre la principal del juez. El helper corregido preserva WRONG_SUBJECT/WRONG_TEMPORALITY principales y recalcula offline sobre el mismo juicio guardado. No se repiten llamadas ni se alteran candidatos para esta corrección. Se conservan contadores originales, contadores recalculados y adjudicaciones.
- Informes y artefactos sintéticos JSON. Los resultados originales conservan candidato bruto, revisión, juez, estado y latencia; las adjudicaciones son un archivo separado auditable. Ningún artefacto contiene una credencial ni errores brutos del proveedor.

El código del intérprete/prompts, API route, Availability, Coach, planning y writers no se ha modificado en esta continuación. La instrumentación anterior en FormaPro sigue exactamente igual. Ambos flags permanecen off; no se modificaron entornos, no hubo writes productivos, reportedEvents, dual-write, commit ni push. El archivo autorizado de la clave continúa fuera del repositorio y no se ha borrado ni copiado. Solo se leyó desde el proceso de evaluación para suministrar ANTHROPIC_API_KEY.

## Ejecuciones y reproducción

Lote principal: `node lib/chat/evaluateSemanticIntake.mjs --live`, con defaults3 repeticiones y concurrencia3. Incluye A–J más30 mensajes adicionales. Recalcular informe sin red ni credencial: `node lib/chat/summarizeSemanticIntakeLive.mjs`.

Además del lote principal hubo17 ejecuciones diagnósticas:10 de baseline A–J HTTP400,3 probes de detalle técnico del schema,2 intentos de deduplicación rechazados,1 timeout30s y1 casoA con timeout120s (PASS). Son19 solicitudes de proveedor en pilotos, contando interpretación/revisión/juez del último. No se incluyen en estadísticas principales ni se presentan como otras repeticiones del corpus. Hubo también2 probes HTTPS sin clave para comparar sandbox/fuera de sandbox.

## Regresiones

| Comprobación | Resultado |
| --- | --- |
| Semantic intake shadow |41/41 PASS|
| Contabilización del evaluador |4/4 PASS|
| Availability fallback |30/30 PASS, incluido en lote relacionado|
| Availability regression |32/32 PASS, incluido en lote relacionado|
| Availability snapshot |16/16 PASS, incluido en lote relacionado|
| Cuatro suites Availability incluida Declaration |130/130 PASS, incluidas en lote relacionado|
| Lote relacionado24 suites |773/774; mismo fallo preexistente|
| TypeScript, noEmit, incremental false |PASS|
| Sintaxis de evaluador/corpus/resumen |PASS|
| git diff --check y archivos nuevos |PASS|

Fallo: `lib/planning/weeklyAvailabilityDiagnostics.test.mjs:44`, assertion en47, espera `non_string_member`, recibe `null`. Confirmado contra HEAD en Fase1A y reproducido de nuevo aquí. Archivo y expectativa intactos. El manifiesto completo de24 suites está en el informe anterior de Fase1A; no se ha encontrado un manifiesto versionado que reproduzca exactamente el antiguo número231, por lo que se informa el lote real774. Total no duplicado de tests ejecutados:819, con818 aprobados y1 fallo previo.

## Riesgos restantes

1. Revisor y juez correlacionados: ambos pueden aprobar el mismo error. Inspección directa cubre candidatos y hallazgos señalados, sin garantía de exhaustividad ni certificación humana.
2. Proporcionalidad: alternativas demasiado amplias y muchos fallbacks fuerzan requisitos longitudinales. Medir selección no demuestra reducción de latencia ni existencia de loaders proporcionales.
3. Tres repeticiones, idioma español y un anclaje temporal principal (martes22/09/2026, Atlantic/Canary). Faltan otros husos, medianoche/DST, calendarios declarados, conversaciones largas y sesiones/eventos reales autorizados.
4. Recurrencia, metas compuestas y atribución requieren semántica consistente. Citas literales y fechas ISO válidas no bastan para comprobar significado ni día de semana.
5. No se prueba carga productiva, coste a escala, aislamiento multiusuario del despliegue ni arranque frío. Datos y sujetos son sintéticos; no se consultó DB ni se guardaron hechos del atleta.

## Diff y evidencia

El diff final frente a HEAD incluye los archivos nuevos de Fase1A, porque aún no había commit de la fase anterior. La auditoría previa queda fuera del diff de esta entrega. [Diff de código y documentación](semantic-intake-final-code-2026-09-22.diff); [diff completo, incluyendo JSON sintéticos](semantic-intake-final-2026-09-22.diff). No son un commit ni un parche aplicado automáticamente. Esta sección identifica por separado los cambios de la continuación live.

El resumen cuantitativo siguiente se regenera desde artefactos, sin llamadas LLM ni transformación del contenido de las respuestas.


<!-- LIVE_METRICS -->
## Resultado medido final

120/120 ejecuciones principales; 40 casos × 3 repeticiones, concurrencia 3. Modelo claude-sonnet-4-5. Tiempo de lote: 884.5 s. Timeout por llamada: 30000 ms. Los hashes de fuentes se guardan en el artefacto. Ningún resultado esperado ni rúbrica se envía al intérprete: solo al juez posterior.

| Categoría | Juez + contrato | Tras inspección directa | A–J | Corpus adicional |
| --- | --- | --- | --- | --- |
| PASS | 40 | 28 | 10 | 18 |
| SAFE_AMBIGUITY | 0 | 0 | 0 | 0 |
| UNSAFE_INVENTION | 1 | 12 | 3 | 9 |
| LOST_INFORMATION | 1 | 0 | 0 | 0 |
| WRONG_SUBJECT | 2 | 3 | 0 | 3 |
| WRONG_TEMPORALITY | 2 | 15 | 3 | 12 |
| INSUFFICIENT_CONTEXT | 3 | 0 | 0 | 0 |
| OTHER_FAILURE | 71 | 62 | 14 | 48 |

Las categorías finales incorporan las adjudicaciones documentadas. Los JSON originales no se reescriben con dichas adjudicaciones. OF incluye fallos del contrato/transporte/revisión aunque el juez considere correcto el significado del candidato bruto. Los fallos semánticos detectados se conservan como tales incluso cuando el contrato los contuvo. No se cuentan rechazos técnicos como SAFE_AMBIGUITY.

### A–J reales

P=PASS, SA=SAFE_AMBIGUITY, UI=UNSAFE_INVENTION, LI=LOST_INFORMATION, WS=WRONG_SUBJECT, WT=WRONG_TEMPORALITY, IC=INSUFFICIENT_CONTEXT, OF=OTHER_FAILURE. Scopes: L=LOCAL_SESSION, W=WEEK_CONTEXT, P=LONGITUDINAL_PLANNING (incluye fallback).

| Caso | R1 / R2 / R3 | Scopes efectivos R1 / R2 / R3 | Variabilidad categoría |
| --- | --- | --- | --- |
| A | OF / P / OF | P / L / P | Sí |
| B | WT / P / P | W / W / W | Sí |
| C | P / P / P | P / P / P | No |
| D | P / OF / OF | W / P / P | Sí |
| E | OF / OF / OF | P / P / P | No |
| F | OF / OF / P | P / P / P | Sí |
| G | OF / OF / OF | P / P / P | No |
| H | WT / WT / P | P / W / P | Sí |
| I | UI / UI / UI | P / P / P | No |
| J | P / OF / OF | P / P / P | Sí |

### Corpus ampliado real

| Caso | R1 / R2 / R3 | Scopes efectivos R1 / R2 / R3 | Variabilidad categoría |
| --- | --- | --- | --- |
| K01 | P / P / P | L / L / L | No |
| K02 | P / P / OF | W / W / P | Sí |
| K03 | WS / WS / WS | P / P / P | No |
| K04 | P / P / P | W / W / W | No |
| K05 | OF / OF / OF | P / P / P | No |
| K06 | P / P / WT | P / P / P | Sí |
| K07 | OF / WT / WT | P / P / P | Sí |
| K08 | OF / OF / OF | P / P / P | No |
| K09 | OF / OF / OF | P / P / P | No |
| K10 | P / OF / OF | L / P / P | Sí |
| K11 | UI / OF / UI | P / P / P | Sí |
| K12 | P / P / P | W / W / W | No |
| K13 | OF / OF / OF | P / P / P | No |
| K14 | P / WT / WT | W / P / P | Sí |
| K15 | OF / OF / OF | P / P / P | No |
| K16 | UI / OF / UI | P / P / P | Sí |
| K17 | UI / UI / UI | W / W / W | No |
| K18 | WT / WT / WT | P / P / P | No |
| K19 | OF / UI / UI | P / W / P | Sí |
| K20 | WT / WT / P | W / W / W | Sí |
| K21 | OF / OF / OF | P / P / P | No |
| K22 | OF / OF / OF | P / P / P | No |
| K23 | OF / OF / OF | P / P / P | No |
| K24 | OF / OF / P | P / P / P | Sí |
| K25 | OF / OF / OF | P / P / P | No |
| K26 | OF / OF / OF | P / P / P | No |
| K27 | OF / OF / OF | P / P / P | No |
| K28 | OF / P / OF | P / P / P | Sí |
| K29 | OF / OF / OF | P / P / P | No |
| K30 | WT / WT / OF | P / P / P | Sí |

Textos completos, criterios previos, candidatos, revisión, juez y tiempos por ejecución: [resultados](semantic-intake-live-results-2026-09-22.json). Corpus reproducible: [semanticIntakeLiveCorpus.mjs](../lib/chat/semanticIntakeLiveCorpus.mjs).

### Latencias y scopes

Percentiles nearest-rank; milisegundos. totalMs mide el runner shadow, incluye interpretación/validación/revisión y excluye el juez externo, Auth y red del navegador. reviewMsInvoked excluye ceros de revisiones que nunca llegaron a ejecutarse. Los fallos no se excluyen de las métricas generales.

| Métrica | n | p50 | p95 | max |
| --- | --- | --- | --- | --- |
| interpreterMs | 120 | 11626 | 17033 | 21106 |
| reviewMsAll | 120 | 0 | 2357 | 3222 |
| reviewMsInvoked | 43 | 2082 | 2603 | 3222 |
| totalMs | 120 | 12875 | 17584 | 21107 |

| Scope | Todas las ejecuciones | Aceptadas por shadow | Declarado por modelo |
| --- | --- | --- | --- |
| LOCAL_SESSION | 5 | 5 | 31 |
| WEEK_CONTEXT | 21 | 21 | 69 |
| LONGITUDINAL_PLANNING | 94 | 17 | 20 |

Estados: {"interpreted":43,"invalid_output":77}. Sobre el scope nominal mínimo en 18 aceptadas; por debajo en 0. Esto mide proporcionalidad, no autoriza acciones ni prueba que todo scope mayor sea erróneo (B permite local/semanal). Fallback se distingue de elección real mediante selection en los artefactos.

### Variabilidad y fallos

18/40 casos cambian de categoría entre repeticiones: A, B, D, F, H, J, K02, K06, K07, K10, K11, K14, K16, K19, K20, K24, K28, K30. 7/40 cambian de scope efectivo: A, D, H, K02, K10, K14, K19. La variación de scope incluye rechazos con fallback, no solo decisión semántica. Tres ejecuciones por caso no estiman fiabilidad poblacional.

Fallos semánticos que superaron la revisión shadow: B/1, H/1, I/1, K17/1, K20/1, K30/1, H/2, I/2, K17/2, K20/2, K19/2, K30/2, K06/3, K14/3, K17/3. No hubo consumo ni escritura productiva de estos candidatos.

Indicadores estructurales (pueden coexistir): {"NON_LITERAL_EVIDENCE":3,"TEMPORAL_STATUS_DATE_CONTRADICTION":17,"UNRESOLVED_WITHOUT_CLARIFICATION":72}. Son diagnósticos de contrato, no reglas para interpretar lenguaje.

| Caso/repetición | Adjudicación directa | Aceptado por shadow | Evidencia |
| --- | --- | --- | --- |
| B/1 | WRONG_TEMPORALITY | Sí | El viernes solo 40 minutos se fecha en 2026-09-26 (sábado), en ambos elementos. El viernes es 25/09. |
| H/1 | WRONG_TEMPORALITY | Sí | Esta semana se convierte sin apoyo en un intervalo móvil martes22-lunes28, incluyendo el lunes siguiente y excluyendo el lunes actual. La semana civil sería21-27; ante otra convención desconocida debe conservar incertidumbre. |
| I/1 | UNSAFE_INVENTION | Sí | Prueba, de tipo formal desconocido, se concreta como eventType=race. INTERPRETED no legitima inventar el tipo; discipline UNKNOWN no corrige esa afirmación. |
| K03/1 | WRONG_SUBJECT | No | La entrenadora dice 'mañana no entreno' sobre sí misma. El candidato lo convierte en external_instruction/no entrenar y declara conflicto de autoridad con la disponibilidad del atleta, que no se sigue del mensaje. |
| K11/1 | UNSAFE_INVENTION | No | No se conoce el significado/escala de recuperación 18. El candidato afirma contrasts_with_metric=true y describe una contradicción objetiva/subjetiva, aunque no puede saber si 18 contradice estar descansado. |
| K17/1 | UNSAFE_INVENTION | Sí | 'Salida tranquila' se concreta como easy_run sin deporte declarado. El tipo de actividad debía quedar abierto; no basta con marcarlo INTERPRETED. |
| K16/1 | UNSAFE_INVENTION | No | 'Salgo de guardia' se convierte en shift_type=night_shift EXPLICIT y end_time=morning INTERPRETED; ni turno nocturno ni hora de salida estaban expresados. |
| K18/1 | WRONG_TEMPORALITY | No | La revisión es el jueves: 2026-09-24. effectiveTime termina 2026-09-25, que es viernes. |
| K20/1 | WRONG_TEMPORALITY | Sí | La falta de tiempo es el miércoles: 2026-09-23. El candidato fija 2026-09-24, jueves. |
| K30/1 | WRONG_TEMPORALITY | Sí | Los lunes se transforman en 2026-09-15 y 2026-09-29, ambos martes. El lunes próximo es 28/09 y el inmediatamente pasado es 21/09 (tampoco 15/09 bajo otra lectura). |
| H/2 | WRONG_TEMPORALITY | Sí | Esta semana vuelve a convertirse en martes22-lunes28 sin apoyo para ese intervalo móvil. |
| I/2 | UNSAFE_INVENTION | Sí | Prueba vuelve a concretarse como eventType=race sin evidencia del tipo formal. |
| K03/2 | WRONG_SUBJECT | No | Declara coach_instruction/no entrenar y conflicts_with_coach_instruction=true. La entrenadora dijo que ella no entrenaba. Se conserva WRONG_SUBJECT del juez como principal, no su categoría secundaria LOST_INFORMATION. |
| K05/2 | OTHER_FAILURE | No | El juez alega pérdida del vínculo entre fecha y distancia, pero intent-1 contiene distanceKm=8 y relatesTo fact-1, recíproco. Conserva la rectificación y el referente como unresolved, permitido por la rúbrica. El fallo demostrable es contractual: unresolved con requiresClarification=false. |
| K07/2 | WRONG_TEMPORALITY | No | Descanso sábado se fecha27/09 (domingo) y carrera domingo28/09 (lunes). Ambos desplazados un día. |
| K14/2 | WRONG_TEMPORALITY | No | Poco sueño esta semana se extiende al intervalo22-28/09 sin apoyo, en vez de la semana civil21-27 o incertidumbre sobre el calendario. |
| K17/2 | UNSAFE_INVENTION | Sí | Salida tranquila vuelve a convertirse en easy_run y la prueba en race sin deporte declarado. |
| K18/2 | WRONG_TEMPORALITY | No | Revisión jueves vuelve a convertirse en25/09, viernes, tanto en restricción como en cita. |
| K20/2 | WRONG_TEMPORALITY | Sí | Miércoles es correcto23/09 en esta repetición, pero la observación de esta semana se fecha22-28/09, extendiéndola al lunes siguiente sin apoyo. |
| K19/2 | UNSAFE_INVENTION | Sí | La corrección '45 minutos, no60' se convierte en plannedDuration=60 EXPLICIT sin evidencia de duración planificada. El juez también yerra al alegar scope insuficiente: el scope efectivo sí es WEEK_CONTEXT por alternativas. |
| I/3 | UNSAFE_INVENTION | No | Prueba vuelve a concretarse como race y competition confirmada; tipo formal no expresado. El contrato rechaza por otras inconsistencias, pero la invención sigue presente en el candidato bruto. |
| K06/3 | WRONG_TEMPORALITY | Sí | El límite de40 minutos para este viernes se fija26/09, sábado. Viernes es25/09. |
| K07/3 | WRONG_TEMPORALITY | No | La preferencia condicional de descanso sábado se fecha27/09, domingo, en vez del26/09. |
| K14/3 | WRONG_TEMPORALITY | Sí | Esta semana vuelve a convertirse en intervalo móvil22-28/09, con extensión injustificada al lunes siguiente. |
| K17/3 | UNSAFE_INVENTION | Sí | Salida tranquila se transforma por tercera vez en run/easy sin modalidad deportiva expresada; tampoco se declaró el propósito active_recovery. |
| K16/3 | UNSAFE_INVENTION | No | Se inventa endTime=morning para la salida de guardia del jueves, sin hora expresada. |
| K18/3 | WRONG_TEMPORALITY | No | El fin jueves de la limitación se fecha25/09, viernes, por tercera vez. |
| K19/3 | UNSAFE_INVENTION | No | El valor negado60 se convierte en planned_duration_minutes/expected_minutes y shorter_than_planned sin evidencia de planificación; la duración real45 y disponibilidad25 sí se expresaron. |

Llamadas HTTP del lote principal: 283; estados: {"200":283}. Tokens reportados: 650554 input y 133991 output, incluyendo juez. No se afirma coste monetario sin tarifas verificadas; pilotos no incluidos en estos tokens.
