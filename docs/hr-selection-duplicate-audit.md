# HR selection and duplicate movement audit

Base: `3574cacdd7e29f2a51db0bccf68226a3b7c7c1e8`. No migration or production data changes.

## Production evidence and limits

The supplied Wednesday capture proves two distinct rejections under the same contract: attempt 1 reaches data sufficiency with `capability.canMeasureHeartRate` in state `unknown` at `blocks[1].movements[0].prescription`; attempt 2 fails shape with two sanitized `DUPLICATE_MOVEMENT:1` violations. Two total attempts are exhausted.

Attempt 1 selected an HR reference while measurement capability was not available. Because dose validation precedes sufficiency, reference resolution had already passed. A known physiological reference does not establish access to a measurement device. Unknown capability is not evidence of a projection bug. We do not have the athlete's stored device/overrides or raw proposals and cannot identify why their state was unknown, which reference was selected, or the duplicate movement IDs in attempt 2.

The requested threshold fixture is an explicit synthetic fixture, not a reconstructed production proposal: running_threshold, PRIMARY, half_marathon, maximum 5400 seconds, known HR reference, measurement unknown.

## Storage → canonical authority

1. `app/FormaPro.tsx` questionnaire definitions use field `dispositivo` and the same three literal options across supported questionnaires. `iniciarChat` sends the collected `perfil` in `guardar_usuario`.
2. `app/api/chat/route.ts` uses `projectLegacyCreate` / `projectLegacyUpdate` from `lib/auth/legacyContainment.ts`; `perfil` is retained. Creation inserts it into `usuarios.perfil`. `/perfil` editing merges `datos.perfil` with edits before sending. The generic update route protects persisted `prescription_signals` and `prescription_access` from stale/generic writes. It is not a general merge of every profile field: an independently constructed partial profile replacement could omit dispositivo. There is no evidence that happened in this run; no unrelated persistence change is made.
3. `loadAthletePrescriptionContext` selects the complete persisted perfil; `projectAthletePrescriptionProfile` reads `record(user.perfil)` and calls `projectPrescriptionSignals(profile, asOfDate, session, specialty)`.
4. `buildSessionDoseContext(..., enforceSufficiency=true)` clones `context.prescriptionSignals` into doseContext.sufficiency. References are projected separately from declared performance/physiology evidence. No device-to-reference inference exists here.
5. `movementPrescriptionRequirements` checks the chosen reference and the measurement capability. `validateSessionAgainstTrainingContract` evaluates the actual proposal without automatic fallback substitution.

| Persisted evidence | HR capability |
|---|---|
| `perfil.dispositivo = Sí, reloj GPS con pulsómetro` | available; also pace/distance available |
| `Sí, solo pulsómetro (banda o reloj básico)` | HR available; does not declare GPS/pace/distance |
| `No, entreno por sensación (RPE)` | HR unavailable |
| Missing, non-string or other string | unknown |
| `perfil.prescription_signals[capability.canMeasureHeartRate]` recognized state without date | overrides device declaration |
| Matching date in `perfil.prescription_access` | overrides the preceding evidence for that date |

Normalization removes diacritics, lowercases and trims. It does not infer arbitrary aliases or free text. Current questionnaire strings match exactly after normalization. Standalone pulsometro/reloj aliases, FC maximum, HRV, a stored HR zone or a clinical measurement do not authorize measurement capability. Tests cover the real storage projections and canonical database reader, including both positive device options. No lost current questionnaire alias or canonical projection defect is demonstrated. Explicit unknown/ambiguous overrides can legitimately supersede a positive device declaration.

## Intensity options and Builder

`prescriptionGenerationOptions` already excludes HR references from executableReferenceIds unless canMeasureHeartRate is available. Known references remain in doseContext.references for evidence; that collection is not the executable subset. RPE/RIR and compatible references are governed by existing code, not newly interchangeable modalities.

The old dose prompt explicitly required HR capability, but also described referenceId as an ID from doseContext.references. The generation prompt listed executable options separately. Thus the model could emit a structurally valid HR choice from known references despite missing capability; the server correctly rejected it. It could not get that choice admitted. This is not an AllowedTrainingContract or Data Sufficiency admission gap.

