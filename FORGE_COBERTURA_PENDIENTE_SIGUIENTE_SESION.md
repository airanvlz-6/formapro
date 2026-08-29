# FORGE — Pendiente próxima sesión: Sprint de Cobertura de Prescripción (continuación)

## Contexto
Sesión 28/08: Sprint de Integridad de Planificación completo y verificado con evidencia real
(Movement Library, Stimulus Library, Exposure Engine, Workout Structure Library, Substitution
Engine — todo conectado y funcionando en producción). Arquitectura ya cerrada — lo que queda
es ampliar vocabulario, no tocar el motor.

## 1. Librería de CARRERA — completar con mismo criterio que box
Actualmente solo tiene 12 tipos de sesión de carrera pura (rodaje, tempo, series, cuestas...).
Falta: **carrera necesita también fuerza/potencia complementaria**, no solo correr:
- Ejercicios de fuerza para corredores (sentadilla, zancadas, pliometría, core específico)
- Trabajo de potencia (saltos, sprints cortos, drills de técnica de carrera)
- Movilidad/prevención específica de running (tobillo, cadera)
- Esto requiere decidir si estos movimientos viven en `discipline: "carrera"` o se referencian
  cruzando con movimientos ya existentes de `discipline: "box"` (ej: goblet_squat, walking_lunge,
  broad_jump ya existen — puede que solo haga falta marcarlos como `suitable_for` carrera también,
  en vez de duplicar entradas)

## 2. CrossFit/box — Prioridad 2 (variantes técnicas)
Del diagnóstico de ayer, pendiente de añadir:
- hang / power / strict / deficit / tempo / pause / unilateral / overhead / front-rack como
  variantes sistemáticas de movimientos ya existentes (no todos individualmente, evaluar cuáles
  aportan diversidad real)
- `deficit_hspu`, `pike_handstand_push_up`, `handstand_hold`, `handstand_shoulder_tap`
- `v_up`, `sit_up`, `goblet_sit_up` (core adicional)
- Monoestructural con prescripción de distancia/calorías como parámetro, no como movimiento
  nuevo cada vez (decisión arquitectónica ya identificada: NO crear run_200/400/800/1000 como
  entradas separadas — usar `run` + parámetro de distancia en la prescripción)

## 3. Prioridad 3 (diferir salvo necesidad real)
Sotts press variantes muy específicas, complejos de competición nicho — no prioritario.

## 4. Mejora de modelo de datos pendiente (mencionada, no implementada aún)
- `movement_components`: para movimientos compuestos (thruster = squat + vertical_push;
  burpee = horizontal_push + squat + jump) — permitiría al Exposure Engine detectar exposición
  a "patrones compuestos" (ej: "mucho floor-to-standing reciente") no solo por movimiento exacto
- `substitution_family`: generalizar lo que ya empezamos con `substitutionEngine.ts`
- Separar `clean_and_jerk_complex` de `MOVIMIENTOS_BOX` — es una estructura/complejo, no un
  movimiento elemental, debería vivir en `WORKOUT_STRUCTURE_LIBRARY` o un concepto de "complex"
  propio

## Estado actual de la librería (checkpoint 28/08)
- Box: ~90 movimientos, taxonomía de `movement_pattern` corregida (cyclic para máquinas,
  vertical_pull/horizontal_pull separados, inverted_locomotion para handstand walk)
- Carrera: 12 tipos de sesión, sin fuerza/potencia complementaria
- Estímulos: 22 (12 box + 10 carrera)
- Workout structures: 15 formatos (AMRAP/EMOM/For Time/etc)
- Substitution map: 5 registros conocidos