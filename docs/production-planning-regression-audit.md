# Auditoría de regresión de planificación

HEAD auditado: `4f5eb1e658a457e97764a8edcec4a5d81eb2a26d`. Fecha: 2026-09-13.

Esta entrega es una auditoría y reproducción aislada. No se han modificado producción, políticas deportivas, contratos ejecutables, esquema ni datos. Las reproducciones ejecutan funciones reales y fragmentos AST de HEAD; los datos y las respuestas del proveedor son fixtures, no una reconstrucción ficticia del atleta real.

## Evidencia del incidente y límites

Identificadores facilitados por el usuario: atleta `060385`, `planningRunId=c8d9d91c-9b30-4710-babe-dd45ca9fdd1f`, fecha de generación `2026-09-13`, semana objetivo `2026-09-14`. Evento: `2027-02-20`, con creación/confirmación `2026-09-13T07:33:09.969Z`. Este timestamp pertenece al evento: **no se usa como hora de inicio de la generación**. Los 160 días son coherentes con esas fechas.

Las trazas posteriores precisan la observación inicial:

- Analyzer: deload, volumen 0.5, intensidad 0.6, cuatro días sugeridos; preferencias halterofilia técnica, base aeróbica, potencia y gimnásticos.
- Siete slots, cero completadas y cero protegidas.
- **Tres** Builders: martes, jueves y sábado, con el mismo run ID. Tres éxitos, cuatro REST, cero indisponibles.
- Integridad de cliente: válida, sin violaciones.
- Se reporta un plan `deload`, `week_number=1`, `total_weeks_block=1`, con objetivo visible «Fuerza máxima como prioridad».
- Un ejemplo confirmado contiene `fuerza_maxima / box_max_strength / horizontal_push`, bench press, warmup 2×8 RPE4 y main 4×5 RPE6–7. No se ha aportado su día exacto ni el JSON completo de las tres propuestas.

Por tanto, no se atribuyen cuatro sesiones Box a ese run. La repetición de cuatro sesiones de la observación inicial puede pertenecer a otra vista/versión; no hay evidencia suficiente para reconciliarla.

No hay conexión configurada de Supabase disponible en este entorno: se comprobaron nombres/presencia de variables, sin imprimir credenciales. No se descargaron secretos ni se llamó a acciones productivas como Analyzer, close_week o planificar_semana, que pueden tener efectos laterales. No hay acceso aquí a logs del servidor de esa ejecución ni a snapshots históricos completos. La secuencia entregada por el usuario es evidencia de consola; no sustituye una lectura de la fila final/revisión ni el receipt de guardado.

## Pipeline de HEAD: input, output y autoridad

| Transición real | Input → output | Autoridad / código |
|---|---|---|
| Inicio | Acción UI → contexto firmado con snapshots de semana actual/próxima | `app/FormaPro.tsx:953`, `lib/planning/weeklyGeneration.ts` |
| Target | `check_week_closure.yaCerrada` → actual o próxima semana; una continuación conserva target/token | `app/FormaPro.tsx:963`, `app/api/chat/route.ts:2323` |
| Preflight | Disponibilidad, scope, evento y temporalidad → requisito o permiso de continuar | `lib/planning/weeklyGenerationPreflight.ts`, rama preflight de la ruta |
| Estado/ciclo | `usuarios.ciclo_actual` → proyección legacy del Analyzer y proyección factual compartida de Weekly/Session | `generarEstadoCanonico`, `lib/athlete/athletePrescriptionContext.ts:218` |
| Block Analyzer | Ciclo, objetivo/evento, exposición, notas, bloque anterior, restricciones → análisis consultivo + preferencias | `app/api/chat/route.ts:2021`, prompt en `:2157` |
| Weekly context | Perfil/contexto canónico, target, snapshot, `strategyProposal` → scope, opciones factibles, estrategia, contexto de coaching | `lib/planning/prepareAllowedWeeklyPlanContract.ts:27` |
| Contrato | Métodos y patrones por objetivo + factibilidad/referencias/capabilities + días → `dayOptions`, frecuencia, cobertura orientativa | `lib/planning/authorizedMethodCandidates.ts`, `allowedWeeklyPlanContract.ts:108` |
| Weekly Coach | `COACHING_CONTEXT` + `WEEKLY_CONTRACT` → siete `optionId` y razones | `allowedWeeklyPlanContract.ts:295` |
| Validación/selección | JSON → opción exacta por día, TRAIN/REST/RECOVERY e intent; máximo dos propuestas | `validateWeeklySelection`, `composeBoundedWeek` |
| Calendar receipt | Selecciones admitidas + contexto/snapshot → slots firmados | `lib/planning/weeklyCalendarAuthority.ts:58` |
| Session Coach | Receipt, slot, perfil/contexto y vecinos → propuesta de movimiento/estructura/dosis | `app/api/chat/route.ts:2291`, `lib/sports/sessionAuthority.ts:58` |
| Factibilidad/variantes | Pools/restricciones/referencias/receta generativa → admisión o rechazo/reintento | `trainingFeasibility.ts`, `structuredSession.ts`, `movementVariants.ts` |
| Exposición/duplicación | Historial anterior → ranking y contexto; propuesta → comparación textual con sesiones previas | `exposureEngine.ts`, `sessionGeneration.ts:166` |
| Ensamblado | Builders paralelos + protegidas + REST → siete sesiones y metadatos de ciclo de React | `app/FormaPro.tsx:1045`, `:1087`, `:1137` |
| Whole-week/guardado | Sesiones firmadas → validación/reparación, identidad, freshness, CAS → plan persistido | `enforceWholeWeek.ts`, `app/api/chat/route.ts:4537` y `:4842` |
| Efectos posteriores | Guardado confirmado → outcome/ciclo/log de generación | `app/api/chat/route.ts:4865`; fallos se devuelven como warnings |

