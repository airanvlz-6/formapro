# CORE-REG: release local preparado

## Resultado

Selección preparada y validada localmente. No se cambió código de aplicación. No hubo conexiones remotas, migraciones, escrituras remotas, instalación de paquetes, commit, push ni despliegue durante esta tarea.

Base exacta: `403784414a380807f69e7a6778408b4585cfe444`, más los 60 archivos de `docs/core-reg-release-selection.json` (`overlay`, con SHA-256). Los 65 hashes del manifiesto anterior coinciden. Los 31 archivos versionados modificados pertenecen a esa selección; no hay modificaciones versionadas pendientes ajenas que deban separarse por hunks.

**Decisión antes de publicar:** la base está un commit por delante de la referencia local `origin/main`. Ese commit preexistente, `feat(athlete): restore editable heart rate zones and factual builder references`, modifica 12 archivos de zonas cardíacas/referencias y está incluido como parte de la aplicación base. No es trabajo nuevo de CORE-REG ni se ha retirado. Si no debe publicarse, esta versión no es la autorizable: habría que preparar y validar otra base, sin reescribir este working tree. No se hizo fetch; no se afirma cuál es el estado remoto actual.

## Artefactos exactos

- `build/core-reg-release-20260930/source/`: copia completa de fuentes, 643 archivos de la base más el overlay, 672 archivos únicos.
- `build/core-reg-release-20260930/core-reg-source.tar.gz`: esos 672 archivos, sin `.env`, `.git`, `.vercel`, `node_modules`, `.next`, logs ni scripts temporales. SHA-256: `1af414455edb823bc40db5484f19afbcbfb5858f4e15a919034b216d0d6ba244`.
- `build/core-reg-release-20260930/source-files.txt`: inventario completo del paquete, incluidos los archivos heredados de la base.
- `build/core-reg-release-20260930/source-sha256.json`: hashes individuales de los 672 archivos. Verificados sin cambios tras build/pruebas/TypeScript.
- `docs/core-reg-release-selection.json`: 60 archivos exactos del overlay y 85 exclusiones exactas del working tree inicial. El manifiesto antiguo se conserva sin cambios.
- Este informe y el JSON de selección son documentación adicional de entrega; se pueden incluir junto al overlay en el commit mediante la lista explícita descrita abajo. No forman parte del tar de fuentes validado.

El directorio `build/` está ignorado por Git. Conserva el tar si necesitas trasladar la copia; no es un despliegue ni un checkout Git. Su `node_modules` es una junction local para reutilizar las dependencias instaladas; no está en el tar. El `.next` de validación contiene valores sintéticos: **no publicarlo ni reutilizarlo como build de producción**. Vercel debe recompilar las fuentes con su configuración existente.

La selección completa conserva rutas, assets, autoridades de planificación y lockfile. Las exclusiones del manifiesto anterior se interpretan como exclusiones de incorporaciones del working tree, no como una orden de borrar archivos ya versionados de la aplicación base. Los documentos históricos de semantic-intake ya versionados permanecen en la base.

## Integridad funcional de la selección

| Capacidad | Archivos principales incluidos |
| --- | --- |
| CRUD autenticado, cuenta Free, SQL writer | `app/api/workouts/route.ts`, `workoutHandler.ts`, `workoutRegistry.ts`, contratos e integridad; Auth de la base |
| Formulario y acceso | `components/WorkoutForm.tsx`, `WorkoutRegisterButton.tsx`, `app/entrenamientos/registrar/page.tsx`, `app/hoy/page.tsx` |
| Historial y cronología | `app/historia/page.tsx`, `workoutHistory.ts`, `workoutProjections.ts`, SQL de paginación |
| Lectores Coach/evidencia/carga | `workoutReads.ts`, `runningExecutionStore.ts`, `recentTrainingEvidence.ts`, `loadAthletePrescriptionContext.ts`, `loadTrainingLoad.ts` y lectores de chat del manifiesto |
| Recuperación idempotente | `workoutClient.ts`, `workoutHandler.ts`, `workoutRegistry.ts`, SQL `mutate_workout` |
| Generación de semanas | `app/FormaPro.tsx`, `app/api/chat/route.ts`, `app/plan/page.tsx` y todo `lib/planning`, deportes y autoridades ya versionados |

