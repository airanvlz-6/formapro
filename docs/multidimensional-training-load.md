# FORGE 3C.5 — Carga planificada y realizada

## Auditoría previa y contrato

1. **Auditoría inicial.** Inspección de lectores, escritores y modelos del checkout sobre HEAD `588b0706e7ccfa2bd778bfd139677609e360a79a`. No se consultaron tablas supuestas ni se modificó SQL. Las ausencias indicadas son del código disponible, no una certificación del esquema de producción.
2. **Sistemas existentes.** `lib/sports/sessionDose.ts` ya calcula rangos de duración y referencias de dosis; `trainingFrequencySafetyNet.ts` calcula frecuencia de sesiones; `readinessEngine.ts` y physiology/recovery gestionan disponibilidad y recuperación. No se encontró un motor cuantitativo existente de tonelaje, TRIMP, ACWR o strain que pudiera reutilizarse. `weeklyFacts` en `weekClosure.ts` contabiliza cumplimiento, no dosis ejecutada.
3. **Exposure Engine.** Se conserva intacto el algoritmo textual de `lib/sports/exposureEngine.ts`. Se añade allí `buildStructuredExposureReport`, que utiliza los mismos IDs y patrones del catálogo, cuenta sesiones distintas y conserva subtotales de repeticiones y estado de conocimiento. La nueva capa no reproduce el matching textual ni lo convierte en cantidades.
4. **Ejecución disponible.** `registrar_sesion` guarda en `usuarios.workout_history` fecha, tipo, notas, duración no validada en unidades, sensación y análisis. `recordPlanCompletion` guarda completada, título y descripción reales. No hay lectores/escritores implementados de `training_executions` o `prescription_execution_relations` en este checkout. No se obtiene ejecución de series/kg desde esos textos. Los registros externos sí declaran minutos e intensidad percibida de sesión. Los modification events guardan principalmente texto y tipos.
5. **Modelo.** `lib/trainingLoad/trainingLoad.ts` es un núcleo puro sin imports ni ramas por deporte. Cada cantidad tiene estado, unidad, límites mínimo/máximo y fuentes. Cada sesión conserva origen, fecha, condición planned/actual, segmentos y atribución explícita. No hay equivalencia universal entre dimensiones.
6. **Dimensiones implementadas.** Segundos de duración, trabajo y recuperación; metros; repeticiones; volumen externo en kg; minutos × RPE de sesión realizada. Intensidad relativa y referencia se conservan como contexto del segmento, sin sumar porcentajes, zonas o RPE. Las categorías se agrupan separadamente.
7. **Descartadas.** No se inventan puntuaciones excéntricas, neuromusculares, fatiga, equivalencias entre modalidades, kilogramos de peso corporal, gasto energético ni fórmulas cardiacas. Una dimensión desconocida permanece desconocida.
8. **Planned.** El adaptador lee `structuredPrescription` versión 2 de 3C, su propuesta validada estructuralmente, referencias históricas, duración y objetivo. No recalcula con benchmarks actuales ni cambia la prescripción. El resto legacy queda unknown. IDs de movimiento desconocidos fallan explícitamente.
9. **Actual.** El núcleo puede resolver segmentos efectivamente observados y ejecución parcial cuando un consumidor aporta hechos estructurados. El lector de producción utiliza exclusivamente lo que existe: historial sin dosis estructurada y registros externos. No presume cumplimiento ni rellena actual desde planned. Capturar ejecución por ejercicio queda fuera de esta fase y no se simula mediante fixtures.
10. **Carga externa mecánica.** Repeticiones × kg explícitos, o kg derivados de porcentaje y referencia histórica del mismo movimiento. El volumen no es un score de esfuerzo. Si falta una carga aplicable, el total queda parcial o desconocido.
11. **Carga interna.** Duración real exacta en minutos × RPE real de toda la sesión, entre 1 y 10. En externos procede de `duracion` e `intensidad_percibida`; el escritor declara esas semánticas. Es autoinforme, no medición de dispositivo. Un RPE prescrito, duración estimada o sensación textual no alimenta el cálculo.

## Semánticas y agregación

