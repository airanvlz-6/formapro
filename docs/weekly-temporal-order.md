# Resolve temporal intent before weekly feasibility

Base: 23b8476652bc93678f3427dfdbbc6a960ff9d9fa.

The old preflight called prepareAllowedWeeklyPlanContract with `explicit ?? true`,
then asked only if admitsNewTrainToday accepted a new TRAIN today. A feasibility
rejection or completed today could therefore prevent the question. The Planner
HTTP entry also used `datos.empezarHoy !== false` for missing values.

New order: confirmed availability -> temporal relevance and explicit parser ->
TEMPORAL_DECISION_REQUIRED when unresolved -> resolved includeToday -> existing
weekly feasibility -> Analyzer -> Planner -> Builder -> save.

Relevance uses only the current target interval, managed calendar availability,
completed entries and current external source days. It does not read restrictions,
methods, structures or strategy, or run DP to decide whether to ask. Completed today
never supplies the user's answer if relevant future days remain.

No question is needed outside the target interval, without relevant managed days,
or after an explicit answer. Existing contract preparation still owns no-op and
no-prescription decisions; these outcomes have not been reimplemented or relaxed.
An immaterial out-of-interval decision uses includeToday=false, which changes no
future target slots. There is no decision based on time of day.

False is passed to the existing empezarHoy adapter. That adapter excludes today;
current availability and protection determine the next admissible day. No second
next-day prescription algorithm is introduced.

The frontend pins user, generation token/snapshot and targetWeekStart while a
preflight question is pending. It reuses the existing confirmed availability digest.
The server compares it with the current confirmation authority; only a changed
snapshot requests availability confirmation again. Construction messages are emitted
only after preflight allows continuation. Questions and terminal outcomes remain
structured across the API and all existing UI callers.

Direct Planner requests missing a boolean temporal decision use the same preflight;
there is no remaining missing-value-to-true fallback at that HTTP entry.

Fixture from the supplied calendar: weekStart 2026-09-07, today 2026-09-08,
Tuesday completed, Box Tuesday/Thursday/Friday/Saturday, Carrera Monday/Wednesday/Sunday.
With temporal null: TEMPORAL_DECISION_REQUIRED before feasibility, even with a
controlled movement pool made completely infeasible.
With true or false: Tuesday remains protected. In a controlled CrossFit/deload
context without restrictions, both have Wednesday/Sunday REST or RECOVERY and
Thursday/Friday/Saturday REST or TRAIN. Their Builder domains coincide because
Tuesday is completed, while their explicit interval origins differ. With all movements
excluded in a controlled fixture, both retain NO_NEW_EXECUTABLE_PRESCRIPTION.
These controlled restrictions and strategy inputs are not a reconstruction of
unsupplied production restriction data.

Tests T1-T10 cover the early requirement, explicit intervals, completed today,
outside/closed weeks, availability freshness, no construction message while pending,
Repair 1 no-prescription, and actual UI transport through the ordered pipeline.
The existing generation cap, goal/strategy resolution, catalogs, restrictions,
REST protection and persistence are unchanged.

Validation: affected-layer tests passed; complete suite 1397/1397, TypeScript
and git diff --check passed. Modified-file ESLint compared against 23b8476:
FormaPro 182 errors/46 warnings, route 243/9, preflight 3/0, changed/new tests 0/0.
No added rule/severity counts; existing lint debt is not part of this repair.
