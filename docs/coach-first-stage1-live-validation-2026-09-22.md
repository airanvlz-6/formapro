# Validación live controlada — Coach-first Etapa 1

Fecha: 2026-09-22. Resultado: **NOT_READY_FOR_STAGE_2** por validación bloqueada antes de ejecutar casos. No es un fallo semántico observado ni demuestra un defecto nuevo de arquitectura: falta acreditar el entorno seguro exigido para la prueba.

## Entorno y punto de parada

Se revisaron en modo lectura la implementación, su informe, el estado git y metadatos de configuración local. No se arrancó un servidor, no se activó el flag, no se consultó Supabase ni se llamó al proveedor.

| Requisito | Evidencia disponible |
|---|---|
| Flag local | `NEXT_PUBLIC_FORGE_COACH_FIRST` no está en `1` en el proceso ni en los archivos revisados. Permanece OFF por defecto. Puede configurarse por proceso/build local, pero no se activó sin los demás requisitos. |
| Supabase local | No existe `supabase/config.toml`. `.env.local` y `.env.local.txt` no proporcionan `NEXT_PUBLIC_SUPABASE_URL` ni la pareja requerida de claves Auth/service. El proceso tampoco proporciona esa URL. |
| Configuración de evaluación anterior | `.env.semantic-eval.local` contiene campos de claves, pero su URL Supabase no es válida según el análisis local. No se cargó en un servidor ni se reutilizó como entorno Coach-first. |
| Atleta aislado | No hay atleta de prueba identificado/verificado en la información disponible. No se buscó uno recorriendo usuarios de una base remota. |
| Identidad autenticada | No se dispone de identidad verificable para un atleta de prueba. La ruta exige Supabase Auth y vínculo único con `usuarios`; un código de atleta no basta. |
| Producción OFF | No se modificó ni desplegó configuración de producción. Su flag efectivo no se verificó remotamente; no se afirma que se haya comprobado. |
| Credencial del proveedor | El archivo local previamente autorizado existe y tiene longitud no nula. Solo se comprobaron existencia y longitud; no se leyó su contenido, no se copió y no se comprobó validez mediante una llamada. |

**Parada exacta:** sección 1 de la solicitud, antes de autenticar o enviar el caso 1. No puede demostrarse aislamiento de datos ni identidad de prueba. Las condiciones de parada de la sección 17 impiden continuar. No se fabricaron atletas, sesiones ni un backend simulado para presentar una prueba distinta como validación de la ruta real.

Incluso una pregunta sin actions reclama primero el turno mediante `claimCoachTurn`, que escribe `usuarios.perfil.coach_first_turns`. Por ello el fast path tampoco es una operación sin persistencia que permita omitir estas comprobaciones.

## Proveedor y llamadas

Proveedor configurado en el código: Anthropic, endpoint Messages, modelo `claude-sonnet-4-5`. Es configuración inspeccionada, no modelo ejecutado durante esta validación.

- Conversaciones/casos live ejecutados: **0**.
- Llamadas totales al proveedor: **0**.
- Llamadas Coach, Analyzer, Weekly Coach, Builders o reviewers: **0**.
- Reads de atleta o writes en base de datos: **0**.
- No se ejecutaron casos en paralelo, repeticiones, corpus anteriores ni tests nuevos/existentes.

## Casos 1–10

Duración «N/A» significa que no se inició el caso; no representa una latencia de cero. La categoría primaria de fallo no aplica a BLOCKED.

| Caso | Resultado | Coach calls | Reads solicitados | Actions solicitadas / aceptadas / rechazadas | Duración | Categoría FAIL |
|---|---|---:|---:|---|---|---|
| 1 — Fast path | BLOCKED | 0 | 0 | 0 / 0 / 0 | N/A | — |
| 2 — Contexto personal | BLOCKED | 0 | 0 | 0 / 0 / 0 | N/A | — |
| 3 — Modificación local | BLOCKED | 0 | 0 | 0 / 0 / 0 | N/A | — |
| 4 — Multi-intent Availability + 5 km | BLOCKED | 0 | 0 | 0 / 0 / 0 | N/A | — |
| 5 — Evento ambiguo | BLOCKED | 0 | 0 | 0 / 0 / 0 | N/A | — |
| 6 — Corrección natural | BLOCKED | 0 | 0 | 0 / 0 / 0 | N/A | — |
| 7 — Ejecución externa | BLOCKED | 0 | 0 | 0 / 0 / 0 | N/A | — |
| 8 — Ejecución + intención futura | BLOCKED | 0 | 0 | 0 / 0 / 0 | N/A | — |
| 9 — Generación con evento | BLOCKED | 0 | 0 | 0 / 0 / 0 | N/A | — |
| 10 — Explicación posterior | BLOCKED | 0 | 0 | 0 / 0 / 0 | N/A | — |