Las acciones `preparar_generacion_semana`, `analizar_bloque_semana`, `planificar_semana`, `construir_sesion_dia` y `guardar_plan_semana` siguen presentes en la ruta compartida. Los hunks CORE-REG no suprimen estas ramas. No se hizo una generación real ni llamada LLM.

`recordWorkout` llama a `db.rpc('mutate_workout', ...)`; crear, actualizar y borrar usan ese escritor. `writeRunningExecution` delega en `recordWorkout` para nuevas ejecuciones. No se encontró INSERT directo sobre `running_execution_records` en runtime. El tipo histórico `ExecutionDatabase` todavía declara `insert`, sin invocarlo; los INSERT restantes detectados corresponden a fixtures de pruebas de filas v1. No se necesita restaurar el permiso INSERT revocado por la migración.

## Validación de esta copia

- Build **completo** `next build --webpack`: exit 0, incluidas prerenderización y rutas `/api/chat`, `/api/workouts`, `/plan`, Today, Historial y formulario. Log `build/core-reg-release-20260930/build.log`.
- TypeScript `tsc --noEmit --incremental false`: exit 0. Se ejecutó por separado porque la configuración base tiene `ignoreBuildErrors: true`. Log `typescript.log` en el mismo directorio.
- **50/50 pruebas**, cero fallos/omitidas: `workoutRegistry`, `workoutForm`, `workoutPagination`, `workoutChatBoundary`, `writerConvergence`, `productionPlanningAudit`. Log `selection-tests.log`. Incluyen formulario/handler/SQL PGlite, pérdida de respuesta, aislamiento, revisión y borrado, 3.900 revisiones y 1.200 ejecuciones visibles, continuidad y ramas de planificación.
- `git diff --check`: correcto. Los archivos de fuente del paquete no cambiaron durante la validación.
- No coincidencias con los valores de credenciales locales conocidos en el paquete. No se imprimieron esos valores ni se copiaron archivos de entorno.
- Build con valores sintéticos y transportes HTTP/fetch bloqueados. Sin llamadas a Supabase ni LLM.

Advertencias no bloqueantes: Next detecta dos lockfiles por la ubicación anidada de la copia; se reutilizaron dependencias locales. El proveedor de email no se configuró en la validación aislada. No se cambió configuración para ocultar avisos. El fallo preexistente `groundingInputIncident` documentado anteriormente no se ha vuelto a ejecutar ni se declara resuelto. No se repitió la auditoría de 717 pruebas.

## Comprobaciones de producción comunicadas por el usuario

Se registran como evidencia aportada, no como consultas ejecutadas por el agente: prerrequisitos revisados; `running_execution_records` vacío; `unknown_versions`, `invalid_history_arrays` e `invalid_session_arrays` iguales a cero; perfiles seleccionados exportados.

| Fingerprint PRE | Valor aportado |
| --- | --- |
| profile_history | `72506d509ce4791fb8b1267a5a7c0cba` |
| weekly_plan | `4d19005709985b053928645eac1da13c` |
| running_v1 | `d41d8cd98f00b204e9800998ecf8427e` |

Las exportaciones de perfiles no se presentan como un backup completo/PITR. La concurrencia entre conexiones PostgreSQL reales sigue sin ensayarse; PGlite no la certifica. Estos límites se mantienen explícitos, sin crear staging ni instalar PostgreSQL.

## Secuencia manual después de las migraciones

Estos pasos son instrucciones futuras, **no ejecutados ni autorización implícita de despliegue**.

