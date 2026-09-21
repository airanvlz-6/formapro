# Auditoría forense de generación semanal — 2026-09-21

## 1. Resumen ejecutivo y alcance probatorio

**La causa productiva de ninguno de los dos incidentes está demostrada.** Se ha reconstruido el flujo ejecutable del repositorio y comprobado sus mecanismos con pruebas locales. No se dispone de las filas, peticiones ni logs de las generaciones afectadas, ni del SHA de sus despliegues. Atribuir ahora el problema al LLM, ciclo, disponibilidad o Supabase sería inventar la causalidad.

Identidades y fechas confirmadas por el usuario durante esta auditoría:

| Caso | Generación correcta reportada | Generación defectuosa reportada | Síntoma comunicado |
|---|---|---|---|
| AIRAN, `060385` | domingo 13/09/2026 | domingo 20/09/2026 | No se generaron correctamente las sesiones de esta semana |
| Segundo atleta, `FORGE12` | domingo 13/09/2026 | domingo 20/09/2026 | Cinco REST y, en la práctica, sin entrenamientos prescritos |

Las semanas objetivo esperadas son 14/09 y 21/09, **pendientes de comprobar en `targetWeekStart`/`week_start`**. Generar un domingo no implica automáticamente generar la semana siguiente: depende del cierre de semana.

HEAD examinado: `42935612d3ff8c389560d6d842e4bfc39fe6a1d8`. Estado inicial del árbol limpio. Las referencias de archivo y línea siguientes corresponden a ese HEAD, salvo indicación expresa. No se ha modificado código, prompts, configuración o datos productivos; el único archivo añadido es este informe.

Hallazgos confirmados en código/pruebas, sin atribuirlos a las cuentas:

- La ruta activa del repositorio usa contrato abierto v2. Admite de cero a siete días ejecutables. Cinco REST pueden ser una decisión admitida del Weekly Coach, sin fallo de Builder.
- Una declaración semanal explícita de cero entrenamientos genera REST sin llamar al Weekly Coach, respetando slots protegidos. No es un fallback por error.
- Un Builder fallido detiene la construcción y evita el guardado de esa propuesta. Las validaciones duras tampoco convierten entrenamientos en REST.
- El ciclo se puede reservar/avanzar **antes** de la selección semanal y del guardado del plan. Encontrar un ciclo avanzado no demuestra que exista una semana guardada correctamente.
- El ensamblado reemplaza la explicación específica de REST por «Recuperación programada». Ese texto no prueba que el descanso proceda de fisiología/readiness.
- El historial local contiene cambios relevantes el 13 por la tarde y el 14. No se ha demostrado que se desplegaran entre las dos generaciones. Se respeta la afirmación del usuario sobre ausencia de cambios productivos como dato reportado, sin confundirla con el historial Git.

### Fuentes disponibles y ausentes

1. Solicitud adjunta y aclaración de identidades/fechas: evidencia del síntoma reportado, no un export de ejecución.
2. Código local, historial Git y 107 pruebas locales: evidencia de mecanismos reproducibles.
3. `docs/production-planning-regression-audit.md`, auditoría anterior de HEAD `4f5eb1e`, cita AIRAN y run `c8d9d91c-9b30-4710-babe-dd45ca9fdd1f` del 13/09. Es una fuente secundaria local: describe problemas de otra versión, sin filas productivas adjuntas. **No se reutiliza como snapshot de la generación correcta ni de la defectuosa.** Su caracterización problemática del día 13 requiere reconciliar run/hora/revisión con el relato actual.
4. No hay variables Supabase configuradas en los archivos `.env*` inspeccionados ni en el entorno del proceso. Solo se verificaron nombres/presencia, nunca se mostraron secretos. `.env.local` contiene un token OIDC de Vercel; `.env.local.txt`, una clave Anthropic. Ninguno acredita por sí solo una conexión de lectura a la base o a los logs. No se extrajeron secretos remotos. No hay herramienta Supabase/Vercel de lectura disponible; no se encontró CLI Vercel ni auth.json en sus dos ubicaciones Windows comprobadas. `.vercel/repo.json` identifica el proyecto, no su versión desplegada.
5. No se encontraron archivos locales de logs de estos runs en la búsqueda del repositorio. Esto no afirma que no existan logs remotos.

**Límite de la fase 1:** este informe demuestra la ruta ejecutable del checkout; no puede certificar qué binario ejecutó producción el 13 o el 20 sin metadatos de despliegue y logs. Las fases 3–5 quedan documentadas con sus huecos, no cerradas causalmente.

## 2. Pipeline real trazado en el código

