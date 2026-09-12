# FORGE — Paso 3: Canonical Movements + Generative Variants

Implementación local sobre `9879e0f` (Paso 2). Sin commit, push, deploy, SQL, migraciones ni cambios de datos. La aceptación con usuarios reales queda preparada, no ejecutada.

## A. Antes

`MOVEMENT_LIBRARY` → `trainingFeasibility.evaluatePools/evaluateTrainingFeasibility` → `allowedTrainingContract.buildAllowedTrainingContract` → `sessionAuthority.generateTrainingSession` → `sessionGeneration.generateContractSession` → `structuredSession.checkSessionShape/validateSessionAgainstTrainingContract` → renderer → recibo firmado → verificación/freshness/CAS existentes.

`rankearCandidatos` aportaba candidatos y exposición. Factibilidad eliminaba candidatos por restricciones, material/capacidades y propósito; el contrato recomputaba el pool para detectar manipulación. El Builder solo podía devolver IDs canónicos presentes en `allowedMovementIds`. Un ejercicio inexistente en el catálogo fallaba antes de poder representar su semántica, aunque el Coach pudiera describirlo.

La dosis ya pertenecía al Coach desde Paso 2. `sessionDose` verificaba representación, referencia exacta, semántica del formato y tiempo. `prescriptionDataSufficiency` aplicaba equipo, habilidad y medición. `movementRestrictionPolicy` conservaba UNKNOWN. Recibos, renderer, carga y exposición consumían IDs canónicos.

## B. Después

Se conserva ese flujo con una extensión optativa y firmada del contrato v3: `generatedMovementAuthority`. La emisión actual la adjunta en servidor; no es una opción concedida por el cliente.

Una entrada puede ser canónica o una receta generativa v1. `movementVariants.resolveSessionMovement` resuelve la receta en un adaptador deportivo antes de validar. Obtiene del catálogo la base, aplica únicamente modificadores tipados reconocidos y deriva identidad, disciplina, patrón, material, demanda técnica, impacto, carga axial, base de dosis y evidencia de restricciones. Después actúan las autoridades existentes.

El catálogo sigue siendo fuente de bases y conocimiento explícito, pero no necesita contener cada combinación exacta. No se añaden IDs ni aliases globales, ni se cambia ninguna referencia canónica. El Coach escoge la receta y dosis; un fallo provoca el segundo intento ya existente. Dos propuestas inválidas terminan en error, sin sustitución ni clamp del servidor.

## C. Archivos modificados

| Archivo | Propósito |
|---|---|
| `lib/sports/movementVariants.ts` | Nuevo adaptador de recetas, descriptor derivado, identidad estable y procedencia. |
| `lib/sports/allowedTrainingContract.ts` | Extensión versionada opcional y verificación de su configuración. |
| `lib/sports/sessionAuthority.ts` | Conecta la extensión en la emisión real antes de generación/firma. |
| `lib/sports/structuredSession.ts` | Entrada variant en schema 2; validación de intent, restricciones, material, semántica e identidades. |
| `lib/sports/movementRestrictionPolicy.ts` | Acepta evidencia biomecánica resuelta por el adaptador; conserva el comportamiento canónico. |
| `lib/sports/prescriptionDataSufficiency.ts` | Reutiliza requisitos de equipo/habilidad para el descriptor; variantes sin referencias numéricas ejecutables. |
| `lib/sports/sessionDose.ts` | Patrón/base de dosis resueltos y bloqueo de referencias numéricas en variantes. |
| `lib/sports/sessionGeneration.ts` | Prompt real, schema, restricciones, motivo breve y diagnósticos del recorrido generativo. |
| `lib/sports/sessionDoseDiagnostics.ts` | Nuevos eventos dentro del mecanismo opt-in existente. |
| `lib/sports/sessionProfessionalRenderer.ts` | Nombre verificable y descriptor serializado para sesiones con variantes. |
| `lib/sports/humanCoachingProjection.ts` | Presentación humana usa el nombre resuelto sin reconstruir autoridad. |
| `lib/sports/exposureEngine.ts` | Exposición estructurada por identidad exacta, familia y patrón. |
| `lib/trainingLoad/prescriptionLoadAdapter.ts` | Consume descriptor y conserva receta; no calcula kg de una familia generativa. |
| `lib/planning/wholeWeekAdapter.ts` | Conserva patrones y comparación de duplicados usando identidad derivada. |
| `lib/sports/movementVariants.test.mjs` | Casos de admisión, rechazo, transporte, exposición, firma y freshness. |
| `docs/movement-variants-step-3.md` | Informe y procedimiento de aceptación. |

