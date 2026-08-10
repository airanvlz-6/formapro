# FORGE — MAPA DE ESTADO
**10 de agosto de 2026**

Snapshot del estado real de la arquitectura tras la sesión de auditoría más extensa hasta la fecha. Clasificación honesta por versión real de madurez, no por "todo es V1".

---

## 1. Arquitectura central

| Componente | Estado | Versión | ¿Seguir desarrollando? |
|---|---|---|---|
| Canonical Truth / Estado Canónico | 🟢 Estable | V1.1 | 🛑 No |
| Knowledge Engine | 🟢 Implementado | V2.0 inicial | 🟡 Validar |
| Athlete Response Engine | 🟢 Implementado | V1.0 | 🟡 Validar |
| Weekly Strategy | 🟢 Implementado | V1.0 | 🟡 Validar |
| Week Blueprint | 🟢 Implementado | V2.0 | 🟡 Validar |
| Blueprint Acceptance Validator | 🟢 Implementado | V1.0 | 🛑 No |
| Session Builder | 🟢 Funcional | V1.1 | 🟡 Validar |
| Week Integrity Validator | 🟢 Funcional | V1.1 | 🟡 Validar |
| Block Memory | 🟢 Implementado | V1.0 | 🟡 Validar |
| Recovery Pipeline | 🟢 Implementado | V1.0 | 🟡 Validar |
| Pending Actions | 🟢 Funcional | V1.0 | 🛑 No |
| Event / Extraction system | 🟢 Robusto | V1.1 | 🛑 No |
| Physiological Records | 🟢 Estable | V1.1 | 🛑 No |
| PR Detection | 🟢 Implementado | V1.0 | 🟡 Validar |
| Onboarding (3 modos) | 🟢 Implementado | V1.0 | 🛑 No |
| Modo Supervisión | 🟢 Implementado | V1.0 | 🟡 Validar |
| Forge Cards | 🟢 MVP | V1.0 | 🛑 No |
| UX / Home adaptativa | 🟢 Funcional | V1.0 | 🟡 Cola UX menor |
| Objetivos / Timeline | 🔴 NO CERRADO | — | **P0 activo** |

---

## 2. Canonical Truth 🔒 — V1.1 ESTABLE

`ciclo_actual` dejó de poder ser modificado por extractores LLM. Antes cualquier mensaje conversacional ("no estoy en deload, estoy en intensificación") podía sobrescribir el estado real. Ahora:
- Eliminada escritura desde frontend y backend (extractores Haiku)
- Guard de auditoría: cualquier intento no autorizado se bloquea y registra
- `weekly_plan.week_number` deriva de `ciclo_actual.semana`, no de un `+1` ciego
- Mi Plan / Progreso / Coach muestran la misma verdad

👉 No desarrollar más. Observar en producción.

## 3. Athlete Knowledge Engine 🧠 — V2.0 inicial

Antes: "40% de conocimiento" hardcodeado, idéntico para todos los usuarios. Ahora: `athlete_knowledge_points` con evidencia acumulada, confianza, estado (candidato/activo/en_evolución/obsoleto/refutado), separación estricta entre Canonical Truth y Athlete Knowledge.

**Test pendiente crítico**: ¿Un Knowledge Point activo cambia realmente una decisión de Coach/Blueprint? Hasta comprobarlo, no está terminado.

👉 Prioridad: VALIDACIÓN (P1).

## 4. Athlete Response Engine 🎯 — V1.0

Detecta patrones de respuesta del atleta con evidencia real (candidato <8 puntos, activo ≥8). Ya no depende exclusivamente del LLM para decidir qué "sabe" Forge.

👉 Observar: falsos positivos/negativos, si los puntos influyen realmente después.

## 5. Weekly Strategy 🧠 — V1.0

Block Analyzer → Weekly Strategy → Blueprint. La Strategy razona objetivo, fase, adaptación principal/secundaria, riesgo, recuperación, cualidades prioritarias, distribución de debilidades — antes de bajar a días concretos.

👉 Dejar quieta y observar.

## 6. Week Blueprint 🗺️ — V2.0

El cambio más importante de programación deportiva del proyecto. Contiene tipo, foco, volumen, intensidad, conditioning, relación con día anterior, si trabaja debilidad, estrategia semanal. El Session Builder ya no decide la semana, solo traduce.

👉 STOP DEVELOPMENT / VALIDATE con datos reales de varias semanas.

## 7. Blueprint Acceptance Validator 🛡️ — V1.0

El "portero": rechaza Blueprints con disponibilidad incorrecta, distribución incoherente, recuperación insuficiente, días consecutivos de intensidad excesiva. No corrige — rechaza y regenera.

👉 No tocar salvo fallo real detectado.

## 8. Session Builder 🏗️ — V1.1

Una sesión por llamada, JSON estructurado, contexto de días adyacentes, snapshot real del atleta. Resueltos: JSON truncado, errores 500, contaminación cruzada de disciplinas, copia literal de sesiones pasadas (Session Duplication Validator).

👉 No añadir más inteligencia aquí — debe vivir en Strategy + Blueprint.

## 9. Week Integrity Validator 🛡️ — V1.1

Segunda red de seguridad tras el Session Builder: disponibilidad, disciplina, variedad, regeneración especializada.

👉 Validar en producción.

## 10. Block Memory 📚 — V1.0

Convierte "Forge sabe qué pasó" en "Forge sabe dónde está en el proceso". Alimenta Weekly Strategy con objetivo/resultado/fatiga/adaptaciones de la semana anterior.

👉 Validar que realmente cambia la planificación de la siguiente semana, no solo memoria narrativa decorativa.

