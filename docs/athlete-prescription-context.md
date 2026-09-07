# Fase 3A — Canonical Athlete Prescription Context

## Alcance

`loadAthletePrescriptionContext(db, userCodigo, { asOfDate, recovery?, readiness? })`
es la entrada única de lectura. `AthletePrescriptionContext` exporta su tipo completo.
`projectAthletePrescriptionProfile` es su proyección pura, independiente de DB.
No hay escritura, migración, endpoint nuevo, prompt nuevo ni cambio de selección.
Analyzer, Planner, Builder, Coach y Evolution mantienen su comportamiento actual.
El consumidor servidor debe autenticar al atleta como ya exige su flujo: el reader no concede ownership.

## Fuentes y procedencia

Una lectura de perfil selecciona modo, categoría, especialidad, perfil, objetivo_principal,
test_atleta, marcas_especificas, historial_marcas, datos_entrenamiento,
athlete_development, ciclo_actual, debilidades y workout_history.
Cada evidencia proyectada conserva value, source (ruta exacta), raw, updatedAt cuando
se conoce, y authority (declarado o registrado; no es permiso de prescripción).
Las fechas de medición se conservan por separado de las fechas de actualización.
No se usa updated_at global del usuario para fechar cada marca.

Se reutilizan prepareRecoveryContext, getCanonicalRestrictions y buildExposureReport.
Las lecturas de planes están acotadas a cuatro filas semanales; modificaciones a treinta eventos.
Errores de lectura abortan: una DB inaccesible no significa ausencia de restricciones.
No hay caché global. Recovery previamente preparado se reutiliza solo para mismo atleta y fecha.
Los readers canónicos pueden realizar sus propias consultas internas: no se duplican en cada consumidor.

## Objetivos y conflictos

goals.primary conserva candidatos de objetivo_principal y las tres variantes de perfil.
Solo valores textuales equivalentes tras normalización superficial se resuelven juntos.
No se infiere equivalencia semántica con un LLM. No se elige el mayor, el último array
ni una fuente arbitraria para resolver diferencias. Diferencias conservan resolved=null,
candidates completos y reason=conflict. Ausencia produce reason=unknown.
El primer candidato equivalente representa el valor resuelto, sin eliminar las otras procedencias.
goals.secondary expone objetivos secundarios declarados; disciplineSpecific conserva
objetivos de distancia, skill, físico, programación, grupo, actividad y prioridad.
competition conserva declaraciones y objeto de objetivo con fecha/tipo de competición.
No inventa fechas a partir de “en seis semanas”.

## Tiempo

perfil.duracion, duracion_sesion, tiempo_sesion y duracion_clase son variantes aceptadas.
La proyección pura también reconoce duracion_sesion/duracion_clase en un objeto legacy
de primer nivel; la query no presupone columnas SQL con esos nombres.
45 min significa máximo 45; 60–75 min conserva mínimo/máximo;
más de 90 conserva mínimo 90, openEnded=true, lowerExclusive=true y máximo null.
Horas y minutos combinados se normalizan. Datos ilegibles se conservan en unparsed.
No se sustituye el tiempo declarado por la duración típica del catálogo.

## Fuerza

Referencias de test, marcas específicas, datos e historial conservan movementId,
valueKg, referenceType, repsIfKnown, dateIfKnown, source y raw.
Tipos: 1rm, nrm, unknown_rm, pr, non_comparable. Sin e1RM y sin porcentajes a kg.
La semántica explícita de la pregunta de test y las claves *_1rm acreditan 1RM;
una marca específica back_squat sin RM explícito es unknown_rm.
Se aceptan NRM expresos y metadatos repsIfKnown; afirmaciones contradictorias
no producen referencia utilizable. Un PR por sí solo no acredita 1RM.
Números en campos deportivos de peso usan la unidad declarada por sus formularios;
un número desnudo del historial no acredita kg. No se convierten libras.
La fecha o un valor mayor no autorizan a reemplazar referencias diferentes.
byMovement conserva conflictos entre tipos/valores/fechas distintos. Una referencia
non_comparable nunca aparece como resolved utilizable.

Aliases son exactos y sus destinos se validan contra MOVEMENT_LIBRARY. No se confunden
clean con power_clean, ni press militar con push_press. No se amplía el catálogo.
Los benchmarks no comparables quedan conservados, sin promoverlos a máximos.

## Running

Se exponen FCmax, FC reposo, umbral FC, Z1–Z5, FC suave, ritmos suave/umbral,
5K, 10K, VO2max y km semanales cuando el valor/unidad es inequívoco.
Paces se normalizan a segundos/km y tiempos de carrera a segundos; números desnudos
de tiempo/ritmo quedan desconocidos. Historial 5K/10K se incorpora como running.
Unidades incompatibles y formatos no reconocidos quedan en unparsed.
No se aplica 220-edad, no se derivan zonas y no se mezclan FC declarada y RHR canónica observada.

