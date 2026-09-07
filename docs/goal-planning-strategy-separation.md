# Goal description y planning strategy

Actualización posterior: el bloqueo de Carrera por falta de estrategia específica descrito en este informe histórico queda sustituido por [el fallback general de Carrera](general-running-strategy.md). Las demás reglas se conservan.

Base local: `1e2817b57c01058c5b4e6230855b47ec8db2cbcf`, sobre `bfb8657303f617869b469eede22d41b9a8ed813b`. Cambio nuevo, sin amend, rebase, migración ni push.

## Auditoría de fuentes, previa a la implementación

| SOURCE | EXAMPLE | WRITER | CURRENT SEMANTIC ROLE | CAN AUTHORIZE STRATEGY FAMILY? | WHY |
|---|---|---|---|---|---|
| `usuarios.especialidad` | `funcional_crossfit`, `hibrido_hyrox`, `carrera` | `ESPECIALIDAD_KEY`, `elegirEspecialidad`, `guardar_usuario`, edición de especialidad en `app/FormaPro.tsx` | Selección deportiva estructurada vigente | Sí, mediante catálogo exacto de compatibilidad | CrossFit y Hyrox tienen familias existentes. Carrera requiere clasificación de distancia soportada. No toda especialidad tiene familia compatible. |
| `usuarios.categoria` | `funcional`, `carrera`, `fuerza`, `hibrido` | Onboarding; bootstrap en `lib/auth/athleteIdentity.ts` | Categoría amplia | No por sí sola | Funcional incluye fitness, CrossFit y calistenia. No autoriza elegir entre ellos. |
| `usuarios.perfil.especialidad` | `CrossFit / WOD`; texto de disciplina Focus | `setRespuestas` en selección y onboarding Focus | Etiqueta contextual del cuestionario | No como segunda autoridad deportiva | La edición posterior actualiza `usuarios.especialidad`, no necesariamente esta etiqueta; Focus usa el campo para describir la disciplina delegada. |
| `usuarios.perfil.distancia_objetivo` | `10K`, `Media maratón (21K)`, `Maratón (42K)`; `Sprint`, `Ironman` | Cuestionarios de Carrera y triatlón | Clasificación de distancia objetivo | Sí, solo bajo selección `carrera` y valor exacto soportado | El campo se reutiliza en distintos dominios. No convierte una distancia secundaria de un atleta CrossFit en su objetivo principal. |
| `usuarios.objetivo_principal.descripcion` | `Open CrossFit Games 2027 - estándares Masters` | Captura de objetivo; respuesta explícita estructurada | Declaración primaria | Sí, si resuelve un ID canónico exacto; en otro caso conserva contexto | Una frase desconocida no prueba ausencia de estrategia. |
| `usuarios.objetivo_principal.tipo`, `.fecha` | `competicion`, `marca`, `evento`, fecha | Captura en `app/api/chat/route.ts` | Contexto de evento | No identifican por sí solos una familia deportiva | El tipo es amplio y la captura usa extracción del modelo. No se introduce autoridad LLM para resolver estrategia. No hay un ID de evento deportivo adecuado que deba inventarse. |
| `perfil.objetivo_general`, `perfil.objetivo_principal` | Declaraciones de objetivo | Registro/onboarding y writer de respuesta primaria | Otras autoridades primarias explícitas | Sí, con resolución exacta o familia deportiva determinista | Sus discrepancias se conservan; solo bloquean cuando impiden resolver una estrategia común. |
| `perfil.objetivo_detalle`, competición y metas secundarias | Masters, estándares, fecha, skill | Cuestionarios y captura de contexto | Detalle, evento y contexto secundario | No como primary | Se mantienen separados en 3A. |
| `usuarios.modo_entrada` | `coach`, `focus`, `supervision` | Selector de modo; bootstrap | Permiso y alcance prescriptivo | No | No declara deporte ni meta. |
| `athlete_training_sources` | Box Forge; Carrera externa | Configuración de delegación y confirmación de ownership | Ownership, actividad, días | No | Las mismas disciplinas pueden servir a deportes principales diferentes. |
| `PrescriptionScope.managedDisciplines` / `externalDisciplines` | Box + Carrera | Proyección del scope desde modo y fuentes | Alcance autorizado de ejecución | No | Intersecta métodos, no elige la estrategia deportiva. |
| `usuarios.distribucion_semanal` y `training_sources.dias` | Box M/J/V/S; Carrera L/X/D | Onboarding, corrección determinista de disponibilidad | Disponibilidad habitual | No | Autoriza días, no objetivo ni deporte. |
| Onboarding Focus | Texto de la disciplina encargada a Forge | `focusDisciplinaForge`, inferencia de categoría en UI | Delegación parcial | No por sí solo | Una categoría inferida de texto delegado no prueba deporte principal. No se reutiliza esa inferencia como autoridad estratégica. |

