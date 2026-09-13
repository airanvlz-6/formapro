# Lifecycle operativo de restricciones

Base local: `5af902a`. Cambio acotado al estado del atleta y su presentación; sin cambios en Open Coach, Weekly Planner, Session Builder ni `getCanonicalRestrictions()`.

## Comportamiento anterior y nuevo

Antes, `resolver_restriccion_atleta` aceptaba cualquier estado activo distinto de normal, incluidos eventos reassessment. Desactivaba el evento y creaba otro reassessment, acumulando prefijos en el motivo. Las dos pantallas mostraban todos esos estados como restringidos. No existía finalización explícita.

Ahora:

| Estado actual | Acción explícita | Resultado |
| --- | --- | --- |
| restricted | resolver_restriccion_atleta | Cierra evento restricted, crea reassessment y convierte notas hard activas a reassessment |
| reassessment | resolver_restriccion_atleta | `ya_en_reevaluacion`, sin ninguna escritura |
| reassessment | completar_reevaluacion_atleta + datos.confirmado=true | Cierra evento y notas de reevaluación; estado efectivo normal |
| normal / sin evento | cualquiera de las dos | No-op `sin_restriccion_activa`, sin escrituras |
| restricted | completar_reevaluacion_atleta | No-op `estado_no_aplicable`, no permite saltarse reevaluación |

La finalización requiere un booleano explícito; no se activa por texto del LLM, fecha, `valid_until` ni inferencia clínica. La fecha de cierre usa la fecha civil de Madrid, ya utilizada por la autoridad canónica. Los identificadores, ownership y estado esperado se incluyen en el UPDATE condicional; dos peticiones sobre el mismo evento no pueden crear dos sucesores.

## Convención normal y cierre de notas

Los lectores existentes devuelven `normal` cuando no existe evento activo; se conserva esa convención sin insertar una fila normal. Los eventos anteriores conservan su contenido, con `activo=false` y `fecha_fin`.

El valor de nota **`resuelta`** ya existía: `git show c17429a^:app/api/chat/route.ts` contiene la escritura `update({ status: "resuelta" })`. El commit `c17429a` documenta su retirada del inicio de reevaluación porque eliminaba protección demasiado pronto. Se reutiliza al final, no al inicio. No se inventan `resolved`, `closed` ni otro contrato.

Al completar, solo las notas del mismo atleta con `constraint_level=reassessment` y `status` pending/considerada pasan a resuelta. No se eliminan registros, no se cambian `issue`, `movement`, flags ni nivel; las notas conservan la semántica histórica. No se toca hard independiente, notas ya cerradas ni datos de otro atleta. La relación disponible es por atleta/nivel/status: no se añade una relación artificial nota-evento.

`getCanonicalRestrictions()` queda intacto: filtra pending/considerada y por eso las notas cerradas dejan de aparecer en restrictions y reassessments. Si hay una nota hard independiente, sigue teniendo autoridad incluso sin evento activo, conforme al contrato previo.

## UI y observabilidad

Chat muestra rojo «Entrenamiento restringido» solo para restricted y amarillo «Reevaluación en curso» para reassessment. Normal no muestra banner. Mi Atleta distingue «Estado: Restringido» y «Estado: Reevaluación». Solo restricted ofrece iniciar; reassessment ofrece finalizar, con pantalla de confirmación separada y texto sin afirmación médica. Cancelar no envía petición. Tras éxito se vuelve a leer el estado del servidor. Un bloqueo local evita doble envío mientras la petición está en curso.

El endpoint de detalle muestra las notas del nivel correspondiente. Los errores de lectura devuelven 503 en vez de inventar estado normal. El log de transición satisfactoria contiene únicamente `ATHLETE_STATE_TRANSITION` y `{user,from,to,action}`; no motivos, notas, issue, prompts ni mensajes internos de DB.

## Tests y validación

Se añaden `athleteStateTransition.test.mjs` y `athleteStateUI.test.mjs`:

- Transiciones válidas, no-op sin writes, confirmación obligatoria y notas históricas.
- Proyección canónica tras inicio y finalización, conservación de hard independiente y aislamiento entre atletas.
- Dos inicios concurrentes contra el mismo evento.
- Fallos de lectura, cierre, inserción y actualización de notas: nunca reportan éxito.
- Ejecución de los dos branches HTTP reales sin llamadas al LLM.
- Render del JSX real de Chat y del componente Mi Atleta en los tres estados.
- Click inicial, confirmación, cancelación, doble click y acciones HTTP exclusivas.

Resultados focalizados: 16/16 de transición y 32/32 de UI + restricciones canónicas. Las dos suites nuevas aportan 27 tests, sin modificar ni debilitar pruebas existentes.

Validación final: **2359/2359 tests aprobados**, 0 fallos, 0 omitidos, duración 654165.813 ms. Incluye groundedCoach, openCoachAuthority, allowedTrainingContract, trainingFeasibility, planificación semanal y autoridad de sesiones. `npx tsc --noEmit`: exit 0, sin errores. `git diff --check`: exit 0; archivos nuevos comprobados también con `git diff --no-index --check`, sin errores de whitespace.

`npm test` se ejecutó y devolvió «Missing script: test»: package.json no tiene ese script. Se utiliza la suite Node completa descubierta con `rg --files --no-ignore lib app -g '*.test.mjs' -g '*.test.cjs'`, sin modificar package.json ni debilitar tests existentes.

## Límites reales

El transporte Supabase existente escribe eventos y notas en operaciones separadas; no hay transacción multi-tabla disponible en este flujo. El UPDATE condicional protege la transición de un mismo evento, pero no equivale a atomicidad de toda la operación ni serializa otros escritores del sistema. Si una escritura posterior falla, se devuelve error con `partial=true`; las notas protectoras pendientes permanecen activas. No se reintenta ni compensa automáticamente una escritura de resultado incierto. Una operación parcial puede necesitar inspección y reparación explícita; no debe interpretarse como normalización completa. Una transacción DB requeriría un cambio adicional de infraestructura fuera de este alcance.

No se inspeccionó el schema vivo ni se ejecutó aceptación contra producción; el status reutilizado tiene evidencia en el historial de código, no una nueva certificación del despliegue actual. No se modificaron los registros del atleta citado ni se reparó su historial retrospectivamente. El acceso mantiene la frontera legacy existente de estas acciones; no se presenta como una migración de autenticación.

## Archivos de esta tarea

- `app/api/chat/route.ts`: conexión de ambas acciones, errores de lectura y detalle por estado.
- `app/FormaPro.tsx`: representación explícita y limpieza al recibir normal.
- `app/atleta/page.tsx`: botones y confirmación por estado, refresco desde servidor.
- `lib/athlete/athleteStateTransition.ts`: transición compartida determinista.
- `lib/athlete/athleteStatePresentation.ts`: textos y estilos de presentación.
- `lib/athlete/athleteStateTransition.test.mjs` y `athleteStateUI.test.mjs`: pruebas nuevas.
- `docs/athlete-state-lifecycle.md`: este informe.

No requiere migración DB. Sin commit, push, deploy ni escrituras de producción. Finalizar la reevaluación es una acción operativa del usuario, no una declaración de recuperación clínica.
