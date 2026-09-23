# Conversación canónica y escritor activo

## Despliegue

Aplicar `docs/sql/chat-canonical-session.sql` en Supabase antes de desplegar el código.
No crea tablas ni índices, modifica Auth ni migra perfiles. Añade una función RPC.
`active_sessions.user_codigo` debe disponer de unicidad inmediata existente sobre
esa columna NOT NULL, mediante PK o índice único válido, listo y no parcial.
El SQL únicamente comprueba esa precondición y aborta si falta; no crea ni modifica
índices o datos para satisfacerla. La función es `security invoker`: solo `service_role`
puede ejecutarla; anon/authenticated no tienen permiso. No exponer la service key.
El backend verifica Supabase Auth y resuelve el atleta antes de usar el RPC.
Sin función/permisos disponibles, los clientes fallan cerrados.

## Autoridades y atomicidad

- Conversación: `usuarios.historial`. Se conservan los últimos **15 mensajes
  individuales**, incluidos los legacy. El render de apertura mantiene los últimos
  seis y el contexto del proveedor usa los últimos diez mensajes de texto válidos.
- Los nuevos mensajes tienen `role`, `content` y `turnId` (digest atleta/messageId).
  No se guardan imágenes/base64 en historial.
- Idempotencia: `usuarios.perfil.coach_first_turns`, sin texto conversacional.
  Conserva digest, estado, fechas, receipts y confirmación `persisted`.
- Propietario: `active_sessions.session_id`, acotado al atleta autenticado.
  `owner_since` sirve también como versión de adquisición (incluye A -> B -> A).
- Las operaciones cortas de sesión/claim/commit bloquean primero la fila existente
  de `usuarios`, después `active_sessions`. Esto serializa también la adquisición
  cuando aún no existe fila de sesión. No hay locks mantenidos durante el proveedor.
- El claim verifica propietario y vigencia, registra idempotencia, actualiza
  `last_message_at` y devuelve el historial canónico en una transacción.
- El commit vuelve a verificar propietario + versión y compara el historial actual
  con la instantánea del claim; añade el par y finaliza el journal atómicamente.
  Ningún array enviado por el cliente decide el contexto ni sustituye el historial.

## Resultados

| Estado | Conversación | Journal / respuesta |
|---|---|---|
| success (`completed`) | USER + ASSISTANT una vez, antes de responder | `ok:true`, `persisted:true` solo con commit confirmado |
| terminal | USER + respuesta terminal explícita, si conserva ownership e historial | `ok:false`, `persisted:true`; receipts pueden expresar incertidumbre de acciones |
| unknown por excepción | No añade par | journal `unknown` y receipts observados si la escritura se confirma; nunca reejecuta |
| unknown de transporte SQL | No afirma si el commit llegó a persistir | `persisted:false` significa **no confirmado**, no prueba ausencia; repetir el ID consulta, no ejecuta |
| conflict de ownership/versión/historial | No añade par ni sobrescribe historial | journal `conflict` y receipts; debe recuperar historial/control |
| no propietario/sessionId inválido | No acepta turno ni crea claim | código explícito, cero llamadas a proveedor/tools |

El mismo ID y mismo payload nunca vuelve a ejecutar proveedor/tools. Si su respuesta
permanece en la ventana de historial, devuelve `recovered:true`, respuesta y
historial canónico. Si ya salió de la ventana, devuelve historial actual y estado
del journal, sin reconstruir ni regenerar la respuesta eliminada. Reutilizar el ID
con otro payload devuelve `TURN_PAYLOAD_CONFLICT`. El digest excluye sessionId,
reloj y conversación del cliente, e incluye mensaje, adjuntos, pending y references.
Los claims antiguos también impiden reejecutar; sus respuestas no persistidas no
se pueden reconstruir. Se mantiene el límite previo de **512 claims**, sin eviction.

## Sesiones y takeover