| Etapa | Archivo, función/rama y líneas | Comportamiento observado |
|---|---|---|
| Entrada Web | `app/FormaPro.tsx:955–993`, `orquestarGeneracionSemana` | Preparar generación → comprobar cierre → preflight → Analyzer → Planner. Conserva target/token durante preguntas |
| Snapshot y run | `lib/planning/weeklyGeneration.ts:19–38`, `beginWeeklyGeneration` | Lee `weekly_plan` de semana actual y siguiente, genera UUID y token firmado. Fallo de lectura aborta |
| Calendario/target | `app/FormaPro.tsx:965–979`; `app/api/chat/route.ts:2349–2360`, `check_week_closure` | Cierre reconocido selecciona `nextWeek`; si no, `currentWeek`. `includeToday` es explícito |
| Preflight | `lib/planning/weeklyGenerationPreflight.ts:20`, `resolveWeeklyGenerationPreflight` | Resuelve requisitos de disponibilidad, temporalidad, objetivo/evento antes del Planner |
| Analyzer | `app/api/chat/route.ts:2041–2253`, `analizar_bloque_semana` | Restricciones, estado canónico, fuentes externas, ciclo, último outcome, exposición, debilidades, notas y frecuencia → análisis consultivo |
| Entradas mutables del Analyzer | `app/api/chat/route.ts:2089–2145,2245–2248` | Reevalúa seguimiento de debilidades según antigüedad; puede actualizar notas consideradas. No es una consulta forense inocua |
| Entrada Weekly | `app/api/chat/route.ts:2257–2293`, `planificar_semana` | Exige v2, verifica token/target; llama `planBoundedWeek` con `strategyVersion=1`, `coherenceVersion=1`, `openCoachVersion=1`. Del Analyzer pasa `strategyProposal`, no todo el análisis |
| Carga de atleta | `lib/athlete/loadAthletePrescriptionContext.ts:30–118`, `loadAthletePrescriptionContext` | Usuario, cuatro planes anteriores, modificaciones, restricciones, recuperación, ejecuciones Carrera → contexto serializable |
| Disponibilidad/scope | `lib/planning/weeklyCalendarAuthority.ts:35–60`, `loadWeeklyCalendarContext` | `usuarios` + `athlete_training_sources`; días de fuente Forge o distribución habitual; declaración de semana y acceso por fecha tienen precedencia |
| Disponibilidad fechada | `lib/sports/temporaryTrainingAccess.ts:6–13`, `availableDaysAtWeek`; `lib/sports/weeklyAvailabilityDeclaration.ts:74–82`, `weeklyDeclaration` | `perfil.weekly_availability[week]` sustituye días habituales; `prescription_access[fecha]` excluye fechas |
| Restricciones | `lib/athlete/getCanonicalRestrictions.ts:40–94`, `projectCanonicalRestrictions` / `getCanonicalRestrictions` | Estado activo y notas hard/reassessment pendientes/consideradas; `valid_until` modifica vigencia. Errores no equivalen a ausencia |
| Fisiología/readiness | `lib/physiology/recoveryContext.ts:23–69`, `prepareRecoveryContext`; loader de atleta `:98–104` | Recuperación objetiva/subjetiva/tendencias. Weekly no suministra readiness preparado: queda `unknown/not_prepared_no_recalculation` |
| Ciclo/bloque/contador | `lib/planning/prepareAllowedWeeklyPlanContract.ts:202–213`, `planBoundedWeek`; `lib/planning/longitudinalAuthority.ts:15–79`, `ensureLongitudinalTarget` | Resuelve target idempotente; ancla al ciclo o último plan, incrementa o pide transición al Coach; escribe ciclo con CAS antes de construir |
| Deload/estrategia | `lib/planning/prepareAllowedWeeklyPlanContract.ts:45–67`; `lib/planning/canonicalWeekStrategy.ts:42–95`, `buildCanonicalWeekStrategy` | Proyección longitudinal sustituye fase/semana; construye estrategia. Existe tratamiento específico de evento media maratón; no extrapolarlo a Box |
| Memoria/historial | `lib/planning/weeklyCoachingContext.ts:27–39,43–136`, `loadWeeklyCoachingSupplement` / `buildWeeklyCoachingContext` | Dos outcomes, ocho notas; 14 filas de historia, ocho modificaciones, diez movimientos expuestos por disciplina y diez ejecuciones Carrera; resúmenes 7/28 días |
| Slots protegidos | `lib/planning/prepareAllowedWeeklyPlanContract.ts:77–133`, `loadWeeklyPlanningContext` | Preserva completadas/pasadas y otras protecciones; distingue externos, no disponibles y sin registrar. No son sinónimos de REST |
| Contrato/decisión | `lib/planning/openWeeklyCoachContract.ts:10–72`, `buildOpenWeeklyContract` / `validateOpenWeeklySelection` | `maxExecutableDays=7`, `minExecutableDays=0`, sin REST obligatorio. Coach elige TRAIN/RECOVERY/REST; para ejecutables elige disciplina, adaptación, estímulo, patrón, método y rol |
| Prompt y composición | `lib/planning/openWeeklyCoachContract.ts:93–103`, `openWeeklyPrompt`; `lib/planning/allowedWeeklyPlanContract.ts:327–383`, `composeBoundedWeek` | Contexto + contrato + ejemplos → JSON validado. Dos propuestas como máximo; excepción explícita de cero disponibilidad sin LLM |
| Recibo de calendario | `lib/planning/prepareAllowedWeeklyPlanContract.ts:234–268`; `lib/planning/weeklyCalendarAuthority.ts:62–107`, `issueWeeklyCalendar` | Selección admitida → slots firmados, razones, proyección longitudinal, digest y snapshot. Relectura de frescura |
| Destinos Builder | `app/FormaPro.tsx:1038–1092` | Solo nuevos TRAIN/RECOVERY; excluye descanso/externos/sin registrar/protegidos/pasados. **Bucle secuencial con await**, pese al comentario antiguo de paralelismo; transporta sesiones hermanas aceptadas |
| Entrada Session | `app/api/chat/route.ts:2320–2345`; `lib/sports/sessionAuthority.ts:66–179`, `generateTrainingSession` | Verifica calendario, orden/hermanas, slot, perfil, restricciones, recursos, referencias, dosis y contexto. Puede fallar antes de llamar al LLM |
| Diseño/validación | `lib/sports/sessionGeneration.ts:27–202`, `generateContractSession` | Preflight → propuesta → parseo/shape → contrato, semántica, dosis, recursos/restricciones → render/admisión; retries acotados. Devuelve error, no REST, si falla |
| Ensamblado | `app/FormaPro.tsx:1089–1149` | Error Builder aborta; combina protegidas, no disponibles, sesiones y REST. REST recibe texto genérico. Reglas científicas trabajan sobre clon; v2 usa integridad servidor |
| Validación semanal | `app/api/chat/route.ts:4677–4724`; `lib/planning/enforceWholeWeek.ts:8–97`, `enforceWholeWeek` | Verifica calendario, sesiones y coherencia; repara dentro de contratos firmados. Fallo duro aborta. Reconsideración consultiva fallida conserva la versión previamente válida |
| Persistencia | `app/api/chat/route.ts:4730–4849`, `guardar_plan_semana`; `lib/planning/planPersistence.ts:84–111`, `createPlan` / `mutatePlanWithCAS` | Identidad, cuota de dos generaciones, validación, frescura y receipt → INSERT o UPDATE por revisión. Estados committed/conflict/error/unknown explícitos |
| Efectos tras commit | `app/api/chat/route.ts:4820–4846` | Outcome, log y evento; errores se devuelven como warnings. No prueban rollback del plan |
| Lectura UI | `app/FormaPro.tsx:928–930,1150–1159`, `cargarPlanSemanal`; `app/api/chat/route.ts:4216–4234`, `obtener_plan_semana` | Éxito recarga semana guardada explícita; fallo recarga semana actual. UI muestra fila leída, no necesariamente propuesta fallida |