No se modifica `MOVEMENT_LIBRARY`, el motor compartido de suficiencia, el Weekly Coach, C2/B3, rutas, clientes, tablas ni escrituras CAS.

## D. Authority matrix

| Participante | Decide / verifica | No puede conceder |
|---|---|---|
| Coach | Canónico o receta generativa; composición, dosis, RPE/RIR, razón breve | Seguridad, recuperación, disponibilidad, biomecánica inventada o RM |
| Resolver semántico deportivo | Operaciones reconocidas, descriptor, identidad y procedencia | Nuevos hechos del atleta o equivalencia de referencias |
| Restriction authority | Exclusiones activas y evidencia explícita por propiedad | UNKNOWN → compatible |
| Equipment/skill authority | Señales canónicas necesarias para ejecutar el descriptor | Equipo supuesto por el nombre, ni habilidad desconocida |
| Reference authority | Referencia canónica exacta y expresión/calculado existentes | Usar familia, NRM o lift tolerado como 1RM |
| Builder | Solicitar y transportar una propuesta, con dos intentos máximos | Reparar receta, sustituir ejercicio, recortar dosis |
| Validator | Scope, intent, estructura, dosis, tiempo, restricciones, suficiencia y duplicados | Elegir una nueva sesión por su cuenta |
| Receipt/freshness/save | Autenticidad, contexto actual, propiedad, semana y CAS | Dar validez a datos del cliente por estar renderizados |

Los motores compartidos reciben requisitos/evidencia; las reglas deportivas viven en `lib/sports`. Los contratos y descriptores son serializables e independientes de React/DOM/estado local. Web y un futuro cliente Expo consumirían la misma autoridad de backend.

## E. Schema exacto

Se mantienen `schemaVersion: 2`, bloques y prescription del Paso 2. Entrada canónica sin cambios:

```json
{
  "movementId": "back_squat",
  "prescription": {
    "sets": 5, "reps": 3, "restSeconds": 150,
    "intensity": { "kind": "percent_1rm", "referenceId": "1rm:back_squat", "value": 70 }
  }
}
```

Entrada generativa completa:

```json
{
  "movementId": "generated:main",
  "variant": {
    "version": 1,
    "canonicalFamily": "db_lunge",
    "displayName": "Tempo 3-1-1-0 contralateral reverse db lunge",
    "modifiers": {
      "tempo": [3, 1, 1, 0],
      "direction": "reverse",
      "loadPosition": "contralateral"
    }
  },
  "prescription": {
    "sets": 3, "reps": 8, "perSide": true, "restSeconds": 60,
    "tempo": [3, 1, 1, 0], "intensity": { "kind": "rpe", "value": 6 }
  }
}
```

Esto ilustra representación, no una prescripción para AIRAN. `explanation` de la sesión conserva el límite de 1–400 caracteres exigido por generación Coach; se devuelve como `coachingDecision.reason`, fuera de la propuesta deportiva firmada, igual que Paso 2.

Tipo de receta exacto:

```ts
type MovementVariantProposal = {
  version: 1;
  canonicalFamily: string;
  displayName: string;
  modifiers: {
    tempo?: [number, number, number, number];
    stance?: 'narrow' | 'wide';
    direction?: 'reverse';
    loadPosition?: 'contralateral';
  };
};
```