## A. Why repeated deload?

**BUG reproducido en el circuito de transición; recurrencia real histórica UNKNOWN.**

El Planner no elige una fase nueva. `buildCanonicalWeekStrategy` lee `context.cycle.block.value`; para CrossFit no hay anulación del ciclo por el evento. El caso especial que borra fase/semana legacy al preparar un evento está limitado a media maratón, no a CrossFit.

Al ensamblar, Web usa `cicloActual.bloque || analisis.tipo_semana`. Si el ciclo contiene `deload`, un Analyzer que proponga otra fase no lo cambia. Al guardar una semana futura sin fila previa, el servidor comprueba `semana + 1 > totalSemanas`. Si se cumple, reinicia semana a 1 y toma **el nombre y duración del plan recibido**, que Web acaba de copiar del ciclo anterior. Así, `deload 1/1 → plan deload 1/1 → nuevo ciclo deload 1/1` es un circuito cerrado sin una decisión nueva de bloque.

La reproducción ejecuta el `if` real de `guardar_plan_semana`: produce un outcome del bloque anterior y vuelve a preparar exactamente `deload 1/1`. Otra prueba ejecuta el Orchestrator real con Analyzer `acumulacion` y ciclo `deload`: el plan sigue siendo deload.

Esto explica un mecanismo capaz de repetir deload; no prueba cuántas veces ocurrió a AIRAN. Tampoco es correcto atribuirlo al último checkpoint: `git blame` sitúa la copia del ciclo en agosto (`02226fa2`), el reinicio con nombre del plan en `c242bf2f` y el guard de creación futura en `3e9ac7a3`, todos anteriores a `4f5eb1e`.

## B. Origin of week 1/1

| Campo | Fuente exacta | Fallback / transformación |
|---|---|---|
| `block_name` | `cicloActual.bloque` del estado React | `analisis.tipo_semana` solo si no hay bloque |
| `week_number` | `cicloActual.semana` | `1` cuando no es truthy |
| `total_weeks_block` | `cicloActual.totalSemanas` | `null`, **no 1** |
| `blockPhase` | `usuarios.ciclo_actual.bloque` proyectado en `canonicalWeekStrategy.block.phase` | Diccionario de fases; desconocida → `unknown` |
| `blockWeek` | `usuarios.ciclo_actual.semana` proyectada | Número válido o null |
| `tipo_semana` | Respuesta del Analyzer | Consultiva, no mutación del ciclo |

Un `total_weeks_block=1` en el plan ensamblado no lo inventa el fallback de Web; requiere un `totalSemanas=1` en su estado. No se puede demostrar la procedencia inicial de ese valor en la cuenta sin historial real. `athlete_state` aporta restricciones/contexto al Analyzer, pero no es el escritor de esos tres metadatos en esta ruta.

**Otro BUG reproducido:** con ciclo 2/4, la creación futura prepara ciclo 3/4, pero deja `plan.week_number=2`. El incremento no se aplica al objeto de plan y ocurre después de su composición. El ciclo usado por Weekly/Session también es previo a ese incremento. La respuesta de guardado no actualiza `cicloActual` en React; el Orchestrator recarga el plan, no el usuario/ciclo.

## C. Did lifecycle advance?

La única operación encontrada en este flujo que incrementa `ciclo_actual.semana` está en `guardar_plan_semana`:

