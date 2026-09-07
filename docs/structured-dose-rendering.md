# FORGE — Fase 3C: Structured Dose + Professional Rendering

## Auditoría y decisiones

1. **Auditoría inicial.** Revisados `StructuredSession`, shape/contract validators, renderer, `AllowedTrainingContract`, entrada real del Builder, Movement/Stimulus/Workout Structure Libraries, recibos, guardado semanal, confirmación de pendientes, patch directo y cierre de debilidades. Leída la guía local Next de Route Handlers. Se reutilizan estas autoridades y el lector/proyección 3A.
2. **Root causes.** El schema anterior admitía cualquier dosis con reps, duración o distancia, aunque fuera insuficiente para el formato. Prohibía intensidad, no conservaba el reloj del metcon, no comparaba con el presupuesto y renderizaba segundos. El recibo contenía la propuesta, pero la sesión persistida perdía esa estructura. El renderer fijaba `debilidad_relacionada=null`; los transportes de modificación copiaban solo campos escalares.
3. **Schema anterior.** Sin versión explícita: `stimulusId`, `structureId`, tres bloques obligatorios, movimientos y cinco números opcionales: sets/reps/durationSeconds/distanceMeters/restSeconds. `explanation` consultiva. Contratos v1/v2.
4. **Schema nuevo.** El mismo `StructuredSessionProposal` evoluciona con `schemaVersion:2`; contratos v3 con `doseContext` de servidor. Warmup y main, cooldown opcional. Dosis añade `intensity`, `tempo`, `perSide`. Main admite `formatDose` con reloj, rondas, cap o ciclo trabajo/descanso según formato. No hay schema deportivo paralelo ni reglas de dosis copiadas en route.ts.
5. **Legacy.** Contratos/recibos v1/v2 mantienen su validación y rendering históricos. La generación real emite v3; no existe opción de cliente para degradarla. Las filas sin `structuredPrescription` siguen siendo datos estructurados desconocidos, sin extraer dosis retrospectiva. Pruebas firman fixtures del formato anterior y verifican su lectura.

## Semántica y referencias

