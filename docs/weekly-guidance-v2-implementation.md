# Weekly guidance V2 — LLM Coach + Forge guardrails

Implementación sobre `136ae2b`, sin staging, commit, push ni migración DB. Semantic Intake no se ha editado. Activación exclusiva del camino Coach-first autenticado; los consumidores históricos conservan su protocolo.

## Arquitectura y versiones

- **Hechos:** snapshot canónico de perfil, restricciones, capacidades, referencias, disponibilidad y tiempo; su autoridad no procede del LLM.
- **Autorización:** usuario, semana, día, disciplina, slot ejecutable y protección, vinculados al Weekly receipt y a los digests de contexto y revisión. REST no habilita una sesión. TRAIN/RECOVERY pueden variar como decisión deportiva dentro de un slot ejecutable no protegido.
- **Guidance:** `kind: weekly_guidance`, `version: 2`; adaptation, stimulus, patterns, method, role y reason son opcionales/descriptivos. No se fabrican IDs ni se normalizan a catálogo. Se admiten múltiples patrones y adaptación legible.
- **Decisión final:** `kind: session_decision`, `version: 1`; stimulus obligatorio para identificar la sesión final, resto descriptivo opcional. Una revisión respecto al guidance o la última decisión admitida exige una razón breve.
- Weekly contract **3**, policy `weekly-guidance-v2`, opt-in interno `openCoachVersion: 2`. Session contract **5**, con la política ejecutable existente `coach-executable-v1`. El envelope HTTP y Calendar protocol 2 permanecen compatibles. OpenCoachIntent v1, Weekly contract 2 y Session contract 4 mantienen su semántica histórica.

El contrato de Builder nace sin identidad deportiva inventada. Su stimulusId se establece a partir de la decisión final propuesta; la validación comprueba esa identidad final y los hechos originales. No se modifica scope, día, restricciones ni recursos para hacer pasar una propuesta. La factibilidad y la ejecución reutilizan las autoridades existentes. La estrategia deportiva de Analyzer se mantiene como contexto, no como obligación.

## Receipts, save y repair

El Weekly HMAC conserva autorización y guidance. El Session HMAC vincula ese Weekly receipt, la autorización factual completa, guidance, decisión final, propuesta ejecutable admitida, contexto de coaching, digest del contexto de petición/proveedor y número de revisión. TurnPlanningIntent sigue llegando a Weekly, Builder y repair: su proyección no se almacena como estado del atleta ni en la sesión persistida; el digest acredita el contexto de Builder.

Save autentica la decisión FINAL, revalida ejecución y freshness y comprueba las sesiones hermanas. Los campos deportivos Weekly dejan de ser comparaciones obligatorias en el protocolo nuevo. Día, semana, disciplina, slots protegidos y scope continúan siendo comparaciones obligatorias. La sesión renderizada/persistida y el resumen semanal usan la decisión final. Guidance se guarda separadamente como provenance en structuredPrescription.

Repair recibe contexto de coaching original, propuesta/decisión vigente y hermanas reales. Puede sustituir la decisión final con razón y guardrails; el receipt nuevo registra revisión, digest de decisión previa y contexto de revisión. Una propuesta rechazada no reemplaza la decisión vigente. Reconsideración conserva su presupuesto finito y rollback existentes. Los análisis deportivos sin evidencia de patrón siguen siendo advisory; no se declara compatibilidad conocida a partir de una etiqueta final.

No cambia el algoritmo CAS, las tablas, disponibilidad, restricciones, auth, cuota, exposición, duplicación, UI ni longitudinal. No se reescriben filas. Los receipts antiguos se verifican por sus versiones originales, incluidos sus límites de tamaño. Los nuevos límites son 128 KB para Calendar y 400 KB para Session, por guidance y contexto firmado adicionales.

## Structured output y observabilidad

Weekly V2 usa `submit_weekly_guidance` con tool_choice forzado en la misma petición Anthropic. Se requiere exactamente una invocación, se ignora prosa y el objeto pasa al mismo validador factual. No se analiza JSON textual del proveedor en ese camino. Los consumidores históricos conservan transporte y decoder.

Con `FORGE_WEEKLY_COACHING_DIAGNOSTICS=1`: `WEEKLY_GUIDANCE_ADMISSION`, `WEEKLY_GUIDANCE_SESSION_ADMITTED`, `WEEKLY_GUIDANCE_REVISION_ADMITTED` y `WEEKLY_GUIDANCE_SAVE` permiten enlazar días y digests. No registran prompts, contexto, razones ni etiquetas deportivas libres. La reconsideración nueva tampoco registra su rationale libre. No hay nuevo framework de diagnostics.

## Pruebas

E2E de módulos reales, proveedor y DB sintéticos; no se han hecho llamadas a Anthropic ni escrituras de producción.

| Caso | Resultado |
|---|---|
| Weekly fuerza_maxima + reintroduction/conservative → Builder tecnica | PASS |
| Weekly selection → Weekly receipt → Builder → Session receipt → whole-week → save admission → createPlan | PASS; se escribe tecnica |
| Cambiar día o disciplina | Rechazo |
| Día no disponible / slot REST | Rechazo |
| Cambiar protected/completed | Rechazo |
| Restricción conocida | Rechazo |
| Equipo o capacidad explícitamente ausente | Rechazo |
| Referencia incompatible acreditada | Rechazo |
| Referencia inexistente | Preservación conforme a política, sin kg inventados |
| Contexto stale | Rechazo en Builder/save |
| CAS sin filas coincidentes | Conflicto, una escritura, sin retry |
| Role/method ausentes, varios patterns, adaptation legible | PASS |
| Revision por repair | Nueva decisión autenticada; original guidance conservado |
| Manipular identidad final / usuario ajeno | Rechazo |
| Herramienta ausente o ambigua | Rechazo, prosa ignorada |
| Orden distinto de claves del objeto Weekly | PASS; ID estable en replay |

