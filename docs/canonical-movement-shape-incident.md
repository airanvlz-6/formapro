# Canonical movement shape — run 06202e59-bc99-4f73-93a7-f8c3d79f421c

Base auditada: `43b6b54` (fix(coaching): relax session representation without weakening guardrails). Semana 2026-09-14, lunes. Evidencia suministrada: ambos intentos emitieron tres MOVEMENT_SHAPE_INVALID:1 para goblet_squat, single_leg_rdl y bulgarian_split_squat, en ese orden. Son canónicos reconocidos, sin variant ni doseInstruction. No se conserva el objeto completo, sus claves adicionales, el discriminador ni los valores/tipos completos de la dosis. No se reconstruye ese payload.

## Informe de los 20 puntos

1. **Significado exacto:** el sufijo `:1` es `index` en `value.blocks.forEach`, con índice desde cero. Es el segundo bloque (main para warmup/main/cooldown). No es ID, versión, ordinal ni código deportivo.
2. **Predicado responsable:** en el HEAD de entrada, structuredSession.ts:59–62 agrupaba: entrada no objeto; claves fuera de movementId/prescription/(variant moderno); movementId ausente, vacío o no string; prescription ausente/no objeto; o claves de prescription fuera de sets/reps/durationSeconds/distanceMeters/restSeconds cuando `modern` es false. `modern` dependía exclusivamente de `value.schemaVersion === 2`. La emisión actual está en structuredSession.ts:66; el mismo predicado se ha extraído a sessionMovementShape.ts:15 y su rama legacy a :23 para diagnóstico exacto.
3. **Shape esperado:** `schemaVersion:2` a nivel de propuesta; cada entrada canónica `{movementId, prescription}`; dentro de prescription, cantidades tipadas y opcionalmente intensity/perSide/restSeconds/tempo/doseInstruction. No existe requisito `prescription.role`. `id`, `canonicalMovementId`, `dose`, `rest` y una intensity fuera de prescription no son aliases admitidos.
4. **Shape equivalente real:** solo se conocen IDs y presencia de campos. Los tres tienen sets/reps/intensity/restSeconds; los dos unilaterales también perSide. El fixture abajo usa esas presencias con números sintéticos válidos. Se ensayan por separado discriminador presente, discriminador ausente y campo adicional, sin atribuir ninguno al proveedor real.
5. **Por qué fallaban los tres:** los logs descartan identidad desconocida y prescription no objeto (la proyección solo marca esos campos presentes sobre objetos). Dentro del predicado compuesto quedan dos explicaciones compatibles: claves adicionales en la entrada; o rama legacy que rechaza intensity y perSide. La ausencia de schemaVersion produce exactamente las tres violaciones en la reproducción. Un campo adicional por entrada también. Por tanto queda demostrada una incompatibilidad sistemática posible y una frontera legacy defectuosa, pero **el predicado concreto del incidente sigue UNKNOWN**. No son tres decisiones de seguridad deportiva de ese validator.
6. **Attempt 2:** la proyección confirma los mismos tres rechazos, no igualdad de los outputs completos. sessionShapeDiagnostic añadía incondicionalmente el mismo repair de variante y dosis. No mostraba discriminador ni predicado de entrada. La insuficiencia del feedback está demostrada; no puede afirmarse por qué el modelo mantuvo el shape sin el output.
7. **Clasificación A–F:** identidad y objeto/prescription utilizables: A (ejecución). Rechazar campos modernos solo por discriminador omitido: D (legacy). Campos adicionales desconocidos: requieren resolución de representación A/C porque podrían contener trabajo o referencias; no se eliminan a ciegas. Si se demuestra que un campo concreto es solo metadata D/E, podrá normalizarse específicamente. El predicado no contiene reglas F, cuotas de reps E ni reglas deportivas por movimiento. Safety B y referencias C se comprueban después.
8. **Corrección:** únicamente bajo execution policy, una propuesta sin discriminador que usa campos/layout modernos se clona y se normaliza a schemaVersion:2 antes de validar. No se infiere dosis, identidad, alias ni hechos. Un discriminador explícito inválido sigue rechazándose. Las representaciones numéricas legacy antes admisibles permanecen intactas para conservar receipts/rendering históricos. La normalización es idempotente y no muta el objeto del proveedor. Los demás predicados siguen activos.
9. **Guardrails:** cantidades válidas, referencias objetivas exactas, compatibilidad, equipo/capacidad, restricciones, UNKNOWN_SAFETY relevante, tiempo computable, identidad, scope, ownership, receipts, freshness y CAS conservados. Nada de fallback de movimiento desconocido, ampliación de catálogo ni semántica olímpica implementada.
10. **Observabilidad:** failedPredicates cerrado, receivedShape de claves conocidas/tipos, número de claves desconocidas sin sus nombres, y representation con modo/discriminador de origen/normalización. Observación sobre el objeto previo al predicado y antes de normalizar su dosis. Inventario de movementId/id/canonicalMovementId, prescription/dose, intensity/rest/perSide/role/type; objeto intensity solo expone tipos de kind/value/max/referenceId, no valores. Sin instrucciones, labels ni datos privados. El repair se construye desde la regla real; los errores canónicos no reciben instrucciones de receta generada.
11. **Regression fixture:** los tres canónicos en el mismo main block, cantidades/RPE/RIR válidos, descanso, perSide solo en los dos unilaterales; sin variant/instruction. Schema explícito pasa; omisión reproduce el rechazo legacy y pasa tras normalización moderna; claves adicionales siguen fallando. Tests separados para cada predicado, aliases no inferidos, unknown ID en resolver, variantes válidas/malformadas y retry canónico sin cambiar ejercicios.
12. **Tests focalizados:** resultados finales al pie. Integración de receipts/freshness existente reforzada: el proveedor omite el discriminador, el payload firmado conserva schemaVersion:2, sets resueltos e instrucción preservada; la alteración de contenido y la evidencia factual obsoleta siguen rechazándose.
13. **Suite completa:** resultados al pie.
14. **TypeScript:** resultados al pie.
15. **Diff:** resultados al pie. Ningún output de diagnóstico ni archivo temporal se añade al repositorio.
16. **Paso 2:** confirmado en el código: FormaPro.tsx:985 llama analizar_bloque_semana; :991 espera planificar_semana; la ruta chat llama planBoundedWeek (:2260); este espera composeBoundedWeek (:207), que llama al proveedor y valida su selección; solo tras resultado válido el cliente construye diasAConstruir y llama al Builder. Se añade `ORCHESTRATOR Paso 2 — Weekly Coach` después de admitir la selección, en backend compartido. Es comprobación del flujo HEAD y test local; no una traza retrospectiva independiente del run.
17. **5 sugeridos frente a 6 targets:** no son la misma autoridad ni contador. La ruta pasa `datos.analisis?.strategyProposal`, no convierte `dias_entreno_sugeridos` en cuota; Weekly decide el calendario. Builder cuenta los slots que sobreviven filtros de fecha/preservación/tipo y puede incluir recuperación, por lo que seis targets no prueban seis TRAIN sin ver el calendario. El log nuevo desglosa TRAIN, REST, RECOVERY, días e intents seguros; el test admite una elección real de seis TRAIN. No se cambia ninguna regla semanal.
18. **Semántica olímpica:** propuesta separada en olympic-compositional-semantics-design.md; solo diseño, sin cambio en resolver/catálogo ni permiso de prescripción.
19. **Limitaciones:** discriminador/claves/valores originales de ambos intentos UNKNOWN. El parche corrige la rama legacy demostrada localmente y permite distinguirla de campos adicionales; no certifica la causa ni que todos los outputs futuros pasen. Nombres de claves desconocidas se redaccionan deliberadamente. Paso 2 se registra en logs del servidor, no se promete que aparezca en la consola del navegador. No acceso ni mutación a producción.
20. **Estado:** DESIGNED, CONNECTED y VERIFIED LOCALLY. PROVEN IN PRODUCTION: NO para este parche. La evidencia real sí prueba que la instrumentación anterior identificó los canónicos, no que este arreglo esté desplegado. Sin commit, push ni deploy.

