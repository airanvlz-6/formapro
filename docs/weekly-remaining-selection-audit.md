# Auditoría de NO_NEW_EXECUTABLE_PRESCRIPTION

Base: `154388ce59be1a201073d8e0307d5c1b3bf83c3b`. Instrumentación temporal de observabilidad, sin fixes funcionales.

## Alcance de la evidencia

Producción demuestra que la estrategia crossfit fue admitida, la decisión temporal se resolvió a false y el preflight rechazó antes del Analyzer. No aporta el contexto normalizado de restricciones, fase, métodos ni actividades externas de ese último intento. No es posible atribuirle las restricciones de un fixture artificial.

El snapshot aportado anteriormente tiene L carrera, M box, X descanso, J box, V carrera, S box, D descanso; ninguna entrada está explícitamente completada. Fecha objetivo 2026-09-07, hoy 2026-09-08. Disponibilidad de la semana objetivo explícitamente confirmada por el usuario en este mismo flujo, inmediatamente antes del preflight: Carrera L/X/D y Box M/J/V/S.

## 1–3. Calendario efectivo y protección

Reproducción usando ese snapshot exacto, el adaptador real y fuentes gestionadas Forge sin actividades externas adicionales:

| Día | Fecha | Estado anterior | Protegido | Razón | Disciplina disponible | Opciones sin restricciones, fase deload controlada |
|---|---|---|---|---|---|---|
| X | 2026-09-09 | REST | false | NONE | carrera | REST, RECOVERY |
| J | 2026-09-10 | TRAIN | false | NONE | box | REST, TRAIN |
| V | 2026-09-11 | TRAIN | false | NONE | box | REST, TRAIN |
| S | 2026-09-12 | TRAIN | false | NONE | box | REST, TRAIN |
| D | 2026-09-13 | REST | false | NONE | carrera | REST, RECOVERY |

L y M quedan UNAVAILABLE por estar fuera del intervalo efectivo; no aportan ejecutables preservadas. El primer día del intervalo y de disponibilidad gestionada es X. El primer día con prescripción factible depende de feasibility: X en el control sin restricciones; ninguno en el control que excluye todos los movimientos.

La protección de REST antiguo no reproduce el fallo bajo estas entradas. Una actividad externa actual puede fijar un día: falta esa entrada real del último intento para excluirla en producción.

## 4–6. Métodos, filtros y errores

En el control deload, recuperacion_activa tiene running_recovery y tecnica tiene box_technique. Ambos sobreviven al ámbito gestionado y a la estrategia canónica. running_recovery llega a feasibility en X/D; box_technique en J/V/S. Los patrones son run y squat, respectivamente.

El código transforma las adaptaciones según la fase antes de seleccionar métodos. No hay un filtro independiente de fase sobre métodos: el campo candidateMethodsAfterPhase identifica los métodos de la estrategia canónica, que también incorpora adaptación y rol. El informe no lo presenta como una etapa independiente inexistente.

Control sin restricciones: ambos métodos factibles. Control con exclusión explícita de todos los IDs del catálogo: cinco intentos descartados con MOVEMENT_POOL_EMPTY. Al vaciar únicamente restrictions/reassessments/areas del mismo input normalizado, ambos vuelven a ser factibles. No se cambia estado de salud, calendario, estrategia, contextos de exposición ni estructuras. En ese control solo restrictions contenía exclusiones; las otras dos listas ya estaban vacías.

Los códigos de producción siguen sin observarse. La traza permite ver MOVEMENT_POOL_EMPTY, INTENT_POOL_EMPTY, STRUCTURE_POOL_EMPTY y STRUCTURE_SPACE_UNSATISFIABLE por intento, sin texto libre.

## 7–9. DP, alternativas y scoring

coverageFeasible es una prueba booleana de existencia. Mantiene estados count/rest/coverage/fresh, sin puntuaciones, recompensas, penalizaciones, desempates ni backpointers. No devuelve una selección ganadora.

