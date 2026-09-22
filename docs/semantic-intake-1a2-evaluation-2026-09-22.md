# Fase 1A.2 — hardening y reevaluación

**NOT READY para Fase 1B.** La implementación permanece en shadow. El lote y las adjudicaciones medidos se detallan debajo; mejorar coherencia estructural no equivale a demostrar entailment semántico.

## Causas y diseño

La [auditoría previa](semantic-intake-1a2-audit-2026-09-22.md) fue comunicada antes de editar código y reconstruye las72 contradicciones de aclaración,17 temporales,3 citas no literales,77 rechazos y15 errores aceptados. Los tres contadores se solapan. El error restante era EXPLICIT con valor null. La revisión global de tres booleanos no exigía comprobación por campo; la plausibilidad suplía evidencia. Scope máximo de alternativas más fallback longitudinal explicaban94 scopes longitudinales,77 automáticos.

El networkFailure anterior es compatible con EACCES de red del sandbox, no un defecto del endpoint Anthropic; el runner anterior descartó la excepción y no permite demostrar retrospectivamente más. En la fase anterior también se corrigió el tamaño de gramática JSON Schema mediante deduplicación estructural, preservando el contrato. Esta fase no cambia el transporte, proveedor, modelo, timeout ni max_tokens. La credencial sigue limitada al evaluator local; no se introduce en producto ni artefactos y el archivo original se conserva.

Pipeline v2: SemanticInput validado → Anthropic/JSON Schema → decode estricto y evidencia por fuente → IR temporal tipada/resolver civil → campos derivados → requisitos proporcionales propuestos → reviewer de entailment exhaustivo → scope efectivo si se acepta, null/unassessed si no. Ninguna etapa carga contexto ni ejecuta una intención.

| Dato | Fuente única / tratamiento |
| --- | --- |
| type, operation, sujeto, atribución, modalidad, condición | Interpretación LLM; revisor comprueba significado y soporte |
| fields.name, basis, valueJson, evidence | LLM; EXPLICIT/INTERPRETED no autoriza inferencia plausible |
| UNKNOWN / unknownFields | Derivado exclusivamente de valor null; no se completa el hueco |
| evidencia | LLM propone sourceId+cita; código liga fragmento literal a fuente, rol y autoridad |
| temporal.expression + relationJson | LLM interpreta relación; decoder valida unión tipada |
| effectiveTime.status/granularity/startDate/endDate | Resolver determinista sin acceso a lenguaje humano |
| convención semanal | Solo input.calendar.weekStartsOn explícito; si falta, fechas desconocidas |
| unresolved | Incertidumbre semántica LLM + referencias calendáricas ausentes derivadas |
| requiresClarification | unresolved.length >0; eliminado del wire |
| contextNeed.scope | Una necesidad interpretada, revisada por suficiencia y proporcionalidad |
| scopeAlternatives | Eliminado; incertidumbre no significa máximo contexto |
| ContextRequirements | Catálogo por scope, deduplicado, NOT_LOADED/CONTEXT_ONLY |

INTERPRETED exige consecuencia del mensaje/contexto autorizado. El revisor intenta construir contraejemplos, evalúa también nombres de campos (roles no solo valores), separa sujeto de fuente citada y verifica modalidad/condición. Audita cada proposición, valor conocido, relación temporal, duda y scope. No recibe las razones autojustificativas del intérprete ni sus fechas calculadas; recibe fuente y targets. Omitir/duplicar un target, evidencia inválida, contraejemplo, no entailment o pérdida de cobertura impiden aceptar el candidato completo. El mismo proveedor/modelo mantiene correlación: esto reduce confirmación mecánica, no demuestra independencia estadística.

El resolver opera solo con REPORT_DAY, DAY_OFFSET, WEEKDAY, WEEK_BOUNDARY, CIVIL_DAY y relaciones POINT/INTERVAL/CALENDAR_WEEK/CALENDAR_MONTH/UNRESOLVED. Opera en fecha civil de la zona horaria; no resta24h de un instante durante DST. Falta de convención/año conserva relación y deriva unresolved. No reconoce palabras humanas. Los enums son estructura del contrato, no una lista de frases aceptadas.

## Cambios y aislamiento