## 11. Recovery Pipeline ❤️ — V1.0

HRV, sueño, RHR, fatiga, tendencias. Semántica corregida: Estado → Tendencia → Interpretación → Acción (ya no contradice "Buena/Apto" con "4 días descendiendo").

👉 Prioridad UX pendiente (fusión visual de las 3 secciones en una narrativa), no prioridad algorítmica.

## 12. Physiological Records — V1.1 ESTABLE

Migración completa de JSON antiguo a `physiology_records`. UPSERT, fechas, consumidores (Mi Historia, Mi Progreso) corregidos.

👉 No tocar. Observar que nuevos usuarios registren correctamente.

## 13. Pending Actions 🔄 — V1.0

Eliminada la dependencia de que el LLM genere un tag tras confirmación del usuario. Coach propone → Proposal Parser determinista detecta → Haiku estructura → pending_action → confirmación determinista (regex) → ejecución.

**Pendiente menor**: actualizar `por_que` junto con el resto de campos al modificar sesión.

👉 Corregir ese detalle y congelar.

## 14. PR Detection 🏆 — V1.0

Parser determinista + catálogo de ejercicios + niveles de confianza. Ya no depende de que el LLM genere tags correctamente.

👉 Validar con uso real.

## 15. Onboarding 🚪 — V1.0

Tres modos: Coach (planificación completa), Advisor/Supervisión (ya tiene entrenador), Flex (entrada ligera). Elimina la barrera de "cuestionario obligatorio antes de recibir valor".

👉 No añadir más modos. Probar con usuarios reales.

## 16. Modo Supervisión 👤 — V1.0

Funciona como producto diferenciado: workout history, fisiología, asesoramiento, sin necesidad de `weekly_plan`. Restricción de máxima prioridad impide que el Coach genere planificación en este modo.

👉 Validar con usuarios.

## 17. Forge Cards 🎴 — V1.0 MVP

Arquitectura de capas SVG por disciplina, múltiples tipos de logro (PR, racha, semana, objetivo).

👉 Dejar quieto. Observar interacción real de usuarios.

## 18. UX / Home adaptativa 🏠 — V1.0 funcional

Home según modo de entrada, estados vacíos con CTA, contenido diferenciado para supervisión.

👉 Cola de mejoras UX menor (navegación completa por página, fondos por disciplina), sin tocar arquitectura.

## 19. Objetivos / Timeline 🎯 — 🔴 NO CERRADO

`getObjectiveProgress()` devuelve `null`. Ya corregido conceptualmente (fecha real del evento en Timeline en vez de `tiempoScore = 30` fijo), pero sigue sin funcionar en producción.

**Regla innegociable**: sin fallback inventado (nunca 15%, nunca 30%). Si no hay datos suficientes: "Progreso no disponible todavía".

👉 **PRIORIDAD TÉCNICA INMEDIATA (P0)**.

## 20. Arquitectura de extracción / eventos — V1.1 robusta

Patrón aplicado repetidamente hoy: LLM propone en lenguaje natural → parser determinista decide → acción. Aplicado a PR, Pending Actions, modificaciones de sesión, eventos, protección de ciclo, duplicación de sesiones.

👉 No ampliar salvo bug real.

---

## Mapa general

```
                    FORGE 2026-08
                         │
        ┌────────────────┴────────────────┐
        │                                 │
   CANONICAL CORE                    INTELLIGENCE
        │                                 │
  Estado Canónico                  Weekly Strategy
  Physiology                       Blueprint
  Weekly Plan                      Block Memory
  Workout History                  Knowledge Engine
  Events                           Response Engine
        │                                 │
        └──────────────┬──────────────────┘
                        │
                  VALIDATION
                        │
          Blueprint Acceptance
          Week Integrity
          Scientific Rules
          Session Duplication
                        │
                        ↓
                 SESSION BUILDER
                        │
                        ↓
                   ATHLETE
                        │
                  feedback/data
                        │
                        └──────→ Knowledge
```

---

## Clasificación de versión global

**Forge V1.0 — Functional Core / V1.5 Architecture**

El MVP ya es V1 funcional para el usuario, pero internamente varias piezas son claramente V1.5/V2 arquitectónicas: Canonical Truth, Strategy→Blueprint→Session Builder, validadores de aceptación e integridad, Block Memory, Athlete Knowledge, Response Engine, modo Advisor/Supervisión, determinismo sistemático frente al LLM.

## Filosofía para el siguiente ciclo

**Build → Freeze → Observe → Measure → Fix**

En vez de: Build → encontrar imperfección → construir otra capa → encontrar otro caso límite → construir otra capa.

Forge ha llegado a un punto de madurez arquitectónica suficiente. El siguiente cuello de botella no es tecnológico — es verificar si el producto funciona cuando personas reales lo usan.

## Prioridades reales abiertas (únicas 3)

1. **P0 — Objective Progress**: resolver el `null` con evidencia de logs reales de Vercel, sin fallback inventado.
2. **P1 — Primer Knowledge Point real**: demostrar el ciclo completo evidencia → Knowledge Point → decisión del Coach/Blueprint → resultado, no añadir más features al motor.
3. **P2 — Testing con usuarios reales**: probablemente el mayor retorno posible ahora mismo. Observar qué hacen 5-10 usuarios reales con el Forge actual antes de construir más capas.

## Congelado (no desarrollar más, solo observar/corregir bugs reales)

Canonical Truth, Physiological Records, Pending Actions, PR Detection, Weekly Strategy, Blueprint, Session Builder, Week Integrity, Blueprint Acceptance Validator, Event/Extraction system, Onboarding, Forge Cards.