1. La semana objetivo debe ser futura respecto al token (`!esSemanaActual`).
2. No debe existir plan en el snapshot (`!planExistente`).
3. El ciclo debe existir y `semana` ser de tipo number.
4. El plan debe superar validación y persistirse.
5. Después se intenta la escritura de ciclo como efecto separado; puede fallar con `CYCLE_UPDATE_FAILED` aunque el plan se haya guardado.

Crear por primera vez la semana que ya es «actual» no avanza el ciclo, aunque sea posterior a la última semana entrenada. Regenerar una fila existente tampoco avanza; esa última protección es intencionada. No hay un avance longitudinal general anclado a la última semana del bloque.

`close_week` calcula resumen/efectos y escribe `week_closure_log`; no incrementa el ciclo. El tag `RESUMEN_SEMANA` llama a otra ruta de resumen y no constituye el cierre. El botón llama explícitamente a `close_week`; Orchestrator puede generar sin el tag, y el target pasa a próxima semana cuando `check_week_closure` devuelve `yaCerrada=true`. El banner también se activa mediante la comprobación de cierre posterior al reporte, no exclusivamente por el tag. No se ha reparado ese tag.

En HEAD, una ejecución del 13 de septiembre dirigida al 14, si siguió esta ruta, tuvo que obtener el target de un cierre reconocido o de la continuación que lo conservaba. Es una inferencia del código, no una lectura del closure log. No demuestra que se escribiera un ciclo diferente: deload 1/1 puede reiniciarse con los mismos valores.

### Línea temporal real disponible

| week_start | block | week_number | total_weeks_block | tipo_semana | created_at de weekly_plan |
|---|---|---:|---:|---|---|
| 2026-09-14 | deload, reportado | 1 | 1 | deload, traza Analyzer | UNKNOWN |
| Semanas anteriores | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN |

Para completar esta tabla hace falta una lectura acotada de `weekly_plan` de ese atleta, y contrastar `week_closure_log`, `weekly_plan_generation_log`, `block_outcomes` y la revisión de ciclo. No se sustituyen por fixtures ni por la fecha del evento.

## D. Why were running days REST?

**Resultado conocido; causa de esta selección UNKNOWN.** Las trazas con tres Builders y cuatro REST permiten reconstruir los estados, no los menús ni las razones:

| Día | Estado de este run | ¿Existía opción TRAIN carrera? | Razón real del Coach |
|---|---|---|---|
| lunes | REST | UNKNOWN | No aportada |
| martes | TRAIN Box | No corresponde al día de carrera declarado | No aportada |
| miércoles | REST | UNKNOWN | No aportada |
| jueves | TRAIN Box | No corresponde | No aportada |
| viernes | REST | No corresponde; Box estaba disponible | No aportada |
| sábado | TRAIN Box | No corresponde | No aportada |
| domingo | REST | UNKNOWN | No aportada |

El servidor enumera primero por scope/día, catálogo de métodos, capability de dosis y factibilidad. Un método no cuantificable/permitido se elimina en `authorizedMethodCandidates.evaluate`; restricciones, material, habilidades, referencias y satisfacción de estructura también pueden eliminar opciones. REST existe por día aunque no sobreviva ningún método.

La prueba con disponibilidad equivalente, ambas disciplinas bajo Forge, equipo/capacidades resueltos y sin restricciones obtiene TRAIN carrera lunes/miércoles/domingo. Otra con restricciones duras de impacto/salto/flexión no obtiene opciones carrera. **No se atribuyen esas restricciones concretas al snapshot real de AIRAN**: son dos reproducciones que separan eliminación previa del menú y elección libre de REST.

No se ha encontrado una regla de esta ruta que convierta automáticamente todos los días de carrera en descanso por ser deload o por CrossFit. Tampoco debe añadirse una obligación de correr. El Analyzer sugirió cuatro días, pero el límite semanal procede de `loadWeeklyCalendarContext` y su safety net (5/6 según frecuencia), no de esa cifra. Tres TRAIN pueden ser una selección válida.

### Estructura exacta que construye el input de Weekly Coach

No se conserva aquí el input del run histórico. Lo siguiente describe campos realmente transportados por HEAD, con valores del incidente solo cuando hay evidencia:

