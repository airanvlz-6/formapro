# Diagnóstico del incidente de grounding

ROOT CAUSE: UNKNOWN dentro de `loadChatGrounding()`.
STAGE: grounding confirmado en producción.
FIX FUNCIONAL: ninguno. Este cambio solo añade observabilidad.

## Activación y correlación

`FORGE_CHAT_COACH_DIAGNOSTICS=1` activa el evento `CHAT_GROUNDING_OPERATION`.
Con cualquier otro valor no se emite. Las llamadas compartidas al loader del
atleta siguen sin trazas salvo que Chat les pase explícitamente el observador.

Campos permitidos:

- `runId`: UUID generado en servidor, el mismo que `CHAT_COACHING_PIPELINE`.
- `pass`: `initial` o `reload`; no confundir ambas cargas.
- `operationId`: secuencia local a esa carga; relaciona inicio y final.
- `operation`: nombre fijo de operación, nunca tomado del atleta.
- `phase`: `start`, `success` o `failure`.
- `durationMs`: tiempo transcurrido de la operación, incluyendo sus dependencias.
- Solo ante fallo: `errorClass` y `errorCode`, de listas cerradas. Los errores
  desconocidos producen `UNCLASSIFIED`, sin texto libre ni stack.

No se registran argumentos, resultados, queries, perfiles, mensajes, historial,
planes, respuestas del proveedor, identificadores del atleta, headers ni secretos.

## Lectura de una reproducción

1. Desplegar únicamente tras autorización, con la variable activa en el despliegue.
2. Realizar una sola reproducción y obtener su `CHAT_COACHING_PIPELINE.runId`.
3. Filtrar `CHAT_GROUNDING_OPERATION` por ese `runId` y por `pass`.
4. Emparejar cada `start` con su terminal mediante `operationId`.
5. Buscar la operación interna que falla y su código. Un fallo puede aparecer
   también en sus operaciones contenedoras al propagarse la misma excepción;
   esto no significa que haya varios fallos independientes.

Las lecturas siguen ejecutándose en paralelo. Una operación hermana puede terminar
después del fallo de la carga global. No interpretar el orden de llegada de todos
los logs como una ejecución secuencial. Un inicio sin final, por sí solo, no prueba
timeout: también puede faltar el registro por interrupción de la función o del log.

`success` describe la finalización de esa operación, no la validez global del
grounding. En lecturas directas PostgREST, un resultado con `error` se marca como
`failure` pero se devuelve intacto a las comprobaciones existentes. El suplemento
orientativo puede finalizar correctamente con estado `unavailable`, como antes.

## Cobertura

Lecturas de perfil, planes y fuentes; validación existente de resultados; scope;
evento; suplemento orientativo; referencias; conocimiento; proyección de planes,
historia y conversación; selección longitudinal; construcción global de facts.

Dentro del loader compartido del atleta: lecturas de usuario, semanas y eventos
de modificación; restricciones; recuperación; ejecuciones verificadas; proyecciones
de sesiones realizadas, exposición, historial fechado, perfil, dosis de carrera,
confirmación habitual e historia de carrera; declaraciones; estrategia; admisión
de evidencia; resumen de prescripciones y construcción del contexto final.

El límite de seis mensajes conversacionales, los contratos, las consultas, los
fallbacks, los resultados y las excepciones originales se conservan. No se añade
recuperación parcial ni se cambia Weekly Planner.

## Validación local

- Chat y diagnóstico focalizados: 71/71 PASS.
- Suite completa `lib/**/*.test.mjs`: 2584/2584 PASS, sin fallos ni omitidos.
- TypeScript (`tsc --noEmit`): PASS.
- `git diff --check`: PASS.
- Pruebas de privacidad: campos cerrados, errores hostiles, ausencia de texto
  privado, logger fallido, identidad de excepciones y resultados conservada.
- Contexto y efectos de DB idénticos con observación activa o silenciosa.

No se ha realizado reproducción en producción con esta instrumentación.