1. **Fast path:** no se envió «¿Qué diferencia hay entre hacer una sesión de fuerza y una de potencia?». El claim del turno requiere persistencia aislada.
2. **Contexto personal:** no se envió «¿Qué entreno hoy?». No hay atleta autenticado ni plan real de prueba verificados.
3. **Modificación local:** no se envió «Hoy no quiero hacer jerk pesado. Cámbiamelo manteniendo el objetivo de la sesión.». No hay target de prueba modificable acreditado; no se creó uno.
4. **Multi-intent:** no se envió el mensaje exacto solicitado sobre Box, Carrera, descanso sábado y carrera de 5 km el domingo. No se pudieron comprobar disponibilidad ni evento persistidos.
5. **Evento ambiguo:** no se envió «El domingo tengo una prueba.». No existe respuesta del Coach para adjudicar.
6. **Corrección:** no se envió «No, me refería al domingo siguiente.». Además del bloqueo de entorno, no se produjo la conversación precedente del caso 5.
7. **Ejecución externa:** no se envió «Hoy hice 40 minutos de bici por mi cuenta.». No se escribió historia ni se consultó weekly_plan.
8. **Multi-intent con ejecución:** no se envió «Hoy hice el entrenamiento del box por mi cuenta y mañana prefiero correr suave.». No hay evidencia live sobre la distinción entre ejecución e intención.
9. **Generación:** no se envió «Organízame la semana teniendo en cuenta la carrera de 5 km del domingo.». No hay disponibilidad, evento ni operación de generación aislados e inspeccionables acreditados.
10. **Explicación:** no se envió «¿Por qué has organizado así mi semana?». No se generó una semana ni hubo acciones previas en esta validación.

## Persistencia, exclusión legacy y propagación

No existen snapshots de estado antes/después: no se accedió a una base de atletas. No hubo mutation results, CAS conflicts ni resultados partial/unknown de operaciones. No se atribuye `PASS` a una operación no ejecutada.

Los destinos posibles, según la implementación inspeccionada, son: diario y eventos en `usuarios.perfil`; Availability semanal/excepciones en ese perfil; ejecución externa en `usuarios.workout_history`; adaptaciones/completion/generación en `weekly_plan`; reserva longitudinal en `usuarios.ciclo_actual` y efectos de auditoría/outcomes/log de generación. Los dos efectos auxiliares propios del Analyzer están suprimidos en Coach-first según la implementación, pero no se comprobaron live aquí.

Semantic Intake, classifiers legacy, parser lingüístico de Availability, extractor paralelo de ejecución, writers laterales PR/fisiología/notas, factual reviewer general y learning reviewer tuvieron **0 ejecuciones porque no se inició ningún turno**. Esto no constituye una demostración live de exclusión durante un turno Coach-first. Las comprobaciones offline previas no se presentan como resultados de esta tarea.

La propagación del evento y del mismo snapshot/digest a Analyzer, Weekly Coach y Builders queda **sin validar live**. No se llamó a planning.

## Resultados semánticos y latencia

No hay respuestas visibles del Coach, invenciones, pérdidas de información ni errores temporales/de sujeto/target observados. La ausencia de observaciones se debe a cero casos ejecutados, no a calidad demostrada.

No hay mediciones de duración o primer token, ni muestras para calcular medianas de respuesta directa, reads o actions. No se realizaron llamadas adicionales para obtenerlas.

## Requisitos concretos para retomar

1. Un entorno Supabase local o de pruebas explícitamente aislado, con esquema compatible y configuración de Auth/base válida, identificado como ajeno a datos productivos.
2. Un atleta de prueba claramente identificado y vinculado a una identidad Supabase Auth verificable, con un medio seguro de iniciar sesión. No enviar claves ni tokens por el chat o incluirlos en el repositorio/informe.
3. Para el caso 3, una sesión de prueba existente y modificable; para el caso 9, disponibilidad y estado de planning de prueba que permitan inspeccionar sus efectos. Si no existen, esos casos deben permanecer BLOCKED; no se fabricarán durante esta validación.
4. Evidencia de que producción permanece OFF y activación de `NEXT_PUBLIC_FORGE_COACH_FIRST=1` únicamente para el proceso/build local conectado al entorno aislado.

