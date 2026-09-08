# Human Renderer v2

Base: `3d1794cfba2eaf7c53fd36ba1ee02509f13d0776`. Cambio exclusivamente de presentación; sin migración ni reescritura de planes históricos.

## Problema y arquitectura

El renderer histórico exponía identificadores, composición estratégica técnica y rangos de duración poco legibles. Además, duplicación, reglas científicas y Today dependían de ese texto: traducirlo directamente habría cambiado sus decisiones.

`humanPresentationLabels.ts` aporta metadata editorial explícita para 162/162 movimientos, 18 métodos, adaptaciones, estructuras, objetivos, fases, roles y métricas de referencias. `humanCoachingProjection.ts` transforma hechos autorizados en una proyección pura, determinista y serializable, sin React, Next ni LLM. `sessionHumanRenderer.ts` compone el texto y conserva íntegra la prescripción estructurada histórica, añadiendo únicamente `presentation`.

`sessionPresentation.ts` separa la presentación humana de `comparisonRepresentation`, derivada del renderer legacy. Duplicación, reglas científicas, exposición, preparación de contexto e intensidad/duración contextual de Today usan esa representación interna. No se cambian algoritmos ni umbrales. El texto real reportado por el atleta conserva su precedencia. Los labels no participan en selección, feasibility, restricciones o Dose Authority.

## Autenticación y compatibilidad

Las emisiones de `generateTrainingSession` firman `presentationVersion: human_v2`. `verifySessionReceipt` selecciona el renderer con esa evidencia autenticada; ausencia o `legacy` usa el comportamiento histórico. Valores desconocidos se rechazan. Se mantienen HMAC, dominio de firma, TTL de 30 minutos, comparación exacta de campos visibles y comparación de metadatos estructurados. Una alteración de `comparisonRepresentation` también falla. El repair conserva la versión del receipt original.

El receipt del calendario firma la versión para derivar el objetivo semanal al persistir. Los receipts anteriores conservan `renderWeekObjective`. Los algoritmos de digest, validación semanal y firma no cambian: los digests que incluyen el payload completo reflejan naturalmente los nuevos campos presentacionales y el nuevo texto. No se promete igualdad del hash de una sesión cuyo texto ha cambiado; sí igualdad de hechos deportivos y de su evidencia de contexto.

Los planes históricos se leen tal como están guardados. No se re-renderizan ni se sobrescriben. Mi Plan muestra el objetivo completo, sin anteponer otro prefijo, reconoce DURACIÓN y traduce fases conocidas solo en planes con sesiones v2.

## Ejemplos

`running_threshold` con intervalos: **Intervalos de umbral**. Con estructura continua: **Carrera continua de umbral**. Otros títulos: **Rodaje regenerativo**, **Fuerza de apoyo**, **Fuerza para carrera**, **Técnica de halterofilia**, **Trabajo gimnástico**.

Umbral: «Trabajo de umbral para tu preparación de media maratón.» Por qué: «Esta es una de las sesiones principales de tu preparación.» Dosis: «5 × 6 min · RPE 8», «Descanso entre intervalos: 3 min».

Fuerza: «Complementar tu preparación de media maratón con trabajo de fuerza.» Por qué: «Esta sesión añade trabajo de fuerza de apoyo a tu planificación.» Sentadilla búlgara: «3 × 8 por lado · RPE 7».

Objetivo semanal: oración completa basada solo en coverage incluida y roles autorizados. No presenta adaptaciones diferidas como ejecutadas. Carrera general conserva explícitamente «sin preparación específica de distancia».

Con `expectedSeconds`, duración aproximada en minutos; 2511 segundos se muestran como aproximadamente 42 min. Los valores exactos siguen en `structuredPrescription`. Sin expected se usa el rango disponible o se declara que no hay estimación acotada. No se calcula un midpoint ni se confunde disponibilidad con duración prevista. Descansos, tempo, dosis, cargas y referencias prescritas se conservan; no se añaden cues ni causalidad.

## Diagnóstico seguro

`HUMAN_PRESENTATION_FALLBACK`: solo `presentationVersion`, `entityType`, `fallbackType`. Máximo seis categorías constantes por render; sin IDs arbitrarios, texto de sesión, perfil, prompts o referencias fisiológicas. Fallar el logger no cambia el resultado. Un ID desconocido produce un label neutro.

## Archivos

- Nuevos: `lib/sports/humanPresentationLabels.ts`, `humanCoachingProjection.ts`, `sessionHumanRenderer.ts`, `sessionPresentation.ts`, `planPresentation.ts`, `humanPresentation.test.mjs` y este informe.
- Integración: `lib/sports/structuredSession.ts`, `sessionGeneration.ts`, `sessionAuthority.ts`, `prepareSessionTrainingContract.ts`, `exposureEngine.ts`.
- Contexto/semana: `lib/athlete/loadAthletePrescriptionContext.ts`, `lib/planning/prepareAllowedWeeklyPlanContract.ts`, `weeklyCalendarAuthority.ts`.
- Consumidores: `lib/validators/sessionDuplicationValidator.ts`, `scientificRules.ts`, `app/api/chat/route.ts`, `app/plan/page.tsx`, `app/FormaPro.tsx`.
- Harnesses existentes: `lib/physiology/presentationConsumers.test.mjs`, `lib/readiness/prepareCanonicalReadiness.test.mjs`, `lib/planning/weeklyTemporalOrder.test.mjs`; cargan los helpers reales al ejecutar las funciones extraídas.

## Cobertura y límites

Los tests agrupados cubren T1–T32: catálogos, copy, dosis, referencias, tempo, expected frente a disponibilidad, receipts históricos/v2, tampering, planes históricos, objetivo semanal, fixtures, igualdad profunda deportiva, duplicación, Today, reglas científicas, exposición y fallback. T33 corresponde a la suite global, que incluye Session Authority, Whole Week y rutas.

El fixture A usa un calentamiento sintético explícito para integrar el contrato completo. Del fixture B se conocen nueve movimientos y la estimación 1643–3379 / expected 2511 segundos, pero no todos los descansos de producción: el test de proyección inyecta esa estimación sin inventar los descansos. No pretende reconstruir ni validar la sesión de producción incompleta. Otro fixture completo comprueba la igualdad deportiva legacy/v2.

No se han probado pantallas móviles ausentes del repositorio ni hecho una sesión visual de navegador. La proyección compartida no depende de una plataforma. Los consumidores textuales históricos siguen siendo deuda técnica, ahora aislada del copy humano. Cambiar su algoritmo queda fuera de este trabajo.

## Validación final

- Tests específicos de presentación, consumidores fisiológicos, readiness y flujo temporal: 52/52.
- `node --test --test-concurrency=4 lib/**/*.test.mjs`: 1575/1575, cero fallos y cero omitidos; incluye los tests de receipts, duplicación y Whole Week.
- `npx tsc --noEmit`: correcto.
- `git diff --check`: correcto.
- ESLint en los 22 archivos de código modificados/nuevos: 500 errores y 60 avisos preexistentes, mismos totales por archivo que HEAD. Sin incremento por regla; los mensajes de React que incluyen extractos numerados cambian de ubicación. Los seis archivos nuevos de código/tests tienen cero errores y cero avisos.
- Informe incluido: documentación técnica segura, sin datos personales, secretos ni rutas temporales.