El catálogo nuevo usa `funcional_crossfit` y `hibrido_hyrox`; mantiene `crossfit` como selección exacta legacy ya contemplada por el contexto deportivo. No admite `box`, categorías amplias, etiquetas de grupos ni coincidencias parciales. No se asigna una familia por la mera disponibilidad de sus sesiones. Powerlifting, halterofilia, strongman y otras especialidades no reciben automáticamente `max_strength`: eso requeriría compatibilidad de preparación modelada, no semejanza de nombre.

## Decisión y contratos

`GoalResolutionResult` continúa describiendo evidencia primaria y reconocimiento canónico. Su `GOAL_UNSUPPORTED` significa que no se reconoció un ID del catálogo; ya no concede ni deniega permiso de planificación.

`StrategyResolutionResult` contiene `status`, `strategyId`, tipo de `source`, fuentes concretas, evidencia `goal` con las descripciones intactas y `declaredSport`. Es una proyección pura y serializable, sin writes, servicios externos, fuzzy, embeddings, substring ni LLM. El catálogo de compatibilidad vive en `lib/sports/declaredSportStrategy.ts`, fuera del motor compartido.

Jerarquía por declaración primaria:

1. ID canónico reconocido por los aliases exactos existentes.
2. Distancia estructurada exacta, bajo la selección deportiva correspondiente.
3. Especialidad explícita con familia compatible en el catálogo.
4. Sin estrategia determinista: `STRATEGY_UNSUPPORTED`.

Antes de admitir se comparan las consecuencias de todas las declaraciones primarias. Dos declaraciones que resuelven familias diferentes, o cuya combinación sigue indeterminada, mantienen `GOAL_CONFLICT`. Dos aliases del mismo ID o dos descripciones resueltas a la misma familia pueden planificarse sin borrar su discrepancia textual. Un primary ausente sigue siendo `GOAL_MISSING`: ni el detalle ni el ownership fabrican una meta.

El loader 3A expone `planningStrategy` junto a `goals.primary`, `goals.detail`, `goals.competition` y `athlete.especialidad`, conservando los roles. 3B consume `strategyId` mediante su campo compatible `goal.id`, que identifica la familia de demandas, nunca reemplaza la descripción humana. El digest estratégico incorpora la resolución y su procedencia; cambiar la especialidad que sostiene la estrategia invalida el contexto anterior.

La admisión semanal consulta la estrategia antes del Planner. Las preguntas primarias comprueban la misma autoridad: no se vuelve a preguntar una descripción cuya familia ya está resuelta. Un write explícito conserva incluso el alias humano elegido (`Media maratón`), en lugar de convertirlo a `half_marathon`; la compatibilidad se proyecta al releer la base de datos. Los conflictos sustituidos siguen archivados y el CAS sigue protegiendo objetivo, perfil, especialidad, categoría y modo.

## Producción y disponibilidad

El fixture usa exactamente:

```text
especialidad = funcional_crossfit
goal description = Open CrossFit Games 2027 - estándares Masters
Box = martes, jueves, viernes, sábado
Carrera = lunes, miércoles, domingo
managed = Box + Carrera
```

Secuencia probada sin LLM: lectura de disponibilidad → pregunta «¿Sigue siendo correcta para esta semana?» → confirmación sin writes → preflight pide decisión temporal → «Próximo día disponible» → `includeToday=false` → contrato admitido con `crossfit`. El objetivo antes/después es idéntico, no se emite pregunta de objetivo ni mensaje de estrategia ausente. `running_base` sigue entre los métodos disponibles.

Chat y botón tras cierre llaman la misma entrada. Esta muestra primero la pregunta semanal del servidor y guarda el digest de disponibilidad; una lectura fallida detiene el flujo. Las continuaciones confirmadas pasan al preflight conservando la intención temporal. Se mantiene la gramática cerrada: `sí`, `sí, es correcta`, `sigue siendo así`, `sigue igual`, `todo correcto` avanzan. `no` mantiene la corrección pendiente sin mutación; una corrección explícita usa los writers existentes y cambia disponibilidad **habitual**, no un override semanal.

