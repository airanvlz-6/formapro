# Weekly availability and resource authority — local implementation

## Evidence and resumed state

Production run `ca2ba31f-acfb-4b5f-8ce2-44f1e0ad52d4`: Monday–Friday Builders completed; Saturday exhausted two attempts at `validateSessionAgainstTrainingContract` with `REQUIREMENT_UNKNOWN`. **PRODUCTION_PAYLOAD_UNKNOWN**: no movement, equipment, skill, capability, or reference is attributed to that run. All examples in tests are synthetic.

On resumption, Git showed **18 modified tracked files and two new files**, not the approximate count in the handoff. Nothing was discarded. Already implemented: modern resource admission, environment aliases, week-scoped availability JSON, shared transport/freshness, and a two-Builder/seven-day simulated persistence test. The interrupted full suite had actually completed: **2476/2481 passed**, with five failures in UI confirmation harnesses/state handling. Remaining work was explicit-zero interpretation, zero-day regeneration/persistence, broader end-to-end tests, those confirmation regressions, final validation and this report.

## REQUIREMENT_UNKNOWN: complete emission audit

There is **one runtime emission site**, `lib/sports/structuredSession.ts`, in `validateSessionAgainstTrainingContract`, after dose validation and inside the sufficiency loop (line 224 in this change). Other occurrences are tests/documentation.

Previous predicate: when no previous violation exists, `doseContext.sufficiency` exists, `decision.status !== 'sufficient'`, and a missing signal's state is anything other than `unavailable`, Session v4 emits `REQUIREMENT_UNKNOWN:<signal>`. An explicitly unavailable signal emits `FACTUAL_REQUIREMENT_UNAVAILABLE`. Older versions use `PRESCRIPTION_DATA_MISSING`.

The signal requirements originate in `movementPrescriptionRequirements` / `resolvePrescriptionDataSufficiency` in `lib/sports/prescriptionDataSufficiency.ts`:

| Input | Provenance and exact requirement | What UNKNOWN establishes |
| --- | --- | --- |
| Equipment | Resolved movement equipment or alternative groups; choose an available alternative, otherwise an alternative not known unavailable, otherwise the first. Evidence comes from `perfil.material`, derived environment, persistent `prescription_signals`, then dated `prescription_access`. | Missing inventory knowledge; not physical inability. |
| Advanced skill | High technical demand and either not scalable or the existing olympic/inverted pattern condition. Evidence comes from explicit level/signal projection. | Missing skill knowledge; not a demonstrated contraindication. No new Olympic semantics were added. |
| Measurement capability | Distance needs distance measurement; an objective pace/HR instruction also considers its corresponding measurement capability. | Missing device/capability knowledge. Explicit incapability still blocks a prescription requiring it. |
| Objective reference | Exact compatible reference ID/kind/movement/unit from the admitted references; no fabricated benchmark or cross-movement inheritance. | The numerical prescription cannot be established. This remains hard. |
| Movement authorization/identity | An unresolved movement emits `movement.authorized` in sufficiency; normally executable identity/semantic resolution rejects earlier. | Missing executable identity, not merely optional enrichment. This remains hard. |

The new admission predicate exempts only `equipment.*`, `skill.*`, `capability.*` gaps for `openExecution(contract)` (Session v4 + `coach-executable-v1`) when the state is not `unavailable`. It does not mutate evidence, relabel UNKNOWN, change the shared sufficiency resolver, or relax historical contracts. Required references and known absences remain hard. Restriction safety is checked separately before this loop.

`REQUIREMENT_ASSESSMENT` is emitted during the actual Builder validation pass with run/day/attempt, block index, movement ordinal, resolved canonical family, category, AVAILABLE/UNAVAILABLE/UNKNOWN, and a closed source classification. It excludes free text, prompts and complete provider outputs. Observation failures cannot change admission. Earlier validation failures can prevent reaching resource assessment; absence of this event is not proof of sufficiency.

## Other reject-on-unknown boundaries audited

The initial enumeration was made before functional edits. The following remain distinct from resource ignorance:

