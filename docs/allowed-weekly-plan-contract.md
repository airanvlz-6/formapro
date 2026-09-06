# 2E.3A.3 — AllowedWeeklyPlanContract and bounded Planner

Baseline: `ef275cabe71c445356f10a8a5c3200dcdd198a83`.

## Boundary and authority

The actual `planificar_semana` route now validates the versioned client and target
generation context before preparation or LLM composition. It calls
`planBoundedWeek` -> `prepareAllowedWeeklyPlanContract` ->
`buildAllowedWeeklyPlanContract`, then composes at most two proposals and issues
the existing calendar receipt only after deterministic selection validation.

`loadWeeklyCalendarContext` is the previous calendar authority loader, exported
with its existing profile, scope and sources alongside allowed days and maximum.
It preserves the same availability resolution and frequency safety-net calls.
`getCanonicalRestrictions` is unchanged. `prepareSessionTrainingContext` supplies
the existing discipline-specific exposure/external context. Weekly enumeration
calls `evaluateTrainingFeasibility` for every supported stimulus on permitted
days; no movement, restriction, ranking or structure engine is duplicated.

Reads before composition, for Coach with two disciplines and no external sources:
one profile + training-sources read in the calendar loader; state + paginated
coaching-note reads once; training-sources + last-four-week history reads for each
discipline. That is eight reads when notes fit one page. Focus adds existing
external-record reads per discipline. There are no reads per day/stimulus option.
The unchanged calendar issuer reads profile/sources again before signing, which
can fail closed if availability or the ceiling changed. Existing target sessions
come from the signed generation snapshot, not a newly invented profile state.

These reads are not an atomic database snapshot. Scope disagreements fail closed;
fresh restriction checks and existing independent Session Builder admission stay
in place. This phase does not introduce a cross-layer cryptographic transaction.

## Contract and generic intent

Fields: contractVersion 1, policyVersion `executable-ceiling-rest-v1`, targetWeekStart,
prescriptionScope, SHA-256 contextDigest, frequencyPolicy and dayOptions. The digest
represents canonical preparation inputs; it is not a receipt or authorization MAC.
No identifiers, medical/restriction prose, movement IDs, doses or detailed sessions
are sent to the Planner. Fixed history is retained separately on the server.

Each day publishes optionId, state, optional discipline/stimulusId/intent and a
protected flag where appropriate. Canonical calendar UNAVAILABLE is the existing
equivalent for external-blocked and past-unregistered days. Their detailed subtype
and original content stay server-side and are restored without LLM composition.

The catalog's generic stimulus is a code-owned option with stimulus_only. A trusted
already-structured context intent, if supplied to the pure API, is evaluated as-is;
it is not downgraded. Current weekly production supplies no main_pattern source.
No intent is derived from analysis, weakness, titles, focus or other prose.

The Planner only returns `{contractVersion, contextDigest, selections}`; selections
contain exactly `{day, optionId}`. Unknown IDs, additional canonical fields, titles,
focus and explanatory promises reject. The server resolves the full canonical
tuple. Rendered blueprint titles/focus are the generic stimulus ID/label; strategy
is a generic server statement. Thus no accepted squat/lower-body promise survives
when the actual choice is generic fuerza_maxima. Analyzer and block-memory prose
no longer enter this bounded selection prompt; this phase does not pretend those
texts are enforced objectives or claim an optimal recommendation.

## Structural frequency and protected states

The maximum remains `aplicarTrainingFrequencySafetyNet(7,
calcularFrecuenciaRealRelativa(...))`: six normally, five at the existing high
observed-frequency threshold. Analyzer's suggested four is not authority.
`isExecutableCalendarState` is shared by weekly policy and calendar validation:
TRAIN and executable RECOVERY both count. The calendar's existing error code
CALENDAR_TRAINING_LIMIT is retained with this explicitly broadened count.

Availability is permission. For a complete new week with a possible REST option,
at least one genuine REST is required. RECOVERY or external/unavailable days do
not satisfy that requirement. This is structural, not a physiological claim.
At least one executable day is required to avoid returning an entirely empty
training plan; it is not an optimal-frequency target. A finite count/rest DP
proves existence before calling the Planner.

Completed sessions, existing REST/RECOVERY/UNAVAILABLE and external/past days are
fixed. Pending protected recovery with unresolved or currently infeasible canonical
stimulus rejects before the LLM. Completed historical sessions are not newly
prescribed under today's restrictions; they retain their original content.
Conflicts with external ownership, availability or the frequency ceiling reject.
The client preserves original protected snapshot rows, not a rewritten LLM row.
For the new versioned flow, guardar_plan_semana uses the existing explicit-survivor
index parameter, with indices selected from the server snapshot by the shared
calendar protection predicate. This preserves pending recovery/REST identity and
content through persistence too. The identity/CAS implementation is unchanged;
legacy save calls retain their prior admission path.