No se ha identificado un cron de generación semanal en esta ruta: el flujo trazado se inicia desde la aplicación. La fecha dominical del síntoma no demuestra una tarea automática.

### Contexto exacto: qué puede reconstruirse

Se conoce la **plantilla y estructura** exacta de `openWeeklyPrompt`, no los valores serializados de cada incidente:

```text
instrucciones de openWeeklyPrompt(contract, context)
KNOWLEDGE_EXAMPLES:\n + JSON.stringify(TRANSFER_METHODS)
COACHING_CONTEXT:\n + JSON.stringify(coachingContext)
WEEKLY_CONTRACT:\n + JSON.stringify(contract)
```

`coachingContext` contiene `asOfDate/targetWeekStart`, `past` (historia, frecuencia, modificaciones, exposición, ejecuciones, outcomes, notas), `current` (readiness, fisiología, restricciones, tiempo, señales, referencias, externos), `future` (objetivo del ciclo, debilidades, protegidas, disponibilidad, conocimiento del atleta y señales por día), `options/trainingKnowledge`.

El contrato v2 contiene scope, digest, fixed/protected, política 0–7, `openFacts.allowed/contexts/daySufficiency/weeklyAvailability/athleteCoachingKnowledge` y estrategia. Que `dayOptions` muestre REST en un día libre **no significa que el menú real de v2 prohíba entrenar**: TRAIN se propone mediante intent abierto y se contrasta con `openFacts.allowed`. No aplicar aquí conclusiones del enumerador cerrado v1.

## 3. Inventario de entradas mutables

En la tabla, «REST orientativo» significa que puede influir en una elección del Coach, no una conversión determinista demostrada. «Bloquea» incluye impedir construcción o guardado. **Todas estas entradas pueden cambiar sin editar código**, por datos, reloj, estado de petición o servicio; no consta cuáles cambiaron en las cuentas.