`verify` solo lee. `acquire` toma control únicamente si no existe propietario
vigente; dos adquisiciones concurrentes no sustituyen al ganador. `takeover`
transfiere explícitamente e incrementa la versión. Devuelve el historial dentro
de esa misma transacción. La UI comprueba `ok && owned`, aplica el historial,
limpia conflicto/bloqueo y solo entonces habilita enviar.

La vigencia mantiene los 45 minutos de actividad real histórica. Heartbeat cada
25 segundos solo actualiza `updated_at`; nunca mantiene artificialmente
`last_message_at`. Un propietario expirado debe adquirir de nuevo. Los mensajes
aceptados actualizan actividad directamente, sin usar procesar_mensaje_contexto.

La UI impide enviar mientras verifica, hay conflicto o está bloqueada. El servidor
rechaza al antiguo dueño aunque su heartbeat todavía no haya detectado el cambio.
Una petición vieja que perdió ownership no puede guardar tras el takeover, incluso
si el mismo sessionId vuelve a adquirir después. Si el commit ganó antes del
takeover, B recibe ese par en el historial; si el takeover ganó, A termina en
conflicto. No se repiten provider/tools para resolverlo.

No hay transacción global sobre proveedor o efectos deportivos: acciones ya
ejecutadas conservan sus receipts, no se revierten ni se presentan como atómicas.
Una caída abrupta del proceso puede dejar un claim sin finalizar; sigue bloqueado
contra repetición. La política read_only permanece intacta: persistencia de chat
permitida, todas las tools deportivas de mutación rechazadas.

## Contrato Expo / mobile

Todas las operaciones usan POST `/api/chat` y `Authorization: Bearer <Supabase token>`.
`codigo` es opcional y, si aparece, debe coincidir con el atleta resuelto. No es
credencial. Generar un UUID por instancia de chat y conservarlo como sessionId.

1. `action: verificar_sesion_activa`, `datos: {sessionId}`.
2. Sin dueño vigente: `action: tomar_control_sesion`, `datos: {sessionId}`.
   Comprobar `ok && owned`; otro dispositivo puede haber ganado la adquisición.
3. Con conflicto y confirmación del usuario: misma acción con
   `datos: {sessionId, takeover:true}`. Aplicar `historial` antes de habilitar enviar.
4. Heartbeat: `action: heartbeat_sesion`, `datos: {sessionId}`. Si no es `ok:true`,
   bloquear el envío hasta recuperar control.
5. Turno directo: `{action:"coach_first",sessionId,message,messageId,...}`.
   Alias: `{action:"enviar_mensaje_coach",datos:{sessionId,mensaje,messageId,...}}`.
   Adjuntos/pending/references conservan el contrato existente; conversation se ignora.
6. En respuesta persistida/recuperada, sustituir estado local por `historial`.
   Tras pérdida de respuesta, reenviar el **mismo ID y payload** únicamente para
   consultar el resultado; no generar otro ID ni activar fallback legacy.

Sin sessionId: `CHAT_SESSION_REQUIRED`. No propietario/expirado: `CHAT_NOT_OWNER`.
Pérdida durante turno/cambio concurrente: `CHAT_COMMIT_CONFLICT`. RPC no disponible:
`CHAT_SESSION_UNAVAILABLE`. Los rechazos de protocolo usan JSON explícito aunque
HTTP sea 200; el cliente debe comprobar campos, no solamente response.ok.
No se ha añadido UI Expo en este repositorio.

## Verificación y límites

`conversationSession.test.mjs` ejecuta la función SQL real en PostgreSQL/PGlite y
el handler real con Auth/proveedor aislados. Cubre persistencia, recuperación,
idempotencia, identidad, mobile, adquisición, takeover pendiente, actividad,
retención, fallos y política read_only. Las pruebas de UI ejercitan las funciones
de guardado/takeover extraídas del componente; no sustituyen QA en navegadores.
No se ha aplicado la función ni hecho pruebas con cuentas de producción.

Desplegar junto al cliente actualizado: clientes viejos sin sessionId fallan
cerrados. Una versión antigua del servidor aún desplegada podría escribir fuera
de este protocolo; completar el despliegue antes de validar la exclusión.