6. **Reglas por modalidad.** `validateSessionDose` es la autoridad única después del shape y la validación de catálogo, scope, restricciones, patrón main y estructura. No evalúa si la sesión es óptima ni crea un modelo fisiológico.
7. **Strength.** Series, repeticiones, intensidad y descanso explícitos en main. Una duración no sustituye reps para un levantamiento dinámico. Se añade `dose_basis:duration` a tres holds inequívocos del catálogo: plank, hollow_hold y handstand_hold; requieren tiempo, series, intensidad y descanso. No se infiere por substrings.
8. **Weightlifting.** Repeticiones/series y RPE técnico o % de una referencia exacta admitida. Un complejo tiene rondas y descanso entre rondas. No se toma automáticamente el 1RM de Snatch para Hang Snatch: falta una relación canónica de benchmark entre variantes. En ese caso se usa RPE/RIR; se conserva el patrón/intent de 3B.
9. **Running continuous.** Duración o distancia, más intensidad. Se mantiene la prohibición de repeticiones/pausas en un formato continuo. El patrón run/cyclic requiere volumen temporal o distancia, no «reps» aisladas.
10. **Intervals.** `sets` representa el número de repeticiones del intervalo; distancia o duración por repetición, intensidad y `restSeconds` obligatorios. La recuperación se suma n−1 veces. El renderer muestra, por ejemplo, `6 × 800 m`.
11. **Threshold/tempo.** Mismas reglas: tempo continuo sin fraccionamiento, o intervalos con conteo y recuperación. Una referencia de umbral debe estar en el contrato; una palabra «umbral» no crea una zona.
12. **CrossFit/metcon.** AMRAP/density/death_by tienen duración. EMOM/E2MOM tienen reloj y ciclo trabajo/descanso consistente. For Time, rounds, couplet/triplet, chipper y ladder exigen rondas y cap. Los movimientos conservan dosis e intensidad relativa o referencia admitida; no se inventa el peso de wall ball, barra o kettlebell.
13. **Rounds/caps.** Se almacenan en `formatDose`, no en descripción libre. Se valida compatibilidad de campos, suma trabajo+descanso, intervalo de EMOM/E2MOM y concordancia reloj×rondas. Un reloj ficticio no puede ocultar la duración de series de fuerza. Se mantienen las reglas de cardinalidad de couplet/triplet. No se añade una taxonomía nueva de supersets.
14. **Rest.** Segundos internos, explícitos cuando corresponden; 180 se presenta como `3 min`. Cero es una declaración explícita de ausencia de pausa, no un valor rellenado por el servidor. No se inventa el modo de recuperación (andar/trotar).
15. **Tempo.** Array de cuatro fases no negativas, con suma positiva; representación `4-0-1-0`. Opcional. Cuando existe, sustituye la estimación genérica de tiempo por repetición.
16. **Benchmark resolution.** Solo resoluciones 3A no conflictivas, unidades válidas y referencia de movimiento exacta. Se conservan fuente y fecha disponible. Una referencia declarada sigue siendo declarada: no se promueve a medición certificada ni se inventa una fecha. No se introduce un vencimiento deportivo arbitrario.
17. **%1RM→kg.** Cálculo determinista, fuera del LLM. 150 kg×75%=112.5 kg. Sin incremento de equipo canónico se conserva el resultado matemático redondeado a 0.01 kg; no se inventa un disco ni se redondea a 115 kg. Es un objetivo calculado, no una afirmación de que esa combinación de discos esté disponible.
18. **NRM.** 3RM, 5RM, PR sin tipo y unknown RM no se convierten en 1RM. No se encontró un algoritmo canónico aprobado de e1RM que reutilizar y no se añadió uno.
19. **Fallback RPE/RIR.** El LLM puede proponer esos valores explícitos dentro del schema. No se rellenan silenciosamente ni se asignan kilos. RIR no se admite como intensidad de carrera/cíclico.
20. **Pace/HR.** IDs de referencias 3A para zonas, FC suave/umbral, ritmos suave/umbral. Un tiempo 5K/10K inequívoco permite calcular su ritmo medio aritmético, conservando fuente; no predice otra distancia. No se generan zonas desde edad, FC máxima o HRV. Los valores de ritmo/ppm no son campos numéricos editables de la propuesta LLM.

## Tiempo, objetivo y persistencia

