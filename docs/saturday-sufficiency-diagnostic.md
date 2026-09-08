# Saturday data sufficiency: diagnostic capture

Base auditada: `40f557282b60f3220d7e280444ee2e4d7c8d6051`. Alcance final acordado: instrumentación únicamente, sin fix funcional, sin cambios del retry/prompt, sin datos de producción reconstruidos.

## Qué se sabe del incidente

Cuatro targets; miércoles pasa en intento 2, jueves y viernes en intento 1, sábado falla en intento 2. El primer blocker comunicado es `validateSessionAgainstTrainingContract/data_sufficiency`, `SESSION_CONTRACT_INVALID`, `PRESCRIPTION_DATA_MISSING`. El provider acabó con `end_turn`, sin indicación de truncamiento. No se dispone de intent, contrato ni propuesta del sábado ni de los tres controles.

Por tanto no son conocidos discipline, adaptationId, methodId, stimulusId, structureId, role, pool, movimientos seleccionados ni señal faltante del sábado real. No se deducen de títulos, disponibilidad o resultado de los otros días. No hay reproducción equivalente demostrada ni clasificación causal A/B/C/D/E/F del incidente. El defecto de observabilidad sí está demostrado.

## Semántica y emisores exactos

`lib/prescription/dataSufficiency.ts::resolveDataSufficiency` decide a partir de evidencia estructurada: todos los elementos de un requirement deben estar `available`. Sin evidencia suficiente, fallback autorizado ni alternativa viable, devuelve `missing_required_data` y diagnóstico `PRESCRIPTION_DATA_MISSING` con signal `prescription`. Ese diagnóstico agregado no identifica un campo de dosis.

`lib/sports/prescriptionDataSufficiency.ts::movementPrescriptionRequirements` crea los requirements de catálogo siguientes. `resolvePrescriptionDataSufficiency` adapta la decisión sin reinterpretarla.

| Regla / condición | Dato exigido | Detalle previo | Diagnóstico SAFE |
|---|---|---|---|
| Movimiento inexistente o fuera de disciplina | `movement.authorized` | signal/estado, filtrado del log Builder | `unresolved_signal`, ubicación genérica de suficiencia |
| Equipment ALL / elección dentro de cada grupo ANY | `equipment.<catalogId>` disponible | `movement_equipment` y signal | ruta exacta de señal; categoría equipment y estado |
| technical_demand alta y no escalable, o patrón olympic_lift/inverted_locomotion | `skill.<discipline>.advanced` disponible | `high_technical_demand_without_safe_unknown_level` | ruta de skill conocida; categoría skill y estado |
| Intensidad numérica 1RM | Referencia compatible con movimiento | `reference.1rm:<movementId>`, `numeric_intensity_not_executable` | referencia de catálogo, expected executable_reference |
| Intensidad numérica HR | Referencia running bpm y capacidad HR | reference o `capability.canMeasureHeartRate` | distingue referencia y capacidad; no valores fisiológicos |
| Intensidad numérica pace | Referencia running seconds_per_km y capacidad pace | reference o `capability.canMeasurePace` | distingue referencia y capacidad |
| Prescripción de distancia | `capability.canMeasureDistance` disponible | `distance_not_measurable` | ruta exacta de capacidad |

Los estados no suficientes existentes son `unknown`, `unavailable` y `ambiguous`. No se inventan categorías de null/missing/type mismatch para el perfil original: la proyección canónica ya puede haberlos normalizado y no conserva esa distinción. El log informa `state_unknown`, `state_unavailable` o `state_ambiguous`. No significa que el campo físico del objeto estuviera ausente.

El core permite fallbacks cuando el caller los autoriza: RPE, equivalencia HR/pace explícita y alternativas de movimiento autorizadas. El validador final no activa esos fallbacks: comprueba la propuesta exacta.

`lib/sports/sessionAuthority.ts::generateTrainingSession` también devuelve el code `PRESCRIPTION_DATA_MISSING` si falla la reconstrucción del contrato con doseContext, antes de llamar al Builder. Incluye los errores del contrato y, cuando existen, decisión/pregunta de suficiencia. Esa rama no corresponde al stage comunicado del segundo intento.

`lib/sports/structuredSession.ts::validateSessionAgainstTrainingContract` primero comprueba shape, contrato, estructura/intent, pool, restricciones y dosis. Solo sin violaciones previas ejecuta suficiencia para cada movimiento de cada bloque, incluyendo warmup/cooldown. Por cada missingSignal añade `PRESCRIPTION_DATA_MISSING:<signal>`. Reps/duración/intensidad/formatDose incompletos o referencias inexistentes suelen fallar antes con `DOSE_*`, `SESSION_DOSE_*` o `BENCHMARK_RESOLUTION:*`. No son sinónimos de este code.

Equipment/skill se filtran también al construir el pool; son ramas reales del adaptador, pero no prueba de que una propuesta normal desde ese contrato las alcance. Una referencia admitida con capacidad desconocida o una distancia no medible sí se reproducen con propuestas completas que llegan al stage observado. No se atribuye ninguna al sábado.