- Nuevos `semanticInput.ts`, `semanticTemporal.ts`, `semanticEntailment.ts`: input/evidencia, calendario puro y revisión por afirmación.
- `semanticInterpretation.ts`, `semanticIntakeShadow.ts`, `contextRequirements.ts`: wire v2, derivaciones, gate y scope desconocido sin fallback longitudinal.
- `semanticIntakeTestSupport.mjs`, `semanticHardening.test.mjs`, adaptación de `semanticIntakeShadow.test.mjs`: compatibilidad de mocks antiguos y propiedades nuevas. El adapter vive solo en tests y nunca extrae lenguaje de fixtures en producto.
- `evaluateSemanticIntake.mjs`: salida AFTER separada, verificación del corpus contra baseline y hashes ampliados. Criterios y prompt del juez sin cambios.
- `summarizeSemanticIntake1a2.mjs`: comparación offline, categorías, anotaciones, llamadas, latencias y scopes. Sin credenciales ni provider.
- Documentación, snapshot previo, resultados, adjudicaciones, resumen y diff de esta fase.

No se modificaron durante1A.2 `app/FormaPro.tsx`, la API shadow, `/api/chat`, Availability, Coach, planning, loaders ni escritores. La instrumentación de FormaPro ya estaba en el árbol al empezar. Sin commit ni push. Las búsquedas literales en validadores comprueban evidencia/IDs y sintaxis de protocolos, nunca significado; la cobertura Unicode del reviewer comprueba caracteres, no frases. No hay whitelist lingüística, sinónimos, aliases ni branches por fixture.

## Pruebas offline y regresiones

Antes del cambio:45/45 tests de shadow/evaluación. Después, antes de live:

```text
node --test lib/chat/semanticHardening.test.mjs lib/chat/semanticIntakeShadow.test.mjs lib/chat/semanticEvaluationClassification.test.mjs
64 tests:64 PASS
npx tsc --noEmit --incremental false
exit0
```

Propiedades nuevas: todos los weekdays/direcciones/ocurrencias sobre límites de año y bisiesto; ciclo gregoriano400 años; siete convenciones semanales; DST y zonas horarias; intervalos y extremos abiertos; datos ausentes; rechazo de IR malformada; estados derivados; campos arbitrarios no respaldados; cobertura de todos los targets; veto de sujeto/modalidad/tiempo; atribución histórica; scope local con aclaración; vocabulario abierto de dominios; integridad SHA-256 del corpus y baseline. Son pruebas de contratos y mecanismos con mocks, no un sustituto del live.

24 suites de regresión,774 tests: **773 PASS,1 FAIL preexistente** en `lib/planning/weeklyAvailabilityDiagnostics.test.mjs:47` (`null` frente a `non_string_member`). El mismo fallo ya estaba documentado en baseline/HEAD; no se modifica lógica productiva para ocultarlo. Incluyen Availability (fallback/regression/snapshot/declaration), trainingAvailability, chatAvailability, ejecución/intención de sesión, preflight/save/calendar/generation de planificación, autoridades athlete/goal/event y los tres contratos Coach.

## Límites y riesgos observados

El gate estructural puede probar forma, cobertura de targets y consistencia; no puede probar que el LLM haya entendido correctamente cada afirmación. Los campos libres pueden introducir especificidad a través de su nombre. Los scopes nominales congelados se contrastan con los requisitos solicitados, no solo con la opinión del juez. Reducir LONGITUDINAL mediante rechazos UNASSESSED no se presenta como mejor selección semántica.

La revisión por targets aumenta tokens y latencia. Algunos outputs separan conectores en coverage sin IDs asociados: el contrato los rechaza aunque las proposiciones sean correctas. Otros reviewers confunden incertidumbre calendárica con relación no respaldada, o rechazan generación semanal longitudinal pese a la definición del scope. Estas discrepancias se conservan, sin reparación posterior ni nuevos prompts durante el lote.

La anotación directa de Codex es otra evaluación semántica, no certificación humana ni prueba de fiabilidad poblacional. Tres repeticiones no establecen tasa de error en producción. El resultado final se decide por errores aceptados, cobertura, contrato y proporcionalidad, no por porcentaje PASS aislado. No se habilita autoridad productiva.

La columna BEFORE conserva la clasificación publicada, no reescribe retrospectivamente el baseline. La relectura de K21 muestra que la especialización de «dos días» como frecuencia semanal también estaba en sus tres candidatos BEFORE, todos bloqueados: no había sido contada como invención en aquel informe. Por eso los totales semánticos son errores detectados por auditoría, no una verdad exhaustiva; no se atribuye a1A.2 la aparición de esa clase de error. Los15 errores aceptados BEFORE permanecen como referencia publicada. Los inputs y expected semantics permanecen idénticos.
