# Diagnóstico posterior al grounding

BUG #1 (identidad): fix validado en Production.
Grounding: validado en Production, 18 elementos longitudinales.
Incidente actual: POST-GROUNDING. ROOT CAUSE: UNKNOWN. Sin fix funcional.

## Evento y correlación

Con `FORGE_CHAT_COACH_DIAGNOSTICS=1`, `CHAT_COACH_OPERATION` utiliza el mismo
`runId` de `CHAT_COACHING_PIPELINE`. Cada operación tiene `operationId`, nombre
de lista cerrada, `phase` (`start`, `success`, `failure`, `rejected`), `durationMs`
y, dentro de generación/review, `attempt` (1 o 2). Los fallos/rechazos incluyen
exclusivamente `errorClass` y `errorCode` de listas cerradas.

`operationId` es único dentro del evento Coach y runId. No se debe emparejar con
los identificadores del evento independiente `CHAT_GROUNDING_OPERATION`.

No se emiten mensajes, conversación, prompts, respuestas, perfil, historial,
planes, restricciones, headers, payloads, claves, tokens, stacks ni contenido de
`unsupportedClaims`. Los errores no reconocidos producen `UNCLASSIFIED`.

## Operaciones

- `postGrounding.prepare`, `postGrounding.extractFacts`,
  `postGrounding.affectedFuturePlans`, `postGrounding.context`.
- `answerGroundedChat`, `message.validate`, `prompt.build`.
- `generationAttempt` (1), `repair` (2).
- `generation.arguments`, `generation.provider`.
- `response.parse`, `answer.validate`, `metadata.validate`.
- `review.arguments`, `review.provider`, `review.parse`, `review.admit`.
- `decision.admit`, `answer.return`.
- Para generación y review, el adaptador HTTP distingue:
  `*.provider.requestArguments`, `*.provider.receive`,
  `*.provider.deserialize`, `*.provider.extractText`.

## Interpretación de una reproducción

Filtrar por el runId de la petición y emparejar inicio/final por operationId.
Revisar cada intento por separado. Un fallo se propaga y puede cerrar también
las operaciones contenedoras; no son necesariamente fallos independientes.
La duración del contenedor incluye a sus operaciones internas.

Un `rejected` de metadata no bloquea la prosa. Un `rejected` del parsing inicial
tampoco demuestra fallo terminal: la prosa sin envelope JSON se admite como
candidata y pasa por la review existente. `review.admit: rejected` sí impide
aceptar ese intento. Solo el resultado de `repair` y `answerGroundedChat` permite
saber si un rechazo del primer intento acabó impidiendo la respuesta.

`provider.receive: success` significa HTTP satisfactorio; no acredita que el
cuerpo pueda deserializarse ni que contenga una respuesta admisible.
`provider.extractText: success` conserva la semántica anterior, incluso si el
texto extraído está vacío. La validación existente de answer lo detecta después.

## Límites deliberados

- No se registra qué afirmación motivó un rechazo ni se distingue mediante texto
  del modelo. La validación existente agrupa varios rechazos en
  `CHAT_PROSE_UNGROUNDED`.
- Los HTTP no satisfactorios conservan `CHAT_PROVIDER_FAILED`; no se registra
  cuerpo ni un diagnóstico del proveedor. Los errores de red sin clase/código
  reconocido quedan sin detalle adicional.
- Un inicio sin final puede deberse a interrupción del proceso o pérdida de logs;
  no prueba por sí mismo un timeout.
- La correlación completa y el cierre de errores propagados corresponden a
  `runChatCoach`. Las invocaciones directas de `answerGroundedChat` sin observador
  son silenciosas. Otros adaptadores de completion pueden ignorar el argumento
  diagnóstico opcional y no aportar desglose HTTP.
- El alcance termina al retornar desde `answerGroundedChat`; acciones,
  aprendizaje y persistencia posteriores mantienen sus diagnósticos existentes.

## Preservación de comportamiento

El observador no recibe callbacks de trabajo ni envuelve promesas. Se añaden
marcas explícitas; los catch ya existentes notifican los errores sin reemplazarlos.
No se añaden catch, await ni throw a los límites de ejecución. La generación
principal continúa fuera del try de reparación; parsing/review conservan sus
catch y el segundo intento. No se modifican condiciones, schemas ni recuperación.

Las pruebas comparan ON/OFF con el adaptador real de la ruta y HTTP sintético:
resultados, errores (incluida identidad donde se propagaba originalmente), orden
y contenido de solicitudes, timeout de 120 segundos, escrituras y estado DB.
Incluyen logger fallido, errores hostiles y aislamiento de runs.

## Validación local de esta instrumentación

- Chat/Coach y diagnósticos focalizados: 93/93 PASS.
- Suite completa sobre la versión final: 2606/2606 PASS, sin fallos ni omitidos.
- TypeScript (`tsc --noEmit`) y `git diff --check`: PASS.
- Comparación ON/OFF de resultados, excepciones, solicitudes y efectos DB: PASS.
- Privacidad: campos cerrados, mensajes sintéticos privados ausentes de eventos,
  getters de errores no ejecutados y logger fallido sin efecto funcional: PASS.
- Comprobación AST: mismo número de try/catch/await/throw en los tres límites
  instrumentados; `loadChatGrounding` y `validateChatDecision` idénticos a HEAD.

No se ha ejecutado el proveedor real ni una reproducción Production con este cambio.
