# Session execution authority

## 1. Auditoría de HEAD antes de modificar comportamiento

Base inspeccionada: `5b399af`. Ruta: Weekly admitted slot → `sessionAuthority.generateTrainingSession` (contexto/freshness) → `buildAllowedTrainingContract` → `generateContractSession` → `parseStructuredSession`/`checkSessionShape` → `resolveSessionMovement` → `validateSessionAgainstTrainingContract` → `validateSessionDose`/suficiencia/referencias/tiempo → render profesional/humano → firma HMAC → `verifySessionReceipt`/`assertFreshSessionRestrictions` → guard semanal/CAS.

Clasificación de los rechazos presentes:

| Grupo de condiciones | Clase | Decisión |
| --- | --- | --- |
| Identidad, scope/ownership, disponibilidad, pasado/completados/externos, contrato/firma/digest/freshness/CAS | A FACTUAL_HARD_LIMIT | Conservar |
| Equipo/capacidad ausente; requerimiento crítico desconocido | A / B SAFETY_HARD_LIMIT | Conservar UNKNOWN, sin inventar permiso |
| MOVEMENT_RESTRICTED, UNKNOWN_SAFETY, GENERATED_RESTRICTION_UNKNOWN; familia/modificador irresoluble para validar seguridad | B | Conservar |
| Referencias exactas, %1RM sin ancla, HR/pace incompatibles, referencia prestada a variante | A / B | Conservar |
| Shape, identidad duplicada ambigua, unidades, números inválidos, bounds anticorrupción, cardinalidad de couplet/triplet, continuous interrumpido, ciclo work/rest contradictorio | C EXECUTION_INTEGRITY | Conservar |
| DOSE_SIDE_REPS_REQUIRED, volumen analítico no cuantificable, duración no acotada solo por falta de modelo analítico | D ANALYTICS_COMPLETENESS | Separar del rechazo de ejecutabilidad |
| Fuerza obligatoriamente sets+reps+rest, running solo tiempo/distancia, RIR prohibido por patrón, cooldown sin %RM, preparación distinta por obligación | E SPORT_POLICY | Retirar de la vía nueva; validar lo propuesto |
| FORMAT_NOT_ALLOWED condicionado a box, metcon exige rounds Y cap, complex exige rest numérico aun siendo ejecutable | E mezclado con C | Conservar gramática/consistencia; retirar exigencia deportiva universal |
| Ausencia total de dosis útil | C | Rechazar como EXECUTION_INSTRUCTION_INCOMPLETE |
| Veto de pool/mapping/suitable_for | E | Ya retirado en v4; no reintroducir |

El `DOSE_SIDE_REPS_REQUIRED` real de HEAD comprueba **perSide=true y ausencia de reps**. No consulta si el movimiento es unilateral. Por tanto un movimiento por tiempo y lado puede activar el error; «3×8» sin perSide ya pasa esa condición. No se dispone del payload de producción para afirmar cuál fue su dosis exacta. La regresión debe reproducir las dos violaciones con dos movimientos por tiempo/lado y probar por separado reps sin semántica de lado.

Las policies de tiempo no seleccionan objetivos para open_coach (`sessionTimeDosePolicy` solo contempla adaptation y su registro está vacío). La autoridad de método no resuelve una policy para open_coach y no exige una dosis: el cierre restante se encuentra en validación/render/estimación. El prompt sí seguía describiendo requisitos universales heredados que deben cambiar junto al validador.

Contexto suministrado: intent y scope firmados, doseContext con referencias/tiempo/señales/estrategia/vecinos, restricciones, exposición, perfil canónico, historial, ciclo/objetivo/desarrollo cuando constan, physiology/readiness, evidencia de carrera y `currentWeek` con sesiones hermanas. No se necesitan cambios en Weekly ni nuevos datos inventados.

## Diseño de compatibilidad

Mantener Session contractVersion 4 y schemaVersion 2. Añadir un discriminante de policy de ejecución **firmado** a contratos v4 nuevos. Su ausencia mantiene validación y render anteriores, incluso en v4 histórico: la firma de una propuesta antigua verifica también el texto renderizado, por lo que cambiar silenciosamente esa representación rompería receipts. No se modifica la reconstrucción de hechos ni se migra un recibo.

