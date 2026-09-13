# Coach freedom / authority audit

Fecha: 2026-09-13. Base local: `cee2438` — `fix(planning): restore longitudinal and whole-week coherence`.

Auditoría de código y caracterización aislada. No se modifican autoridades de producción. Antecedentes: `production-planning-regression-audit.md` y `planning-coherence-repair.md`. Este informe distingue evidencia aportada del run, comportamiento probado localmente y causas todavía desconocidas.

## A. Executive finding

**Sí: una posibilidad puede desaparecer antes del Weekly Coach por ausencia de método registrado o mapping, aunque Forge conserve medios para representar trabajo del estímulo.** El Weekly actual selecciona `optionId` de una lista finita. Cada opción estratégica ya fija adaptación, método, patrón, disciplina y estímulo. `methodId` es descripción semántica y requisito de autorización simultáneamente.

Hay dos problemas demostrados, independientes:

1. Cierre del espacio deportivo: `TRANSFER_METHODS → strategicIntents → feasibility → dayOptions`. Ni el Weekly ni las variantes del Session pueden recuperar una adaptación que no obtuvo tuplas antes del Coach.
2. Sobreprotección de planes futuros: con snapshot y `today < targetWeekStart`, `activeRegeneration` es falso. Un REST existente se protege aunque sea futuro y no completado. La reproducción del cargador protege exactamente lunes, miércoles, viernes y domingo usando 2026-09-13 / 2026-09-14; al entrar en la semana libera esos mismos REST.

**No está demostrado que los siete rechazos del run real se debieran a métodos ausentes.** Las ocho adaptaciones, incluida fuerza máxima, tienen métodos en el catálogo de esta base. Con hechos sintéticos permisivos todas llegan al Weekly. El agregado `no_feasible_managed_method` indica ausencia de opciones que cubran una adaptación, sin identificar qué filtro produjo esa ausencia. No prueba incapacidad deportiva del atleta.

El estado de la semana AIRAN queda **PARTIALLY PROVEN**: cierre arquitectónico, efecto del diagnóstico y condición de preservación probados; eliminación concreta por método y causa de las dos selecciones bench pendientes de evidencia del run.

## B. Production incident reconstruction

| Dato | Evidencia conservada |
| --- | --- |
| Atleta | `060385` |
| planningRunId | `068ee0dc-af2b-48c5-9492-7cb3c54ba5c1` |
| weekStart | `2026-09-14` |
| Generación observada | `2026-09-13`; sin timestamp exacto de inicio |
| Adaptaciones PRIMARY | potencia, gimnasticos, fuerza_maxima, capacidad_glucolitica, recuperacion_activa |
| SUPPORTING | halterofilia_tecnica, base_aerobica |
| Diferidas | Las siete indicadas en D, todas con `no_feasible_managed_method` |
| Resultado | martes y jueves TRAIN / fuerza_maxima / box_max_strength; sábado REST; ambos Builders bench |
| Preservación | lunes, miércoles, viernes y domingo protected REST; `completedDays=[]` |
| Goal | Un candidato de `usuarios.objetivo_principal`, no reconocido; estrategia crossfit desde declared_sport, admitted=true |

No se conserva el contenido literal de `usuarios.objetivo_principal` ni el diagnóstico por método. No se reconstruyen. La comprobación local de disponibilidad de credenciales devolvió `supabaseReadConfigured:false`; no hubo lectura de filas reales ni llamadas al proveedor LLM. Las fixtures no representan el inventario, restricciones o capacidades de AIRAN.

No se mezclan estas trazas con el run anterior `c8d9d91c-9b30-4710-babe-dd45ca9fdd1f`. Tampoco se atribuye a este run el timestamp de confirmación de evento del incidente anterior.

### Pipeline exacto

Rutas relativas a la raíz del repositorio; funciones indicadas para localizar la evidencia sin depender de números de línea cambiantes.

