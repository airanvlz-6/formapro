# Planning coherence repair

## Contratos antes de modificar tests

La auditoría de `4f5eb1e658a457e97764a8edcec4a5d81eb2a26d` conserva los resultados históricos. Sus pruebas de caracterización de reciclaje, contador anterior, paralelismo sin contexto y cero reconsideraciones describen defectos que esta tarea debe eliminar. Se sustituirán esas expectativas por invariantes del contrato corregido, sin cambiar expectativas deportivas para hacer pasar tests.

La repetición exacta bajo autoridad Weekly Coach es advisory en el contrato solicitado: KEEP debe poder conservarla si cumple las autoridades hard. Las pruebas legacy de reparación siguen aplicando a contratos anteriores; el nuevo protocolo de coordinación identifica explícitamente la reconsideración consultiva.

No se modifica el tag legacy de cierre. No hay cuota de carrera, prohibición de bench ni selección de fase deportiva por servidor.

La expectativa antigua de `weeklySave.test.mjs` que exigía escribir `usuarios.ciclo_actual.semana=1` después de guardar contradice directamente la nueva autoridad previa a Weekly. Se cambia únicamente esa expectativa: el registro de `block_outcomes`, el log, el evento y sus fallos post-commit se conservan. El test de la ruta Session actualiza su doble de calendario para devolver el contrato que devuelve la función real; no se relaja ninguna validación. El fixture de reintentos Weekly declara un target ya admitido, para seguir contando llamadas Weekly y no mezclar una decisión de transición de bloque.

## A. Root causes repaired

Base: `4f5eb1e658a457e97764a8edcec4a5d81eb2a26d`. Cambios locales, sin despliegue ni acceso a atletas reales.

| Causa | Corrección |
|---|---|
| El guardado reciclaba el bloque del propio plan | Se resuelve el target sobre `usuarios.ciclo_actual` antes de Weekly; guardar no incrementa ni reconstruye el ciclo |
| UI/plan conservaban contador anterior | La respuesta incluye la posición canónica; el guardado deriva los campos de la evidencia firmada, ignorando los contadores del cliente |
| Objetivo desde cobertura recomendada | La proyección nueva consume slots admitidos y prioridades declaradas por el Coach |
| Builders simultáneos sin memoria | Construcción ordenada, con receipts de las sesiones anteriores y verificación de secuencia en backend |
| Warnings sin interlocutor | Una reconsideración acotada permite KEEP o REVISE bajo contratos existentes |

No se demuestra con estos cambios por qué el run histórico de AIRAN seleccionó REST en carrera o bench en cada día. El informe de auditoría conserva esos UNKNOWN.

## B. Canonical longitudinal authority

La única fuente sigue siendo el JSON existente `usuarios.ciclo_actual`. `longitudinalAuthority.ts` añade en esa misma fuente el anclaje `planningWeekStart`, un `blockId`, la procedencia de decisión y hasta 16 proyecciones semanales anteriores. No hay tabla nueva, migración ni contador independiente en `weekly_plan`.

El backend comprueba primero objetivo, scope, restricciones y preservación del target con el loader existente. Después:

1. Si la posición del target ya existe, la reutiliza, incluso para regenerar una semana anterior conservada en la autoridad.
2. Si el siguiente target continúa un bloque con duración conocida, incrementa una sola posición.
3. Al agotar el bloque, faltar una posición válida o existir un salto temporal que no permita inferir continuidad, solicita una decisión explícita de bloque al Coach.
4. Escribe mediante CAS de todo el JSON anterior y código del atleta. Una carrera de peticiones no sobrescribe al ganador: se relee la posición resuelta de ese mismo target o se falla explícitamente.

El CAS ocurre **antes de construir el plan**. Si luego falla el proveedor o el guardado, el target queda reservado en la autoridad; reintentar lo reutiliza. La reserva de target no afirma que se entrenó ni que el plan se guardó. No existe una transacción nueva entre `usuarios` y `weekly_plan`; este orden elimina el antiguo contador post-commit y hace el reintento idempotente por target.

En datos legacy, la fecha de la última fila semanal sirve únicamente para anclar la posición que ya declara el ciclo. Sus campos de bloque/contador no eligen un nuevo estado. Una semana anterior sin posición canónica reconstruible falla con `LONGITUDINAL_LEGACY_POSITION_AMBIGUOUS`. No se repara historia ambigua inventando una transición.

## C. Deload transition semantics

`deload 1/1` agotado no puede reciclarse desde `plan.block_name`. El Coach puede elegir otro deload, con nuevo `blockId`, razón, target, run y digest del estado anterior. No se prohíben dos deload consecutivos.

