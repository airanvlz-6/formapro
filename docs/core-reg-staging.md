# CORE-REG — preparación de staging

Fecha: 2026-09-30. Complementa `core-reg-deployment.md`. Esta fase solo inspecciona archivos locales y prepara el procedimiento. **No se ha conectado a Supabase/Vercel, creado recursos, ejecutado migraciones, instalado herramientas, escrito datos, hecho commit/push ni desplegado.** No se imprimieron valores de credenciales ni se modificaron archivos de entorno.

## 1. Infraestructura acreditada y desconocida

| Recurso | Evidencia local | Conclusión |
| --- | --- | --- |
| Aplicación | Next 16.2.6, React 19.2.4, lockfile npm; Node local 24.20.0 | Aplicación y dependencias disponibles localmente |
| Supabase | SDK 2.105.4; browser y backend toman `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Hay integración real; el último valor solo pertenece al servidor |
| Configuración local | `.env.local` contiene una URL remota Supabase y variables de claves; también hay snapshots `.env.vercel.production`, `.env.semantic-eval.local` y `.env.local.txt` | Ninguno identifica de forma acreditada una base aislada para esta tarea. Los snapshots de exportación no proporcionan una URL utilizable en la inspección local; no permiten certificar igualdad/diferencia de proyectos efectivos. No copiar ninguno a staging |
| Vinculación Vercel | `.vercel/repo.json`: una entrada `formapro`, directorio `.` y metadatos de proyecto/organización; no `project.json` | Existe vinculación local con un proyecto. No acredita un segundo proyecto, Preview vigente, variables remotas ni aislamiento de DB |
| Configuración Next | Redirección del dominio principal a su host canónico; `typescript.ignoreBuildErrors=true` | TypeScript debe pasar por separado del build. No cambiar esta configuración para simular aislamiento |
| Automatización Vercel | `vercel.json` declara `/api/cron/revisar-founders`, horario `0 6 * * *` | No activar esa automatización en un staging separado. Revisarla en el futuro artefacto, sin alterar ahora el archivo |
| Supabase local / CI | No hay carpeta `supabase/`, config local ni workflows en `.github/workflows` | No hay bootstrap local completo ni pipeline staging acreditado en este checkout |
| Herramientas | No se encontraron `psql`, Docker, Supabase CLI ni Vercel CLI en PATH; tampoco paquetes locales Supabase CLI/Vercel/Playwright | No instalados o no accesibles en esta sesión. No se buscó ni conectó a servicios remotos |
| Pruebas SQL | PGlite 0.5.8 instalado; script de concurrencia preparado | PGlite no sustituye la concurrencia real |

La comprobación local `node scripts/core-reg-concurrency.mjs --check` devuelve `psqlAvailable:false`, `testEndpointConfigured:false`, `writes:false`. No se ejecutó el script sin `--check`.

**No se puede concluir que no exista staging en las cuentas remotas.** Solo que no hay uno utilizable e identificado con la evidencia local disponible. Un Preview de Vercel puede seguir usando la misma base, Auth y service key que producción; no prueba aislamiento.

## 2. Bloqueos concretos encontrados

1. **Callbacks de Auth:** `lib/auth/webAuthFlow.ts:2` permite localhost/127.0.0.1, pero para cualquier otro hostname devuelve el dominio canónico de producción. Alta y recuperación desde un Preview enviarían el callback solicitado hacia producción. Cambiar únicamente las redirect URLs del panel no corrige esta decisión del código. No se modificó el flujo: el primer E2E completo debe usar Next en localhost con Supabase de pruebas. Antes de E2E completo en un hostname staging hará falta revisar y autorizar el ajuste de origen; no declarar ese Preview listo para altas/reset mientras tanto.
2. **Esquema base incompleto en el repositorio:** los SQL versionados no crean el esquema completo de `usuarios`, `weekly_plan` ni todas las tablas que Today/Historial/contexto consultan. `auth-manual-legacy-link.sql` presupone el esquema y no es un bootstrap. El operador debe proporcionar un DDL base revisado, sin datos de usuarios, para el proyecto E2E. El prerrequisito B32 del informe anterior está probado localmente; su presencia en un nuevo destino no está comprobada.
3. **La base del ensayo de concurrencia no es el staging E2E:** el script crea tablas mínimas, sin todos los campos UUID/Auth/perfil de la aplicación, y firma fixtures con una clave sintética de pruebas. No utilizar esos datos como historial del E2E ni copiar las claves de producción para hacerlos pasar.
4. **Today/Historial usan rutas compartidas con el chat:** `/api/chat` tiene un guard global que exige `ANTHROPIC_API_KEY` para varias acciones heredadas. Quitar esa variable sin más puede dar 500 en lecturas deterministas. En el futuro proceso de pruebas aislado usar un marcador no secreto y bloquear la salida del servidor a proveedores, o un transporte de pruebas local. Una clave inválida sola no garantiza ausencia de llamadas. No hacer conversaciones generativas ni ampliar a generación semanal. No se ha cambiado este código en la preparación.

## 3. Entornos y recursos necesarios

### A. PostgreSQL desechable para concurrencia

- PostgreSQL **15 o posterior**, instancia/base vacía reservada para esta prueba; red accesible y TLS según el destino, con verificación de certificado cuando corresponda.
- Cliente `psql` en PATH, Node y `npm ci` con devDependencies del lockfile (el script utiliza el runtime TypeScript de pruebas). No hacen falta Supabase CLI ni Vercel CLI para este ensayo.
- Dos conexiones simultáneas reales. Usar conexión directa o pooling de sesión validado; no dar por probado el ensayo sobre un pool transaccional no inspeccionado.
- Operador con permisos de DDL y, si faltan, creación de `anon`, `authenticated`, `service_role` con BYPASSRLS. Si el proveedor restringe esos permisos, obtener una base adecuada; no debilitar el script.
- Configuración mediante gestor de secretos: `CORE_REG_TEST_DATABASE_URL`, `CORE_REG_TEST_HOST` para host no local y `CORE_REG_TEST_ACK=EMPTY_DISPOSABLE_DATABASE`. No enviar la URL con contraseña al chat. El nombre/ID de proyecto y su clasificación como pruebas sí pueden compartirse.
- El script rechaza un destino con cualquiera de `usuarios`, `weekly_plan`, `running_execution_records`. Una base ya preparada para E2E no sirve. No eliminar tablas para sortear este control.
- **Ejecutarlo sin `--check` implica crear roles/tablas, aplicar migraciones y escribir fixtures. Requiere autorización posterior explícita**, incluso si la base es local.

### B. Supabase aislado para E2E

- Proyecto de pruebas independiente, o aislamiento equivalente confirmado por el operador para PostgreSQL, Auth, claves y endpoints. No basta otro esquema de la misma base ni un nombre «Preview».
- DDL base revisado, políticas/grants, identidad `usuarios.id` UUID y `auth_user_id` único, `codigo`, defaults requeridos por bootstrap, historial JSONB y planes; además las autoridades consultadas por las pantallas. No copiar usuarios, datos históricos, sesiones Auth, tokens ni secretos de producción.
- Dos usuarios sintéticos A/B con email confirmado y perfil vinculado; A Free (`premium=false`, `admin=false`, sin suscripción), B otro atleta independiente. Una tercera identidad confirmada sin vínculo permite comprobar el rechazo de lectura sin bootstrap implícito.
- Email de pruebas controlado o confirmación manual autorizada. El enlace de perfil debe surgir del alta determinista o de un fixture explícitamente aprobado; no vincular cuentas reales heredadas.
- Fixtures exclusivamente sintéticos: un plan propio y otro ajeno, carrera v1 firmada con la clave **de staging**, legado de perfil, reportes/completados de plan y prescripciones sin ejecutar. Los fixtures históricos se insertan antes de CORE-REG-1 para el ensayo de continuidad; después permanecen inmutables. Esto requiere un generador/seed revisado en la siguiente fase, no improvisar con datos reales.

### C. Aplicación

Primera opción: copia/artefacto local revisado, sin `.env*` ni `.vercel`, servido en `http://localhost:3000`, conectado **solo** al proyecto B. Así no hace falta crear ni desplegar nada en Vercel y el callback existente permanece local. No arrancar el checkout actual con su `.env.local` no clasificado.

