# Phase B — Deterministic Time & Dose Authority

Base: `e39f3f2227240210c5e2e410256ad7b29572a4fb`.

Decisión de producto: implementar infraestructura; **ningún umbral deportivo numérico activo**. Las bandas típicas del catálogo no autorizan targets ni mínimos útiles. `running_threshold`, `running_recovery`, `box_technique`, `box_support_strength`, `runner_support_strength` y los demás métodos quedan `UNRESOLVED` respecto a esas dos magnitudes. Continúa vigente el máximo canónico de disponibilidad.

## Modelo y recorrido

`AthletePrescriptionContext.availability` → `buildSessionDoseContext` → `doseContext.timeBudget` + `timeAuthority` → `AllowedTrainingContract` → Builder inmutable → `validateSessionDose` → renderer estructurado → `wholeWeekInput` → `validateWholeWeek`.

- `availableTime` conserva mínimo, máximo, estado y procedencia canónicos; el mínimo disponible no es un mínimo útil.
- `hardMaximumSeconds` reproduce el máximo existente; 30/60/90 min son 1800/3600/5400 s. Un límite superior desconocido permanece `null`.
- `targetDuration`, `minimumUsefulDurationSeconds`, `policyId` y `provenance` permanecen `null`, con `resolution=UNRESOLVED`, sin política explícita.
- `sessionTimeDoseAuthority.ts` implementa aritmética genérica. `sessionTimeDosePolicy.ts` contiene el registro de dominio vacío; su selección permite método, adaptación, disciplina del método, rol y fase exactos. No infiere reglas desde texto ni ordena roles por duración. Cero o múltiples políticas coincidentes no autorizan una banda.
- Restricciones, referencias, equipo y entorno conservan sus autoridades existentes. No se transforman en descuentos temporales inventados.
- Las políticas sintéticas existen exclusivamente en tests, inyectadas al cargar módulos; no hay flags de producción, API o configuración del cliente para introducirlas.

## Semántica con una futura política explícita

Sean `L/U` los extremos del target, `M` el mínimo útil y `H` el máximo disponible. `upper=min(U,H)` (o `U` si `H` es desconocido), `lower=min(L,upper)`.

| Condición | Resolución |
| --- | --- |
| `upper < M` | `INFEASIBLE`; falla el contrato antes del Builder |
| `M <= upper < L` | `UNDER_TARGET_ALLOWED`; target reducido a `upper` |
| `L <= upper < U` | `FEASIBLE_CLAMPED` |
| `upper = U` | `TARGET_SATISFIED` en la resolución de la banda, pendiente de validar la propuesta |

La disponibilidad no eleva el target. Una política de recuperación puede ser corta; una de apoyo no consume automáticamente todo el tiempo. No hay números universales por rol. `RECOVERY` es un rol de sesión/calendario; el intent estratégico usa `PRIMARY/SUPPORTING/MAINTENANCE/OPTIONAL`. Un futuro adaptador debe explicitar esa relación antes de activar políticas.

La validación compara la estimación central con el mínimo útil y la banda efectiva: `SESSION_DOSE_UNDERDOSED`, `SESSION_DOSE_UNDER_TARGET`, `SESSION_DOSE_OVER_TARGET`. La tolerancia sobre el target pertenece a cada política; nunca permite superar `H`. El máximo conservador sigue produciendo `SESSION_BUDGET_EXCEEDED`; una duración no acotada conserva el rechazo con presupuesto finito. Estimación central desconocida con target explícito produce `SESSION_DOSE_DURATION_UNRESOLVED`.

El retry existente recibe violaciones estructuradas y conserva el mismo contrato congelado: máximo **dos intentos**. No cambia pools, movimientos autorizados, intent ni intensidad. Una reparación que excede el máximo sigue siendo rechazada.

Week Integrity conserva `adaptationId` como evidencia de presencia y añade `adaptationDoseSatisfied` cuando existe política explícita. El adaptador recalcula la duración desde la propuesta; no confía en la estimación persistida. `false` excluye la sesión de la cobertura y produce `WEEK_ADAPTATION_DOSE_UNSATISFIED`; una PRIMARY queda descubierta. Sin política no se afirma satisfacción temporal: el campo se omite y se mantiene la cobertura anterior. No se introduce un modelo de volumen semanal.

## Auditoría del significado de las duraciones existentes

`WorkoutStructure.duracion_tipica_min` solo declara un rango `[min,max]`. No posee `scope`, inclusión de preparación, descansos o cooldown, ni mínimos útiles. La búsqueda de usos del campo no encuentra un consumidor operativo fuera de su declaración en `workoutStructureLibrary.ts`. `sessionContractAuthority.md` ya lo describe como típico y no autoritativo.

