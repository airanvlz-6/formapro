# Chat Coach — Grounded Adaptive Coaching

Fecha: 2026-09-12. Base auditada: HEAD `9879e0f`, más el trabajo local del Paso 3 que ya estaba sin commit. Este informe distingue integración local de comportamiento probado con un proveedor o en producción.

## A. Current architecture

Antes del cambio, las dos entradas conversacionales de `app/FormaPro.tsx` enviaban un `buildPrompt` construido con estado React al proveedor genérico de `app/api/chat/route.ts`. La acción móvil `enviar_mensaje_coach` cargaba `lib/mobile/getAthleteContext.ts` y el productor duplicado `lib/mobile/buildPrompt.ts`.

`getAthleteContext` combinaba lecturas propias con una llamada HTTP interna a `obtener_estado_canonico`. Esa acción sigue siendo una proyección legacy; no es el contexto compartido que autoriza prescripciones. El acceso HTTP interno no aportaba la autenticación del solicitante. El diagnóstico legacy sigue disponible, pero ya no alimenta la conversación móvil activa.

Weekly y Session utilizan `loadAthletePrescriptionContext`, restricciones canónicas, referencias resueltas, señales de suficiencia y ownership compartidos. Weekly decide dentro de `AllowedWeeklyPlanContract`; Session genera dosis dentro de su contrato firmado. El guardado pasa por admisión de identidad, validación, freshness y CAS.

El historial vive en `usuarios.historial`. Web enviaba también el historial a `actualizar_usuario`, cuyo extractor mezclaba texto humano y assistant. `compactarHistorial` conserva mensajes con sus roles y escribe un resumen aparte en `notas_coach`; no convierte el resumen en un mensaje humano.

## B. Disconnects

Chat recibía una realidad ensamblada aparte y podía tomar resúmenes o respuestas anteriores como conocimiento factual. Una frase como «restricción resuelta» no necesitaba corresponder a una mutación clínica real. El extractor posterior podía reforzar esa interpretación. Los prompts tampoco imponían la separación transversal entre prescripción, ejecución, respuesta inmediata y respuesta diferida.

Existían escritores especializados de fisiología, referencias/señales, objetivo/evento, disponibilidad habitual, completion y restricciones con revisión/confirmación. También existían Session Builder, pending actions, receipts y CAS. No había una coordinación común entre declaración temporal en Chat, estado compartido y adaptación mínima del plan.

## C. Shared grounding

`loadChatGrounding` es una proyección de lectura sobre autoridades existentes, no otra tabla ni otro Athlete State. Carga:

- `loadAthletePrescriptionContext`: objetivo, ciclo, restricciones, fisiología, readiness, development, referencias y resolución, capabilities, historial de prescripción/ejecución y ejecución de carrera.
- `loadEventContext`: autoridad del evento, conservando su estado pendiente o desconocido.
- `weekly_plan`: semana actual y tres posteriores, con revisión y sesiones; no transforma lo prescrito en realizado.
- Perfil y training sources: disponibilidad habitual, accesos por fecha y ownership resuelto por `buildPrescriptionScope`.
- `loadWeeklyCoachingSupplement`: notas pendientes/consideradas y últimos resultados de bloques, como contexto orientativo separado de los hechos actuales. Conserva procedencia, confianza y estado cuando existen; un error de lectura sigue siendo desconocido.
- `usuarios.historial`: solo contexto conversacional, con roles.

Web envía el mensaje humano; móvil llama al mismo `runChatCoach`. No se necesita React, DOM, navegador ni el prompt del cliente para decidir. Weekly y Session consultan la misma disponibilidad por fecha en sus autoridades.

## D. Epistemic contract

El contrato distingue internamente hecho canónico, evidencia humana, interpretación, decisión y mutación autorizada. La respuesta visible sigue siendo prosa natural de entrenador.

La propuesta interna incluye `answer`, `grounding`, `evidence`, `interpretation` y `decision`. El validador exige que cada hecho citado exista y conserve exactamente el valor leído; cada cita de evidencia debe estar literalmente en el mensaje humano actual. Rechaza campos de mutación y tags ejecutables. La razón deportiva no concede permisos de escritura.

Una segunda llamada al modelo revisa las afirmaciones de la prosa contra hechos, reporte, contexto orientativo y resultados reales de autoridad. Una contradicción o formato inválido provoca un nuevo intento, con máximo de dos propuestas. No se implementa una lista de frases sobre rodilla ni otro órgano.

**Límite importante:** la igualdad de hechos, las citas y las escrituras se controlan por código; la revisión semántica de la prosa depende del modelo. Los tests simulan sus respuestas. Esto no demuestra que toda respuesta de un LLM real quede libre de errores.

