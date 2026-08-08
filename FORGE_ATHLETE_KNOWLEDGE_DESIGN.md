# FORGE ATHLETE KNOWLEDGE — Auditoría y Diseño (Paso 1 y 2)

## Paso 1 — Auditoría del "Nivel de Conocimiento" actual

### Qué existe hoy (tras el fix de esta sesión)

| Fuente actual | Qué mide | ¿Es CANONICAL TRUTH o ATHLETE KNOWLEDGE? | Decisión |
|---|---|---|---|
| `perfil` completado | Datos declarados en onboarding (especialidad, objetivo, disponibilidad) | **Canonical Truth** — dato declarado explícitamente por el usuario | Mantener, pero mover fuera del "conocimiento" — es perfil, no aprendizaje |
| `workout_history.length` | Volumen de entrenos registrados | Ninguno de los dos por sí solo — es solo un contador | Se convierte en **evidencia** para Knowledge Points de categoría "respuesta al entrenamiento" |
| `historial_marcas.length` | Número de PRs registrados | **Canonical Truth** (las marcas en sí ya son verdad objetiva) | Mantener como Canonical Truth, no como conocimiento inferido |
| `aprendizajes_atleta` (puntos) | Extraído por el LLM en conversación libre, con función de "registrar_aprendizaje" | **Problema real**: es exactamente el patrón que hoy identificamos como peligroso — el LLM decide qué es un "aprendizaje" sin evidencia acumulada | **Eliminar como fuente directa** — reemplazar por el pipeline Observación → Evidencia → Knowledge Point |
| `athlete_response_patterns` (Athlete Response Engine) | Patrones con `puntos_evidencia` ya construidos hoy | **Ya es prácticamente un Knowledge Point** — tiene evidencia real, categoría, confianza aproximada | **Base de partida real** para el nuevo motor — ya cumple gran parte del diseño |
| `block_week_summary` | Resúmenes de bloque | **Canonical Truth** (resultado real de cada semana) | Se mantiene igual, alimenta evidencia de Knowledge Points de recuperación/respuesta |

### Conclusión de la auditoría
El sistema actual **ya tiene sin saberlo** dos piezas que cumplen gran parte del diseño de Knowledge Point:
1. `athlete_response_patterns` (Athlete Response Engine, construido hoy) — necesita evolucionar su schema para incluir `estado` (activo/en_evolucion/obsoleto/refutado) y `tendencia`
2. `aprendizajes_atleta` — es la pieza más frágil y debe ser **reemplazada**, no evolucionada, porque el LLM decide libremente qué guardar sin pasar por acumulación de evidencia real

---

## Paso 2 — Schema mínimo de Knowledge Point

```sql
CREATE TABLE athlete_knowledge_points (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_codigo TEXT NOT NULL,
  categoria TEXT NOT NULL, -- 'perfil_deportivo' | 'capacidades' | 'debilidades' | 'respuesta_entrenamiento' | 'recuperacion' | 'preferencias'
  conocimiento TEXT NOT NULL, -- la afirmación en si, ej: "Tolera bien sesiones Z2 de 45-60 min"
  confianza NUMERIC DEFAULT 0.3, -- 0.0 a 1.0, sube con cada evidencia confirmatoria
  puntos_evidencia INTEGER DEFAULT 1,
  tendencia TEXT DEFAULT 'estable', -- 'mejorando' | 'estable' | 'empeorando'
  estado TEXT DEFAULT 'candidato', -- 'candidato' | 'activo' | 'en_evolucion' | 'obsoleto' | 'refutado'
  primera_observacion TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ultima_evidencia TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  fuente TEXT, -- 'workout_history' | 'block_week_summary' | 'physiology_records' | 'conversacion'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_knowledge_points_lookup ON athlete_knowledge_points(user_codigo, estado, categoria);
```

### Pipeline de vida de un Knowledge Point

```
Dato/evento real (workout_history, block_week_summary, physiology_records)
    ↓
Observación candidata (estado: "candidato", confianza baja, 1 punto de evidencia)
    ↓
Se repite el patrón en eventos posteriores → confianza sube, puntos_evidencia sube
    ↓
Umbral alcanzado (ej: 5+ puntos de evidencia, confianza >0.7) → estado: "activo"
    ↓
Si sigue repitiéndose → tendencia puede marcarse "mejorando"/"empeorando"
    ↓
Si deja de observarse evidencia nueva durante mucho tiempo → estado: "obsoleto"
    ↓
Si aparece evidencia contraria → estado: "refutado", se genera un nuevo Knowledge Point actualizado
```

### Regla fundamental (la que evita repetir el error de `aprendizajes_atleta`)
**Ningún Knowledge Point nace con estado "activo" directamente desde una sola conversación.** Siempre nace como "candidato" con confianza baja, y solo asciende a "activo" cuando el pipeline determinista (no el LLM) confirma suficiente evidencia acumulada real.

### Nivel de Conocimiento (recalculado, versión 2)
El "40%" deja de ser una suma de puntos sueltos. Pasa a ser:
```
(Knowledge Points en estado "activo" o "en_evolucion") / (categorías totales posibles) × peso por categoría
```
Con las 6 categorías (perfil, capacidades, debilidades, respuesta al entrenamiento, recuperación, preferencias) como el techo — un atleta con Knowledge Points confirmados en todas las categorías se acerca al 100%, no por volumen de datos sino por **amplitud y confianza real del conocimiento**.

---

## Próximos pasos (implementación, sesión dedicada)
1. Migrar `athlete_response_patterns` → `athlete_knowledge_points` (ya cumple buena parte del schema)
2. Deprecar `aprendizajes_atleta` como fuente de verdad del Nivel de Conocimiento
3. Construir el pipeline determinista Observación → Evidencia → Confirmación (extendiendo el Athlete Response Engine ya existente)
4. Recalcular `obtener_daily_briefing` para usar el nuevo sistema