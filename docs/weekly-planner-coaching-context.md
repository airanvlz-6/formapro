# Weekly Planner: contexto factual de coaching

## Auditoría y frontera reutilizada

El recorrido vigente es `beginWeeklyGeneration` → Analyzer → `loadWeeklyPlanningContext`
(que carga `loadAthletePrescriptionContext` para la estrategia v1 y construye la estrategia
canónica) → `buildAllowedWeeklyPlanContract` → `planBoundedWeek` → `composeBoundedWeek`
→ `weeklyPlannerPrompt`. La respuesta del Analyzer aporta la propuesta estratégica;
no constituye evidencia de ejecución.

La pérdida concreta estaba en `planBoundedWeek`: entregaba únicamente
`prepared.contract` a `composeBoundedWeek`. Además, la preparación descartaba el
AthletePrescriptionContext completo tras proyectar las autoridades del contrato.

Se reutilizan AthletePrescriptionContext, WeeklyContractInput, las proyecciones de
fisiología/restricciones/referencias, las vistas canónicas de ejecución e historia,
los catálogos deportivos, D3 y la orientación de evidence policy ya preparada.
El nuevo objeto es una proyección efímera para el prompt, no otra fuente de verdad.

## Arquitectura resultante

```text
Athlete / history / physiology / restrictions / references
                       ↓
loadWeeklyPlanningContext + estrategia canónica
                       ↓
prepareAllowedWeeklyPlanContract
        ├── AllowedWeeklyPlanContract (permisos, identidad, cobertura)
        └── WeeklyCoachingContext (hechos y conocimiento descriptivo)
                       ↓
planBoundedWeek → composeBoundedWeek → weeklyPlannerPrompt
                       ↓
validateWeeklySelection → calendario y receipt firmado
                       ↓
Builder → whole-week → admisión y persistencia CAS existentes
```

El contrato conserva su esquema y digest. El contexto no se incorpora a firmas,
receipts, persistencia ni entradas de autorización. La validación continúa
rechazando IDs inventados aunque aparezcan en el contexto descriptivo.

## Qué recibe el Planner

| Área | Datos y procedencia |
| --- | --- |
| Pasado | Hasta 14 resúmenes de días prescritos/ejecutados; modificación y motivo; frecuencia real previamente proyectada; exposición existente; hasta 10 ejecuciones estructuradas con cantidades e intensidad observadas; resúmenes canónicos de 7/28 días. |
| Respuesta previa | Hasta dos `block_outcomes`, ocho eventos de modificación y ocho notas pendientes/consideradas, con campos seleccionados, origen y fechas disponibles. |
| Presente | Readiness ya preparado o unknown; fisiología canónica con fechas, frescura y estado de cada señal; fatiga subjetiva, restricciones, señales de capacidades/equipamiento, tiempo y referencias con procedencia; actividades externas y hasta ocho registros recientes. |
| Futuro | Objetivo del ciclo, debilidades activas y disponibilidad. Objetivo, fase/bloque, adaptaciones, cobertura, evento y continuidad D3 se referencian en el contrato ya entregado para evitar duplicarlos. Incluye prescripciones futuras protegidas. |
| Opciones | Enlaces desde los IDs realmente publicados a conocimiento deduplicado: ejemplos de movimientos, clases de fatiga/impacto, recuperación del catálogo, formatos e interferencia interna; dominio de intensidad del catálogo y prescripción fija únicamente cuando ya existe en la proyección de capacidades. |

Los campos de historia son descriptivos: `PLANNED_ONLY` tiene `execution: null`.
Incluso para EXECUTED, una duración prescrita sigue dentro de `prescription`;
las cantidades realizadas proceden de las autoridades de ejecución existentes.
Las fuentes pueden solaparse: el prompt prohíbe sumarlas como actividades distintas.
La exposición textual conserva explícitamente sus limitaciones.