| Boundary | Modern behavior / reason |
| --- | --- |
| `RESTRICTION_UNRESOLVED` in training feasibility | Active restriction with neither usable flags nor a resolvable movement, or abnormal state without usable restriction detail. Necessary safety uncertainty remains hard. |
| `UNKNOWN_SAFETY`, `GENERATED_RESTRICTION_UNKNOWN` | Only relevant active restriction properties/geometry. No active restriction means optional missing enrichment alone does not produce this safety veto. |
| `MOVEMENT_IDENTITY_UNRESOLVED`, `MOVEMENT_SEMANTICS_UNRESOLVED`, generated family/operation resolution | Minimal executable identity/typed recipe must be interpretable. Opaque movement IDs are not admitted as a safety claim. |
| `STRUCTURE_REPRESENTATION_UNRESOLVED` / structure semantics | The executable format must have a resolvable grammar and valid clock/work semantics. Sporting suitability mappings are not required in v4. |
| `DOSE_INSTRUCTION_UNRESOLVED`, instruction/reference conflicts | Unsupported free prose is not silently executed. The already-supported qualitative/partial dose and unknown analytics remain valid. Hidden work, contradictory quantities and objective claims stay hard. |
| Missing/incompatible objective reference | `BENCHMARK_RESOLUTION` and instruction-reference checks run before sufficiency. A missing reference disallows that objective instruction, not all training. |
| Running C2/B3 unresolved | Remain in signed historical/domain-authority paths. Open-coach preparation does not attach the old rigid event dose to new open intents. No new domain policy is introduced here. |
| Method intensity unresolved | Existing `validateMethodIntensity` returns no rejection for an absent/unresolved policy; it does not fabricate physiological compatibility. |
| Intent pattern mismatch | Already advisory UNKNOWN for modern execution; historical `INTENT_NOT_SATISFIED` remains unchanged. Explicit stimulus/discipline contradictions stay hard. |
| Unknown analytical time/side quantities | Already tolerated when execution is interpretable; computable excessive/impossible dose, real time budget and hidden work remain hard. |
| Scope, availability, contract schema, signatures, receipts, freshness, CAS, sibling/protected evidence | Required factual/authorization evidence stays hard. No content or persistence bypass was introduced. |

The pre-Builder open-coach feasibility branch already avoids deriving impossibility from an empty example pool. Resource advice in generation options is not a candidate membership veto. Historical pool filtering remains separate.

## Environment evidence

`trainingEnvironment.ts` now accepts compact environment aliases (CrossFit box/crossfit_box/box, gym/gimnasio, home/casa/limited) in addition to existing questionnaire options. Mixed/conflicting locations still do not establish a broad facility.

The existing `equipmentCatalog.ts` defines standard BOX/GYM compatibility. `prescriptionSignals.ts` derives available standard equipment with `derived:training_environment` provenance. HOME/LIMITED grant no broad inventory; explicit material still applies. Explicit stored and dated absences override derived availability. Nothing writes a list of `equipment=true` flags. Neither movement catalogs nor Athlete State were changed.

## Availability: original rigidity and final representation

The old `parseChatAvailability` required category-first token order, exact category/day vocabulary and a day after each category; natural verbs, exclusions and day-first clauses failed. Its count grammar did not represent zero. `normalizeTrainingAvailability` already accepted `[]`, but required a category key for every requested discipline. `loadWeeklyCalendarContext` preferred habitual source days and rejected missing distribution categories before applying temporal access. Those requirements could prevent an explicit week from replacing habits. No hybrid-frequency obligation is added or retained in the modern path.

The new human-input boundary uses clause segmentation, activity/day lexical classes, direction of assignment, negation/exclusivity and uncertainty. It is a bounded semantic extractor, not a list of whole approved sentences or a general language model. It accepts the requested day-before/day-after, running/correr/corro/correré and box/CrossFit expressions, contextual fuerza/gym, vacation clauses and zero-training expressions. Unknown clauses do not invent TRAIN. Clear clauses remain usable alongside ambiguous days, which are stored separately. Unsupported/contradictory declarations remain unresolved.

The canonical value is stored under the existing JSON column:

```text
usuarios.perfil.weekly_availability[YYYY-MM-DD]
  version: 1
  source: explicit_user_declaration
  resolution: EXPLICIT_ZERO_TRAINING | DECLARED_AVAILABILITY
  availability: { box: [], carrera: [martes, sabado], ... }
  excludedDisciplines: [...]
  unavailableDays: [...]
  unresolvedDays: [...]
```

No schema migration is needed. The write changes only `perfil`, using compare-and-swap against its previous JSON value. Habitual `distribucion_semanal` and source `dias`/ownership remain untouched. Readback uses JSON comparison independent of key ordering. Historical callers without a target week retain their prior global update API.

Explicit zero requires an interpreted negative/rest choice, or a structured explicit empty schedule with known prior context; an unparsed string never becomes zero. A discipline preference/exclusion without known days for the rest remains unresolved. Contradictory total-rest and positive-training clauses are unresolved. The update result distinguishes `UNRESOLVED_AVAILABILITY`; unsuccessful parsing performs no write. A corrupt stored weekly declaration also fails unresolved instead of falling back to habits.

