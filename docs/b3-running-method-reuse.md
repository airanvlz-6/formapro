# B3 Running Method Dose Authority V2 — aceptación local

Implementación de reutilización numérica exacta para recuperación, rodaje largo, umbral sostenido e intervalos VO2 homogéneos. No introduce progresión numérica. D1, los umbrales/fases/decisiones de D3 y el tratamiento cuantitativo del legado permanecen intactos.

## 1. Fuentes canónicas auditadas y precedencia

| Precedencia / fuente | Autoridad encontrada | Uso admitido por B3 |
|---|---|---|
| Veto de integridad | Conflictos de admisión o de ejecuciones reconciliadas | `CONFLICT`; no fallback a otra cantidad/declaración |
| Ejecución moderna del método exacto | `running_execution_records`, HMAC y digest comprobados por `readRunningExecutionViews`; validación de unidades, identidad y completitud por el escritor autenticado | Nuevos selectores; sigue siendo `STRUCTURED_SELF_REPORTED` / `SERVER_VALIDATED_SELF_REPORT`, no medición ni validación fisiológica |
| Declaración habitual confirmada | `runningHabitualDeclarations` + confirmación del servidor ligada a la interacción | Solo `running_base`: 45 minutos declarados → 2700 segundos exactos; sin transferencia a recuperación/largo/calidad |
| Declaración de distancia semanal | `usuarios.perfil.km_semana` o `usuarios.test_atleta.km_semana` | Dato descriptivo; no reparto semanal ni conversión a dosis de un método |
| Cantidad genérica `verified_actual` | Frontera tipada de admisión; el adaptador actual no produce ejecuciones medidas de ese tipo | No establece identidad ejecutada ni estructura de método; no selecciona estas dosis |
| Referencias de ritmo/FC y recibos de prescripción | C2 / prescripción planificada; no son hechos de ejecución | No se reutilizan como dosis B3 |
| Plan completado / asociación con método | Ocurrencia o `COMPLETED_PLAN_ASSOCIATION`, `quantityKnown: false` | Exposición solamente |
| Historial legado | D2A/D2A.1 conservan exposición e incertidumbre | Sin inferir `duracion` sin unidad, notas, análisis, narrativas o ritmo/distancia |

La precedencia no mezcla cantidades entre fuentes. Dentro del método se elige la única ejecución de la fecha más reciente admisible: antigüedad de 0–27 días civiles, nunca futura. La política propia impone 28 días aunque alguien amplíe la ventana descriptiva. Dos identidades en la fecha más reciente se consideran ambiguas; un último reporte incompleto no permite volver silenciosamente a uno anterior. Duplicados idénticos se reconcilian antes; versiones contradictorias quedan bloqueadas.

La auditoría de la opción C no encontró una referencia previa de dosis reutilizable como ejecución. `runningDoseEvidence.ts` excluye prescripciones planificadas y escritores de texto/LLM; proyecta cantidades semanales solo desde ubicaciones de declaración expresamente permitidas. Un recibo del servidor acredita lo autorizado, no lo realizado. No se cambió esta frontera.

## 2. Políticas por método

Registro/esquema B3 versión 2; cada nueva política tiene su identificador de revisión `v1`. Todas conservan baseline seleccionado, identidad, fecha, procedencia, verificación, `sourceDigest`, referencias de evidencia, razón y dosis autorizada serializables.

| Método | Política | Baseline exigido y prescripción |
|---|---|---|
| Recuperación | `recovery_completed_duration_reuse_v1` | Ejecución explícita `running_recovery`, FULL, un bout continuo `regenerativo`; duración total = trabajo principal = bout. Reutiliza esos segundos exactos en `continuo_regenerativo` |
| Rodaje largo | `long_run_completed_duration_reuse_v1` | Identidad dedicada `running_long_run`, FULL, un bout `rodaje_largo`; mismas igualdades cuantitativas. Reutiliza ese total en `continuo_carrera`; nunca una cantidad de easy o exposición legacy |
| Umbral sostenido | `threshold_sustained_work_reuse_v1` | `running_threshold`, FULL, un bout continuo `series_umbral`, trabajo principal y total explícitos e iguales. Autoriza `tempo_continuo`; umbral fraccionado sigue sin estar soportado por este selector |
| VO2 / intervalos | `vo2_uniform_intervals_reuse_v1` | `running_vo2`, FULL, dos o más bouts de `series_vo2max`, duración uniforme, recuperaciones pasivas completas y uniformes entre bouts. Trabajo = suma de bouts; total = trabajo + recuperaciones. Copia número de bouts a sets, segundos de bout y segundos de descanso; `intervalos_carrera` |

