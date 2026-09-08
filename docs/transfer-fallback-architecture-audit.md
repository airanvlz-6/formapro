# Auditoría histórica de transferencia y fallback semanal

Este informe describe el estado anterior al resolver v1. La implementación posterior se documenta en `authorized-method-transfer-v1.md`; las reproducciones se conservan con el catálogo de relaciones vacío.

Base inspeccionada: ad028ed52ca48b8b59237ec82ff53463baaec336. Auditoría local sin cambios funcionales, commit ni push.

## 1–4. Flujo y autoridades reales

| Capa | Archivo / función | Responsabilidad actual |
|---|---|---|
| Descripción del objetivo | lib/athlete/goalResolution.ts / resolveGoalAuthority | Resuelve autoridad del objetivo humano |
| Familia de planificación | lib/athlete/strategyResolution.ts / resolvePlanningStrategy | Selecciona familia soportada; separada de la descripción |
| Contexto semanal | lib/planning/prepareAllowedWeeklyPlanContract.ts / loadWeeklyPlanningContext | Scope, calendario, restricciones, estrategia y contextos por disciplina |
| Adaptaciones y métodos | lib/planning/canonicalWeekStrategy.ts / buildCanonicalWeekStrategy | GOAL_DEMANDS, fase, roles y métodos exactos del catálogo |
| Modelo de transferencia | lib/sports/goalTransferModel.ts / GOAL_DEMANDS, TRANSFER_METHODS, transferMethod, validateStrategicIntent | Asociaciones explícitas objetivo→adaptación→método→disciplina/estímulo/patrones |
| Intents candidatos | canonicalWeekStrategy.ts / strategicIntents | Método activo + disciplina exacta + estímulo exacto + patrón permitido |
| Opciones semanales | lib/planning/allowedWeeklyPlanContract.ts / buildAllowedWeeklyPlanContract | Enumera todos los intents elegibles; llama feasibility y descarta los inviables |
| Movimientos y estructuras | lib/sports/trainingFeasibility.ts / evaluateTrainingFeasibility, evaluatePools | Validación del intent; filtros de movimientos, restricciones, datos; intersección por patrón; estructuras satisfacibles |
| Existencia y cobertura | allowedWeeklyPlanContract.ts / coverageFeasible, bindStrategicCoverage | Prueba de existencia; incorpora cobertura que cabe y difiere la que no cabe |
| Selección semanal | allowedWeeklyPlanContract.ts / composeBoundedWeek, validateWeeklySelection; prepareAllowedWeeklyPlanContract.ts / planBoundedWeek | LLM propone IDs ya autorizados; servidor valida y firma slots |
| Builder | lib/sports/sessionAuthority.ts / generateTrainingSession | Verifica receipt/slot; revalida contrato del intent ya seleccionado; no lo sustituye |
| Contrato de sesión | lib/sports/allowedTrainingContract.ts / buildAllowedTrainingContract | Reutiliza feasibility y limita movimientos y estructuras |
| Composición y admisión | lib/sports/structuredSession.ts / validateSessionAgainstTrainingContract | Comprueba propuesta, patrón y dosis dentro del contrato |

La secuencia no es feasibility seguida de una nueva búsqueda de movimientos: la resolución de pools y estructuras está dentro de feasibility. El Builder puede seleccionar movimientos permitidos y estructuras compatibles, pero no reabrir adaptación, método o disciplina firmados.

B1: adaptation↔method sí, mediante adaptationId. method↔method no existe como relación explícita. adaptation↔adaptation tampoco. modality↔adaptation no tiene entidad independiente: la asociación es indirecta mediante método, discipline, patterns y movimientos adecuados para stimulusId.

B2: hay roles discretos de adaptación PRIMARY/SUPPORTING/MAINTENANCE/OPTIONAL y de método DIRECT/SUPPORTING/MAINTENANCE/CONDITIONAL. No hay score de equivalencia, distancia de transferencia ni ranking preferido/alternativo por método. Las adaptaciones se ordenan por rol, debilidad y propuesta de preferencia admitida. El rol CONDITIONAL del método restringe box_aerobic a crossfit/hyrox. La exposición ordena movimientos, no métodos transferibles.