No se modificó código, prompts, configuración ni tests. No se leyó el secreto local y el archivo permanece intacto. Se creó únicamente este informe; los cambios anteriores del árbol de trabajo se conservaron. No commit. No push.

**Conclusión: NOT_READY_FOR_STAGE_2.** Esta ejecución no aporta evidencia live suficiente para autorizar la retirada de legacy. Se espera revisión y provisión del entorno seguro; no se implementan correcciones ni Etapa 2.

## READ-ONLY LIVE VALIDATION

Solicitud posterior: validación de cuatro conversaciones sobre el perfil propio autenticado, permitiendo únicamente lecturas y la escritura técnica de `perfil.coach_first_turns`. Esta autorización sustituye, para estos cuatro casos, la necesidad anterior de disponer de un atleta staging. No se exige crear staging para retomar esta modalidad.

**Resultado: READ_ONLY_LIVE_FAIL — bloqueo previo a ejecución, no fallo conversacional observado.** Se detuvo antes de activar el servidor local, autenticar al usuario o llamar al proveedor. No se ejecutó ningún caso.

### Bloqueo concreto

La ruta implementada no ofrece una política read-only seleccionable que impida ejecutar actions funcionales:

- `lib/chat/coachFirstHandler.ts`, `handleCoachFirst`: construye `coachFirstTools` con el cliente de base de datos y la capacidad de generación, y entrega ese dispatcher completo a `runCoachFirstLoop`.
- `lib/chat/coachFirstLoop.ts`, `runCoachFirstLoop`: por cada call del modelo ejecuta directamente `await dependencies.dispatch(call, ordinal)`. No pausa para inspección externa ni solicita autorización antes de ejecutar una action.
- `lib/chat/coachFirstTools.ts`, `coachFirstTools`: las ramas `update_availability`, `update_session`, `record_execution`, `record_athlete_data` y `generate_week` siguen conectadas a sus autoridades/writers. No hay parámetro de capacidades permitidas ni flag read-only en esta frontera.

Por tanto, enviar preguntas de lectura no impide técnicamente que una propuesta inesperada del modelo alcance una mutación funcional. Inspeccionar el estado después permitiría detectar una escritura, pero no cumpliría la instrucción de **no ejecutar ninguna action mutadora aunque el Coach la proponga**.

No se cambió el prompt para pedir al modelo que se abstuviera de escribir, ni se sustituyó el dispatcher mediante un parche en memoria o un harness nuevo. Tampoco se ejecutó un LLM separado presentándolo como prueba de la ruta autenticada real. La prohibición de modificar código/prompts y la ausencia de un control read-only existente impiden realizar esta prueba con sus condiciones actuales.

### Cuatro resultados

| Caso y mensaje | Estado | Respuesta visible | Coach calls | read_context / contexto | Actions propuestas | Provider calls | Duración | partial/unknown/error |
|---|---|---|---:|---|---|---:|---|---|
| 1. «¿Qué diferencia hay entre hacer una sesión de fuerza y una de potencia?» | BLOCKED | No se solicitó | 0 | 0 / ninguno | Ninguna; no se llamó al Coach | 0 | N/A | Bloqueo previo: falta control read-only |
| 2. «¿Qué entreno hoy?» | BLOCKED | No se solicitó | 0 | 0 / ninguno | Ninguna; no se llamó al Coach | 0 | N/A | Mismo bloqueo |
| 3. «¿Qué sesiones tengo pendientes esta semana?» | BLOCKED | No se solicitó | 0 | 0 / ninguno | Ninguna; no se llamó al Coach | 0 | N/A | Mismo bloqueo |
| 4. «¿Por qué está planteada así mi sesión de hoy?» | BLOCKED | No se solicitó | 0 | 0 / ninguno | Ninguna; no se llamó al Coach | 0 | N/A | Mismo bloqueo |

Total adicional: **0 conversaciones ejecutadas, 0 llamadas al proveedor, 0 lecturas del perfil y 0 writes**, incluido el diario técnico. No hay duración live, primer token, respuesta, invención o error de target/fecha que adjudicar. El proveedor/modelo configurado sigue siendo Anthropic / `claude-sonnet-4-5`; no se ejecutó ni se comprobó la validez de su credencial en este intento.

### Control de estado, identidad y legacy

No se capturaron snapshots del atleta antes/después porque no se inició una operación sobre su perfil. No se verificó una sesión Auth real en este intento y no se usó un `codigo` o `authUserId` como sustituto de autenticación. La parada ocurrió antes de necesitar esa credencial.

