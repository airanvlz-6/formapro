# DUPLICATE_MOVEMENT: auditoría y corrección acotada

Evidencia: run `69e3da90-f195-43bf-b371-0995268b6dc0`, martes, intento 1, `checkSessionShape`, `DUPLICATE_MOVEMENT:1`, sin retry. Base: `9d80917eefc5af1ba6c6ab4fedcd63bac4a48e72`.

## Regla y alcance

`structuredSession.ts`, `checkSessionShape`: un `Set<string>` nuevo por bloque. La clave es `movementId` exacto; no normaliza alias ni compara dosis. El segundo registro del mismo ID en ese bloque produce `DUPLICATE_MOVEMENT:<blockIndex>:<movementId>`. El schema admite warmup, main y cooldown, en ese orden (v2 permite omitir cooldown); no dos main ni nombres de bloque strength/metcon. Hay un structureId de sesión y no identidad/propósito por segmento de trabajo.

El índice 1 del log demuestra main. El safe summary elimina el sufijo movementId: no se puede reconstruir el ID ni los índices de las entradas, ni determinar si sus dosis eran idénticas. No se consultaron datos de producción.

| Caso | Comportamiento real |
| --- | --- |
| 1. Dos entradas idénticas del mismo ID en main | Shape inválido. Ahora permite una recomposición dirigida, nunca aceptación automática. |
| 2. Mismo ID entre bloques con igual dosis/propósito | No es DUPLICATE_MOVEMENT. En 3C, si los arrays de movimientos/prescripciones de preparación y main son idénticos, se rechaza DOSE_PREPARATION_IDENTICAL_TO_MAIN. No es un detector general de igualdad de propósito. |
| 3. Mismo ID entre bloques admitidos con dosis distintas | No lo rechaza esta regla. Debe superar el resto del contrato, semántica de estructura, dosis y suficiencia. Dos fases main no están representadas. |
| 4. Snatch técnico warmup + snatch main | Repetición entre bloques permitida por shape; aceptación final depende del contrato y dosis. |
| 5. Pull-up strength + pull-up metcon | No hay tales blockTypes; falla BLOCK_INVALID. Si ambos se codifican como dos entradas en main, falla DUPLICATE_MOVEMENT. No se deduce una excepción del título. |

Back squat en warmup y main, incluso con tempo distinto, no dispara duplicación; back squat en dos bloques main no es un schema válido. RDL/RDL dentro de main falla aunque cambie la dosis. Las pruebas existentes ya usan el mismo ID en warmup/main/cooldown y comprueban rechazo de una copia dentro de main; se añade una prueba explícita de estas fronteras.

## Historia y capas posteriores

La regla y su test se introducen en `db1de13f157bb6b6cee887e70bcd8292a06209b4` (autoridad semanal determinista), antes de Structured Dose 3C y Training Load 3C.5. La documentación exige propuesta estructurada y validación fail-closed, pero no atribuye esa línea a un fallo concreto de Exposure, renderer o doble conteo. Su efecto técnico es imponer una entrada de dosis por ID/bloque; no se presenta una motivación histórica no documentada.

- **Dose:** itera movimientos por bloque y calcula el total de la sesión; ya procesa repeticiones entre bloques. La comprobación preparación/main idénticos es independiente.
- **Load:** `prescriptionLoadAdapter` usa IDs de segmento `blockIndex:movementIndex`, conserva origen/bloque y agrega cada segmento. No usa movementId como clave única de sesión.
- **Exposure:** el informe estructurado suma repeticiones conocidas y cuenta sessionIds distintos; no cuenta warmup/main como dos sesiones. Existe regresión explícita de ese comportamiento. El adaptador 3D limita sus exposiciones estructuradas al main.
- **3D:** similitud de movimientos por conjuntos, junto con estructura, dosis, intensidad y contexto; conserva la dosis por bloques. No aplica esta regla intrabloque. No se modifica.
- **Renderer/persistencia:** el renderer recorre bloques y movimientos, y conserva la propuesta estructurada; Session Authority valida y firma la propuesta antes de persistir. No hay una unicidad global de movementId necesaria para almacenar repeticiones entre bloques.

Estas capas pueden contar segmentos, pero no distinguen por sí solas una copia accidental de una segunda fase deliberada dentro de main. Quitar la regla sin una representación explícita podría sumar dosis duplicada accidentalmente. Una futura extensión para fases de trabajo necesitaría identidad/propósito estructurado y revisión de semántica de formato; no queda justificada por este log ni se implementa aquí.

## Clasificación y decisión

Rechazo intrabloque: **EXPECTED bajo el schema actual**, sin afirmar que el LLM duplicara accidentalmente la dosis en esta ejecución. Falta de retry para una recomposición admisible: **ARCHITECTURAL GAP**. Varias fases de trabajo del mismo ID dentro de main: limitación representacional independiente, no un bug de duplicación global.

Se conserva el validator exactamente. Solo `sessionGeneration.ts` cambia comportamiento: DUPLICATE_MOVEMENT habilita el segundo intento ya existente; su diagnóstico indica `duplicate_movement_retry`. El prompt de ese segundo intento conserva violations originales y añade REPAIR_CONSTRAINTS con previousErrors `[DUPLICATE_MOVEMENT]` y unicidad dentro de cada bloque. No prohíbe warmup + main, no fusiona ni elimina dosis, no amplía pools ni aumenta intentos. Toda nueva propuesta atraviesa de nuevo el pipeline individual. Dos fallos siguen devolviendo propuesta inadmisible; el Orchestrator existente aborta antes de 3D y guardado.

Otros errores parse/shape sin DOSE ni DUPLICATE_MOVEMENT mantienen su política. Las condiciones anteriores de retry por contrato/dosis/duplicación histórica siguen iguales. No se modifica Session Authority, schema, 3D/3D.1, estrategia, Load, Exposure, suficiencia, readiness o progression.

## Validación y entrega

Tres pruebas nuevas: duplicado→PASS, duplicado→duplicado con exactamente dos llamadas y fallo sin sesión, y alcance block-local independiente de dosis/con nombres de fase no admitidos. Continúan las pruebas de JSON/shape terminal, dosis, autoridad, aborto Web, cross-domain y mobile-ready de la suite completa. Resultados, TypeScript, diff, SHA y estado final en la entrega. Nuevo commit sin amend ni rebase; **NO PUSH**.
