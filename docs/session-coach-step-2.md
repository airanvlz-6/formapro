# FORGE — Paso 2: dosis y composición decididas por el Coach

Base auditada: `fc5e075`. Cambio local, sin commit, push, despliegue, SQL, migraciones ni acceso a datos de producción.

## A. Flujo antes

Weekly Coach seleccionaba un intent autorizado. `generateTrainingSession` construía `SessionDoseContext`, resolvía C2 y B3 y llamaba a `generateContractSession`. B3 podía convertir un habitual confirmado en una salida exacta, o una ejecución reciente en repetición obligatoria de movimiento, estructura, esfuerzos, trabajo y descanso. C2 seleccionaba una única intensidad y el prompt exigía copiarla. `fixedRunningPrescription` trasladaba esa sesión fija a la selección semanal. Builder proponía JSON, pero buena parte de la decisión deportiva ya estaba tomada.

## B. Auditoría de autoridad

| Módulo / función | Decisión anterior | Clasificación | Acción en nuevas sesiones |
|---|---|---|---|
| `resolveRunningMethodDose` / `AuthorizedRunningMethodDose` | Target, composición, progresión numérica autorizada | COACHING | RETURN_TO_COACH |
| `aerobicContinuityPolicy` | Habitual = duración exacta; un movimiento, un bloque continuo | COACHING / PRODUCT POLICY | ADVISORY |
| `runningExecutionReusePolicies` | Repetir ejecución completa reciente, incluidos esfuerzos y descansos | COACHING / PRODUCT POLICY | ADVISORY |
| Registro B3 v2 | Un selector numérico como requisito previo de prescripción | COACHING / PRODUCT POLICY | RETURN_TO_COACH; conservar familia y evidencia |
| B3 v1 congelado | Shares, caps, mínimos, bouts y descansos | PRODUCT POLICY | KEEP exclusivamente para contratos históricos |
| `runningIntensityPolicy` / C2 | Una métrica, referencia o banda RPE obligatoria | COACHING | RETURN_TO_COACH |
| Compatibilidad C2 | Referencias del dominio/método y objetivo correcto | FACT / HARD_GUARDRAIL | KEEP |
| `resolveRunningReferences` | Resolución, conflictos, procedencia, estimado/confirmado, precedencia | FACT / DETERMINISTIC | KEEP |
| `fixedRunningPrescription` | Sesión concreta fijada antes de Builder | COACHING | Sin resultado para contratos nuevos con `dose:null`; lector histórico intacto |
| `buildSessionDoseContext` | Referencias exactas, presupuesto, objetivo, vecinos, digest | FACT / DETERMINISTIC | KEEP; marcador servidor de decisión del Coach |
| `generateContractSession` | Copiar B3/C2; componer y validar JSON | COACHING + HARD_GUARDRAIL | Diseñar dosis y luego compilar/validar |
| `sessionDose` | Carga por porcentaje, unidades, tiempo estimado | DETERMINISTIC | KEEP |
| `sessionTimeDoseAuthority` | Techo temporal y estimación conservadora | HARD_GUARDRAIL / TECHNICAL FEASIBILITY | KEEP |
| `structuredSession` | IDs, pools, restricciones, forma, cantidades representables | HARD_GUARDRAIL | KEEP |
| Session Authority / admisión semanal | Scope, firmas, ownership, freshness, pasado, CAS | HARD_GUARDRAIL / DETERMINISTIC | KEEP |

Ubicación de cada decisión: duración/distancia/volumen estaban fijados por B3 en Carrera; esfuerzos/sets y descanso por reutilización exacta y B3; estructura y movimiento por composición B3 además de pools de factibilidad. C2 fijaba intensidad kind/value, referencia HR/pace o RPE. En Box el modelo ya elegía sets, reps, descanso, RPE/RIR y %1RM, con cálculo y validación posteriores. La progresión en Carrera estaba cerrada por `numericProgressionAuthorized:false` y la igualdad con el baseline. Ahora esas elecciones pertenecen al Coach dentro del contrato.

## C. Policies y límites numéricos

