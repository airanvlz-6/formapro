# B.3.1 — Athlete Running Dose Baseline

Initial HEAD: `6dc6774e668c224cf9fb11429d38ab5b169fb85d`; working tree clean.

## Problem and boundary

Running intensity selection exists, but duration is still proposed by Builder under a temporal
ceiling. B.3.1 supplies factual evidence infrastructure, not authorization of any duration.
Availability, level, readiness and restrictions never enter the baseline calculation. No targets,
progression, minimum useful durations, fallback minutes, ACWR, load ratios or intensity changes.

An important audit result: this checkout does **not** have a production writer that this phase
can safely promote to verified numeric Running execution. The resolver supports canonical actual
duration/distance, but production adapters do not manufacture those inputs. Unit tests of those
quantities explicitly inject canonical evidence; they do not invent persisted fields or claim a
Garmin importer exists. This limitation remains visible as
`RUNNING_DOSE_ACTUAL_QUANTITY_WRITER_UNAVAILABLE`.

## Actual source inventory

| Source / writer | Fields and units | Semantics | Date / identity | Limitation and B.3.1 use |
|---|---|---|---|---|
| `weekly_plan.sessions`, `recordPlanCompletion` | `completada`, `titulo_real`, `descripcion_real` | Completed flag / report, not actual numeric dose | `week_start` + `dia`; optional `session_id`; exact `tipo=carrera` | Completion writer changes three fields, not actual quantities. Count identified completed Running plan occurrences only. No report-text parsing. |
| `weekly_plan.sessions.structuredPrescription` | `proposal.blocks[].movements[].prescription.durationSeconds`, `distanceMeters`, sets/rest; `duration` operational estimate | PLANNED, even when the session is marked completed | Same plan session; `objective.intent.methodId`, `adaptationId` | Never promote planned totals, estimates or main-work duration to actual. Valid catalog method association is retained as completed **plan** occurrence. |
| `usuarios.workout_history`, `registrar_sesion` | `workout_id`, `fecha`, `tipo`, `duracion`, notes/sensation/analysis | Reported execution; duration has no validated unit | Caller ID or generated week/day ID; no persisted verified cross-source link | Existing load reader already treats duration as unknown. History records excluded from combined counts because cross-source identity is not established. Never parse notes. |
| Safety-net completion writer in chat route | `fecha`, `tipo`, `notas`, `source=safety_net_deterministico`; normally `duracion=null` | LLM-extracted report behind completion detection | Weak date/type matching | Source label does not prove deterministic extraction. No quantitative baseline input. |
| `external_training_records` writer in chat route | `fecha`, `disciplina`, `duracion` minutes, `intensidad_percibida`, `source=user_report`, `load_quality` | External reported load | Table ID; no verified join to Forge activity | Current writer obtains quantities via LLM extraction. The existing `externalActualLoad` accepts them for its own load view; B.3.1 deliberately does not reuse it as verified evidence or add a query. No distance field in that reader. |
| `usuarios.perfil.km_semana` | Existing parser: positive numeric km or closed km range | DECLARED | Optional existing observation date, commonly absent | Retain source path and convert km to meters; not executed load. No invented timestamp. |
| `usuarios.test_atleta.km_semana`, `captureAthleteTestFacts` | Exact captured questionnaire answer, km bands; `fecha` | DECLARED, not generated `informe` | Capture date if present | Reuse existing canonical parse; closed ranges stay ranges. Open bands unsupported by that parser remain unavailable. |
| `datos_entrenamiento`, `historial_marcas`, test `informe` | Potentially structured or narrative values | Mixed writers / summaries | Mixed | Not admitted to baseline declarations, even when the generic reference projection recognizes `weeklyDistance`. |
| `calcularFrecuenciaRealRelativa` | Recent history record count / declared available days, clipped to 1 | Availability-utilization proxy | Rolling wall-clock seven days; not Running-only | Not baseline frequency; availability denominator, weak dedupe and no actual quantity. B.3.1 counts identified occurrences in civil-day windows instead. |
| `loadTrainingLoad` | Planned vectors, history quantities unknown, external reported quantities | Separate planned / actual views | Paginated date windows | Explicit `unknown_cross_source_overlap`; no complete executed structure. Not a canonical tolerated-load baseline. |
| HealthKit `sincronizar_healthkit_real` | `healthKitPatch` into physiology | Today's physiological aggregates | No activity identity/quantity contract | Not an activity importer. No HealthKit/Garmin-to-session matching is added. |
| Block Analyzer / serverProfile / welcome / textual history | Relative volume, relative intensity, arbitrary prose | Non-authoritative narrative/proposal | Not execution evidence | None enters the resolver. |