No hubo ejecución de Semantic Intake, classifiers legacy, parser de Availability, extractor de ejecución, writers de PR/fisiología/coaching facts, factual reviewer o learning reviewer. Son ceros por ausencia de turnos; no constituyen validación live de exclusión.

El flag local no se activó y no se modificó configuración de producción. El estado efectivo remoto de producción no se verificó. No se leyó, copió ni imprimió la credencial del proveedor. Solo se añadió esta sección al informe; no hubo cambios de código, prompts, tests, configuración ni datos, ni commit/push.

### Decisión mínima necesaria

Para ejecutar esta modalidad sobre el perfil real hace falta un control previo al dispatch que permita `read_context` y rechace las actions funcionales, conservando autenticación real y el diario autorizado. Ese control no está disponible en la entrada actual y añadirlo requeriría autorización para un cambio separado; no se implementó durante esta validación. No se solicita ampliar el permiso a mutaciones funcionales.

Se mantiene la conclusión global **NOT_READY_FOR_STAGE_2**. La conclusión específica **READ_ONLY_LIVE_FAIL** expresa que no se pudo completar la validación bajo las restricciones solicitadas, no que los cuatro mensajes hayan producido respuestas incorrectas.

## READ-ONLY POLICY IMPLEMENTATION

La solicitud posterior autoriza el control mínimo. El bloqueo de política descrito en la sección anterior queda resuelto por esta implementación; no se modificó el prompt ni se creó un dispatcher alternativo.

Archivos modificados en este intento:

- `lib/chat/coachFirstTools.ts`: tipo `CoachFirstPolicy`, resolución estricta y guard previo al dispatcher existente.
- `lib/chat/coachFirstHandler.ts`: selección de política desde configuración del servidor y entrega al dispatcher.
- `lib/chat/coachFirst.test.mjs`: tres tests de política y parámetro de configuración del handler simulado.
- Este informe: las dos secciones del nuevo intento.

### Política exacta

`FORGE_COACH_FIRST_POLICY` es una variable de servidor, sin prefijo público. Ausente significa `normal`; los únicos valores admitidos son `normal` y `read_only`. Un valor desconocido, vacío o mal formado provoca rechazo antes de identidad/claim/proveedor en el handler. La factory del dispatcher también valida su argumento.

En `read_only`, únicamente el nombre de capability `read_context` atraviesa el guard. Cualquier otro nombre —incluidas las seis actions actuales y cualquier futura/desconocida— devuelve `{status: "rejected", reason: "read_only_policy", code: "COACH_FIRST_READ_ONLY", operationId}` antes del switch, de autoridades, planificación o acceso al writer. El resultado vuelve al mismo loop para que el Coach pueda responder. No se interpreta texto humano para decidir permisos.

El handler no lee `mode` ni `policy` del cuerpo HTTP para seleccionar capacidades. La política se resuelve una vez por turno desde el entorno servidor. El diario `perfil.coach_first_turns` conserva su comportamiento autorizado. La observabilidad de tools añade política y motivo del bloqueo; una propuesta rechazada nunca se presenta como guardada.

Con Coach-first OFF, el handler nuevo no interviene en legacy. Con ON y política ausente/normal, las tools conservan el comportamiento anterior. Para una ejecución local read-only, la configuración del proceso/build debe usar `NEXT_PUBLIC_FORGE_COACH_FIRST=1` y `FORGE_COACH_FIRST_POLICY=read_only`; no se escribieron estas variables en archivos ni en producción durante este intento.

### Validación técnica

Comando ejecutado: `node --test lib/chat/coachFirst.test.mjs lib/auth/legacyContainment.test.mjs`.

**47/47 PASS**, 10.197 s: 26 tests Coach-first (23 existentes y 3 nuevos) y 21 de contención/recorrido legacy. Sin regresiones nuevas en este conjunto.

Los tests nuevos comprueban:

1. Las seis actions actuales y `future_mutation` se rechazan por la propia policy, con **cero invocaciones de autoridades mutadoras y cero accesos a base de datos**. Incluye generación y transición protegida.
2. `read_context` lee la semana; no escribe. `normal` explícito y por defecto siguen delegando generación. Las acciones normales restantes siguen cubiertas por los tests existentes. Configuración inválida falla cerrada.
3. El handler con Auth simulado y política servidor read-only ignora un intento cliente de elevarse a normal. Una propuesta de evento se rechaza, vuelve al Coach simulado y solo cambia el diario técnico; el resto de tablas/perfil permanece igual.