La transición utiliza las fases ya representadas por la estrategia existente. La duración es un entero positivo representable sin pérdida de precisión; el servidor no elige una duración deportiva. Una respuesta ausente o inválida no genera un bloque por fallback.

Una duración legacy desconocida permanece `null` al regenerar la misma semana. Para avanzar sin duración conocida se pide una decisión explícita. Los enteros legacy almacenados como strings se normalizan sin alterar la comparación CAS del JSON original.

El cierre semanal legacy y sus tags no se modifican. El nuevo mecanismo usa el target autorizado de generación. Los outcomes existentes se siguen calculando con el helper extraído del código anterior y se escriben solo después del commit del plan de transición; no vuelven a generarse en las siguientes semanas de ese bloque.

## D. weekly_plan counter projection

La autoridad longitudinal se incluye en el calendar receipt de `coherenceVersion=1`; su frescura se compara de nuevo con la fuente canónica. `guardar_plan_semana` deriva `block_name`, `week_number` y `total_weeks_block` de esa evidencia antes de admitir la identidad y ejecutar CAS/INSERT del plan.

El cliente muestra la misma proyección devuelta por Planner. La adaptación desde Chat también proyecta esos campos y el objetivo. El guardado ya no escribe `usuarios.ciclo_actual`. Se conserva el comportamiento terminal de errores/ambigüedad de persistencia: no hay replay automático ni afirmación falsa de rollback.

## E. Visible objective derivation

`selectedWeekStrategy` deriva adaptaciones y cobertura exclusivamente de slots TRAIN/RECOVERY admitidos. Las prioridades proceden de las decisiones firmadas del Weekly Coach; si varios días seleccionan la misma adaptación, una selección PRIMARY no se pierde por aparecer después de otra de apoyo.

`selectedWeekObjective` reutiliza la presentación humana existente. La UI recibe ese texto y el guardado lo reconstruye desde el receipt. El test con preferencia Analyzer `base_aerobica` y selección `potencia` comprueba las adaptaciones proyectadas, sin exigir una frase literal. El contexto de bloque está disponible en la estrategia y en la proyección longitudinal del plan.

Los receipts anteriores sin `coherenceVersion=1` mantienen su interpretación histórica durante su vigencia; las dos entradas de planificación actuales (ruta semanal y Chat) emiten el nuevo protocolo.

## F. Intra-week Session Coach context

Web construye en orden civil; Chat utiliza el mismo backend en su recorrido semanal. Cada llamada nueva lleva `acceptedCurrentWeek` con las sesiones admitidas anteriores. El backend no confía en sus títulos, pools o movimientos libres: verifica los receipts bajo el mismo atleta, semana, calendar receipt y opciones firmadas.

Exige exactamente los predecesores ejecutables no protegidos: rechaza omisiones, duplicados, otro orden de calendario, alteraciones de contenido o receipts ajenos. Añade las sesiones protegidas leídas del snapshot cuya identidad coincide con el digest firmado.

La proyección serializable incluye todos los intents semanales y, para sesiones disponibles, día/fecha/orden, modalidad, adaptación/método/rol, estructura, movimientos resueltos, familias canónicas, patrones, dosis y exposición. No depende de React ni de strings renderizados para decidir autoridad.

El receipt Session vincula los digests de los predecesores. La primera admisión de la semana comprueba esa cadena contra el ensamblado. Después de reparaciones explícitas whole-week, el servidor revalida las sesiones con sus contratos, preservación y frescura, permitiendo que cambien los digests previos por esa revisión; esa opción interna no procede del cliente.

## G. Historical vs planned exposure

Se reutiliza `ExposureEngine.structured` y el adaptador de carga prescrita existente. Las cantidades desconocidas no se inventan. La memoria de construcción lleva `PLANNED_CURRENT_WEEK` y nunca se inserta en historial ni se suma a exposición completada.

El historial anterior permanece separado en `sessionHistory` y `exposureContext`. Una fila protegida ya completada conserva `HISTORICAL_COMPLETED`, pero sus dosis prescritas se etiquetan `PRESCRIBED_NOT_MEASURED`: no equivalen a cantidades realizadas. Esas filas no entran en el agregado de nuevas prescripciones planificadas.

La prueba de cuatro Builders permite repetir bench en los cuatro; exige que reciban 0/1/2/3 sesiones previas y sus familias/exposición, con el historial sin cambios. Otra comprobación excluye una fila completada del agregado planificado.

## H. Whole-week feedback loop

Los errores hard siguen pasando por las dos etapas de reparación existentes antes de poder admitir una semana. Una semana que pasa esas comprobaciones pero contiene WARNING entra una sola vez en reconsideración, con decisiones Weekly originales, estrategia/bloque, sesiones, exposición de la semana, restricciones, disponibilidad e historial de exposición de los contratos elegibles.