| Transición / código | INPUT | OUTPUT | FILTER | AUTHORITY actual | REASON FOR REJECTION |
| --- | --- | --- | --- | --- | --- |
| `athlete/goalResolution.ts`, `strategyResolution.ts` | Candidatos de objetivo, especialidad, distancia estructurada | Goal y estrategia independientes | Alias canónicos; fallback evento/deporte; conflictos | Hechos de perfil + conocimiento del adaptador | GOAL_UNSUPPORTED no impide por sí solo STRATEGY_RESOLVED; sin estrategia admisible se detiene planificación |
| `planning/canonicalWeekStrategy.ts`, `buildCanonicalWeekStrategy` | Estrategia, ciclo canónico, scope, desarrollo, preferencias | Adaptaciones, roles, métodos | GOAL_DEMANDS finito; intersección de disciplinas; métodos CONDITIONAL solo crossfit/hyrox | Conocimiento deportivo y política tratados parcialmente como permiso | Sin demanda/método compatible no hay candidato; preferencias nuevas rechazadas |
| Mismo módulo, `strategicIntents` | Estrategia, disciplina, estímulo | Tuplas adaptación/método/patrón | Registro, pertenencia a strategy.methods y match de estímulo | Allowlist positiva | Método ausente: ninguna tupla; no se emite una propuesta abierta |
| `planning/prepareAllowedWeeklyPlanContract.ts`, `loadWeeklyPlanningContext` | Snapshot, fecha, disponibilidad, ownership, restricciones | Contextos, fixed, señales por día, capacidades de dosis | Protección, indisponibilidad, contexto externo | Mezcla factual/política temporal | Fixed sustituye completamente las opciones del día; contexto inválido detiene contrato |
| `planning/authorizedMethodCandidates.ts`, `resolveAuthorizedMethodCandidates` | Tuplas + contexto por disciplina/día | Opciones, rejected, doseUnavailable | Día autorizado; gate de dosis si hay entry; feasibility | Hechos + representación + registros | Día fuera de disponibilidad no se evalúa; dosis no QUANTIFIABLE/prescriptionAllowed=false se descarta; contexto irresuelto aborta |
| `sports/trainingFeasibility.ts` | Intent, estímulo, restricciones, señales, bibliotecas | Pools, feasible/resolved/errors | Movimiento suitable_for/disciplina/patrón, restricciones, suficiencia; mapping de estructuras y cardinalidad | Negativos legítimos mezclados con conocimiento incompleto | MOVEMENT_POOL_EMPTY, INTENT_POOL_EMPTY, STRUCTURE_POOL_EMPTY, STRUCTURE_SPACE_UNSATISFIABLE; errores de contexto separados |
| `planning/allowedWeeklyPlanContract.ts`, `buildAllowedWeeklyPlanContract` | Opciones por día + fixed | AllowedWeeklyPlanContract | IDs finitos; viabilidad de calendario; reglas de evento cuando aplican | Contrato vinculante | Sin arreglo válido falla contrato; en estrategia reconocida no hay fallback genérico |
| Mismo módulo, `bindStrategicCoverage` | Opciones ya producidas + grupos estratégicos | coverage/deferred explicativos | Existe alguna opción que cubra grupo y cabe en calendario | Diagnóstico, cobertura advisory en modo Coach | Sin opción: no_feasible_managed_method; con opción pero sin arreglo conjunto: weekly_capacity_or_availability_conflict |
| Mismo módulo, `weeklyPlannerPrompt`, `validateWeeklySelection` | Contrato serializado y contexto de coaching | Una selección por día + justificación | optionId debe existir exactamente; digest, esquema y frecuencia | Allowlist positiva vinculante | WEEKLY_OPTION_NOT_ALLOWED; no puede introducir otra tupla |

Prefijos de los módulos de la tabla: `lib/`. El orden de construcción de estrategia/contextos precede la enumeración; la protección opera por día antes de llamar al resolvedor de candidatos.

## C. Positive allowlists currently acting as authority

Clases: **A** HARD FACT; **B** HARD SAFETY/RESTRICTION; **C** TECHNICAL REPRESENTATION; **D** REFERENCE REQUIREMENT; **E** EQUIPMENT/CAPABILITY; **F** SPORT KNOWLEDGE; **G** PRODUCT POLICY; **H** COACHING DECISION. Una fila con varias clases debe separar sus partes en la futura reparación, no eliminarse indiscriminadamente.

| Filtro / frontera actual | Clase | Tratamiento objetivo |
| --- | --- | --- |
| Identidad, scope, propiedad y disciplina delegada | A | KEEP HARD: no ampliar autoridad sobre actividad externa |
| Lista literal box/carrera en shared feasibility/calendar | C/F | CONVERT TO VALIDATION AFTER COACH mediante adaptador declarado; no convertir dominios iniciales en universo deportivo |
| GOAL_DEMANDS como única fuente de adaptaciones | F/H | ADVISORY; REMOVE AS PRE-FILTER de posibilidad deportiva |
| normalizeStrategyProposal limita preferencias a demandas conocidas | C/F/H | Mantener esquema válido; REMOVE AS PRE-FILTER de intenciones semánticamente resolubles |
| Métodos de TRANSFER_METHODS y sus patrones/estímulos | C/F/H | CONVERT TO VALIDATION AFTER COACH; registro aporta conocimiento, no permiso por pertenencia |
| Métodos CONDITIONAL restringidos por goal | F | ADVISORY sobre transferencia; no inferir equivalencia ni imposibilidad universal |
| Weakness requiredPattern | F/H | En modo Coach ya no excluye otros patrones; mantener contextual, sin convertir debilidad en monopolio |
| Día fuera de disponibilidad / acceso temporal denegado | A | KEEP HARD |
| Fixed por completado/pasado/externo/alcance explícito | A/G | KEEP HARD la inmutabilidad fundada; corregir protección automática de futuro |
| doseCapabilities.prescriptionAllowed / QUANTIFIABLE | A/C/D/F/G | Descomponer razones; KEEP HARD conflictos y expresión no sustentada; REMOVE AS PRE-FILTER ausencia de política deportiva |
| Registro running y familia compatibles antes de rama coach | C/F/G | CONVERT TO VALIDATION AFTER COACH; ausencia de registro no equivale a incapacidad |
| Running event method allowlist y requisitos D3 de calidad/largo | A/F/G/H | Conservar verdad del evento; revisar reglas deportivas como ADVISORY o validación justificada de propuesta. No causa CrossFit demostrada |
| STIMULUS_LIBRARY por disciplina | C/F | Vocabulario y resolución explícitos; CONVERT TO VALIDATION AFTER COACH la pertenencia deportiva |
| MOVEMENT_LIBRARY.discipline / suitable_for | F/C | ADVISORY de compatibilidad + resolución posterior; ausencia de etiqueta no prueba incompatibilidad |
| Excluir movimiento explícitamente prohibido / avoid_with / flags activos | B | KEEP HARD si la incompatibilidad está resuelta y vigente |
| Semántica biomecánica desconocida bajo restricción activa | B/C | KEEP HARD la exigencia de poder validar seguridad; conservar motivo UNKNOWN, no afirmar contraindicación probada |
| Equipo/skill conocido ausente | E/A | KEEP HARD para propuesta que lo requiere |
| Equipo/skill desconocido convertido en missing_required_data y removido del pool | E | CONVERT TO VALIDATION AFTER COACH o aclaración previa pertinente; no descartar toda adaptación ni declarar FALSE |
| Patrón principal exige al menos un movimiento canónico del pool | C/F/H | CONVERT TO VALIDATION AFTER COACH, incluyendo semántica de variantes |
| STRUCTURES_BY_STIMULUS y disciplina de estructura | C/F | REMOVE AS PRE-FILTER de posibilidad; validar estructura propuesta |
| Cardinalidad couplet/triplet y reglas de formato | C | CONVERT TO VALIDATION AFTER COACH; KEEP HARD validez representacional del resultado |
| Tiempo máximo verificado | A | KEEP HARD; comprobar la dosis concreta, no duraciones típicas de catálogo |
| Referencia numérica requerida por expresión elegida | D/A | KEEP HARD después de propuesta; RPE no requiere inventar 1RM |
| Frecuencia máxima, mínimo una ejecutable y REST genuino cuando aplica | G, con parte A si hay límite declarado | Son políticas globales vinculantes, no incapacidad fisiológica individual; revisar explícitamente producto. No añadir cuotas de adaptación |
| Unicidad de fixedPrescriptionKey, fresh selection en regeneración | G/C | Mantener integridad de contratos antiguos y resultado de regeneración; no presentar repetición como contraindicación deportiva |
| Selección obligatoria de optionId preenumerado | C/H | REMOVE AS PRE-FILTER; sustituir por propuesta serializable validada |