## Por qué se perdía la causa

`builderDiagnostics.ts::safeViolations` solo conserva sufijos `sets`, `reps`, `durationSeconds`, `distanceMeters`, `restSeconds` o índices de hasta dos cifras. Descarta `capability.canMeasureDistance` y todos los demás sufijos de suficiencia. `builderTrace.emit` deriva FAILED_FIELD del string ya filtrado y pone EXPECTED y RECEIVED_TYPE_SAFE_SUMMARY literalmente a `unknown`.

El retry existente recibe `validation.violations` original, no la lista saneada del log. Por tanto ya recibe el sufijo de la señal. No se ha demostrado que recibiera solamente el code. Se conserva su texto y el máximo de dos intentos.

## Instrumentación

El validador admite un observador opcional de los missingSignals ya calculados, junto con índices de bloque/movimiento. No hay segunda evaluación, lecturas nuevas, cambios de orden, defaults ni cambios de resultados. Un fallo del observador no afecta al rechazo.

Session Generation convierte esas observaciones a metadata SAFE y las entrega a Builder Trace. Además del evento existente, se emite una línea JSON por detalle:

```json
{
  "FAILED_RULE": "PRESCRIPTION_DATA_MISSING",
  "FAILED_FIELD": "doseContext.sufficiency.signals.capability.canMeasureDistance.state",
  "EXPECTED_KIND": "available_signal",
  "RECEIVED_TYPE_SAFE_SUMMARY": "state_unknown",
  "PROPOSAL_PATH": "blocks[1].movements[0].prescription",
  "MISSING_CATEGORY": "capability"
}
```

Tag: `SESSION_PRESCRIPTION_DATA_MISSING_DETAIL`. También lleva planningRunId, builderInvocationId, hash del contrato, day y attempt. Las referencias solo conservan IDs del catálogo `referenceQuestionFields`; IDs no reconocidos se sustituyen por ruta genérica. Nunca se emiten valores de referencia. No hay prompts, respuesta del provider, perfiles, títulos, objetivos, descripciones, tokens ni texto libre.

Máximo 32 detalles por intento; cada línea informa totalCount y truncated. El evento agregado informa failureTotalCount/failuresTruncated si hay exceso. JSON plano evita arrays anidados colapsados en Vercel. Los errores del logger/serialización se capturan y no cambian resultado.

## Comparación 3d1794c → 40f5572

Sin diferencias en SessionDoseContext, prescriptionDataSufficiency, prescriptionSignals, sessionDose ni allowedTrainingContract. En structuredSession cambiaron imports y selección del renderer, no parsing ni validation. SessionGeneration solo añadió selección de versión al render posterior a validación. Los productores de exposición conservan título legacy al leer sesiones v2. No hay evidencia de una transformación que altere señales, referencias, preservación de propuesta o el orden de validación de esta rama.

Conclusión: el mecanismo de rechazo y la pérdida del sufijo ya existían en 3d1794c. No se puede certificar qué habría ocurrido con el run real en esa versión porque faltan sus inputs; tampoco hay evidencia para atribuir una regresión a 40f5572.

## Warning de objetivo

El guard en `app/api/chat/route.ts` impide añadir a updates.objetivo_principal un cambio sin confirmación explícita. No emite este error ni modifica señales de suficiencia. Su log no prueba causalidad sobre el sábado; no hay vínculo directo demostrado. La existencia de calendario y tres sesiones completas es consistente con un guard independiente, no suficiente para reconstruir inputs. No se modifica.

## Pruebas y aceptación

`sufficiencyDiagnostics.test.mjs` reproduce las ramas del adaptador, rechazo integrado de capacidad HR y distancia, referencias/dosis inválidas que fallan antes, estados canónicos distintos, dos rechazos cerrados, señal visible en retry ya existente, privacidad, límite, errores de observador/logger, y controles sintéticos válidos con igualdad de prescripción legacy/v2. Los controles no se presentan como miércoles/jueves/viernes de producción.

No se declara 4/4 de la semana real ni se sustituye por un fixture inventado de Week Integrity. Bajo el alcance revisado, la aceptación es observabilidad y preservación del rechazo; hace falta desplegar esta instrumentación y repetir la generación para establecer causalidad y elegir cualquier fix funcional.

Archivos: `lib/sports/builderDiagnostics.ts`, `structuredSession.ts`, `sessionGeneration.ts`, `sufficiencyDiagnostics.test.mjs` y este informe.

Validación final: 8/8 tests nuevos; 155/155 específicos (suficiencia, Builder, Session Authority, Human Renderer y Whole Week); suite global 1583/1583, cero fallos/omitidos. TypeScript y diff-check correctos. ESLint: un error preexistente en builderDiagnostics (`no-explicit-any`), idéntico a HEAD; los otros tres archivos de código tienen cero errores/avisos. Delta de deuda cero. Sin migración, commit local y sin push.
