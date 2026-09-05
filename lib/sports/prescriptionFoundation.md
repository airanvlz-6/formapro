# Phase 2E.1 — prescription authority and contract foundation

Baseline: clean main, `1f3ed9e` after `3e9ac7a`. No identity, revision,
PlanMutation, CAS, persistence, execution or database-schema changes.

## Existing mode inventory

The pre-edit searches covered app and lib TS/TSX, including mode aliases,
ownership flags, training sources and buildFocusContext. Classification below
groups repeated occurrences by their actual responsibility. A word such as
"consulta" in a comment about a database query is not a management mode.

| Location / use | Classification | Existing semantics |
| --- | --- | --- |
| app/FormaPro.tsx: mode state, recuperar_usuario, onboarding selection, labels | UI | planificacion default; supervision/focus selectable; consulta legacy branch |
| app/FormaPro.tsx: initial prompts and mobile/buildPrompt.ts | CONTEXT / GENERATION / LEGACY | Coach prose can prescribe; supervision and consulta have different initial messages; general mobile prompt is not ownership authority |
| app/FormaPro.tsx: guardar_usuario and guardar_training_sources | PERSISTENCE / AUTHORITY | Persists selected mode and explicitly delegated versus external disciplines |
| app/FormaPro.tsx: generation, supervision/consulta guards, mode-change CTA | GENERATION / AUTHORITY | Existing callers branch on persisted mode; new Builder preflight does not trust this UI |
| app/perfil/page.tsx: Focus sources, mode-change forms and labels | UI | Displays owners; invokes server mode transition, does not own policy |
| app/hoy/page.tsx: briefing mode and display sections | UI | Groups supervision and consulta |
| app/progreso/page.tsx, app/atleta/page.tsx, app/historia/page.tsx | UI / LEGACY | Mode-dependent presentation/navigation; history defaults to planificacion |
| app/api/chat/route.ts: forgeContextBuilder | CONTEXT / LEGACY | supervision allows advice about an individual session; consulta prompt permits a requested plan, unlike its persistence guard |
| route: onboarding/OAuth defaults, CAMPOS_REQUERIDOS_POR_MODO, calcularEstadoOnboarding | AUTHORITY / CONTEXT / LEGACY | Some onboarding fields use coach while usuarios.modo_entrada historically uses planificacion |
| route: verificar_cambio_modo, guardar_campo_mode_change, cambiar_modo_atleta | AUTHORITY / PERSISTENCE | Checks supervision/focus/coach; existing change_athlete_mode RPC remains untouched |
| route: confirmar_onboarding | PERSISTENCE / LEGACY | Resolves onboarding mode separately; not accepted as new ownership input |
| route: guardar/obtener_training_sources | AUTHORITY / PERSISTENCE / CONTEXT | Active rows carry owner forge/external, discipline and optional days |
| route: cambiar_modo_entrada | AUTHORITY / PERSISTENCE / LEGACY | Older transition accepts planificacion/supervision/consulta |
| route: buildFocusContext, Analyzer, Planner correction and Coach external context | CONTEXT / GENERATION / LEGACY | esModoFocus is inferred from external-source presence; it is NOT canonical prescription scope |
| route: construir_sesion_dia | GENERATION / AUTHORITY | 2E.1 now resolves scope from server-read profile and active sources, then validates contract before fetch |
| route: check_week_closure | AUTHORITY / LEGACY | Existing canGenerateNextWeek checks planificacion |
| route: briefing | CONTEXT / UI / LEGACY | Groups supervision/consulta; other branch labels planificacion |
| route: guardar_plan_semana | PERSISTENCE / AUTHORITY / LEGACY | Existing supervision/consulta block and Focus calendar transformation retained |
| route: forced regeneration and modification Coach builder | GENERATION / LEGACY | Separate generation paths; contract migration deferred to 2E.2 |
| lib/response/responseEngine.ts | CONTEXT | STATIC/HYBRID/LLM is response routing, not management scope; capability flags describe available data |
| lib/sports/proposalParser.ts | CONTEXT / LEGACY | Detects Coach proposal language; cannot confer authority |
| app/plan/page.tsx, app/layout.tsx, app/success/page.tsx, app/privacidad/page.tsx, lib/email/templates/FounderEmail.tsx | UI | Copy, CSS focus state or ordinary language; no additional ownership policy |