La descripción de cada formato ayuda a identificar su contexto, pero **no demuestra que el número sea duración total de sesión, bloque principal o trabajo efectivo**. Las siguientes son todas las entradas actuales de ese campo; todos sus rangos se conservan como metadata descriptiva:

| ID | Minutos típicos | Contexto explícito de la descripción, sin ampliar la semántica del rango |
| --- | --- | --- |
| amrap_corto | 8–12 | AMRAP corto |
| amrap_largo | 15–25 | AMRAP largo |
| emom_fuerza | 10–20 | EMOM con descanso incorporado |
| emom_metcon | 10–16 | EMOM metabólico |
| for_time_corto | 3–8 | For Time corto |
| for_time_medio | 10–20 | For Time medio |
| chipper | 15–30 | Chipper largo |
| ladder | 8–15 | Escalera de repeticiones |
| couplet | 8–20 | Dos movimientos, formato variable |
| triplet | 10–20 | Tres movimientos, formato variable |
| death_by | 5–15 | Incremento por minuto |
| strength_sets | 20–40 | Series con descanso completo |
| complex_halterofilia | 15–25 | Complejo técnico |
| intervalos_carrera | 25–50 | Series con recuperación |
| continuo_carrera | 30–120 | Carrera continua |
| potencia_series | 10–30 | Series explosivas con recuperación |
| practica_habilidades | 10–30 | Intentos técnicos y pausas |
| movilidad_controlada | 5–20 | Bloques de movilidad y pausas |
| continuo_regenerativo | 10–40 | Rodaje regenerativo, sin mínima distancia |
| velocidad_recuperacion_completa | 15–40 | Esfuerzos breves separados por recuperación |
| tecnica_carrera | 10–30 | Drills y pasadas con pausas |
| potencia_carrera_series | 10–30 | Series explosivas con recuperación |
| fuerza_corredor_series | 20–40 | Fuerza complementaria con descansos |
| tempo_continuo | 20–50 | La descripción dice «bloque continuo»; no define el alcance del rango |

No es correcto renombrar ninguno de esos extremos a `minimumUsefulDuration`, ni afirmar que 20–50 representa siempre una sesión completa. Una policy futura necesita definir su unidad y alcance explícitamente.

Otras magnitudes con semántica demostrada en el código:

| Campo | Significado real |
| --- | --- |
| `movementLibrary.recovery_cost_horas` | Metadata de coste de recuperación entre exposiciones; no duración de sesión |
| `movementLibrary.dose_basis='duration'` | Identifica movimientos cuya dosis se expresa en tiempo; no da un umbral |
| `prescription.durationSeconds` | Duración por esfuerzo/serie, multiplicada por `sets`; no incluye descansos entre series |
| `prescription.restSeconds` | Recuperación entre series; el estimador suma `(sets-1)*restSeconds` |
| `prescription.tempo` | Segundos por fase de repetición; sustituye la incertidumbre de 2–6 s/repetición |
| `formatDose.durationSeconds` | Reloj del bloque, no de toda la sesión; solo main admite formatDose |
| `formatDose.timeCapSeconds` | Techo del bloque; no duración ejecutada conocida (estimación 0–cap) |
| `formatDose.intervalSeconds/workSeconds/restSeconds` | Ciclo temporal del formato; no banda de sesión |
| `formatDose.rounds/restSeconds` en complex | Rondas de trabajo y recuperación entre rondas |
| `estimateSessionDuration.minimum/maximum` | Suma de bloques y descansos, más incertidumbre de transiciones en el máximo |

## Estimador y fixture de producción

Se conservan exactamente los extremos anteriores. Los contratos nuevos añaden `expectedSeconds=round((minimum+maximum)/2)` si el máximo es conocido; en caso contrario, `null`. Es un punto medio operativo determinista, no una predicción calibrada ni prueba fisiológica de adaptación. También hereda la incertidumbre de un time cap; una futura política específica puede necesitar un estimador más preciso.

El fixture auditado contiene warmup (goblet squat 2×8, push-up 2×10, hollow hold 2×20 s), main (KB goblet squat 4×8, ring row 3×10, DB shoulder press 3×8, Bulgarian split squat 3×8/lado) y cooldown (plank 2×30 s, knee raise 2×12).

La evidencia disponible comunica **27:23–56:19**, pero no los descansos exactos por bloque. No se ha reconstruido una propuesta completa inventando esos valores. El test de producción usa explícitamente esos límites reportados:

- Hard maximum con 60 min: **3600 s**.
- Política strength supporting: **UNRESOLVED**; target y mínimo útil: **null**.
- Estimación reportada: mínimo **1643 s**, máximo **3379 s**; punto medio operativo **2511 s (41:51)**.
- Validación temporal: pasa el máximo; no se afirma target satisfecho ni dosis útil suficiente.
- La validación integral de aquella sesión requeriría su propuesta estructurada completa; este test no la suplanta.