## Fixture sintético mínimo de main

```json
{
  "blockType": "main",
  "movements": [
    { "movementId": "goblet_squat", "prescription": { "sets": 3, "reps": 8, "intensity": { "kind": "rpe", "value": 6 }, "restSeconds": 60 } },
    { "movementId": "single_leg_rdl", "prescription": { "sets": 3, "reps": 8, "intensity": { "kind": "rpe", "value": 6 }, "restSeconds": 60, "perSide": true } },
    { "movementId": "bulgarian_split_squat", "prescription": { "sets": 3, "reps": 8, "intensity": { "kind": "rir", "value": 3 }, "restSeconds": 60, "perSide": true } }
  ]
}
```

Los números, intensity.kind, warmup/cooldown y explicación del test son sintéticos. `restPresent` corresponde a restSeconds porque así lo calculaba la instrumentación, no a una clave literal rest. La prueba completa vive en sessionRepresentation.test.mjs (`canonicalIncident`).

## Predicados cerrados

| Código | Condición exacta |
| --- | --- |
| MOVEMENT_OBJECT_INVALID | null, array o no objeto |
| MOVEMENT_EXTRA_FIELD | alguna clave de entrada fuera del conjunto permitido para el modo |
| MOVEMENT_ID_MISSING | no tiene propiedad propia movementId |
| MOVEMENT_ID_TYPE_INVALID | movementId no string o vacío |
| MOVEMENT_PRESCRIPTION_MISSING | no tiene propiedad propia prescription |
| MOVEMENT_PRESCRIPTION_SHAPE_INVALID | prescription no objeto o array |
| MOVEMENT_LEGACY_DOSE_FIELDS | modo legacy y alguna clave de prescription fuera de las cinco cantidades legacy |

Los códigos son compartidos por admisión y diagnóstico. No se añade una segunda aproximación del predicado basada en textos de error. El código agregado original se conserva para consumidores existentes. Ningún código sugiere cambiar de movimiento.

## Validación

- 15 tests nuevos: 14 de canonical shape/normalización/privacidad/retry y uno de selección semanal de seis días con diagnóstico seguro. Se refuerzan además integración de receipts/freshness y observación del Paso 2 en la cadena Weekly → Session.
- Focalizados ejecutados: 123/123 PASS (Session representation/execution, movementVariants, builderDiagnostics y Open Coach). La prueba canónica adicional de retry añadida después también pasa en la suite completa final.
- Suite completa: descubrimiento con `rg --files --no-ignore lib app -g '*.test.mjs' -g '*.test.cjs'`; ejecución con `node --test --test-concurrency=4 --test-reporter=spec`: **2432/2432 PASS**, cero fallos/cancelados/omitidos, 251.1 segundos.
- `npx tsc --noEmit`: **PASS**.
- `git -c core.safecrlf=false diff --check`: **PASS**. Whitespace y UTF-8 de los tres archivos nuevos: **PASS**.
- Diez archivos locales modificados/añadidos. Los logs de ejecución están en el directorio temporal del sistema, fuera del repositorio. No cambios de DB, commit, push ni deploy.
