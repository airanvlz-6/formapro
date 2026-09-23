# FORGE Auth Phase 2 — acceso y vinculación manual

## Alcance implementado

La entrada `/` y el alias `/auth` muestran AuthPanel. La sesión SDK es solo
transporte: `/api/auth/athlete` valida el Bearer con Supabase `getUser`, exige email
confirmado y resuelve el atleta por `auth_user_id`. Un login correcto navega
directamente a `/hoy`; no hay pantalla de éxito ni segundo clic. Logout vuelve a `/`.

Registro: Supabase signup → confirmación nativa → estado sin atleta → formulario
de onboarding ya existente (disciplina, nivel, objetivo y consentimiento de perfil
nuevo) → bootstrap servidor único → `/app/chat`. El consentimiento sigue siendo
explícito para que una cuenta pendiente de vinculación manual no cree un duplicado.
Login y callback por sí solos nunca insertan un perfil. Los reintentos resuelven el
vínculo existente; UNIQUE(auth_user_id) arbitra inserciones concurrentes.

Recuperación: `resetPasswordForEmail` → `/auth/reset` → `updateUser` → cierre de
sesión → volver al login. Contraseñas solo en Supabase Auth. Ningún token o password
se guarda en tablas Forge, logs o parámetros de URL propios.

`/hoy`, `/app` y `/app/chat` resuelven la identidad antes de cargar al atleta. Si la
URL contiene otro código, rechazan. FormaPro recibe el código resuelto, conserva
su comportamiento deportivo y usa transporte Bearer para el API compartido.
No se cambiaron prompts, Coach-first, política, historial, sesión única ni motores
de planificación, disponibilidad, ejecución o Semantic Intake.

## Frontera de identidad y efecto en legacy

Todas las llamadas externas a `/api/chat` ahora se verifican ANTES de su dispatch:
sesión válida → resolver atleta → comparar código solicitado, si existe → usar el
código obtenido del servidor. Código sin Auth y Auth A + código B fallan cerrados.
El alta legacy `guardar_usuario` queda rechazada en esta frontera para impedir
crear un segundo perfil sin Auth. La implementación deportiva interna queda intacta.

Esta protección es deliberadamente común al endpoint: dejar la misma acción
invocable sin Auth desde otra página eludiría la protección de `/hoy` y del chat.
Como consecuencia, clientes antiguos de ese endpoint sin Bearer dejan de obtener
datos, incluso si su código corresponde a un perfil aún no migrado.

No se eliminaron rutas. Las pantallas `/perfil`, `/atleta`, `/plan`, `/historia` y
`/progreso` siguen construyendo URLs por código y NO se adaptaron en esta fase.
Sus peticiones sin Bearer a `/api/chat` ahora son rechazadas. Deben adaptar su
transporte y resolver identidad antes de recuperar su funcionalidad. No presentar
estas pantallas como recorridos ya validados. `/api/stripe`, `/success` y el vínculo
de facturación mediante metadata de código quedan fuera de esta fase y requieren
una revisión posterior de identidad. `/admin` ya está deshabilitado.

La protección HTTP no certifica las políticas RLS/permisos de acceso directo a
Supabase ni otras superficies fuera de este recorrido. Antes de producción,
comprobar que anon/authenticated no pueden crear o modificar vínculos de identidad
directamente en `usuarios`. No se cambiaron políticas de producción desde aquí.

## Operación administrativa

Instalación revisable: `docs/sql/auth-manual-legacy-link.sql`, como `postgres` en el
SQL Editor de Supabase. Instala una función en `forge_admin`, esquema que NO debe
figurar en los esquemas expuestos por Data API. No hay endpoint ni UI públicos.
Revoca permisos del esquema y la función a PUBLIC, anon, authenticated y
service_role. La función usa SECURITY INVOKER, sin elevar privilegios.

`forge_admin.link_legacy_athlete(usuarios.id, auth.users.id, codigo_esperado, email_esperado)`:

- exige ambos registros, Auth confirmado, atleta sin vínculo y Auth libre;
- bloquea las filas Auth y atleta y cuenta con índice único en auth_user_id;
- comprueba código y emails esperados solo como control de errores del operador,
  NUNCA como evidencia de propiedad;
- ejecuta únicamente UPDATE usuarios SET auth_user_id, sin INSERT/copias;
- compara la fila completa antes/después salvo auth_user_id; revierte ante cambios
  adicionales, incluidos triggers que alteren otros campos;
- repetición o conflicto se rechazan, incluso si se repite el mismo vínculo;
- emite un registro PostgreSQL mínimo y devuelve IDs, actor, resultado y fecha,
  sin email, contraseña, token ni contenido del perfil.

Conservar el resultado de la llamada confirmada por COMMIT en el registro interno
de migración. Un log emitido dentro de una transacción que después hace rollback
no acredita una migración terminada. Los errores indican rechazo; no reintentar
a ciegas ante resultado de red desconocido: consultar el vínculo primero.

Verificar antes de instalar: usuarios.id UUID PK; codigo UNIQUE NOT NULL;
auth_user_id UUID nullable con FK a auth.users.id. El índice añadido falla si
hay duplicados; no intenta reparar registros. Revisar triggers reales y permisos
RLS. No se inspeccionó ni modificó la BD de producción en esta fase.