Source paths describe field semantics, not cryptographic proof of who historically wrote every
legacy profile value. B.3.1 accepts only the existing direct declaration locations, excludes the
known LLM/derived locations and never upgrades a declaration to verified execution. Legacy
storage without immutable provenance cannot establish stronger historical authorship.

## Flow and placement

```text
Existing loadAthletePrescriptionContext reads (unchanged)
  usuarios + last four weekly_plan rows
        + existing running declaration projection
                    |
          projectRunningDoseBaseline
                    |
     canonical RunningDoseFact[] (allowlisted fields)
                    |
          resolveRunningDoseBaseline
                    |
  AthletePrescriptionContext.runningDoseBaseline
                    |
      future deterministic B.3.2 consumer
```

The baseline is a domain-specific server-context sibling. It is intentionally **not** added to
`SessionDoseContext` or `AllowedTrainingContract`: `generateContractSession` serializes that
contract into the prompt. Adding evidence there now would change Builder inputs. The existing
projection and evidence digest remain identical, verified by an integration test. No new database
queries, migrations, prompt instructions, logging, receipts or persistence writes.

## Evidence semantics and units

`RunningDoseFact` distinguishes EXECUTED, DECLARED and PLANNED_ONLY. Quantities have explicit
metric/units (seconds, meters, sessions), source, optional exact declaration path, date,
namespaced identity and categorical reliability. No raw profile, descriptions, titles, physiology,
user ID, tokens or narrative is copied. Session IDs are SHA-256 projected to opaque identity;
this is identifier minimization, not a receipt/evidence digest.

`completion_flag` proves only the existing completed-plan occurrence. `direct_declaration`
describes a declaration, not observed execution. `verified_actual` is the canonical resolver
boundary for actual quantities; no current production adapter emits it. It is not an external API
that authenticates arbitrary caller claims. A future source adapter must establish provenance,
execution, units, discipline and identity before using that boundary. The resolver is Running-only;
the current adapter admits exact `tipo=carrera`, never fuzzy title/sport inference.

Declarations retain their own values and provenance separately from observed window quantities.
Declared 25 km and observed 45 km are not a conflict. Multiple differing declarations are kept;
this phase does not select a winner or average them. Availability and experience are absent
from the canonical fact input.

## Identity and conflicts

* Verified canonical evidence with the same namespaced activity identity joins across sources.
  Identical metrics count once; source evidence remains available.
* Current plan adapter uses hashed `session_id` when present, otherwise the unique week/day
  plan slot. A slot represents a plan completion occurrence, not an imported activity match.
* Multiple same-day plan entries without IDs remain ambiguous and are excluded from counts.
* History IDs are not equated to session IDs or dates. History is retained as ambiguous evidence
  and excluded from combined totals; no fuzzy match, title match or automatic same-day join.
* Same activity identity with contradictory actual values for the same metric, or contradictory
  dates, creates CONFLICT. The entire affected activity is excluded from aggregation. No average.
* Independent identified activities with unknown possible real-world overlap must not be fed by
  a future adapter as distinct verified identities unless that adapter establishes their identity.

## Windows, coverage and aggregates

Central constants: inclusive 7 and 28 **civil days**, ending at explicit `asOfDate`. They are
descriptive windows, not acute/chronic policy. Dates use existing `resolveCompletionDate`
(Atlantic/Canary for offset timestamps). Invalid, undated executions and future/out-of-window
events are excluded diagnostically. Declarations may be undated and remain explicitly so;
dated declarations outside the window are excluded rather than silently refreshed.

