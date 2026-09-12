# FORGE — Paso 1: coaching en el Weekly Planner

Implementación local experimental sobre HEAD `08476bf`. No se ha ejecutado FORGE12 en producción, ni SQL, migraciones, despliegue, push o commit.

## A. Flujo real antes y después

HEAD antes: `planificar_semana` → `planBoundedWeek` → `prepareAllowedWeeklyPlanContract` → `loadWeeklyPlanningContext` → `buildCanonicalWeekStrategy` → `resolveAuthorizedMethodCandidates`/feasibility → contrato + `WeeklyCoachingContext` → `composeBoundedWeek` → `validateWeeklySelection` → calendario firmado → Builder existente → admisión de sesiones → whole-week/repair → guardado CAS.

El prompt del HEAD ya recibía contexto factual y pedía relacionar pasado/presente/futuro. La regresión no era únicamente textual: la estrategia reemplazaba las adaptaciones durante deload, estrechaba patrones por debilidad, vinculaba cobertura y el validador la exigía. El Planner tenía que devolver solo IDs, sin justificación. Whole-week volvía a exigir cobertura, incluso agregando adaptaciones PRIMARY ausentes.

Después, el mismo flujo usa `strategy.weeklyDecisionAuthority: "coach"`: la descarga conserva los candidatos del objetivo, el patrón de debilidad orienta sin excluir alternativas factibles y la cobertura recomendada genera warnings. El Coach elige opciones, distribución, TRAIN/REST y prioridad semanal explicada. Feasibility y las autoridades de sesión continúan admitiendo exclusivamente tuplas reales y dosis verificadas.

## B. Auditoría de autoridad previa a los cambios

| Módulo | Decisión | Clasificación | Acción |
|---|---|---|---|
| canonicalWeekStrategy | Objetivo, fase, semana y procedencia | FACT / DETERMINISTIC | KEEP |
| canonicalWeekStrategy | Sustituir todas las adaptaciones en deload | COACHING | RETURN_TO_COACH |
| canonicalWeekStrategy / strategicIntents | Patrón exclusivo por debilidad | COACHING | ADVISORY |
| canonicalWeekStrategy | Roles sugeridos, orden, entornos preferidos, reducción cualitativa | COACHING | ADVISORY |
| goalTransferModel | Métodos, patrones y relaciones objetivo–adaptación publicados | Conocimiento deportivo / DETERMINISTIC | KEEP |
| prepareAllowedWeeklyPlanContract | Disponibilidad, ownership/scope, pasado, completadas, externo, capacidad de dosis | FACT / DETERMINISTIC | HARD_GUARDRAIL |
| resolveAuthorizedMethodCandidates | Feasibility biomecánica, equipamiento, estructuras y dosis | DETERMINISTIC | HARD_GUARDRAIL |
| weeklyPlannerPrompt | Colocación, elección deportiva, TRAIN/REST | COACHING | RETURN_TO_COACH |
| validateWeeklySelection | IDs, digest, siete días, máximo, mínimos existentes, REST real, nuevas prescripciones | DETERMINISTIC / contrato existente | KEEP |
| validateWeeklySelection | Cobertura de adaptaciones/entornos preferidos | COACHING | ADVISORY |
| wholeWeekValidation | Identidad, estructura, dosis, contribución compatible, REST sin contenido, duplicado exacto sin permiso | DETERMINISTIC | HARD_GUARDRAIL |
| wholeWeekValidation | Cobertura de recomendaciones y PRIMARY | COACHING | ADVISORY |
| wholeWeekValidation | Interferencia, proximidad, concentración, repetición no prohibida | COACHING | KEEP como WARNING/INFO |

Bloqueos de cobertura encontrados: `WEEKLY_STRATEGY_COVERAGE_REQUIRED`, `WEEK_PRIMARY_ADAPTATION_MISSING`, `WEEK_OBJECTIVE_UNCOVERED`. Los dos últimos afectaban al resultado whole-week y podían activar reparación o impedir guardar. En el flujo marcado como coach, solo estos incumplimientos de cobertura pasan a advisory/warning. Se conservan las comprobaciones por sesión que hacen imposible o incoherente una prescripción.

