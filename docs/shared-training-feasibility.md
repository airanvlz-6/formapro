# 2E.3A.1 — Shared deterministic feasibility

Baseline: `33c7b94`. Scope: extraction only, no weekly consumer or weekly intent.

## Extraction boundary

| Responsibility | Owner after extraction |
| --- | --- |
| Canonical restriction reads/projection | Unchanged `getCanonicalRestrictions`: `athlete_state_events`, `athlete_coaching_notes` |
| Server context reads | `prepareSessionTrainingContext`: `athlete_training_sources`, conditional `external_training_records`, last four `weekly_plan` rows |
| Scope, discipline and availability normalization | Existing adapter and `prescriptionScope` / `trainingAvailability`, unchanged rules |
| Loaded input validation and stimulus resolution | `trainingFeasibility`: exact `STIMULUS_LIBRARY` discipline lookup after existing key normalization |
| Candidate lookup, area filtering and exposure ranking | Existing `rankearCandidatos` in `movementLibrary`, called only by the shared pool evaluator |
| Explicit movement exclusions | Shared pool evaluator, before capability filtering, unchanged ordering |
| Capability compatibility, including relevant unknowns | Existing `activeRestrictionFlags` / `evaluateMovementRestrictions`, unchanged |
| Compatible structures | Existing `STRUCTURES_BY_STIMULUS` and discipline check against `WORKOUT_STRUCTURE_LIBRARY` |
| Satisfiable structures and detailed format checks | Shared `structureSemantics` |
| Contract integrity and public fields | `allowedTrainingContract`, recomputes through the shared core |

`prepareSessionTrainingContract` remains the session adapter entry point; it loads
context and then builds the contract. The existing Session Builder reaches this
same entry point. No API route, generation/retry flow or persistence was changed.

## Pure API

`evaluateTrainingFeasibility(input: ContractInput)` accepts already loaded context.
An unresolved input returns `resolved: false`, `feasible: false`, and errors.
A resolved input returns discipline, stimulusId, candidates, allowed movements,
restrictionFiltering, rankedCandidates, compatible structure IDs, satisfiable
structure IDs, a feasibility boolean and errors. Empty movement pools still expose
their filtering evidence to this internal caller; no raw context is added to errors.

The existing `ContractInput` provenance label `weekly_session_builder` is preserved;
it does not require an HTTP request or invoking a builder. Future consumers can
load canonical context once, reuse it across days/stimuli and call the pure API.
Availability and exposure are discipline-specific: do not change discipline while
reusing another discipline's exposure report. This phase does not optimize loading
the entire weekly product. No DB, clock read, LLM, generated blocks, rendering or
new intent is part of feasibility. The type-only import of ContractInput does not
create a runtime dependency on the contract module.

Candidates are the existing ranked list after area and explicit-ID exclusions.
`restrictionFiltering` remains exactly the capability-filter failures from that
list, in the existing order; it is not reinterpreted to include earlier exclusions.

## Structure existence and parity

The public `allowedStructureIds` stays the compatible pool. The internal
`satisfiableStructureIds` is its satisfiable subset. Couplet requires two distinct
main IDs and triplet three. Other current formats admit at least one. IDs can be
reused across warmup, main and cooldown under the unchanged shape validator.
Continuous formats admit one uninterrupted set with no rest. Existing positive
dose bounds admit a minimal valid dose; existence does not prescribe that dose.
Typical durations and prose descriptions are not new acceptance rules.

`STRUCTURE_SPACE_UNSATISFIABLE` diagnoses a nonempty movement and compatible
structure pool with no satisfiable combination. No current stimulus maps to
couplet/triplet, so this adds no reachable rejection for current canonical inputs.
It prevents a future catalog change from making a nonempty pool alone sufficient.
The contract builder and validator both respect feasibility. Existing public
results, fields, ID ordering, filtering, ranking and error ordering are compared
byte-for-byte against the deployed implementation, including all 32 flag
combinations across every stimulus. There is no ordering exception.

The regression oracle executes three original modules from local git commit
`33c7b94`; the test therefore requires that baseline in local history. It never
fetches history or runs a second production engine. The catalog and restriction
policy remain unchanged.

## Exact production shape

Week `2026-09-07`, Coach scope `box` + `carrera`; active reassessment with effective
impact/jump/deep-flexion prohibitions and axial-load prohibition false. This fixture
models the supplied effective flags, not an invented production medical record.

| Day | Discipline / stimulus | Expected and actual |
| --- | --- | --- |
| lunes | carrera / recuperacion_activa | MOVEMENT_POOL_EMPTY |
| martes | box / halterofilia_tecnica | MOVEMENT_POOL_EMPTY |
| miercoles | carrera / base_aerobica | MOVEMENT_POOL_EMPTY |
| jueves | box / fuerza_maxima | ["bench_press"] |
| viernes | carrera / economia_carrera | MOVEMENT_POOL_EMPTY |
| sabado | box / halterofilia_tecnica | MOVEMENT_POOL_EMPTY |
| domingo | carrera / base_aerobica | MOVEMENT_POOL_EMPTY |

Thursday's intent mismatch is deliberately not addressed. No fallback, inferred
safety, medical change or movement metadata repair was introduced.

## Temporal audit: preserved debt

`getCanonicalRestrictions` calls `madridRestrictionDate(now)`, which hardcodes
`Europe/Madrid`. `projectCanonicalRestrictions` receives a civil `asOfDate` and
excludes notes only when `valid_until < asOfDate`; expiration remains inclusive.
Repository evidence establishes a Madrid civil date, not a documented per-athlete
timezone contract. No canonical athlete timezone field/source was found in the
profile types, readers or SQL. This is a repository audit, not a production read.

The `planificar_semana` route computes today with hardcoded `Atlantic/Canary`;
`resolveWeeklyGeneration` also hardcodes it for captured-week validation.
`beginWeeklyGeneration` accepts the caller's civil date. Calendar authority works
with those supplied dates. `resolveCompletionDate` uses Canary time too.

Changing Madrid to Canary changes behavior: at `2026-09-06T22:30:00Z`, Madrid is
already September 7 while Canary is September 6. A note expiring September 6
therefore has a different active status. Without an established canonical timezone
source, this discrepancy needs a separately specified migration of temporal
semantics. No timezone or expiration implementation changed here.

No availability, frequency, REST/RECOVERY, receipt, weekly Planner, retry, intent,
Readiness, Auth, Team, CAS or prompt changes. No migration and no push.

## Validation

- 15 new tests: seven production slots, every stimulus across 32 flag combinations,
  malformed inputs, contract tampering, area/ID restrictions, all structure formats,
  detailed-validator parity, context reuse and temporal boundaries.
- The isolated hypothetical couplet/triplet mapping proves that a nonempty movement
  pool alone is insufficient, including rejection by both builder and validator.
  This modifies only a fresh in-memory test runtime, not any catalog file.
- Targeted contract/structured-session/restriction/core suite: 125 passed before
  adding that last structure integration test; all 126 are included in the final suite.
- Planning: 291 passed. Sports: 243 passed (264 with canonical restriction tests).
- Full `lib`: 718 passed, zero failures, skips or cancellations.
- `npx tsc --noEmit --incremental false`: passed.
- `git diff --check`: passed.