Existing four plan rows do not prove full capture over 28 days. `captureCompleteness=UNKNOWN`
is always explicit. `observedDays` counts distinct dates with admitted occurrences, not days
known to have complete surveillance. Missing execution is not a proven rest day.

Per-window sums expose known contributions with evidence indices. UNKNOWN means no known
value; PARTIAL means incomplete quantities/ambiguity/conflict; OBSERVED means quantities are
known for the included identified sample, **not** all real-world activity. A missing total is null,
not a zero-load assumption. Longest and mean use known actual quantities only. Mean is the mean
of the known sample; PARTIAL stays visible if other included activities lack that quantity.

Frequency is identified observed session count, not tolerated/available sessions. Its PARTIAL
status reflects unknown capture completeness. `completedRunningSessions=0` means no admitted
identified occurrences, not evidence that the athlete did not run.

Method exposure reports `completedPlanOccurrences`. It does not claim actual adherence to
the intended method. `executedMainWorkSeconds` always remains null: this checkout cannot prove
executed block quantities. Titles never classify a method.

## Exact status rules

1. CONFLICT: at least one identity/date or actual quantity conflict.
2. SUFFICIENT: at least one identified executed activity, every included activity has both actual
   duration and distance, and no ambiguous execution identity is present. This means quantitative
   completeness **of the observed sample only**; capture completeness still remains UNKNOWN.
3. PARTIAL: at least one admitted activity, declaration or identity-ambiguous execution exists,
   but the preceding criteria do not hold.
4. UNKNOWN: none of those sources provides baseline evidence. Uncompleted plans do not change it.

No status maps to fitness or permission to prescribe. In current production, the adapter cannot
reach SUFFICIENT because no audited actual-quantity writer is available.

Examples:

| Input | Status | Observed duration/distance | Other evidence |
|---|---|---|---|
| New athlete, 90 min available, intermediate | UNKNOWN | null / null | Availability and level excluded |
| Declared 30 km/week | PARTIAL | null / null | 30000 m DECLARED, source retained |
| Completed plan with planned 3600 s main | PARTIAL | null / null | One completed plan occurrence; actual main unknown |
| Canonical verified actual 1800 s / 5000 m | SUFFICIENT for observed sample | 1800 / 5000 | Synthetic resolver example; requires future audited writer |

## Validation and future boundary

Permanent tests cover A–V plus civil-date/window boundaries, stable serialization, partial sums,
date conflicts, ambiguous plan identities, source exclusion, ranges and loader/Builder isolation.
Actual quantity cases test the resolver using explicit canonical fixtures; production-adapter
tests explicitly show legacy/planned/extracted quantities remain unknown.

B.3.2 now has a typed server baseline, separate declarations, identified occurrences, partial
quantities, conflict/identity diagnostics and explicit missing signals. Before useful numeric
prescription from actual load, it still needs an audited structured execution writer or an
explicitly authorized policy for declared evidence. It MUST NOT infer tolerated dose from
availability, level, sample completeness, planned quantity, a completion flag, a textual method
name, physiological readiness, or an unknown baseline. B.3.3 must separately validate authorized
dose with intensity and weekly exposure.

No prescription policy is introduced by B.3.1.

## Validation results

* New permanent baseline tests: 30/30 passed.
* Selected context, history/execution, dose, sufficiency, time, Running intensity/reference,
  whole-week and onboarding/profile tests: 475/475 passed (before the final additional unit
  validation case; that case passed in the final 30-test run and full suite).
* Final `node --test --test-concurrency=4 lib/**/*.test.mjs`: 1823/1823 passed, no skips.
* `npx tsc --noEmit`: passed.
* `git diff --check`: passed.
* ESLint of new files: zero errors/warnings. All affected code files: one existing
  `no-explicit-any` error in `loadAthletePrescriptionContext` (HEAD had the same error).
  Delta: zero errors, zero warnings. This does not claim global lint cleanliness.

Local commit only; no push or migration.