Comandos ejecutados (desde la raíz):

```powershell
node --test lib/planning/weeklyGuidanceV2.test.mjs lib/planning/openCoachAuthority.test.mjs lib/sports/sessionExecution.test.mjs lib/sports/sessionIntentAuthority.test.mjs
node --test lib/chat/coachFirst.test.mjs lib/chat/coachFirstLongitudinalRecovery.test.mjs
node --test lib/sports/sessionAuthority.test.mjs lib/sports/sessionContractIntegration.test.mjs lib/planning/weeklyGenerationPreflight.test.mjs lib/planning/weeklySave.test.mjs lib/planning/identityCas.test.mjs lib/planning/weeklyAuthorityBinding.test.mjs lib/planning/wholeWeekRepair.test.mjs lib/planning/wholeWeekOrchestration.test.mjs lib/planning/weeklyPlannerDiagnostics.test.mjs
npx tsc --noEmit --incremental false
git diff --check
```

- Weekly V2: **18/18 PASS**.
- Open Coach + session execution/intent: **84/84 PASS**.
- Coach-first + longitudinal recovery: **183/183 PASS**.
- Session/preflight/save/CAS/binding/repair/diagnostics: **317/319 PASS**.
- TypeScript: **PASS**. Diff check: **PASS**.
- Total de tests distintos: **602/604 PASS**, exclusivamente los dos fallos baseline abajo.

Los fixtures de longitudinal recovery se actualizaron para responder con el nuevo tool output Weekly; mantienen las comprobaciones de restricciones, continuidad y CAS real del ciclo. No se cambiaron los fixtures apiCall.

Baseline conocido en `lib/sports/sessionContractIntegration.test.mjs`:

1. `actual apiCall delivers contract rejection once without retry or timer`: `undefined` frente a `TRAINING_CONTRACT_INVALID`, assert en 134:76.
2. `actual API client retains structured goal continuation and displays server question once`: `0 !== 1`, assert en 165:10.

Son los mismos fallos previamente demostrados contra c9e2845. Esta implementación no toca apiCall/authenticatedFetch ni sus fixtures. No se repite aquí la comparación histórica ya aceptada.

## Coste, límites y estado

| Concepto | Antes | Después |
|---|---|---|
| LLM nominal | Analyzer + Weekly + una por sesión; transición longitudinal/reconsideración cuando corresponde | Igual; ninguna etapa adicional |
| Weekly intentos | Hasta 2, incluidos fallos de JSON/fences | Hasta 2 por validación; V2 consume tool input, sin retry por parseo de prosa |
| Builder intentos | Hasta 2 | Hasta 2; revisión deportiva en esa misma respuesta |
| Repair/reconsideración | Presupuestos existentes (3 objetivos, local/targeted y reconsideración acotada) | Iguales |
| DB lecturas | Loaders de hechos, freshness, historial y save | Mismos loaders; el contexto de repair reutiliza el snapshot firmado |
| DB escrituras | Reserva longitudinal si necesaria + persistencia existente con CAS | Iguales; cero tablas/operaciones añadidas |

El E2E nominal verifica una llamada Weekly y una Builder. El test de longitudinal verifica Analyzer → transición → Weekly y una única escritura de ciclo; el segundo intento reutiliza la reserva. Los números absolutos de queries dependen del perfil y las páginas de datos, no se afirma un conteo universal.

Riesgos restantes: no smoke test con proveedor/DB reales; el contenido deportivo y su razón siguen siendo decisiones del LLM. Los receipts nuevos transportan más contexto y siguen teniendo un límite finito. La ventana de freshness entre tablas conserva la limitación preexistente (sin nueva atomicidad entre restricciones y plan). El tool output elimina la lectura de prosa, pero no garantiza que el proveedor cumpla los guardrails ni evita truncamientos; esas propuestas siguen rechazándose.

**STOP activado: NO. Listo para commit/push: SÍ, ignorando exclusivamente el baseline identificado. No se ha hecho staging, commit ni push.**

## Archivos de esta implementación

- `app/api/chat/route.ts`
- `lib/chat/coachFirstGeneration.ts`
- `lib/chat/coachFirstLongitudinalRecovery.test.mjs`
- `lib/chat/coachFirstTools.ts`
- `lib/planning/allowedWeeklyPlanContract.ts`
- `lib/planning/currentWeekCoachingContext.ts`
- `lib/planning/enforceWholeWeek.ts`
- `lib/planning/openWeeklyCoachContract.ts`
- `lib/planning/prepareAllowedWeeklyPlanContract.ts`
- `lib/planning/weeklyCalendarAuthority.ts`
- `lib/planning/weeklyPlannerDiagnostics.ts`
- `lib/planning/wholeWeekAdapter.ts`
- `lib/sports/allowedTrainingContract.ts`
- `lib/sports/sessionAuthority.ts`
- `lib/sports/sessionDose.ts`
- `lib/sports/sessionExecution.ts`
- `lib/sports/sessionGeneration.ts`
- `lib/sports/sessionHumanRenderer.ts`
- `lib/sports/sessionProfessionalRenderer.ts`
- `lib/sports/structuredSession.ts`
- `lib/sports/trainingFeasibility.ts`
- `lib/planning/weeklyCoachingGuidance.ts`
- `lib/planning/weeklyGuidanceOutput.ts`
- `lib/planning/weeklyGuidanceV2.test.mjs`
- `lib/sports/finalSessionDecision.ts`
- `docs/weekly-guidance-v2-implementation.md`
