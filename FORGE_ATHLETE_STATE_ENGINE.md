# FORGE — ATHLETE STATE ENGINE
**Documentado 21 de agosto de 2026, evolución del Modification Ledger tras caso real de lesión de rodilla**

## Problema real que motiva este diseño

El modelo actual (Modification Ledger) trata cada reporte de molestia/lesión como un evento aislado que genera una modificación de sesión puntual. Esto es correcto para intervenciones puntuales ("hoy no puedo hacer toes-to-bar"), pero **incorrecto para lesiones persistentes**, donde el patrón real observado hoy fue:

```
Día 1: dolor rodilla → modificar sesión de hoy
Día 2: sigue el dolor → modificar sesión de mañana (reacción idéntica)
Día 3: sigue el dolor → modificar sesión de pasado mañana (reacción idéntica)
```

Esto es "reprogramar lesión por lesión" — el sistema nunca reconoce que hay un **estado persistente del atleta** que debería gobernar toda la planificación mientras dure, en vez de reaccionar sesión a sesión.

## Distinción conceptual central

**Una lesión no es una modificación de sesión. Es un cambio temporal del estado del atleta que debe gobernar la planificación.**

## Tres conceptos que hoy están mezclados y deben separarse

### A. Modification Ledger (ya implementado)
Para intervenciones puntuales de una sola sesión. Ejemplo: "hoy no tengo tiempo, acorta la sesión".

### B. Athlete Constraint / Health State (por construir)
Para restricciones que afectan a **todas las sesiones futuras** mientras estén activas:
```
constraint
---------------------------
domain: knee
type: injury
status: active
level: hard
affected_movements: [running, jumping, deep_squat]
valid_from: 21/08/2026
valid_until: null
```

### C. Training Trajectory (por construir)
Para conservar hacia dónde iba el atleta, aunque el plan se interrumpa temporalmente:
```
Objetivo: Open Masters 2027
Trayectoria: Base → Intensificación → Peak → Open
Estado: INTERRUMPIDA_TEMPORALMENTE
Motivo: lesión rodilla
Último punto válido: Semana 2 intensificación
Fecha: 21/08
```

## Máquina de estados propuesta

```
NORMAL
  ↓ lesión/molestia relevante
RESTRICTED
  ↓
  ├── compatible training
  ├── reduced load
  └── rest / pause
  ↓
REASSESSMENT
  ↓
RETURN_TO_TRAINING
  ↓
REBUILD
  ↓
NORMAL
```

Y tras reevaluación:
```
REASSESSMENT
     ↓
¿objetivo todavía viable?
   ↙             ↘
 SÍ               NO
 ↓                 ↓
REBUILD          GOAL REVIEW
```

## Principios clave a preservar

1. **Mientras la restricción esté activa, no se vuelve a modificar la sesión diariamente como reacción al mismo comentario del atleta** — la restricción ya gobierna la planificación completa.

2. **El retorno es tan importante como la lesión.** Al resolverse la restricción, Forge NO debe volver ciegamente a donde estaba el plan — debe hacer una `RETURN_ASSESSMENT`: qué capacidad conserva el atleta, qué perdió, qué tolera ahora, y reconstruir desde ahí (`REBUILD`), no reanudar automáticamente.

3. **El objetivo final no se toca automáticamente.** Forge debe calcular si, dado el tiempo restante y la duración de la pausa, el objetivo original sigue siendo viable — y si no, proponerlo como decisión explícita al usuario, nunca como cambio silencioso.

## Relación con lo ya construido

No se trata de un sistema paralelo — es subir de nivel la semántica de lo que ya existe:

```
Ahora:    Hard constraint → evita determinados ejercicios (Constraint Engine, ya implementado)
Futuro:   Athlete State → determina qué tipo de planificación completa es válida
```

```
                  CANONICAL TRUTH
                       │
             objetivo / ciclo / plan
                       │
                       ▼
              ATHLETE STATE ENGINE          ← nuevo
                       │
        ┌──────────────┼──────────────┐
        │              │              │
      NORMAL       RESTRICTED       PAUSED
                       │
                       ▼
              CONSTRAINT ENGINE             ← ya implementado (21/08)
                       │
                       ▼
                 BLOCK ANALYZER
                       │
                       ▼
                WEEKLY PLANNER
                       │
                       ▼
                 WEEKLY PLAN
                       │
                       ▼
              DETERMINISTIC VALIDATOR       ← ya implementado (21/08)
```

## Próximos pasos concretos (para la siguiente sesión de diseño)

1. Definir qué eventos deterministas hacen que Forge entre en `RESTRICTED` (probablemente: `constraint_level=hard` + persistence `active_constraint`/`permanent` activo)
2. Definir qué mantiene al atleta en `RESTRICTED` (constraint sigue activa/no expirada)
3. Definir qué evento explícito permite salir a `REASSESSMENT` (usuario confirma que ya no hay molestia, o expiración de `valid_until`)
4. Diseñar qué información necesita `REBUILD` para reconstruir la trayectoria (histórico de carga durante la pausa, tiempo transcurrido, tolerancia observada en las primeras sesiones de vuelta)
5. Diseñar el criterio determinista de viabilidad del objetivo (tiempo restante vs. duración de pausa vs. fase del ciclo)

**No implementar todavía.** Este documento es el diseño aprobado para evolucionar el Modification Ledger — su implementación merece su propia sesión de trabajo dedicada, no comprimirse al final de una sesión ya extensa de correcciones críticas.