No hay filtro por falta de exposición reciente en `rankearCandidatos`: ordena por exposición, no recorta el pool. No hay una cuota que fuerce cuatro días del Analyzer. `coverage` y roles son advisory en modo Coach; **los IDs siguen siendo vinculantes**. La desaparición no debe atribuirse a cobertura obligatoria que ya fue retirada.

## D. `no_feasible_managed_method` causal chain

Una única expresión de producción emite este literal: `bindStrategicCoverage` en `lib/planning/allowedWeeklyPlanContract.ts`. Se aplica tanto a grupos de adaptación no OPTIONAL como a grupos de entorno preferido. `covers` exige intención estratégica exacta o transferencia EQUIVALENT; no basta compartir un movimiento. Un conflicto de cobertura entre opciones existentes produce otro motivo.

La expresión **no borra métodos**: observa el resultado de las etapas anteriores. Rutas hacia cero opciones:

1. No hay método registrado para una adaptación, o la intersección scope/estímulo/método produce cero tuplas.
2. Ningún día autorizado queda disponible para enumerarlas, incluidos días fijados previamente como REST.
3. Cada entry de dosis aplicable deniega la prescripción o no resulta QUANTIFIABLE. Se registra en doseUnavailable y no llega a feasibility.
4. Todas las tuplas evaluadas resultan resueltas pero inviables por pools de movimientos, patrón, suficiencia o estructuras.
5. No existe alternativa de transferencia que produzca cobertura exacta/equivalente. `METHOD_TRANSFER_RELATIONS=[]` en esta base; además no existe productor actual de permisos crossTraining. No se debe inventar equivalencia entre deportes para llenar el hueco.

Un input malformado, una restricción sin resolver o una intención inválida puede devolver `resolved:false` y abortar el contrato entero. Eso no equivale a la ruta normal de un contrato exitoso con siete diferidas. Debe diferenciarse al investigar rechazos.

`buildDoseCapabilityProfile` enumera las políticas running, no todos los métodos box. El resolvedor solo aplica el gate cuando encuentra una entry para método/patrón. Por tanto, no atribuir a una falta de plantilla de dosis running la desaparición de box_weightlifting, box_gymnastics o box_mixed. En modo Coach, un fallo al construir el pool running se deja para feasibility en vez de etiquetarlo automáticamente como falta de dosis; si el pool se construye pero la autoridad de intensidad queda irresuelta, sí puede aparecer `DOSE_INTENSITY_UNRESOLVED`.

Hay además una limitación observacional: `WEEKLY_TRANSFER_CANDIDATE_DETAIL` retorna sin emitir cuando `METHOD_TRANSFER_RELATIONS` está vacío, como en esta base. Los rechazos de dosis salen por una colección distinta de los rechazos de feasibility; la omisión por scope/día o por falta de tupla puede ocurrir sin entrar en ninguno de esos filtros. Un diagnóstico futuro debe registrar también «no enumerado» y no limitarse a instrumentar feasible=false.

### Matriz del run y candidatos concretos del código

La columna «candidatos» enumera el catálogo **antes de aplicar los hechos desconocidos del run**; no afirma que todos entraran en su scope. Fuente común: `lib/sports/goalTransferModel.ts`, `TRANSFER_METHODS`. «No llega» significa ninguna opción que cubra esa adaptación según el agregado conservado, no que el nombre desaparezca del texto advisory que ve el Coach.