- KEEP requiere razón breve y ningún día a reconstruir; conserva la semana.
- REVISE identifica hasta tres días elegibles. Se reconstruyen bajo sus contratos firmados originales, con las sesiones hermanas actualizadas, y se valida otra vez.
- No se revisan sesiones protegidas ni se amplían pools, referencias o intents.
- No hay segunda reconsideración aunque queden warnings.
- Si falla el proveedor, el JSON o una revisión viola una autoridad hard, se descarta la revisión completa y se conserva el candidato anterior que ya pasaba hard. Se devuelve `UNAVAILABLE` con un código acotado, **no** un KEEP ficticio. Un warning por sí solo no invalida la semana.

El presupuesto máximo conserva seis llamadas de reparación hard y añade una reconsideración más hasta tres reconstrucciones advisory; el trace distingue ambos presupuestos. La reconsideración y su razón quedan en el whole-week receipt/auditoría y en la respuesta.

## I. Hard vs advisory authority

Se mantienen hard ownership, disponibilidad, restricciones, equipo/capacidades requeridos, referencias, unidades/cálculos, máximo temporal, schema, semántica de variantes, pasado protegido, completadas/externas, frescura, receipts e integridad/CAS.

Repetición y concentración no se convierten en nuevas cuotas. En el nuevo protocolo, incluso una copia exacta de movimientos/dosis es una advertencia revisable por Coach; el protocolo legacy conserva su clasificación anterior. No se exige cambiar bench, añadir carrera ni alternar adaptaciones. TRAIN/REST y elección de ejercicios permanecen en sus Coaches.

## J. Running REST unresolved question

Sigue **UNEXPLAINED** para el run `c8d9d91c-9b30-4710-babe-dd45ca9fdd1f`, atleta `060385`, semana `2026-09-14`. Las trazas aportadas identifican tres Builders (martes/jueves/sábado), no cuatro.

Con `FORGE_WEEKLY_COACHING_DIAGNOSTICS=1`, cada día registra `WEEKLY_COACH_OPTIONS`, `WEEKLY_COACH_SELECTION` y `WEEKLY_COACH_RATIONALE`, correlacionados por run/semana. Esto permitirá distinguir ausencia de opciones carrera de una elección REST entre alternativas válidas. No se aplica `running availability => TRAIN`.

## K. Duplicate-dispatch observability

No se añade debounce ni mutex. Cada llamada lógica de `apiCall` lleva `x-forge-action-id`, estable entre sus retries, y `x-forge-attempt`. El backend registra `PLANNING_ACTION_REQUEST` opt-in con acción, identificador, intento, run verificado y target.

La continuación existente conserva el run de generación. Se correlacionan solicitudes efectivas por acción/run; dos INICIO siguen sin probar dos generaciones. El test de reentrada mantiene un único Analyzer y guardado, ahora con Builders secuenciales. No se ha demostrado duplicación efectiva en producción.

`FORGE_SESSION_COACHING_DIAGNOSTICS=1` añade `SESSION_WEEK_CONTEXT`: día/run, intent, pool/familias y resúmenes históricos/planificados. Se reutilizan los eventos existentes de propuesta, resolución y validación. Los diagnósticos no registran prompts, receipts, secretos o perfil completo. La transición longitudinal emite `BLOCK_STATE_TRANSITION` con input/output acotados, y la reconsideración `WHOLE_WEEK_COACH_FEEDBACK`.

## L. Files changed

Código productivo:

- `app/FormaPro.tsx`, `app/api/chat/route.ts`, `lib/chat/adaptChatPlan.ts`.
- `lib/planning/longitudinalAuthority.ts`, `completedBlockOutcome.ts`, `selectedWeekObjective.ts`, `currentWeekCoachingContext.ts`.
- `lib/planning/prepareAllowedWeeklyPlanContract.ts`, `weeklyCalendarAuthority.ts`, `enforceWholeWeek.ts`, `wholeWeekAdapter.ts`, `wholeWeekValidation.ts`.
- `lib/sports/sessionAuthority.ts`, `sessionDoseDiagnostics.ts`.

Pruebas: `lib/planning/planningCoherenceRepair.test.mjs`, `productionPlanningAudit.test.mjs`, `allowedWeeklyPlanContract.test.mjs`, `weeklySave.test.mjs`, `wholeWeekOrchestration.test.mjs` y `lib/sports/sessionAuthority.test.mjs`.

Este informe es nuevo. `docs/production-planning-regression-audit.md` permanece como auditoría del checkpoint previo y ya estaba en el working tree; sus cifras describen aquella ejecución, no el nuevo código.

## M. Tests

