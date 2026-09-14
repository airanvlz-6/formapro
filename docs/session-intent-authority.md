# Session intent as coaching direction — local authority change

Base auditada: `15d73b8`. Run comunicado: `cc616ecf-041b-4f09-b6e2-28f5c467c2ce`, semana `2026-09-14`, lunes, cinco Builder targets, dos intentos bloqueados por INTENT_NOT_SATISFIED en validateSessionAgainstTrainingContract.

**PRODUCTION_PAYLOAD_UNKNOWN:** el usuario confirmó que no conserva ni el Weekly intent ni la Session proposal de este run. No se le atribuyen halterofilia, fuerza, ningún patrón ni los movimientos del run anterior. Lo probado es que este predicate bloqueó ambos intentos después de superar shape.

## Informe de los 15 puntos

1. **Ubicación:** una sola emisión de INTENT_NOT_SATISFIED en structuredSession.ts (HEAD de entrada, líneas 141–143). Se conserva únicamente para contratos fuera de Session v4 + coach-executable-v1. Las otras coincidencias del repositorio son tests.
2. **Predicate exacto anterior:** si existe intent distinto de stimulus_only, exige `main.some(entry => resolvedMovement(entry)?.descriptor.movement_pattern === contract.intent.pattern && (entry.variant || contract.allowedMovementIds.includes(entry.movementId)))`. Un `some` false producía el hard failure.
3. **Intent real:** UNKNOWN. Shape soportado por el contrato: stimulus_only, main_pattern, adaptation u open_coach. Open Coach transporta discipline, adaptationId, stimulusId, pattern, role y método admitido; no significa que el run concreto tuviera ninguno de los valores sintéticos usados en tests.
4. **Comparación:** solo main; igualdad literal de patrón; pertenencia al pool para canónicos; las variantes eluden ese segundo término pero deben resolver su descriptor. No compara directamente método, Method Library, Stimulus Library, reps, tiempo ni referencias. Las bibliotecas intervienen antes al construir contratos y resolver descriptores/candidatos. La preservación del contrato sigue verificándose, pero sus candidatos no constituyen una plantilla deportiva para Session.
5. **Por qué pudo fallar:** el predicate no encontró ninguna entrada que satisficiera ambos términos. Esto cubre patrón diferente, descriptor ausente o canónico fuera de candidatos. No hay evidencia para elegir cuál ocurrió. No se reconstruye un payload de producción a partir del código.
6. **Factual frente a semántico:** igualdad de patrón es F (política/correspondencia deportiva); pertenencia al pool en esta expresión es D (mapping), no prueba de scope. La absence de descriptor produce UNKNOWN, no demuestra contradicción del intent. Una identidad física irresoluble puede impedir verificar requisitos y seguir siendo hard por esa razón independiente. El binding exacto de stimulus/discipline declarada es B (autoridad/scope); referencias y restricciones factuales siguen en sus validadores A/C.
7. **Shape:** checkSessionShape permanece como API. Para execution policy ejecuta el inspector de representación y conserva sus diagnósticos advisory; si el inspector no admite, usa interpretación mínima. Conserva metadata extra en la propuesta firmada, sin ejecutarla ni renderizarla como trabajo. Normaliza discriminadores decorativos, orden de bloques, versión omitida de receta v1 y una identidad alternativa canónica explícita conocida. No inventa dosis ni operaciones deportivas. El inspector histórico se conserva como inspectSessionRepresentation. Los checks sustantivos usan después una proyección de campos ejecutables: cantidades, referencias, reloj, identidad y conflictos se validan sin convertir metadata en veto. Repeticiones de entradas se conservan y suman; no se deduplican ni se pierde trabajo.
8. **Guardrails:** identidad/prescription/estructura mínima utilizable, contradicciones de identidad, trabajo adicional estructurado o dosis paralelas ambiguas, instrucciones que esconden trabajo, referencias falsas/%RM/HR/pace, números inválidos, tiempo computable, equipo/capacidad, restricciones relevantes/UNKNOWN_SAFETY, scope, firmas, freshness y CAS permanecen hard. No se inventa RM, ni se reduce una restricción a advisory. Falta de explanation deja de abortar esta policy: no es ejecución ni evidencia factual.
9. **Tres estados:** SATISFIED = evidencia positiva de patrón o intent sin patrón; UNKNOWN = no se ha demostrado correspondencia deportiva; CONTRADICTED = binding de stimulus o disciplina explícita distinto del contrato. UNKNOWN no selecciona otra sesión ni crea analytics numéricos. La validación factual puede rechazar una sesión UNKNOWN/SATISFIED por razones independientes de correspondencia deportiva. No se inventan incompatibilidades deportivas para producir CONTRADICTED.
10. **Tests nuevos:** positive match; evaluación independiente de pertenencia a candidatos; implementación alternativa bike; contradicción de binding; scope disciplinar; restricción activa; metadata/discriminadores advisory; identidad alternativa y conflicto; receta enriquecible sin semántica nueva; entrada/identidad/dosis inutilizables; hidden work/referencia falsa/tiempo imposible; repetición con suma temporal; histórico estricto; logs correlacionados; ausencia de comentario no bloqueante. Receipts/freshness existente refuerza igualdad exacta del intent firmado; contexto entre sesiones y review semanal siguen cubiertos.
11. **Suite completa:** resultado final al pie.
12. **TypeScript:** resultado final al pie.
13. **Diff:** resultado final al pie. Cambios en shared Session y tests; sin Athlete State, DB, periodización ni ampliación de catálogos.
14. **Limitaciones:** no se prueba la corrección del run real sin nuevo despliegue/evidencia. UNKNOWN se refiere a compatibilidad deportiva, no es permiso para omitir requisitos físicos irresolubles. Una receta con operación desconocida o un reloj opaco puede seguir bloqueando porque no permite establecer identidad/requisitos/ejecución; no se implementó semántica olímpica. Metadata adicional es inerte; no se convierte prosa arbitraria en ejecución. El inspector sigue reutilizándose sobre la proyección ejecutable para límites numéricos, referencias y coherencia: no se han convertido esos errores sustantivos en advisory. El review semanal recibe el intent firmado y la propuesta, puede observarlos; no se modifica su política de revisión ni se añade un criterio deportivo nuevo.
15. **Status:** DESIGNED, CONNECTED y VERIFIED LOCALLY. PROVEN IN PRODUCTION: NO para este cambio. Sin commit, push ni deploy.