The change in `sessionGeneration.ts` clarifies the existing distinction: each movement's referenceId must belong to its own executableReferenceIds; HR unknown/unavailable/ambiguous cannot authorize measurement, and a device does not create a reference. No reference, capability, intensity option, schema, dose, goal or contract is changed or deleted.

## Duplicate algorithm and scope

`checkSessionShape` iterates blocks in required order warmup/main/cooldown, creating a fresh Set of movementId strings for each block. Every occurrence after an ID's first occurrence produces `DUPLICATE_MOVEMENT:<zero-based block index>:<movementId>`. Dose differences do not affect identity. There is no special case for running/cyclic movements.

`:1` is main, not a movement index or retry count. The safe logger previously stripped the final movementId. Two equal sanitized violations could be three entries of one ID or second occurrences of two different IDs. Without the raw IDs it is impossible to distinguish those cases in the supplied capture.

Repeating a running movement between warmup, main and cooldown is permitted and can represent legitimate separate work. Repeating it inside main as one entry per identical interval violates the existing schema: homogeneous intervals are represented with sets/durationSeconds/restSeconds. Heterogeneous repeated segments have no authorization to be silently merged; this change does not add such a representation or relax validation.

The initial prompt previously did not state block-local uniqueness. Duplicate-specific repair constraints were added only when the preceding error was DUPLICATE_MOVEMENT. Here the first failure was sufficiency, so attempt 2 received the original contract/options and the unsanitized `PRESCRIPTION_DATA_MISSING:capability.canMeasureHeartRate`, plus the generic same-contract repair instruction, but no duplicate-specific reminder. The suffix was already present in retry even when logs hid it.

The change makes existing block-local uniqueness explicit on every attempt, including after a sufficiency failure. It states that recurrence across blocks is allowed and forbids automatic merging or invented quantities. Existing duplicate retry constraints remain. Maximum attempts remains 2 (one retry).

## Classification and before/after

- A profile projection: no demonstrated bug; unchanged, unknown remains closed.
- B contract/intensity options: existing executable filtering is correct; unchanged.
- C Builder prompt: demonstrated omission of block-local representation rule and ambiguous distinction between known vs executable reference collections; clarified.
- D duplicate validator: current rule is deterministic and already supports legitimate cross-block recurrence; unchanged.
- E retry: receives the clarified initial constraints on both attempts. No new attempt, automatic dose repair or widened choice.

The prompt improvement is not proof that a stochastic provider will always comply. If it returns the same invalid proposals, the exact HR → duplicate sequence still fails closed. Only a new production run can establish whether this prevents recurrence for this athlete.

## Remaining opaque part: duplicate diagnostics

Added `SESSION_DUPLICATE_MOVEMENT_DETAIL` as flat JSON per duplicate violation: existing run/invocation/contract hash/day/attempt identity, occurrence ordinal, blockIndex, catalog-allowlisted movementId (null for unknown IDs), expected unique_movement_id_within_block, totalCount/truncated. No raw dose, profile, provider output, prompt or free text. Maximum 32 entries per attempt, explicit truncation. Logger failures do not change parsing, admission or retry.

## Tests

`hrSelectionRetry.test.mjs` covers real creation/update projection through canonical reads; recognized device values and lack of fabricated references; persistent/date overrides; unsupported aliases; threshold PRIMARY with 5400-second budget and HR unknown; known vs executable references; legitimate cross-block running recurrence; two within-main violations even with different dose; both-attempt prompt constraints; a corrected Builder proposal accepted unchanged on attempt 2; the observed failure sequence still exhausted at 2; safe duplicate identity logging.

The provider in repair tests is deterministic and explicitly returns a valid RPE proposal. This demonstrates integration and absence of server defaults, not a measured improvement in model compliance. No production profile correction, automatic HR→RPE conversion or guaranteed 4/4 week is claimed.

Changed files: `lib/sports/sessionGeneration.ts`, `lib/sports/builderDiagnostics.ts`, `lib/sports/hrSelectionRetry.test.mjs`, this report. Excluded authorities and Human Renderer v2 are unchanged.

Validation: 6/6 new tests; 107/107 targeted tests; full `node --test --test-concurrency=4 lib/**/*.test.mjs` suite 1589/1589, no failures/skips. `npx tsc --noEmit` and `git diff --check` pass. ESLint: identical baseline messages, one existing no-explicit-any error in builderDiagnostics, no new errors/warnings; other changed code files clean. Local commit only, no push.
