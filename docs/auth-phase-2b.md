# Auth Phase 2B — restaurar el producto detrás de Supabase Auth

## Causa y alcance

La fase 2 protegió `/api/chat`, pero cinco páginas siguieron haciendo fetch sin
Bearer. Sus consultas eran rechazadas, y sus estados de error mostraban el acceso
legacy por código. Progreso además no finalizaba `iniciado` tras una carga fallida,
por lo que podía permanecer en el loader.

La flecha de salida dentro de FormaPro ejecutaba únicamente
`setPantalla("inicio")` y vaciaba estado visual. NO llamaba a Supabase signOut.
Eso explica que reapareciera el formulario de código y que el mismo atleta pudiera
volver a abrirse con una sesión que en realidad seguía viva. No se reprodujo un
bypass sin sesión en producción: el servidor ya rechazaba peticiones sin Bearer.

No se modificaron endpoints, autoridades de servidor, lógica deportiva, Coach-first,
herramientas/LLM, conversaciones, single-session/takeover, SQL administrativo,
Stripe ni cuentas reales. Sin push ni deploy.

## Recorrido real auditado

| Superficie | Entrada anterior / llamadas | Corrección |
| --- | --- | --- |
| Hoy `/hoy` | Ya resolvía Auth y enviaba Bearer; tres lecturas de usuario, briefing y readiness | Conserva llamadas/datos, reutiliza la barrera común |
| Progreso `/progreso` | Query codigo; recuperar_usuario, calcular_adherencia y registrar_metrica_pasada sin Bearer | Código resuelto; lecturas/escritura con authenticatedFetch; error sin login legacy |
| Plan `/plan` | Query codigo y week_start; obtener_plan_semana, recuperar_usuario, obtener_progreso_objetivo sin Bearer | Auth compartido; week_start y contenido existente intactos |
| Atleta `/atleta` | Query codigo; usuario, progreso, nivel de conocimiento, detalle de estado y transiciones sin Bearer | Transporte Auth en todas las llamadas; no cambia la lógica de estado |
| Más | Overlay local mostrarMas; enlaces construidos con codigo | Mismos enlaces, orden, apertura y destino; código procede del atleta resuelto |
| Ajustes | Más → `/app?codigo=...&ajustes=1` → FormaPro redirige a `/perfil?codigo=...` | Se conserva ese recorrido. `/perfil` carga usuario/training sources y envía cambios por Auth |
| Mi Historia `/historia` | Query codigo; obtener_historia, recuperar_usuario, calcular_logros, obtener_plan_por_fecha y CRUD de eventos sin Bearer | Mismas operaciones mediante transporte Auth; datos/modelo sin cambios |
| Coach `/app` | AuthenticatedApp → FormaPro; la flecha mostraba inicio legacy sin cerrar Auth | Barrera común, carga inicial sin pantalla de código, salida mediante signOut |
| Chat `/app/chat` | Alias al mismo AuthenticatedApp; transporte ya autenticado | Reutiliza barrera común; flujo de conversación y Coach-first intactos |
| Forge Labs | `https://t.me/forgeapp_es`, target blank | Intacto |

Las páginas auditadas no obtenían identidad de localStorage/sessionStorage: la
obtenían del query. FormaPro usa `sessionStorage.forge_session_id` para el sistema
independiente de sesión única; se conserva sin modificar ni borrar.

El menú principal conserva Hoy → Progreso → Plan → Atleta → Más. También se
conservan las variantes PREEXISTENTES: supervisión/consulta sustituye Plan por
Historia en algunas páginas; Ajustes tiene su barra secundaria propia. No se
normalizan ni se rediseñan esas diferencias en esta tarea.

## Autoridad y transporte

`AuthenticatedSurface` se comparte entre las seis páginas y AuthenticatedApp.
Antes de montar el contenido: SDK getSession → Bearer GET /api/auth/athlete →
getUser(token) servidor → resolveAuthenticatedAthlete → codigo y UUID resueltos.
El código se pasa como prop de compatibilidad al contenido existente. No hay
selección de atleta ni bootstrap desde estas páginas.

`?codigo=` es opcional. Si existe, debe coincidir EXACTAMENTE con el código resuelto.
Auth A + codigo B falla cerrado y no monta el contenido. Sin Auth se vuelve a `/`.
El servidor además vuelve a validar cada llamada a `/api/chat`, independientemente
del cliente. Los tokens se obtienen del SDK en cada petición mediante el helper
authenticatedFetch ya existente; no se duplican verificadores ni se guarda un
Bearer en estado del componente.