| Clase / variable | Obtención → consumidor | ¿Puede producir REST? | ¿Puede impedir sesión/guardado? |
|---|---|---|---|
| A. Identidad/autenticación y modo | Petición/sesión, `usuarios.modo_entrada` → ruta/scope/save | No automáticamente | Sí, acceso/identidad/capacidad |
| A. Especialidad, categoría, objetivo, perfil, test, marcas, datos_entrenamiento | Loader atleta `:43–55`, proyección de perfil → estrategia y Session | Orientativo | Sí, objetivo sin resolver o referencias incompatibles |
| A/F. Propiedad de disciplina y días | `athlete_training_sources`, `loadWeeklyCalendarContext` → scope/calendario | Indirectamente; externos son UNAVAILABLE | Sí, ámbito externo o conflicto de protección |
| A/F. Distribución habitual, `perfil.dias` | `usuarios.distribucion_semanal/perfil` → calendario/frecuencia | Restringe días disponibles | Sí, ausencia/invalidez |
| F. Declaración semanal y exclusiones | `perfil.weekly_availability[week]` → `availableDaysAtWeek`, composer | Sí; cero explícito produce REST sin LLM | Sí, declaración no resuelta |
| F/E. Acceso fechado, entorno/material/skills y tiempo disponible | `perfil.prescription_access[fecha]`, señales y presupuesto temporal → calendario/Session | Orientativo; indisponibilidad fechada se representa UNAVAILABLE | Sí, ausencia explícita, dosis/tiempo/recurso incompatible |
| B. Día civil, semana y zonas horarias | Reloj Canary en token/UI; Madrid en restricciones; UTC en otros timestamps → todos | Protección de REST pasado; elección contextual | Sí, cambio de semana, expiración o target inválido |
| B. Cierre de semana/includeToday | `week_closure_log`, respuesta explícita y continuación → target/preflight | Protege estados previos; pasado vacío es sin_registrar | Sí, objetivo equivocado/temporalidad pendiente |
| B. Evento/fecha/estado y distancia temporal | Perfil/contexto de evento → estrategia/Analyzer | Orientativo | Sí, resolución de objetivo/evento requerida |
| C. Ciclo, bloque, semana, duración, blockId, posiciones | `usuarios.ciclo_actual` → longitudinal/estrategia/save | Orientativo, incluido deload | Sí, ciclo/posición ambigua, transición inválida o CAS |
| C. Ancla del último plan | `weekly_plan ORDER BY week_start DESC LIMIT 1` → `ensureLongitudinalTarget` | Indirectamente por transición | Sí; ancla futura/ilegible |
| D. Snapshot, sesiones protegidas, completadas, tipo e identidad | Token con `weekly_plan`, revisión/sessions → calendario/save | Sí, REST previamente persistido y protegido | Sí, completada futura/duplicación/conflicto |
| D. Prescripciones históricas y ejecución textual real | Cuatro planes hasta asOfDate → contexto; últimas dos filas/cinco completadas → detección duplicación Session | Orientativo | Sí, duplicación rechazada o lectura fallida |
| D. Ejecuciones Carrera y evidencia habitual/métodos | Running execution store, workout_history, declaraciones de perfil → evidencia/dosis | Orientativo | Sí, referencia/dosis/evidencia insuficiente o incompatible |
| D/E. Modificaciones y reportes | `session_modification_events` últimos 30 antes del fin de asOfDate → ocho en prompt | Orientativo | Indirectamente, nuevas restricciones |
| E. Estado activo/área y notas hard/reassessment | `athlete_state_events`, `athlete_coaching_notes`, `valid_until` → restricciones/Session | Orientativo; no conversión automática | Sí, movimientos restringidos, estado ambiguo, lectura fallida |
| G. HRV, FC reposo, sueño, observaciones, tendencias y antigüedad | `physiology_records`, `usuarios.estado_fisiologico`, `prepareRecoveryContext` → Coach/Session | Orientativo | Sí ante fallo de lectura obligatorio; no regla universal de REST |
| G. Readiness preparado | Parámetro opcional del loader → contexto | En esta ruta `unknown`; no puntuación fresca | No convierte missing en REST |
| H. Outcomes | Analyzer último; suplemento últimos dos hasta asOfDate → Analyzer/Coach longitudinal/Weekly | Orientativo | Lectura suplementaria fallida queda unavailable; transición LLM puede fallar |
| H. Notas y conocimiento longitudinal | Ocho notas pendientes/consideradas, perfil.coaching_knowledge → Coach | Orientativo | Restricciones estructuradas se validan por otra lectura |
| H/I. Debilidades/seguimiento | `athlete_development`, `weakness_exposure`, métodos/respuesta → Analyzer/estrategia | Orientativo | Puede cambiar prioridades/contexto; no REST duro |
| I. Frecuencia | workout_history, ventana relativa de siete días y perfil.dias → Analyzer/calendario/contexto | Orientativo en v2 | La política v2 sigue 0–7; no atribuir cinco REST al antiguo techo 5/6 |
| I. Exposure | Sesiones completadas y descripción, ventanas y catálogo → Analyzer/Weekly/Session | Orientativo | Puede influir en propuesta y duplicación |
| J. Configuración | `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY` → DB, firma y proveedor | No fallback REST | Sí, acceso/firma/proveedor; valores productivos desconocidos |
| J. Diagnósticos | `FORGE_WEEKLY_COACHING_DIAGNOSTICS`, `FORGE_SESSION_COACHING_DIAGNOSTICS` y flags de diagnóstico del Builder | No | Cambian evidencia conservada; no deberían cambiar admisión |
| K. Propuesta Analyzer y respuestas LLM | Anthropic, plantillas + JSON dinámico → preferencias, transición, selección y Builders | Sí, decisión explícita; no fallback por error | Sí, parseo, esquema, propuesta incompatible, truncación |
| K. Intento/corrección y contexto intra-semana | Errores del intento anterior, hermanas ya aceptadas → siguiente propuesta/Builder | Weekly puede elegir otra distribución en segundo intento | Sí, misma entrada inicial no implica mismo prompt de retry |
| L. Latencia/red/rate limit/disponibilidad del proveedor | Fetch HTTP y plataforma → todas las llamadas externas | No fallback REST | Sí; expiración/timeout/error |
| L. Concurrencia y cambios durante el run | Relecturas de scope/restricciones/contexto, revisión CAS → firma/save | Puede dejar visible REST antiguo | Sí, contexto stale o revisión en conflicto |
| L. Cuota de regeneraciones/esquema DB | `weekly_plan_generation_log`, constraints, revisiones → save | No; conserva plan existente | Sí, >=2, error de lectura, conflicto/unconfirmed |
| L. Navegador/continuación/versión cliente | Ref temporal, token, reloj, payload, recarga de plan → orquestación/UI | Puede mostrar plan/semana anterior | Sí, token viejo, cliente incompatible, sesión/aborto |
| L. Despliegue/runtime/modelo efectivo | Plataforma y respuesta del proveedor → ejecución | Depende de implementación/modelo | Sí; no se obtuvo evidencia de cambios reales |

Diferencias relevantes de ventanas: el loader contextual cuenta registros no deduplicados en siete fechas civiles; `calcularFrecuenciaRealRelativa` (`trainingFrequencySafetyNet.ts:65`) usa ahora menos 7×24 h y no fija límite superior explícito. El Analyzer construye parte de exposure con `fecha=s.dia` (`route.ts:2068`), mientras el loader canónico deriva fechas civiles. Son diferencias de proyección verificadas, **no causa demostrada del incidente**.