La extensión de dosis será una instrucción acotada con gramática de cantidades/esfuerzo/calidad, nunca texto libre ejecutable. Los valores inequívocos se resuelven en campos estructurados y cualquier contradicción se rechaza. Referencias objetivas exigen además la expresión estructurada y su autorización normal. Todo el texto debe resolver: no se buscan fragmentos válidos dentro de frases arbitrarias.

## 2. ROOT CAUSE / AUTHORITY BEFORE

La regla lateral exigía reps para cualquier `perSide=true`. Esa condición confunde una dimensión de contabilización con ejecutabilidad: «30 segundos por lado» es una orden ejecutable sin repeticiones. Además, fuerza/intervalos/metcon exigían combinaciones universales de campos y el estimador convertía falta de cuantificación y tiempos operativos supuestos en motivos de rechazo.

## 3. AUTHORITY AFTER

Weekly mantiene su intención admitida, adaptación/estímulo, patrón y rol. Session Coach decide movimientos, combinaciones, dosis, intensidad, descansos y composición dentro de los hechos suministrados. Forge resuelve representación, referencias y compatibilidad, calcula lo objetivamente calculable y conserva UNKNOWN cuando solo falta cuantificación. No se modifica Weekly ni el lifecycle de restricciones.

## 4. HARD GUARDRAILS RETAINED

- Identidad del atleta, scope/ownership, disciplinas gestionadas, disponibilidad, preservación, intención semanal y patrón principal.
- Contrato firmado, MAC, vinculación Weekly/Session y sesiones hermanas, expiración, comparación de contenido renderizado, freshness de restricciones/referencias/equipo/tiempo y CAS existente.
- Equipamiento y skill/capacidad requeridos: unavailable rechaza como ausencia factual; unknown no se declara available.
- Restricciones canónicas hard y reassessment: incompatibilidad, exclusión explícita, cambios de geometría y UNKNOWN_SAFETY relevantes mantienen rechazo.
- Resolución de identidad/familia/modificadores y gramática de estructura. Nada de nombres opacos o garantías de seguridad autodeclaradas.
- Referencias existentes y compatibles: ancla exacta para %1RM, prohibición de préstamo a variantes, compatibilidad de HR/pace y capacidad de medición. Kg siguen derivados por código.
- Schema y claves exactas; tipos/unidades/rangos; números no finitos, negativos y ceros inválidos; bounds de cantidades por entrada/sesión y distancia multiplicada por lados/rondas.
- Identidad duplicada ambigua, cardinalidad de couplet/triplet, continuo interrumpido, ciclos incoherentes, tiempos/tempo contradictorios y trabajo medible que no cabe en el reloj o ventana de trabajo.
- Presupuesto temporal calculable: duración/descanso/cadencia expresos y referencias compatibles se comparan con el techo. No se exige llenar ese techo.

## 5. VALIDATORS DOWNGRADED/REMOVED

Solo bajo `executionPolicy=coach-executable-v1`:

| Regla anterior | Tratamiento nuevo |
| --- | --- |
| DOSE_SIDE_REPS_REQUIRED | No es rechazo: perSide puede aplicarse a reps, tiempo o distancia; ausencia no se rellena |
| DOSE_REQUIRED | EXECUTION_INSTRUCTION_INCOMPLETE si no hay cantidad, esfuerzo o instrucción útil |
| DOSE_VOLUME_CONFLICT (exactamente una dimensión) | Pueden conservarse dimensiones complementarias; contradicción tiempo/tempo continúa rechazando |
| SESSION_DOSE_INCOMPLETE:INTENSITY | Intensidad numérica no universalmente obligatoria; cualquier intensidad usada sí se valida |
| SESSION_DOSE_INCOMPLETE:STRENGTH_SETS_REPS_REST | Se valida ejecutabilidad, sin plantilla deportiva universal |
| DOSE_RUNNING_RIR_UNSUPPORTED / SESSION_DOSE_INCOMPLETE:RUNNING_VOLUME | No hay veto por patrón; sigue siendo necesaria una instrucción útil y referencia válida si se usa |
| SESSION_DOSE_INCOMPLETE:METCON_VOLUME | Sustituido por comprobación de ejecutabilidad común |
| DOSE_FORMAT_NOT_ALLOWED por disciplina o familia | Se valida la gramática concreta, no pertenencia deportiva |
| SESSION_DOSE_INCOMPLETE:ROUNDS_TIME_CAP / COMPLEX_ROUNDS_REST | No obligar simultáneamente cantidades y descansos/cap numéricos; campos presentes deben ser coherentes |
| SESSION_DOSE_INCOMPLETE:INTERVAL_COUNT_RECOVERY | Se conserva un número de intervalos/rondas ejecutable; el descanso numérico deja de ser universal |
| DOSE_COOLDOWN_LOADED_STRENGTH | Elección deportiva, sin exención de referencia/restricción/dosis |
| DOSE_PREPARATION_IDENTICAL_TO_MAIN | No veto deportivo automático; se conserva contexto de repetición y whole-week |
| SESSION_DURATION_ESTIMATE:UNBOUNDED_WITH_FINITE_BUDGET | UNKNOWN analítico no bloquea por sí solo. Se muestra el techo disponible y no una duración inventada |
| Máximo operativo 6 s/rep + 120 s/transición como límite hard | No se convierte una estimación universal en hecho. La vía nueva usa tiempo/cadencia expresos y deja el resto parcial |