B3–B5: el modelo no es solo narrativo ni solo estratégico. Weekly Contract usa strategicIntents; feasibility valida el método, adaptación, disciplina, estímulo y patrón. El Builder recibe y valida ese intent mediante el contrato firmado. Lo que no se utiliza en ninguna de esas capas es un resolver de alternativas por fallo: no existe tal grafo en el modelo actual.

## 5. Recuperación y alternativas reales del catálogo

El catálogo tiene 18 métodos. En deload, buildCanonicalWeekStrategy reemplaza las demandas originales por recuperacion_activa PRIMARY y tecnica MAINTENANCE, dejando las originales en deferred con declared_deload. Después filtra métodos por igualdad exacta de adaptationId. Solo running_recovery coincide con recuperacion_activa.

| methodId | Disciplina | Adaptación → estímulo | Patrones | Elegibilidad actual para recuperacion_activa |
|---|---|---|---|---|
| running_recovery | carrera | recuperacion_activa → recuperacion_activa | run | Único match exacto |
| running_base | carrera | base_aerobica → base_aerobica | run | Excluido: adaptación distinta, diferida en deload |
| box_aerobic | box | base_aerobica → capacidad_aerobica | cyclic | Excluido: adaptación distinta; su condición crossfit/hyrox no crea equivalencia con recuperación |
| box_mixed | box | capacidad_glucolitica → capacidad_glucolitica | cyclic, squat, jump | Excluido; comparte máquinas, pero no está declarado como recuperación o mantenimiento aeróbico |

No hay otro método declarado para aerobic recovery/low-intensity recovery. running_base y box_aerobic son asociaciones aeróbicas reales, no pruebas de que cualquier dosis o composición de esos métodos preserve recuperación. El rol MAINTENANCE no cambia adaptationId ni autoriza otras adaptaciones. Los restantes métodos de carrera (threshold, specific, economy, vo2, power, strength) tampoco declaran transferencia a recuperación; no deben presentarse como equivalentes por intuición.

C1–C3: row_erg, bike_erg, ski_erg, assault_bike y echo_bike sí existen como MOVEMENT_LIBRARY IDs. Todos tienen discipline=[box], patrón cyclic y suitable_for capacidad_aerobica/capacidad_glucolitica, no recuperacion_activa. No son métodos separados del catálogo de transferencia. El registro legacy menciona además bici_estatica y natacion como términos de sustitución, sin convertirlos automáticamente en movimientos autorizados de esta ruta.

C4: podrían ser candidatos de una futura relación explícita y condicionada, pero hoy no hay una relación de transferencia secundaria que consultar. No es un edge existente que el resolver olvida recorrer. C5: incluso ampliando adaptaciones, un día Carrera excluye métodos Box con la disponibilidad actual. Ninguna de estas máquinas puede darse por segura con las restricciones observadas sin su propia evaluación de compatibilidad y datos.

## 6. Técnica y métodos relacionados existentes

| methodId | Disciplina | Adaptación → estímulo | Patrones | Por qué no entra para tecnica |
|---|---|---|---|---|
| box_technique | box | tecnica → tecnica | squat | Único match exacto; sí entra |
| box_weightlifting | box | halterofilia_tecnica → halterofilia_tecnica | olympic_lift | Adaptación distinta, diferida en deload |
| box_gymnastics | box | gimnasticos → gimnasticos | vertical_pull, vertical_push, inverted_locomotion | No declara transferencia hacia tecnica |
| box_max_strength | box | fuerza_maxima → fuerza_maxima | squat, hinge, horizontal_push | No es un método declarado de técnica de tren superior |
| box_support_strength | box | fuerza_general → fuerza_general | squat, hinge, lunge, core_antiextension | No declara equivalencia con tecnica |
| running_economy | carrera | economia_carrera → economia_carrera | run, jump | Relación propia de economía; no es técnica genérica intercambiable |

No existen métodos separados upper_body_strength_technique, skill_work o machine_technique. Hay movimientos y estímulos técnicos adicionales, pero un estímulo catalogado por sí solo no incorpora un método a la estrategia con goal resuelto. La regla actual exige exact adaptation match y nunca agrega una adaptación por fracaso de otra.