`adaptationId`, `methodId`, disciplina y estado siguen procediendo de opciones enumeradas. El Coach decide cuál usar y en qué día; no escribe una nueva tupla. `intent.role` conserva su semántica de contribución de catálogo y compatibilidad con Builder. `decision.role` expresa la prioridad de esa sesión en la semana, sin alterar el contrato de sesión. La frecuencia puede elegirse dentro del techo y mínimos preexistentes; no se exige llenar los días disponibles.

## C. Archivos modificados

Producción, todos en `lib/planning/`:

- `allowedWeeklyPlanContract.ts`: cobertura advisory, esquema de decisión breve, prompt, requisito de explicación en composición y diagnóstico de dosis excluidas.
- `prepareAllowedWeeklyPlanContract.ts`: respuesta con decisiones separadas y diagnóstico opt-in.
- `canonicalWeekStrategy.ts`: marcador de coaching, alternativas durante descarga y patrones de debilidad como orientación.
- `wholeWeekAdapter.ts`: transmite la semántica de coaching y no impone el patrón recomendado al verificar contribución.
- `wholeWeekValidation.ts`: cobertura advisory para el nuevo flujo; conserva errores de integridad.
- `weeklyPlannerDiagnostics.ts`: códigos de rechazo de explicación y límites existentes visibles.
- `weeklyFeasibilityDiagnostic.ts`: diagnóstico opcional también para contratos viables, serializado completo en ese modo.

Pruebas: nueva `weeklyCoachDecisions.test.mjs`; ampliación de whole-week y ajustes de fixtures/expectativas en estrategia, transferencia, señales, diagnóstico, regeneración, pasado protegido, FORGE12 y las integraciones existentes de dosis/evento. Los archivos de producción de B3, HR, Builder, Session Authority, renderer, fisiología, writers y persistencia no cambian. `goalTransferModel` y el algoritmo de transferencia conservan sus relaciones y permisos; no se añade un grafo.

## D. Decisiones recuperadas por el Coach

- Elegir cualquiera de varias adaptaciones y métodos factibles en el mismo día.
- Continuar el objetivo durante deload, usando fase y reducción recomendada como información.
- Aprovechar otro patrón factible aunque haya una debilidad priorizada.
- Omitir una recomendación de adaptación o entorno sin rechazo por cobertura.
- Elegir TRAIN/REST y prioridad semanal, con una explicación breve contextual.

## E–F. Autoridad determinista y protecciones

Se mantienen catálogo e IDs, relación método–estímulo–adaptación, scope y ownership, disponibilidad por disciplina/día, contexto factual con procedencia, restricciones, capability/equipment, referencias, dosis, estructuras, presupuesto temporal, pasado protegido, completadas y external blocked.

También permanecen `frequencyPolicy` (máximo existente, mínimo de una prescripción y REST genuino cuando corresponde), el mínimo nuevo de regeneración, restricciones de preparación de evento D3, protección de su fecha y prohibiciones de métodos. Este paso no reinterpreta esos límites como consejos. La prohibición de dos opciones con el mismo `fixedPrescriptionKey` y la duplicación exacta no autorizada de whole-week siguen siendo errores.

No cambian receipts, signatures, expiraciones, stale checks, snapshots, CAS, límite de generaciones ni writes. El marcador y las opciones forman parte del contrato y por ello cambian sus digests respecto al código anterior; receipts antiguos pueden resultar stale al reconstruir el contexto. No se migra ni relaja esa comprobación.

La explicación no entra en `selected`, `sessions`, `intent`, resolución de referencias ni firma. `validateWeeklySelection` admite ID-only para el replay interno de receipts; `composeBoundedWeek` requiere explicación para cada día no protegido del flujo coach. Dos intentos como máximo. Un texto distinto no cambia el contrato ni puede autorizar una opción excluida.