## 4. Traza AIRAN y 5. Traza FORGE12

### Reconstrucción de las 17 evidencias solicitadas

No se ha llamado a Analyzer, Planner, cierre ni regeneración en producción: pueden escribir notas, desarrollo, ciclo o planes. Tampoco se ha confundido una lectura actual de perfil con un snapshot del domingo.

| Evidencia | AIRAN `060385`, 20/09 | FORGE12, 20/09 |
|---|---|---|
| 1. Ciclo activo | Sin evidencia de ejecución/DB | Sin evidencia de ejecución/DB |
| 2. Bloque activo | Sin evidencia; no importar deload del informe antiguo | Sin evidencia |
| 3. Número de semana | Sin evidencia | Sin evidencia |
| 4. Deload sí/no | Desconocido | Desconocido |
| 5. Disponibilidad recibida | Falta declaración, allowed y target | Falta declaración, allowed y target |
| 6. Restricciones activas | Falta snapshot y vigencia a la hora del run | Falta snapshot y vigencia a la hora del run |
| 7. Sesiones recientes usadas | Falta query result/prompt del run | Falta query result/prompt del run |
| 8. Frecuencia reciente | Desconocida | Desconocida |
| 9. block_outcomes usados | Desconocidos | Desconocidos |
| 10. Readiness/fisiología usados | Código actual da readiness unknown; snapshot real ausente | Igual; métricas fisiológicas desconocidas |
| 11. Contexto exacto del Coach | No conservado entre los materiales disponibles | No conservado entre los materiales disponibles |
| 12. Decisión por día/estado/disciplina/estímulo | Ausente | Ausente; cinco REST es observación final reportada |
| 13. Días enviados a Builders | Desconocidos | Desconocidos; cinco REST no revela los otros dos estados |
| 14. Resultado de cada Builder | Desconocido | Desconocido |
| 15. Validaciones | Desconocidas | Desconocidas |
| 16. Fallbacks/reintentos | Desconocidos | Desconocidos |
| 17. Persistido y revisión final | No se ha leído la fila | No se ha leído la fila |

**AIRAN:** no se puede localizar el primer punto de incoherencia. El síntoma puede ser falta de selección, interrupción de Builder, rechazo de guardado o lectura de otra semana; no se ha observado la primera transición fallida.

**FORGE12:** no está demostrado si los cinco REST fueron seleccionados, preservados o producidos por disponibilidad explícita. Bajo la ruta v2 auditada, fallos de Builder/validación no los sustituyen automáticamente. Esta exclusión es sobre el código y no certifica el despliegue del incidente ni descarta una modificación posterior por otra acción.

### Trazabilidad diaria y procedencia de cada REST de FORGE12

| Día esperado de semana 21/09 | Estado final comprobado | Estado del Coach / Builder | Procedencia |
|---|---|---|---|
| Lunes 21 | Desconocido | Sin evidencia | No clasificable |
| Martes 22 | Desconocido | Sin evidencia | No clasificable |
| Miércoles 23 | Desconocido | Sin evidencia | No clasificable |
| Jueves 24 | Desconocido | Sin evidencia | No clasificable |
| Viernes 25 | Desconocido | Sin evidencia | No clasificable |
| Sábado 26 | Desconocido | Sin evidencia | No clasificable |
| Domingo 27 | Desconocido | Sin evidencia | No clasificable |

No se asignan cinco fechas arbitrarias al agregado comunicado. Cinco REST tampoco equivale por sí solo a cero TRAIN: faltan los otros dos slots, que podrían ser externos/no disponibles, protegidos o entrenamientos.

| Clase solicitada | Evidencia necesaria para asignarla | Situación actual |
|---|---|---|
| REST_PLANIFICADO | Selección nueva REST + decision.reason en respuesta/receipt/log | Posible, no observada en estas cuentas |
| REST_POR_DISPONIBILIDAD | Declaración efectiva/allowed + razón, o rama EXPLICIT_ZERO_TRAINING con attempts=0 | Mecanismo reproducido; no datos del run |
| REST_POR_RESTRICCION | REST explícito y razón sustentada por restricción del snapshot | Sin evidencia; no inferir por existir una lesión |
| REST_POR_RECUPERACION | REST explícito y razón sustentada por recuperación | Sin evidencia; texto «Recuperación programada» no basta |
| REST_FALLBACK_BUILDER | TRAIN seleccionado → Builder error → sustitución REST | No implementado en ruta auditada; aborta |
| REST_FALLBACK_VALIDACION | TRAIN seleccionado → rechazo duro → sustitución REST | No implementado en ruta auditada; aborta/repara dentro del contrato |
| REST_PERSISTIDO_PREVIAMENTE | Snapshot previo REST + slot protegido o propuesta fallida con fila anterior intacta | Posible; falta historial/revisión |
| OTRO | Evento de edición posterior, otra ruta o versión, lectura de otro target | Posible; requiere logs/eventos/despliegue |

Estas etiquetas **no constituyen hoy una taxonomía persistida por día**. Algunas pueden deducirse del receipt original y los logs si se conservan, pero no del texto visible por sí solo.

## 6. Comparación temporal: qué cambió