## Flujos y conservación histórica

Weekly admitted selection → contrato Session con intent inmutable → provider → JSON limitado → checkSessionShape (observación + normalización + estructura mínima) → proyección ejecutable y comprobaciones sustantivas → restricciones/referencias/equipo/capacidad/tiempo → receipt de contrato y propuesta final → rendering verificable.

Para receipts y contratos históricos fuera de execution policy permanece el comportamiento previo, incluido INTENT_NOT_SATISFIED. Las representaciones antes válidas bajo execution policy siguen usando el resultado original del inspector; no se les añaden campos o versiones innecesarios. Normalizaciones nuevas solo se aplican a outputs antes rechazados. El renderer sigue derivándose del contrato y la propuesta firmados. Ningún diagnostic modifica el contrato.

La lista allowedMovementIds sigue validada como parte de la integridad del contrato. No se permite falsificar el envelope para cambiarla. Esto es independiente de usar esa lista como veto deportivo a cada ejercicio: assessSessionIntent no la usa para rechazar. No se añade otra allowlist de patrones, disciplinas o métodos de entrenamiento.

## Diagnósticos

- SESSION_SHAPE_VIOLATION por entrada mantiene reglas y campos cerrados y añade advisory en la ruta moderna.
- SESSION_REPRESENTATION_ADVISORY cubre también errores representacionales globales sin ordinal fiable; solo códigos saneados y correlación run/day/attempt.
- SESSION_INTENT_ASSESSMENT añade run/day/attempt, estado, razón cerrada, kind/patrón/IDs de intent conocidos por catálogos y main con ordinal, familia canónica, patrón, exactPatternMatch e inCandidatePool. Los IDs deportivos abiertos no catalogados se redaccionan; no se loguean labels, método libre, perfil, prompt ni output completo.
- Los diagnostics de propuestas y decisiones usan la proyección ejecutable, para no incorporar nueva metadata arbitraria a logs existentes. El contexto firmado conserva sus datos íntegros.

El nuevo log permitirá saber qué comparación se hizo en otro run; no se usa para adjudicar valores a este incidente sin payload.

## Validación

- 18 tests nuevos en sessionIntentAuthority.test.mjs. Las copias exactamente iguales de dosis/cantidades no se confunden con trabajo adicional; una copia diferente sigue siendo hard. La igualdad compara estructura y valores, independientemente del orden de claves.
- Focalizados de intent/representación/ejecución/Open Coach/variantes/contratos históricos: 153/153 PASS antes de los últimos casos; verificación focalizada final de intent y ejecución: 49/49 PASS, incluyendo esos casos.
- Suite completa final: `rg --files --no-ignore lib app -g '*.test.mjs' -g '*.test.cjs'` y `node --test --test-concurrency=4 --test-reporter=spec`: **2450/2450 PASS**, cero fallos/cancelados/omitidos, 228.0 segundos. Incluye receipts, freshness, contexto de siblings y review semanal.
- `npx tsc --noEmit`: **PASS**.
- `git -c core.safecrlf=false diff --check`: **PASS**; comprobación UTF-8 y whitespace de los cuatro archivos nuevos: **PASS**.
- Nueve archivos locales modificados/añadidos. Logs temporales fuera del repositorio. No cambios de DB, Athlete State, periodización ni catálogos; no commit, push ni deploy.