`consulta` is mapped to non-prescriptive supervision ONLY for prescription
authority. Its conversational/UI behavior is not declared identical and is not
rewritten. Missing/unknown modes fail explicitly. No authorization is inferred
from a model's proposed managedDisciplines, input tipo, or esModoFocus flag.

## Central ownership policy

prescriptionScope.ts is pure. prepareSessionTrainingContract.ts is its read-only
server adapter. Inputs are usuarios.modo_entrada, profile fields, and active
athlete_training_sources. planificacion maps to coach; consulta maps to the
non-prescriptive authority of supervision. Explicit ownership is resolved PER DISCIPLINE:
an external source removes that discipline from the legacy managed set, but does not
erase other profile evidence. Explicit forge/external overlap rejects. Focus requires exactly one forge
discipline and a known delegated calendar; overlapping external/managed ownership
is an error. Coach combines recognized persisted distribution sport keys, specialty
and category with explicit forge sources. Unknown specialty text cannot veto a
recognized category. Generic categories grant nothing. Composite or unsupported
disciplines are never silently expanded or converted to box.

Exact aliases include running -> carrera and CrossFit -> box. They are vocabulary
normalization, not new delegation. Unknown disciplines remain unknown. All external
activities stay read-only. The helper cannot edit, replace, regenerate or persist
any session. Supervision can still use all existing analysis/advice endpoints.

## Contract policy

allowedTrainingContract.ts exports schema, exact stimulus resolver, builder and
pure validator. Version 1 carries scope, target week/day, discipline, stimulus,
complete allowed movement IDs, allowed structure IDs, separate ranked candidates,
canonical restriction snapshot, external context, exposure evidence/limitations,
availability, source and explicit gaps. Result is a discriminated ok/error union;
invalid contracts are never represented as valid with an empty permissive pool.

Movement IDs come from suitable_for + discipline + canonical area filtering,
minus exact restricted movement IDs and incompatible/unknown biomechanical candidates.
restrictionFiltering records those candidate exclusions and their reasons. Ranking uses existing exposure counts and
does not remove high-count candidates. Top five is only a prompt hint.

STRUCTURES_BY_STIMULUS lives alongside WORKOUT_STRUCTURE_LIBRARY and explicitly
covers all 22 advertised stimuli. Existence and discipline are checked. There is
no catch-all for future unmapped stimuli. It does not claim durations, intensities
or doses of the generated session are validated. fuerza is an ownership vocabulary item
but has no complete stimulus/structure coverage and is unsupported for contracts.

Stimulus IDs must exactly match the normalized catalog ID and target discipline.
The Planner now requests stimulusId; the Builder also accepts an exact legacy focus
ID, but no first-word, substring or descriptive inference. A model proposes intent;
it does not determine ownership or the allowed universe. Unknown IDs are unresolved.

The validator checks scope invariants, availability, Monday date, weekday, known
stimulus, nonempty unique known movement/structure IDs, and recomputes the pools
and ranking. This is a contract validator, NOT a generated-workout validator and
NOT an authentication receipt. Never accept a returned client contract as authority.

## Restrictions and load: limits of current evidence

Ordinal impact/axial_load metadata alone does not prove absence of a prohibited
property. The correction adds explicit per-ID MOVEMENT_RESTRICTION_EVIDENCE for 22
canonical movements, with a rationale and partial property records. These are
qualitative catalog facts, not a medical assessment, dose model or new physiology.
Missing properties remain UNKNOWN; no propagation through variants or similar names.