## E. Mutation architecture

La mutación nueva soportada es **indisponibilidad de un día explícito de esta semana o la próxima**. Ejemplos reconocidos: «Esta semana el viernes no puedo entrenar» y «La próxima semana el viernes no podré entrenar».

`parseTemporaryAvailability` produce un candidato acotado desde la declaración humana autenticada. No acepta JSON del LLM. `applyChatStateChange` valida la fecha, impide cambios al pasado, restringe campos al acceso por fecha, registra procedencia e identidad determinista, compara el perfil anterior mediante CAS y verifica la lectura posterior. Repetir el mensaje no duplica el estado. El orquestador requiere ownership con prescripción permitida; supervisión no escribe este cambio.

El almacenamiento reutilizado es `perfil.prescription_access[fecha]`. Se añade la propiedad acotada `availability: unavailable` y su procedencia; no se reescribe disponibilidad habitual ni se crea una tabla universal de eventos.

**No están conectadas como mutaciones automáticas de este Chat** las vacaciones con inventario/capacidad de material, dolor/restricción, alta médica, objetivo/evento ni completion de una ejecución. Existen flujos específicos para varios de ellos, pero no se suplanta su confirmación o evidencia con una decisión del LLM. El resultado serializable identifica estos límites y el Coach no puede anunciar que los ha guardado.

## F. Temporary state

Las fechas se resuelven con semana civil y fecha del servidor en Atlantic/Canary. El acceso se aplica solo a su fecha; la semana posterior vuelve a consumir la disponibilidad habitual sin cron ni escritura de restauración. El registro fechado permanece como procedencia histórica.

No se inventa final para «hasta la resonancia». Una frase ambigua o compuesta que no satisface el parser no produce escritura. El alcance lingüístico es deliberadamente limitado y se informa como limitación de producto.

El caso de vacaciones con mancuernas hasta 20 kg, banco y bicicleta estática se conserva como conversación, **sin registrar ni adaptar automáticamente esa semana**. Ya existen lectores de equipment por fecha, pero no se ha integrado un escritor conversacional que valide el inventario completo y el límite de carga por implemento. La prueba de vacaciones verifica ausencia de escritura falsa/permanente, no aceptación completa de ese flujo ni expiración de equipment recién escrito por Chat.

## G. Plan adaptation

Tras una mutación admitida, se localizan sesiones TRAIN/RECOVERY de fechas afectadas, futuras o de hoy, no completadas y bajo ownership de Forge. `beginWeeklyGeneration` captura los snapshots y el token existentes.

El Coach elige el alcance de reevaluación entre días futuros elegibles a partir del plan y el grounding recién leído; incluye los días afectados y justifica cualquier redistribución. Los demás días quedan preservados y vinculados al receipt mediante `preserveDays`, un dato seleccionado por servidor que la ruta pública no copia del cliente.

La generación utiliza `planBoundedWeek`. La indisponibilidad es un límite factual; las otras elecciones siguen siendo del Weekly Coach. Para una nueva sesión entrenable se utiliza `generateTrainingSession`, incluidos dosis, referencias y variantes de Pasos 2–3. No existe un tercer generador deportivo en Chat.

Antes de guardar se ejecutan calendario, whole-week, admisión de identidad, `validatePlanMutation`, freshness y `mutatePlanWithCAS`. Se preservan pasado, completadas, externas e identidades de sesiones no afectadas. La prueba integrada demuestra tanto retirar solo el viernes como trasladar trabajo al sábado con dosis estructurada real y preservación de los otros cinco días.

Una sesión previamente emitida para una fecha que acaba de quedar indisponible falla también en freshness antes del guardado. Los contratos semanales releen la disponibilidad por fecha.

Un fallo de generación o CAS no se describe como adaptación guardada. Estado y plan no forman una transacción multitabla: puede quedar la disponibilidad escrita y la adaptación pendiente. No se añade una cola de reintentos ni se repite a ciegas un guardado ambiguo. El horizonte de adaptación existente es semana actual/próxima; una semana fuera del snapshot queda pendiente. Las condiciones existentes que impiden una semana sin ninguna sesión ejecutable siguen vigentes.

## H. Conversation history

`conversationOnly` conserva user/assistant; `userEvidenceText` admite solo texto humano al extractor legacy. `conversationalMemoryOnly` impide que ese JSON sea escritor alternativo de objetivo, distribución, referencias, marcas o cierre de bloque. La fisiología conserva su autoridad especializada y validación de evidencia.

