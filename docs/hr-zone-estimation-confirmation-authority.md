# Running HR Zone Estimation & Confirmation Authority

## Auditoría previa (HEAD 6b82ad3)

Mapa comunicado antes de modificar producción:

| Frontera | Código real | Semántica encontrada |
| --- | --- | --- |
| Onboarding | `app/FormaPro.tsx`: preguntas `fc_max`, `fc_reposo`, `dispositivo`; `avanzar`, `iniciarChat` | Las respuestas forman `perfil`; `guardar_usuario` guarda ese perfil. Los campos de FC son opcionales y condicionados al pulsómetro. |
| Persistencia | `app/api/chat/route.ts`: `guardar_usuario`, `hr_zone_bootstrap` | El bootstrap usa la identidad autenticada existente; la actualización genérica no permite escribir `hrZoneBootstrap`. |
| Proyección | `lib/athlete/athletePrescriptionContext.ts`: `runningFields`, `projectAthletePrescriptionProfile` | `fc_max`/`fc_maxima` → `maxHr`; `fc_reposo` → `restingHr`. Conserva fuente, resuelve conflictos y transporta `perfil.hrZoneBootstrap`. |
| Capability | `lib/athlete/prescriptionSignals.ts`: `projectPrescriptionSignals` | Las opciones explícitas de pulsómetro habilitan `capability.canMeasureHeartRate`. |
| Observaciones | `lib/athlete/loadAthletePrescriptionContext.ts` | Recovery/FC observada se mantiene separada de las referencias declaradas proyectadas. |
| Propuesta/confirmación | `lib/athlete/hrZoneActions.ts`: `hrZoneAction`; `lib/athlete/hrZoneBootstrap.ts` | Propuesta HRR o declaración; token HMAC con usuario, propuesta, digest previo y caducidad; confirmación con digest exacto; escritura CAS del perfil. |
| Admisión | `admittedHrZones` | Sistema declarado confirmado, conjunto completo de declaraciones legacy, estimación confirmada con inputs actuales coincidentes. Una propuesta sin confirmar no es ejecutable. |
| Referencia | `lib/sports/runningReferenceAuthority.ts`: `resolveRunningReferences` | `running:confirmedBaseZone` copia Z2 exacta y añade `zoneCompatibility`. La evidencia estimada sigue siendo `ESTIMATED`. |
| Prescripción | `runningIntensityPolicies` → `methodIntensityAuthority` → contrato → `sessionGeneration` | Selección de referencia por dominio/capability, sin cálculo de zonas en Builder. |
| Validación/save | `sessionDose`, `structuredSession`, `sessionAuthority`, `prepareWeeklyCandidate`, `planMutation`, `planPersistence` | Validación del contrato, recibo, admisión y persistencia de referencias estructuradas. |
| Presentación | `structuredSession`, `humanCoachingProjection` | Z2 y ppm primarios; RPE secundario como guía de percepción. |

El digest anterior incluía `generatedAt`, por lo que no identificaba establemente la propuesta fisiológica. `validHrZoneSystem` reconstruía la propuesta HRR para validar su contenido. `propose` podía emitir otra propuesta aunque hubiera un sistema admitido. Un cambio de inputs excluía el sistema, pero no tenía respuesta explícita propia.

## Política encontrada

`lib/sports/hrrZonePolicy.ts`: `HRR_POLICY.id = hrr_5_zone_v1`, versión 1. El archivo identifica sus límites como constantes de producto, no umbrales de laboratorio. Fracciones existentes: 0,50; 0,60; 0,70; 0,80; 0,90; 1,00.

La única fórmula numérica continúa allí: `round(restingHr + fraction * (maxHr - restingHr))`. El límite superior de cada zona, salvo Z5, es el siguiente corte menos 1. No se introdujeron nuevos porcentajes ni una fórmula por edad.

Fixture sintético de onboarding, FCmax 190 y FCreposo 55: Z1 123–135, Z2 136–149, Z3 150–162, Z4 163–176, Z5 177–190 ppm. No son datos de un atleta productivo.

## Cambios e invariantes

