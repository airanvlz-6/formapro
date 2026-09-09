# C2 — Running intensity domain policies

Base: `f15517ae38bd7a2d5acb2a0c309cd40cdeffc3d1`. Implementación backend compartida; sin cambios de UI, persistencia, estrategia, transferencias ni Time/Dose. Sin Karvonen, nuevas zonas o conversiones entre distancias.

## Evidencia y decisiones del dominio

Fuentes consultadas antes de codificar las bandas (9 septiembre 2026):

1. [Olympiatoppen, escala de intensidad, versión 2 (2024), versión inglesa](https://olt-skala.nif.no/en). Distingue control interno y externo, percepción y diferencias individuales. Describe CR10 muy ligero 1–2, ligero 2–3, algo duro 4–5, duro 6–7 y muy duro 8–10. Advierte de limitaciones de HR en intervalos cortos. **No importamos sus porcentajes de FCmax ni sus zonas como zonas del atleta.**
2. [Hofmann y Tschakert, Intensity- and Duration-Based Options to Regulate Endurance Training (2017)](https://www.frontiersin.org/journals/physiology/articles/10.3389/fphys.2017.00337/full). Fundamenta la individualización del control y la interacción intensidad/duración. Una intensidad relativa poblacional no determina por sí sola un umbral individual. C2 no transforma las duraciones descriptivas del catálogo en reglas fisiológicas.
3. [Fleckenstein, Braunstein y Walter, Faster intervals, faster recoveries (2025)](https://www.frontiersin.org/journals/sports-and-active-living/articles/10.3389/fspor.2024.1507957/full). Comparación experimental de intervalos cortos y largos: alcanzar un estímulo VO2 depende de la estructura del trabajo. No autoriza identificar cualquier ritmo 5K con una velocidad VO2.

Las prioridades y la asociación método→guía perceptiva de la tabla siguiente son **decisiones de dominio Forge C2 v1 informadas por esas fuentes**, no resultados medidos del atleta ni equivalencias fisiológicas universales. La guía RPE regula el esfuerzo percibido durante el trabajo principal; no es el session-RPE retrospectivo. El límite 9 de VO2 es una decisión de prescripción submáxima dentro de la categoría muy dura; no garantiza alcanzar un porcentaje concreto de VO2max.

## Auditoría C1

`MethodIntensityPolicy` entrega targets completos por movimiento. `IntensityTarget.primary` utiliza `DoseIntensity`; `secondary` permite una guía RPE/RIR con evidencia separada. `IntensityEvidence` conserva DIRECT/DERIVED/ESTIMATED/SUBJECTIVE, confianza, base, inputs, algoritmo y estimación. Capacidad y referencia se intersectan en `prescriptionGenerationOptions.executableReferenceIds`.

`sessionAuthority.generateTrainingSession` adjunta la autoridad al contrato final antes del Builder. `sessionGeneration.generateContractSession` clona/congela el contrato y exige copiar exactamente primary en main. `structuredSession.validateSessionAgainstTrainingContract` aplica la autoridad después de forma, dosis y suficiencia. `validateMethodIntensity` compara el target exacto; no contiene números deportivos. Receipt conserva contrato/propuesta firmados; verificar no recalcula una policy vigente sobre un receipt histórico.

## Policies exactas v1

| Método / ID de policy | Dominio | Prioridad y referencias compatibles | Fallback / guía secundaria |
|---|---|---|---|
| running_base / running_base_intensity | Aeróbico fácil | HR: easyHr → pace: easyPace → RPE | RPE 2–3 |
| running_threshold / running_threshold_intensity | Umbral individual | pace: thresholdPace → HR: thresholdHr → RPE | RPE 6–7 |
| running_specific / running_specific_intensity, half_marathon | Resistencia específica del objetivo | No existe referencia HM canónica; RPE | RPE 4–5 |
| running_specific / running_specific_intensity, 10k | Resistencia específica del objetivo | pace: 10k → RPE, solo mismo goal | RPE 6–7 |
| running_vo2 / running_vo2_intensity | Intervalos aeróbicos de esfuerzo alto | RPE; ninguna referencia objetiva actual autorizada | RPE 8–9 |
| running_recovery / running_recovery_intensity | Recuperación muy ligera | RPE; ninguna referencia objetiva actual autorizada | RPE 1–2 |
| running_economy / running_economy_intensity | Coordinación/técnica | Sin métrica autorizada para todo el dominio actual | UNRESOLVED; sin guía numérica inventada |

Cuando se usa referencia, la misma banda RPE de la tabla pasa a secondary, con propósito `perception_guide` y evidencia SUBJECTIVE. Con fallback es primary y no se duplica como secondary. Las bandas se copian completas: no se permite al Builder estrecharlas, ampliarlas ni inventar un intervalo alrededor de una referencia.

Base prioriza control interno de esfuerzo fácil, con ritmo fácil personal como alternativa. Umbral prioriza el ritmo individual específico para controlar el trabajo externo sin perseguir la respuesta tardía de HR; admite thresholdHr personal como alternativa. Son prioridades por método, no una jerarquía global de dispositivos.

Las etiquetas z1…z5 no llevan sistema de zonas ni límites de dominio canónicos. No se equiparan automáticamente a recuperación/base/umbral/VO2. easyHr/easyPace describen rodaje suave, pero no prueban el dominio más estricto de recuperación. VO2 tampoco tiene hoy una referencia vVO2 canónica. Por eso recuperación y VO2 usan RPE incluso con dispositivos y referencias incompatibles: no se está descartando una referencia objetiva autorizada.

## running_specific y economía

El resolver lee `intent.goalId`; strategy no se reinterpreta. Half-marathon no dispone de pace canónico específico: 21K/42K no se proyectan y C2 no añade aliases. Su RPE 4–5 es un fallback de trabajo sostenido controlado, **no una estimación del esfuerzo ni del ritmo de carrera de esa persona**. No usa 5K, 10K, thresholdPace ni thresholdHr como sustitutos.

La variante 10k conserva exactamente el promedio de su propia referencia 10K, sin mejora objetivo ni equivalencia de distancia. Es una rama del resolver cubierta unitariamente, **no una nueva ruta admitida**: `GOAL_DEMANDS['10k']` excluye resistencia_especifica y su contrato sigue rechazándose. Hyrox y los demás goals quedan UNRESOLVED en este método; no existe policy específica autorizada para ellos.

Economía tiene una estructura admitida, `tecnica_carrera` (skill_practice), pero movimientos de patrones run y jump. Contiene drills, pasadas y progresivos con pausas para calidad. No dispone de autoridad suficiente de intensidad por movimiento y duración de pasada antes del Builder. Su policy existe, explicita esos requisitos y queda UNRESOLVED en todos los subcasos actuales. Conserva el comportamiento C1 compatible; **no se declara resuelta ni se certifica su intensidad fisiológica**. Resolverla exige una fase posterior de semántica de ejecución, fuera de C2.

## Datos personales y capacidades

`buildSessionDoseContext` sigue copiando únicamente referencias canónicas resueltas. Añade procedencia de intensidad y una proyección versionada de estados resolved/unknown/conflict para los once tipos de referencia running existentes. No copia candidatos, valores conflictivos ni perfil. DIRECT significa declaración directa, no medición de laboratorio. `recorded` conserva la autoridad canónica del registro, sin promover measurementBasis a MEASURED.

El promedio 5K/10K ya se calculaba dividiendo tiempo por distancia: ahora se etiqueta DERIVED con algoritmo `race_time_divided_by_kilometres` v1 y fuente. No se introduce una fórmula fisiológica. Las referencias ESTIMATED/DERIVED representables en C1 conservan su marca; esta fase no añade un productor de estimaciones. Dentro del mismo tipo compatible se prioriza DIRECT sin estimación, DERIVED sin estimación, estimadas y legacy sin detalle, con desempate por ID. Los conflictos canónicos excluyen el tipo antes de esa selección: la prioridad no resuelve discrepancias entre declaraciones personales.

| Dispositivo/evidencia | Base | Umbral |
|---|---|---|
| Sin HR ni pace disponibles, cualquier referencia | RPE 2–3 | RPE 6–7 |
| Solo HR, referencias HR compatibles | easyHr + guía | thresholdHr + guía |
| Solo HR, sin referencia HR compatible | RPE | RPE |
| GPS+HR, ambas compatibles | easyHr + guía | thresholdPace + guía |
| GPS+HR, solo pace compatible | easyPace + guía | thresholdPace + guía |
| GPS+HR, solo HR compatible | easyHr + guía | thresholdHr + guía |
| Referencia preferida en conflicto | Otra métrica autorizada disponible, o RPE | Otra métrica autorizada disponible, o RPE |

Unknown/ambiguous/unavailable no autorizan medición. FCmax sola nunca crea referencias ejecutables. La matriz de tests fija ambas capacidades explícitamente; no asume que la opción histórica «sin dispositivo» signifique que distancia/ritmo no se puedan medir por otros medios.

## Schema, autoridad y diagnóstico

La extensión `MethodIntensityAuthority.version=2` vincula además estructuras y referenceResolution mediante sourceDigest. C1 version=1 conserva su digest histórico y las policies de prueba inyectadas. SessionDoseContext v1 mantiene sus campos y añade metadata opcional; no hay cambio de schema de propuesta, tablas ni migración.

Los targets se resuelven en el servidor con orden determinista. Builder solo copia primary; no puede escoger un objetivo ejecutable pero incompatible. Se mantienen validación, dos intentos y semántica de retry. `METHOD_INTENSITY_OUTSIDE_DOMAIN` no se añade a nuevos retries.

El log existente emite exclusivamente version/status/reason/scope y `codesCsv` acotado a seis códigos: RESOLVED, NO_CAPABILITY, NO_REFERENCE, REFERENCE_CONFLICT, FALLBACK_RPE y POLICY_UNRESOLVED, con prefijo METHOD_INTENSITY_. No emite valores HR/pace, fuentes, IDs personales, perfil ni texto libre. NO_REFERENCE también indica que el catálogo no ofrece un tipo compatible para el dominio. El catch del logger conserva el resultado.

Renderer no cambia: ya representa el primary de la referencia o RPE y conserva la autoridad completa en structuredPrescription. La guía secundaria queda disponible como hecho firmado. Mostrarla en prosa puede hacerse en C2.1; no se cambia la regeneración de texto de receipts human_v2 existentes.

## Validación y límites

Tests nuevos: matriz seis métodos × tres dispositivos × siete estados de referencia; contraejemplos completos; prioridades y alternativas; conflicto; goals de specific; economía; doce métodos fuera de scope; vinculación; fallos de logger; opciones Builder y exactitud. C1 conserva cobertura de receipts antiguos, targets inyectados, metadata y manipulaciones.

No se prueban como rutas integradas las combinaciones que 3B ya prohíbe. No hay objective fallback para recuperación/VO2, ni policy fisiológica resuelta para economía. No se garantiza una dosis efectiva, un tiempo en VO2 ni una preparación específica sin referencia: esa autoridad pertenece a otras fases.

### Resultado ejecutado

- C1+C2: **145/145**, incluidos 137 tests nuevos C2.
- Test integrado 3A→estrategia→Planner→Builder→admisión: pasa. Su proveedor simulado ahora copia primary del contrato; antes devolvía un RPE fijo ignorando las instrucciones nuevas. No se debilita ninguna aserción ni se modifica el código de estrategia.
- `node --test --test-concurrency=4 lib/**/*.test.mjs`: **1734/1734**, cero fallos/skips, 279,6 s. Incluye Session Authority, Data Sufficiency, Human Renderer y los flujos semanales.
- `npx tsc --noEmit`: pasa.
- ESLint de los siete archivos TS/MJS modificados: cero errores, cero warnings; ninguna deuda introducida.
- `git diff --check`: pasa.
- Ocho archivos incluidos: este informe; runningIntensityPolicies.ts y su test; methodIntensityAuthority.ts y su test; sessionDoseContext.ts; sessionGeneration.ts; goalTransferStrategy.test.mjs.
- Commit nuevo local; sin migración, amend, rebase ni push.