`movementId` local exige `generated:` seguido de 1–32 caracteres `[a-z0-9_-]`. La familia debe existir. Se requiere al menos un modificador; claves extras se rechazan. `displayName` tiene máximo 160 caracteres y debe coincidir, ignorando mayúsculas y espacios exteriores, con la gramática de la receta: tempo, stance, loadPosition, direction, ID base con espacios. No hay clasificación por texto libre ni nombres que concedan seguridad.

Resolver v1 admite patrones squat/hinge/lunge/push/pull/core/carry de la taxonomía existente. Tempo se admite en bases dinámicas controladas; sus cuatro valores son finitos, 0–60 s y suma positiva, y deben coincidir con prescription. Stance se limita a squat/hinge o plank; reverse a lunge/sled_drag/sled_pull; contralateral a lunge cuya base requiere solamente mancuerna. El nombre expresa la operación verificable; no se añaden cientos de combinaciones al catálogo.

Extensión exacta del contrato:

```json
{"version":1,"resolver":"canonical_modifiers_v1","referenceCompatibility":"NONE","unknownSafety":"REJECT"}
```

`ResolvedMovement` conserva `source`, `identity`, `canonicalMovementId`, `canonicalFamily`, `displayName`, `descriptor: Movimiento`, `restrictionProperties`, `geometryChanged`, `referenceCompatibility`, `modifiers` y `resolverVersion: 1`. Para variantes, canonicalMovementId y referenceCompatibility son null. El descriptor incluye la taxonomía y equipo canónicos; cambios geométricos elevan demanda baja a media y no reducen demanda alta.

La identidad es `generated:` + SHA-256 de la receta normalizada `{resolver:1,family,modifiers}`. El ID local y las mayúsculas no cambian su identidad. Un ID local no puede cambiar de receta entre bloques; dos IDs locales no permiten duplicar el mismo ejercicio dentro de un bloque.

## F. References

Las variantes v1 admiten únicamente intensidad subjetiva RPE/RIR. `%1RM`, HR y pace se rechazan con `GENERATED_REFERENCE_NOT_AUTHORIZED`, aunque exista un RM de la familia. Suficiencia y opciones generadas tampoco ofrecen referencias numéricas a variantes. Campos kg/carga/referenceAnchor fuera del schema son inválidos.

Para canónicos sigue vigente la referencia exacta: el test sintético back_squat 1RM 150 × 70% produce 105 kg. No se convierte 3×5 a RM, no se estima e1RM ni se toma un ratio entre ejercicios. Aceptar referencias de variantes exigiría una compatibilidad explícita del servidor en otra versión; una familia compartida nunca basta.

## G. Restrictions

La receta conserva `avoid_with` de su base y las exclusiones exactas de esa base. No puede renombrar un movimiento excluido. Impacto medio/alto y carga axial alta conservan las incompatibilidades existentes.

Cambiar stance/direction/loadPosition cambia geometría: las propiedades biomecánicas negativas de la base dejan de ser evidencia suficiente y pasan a UNKNOWN; se conservan las positivas. Una flag activa con propiedad UNKNOWN rechaza. Además, una variante con geometría cambiada y cualquier área corporal activa rechaza por falta de resolución específica. Tempo sin cambio geométrico reutiliza únicamente la evidencia explícita existente; no crea una tabla nueva de seguridad clínica.

Ejemplos probados: flexión profunda prohibida rechaza tempo back squat; wide plank queda UNKNOWN; rodilla activa rechaza la variante de lunge; tempo push-up puede conservar la evidencia explícita de su base ante esa flag. Esto no diagnostica recuperación ni convierte ausencia de una flag en seguridad médica demostrada.

Material y habilidad pasan por el mismo adaptador de suficiencia y sus preguntas/fallbacks existentes. Backward sled drag sin sled se rechaza. Un desconocimiento no se resuelve cambiando a RPE, porque RPE solo elimina la necesidad de una referencia numérica, no la de material o habilidad.

## H. Exposure