Se añaden dos lecturas acotadas por atleta, sobre tablas existentes:
`block_outcomes` y `athlete_coaching_notes`. Una lectura fallida se representa como
`unavailable`, no como prueba de que no hubo incidencias. El resto reutiliza datos
ya cargados, incluido el snapshot para distinguir historia protegida.

## Qué se omite y límites

- No se envían planes históricos completos, bibliotecas completas ni filas crudas de base de datos.
- Notas y textos seleccionados se limitan a 400 caracteres; las colecciones acotadas indican total y truncamiento.
- No se infieren HR, pace, kilos, RPE, dosis realizada, adaptación conseguida ni readiness ausente.
- El caller semanal actual no prepara readiness: se informa `unknown`. Si el contexto canónico ya lo contiene, se copia sin recalcularlo.
- Los costes del catálogo describen posibilidades; no garantizan la sesión final del Builder ni establecen mínimos universales de recuperación.
- No se trasladan validadores de whole-week, no se materializan sesiones y no se crean puntuaciones ni comparaciones de semanas.
- No se exige ni persiste razonamiento interno ni una explicación adicional en la salida.

La proyección común sirve a Carrera y Box usando los mismos campos y catálogos.
Las referencias de running y sus políticas conservan su procedencia específica;
no se convierten en una regla universal para otras disciplinas.

## Cambio conceptual del prompt y REST

Antes: seleccionar opciones del contrato y satisfacer el esquema/las restricciones.

Ahora: diseñar una distribución coherente conectando pasado, presente, objetivo
y conocimiento deportivo; considerar carga, recuperación, interferencia,
especificidad, continuidad y progresión dentro de las opciones autorizadas.
Disponibilidad permite entrenar; no obliga. Unknown no significa recuperado.
El contrato determina permisos, no preferencias. Se mantiene idéntico el esquema
JSON de siete selecciones y el límite de dos intentos.

`sessionAuthority.admitSessionContent` genera los descansos nuevos con
`por_que: "Descanso"` y `descripcion: "Día sin entrenamiento programado."`.
La presentación consume ese contenido admitido. Los supervivientes históricos
continúan conservándose exactamente. No se añade una regla sobre descansos.

## Verificación

`weeklyCoachingContext.test.mjs` cubre A–F: hechos y preparación reutilizada,
ausencia explícita, PLANNED_ONLY, conocimiento de métodos distintos obtenido de
catálogos reales, REST neutral y rechazo de opciones no autorizadas. También
comprueba Box, límites de notas y errores de lecturas auxiliares.

G amplía `pastPlannedPreservation.test.mjs`: el Planner controlado inspecciona el
contexto recibido antes de responder. El mismo test recorre generación, snapshot,
selección, receipt, Builder real, whole-week, admisión y persistencia CAS en memoria.
Verifica miércoles íntegro, no ejecutado, sin títulos reales ni exposición/dosis B3;
jueves sin registrar; viernes como único Builder target; sábado REST;
sin WEEK_EXACT_DUPLICATE ni WEEK_REPAIR_FAILED.

La comprobación demuestra transporte de evidencia e integridad del flujo. No mide
la calidad de una generación remota ni prueba que una distribución sea óptima.

Medición offline del fixture `runningExecutionReuseFixture` por defecto:
19.938 caracteres de contexto y 11.905 de contrato; nueve opciones enlazadas a
solo tres entradas de conocimiento. Son caracteres JSON, no una estimación de
tokens ni una medida de una cuenta productiva.

Resultado de validación local (2026-09-11):

- Focalizados: 122/122, cero fallos (contexto, contrato semanal, FORGE12 y binding firmado).
- Suite completa: 2.228/2.228, cero fallos, cancelados u omitidos; 98 archivos `.test.mjs`, concurrencia 4.
- `npx tsc --noEmit`: código de salida 0.
- `git diff --check`: código de salida 0.
- Sin LLM remoto, SQL, modificaciones productivas, push ni deployment.