No se crean límites de entrenamiento, mínimos útiles, porcentajes, ritmos ni bandas de intensidad. Para continuos, `selectedTarget.minimum = maximum = maximumAuthorized = total`. Para intervalos, el target es trabajo; reps, bout y recuperación tienen rangos exactos separados. El techo temporal comprueba trabajo + (sets − 1) × descanso, sin seleccionar una cantidad nueva.

La composición autorizada es un único bloque principal. Se rechazan cantidades de preparación separadas, composición heterogénea, recuperación activa, magnitudes de distancia y representaciones fuera de estas políticas. No se afirma que este subconjunto cubra toda sesión real de calidad.

## 3. Bootstrap mínimo y comportamiento longitudinal

Se reutiliza el escritor existente `POST /api/running-execution`, autenticado y con identidad del atleta resuelta en servidor. No se crean tablas, migraciones ni cuestionarios de onboarding.

Cuando recuperación es REQUIRED y falta una ejecución reciente, el resultado semanal incluye `missingAuthorityRequest` con `NEEDS_METHOD_EXECUTION`, política, motivo, ventana de 28 días y campos tipados. Solicita un reporte factual de una sesión ya realizada: fecha, completitud y duraciones explícitas del total, trabajo principal y bout. Método y movimiento son conocidos por el requerimiento; identificadores e índices son datos de transporte. Para intervalos, la estructura debe incluir bouts y recuperaciones con unidades y completitud. Los números repetidos permiten comprobar consistencia entre totales y estructura; no se rellenan inferidos.

Si la evidencia existente está en conflicto o presenta una composición no admitida, devuelve `METHOD_EXECUTION_REVIEW_REQUIRED` sin pedir otra vez todos los campos. Si ya existe autoridad válida, no aparece el requerimiento. Los métodos opcionales sin evidencia se omiten; no disparan este requerimiento. El cliente puede consumir el resultado serializable; no se añadió una nueva pantalla de captura ni diálogo automático.

Si nunca se ha realizado el método, `NO_SAFE_FIRST_EXPOSURE_POLICY`: no se pide fingir un hábito ni ejecutar una sesión para desbloquear el plan. No hay prescripción numérica de primera exposición en este cambio.

| Intent de D3 | Comportamiento numérico |
|---|---|
| MAINTAIN, con baseline admitido | Reutilización exacta, `EXISTING_SAFE_DOSE_ONLY`, `numericProgressionAuthorized: false` |
| PROGRESS, con baseline admitido | Mismos números, `PROGRESSION_SELECTOR_NOT_ESTABLISHED`, `numericProgressionAuthorized: false` |
| Sin baseline | `UNRESOLVED`, `NO_CANONICAL_NUMERIC_BASELINE`; no intervención numérica del Builder |
| Método FORBIDDEN | Puede existir baseline B3, pero la elegibilidad D3 y el contrato impiden ejecutarlo |

## 4. Matriz del fixture HM establecido

Fecha de referencia 2026-09-10, evento 2026-11-15, continuidad `ESTABLISHED_CURRENT`. Las cantidades históricas legacy permanecen UNKNOWN. La declaración confirmada de 45 minutos es una entrada canónica explícita separada del historial; sin ella easy también queda UNRESOLVED.

| Método | B3 con historia legacy + declaración confirmada easy |
|---|---|
| Easy | RESOLVED, 2700 s; EXISTING_SAFE_DOSE_ONLY |
| Recovery | UNRESOLVED, RECENT_METHOD_EXECUTION_REQUIRED |
| Long run | UNRESOLVED, RECENT_METHOD_EXECUTION_REQUIRED |
| Threshold | UNRESOLVED, RECENT_METHOD_EXECUTION_REQUIRED |
| VO2 | UNRESOLVED, RECENT_METHOD_EXECUTION_REQUIRED |

## 5. Fixtures canónicos positivos e integración

Los registros positivos son sintéticos, con unidades explícitas, y pasan por el escritor que sella y el lector que verifica HMAC dentro del runtime aislado. No son datos reales de la atleta ni conversiones del legado.

| Método | Dosis B3 resuelta | C2 | Builder / validación |
|---|---|---|---|
| Recuperación | 1200 s continuos | RPE 1–2, política C2 existente | Pasa |
| Largo | 3000 s continuos | RPE 2–3 en fixture; mismo dominio easy ya admitido para rodaje_largo | Pasa |
| Umbral sostenido | 1200 s de trabajo continuo | RPE 6–7, política C2 existente | Pasa |
| VO2 con objetivo 10K | 4 × 180 s; 120 s pasivos entre esfuerzos; trabajo 720 s, total 1080 s | RPE 8–9, política C2 existente | Pasa |

