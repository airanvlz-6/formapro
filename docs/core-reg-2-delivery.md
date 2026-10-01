# CORE-REG-2 — formulario e integración del registro

Fecha: 2026-09-30. **Registro canónico implementado y validado localmente para crear, consultar, editar y eliminar desde el formulario.** Se retomó el working tree existente; no se reconstruyó CORE-REG-1. Este informe complementa `core-reg-1-delivery.md` y actualiza sus pendientes de interfaz, resultado opcional y registro desde chat.

No hubo commit, push, despliegue, migraciones en producción ni llamadas reales a proveedores LLM. Las pruebas de persistencia utilizan PostgreSQL embebido PGlite desechable. Se conservan los archivos previos y los logs de ejecuciones anteriores.

## 1. Implementado y verificado

| Funcionalidad | Comportamiento y evidencia |
| --- | --- |
| Resultado opcional | `result` puede omitirse; descripción válida sigue siendo obligatoria. Los tipos y la validación existente se ajustaron sin cambiar esquema SQL. Se prueba omisión válida y rechazo de resultado con tipo incorrecto/descripción vacía. |
| Formulario compartido | `WorkoutForm` permite fecha civil editable/pasada, disciplina abierta, título, descripción, resultado opcional, duración, distancia, FC media/máxima, RPE, sensaciones, observaciones y molestias. Opcionales vacíos permanecen ausentes; cero es válido. Minutos/km se transportan como segundos/metros. |
| Cuenta Free | No se consulta suscripción para el formulario ni su API. Probado con identidad válida sin campos ni tablas de suscripción. Todos los accesos persistentes se verifican en el backend. |
| Sin plan | Registro autónomo sin plan activo, sin copiar dosis ni requerir una sesión prescrita. |
| Prescrita/sustitutiva | Puede recibir una referencia exacta o seleccionar una sesión de la fecha consultada. Conserva plan/session ID y permite `performed`/`replaced`; el servidor valida pertenencia. No modifica la prescripción. |
| Creación y reintentos | Solicitud confirmada a `POST /api/workouts`, `requestId` estable y envelope congelado durante el envío. La respuesta perdida no produce otra ejecución. Se prueba también respuesta perdida seguida de expiración de autenticación. |
| Recuperación tras navegación | Solo se guarda un token técnico de solicitud en `sessionStorage`, por atleta y operación; **no se guardan datos de entrenamiento ni un historial local**. El cuerpo del formulario vive en memoria. Al volver a cargar, la API recupera la operación persistida por request ID bajo la identidad autenticada. |
| Edición | Lee datos vigentes por ID, conserva `executionId`, utiliza `expectedRevision` y envía `PUT`. Una revisión obsoleta bloquea el guardado y ofrece recargar; no sobrescribe silenciosamente. |
| Eliminación | Botón separado y confirmación explícita antes del `DELETE` canónico. Añade tombstone; desaparece del historial activo. |
| Historial | Abre registros canónicos desde el calendario para editar/eliminar. Tras un recibo persistido vuelve a consultar `/api/workouts`, limpia el detalle antiguo y muestra datos vigentes. Un error de refresco se distingue del guardado ya confirmado. Las celdas tienen acceso por teclado y etiqueta de fecha. |
| Today | Acceso «Registrar entreno» abre el mismo formulario, sin rediseño de Today. |
| Visitante | `/entrenamientos/registrar` muestra invitación a crear cuenta gratuita/iniciar sesión. No crea identidad anónima ni permite leer/escribir entrenamientos sin autenticación. El launcher sin atleta conduce a esta entrada. |
| Chat | Tiene enlace al formulario, sin formulario embebido de registro. Se retiraron llamadas de extracción/guardado/borrado de entrenamiento, el banner antiguo y el formulario de carrera del chat. Las rutas heredadas devuelven un enlace sin persistir. |
| Sin confirmación conversacional | El esquema/instrucciones ya no solicitan `record_execution`. Envelopes antiguos se tratan como orientación al formulario, sin recibo de guardado ni mutación pendiente. `record_performed` y `record_response` tampoco modifican evidencia. Las pruebas de mutaciones pendientes necesarias se conservan para las acciones de desarrollo que siguen existiendo. |

El razonamiento deportivo, la generación semanal y sus autoridades no se rediseñaron. La separación aquí se refiere al registro persistente de entrenamientos realizados; las funciones previas de planificación fuera de ese registro no se ampliaron.

## 2. Pruebas y compilación

### Ejecución final tras reanudar