| Valor/regla auditado | Clasificación | Tratamiento |
|---|---|---|
| Habitual 45/50 minutos = target y máximo exactos | PRODUCT POLICY | Contexto factual fechado; recomendación anterior en `advisory` |
| Reutilización exacta de recovery, long run, threshold y VO2 | PRODUCT POLICY | Consejo de continuidad, sin imponer sus cantidades ni estructura |
| Ventana de 28 días de reutilización | PRODUCT POLICY | Mantiene semántica histórica de la recomendación; no prohíbe nuevas dosis |
| Baseline declarado con variantes indivisibles | PRODUCT POLICY | Deja de limitar la propuesta nueva; declaración conservada como evidencia |
| B3 `HIGH_COST_REVIEW`, `RECOVERY_PREFERRED`, `INCOMPATIBLE_DEFER` y ausencia de selector de primera exposición | COACHING GUIDANCE / PRODUCT POLICY | Se conservan en el consejo anterior, sin sustituir la decisión nueva; restricciones y requisitos D3 independientes siguen ejecutándose |
| Prohibir toda preparación por ausencia de policy B3 | PRODUCT POLICY | La nueva composición puede añadir preparación válida; dosis, formato, restricciones y tiempo se comprueban sobre todos los bloques |
| Base/long run RPE 2–3, recovery 1–2, threshold 6–7, VO2 8–9, específico 10K 6–7 y HM 4–5 | COACHING GUIDANCE | Valores orientativos; Coach puede escoger otro RPE representable |
| Preferir HR a pace y luego RPE | COACHING GUIDANCE | Se publican expresiones compatibles; no fuerza una métrica |
| RPE 1–10, RIR 0–10, %1RM 1–100, max ≥ value | HARD REPRESENTATION | Se mantienen; el rango representable no certifica idoneidad deportiva |
| Sets ≤100, reps por entrada ≤1000, rest 0–3600 s | HARD REPRESENTATION | Se mantienen, junto a positividad, finitud y enteros donde corresponden |
| Totales ≤10000 reps, ≤28800 s, ≤100000 m; duración/distancia por entrada con los mismos máximos | HARD REPRESENTATION | Se mantienen; no son umbrales fisiológicos |
| Formato: rounds ≤100, segundos ≤28800; tempo 4 componentes de 0–60 s y suma positiva | HARD REPRESENTATION | Se mantienen |
| 1–3 bloques ordenados, ≤30 movimientos por bloque, ID único dentro del bloque | HARD REPRESENTATION | Se mantienen; nuevas decisiones admiten `main` solo |
| Continuo: una serie y sin descanso; couplet/triplet: 2/3 movimientos | TECHNICAL FEASIBILITY | Semántica del formato intacta |
| EMOM/E2MOM: 60/120 s; trabajo + descanso coherentes y ciclos completos | TECHNICAL FEASIBILITY | Se mantienen |
| Repeticiones estimadas a 2–6 s, transición hasta 120 s | TECHNICAL FEASIBILITY | Estimación operativa explícita, no fisiología; tempo permite precisión adicional |
| Máximo de tiempo disponible real; distancia sin ritmo no acota tiempo | TECHNICAL FEASIBILITY | Rechazar exceso/tiempo no acotado; no reducir propuesta |
| 0,01 kg de redondeo matemático | DETERMINISTIC CALCULATION | Mantener; no inventar incrementos de discos |
| JSON ≤64000 caracteres, explicación moderna ≤400, receipt ≤200000 y caducidad 30 min, dos intentos | HARD REPRESENTATION / integridad operativa | Mantener límites existentes; explicación breve nueva, retries dentro de los dos intentos |

Los límites de representación anteriores no se reclasifican como límites clínicos. No se ha añadido ningún número de seguridad fisiológica universal.

Inventario B3 v1 **inactivo para emisión actual**, conservado sin reinterpretar receipts antiguos:

| Método | Share | Cap s / m | Esfuerzos / descanso |
|---|---:|---:|---|
| Base | 0,12 | 1800 / 5000 | Continuo |
| Recovery | 0,06 | 900 / 2500 | Continuo |
| Threshold | 0,04 | 600 / 2000 | 2–4; 60–120 s |
| VO2 | 0,03 | 480 / 1600 | 3–5; 120–180 s |
| Specific | 0,10 | 1500 / 4000 | Continuo |
| Economy | Sin share | Sin cap de volumen | 4–6; 60–120 s; bouts 10–20 s |

También pertenecen a esa policy histórica la fracción inferior 0,8 y preparación máxima 600 s. Todos son PRODUCT POLICY, no hard safety. La lista de policies temporales de producción está vacía: no hay nuevas bandas/minimumUseful derivadas por este cambio; la compatibilidad de policies temporales explícitas anteriores permanece.

