# B.3.2B.3A — Aerobic first-plan evidence and dose capability

Base: `fcf3e111942cc41de96064a5a515fd1c33095779`; initially clean.
Implementation only of factual capture, admission and capability filtering. No numeric production policy is enabled.

## Storage audit and semantics

The existing `usuarios.perfil` JSON already holds structured prescription facts (`prescription_signals`, `prescription_access`) and onboarding declarations. `loadAthletePrescriptionContext` already reads this JSON. No column, migration, SQL backfill or new planning read is needed.

New path: `usuarios.perfil.runningHabitualDeclarations`, keyed by:

| Field | Structured value | Meaning |
| --- | --- | --- |
| `habitualEasyRunningDurationMinutes` | Positive safe integer, unit `minutes`; or status `NO_HABITUAL_EASY_RUN`, value `null` | Declared current normal easy/conversational running outing |
| `habitualRunningSessionsPerWeek` | Nonnegative safe integer, unit `sessions_per_week` | Declared current habitual running frequency |

Each record carries `field`, `authority: DECLARED`, `status`, `value`, `unit`, `semantics`, its exact `source` path, `confirmedAt` and `freshness: UNKNOWN`. Semantic IDs are `HABITUAL_EASY_RUN_DURATION` and `HABITUAL_RUNNING_FREQUENCY`.

The duration is not a target, maximum, minimum useful duration, verified tolerance or capacity. Frequency is not an available-days count, maximum frequency, required exposure or weekly target. There is no imposed sports maximum on these declarations; numeric validation only checks their specified integral semantics.

Existing declared km/week remains a separate distance fact. There is no km-to-time conversion, distance/frequency division, duration/frequency multiplication, averaging or reconciliation with observed execution. In particular 30 km/week + 45 minutes + 4 sessions retains all three facts and never produces 180 prescribed minutes or 7.5 km/session.

## Capture and provenance

`habitualRunningRequirement` emits a serializable field-specific question when the dose capability gate cannot admit new methods and a declaration is absent. The chat client displays it and sends the answer through `responder_habito_carrera`; it does not infer facts or select dose. No global onboarding field was added.

The first question requests an integer number of easy-running minutes or the exact explicit answer `No tengo un rodaje fácil habitual` (API status `NO_HABITUAL_EASY_RUN`). The next requests habitual sessions per week. The server parser accepts integers/digit strings and the explicit absence value, not narrative interpretation or an LLM extraction.

`saveHabitualRunningAnswer` validates before writes, reads the current JSON and replaces only the current declaration while retaining other profile fields. Identical value/status preserves the original record and confirmation time; changed values replace the current fact with a server confirmation time. This is current-profile storage, not a new event history. Generic `actualizar_usuario` preserves this namespace instead of accepting stale or model-derived replacements. The UI capture branch returns before conversational generation.

Completing both questions does not automatically resume generation or claim that a policy exists. The confirmation explicitly says that saving the routine does not yet authorize a dose. A subsequent request recomputes current capability.

This action reuses the existing legacy `/api/chat` identity/transport boundary. It does not implement authenticated identity migration, an atomic JSON-path writer or concurrent profile-update reconciliation. Like the existing profile editors, its read/merge/write can race another simultaneous full-profile writer. These are existing architectural limitations, not new evidence authority or prescription permissions.

## Canonical flow

1. Existing `loadAthletePrescriptionContext` reads `perfil` and the existing history sources.
2. `projectRunningDoseBaseline` calls `projectHabitualRunningDeclarations` to project exact structured records. Malformed values, authority, source, semantics, dates or units are excluded. Arbitrary extra fields are not projected.
3. `resolveRunningDoseBaseline` revalidates and keeps the facts in `habitualDeclarations`, separate from old `RunningDoseFact` duration/distance/execution metrics. Facts are deduplicated and stably ordered.
4. `admitRunningDoseEvidence` independently revalidates these canonical facts and carries them in `basis.habitualDeclarations` as `DECLARED`. It never inserts them into observed windows or occurrence counts. Admission can remain `OBSERVED` when genuine execution coexists; that classification does not upgrade the declarations.
5. `resolveCompatibleRunningDoseEvidence` exposes this collection only to `AEROBIC_CONTINUOUS`. Its evidence references and source digest bind the individual declarations. Other families receive no new quantitative declaration collection.
6. `buildDoseCapabilityProfile` evaluates the method registry and current evidence before weekly candidate selection.

The separate declaration collection also prevents old v1 distance-only consumers from accidentally reading minutes or session counts as meters. Existing observed evidence, km declarations and exposure-only associations retain their previous types and semantics.

Two distinct values/statuses for one declaration field conflict; an available habitual outing and zero current habitual sessions also conflict under the explicit current-routine semantics. No-habitual-easy-run plus positive frequency is not automatically contradictory: the athlete may run without a habitual easy outing. Relevant declaration conflicts block aerobic readiness. They do not fabricate threshold/VO2 evidence or globally invalidate unrelated domain quantities.

## Recency

B.3.1 uses historical execution windows, and profile references may carry dates. Neither defines an accepted physiological expiry policy for these two new declarations. The implementation therefore retains `confirmedAt` (including a canonical legacy `null`) and always exposes freshness `UNKNOWN`. An old declaration is not automatically deleted, refreshed or declared physiologically current. Evidence-ready means the required declarations exist, not that freshness has been medically or physiologically established. Any later reconfirmation/expiry policy needs explicit product/domain authorization.

## Capability contract

`DoseCapabilityProfile` has version 1, `entries` per catalog method/pattern/variant and an optional contextual `requirement`. Entries contain:

