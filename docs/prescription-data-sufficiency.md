# FORGE 3C.1 — Prescription Data Sufficiency

Informe de implementación. Fuentes auditadas: `app/FormaPro.tsx` (FORMULARIOS, cambios de modo, guardar usuario y envío de chat), `app/api/chat/route.ts` (persistencia, extracción conversacional, Builder), `lib/mobile/buildPrompt.ts`, las autoridades 3A/3B/3C y Movement Library. La auditoría inicial fue de solo lectura; no se consultaron datos personales de producción.

1. **Auditoría del onboarding.** Los formularios varían por especialidad. Coach/Focus y cambios de modo conservan sus reglas actuales; Supervisión/Consulta tienen formulario base. No se añadió ninguna pregunta al onboarding.
2. **Preguntas existentes.** Edad, sexo, experiencia, objetivo/distancia, días, duración, superficies, dispositivo, FC máxima real y de reposo, molestias; material según especialidad; lugar en CrossFit. Marcas y tests tienen captura adicional. Dispositivo ofrece reloj GPS con pulsómetro, solo pulsómetro o entrenamiento por sensación.
3. **Persistencia real.** El formulario se envía a `guardar_usuario` como `usuarios.perfil`. `material`, `dispositivo`, `fc_max`, `fc_reposo`, `nivel`, `nivel_cf`, `nivel_carrera`, `lugar_entreno`, `superficie`, `duracion` y días quedan dentro del JSON. Marcas usan `test_atleta`, `marcas_especificas`, `historial_marcas` y `datos_entrenamiento`. Disponibilidad usa además distribución y fuentes de entrenamiento; no se infiere de una descripción.
4. **Consumo por 3A anterior.** Normalizaba objetivos, tiempo, fuerza, referencias de carrera, desarrollo, ciclo, restricciones e historial. Material, dispositivo y nivel no tenían proyección ejecutable. Ahora incorpora `prescriptionSignals`, conservando fuente y fecha de actualización cuando existen.
5. **Gaps encontrados.** Preguntar no equivalía a validar. Las reglas de dispositivo vivían en prompts; estos incluso agrupaban pulsómetro y GPS como si ambos sirvieran para ritmo. “Box completo”, “gimnasio completo”, opciones mixtas y experiencia genérica no prueban cada recurso. Algunas listas de Movement Library mezclaban ALL y ANY. El escritor general podía reemplazar todo `perfil`.
6. **Equipment existente.** `Movimiento.equipment: string[]`, sin filtro en Builder. Ahora la lista significa ALL; `equipmentRequirements: string[][]` expresa grupos ANY, todos obligatorios. Goblet squat, RDL, muscle-up, farmers carry y overhead carry explicitan alternativas. Squats de barra correspondientes y banca incluyen rack. Mancuernas+banco no requieren rack.
7. **HR/GPS existente.** `perfil.dispositivo`, FC y métricas declaradas. No había capabilities deterministas. Las opciones exactas conocidas se proyectan; no tener GPS no niega poder medir distancia en pista.
8. **Fuerza existente.** Se reutilizan las resoluciones de 3A y referencias de 3C: movimiento exacto, valor, tipo RM, fuente y fecha. No se derivan cargas del peso corporal, edad, sexo ni nivel.
9. **Carrera existente.** FC, zonas, ritmos suaves/umbral y tiempos 5K/10K. 3C conserva sus referencias y unidades; esta fase solo comprueba ejecución y suficiencia. No genera zonas.
10. **Tiempo existente.** `sessionTimeBudget` conserva límites mínimos/máximos y rango abierto. 3C estima duración y aplica el máximo finito. Desconocido continúa siendo `null`, nunca 60 minutos.
11. **Autoridad nueva.** `resolvePrescriptionDataSufficiency` es pura. Recibe señales canónicas, referencias y requisitos de una decisión concreta. No prescribe dosis ni decide estrategia.
12. **Estados.** `sufficient`, `fallback_available`, `missing_required_data`. Incluyen requisitos, señales resueltas/ausentes, fallbacks, preguntas y diagnósticos.
13. **Requirements.** `signal`, `reason`, `requiredFor`, `criticality`, `acceptableFallbacks`. El material es requerido; una referencia preferida puede sustituirse cuando la petición permite explícitamente el fallback. Una dosis precisa sin fallback mantiene requisitos obligatorios.
14. **Provenance.** Señales con `source` y `updatedAt`; referencias mantienen fuente y fecha. El recibo y el digest de evidencia incluyen el contexto de suficiencia. El rendering persiste decisiones y referencias ejecutables sin copiar PII a diagnósticos.
15. **Unknown.** Ausente, null, cadena vacía, cero y booleanos fuera de una representación declarada no se convierten en disponibilidad ni benchmark. Las opciones ambiguas de gimnasio no se expanden a inventario.
16. **Unavailable.** Es distinto de unknown. Se excluye el candidato afectado. Si no hay alternativa y un requisito ya es explícitamente imposible, se informa fallo cerrado, sin volver a preguntar lo ya respondido.
17. **Resolución de material.** IDs de catálogo y aliases exactos del formulario; ninguna búsqueda en títulos ni inferencia desde CrossFit o un entrenamiento histórico. ALL exige cada recurso; ANY utiliza uno conocido o pregunta por una sola rama viable.
18. **Fallback de material.** Builder recibe únicamente el pool compatible después de scope y restricciones. El resolver admite alternativas suministradas por el contrato para el mismo intent y patrón. Nunca convierte fuerza máxima en fuerza general para obtener una alternativa más cómoda.
19. **1RM.** Solo una referencia canónica exacta permite porcentaje. Sin ella, el contrato de opciones indica RPE; no pregunta por 1RM si esa alternativa está permitida.
20. **NRM.** 3RM, 5RM y kg sin RM conservan su semántica. No hay e1RM ni promoción silenciosa a 1RM.
21. **HR.** Requiere referencia existente y `canMeasureHeartRate=available`. `maxHrMethod` distingue declaración real, estimación legacy y desconocido. Una zona explícita no exige además FCmax; no se aplica 220−edad.
22. **GPS/capabilities.** `canMeasureHeartRate`, `canMeasurePace`, `canMeasureDistance`. Un GPS con pulsómetro declarado habilita las tres; solo pulsómetro habilita FC. Una respuesta explícita puede declarar medición en pista. Sin información, las demás permanecen desconocidas.
23. **Ritmo.** Valor canónico y capacidad de medirlo. HR suave/Z2 puede pasar a ritmo suave; umbral HR a ritmo umbral, cuando existen. No se escoge arbitrariamente otra zona/ritmo para conservar apariencia de precisión.
24. **RPE.** Fallback explícito para fuerza sin 1RM y trabajo que admite duración por esfuerzo. No arregla material ausente ni autoriza una dosis numérica inejecutable. La validación final exige que la propuesta materialice realmente una opción ejecutable.
25. **Tiempo.** No se pregunta universalmente. Permanecen estimación de duración, rechazo de máximo excedido y de distancia sin duración acotable bajo máximo finito.
26. **Experiencia.** Se usan declaraciones específicas `nivel_cf`/`nivel_carrera`. Una etiqueta genérica “Avanzado” no acredita CrossFit. Alta demanda no escalable, halterofilia e inversión exigen nivel específico; el squat escalable no exige una certificación nueva. No se construyó un motor de certificación.
27. **Restricciones.** Scope, disponibilidad y restricciones se resuelven primero. La suficiencia solo reduce ese pool, nunca reincorpora candidatos excluidos. Los controles previos al guardado continúan activos.
28. **Crítico/opcional.** FC/ritmo no son requisitos globales del corredor. RPE por duración puede ser suficiente sin dispositivos; la misma sesión por referencia precisa requiere esa referencia y capacidad.
29. **Decisión de preguntar.** Datos conocidos, fallback permitido, candidato autorizado y finalmente pregunta. Builder relee 3A antes de resolver. Las preguntas pendientes también consultan los datos persistidos antes de pedir lo aún desconocido.
30. **Representación de preguntas.** IDs estables, `signalIds`, `questionType` y texto de catálogo. Disponibilidad agrupada solo cuando es necesaria; referencias numéricas se preguntan individualmente. Token HMAC con usuario, disciplina, señales y caducidad de 30 minutos.
31. **Persistencia de respuestas.** `responder_dato_prescripcion` valida token, usuario y scope actual. Escribe declaraciones en `usuarios.perfil.prescription_signals`, usando comparación del JSON anterior. Las respuestas numéricas pasan por el parser existente de 3A y se guardan en `datos_entrenamiento`. No quedan solo en historial. La actualización general del perfil conserva los campos progresivos y no admite sustituirlos desde extracción genérica.
32. **Ambigüedad.** “Creo que sí”, “a veces”, “depende” y texto no reconocido permanecen ambiguos. Respuestas contradictorias sobre el mismo recurso también. No se usa un LLM para extraer esta autoridad.
33. **Respuestas parciales.** “Barra sí” actualiza barra, no rack. La nueva pregunta solicita rack solamente. “Tengo ambos” solo resuelve una pregunta de dos señales.
34. **Profiling progresivo.** Sin reonboarding. El chat muestra la pregunta y procesa la respuesta por el canal identificado. Tras guardarla, el atleta puede volver a solicitar la sesión; la generación se reconstruye desde contexto fresco. Las declaraciones habituales no prueban acceso en una fecha con una excepción explícita.
35. **3B.** Goal, adaptación, estrategia semanal, daily intent, coverage y autoridades de calendario no se reescriben. Si no se puede materializar un slot, se pregunta o se rechaza, sin cambiar estrategia.
36. **3C.** `validateSessionDose` sigue siendo autoridad de dosis. Suficiencia filtra antes de generar y comprueba nuevamente la propuesta antes de rendering/recibo. Los nuevos recibos incluyen señales; un cambio de material/capacidad invalida su digest antes del guardado. Recibos anteriores conservan la lectura de su versión.
37. **Fixture strength sufficient.** Barra+rack declarados y back squat 1RM 150: sufficient, fuente `usuarios.test_atleta.back_squat`, cero preguntas.
38. **Fixture strength fallback.** Barra+rack, sin 1RM o con NRM: fallback RPE, sin kg inventados ni pregunta.
39. **Fixture strength missing.** Back squat, barra/rack desconocidos, sin alternativa autorizada: pregunta por esas señales; cero llamadas LLM y ninguna sesión persistida.
40. **Fixture HR sufficient.** Pulsómetro declarado y Z2 130–145: sufficient; no pide FCmax adicional.
41. **Fixture HR fallback.** Sin medición HR, ritmo suave válido y medible: referencia `running:easyPace` como fallback.
42. **Fixture device-free.** Sin dispositivo ni benchmark: duración+RPE. Intervalos precisos sin fallback piden capacidad o referencia faltante; no inventan precisión.
43. **Fixture unavailable.** Barra/rack explícitamente no disponibles no pasan a available; mancuernas y banco permiten sus movimientos compatibles y no back squat.
44. **Fixture unknown.** Sin inventario puede usarse una alternativa corporal autorizada para el mismo patrón; sin ella se pregunta. Box completo e historial no prueban un remo.
45. **No assumptions.** Casos undefined/null/vacío/0/false, material, HRmax, zona, ritmo, 1RM, dispositivo y tiempo. Estimación legacy conserva etiqueta y no crea zonas.
46. **No unnecessary questions.** Sin 1RM con RPE, sin HR con duración/RPE, alternativa compatible de material y medición de pista sin GPS.
47. **Required question.** Probado antes de LLM en Builder y en el resolver puro; preguntas con IDs exactos y mínimo material faltante.
48. **Answer round trip.** “Sí, tengo ambos.” escribe `perfil`; `loadAthletePrescriptionContext` relee y cambia missing→sufficient con el 1RM previamente conocido. Se prueban además respuesta parcial, ambigua y referencia HR con persistencia.
49. **Coach.** Puede generar/preguntar dentro del scope canónico. Se conserva el pipeline de recibos, modificaciones y guardado real.
50. **Focus.** Una respuesta para una disciplina fuera de la delegación actual se rechaza antes de escribir. No amplía ownership.
51. **Supervisión.** Supervisión/Consulta no generan ni emiten preguntas de prescripción a través de Builder. Un token anterior tampoco permite responder tras revocación del scope.
52. **Legacy.** Contratos v1/v2 y recibos 3C anteriores siguen verificándose. Generaciones nuevas de perfiles antiguos usan las comprobaciones nuevas y fallback/preguntas progresivas, sin reonboarding masivo. Los fixtures de transporte declaran ahora su equipamiento explícitamente.
53. **Migraciones.** Ninguna. Solo JSON de `perfil`, `datos_entrenamiento` y estructura de sesión existentes. `prescription_access[fecha]` permite una excepción explícita acotada por fecha; no se construye un motor temporal ni se presupone un inventario por lugar.
54. **Tests.** `node --test lib/**/*.test.mjs`: 1054/1054, cero fallos, omitidos o cancelados. Incluye 35 pruebas nuevas de suficiencia y una nueva de protección de respuestas del perfil, además de las 1018 previas. Fixtures de transporte actualizados con equipamiento explícito. Duración de la ejecución completa: 44,97 s.
55. **TypeScript.** `npx tsc --noEmit`, exit 0.
56. **Diff.** `git diff --check`, exit 0, sin errores.
57. **Archivos.** Nuevos: `lib/athlete/prescriptionSignals.ts`, `prescriptionAnswers.ts`, `lib/sports/prescriptionDataSufficiency.ts`, su test y este informe. Modificados: proyección/loader 3A; Movement Library; contrato, feasibility, contexto de dosis, generación, validación, rendering y autoridad de sesión; ruta de chat y UI web; fixtures y tests de autoridad, estrategia, calendario, integración y protección del perfil.
58. **Commit.** `feat: enforce prescription data sufficiency`. SHA comunicado en la entrega para evitar autorreferencia.
59. **Git status.** Comprobado después del commit y comunicado en la entrega.
60. **NO PUSH.** No se ejecuta push.