| Adaptación | Fuente / disponible antes del filtro de métodos | Candidatos: disciplina / patrón | Después / llegó al Weekly | Dónde y por qué se eliminó cada candidato en el run | Bloqueo factual / gap de representación / política |
| --- | --- | --- | --- | --- | --- |
| potencia | GOAL_DEMANDS.crossfit / sí | box_power: box / jump, olympic_lift; runner_power: carrera / jump, run | Cero cobertura / no | UNKNOWN para ambos; posibles etapas 1–4 anteriores, sin trazas para elegir | Los tres UNKNOWN; métodos presentes |
| gimnasticos | GOAL_DEMANDS.crossfit / sí | box_gymnastics: box / vertical_pull, vertical_push, inverted_locomotion | Cero / no | UNKNOWN; candidato registrado, no se conserva su factibilidad por patrón | UNKNOWN; no ausencia literal de método |
| fuerza_maxima | GOAL_DEMANDS.crossfit / sí | box_max_strength: box / squat, hinge, horizontal_push | box_max_strength sí, martes y jueves | No se eliminó el método; supervivencia/descarte por patrón UNKNOWN | Bench no demuestra que squat/hinge fueran opciones ni que estuvieran prohibidos |
| capacidad_glucolitica | GOAL_DEMANDS.crossfit / sí | box_mixed: box / cyclic, squat, jump | Cero / no | UNKNOWN por patrón | UNKNOWN; método presente |
| recuperacion_activa | Adición por fase deload en estrategia / sí en diagnóstico | running_recovery: carrera / run | Cero / no | UNKNOWN; scope/días carrera, dosis y pool no conservados | UNKNOWN; no demostrar recuperación imposible por falta de método box |
| halterofilia_tecnica | GOAL_DEMANDS.crossfit / sí | box_weightlifting: box / olympic_lift | Cero / no | UNKNOWN; restricciones, equipo, skill o representación posibles, no observados | UNKNOWN; método presente |
| base_aerobica | GOAL_DEMANDS.crossfit / sí | running_base y running_long_run: carrera / run; box_aerobic: box / cyclic, estímulo capacidad_aerobica | Cero / no | UNKNOWN para los tres; CONDITIONAL de box_aerobic sí admite crossfit | UNKNOWN; no inferir falta de running ni de referencia |
| tecnica | Adición por fase deload, MAINTENANCE / presente entre diferidas | box_technique: box / squat | Cero / no | UNKNOWN; método registrado con patrón único | UNKNOWN; diseño actual estrecho, eliminación real no identificada |

Clasificación causal de ausencias: método no registrado = conocimiento/representación incompletos; mapping vacío = representación/conocimiento; equipo conocido ausente = bloqueo factual de esa propuesta; equipo/skill desconocido = evidencia faltante; referencia ausente = bloquea solo expresión que la necesita; política de dosis ausente = hueco de política. Ninguna categoría debe convertirse sin más en «el atleta no puede entrenar esta adaptación».

**Límite de reconstrucción:** se han localizado los candidatos y todas las etapas capaces de descartarlos, pero no se puede asignar honestamente una función y razón específica a cada descarte real sin sus entradas o trazas. Un replay sintético que imite el resultado no recuperaría esas entradas. Este informe no rellena esos huecos por inferencia.

## E. Hard negative constraints

Permanecen autoritativos: identidad del atleta; ownership y scope; disponibilidad por fecha/entorno; prohibiciones y restricciones vigentes; equipo conocido ausente; capacidades explícitamente limitadas; referencias verificadas y su compatibilidad; cálculo numérico y unidades; techo temporal; esquema; sesiones realizadas y pasado; actividad externa; verdad de evento y fisiología; freshness, receipts y CAS.

Autoridades revisadas: `trainingFeasibility`, `movementRestrictionPolicy`, `prescriptionDataSufficiency`, `sessionDose`, `structuredSession`, `sessionAuthority`, `weeklyCalendarAuthority` y las fronteras de persistencia documentadas en la reparación previa. El cambio conceptual no concede al LLM autorización para cambiar datos, firmas o referencias.

**1RM ausente:** la suficiencia permite RPE si no hay referencia exacta; una propuesta que solicita %1RM sin referencia compatible no pasa. No usar un RM familiar para una variante generada: `referenceCompatibility` de variantes es null. Ni marcas ambiguas ni estimaciones se convierten en hechos verificados.

No se deduce de un flag no presente que el atleta carezca de restricciones: la autoridad exige snapshot canónico interpretable. UNKNOWN relevante para seguridad puede impedir admitir una propuesta concreta si no se puede verificarla, con razón diferenciada de incompatibilidad conocida.

## F. UNKNOWN vs FALSE violations

| MODULE | SIGNAL / UNKNOWN INPUT | CURRENT CONSEQUENCE | CORRECT CONSEQUENCE |
| --- | --- | --- | --- |
| canonicalWeekStrategy / strategicIntents | Método no catalogado | No tupla, ninguna opción estratégica | Conservar intención y resolver propuesta; falta de conocimiento no es incapacidad |
| trainingFeasibility / movementLibrary | suitable_for o identidad deportiva no cubierta | Pool vacío o estímulo unresolved | Separar identidad irresoluble de compatibilidad desconocida; resolver semántica propuesta |
| workoutStructureLibrary / feasibility | Mapping no existente | STRUCTURE_POOL_EMPTY; feasible=false | Validar estructura concreta representable, no exigir ejemplo previo del estímulo |
| prescriptionDataSufficiency → feasibility | Equipo/skill unknown/ambiguous | missing_required_data elimina movimiento; puede vaciar adaptación | Preservar UNKNOWN y aclarar requisito pertinente; no afirmar equipo ausente |
| lib/prescription/dataSufficiency.ts | Señales unknown frente a unavailable | Conserva estados y preguntas; ambos pueden producir missing_required_data | Mantener distinción también en consumidores y diagnósticos de planificación |
| movementRestrictionPolicy | Propiedad biomecánica desconocida con flag activo | allowed=false, con arrays unknown/incompatible distintos | No admitir si seguridad no verificable; conservar motivo UNKNOWN. No es el mismo error que método deportivo ausente |
| trainingFeasibility | Restricción libre o área irresoluble | resolved=false y puede abortar contrato | Pedir resolución de seguridad, no declarar todas las adaptaciones imposibles |
| prescriptionDataSufficiency / sessionDose | 1RM ausente | Fallback RPE posible; %1RM no sustentado falla | Correcto: separar entrenamiento de expresión numérica |
| movementVariants / structuredSession | Familia desconocida, modificador irresoluble, geometría sin evidencia bajo restricción | Rechazo de propuesta con motivo semántico | Identidad/esquema/seguridad verificables siguen requeridos; no inventar evidencia |
| runningMethodDoseAuthority | Método o familia no registrados | DOMAIN_UNSUPPORTED incluso antes de rama coach | Resolver semántica sin convertir hueco del registro en incapacidad |
| runningMethodDoseAuthority, rama coach | Falta target/template o historia compatible en método/familia admitidos | La resolución legacy se vuelve advisory; Coach elige dosis | Ya preserva libertad de dosis en esa rama; no atribuirle automáticamente el colapso |
| doseCapabilityProfile | Entry no QUANTIFIABLE | Prefiltro borra tupla; ausencia de entry no aplica ese gate | Descomponer datos, conflictos, política y representación; ausencia de entry tampoco acredita capacidad |
| sessionTimeDoseAuthority | Sin política temporal | UNRESOLVED con máximo factual conservado; no INFEASIBLE automático | Correcto: no hay mínimo deportivo inventado. Registro temporal actual vacío |
| goalResolution / strategyResolution | Objetivo no reconocido pero deporte reconocido | Goal unsupported y estrategia admitida | Conservar objetivo original y procedencia; no afirmar que todo su significado fue recuperado |

