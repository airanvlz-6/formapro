# B.3.2C — Running execution quantity integrity

Initial HEAD: `3bd245b3fa5f3f6ae7e159102ac65e914cea33c3`, initially clean. This change introduces factual capture and diagnostics, not a new training dose policy.

## 1. Existing writer audit and trust

| Path/function/action | Persisted meaning | Trust for actual Running quantities |
| --- | --- | --- |
| `lib/planning/recordCompletion.ts:recordPlanCompletion` | CAS mutation of `completada`, `titulo_real`, `descripcion_real`; original prescription preserved | PLAN_ASSOCIATION_ONLY |
| `app/api/chat/route.ts:marcar_sesion_completada` | Calls the above from a session report | PLAN_ASSOCIATION_ONLY |
| `lib/planning/weekClosure.ts:projectWeekClosure` / closure persistence | Marks rest slots completed | NOT_USABLE for Running quantity |
| `app/api/chat/route.ts:registrar_sesion` | `usuarios.workout_history`, caller/generated workout ID, unvalidated-unit `duracion`, notes | STRUCTURED_BUT_UNIT_AMBIGUOUS; no verified relation to plan execution |
| `borrar_ultima_sesion` | Deletes a history item | Not an execution evidence producer; new immutable factual records are independent |
| Conversational completion detection in `app/api/chat/route.ts` | LLM-extracted type, notes, sensation; date/type legacy merge; may call completion | LLM_EXTRACTED, never admitted as quantities |
| External `user_report` capture in `app/api/chat/route.ts` | External activity/context extracted from conversation | LLM_EXTRACTED / EXTERNAL_UNVERIFIED |
| `sincronizar_healthkit_real` | Today's physiology aggregate through `writePhysiology`; no activity identity/laps/bouts | NOT_USABLE for this execution layer |
| `lib/sports/sessionAuthority.ts`, weekly/session persistence | Authenticated planned `structuredPrescription`; session receipt is ephemeral and removed by canonical persistence projection | PLAN_ASSOCIATION_ONLY, not an execution observation |
| Web detected-session confirmation banner | Registers a detected report and then completes a plan slot | No explicit completed-as-prescribed contract |
| Mobile server route/context (`lib/mobile/*`, chat mobile paths) | Server context/prompt and shared legacy reporting; no Expo client or structured execution writer found in this repository | No independent trusted execution source |
| Garmin/Strava/etc. | No verified activity execution adapter found | UNAVAILABLE |
| New `/api/running-execution` | Authenticated, unit-tagged, strict structured manual report | TRUSTED STRUCTURED for self-report integrity; **not device measured** |

No existing legacy writer is upgraded. No title, description, pace, RPE, completion flag or planned method is interpreted as executed method identity.

## 2. Canonical model and identity

`lib/execution/runningExecution.ts` defines `RunningExecutionRecord` version 1:

- opaque `executionId`, hashed `athleteScope`, source `forge_manual`, effective civil date `occurredAt`;
- `executionIdentity`: discipline `carrera`, status `UNKNOWN` or `EXPLICIT_SELF_REPORTED`, optional catalog method/family/pattern/variant;
- optional `planAssociation.sessionId`, explicitly `REPORTED_PLAN_ASSOCIATION` (not a verified relation or execution identity);
- independent `totalDurationSeconds`, `totalDistanceMeters`, `mainWorkDurationSeconds`, `mainWorkDistanceMeters`, `preparationDurationSeconds`, `preparationDistanceMeters`;
- optional structure: actual bouts and separately reported recoveries;
- optional actual RPE observation, separately identified as self-reported;
- `FULL`, `PARTIAL`, `MODIFIED` or `ABANDONED` completeness;
- server-issued `STRUCTURED_SELF_REPORTED` provenance and `SERVER_VALIDATED_SELF_REPORT` verification.

Execution identity hashes the athlete scope, source namespace and source-local ID. Source-local IDs do not collide across device namespaces or athletes. The manual client allocates one UUID per draft and reuses it for retry. It is not derived from date/title or the planned session. Missing source-local identity remains ambiguous in the pure projection; the production writer refuses to persist it as identified evidence.

Identical normalized records deduplicate. Different content under the same identity is retained as a conflict, not overwritten. Different IDs on the same date remain different records, including records mentioning the same plan session. No inferred plan/device reconciliation is performed. A new manual draft of the same real-world activity can therefore be a duplicate that Forge cannot identify automatically; source identity must be retained by clients.

## 3. Method and quantity semantics

Only an explicit structured method selection can produce `EXPLICIT_SELF_REPORTED`. The server checks the Running catalog, pattern and variant. HM and 10K specific variants remain separate. Technical run and jump are separate. When supplied, bout movements must belong to Carrera and match the declared method's stimulus/pattern; incompatible reports are rejected rather than relabelled. Structure compatibility checks are factual validation, not permission to prescribe.

The server validates self-report consistency; it does not verify a physiological threshold/VO₂ response. Future learned policies must explicitly choose which provenance they accept.