```text
node --test --test-concurrency=2 lib/execution/*.test.mjs lib/auth/*.test.mjs lib/chat/coachFirst.test.mjs lib/chat/groundedCoach.test.mjs lib/chat/coachOutputContract.test.mjs lib/chat/coachOperationDiagnostics.test.mjs lib/chat/conversationSession.test.mjs lib/chat/coachFirstLongitudinalRecovery.test.mjs lib/core/recentTrainingEvidence.test.mjs lib/planning/recordCompletion.test.mjs lib/planning/writerConvergence.test.mjs lib/trainingLoad/*.test.mjs
```

**624/624**, sin fallos ni omitidas. Log: `.core-reg-2-final-tests.log`. Incluye diez pruebas del componente real conectado al handler autenticado y al SQL local: sesión sin plan/sin resultado/retroactiva, asociación prescrita y sustitutiva, selección por titular/fecha, pérdida de respuesta, recuperación tras navegación, expiración de autenticación, edición con conflicto, borrado confirmado y aislamiento entre atletas. Las regresiones de producto comprueban visitantes, cuenta Free, Today y apertura/refresco desde Historial.

Después se añadieron las comprobaciones explícitas de separación del chat:

```text
node --test lib/execution/workoutChatBoundary.test.mjs
```

**4/4**, sin fallos ni omitidas. Log: `.core-reg-2-chat-boundary.log`. Comprueban las ramas reales de las rutas retiradas sin acceso a DB/LLM, ausencia de llamadas antiguas en el cliente y bloqueo de ambas acciones de evidencia. Esta suite se añadió después de iniciar la ejecución de 624 pruebas y se ejecutó por separado.

```text
node node_modules/typescript/bin/tsc --noEmit --incremental false
```

**Correcto, sin diagnósticos**. Log: `.core-reg-2-final-typescript.log`.

```text
NEXT_TELEMETRY_DISABLED=1 node node_modules/next/dist/bin/next build --webpack --experimental-build-mode compile
```

**Compilación correcta** con Next 16.2.6; incluye `/api/workouts`, `/entrenamientos/registrar`, `/hoy`, `/historia` y chat. Log: `.core-reg-2-build.log`. Se utilizó el modo local `compile`, sin generar un despliegue ni completar las fases `generate/generate-env`. La configuración preexistente permite omitir errores TS en build; por eso se ejecutó y aprobó TypeScript independientemente.

`git diff --check`: correcto al recuperar el trabajo y al finalizar; solo advertencias de conversión LF/CRLF, sin errores de whitespace.

### Ejecuciones previas conservadas

- `.core-reg-2-form.log`: 9/9 antes de añadir el caso de sesión caducada.
- `.core-reg-2-focused.log`: 496/496.
- `.core-reg-2-related.log`: 226/226, incluida auditoría de planificación, contexto del atleta y reutilización de carrera.
- `.core-reg-2-initial.log`: 338/349 durante la adaptación; fallos de expectativas antiguas de confirmación y del harness de renderizado anidado, corregidos después.

Las ejecuciones anteriores se solapan; no deben sumarse como pruebas únicas.

## 3. Errores corregidos

- El chat exigía una mutación de registro cuyo recibo no podía obtener: ahora un reporte no mantiene operaciones pendientes y ofrece el formulario.
- Las expectativas CORE-REG-1 que pedían `confirmation_required` en el chat quedaron obsoletas. Se ajustaron sin retirar pruebas de autenticación, titularidad, integridad o idempotencia. Las pruebas del protocolo de pendientes se trasladaron a una acción de desarrollo todavía vigente.
- El harness de autenticación no soportaba renderizar los nuevos componentes anidados: conserva las aserciones de acceso y usa hooks de React para esos renders.
- La primera iteración añadió un campo `url` no admitido por `ActionResult`: corregido; TypeScript final pasa.
- El refresco de Historial tras guardar dependía de la carga general, que capturaba internamente errores. Ahora refresca directamente la fuente canónica y comunica el fallo de vista sin negar el guardado.
- Un 401/403 durante un reintento podía descartar la clave de una operación ya persistida cuya respuesta se perdió. Se conserva el token y se prueba que al restaurar autenticación sigue habiendo una sola ejecución.

## 4. Fallo preexistente

`node --test lib/chat/groundingInputIncident.test.mjs`: **3/4**, falla el primer caso con `Cannot read properties of undefined (reading 'codigo')`, línea 40. Log `.core-reg-2-preexisting.log`.