Solo las sesiones con variantes añaden `structuredPrescription.movementResolution = {version:1, descriptors:[...]}`. Cada descriptor enlaza `localMovementId` y la resolución. `proposal.blocks` conserva receta, tempo, lateralidad, cantidades, intensidad y descansos. El recibo firma contrato/propuesta y la verificación vuelve a derivar la salida, detectando también manipulación de metadata renderizada.

El adaptador de carga conserva receta y patrón; el reporte estructurado añade identidad exacta, familia, patrón, disciplina, nombre y modificadores, además de los subtotales conocidos y cantidades UNKNOWN. Una variante no se cuenta como ejecución exacta de su base. La comparación semanal usa identidad derivada incluso si cambia el ID local.

`planned` y `actual` siguen separados. Marcar completada una sesión no convierte su dosis prescrita en dosis ejecutada. El resumen histórico existente ya conserva los bloques estructurados y distingue cantidades de ejecución no inferidas; ahora esos bloques incluyen la receta. Los históricos textuales anteriores mantienen sus limitaciones y no se recatalogan retroactivamente como variantes.

## I. Backward compatibility

Contratos v1/v2 y v3 sin extensión siguen con el camino canónico. No autorizan variantes. Las sesiones solo canónicas no reciben el campo nuevo de resolución y conservan nombres/representación previos. El test recorre todos los IDs del catálogo y verifica identidad, referencia y metadata intactas.

No hay cambio de esquema de almacenamiento: la receta forma parte del JSON estructurado que ya persiste. No se crea una tabla ni se requiere migración. Recibos históricos canónicos siguen revalidándose con sus contratos originales. Nuevas recetas exigen el resolver v1: futuras revisiones deben conservar esa semántica versionada, no reinterpretar recibos antiguos bajo reglas distintas.

## J. Tests

29 casos específicos pasan en `lib/sports/movementVariants.test.mjs`. Cubren catálogo intacto, lunge generativo, isométrico, metadata autodeclarada, semántica desconocida, nombres engañosos, autorización versionada, RM exacto, equipo/habilidad, restricciones positivas y UNKNOWN, intent/tempo/tiempo, identidad, exposición planned/actual, retry sin sustitución, emisión real con DB falsa, recibos manipulados, freshness de equipo, duplicados semanales y diagnósticos sin eco de texto arbitrario rechazado.

Comandos PowerShell reproducibles desde la raíz:

```powershell
node --test lib/sports/movementVariants.test.mjs
$testFiles = @(rg --files -g '*.test.mjs' -g '*.test.js')
node --test --test-concurrency=2 @testFiles
node node_modules/typescript/bin/tsc --noEmit --incremental false
git -c core.safecrlf=false diff --check
```

Resultado final: **2277/2277 pruebas de la suite completa**, sin fallos, cancelaciones ni skips (219,793 s); **29/29 casos específicos**; TypeScript `--noEmit --incremental false` termina con código 0; `git diff --check` sin errores. La suite conserva los 2248 casos anteriores y añade 29. Los tests de transporte usan proveedor simulado y DB falsa: no demuestran selección deportiva de un LLM real ni guardado en producción.

## K. Known limitations

- Resolver conservador v1: requiere base canónica y operaciones reconocidas. No comprende cualquier ejercicio descrito en lenguaje natural. Copenhagen plank sin base/semántica compatible queda UNRESOLVED; wide plank cronometrado sí está cubierto.
- No se generan variantes olímpicas, de carrera, salto o locomoción invertida en v1. Sus canónicos siguen disponibles cuando las autoridades actuales los permiten. Añadir una especialidad/operación requiere conocimiento explícito en su adaptador, no duplicar motores compartidos.
- La factibilidad inicial aún exige un pool canónico no vacío. No se usa generación libre para rescatar un intent sin bases factibles. Las operaciones actuales mantienen o endurecen requisitos de su base.
- La biomecánica modelada es parcial. Geometrías con restricción activa pueden rechazarse aunque un profesional pudiera evaluarlas individualmente. No se modelan ángulo exacto, ROM, apoyo adicional, dolor ni tolerancia clínica nuevos.
- La gramática de nombres v1 usa términos operativos e IDs base con espacios; no es un traductor multilingüe ni un clasificador semántico libre.
- Duración en isométricos está soportada; durationSeconds por lado no se introduce. `perSide` sigue reservado a repeticiones en el contrato existente.
- No hay referencias numéricas en variantes ni carga externa inferida. Las estimaciones temporales conservan las limitaciones del Paso 2.
- La exposición histórica textual no aporta identidad exacta de variantes antiguas ni cantidades ejecutadas faltantes. No se infiere PLANNED → EXECUTED.
- No se ha ejecutado aceptación con AIRAN/FORGE12 ni desplegado el cambio.

