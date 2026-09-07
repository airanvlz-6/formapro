# Goal authority: auditoría y admission de planificación estratégica

## Base y alcance

HEAD auditado antes de editar: `bf7689335476b4dc6d02f0f7c0e13d73f58e9de2`, árbol limpio.
No se ha comprobado el despliegue ni leído datos de producción. El run aportado
`367e5f5c-d878-431a-9310-1ef097b5bd7c` acredita el resultado observado, no sus candidatos originales.
La auditoría y el diseño se comunicaron antes de implementar. No hay migración ni push.

## Fuentes reales: 3A → resolución

Código: `lib/athlete/athletePrescriptionContext.ts`, `projectAthletePrescriptionProfile`.

| SOURCE | RAW TYPE aceptado | CANONICAL CANDIDATE | PRIORITY | CAN CONFLICT? | USED BY resolveStrategyGoal? |
|---|---|---|---|---|---|
| `usuarios.objetivo_principal` | string o `{descripcion: string}` | texto no vacío de `descripcion` o string | ninguna precedencia sobre perfil | sí | sí, mediante 3A |
| `usuarios.perfil.objetivo_general` | string o `{descripcion: string}` | mismo procedimiento | igual | sí | sí |
| `usuarios.perfil.objetivo_detalle` | string o `{descripcion: string}` | mismo procedimiento, incluso prosa de contexto | igual | sí | sí |
| `usuarios.perfil.objetivo_principal` | string o `{descripcion: string}` | mismo procedimiento | igual | sí | sí |
| `perfil.objetivos_secundarios[]` | elementos JSON | evidencia secundaria separada | no compite por primary | no | no |
| `perfil.distancia_objetivo`, `objetivo_skill`, `objetivo_fisico`, `objetivo_programacion`, `objetivo_grupo`, `actividad_objetivo`, `prioridad` | JSON | `disciplineSpecific` | no primary | no | no |
| `perfil.competicion`, `proxima_carrera`, `carrera_objetivo` | JSON | evidencia de competición | no primary | no | no |
| primary con `tipo=competicion` o `fecha` | objeto | también evidencia de competición | mantiene su candidatura primary | sí como primary | sí como primary |
| disciplina, ownership, Analyzer, debilidad, restricción | contratos independientes | ningún candidato primary | no aplica | no | no |

3A recorta texto, compara sin acentos, en minúsculas y con espacios/guiones normalizados.
Conserva el valor, `raw`, `source`, `authority=declared` y la fecha disponible:
`updated_at` o `fecha_inicio` del primary; `updated_at` de los objetos del perfil.
No hay selección por recencia. Objetos sin texto utilizable no producen candidatos.
Sin candidatos: `unknown`; candidatos equivalentes: `resolved`; distintos: `conflict`.
El catálogo aplica después aliases exactos con normalización equivalente; no extrae metas de prosa.
Un conflicto 3A sigue siendo conflicto aunque dos aliases apunten al mismo ID.

Ejemplo solicitado: `perfil.objetivo_general=crossfit` y primary `mejorar media maratón`
producen conflicto. Además, ese último texto concreto no está entre los aliases actuales.
No se escoge uno por prioridad implícita.

## Catálogo y onboarding reales

| ID | Dominio de demanda | Nivel conceptual actual |
|---|---|---|
| `half_marathon` | resistencia de carrera | perfil de evento/distancia; no contiene marca individual |
| `10k` | resistencia de carrera | perfil de evento/distancia; no contiene marca individual |
| `crossfit` | rendimiento multimodal | actividad/rendimiento general; Open es alias, no calendario de competición |
| `max_strength` | fuerza | cualidad de rendimiento; no identifica levantamiento ni kg objetivo |
| `hyrox` | resistencia y trabajo funcional | perfil de evento; no distingue división, tiempo o fecha |

El catálogo ya mezclaba estos niveles. `GOAL_DEFINITIONS` los hace visibles mediante metadata;
`GOAL_DEMANDS` conserva sus prioridades cualitativas y `TRANSFER_METHODS` sus relaciones
adaptación → estímulo → disciplina → patrón. No se han inventado demandas nuevas.
Extender soporte exige definir estas relaciones y validar sus capacidades de dominio;
el motor de resolución/admission no contiene ramas Carrera/CrossFit/Halterofilia.
Carrera y CrossFit son fixtures iniciales, no una lista cerrada de dominios posibles.

El onboarding guarda el conjunto de respuestas en `usuarios.perfil`. La pregunta genérica
«¿Qué quieres conseguir exactamente?» escribe `objetivo_detalle`. Running invita a mezclar
distancia, fecha y marca en esa prosa; CrossFit admite Fran, muscle-up u Open; híbrido admite
peso muerto y 10K juntos. Fitness ofrece objetivos como pérdida de grasa o movilidad que
no están modelados en este catálogo. La edición de perfil también modifica `objetivo_detalle`.
Hay preguntas separadas de distancia, skill y próxima carrera. La extracción conversacional
existente puede guardar `{descripcion, fecha, tipo, fecha_inicio}` en `usuarios.objetivo_principal`.

