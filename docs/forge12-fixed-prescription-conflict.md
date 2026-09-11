# FORGE12: conflicto de dos prescripciones fijas

## Resultado y alcance

El fixture reproduce `repair_required → WEEK_REPAIR_FAILED` por un único error bloqueante: `WEEK_EXACT_DUPLICATE` entre `viernes:4` y `sabado:5`. No es una prohibición de correr dos días consecutivos. El comparador exige igualdad de movimiento, estructura, estímulo, dosis, intensidad, adaptación y rol; aquí todas coinciden. No existe autorización firmada para repetir exactamente esa prescripción.

La corrección intercepta esa selección antes de los Builders. Las autoridades existentes permiten una base + REST: la selección de dos bases es incompatible, pero **el contrato semanal no es globalmente insatisfacible** en este fixture. No hace falta pedir otra dosis factual para esa solución.

No se han modificado el validador whole-week, la reparación, persistencia, atribución temporal, políticas numéricas ni autoridades de evento, historia o intensidad. No se ha realizado SQL ni push.

## Qué representa el fixture

`lib/planning/forge12WholeWeek.test.mjs` fija la semana 2026-09-07, referencia 2026-09-11, evento HM 2026-11-15 y 65 días restantes. Lunes carrera completada; martes box completada; miércoles running_specific de aproximadamente 87 minutos pendiente y actual null; jueves pendiente y actual null, confirmado por el usuario; viernes/sábado contienen las dos propuestas exactas indicadas; domingo descanso.

No se proporcionaron las estructuras ejecutadas del lunes/martes ni el contenido/disciplinas del jueves. Permanecen desconocidos; no se inventan cantidades. La estructura completa del miércoles tampoco se proporcionó: el dato real se conserva como objetivo planificado. Una variante estructurada expresamente sintética prueba por separado la semántica de cobertura planificada.

Para probar la hipótesis cuantitativa se utiliza el fixture histórico sintético ya existente, retirando su antigua ocurrencia de carrera del martes de esta semana. Se añade una declaración fácil confirmada de 50 minutos, sin ejecuciones modernas por método. El historial semántico previo demuestra experiencia dentro del fixture, pero sus duraciones legacy sin unidades no autorizan dosis. La distribución pasada y el techo de seis días son condiciones controladas para no introducir un rechazo de disponibilidad ajeno al conflicto. Solo viernes y sábado quedan disponibles para nuevas sesiones.

Esto demuestra una causa suficiente y el comportamiento del código real con los hechos aportados. **No prueba que el perfil de producción tuviera exclusivamente esa evidencia**, ni reconstruye respuestas LLM no suministradas. No se han leído datos de producción. Las afirmaciones sobre métodos disponibles y failedReasons se refieren al fixture, no a telemetría inexistente.

## Traza de autoridad

1. `loadWeeklyPlanningContext` recibe `strategyProposal.preferredAdaptations` con las siete adaptaciones indicadas. `buildCanonicalWeekStrategy` ordena demandas de catálogo dentro de sus prioridades; esa preferencia no concede dosis, método ni obligación de llenar cada día disponible.
2. `buildDoseCapabilityProfile` resuelve B3 y comprueba composición, C2, tiempo y elegibilidad D3. Con la evidencia controlada, solo `running_base` es `QUANTIFIABLE` y `prescriptionAllowed=true`. Los otros seis métodos tienen `longitudinalDose.selectedDose=null`.
3. No todo se reduce a falta de un número: `running_specific` y `running_economy` tienen selectores nulos en el registro vigente. Para recovery/long-run/threshold/VO2 faltan las autoridades factuales compatibles en este fixture. Tener experiencia no equivale a una dosis disponible, y ausencia de dosis no equivale a principiante.
4. `resolveAuthorizedMethodCandidates` filtra candidatos sin dosis ejecutable. Viernes y sábado ofrecen únicamente running_base como entrenamiento y REST. `bindStrategicCoverage` exige la cobertura que puede demostrarse y aplaza explícitamente las demandas sin método viable, incluyendo umbral y resistencia específica.
5. Antes de la corrección, `validateWeeklySelection` comprobaba IDs, frecuencia, descanso, cobertura y restricciones D3, pero no la colisión entre dos composiciones completamente fijadas. El Planner podía seleccionar running_base dos veces; no estaba obligado a hacerlo.
6. `selectAerobicContinuity` convierte la declaración confirmada de 50 minutos en un objetivo exacto de 3.000 segundos, un único `rodaje_z2`, `continuo_carrera`, `SINGLE_CONTINUOUS_TOTAL`. C2 fija RPE 2–3. Cada Builder genera una propuesta válida para ese contrato. No tiene autoridad para fabricar variedad numérica ni cambiar método.
7. `validateAdmittedWholeWeek` reúne los hermanos y detecta la igualdad completa. El Client Week Integrity no reemplaza esta comprobación de prescripciones estructuradas.

## Diagnósticos y reparación reproducidos

La salida completa del adapter y la orquestación se conserva en [forge12-fixed-prescription-fixture.json](forge12-fixed-prescription-fixture.json). Se obtiene ejecutando el test contra las implementaciones reales, con HMAC de prueba y sin escrituras.

| Código | Severidad | Sesiones/dimensión | Reparabilidad |
| --- | --- | --- | --- |
| WEEK_STRUCTURE_UNKNOWN | WARNING | lunes:0 | none |
| WEEK_IMPACT_UNKNOWN | INFO | lunes:0 | none |
| WEEK_STRUCTURE_UNKNOWN | WARNING | martes:1 | none |
| WEEK_IMPACT_UNKNOWN | INFO | martes:1 | none |
| WEEK_PRIMARY_DEFERRED | WARNING | resistencia_especifica | none |
| WEEK_PRIMARY_DEFERRED | WARNING | umbral | none |
| WEEK_EXACT_DUPLICATE | ERROR | viernes:4, sabado:5; dose | same_contract |