Resultado **MIXED**: el modelo de señales conserva estados; varios consumidores colapsan operativamente «no demostrado disponible» en «no opción». Otros caminos preservan UNKNOWN, permiten RPE o detienen por seguridad con motivo explícito.

## G. Weekly Coach option-space audit

El Coach recibe opciones con intent completo: `adaptationId`, `methodId`, `pattern`, `goalId`, rol y fase. Su respuesta selecciona `optionId`, no una nueva intención deportiva. `validateWeeklySelection` rechaza IDs nuevos o campos añadidos a la selección. El contrato es el mismo en los intentos acotados de composición; una justificación más convincente no crea nuevas opciones.

TRAIN/REST se elige solo donde ambas alternativas existen. Fixed deja una opción. En días abiertos se agrega REST y luego opciones ejecutables. La libertad de distribución y develop/maintain es real dentro de la lista, pero no puede rescatar potencia o halterofilia si la lista carece de ellas. Coverage y prioridades no son obligaciones en `weeklyDecisionAuthority:'coach'`.

En el run, las siete adaptaciones no tenían opciones de cobertura, aunque podían seguir apareciendo como deferred/advisory. Eso demuestra un espacio reducido respecto a la estrategia inicial. No demuestra que toda reducción fuera injustificada: faltan los bloqueadores factuales. El método superviviente admite tres patrones en catálogo; los dos bench no prueban un prefiltro exclusivo de bench ni justifican prohibir repetirlo. Sábado REST tampoco acredita un error por sí solo.

## H. Session Coach generative capacity

`lib/sports/sessionAuthority.ts` construye primero `AllowedTrainingContract`; después incorpora contexto de dosis Coach y vuelve a comprobar pools; solo tras éxito añade `generatedMovementAuthority`. `lib/sports/structuredSession.ts` valida propuestas con dosis elegida por el Coach, estructura, movimientos principales/accesorios, referencias, tiempo y restricciones.

| Intención deseada sin managed method | Capacidad representacional existente | Frontera que impide usarla actualmente |
| --- | --- | --- |
| halterofilia_tecnica | Movimientos de halterofilia, estructuras conocidas y dosis RPE; la caracterización mantiene factibilidad genérica tras retirar box_weightlifting en memoria | Intent adaptation exige método; Weekly no emite opción; Session no recibe ese intent abierto |
| potencia | Movimientos/patrones jump y olympic_lift en box, jump/run en carrera; dosis/estructura representables | Misma validación estratégica y filtros previos; no es permiso sobre una restricción de impacto |
| gimnasticos | Movimientos canónicos y estructuras para trabajo gimnástico; capacidades requeridas se verifican | Método/tupla previos; skill desconocido puede eliminar movimientos antes de diseñar |
| base_aerobica | Trabajo cíclico y carrera; duración/RPE sin inventar referencia numérica | Métodos/estímulos separados por disciplina y gates running; falta de método no entra por vía estratégica |
| recuperacion_activa | Carrera recuperativa representable con duración/RPE dentro del catálogo actual | Adaptación solo enlazada a running_recovery; no hay intención abierta de recuperación en otro entorno |

Técnicamente el lenguaje de dosis y sesiones puede expresar trabajo de estas familias con hechos compatibles. **Eso no significa que el endpoint actual admita `adaptation` sin `methodId`**, ni que cualquier sesión RPE sea segura o que toda adaptación pueda satisfacerse con cualquier movimiento. La reproducción de método ausente prueba factibilidad de pools, no una sesión generada por LLM ni una nueva admisión end-to-end.

`stimulus_only` demuestra separación técnica entre estímulo y método en contratos genéricos existentes; no es una reparación propuesta ni autorización para degradar recibos estratégicos a legacy. Referencias y compatibilidades del dominio deben conservarse al diseñar una futura intención abierta.

Las variantes no abren todo el universo: necesitan familia canónica y modificadores tipados. `controlledPatterns` no incluye olympic_lift, run o inverted_locomotion. Un movimiento generado puede evitar pertenencia literal al pool en la validación de sesión, pero conserva compatibilidad de estímulo, patrón, familia, restricciones y reglas de dosis. No rescata un pool rechazado antes de generarlo.

## I. CrossFit closed-world problem

En la ruta estratégica sí se está usando un catálogo finito como universo admisible de métodos. El problema no es tener una biblioteca pequeña, sino exigir que toda propuesta exista previamente en ella. CrossFit combina modalidades, formatos y objetivos; aumentar filas de TRANSFER_METHODS no cambia esta frontera.