Variables de B para el proceso aislado: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`; mantener esta última estable durante el ensayo HMAC. `NEXT_PUBLIC_APP_URL`, si se configura, debe ser el origen de pruebas, pero no sustituye el comportamiento de `authOrigin`. No cargar credenciales LLM, pagos, cron, correo comercial u OIDC de producción. Revisar los flags existentes del Coach sin generar entrenamientos semanales.

Si después se desea Vercel: proyecto separado o Preview con variables expresamente acotadas, URL de DB y Auth verificadas distintas de producción y protección de acceso. Antes de publicar: resolver los callbacks, revisar/eliminar cron en el artefacto staging, revisar cualquier webhook/integración y construir de nuevo con las variables públicas del proyecto B. Las variables públicas del build anterior no se corrigen cambiando solo secretos del runtime. Todo esto es una fase posterior autorizada, no un despliegue preparado para ejecutar automáticamente.

## 4. Selección de versión

`docs/core-reg-release-manifest.json` contiene una allowlist con hashes SHA-256:

- **33 archivos runtime** que forman el cambio CORE-REG sobre la base del repositorio.
- **16 archivos de pruebas/fixtures**, solo para validación.
- **5 artefactos operativos:** script de concurrencia y cuatro SQL CORE-REG. No se autoejecutan en build, instalación o arranque.
- **11 prerrequisitos sin cambios** de dependencias, configuración, Auth y B32, para revisión.

Es un **overlay sobre una base completa**, no un proyecto Next autónomo. El resto de imports/assets/configuración debe proceder de la base revisada; no copiar solo los 33 archivos y esperar que compile. El HEAD candidato está fijado en el manifiesto y lleva un commit preexistente por delante de origin/main: no se declara aprobado para publicación. Revisar ese baseline y los hunks de cada archivo; los hashes fijan el estado que se ha seleccionado, no autorizan mezclar otros cambios.

Excluir `.env*`, `.vercel`, `.next`, node_modules, logs, `.core-reg-*`, evaluaciones live/semantic-intake, scripts de edición temporal y scripts live ajenos. La carpeta de operaciones no se mezcla con secretos ni datos. No usar `git add .`, un ZIP indiscriminado ni `vercel` desde este árbol como método de selección. No se ha creado staging Git ni un commit.

No hay paquetes nuevos para CORE-REG: conservar `package.json` y `package-lock.json`. Versiones fijadas inspeccionadas: Next 16.2.6, React 19.2.4, Supabase JS 2.105.4, TypeScript 5.9.3, PGlite 0.5.8. `psql` es externo; PGlite y TypeScript se requieren para la validación local. Playwright no está instalado: el E2E puede ser manual con DevTools; cualquier automatización nueva se decidirá después, sin incorporarla al runtime.

## 5. Procedimiento futuro, con puertas de autorización

1. **Ahora, intervención del propietario:** revisar los proyectos en su panel Supabase y confirmar nombre/ID no secreto de un proyecto realmente separado y desechable, o confirmar que no existe. No crear ni cambiar nada aún. Identificar producción para evitar confusión sin enviar sus claves.
2. Si no existe: solicitar autorización concreta para crear B, definir propietario y presupuesto, y elegir dónde crear A. Obtener autorización local para instalar `psql` si es necesario. No aprovisionar recursos de forma implícita.
3. Obtener el DDL base de una fuente autorizada y revisarlo. Si procede de producción, su inspección/exportación de solo esquema requiere la autorización correspondiente; excluir datos, secretos embebidos, webhooks, trabajos programados y funciones con efectos externos antes de aplicarlo en B. No ejecutar un dump sin revisar.
4. Aprobar plan de fixtures, seed sintético y permisos. A y B deben quedar identificados con etiquetas visibles; conexión server y Auth/browser deben pertenecer al mismo B. Verificar por metadatos locales/operador antes de cualquier escritura.
5. Autorizar el ensayo A: `--check`, luego script completo en la base vacía. Guardar solo resultados sanitizados. Criterios: una creación comprometida + un replay; una edición comprometida + un conflicto; aislamiento; permisos PRE/POST correctos. No reutilizar A como aplicación.
6. Autorizar esquema base, usuarios y fixtures B. Revisar qué objetos existen; B32 solo si falta. Capturar fingerprint histórico; PRE; CORE-REG-1 si falta; paginación si falta; POST y fingerprints iguales. No reaplicar migraciones ni modificar registros históricos para corregir fallos. Conservar los artefactos del ensayo.
7. En Supabase Auth de B, configurar el origen y callbacks locales `/auth/callback` y `/auth/reset`, confirmar emails de pruebas y revisar políticas. El propietario puede introducir secretos directamente en el entorno aislado. No hace falta intervención en Vercel para esta fase local.
8. Preparar aplicación con el manifiesto, variables B y bloqueo de egress LLM. Compilar y después ejecutar TypeScript **secuencialmente**; Next regenera `.next/types`. Arrancar solo tras autorización de conexiones remotas. Ejecutar la matriz E2E y registrar resultado/evidencia por caso.
9. Si se elige Vercel más tarde: propietario confirma proyecto, scopes de variables y Auth callbacks, habilita protección y autoriza por separado el ajuste de origen y el despliegue. Un login con usuarios ya confirmados no sustituye la prueba completa de alta/reset.
10. Entregar resultados de A y B. Producción permanece fuera de esta autorización. Cualquier PRE, migración o despliegue de producción requerirá una decisión posterior.

## 6. Matriz E2E a ejecutar exclusivamente en B

Todas las pruebas se inician desde el navegador contra la aplicación conectada a B. El inspector de red y, cuando corresponda, consultas de solo lectura sobre B permiten contrastar recibos/filas. No guardar HAR con Bearer/cookies/credenciales; sanitizar evidencias. No se ha ejecutado ninguna fila de esta matriz en remoto.

| Caso | Pasos | Criterio de aceptación |
| --- | --- | --- |
| Visitante | Abrir Registrar entreno; probar GET/POST/PUT/DELETE sin token | Invitación a cuenta gratuita/login; API 401; cero perfiles/entrenamientos nuevos |
| Alta y Free | Alta local, confirmación de email y bootstrap; entrar como A sin suscripción | Perfil propio, Free; acceso a formulario, Today e Historial; ningún pago requerido |
| Identidad | Token inválido/caducado, email sin confirmar, identidad sin perfil, código de otro atleta | Rechazo apropiado; ninguna vinculación o identidad anónima implícita |
| Creación libre | A sin plan; descripción válida; omitir resultado y métricas | Recibo persistido, revision 1, un executionId; campos ausentes no se inventan |
| Retroactivo | Registrar en otro mes; abrir ese mes en Historial | Fecha ejecutada conservada; visible en el mes correcto; sin cambiar por fecha de guardado |
| Prescrita | Seleccionar sesión propia exacta y relación performed | IDs de plan/sesión conservados; prescripción no alterada; no copiar su dosis |
| Sustitutiva | Seleccionar relación replaced; intentar luego un plan ajeno | Sustitución válida propia; asociación ajena rechazada sin escritura |
| Consulta | Abrir registro desde Historial y consultar por ID | Datos vigentes, misma procedencia y revisión que el backend |
| Edición | Cambiar texto, opcionales y fecha a otro mes | Mismo executionId, nueva revisión; opcionales omitidos retirados; desaparece del mes anterior |
| Conflicto | Abrir el mismo registro en dos pestañas; guardar ambas | Primera persiste; segunda recibe 409, recarga; no sobrescritura silenciosa |
| Borrado | Cancelar confirmación; después confirmar | Cancelar no escribe; confirmar añade tombstone y retira el activo inmediatamente; legado intacto |
| Respuesta perdida | Proxy/transport de pruebas deja que POST llegue y se confirme; descarta solo la respuesta; pulsar reintentar | Exacto requestId/cuerpo; una ejecución; recibo recuperado. Poner el navegador offline antes de enviar NO reproduce este caso |
| Sesión caducada tras pérdida | Repetir lo anterior, caducar sesión antes del reintento, autenticarse | Token de solicitud conservado; recuperación sin duplicados ni falso éxito |
| Aislamiento | B intenta GET por ID, receipt por requestId, PUT/DELETE y plan de A | No obtiene contenido de A; no cambia sus filas. No usar service key desde el navegador |
| Legado | Consultar fixtures de perfil, reportes/completados de plan y carrera v1 antes/después | Fingerprints iguales; procedencia explícita; sin editar/eliminar heredados; duplicados solo por identidad verificable |
| Prescripción sin ejecutar | Revisar un slot sin evidencia | No aparece como entrenamiento confirmado; evidencia del Coach separa prescripción y ejecución |
| Paginación | Fixture de 3.900 filas/1.300 ejecuciones/1.200 activas; recorrer mes y backend | Vigentes antes de fecha/borrado, orden estable, sin límite por revisiones; sin repetidos/omitidos |
| Navegación | Cambiar meses rápidamente; registrar/editar/borrar y volver | Respuestas viejas no pisan el mes actual; recarga inmediata; meses vacíos correctos |
| Cursor concurrente | Pausar entre páginas y editar desde otra pestaña | 409 stale; reinicio sin mezclar páginas; sin resultados parciales falsos |
| Chat | Ver enlace al formulario y probar rutas retiradas; no enviar generación real | No persistencia, confirmaciones conversacionales ni operaciones pendientes. Mantener suite local con transporte sintético para conversación |
| Coherencia Coach/carga | Ejecutar lectores deterministas con fixtures antes/después de editar/borrar, sin generación | Mismos vigentes, tombstones excluidos, legado disponible y duplicados explícitos tratados coherentemente |
| Seguridad | Ejecutar las comprobaciones SQL POST de solo lectura y revisar roles, grants, RLS e invoker views | anon/authenticated sin acceso directo; servicio con derechos previstos; propietario/RLS real revisados |

El bloqueo de egress debe estar en el **servidor**, no solo en DevTools: las peticiones LLM se originan allí. Cualquier intento inesperado bloqueado se registra como fallo del caso, no se permite ni se oculta con una clave real. Las lecturas de Today deben probarse con datos sintéticos suficientes; si dependen de otra integración, registrar la dependencia y detener ese caso sin ampliar funcionalidades.

## 7. Entrega de esta preparación

Solo se crean este documento y `core-reg-release-manifest.json`. Se verificaron 65 entradas de la selección y sus hashes, sin imports runtime directos nuevos fuera del manifiesto/base; no hay archivos de credenciales bajo seguimiento. `--check` confirmó que faltan psql/destino y `git diff --check` pasó (solo avisos LF/CRLF). No se repiten las 717 pruebas ni compilación porque no cambió código de aplicación, SQL o dependencias. Su resultado previo sigue documentado en `core-reg-deployment.md`; staging aún no está validado. `groundingInputIncident` permanece como fallo preexistente separado.

**Primer paso concreto:** el propietario identifica en Supabase el proyecto de pruebas separado (nombre/ID, sin secretos) o confirma que hay que crear uno. Con esa identificación se puede solicitar una autorización acotada para aprovisionar A/B y aplicar el plan; hasta entonces, no iniciar Next con `.env.local`, no ejecutar migraciones y no usar Vercel Preview como sustituto del aislamiento.