## Development, bloque, fisiología y restricciones

athlete_development conserva su estado original (no filtra ni envejece debilidades),
id si existe, área, indicador, nombre, diagnóstico, progreso, prioridad, confianza,
evidencias, detección, revisión, acción y beneficio. Fuentes legacy quedan separadas.
Mapping por ID/alias exacto o indicador inequívoco; patrón desde biblioteca o campo
estructurado exacto. Indicador “squat” puede resolver patrón sin inventar movimiento.
Disciplina solo si está explícita y reconocida: la pertenencia de un movimiento al catálogo
box no prueba la disciplina en que se detectó una debilidad. Conflictos de patrón quedan desconocidos.
No se fabrican IDs a partir del nombre visible.

ciclo_actual conserva bloque/objetivo textual y normaliza enteros de semana/total.
No convierte el objetivo en adaptación ni valida/transiciona la periodización.

physiology incluye RecoveryContext canónico completo: señales con source/ingestedAt,
completeness, missingSignals, HRV, RHR, sueño score/duración, tendencias y contexto subjetivo.
readiness transporta ReadinessResultado ya calculado si el caller lo proporciona con
identidad/fecha correctas. Sin ese resultado: unknown/not_prepared_no_recalculation.
No se llama al motor de scoring ni se inventa un score. El checkin subjetivo no se
confunde con el score calculado. Restricciones provienen solo de getCanonicalRestrictions.
perfil.lesiones permanece en declaredLimitations, sin crear nuevas restricciones.

## History y límites temporales

Completadas provienen de weekly_plan; se expone session_id cuando existe,
descripción real, modificación y motivo. Fecha se deriva solo de lunes válido+día válido.
Exposición reutiliza matching textual del engine; fechas desconocidas no entran.
Frecuencia es conteo de registros workout_history con fecha válida durante siete días
civiles inclusivos. No es volumen ni número deduplicado de días; no activa el safety net.
Los eventos de modificación exponen tipo, motivo y movimiento afectado disponibles.
Estos summaries no crean otro historial persistido.

asOfDate acota las observaciones y las consultas históricas; NO reconstruye un snapshot
histórico del perfil ni de las restricciones. Estas fuentes conservan su semántica actual.
Los límites last_four_weekly_rows, matching textual, last_30_events y cobertura parcial
de modificaciones están presentes en el objeto; ausencia de filas no prueba cero actividad.

## Auditoría de consumidores

| Consumidor | Lee hoy | Sustitución preparada, pendiente |
| --- | --- | --- |
| Analyzer | objetivo_principal, ciclo, desarrollo, exposición, restricciones y block_outcomes | goals, cycle, development, history.exposure y restrictions; añadir contexto de dosis en su fase |
| Weekly Planner | scope, disponibilidad, frecuencia y opciones factibles | Recibir referencias desde este contexto en 3B; no sustituir authority/availability |
| Session Builder | perfil, marcas_especificas, datos_entrenamiento, ciclo y desarrollo como contexto | sessionTimeBudget, strength, running, goals; mantener contratos y receipts |
| Coach | Perfil, Knowledge, memoria y recovery | Proyección compartida de objetivos/referencias; reutilizar recovery preparado |
| Evolution | Desarrollo, test, marcas y fisiología | Referencias con procedencia, estado y conflictos sin borrar fuentes originales |

No se conectó ningún prompt: añadir información al LLM ya puede cambiar su respuesta.
La API común está disponible para integrar explícitamente 3B/3C sin expandir 3A.

## Fixture y verificación

`athlete-prescription-context.fixture.json` es la salida COMPLETA del reader real
con DB en memoria: Coach híbrido, mejorar squat+10K, 45 min, test back squat 140kg,
Z2 130–145, FCmax 190, debilidad squat, acumulación 2/4. No son datos personales.
Fisiología ausente permanece missing; readiness no preparado permanece unknown;
disciplina de debilidad sin declaración permanece null. No se crean referencias ausentes.

Tests cubren objetivos compatibles/conflictivos, presupuestos cerrados/rango/abiertos,
1RM/NRM/unknown/PR, aliases, unidades, contradicciones, running, desarrollo ambiguo,
procedencia, aislamiento/mutación, errores DB y reutilización de recovery/readiness.
Validación final: 28 tests nuevos del contexto; suite completa de 967 tests, todos pasan.
TypeScript: `node node_modules/typescript/bin/tsc --noEmit --incremental false`, sin errores.
`git diff --check` se comprueba sobre los archivos preparados para el commit.
Sin migraciones, cambios en contratos v1/v2, receipts, CAS, sesiones, ownership o disponibilidad.
Sin push.
