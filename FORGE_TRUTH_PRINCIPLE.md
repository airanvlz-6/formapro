# FORGE TRUTH PRINCIPLE

**Principio fundamental:**
Toda información que exista de forma estructurada en Forge tiene prioridad absoluta sobre cualquier razonamiento del LLM.

## Reglas derivadas

**Regla 1 — Nunca regenerar datos existentes.**
Si un dato ya vive en una fuente determinista (Estado Canónico, Knowledge Engine, base de datos), ningún componente debe volver a generarlo desde el razonamiento de un LLM.

**Regla 2 — Explicar, no decidir.**
Si un dato existe en el Estado Canónico o el Knowledge Engine, el LLM solo puede explicarlo, contextualizarlo o motivar en torno a él — nunca modificarlo, reinterpretarlo, ni inventar una versión alternativa.

**Regla 3 — El LLM genera conocimiento solo cuando no existe una fuente determinista.**
El razonamiento libre (modo LLM) se reserva exclusivamente para preguntas de coaching genuino (por qué, cómo mejorar, qué opinas) donde no existe una respuesta única y objetiva ya almacenada.

**Regla 4 — El Validator protege la verdad existente.**
Cuando existe una fuente de verdad determinista, cualquier componente de validación (Forge Validator, Scientific Validator, Extraction Validator) tiene la responsabilidad de detectar y corregir cualquier desviación del LLM respecto a esa fuente.

## La IA como módulo, no como sistema

Este principio implica un cambio de posición: el LLM deja de ser el centro de Forge y pasa a ser un módulo más, especializado en comunicación y razonamiento abierto, rodeado de componentes deterministas que garantizan la verdad.

Cuando lleguen nuevos dominios (nutrición, prevención de lesiones, potencia, etc.), el patrón se repite siempre igual:

```
[Dominio] Engine (fuente de verdad determinista)
        ↓
   Coach (explica/interpreta, nunca decide)
```

---

# FORGE CAPABILITY REGISTRY

Registro central de cada intent soportado: su fuente de verdad y su modo de respuesta. Añadir una capacidad nueva = añadir una fila aquí + su función en el Knowledge Engine correspondiente. No requiere tocar el resto del sistema.

| Intent | Source | Mode | Validator relevante |
|---|---|---|---|
| PLAN_HOY | Estado Canónico (`sesion_hoy`) | STATIC | Forge Validator |
| PLAN_MANANA | Estado Canónico (`sesion_manana`) | STATIC | Forge Validator |
| PLAN_SEMANA | Knowledge Engine (`getWeekPlan`) | STATIC | Persistence Validator |
| BENCHMARK | Knowledge Engine (`getBenchmark`) | STATIC | Extraction Validator |
| OBJETIVO | Knowledge Engine (`getCurrentObjective`) | HYBRID | — |
| DEBILIDADES | Knowledge Engine (`getActiveWeaknesses`) | HYBRID | — |
| ULTIMO_INSIGHT | Knowledge Engine (`getLatestInsight`) | HYBRID | — |
| HISTORIAL_FISIOLOGICO | Knowledge Engine (`getRecoveryStatus`) | HYBRID | — |
| REPORTE_ENTRENO | Event Aggregator + Extractor | LLM | Extraction Validator |
| REPORTE_SUENO | Event Aggregator + Extractor | LLM | Extraction Validator |
| MODIFICAR_PLAN | Orchestrator | LLM | Scientific + Persistence Validator |
| COACHING | Claude (razonamiento libre) | LLM | Forge Validator |
| META | — (no debería llegar al Coach) | LLM | — |
| OTRO | Claude (razonamiento libre, fallback) | LLM | Forge Validator |

## Cómo añadir una nueva capacidad (ejemplo futuro: nutrición)

1. Crear `lib/knowledge/nutritionKnowledge.ts` con funciones deterministas (`getTodayMeals()`, `getCalorieTarget()`, etc.)
2. Añadir el/los intents nuevos al prompt del Intent Classifier (`route.ts`)
3. Registrar el intent en `knowledgeRouter()` (`athleteKnowledge.ts` o el archivo de dominio correspondiente)
4. Registrar el modo en `INTENT_RESPONSE_MODE` (`responseEngine.ts`)
5. Si el modo es STATIC, añadir su plantilla en `buildStaticResponse()`
6. Añadir la fila correspondiente a esta tabla

Ningún otro componente necesita cambiar.