Ejemplos de estrechamiento real del modelo: técnica se representa por box_technique/squat; recuperación por running_recovery/run; halterofilia por box_weightlifting/olympic_lift. Son conocimiento útil y ejemplos válidos, no demostraciones exhaustivas de posibilidad. El entrenamiento aeróbico box usa capacidad_aerobica como estímulo, diferente de adaptation base_aerobica: no confundir ausencia de una etiqueta exacta con ausencia de candidato.

No se propone listar todos los métodos ni imponer running, sábado, diversidad o mínimos de adaptación. Los adaptadores de dominio deben resolver significados y compatibilidades; las autoridades compartidas deben consumir requisitos, capacidades y evidencia serializables. Carrera/box siguen siendo dominios iniciales de validación, no el diseño final de un motor universal.

## J. Preservation bug

Código exacto, `lib/planning/weeklyCalendar.ts`, `isProtectedCalendarSession`:

```ts
((!activeRegeneration || past) && ['REST', 'RECOVERY', 'UNAVAILABLE'].includes(calendarState(s)))
```

El cargador en `lib/planning/prepareAllowedWeeklyPlanContract.ts` calcula:

```ts
const activeRegeneration = !!request.snapshot && request.today >= request.targetWeekStart
  && Date.parse(request.today) < Date.parse(request.targetWeekStart) + 7 * 86400000;
```

Con generación 2026-09-13 y semana 2026-09-14, `activeRegeneration=false`, `past=false`. Basta que exista el REST en snapshot para que el helper devuelva true. No comprueba aquí una razón de propiedad inmutable del REST. `fixedSessions` se proyecta a `fixed`; el constructor de contrato publica exclusivamente `${day}:fixed` con `protected:true`. El Coach pierde TRAIN en esos días antes de evaluar métodos.

`completedDays=[]` no contradice esa condición: completada es una razón independiente, no requisito para la protección de REST. La prueba del cargador usa los cuatro días observados, cero completados y ningún externo, y reproduce las cuatro protecciones. Con la misma fixture el 14 de septiembre y empezarHoy=true no quedan fixed. Esto demuestra causa suficiente y concordante con las fechas del run; sin snapshot/receipt original no descarta razones adicionales allí.

| Razón existente | Evaluación |
| --- | --- |
| completada=true | Protección factual; futuras completadas se rechazan explícitamente |
| TRAIN pasado con prescripción estructurada o texto conocido | Preservar contenido sin afirmar ejecución; legítimo |
| REST/RECOVERY/UNAVAILABLE pasado | Preservar pasado; legítimo |
| Día pasado sin contenido / hoy excluido por empezarHoy=false | Placeholder sin inventar entrenamiento; respeta frontera temporal |
| preserveDays server-selected para reevaluación acotada de chat | Autoridad explícita del alcance; legítima si proviene de ese alcance, no del cliente arbitrario |
| Actividad externa canónica por día | No sobrescribir trabajo externo; conflictos explícitos detienen |
| prescription_access[fecha].availability=unavailable | Indisponibilidad factual; mantener mientras esté vigente |
| REST/RECOVERY/UNAVAILABLE existente y !activeRegeneration, aunque futuro | Sobreprotección por existencia; no basta como inmutabilidad factual |

El helper `protectedCalendarSessionIndices` también usa valores por defecto que protegen estos estados. Deben revisarse sus consumidores legacy junto con el cargador; no cambiar solamente el contador visual. Una futura corrección debe preservar pasado, ejecución, actividad externa y alcance explícito, y permitir reconsiderar futuro Forge-owned no ejecutado. No se implementa aquí.

## K. Goal resolution

`lib/athlete/athletePrescriptionContext.ts` proyecta `usuarios.objetivo_principal` como evidencia con procedencia; `goalResolution.ts` intenta reconocer sus candidatos mediante aliases de `goalTransferModel.ts`. No es un clasificador general de lenguaje deportivo. `strategyResolution.ts` resuelve cada candidato reconocido o usa fallback estructurado/deporte declarado antes de comprobar conflicto.

Del run solo sabemos: un candidato de esa columna, cero IDs reconocidos y estrategia crossfit admitida desde declared_sport. **El valor exacto es UNKNOWN por confirmación del usuario; no se inventa formato ni contenido.** Que no pertenezca a aliases admitidos explica el estado de resolución, pero no permite recuperar su texto.

La reproducción compara un objetivo sintético reconocido crossfit frente a una descripción sintética no reconocida, ambos con especialidad crossfit. Obtiene los mismos `strategy.methods` y `dayOptions`. En el código, ambos entran en GOAL_DEMANDS.crossfit. Por tanto, el fallback puede recuperar la familia de preparación sin recortar ese catálogo; GOAL_UNSUPPORTED no demuestra causalidad sobre los siete rechazos.

Esto no demuestra que declared_sport recupere **todo** el significado del objetivo real: se desconoce el contenido y no se comparó una intención semántica equivalente completa. Estado general **DEGRADED** en resolución del objetivo explícito, con fallback de estrategia válido; causalidad sobre colapso **UNKNOWN**, no atribuida. La no causalidad del cambio de etiqueta está caracterizada para la fixture, no certificada para todos los contextos posibles del atleta.

## L. Libraries: knowledge vs authority