Validación focalizada: 93/93 en reparación de coherencia, guardado real por AST, Session Authority y HR; 75/75 en rutas Weekly/event authority; Chat 19/19. Las nuevas pruebas incluyen avance/reintento, deload explícito, rechazo de transición inválida, objetivo admitido, cuatro contextos progresivos, rechazo de memoria falsificada, KEEP, REVISE, rollback de revisión inválida y ausencia de revisión sin warnings.

La primera suite completa detectó ocho fallos: integración/fixtures descritos arriba y un receipt caducado durante una pausa prolongada de la ejecución. El test HR pasa de nuevo sin alterar su expectativa ni autoridad.

Resultados finales:

- Suite completa: todos los `*.test.mjs` y `*.test.cjs` con `node --test --test-concurrency=4` — **2315/2315**, cero fallos/cancelaciones/omisiones, 354424 ms.
- Última ejecución de `node --test lib/planning/planningCoherenceRepair.test.mjs` — **9/9**, después de los últimos ajustes del transporte/diagnóstico y validación del entero de duración.
- `node node_modules/typescript/bin/tsc --noEmit --incremental false` — exit 0.
- `git -c core.safecrlf=false diff --check` y comprobación contra archivo vacío de los archivos nuevos — sin errores.
- Se eliminan los logs temporales de ejecución. No se añaden al índice ni se hace commit.

## N. Known limitations

- Sin validación en producción ni lectura del historial real de AIRAN; no se declara el incidente explicado retrospectivamente.
- Ciclo y plan son escrituras separadas: el target queda reservado si la construcción posterior falla. No se afirma atomicidad entre tablas.
- La posición legacy anterior al anclaje o fuera de las 16 proyecciones conservadas no se infiere. Hace falta evidencia/autorización para resolverla.
- El helper de outcomes conserva las estimaciones históricas anteriores; no constituye una nueva medición de adherencia ni determina el siguiente bloque.
- Se mantiene el adaptador de evento existente, incluida la semántica específica de media maratón; no se rediseña event authority.
- El matching textual histórico y la proyección legacy de última exposición descritos en la auditoría no se reemplazan en este cambio. No se prometen ventanas exactas de 7/28 días para bench.
- La revisión advisory es acotada y conserva intents; no redistribuye todo el calendario. Su indisponibilidad queda explícita y puede requerir revisión posterior de calidad.
- El código existente de Analyzer se ejecuta antes de Planner; su consejo puede describir la fase anterior a una transición. La autoridad que llega a Weekly y el bloque de Session se recargan desde el target resuelto. No se promueve ese consejo a un hecho del ciclo.
- Los clientes deben transportar las sesiones admitidas previas al usar el nuevo receipt; omitirlas falla explícitamente.

## O. Production acceptance procedure

No se ha ejecutado este procedimiento contra producción.

1. Con autorización posterior para una generación, activar los diagnósticos existentes y registrar el run/target. Conservar solo las proyecciones acotadas; no compartir tokens ni prompts.
2. Leer el ciclo previo y comprobar `BLOCK_STATE_TRANSITION`, bloque/semana/duración y procedencia. Regenerar el mismo target debe conservar posición e ID. Otro deload requiere una decisión nueva identificable.
3. Comparar `estructura.longitudinal`, evidencia admitida y fila final `weekly_plan`. Cambiar los contadores enviados por el cliente no debe cambiar la proyección guardada.
4. Para lunes/miércoles/domingo, recoger opciones, selección y razón. Solo entonces explicar el REST real.
5. Verificar que cada `SESSION_WEEK_CONTEXT` contiene los predecesores admitidos, sus familias/patrones/dosis, y que `PLANNED_CURRENT_WEEK` no aparece como ejecución histórica.
6. Ante warnings, observar una reconsideración KEEP/REVISE o `UNAVAILABLE` explícito. Si revisa, comprobar únicamente los días elegibles, la validación posterior y ausencia de otra reconsideración.
7. Correlacionar action ID, attempt y run para contar Analyzer/Planner/Builder/save efectivos; no contar solo INICIO.
8. Verificar preservación, restricciones, referencias, receipts y CAS; comprobar que el registro de outcome ocurre tras un commit confirmado y no se repite en la siguiente semana del mismo bloque.

| Área | Estado |
|---|---|
| LONGITUDINAL PROGRESSION | VERIFIED LOCALLY |
| VISIBLE WEEK OBJECTIVE | VERIFIED LOCALLY |
| INTRA-WEEK COACHING CONTEXT | VERIFIED LOCALLY |
| WHOLE-WEEK COACH FEEDBACK | VERIFIED LOCALLY |
| RUNNING REST DECISION | UNEXPLAINED |
| DUPLICATE EXECUTION | NOT PROVEN |

No commit, push, deploy, migraciones ni modificaciones de atletas reales.