## Antigua contraseña administrativa

CONTAINED. `establecer_password_auth_admin` permanece en la lista de operaciones
deshabilitadas en `lib/auth/legacyContainment.ts`. Sin sesión se rechaza antes de
dispatch; con identidad válida la acción devuelve AUTH_ADMIN_PASSWORD_UPDATE_DISABLED.
No se encontró `auth.admin.updateUserById(...password...)` en el código de aplicación.
No se reintrodujo un setter de contraseñas administrativo.

## Configuración externa pendiente

Supabase Authentication:

- Site URL: `https://www.forgeapp.es`.
- Redirect allowlist exacta: `https://www.forgeapp.es/auth/callback` y
  `https://www.forgeapp.es/auth/reset`.
- Añadir callbacks localhost solo para desarrollo, con su puerto explícito.
- Email/password, confirmación de email, política de passwords y SMTP operativo.
- Plantillas con ConfirmationURL nativa; no incluir tokens manualmente en Forge.
- PKCE exige abrir el enlace en el navegador/origen donde se solicitó. Un enlace
  abierto sin verifier no permite crear un vínculo: volver al navegador original
  o iniciar sesión tras confirmar email; para recuperación, solicitar otro enlace.

Vercel/DNS:

- Asociar `www.forgeapp.es` al proyecto correcto, certificado HTTPS y registros DNS
  indicados por Vercel para ese proyecto; comprobar apex `forgeapp.es` también.
- Código incluye redirección permanente apex → www conservando ruta/query.
  Evitar configurar la redirección contraria en Vercel.
- Variables públicas Supabase del mismo proyecto disponibles en BUILD; service
  role exclusivamente servidor. Reconstruir al cambiar variables públicas.
- No se cambiaron Vercel, DNS, SMTP ni Dashboard de Supabase.
- Sesiones antiguas almacenadas en el origen sin www no se transfieren: iniciar
  sesión en www. Solicitar nuevos enlaces desde el origen canónico.

## Procedimiento personal: mujer

1. Verificar personalmente la propiedad; anotar en privado el `usuarios.id`, código
   y email de SU perfil actual. Guardar snapshot de la fila y datos asociados.
   Confirmar auth_user_id NULL y ausencia de Auth previo; no inferir identidad por email.
2. Ella abre Crear cuenta en www, introduce su email y elige/repite su propia
   contraseña. Confirma el email mediante Supabase en ese mismo navegador.
3. Al aparecer el estado sin perfil, NO marcar «Quiero crear un perfil nuevo» ni
   enviar el onboarding. Su identidad Auth ya existe; aún no debe haber otro usuarios.
4. El administrador comprueba email_confirmed_at, recoge el Auth UID exacto y
   ejecuta personalmente la función privada con ambos UUID y valores esperados.
5. Confirmar resultado committed: mismo usuarios.id/codigo/email, fila idéntica
   salvo auth_user_id, datos asociados e historial intactos; conservar resultado.
6. Ella inicia sesión desde www con email/password: entrada automática en `/hoy`
   del perfil existente; comprobar también apertura de `/app/chat`.

## Procedimiento personal: Laura

1. Verificar personalmente la propiedad del perfil de Laura; registrar sus UUID,
   código y email esperados y snapshot. Confirmar vínculo NULL y ausencia de Auth.
2. Laura usa Crear cuenta en www y establece ella misma su contraseña en Supabase.
3. Confirma el email en el mismo navegador. NO crea un nuevo perfil en el formulario
   de onboarding del estado sin vínculo.
4. Revisar confirmación, obtener su Auth UID y ejecutar la función administrativa
   contra el usuarios.id histórico de Laura, nunca el de otro perfil.
5. Comparar antes/después y datos asociados; guardar el resultado committed.
6. Laura entra con email/password en www y llega al mismo atleta en `/hoy`; comprobar chat.

No se han ejecutado estas migraciones, creado Auth reales ni enviado emails.

## Validación

- `node --test lib/auth/*.test.mjs`: 80 pruebas PASS (incluye cinco subcasos SQL).
- SQL ejecutado en PGlite/PostgreSQL aislado: preservación de datos, conflictos,
  Auth inexistente/no confirmado, roles públicos denegados y rollback por trigger.
- Las llamadas competidoras se prueban en el motor embebido, que serializa consultas;
  no equivale a una prueba de carga multiconexión en Supabase. Locks/UNIQUE están en SQL.
- Pruebas del resolver, registro único/reintento, whitelisting que excluye passwords,
  acceso cruzado, código sin Auth, login automático, logout y doble submit.
- TypeScript y git diff --check PASS.
- Inspección visual local: escritorio y móvil 390×844, login, registro y recuperación.
- Turbopack local falló con «Next.js package not found»; comprobación visual con
  Next dev Webpack. Sin variables Supabase locales de runtime, se comprobó la UI y
  su error controlado; no se realizó login real de producción.

El cierre de producción requiere instalar/revisar SQL y configuración, desplegar
y comprobar login de 060385. No se afirma que el sitio público ya esté desplegado.
