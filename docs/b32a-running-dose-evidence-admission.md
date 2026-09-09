# B.3.2A — Running Dose Evidence Admission

Initial HEAD: `a9c3b3bb805067035b71334649ee6cca0c777398`, clean working tree.

## Purpose and boundary

`admitRunningDoseEvidence(baseline: RunningDoseBaseline): RunningDoseEvidenceAdmission`
classifies which canonical B.3.1 facts may be considered by a future method-dose policy.
It does not prescribe training. Version 1 uses policy ID `running-dose-evidence-admission-v1`.

Audited: `runningDoseBaseline.ts`, `runningDoseEvidence.ts`,
`loadAthletePrescriptionContext.ts`, `sessionDoseContext.ts`, and the B.3.1 source/writer
inventory in `b31-running-dose-baseline.md`. Source limitations are unchanged. No source
adapter, parser, database schema or execution writer is added.

```text
Existing canonical reads and B.3.1 projection
  → RunningDoseBaseline
  → admitRunningDoseEvidence
  → AthletePrescriptionContext.runningDoseEvidenceAdmission
  → future B.3.2B (not implemented)
```

The admission is a server-only sibling. The loader resolves the baseline once and passes that
same object to admission. No extra database reads. No change to SessionDoseContext,
AllowedTrainingContract, Builder prompt/schema, structuredPrescription, receipt, digest,
renderer, persistence or dose policy. The existing SessionDoseContext projection does not
serialize either the baseline or admission; integration tests compare its entire output and digest.

## Explicit admission policy

| Canonical fact | Admission | Conditions |
|---|---|---|
| Actual numeric duration/distance | OBSERVED | EXECUTED, stable identity/date, `verified_execution`, `verified_actual`, corresponding seconds/meters unit, no identity conflict |
| Structured weekly distance declaration | DECLARED | DECLARED, `profile_declaration`, `direct_declaration`, meters |
| Identified completed occurrence | EXPOSURE_ONLY | EXECUTED occurrence of 1 session, allowed canonical source/reliability, date/identity, no conflict |
| Planned facts | Excluded: PLANNED_ONLY | Completion never upgrades planned quantity |
| Conflicting execution identity | Excluded: EXECUTION_CONFLICT | Quarantine whole activity, including other metrics |
| Unidentified execution | Excluded: IDENTITY_AMBIGUOUS | No fuzzy join or new deduplication |
| Other provenance/semantics | Excluded: UNAUTHORIZED_PROVENANCE | No fallback to raw or derived data |

Availability, level, readiness, restrictions and LLM summaries are not arguments to admission.
They cannot influence its output. Their exclusion diagnostics are invariant policy descriptions,
not assertions that such fields were supplied. Facts discarded before B.3.1 cannot be enumerated
as individual excluded evidence here; admission does not re-read raw sources to reconstruct them.

The function accepts a trusted **canonical B.3.1 object**, not untrusted JSON from a client or
provider. It is not an authentication mechanism for caller assertions of `verified_actual`.
Future adapters must prove source provenance and Running execution identity before producing
canonical facts; this phase does not weaken that boundary.

## Status precedence and coexistence

`CONFLICT → OBSERVED → DECLARED → EXPOSURE_ONLY → UNKNOWN`.

* A B.3.1 conflict status or nonempty conflict list always preserves primary CONFLICT.
* Otherwise any admitted verified quantity produces OBSERVED, even if only one metric is known.
* Otherwise a declaration produces DECLARED; otherwise an admitted occurrence produces EXPOSURE_ONLY.
* No admitted facts produces UNKNOWN. B.3.1 PARTIAL does not automatically grant authority.

This order selects a primary evidence-class label only. It is **not** numerical policy precedence
between different time/provenance semantics. No source replaces another: observed 20 km in seven
days and declared 30 km/week remain separate, never averaged to 25 km. Declared 30 km plus two
quantity-unknown occurrences remains DECLARED with both exposures retained, without adding
unknown quantities to 30 km. Conflicts cannot be hidden by falling back to declaration.
Unrelated nonconflicting observations and declarations may remain visible under CONFLICT;
future consumers must respect the primary conflict state, not bypass it by selecting secondary facts.

## Contract for B.3.2B