12. **Running.** Metros, segundos y contexto de intensidad separados. Un fixture de 45 min/8 km mantiene ambas cantidades; no convierte ritmo ni zona en TRIMP. El núcleo admite ambas magnitudes aunque la propuesta 3C use un único eje de volumen por movimiento.
13. **Fuerza.** 4 × 5 × 112,5 = 2.250 kg y 20 repeticiones. Añadir RDL 3 × 8 × 80 produce 4.170 kg. Los patrones permanecen separados.
14. **Halterofilia.** Conserva volumen externo si es conocido y categoría técnica del catálogo. No supone que el tonelaje represente complejidad técnica. Los descansos entre rondas de un complex se contabilizan una vez como segmento de recuperación.
15. **Peso corporal.** 5 × 10 dominadas produce 50 repeticiones; kg no aplicable cuando no existe carga externa. No usa el peso del atleta como tonelaje.
16. **Metcon.** AMRAP de 12 minutos conserva el reloj; repeticiones realizadas requieren rondas observadas. EMOM, E2MOM, density, death-by y ladder conservan el contexto del formato y no inventan reparto ni rondas de movimientos. Relojes y rangos de duración provienen de 3C.
17. **Intervalos.** 6 × 800 m = 4.800 m; cinco descansos de 120 s = 600 s. Trabajo y descanso no son la misma dimensión. El fixture temporal 6 × 180 s más recuperaciones produce 1.680 s.
18. **Impacto.** Etiqueta `impact` del movimiento, con sesiones, segmentos y cantidades por categoría. No multiplica metros por coeficientes ficticios.
19. **Excéntrico.** Unknown: el catálogo no ofrece una magnitud explícita utilizable. No deriva una desde nombres o fatiga.
20. **Metabólico.** Contexto `sistema_energetico` del estímulo y `stimulus_type` de estructura. Son categorías prescritas, no medidas de estrés metabólico realizado.
21. **Neuromuscular.** Unknown; no se convierte `fatigue_cost` en un score nuevo.
22. **Técnico.** `technical_demand` se conserva categóricamente; sin escala numérica arbitraria.
23. **Patrones.** Identidad desde Movement Library; Exposure Engine cuenta una sesión una vez aunque tenga calentamiento y bloque principal del mismo patrón. Rep known subtotal no implica completitud.
24. **Adaptaciones.** Solo `objective.intent` explícito y su ID/método. Se conserva grupo unattributed cuando falta. La atribución planned no se transfiere a actual sin relación real.
25. **Weakness.** Solo ID persistido. No se infiere desde texto, movimiento o supuesto beneficio.
26. **Sesión.** Suma cada dimensión por separado y mantiene todos sus segmentos. El subtotal conocido puede mostrarse con estado partial y máximo desconocido. IDs duplicados se rechazan.
27. **Día.** Agrupa listas de sesiones, no una única sesión por fecha; conserva modalidades y fuentes.
28. **Semana.** Lector compartido agrupa por semana civil usando el resolver existente. Planned, actual de historial y actual externo permanecen separados. Ventana solicitada de hasta 90 días; lecturas paginadas, ordenadas y restringidas por atleta. Errores no se convierten en ceros.
29. **Bloque.** STOP a persistencia de carga por bloque: `ciclo_actual.bloque` y `block_week_summary` no aportan identidad estable de instancia demostrada. `aggregateLoadWindow` admite una ventana temporal explícita y declara `temporal_only_identity_unknown` si falta ID; nunca agrupa por nombre ni escribe.
30. **Ciclo.** Mismo límite de identidad. Una ventana explícita permite análisis temporal, no certifica una instancia de ciclo.
31. **Externos.** Cada registro conserva ID y modalidad. Si coexisten historial y externos, `combined=null` y `unknown_cross_source_overlap` evitan una suma potencialmente duplicada. No existe relación suficiente para deduplicar por fecha/tipo. Se pueden consultar ambos conjuntos por separado.
32. **Modificaciones.** El informe devuelve original/modified type y `unknown_text_only`. Una modificación de fuerza a bicicleta no copia kg planificados a actual; la prueba usa ejecución observada de bicicleta. El ledger actual no permite reconstruir la dosis original de cada modificación.
33. **Parcial.** Tres series observadas son tres, aunque hubiera cinco prescritas. Una ejecución parcial puede tener una cantidad observada completa; executionStatus y completitud de la cantidad son conceptos distintos.
34. **Delta.** `plannedActualDelta` compara el par que un caller vincule explícitamente y solo dimensiones completas con unidades compatibles. Conserva ambos lados y diferencias con límites. El lector no llama esta función: no dispone de relaciones verificadas. Ejemplo: 2.500 frente a 2.375 kg, delta −125 kg.
35. **Completitud.** Por dimensión: complete, partial, unknown, not_applicable. El estado global es informativo; no sustituye los estados individuales. Un rango estimado de duración sigue siendo partial y conserva sus límites al agregarse.
36. **Unknown.** Nunca equivale a cero. No hay sesiones implica unknown en cantidades. Un subtotal conocido más una cantidad desconocida es partial, con máximo null. not_applicable se excluye de sumas.
37. **Legacy.** Ni títulos, notas, `completada`, descripciones ni duración sin unidad validada generan repeticiones/kg/minutos. Fechas inválidas de historial/externos quedan diagnosticadas; planes mal formados fallan explícitamente.