Input durations and distances carry `{value, unit}`. Only seconds/minutes and meters/kilometers are normalized. Unknown units, negative/non-finite quantities and unsupported fields are rejected. Zero is preserved. Missing fields remain absent. Numeric unitless legacy `duracion` is not consumed.

Total, main and preparation are never substituted for each other. Their consistency is checked when the reported values coexist; no missing component is inferred. Fully quantified bouts can be compared with reported main work, but neither an aggregate nor its decomposition is invented. Rest is distinct from main work. No pace conversion occurs.

Each bout has a unique index, catalog movement, completion flag and independently optional actual duration, distance or repetitions. Each recovery has a unique `afterBout` pointing to a reported bout, completion flag, optional duration/distance and active/passive mode. Unknown recovery differs from explicitly reported zero recovery. Bout order is canonicalized by index.

All quantities in an incomplete bout still mean **actually performed**, not its planned target. Partial 2/4 may report only the two actual bouts; it is never expanded to four. `FULL` cannot coexist with an explicitly unfinished bout/recovery. Partial, modified and abandoned records retain their quantities but are identified as incomplete/modified evidence for compatibility. The original prescription is never updated by this writer.

## 4. Authentication, verification and storage

The new route uses Supabase bearer verification and `resolveAuthenticatedAthlete`. It does not accept `codigo`, athlete ID or client verification/provenance/source claims. The server fixes source and authority. It validates the report, hashes canonical content and signs it using a domain-separated HMAC. Readback checks signature, content digest, athlete binding and schema version. Invalid storage causes a closed failure, never an empty evidence result. Raw reports/tokens are not logged.

`verified_actual` remains the legacy **measured/verified actual** boundary; the new manual writer deliberately does not emit it. Structured self-report is admitted separately, with its exact authority attached. A future measured adapter must establish trustworthy source units and semantics server-side before emitting legacy observed totals or new measured method evidence. Clients cannot select such an adapter or claim measured verification.

`docs/sql/b32c-running-execution-records.sql` is required storage setup, **not executed by this change**. Apply it before deploying the new reader/writer. The table is needed because neither mutable `workout_history`/profile JSON nor the planned-session object provides immutable append, atomic deduplication and concurrent conflict preservation. Avoiding a table would require another concurrency-safe storage contract; silently replacing profile JSON would not meet the task.

The primary key is `(user_codigo, execution_id, content_digest)`. Exact retries meet database uniqueness; contradictory versions can coexist. RLS is enabled, anon/authenticated roles have no access, and the service role has SELECT/INSERT but no UPDATE/DELETE. The server's authenticated identity boundary selects the athlete. No foreign key is assumed for undocumented legacy `codigo` uniqueness/types. Records use the same scoped legacy code contract as the existing planning reader.

The bounded reader retrieves at most 1,001 rows and rejects above 1,000, rather than silently truncating evidence/conflicts. This is an engineering limit, not a sporting exposure cap. If any version of an identity intersects the factual window, every version is compared, including contradictory dates outside the window. Unrelated older conflicts do not affect the current window. Conflicts in the relevant window conservatively block Running evidence because method identity itself may be disputed.

The signature currently uses the existing service-role secret with domain separation. Rotating that secret requires an explicit trusted re-signing/key-transition procedure for persisted records; this phase does not implement key-ring rotation or silently accept unverifiable history. Keep that operational dependency in the deployment plan.

Append-only evidence has no correction-resolution/deletion workflow in this phase. Conflicting reports require a future explicit adjudication contract; neither newest-wins nor an automatic retry resolves them. Do not use a new activity ID to represent a correction. Deployment also needs schema verification in the target DB; no live DB access or migration execution was performed here.

## 5. Completion UX decision

The optional web form captures date, actual total minutes, optionally known actual main minutes, optional explicitly selected method and completeness. All quantity and method controls start blank/unknown, never from the plan or LLM-detected text. Modified execution supplies only actual known fields. Saving does not complete or overwrite the plan. A separate new-draft action allocates another identity; retry retains the existing identity.

The authenticated API additionally supports distances, preparation, detailed bouts/recoveries and technical repetitions. Detailed structure entry is available to structured clients through this shared backend contract; the minimal web form does not yet expose a bout editor. Missing structure stays unknown. An authenticated linked athlete is required; legacy code-only login does not bypass this writer's authentication.

“Completed as prescribed” is **not implemented**. It is architecturally acceptable only as explicit self-report bound to an exact durable signed prescription snapshot and exact session identity. Existing completion UI does not confirm those semantics; generation receipts expire and are dropped at persistence. This phase rejects blanket `completedAsPrescribed` input rather than copying planned quantities or stretching receipt validity. A durable prescription attestation is a separate prerequisite if that shortcut is later chosen.

## 6. B.3.1, B.3.2A and compatibility

`loadAthletePrescriptionContext` adds one scoped canonical execution read. The existing 28-day factual window is reused. `RunningDoseBaseline.structuredExecutions` is a separate extension; the old `durationSeconds`/`distanceMeters` facts retain generic observed-total semantics and `plannedMethodId` remains only a plan association. Completed slots are not merged with new execution IDs by date.