El error muestra movement=1, pattern=1; stimulus, structure, dose, intensity, adaptation, role y loadProfile=true. Los dos objetivos afectados son HM / base_aerobica / running_base / PRIMARY / run. La selección mínima de reparación elige sábado por el desempate existente hacia la sesión posterior. Lunes, martes y los días pasados protegidos no son objetivos de reparación.

| Respuesta controlada de reparación | Local | Targeted | Resultado |
| --- | --- | --- | --- |
| La misma propuesta válida de 3.000 s | target sabado:5; failedReasons=[] | target sabado:5; failedReasons=[] | repairCount=2; WEEK_REPAIR_FAILED; finalStatus=repair_required |
| Aumentar dosis a 3.060 s | WEEK_REPAIR_CONTRACT_INVALID | WEEK_REPAIR_CONTRACT_INVALID | no candidato final |
| Cambiar a umbral/series_umbral | WEEK_REPAIR_CONTRACT_INVALID | WEEK_REPAIR_CONTRACT_INVALID | no candidato final |
| Cambiar intensidad a RPE 4 | WEEK_REPAIR_CONTRACT_INVALID | WEEK_REPAIR_CONTRACT_INVALID | no candidato final |

Una lista failedReasons vacía significa que la propuesta pasó la validación individual, no que reparó la semana. `repairSessionWithinReceipt` verifica y reutiliza el contrato firmado original en ambas etapas. Targeted cambia la instrucción al modelo, no amplía su autoridad. Ninguna etapa puede convertir running_base en otro método. Los cambios cosméticos no suministran una justificación de repetición ni una dosis diferente autorizada.

Estos son los failedReasons reproducidos. Sin las respuestas originales del modelo no puede afirmarse cuál de las variantes ocurrió en producción.

## Miércoles y jueves no ejecutados

La evidencia `projectRunningDoseBaseline` identifica miércoles como `PLANNED_ONLY`; no añade running_specific a `recentMethodExposure` ni usa sus 87 minutos como duración ejecutada. El fixture reconoce una sola ocurrencia de carrera completada esta semana: lunes. Martes es box. No existen cantidades ejecutadas derivadas del plan.

Whole-week es un validador de **prescripción**, no de cobertura ejecutada: una prescripción estructurada compatible puede satisfacer su cobertura aunque `completada=false`; cambiar solo la bandera de completada no cambia esa cobertura. Esto no declara realizada la adaptación. El test de variante estructurada lo demuestra explícitamente.

Además, en la regeneración activa del viernes, el loader existente proyecta los días pasados de entrenamiento sin registrar como `UNAVAILABLE`. Miércoles/jueves quedan fuera del entrenamiento nuevo y de la cobertura de esa nueva proyección. El snapshot anterior conserva sus datos planned y sus flags; no se escriben ni corrigen datos históricos. Una segunda entrada al adapter que conserva las filas originales planned-only reproduce el mismo error bloqueante entre viernes/sábado, con la estructura histórica desconocida expuesta como advertencia.

## Corrección mínima

- Nuevo adaptador `fixedRunningPrescription`: proyecta solamente una composición continua exacta, con un movimiento, una estructura y una intensidad resuelta. No selecciona otra dosis. No proyecta rangos variables, varias alternativas ni intensidad no resuelta. Se apoya en la política actual que no admite preparación adicional.
- `doseCapabilityProfile` adjunta esa proyección donde ya construye el contrato y verifica la ejecución; no introduce lecturas ni resoluciones por día.
- Los candidatos incluyen `fixedPrescriptionKey`, calculada por el servidor a partir de la composición, adaptación y rol. Su procedencia sigue visible en la capacidad de dosis. El contrato y su digest incluyen esa restricción serializable; el cliente/modelo solo selecciona IDs.
- La prueba finita de cobertura respeta las claves ya utilizadas. La admisión semanal rechaza dos opciones nuevas con la misma clave mediante `WEEKLY_FIXED_PRESCRIPTION_DUPLICATE`, antes de construir sesiones. La regla compartida no contiene una lista de deportes ni un límite arbitrario de sesiones por método.
- El Planner recibe la restricción y mantiene sus dos intentos dentro del mismo contrato. En el fixture, el segundo intento elige base + REST; pasa whole-week sin ninguna llamada de reparación. Si insiste en la pareja, termina antes del Builder con `WEEKLY_PLANNER_REJECTED` y el error específico. No rebaja cobertura, no rellena con recovery no autorizado y no oculta un rechazo.

Esta prevención es deliberadamente acotada a nuevas opciones cuya composición está completamente fijada. La validación final sigue cubriendo el resto de combinaciones y los recibos previos. No es una política general de variedad ni un cambio de dosis. Con evidencia cuantitativa compatible, los tests existentes mantienen la selección normal base/threshold/long-run y base/recovery en taper.

## Validación

- Ocho pruebas nuevas: capacidades, dos Builders reales, adapter, ambas etapas de reparación firmada, rechazo de cambios de método/dosis/intensidad, selección previa + REST, historia no ejecutada y límites de la proyección.
- Regresión focalizada: 143/143, cero fallos/omitidos. Incluye whole-week, selección semanal, B3, continuidad y conservación.
- `npx tsc --noEmit`: correcto.
- `git diff --check`: correcto.
- Suite completa `node --test --test-concurrency=4 'lib/**/*.test.mjs'`: 2.183/2.183; cero fallos, omitidos o cancelados (164,8 s).

Commit local únicamente; no push ni SQL.