For an interpreted complete week, missing habitual disciplines normalize to zero. A bounded exclusion alone can preserve other **known** days. `availableDaysAtWeek` prioritizes the explicit week even when its arrays are empty; it uses habitual days only when no weekly declaration exists. Dated unavailability still excludes its date. An explicit week can supersede missing/corrupt habitual distribution. These facts do not expand prescription ownership.

## End-to-end transport and zero training

The UI obtains the server generation/closure context before asking availability, pins that target week, and passes it through confirmation and correction. It only transports the choice; parsing and authority remain shared server code. Failed generation preparation clears old confirmation state. Missing availability can be supplied; a failed interpretation cannot advance generation.

The shared path is:

```text
declaration -> canonical week JSON -> confirmation digest
  -> weekly preflight -> loadWeeklyCalendarContext.allowed
  -> prepareSessionTrainingContext.availableDays
  -> WeeklyCoachingContext + signed openFacts.weeklyAvailability
  -> calendar selections / receipt -> Builder targets
  -> Session receipts -> whole-week validation -> identity proof -> persistence/CAS
```

The original text is not compared again. Weekly intent discipline/day must belong to the canonical allowed matrix. Flexible days can be TRAIN or REST; an explicitly fixed discipline cannot be replaced by another one. Week metadata is part of contract context/freshness. Excluded external activities use the same temporal availability in preflight and planning.

`WEEKLY_AVAILABILITY_RESOLVED` reports run ID, normalized days/disciplines, source, resolution, explicit exclusions and unresolved day count, without the full declaration.

Modern frequency policy already uses `minExecutableDays: 0` and no mandatory rest quota. The legacy minimum-one and empty-Builder checks remain behind historical versions. The modern regeneration no-pending-days check was still connected: an explicit new week decision with mutable slots now receives a signed `explicitAvailabilityDecision` and may persist REST choices. All-protected/no-change history retains its existing no-op behavior.

For `EXPLICIT_ZERO_TRAINING` and an empty effective allowed matrix, `composeBoundedWeek` represents the user's decision directly as REST for mutable days and preserves fixed days. It runs the same selection validation and issues normal calendar authority. It does not ask a model to invent sessions. Modern zero Builder targets were already accepted by the UI. No Session Builder is invoked. Completed/past/external protected records are not erased to fabricate a new history. New empty weeks have seven REST days; regeneration preserves immutable history where applicable.

Analyzer frequency is advisory and cannot widen the allowed matrix. The actual-orchestrator tests deliberately return `dias_entreno_sugeridos = 5` and a failing habitual client-side integrity diagnostic while the modern server accepts the declared zero/two-day week. There is no compensating third session or forced box day.

## Atomicity and blocker timeline

`app/FormaPro.tsx` stops its Builder loop at a failed response and returns before `guardar_plan_semana` if any required Builder failed (around lines 1085–1093). `assertWeeklyCalendar` requires seven matching slots and authentic Session evidence for new executable slots. Whole-week validation precedes the strict persistence receipt; create uses one insert and regeneration uses revision CAS. This remains atomic at the week-row boundary. No silent partial-save was introduced. Zero required Builders is different from a failed required Builder.

| Known blocker | State in current local code |
| --- | --- |
| Future REST overprotection | Previously corrected by preservation v2. Future replaceable REST/TRAIN can be regenerated; completed/past/external protections remain. Not reopened. |
| UNKNOWN_SAFETY under restriction | Still connected and can block when relevant. Legitimate factual safety uncertainty; no weakening. |
| Representation / shape | Previous modern normalization/advisory/minimal-execution separation retained. Opaque/unexecutable/conflicting content can still reject. |
| MOVEMENT_SHAPE_INVALID | Strict representation diagnostics are advisory in modern execution; minimal identity/dose conflicts remain hard. Prior fixes retained. |
| INTENT_NOT_SATISFIED | Historical-only hard check; modern sporting mismatch remains diagnostic UNKNOWN. Prior fixes retained. |
| REQUIREMENT_UNKNOWN | Resource ignorance corrected here for modern execution. Required reference/identity gaps and historical strict sufficiency can still reject. Actual incident payload remains unknown. |
| Zero pending days / zero training | Explicit weekly rest is now a valid new modern decision, including regeneration and persistence. Unresolved parsing remains distinct. |

The progression of reported failures does not establish a common hidden movement or payload. This patch removes demonstrated code-level false vetoes; it does not claim retrospective production causality beyond the reported validator codes.

## Verification and limits