Solo `week_start` conserva su uso funcional en Plan. Los otros parámetros existentes
de Coach/Ajustes no se eliminan. El query codigo deja de ser fuente de identidad.

Las cinco interfaces de acceso por código se retiraron de Progreso, Plan, Atleta,
Historia y Ajustes. El JSX legacy de inicio en FormaPro queda CONTENIDO: su único
importador monta Forge después de resolver Auth, con authenticatedCodigo; el inicio
legacy tiene además una condición que lo excluye cuando existe esa identidad. La
carga inicial usa `cargando`, y ya no existe ningún setPantalla("inicio").

## Logout

Logout está disponible mediante el componente compartido en la cabecera de todas
las superficies autenticadas. El antiguo control de salida de Chat utiliza ese
mismo componente en formato compacto. No se cambia el menú inferior ni Más.

El botón bloquea doble envío, llama a Supabase signOut, y hace navegación completa
a `https://www.forgeapp.es/` (localhost se conserva solo para pruebas locales).
La navegación descarta el estado React y el SDK elimina sus credenciales. No se
borra arbitrariamente storage ni el identificador del sistema de sesión única.
Si signOut falla se muestra error y no se simula un cierre correcto.

La barrera desmonta contenido al recibir SIGNED_OUT, incluso desde otra pestaña.
Al salir de la página descarta el contenido y al restaurar desde bfcache verifica
de nuevo. Si cambia el principal Auth, se vuelve a la entrada; una renovación del
token o SIGNED_IN del mismo principal no reinicia el contenido ni el chat.

## Evidencia

### Test automatizado

`node --test lib/auth/productAccess.test.mjs`: 22 casos.

El harness monta las páginas reales y utiliza los módulos reales de transporte,
verificación de principal y resolución de atleta, con Supabase/datos de dominio
simulados. Comprueba valores renderizados procedentes de esas respuestas: insight,
visitas, bloque del plan, informe del atleta, objetivo del perfil y evento histórico.
Comprueba también el payload de guardado de Ajustes, consultas complementarias,
week_start, menú Más, enlace externo, navegación sin query, ausencia de creación de
perfiles, logout, error de logout, restauración bfcache y cambio de principal.

Los tests no sustituyen las consultas deportivas reales de producción por una
implementación nueva: solo proporcionan respuestas de prueba a su transporte.
Coach/Chat verifican la entrada y el código que recibe FormaPro; no ejecutan LLM ni
modifican/prueban conversaciones reales.

Suite Auth completa: `node --test lib/auth/*.test.mjs`: **96/96 PASS**.
Comprobaciones adicionales: `npx tsc --noEmit --pretty false` **PASS** y
`git diff --check` **PASS**.

### Validación local

Next dev con Webpack y configuración Supabase ficticia, sin credenciales reales.
En navegador: abrir Progreso y Plan con `?codigo=060385` sin sesión vuelve a `/`
y muestra Email, Contraseña y Entrar; no muestra un formulario de código.
No se ha usado una cuenta de producción para completar un recorrido local con datos reales.

### Pendiente validación producción

Después de revisión/despliegue por el usuario: entrar con 060385 y recorrer Hoy →
Progreso → Plan → Atleta → Más → Ajustes → Mi Historia → Coach → Chat → logout →
login. Confirmar contenido REAL previo (mismo usuarios.id), actualización permitida
de perfil y navegación conservando sesión. Probar URL ajena y código sin sesión.
Los tests locales no acreditan esa comprobación de producción.

## Hallazgos fuera de alcance, no reparados

- Cambiar código y eliminar cuenta en Ajustes ya estaban deshabilitados por la
  contención Auth anterior. Se conserva la denegación; no se habilitan por añadir Bearer.
- El email editable del perfil actualiza usuarios.email; no cambia por sí mismo el
  email de login de Supabase. No se implementa cambio de credenciales en esta fase.
- Las variantes de navegación por modo y barra de Ajustes son anteriores a este
  trabajo; permanecen intactas.
- El problema de conversaciones simultáneas/PC-móvil no se investigó ni modificó.
- No se ejecutaron migraciones ni se tocaron el SQL administrativo o sus permisos.
