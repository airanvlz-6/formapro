# D2A historical running continuity

Read-time only. No migration, table, SQL, history rewrite or execution insertion.
No numerical progression, C2/B3 policy change, event phase, taper or load science.

## Observed writers and trust

`registrar_sesion` writes workout_id, tipo, fecha, notas, duracion, sensacion and
analisis. The ID may be caller-supplied or week/day-generated; duration has no
validated universal unit and sensation may default to buena. The safety-net
writer updates by date/exact type and may create only date/type/notes/sensation,
null duration and a safety_net_deterministico source. Generic legacy updates can
retain richer fields. This audit inspects code, not a live athlete database.

The adapter admits only structured fields. It never reads notas or analisis for
facts. Legacy provenance is LEGACY_STRUCTURED and field confidence is
LEGACY_STRUCTURED_UNVERIFIED, not measurement or modern server validation.
Sensation remains reported text (possibly defaulted), never physiological state.
Completion is UNKNOWN for every legacy writer because no audited universal FULL
attestation exists. Modern completeness and validation remain unchanged.

Recognized fields: duracion/duracion_total, duracion_trabajo, distancia, ritmo,
fc_media, fc_maxima/fc_max and rpe. Duration/distance accept `{value,unit}` or an
entire unit-bearing scalar string, or a numeric value with `<field>_unidad`.
Units: s/sec/seconds, min/minutes, h/hours; m/meters, km/kilometers; pace s/km,
min/km or full `m:ss min/km`. No prose parser, bare-number unit inference, pace
calculated from totals, or distance calculated from duration. HR numeric bpm
must be 1–250 and RPE numeric 0–10; these are representation guards, not training
policy. Invalid/conflicting metrics are omitted and diagnosed. Total/work and
average/max HR contradictions are not silently corrected.

Running recognition uses explicit carrera/running/run discipline or exact
type aliases in historicalRunning.ts. Explicit non-running discipline takes
precedence. Exact labels such as rodaje largo/tirada larga and intervalos/series
are hints of reported exposure, not verified execution of a physiological method.
Missing method, quantities, HR and pace remain missing. New source formats must
extend the explicit adapter with tests, not introduce global notes extraction.

## Identity and reconciliation

Source paths retain every admitted legacy row index. Namespaced IDs include the
athlete. Same workout_id (or session_id fallback) groups legacy rows. Matching
quantities can supply complementary fields; disagreements omit that metric.
Contradictory dates exclude the identity from totals. No source row is removed.

Modern wins when the hashed forge_manual sourceActivityId matches workout_id,
or an explicit reported planSessionId matches the legacy reference. Dates must
agree. The modern record replaces legacy quantities; missing modern fields are
not filled from legacy. Matched source references are retained. Modern conflicts
cannot regain credibility through a matching legacy ID.

Date alone never proves the same workout. Anonymous same-day records form a
date-only ambiguous exposure; conflicting metrics stay unknown. If an explicit
execution exists that day, anonymous evidence is retained but excluded from
totals (including safety-net/richer-row overlaps). Without an explicit identity,
one date contributes at most one lower-bound exposure. Different explicit IDs
are not collapsed merely because their dates match. Unlinked imports with
different IDs cannot be proven identical; capture/deduplication remain partial.

## View, summaries and integration

`mergeRunningHistory` exposes athlete, date, identity/reference, source records,
provenance, field confidence, method/hint, metrics, sensation, completion,
diagnostics and countability. Summary counts are minimum identified-or-distinct-
day exposures, not proof of complete capture. Summaries expose known duration and
distance subtotals, longest known duration/distance, last explicitly labeled long
run, quality hints with provenance, completion counts and ambiguity/coverage.
AVAILABLE describes quantity coverage in the included sample, not measured truth.

All persisted legacy history is inspected. The existing modern reader already
loads up to 1000 records and fails if exceeded; that technical cap is unchanged.
`readRunningExecutionViews` verifies once and returns both all-history and the
original conflict-aware B3 window. No physiological history cutoff is introduced.
The existing 7/28-day windows are summary views; older history remains available.

`loadAthletePrescriptionContext.runningHistory` contains the merged view.
`loadWeeklyPlanningContext` and `prepareAllowedWeeklyPlanContract` return
runningHistoryContext with current scope. Supervision/external Focus history is
read-only; managed Carrera in Focus/Coach can provide future progression evidence.
numericalProgressionAuthorized is always false. History is not put into dose
admission or substituted for modern structuredExecutions. D1 digests remain
independent of history; dates never select historical dose or phase.

loadTrainingLoad is intentionally unchanged. Its legacy report and source
limitations remain; D2A supplies the single factual history boundary for later
consumers without changing that load model. No additional quantitative load is
invented. Later work can explicitly adopt these subtotals and reconciliation.