| Información | Ubicación en el input real | Límite relevante |
|---|---|---|
| Objetivo/evento | `WEEKLY_CONTRACT.strategy.goal/eventAuthority` | CrossFit/fecha reportados; snapshot completo no disponible |
| Fase/semana/duración | `strategy.block` | Ciclo canónico previo, no nueva fase del Analyzer |
| Adaptaciones/métodos recomendados | `strategy.adaptations/methods/coverage/deferred` | Recomendación de catálogo + orden admitido |
| Disponibilidad | `COACHING_CONTEXT.future.availability` + `dayOptions` | Hechos efectivos y menús son capas distintas |
| Restricciones | `current.restrictions` y contextos por disciplina | Autoridad compartida |
| Readiness | `current.readiness` | Loader no recibe readiness preparado en esta ruta: `unknown`, no cálculo fresco |
| Fisiología | `current.physiology` | Objetiva, subjetiva y tendencias canónicas |
| Entrenamiento reciente/completadas | `past.prescriptionHistory` | Hasta 14 filas; PLANNED_ONLY/ejecución separadas |
| Carrera | `past.domainExecutionEvidence` | Hasta 10 ejecuciones; resúmenes 7/28 días, procedencia |
| Fuerza | `current.references.strength` + historial de prescripción/reportes | No ledger completo de dosis realizadas de fuerza |
| Movement exposure | `past.exposure` | Hasta 10 movimientos por disciplina; conteos textuales |
| Adaptation exposure | Historial y method/adaptation de prescripción | No agregado temporal de adaptación lograda |
| Cambios/response | `past.modifications`, reportes del historial | Hasta 8 modificaciones; no inferir respuesta posterior |
| Debilidades | `future.weaknesses` | Hasta 6; estrategia puede diferir la atribución durante deload |
| Semana anterior | Historial disponible | No se carga `block_week_summary`/`resumen_semana` como outcome semanal dedicado |
| Resultados de bloques/notas | `past.blockOutcomes/coachingNotes` | Últimos 2 outcomes, hasta 8 notas |
| Equipo/skills | `current.signals`, `future.daySignals` | Señales por fecha/entorno |
| Conocimiento deportivo | `trainingKnowledge`, referencias `options` | Catálogo de posibilidades, no sesión ya compuesta |

**ARCHITECTURAL GAP:** el Analyzer sí recibe su análisis completo, pero `planificar_semana` solo pasa `datos.analisis.strategyProposal`. Sus `tipo_semana`, objetivo consultivo, ratios 0.5/0.6 y cuatro días sugeridos no llegan como campos de consejo al Weekly Coach. No se debe confundir esto con la eliminación correcta de su antigua autoridad sobre dosis: es pérdida de contexto orientativo, no motivo para volver a imponer sus números.

## E. Where was fuerza_maxima selected?

Hay que separar tres decisiones:

1. `GOAL_DEMANDS.crossfit` introduce `fuerza_maxima` como PRIMARY de catálogo. `box_max_strength` admite patrones squat, hinge y horizontal_push. Es candidato, no selección de movimiento.
2. `buildCanonicalWeekStrategy` ordena por rol, debilidad y después preferencias del Analyzer. Las preferencias SUPPORTING no saltan automáticamente por delante de todos los PRIMARY. Deload añade recuperación/técnica, conserva otras alternativas y marca reduce/reduce.
3. Weekly Coach elige un `optionId`; el servidor recupera exactamente su adaptación/método/patrón. Builder no puede cambiar ese intent sin invalidar la cadena firmada.

**BUG de proyección demostrado:** `humanWeeklyObjective` utiliza `strategy.coverage`, construida como cobertura factible recomendada antes de la selección. No recibe `proposal.selected` ni las prioridades explicativas del Coach. `admittedWeekObjective` vuelve a producir ese mismo texto al guardar. Una prueba elige exclusivamente gimnásticos y el objetivo visible todavía incluye fuerza máxima.

Por ello, el encabezado «Fuerza máxima como prioridad» procede de código/cobertura recomendada y no demuestra la prioridad razonada de esa semana. El ejemplo de sesión confirmado **sí** acredita un intent de fuerza máxima en al menos una sesión. Sin los `optionId` y razones de cada día, no se afirma que Weekly pidiera tres horizontal_push. No se ha encontrado fallback que sustituya silenciosamente otra selección por fuerza máxima: propuestas inválidas se rechazan o reintentan.

## F. Where did bench_press first appear?

En el pipeline, `bench_press` puede aparecer primero como candidato de catálogo/pool de `fuerza_maxima`. Weekly selecciona adaptación/método/patrón, no un movimiento. La primera **elección prescriptiva** de bench es la propuesta JSON del Session Coach (o una propuesta de reparación posterior). Renderer resuelve lo admitido; no sustituye otro movimiento por bench.

