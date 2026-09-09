# C2.1 — Running Reference Authority y presentación

Base verificada: `5ceb459587c63e162cc4f99df00caa3625fe6dc7`, árbol limpio. Auditoría estática del código y fixtures sintéticos; no lecturas ni escrituras de perfiles reales. Sin nuevos goals, migraciones ni bypass del límite semanal.

## 1. Auditoría previa de captura y consumo

Evidencia: `app/FormaPro.tsx` contiene CAMPOS_MARCAS (línea 455 de la base), preguntas de carrera (488–494) y el editor «Marcas por disciplina» (3348–3363). El editor escribe `usuarios.marcas_especificas` mediante actualizar_usuario. Las preguntas escriben `usuarios.perfil`. Las referencias extraídas por chat llegan a `usuarios.datos_entrenamiento` usando su allowlist. `projectAthletePrescriptionProfile` lee perfil, test_atleta, marcas_especificas, datos_entrenamiento e historial_marcas; no hay que enviar el perfil al LLM para resolver referencias.

Convenciones de la tabla: S = almacenado por rutas actuales; C = proyectado canónicamente; R = resuelve solo con valor válido y sin conflicto; X = ejecutable únicamente con capacidad requerida available. D = DIRECT declarado/registrado, no laboratorio. Los conflictos son por métrica, sin latest-wins. Se describe la base C2 antes del cambio.

| Dato real | Storage | C / R / conflicto | Procedencia / X | Uso C2 |
|---|---|---|---|---|
| tiempo_5k; editor 5k | perfil, test_atleta/otras rutas reconocidas; marcas_especificas; historial | Sí / condicional / sí | Tiempo D; promedio DERIVED; X pace | No se usa como VO2/threshold/HM |
| tiempo_10k; editor 10k | Mismas rutas | Sí / condicional / sí | Tiempo D; promedio DERIVED; X pace | Solo variante specific+10k del resolver, no admitida por 3B |
| editor 21k «Media maratón» | S: marcas_especificas; history puede contener ejercicio 21k | No en base | Sin referencia equivalente | No |
| editor 42k «Maratón» | S: marcas_especificas; history puede contener ejercicio 42k | No en base | Sin referencia equivalente | No |
| ritmo_suave / ritmo_z2 | perfil / datos_entrenamiento y stores reconocidos | easyPace / R / sí | D; X pace | Alternativa de base |
| ritmo_umbral | perfil / datos_entrenamiento y stores reconocidos | thresholdPace / R / sí | D; X pace | Preferida de umbral |
| fc_suave | Pregunta de carrera, perfil | easyHr / R / sí | D; X HR | Preferida de base |
| umbral_fc | Pregunta / datos_entrenamiento | thresholdHr / R / sí | D; X HR | Alternativa de umbral |
| fc_max / fc_maxima | Perfil / datos_entrenamiento | maxHr / R / sí | D o marcador de estimación; no X | No genera zonas |
| fc_reposo | Perfil / datos_entrenamiento | restingHr / R / sí | D; no X | No genera zonas |
| vo2max | Campo/métrica persistida | vo2max / R / sí | D, sin protocolo; no X | No produce vVO2 |
| z1…z5 / z1_fc…z5_fc | datos_entrenamiento y claves reconocidas | Cada zona / R / sí | D; X HR | Ninguna policy C2: modelo de zonas desconocido |
| km_semana | Perfil / clave reconocida | weeklyDistance / R / sí | D; no X | No es control de intensidad |
| Target pace / race target | Objetivo/detalle pueden contener texto | Sin target pace canónico separado | No X desde texto | No se interpreta como capacidad |
| Resultados test_atleta | Store leído, solo claves numéricas/temporales reconocidas | R y conflicto con otros stores | D; no inferir protocolo desde informe | Solo referencias anteriores |
| PR / historial_marcas | ejercicio, valor, fecha, updated_at | Alias exacto + parser; R/conflicto | recorded no significa current ni measured | Misma resolución por métrica |
| Sesiones completadas / reports | weekly_plan.sessions, workout_history | Contexto de exposición/frecuencia | No entran en referencias running | No extrae ritmos/FCmax del texto |
| RHR de recuperación/physiology | prepareRecoveryContext | Autoridad propia de recuperación | No sustituye fc_reposo del perfil | No se usa para nuevas zonas |

Números pace/time sin unidad documentada siguen sin parsearse; clocks válidos se convierten a segundos. Un tiempo con unidad incompatible no se admite. Las distintas marcas 5K/10K, test vs perfil y PR vs reciente entran en el mismo resolver: valores distintos quedan CONFLICT aunque uno sea posterior. No existe clasificación persistente general actual/PR/objetivo para todos esos valores. Fecha conocida se conserva; no equivale a vigencia deportiva.