## D. Archivos modificados

Producción:

- `lib/sports/sessionDoseContext.ts`: marcador serializable, propiedad del servidor.
- `lib/sports/runningMethodDoseAuthority.ts`: nuevas dosis del Coach y consejo B3 separado, reconstrucción/refresh con la semántica original de cada contrato.
- `lib/sports/runningIntensityPolicies.ts`, `methodIntensityAuthority.ts`: elecciones por métrica con compatibilidad y validación exacta de referencias.
- `lib/sports/doseCapabilityProfile.ts`: distinguir posibilidad de diseñar una dosis de disponer de una repetición numérica exacta.
- `lib/planning/prepareAllowedWeeklyPlanContract.ts`: integración mínima: transportar la semántica nueva y retirar el requisito de reconfirmación para el antiguo target exacto. No cambia selección/distribución semanal.
- `lib/athlete/prescriptionHistorySummary.ts`: transportar los bloques de dosis prescrita disponibles, sin promoverlos a ejecución.
- `lib/sports/sessionAuthority.ts`: emisión real y contexto factual del Coach; devolver explicación separada.
- `lib/sports/sessionGeneration.ts`: misión, elecciones, explicación breve, rechazo/retry, diagnóstico y compilación.
- `lib/sports/structuredSession.ts`: reutilizar `explanation` en schema 2 y habilitar composición solo main para contratos del Coach.
- `lib/sports/sessionDoseDiagnostics.ts`: cuatro eventos opt-in en la frontera de diagnóstico existente.

Pruebas: `sessionCoachDecision.test.mjs` nuevo; actualización de expectativas de integración en `forge12WholeWeek`, `pastPlannedPreservation`, `aerobicContinuityPolicy`, `doseCapabilityProfile`, `runningEventEnforcement`, `runningExecutionReuse`, `runningMethodDoseAuthority`, `runningMethodDoseV2`, `sessionContractIntegration`, `equipmentAuthorityDiagnostic`; proveedores de prueba en `runningDoseV2TestFixture` y `trainingContractTestRuntime`. Las pruebas de policies históricas siguen ejercitando sus contratos sin el marcador nuevo.

## E. Decisiones recuperadas

El Coach elige movimiento real, estructura factible, sets, reps, duración o distancia, esfuerzos, descanso, valor de %1RM, RPE/RIR permitido y expresión compatible de intensidad. Decide progresar, mantener o reducir utilizando las exposiciones disponibles. El intent semanal sigue delimitando el propósito; la explicación no puede cambiar método, pools ni referencias.

Se reutiliza `StructuredSessionProposal` schema 2. `explanation` lleva una razón breve, requerida durante generación y retirada antes de renderizar y firmar esa propuesta. La respuesta devuelve `coachingDecision` separada. La UI existente no incorpora una vista nueva para esa razón; puede inspeccionarse en respuesta/diagnóstico.

## F. Autoridad determinista conservada

1RM exacto del movimiento, resolución HR/pace, precedencia y conflictos, capacidades de medición, unidades, cálculo de carga, estimación temporal, digests y receipts permanecen del servidor. `70 % × 150 kg = 105 kg` se calcula después de validar; `loadKg`/`bpm` libres continúan siendo campos inválidos.

## G. Hard guardrails conservados

Restricciones, equipo/nivel, pools e IDs reales, compatibilidad de intent, scope y ownership, presupuesto de tiempo, formato, límites de representación, referencias exactas, firmas, freshness, CAS y sesiones protegidas. Los requisitos D3 de evento existentes se conservan. No se cambian bibliotecas, renderer, persistencia ni infraestructura de identidad.

La factibilidad semanal sigue diagnosticando pools vacíos: no se disfraza esa exclusión como ausencia de una dosis histórica. Los contratos no pueden adquirir referencias o movimientos mediante una explicación.

## H. B3

Nuevas emisiones llevan `doseContext.sessionDecisionAuthority:'coach'`. B3 v2 reconstruye `decisionAuthority:'coach'`, `dose:null`, evidencia original y `advisory` con el resultado de la policy anterior. Conflictos y dominios desconocidos siguen fallando. El estado RESOLVED indica que el Coach puede componer, no que ya se haya elegido una dosis. `QUANTIFIABLE` en el transporte existente tampoco afirma una cantidad ejecutada: `evidenceStatus`, integridad y cantidad desconocida siguen separados.