Mapping, suitable_for y pools ya no eran veto en v4 y se conservan así. No se ha borrado ninguna librería ni agregado una taxonomía de permiso. Las policies heredadas de targets/intensidad/dosis siguen intactas para sus contratos; no se emiten para esta intención open_coach.

## 6. OPEN REPRESENTATION

Se añade `MovementDose.doseInstruction?: string` con máximo 180 caracteres. La gramática admite cantidades enteras de series/reps, cantidades de tiempo/distancia, indicación explícita por lado, pasadas controladas, trabajo técnico/cualitativo y esfuerzo RPE/RIR. Son reglas de representación combinables, no una lista de ejercicios permitidos. El texto completo debe resolver; cualquier sufijo adicional, movimiento oculto, equipo o afirmación de seguridad invalida la instrucción.

Ejemplos: `3 x 8 por pierna` resuelve sets/reps/perSide; `3 series moderadas` resuelve sets y conserva la cualificación; `trabajo técnico y fluido a RPE 6` resuelve intensidad y conserva instrucción. No se añaden reps ni perSide inexistentes. La resolución no modifica el input: produce la propuesta estructurada que luego se valida, renderiza, firma y guarda, junto con la instrucción original. Conflictos con campos existentes rechazan y la comparación no depende del orden JSON.

Un literal `%1RM`, ppm/bpm o min/km necesita también `intensity` estructurado con referenceId. El validador normal exige referencia compatible; además el literal debe concordar con su valor/rango. Un string no concede referencia, movimiento ni equipamiento. La gramática rechaza kg libres y trabajo adicional encubierto. Todas las cantidades extraídas pasan por los mismos bounds.

Los renders profesional, human_v2 y human_v3 conservan la instrucción. Si la duración total no puede calcularse, indican el máximo disponible sin inventar total. La metadata identifica sideSemantics UNKNOWN cuando falta perSide. El adaptador analítico deja repeticiones/tonelaje desconocidos en ese caso, conserva datos expresados y no cambia instrucciones para cuadrar analytics. No se infiere lateralidad desde el nombre del ejercicio.

## 7. PRODUCTION INCIDENT REGRESSION

Test exacto: `production-equivalent double DOSE_SIDE_REPS_REQUIRED: two timed unilateral movements pass on first attempt`, en `lib/sports/sessionExecution.test.mjs`.

Contiene Bulgarian split squat y single-leg RDL con 3×30 segundos, perSide=true, RPE 6 y 60 segundos de descanso. Las dos entradas cumplen la condición antigua; el validador histórico devuelve el código deduplicado. La nueva generación acepta en una sola llamada, conservando tiempo/lados sin inventar reps. Otro test conserva ambos movimientos con 3×8 y perSide ausente, sin inventarlo. Es una reproducción de la condición técnica, no una reconstrucción afirmada del payload ausente de producción.

## 8. LEGACY COMPATIBILITY

Session v1-v3 permanecen en sus reglas. Session v4 histórico sin executionPolicy también conserva reglas y render anterior. Los nuevos v4 llevan `coach-executable-v1` dentro del contrato firmado y metadata guardada. Se conservan schemaVersion 2 y los envelopes de firma actuales. No hay nueva versión mayor, migración silenciosa ni reconstrucción de recibos. Un test verifica HMAC histórico y rechaza sustituir la policy sin volver a firmar.

