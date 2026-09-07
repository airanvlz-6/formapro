# Fallback general de Carrera

Base: `b10008cee507d3d0e3568ff4632024108119527b`. Este cambio sustituye únicamente el límite anterior que bloqueaba Carrera por no disponer de estrategia específica para la meta. Sin migraciones ni push.

## Auditoría de capacidad existente

3B ya representa las siguientes adaptaciones, métodos, patrones y estructuras compatibles. `validateGoalTransferCatalog()` comprueba su correspondencia con los catálogos reales.

| Adaptación existente | Método existente de Carrera | Papel en `running_general` |
|---|---|---|
| `base_aerobica` | `running_base` | PRIMARY |
| `umbral` | `running_threshold` | SUPPORTING |
| `economia_carrera` | `running_economy` | SUPPORTING |
| `fuerza_general` | `runner_support_strength` | SUPPORTING |
| `vo2max` | `running_vo2` | OPTIONAL |
| `potencia` | `runner_power` | OPTIONAL |
| `cadena_posterior` | `runner_posterior` | OPTIONAL |

La familia nueva usa estas capacidades sin añadir dosis, métodos, estructuras ni fisiología. Las opciones siguen sujetas al scope, factibilidad y cobertura semanal existentes. Los papeles SUPPORTING/OPTIONAL no imponen que todas estas capacidades deban entrenarse en cada semana. No incorpora `resistencia_especifica` ni `running_specific`, kilometraje de maratón, taper, fases de evento o periodización nueva. Si el atleta ya tiene un bloque declarado, permanece como contexto según la política existente; no se deriva un ciclo de maratón de la descripción.

## Autoridad y resultados

La jerarquía conserva los pasos previos y añade un último catálogo de capacidad general:

1. Alias canónico exacto.
2. Clasificación estructurada específica.
3. Familia específica derivable de especialidad.
4. Familia general declarada en el catálogo: `usuarios.especialidad = carrera` → `running_general`.
5. Sin capacidad compatible: `STRATEGY_UNSUPPORTED`.

No se añaden aliases humanos. El nombre de la meta no se interpreta mediante substring, fuzzy o LLM. `running_general` es una clave de familia de demandas en el contrato 3B, no una reescritura del objetivo ni un alias de maratón.

| Especialidad | Descripción / clasificación | Estrategia | Specificity |
|---|---|---|---|
| `carrera` | `10K` exacto o distancia estructurada `10K` | `10k` | SPECIFIC |
| `carrera` | `media maratón` exacto o `Media maratón (21K)` estructurada | `half_marathon` | SPECIFIC |
| `carrera` | `Maratón de Madrid` + `Maratón (42K)` | `running_general` | GENERAL |
| `carrera` | `quiero mejorar corriendo` | `running_general` | GENERAL |
| `funcional_crossfit` | `Open CrossFit Games 2027 - estándares Masters` | `crossfit` | SPECIFIC, sin cambios de resolución |
| Especialidad sin familia modelada | Texto libre | Sin estrategia | null; STRATEGY_UNSUPPORTED |

La resolución serializable expone `strategySpecificity: GENERAL` y `source: general_declared_sport`. La descripción original y los datos de competición/distancia permanecen intactos en 3A. El digest de 3B incluye esta resolución; el diagnóstico de admisión también informa specificity. El objetivo semanal se presenta como «Carrera general (sin preparación específica de distancia)» y la etiqueta de sesión como «carrera general».

El algoritmo de conflicto no cambia: familias diferentes entre autoridades primarias siguen bloqueando. No se deduce deporte principal del ownership. No se añaden familias de trail, ultra o triatlón; un campo genérico `carrera` tampoco permite afirmar preparación específica para esas modalidades.

## Verificación

Los tests nuevos prueban exactos 10K/media maratón, maratón y texto libre, GENERAL, conservación de datos sin writes, ausencia de resistencia específica, capacidades reales, especialidades no soportadas y admisión del Planner con selección determinista válida. El fixture de integración confirma disponibilidad semanal, acepta «sigue siendo así» y «próximo día disponible», conserva `includeToday=false` y valida los intents resultantes sin ejecutar un LLM.

- Tests específicos: **54/54 PASS**.
- Suite completa: **1362/1362 PASS**, 11 tests adicionales, sin fallos ni omitidos.
- `npx tsc --noEmit`: **PASS**.
- `git diff --check`: **PASS**.

No se modifica disponibilidad UI, gramática, parser temporal, conflicto, ownership, modos, Builder, 3C, 3D, readiness o restricciones. La única integración en el renderer añade el nombre de la nueva familia; no cambia dosis ni semántica de sesión.