| Día Box | Weekly intent / adaptación / método / patrón | Pool y exposición suministrados | Propuesta → validación → resolución → render |
|---|---|---|---|
| martes | TRAIN; detalle UNKNOWN | UNKNOWN en el run | Builder `ok`; movimiento por día no aportado |
| jueves | TRAIN; detalle UNKNOWN | UNKNOWN en el run | Builder `ok`; movimiento por día no aportado |
| viernes | REST en este run | No hubo Builder | No corresponde |
| sábado | TRAIN; detalle UNKNOWN | UNKNOWN en el run | Builder `ok`; movimiento por día no aportado |
| Ejemplo sin día identificado | fuerza_maxima / box_max_strength / horizontal_push | Pool exacto UNKNOWN | Bench reportado; dosis indicada en la evidencia |

No puede concluirse «pool solo bench» ni «restricciones eliminaron toda halterofilia/gimnasia/pierna/tirón» sin el contrato real. La autoridad generativa sí se adjunta incondicionalmente en `generateTrainingSession` antes del modelo en HEAD; las variantes no amplían por sí solas un intent ni eliminan restricciones. Su configuración efectiva histórica necesita el diagnóstico/contrato de ese run.

## G. Why was bench repeated?

**ARCHITECTURAL GAP confirmado y candidato causal de repetición; elección deportiva histórica UNKNOWN.**

Los Builders de martes/jueves/sábado ven el mismo historial previo a su guardado. No hay una reserva o proyección de los movimientos que generan las otras llamadas. Además, sus vecinos inmediatos son REST en los tres casos: lunes/miércoles, miércoles/viernes, viernes/domingo. El resumen de vecinos no permite saber que los otros días no adyacentes también tienen fuerza máxima/horizontal_push.

La reproducción genera tres propuestas bench mediante respuestas controladas y las tres superan sus autoridades individuales con historia vacía. Eso demuestra independencia, **no que un LLM real tenga que elegir bench**, ni aceptación whole-week de tres copias exactas.

Los controles actuales favorecen conocer candidatos y evitar copia textual previa, pero no coordinan la elección de movimientos simultánea. Añadir una prohibición de bench, cuotas de patrones o una plantilla CrossFit ocultaría este hueco de información.

## H. Was current-week exposure visible?

Se entregan dos proyecciones históricas diferentes:

- `prepareSessionTrainingContext`: últimas cuatro filas semanales, sesiones con `completada` y `descripcion_real`. Su campo `fecha` usa **el nombre de día** (`s.dia`), por lo que `ultimaFecha` de esta proyección no es una fecha civil fiable. Esto es un BUG de representación histórica, no prueba de ausencia real de exposición.
- `loadAthletePrescriptionContext`: últimas cuatro filas con `week_start <= asOfDate`, fechas civiles derivadas, exposición textual de completadas con reporte. La historia de prescripciones sí conserva planned/performed por separado. La lectura puede incluir lo ya guardado/completado de la semana actual, pero no las propuestas simultáneas en memoria de una semana futura.

| Dimensión pedida para bench | Lo que existe y llega en HEAD | Valor del run real |
|---|---|---|
| Movimiento exacto | Matching textual; `exposiciones`, `rankedCandidates.recentExposures` | UNKNOWN |
| Familia canónica | Agregación estructurada de variantes en whole-week/carga; no ledger histórico equivalente en este input | UNKNOWN/no proyectado como agregado histórico |
| Patrón | Catálogo + exposición proyectada en Weekly; whole-week cuenta patrones estructurados | UNKNOWN |
| Modalidad | Analyzer agrega por modalidad desde su historial; no métrica equivalente completa en Session | UNKNOWN |
| Última exposición | `ultimaFecha` en reporte; proyección de Session tiene el defecto de nombre de día | UNKNOWN |
| 7 días / 28 días exactos | Disponibles para ciertas vistas de carrera; **no** conteos exactos de bench | No disponibles como tales |
| Semana nueva en construcción | No se incorporan movimientos de llamadas hermanas | Ausente por diseño de transporte |
| Actual performed | Reportes/completadas; no se sustituye por dosis prescrita | No aportado para este run |

El ranking por menor exposición sigue conectado a factibilidad y se incluye en el contrato. `allowedMovementIds` se ordena alfabéticamente; `rankedCandidates` conserva el ranking separado. No hay un módulo único denominado «Variability model» conectado a esta ruta: hay ranking, historial, duplicación individual, integridad UI y whole-week con alcances distintos.

El matching textual de los nombres no equivale a evidencia estructurada de ejecución y puede perder denominaciones traducidas, reportes incompletos o variantes. Cuatro filas de weekly_plan tampoco equivalen siempre a 28 días exactos. Estos límites están declarados en el loader; tener tests de Exposure no demuestra que el bench de AIRAN fuera detectado.

## I. Is Session generation parallel/independent?

**Sí.** `app/FormaPro.tsx:1048` usa `Promise.all(diasAConstruir.map(...))`. Cada petición lleva `diaAnterior/diaSiguiente` de la estructura anterior a Builder, no los resultados de sus hermanos.