## 9. FILES CHANGED

| Archivo | Razón |
| --- | --- |
| lib/sports/sessionExecution.ts | Discriminante firmado, gramática, resolución y prompt ejecutable |
| lib/sports/sessionExecutableDose.ts | Ejecución/formato/tiempo explícito, sin plantillas deportivas de dosis |
| lib/sports/allowedTrainingContract.ts | Emisión y validación de policy solo para v4 nuevo |
| lib/sports/structuredSession.ts | Parse/resolución versionados; render de la propuesta resuelta |
| lib/sports/sessionDose.ts | Mantener validación legacy y despachar ejecución nueva; referencias conservadas |
| lib/sports/sessionGeneration.ts | Prompt y parser de ejecución, mismo presupuesto de dos intentos |
| lib/sports/sessionAuthority.ts | Parser de reparación bajo la policy del recibo original |
| lib/sports/sessionProfessionalRenderer.ts | Instrucción, metadata analítica y duración parcial |
| lib/sports/humanCoachingProjection.ts | Instrucción y cantidades parciales en human_v2/v3 |
| lib/trainingLoad/prescriptionLoadAdapter.ts | Consumir representación nueva sin inventar lados/descanso |
| lib/trainingLoad/trainingLoad.ts | Repeticiones/volumen UNKNOWN cuando la dimensión lateral es desconocida |
| lib/sports/sessionExecution.test.mjs | Regresiones de incidente, seguridad, representación, recibos y cadena real |
| docs/session-execution-authority.md | Auditoría y este informe |

## 10. TEST RESULTS

31/31 pruebas nuevas aprobadas. 102/102 pruebas focalizadas existentes de StructuredSession, dosis y Open Coach aprobadas. La nueva integración ejecuta Weekly → dos Builders → validación de guardado firmado, conserva siblings, acepta una revisión KEEP, rechaza contenido alterado y revoca ante cambio factual. Los tests existentes de seguridad, referencias, tiempo, versiones legacy y CAS no se debilitan.

Suite completa: **2390/2390 aprobados**, 0 fallos, 0 omitidos; duración 523894.7532 ms. Ejecutada con Node y concurrencia 4 sobre todos los `.test.mjs`/`.test.cjs` de lib y app descubiertos mediante `rg --files --no-ignore`. Incluye Session/StructuredSession, Weekly→Session, restricciones, referencias/intensidad, tiempo, receipts/freshness/save/CAS y compatibilidad legacy. Los logs permanecen en el directorio temporal del sistema, fuera del repositorio.

## 11. TYPECHECK / DIFF CHECK

`npx tsc --noEmit`: exit 0. `git diff --check`: exit 0. Los cuatro archivos nuevos también se comprobaron con `git diff --no-index --check`, sin errores de whitespace.

## 12. REMAINING LIMITATIONS

- No es un intérprete general de lenguaje natural. Instrucciones fuera de la gramática requieren representación estructurada o resolución adicional; no se aceptan por confianza en el LLM.
- El resolver de movimientos sigue siendo el híbrido existente: canónicos y variantes tipadas de familias conocidas. Una familia o geometría sin semántica suficiente puede seguir rechazando. No se amplió catálogo ni se inventó compatibilidad biomecánica.
- Sin cadencia, duración, descanso o semántica lateral suficiente, duración total y/o tonelaje pueden quedar UNKNOWN. No se garantiza un total exacto: se mantiene el techo indicado al atleta y se rechaza cualquier exceso computable. No se promete una medición fisiológica a partir de reps.
- La metadata actual no permite inferir con autoridad el lado de todos los movimientos; por eso la contabilidad lateral no se completa desde nombres. La carga unitaria calculada de un %RM válido permanece exacta aunque el volumen total quede parcial.
- La revisión whole-week sigue usando su policy firmada existente. No se convierte una advertencia en veto nuevo ni se modifican contratos legacy de repetición.
- La aceptación deportiva y el incidente real necesitan comprobación posterior en producción. Los tests prueban conexión/integridad local, no calidad clínica ni una recuperación del atleta.

## 13. VERDICT

DESIGNED: sí. CONNECTED: sí. VERIFIED LOCALLY: sí, pruebas específicas, cadena completa y suite global aprobadas. PROVEN IN PRODUCTION: no.

Sin cambios DB/schema, sin datos de producción, sin commit, push ni deploy.