## 2. Investigación y decisiones

- [World Athletics: media maratón](https://worldathletics.org/disciplines/road-running/half-marathon) y [maratón](https://worldathletics.org/disciplines/road-running/marathon): 21,0975 y 42,195 km. **Adoptado:** dividir tiempo de esa carrera por su propia distancia. No hay modelo fisiológico ni equivalencia entre carreras.
- [Vickers y Vertosick (2016)](https://link.springer.com/article/10.1186/s13102-016-0052-y): evaluaron Riegel con exponente 1,07, con calibración favorable hasta media maratón y problemas claros para maratón. **No activado:** una predicción de capacidad actual exige saber qué rendimiento representa el input y bajo qué condiciones es comparable. El editor no distingue sistemáticamente PR, carrera actual, fecha/condiciones ni objetivo. Que una marca permita calcular su promedio histórico no basta para certificar una predicción actual. No se implementan exponentes alternativos ni fórmulas de maratón; 10K pace no se convierte en HM pace.
- [Swain et al. (1998)](https://pubmed.ncbi.nlm.nih.gov/9502363/): HRR se aproxima a reserva de VO2, no a porcentaje de VO2max. **HRR/Karvonen no activado:** la identidad HRrest + fracción × (HRmax − HRrest) no determina qué fracciones equivalen al dominio individual de base/recuperación/umbral. Faltan política de fracciones y evidencia del protocolo/validez de los inputs. No se transforma una banda general en un umbral individual.
- [Tanaka, Monahan y Seals (2001)](https://pubmed.ncbi.nlm.nih.gov/11153730/) y [validación en corredores/ciclistas (2023)](https://pubmed.ncbi.nlm.nih.gov/37109218/): existen modelos poblacionales de HRmax, con incertidumbre individual. **No se adopta estimación de HRmax:** no resuelve la ausencia de una policy de dominio ni de evidencia suficiente para las zonas. El sistema funciona mediante referencias personales o RPE. No se ejecuta 220−edad.
- [Hofmann y Tschakert (2017)](https://www.frontiersin.org/journals/physiology/articles/10.3389/fphys.2017.00337/full) y [Fleckenstein et al. (2025)](https://www.frontiersin.org/journals/sports-and-active-living/articles/10.3389/fspor.2024.1507957/full): intensidad, duración y estructura interactúan. **No se adopta VO2→pace ni 5K→vVO2:** el escalar vo2max no incorpora economía de carrera, velocidad ni protocolo que permitan esa conversión. Se conserva RPE de C2.

Las decisiones de no activar modelos son límites explícitos de esta versión, no afirmaciones de que esas fórmulas carezcan de utilidad científica. No existe RacePerformancePredictionPolicy activa ni un nuevo zoneModel Forge. Zonas declaradas permanecen diferenciadas; no se mezclan con HRR, Garmin o threshold. No se promueven máximos casuales ni mínimos observados.

## 3. Autoridad implementada

`resolveRunningReferences` recibe únicamente running.byMetric y el marcador canónico maxHrMethod. No recibe método, goal libre, dispositivo, RPE, BD, sesión completada ni prompt. Devuelve `RunningReferenceAuthority` v1 / `running_reference_v1`:

- Diecisiete entradas estables, con referenceId/type, RESOLVED/UNRESOLVED/CONFLICT, value/unit, performanceRole, observedAt, freshness y evidencia.
- IntensityEvidence conserva kind, confidence, measurementBasis, source, inputs, algoritmo/version y containsEstimatedData.
- Referencias cuantificables compatibles con la representación DoseReference, sin decidir aún la capacidad de ejecutarlas ni el método apropiado.
- sourceDigest vincula las entradas. `validRunningReferenceAuthority` verifica la proyección y recompone la aritmética contra el snapshot autenticado; no lee datos más recientes.

DIRECT sigue siendo DECLARED aunque el registro tenga confidence=recorded. El marcador formula_edad conserva maxHr como ESTIMATED con containsEstimatedData=true; **no se atribuye a una fórmula calculada aquí** (algorithm=null porque no se conoce el productor real). Un valor desconocido/conflictivo no contiene un número autorizado.

`buildSessionDoseContext` delega su antigua conversión running a esta autoridad; no duplica el algoritmo. 1RM permanece igual. Añade runningReferenceAuthority opcional al contexto v1; contextos/receipts históricos sin esa extensión mantienen su validación anterior.

## 4. Distancias, roles y freshness

| Fuente | Canónico | Referencia derivada | Ejecutabilidad / consumo |
|---|---|---|---|
| tiempo_5k / marcas 5k / history 5k | 5k, segundos | running:5k = tiempo / 5 | Capacidad pace; no equivalencia VO2 |
| tiempo_10k / marcas 10k / history 10k | 10k, segundos | running:10k = tiempo / 10 | Capacidad pace; admisión específica 10K no cambia |
| marcas 21k / history 21k | halfMarathon, segundos | running:halfMarathon = tiempo / 21,0975 | GPS/medición pace available; specific HM v2 la autoriza |
| marcas 42k / history 42k | marathon, segundos | running:marathon = tiempo / 42,195 | Referencia conocida; ninguna nueva policy/goals de maratón |

La semántica 21k/42k procede de las etiquetas exactas del editor, no de substring sobre descripciones de entrenamientos. Se incorporan claves internas de tiempo_media_maraton/tiempo_maraton al mapa existente para esos aliases. No se reescribe storage.

5K/10K conservan algoritmo `race_time_divided_by_kilometres` v1; HM/maratón utilizan `race_time_divided_by_distance` v1. El tiempo es DIRECT y el promedio DERIVED, con vínculo al input y estimación propagada. Es un promedio de la marca declarada, no una predicción ni promesa de estado actual.

Se distinguen tipos CURRENT_PERFORMANCE, PERSONAL_BEST, TARGET_PERFORMANCE y UNCLASSIFIED_PERFORMANCE. El último es el default del editor actual: **no se inventa una clasificación**. La proyección admite performanceRole explícito en un objeto estructurado de marca/historial; no infiere ese rol del texto ni crea un writer/UI nuevo. TARGET_PERFORMANCE queda como evidencia identificada, pero no se compila como referencia ejecutable. Los objetivos futuros en objetivo_principal/objetivo_detalle nunca participan. Un rol desconocido se rechaza en la proyección.

freshness=NOT_ASSESSED conserva el límite histórico. No hay caducidad arbitraria, latest-wins ni garantía de capacidad actual. El uso de promedios propios es una referencia declarada de programación, sujeta a esa limitación, igual que las referencias personales previas; no habilita extrapolar a otra distancia. Una política futura de predicción necesita cerrar esta clasificación y vigencia antes de activarse.

## 5. Resultado por método y dispositivo

| Método | Referencia/prioridad | Sin dispositivo o referencia compatible | Secondary con objetivo |
|---|---|---|---|
| base | easyHr → easyPace | RPE 2–3 | RPE esperado 2–3 |
| threshold | thresholdPace → thresholdHr | RPE 6–7 | RPE esperado 6–7 |
| specific HM | Promedio de la propia HM, policy v2 | RPE 4–5; no predicción desde 5K/10K | RPE esperado 4–5 |
| VO2 | Sin vVO2 autorizada | RPE 8–9 | No aplica actualmente |
| recovery | Sin referencia de recuperación estricta | RPE 1–2 | No aplica actualmente |
| economy | Técnica/drills/pasadas/jump; requiere Execution Guidance | UNRESOLVED explícito | Sin número global inventado |

HR only puede usar easyHr/thresholdHr si existen; HRmax+reposo por sí solos no bastan. GPS+HR aplica la prioridad específica del método; HM requiere pace disponible. Unknown/ambiguous/unavailable no se promueven a available. Conflicto excluye ese tipo y permite únicamente otra alternativa autorizada de C2 o RPE.

Economía es **OUTSIDE_REFERENCE_AUTHORITY / REQUIRES_EXECUTION_GUIDANCE**, expresado en la limitación estructurada `economy_requires_execution_guidance` y la policy C2 UNRESOLVED. La estructura técnica y sus movimientos no necesitan una única referencia fisiológica global; queda deuda de ejecución, no una fórmula de HR pendiente. No cambia su admisión ni se declara resuelta su intensidad.

## 6. Presentación, Builder y receipts

Nueva `presentationVersion=human_v3` para nuevas sesiones del servidor. Comparte proyección con v2, activando exclusivamente la guía secundaria de main y etiquetas de promedios HM/maratón. Ejemplo sintético: HM 1:45:00 → «Ritmo medio de media maratón · 4:59 min/km · RPE esperado 4–5». Base HR → «FC suave · 140 ppm · RPE esperado 2–3». Si RPE es primary, no se duplica secondary.

Renderer solo formatea valores autorizados y ya validados; no deriva ritmos/zonas ni inventa rangos. No muestra DIRECT/DERIVED, algoritmos o confidence. `renderContractSession` revalida antes de renderizar. Builder conserva el target exacto; intentarlo cambiar falla por METHOD_INTENSITY_OUTSIDE_DOMAIN.

human_v2 permanece idéntico, incluidas sus etiquetas anteriores. Receipt autentica presentationVersion. legacySessionView y planBlockLabel reconocen v3 para conservar comparación histórica sin afectar duplicados, intensidad contextual ni etiquetas de bloque. La versión de presentación del objetivo semanal no se modifica. No hay cambio de HMAC, TTL, retries ni persistencia general.

La verificación histórica no recalcula referencias. El guard de contexto vigente antes de persistir sigue pudiendo exigir regeneración si ahora existe evidencia canónica adicional (por ejemplo, una HM antes no proyectada); no se elimina esa protección para aceptar un contexto que ha cambiado de significado.

## 7. Fixtures y verificación

A: sin dispositivo/referencias. B: HR only y FCmax/reposo declarados, sin derivar zonas. C: GPS+HR, 5K/10K y referencias easy/threshold. D: marca propia HM/maratón. E: conflicto perfil/editor/history. F: HRmax marcado estimado y pace propio derivado; la estimación conserva menor autoridad, sin generar una zona ejecutable.

Se prueban los seis métodos con A–F de extremo a extremo: canonical→referencias→capacidad→policy→authority→opciones Builder→propuesta→validator→human_v3. Casos adicionales verifican distancias oficiales, conflicto sin latest-wins, target separado de capacidad, estimación conservada, manipulación de inputs/cálculos y coexistencia de receipts C1/C2/C2.1.

La condición «HM derivada por predicción» se cubre como **no autorizada en esta versión**: 5K/10K solos mantienen fallback RPE, incluso con GPS. No existe una ruta secreta que el Builder pueda activar.

## 8. Criterio de cierre y límites

La cadena de intensidad queda conectada y puede explicar métrica, evidencia, procedencia, ausencia de dispositivo/referencia, conflicto y presentación para cada método. Esto no significa que todas las referencias fisiológicas estén disponibles: HRR, predicción, vVO2 y recovery objetivo continúan sin policy autorizada; economía requiere semántica de ejecución. No se presenta un «cierre fisiológico completo» ni se elimina RPE para aparentarlo.

No se modifican Goal/Strategy/Transfer, disponibilidad, calendario, equipment/environment, feasibility, duplicados, retries, Time/Dose, Week Integrity, regeneraciones, readiness, HealthKit/Garmin, Box/Strength ni datos reales.

## 9. Validación ejecutada y archivos

- Tests nuevos C2.1: **42/42**.
- C1+C2+Human Presentation seleccionados: **156/156**.
- Captura de perfil: pasa; se actualiza la expectativa histórica que excluía 21K/42K, conservando rechazo de 50K y valores malformados.
- Suite final `node --test --test-concurrency=4 lib/**/*.test.mjs`: **1776/1776**, cero fallos/skips, 118,6 s. Incluye los flujos de Session Authority, Data Sufficiency y planificación/persistencia.
- `npx tsc --noEmit`: exit 0.
- Lint: **delta 0** frente a HEAD. sessionAuthority.ts conserva sus 19 errores no-explicit-any; no se introduce ninguno. Los archivos nuevos y el resto de modificados tienen cero errores/warnings.
- `git diff --check`: pasa. Commit nuevo local, sin push.

Archivos incluidos (14):

1. `lib/athlete/athletePrescriptionContext.ts`: captura de aliases y performanceRole explícito.
2. `lib/athlete/profileCaptureIntegrity.test.mjs`: regresión de la captura.
3. `lib/sports/runningReferenceAuthority.ts`: autoridad nueva, proyección y verificación.
4. `lib/sports/runningReferenceAuthority.test.mjs`: fixtures A–F y recorrido completo.
5. `lib/sports/sessionDoseContext.ts`: composición con la autoridad nueva.
6. `lib/sports/runningIntensityPolicies.ts`: specific HM v2 consume su promedio propio.
7. `lib/sports/runningIntensityPolicies.test.mjs`: los providers sintéticos C1 se identifican sin fingir una proyección C2.1 válida.
8. `lib/sports/humanCoachingProjection.ts`: primary+secondary y etiquetas nuevas solo en v3.
9. `lib/sports/sessionHumanRenderer.ts`: presentación versionada.
10. `lib/sports/sessionPresentation.ts`: autenticación/versiones y comparación legacy.
11. `lib/sports/structuredSession.ts`: dispatch de presentación tras validación.
12. `lib/sports/sessionAuthority.ts`: selección y firma de human_v3 para sesiones nuevas.
13. `lib/sports/planPresentation.ts`: etiquetas reconocen sesiones v3.
14. `docs/c21-running-reference-authority.md`: auditoría, fuentes, decisiones y límites.