1. Aplicar el procedimiento SQL ya revisado: CORE-REG-1 y después paginación, sin reaplicar objetos existentes a ciegas. Ejecutar POST, verificar permisos/RLS, índices y disponibilidad PostgREST. Comparar fingerprints con PRE durante una ventana sin cambios concurrentes; si difieren, detenerse e investigar. No basta con que ambos SQL terminen. Mantener cerradas las escrituras hasta que esté publicada la aplicación compatible.
2. Confirmar inclusión del commit previo indicado arriba y revisar rama/configuración de producción en Vercel. Para reproducir lo validado, utilizar el build command `npm run build -- --webpack`, sin modificar credenciales. Conservar la clave de firma existente y las variables de producción. No subir `.env` ni el build sintético.
3. Preparar Git con la lista explícita. Ejecutar desde el working tree original; detenerse si la base, hashes o staging no coinciden:

```powershell
Set-Location 'D:\COPIA_PORTATIL_2026\Desktop\formapro'
$release = Get-Content docs/core-reg-release-selection.json -Raw | ConvertFrom-Json
if ((git rev-parse HEAD) -ne $release.baseHead) { throw 'La base ha cambiado: revisar release' }
if (git diff --cached --name-only) { throw 'Hay cambios staged previos: detenerse' }
foreach ($file in $release.overlay) {
  if ((Get-FileHash -Algorithm SHA256 -LiteralPath $file.path).Hash.ToLowerInvariant() -ne $file.sha256) {
    throw "Contenido distinto del validado: $($file.path)"
  }
}
$releasePaths = @($release.overlay.path) + @('docs/core-reg-release-selection.json','docs/core-reg-release-ready.md')
[IO.File]::WriteAllLines((Join-Path $PWD 'build/core-reg-release-20260930/git-paths.txt'), $releasePaths, [Text.UTF8Encoding]::new($false))
git switch -c codex/core-reg-release
git add --pathspec-from-file=build/core-reg-release-20260930/git-paths.txt
if ($LASTEXITCODE -ne 0) { throw 'No se pudo preparar el índice' }
$stagedPaths = @(git diff --cached --name-only)
if (Compare-Object ($releasePaths | Sort-Object) ($stagedPaths | Sort-Object)) { throw 'La selección staged no coincide' }
git diff --cached --check
if ($LASTEXITCODE -ne 0) { throw 'Revisar whitespace antes del commit' }
git diff --cached --stat
git diff --cached
```

4. Solo tras revisar ese diff y autorizar la publicación:

```powershell
git commit -m "feat: release CORE-REG canonical workouts and paginated history"
git push -u origin codex/core-reg-release
```

El push puede disparar un Preview si la integración Git de Vercel está activa; hacerlo solo cuando esa operación esté autorizada. Abrir/revisar el PR hacia la rama de producción configurada y fusionarlo después de POST correcto y aprobación. Si esa rama es `main` y existe autodeploy, el merge inicia el despliegue. Si no hay autodeploy, desplegar manualmente en Vercel el SHA exacto aprobado de esa rama. Verificar que no se está seleccionando un commit anterior. No usar `git push origin main` desde este working tree ni subir todo el directorio.

5. Verificar el build remoto y smoke autenticado de lectura: Today, semanas, Historial y formulario. Autorizar aparte cualquier prueba de escritura real. Si falla la aplicación, conservar el esquema/datos y seguir la recuperación del informe de despliegue; no restaurar INSERT directo ni borrar columnas.

## Estado del working tree

Los cambios y archivos ajenos preexistentes permanecen intactos, sin staging. Se añadieron únicamente `docs/core-reg-release-selection.json`, este informe y artefactos ignorados bajo `build/core-reg-release-20260930/`. No se modificó el manifiesto anterior ni código de runtime. La lista de exclusión enumera cada archivo ajeno/auxiliar; incluye logs y scripts temporales CORE-REG, resultados/evaluadores live y semantic-intake, y la propuesta de auditoría antigua. No incorporarlos al commit.