| Flag | Capability over full catalog | Evidence and policy |
| --- | --- | --- |
| prohibits_impact | PARTIALLY_SUPPORTED | medio/alto establishes incompatibility; explicit non-landing canonical variants establish compatibility; bajo alone is unknown |
| prohibits_jump | PARTIALLY_SUPPORTED | Explicit takeoff/non-jumping evidence; never infer from jump pattern (box_step_up is a counterexample) |
| prohibits_axial_load | PARTIALLY_SUPPORTED | alto excludes; supported/floor canonical variants have explicit negative evidence; medio/bajo alone do not prove absence |
| prohibits_deep_flexion | PARTIALLY_SUPPORTED | Explicit loaded squat versus supported non-knee-flexion variants; box height/erg setup and unmapped movements remain unknown |
| prohibits_overhead_load | PARTIALLY_SUPPORTED | Explicit overhead press versus supported horizontal/floor variants; unknown variants excluded |

All flags filter PER CANDIDATE for both hard notes and reassessments. Known
incompatible and safety-relevant unknown candidates are excluded; known compatible
alternatives remain. Thus bench_press survives each flag individually in fuerza_maxima,
while a no-impact base_aerobica running pool legitimately becomes empty. A restriction
does not itself invalidate the entire contract. Unresolved free-text-only restrictions
and unmapped body areas still reject. Empty post-filter pools explicitly reject.
General injury suitability, dose and generated output are not certified by this policy.

Equipment, skill, substitution IDs and numeric intensity/volume bounds are not
enforced yet. Current libraries do not provide a complete reliable mapping for them.

External sources' calendars and up to 90 dated external reports are copied into
externalLoadContext and included in the Builder prompt, without changing scope.
There is no new physiological load model or fabricated threshold: external load
affects the contract's CONTEXT, not deterministic numeric limits in this phase.
Reads fail explicitly; empty successful reads remain valid empty evidence.

Exposure is carried as an object. Known defects intentionally remain: last four
weekly rows instead of a dated four-week window, text matching of completed reports,
day names as dates, nonunique pattern/modality counts, and concurrent new sessions
not reserving exposure. The local last-five-session/Jaccard shape defect also remains.

## Integration and scope boundaries

The existing signed weekly generation token is verified, never modified. The
Orchestrator supplies token, selected targetWeekStart and stimulusId. The server
only accepts a target within that attested current/next week. No identity or CAS
API changes. Profile/restriction/scope/context/contract failure occurs before the
Builder's first LLM call. Known preflight failures return HTTP 200 with ok:false,
code and errors, avoiding the existing transport retry behavior.

Valid contracts allow the current textual generation/parser to continue. The
structured trainingContract remains in server scope across retry and is returned
beside sesion, never injected into its identity/prescription fields or persisted.
The Orchestrator aborts on any failed/missing Builder session instead of saving an
incomplete subset. Completed-session preservation and all save/CAS behavior remain.

Not migrated here: generated-session membership validation, forced-regeneration
endpoint, separate Coach modification generator, legacy PLAN tags and all mutation
entry points. Therefore this foundation does NOT claim global enforcement of
ownership over every old route, nor that LLM output already obeys its input contract.
The parallel Analyzer/Planner calls may already have run before a Builder refusal;
the no-LLM guarantee applies to the Session Builder preflight, not all analysis.

## 2E.2

### Closure correction: complete coverage and test-quality audit

The pre-change inventory counted all suitable_for movements before restrictions.
Every stimulus already had movements; ten had no structure. Counts below are
locked by independent test fixtures rather than derived from the mapping under test.