## G. Validación

Comandos desde la raíz del repositorio, PowerShell:

```powershell
node --test lib/planning/weeklyCoachDecisions.test.mjs lib/planning/weeklyPlannerDiagnostics.test.mjs lib/planning/weeklyFeasibilityDiagnostic.test.mjs
$testFiles = @(rg --files -g '*.test.mjs' -g '*.test.js')
node --test --test-concurrency=2 @testFiles
node node_modules/typescript/bin/tsc --noEmit --incremental false
git diff --check
```

Las nuevas pruebas usan catálogos y feasibility reales. Comprueban alternativas de TRAIN, REST opcional, disponibilidad, restricciones, IDs inventados, contexto factual/unknown, independencia de reason, esquema acotado, retry, replay ID-only, diagnóstico sin notas/secretos y aislamiento de Builder. Whole-week distingue recomendaciones de errores estructurales/dosis/duplicado exacto. Las integraciones existentes verifican firmas, freshness, protección del pasado y CAS con proveedores simulados; no prueban la calidad deportiva de un LLM real.

Suite completa: **2237/2237 tests**, sin fallos ni omitidos. TypeScript (`--noEmit --incremental false`) y `git diff --check` pasan. Comprobación focalizada del nuevo esquema, contexto y diagnóstico: **35/35 tests**. Se actualizaron las expectativas que imponían descarga exclusiva y patrones de debilidad obligatorios; no se desactivaron tests.

## H. Riesgos y límites observados

- Más opciones aumentan el prompt y pueden cambiar frecuencia o mezcla de métodos. No hay garantía de mejora deportiva por pasar validadores: hace falta FORGE12 real.
- Es posible una semana solo de fuerza de apoyo si la carrera carece de dosis autorizada. Ya no se rechaza toda la semana por la anterior exclusividad deload; las dosis no verificadas siguen fuera.
- El texto de `reason` es una explicación del modelo, no un hecho verificado ni una prueba de recuperación. El prompt prohíbe inventar datos y conserva UNKNOWN; el código no pretende demostrar automáticamente la veracidad de prosa deportiva.
- `decision.role` no cambia `intent.role`, dosis o prioridades internas del Builder. Este paso no implementa progresiones numéricas nuevas.
- D3, frecuencia y duplicación exacta siguen acotando al Coach. Las transferencias de otro dominio siguen requiriendo relaciones explícitas y permiso canónico; no se inventan equivalencias.
- Renderer permanece intacto: el objetivo semanal presentado sigue proyectando la estrategia canónica y puede enumerar recomendaciones no escogidas. Para esta evaluación, usar las opciones seleccionadas y `coachingDecisions`, no ese texto, como evidencia de la decisión semanal.
- Las explicaciones se devuelven en la respuesta y pueden registrarse opt-in; no se guardan automáticamente en tablas. La aplicación actual puede no mostrarlas.

## I–J. Diff y commit recomendado

Cambio acotado a la frontera semanal y su validación posterior directa; no se crea ninguna authority, engine, policy, tabla o fase nueva. Se conserva la ruta de admisión y se separa la explicación de los datos firmados.

Commit recomendado, no creado: `feat(planning): return weekly distribution decisions to the coach`.

Reversión: revertir este cambio completo en código y reiniciar el proceso. No alternar manualmente el marcador en un contrato ni reutilizar receipts emitidos con otro código. No requiere reversión de DB.

## K. Acceptance test FORGE12, ejecución posterior controlada