`runChatCoach` guarda el par humano/Coach con CAS sobre `historial`, dentro del límite existente de 15 mensajes y evitando duplicar el último par. Un conflicto de historial devuelve `historySaved: false`. El historial no resuelve restricciones ni se reutiliza como referencia numérica.

Las notas legacy y resúmenes pueden seguir conteniendo interpretaciones. No son hechos actuales de esta proyección. Las notas del suplemento se presentan separadamente con procedencia; no autorizan una resolución clínica.

El reporte de hombro se retiene como mensaje humano y permite coaching sobre la exposición concreta. **No se ha automatizado el salto de ese reporte al flujo de revisión de restricciones ni la adaptación clínica posterior.** No se crea diagnóstico, prohibición permanente o descanso automático. El detector web de notas y los flujos existentes de revisión/confirmación siguen siendo independientes; no equivalen a una integración clínica común demostrada en ambos clientes.

## I. Metrics/references

Chat reutiliza resolución de fuerza/carrera y referencias del contexto de dosis; no altera HR authority/C2. Un valor no resuelto mantiene su estado. FC 149/173 sigue siendo observación, no zona. Una exposición a 60 kg no se convierte en 1RM ni en recuperación. El contrato impide completar ejecución desde el plan o respuesta 12–24 h desde el silencio.

Las pruebas AIRAN conservan rodilla activa, resonancia pendiente, squat 110 kg × 5 × 3 tolerado sin respuesta posterior reportada, high-hang pull con molestia, snatch 60 kg sin dolor inmediato, gimnasia fácil y FC 149/173. Comprueban invariantes y rechazo de contradicciones, no una respuesta textual única ni una nueva recomendación médica.

## J. Files changed

Archivos de esta frontera:

| Archivo | Cambio |
|---|---|
| `app/FormaPro.tsx` | Dos entradas de Chat envían mensaje para grounding del servidor y recargan el plan visible tras adaptación. |
| `app/api/chat/route.ts` | Despacho Web/móvil compartido; proveedor; frontera humana del extractor legacy. |
| `lib/chat/groundedCoach.ts` | Proyección compartida, contrato, validación, revisión semántica y diagnóstico. |
| `lib/chat/conversationEvidence.ts` | Roles y límites del extractor de memoria. |
| `lib/chat/chatStateChange.ts` | Mutación temporal acotada, CAS, idempotencia y análisis de impacto. |
| `lib/chat/adaptChatPlan.ts` | Coordinación de autoridades Weekly/Session y guardado. |
| `lib/chat/runChatCoach.ts` | Orquestación común, relectura, resultados e historial. |
| `lib/chat/groundedCoach.test.mjs` | Fixtures y pruebas de integración con DB/proveedor aislados. |
| `lib/sports/temporaryTrainingAccess.ts` | Resolución civil y disponibilidad temporal compartida. |
| `lib/planning/weeklyCalendarAuthority.ts` | Disponibilidad por semana y preservación firmada. |
| `lib/planning/prepareAllowedWeeklyPlanContract.ts` | Slots indisponibles y alcance acotado de reevaluación. |
| `lib/sports/prepareSessionTrainingContract.ts` | Disponibilidad por fecha en Session. |
| `lib/sports/sessionAuthority.ts` | Comprobación de disponibilidad temporal al guardar; conserva cambios previos de Paso 3. |
| `lib/sports/sessionAuthority.test.mjs` | Revocación de receipt por disponibilidad cambiada. |
| `lib/physiology/authority.test.mjs` | Inyecta los nuevos helpers reales al harness AST; conserva las aserciones existentes. |
| `docs/chat-coach-grounding-adaptive-coaching.md` | Este informe. |

Los demás cambios locales de variantes y `docs/movement-variants-step-3.md` preceden a esta frontera y se han conservado. Las pruebas existentes de Pasos 1–3 no se han reescrito para aceptar una semántica distinta.

## K. Tests

Resultados locales:

- Suite completa real: **2297/2297**, cero fallos, omitidos o cancelados (590734 ms). Comando PowerShell: `$chatTestFiles = @(rg --files -g '*.test.mjs' -g '*.test.cjs'); node --test @chatTestFiles`. Incluye los 2277 casos de la base local con Paso 3 y 20 casos nuevos.
- Focalizadas Chat + Session authority + physiology: **93/93** (54244 ms). Tras los últimos cambios de revisión semántica, tags y recarga Web, se repitió Chat: **19/19** (92838 ms con la suite completa concurrente).
- `node node_modules/typescript/bin/tsc --noEmit --incremental false`: sin errores.
- `git -c core.safecrlf=false diff --check`: sin errores.