| Biblioteca / autoridad | Papel actual |
| --- | --- |
| GOAL_DEMANDS | Conocimiento de demandas y roles, pero fuente cerrada de adaptaciones candidatas |
| TRANSFER_METHODS | Semántica, transferencia y autorización por pertenencia; MIXED |
| METHOD_TRANSFER_RELATIONS | Conocimiento explícito de equivalencia, vacío actualmente; no inventar sustituciones |
| STIMULUS_LIBRARY / MOVEMENT_LIBRARY | Vocabulario, biomecánica, ranking y filtros de pertenencia; MIXED |
| WORKOUT_STRUCTURE_LIBRARY / STRUCTURES_BY_STIMULUS | Gramática/formatos más mapping deportivo usado como requisito; MIXED |
| Dosis e intensidad running | Compatibilidad factual más registros de métodos y alternativas de expresión; modo Coach abre targets dentro del dominio registrado |
| movementVariants | Precedente de propuesta → resolución → validación, limitado a familias/modificadores verificables |

El precedente correcto no consiste en aceptar cualquier texto. Consiste en poder resolver una propuesta suficientemente estructurada sin enumerar cada combinación. Un futuro diseño de método puede aplicar ese principio sin crear ahora un Method Variant Engine ni eliminar compatibilidad de referencias, unidades o semántica de seguridad.

## M. Proposed target architecture

Propuesta conceptual, no implementada:

```text
hechos + objetivo original/canónico + evento + fase + historial + disponibilidad
  → Weekly Coach propone intención deportiva semanal estructurada
  → adaptadores resuelven semántica y requisitos de la propuesta
  → servidor valida hechos, restricciones conocidas y representación
  → Session Coach diseña movimientos, estructura y dosis
  → resolución y validación del diseño completo
  → receipt vinculado a hechos/versión/intención → freshness/CAS al guardar
```

Resultados distinguibles: contradicción factual conocida → reject; restricción conocida → constrain; referencia compatible → calculate/validate; semántica o evidencia desconocida → UNKNOWN explícito, con aclaración o rechazo de validación si la seguridad lo exige. Falta de un ejemplo deportivo → conocimiento incompleto, no diagnóstico de incapacidad.

**COACH:** TRAIN vs REST; distribución semanal de adaptaciones; desarrollar o mantener; método; patrón; movimientos; estructura; sets/reps; duración; distancia; esfuerzo y descansos; RPE/RIR; objetivo %1RM cuando existe referencia; progresar/mantener/regresar; variación; aprovechamiento de capacidades toleradas alrededor de restricciones. El servidor valida la propuesta sin seleccionar indirectamente esas respuestas vaciando alternativas por conocimiento incompleto.

**SERVER / FACT-HARD:** identidad; hechos de objetivo/evento; disponibilidad y entorno declarado; equipo; restricciones; capacidades conocidas; historia y sesiones realizadas; fisiología; referencias; unidades y cálculos; techo de tiempo; esquema; ownership; pasado protegido; freshness; receipts; CAS. La fase y el historial aportan contexto, no una dosis elegida por heurística oculta.

Adaptadores deportivos independientes resuelven demandas, requisitos y compatibilidades. Los motores compartidos consumen contratos serializables con procedencia; web y React Native/Expo son clientes de esa misma autoridad. No mover decisiones a React ni depender de textos renderizados.

## N. Minimal repair surface

1. **Preservación, cambio separable:** `weeklyCalendar.ts` y `loadWeeklyPlanningContext`; expresar causa factual de fixed y distinguir futuro sustituible de pasado/completado/externo/preserveDays. Revisar consumidores del helper y binding del receipt.
2. **Intención semanal:** `canonicalWeekStrategy`, `goalTransferModel`/`prescriptionIntent`, `authorizedMethodCandidates`, `allowedWeeklyPlanContract`. Separar semántica de método de autorización por catálogo; admitir propuesta estructurada resuelta sin exigir un managed method previo. Mantener ejemplos como asesoramiento y no reconstruir toda combinación posible.
3. **Validación posterior:** `trainingFeasibility`, `allowedTrainingContract`, `sessionAuthority`, `structuredSession`. Separar hechos negativos de insuficiencia del pool conocido; resolver requisitos del diseño antes de validarlos. Un catálogo vacío no puede ser certificado de imposibilidad del atleta.
4. **Señales, dosis y referencias:** `prescriptionDataSufficiency`, `doseCapabilityProfile`, autoridades running. Propagar UNKNOWN y razones tipadas; conservar compatibilidad explícita y cálculo verificable. No reemplazar toda prescripción por RPE por comodidad.
5. **Diagnóstico y transporte:** vincular razón, etapa, método/patrón, día, hecho/procedencia y resultado de resolución; actualizar receipt/contrato compartido con compatibilidad explícita para planes antiguos. No confiar en que logs agregados reconstruyan causalidad.

El mínimo arquitectónico cruza contratos; no es añadir una opción a la lista. Conviene resolver la preservación de forma independiente, sin esperar a abrir el lenguaje de métodos. Ninguno de estos cambios se implementa en esta auditoría.

## O. Risks

- Confundir UNKNOWN con permiso puede admitir propuestas cuya seguridad no es verificable; distinguir incertidumbre deportiva de seguridad.
- Eliminar mappings sin resolver semántica puede permitir etiquetas incompatibles con movimientos, dosis o adaptaciones.
- Equiparar modalidades puede inventar transferencia; mantener conocimiento de dominio explícito, incluidas referencias de Carrera.
- Un cambio de contrato sin versionado puede invalidar recibos legítimos o aceptar intención distinta de la firmada.
- Liberar REST futuros indiscriminadamente puede sobrescribir actividad externa, completados o una reevaluación acotada explícita.
- Atribuir el run a GOAL_UNSUPPORTED o a restricciones imaginadas produciría un parche no sustentado.
- Cuotas, anti-bench, sábado obligatorio y métodos adicionales pueden ocultar el cierre sin repararlo.
- Introducir autoridad en clientes duplicaría decisiones y rompería la paridad web/Expo.

## P. Tests required