| Variable | Semana correcta: generación 13/09 | Semana actual: generación 20/09 | ¿Cambió? | ¿Puede explicar fallo? |
|---|---|---|---|---|
| Fecha de generación | 13/09, confirmada por usuario | 20/09, confirmada por usuario | Sí, siete días | Cambia ventanas, vigencias, target y transición |
| Target esperado | 14/09 | 21/09 | Esperado; sin prueba de target real | Sí, target equivocado puede producir preservación/pasados |
| Cierre/includeToday/token | Sin evidencia histórica | Sin evidencia del run | Desconocido | Sí |
| Ciclo/bloque/semana/deload | Sin evidencia histórica de esta generación correcta | Sin evidencia del run | Desconocido | Sí, contexto/transición |
| Disponibilidad habitual y específica | Sin evidencia histórica | Sin evidencia del run | Desconocido | Sí, incluso cero explícito |
| Restricciones/vigencia | Sin evidencia histórica | Sin evidencia del run | Desconocido | Sí |
| Historial/completadas/reportes | Sin evidencia histórica | Sin evidencia del run | Desconocido | Sí, puede cambiar aunque no haya nuevas filas por ventanas |
| Frecuencia/exposure | Sin evidencia histórica | Sin evidencia del run | Desconocido | Influencia contextual; no techo obligatorio v2 |
| Fisiología/readiness | Sin evidencia histórica | Sin evidencia del run | Desconocido | Influencia/lectura; missing no es REST automático |
| Outcomes/notas/debilidades | Sin evidencia histórica | Sin evidencia del run | Desconocido | Sí, entrada del Coach y transición |
| Propuesta y respuesta del Coach | Sin evidencia histórica | Sin evidencia del run | Desconocido | Sí, incluye elección de REST |
| Resultados Builders/validadores | Sin evidencia histórica | Sin evidencia del run | Desconocido | Sí, interrupción sin persistencia |
| Plan final/revisión | Sin evidencia histórica | Solo síntoma reportado | Desconocido | Necesario para distinguir nuevo plan y anterior |
| Env/modelo efectivo/errores externos | Sin evidencia histórica | Sin evidencia del run | Desconocido | Sí, no consta cambio de proveedor/configuración |
| Código desplegado | Usuario reporta ausencia de cambios relevantes | Mismo reporte; SHA desconocido | No verificado | No atribuir regresión sin deployment metadata |
| Historial Git local | Commits del 13 a distintas horas | Último commit previo al 20: c17222b, 14/09 | Sí, repositorio local | Solo si esos cambios se desplegaron entre los runs |

### Control de versiones sin presumir regresión

`git log` muestra, entre otros, `cee2438` (13/09 15:23, coherencia longitudinal), `5af902a` (13/09 17:43, autoridad abierta), `5edc0ed` (13/09 21:02, sesiones abiertas), `da84372` (14/09 13:03, disponibilidad/recursos) y `c17222b` (14/09 14:50, autoridad abierta). Horas +01:00.

Se inspeccionó también la ruta de `c17222b`: ya usa `coherenceVersion:1`, `openCoachVersion:1` y modelo con 1800 tokens. No se usa HEAD del día 21 como prueba automática del domingo 20. Los cambios de hoy en perfil/historia también impiden reconstruir inputs antiguos leyendo simplemente el código actual.

**Respuesta disponible a «qué cambió aunque el código no cambiara»:** cambió la fecha; eso cambia qué datos fechados se consultan y puede activar una transición, caducidad o disponibilidad semanal. No hay evidencia suficiente para afirmar qué valor factual cambió para AIRAN o FORGE12. No se eleva ninguna de esas posibilidades a causa probable sin snapshots.

## 7. Determinismo, LLM y primer punto de divergencia

### Parámetros y tratamiento de fallos

| Aspecto | Resultado verificado |
|---|---|
| Proveedor/modelo solicitado | Anthropic `/v1/messages`, `claude-sonnet-4-5`, API version `2023-06-01`; ruta Weekly `:2279–2285` |
| Tokens | Analyzer 500; Weekly y transición longitudinal por mismo callback 1800; Session/reparación 2400 |
| temperature/top_p/seed | No enviados en esas peticiones. No se presume valor efectivo ni determinismo del proveedor |
| Structured output | JSON exigido por prompt y validación local estricta; petición Weekly no incluye schema nativo del proveedor. No confundir con output_config usado en otra rama de chat |
| Weekly inválido | JSON/fence admitido → esquema/semántica; segundo intento con errores sobre mismo contrato; después rechazo. No se rellenan días ausentes con REST |
| Error HTTP/proveedor Weekly | `LLM_REQUEST_FAILED` → `WEEKLY_PLANNER_FAILED`; terminal, sin segunda propuesta ante excepción |
| Truncación | stop_reason/output_tokens se registran; JSON truncado provoca parseo inválido y retry/rechazo. No prueba truncación en los casos reales |
| Transición longitudinal | Parseo y esquema estricto; no bucle de dos intentos propio; decisión inválida aborta antes del Weekly |
| Session | Hasta dos propuestas internas, según error; excepciones de proveedor terminales. Cliente permite hasta tres intentos HTTP para Builder/Analyzer ante no-2xx/red; no multiplica Planner/save |
| Timeout | No timeout/AbortSignal específico en fetch del proveedor Weekly; límite externo de plataforma/red desconocido. No timeout→REST. Token semanal caduca al cambiar semana; calendario/sesión duran 30 minutos |
| Fallbacks reales | Cero disponibilidad explícita; lecturas suplementarias unavailable; fallo de reconsideración consultiva vuelve a semana ya válida. Ninguno es un Builder fallido convertido en descanso |
| Orden | Builders solamente después de selección y receipt admitidos; pueden no ejecutarse si todos los slots son REST/protegidos/no disponibles |