`methodId`, `family`, `variant`, `pattern`, `evidenceStatus`, `policyStatus`, `compositionStatus`, `intensityStatus`, `doseCapability`, `prescriptionAllowed`, `missingRequirements`, hashed `evidenceRefs`, and structured `diagnostics`.

It contains no raw profile, raw declaration values or selected dose. Domain logic stays in `lib/sports` / `lib/athlete`; clients only transport structured questions and answers.

| Method | Family | With only 45 easy minutes and 4 habitual sessions |
| --- | --- | --- |
| `running_base` | `AEROBIC_CONTINUOUS` | `EVIDENCE_READY_POLICY_MISSING` |
| `running_threshold` | `THRESHOLD_WORK` | `MISSING_EVIDENCE` |
| `running_vo2` | `VO2_INTERVAL` | `MISSING_EVIDENCE` |
| `running_specific` | `EVENT_SPECIFIC` | `MISSING_EVIDENCE` |
| `running_recovery` | `RECOVERY` | `MISSING_EVIDENCE` |
| `running_economy` | `TECHNICAL_EXPOSURE` | `MISSING_EVIDENCE`; separate variant/intensity requirements |

Aerobic without the required facts is `MISSING_EVIDENCE`; explicit no habitual easy outing adds `FIRST_EXPOSURE_POLICY_REQUIRED`; a relevant conflict gives `CONFLICT`. `QUANTIFIABLE` requires the existing v2 resolver to actually return a valid `RESOLVED` dose. No production selector does so today. Test-only registry policies prove that branch without changing production.

Preparation/composition is still not established, and economy intensity requirements remain distinct. Measurement capabilities, physiological references, method intensity and session time authority are not redefined here.

## Strategy boundary and modes

`loadWeeklyPlanningContext` computes capability from the already-loaded admission. `buildCanonicalWeekStrategy` still resolves qualitative goal/adaptation demands; `resolveAuthorizedMethodCandidates` filters dose-unavailable methods before their feasibility evaluation and before Planner option selection. Strategically relevant does not mean quantitatively prescribable.

If dose exclusions leave no new executable option, the result is `RUNNING_DOSE_CAPABILITY_INSUFFICIENT`, `canContinue: false`, `retryable: false`, with `NO_DOSE_QUANTIFIABLE_RUNNING_METHOD`, capabilities, deduplicated deferred demands and any missing declaration question. Planner and Builder are not called through this route.

If other useful methods remain (for example Box or supporting strength), they may continue under their existing authorities. Excluded demands appear in `strategy.deferred` with `dose_*` reasons; a missing threshold method never becomes an equivalent base adaptation. Existing explicit transfer authority is unchanged. Contextual capture is currently attached to the insufficiency outcome; a mixed plan that can proceed does not interrupt for these optional future aerobic facts.

Supervision never gains prescription permission from captured facts. Focus retains its managed discipline; external Running facts cannot grant Running prescription authority. Coach retains normal ownership semantics. Non-running policies and the historical strategy-less transport path are unchanged; the current production strategy path supplies capability.

The new facts do not change `SessionDoseContext` or its evidence digest. Aerobic compatible-evidence/source digests intentionally include their structured provenance. The weekly contract digest intentionally binds the capability input and any deferred demands. Neither raw declarations nor a new prose interpretation enter the weekly Planner/Builder prompt.

## Current limits and next phases

- All six B.3.2B v2 production selectors remain `null`; there is no new target, maximum, minimum, progression, weekly allocation or preparation dose.
- Captured evidence supports a future B.3.2B.3B aerobic policy only. That phase must explicitly authorize target selection semantics, freshness/reconfirmation requirements, conflict handling, first-exposure behavior, preparation/composition and the interaction with time hard limits. Actual intent/role and session validation remain authoritative.
- Recovery is not “half base”; threshold, VO2 and specific work need independent compatible evidence and policies. Economy needs variant/bout/intensity semantics.
- B.3.3 weekly allocation/progression is outside this change. Habitual frequency is context only and does not schedule N days.
- There remains no audited production writer of verified executed running quantities. Completion flags and planned descriptions do not provide execution dose. Unit tests use explicitly canonical verified-execution fixtures solely to prove coexistence.
- No migration, backfill, deployment or push is part of this phase.

## Verification

`lib/sports/doseCapabilityProfile.test.mjs` covers the A–AD matrix, exact/idempotent capture, provenance rejection, old-date handling, observation coexistence, compatible digest isolation, actual read-only preflight/Planner rejection, mixed-domain deferral, and the UI capture transport.

Calendar/feasibility regression fixtures use `numericPolicyFixture` from the existing test-only v2 fixture module to exercise their original downstream boundaries. It substitutes accepted synthetic numeric selectors only in the isolated test module loader; it does not bypass feasibility, restrictions or calendar evaluation and is never imported by production. Production-null behavior has separate tests.

Final validation: 26/26 new tests; 860/860 selected regression tests; 1,930/1,930 tests in `node --test --test-concurrency=4 lib/**/*.test.mjs`. `npx tsc --noEmit` and `git diff --check` pass. Lint on changed/new code compared with HEAD retains 432 errors and 55 warnings, with zero new normalized diagnostics (code-frame line shifts excluded). All three new code/test files have zero lint errors/warnings. Existing debt is not presented as a clean lint run.

The initial full run had 11 failures in downstream calendar/feasibility fixtures because the new gate correctly removed unresolved Running options. Their explicit test-only policies preserve those original downstream assertions; the final full run passes without changing any production numeric selector.