## Límites compartidos, entrega y verificación

38. **Sufficiency.** Se consume la dosis admitida por el pipeline 3C/3C.1 y sus referencias, sin sustituir esa autoridad ni regenerarla con datos actuales. Analytics no abre nuevas preguntas, onboarding ni benchmarks obligatorios. Falta de datos reduce completitud.
39. **Readiness.** Separado; ningún nuevo vector altera readiness, recuperación, restricciones o prescripción.
40. **Carga reciente.** El existente `calcularFrecuenciaRealRelativa` cuenta sesiones de los últimos siete días respecto a días declarados; no es volumen fisiológico. Su uso existente como `cargaRecienteRelativa` permanece intacto.
41. **ACWR.** No implementado ni usado como autoridad.
42. **Monotony/strain.** No se añaden fórmulas. La mención textual previa de posible monotonía por repetición en Exposure Engine no se presenta como cálculo validado.
43. **Cross-domain.** Núcleo libre de imports de catálogos, BD, SDKs, UI y ramas deportivas. Los adaptadores resuelven conocimiento explícito del dominio. Se mantienen los gates previos.
44. **Cycling fixture.** Segmento con ID real `bike_erg`, duración y contexto aportados al núcleo; además se prueba duración realizada sin segmentos. No se añade una nueva rama o modalidad obligatoria al catálogo.
45. **Powerlifting fixture.** Segmento `back_squat` con series/reps/kg, mismo núcleo. Fixture no significa habilitación automática de una nueva disciplina de prescripción.
46. **Mobile-ready.** Acción compartida `obtener_carga_entrenamiento` recibe `codigo` y `datos: {fromDate,toDate}`; devuelve `{ok,report}`. Coach, Focus y Supervisión leen el mismo servicio. No se modifica Expo ni UI. Mantiene el transporte e identidad legacy de chat; esta fase no crea ni certifica un sistema nuevo de autenticación.
47. **Serialización.** Objetos, arrays, números finitos, strings y null; sin clases públicas, funciones, Maps o SDKs. Pruebas de roundtrip JSON.
48. **Persistencia.** Derivación de fuentes existentes, sin escrituras ni caché duplicada. Lecturas de usuarios, weekly_plan, external_training_records y session_modification_events. Los resúmenes no se guardan en block outcomes ni weekly facts.
49. **Migraciones.** Ninguna. No es necesaria para el modelo y la lectura honesta entregados. Ejecución estructurada futura requerirá auditar captura, identidad y esquema antes de decidir persistencia; no se presupone una migración.
50. **Tests.** Resultado final: **1.108/1.108** en toda `lib/**/*.test.mjs`, incluidos 3A/3B/3C/3C.1 y gates. Las **44 pruebas nuevas** cubren cálculo, adaptadores, ejecución parcial, delta, lectura paginada, errores, modalidades múltiples, modificaciones, Exposure Engine y ruta compartida.
51. **TypeScript.** `npx tsc --noEmit`: PASS sobre el resultado final.
52. **Diff.** `git diff --check` y `git diff --cached --check`: PASS antes de commit.
53. **Archivos.** `lib/trainingLoad/{trainingLoad,prescriptionLoadAdapter,loadTrainingLoad}.ts`, dos suites `.test.mjs` de esa carpeta, `lib/sports/exposureEngine.ts`, `app/api/chat/route.ts` y este informe.
54. **Commit.** Nuevo commit con mensaje `feat: add multidimensional training load model`; SHA en la entrega para evitar autorreferencia en el propio commit.
55. **Estado Git.** Se verifica después del commit y se informa en la entrega.
56. **NO PUSH.** No se ejecuta push, amend ni rebase.