### Misma entrada y salidas radicalmente diferentes

Prueba existente ejecutada: `lib/planning/openCoachAuthority.test.mjs:188–209`, «explicit all-REST regeneration is a signed coaching decision, not empty enumeration». Dentro del mismo contrato verifica que se admiten siete TRAIN y después obtiene/valida una propuesta de siete REST con el composer y autoridad de calendario reales. `:122–160` recorre dos TRAIN y cinco REST por la cadena Weekly→Session→save authority. `weeklyAvailabilityFlow.test.mjs:23–106` recorre orquestación y persistencia simulada, incluyendo cero explícito sin llamada LLM.

Esto demuestra **amplitud de salidas admitidas para iguales hechos**, no una frecuencia empírica de variación de Anthropic ni una reproducción del incidente. El proveedor y la DB son dobles locales; no se han hecho llamadas reales a modelos ni utilizado inputs capturados de los atletas, porque no están disponibles. No se afirma «el LLM alucinó».

### Primer punto donde nace cada fallo

- **AIRAN: indeterminado.** Hace falta la primera etapa con error o la primera decisión discordante, no solo el último plan visible.
- **FORGE12: indeterminado en producción.** Si los cinco REST pertenecen a un guardado nuevo por la ruta v2 auditada, ya debían figurar en la selección admitida o como slots protegidos antes de los Builders. Si la generación falló, la UI puede mostrar una fila previa. Sin esa distinción no puede elegirse un punto único.
- Puntos discriminantes concretos: `WEEKLY_AVAILABILITY_RESOLVED` → `WEEKLY_COACH_SELECTION/RATIONALE` o composer attempts=0 → `ORCHESTRATOR_BUILDER_TARGETS` → resultados Builder → `ORCHESTRATOR_ASSEMBLY` → receipt de guardado/revisión → lectura UI.

## 8. Hipótesis clasificadas

| Hipótesis | Clasificación | Evidencia y límite |
|---|---|---|
| El sistema permite guardar descanso elegido explícitamente sin mínimo de entrenamiento | CONFIRMADA como mecanismo | openWeeklyCoachContract `:21,56–71`; tests 0/7 y 2/5. No confirma elección real de FORGE12 |
| Cambió declaración semanal/acceso y disminuyeron días | POSIBLE para ambos | availableDaysAtWeek; EXPLICIT_ZERO_TRAINING; faltan versiones del perfil |
| El Coach eligió muchos REST con disponibilidad suficiente | POSIBLE para FORGE12 | Validación permite 0–7; faltan selección y razones |
| AIRAN falló en transición, Builder, frescura, cuota o guardado | POSIBLE | Ramas terminales y pruebas de save; no código de error real |
| Se conservó/muestra un plan anterior tras fallo | POSIBLE para ambos | Snapshot/protección y recarga tras error `FormaPro.tsx:1150–1154`; faltan revisiones |
| Frecuencia, restricciones, fisiología, outcomes o historia cambiaron el contexto | POSIBLE | Loaders y ventanas fechadas; sin comparación de snapshots |
| Causa muy probable identificable | NINGUNA | No hay evidencia productiva suficiente para priorizar causalmente |
| Falla Builder y se sustituye silenciosamente por REST | DESCARTADA en ruta auditada | Orquestador `:1086–1092` aborta; Session devuelve error. No descarte universal de versiones/rutas desconocidas |
| JSON Weekly inválido rellena REST por defecto | DESCARTADA en ruta auditada | composer `:357–383` rechaza; esquema exige siete selecciones |
| Readiness ausente fuerza descanso | DESCARTADA como regla automática de esta ruta | Loader da unknown; no regla de conversión. El Coach puede usar mal la incertidumbre, aún no demostrado |
| Safety net limita obligatoriamente a dos TRAIN | DESCARTADA para v2 | Política abierta max=7/min=0; cálculo de frecuencia no impone ese límite |
| Se repitió el bug antiguo deload 1/1 del informe del día 13 | NO CONFIRMADA; POSIBLE solo con versión/evidencia correspondiente | El flujo actual tiene ensureLongitudinalTarget previo. No trasladar causa de otro HEAD |
| Hubo regresión de código o cambio de modelo desplegado | POSIBLE, sin evidencia productiva | Git local cambia; despliegues/modelo efectivo desconocidos. No conclusión inicial |

## 9. Observabilidad y evidencia necesaria para cerrar la auditoría