- `lib/athlete/hrZoneEstimationAuthority.ts`: propuesta fisiológica pura, sin reloj ni decisiones de sesión. Misma entrada y versión → mismo objeto y `sourceDigest`. Declara `FORGE_ESTIMATED_HRR`, `ESTIMATED`, `HRR`, política, inputs y fuentes, zonas y `containsEstimatedData=true`.
- `lib/athlete/hrZoneBootstrap.ts`: extensión opcional `estimation` y `snapshotSignature`. El nuevo `proposalDigest` excluye la fecha de emisión; la firma del snapshot autentica también esa fecha y el estado/fecha de confirmación. El token de transporte conserva usuario, caducidad y digest previo. La confirmación vuelve a firmar el estado confirmado sin cambiar la estimación.
- La lectura de los nuevos snapshots verifica firma, digest, integridad y versión vigente, sin invocar la fórmula HRR. La firma usa la autoridad HMAC ya existente, con propósito separado `hr-zone-snapshot-v2`. No hay migración, duplicación en `z1_fc`…`z5_fc` ni escritura al leer.
- Compatibilidad explícita: los snapshots anteriores sin `estimation` mantienen **su verificación anterior**, incluida la comprobación numérica HRR si eran estimados. Se devuelven intactos; no se recalculan para sustituir sus zonas, no se convierten al formato nuevo ni se emite automáticamente otra propuesta. Esta compatibilidad no atribuye una firma retrospectiva inexistente. El test de cero llamadas a HRR corresponde al nuevo circuito de propuesta → confirmación → reload.
- `lib/athlete/hrZoneActions.ts`: `ADMITTED` devuelve el sistema existente sin nueva propuesta; `STALE_INPUTS` detecta cambios explícitos; `STALE_SYSTEM` evita recalcular automáticamente un sistema confirmado inválido o de política no vigente. Una declaración manual explícita sigue siendo posible. No se añade un flujo de auto-reconfirmación.
- `components/RunningHrBootstrap.tsx`: muestra los estados del servidor y permite continuar con un sistema admitido sin escribir ni reconfirmarlo. La confirmación de propuestas conserva token + digest, no texto libre.
- `lib/sports/runningIntensityPolicies.ts`: versiones 2 de base/long run priorizan `confirmedBaseZone` sobre `easyHr`, siguiendo el orden solicitado. No cambian compatibilidad Z2, límites, RPE ni otros dominios. Declaraciones completas siguen precediendo a estimaciones en la admisión existente; no se añade ninguna ruta de dispositivos.
- Las estimaciones confirmadas siguen siendo `ESTIMATED + USER_CONFIRMED`; inputs, algoritmo, política y source digest permanecen en el sistema canónico transportado por el contrato/recibo. La referencia ejecutable conserva el origen estimado y el digest de la propuesta mediante `zoneCompatibility`.

No se modifican B3/B3.3, distribución semanal, whole-week ni Builder. La versión nueva de precedencia puede invalidar contratos en vuelo emitidos con la política anterior, conforme a la comprobación de autoridad existente; no se relajan validadores para admitirlos. La rotación de la clave de firma invalida las nuevas firmas antiguas y produce exclusión/estado explícito, nunca recálculo automático.

## Pruebas

`lib/sports/hrZoneEstimationAuthority.test.mjs` añade 24 casos: A–M, dos cambios de inputs, manipulación de campos y límites todavía coherentes, cambio de versión, compatibilidad de snapshots antiguos, precedencia e integración completa para base/long run. Prueba ausencia de llamadas a HRR en reload con una función que falla si se invoca.

El test de RHR observada usa el loader real y su contexto de recuperación preparado, variando la observación de 55 a 51 mientras mantiene la declaración 55. No conecta a HealthKit ni modifica datos. Los tests de persistencia usan adaptadores de almacenamiento en memoria y serialización JSON con acciones, CAS, admisión, recibos y módulos de persistencia reales. Builder usa una respuesta controlada y validada; no requiere un LLM remoto.

`lib/sports/hrZoneBootstrap.test.mjs` actualiza únicamente la expectativa de precedencia sistema completo → referencia individual.

Validación focalizada: 414/414. Suite completa (`node --test --test-concurrency=4 'lib/**/*.test.mjs'`): 2219/2219, sin fallos ni omitidos. TypeScript: `npx tsc --noEmit`, exit 0. `git diff --check`: exit 0. No SQL, push ni modificación de datos productivos.