## 7–8. Gate diario y sustituciones existentes

buildAllowedWeeklyPlanContract itera managedDisciplines pero hace continue si !input.allowed[discipline].includes(day). Luego strategicIntents vuelve a exigir m.discipline === discipline. Es un permiso estricto de disciplina por día, no una ventana genérica con una preferencia deportiva. REST sigue permitido; no obliga a entrenar Carrera, pero cualquier opción ejecutable nueva de ese día debe pertenecer a una disciplina permitida.

Por tanto allowedDisciplines=[carrera] impide los métodos/movimientos Box de bike/row/ski aunque ambos deportes estén gestionados globalmente. Hay dos autoridades diferentes: gestión global y disponibilidad diaria. La arquitectura actual no contiene un permiso de modalidad cross-training independiente que relaje solo este caso.

F1–F4:

- Hay enumeración de varios métodos exactos cuando el catálogo los tiene. Por ejemplo base_aerobica puede incluir running_base y box_aerobic para crossfit/hyrox con ámbito adecuado. Se evalúan todos desde el principio; no se espera a que falle un preferido.
- Al fallar un intento, la enumeración simplemente continúa. No busca nuevos métodos/adaptaciones. bindStrategicCoverage difiere una demanda no factible, pero no incorpora supporting/maintenance nuevas. Si ambas adaptaciones deload carecen de opciones, el guard de regeneración rechaza antes de vincular cobertura.
- lib/sports/substitutionEngine.ts sí define SUBSTITUTION_MAP y evaluarSustitucion: movimiento esperado→término sustituto, condición por área y mantieneEstimulo booleano. Incluye ejemplos de rodaje_largo/rodaje_z2→bici_estatica/row_erg. Evalúa menciones con includes y permite términos no catalogados. No es una autoridad de seguridad ni un generador de opciones. La búsqueda de referencias en app y lib no encuentra consumidores productivos actuales; las referencias de uso encontradas son tests. No cubre los movimientos de running_recovery ni box_technique de este run.
- prescriptionDataSufficiency admite fallbacks de referencia/dosis (RPE, duración) y alternativas de movimiento expresamente autorizadas del mismo patrón. No genera sustituciones de adaptación o método en el preflight.
- repairSessionWithinReceipt y los retries del Builder recomponen dentro del mismo contrato firmado; no rescatan una semana que no llegó al Analyzer ni amplían autoridad.
- STRATEGY_FALLBACK por objetivo sin mapping no es fallback por método inviable. Con crossfit resuelto esa condición no aplica.

## 9. Reproducción G y H1–H5

Tests locales con CrossFit/deload, dos disciplinas, X/D Carrera y J/V/S Box, sin restricciones. Para H1–H4 un wrapper del test marca métodos concretos infeasible después de ejecutar feasibility real; no cambia código de producción. El test verifica que el input no se muta y registra todos los métodos consultados.

| Caso | Consultas de método por día | Resultado del resolver actual |
|---|---:|---|
| G: ambos factibles | 5 | Solo running_recovery y box_technique; ningún candidato alternativo oculto |
| H1: running_recovery inviable | 5 | Solo queda box_technique ya existente; no hay segundo método de recuperación; semana viable y recuperación diferida |
| H2: box_technique inviable | 5 | Solo queda running_recovery ya existente; no hay segundo método técnico; semana viable y técnica diferida |
| H3: ambos métodos exactos inviables | 5 | NO_NEW_EXECUTABLE_PRESCRIPTION; no consulta otra adaptación |
| H4: ambas disciplinas permitidas en cada día futuro | 10 | Mismos dos métodos, más ubicaciones. Si ambos fallan, mismo rechazo; si uno vive puede ocupar más días, sin nueva transferencia |
| H5: día estricto y modalidades cross-training declaradas | 5 en control | No existe tal permiso/método declarado para recuperación Carrera. El conjunto de alternativas declaradas es vacío; ambos fallidos siguen rechazados |

H5 no inventa un vínculo ni cambia discipline de un movimiento para fabricar una alternativa. Simularlo con nuevos edges sería diseñar la solución, no auditar el resolver actual. Los seis tests del archivo transferFallbackAudit.test.mjs pasan.

## 10. Clasificación