Focused tests cover requested language cases and frequencies 0–7; zero versus unresolved; absent/corrupt habitual data; dated/external access; profile CAS and week confirmation digests; scope; derived environments; unknown versus unavailable equipment/skill/capability; safety; historical contracts; intent; representation; signed receipts and freshness.

`weeklyAvailabilityFlow.test.mjs` executes the actual UI orchestrator extracted from TypeScript, with real shared preflight, Weekly composition, Builder generation, calendar/whole-week validation, identity issuance and persistence adapters. Only provider responses, UI display effects and database transport are simulated. It covers habitual fallback, normal hybrid, running-only, box-only, vacation two days, new zero-training week, and regeneration to zero via CAS. The Analyzer suggests five throughout. `sessionExecution.test.mjs` additionally checks incomplete-week rejection, sibling authority, tampering and changed availability/resources.

Final command results are recorded below after completion. No live database, production model or production write is part of these tests. Profile JSON CAS is not a new cross-table transaction; the existing downstream scope/freshness checks still apply. The parser remains bounded and may ask again for genuinely unsupported/ambiguous language. Resource diagnostics only report reached checks. No new production run was performed, so production completion is not proven.

No commit, push, deploy, migration, live data mutation, Athlete State change or new sport/movement catalog was performed. Changes to planning are availability transport/admission only.

### Modified files

26 files in this local change (including tests and this report):

- `app/FormaPro.tsx`
- `app/api/chat/route.ts`
- `docs/weekly-availability-resource-authority.md`
- `lib/athlete/onboardingAvailability.test.mjs`
- `lib/planning/allowedWeeklyPlanContract.ts`
- `lib/planning/openCoachAuthority.test.mjs`
- `lib/planning/openWeeklyCoachContract.ts`
- `lib/planning/prepareAllowedWeeklyPlanContract.ts`
- `lib/planning/weeklyAvailabilityFlow.test.mjs`
- `lib/planning/weeklyCalendarAuthority.ts`
- `lib/planning/weeklyCoachingContext.ts`
- `lib/planning/weeklyGenerationPreflight.test.mjs`
- `lib/planning/weeklyGenerationPreflight.ts`
- `lib/planning/weeklyRegeneration.ts`
- `lib/sports/chatAvailability.test.mjs`
- `lib/sports/chatAvailability.ts`
- `lib/sports/prepareSessionTrainingContract.ts`
- `lib/sports/sessionAuthority.ts`
- `lib/sports/sessionExecution.test.mjs`
- `lib/sports/sessionGeneration.ts`
- `lib/sports/sessionIntentAuthority.test.mjs`
- `lib/sports/structuredSession.ts`
- `lib/sports/temporaryTrainingAccess.ts`
- `lib/sports/trainingEnvironment.ts`
- `lib/sports/weeklyAvailabilityDeclaration.test.mjs`
- `lib/sports/weeklyAvailabilityDeclaration.ts`

### Final validation

- Focused authority/transport/regression suite: **327/327 PASS**.
- Final zero/uncertainty interpretation suite: **52/52 PASS**, including negative training versus uncertainty and unrelated negation.
- Complete repository suite (`rg --files --no-ignore lib app -g '*.test.mjs' -g '*.test.cjs'`, `node --test --test-concurrency=4 --test-reporter=spec`): **2516/2516 PASS**, zero skipped/cancelled/failed.
- `npx tsc --noEmit`: **PASS**.
- `git -c core.safecrlf=false diff --check`: **PASS**. New files separately verified as UTF-8 without replacement characters or trailing whitespace.

| Actual orchestrator scenario | Eligible days / Builder calls | Complete validation and persistence |
| --- | --- | --- |
| No week declaration: habitual fallback | 5 / 5 | PASS: seven slots, one simulated insert |
| Declared normal hybrid | 4 / 4 | PASS: seven slots, one simulated insert |
| Running-only hybrid profile | 4 / 4, zero box | PASS: seven slots, one simulated insert |
| Box-only hybrid profile | 4 / 4, zero running | PASS: seven slots, one simulated insert |
| Vacation: Tuesday/Saturday running | 2 / 2, zero box | PASS: seven slots, one simulated insert |
| Explicit zero, new week | 0 / 0 | PASS: seven REST slots, one simulated insert, no Weekly model call |
| Explicit zero, regenerate pending week | 0 / 0 | PASS: seven REST slots, one simulated CAS update, no Weekly model call |

The simulated Analyzer suggests five days in every scenario; no test grants it permission to enlarge availability. Providers and database transport are controlled test inputs, not a production execution.

DESIGNED: YES

CONNECTED: YES

VERIFIED LOCALLY: YES

PROVEN IN PRODUCTION: NO