En backend, `sessionAuthority.ts:77` verifica el receipt, toma la estrategia completa recomendada y reduce los vecinos firmados a `{day, adaptationId, state}`. No transporta todos los `admittedSlots` ni patrones/movimientos/dosis de la semana entera en `doseContext`. El receipt que contiene esos slots no se entrega como tal al modelo. La historia se vuelve a leer de la DB antes de que exista el ensamblado.

El test de UI real registra tres peticiones en vuelo antes de resolver cualquiera. El test de Session real confirma tres contextos históricos iguales y vecinos REST. Una mera secuencialización de las peticiones sin pasar sus resultados no arreglaría el problema: los Builders siguen leyendo la DB y la semana se guarda al final.

## J. What did whole-week validation know?

`WEEK INTEGRITY` de la consola es `validarIntegridadSemana` del cliente. Comprueba disponibilidad y concentración de `debilidad_relacionada` por encima de tres días. No compara bench, patrones ni dosis. Puede devolver cero violaciones para sesiones esencialmente iguales sin atribución a una debilidad; la reproducción lo confirma.

La validación de servidor es otra capa:

| Control de servidor | Resultado actual |
|---|---|
| Copia exacta estructurada | `WEEK_EXACT_DUPLICATE`: ERROR si alguna no está protegida; incluye movimiento, estructura, estímulo, dosis, intensidad, adaptación y rol |
| Casi duplicada | WARNING cuando comparten movimiento/estímulo/adaptación/rol/intensidad y cambia dosis |
| Mismo movimiento con otro contexto | INFO `WEEK_PURPOSEFUL_REPETITION`; no demuestra que fuera intencional para el Coach |
| Patrón concentrado | INFO ≥3 exposiciones y WARNING en tres fechas consecutivas |
| Estímulo/estructura concentrados | INFO ≥3; sin cuota universal |
| Cobertura/adaptaciones faltantes | WARNING con autoridad semanal Coach |
| Modalidad | No hay cuota de modalidades ni blocker anti-Box |
| Interferencia/carga externa | Advertencias con evidencia limitada; no inferencia de sobrecarga universal |

**ARCHITECTURAL GAP de feedback:** `enforceWholeWeek` termina si `status==='pass'`, y `pass` solo depende de ausencia de ERROR. Las advertencias no se envían al Coach para reevaluar o justificar. Sibling proposals completas sí se envían en la ruta de reparación, pero únicamente cuando errores reparables activan esa ruta. Las razones del Weekly Coach se devuelven como `coachingDecisions`/diagnóstico; no forman parte del receipt ni del objetivo visible.

Una prueba con tres bench y dosis distintas produce WARNING/INFO, pasa y realiza cero llamadas de revisión. Al igualar las dosis, el validador exige reparación. Por tanto, si el plan real guardó copias **exactas**, haría falta investigar el resultado de whole-week/repair y la fila final: el `valido=true` del cliente no demuestra que el servidor haya aprobado copias exactas. Si eran solo esencialmente similares, pasar con advertencias encaja con HEAD.

## K. Duplicate dispatch root cause

**Duplicación efectiva del incidente: UNKNOWN. Reentrada legítima: reproducida.**

`ORCHESTRATOR: INICIO` se imprime antes de comprobar la continuación/preflight. Al pedir resolver un evento se conserva `weeklyPlanningContinuationRef`; `continuarTrasResolucionEvento` vuelve a invocar la función. Dos INICIO pueden compartir un run y ejecutar solo una vez Analyzer, Planner y guardado. El evento confirmado durante la sesión hace plausible esta secuencia; su timestamp no demuestra que esa fuera exactamente la causa.

El test AST reproduce dos INICIO y un solo Analyzer/guardado. La traza aportada solo contiene un grupo de tres Builders con un run; no prueba doble orchestration efectiva.

Para la pregunta idéntica hay varias rutas observables: `dispararGeneracion` pregunta disponibilidad; `apiCall` pinta requisitos de preflight; la respuesta de corrección puede volver a preguntar; un digest cambiado exige reconfirmación aunque la proyección visible sea igual. No se ha demostrado cuál ocurrió. `generandoSemana` es estado React, no una exclusión síncrona compartida para todas las entradas, y `apiCall` permite hasta tres intentos en varias acciones; esos son riesgos, no la causa probada del incidente.

No se ha añadido debounce, mutex ni parche de doble envío. Hace falta correlacionar INICIO, preflight, acciones HTTP, continuación por evento y token/run. Un log de INICIO no equivale a un request HTTP ni a una escritura.

## L. Fixes applied, if any