La rama de regeneración comprueba coverageFeasible(contract, []) antes de bindStrategicCoverage. Exige al menos una ejecutable nueva y respeta el máximo semanal. Si falla devuelve NO_FEASIBLE_REMAINING_SELECTION bajo NO_NEW_EXECUTABLE_PRESCRIPTION. No han ocurrido selección del Planner ni construcción del Builder.

REST se enumera primero pero se exploran todas las firmas; el orden no favorece una solución. No existe coste cero de REST frente a otro coste: no hay función de coste. La cobertura se incorpora posteriormente como restricciones admitidas mediante comprobaciones de existencia, no como reward. All-REST nunca supera la regeneración, aunque la historia protegida contenga TRAIN.

La instrumentación registra selectedStatesByDay, newExecutableDays y builderTargetCount como null, no como cero inventado. availableNewExecutableDays cuenta días con opciones nuevas factibles; preservedExecutableDays cuenta las opciones fijas ejecutables.

candidateSelectionCount cuenta combinaciones de IDs antes de límites; calendarValidSelectionCount aplica mínimo/máximo/REST sin exigir trabajo nuevo; validSelectionCount añade esa exigencia. Son conteos diagnósticos exactos en cadenas decimales, no números de estados internos de la DP. Se calculan antes de vincular cobertura estratégica.

También se reproduce un rechazo con métodos factibles si una sesión protegida ya ocupa un máximo de una ejecutable. Esto demuestra por qué el código de rechazo por sí solo no prueba un error de feasibility. No es el estado del snapshot aportado, que no tiene completadas.

## 10. Ablaciones E1–E6

E1 real y sus E2–E6 estrictamente emparejadas quedan pendientes del contexto seguro del último run. No se ha reconstruido ni inventado. Lo siguiente son controles causales ejecutados con el mismo snapshot y contexto deload artificial explícito:

| Simulación | Métodos candidatos / factibles | Combinaciones válidas con trabajo nuevo | Selección real / trabajo nuevo |
|---|---|---:|---|
| Control de exclusiones completas | 2 / 0 | 0 | ninguna / no seleccionado |
| E2 control: mismas entradas normalizadas, restricciones vacías | 2 / 2 | 31 de 32 candidatas | no se invoca Planner |
| E3 sobre control bloqueado: quitar REST | 2 / 0 | 0 | ninguna |
| E4 sobre control bloqueado: penalizar REST | 2 / 0 | 0 | ninguna; el coste no crea opciones |
| E5 sobre control bloqueado: forzar box_technique | 2 / 0 | 0 | método no factible; no se fuerza |
| E6 sobre control bloqueado: forzar running_recovery | 2 / 0 | 0 | método no factible; no se fuerza |

Controles positivos adicionales, sobre E2:

- E3 elimina REST en X/J/V/S/D: queda una combinación, RECOVERY/TRAIN/TRAIN/TRAIN/RECOVERY, cinco nuevas ejecutables.
- E4 asigna coste artificial 10000 por REST no protegido: las 31 combinaciones siguen siendo admisibles; el óptimo artificial tiene esos mismos cinco estados. Esto solo existe en el test, no en la DP real.
- E5 obliga box_technique en el primer día donde ya es factible, J: 16 combinaciones; una a cinco ejecutables nuevas. No se selecciona una semana concreta.
- E6 obliga running_recovery en el primer día donde ya es factible, X: 16 combinaciones; una a cinco ejecutables nuevas. No se selecciona una semana concreta.

Ninguna simulación altera decisiones, catálogos ni métodos de producción.

## 11–13. Clasificación, causa mínima y propuesta

- A, CALENDAR DOMAIN BUG: no reproducido con el snapshot y las fuentes gestionadas descritas. Pendiente contrastar actividades externas y contexto del último run.
- B, FEASIBILITY BUG / INPUT EFFECT: demostrado como efecto de inputs en el control de exclusiones, no atribuido al usuario real. Faltan sus intentos descartados para clasificar producción.
- C, DP OBJECTIVE BUG: descartado para esta ruta; no existe función objetivo ni selección en el preflight.