21. **Budget.** Se usa el máximo resuelto por 3A en segundos. Una estimación superior se rechaza; un total no acotable con máximo finito también. «Más de 90 min» conserva máximo null. Conflictos entre presupuestos detienen la preparación. Falta de dato no equivale a un máximo inventado.
22. **Duración.** Suma warmup, trabajo, recuperaciones, cooldown y transiciones. Trabajo temporal se cuenta directamente; distancia con ritmo canónico se calcula; distancia sin ritmo es indeterminada. Reps sin tempo se estiman operacionalmente a 2–6 s/rep y las transiciones fuera de bloques ya temporizados a 0–120 s. Son supuestos explícitos y versionados de estimación, no límites clínicos ni garantía del tiempo real. El cap acota el bloque; no promete terminar sus rondas. No se pide al LLM un total final. Se mantiene el límite amplio de representación y se cuentan también rondas/lados.
23. **Formato humano.** `formatDuration` produce 4800→`1 h 20 min`, 3600→`1 h`, 3300→`55 min`, 2700→`45 min`, 150→`2 min 30 s`, 90→`1 min 30 s`, 45→`45 s`. No se cambian las unidades numéricas internas.
24. **Objective.** Texto determinista desde Goal/adaptación/rol del intent. El intent original se conserva íntegro. Los intents legacy/genéricos siguen declarando su limitación: no se inventa un Goal para completar la frase.
25. **Por qué.** Se deriva de Goal, adaptación, bloque/semana, objetivo semanal firmado, debilidad y vecinos inmediatos del recibo cuando existen. Los vecinos se describen como hechos del calendario; no se afirma que no haya interferencia ni que una sesión reduzca fatiga. Sin esos datos se declara la limitación. No se acepta una explicación libre del LLM en el schema nuevo.
26. **Weakness.** Se valida que el ID del intent corresponde a una entrada 3A activa con el patrón correcto. Main debe cumplir ese patrón. `structuredPrescription.weakness` conserva ID, nombre y fuente; `debilidad_relacionada` usa nombre_visible cuando existe para compatibilidad con `weakness_exposure`, o el ID. El cierre reconoce ambos. El pendiente del Coach ya no fija null.
27. **Persistencia.** JSON existente de sesión: `structuredPrescription` conserva propuesta completa, intent/objetivo, rol, vecinos, referencias usadas, cargas calculadas por bloque/movimiento, estimación, presupuesto, digest de evidencia y diagnósticos. Se conserva al admitir el recibo y guardar; no se persiste el recibo efímero. Confirmación/patch escalar recuperan metadata ausente únicamente del recibo autenticado y rerenderizado. Metadata presente alterada se rechaza. No se modificó el núcleo de identidad/CAS.
28. **Dose validator.** Shape estricto más `validateSessionDose`. Distingue `SESSION_DOSE_INCOMPLETE`, referencias no autorizadas, incoherencia de formato, tiempo indeterminado y `SESSION_BUDGET_EXCEEDED`. No admite kg, ritmos o referencias inventadas como campos de la propuesta.
29. **Fail closed.** Ninguna propuesta nueva incompleta obtiene sesión/recibo. Guardar revalida y compara texto y estructura. Antes de persistir se vuelven a comprobar restricciones y evidencia de dosis; cambios de referencias o presupuesto revocan la sesión. Un Goal estratégico distinto del contexto actual también rechaza.
30. **Retry.** Máximo dos intentos sobre el mismo contrato congelado. El segundo recibe los códigos concretos de dosis/estructura rechazados. No hay reparación de dosis ni reintento infinito; referencias/IDs no admitidos no otorgan nuevas alternativas.

## Fixtures y ejemplos

31. **Fuerza con 1RM:** 150 kg, 4×5 al 75%, 180 s; válida, 112.5 kg y `Descanso: 3 min`.
32. **Sin 1RM:** 4×5, RPE 7, 180 s; válida y sin kilos.
33. **NRM:** fixtures 5RM/3RM/unknown impiden porcentaje; RPE permanece válido. Referencias 1RM contradictorias tampoco autorizan carga.
34. **Z2:** 45 min con referencia 130–145 ppm; fuente preservada y rendering legible.
35. **Running vago:** sin volumen se rechaza. Z2 inexistente se rechaza aunque el movimiento se llame rodaje_z2.
36. **Intervalos:** 6×800 m a referencia 10K de 50:00→5:00 min/km, recuperación 2 min. Main calcula 34 min; sin recuperación falla.
37. **AMRAP:** reloj 12 min y movimientos admitidos. El ejemplo usa wall ball y box jump; no fuerza pull_up dentro de capacidad_glucolitica porque su metadata actual no lo incluye. No se amplió el pool para satisfacer una lista de ejemplo.
38. **For Time:** 5 rondas, cap 18 min, conservados en JSON y texto. EMOM 16 min prueba ciclo 40 s trabajo+20 s descanso.
39. **Budget:** 63 min de carrera más preparación no caben en 45 min; rechazo determinista.
40. **Open ended:** ese mismo máximo no se impone a «más de 90 min»; el límite superior permanece desconocido.
41. **Híbrido:** [structured-dose-fixtures.json](./structured-dose-fixtures.json) reutiliza las opciones de media maratón de 3B, scope running+Box y disponibilidad lunes/miércoles/sábado y martes/jueves. Cada TRAIN contiene dosis validada, objetivo, intent y estimación. Usa los movimientos compatibles con el método de apoyo de 3B; no convierte `fuerza_general` en `fuerza_maxima` para introducir Back Squat. Son fixtures de validación, no un plan individual optimizado.
42. **Ejemplo final de renderer:**