| Stimulus | Discipline | Movement count | Allowed structures | Semantic basis |
| --- | --- | ---: | --- | --- |
| fuerza_maxima | box | 9 | strength_sets | Heavy low-repetition work with full rests |
| hipertrofia | box | 9 | strength_sets | Repeated resistance sets |
| halterofilia_tecnica | box | 13 | complex_halterofilia, practica_habilidades | Technical complexes or isolated quality attempts |
| halterofilia_soporte | box | 10 | strength_sets | Support pulls/squats as strength sets |
| potencia | box | 33 | potencia_series | Short explosive submaximal efforts with recovery, not metcon |
| gimnasticos | box | 28 | practica_habilidades | Body control/relative strength attempts with pauses |
| capacidad_glucolitica | box | 37 | amrap_corto, emom_metcon, for_time_corto, ladder | Existing short/metabolic formats; typical session duration is not effort duration |
| capacidad_aerobica | box | 8 | amrap_largo | Sustained mixed movement effort |
| cadena_posterior | box | 8 | strength_sets | Hinge/posterior-chain resistance work |
| fuerza_general | box | 46 | strength_sets | General non-specialized resistance work |
| tecnica | box | 7 | practica_habilidades | Low-load quality practice, not timed competition |
| coordinacion | box | 10 | practica_habilidades | Motor skill attempts, not metabolic fatigue |
| movilidad_tecnica | box | 1 | movilidad_controlada | Controlled range under light technical load; thin movement coverage |
| recuperacion_activa | carrera | 2 | continuo_regenerativo | Short easy continuous regeneration, not compulsory long-run duration |
| base_aerobica | carrera | 3 | continuo_carrera | Continuous aerobic volume |
| umbral | carrera | 4 | intervalos_carrera, tempo_continuo | Supports both fractionated threshold and continuous tempo |
| vo2max | carrera | 3 | intervalos_carrera | Existing higher-intensity intervals |
| velocidad | carrera | 2 | velocidad_recuperacion_completa | Brief speed efforts and full recovery, not VO2max density |
| economia_carrera | carrera | 6 | tecnica_carrera | Drills and technical passes/strides preserving coordination |
| potencia_carrera | carrera | 5 | potencia_carrera_series | Brief hills/jumps/applied force with recovery |
| resistencia_especifica | carrera | 1 | continuo_carrera | Catalog currently has long-run movement; thin coverage |
| fuerza_corredor | carrera | 8 | fuerza_corredor_series | Complementary runner resistance sets, not running intervals |

Nine formats were added for genuine catalog gaps (including continuous tempo).
No existing ID was renamed and no catch-all was added. Typical duration ranges are
format descriptors, not a dose prescription or an enforced LLM-output constraint.

The original 44 tests execute actual modules through TypeScript transpilation and
the actual Builder branch through AST extraction. DB/LLM/restriction reads and the
signed-calendar resolver are mocked at boundaries. This proves preflight and transport,
not production LLM compliance or deployed DB configuration. The original tests that
expected blanket restriction rejection and missing mobility coverage were reformulated
to test compatible alternatives and the corrected mapping; negative coverage remains.

Additional tests cover all 22 contract builds AND all 22 actual Builder branches;
independent inventory counts; semantic structure distinctions; partial legacy ownership;
explicit contradictions; every restriction flag's known positive, negative and unknown
candidate cases; combined restrictions; legitimate empty pools; and immutable CAS files.
Comparisons against a production helper only test transport/completeness, not independent
methodological correctness. The new independent fixtures supplement those comparisons.

UI audit: both real generation callers (Focus transition and chat confirmation) display
the existing generic failure message and reset generandoSemana on a returned null. Chat
also resets cargando before dispatch. The Focus trigger is cleared before dispatch.
Actual apiCall returns HTTP-200 ok:false once, without transport retry/timer. Orchestrator
returns before assembly/persistence on any failed session; no missing-day partial save.
No UI change was necessary for the new explicit rejection. Unexpected thrown failures
outside the normal result path remain outside this closure correction.

Validate structured generated exercises/structures/parameters against the SAME
server contract, including retry; render executable content from validated fields.
Converge alternative generators and admission points, without changing identity/CAS.
Resolve the identified metadata/coverage gaps explicitly; preserve completed and
external objects. Add final whole-week checks and context freshness policy before
making claims about global prescriptive authority. Do not start canonical execution.