Causa mínima demostrable desde el flujo actual: la comprobación de existencia no encuentra una combinación que respete el contrato e incluya una ejecutable nueva. Los logs previos no explican qué eliminó esa posibilidad porque el diagnóstico antiguo solo estaba en la rama posterior NO_VALID_EXECUTABLE_REST_ARRANGEMENT.

Propuesta mínima actual: conservar esta instrumentación para observar los mismos inputs y opciones justo antes de coverageFeasible. Un fix funcional sería prematuro. Si los métodos desaparecen, usar la etapa y códigos reales para reparar ese input o filtro; si quedan opciones, comprobar techo y dominios fijos. No proponer una penalización REST: no resolvería este mecanismo.

## Instrumentación y privacidad

WEEKLY_REMAINING_SELECTION_DIAGNOSTIC se emite en la frontera de evaluación de la DP de regeneración, también cuando resulta viable. No agrega lecturas de BD ni reevalúa feasibility. Reutiliza los rechazos ya capturados y las opciones exactas del contrato. No entra al digest, receipt, respuesta ni selección del Planner.

La proyección utiliza campos explícitos, fechas válidas, códigos, enums e IDs de catálogos. No serializa snapshot, títulos, descripción, usuario, tokens ni prompts. El UUID del run se valida. La proyección estructurada de restricciones reutiliza la allowlist diagnóstica existente. Los fallos del logger se contienen.

availabilityConfirmed significa que el digest recibido coincide con las fuentes leídas por el mismo adaptador. No prueba por sí solo quién confirmó ni cuándo; la procedencia temporal de esa confirmación corresponde al flujo existente y a la evidencia del usuario. No se confunde availabilityStatus=VALID con confirmación.

## Preparación para despliegue temporal

Se incluye este informe porque documenta la semántica real de la DP, la frontera de observación y los límites de las reproducciones. Contiene únicamente fechas, estados e IDs estructurados; no contiene identificadores personales, credenciales, rutas absolutas ni contenido clínico o libre del atleta.

La instrumentación se ejecuta inmediatamente antes de coverageFeasible, después de enumerar opciones y validar el calendario fijo. Se emite tanto en casos viables como rechazados; no se emite si una validación anterior impide alcanzar esa frontera. No vuelve a evaluar feasibility ni agrega consultas. El orden de las decisiones permanece intacto.

La allowlist incluye UUID de run validado, fechas, decisión temporal, calendario de días canónicos, disciplinas permitidas, estados y motivos de protección enumerados, IDs de métodos/adaptaciones/patrones del catálogo, códigos conocidos de feasibility, conteos y metadatos constantes de la etapa. Restricciones usa exclusivamente la proyección estructurada preexistente. Los campos de selección aún inexistente son null.

Se excluyen explícitamente usuario/codigo, email, objetivo libre, texto clínico o de restricciones, títulos, descripciones, prompts, tokens, snapshot completo, receipts y fisiología cruda. Los días pendientes se filtran mediante calendarDays. Un fallo de preparación de metadatos diagnósticos, proyección, serialización o logger no decide la admisión.

D1/D4 comprueban emisión viable y ambos métodos factibles; D2/D3 comprueban MOVEMENT_POOL_EMPTY y el rechazo estructurado. D5 compara diagnóstico desactivado, activo y fallos de logger/serialización/proyección, conservando resultado completo, digest, inputs y cinco llamadas de feasibility tanto en el caso viable como en el rechazado. D6 inyecta campos prohibidos y valores desconocidos en todas las proyecciones y verifica que no se serializan.

No se ha desplegado esta instrumentación ni obtenido nuevos logs de producción. La clasificación causal de producción continúa abierta. El commit de instrumentación no incluye migrations, cambios de autoridad ni push.

Validación para el commit: 131 tests específicos y 1404 tests globales aprobados; TypeScript y diff-check aprobados. Los helpers diagnósticos y el test no añaden deuda de lint. Los dos archivos de autoridad conservan sus siete errores previos (dos en allowedWeeklyPlanContract y cinco en prepareAllowedWeeklyPlanContract). Deuda global comparada con la base: 739 errores y 105 advertencias, sin incremento. Tras renombrar una variable del harness para satisfacer lint se repitieron los siete tests diagnósticos, todos aprobados.
