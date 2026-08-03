# FORGE SEMANA CANÓNICA

Documento fundacional que define qué elementos de la planificación semanal son **inmutables** (el LLM nunca puede decidirlos ni modificarlos) y cuáles son **negociables** (el LLM puede redactar, adaptar o elegir libremente).

Este documento tiene el mismo rango que `FORGE_TRUTH_PRINCIPLE.md`. Igual que ese documento no hace que el Coach diga la verdad por sí solo (lo hacen el Knowledge Engine, el Response Engine y los Validators), este documento no garantiza coherencia semanal por sí solo — lo hace el **Week Integrity Validator**, un componente propio y separado del Scientific Validator.

---

## Principio de jerarquía deportiva

**Las debilidades existen para apoyar el objetivo principal. Nunca pueden sustituirlo.**

Una debilidad prioritaria es una lente a través de la cual se ajustan algunos días de la semana — nunca el criterio que reemplaza el objetivo, la especialidad o la disponibilidad real del atleta. Si una debilidad termina dominando toda la planificación semanal, el sistema ha fallado, independientemente de si técnicamente "trabaja bien" esa debilidad.

---

## Tabla de decisión: inmutable vs negociable

| Elemento | ¿Puede decidirlo el LLM? | Fuente de verdad |
|---|---|---|
| Objetivo principal del atleta | ❌ Inmutable | `objetivo_principal` |
| Disponibilidad semanal (qué día es box/pista/descanso) | ❌ Inmutable | `distribucion_semanal` |
| Fase/Bloque actual | ❌ Inmutable | `ciclo_actual` |
| Disciplinas obligatorias según especialidad | ❌ Inmutable | `especialidad`/`categoria` |
| Número mínimo de sesiones por disciplina (carrera, halterofilia...) | ❌ Inmutable | Derivado de disponibilidad + especialidad |
| Variedad: ninguna debilidad puede monopolizar la semana | ❌ Inmutable | Regla general (ver abajo) |
| Días ya completados de la semana en curso | ❌ Inmutable, se preservan tal cual | `workout_history` / `weekly_plan.completada` |
| Orden interno de ejercicios dentro de una sesión | ✅ Negociable | LLM decide |
| Calentamiento específico | ✅ Negociable | LLM decide |
| Accesorios y trabajo complementario | ✅ Negociable | LLM decide |
| Movilidad y vuelta a la calma | ✅ Negociable | LLM decide |
| Redacción y tono de las notas técnicas | ✅ Negociable | LLM decide |

---

## Orden de prioridad (cuando dos reglas entran en conflicto)

1. Objetivo principal
2. Disponibilidad
3. Fase/Bloque
4. Disciplinas obligatorias
5. Volumen mínimo por disciplina
6. Debilidades activas
7. Preferencias del atleta
8. Variaciones libres del LLM

Una regla de prioridad inferior nunca puede romper una de prioridad superior. Por ejemplo: una debilidad (prioridad 6) nunca puede justificar ignorar la disponibilidad (prioridad 2) o monopolizar la semana a costa de las disciplinas obligatorias (prioridad 4).

---

## Regla de variedad (general, no específica de pectoral)

**Una misma debilidad nunca puede monopolizar la planificación semanal. Debe existir variedad suficiente para que el objetivo principal siga siendo el eje del bloque.**

Esta regla se aplica igual a cualquier debilidad futura (hombro, lumbar, técnica de sentadilla, motor aeróbico...) sin necesidad de modificar el documento. Como guía operativa: una debilidad no debería ser `debilidad_relacionada` de más de 2-3 sesiones en la misma semana, salvo justificación explícita del bloque (ej: semana de choque específico).

## Regla de respeto de disponibilidad

El Week Planner debe usar literalmente los días de `distribucion_semanal` para asignar `tipo` — no debe reinterpretar ni redistribuir. Si `distribucion_semanal.box = ["lunes","miércoles","sábado"]`, esos tres días DEBEN tener `tipo: "box"`, sin excepción, salvo que el día ya esté completado con otro tipo real.

---

## Separación de responsabilidades entre validadores

```
Scientific Validator      → comprueba coherencia científica/fisiológica (deload, lesiones, progresión de cargas...)
Week Integrity Validator  → comprueba coherencia semanal (disponibilidad, variedad, jerarquía deportiva)
Persistence Validator     → comprueba que el plan se guardó correctamente
```

Cada uno tiene una responsabilidad única. El Week Integrity Validator es un componente nuevo, independiente del Scientific Validator, que se ejecuta sobre las 7 sesiones ya construidas por el Session Builder, verificando:

1. Cada día de `distribucion_semanal.box` (o equivalente) tiene `tipo` coherente en el plan generado
2. Cada día de `distribucion_semanal.pista`/carrera tiene `tipo: "carrera"` coherente
3. Ninguna `debilidad_relacionada` aparece en más de 2-3 días de la semana
4. Las disciplinas obligatorias de la especialidad del atleta están presentes en volumen razonable

Si detecta una violación, debe registrarla y, según severidad, forzar la regeneración del día afectado o marcarlo para revisión — nunca guardar silenciosamente una semana que rompe estas reglas inmutables.