Admission keeps structured self-report separate from `OBSERVED`. `basis.selfReportedTotals` provides descriptive 7/28-day total duration/distance with authority, known-activity count and completeness. It never adds main work to generic totals or adds self-report to measured metrics. Missing total is not zero; zero observations survive. Conflicted identities are excluded. The global legacy admission status still describes legacy facts/declarations; consumers of the extension must inspect its explicit provenance/status rather than reinterpret that legacy status.

`structuredMethodExecution` in compatible evidence preserves opaque evidence refs, method, variant, actual quantities, structure, observations, completeness and missing signals. Athlete scope, reported plan association and signatures are not forwarded there. Legacy `compatibleMethodQuantities` remains explicitly method-unknown for legacy OBSERVED quantities. New evidence has separate semantics, not a rename of those legacy facts.

| Family | Factual compatibility |
| --- | --- |
| Base/recovery | Exact explicit method identity plus known actual total exposure; never converted into a new target |
| Threshold/VO₂ | Exact method; main work separate; structure, bouts and recoveries distinguish available from partial evidence |
| Specific | Exact goal variant and pattern; main work and actual structure |
| Economy | Exact run/jump variant; movement-specific bout quantities/repetitions; recoveries when between bouts |

`AVAILABLE` describes the structural factual sample, not sufficient physiological history, verified capacity, minimum sample size, freshness for a sports policy or permission to prescribe. Completeness/freshness of the athlete's entire capture remains unknown. This phase does not aggregate method main work into a learned dose, approve transfer between methods or reconcile cross-unit quantities.

## 7. Multi-axis capabilities and Strategy

Entries now carry `evidenceStatus`, `policyStatus`, `compositionStatus`, `intensityStatus`, `timeStatus`, `weeklyContextStatus`, `executionIntegrityStatus`, `blockers`, `doseCapability` and `prescriptionAllowed`.

Evidence can be missing/partial/conflicted or structured execution available. Writer availability, unknown identity, no compatible execution and incomplete execution are distinguished. Missing policies and missing composition are independent blockers. Intensity may be evaluated against the real existing contract/reference authority even while dose is unavailable. Without a context it remains `NOT_EVALUATED`; an evaluated unresolved policy is `UNRESOLVED`. Time without a selected session remains not evaluated. B.3.3 context is not evaluated, not implicitly satisfied.

Threshold with no execution can therefore show resolved intensity simultaneously with `DOSE_EVIDENCE_MISSING`, `DOSE_POLICY_NOT_ESTABLISHED`, `DOSE_COMPOSITION_NOT_ESTABLISHED` and `NO_COMPATIBLE_EXECUTION`. A compatible report removes the factual blocker, never the absent-policy blocker. Existing scalar reasons remain for backward compatibility; they are not the complete explanation.

`authorizedMethodCandidates` preserves blocker arrays in `doseUnavailable`; failed weekly admission exposes `deferredDoseDemands`, and admitted partial strategy retains those arrays on `strategy.deferred`. No unavailable method becomes a ready Planner option. Equivalent transfer authority is unchanged; base never satisfies threshold demand by relabelling.

## 8. Boundaries and engineering constants

All five quality/support selectors remain null. The only production numeric selector remains `running_base_declared_habitual_duration_v1`. No duration, distance, effort count, rest, multiplier, progression, preparation quantity or sporting cap is introduced. Existing running intensity rules are reused without changing values. Observed RPE validation uses the existing 0–10 scale; it does not prescribe an RPE.

New numeric limits are engineering only: schema version, explicit unit factors (60/1,000), safe-number checks, payload/ID lengths, 256 rows per structure collection, and bounded storage read. Floating-point consistency uses machine epsilon, not a training tolerance. These do not select dose or reject an athlete based on sporting capacity.

Reusable primitives live in `lib/execution/executionIntegrity.ts`: namespaced identity, canonical digest, explicit units, provenance and completeness; the generic adapter interface leaves source verification server-owned. Running movement/family/variant semantics remain in the Running adapter. No Garmin/HealthKit/Strava integration, shared client authority or premature universal sports model is introduced.

The next threshold phase must explicitly accept evidence provenance, eligibility and numeric/composition policy. B.3.3 owns weekly accumulation, intensity interaction, surrounding load, recovery need, progression and deload/taper. Neither is implemented here.

## 9. Validation

The execution test suite covers A–T, explicit units, spoofed authority/identity, server authentication, signed readback, immutable duplicate/concurrent conflicts, missing/zero distinctions, partial/modified quantities, variant isolation, descriptive totals, independent intensity and preserved deferred blockers. Existing read fixtures explicitly include the new table and test its read failure. Final verification: 27/27 new execution/form tests, 932/932 selected regression tests, 1,980/1,980 full library tests, TypeScript and diff-check pass. Modified-file lint has zero delta against the initial HEAD (185 existing errors, 46 existing warnings); all new code/test files are clean. SQL was reviewed statically, not executed against a database.

No implementation debt is left merely because the work was interrupted. Remaining limits above are deliberate scope boundaries: schema deployment pending, no durable completed-as-prescribed attestation, no device writer, no conflict-adjudication workflow, no detailed web bout editor, bounded storage read, and no new numeric sports policy.