## Retry and serialization

Two proposals total: first rejection gets one retry with the same deeply frozen
contract and machine-readable errors. Invalid JSON counts as a rejected proposal.
Provider failures are terminal. No silent correction or third proposal exists.
The post-Builder client correction loop also stops on discrepancies instead of
silently changing a discipline/session. The persisted weekly objective comes from
the server's generic resolved strategy, not the Analyzer's free-text promise.
The client's former Blueprint regeneration loop is removed, and `apiCall` makes
only one transport attempt for planificar_semana, including ambiguous network
failures. Other actions retain their existing transport policy.

The old prompt interpolated `usuarioPlanner.distribucion_semanal` directly, so an
object produced `[object Object]`. The new prompt uses JSON.stringify(contract).
The regression proves both the original coercion and round-trip JSON options.

Main validation codes: WEEKLY_SCHEMA_INVALID, WEEKLY_SLOT_SCHEMA_INVALID,
WEEKLY_REQUIRES_SEVEN_DAYS, WEEKLY_DUPLICATE_DAY, WEEKLY_OPTION_NOT_ALLOWED,
WEEKLY_EXECUTABLE_LIMIT, WEEKLY_NO_EXECUTABLE_SELECTION, WEEKLY_REST_REQUIRED.
Preparation failures use WEEKLY_CONTEXT_INVALID or WEEKLY_CONTRACT_UNSATISFIABLE;
two rejected proposals yield WEEKLY_PLANNER_REJECTED, retryable false at the route.

## Production reproduction

Week 2026-09-07, Coach box+carrera. Availability: box Tuesday/Thursday/Saturday;
carrera Monday/Wednesday/Friday/Sunday. Effective impact/jump/deep-flexion
prohibitions true, axial-load prohibition false, using supplied effective flags.

The six original impossible combinations are absent. Thursday generic fuerza_maxima
remains, with bench_press as the independently validated session movement pool.
Actual options remaining, each also allowing REST:

- Monday/Wednesday/Friday/Sunday: carrera / fuerza_corredor.
- Tuesday/Thursday/Saturday: box / fuerza_maxima, hipertrofia, gimnasticos,
  capacidad_glucolitica, cadena_posterior, fuerza_general, tecnica.

That is 25 executable options plus seven REST options, not 25 recommended sessions.
No substitute sessions are manufactured. A selection of Thursday generic strength
and six REST days proves a valid arrangement exists. This fixture therefore reaches
the Planner, and a valid selection can reach the Builder. The original six invalid
choices cannot do so through the new Planner. A separate no-feasible-movement
fixture proves preparation stops before any Planner LLM call.

## Builder, compatibility and limits

Canonical state, discipline, stimulus and intent are transported by the client.
The Builder independently prepares its existing contract, supports explicit intent
v2, and rejects a supplied non-executable or stimulus-inconsistent state. Absence
of intent remains contract v1. No title-to-intent inference was introduced.

The request fields are NOT yet bound to the weekly contract by a new HMAC; that
remains 2E.3A.4. Existing session and calendar receipt formats/domains remain intact.
New Planner clients must send weeklyContractVersion 1 and require it in the response.
Old Planner requests fail before reads/LLM with WEEKLY_CLIENT_UPGRADE_REQUIRED.
Persisted plans and old v1 session receipts require no migration. Old in-flight
calendars exceeding the new TRAIN+RECOVERY ceiling now fail the structural check.

No timezone, medical flags, movement metadata, Readiness/load-driven recovery,
Auth, Team, CAS redesign or production data migration. No push.

## Regression coverage

41 new weekly-contract tests plus one actual-save test cover the production option
space, structured intent, frequency/rest, protected/external/past days, malformed
selection fields, JSON serialization, provider/client retry limits, no-LLM failure,
Builder v2 transport and preservation of server-owned snapshot identity at save.
Existing calendar/client-source tests now assert server-owned retries; the prior
adapter non-adoption test now checks that explicitly supplied intent is independently
enforced. No restriction, movement or identity-policy tests were weakened.

Final verification: full lib 785 passed (including 333 planning and 268 sports);
50 existing calendar/availability/diagnostic tests passed. The new coverage is
41 weekly-contract tests plus one actual-save regression. TypeScript
(`npx tsc --noEmit --incremental false`) and diff-check passed. No skipped or
cancelled tests in the full run.