Es el mismo fallo documentado en CORE-REG-1 y reproducido allí con fuentes de `HEAD`: el fixture inyecta `fetch`, mientras el `apiCall` usa `authenticatedFetch`. No se cambió ni se eliminó la prueba. No se atribuye a CORE-REG-2 ni se presenta la suite global como íntegramente verde.

## 5. Archivos de CORE-REG-2

Modificados sobre el trabajo previo (incluye archivos que Git aún considera nuevos desde CORE-REG-1):

- `app/FormaPro.tsx`
- `app/api/chat/route.ts`
- `app/auth/AuthenticatedSurface.tsx`
- `app/historia/page.tsx`
- `app/hoy/page.tsx`
- `lib/auth/productAccess.test.mjs`
- `lib/chat/chatCoachActions.ts`
- `lib/chat/coachFirst.test.mjs`
- `lib/chat/coachFirstLoop.ts`
- `lib/chat/coachFirstOutput.ts`
- `lib/chat/coachFirstTools.ts`
- `lib/chat/coachMutationProtocol.ts`
- `lib/chat/groundedCoach.test.mjs`
- `lib/chat/runChatCoach.ts`
- `lib/execution/workoutContracts.ts`
- `lib/execution/workoutHandler.ts`
- `lib/execution/workoutRegistry.ts`
- `lib/planning/recordCompletion.ts`

Nuevos de esta fase:

- `app/entrenamientos/registrar/page.tsx`
- `components/WorkoutForm.tsx`
- `components/WorkoutRegisterButton.tsx`
- `lib/execution/workoutClient.ts`
- `lib/execution/workoutForm.test.mjs`
- `lib/execution/workoutChatBoundary.test.mjs`
- `docs/core-reg-2-delivery.md`
- Logs `.core-reg-2-*.log`, inventario final y scripts auxiliares `.core-reg-2-edits.mjs`/`.core-reg-2-test-edits.mjs` de la primera implementación. Los scripts son artefactos históricos de edición; **no reejecutarlos** sobre el resultado terminado.

En la última reanudación solo se corrigió el manejo del token ante 401/403, se añadió su prueba y la suite de separación del chat, se ejecutó la validación final y se redactó este informe.

## 6. Riesgos y límites pendientes

- **Producción no validada:** CORE-REG-1 sigue necesitando despliegue autorizado de su SQL y comprobaciones PRE/POST del esquema efectivo. CORE-REG-2 no modifica esa migración.
- **Herramientas gratuitas públicas:** este checkout no contiene una sección de herramientas gratuitas o biblioteca pública verificable. Se comprobó la entrada de visitante al registro y no se añadió un bloqueo global de autenticación. No se puede certificar el uso anónimo de herramientas inexistentes aquí; desarrollarlas queda fuera del alcance. No se creó biblioteca de WODs.
- **Pruebas UI locales:** se ejecutan componentes reales mediante un harness React/VM, handler real y SQL PGlite, además de la compilación. No se realizó una sesión manual E2E en un navegador con Supabase real ni una revisión visual en dispositivos.
- **Límite heredado de lectura:** CORE-REG-1 rechaza 1000 o más filas por atleta, contando revisiones. El cursor de historial no elimina ese límite.
- **Cierre de pestaña:** el token persiste en la sesión de la pestaña, no como historial local. Una recarga puede recuperar un guardado confirmado; si nunca llegó al servidor y se perdió el cuerpo en memoria, el usuario debe volver a introducir los campos con la misma clave conservada. Cerrar definitivamente la pestaña elimina su token; antes de registrar de nuevo conviene consultar Historial.
- **Registros heredados:** se muestran con procedencia; editar/eliminar desde esta UI aplica a registros canónicos v2. No hay backfill ni conversión automática de historial legado.
- **Carrera estructurada:** la edición conserva su extensión y la validación deportiva; no se añadió editor de intervalos. Las métricas generales deben seguir siendo compatibles con la estructura conservada.
- **Sin evaluación LLM real:** se verificaron instrucciones, contrato, guards y respuestas sintéticas. No se midió el comportamiento de un proveedor real.

## 7. Working tree y cierre

Rama `main`, con un commit previo por delante de `origin/main`. No se alteró el historial Git ni se añadieron archivos al staging. El árbol incluye tanto CORE-REG-1 como CORE-REG-2 y los archivos ajenos previamente existentes; todos se conservaron.

El inventario exacto final se guarda en `.core-reg-2-final-status.txt`. No hay procesos de pruebas o compilación pendientes al entregar. La tarea se detiene tras esta validación local; no se inició otra fase.