El almacenamiento puede representar primary, secundarios y targets separados, pero el onboarding
no garantiza esa separación: prosa de detalle compite hoy como primary. Es posible almacenar
ownership Box+Carrera, primary Open, secundario media maratón y target específico, aunque 3B
solo utiliza el primary resuelto; no coordina prioridades entre múltiples eventos.
Una weakness canónica pertenece a desarrollo; una restricción pertenece a seguridad temporal.
Ninguna se transforma en objetivo deportivo.

## Causa del fallback observado

Antes, `resolveStrategyGoal` devolvía null para ausencia, conflicto o etiqueta no reconocida.
3B producía `adaptations=[]`, `methods=[]`; AllowedWeeklyPlanContract podía ofrecer
`stimulus_only`. 3D emitía `WEEK_STRATEGY_UNKNOWN` como warning y podía permitir persistencia.
Eso explica el mecanismo del run, pero su causa concreta continúa **UNKNOWN**:
no disponemos de los cuatro valores originales ni de sus evidencias temporales.
No se atribuye a halterofilia, un conflicto específico o un bug del renderer sin esos datos.

## Política implementada

`GoalResolutionResult` es puro y serializable: status, canonicalGoalId y candidatos con
source/value/recognizedId. Estados: `GOAL_RESOLVED`, `GOAL_MISSING`, `GOAL_CONFLICT`,
`GOAL_UNSUPPORTED`. El wrapper `resolveStrategyGoal` conserva su interfaz id/null para
los consumidores existentes, pero delega en la resolución explícita.

La ruta pública `planificar_semana` impone `strategyVersion=1`. En la preparación del contexto,
antes de llamar al Planner o emitir calendario para Builder, el goal debe estar resuelto.
Las tres causas restantes devuelven `goalRequirement`, `canPlanTowardDeclaredGoal=false`,
una pregunta determinista y token firmado. No hay semana genérica presentada como estratégica.
Las utilidades internas sin estrategia conservan compatibilidad explícita; la ruta pública
no permite elegir esa degradación. Las sesiones individuales no estratégicas mantienen su contrato.

- Missing: pregunta por primary.
- Conflict: pregunta cuál priorizar; no escoge fuente ni usa el LLM para decidir.
- Unsupported: explica que ese objetivo no dispone de estrategia modelada; nunca lo aproxima
  a otro deporte. Permite conservarlo y salir sin cambios, o seleccionar expresamente otro.
- Resolved: usa las demandas, métodos y cobertura 3B existentes dentro del scope autorizado.

El Analyzer puede ejecutarse antes del gate y seguir analizando contexto; no concede autoridad
de objetivo. Supervisión conserva análisis y `prescriptionAllowed=false`.
Focus conserva una disciplina delegada; Coach coordina su scope ya resuelto. Ni modo ni
ownership infieren objetivo. Métodos sin capacidad compatible siguen sujetos a 3B/3C.1.

Builder y guardar_plan_semana ya releen el contexto mediante `assertFreshWeeklyAuthority`.
Ese camino vuelve a aplicar el gate a recibos estratégicos: perder el goal invalida la
autoridad antes de componer o admitir la semana. No se ha convertido el warning 3D en error
global, ni cambiado su reparación, prioridades, intentos o validación final.

## Pregunta, escritura y continuación

Se reutiliza el patrón de 3C.1, con dominio HMAC independiente: pregunta vinculada a usuario,
huella de los campos leídos y scope, caducidad de 30 minutos. El token no contiene prosa del perfil.
Solo una respuesta exacta reconocida al token vigente puede confirmar primary. Chat libre,
Analyzer y selección de disciplina no son una respuesta autorizada a esta pregunta.

La escritura usa los JSON existentes `objetivo_principal` y `perfil` en una actualización CAS.
Guarda el ID en `objetivo_principal.descripcion`; conserva el primary sustituido y los tres
campos competidores del perfil en `objetivo_principal.resolution` como antecedentes sin clasificar,
y retira esas tres declaraciones de la candidatura activa. La pregunta explica esta sustitución.
No promueve los antecedentes automáticamente a secondary ni aplica fechas del goal anterior
al nuevo: la declaración anterior completa sigue conservada. Los campos separados de competición,
secondary, targets, señales y resto del perfil permanecen iguales.

La CAS compara ambos JSON y modo/categoría/especialidad; se releen la fila y el scope después.
Una respuesta caducada, alterada, de otro usuario, con perfil cambiado, CAS fallida o reread
no resuelto no habilita continuación. No se escribe ownership, disponibilidad, restricciones,
readiness, carga ni exposiciones. No hay transacción nueva entre tablas: los cambios de scope
se comprueban en la relectura y nuevamente al iniciar la generación.

El backend devuelve la resolución y el perfil releídos. Web los presenta, actualiza su vista
y reinicia el orquestador con una generación fresca, conservando la elección empezarHoy.
No anuncia «semana guardada» al recibir una pregunta. React Native/Expo puede consumir exactamente
los mismos DTO y endpoints, sin dependencia de React, DOM o strings renderizados en la autoridad.
Si se recarga la UI y se pierde la pregunta local, solicitar la semana emite un requisito fresco.