Una primera ejecución completa detectó un fallo en el harness AST de fisiología: faltaban los nuevos helpers importados por la rama extraída. Se incorporaron los helpers reales al harness, sin cambiar sus aserciones, y se repitieron las pruebas focalizadas y la suite completa.

La DB y el proveedor de las pruebas están aislados/simulados; sí se ejecutan las autoridades reales de contrato, dosis, firma, identidad y CAS. La prueba de redistribución genera una sesión estructurada con Session Coach; no solo comprueba el nombre de una función. La revisión semántica se prueba con respuestas controladas del proveedor, no con una evaluación médica/deportiva real.

## L. Known limitations

- La adaptación automática está verificada para la indisponibilidad explícita de un día; no constituye una implementación completa de vacaciones, viajes, enfermedad, dolor, fatiga, cambio de objetivo o ejecución externa.
- El parser no cubre lenguaje libre general, intervalos arbitrarios ni reversión «ya puedo entrenar». No se debe presentar la funcionalidad como detector universal de eventos.
- No hay transacción conjunta de perfil, plan e historial. Se informan operaciones pendientes y conflictos, pero no se añade recuperación automática persistente.
- La verificación semántica utiliza el modelo. No se ha evaluado la calidad deportiva o la tasa de contradicciones de un proveedor real. Los tests usan respuestas controladas.
- La integración Web/móvil está comprobada a nivel de código/backend y fixtures, no con un dispositivo Expo ni una sesión de navegador autenticada. La ruta genérica continúa atendiendo otras funciones y conserva sus productores legacy.
- El nuevo mensaje de Chat es textual. No reenvía adjuntos visuales al Coach; los extractores específicos de imágenes siguen separados. Tampoco demuestra una integración equivalente de sus resultados en el mismo turno.
- Web recarga el plan visible tras adaptación. La API móvil devuelve el mismo resultado, pero no se ha modificado ni probado la recarga visual de un cliente Expo; su siguiente lectura de plan recibe lo guardado.
- La protección de prosa añade llamadas de generación/revisión; la adaptación puede añadir Weekly y Session. No se ha medido latencia/coste en producción.
- Diagnóstico opt-in `FORGE_CHAT_COACH_DIAGNOSTICS=1`: códigos, cantidades, fechas, estado y claves de grounding; no prompts, perfil crudo, conversación, cookies, tokens o receipts. Los errores de adaptación se reducen a códigos y no texto libre del proveedor.

No se ha realizado commit, push, deploy, SQL manual, migración ni escritura sobre atletas reales.

## M. Acceptance procedure

Usar un atleta de prueba con restricciones, referencias y ownership configurados por sus rutas existentes, y guardar una copia del plan y sus revisiones antes de empezar.

1. **AIRAN:** introducir los reportes del fixture, preguntar por conclusiones y siguientes entrenamientos. Comprobar con el proveedor real que conserva restricción y evento, expresa respuesta diferida desconocida, no inventa zonas/1RM y ofrece coaching contextual. Repetir la consulta y comprobar que una respuesta anterior no cambia los hechos.
2. **Disponibilidad:** con un viernes futuro entrenable, enviar «Esta semana el viernes no puedo entrenar». Verificar override solo en su fecha, resultado de adaptación, revisión CAS y sesiones no afectadas idénticas. Permitir al Coach justificar retirada o redistribución; si genera otra sesión, exigir contenido estructurado admitido por Session. Consultar de nuevo desde Chat, Weekly y Session. Comprobar que la semana siguiente conserva el viernes habitual. Repetir el mensaje y comprobar deduplicación.
3. **Concurrencia:** cambiar revisión del plan o disponibilidad entre generación y guardado. Esperar conflicto/rechazo explícito, nunca éxito anunciado con contenido no persistido.
4. **Vacaciones:** enviar el fixture hotel DB ≤20 kg, banco y bicicleta. En esta implementación esperar reconocimiento y declaración honesta de que ese inventario temporal no se ha guardado/adaptado automáticamente. Verificar que no se cambia equipment habitual. Los pasos de mutación completa, propagación y expiración de equipment siguen pendientes de implementación, no deben marcarse aceptados.
5. **Hombro:** reportar molestia en overhead press. Comprobar que se conserva el reporte y no se inventa diagnóstico/resolución. La derivación automática al flujo de revisión y adaptación es un hueco explícito, no un caso de aceptación satisfecho.

CHAT COACH GROUNDING: DESIGNED / CONNECTED / VERIFIED LOCALLY (contratos e integración aislada; pendiente aceptación con proveedor real).

ADAPTIVE COACHING: DESIGNED / CONNECTED / VERIFIED LOCALLY (indisponibilidad explícita de un día, retirada y redistribución; los otros eventos descritos siguen pendientes).