1. **Falta correlación con despliegue:** recuperar SHA/deployment ID y hora de cada run antes de usar líneas locales como explicación de producción.
2. **REST pierde explicación en representación:** `FormaPro.tsx:1098` escribe una frase genérica. `coachingDecisions` sí viaja en respuesta y calendar receipt (`weeklyCalendarAuthority.ts:89`), pero no se incorpora como procedencia estructurada en cada REST persistido.
3. **El receipt final no contiene el calendario completo:** `issueWholeWeekReceipt` (`weeklyCalendarAuthority.ts:208–218`) guarda digest de calendario/contenido, códigos y reparación. `weekly_plan_events.motivo` conserva ese receipt; un hash no permite reconstruir los inputs/razones originales. Puede haber evidencia parcial en otros receipts capturados, pero no está disponible aquí.
4. **Logs parciales y condicionales:** opciones/contexto/razones dependen del flag Weekly; el resumen de input no guarda todo el prompt. `WEEKLY_PLANNER_DIAGNOSTIC` no incluye run/day ni modelo efectivo; filtra códigos mediante allowlist que no contiene todos los códigos OPEN_*. Correlacionar con request del servidor, no por proximidad temporal.
5. **Historia acotada y mutable:** últimas N filas/notas, datos de perfil actuales y modificaciones posteriores no reproducen exactamente una lectura de hace una semana. `block_outcomes` no sustituye snapshots de disponibilidad, ciclo o restricciones.
6. **No atomicidad ciclo-plan:** ciclo CAS previo y efectos posteriores separados. Hay que comprobar cada operación, no deducir éxito por contador/outcome/log aislado.
7. **Versiones y comentarios obsoletos:** comentario «paralelo» contradice bucle secuencial real; informe anterior describe v1 y fallos reparados posteriormente. No usarlos como autoridad de ejecución actual.
8. **Cinco REST sin fechas ni estados restantes:** limita incluso la reconstrucción del resultado final de FORGE12.

### Lectura mínima pendiente, sin ejecutar acciones de generación

Solicitar export o conexión autorizada de solo lectura, acotada a `060385` y `FORGE12`:

- `weekly_plan` para semanas 07/09, 14/09 y 21/09; incluir las cuatro semanas previas realmente leídas por cada run cuando se conozca su asOfDate. Proyectar week_start, revision, fechas disponibles, bloque/contador, estados/intents/completadas por día y evidencia pertinente. No suponer que la fila actual conserva versiones anteriores.
- `week_closure_log`, `weekly_plan_generation_log`, `weekly_plan_events` y `session_modification_events`: fechas, semana, revisión/acción y receipts disponibles. Contrastar eventos de edición posteriores al guardado.
- `usuarios`: ciclo/posiciones, distribución, weekly_availability, prescription_access, fuentes factuales y frecuencia; historial de cambios si existe. Estado actual marcado como actual, nunca como histórico.
- `athlete_training_sources`, estados/notas/restricciones vigentes, dos outcomes anteriores, weakness_exposure, fisiología y ejecución usadas en cada lectura. Exportar solo campos necesarios, no conversaciones completas.
- Logs de petición/cliente del 13 y 20: run ID, target, disponibilidad efectiva, transición, selección/razón, intent, Builders por día, errores/attempts, validaciones/reparaciones y commit/revisión. Si no se conservaron, marcar «sin evidencia histórica» permanentemente.

Orden de cierre causal: identificar run y deployment → verificar target y fila/revisión → comparar selección pre-Builder y resultado final → localizar primer error/diferencia → comparar inputs de ambos domingos. No regenerar para «averiguar» qué hizo el sistema: una nueva generación no recupera la pasada y puede escribir antes de fallar.

## 10. Cambios mínimos recomendados — no implementados

1. Primero recuperar la evidencia anterior. No cambiar política deportiva, prompts ni cuotas basándose solo en cinco REST.
2. Conservar un registro acotado por run con deployment/modelo efectivo, versión/digest de inputs, decisión por día, razón/procedencia, etapas, errores y revisión confirmada; enlazarlo con la fila guardada. Aprovechar diagnósticos existentes, sin volcar perfiles ni prompts completos en logs generales.
3. Preservar la procedencia de REST desde selección/protección/disponibilidad hasta persistencia y UI; separar explicación deportiva de texto genérico de presentación.
4. Hacer visible en diagnóstico la reserva longitudinal sin plan committed y distinguir interrupción, conflicto, guardado desconocido y plan anterior mostrado.
5. Solo cuando se identifique el primer punto real, corregir ese mecanismo y añadir una reproducción con inputs sanitizados. No imponer mínimos de entrenamiento ni una regla específica Carrera/Box para tapar una decisión desconocida.

## 11. Comprobaciones ejecutadas

- Lectura de petición, código, configuración por nombres/presencia, artefactos locales e historial Git; comparación de la ruta `c17222b` con HEAD. Sin lectura productiva disponible, sin llamadas LLM y sin regeneraciones.
- Suite focalizada existente, sin crear ni modificar tests:

```powershell
node --test --test-concurrency=4 lib/planning/openCoachAuthority.test.mjs lib/planning/weeklyAvailabilityFlow.test.mjs lib/planning/weeklyPlannerDiagnostics.test.mjs lib/planning/weeklySave.test.mjs lib/planning/weeklyReadSelection.test.mjs lib/planning/weeklyTemporalOrder.test.mjs
```

Resultado: **107/107 pass, cero fallos/omisiones/cancelaciones**, 36177.6076 ms. DB y proveedor simulados: verifica mecanismos, no producción ni comportamiento estadístico del modelo. Incluye cinco REST con dos TRAIN, todo REST, disponibilidad cero, errores/retries, bloqueo de guardado, revisión/conflictos y selección temporal de lectura.

- `git -c core.safecrlf=false diff --check` y comprobación del archivo nuevo con `diff --no-index --check -- NUL docs/weekly-plan-forensic-audit-2026-09-21.md`: sin errores de whitespace. `git status --short`: únicamente este informe nuevo. No build/tsc ni suite completa: solo se añade documentación; las comprobaciones seleccionadas cubren las afirmaciones ejecutables de esta auditoría.

**Estado final: informe técnico creado; atribución causal productiva pendiente de evidencia de ambos runs. No se presenta una hipótesis como causa demostrada.**