The future consumer receives `RunningDoseEvidenceAdmission` plus its method/phase context.
It needs no raw profile, plan, history, serverProfile or baseline access.

* `basis.windows['7'|'28']`: original civil start/end dates, observed duration/distance, and
  identified occurrence count. Each metric preserves value, unit, knownActivities, evidence indices
  and AVAILABLE / PARTIAL / UNKNOWN. AVAILABLE means the included observed sample is quantified,
  not that all athlete activity is captured. Null is not zero load.
* `basis.declaredWeeklyDistance`: independent minimum/maximum meters, observedAt (possibly null),
  evidenceIndex. Scalars become equal endpoints; ranges never become midpoints.
* `basis.longestObservedRun`, `averageObservedRunDuration`: B.3.1 factual metrics with the original
  coverage window and metric-level completeness. Missing values stay missing.
* `basis.methodExposure`: methodId, occurrenceCount, observed date bounds, evidenceIndices,
  `semantics=COMPLETED_PLAN_ASSOCIATION`, `quantityKnown=false`. It proves association with a
  completed plan, not adherence to its intended method or tolerance of any main-work minutes.
  Unclassified occurrences remain in evidence/counts without an inferred method.
* `admissibleEvidence`: each admitted fact once, its original baseline index and admission class.
  This dictionary makes basis references self-contained and preserves identity/provenance.
* `excludedEvidence`: original index and reason code; no raw rejected payload is copied.
* `conflicts`, `missingSignals`, stable machine-readable `diagnostics` retain unresolved conditions.

No duration/distance aggregation or identity reconciliation is reimplemented: admission projects
B.3.1 aggregates only when their contributing evidence has been admitted. It never upgrades a
PARTIAL metric. A source-rejected metric cannot remain available merely because its aggregate
was numeric. Conflict handling reuses B.3.1 identity decisions.

## Coverage and production limits

Reuse B.3.1 inclusive 7/28 civil-day windows, without physiological interpretation, ACWR or new
time windows. `captureCompleteness=UNKNOWN` remains explicit. Reading four plan rows never proves
all activity was captured. An occurrence count means identified observations in the window,
not habitual weekly frequency or tolerated frequency.

Current production adapters cannot produce verified numeric actual quantities. OBSERVED is
exercised with synthetic canonical evidence in tests and remains unavailable from those adapters.
Legacy duration units, LLM-extracted external quantities and missing activity links stay unresolved.
Existing direct declaration paths keep B.3.1's historical provenance limitations; nothing upgrades
their authorship to cryptographically verified execution.

| Example | Primary status | Basis |
|---|---|---|
| Intermediate, 90 min available, no evidence | UNKNOWN | No numeric basis |
| Same, declared 30 km/week | DECLARED | 30000–30000 m declaration, no observed distance |
| Completed plan, planned main 3600 s, no actual quantity | EXPOSURE_ONLY | Identified occurrence; observed duration unknown |
| Canonical verified 1800 s, distance absent | OBSERVED | Duration AVAILABLE; distance UNKNOWN; capture UNKNOWN |
| Same activity claims 1800 s and 3600 s, plus declaration | CONFLICT | Activity excluded; declaration retained as secondary |

## Non-goals and validation

No targetDuration, targetDistance, maxSessionDuration, weeklyTarget, progressionPercent,
sessionDose, methodDose, longRunTarget, thresholdMinutes, VO2 counts, fallback minutes or
training recommendations. No readiness/restriction modulation, HR derivation, C3, substitution,
transfer or Builder behavior changes.

Permanent tests cover A–V, partial aggregates, stable serialization, original windows, forbidden
output fields, provenance rejection and conflict quarantine with unrelated observations retained.
Tests of observed quantities are explicitly synthetic canonical evidence, not imported production
activity fixtures.

Validation: 24/24 new tests; 500/500 selected regressions (including B.3.1, athlete context,
execution/history, SessionDoseContext, Running intensity/references, Time Authority and whole-week);
full `node --test --test-concurrency=4 lib/**/*.test.mjs`: 1847/1847 passed, no skips.
`npx tsc --noEmit` and `git diff --check` passed. ESLint: new files have no errors/warnings;
the affected loader retains the single pre-existing `no-explicit-any` error (HEAD line 22,
now line 23). Delta zero; no claim of global lint cleanliness. Local commit only, no push/migration.