`npx tsc --noEmit --incremental false`: **PASS**. `git diff --check`: **PASS**. No se ejecutó la suite completa ni una campaña live; el conjunto solicitado y la regresión OFF focalizada bastaron para este cambio. Las llamadas de estos tests son simuladas y no se cuentan como llamadas reales al proveedor.

## READ-ONLY LIVE VALIDATION — SECOND ATTEMPT

**Resultado específico: READ_ONLY_LIVE_FAIL por autenticación no disponible; los cuatro casos quedan BLOCKED antes de ejecución.** La policy ya está comprobada offline y no es el bloqueo actual.

### Preparación e identidad

Se volvió a comprobar configuración local sin mostrar valores de credenciales, URLs ni contenido de archivos. Los únicos archivos `.env*` encontrados en la raíz son `.env.local`, `.env.local.txt` y `.env.semantic-eval.local`.

- `.env.local` y `.env.local.txt`: no proporcionan los campos `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` que requiere `identityDependencies`.
- `.env.semantic-eval.local`: tiene campos de claves, pero el valor de URL Supabase no es una URL válida. No se cargó como configuración real ni se utilizó para autenticar.
- No se dispuso de una sesión real del propietario que pudiera verificarse por `verifySupabasePrincipal` → `resolveAuthenticatedAthlete` con esa configuración.
- El archivo local del proveedor sigue existiendo. No se leyó su contenido ni se verificó su validez haciendo una llamada.

La autorización del propietario es suficiente para el alcance de datos solicitado, pero no sustituye la configuración ni la sesión Auth necesarias. No se usaron códigos, identidades simuladas o cuentas de terceros como sustitutos en live. No se requiere staging para esta modalidad.

Se aplicó la condición de parada «autenticación real no puede establecerse» antes de iniciar un servidor o un turno. No se intentó una autenticación remota ni se obtuvo un error HTTP que se esté presentando como evidencia: el bloqueo es de prerrequisitos locales. Para reanudar faltan una configuración Supabase real disponible para el servidor local y una sesión del propio usuario verificable mediante el flujo existente. Deben facilitarse por un mecanismo local seguro, no pegando secretos en el chat.

### Resultados de los cuatro casos

| Caso | Resultado | Respuesta visible | Coach calls | Reads/contexto | Actions propuestas/bloqueadas | Provider calls | Duración | Error/partial/unknown |
|---|---|---|---:|---|---|---:|---|---|
| 1 — Fuerza frente a potencia | BLOCKED | No se solicitó | 0 | 0 / ninguno | 0 / 0 | 0 | N/A | Autenticación no disponible antes de ejecutar |
| 2 — Qué entreno hoy | BLOCKED | No se solicitó | 0 | 0 / ninguno | 0 / 0 | 0 | N/A | Mismo bloqueo |
| 3 — Sesiones pendientes esta semana | BLOCKED | No se solicitó | 0 | 0 / ninguno | 0 / 0 | 0 | N/A | Mismo bloqueo |
| 4 — Motivo de la sesión de hoy | BLOCKED | No se solicitó | 0 | 0 / ninguno | 0 / 0 | 0 | N/A | Mismo bloqueo |

Se conservan como mensajes previstos los cuatro textos exactos de la solicitud; ninguno fue enviado. **Total live: 0 llamadas al proveedor, 0 lecturas de atleta, 0 writes funcionales y 0 writes del diario.** No hay snapshots antes/después de un perfil real, resultados de persistencia, respuestas o latencias que adjudicar. Modelo previsto por la ruta: Anthropic `claude-sonnet-4-5`, sin ejecución real.

Semantic Intake, classifiers legacy, Availability parser, execution extractor, writers laterales PR/fisiología/coaching, factual reviewer y learning reviewer: **0 ejecuciones live por ausencia de turnos**. Esto no sustituye una comprobación live de exclusión. Tampoco se observó una mutación funcional ni un fallo conversacional: no se llegaron a ejecutar las operaciones.

El flag local no se activó al faltar autenticación; producción no se configuró ni desplegó y su flag remoto no se verificó. No se corrigieron conversaciones, no se amplió arquitectura, no se creó staging, no se implementó Etapa 2, no hubo commit ni push.

La conclusión global sigue siendo **NOT_READY_FOR_STAGE_2**. El control mínimo está implementado y validado técnicamente; **READ_ONLY_LIVE_FAIL** indica que la validación real todavía no pudo completarse, no un fallo del guard ni de las cuatro respuestas.
