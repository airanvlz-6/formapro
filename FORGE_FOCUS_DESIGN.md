# FORGE FOCUS — Diseño de producto, tercer modo
**Documentado 23 de agosto de 2026**

## Origen
Hallazgo real: un usuario con entrenador de box/gym que quiere que Forge gestione
solo una disciplina (ej: carrera) no encaja en Supervisión (Forge no prescribe nada)
ni en Coach (Forge prescribe todo, generaría conflicto con el entrenador externo).

## Los tres modos — progresión de autoridad

```
🟢 SUPERVISIÓN          🔵 FOCUS                    🟠 COACH
"Ya tengo mi plan"     "Gestiona una parte"        "Diseña todo mi entrenamiento"

Forge observa,         Forge prescribe UNA          Forge periodiza y prescribe
interpreta,            disciplina, coordina          TODAS las disciplinas
aconseja.              con carga externa.
```

## Modelo conceptual de Focus

```
External training
       ↓
Forge knows it exists
       ↓
Forge owns ONE discipline
       ↓
Forge optimizes that discipline
       ↓
Forge constrains itself around external training
```

Forge NO necesita conocer el contenido del entrenamiento externo (qué WOD, qué pesos)
— solo necesita saber que existe, cuándo ocurre, y opcionalmente su carga aproximada.

## Modelo de datos necesario

```
athlete_training_sources
├── Forge-controlled disciplines (ej: running)
└── External disciplines (ej: crossfit — martes/jueves/sábado)

external_training_records (cuando el usuario SÍ reporta)
├── fecha, disciplina, duracion, intensidad_percibida, tipo, fatiga_post
├── source: user_report
└── confidence
```

## Concepto clave: External Load Confidence

Cuando la carga externa es incierta, Forge aumenta el margen de seguridad de su
propia prescripción — nunca intenta "adivinar" el WOD. Progresión natural:

```
Sin reportes    → incertidumbre alta → prescripción conservadora
Reportes cada   → Forge afina cada vez más
tanto
Reportes        → Forge aprende el patrón real del atleta
consistentes      (ej: "los jueves de box generan más fatiga el viernes")
```

## Onboarding de Focus (External Training Profile — ligero, no un cuestionario largo)

- Disciplina externa (CrossFit / Fuerza / Fútbol / Ciclismo / Natación / Otro)
- Días habituales
- Duración habitual (rangos)
- Intensidad habitual (baja/moderada/alta/muy variable)
- Tipo de trabajo (fuerza/técnica/metcon/intervalos/competición/mixto)
- ¿Puede cambiar de un día para otro? (sí/no)
- Objetivo de la disciplina que gestiona Forge (ej: "5K <20'", "media maratón <1h40")
- Prioridad relativa del objetivo Focus (complementario / importante / prioridad alta)
  — determina cuánto derecho tiene Focus a consumir recursos de recuperación

## Diferencia arquitectónica clave vs. Coach

```
Coach:  prescripción → sesión → carga → respuesta (cadena causal completa)
Focus:  prescripción de UNA disciplina → respuesta del atleta
                                ↑
                    carga externa PARCIALMENTE observada (variable desconocida)
```

Por esto Focus debe ser más conservador por diseño — no intenta estimar
perfectamente el entrenamiento externo, está diseñado para funcionar bien
incluso con incertidumbre real.

## Orden de implementación recomendado (disciplinado, no todo de golpe)

1. Definir la autoridad de cada disciplina (Forge-controlled vs. External)
2. Registrar disciplinas externas y días bloqueados
3. Registrar carga externa SOLO cuando el usuario la reporte voluntariamente
4. Registrar incertidumbre explícitamente cuando no se reporta
5. Hacer que el Week Planner de Focus respete esos bloques como carga externa,
   no como "días vacíos"
6. Solo después: empezar a construir el aprendizaje de patrones de carga externa

**No construir un modelo sofisticado de estimación de carga desde el principio** —
el sistema debe funcionar honestamente con información mínima desde el día 1,
y mejorar progresivamente si el usuario reporta (mismo principio que Readiness V1
y el resto de sistemas progresivos ya construidos en Forge).

## Nota de producto adicional (pendiente, no bloqueante)
Sistema de eliminación de cuenta: registro por email, opción real de eliminar
cuenta en Ajustes, email queda bloqueado tras eliminación para evitar reabrir
cuenta nueva y reiniciar el periodo de prueba gratuita.