**Ningún cambio de código productivo.** Se han añadido nueve pruebas de caracterización y este informe. Primero se localiza la degradación, como se solicitó. Los tests no afirman que los huecos queden corregidos ni fijan una política «no bench repetido».

Contratos que hay que resolver antes de un parche técnico:

| ROOT CAUSE | EXPECTED CONTRACT | ACTUAL CONTRACT | MINIMAL FIX propuesto, no aplicado |
|---|---|---|---|
| Copia circular de bloque/contador | El bloque nuevo tiene una decisión de autoridad identificable y target coherente | Plan copiado del ciclo anterior; transición lo recicla | Separar transición longitudinal autorizada y proyección de metadatos; no elegir un nuevo bloque por una regla deportiva inventada |
| Contador previo en plan | Ciclo/plan/intent del target se refieren a la misma semana | Ciclo se incrementa después, plan sigue con contador previo | Resolver target de ciclo antes de composición, con idempotencia por semana y sin avance por regeneración |
| Objetivo visible usa recomendaciones | Describir las selecciones reales y su prioridad declarada | Render desde cobertura previa | Proyección basada en slots/decisiones admitidas, manteniendo los límites firmados |
| Consejos Analyzer perdidos | Si se usa Analyzer, transportar su consejo sin otorgarle autoridad | Solo llega preferredAdaptations al Planner | Campo advisory acotado con procedencia, separado de hechos/contrato ejecutable |
| Contexto intra-week insuficiente | Coach conoce todas las decisiones relevantes de esa semana | Vecinos inmediatos, sin movimientos hermanos | Transportar proyección whole-week autenticada; si se secuencia, transportar también resultados admitidos, no solo esperar |
| Warnings no llegan a Coach | Advertencias útiles pueden informar una decisión deportiva | Pass con WARNING/INFO no genera revisión | Revisión consultiva acotada, sin convertir variedad en hard blocker; alcance por definir |
| Fecha de exposición es día textual | Última exposición es fecha civil con procedencia | `fecha=s.dia` en un adaptador | Reutilizar fechas civiles de la proyección compartida; no promover planned a performed |

No se aplica una corrección parcial del ciclo que cambie únicamente la etiqueta: ocultaría que el Coach sigue recibiendo la fase/semana anterior. Tampoco se corrige una duplicación de HTTP que aún no se ha demostrado.

## M. Remaining sports-quality issues

La elección de fuerza máxima durante deload no es por sí sola un bug. En HEAD, deload significa fase factual más intención cualitativa de reducir volumen/intensidad; no significa «solo técnica». Los ratios 0.5/0.6 llegan a Session como `requestContext.analysis` consultivo, pero no al Weekly Coach. No se imponen ni se recalculan. La dosis RPE6–7 tampoco demuestra por sí sola violación de una descarga sin referencia longitudinal comparable.

La valoración de tres exposiciones de bench requiere los intents, menús, razones, restricciones, material, ejecución anterior y resultado whole-week reales. Siguen UNKNOWN. El defecto de contexto y el de objetivo visible pueden degradar calidad sin que el código esté sustituyendo una decisión deportiva por bench.

Clasificación final de hallazgos: ciclo/metadatos/objetivo visible/fecha textual = BUG reproducible; coordinación intra-week/feedback de warnings/consejo Analyzer = ARCHITECTURAL GAP; selección de bench y cero carrera con menús adecuados = posible COACHING QUALITY; REST permitido y no avance al regenerar = EXPECTED BEHAVIOR; timeline productivo y doble dispatch real = UNKNOWN.

## N. Tests

`lib/planning/productionPlanningAudit.test.mjs` ejecuta nueve casos focalizados, todos correctos: reciclaje deload 1/1, desfase contador de plan/ciclo, opciones carrera factibles, eliminación previa por restricciones, objetivo de cobertura frente a selección distinta, contexto de tres Session Coaches, paralelismo/reentrada de UI, integridad/whole-week y consejo Analyzer no transportado.

Son reproducciones de HEAD: un test correcto aquí puede demostrar un defecto existente. **No constituyen tests verdes de un arreglo inexistente.** Los primeros ajustes del fixture corrigieron una expresión sensible a mayúsculas y el retorno `maybeSingle` del fake DB; no se cambió código productivo para hacerlos pasar.

Validación final:

- Focused: `node --test lib/planning/productionPlanningAudit.test.mjs` — **9/9**, sin fallos.
- Suite completa: todos los archivos `*.test.mjs` y `*.test.cjs`, con `node --test --test-concurrency=4` — **2306/2306**, sin fallos, cancelaciones ni omisiones; 289799 ms.
- TypeScript: `node node_modules/typescript/bin/tsc --noEmit --incremental false` — exit 0.
- Diff check: `git -c core.safecrlf=false diff --check` — sin errores. Se comprueban también los dos archivos nuevos contra el archivo vacío porque aún no están en el índice.

