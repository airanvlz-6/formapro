# Executive Summary — Forge Truth Principle

Forge no es un chatbot que responde utilizando un LLM.

Forge es un sistema experto compuesto por múltiples componentes especializados, donde el LLM actúa únicamente como interfaz conversacional cuando realmente aporta valor.

Toda la arquitectura del sistema se rige por los siguientes principios:

**1. El LLM nunca es la fuente de verdad**
Los modelos de lenguaje pueden razonar, explicar y conversar, pero nunca son la autoridad sobre los datos del atleta. La verdad siempre reside en los sistemas deterministas de Forge.

**2. Toda verdad estructurada tiene prioridad**
Si un dato existe en una fuente estructurada (Estado Canónico, Knowledge Engine, Mi Plan, Benchmarks, Forge Insights, Historial Fisiológico...), esa información tiene prioridad absoluta sobre cualquier razonamiento del modelo. El LLM nunca debe regenerar información que Forge ya conoce.

**3. Un componente, una responsabilidad**
Cada componente tiene un propósito único y claramente definido:
- Event Aggregator clasifica eventos.
- Extractor extrae información.
- Validators verifican coherencia.
- Knowledge Engine proporciona conocimiento.
- Response Engine decide cómo responder.
- El Coach conversa con el atleta.

Ningún componente invade la responsabilidad de otro.

**4. Primero seleccionar, después generar**
Antes de generar una respuesta, Forge selecciona el contexto relevante. El modelo nunca recibe información masiva "por si acaso". Cada respuesta utiliza únicamente el contexto necesario para esa intención concreta.

**5. Validar siempre antes de persistir**
Toda información generada por un LLM debe considerarse provisional hasta ser verificada. Los Validators son responsables de proteger la coherencia científica, temporal y estructural del sistema antes de guardar cualquier dato.

**6. Los motores deportivos generan conocimiento; el Coach lo comunica**
La inteligencia deportiva reside en los motores especializados de Forge. El Coach no inventa datos ni toma decisiones que ya han sido resueltas por los sistemas deterministas. Su responsabilidad es explicar, motivar y comunicar ese conocimiento al atleta de forma natural.

**7. El Coach nunca introduce información estructurada por iniciativa propia**
El Coach puede explicar, motivar, interpretar, felicitar y responder — pero no puede introducir sesiones, pesos, ejercicios, PRs, benchmarks, HRV, sueño ni Insights salvo que esas piezas hayan sido inyectadas explícitamente por el Response Engine para ese intent concreto (Capability Injection). No se corrige después de que el modelo hable: se le impide tener la posibilidad de hacerlo desde el propio prompt.

## Consecuencia arquitectónica

En Forge: los datos deterministas gobiernan el sistema. Los modelos de lenguaje únicamente los interpretan y los comunican cuando es necesario.

Todo nuevo componente, motor o funcionalidad deberá respetar estos principios antes de ser incorporado a la arquitectura.

---

# Detalle de las reglas derivadas

**Regla 1 — Nunca regenerar datos existentes.**
Si un dato ya vive en una fuente determinista (Estado Canónico, Knowledge Engine, base de datos), ningún componente debe volver a generarlo desde el razonamiento de un LLM.

**Regla 2 — Explicar, no decidir.**
Si un dato existe en el Estado Canónico o el Knowledge Engine, el LLM solo puede explicarlo, contextualizarlo o motivar en torno a él — nunca modificarlo, reinterpretarlo, ni inventar una versión alternativa.

**Regla 3 — El LLM genera conocimiento solo cuando no existe una fuente determinista.**
El razonamiento libre (modo LLM) se reserva exclusivamente para preguntas de coaching genuino (por qué, cómo mejorar, qué opinas) donde no existe una respuesta única y objetiva ya almacenada.

**Regla 4 — El Validator protege la verdad existente.**
Cuando existe una fuente de verdad determinista, cualquier componente de validación (Forge Validator, Scientific Validator, Extraction Validator) tiene la responsabilidad de detectar y corregir cualquier desviación del LLM respecto a esa fuente.

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

---

# Checklist arquitectónico

Antes de crear un nuevo componente, motor o funcionalidad, responde estas preguntas:

- ¿Esta información ya existe en Forge?
- ¿Debe ser determinista o puede depender del razonamiento del LLM?
- ¿Qué componente será la fuente de verdad?
- ¿Quién valida este dato?
- ¿Quién puede modificarlo?
- ¿Quién solo puede leerlo?
- ¿Puede reutilizar una capacidad existente del Capability Registry?

Si cualquier nueva funcionalidad supera estas preguntas con respuestas claras, es muy probable que encaje con la filosofía de Forge sin introducir deuda técnica ni romper el Forge Truth Principle.