La decisión temporal relevante sigue siendo del usuario: incluir hoy=true, próximo día disponible=false, ambiguo=sin resolver. No se confunde una afirmación de disponibilidad con permiso para entrenar hoy. Se mantienen la omisión cuando hoy está fuera del target o no admite una decisión útil, las validaciones de semana/scope y el preflight previo al Analyzer. No se modifica el arranque específico del onboarding Focus; la solicitud de semana por chat/botón usa el checkpoint compartido en los modos prescriptivos.

Running: hay `10k` y `half_marathon`; no hay familia genérica, de maratón, 5K, trail/ultra o triatlón añadida en este cambio. Una descripción «Maratón de Madrid» con selección Carrera, sin clasificación soportada, sigue siendo `STRATEGY_UNSUPPORTED`. `Maratón (42K)` nunca se mapea a media maratón. Esto expresa falta real de estrategia compatible, no un problema de alias de la ciudad o competición.

## Entrega: comprobaciones solicitadas

1. Fuente deportiva real: `usuarios.especialidad`; auditoría completa arriba.
2. Goal y strategy son resoluciones separadas.
3. Jerarquía exacta → evento estructurado → deporte compatible → unsupported.
4. Los aliases exactos siguen resolviendo las cinco familias existentes.
5. Las descripciones específicas se conservan.
6. CrossFit Games/Masters resuelve CrossFit por especialidad.
7. Running/marathon auditado: no se inventa una familia.
8. Unsupported auténtico bloquea antes del Planner.
9. Conflictos estratégicamente materiales siguen bloqueando.
10. Primary de producción antes/después: `Open CrossFit Games 2027 - estándares Masters`.
11. Sin migraciones ni columnas nuevas.
12. Confirmación semanal restaurada sobre disponibilidad habitual.
13. Chat usa la entrada compartida y muestra la pregunta.
14. Botón, después de cierre correcto, usa la misma entrada y pregunta.
15. Las cinco afirmaciones requeridas se verifican sin mutación.
16. Negativa queda en corrección; cambios explícitos usan el writer habitual.
17. Pregunta temporal conservada cuando existe decisión útil.
18. Próximo día disponible produce `includeToday=false`.
19. Respuestas ambiguas permanecen sin resolver.
20. Confirmar no cambia ownership.
21. Focus conserva alcance delegado y carga externa.
22. Coach conserva las disciplinas autorizadas.
23. Supervisión sigue sin permiso prescriptivo.
24. CrossFit + Carrera conserva transferencia; no hay filtro de solo Box.
25. 37 tests adicionales respecto a la base de 1314. Ejecución específica de `strategyResolution.test.mjs`, `weeklyGenerationPreflight.test.mjs` y `goalResolution.test.mjs`: **121/121 PASS**. Regresiones previas ajustadas a la decisión de producto.
26. `node --test --test-concurrency=4 lib/**/*.test.mjs`: **1351/1351 PASS**, 0 fallos, 0 omitidos.
27. `npx tsc --noEmit`: **PASS**, exit 0, sin errores.
28. `git diff --check`: **PASS**. Git avisa de la conversión LF/CRLF configurada; no hay errores de whitespace.
29. Archivos: catálogo y resolver nuevos; integración en loader 3A, estrategia/admisión 3B, preguntas de objetivo, entrada UI y texto de disponibilidad; tests y este informe. Sin cambios en dosis, sufficiency, load, readiness, restricciones, Builder, 3D/3D.1, retry o Exposure.
30. Commit nuevo: `fix: separate athlete goal from planning strategy`; SHA se entrega tras crear el commit.
31. El estado posterior al commit se comprueba y entrega junto a su SHA; los logs locales de validación no forman parte del commit.
32. NO PUSH.

Archivos del cambio:

```text
app/FormaPro.tsx
lib/athlete/goalAnswers.ts
lib/athlete/goalResolution.ts
lib/athlete/goalResolution.test.mjs
lib/athlete/loadAthletePrescriptionContext.ts
lib/athlete/strategyResolution.ts
lib/athlete/strategyResolution.test.mjs
lib/planning/canonicalWeekStrategy.ts
lib/planning/goalTransferStrategy.test.mjs
lib/planning/prepareAllowedWeeklyPlanContract.ts
lib/planning/weeklyGenerationPreflight.test.mjs
lib/sports/chatAvailability.ts
lib/sports/declaredSportStrategy.ts
lib/sports/sessionContractIntegration.test.mjs
docs/goal-planning-strategy-separation.md
```