La nueva entrada C2 de largo identifica explícitamente el dominio easy que ya cubría `rodaje_largo`; no cambia sus números o referencias. B3 no selecciona intensidad. VO2 en HM puede resolver B3 pero sigue sin ser ejecutable por compatibilidad estratégica/C2; no se amplió el catálogo de objetivos de calidad.

| Caso requerido | Resultado comprobado |
|---|---|
| A. Recovery REQUIRED + B3/C2 resueltos | Opción semanal y sesión ejecutables durante taper |
| B. Recovery REQUIRED + B3 sin evidencia | WEEKLY_CONTRACT_UNSATISFIABLE / D3_REQUIRED_RECOVERY_UNAVAILABLE + requerimiento dirigido |
| C. Long run ALLOWED + B3 sin evidencia | Opción omitida; semana easy válida |
| D. Quality ALLOWED + B3/C2 resueltos | Umbral HM llega a Builder y valida |
| E. Quality ALLOWED + B3 resuelto + C2 no resuelto | VO2 HM no es prescribible; la ausencia de C2 también bloquea antes de llamar al Builder |
| F. D3 FORBIDDEN + baseline B3 resuelto | Rechazo del contrato, cero llamadas al Builder |

Se añadió el enlace de recuperación requerida desde el adaptador de Carrera hacia la enumeración compartida; no depende de etiquetas legacy `deload`. El método dedicado de largo satisface la categoría longRun sin sustituir easy. La proyección moderna conserva las exposiciones explícitas recovery/long_run; no cambia aliases ni unidades del legado.

## 6. Prueba de producto y frontera Builder

`b3-running-method-reuse-proof.json` contiene la decisión D3, capabilities, contrato semanal, IDs seleccionados, contratos de sesión recibidos por Builder, propuestas y validaciones. `productProof()` en `runningExecutionReuse.test.mjs` lo reproduce con componentes reales y proveedor simulado, sin políticas numéricas de test.

| Semana | Selección validada | Resultado |
|---|---|---|
| 2026-09-14, normal HM, BASE_BUILD / MAINTAIN | Lunes easy 2700 s; miércoles umbral 1200 s; viernes largo 3000 s; descanso los otros días | Selección acotada válida; 3 contratos Builder, 3 validaciones positivas |
| 2026-10-26, TAPER | Lunes easy 2700 s; miércoles recovery 1200 s; descanso los otros días | Recovery REQUIRED satisfecha; 2 contratos Builder, 2 validaciones positivas |

Las cantidades positivas provienen de fixtures canónicos adicionales fechados el día anterior a cada referencia. La diferencia entre las semanas no es una fórmula porcentual de taper. Son selecciones válidas de opciones disponibles, no una afirmación de optimización deportiva.

Cada callback recibe el contrato inmutable con B3/C2 y el intent. La propuesta debe copiar métricas, movimiento, estructura y cantidades exactas. El postvalidador impide cantidades adicionales, cambios de recuperación/reps, movimientos no autorizados y bloques de preparación. El preflight exige C2, B3 y ajuste temporal antes de generar. No se usó un LLM real, ni se escribió/guardó un plan en producción.

## 7. Pruebas negativas

| Caso | Prueba / resultado |
|---|---|
| Duración legacy sin unidad | Fixture HM mantiene B3 nuevo sin resolver; escritor moderno rechaza número sin unidad |
| Notas o análisis | Campos rechazados por escritor; valores del historial no crean dosis |
| Método equivocado | Cambio de identidad ejecutada invalida reutilización |
| Cantidades canónicas contradictorias | Dos versiones selladas de una identidad → CONFLICT a través del loader real |
| Última fecha ambigua | Dos identidades del mismo día → CONFLICT; no se escoge la cantidad conveniente |
| Evidencia antigua/futura/inválida/incompleta | Día 27 admitido, día 28/futuro rechazados; verificación inválida o PARTIAL no resuelven |
| Main/total incoherentes | Rechazo sin corregir ni completar la cantidad |
| Cantidad LLM sin autoridad | B3 no resuelto bloquea generación; dosis/autoridad alteradas se invalidan |
| Aumento bajo PROGRESS | Baseline sin incremento; propuesta aumentada rechazada |
| Intervalos fuera de B3 | Cambio de sets, duración o recuperación rechazado por separado |
| Recuperación activa / preparación adicional | Selector o postvalidador rechaza; no hay números implícitos |
| D3 prohibido / C2 ausente | Cero llamadas al Builder |