- T1 TRANSFER_LAYER_EXISTS_AND_CONNECTED: sí para asociaciones explícitas objetivo→adaptación→método y validación semanal/sesión. No significa que exista el fallback del diagrama objetivo.
- T2: no para TRANSFER_METHODS, que sí está conectado. Sí existe una pieza legacy de sustitución desconectada, pero no debe confundirse con un grafo moderno de transferencia listo para enchufar.
- T3 TRANSFER_ONLY_EXISTS_AT_STRATEGY_LEVEL: no; intent y método se consumen en Weekly Contract y Builder.
- T4 METHOD_CATALOG_TOO_NARROW: demostrado para las dos adaptaciones deload: una opción exacta de método cada una.
- T5 DISCIPLINE_GATE_TOO_STRICT: el gate estricto está demostrado. Que sea demasiado estricto depende de si la disponibilidad confirmada expresa permiso deportivo o ventana intercambiable; el contrato actual expresa permiso deportivo y no se debe reinterpretar silenciosamente.
- T6 NO_SUBSTITUTION_LAYER: sí en el sentido de ausencia de un resolver de sustitución autorizado conectado a esta ruta; no como afirmación de que no exista ningún archivo de sustituciones.

## 11–14. Diferencia y propuesta mínima, sin implementar

El sistema actual enumera asociaciones exactas ya activadas, valida factibilidad, difiere cobertura y permite que el Planner componga lo restante. El sistema objetivo exige expandir candidatos por relaciones de transferencia condicionadas y, si procede, por una adaptación secundaria compatible. Esas relaciones y esa expansión no están modeladas hoy. Los cinco días disponibles no garantizan que exista una alternativa segura.

Piezas reutilizables: resolución de goal/familia, demanda y fase, catálogos, scope, disponibilidad, feasibility determinista, contratos exactos, validación de cobertura y receipts. Piezas faltantes:

1. Relaciones explícitas de método/adaptación alternativa con procedencia, objetivo/bloque aplicables, equivalencia o transferencia parcial, prioridad y requisitos. Las reglas deportivas pertenecen a catálogos/adaptadores; el motor compartido consume esas relaciones.
2. Identidad separada de disciplina de disponibilidad, modalidad y demanda. Si se admite cross-training, un permiso canónico explícito y serializable; nunca inferirlo por gestionar dos deportes.
3. Resolver determinista y acotado que enumere métodos exactos y alternativas autorizadas, evalúe cada uno con la misma autoridad de restricciones/evidencia/datos, y documente causas de exclusión. Evitar ciclos, duplicados y búsqueda ilimitada.
4. Cobertura que distinga adaptación preservada de transferencia secundaria parcial; no marcar técnica o recuperación cubiertas por un estímulo diferente sin una regla declarada. Conservar la procedencia en intent/contrato/receipt.
5. Política explícita de REST y del resultado sin prescripción. No convertir descanso en obligación de generar trabajo ni inventar alternativas cuando todo es inseguro o desconocido.

La primera ampliación debería ser un caso de transferencia explícitamente respaldado y autorizado, no conectar la tabla textual legacy sin revisión. El motor decide candidatos, permisos, compatibilidad, suficiencia y cobertura. El LLM puede ordenar/proponer dentro de prioridades permitidas, seleccionar IDs admitidos y componer dosis/estructura dentro del contrato. No puede declarar equivalencias, ampliar scope, desactivar restricciones ni tratar unknown como seguro.

## 15–18. Tests del futuro fix y estado

Tests necesarios: alternativa exacta factible cuando falla el preferido; ninguna ampliación fuera de scope; cross-training solo con permiso; transferencia secundaria explícita con cobertura parcial; todas las alternativas pasan restricciones y suficiencia; unknown sigue sin admitir; evitar ciclos/duplicados y límites de expansión; independencia de orden de catálogo; no exigir REST ni sesión arbitraria; preservar receipt/Builder/CAS y paridad de contratos para web/React Native. Retener regresiones de ambas disciplinas y añadir un adaptador nuevo sin cambiar el motor compartido.

Solo se añaden este informe y tests de auditoría locales. Ningún archivo funcional modificado. NO COMMIT. NO PUSH.