## O. Production acceptance procedure

Primero completar la lectura del incidente, sin generar ni cambiar datos:

1. Filtrar `weekly_plan`, closure/generation logs y outcomes por atleta `060385` y horizonte reciente. Proyectar solo fechas, bloque, semana/duración, revisión, estados e IDs de movimiento necesarios. Mantener contenido clínico y conversación fuera del informe compartido.
2. Localizar logs del run `c8d9d91c-9b30-4710-babe-dd45ca9fdd1f`. Recuperar selecciones y razones, pool/exclusiones por día y `wholeWeekValidation`/repair de la respuesta. No usar el timestamp del evento como inicio del run.
3. Comparar la estructura previa a Builder, respuestas admitidas, ensamblado, respuesta de guardado y fila final. Verificar viernes REST y las tres sesiones, antes de hablar de cuatro.
4. Para duplicación, correlacionar acciones de red de una interacción con `planningRunId`, target y continuidad de evento. Contar Analyzer/Planner/save efectivos, no solo INICIO ni retries de proveedor.

En una futura generación autorizada, reutilizar los diagnósticos existentes:

| Necesidad | Instrumentación existente / limitación |
|---|---|
| Weekly input/options | `FORGE_WEEKLY_COACHING_DIAGNOSTICS=1`: `WEEKLY_COACHING_INPUT` y diagnóstico de factibilidad del contrato; `WEEKLY_DOSE_CANDIDATE_REJECTIONS` informa rechazos de dosis; no constituyen un snapshot íntegro histórico |
| Weekly decisiones | `WEEKLY_COACHING_SELECTION`, `WEEKLY_STRATEGY_DIAGNOSTIC`, respuesta `coachingDecisions` |
| Session/pool/propuesta | `FORGE_SESSION_COACHING_DIAGNOSTICS=1`: `SESSION_COACH_INPUT`, `SESSION_MOVEMENT_COACH_INPUT`, `SESSION_COACH_DECISION`, `SESSION_MOVEMENT_PROPOSAL` |
| Movimiento resuelto/admisión | `MOVEMENT_RESOLUTION`, `MOVEMENT_FEASIBILITY`, `SESSION_MOVEMENT_ADMISSION` |
| Correlación/etapas | `ORCHESTRATOR_PRESERVATION`, `ORCHESTRATOR_BUILDER_TARGETS`, resultados Builder con run, `BUILDER_*` según configuración existente |
| Whole-week | Respuesta `wholeWeekValidation`, `repairOrchestration`; no hay revisión de advertencias al pasar |
| Block state input/output | Faltan eventos acotados equivalentes completos; contrastar proyección de ciclo antes/después mediante lectura. No activar logs de perfil/prompt crudo para suplirlo |
| Exposición exacta del incidente | Diagnósticos existentes no bastan para todos los campos pedidos; capturar una proyección acotada de contadores/procedencia, no texto clínico libre |

No se han activado flags de producción ni añadido logging. Varios diagnósticos de movimiento actuales carecen de run/day en el propio evento: correlacionarlos por petición, no por proximidad en un log concurrente. Las líneas legacy del cliente que imprimen plan/análisis completos no son el formato recomendado para compartir evidencia. No exportar tokens, receipts completos, prompts, perfiles ni conversación; conservar códigos, fechas, estados, IDs y razones deportivas mínimas revisadas.

La aceptación posterior a un arreglo deberá demostrar: progresión idempotente con fase/semana coherentes, menús carrera cuando sean factibles, contexto whole-week recibido por cada Builder y una sola orchestration efectiva por acción/continuación. La prueba no debe exigir una frecuencia fija de carrera ni prohibir tres bench por definición.

| Área | Estado respaldado |
|---|---|
| PERIODIZATION PROGRESSION | **BROKEN** en los casos reproducidos de reciclaje/desfase; historial real de AIRAN aún no leído |
| WEEKLY COACH DISTRIBUTION | **UNKNOWN** para el menú/razón del run; pérdida de consejo Analyzer y proyección de objetivo demostradas |
| SESSION VARIETY | **CONTEXT BROKEN** para coordinación de movimientos de la semana en construcción |
| DUPLICATE DISPATCH | **UNKNOWN** para duplicación efectiva; reentrada sin doble generación **DIAGNOSED** y reproducida localmente |

No hay estados FIXED ni PROVEN IN PRODUCTION en esta auditoría. No commit, push, deploy, migraciones ni modificaciones de datos reales.