### Caracterización realizada, sin parche

Archivo: `lib/planning/coachFreedomAuthorityAudit.test.mjs`. Cinco pruebas:

1. Las ocho adaptaciones tienen métodos y llegan a opciones con señales sintéticas explícitamente permisivas.
2. Retirar solo box_weightlifting **en memoria** conserva adaptación y factibilidad genérica de movimientos/estructuras, pero produce no_feasible_managed_method y ninguna opción de esa adaptación.
3. Retirar solo mapping de estructuras **en memoria** produce STRUCTURE_POOL_EMPTY con movimientos todavía presentes.
4. Objetivo sintético no reconocido + CrossFit declarado conserva métodos y opciones de un objetivo CrossFit reconocido.
5. El cargador de lectura protege los cuatro REST futuros antes de la semana y los libera al entrar en ella; ninguna fixture escribe datos.

Validación ejecutada:

```text
node --test lib/planning/coachFreedomAuthorityAudit.test.mjs
  lib/planning/goalTransferStrategy.test.mjs
  lib/planning/allowedWeeklyPlanContract.test.mjs
  lib/planning/pastPlannedPreservation.test.mjs
  lib/sports/prescriptionDataSufficiency.test.mjs
```

Resultado: **106 tests, 106 pass, 0 fail**. Incluyen pruebas existentes de 1RM/RPE, equipo ausente/desconocido, límites de capacidad, restricciones, admisión estratégica y preservación del pasado. No son un replay del atleta ni una evaluación del LLM. No se ejecuta la suite completa; no hay cambios de código productivo.

### Invariantes exigibles a la futura reparación — no implementados

| Invariante | Comprobación futura |
| --- | --- |
| A: ausencia de managed method no significa incapacidad | Intención resoluble llega a diseño sin método preenumerado; no introducir método artificial en fixture |
| B: sin 1RM | %1RM no sustentado rechazado; sesión de fuerza RPE/RIR compatible admitida |
| C: sin plantilla/mapping previo | Propuesta de estructura válida se valida por su semántica y dosis |
| D: equipo requerido conocido ausente | Propuesta rechazada con evidencia de ausencia por fecha/entorno |
| E: restricción activa incompatible | Propuesta rechazada con incompatibilidad resuelta, no nombre aproximado |
| F: UNKNOWN relevante para seguridad | No inventar evidencia negativa; no admitir cuando no se puede validar seguridad |
| G: REST futuro Forge-owned no completado | Reconsiderable en regeneración autorizada salvo otra razón factual |
| Integridad | Past/completed/external, receipt identity, freshness y CAS se mantienen; contratos antiguos explícitos |
| Generalidad | Añadir especialidad por adaptador sin reescribir shared engines ni duplicar decisiones en UI |

## Q. Production acceptance plan

Plan para una fase posterior autorizada; no ejecutado:

1. Capturar para un run nuevo versión desplegada, fecha de generación, snapshot y contrato semanal, con procedencia y protección de datos. No intentar inventar los logs perdidos del run auditado.
2. Por adaptación/método/patrón/día, conservar entrada, etapa, motivo y naturaleza factual/representacional/política; distinguir no enumerado, rechazado, pendiente UNKNOWN y no seleccionado por el Coach. Vincular con planningRunId.
3. Verificar que el Weekly pueda proponer una intención resoluble ausente del catálogo de métodos sin otorgarse ownership ni reescribir disponibilidad.
4. Mostrar causa de cada fixed; comprobar reconsideración de REST futuros autorizada, junto a pruebas negativas de pasado, completados, externos y preserveDays legítimos.
5. Validar sesiones propuestas sobre requisitos reales: restricciones, equipo, capacidad, referencias, tiempo, unidades y consistencia de intención. Inspeccionar diseño antes de cualquier guardado autorizado.
6. Comparar contexto ofrecido y decisiones justificadas del Coach. No exigir running, sábado TRAIN, un mínimo de adaptaciones o ausencia de bench como criterio de éxito.
7. Verificar freshness/receipt/CAS y paridad entre clientes; aceptar solo si ningún cambio factual o de autoridad queda encubierto por una propuesta del LLM.

Para el incidente conservado permanecen desconocidos: objetivo literal, hechos de equipo/capacidad/restricción por día, entradas de doseCapabilities, rechazo por método/patrón y opciones exactas de cada Builder. La fecha ya fue confirmada por el usuario; no se necesita volver a solicitarla. Sin nuevos datos, la causalidad detallada de los siete descartes debe seguir sin asignarse.

### Final status

| Área | Estado demostrado | Alcance |
| --- | --- | --- |
| COACH OPTION SPACE | **PARTIALLY CLOSED** | Weekly cerrado por tuplas; Session permite dosis/composición y variantes dentro de fronteras previas |
| MANAGED METHODS | **MIXED** | Conocimiento semántico y autorización por pertenencia |
| UNKNOWN SEMANTICS | **MIXED** | Señales preservadas, algunos consumidores vacían opciones; seguridad y referencias tienen caminos diferenciados |
| FUTURE PLAN PRESERVATION | **OVER-PROTECTED** | Condición y cargador reproducidos con las fechas y cuatro REST observados; no inspección del snapshot real |
| GOAL RESOLUTION | **DEGRADED** | Goal explícito no reconocido; fallback crossfit admitido. Causalidad del colapso UNKNOWN; igualdad de opciones probada solo en fixture |
| ROOT CAUSE OF AIRAN WEEK | **PARTIALLY PROVEN** | Cierre y sobreprotección probados; razones individuales de descarte no recuperables de agregados |

No commit. No push. No deploy. No migraciones. No modificación de atletas reales. Únicos cambios de esta fase: este informe y tests de caracterización.