## Compatibilidad y diagnóstico

La extensión es opcional para contratos antiguos: sus estimaciones y rendering no adquieren campos nuevos al verificar receipts. Los contratos nuevos transportan la extensión en el contrato firmado y en `structuredPrescription`; no cambia el algoritmo del digest de evidencia ni el formato del receipt. El validador recalcula la autoridad presente y rechaza una banda alterada. La producción aún no impone targets a receipts nuevos o antiguos. Antes de activar políticas habrá que decidir explícitamente el versionado de políticas y la admisión de receipts históricos.

`SESSION_DOSE_AUTHORITY` emite JSON plano, una línea por validación de dosis del Builder, máximo dos por invocación. No se emite en renderer, verificación del receipt o persistencia. Reutiliza la estimación calculada; no vuelve a ejecutar feasibility ni añade lecturas. Recalcula únicamente la proyección temporal pura desde el contrato. Si la propuesta falla antes de dosis o el proveedor falla, no se fabrica una estimación ni se emite este evento.

Allowlist: `planningRunId`, `date`, `discipline`, `method`, `role`, `availableMinSeconds`, `availableMaxSeconds`, `hardMaximumSeconds`, `targetMinSeconds`, `targetMaxSeconds`, `minimumUsefulSeconds`, `estimatedMinSeconds`, `estimatedExpectedSeconds`, `estimatedMaxSeconds`, `result`, `policyId`, `provenance`. IDs deportivos proceden del catálogo, procedencia de la policy del registro del servidor, run ID tiene formato acotado. Sin arrays anidados, perfil, texto libre, prompts, tokens, referencias fisiológicas ni identificadores del atleta. Fallos de observación, serialización o console se absorben sin cambiar admisión.

## Validación

Tests de mecánica: T1–T6, T9–T10 y T15–T16 en `sessionTimeDoseAuthority.test.mjs`. Tests de integración con políticas sintéticas: T7–T8, T10–T13, T15, compatibilidad legacy, privacidad, logger y fixture en `sessionTimeDoseIntegration.test.mjs`. T14 incluye el adaptador real y la exclusión de PRIMARY en `wholeWeekValidation.test.mjs`. T17–T19 se cubren además por las suites existentes de referencias, equipo/entorno, especialidad y estrategia.

No migración, modificación de perfil, activación de umbrales deportivos o cambio de frontend. Las siguientes fases requieren políticas autorizadas con alcance temporal, rol, método, fase, tolerancia y procedencia explícitos; nunca convertir el extremo descriptivo inferior en mínimo útil por conveniencia.

## Archivos del cambio

Validación final: 39/39 tests específicos; 1564/1564 en `node --test --test-concurrency=4 lib/**/*.test.mjs`; `npx tsc --noEmit` y `git diff --check` correctos. ESLint de los archivos modificados: 23 errores y 1 warning preexistentes, sin diferencias de regla/mensaje/severidad frente a HEAD. Los archivos nuevos no añaden deuda.

| Archivo | Responsabilidad |
| --- | --- |
| `lib/sports/sessionTimeDoseAuthority.ts` | Modelo, clamp, igualdad independiente del orden JSON y violaciones |
| `lib/sports/sessionTimeDosePolicy.ts` | Frontera de políticas de dominio; registro vacío |
| `lib/sports/sessionDoseContext.ts` | Proyección del tiempo canónico |
| `lib/sports/allowedTrainingContract.ts` | Integridad de la banda del servidor |
| `lib/sports/trainingFeasibility.ts` | Rechazo temprano si una política explícita resulta inviable |
| `lib/sports/sessionDose.ts` | Estimación central y validación temporal |
| `lib/sports/structuredSession.ts` | Observación aislada de la validación existente |
| `lib/sports/sessionGeneration.ts` | Instrucciones de banda y diagnóstico por intento |
| `lib/sports/sessionDoseDiagnostics.ts` | Proyección SAFE plana |
| `lib/sports/sessionProfessionalRenderer.ts` | Transporte estructurado, sin cambiar texto visible |
| `lib/planning/wholeWeekAdapter.ts` | Recalcular satisfacción desde propuesta |
| `lib/planning/wholeWeekValidation.ts` | Separar presencia de cobertura temporal |
| `lib/sports/sessionTimeDoseAuthority.test.mjs` | Mecánica con políticas sintéticas |
| `lib/sports/sessionTimeDoseIntegration.test.mjs` | Contrato, retry, adapter, diagnóstico, compatibilidad y fixture |
| `lib/planning/wholeWeekValidation.test.mjs` | PRIMARY sin cobertura por dosis insuficiente |
| `docs/session-time-dose-authority.md` | Decisiones, auditoría y limitaciones |