1. Guardar para comparación la semana anterior de FORGE12 mediante los medios de lectura de la aplicación. Anotar semana objetivo, fecha civil de Canarias, disponibilidad, completadas/pasado protegido y límite de generación restante. No cambiar esas entradas para conseguir un resultado deportivo predeterminado.
2. En el entorno donde se hará la prueba, arrancar **esta versión del código** con diagnóstico habilitado. Para una ejecución local ya configurada con sus variables de entorno:

   ```powershell
   $env:FORGE_WEEKLY_COACHING_DIAGNOSTICS = '1'
   npm run dev
   ```

   No copiar claves al informe. La variable habilita observabilidad; no concede permisos ni selecciona opciones. No se ha activado ni arrancado aquí un proceso contra producción.
3. Entrar como FORGE12 por el flujo normal. Abrir DevTools → Network, filtrar `/api/chat` y activar Preserve log. Conservar solo los campos descritos abajo; no exportar un HAR completo con cookies/tokens.
4. Solicitar **«Generar semana»** en el flujo semanal existente, elegir la semana objetivo y responder las confirmaciones reales de disponibilidad/inicio y requisitos factuales que aparezcan. Usar la fecha actual: no falsificar la fecha del servidor ni reutilizar un token de septiembre. Si el límite de generaciones está agotado, detener la prueba; no borrar registros ni hacer SQL.
5. Esta acción normal puede construir y guardar la semana. Ejecutarla únicamente cuando se quiera efectuar esa regeneración controlada. El snapshot procede de `preparar_generacion_semana`; mantener el mismo contexto de generación durante preflight, Planner, Builder y save. No invocar `planBoundedWeek` directamente con un snapshot inventado.
6. Capturar del servidor `WEEKLY_COACHING_INPUT`: `planningRunId`, `weekStart`, `contextDigest`, objetivo/fase/semana, resumen factual, disponibilidad y opciones por día. Sus conteos describen datos disponibles; no son dosis ejecutadas. `WEEKLY_FEASIBILITY_REJECTION_DIAGNOSTIC` muestra exclusiones de feasibility, y `WEEKLY_DOSE_CANDIDATE_REJECTIONS` los métodos sin dosis autorizada. Días protegidos o no disponibles se reconocen en los candidatos y disponibilidad. Los fallos de preparación se encuentran también en la respuesta de preflight.
7. Capturar de la respuesta **`planificar_semana`** únicamente `coachingDecisions`, `coachingWarnings` y, de `estructura.sessions`, día, estado/tipo, optionId, adaptationId y methodId del intent. El evento `WEEKLY_COACHING_SELECTION` contiene esa misma selección con sus explicaciones. Excluir generationToken/calendarReceipt y datos personales innecesarios del material compartido.
8. Si hay rechazo, leer `code/errors` en la respuesta y `WEEKLY_PLANNER_DIAGNOSTIC` por intento. No corregir la semana imponiendo una elección esperada ni habilitar una opción excluida. Si la explicación falta, el segundo intento debe recibir `WEEKLY_DECISION_REQUIRED`; si sigue faltando, se rechaza.
9. Tras Builder, capturar `wholeWeekValidation.diagnostics`, `wholeWeekValidation.status` y `repairOrchestration` de **`guardar_plan_semana`**. Si el guardado falla, capturar `code`, `saveStage` y `repairDiagnostics` disponibles. Whole-week se ejecuta sobre las sesiones construidas, no sobre posibilidades del catálogo. Sus warnings de proximidad/interferencia/concentración permanecen visibles y no provocan reparación por sí mismos.
10. Comparar viernes/sábado/domingo y el resto de la semana: qué eligió, qué alternativas tenía, adaptación/método, TRAIN/REST, prioridad y razón, conexión con historia/objetivo, y qué datos seguían desconocidos. Revisar que el pasado y completadas coincidan con el snapshot original y que el guardado confirme éxito. Una explicación de recuperación basada en datos ausentes es un fallo cualitativo aunque el contrato sea válido.
11. Deshabilitar `FORGE_WEEKLY_COACHING_DIAGNOSTICS` al terminar y reiniciar el proceso si corresponde. Conservar un extracto de diagnóstico sin secretos y comparar con la generación anterior. Una distribución diferente no se considera automáticamente mejor.
