# CORE-REG: prueba manual local de lectura

Fecha: 2026-09-30. Continúa `core-reg-deployment.md`. No se modifica código de aplicación ni se repiten las 717 pruebas. Supabase es el destino de producción indicado por el usuario.

## Comprobaciones realizadas

- `npm run dev -- --hostname 127.0.0.1 --port 3000`: Next 16.2.6 listo en 5,3 s con `.env.local`. Servidor detenido al terminar para que el usuario lo arranque en su terminal, con acceso de red normal.
- GET locales sin sesión: `/`, `/auth`, `/hoy`, `/plan`, `/historia`, `/entrenamientos/registrar`: HTTP 200; compilación de desarrollo correcta. `/api/workouts` y `/api/auth/athlete`: 401 esperado; GET `/api/chat`: 405 esperado, módulo compilado.
- Esto verifica compilación y render inicial, no hidratación autenticada ni los datos concretos del perfil. No se ejecutó un nuevo build de producción ni TypeScript; los resultados anteriores constan en el informe de despliegue. Next advierte de filesystem lento; no es un error de compilación.
- GET de PostgREST con `limit=0`, credenciales cargadas sin imprimirlas, sin recuperar filas: `weekly_plan(id,user_codigo,week_start,sessions)`, `usuarios(codigo,workout_history)`, `physiology_records`, `athlete_events` y las columnas v1 de `running_execution_records` respondieron 200.
- Las columnas `record_version`, `revision` y `request_id` se comprobaron separadamente: 400 / `42703`. Las cuatro vistas `workout_current_records`, `workout_read_rows`, `workout_history_entries`, `workout_history_version`: 404 / `PGRST205`. El esquema expuesto no satisface CORE-REG. No se llamó a ningún RPC ni se ejecutó SQL remoto. Esto no certifica todas las definiciones, permisos/RLS ni existencia de datos de una cuenta.

## Rutas y efectos

No hay scripts npm pre/post de migración, ni instrumentation/middleware/proxy de arranque detectados. El layout renderiza; los clientes revisados cargan datos en efectos del navegador. El cron configurado en Vercel no se programa al ejecutar `next dev`.

| Ruta | Prueba de lectura permitida | Límite actual |
| --- | --- | --- |
| `/` o `/auth` | Acceso de la cuenta ya existente; redirige a `/hoy` | Iniciar/refrescar sesión sí modifica el estado de Supabase Auth; no equivale a cero escrituras de autenticación. No crear cuenta/perfil, recuperar contraseña ni vincular perfiles en esta prueba. |
| `/hoy` | Leer briefing y sesión; abrir Registrar entreno | Las acciones de carga revisadas son consultas. No pulsar check-in/readiness, Coach ni otras acciones de guardado. Datos de la cuenta pendientes de validación manual. |
| `/plan` | Leer semana y detalles; consultar `/plan?week_start=AAAA-MM-DD` con un lunes pasado conocido | Lee `weekly_plan` directamente; no requiere vistas CORE-REG. Una semana ausente no implica pérdida de datos. No generar/modificar semanas. |
| `/entrenamientos/registrar` | Abrir/cerrar, rellenar campos sin enviar, cambiar fecha, consultar y seleccionar prescripción o sustitución | La consulta de prescripciones lee `weekly_plan`. Sin resultado es válido. No pulsar Confirmar y registrar ni reintentar envíos. Si hay un requestId previo en la pestaña, la recuperación solo hace GET pero fallará con el esquema actual. |
| `/historia` | Abrir para observar el bloqueo actual | Carga `/api/workouts`, que empieza por `workout_history_version`; falta la vista y se espera 503 `WORKOUT_HISTORY_READ_FAILED`. El componente termina mostrando Error de conexión. Calendario, meses y acceso al formulario desde esta pantalla quedan bloqueados. |
| `/api/workouts` | Solo GET autenticado, sin mutaciones | Listado/detalle requieren las vistas nuevas; recibos requieren columnas v2. Crear/editar/borrar no se prueban ni deben intentarse. |

El historial heredado sigue disponible en sus autoridades: `usuarios.workout_history`, `weekly_plan.sessions` y carrera v1. Las comprobaciones de esquema fueron satisfactorias para esas fuentes. Sin embargo, **el Historial nuevo no ofrece un fallback visible sin las migraciones**; tampoco los lectores nuevos de carrera/evidencia basados en `workout_read_rows`. No se ha verificado el contenido específico del perfil ni se presenta un 200 HTML como prueba de lectura autenticada.

No entrar en `/app` ni `/app/chat`: `FormaPro` llama automáticamente a `/api/user/visit` (actualiza `total_visitas` y `ultima_visita`), comprueba renovación beta y dispara otros flujos de inicio. No se considera una ruta de solo lectura, aunque el registro de entrenamientos ya esté separado del chat. No enviar mensajes al Coach: queda fuera de esta prueba y puede llamar a LLM.

El formulario no envía entrenamientos al abrirse ni al escribir en sus controles. Las mutaciones dependen de botones explícitos. No se ha instalado un bloqueo técnico global de escrituras: el alcance de solo lectura requiere seguir las rutas y acciones indicadas. Si se exige literalmente cero cambios incluso en Auth, usar únicamente pantallas sin autenticar; el SDK tiene renovación automática de sesión.

## Arranque y lista manual

En una terminal propia:

```powershell
Set-Location 'D:\COPIA_PORTATIL_2026\Desktop\formapro'
npm run dev -- --hostname 127.0.0.1 --port 3000
```

Usar siempre `http://127.0.0.1:3000` en esta prueba (localhost y 127.0.0.1 mantienen almacenamiento de sesión distinto). Si se desea aprovechar una sesión ya existente en localhost, arrancar con `--hostname localhost` y mantener ese origen. Detener con Ctrl+C.

1. Abrir `/hoy` con la cuenta existente; revisar el briefing sin responder readiness. Si el acceso no está vinculado, detenerse sin crear un perfil nuevo.
2. Abrir `/plan` y luego una semana pasada conocida mediante `week_start`; desplegar detalles sin modificarla.
3. Desde Today abrir Registrar entreno: escribir una descripción, dejar resultado vacío, cambiar a una fecha pasada, revisar prescripciones y selección realizada/sustituida. Cerrar sin guardar.
4. Abrir `/historia`: con este esquema se espera el bloqueo descrito, no un calendario vacío como prueba de que no hay entrenamientos. No puede validarse aún navegación por meses.
5. En ventana sin sesión, abrir `/entrenamientos/registrar` para verificar la invitación de acceso; no crear cuenta.

No pulsar guardar, editar, eliminar, reintentar envíos, crear eventos ni entrar en Coach. Los POST de `/api/chat` para `recuperar_usuario`, `obtener_daily_briefing`, `obtener_readiness_hoy`, `obtener_plan_semana`, `obtener_progreso_objetivo`, `obtener_historia`, `calcular_logros` y `obtener_plan_por_fecha` son lecturas según las ramas revisadas: HTTP POST no implica por sí solo escritura.

## Estado

No migraciones, escrituras de datos, llamadas LLM, commit, push ni despliegue. No sesión de usuario abierta por el agente. Se conserva todo el working tree anterior; el único archivo añadido en esta tarea es este informe. `git diff --check` sin errores; advertencias de conversión LF/CRLF preexistentes. La validación local de interfaz puede comenzar con los límites anteriores; el CRUD y la cronología unificada siguen pendientes del esquema requerido y de autorización separada.
