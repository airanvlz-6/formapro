# Diagnóstico observacional de factibilidad semanal

Base: `6e29fd1c77ed7dce7d38eb81cd693bed2c12ecf2`. No se intenta corregir todavía la causa deportiva de producción ni atribuir restricciones al atleta.

## Captura y emisión

`buildAllowedWeeklyPlanContract`, en `lib/planning/allowedWeeklyPlanContract.ts:100`, conserva una proyección del resultado de `evaluateTrainingFeasibility` inmediatamente antes del `continue` de la línea 102 que descarta un intent no factible. El mismo `continue` sigue ejecutándose.

Solo cuando la DP va a devolver `NO_VALID_EXECUTABLE_REST_ARRANGEMENT`, se emite una vez por invocación:

```text
WEEKLY_FEASIBILITY_REJECTION_DIAGNOSTIC
```

El serializer y el emisor están en `lib/planning/weeklyFeasibilityDiagnostic.ts`. Captura, serialización y logger están protegidos: sus excepciones no sustituyen el resultado del contrato. No se añade el diagnóstico al DTO, contrato, receipt ni estado persistido.

Los metadatos `planningRunId` y decisión temporal pasan como segundo argumento, fuera de `WeeklyContractInput`, evitando cambiar digests. El preflight transmite el resultado real del parser (`null`, `true`, `false`) únicamente para diagnóstico; conserva su comportamiento actual de evaluar con `explicit ?? true`.

## Esquema exacto del log

```ts
{
  planningRunId: string | null, // solo UUID válido
  targetWeekStart: string | null, // fecha civil válida
  temporalDecision: boolean | null,
  calendar: Array<{
    day: string, // siete días del catálogo
    disciplinesAllowed: string[], // box/carrera
    canTrain: boolean,
    canRest: boolean
  }>,
  rejectedIntents: Array<{
    day: string | null,
    discipline: string | null,
    methodId: string | null,
    adaptationId: string | null,
    requiredPattern: string | null, // patrón del intent, no una nueva exigencia
    feasible: boolean,
    errorCodes: string[]
  }>,
  rejectionSummary: {
    MOVEMENT_POOL_EMPTY: number,
    INTENT_POOL_EMPTY: number,
    STRUCTURE_POOL_EMPTY: number,
    STRUCTURE_SPACE_UNSATISFIABLE: number
  },
  restrictionsProjection: Array<{
    discipline: string,
    asOfDate: string | null,
    areas: string[], // únicamente categorías existentes en avoid_with del catálogo
    entries: Array<{
      movement: string | null,
      prohibits_impact: boolean,
      prohibits_jump: boolean,
      prohibits_axial_load: boolean,
      prohibits_deep_flexion: boolean,
      prohibits_overhead_load: boolean
    }>
  }>,
  strategyProjection: null | {
    strategyId: string | null,
    blockPhase: string | null,
    methodIds: string[],
    adaptations: Array<{id: string | null, requiredPattern: string | null}>
  }
}
```

Cada contador representa intents rechazados que contienen ese código. Un intent con dos códigos suma una vez a cada uno. No se suman instancias duplicadas de un mismo código dentro del intent. REST sigue siendo una opción de calendario, no una sesión ejecutable. El diagnóstico puede tener `rejectedIntents: []` si la ausencia de soluciones proviene del calendario fijo y no de intents descartados.

Las restricciones se proyectan separadamente por disciplina, sin asumir que ambos contextos sean idénticos. `movement` usa la misma normalización exacta de factibilidad y después valida pertenencia al catálogo; texto no reconocido pasa a null. Métodos, adaptaciones, patrones, fases y áreas también se comprueban contra catálogos cerrados. No basta con que un valor sea un string.

## Exclusiones y límites

No hay spreads de objetos de dominio en el serializer. Se excluyen textos clínicos, motivos, notas, comentarios, objetivos humanos, prompts, nombres, emails, códigos/IDs de usuario, IDs de sesiones o Supabase, fisiología, HRV, RHR, sueño, receipts, generationToken, cookies y Authorization. Campos futuros añadidos al dominio no se copian automáticamente.

No se emite este log en happy path ni en otros rechazos. No cambia restricciones, candidatos, orden, estrategia, métodos, estructuras, DP, intención temporal, REST protegido, disponibilidad, persistencia ni mensajes UI. No modifica Goal/Strategy Resolution ni running_general.

## Verificación

- Fixture de rechazo controlado conserva el DTO anterior y 13 códigos MOVEMENT_POOL_EMPTY descartados.
- Fixture exitoso se compara, byte a byte mediante SHA-256, con el resultado de ejecutar el mismo input usando el archivo anterior en `6e29fd1`; incluye todo el contrato y su digest.
- Agregación de varios códigos, exclusión de claves y valores sensibles, no mutación de entradas y tolerancia a errores de proyección/logger.
- Integración del preflight con snapshot conocido y restricciones sintéticas explícitas: 52 rechazos con temporal null/true y 39 con false; respuesta original intacta y sin writes. Esto prueba instrumentación, no reproduce las restricciones desconocidas de producción.
- Normalización exacta de movimiento preservando el dato fuente.
- Tests específicos: **11/11 PASS**.
- `node --test --test-concurrency=4 lib/**/*.test.mjs`: **1373/1373 PASS**, sin fallos ni omitidos.
- `npx tsc --noEmit`: **PASS**, exit 0.
- `git diff --check`: **PASS**.
- Lint de los dos archivos nuevos: **PASS**, cero errores/avisos.
- Lint global ejecutado: **739 errores y 105 avisos preexistentes**. Comparación contra `HEAD` de los archivos existentes modificados: `allowedWeeklyPlanContract.ts` 2→2 errores, `prepareAllowedWeeklyPlanContract.ts` 5→5, `weeklyGenerationPreflight.ts` 3→3; mismos mensajes/reglas/severidades y cero avisos. Los demás archivos existentes no se modifican. No se amplía el alcance para corregir esa deuda; el lint global no está verde.

Sin migración, amend, rebase ni push. Commit solicitado: `chore: trace weekly feasibility rejection`.