## 8. Cambios, tests y límites

Producción:

- `lib/sports/runningExecutionReusePolicies.ts`: políticas, selección de baseline y requerimiento factual dirigido.
- `lib/sports/runningMethodDosePolicies.ts`, `runningMethodDoseAuthority.ts`: registro, estados, baseline/procedencia, composición y validación exacta.
- `lib/sports/goalTransferModel.ts`, `humanPresentationLabels.ts`: identidad de largo y recuperación de mantenimiento.
- `lib/execution/runningExecution.ts`, `historicalRunning.ts`: identidad admitida por escritor y exposición moderna explícita.
- `lib/sports/runningEventPreparation.ts`: enlaces de categorías e intents requeridos; decisiones, fases y umbrales sin cambios.
- `lib/planning/authorizedMethodCandidates.ts`, `allowedWeeklyPlanContract.ts`: consumo del requerimiento y categoría longRun; errores/requerimientos serializables.
- `lib/sports/doseCapabilityProfile.ts`, `aerobicExecutionGate.ts`: ejecutabilidad de composición, intensidad y tiempo.
- `lib/sports/runningIntensityPolicies.ts`: identidad C2 de largo en dominio easy existente.
- `lib/sports/sessionGeneration.ts`, `structuredSession.ts`: frontera y composición única de intervalos.

Tests:

- Nuevo `lib/sports/runningExecutionReuse.test.mjs`: 15 tests, fixtures reales de los componentes y generador de prueba de producto.
- `lib/execution/runningExecution.test.mjs`, `lib/sports/doseCapabilityProfile.test.mjs`, `runningMethodDoseV2.test.mjs`: expectativas que antes exigían selectores nulos actualizadas; rechazos por ausencia de evidencia preservados.
- `lib/sports/runningIntensityPolicies.test.mjs`: amplía la matriz al método largo (+21 casos).
- `lib/sports/runningMethodDoseAuthority.test.mjs`: fixture congelado V1 enumera su propio catálogo, sin incorporar el nuevo método V2.

Límites conocidos: duración entera en segundos exclusivamente para las nuevas políticas; no distancia, umbral fraccionado, intervalos heterogéneos, recuperación activa ni preparación separada. Sin progresión numérica ni primera exposición. `running_specific` y `running_economy` permanecen sin selector. VO2 no se habilita para HM por este cambio. Una ejecución declarada no demuestra tolerancia, intensidad real ni captura histórica completa. No se añadió una interfaz nueva de captura.

Validación final: **372/372 tests enfocados**, incluyendo B3, D3 enforcement, D2A/D2A.1, C2, referencias y bootstrap HR. **2142/2142 en la suite completa**, cero fallos, skips o cancelaciones. Typecheck (`tsc --noEmit --incremental false`) y `git diff --check` pasan. La prueba JSON se regeneró en memoria y se comparó por igualdad profunda con el artefacto guardado: coincide. Hay 38 casos adicionales respecto a 2104: 15 tests nuevos de reutilización, 21 casos C2 para largo y 2 casos por la ampliación del catálogo B3.

Comandos de reproducción desde la raíz:

```powershell
node --test lib/sports/runningExecutionReuse.test.mjs lib/sports/runningMethodDoseV2.test.mjs lib/sports/aerobicContinuityPolicy.test.mjs lib/sports/runningEventEnforcement.test.mjs lib/sports/runningEventPreparation.test.mjs lib/execution/historicalRunning.test.mjs lib/execution/runningExecution.test.mjs lib/sports/runningIntensityPolicies.test.mjs lib/sports/runningReferenceAuthority.test.mjs lib/sports/hrZoneBootstrap.test.mjs
$tests = @(rg --files -g '*.test.mjs' -g '!node_modules')
node --test --test-concurrency=2 @tests
node node_modules/typescript/bin/tsc --noEmit --incremental false
git diff --check
node --input-type=module -e 'import { productProof } from "./lib/sports/runningExecutionReuse.test.mjs"; import fs from "node:fs"; import assert from "node:assert/strict"; assert.deepEqual(await productProof(), JSON.parse(fs.readFileSync("docs/b3-running-method-reuse-proof.json","utf8")));'
```

Diff-stat y hash exacto del commit local se reportan en la entrega. El cambio es exclusivamente local: sin push, SQL ni acceso a producción.