La declaración de 50 minutos continúa siendo 50; no cambia si el Coach prescribe 55. El validador ya no exige igualdad con ese habitual, ni reutilización exacta de esfuerzos, rest o movimiento. Las estructuras admitidas siguen procediendo de factibilidad. Sin dosis fija, `fixedRunningPrescription` no genera clave nueva de duplicado anticipado. La validación de duplicados de sesiones reales en whole-week se mantiene.

Refresh usa la versión y semántica firmadas. V1 y contratos v2 sin marcador conservan su conducta anterior. No se cambia un receipt antiguo a semántica nueva ni se acepta metadata suministrada por el cliente como autoridad.

## I. C2

`runningIntensityChoices` usa el adaptador de dominio existente para resolver una referencia preferente válida dentro de cada métrica compatible y una alternativa subjetiva permitida. Conserva precedencia de evidencia dentro de la métrica, rechazo de conflictos, procedencia, estimaciones, objetivo, estructura y capacidad de medición.

El Coach puede escoger HR, pace o RPE si esas expresiones son ejecutables. Una referencia es indivisible: escoge su ID y el servidor expresa el valor/rango exacto. Las referencias de threshold no se convierten en easy por cambiar la explicación. Las bandas RPE dejan de ser igualdad obligatoria. No se inserta automáticamente una guía RPE secundaria en el renderer cuando el Coach eligió referencia.

Economy continúa sin una política de expresión ejecutable en los dominios que ya estaban sin resolver. VO2 para determinados intents HM sigue excluido por la compatibilidad existente. No se inventan permisos de catálogo para superar esas ausencias.

## J. Builder antes/después y contexto

Antes: copiar targets B3/C2. Después: diseñar una propuesta con razón breve, validar contra un snapshot inmutable y renderizar cálculos y hechos. Dos intentos como máximo; los errores se devuelven al proveedor. No hay clamping ni sustitución silenciosa de una dosis. La reparación de recibos sigue validando contra el contrato firmado.

El contexto incluye historial de prescripción (dosis estructurada cuando existe), sesiones completadas, exposición con sus limitaciones, modificaciones existentes, ejecución running estructurada, intensidad observada cuando está capturada, habitual, fisiología y readiness. Una prescripción guardada no prueba ejecución ni tolerancia. Datos ausentes permanecen desconocidos; no se infieren HR/RPE ni dosis ejecutada de texto o de la prescripción. No se crea learning loop ni una nueva fuente de datos.

## K. Validación local

Las pruebas nuevas demuestran 50→55 y mantenimiento en 50; rechazo 55 con presupuesto 45; segundo intento sin clamp; threshold continuo/intervalos y seis esfuerzos; elección HR/pace/RPE; incompatibilidad de referencia y falta de capacidad; 70 % de 150 kg y rechazo sin RM/movimiento exacto; IDs falsos, cantidades absurdas y campos kg/bpm; razón sin autoridad; conflictos; ausencia de fixed prescription; emisión real firmada y freshness del habitual; diagnóstico opt-in.

Resultados finales:

- Focalizados finales: 70/70 (`aerobicContinuityPolicy`, `sessionCoachDecision`, `sessionContractIntegration`); la comprobación adicional de privacidad de diagnóstico está incluida en la suite completa posterior.
- Suite completa: **2248/2248**, cero fallos/omitidos/cancelados; 204,1 segundos, `node --test --test-concurrency=2` sobre todos los archivos `*.test.mjs` y `*.test.js` del repositorio.
- `node node_modules/typescript/bin/tsc --noEmit --incremental false`: exit 0.
- `git diff --check`: exit 0.

Se actualizaron las expectativas que exigían habitual exacto, reutilización obligatoria o un solo intento ante JSON inválido. Las pruebas conservan los rechazos por referencias, IDs, restricciones, equipo, scope, firmas, freshness, CAS y pasado protegido. La aceptación con personas reales descrita abajo no se ha ejecutado.

## L. Riesgos y límites