## L. Acceptance procedure — ejecución posterior

En el entorno local de prueba ya configurado y autorizado para los datos de aceptación:

```powershell
$env:FORGE_SESSION_COACHING_DIAGNOSTICS = '1'
$env:FORGE_WEEKLY_COACHING_DIAGNOSTICS = '1'
npm run dev
```

1. Entrar por el flujo normal de AIRAN. Verificar objetivo CrossFit, restricción canónica de rodilla aún activa, MRI pendiente, equipo y capacidades reales. Mantener semana/pasado/completadas y propiedad externa existentes.
2. Comprobar el contexto registrado: back squat 110 kg 3×5 tolerado; high-hang snatch pull con molestia; power snatch hasta 60 kg tolerado; gimnasia fácil y engine Bike/Ski realizados. Esos hechos son contexto de exposición/respuesta, no un 1RM ni una revocación de la restricción. Si faltan en la fuente canónica, deben seguir faltando; no fabricarlos con SQL.
3. Usar generación semanal/sesión normal en el entorno de aceptación, respetando confirmaciones y límites actuales. Esa acción puede guardar: este documento no la ha ejecutado. No reutilizar tokens/recibos ni alterar permisos para forzar una propuesta.
4. Registrar los eventos opt-in `SESSION_MOVEMENT_COACH_INPUT`, `SESSION_MOVEMENT_PROPOSAL`, `MOVEMENT_RESOLUTION`, `MOVEMENT_FEASIBILITY` (rechazo) y `SESSION_MOVEMENT_ADMISSION` (admisión). Enlazar con `SESSION_COACH_DECISION`, `SESSION_AUTHORITY_RESOLUTION` y `BUILDER_OUTPUT`. No exportar prompts, secretos, perfiles, cookies, tokens, receipts ni historial libre.
5. Contrastar propuesta con descriptor y restricciones. `power_snatch` canónico es una elección posible solo si la autoridad actual lo admite. Una variante útil debe tener resolución verificable; UNKNOWN rechaza y puede provocar segundo intento. No exigir que el Coach utilice una variante: escoger un canónico adecuado también satisface la aceptación.
6. Comprobar dosis exacta propuesta/admitida/guardada, material, habilidad, tiempo y scope. Sin 1RM compatible no debe aparecer carga inventada. Verificar que cambiar datos antes de guardar invalida freshness por el flujo existente y que pasado/completadas permanecen protegidos.
7. Inspeccionar structuredPrescription: receta, descriptor, identidad/familia/patrón y dosis. Confirmar exposición prescrita separada de cantidades realmente reportadas. Revisar el motivo breve cualitativamente; una explicación no concede validez.
8. Para FORGE12, repetir la aceptación de Paso 2: Carrera conserva elección y dosis Coach, referencias C2 y evidencia B3. Este paso no amplía artificialmente la compatibilidad de variantes de carrera.
9. Detener el servidor y desactivar diagnósticos antes del siguiente arranque:

```powershell
Remove-Item Env:FORGE_SESSION_COACHING_DIAGNOSTICS
Remove-Item Env:FORGE_WEEKLY_COACHING_DIAGNOSTICS
```

Los eventos nuevos reutilizan la bandera existente y son observacionales. No se añadió un framework de logging ni una fuente de autoridad basada en logs.

```text
PASO 3:
DESIGNED / CONNECTED / VERIFIED LOCALLY
```