## Halterofilia, deload, weakness y selección

Existen movimientos olímpicos (snatch, hang snatch, clean and jerk, etc.), patrón `olympic_lift`,
estímulo/adaptación `halterofilia_tecnica` y método `box_weightlifting` usado como demanda de
apoyo CrossFit. Eso **no** equivale a un Goal Demand independiente de halterofilia.
No existen aliases ni Goal Definition/Demand para mejorar total olímpico/snatch/clean & jerk.
Falta además una política de fase/deload pertinente que conduzca a ese método técnico.

El deload actual, para todos los goals reconocidos, sustituye demandas por recuperación activa
PRIMARY y técnica MAINTENANCE. Es universal, no goal-dependent. El método `box_technique`
usa el patrón squat; no representa por sí mismo técnica olímpica. No se añade otro deload
genérico ni una lista manual de snatches. Soporte estratégico de halterofilia queda separado
para definir demandas, política por fase y compatibilidad de métodos/capacidades.

Las weakness siguen vinculándose solo a adaptaciones compatibles mediante su patrón canónico;
deload puede diferirlas. Los intents admitidos conservan adaptación, role, método y patrón
durante Builder y admisión. Las pruebas 3B existentes cubren esa continuidad y los pools.
Goal resolution no inventa 1RM, equipo, ritmos, FC, skills ni dosis: sigue vigente 3C.1.

## Observabilidad

`GOAL_RESOLUTION_DIAGNOSTIC`: status, canonicalGoalId, candidateCount, candidateSources,
recognizedIds, conflict, unsupportedLabelsSafe y decision. Las etiquetas desconocidas se
sustituyen por `[unrecognized]`; no se registra prosa personal.
`WEEK_STRATEGY_ADMISSION`: planningRunId (null si la comprobación interna no dispone de él),
goalStatus, admitted y reason. Rechazo antes de Planner no consume sus intentos.

## Entrega: 34 puntos

1. Base: `bf7689335476b4dc6d02f0f7c0e13d73f58e9de2`; despliegue no verificado.
2. Fuentes: las cuatro candidaturas primary de la tabla, sin precedencia implícita.
3. Onboarding: respuestas JSON con prosa de detalle compitiendo como primary; separación incompleta.
4. Catálogo: cinco perfiles, clasificados arriba; metadata extensible y demandas existentes.
5. Null en producción: mecanismo de fallo confirmado en código.
6. Causa concreta del run: UNKNOWN sin evidencias originales.
7. Resultado: cuatro estados explícitos con candidatos y procedencia.
8. Missing: pregunta estructurada.
9. Conflict: selección explícita de primary.
10. Unsupported: estado no admitido explícito, conservar/cancelar o seleccionar otro expresamente.
11. Resolved: admisión estratégica normal con demandas existentes.
12. Goal y disciplina: autoridades independientes.
13. Supervisión: análisis disponible, prescripción denegada como antes.
14. Focus: scope sin cambios, goal explícito para la semana estratégica.
15. Coach: scope sin cambios, sin inferencia automática a CrossFit.
16. Gate: preparación antes de Planner/Builder y relecturas de autoridad del calendario.
17. 3B: wrapper delegado al resultado explícito; demandas/deload/weakness no modificados.
18. 3D: sin cambios de código ni reinterpretación global del warning.
19. Persistencia: JSON existentes, CAS, archivo de declaraciones sustituidas, reread obligatorio.
20. Observabilidad: los dos diagnósticos anteriores, sin prosa personal.
21. CrossFit: soporte existente preservado, incluida fixture deload.
22. Running: half_marathon/10k y sus demandas existentes preservadas.
23. Weightlifting: unsupported explícito; subfase posterior por capas ausentes concretas.
24. Cross-domain: motor sin branches por deporte; catálogo/adapters siguen siendo la extensión.
25. Mobile: DTO compartido y backend independiente de UI.
26. Tests nuevos: 44 adicionales respecto a la base de 1.220; resolución, aliases, ausencia/conflicto/unsupported, no inferencia, gate real,
    persistencia/relectura, CAS, caducidad, scope, invariantes y estados reales del cliente.
27. Suite completa: `node --test --test-concurrency=4 lib/**/*.test.mjs`: 1.264/1.264 PASS.
28. TypeScript: `npx tsc --noEmit`, PASS.
29. Diff: `git diff --check`, PASS.
30. Migraciones: ninguna.
31. Archivos: dos módulos nuevos y su test en athlete; metadata goalTransferModel;
    canonicalWeekStrategy y preparación semanal; ruta y FormaPro; pruebas de contrato semanal,
    estrategia e integración de cliente; este informe.
32. Commit: SHA exacto en la entrega final, commit nuevo sin amend/rebase.
33. Git status: comprobado tras commit y registrado en entrega final.
34. NO PUSH.