```text
OBJETIVO
Trabajar fuerza maxima con patrón squat.
[En este fixture aislado el Goal no está resuelto; en el híbrido procede de 3B.]

DURACIÓN
11 min 40 s–15 min (estimación con descansos y transiciones)

CALENTAMIENTO
back squat
2 min @ RPE 3

BLOQUE PRINCIPAL
Series de fuerza
back squat
4 × 5 @ 112.5 kg (75% 1RM)
Descanso: 3 min
```

El artefacto JSON contiene el texto exacto de producción y los datos que lo originan; no es una maqueta independiente. La UI existente presenta descripción y `por_que` por separado. Cooldown es opcional, no un bloque de relleno. Repetir exactamente la dosis de main en preparación se rechaza y un cooldown de fuerza por %1RM se rechaza. La biblioteca todavía no certifica todos los usos posibles de warmup/cooldown; no se ha creado un motor científico para inferirlos.

43. **Unidades/precision:** kg, km/m, h/min/s, ppm y min/km. Cargas con máximo dos decimales; ritmos redondeados al segundo, sin 4:59.999. El material/incremento de carga legacy sigue sin inventario canónico fiable; se documenta, no se inventa.
44. **Regresión 3B:** Goal, demanda, método e intent no se cambian para facilitar la dosis. Builder recibe el slot firmado y conserva vecinos del mismo recibo. La modificación del Coach transmite el intent existente; un nuevo estímulo incompatible falla en vez de borrar la estrategia. Pruebas de estrategia y cadena real hasta guardado pasan.
45. **Coach:** generación v3 y pendientes conservan la dosis; confirmación y patch la transportan a la validación existente. Restricciones, disponibilidad y scope siguen siendo previos a la generación.
46. **Focus:** las fuentes delegadas siguen definiendo autoridad y calendario; equipo/actividad externos no se convierten en gestionados. Suite de Focus y recibos sin cambios de privilegios.
47. **Supervisión:** sigue sin poder generar prescripciones; rechazo antes del LLM en los tests de rutas reales. 3C no amplía ownership.

## Validación y entrega

48. **Migraciones:** ninguna. JSON de sesiones y pendientes existente. 3A no se ha modificado; sin nuevas tablas ni cambios destructivos de contrato.
49. **Tests:** `node --test lib/**/*.test.mjs`: 1018/1018, cero fallos. Incluye 32 tests nuevos de dosis/rendering y cuatro nuevos de autoridad/restauración, además de las 982 pruebas previas adaptadas cuando ahora generan v3. Cubiertos contratos legacy, todos los estímulos anunciados, restricciones, Coach/Focus/Supervisión, 3B, guardado real, manipulación de estructura y revocación de presupuesto.
50. **TypeScript:** `npx tsc --noEmit`, exit 0.
51. **Diff:** `git diff --check`, exit 0, sin errores.
52. **Archivos:** nuevos `sessionDoseContext.ts`, `sessionDose.ts`, `sessionProfessionalRenderer.ts`, `sessionDose.test.mjs` en `lib/sports`, más este informe y fixtures JSON. Modificados `structuredSession.ts`, `allowedTrainingContract.ts`, `sessionGeneration.ts`, `sessionAuthority.ts`, `movementLibrary.ts`, `app/api/chat/route.ts`; tests/harness actualizados en `sessionAuthority`, `sessionContractIntegration`, `trainingFeasibility`, `trainingContractTestRuntime`, `allowedWeeklyPlanContract`, `weeklyAuthorityBinding`, `goalTransferStrategy`.
53. **Commit:** `feat: enforce structured session dose and professional rendering`. SHA comunicado en la entrega para evitar autorreferencia del commit.
54. **Git status:** comprobado después del commit y comunicado en la entrega.
55. **NO PUSH:** no se ejecuta push.

No se implementan acute/chronic load, ACWR, monotony, strain, modelo readiness×load, duplicación entre sesiones hermanas, interferencia global, WeeklyOutcome ni progresión de bloque. Permanecen para 3C.5/3D/3E/3F. Las estimaciones de esta fase evalúan completitud y encaje temporal estimado; no certifican seguridad clínica ni optimalidad deportiva.