Clasificación del estado encontrado antes de implementar:

| Dato | Collected | Persisted | Canonicalized 3A | Consumed 3C | Validated para ejecución |
|---|---|---|---|---|---|
| Material / lugar | Sí, según especialidad | perfil | No | Solo contexto libre | No |
| Pulsómetro / GPS | Sí, según especialidad | perfil.dispositivo | No | Prompt libre | No |
| FCmax / reposo | Condicional | perfil / métricas | Sí | FCmax no crea zonas | Valor, no capacidad |
| Zonas / ritmo | Métricas / historial | datos_entrenamiento y fuentes existentes | Sí | Sí | Referencia, no capacidad |
| PR / RM | Tests / marcas | Fuentes de marcas existentes | Sí | 1RM exacto | Sí, sin e1RM |
| Duración | Sí | perfil | Sí | Sí | Sí |
| Días / ownership | Sí | perfil / distribución / training sources | Autoridad separada | Sí | Sí |
| Nivel | Sí, varios campos | perfil | No para ejecución | Contexto libre | No |

Límites deliberados: no rediseño del onboarding, cálculo de zonas, e1RM, carga global, ACWR, nueva disponibilidad, outcomes, progresión o interferencia semanal. “Declarado” conserva ese significado: no se convierte en medición de laboratorio. Materiales genéricos o etiquetas mixtas que no identifican un recurso permanecen desconocidos.