- Pasar el contrato garantiza estructura, hechos y factibilidad, no que la decisión sea deportivamente óptima. La aceptación debe revisar la correspondencia entre contexto y razón, especialmente con evidencia escasa.
- HR/pace solo admiten referencias completas existentes; no hay cálculo nuevo de zonas ni rangos libres del Coach. Distancia requiere medición y, con presupuesto finito, una estimación temporal acotada.
- Readiness puede ser unknown porque no se preparó para esa lectura. La historia tiene las ventanas y limitaciones existentes. El cambio no completa retroactivamente la ejecución de Box.
- La estimación conservadora de repeticiones/transiciones puede rechazar una sesión que el entrenador espera más rápida. Se explicita y se vuelve a proponer; no se reduce automáticamente.
- El habitual deja de exigir confirmación en cada interacción para una prescripción exacta. Su antigüedad sigue siendo contexto; los cambios factuales posteriores a emisión invalidan el receipt.
- Los diagnósticos son temporales, voluntarios y no conceden autoridad. No incluyen prompts, perfiles, cookies, tokens, recibos ni descripciones históricas libres. La razón breve es contenido del Coach, no prueba de ejecución.

## M. Acceptance test FORGE12 — ejecución posterior controlada

1. Usar un entorno de prueba autorizado, con la cuenta de prueba FORGE12 y la configuración normal. No ejecutar SQL ni cambiar producción para construir el caso. Conservar snapshot de semana, pasado/completadas, objetivo, evento, disponibilidad y restricciones mediante el flujo de aplicación.
2. Activar temporalmente `FORGE_SESSION_COACHING_DIAGNOSTICS=1`; opcionalmente `FORGE_WEEKLY_COACHING_DIAGNOSTICS=1` para enlazar intent y razón semanales. Arrancar la versión local configurada mediante `npm run dev` solo cuando se vaya a ejecutar la aceptación.
3. Usar «Generar semana» y el flujo actual de fecha/disponibilidad. La acción puede guardar la semana: ejecutarla en el entorno autorizado para ello. No reutilizar tokens ni falsificar fechas. No eludir el límite de generaciones.
4. Registrar del Weekly Coach día, método/adaptación, rol y razón. De `SESSION_COACH_INPUT`, registrar movimientos/estructuras factibles, referencias, tiempo, estado de restricciones, habitual y exposiciones. Comparar con los datos reales; UNKNOWN no es cero ni tolerancia confirmada.
5. De `SESSION_COACH_DECISION` y la respuesta de Builder, anotar estructura, movimientos, dosis, intensidad y razón. Si habitual es 50, una decisión de 50 es válida, y 55 también puede serlo con tiempo suficiente. La aceptación no exige que el LLM cambie por obligación a 55.
6. De `SESSION_AUTHORITY_RESOLUTION`, registrar expresión HR/pace o cálculo; de `BUILDER_OUTPUT`, la propuesta admitida. Confirmar que los segundos/sets/rest propuestos coinciden con la salida, sin clamp. Inspeccionar errores y segundo intento si hubo rechazo.
7. Verificar guardado, whole-week, pasado protegido y completadas. Conservar solo extractos sin secretos: no exportar HAR completo ni receipts. Desactivar diagnóstico al terminar.

La comparación reproducible 50/55/techo 45 ya está en tests locales; la ejecución real evalúa calidad de coaching y transporte, no sustituye esos tests.

## N. Acceptance test AIRAN — Box/CrossFit

1. En un entorno seguro de prueba, verificar objetivo real, movimientos y material factibles, restricciones y últimas exposiciones. No atribuir a AIRAN el 1RM sintético de 150 kg de los tests.
2. Generar por el flujo normal una sesión de fuerza/técnica. Inspeccionar `SESSION_COACH_INPUT` y contexto de prescripción/ejecución: las cantidades no capturadas deben seguir UNKNOWN.
3. Registrar movimiento/estructura, sets/reps, descanso, porcentaje o RPE/RIR y razón. Si hay 1RM compatible, contrastar el cálculo del servidor con la referencia real; si no, no debe aparecer carga inventada.
4. Verificar que la sesión respeta restricción/equipo/tiempo, mantiene la dosis decidida y devuelve una propuesta estructurada. Revisar emisión/guardado por el flujo existente. No usar SQL ni alterar producción automáticamente.
5. Comparar con exposición anterior solo donde haya datos; revisar cualitativamente progresión/mantenimiento/regresión y desactivar diagnóstico.

## O. Commit recomendado

`feat(sessions): return dose and composition decisions to the coach`

No creado. No hay cambios de DB que revertir. Para revertir código, revertir el cambio completo y reiniciar el proceso; no alternar manualmente el marcador dentro de un contrato firmado.
