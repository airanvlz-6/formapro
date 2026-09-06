# Phase 2E.2 — authority over generated weekly prescriptions

Baseline: `ca5aa08`, with `1f3ed9e` and `3e9ac7a` immediately before it. Initial working tree and diff-check were clean. No migration, DB/RPC, execution, identity or CAS implementation changes.

## Output inspection before implementation

The normal Builder concatenated Anthropic text, removed fences, searched for an arbitrary JSON object with a greedy regex, parsed it and assembled three strings into `descripcion`. The forced generator and Coach modification generator independently repeated that pattern. The normal duplicate retry returned early without repeating duplication or other output checks. Coherence and substitution checks only logged warnings; they could not establish authority.

| Field/content | Previous classification | New authority |
| --- | --- | --- |
| `titulo`, `por_que` | TEXTUAL; sports claims UNVERIFIABLE | DERIVED from validated canonical IDs |
| `calentamiento`, `bloque_principal`, `vuelta_calma` | TEXTUAL; movements and dose UNVERIFIABLE | Fixed ordered structured blocks |
| `descripcion` | DERIVED concatenation of unverified strings | Deterministic rendering after validation |
| stimulus, structure | Intended by prompt; not returned as checked IDs | Required exact `stimulusId`, allowed `structureId` |
| movements | Names embedded in prose, UNVERIFIABLE | Required catalog `movementId` in the complete contract pool |
| sets, reps, duration, distance, rest | Embedded prose, UNVERIFIABLE | Typed numeric fields; domain checks only |
| load, intensity | Free prose, UNVERIFIABLE | Unsupported fields reject; no fabricated physiological ranges |
| variants, progressions, regressions | Catalog string references plus arbitrary prose | Select an independently cataloged and already allowed movement ID; otherwise reject |
| substitutions | Post-output diagnostic mapping | No rescue; replacement must already be an allowed canonical movement |
| `debilidad_relacionada` | Request-derived association, not proof of work performed | `null`; no unsupported claim about weakness coverage |
| explanation | Free text | Optional parsed field, never rendered or persisted as prescription |

## Schema and pure validator

`structuredSession.ts` defines `StructuredSessionProposal`: exact stimulus ID, structure ID, exactly three nonempty ordered blocks (`warmup`, `main`, `cooldown`), each containing unique movement IDs and dose objects. Reusing a movement in another block is permitted. Required executable dose is repetitions, duration or distance; sets and rest are optional. Sets/reps must be positive safe integers; time/distance positive finite numbers; rest may be zero. Extra fields, free names, variant/substitution fields and free intensity/load reject.

Only JSON or a complete enclosing `json` fence is parsed. Surrounding prose is not searched, names are not normalized to IDs and invalid output is not repaired. Input size and block length caps bound parsing work, not training dose.

The validator checks the contract itself, exact stimulus, exact allowed structures and catalog discipline, every movement's catalog existence/pool/discipline, canonical area/exact-ID restrictions and biomechanical restrictions (including unknown safety). Scope validation excludes supervision and externally owned disciplines. No LLM verdict participates.

The renderer revalidates and uses only IDs and numeric fields. Explanation and any contradictory client prose cannot enter the result. It does not claim to validate complete quantitative programming or every format's operational timing. `duracion_tipica_min` is explicitly *typical*, not an authorized hard duration constraint; promoting it to a clinical limit would invent policy. Format timing, load, %1RM, RPE, density, total weekly dose, skill, equipment and physiological suitability remain gaps. A future contract extension must represent those constraints before claiming such enforcement.

## Same contract and receipt

`sessionGeneration.ts` makes one detached, recursively frozen server snapshot A before the first LLM request. The prompt contains A's full IDs, ranking and restrictions. Both attempts parse, validate and render against that snapshot. Invalid output terminates; only duplication allows one retry. The existing Jaccard validator runs again for the second valid proposal. A second duplicate returns `SESSION_DUPLICATE`, never success. There is no replay or unbounded loop.

`sessionAuthority.ts` reads persisted profile, scope/calendar, restrictions, external context and history. Read failures do not become permissive empty context. Profile and incoming planning intent are preference context; neither can broaden the contract. Completed historical `descripcion_real` is passed under the duplication validator's actual expected field. Exposure remains the 2E.1 legacy read model.

Because generated sessions cross HTTP through the client before save, request-local object identity is insufficient. The server adapter alone issues an HMAC-SHA256 receipt after successful contract and duplication checks. It uses the existing server-only service-role secret, a separate `forge-session-contract-v1:` domain and a 30-minute expiry. Payload binds user, week/day through A, exact A and the validated proposal. This is not a persistence receipt and contains no session identity or revision decision. A missing secret fails explicitly.

Final admission verifies the MAC, expiry/user/week, validates the original signed A and proposal, rerenders, and compares all six sports fields. An unsigned returned contract, a modified pool or a client `valid` flag grants nothing. Current persisted ownership can revoke a previously issued receipt without replacing A. The token is ephemeral and is stripped before identity/no-op admission. Receipt integrity does not establish authentication beyond the application's existing user-code boundary, nor does it make the snapshot atomic with later restriction changes.

## Route and transformation audit

| Route/transformation | Final behavior |
| --- | --- |
| `construir_sesion_dia` | Signed weekly target → shared server adapter → structured pipeline → successful signed session only |
| `regenerar_sesion_disciplina_forzada` | Same adapter/pipeline; client supplies existing target token and explicit stimulus; failure aborts week generation |
| `verificar_modificacion_sesion_deterministico` | Trigger/intention detection is not a sports validator. Original persisted session determines discipline; explicit canonical stimulus is required. Same adapter validates before any pending write |
| Injury, severe fatigue or unavailable equipment modification | Explicit `MODIFICATION_CONSTRAINT_UNREPRESENTED`; free-text adaptation does not prove these new constraints are satisfied |
| `guardar_pending_action` | Receipt and current scope checked before expiring/inserting a modifying pending |
| `detectar_propuesta_sesion` | Legacy free-text extraction closed with `STRUCTURED_SESSION_REQUIRED`; no fabricated replacement or pending |
| `confirmar_pending_action` | Unchanged prescription can remain no-op; changed prescription requires signed evidence before identity/CAS and all dependent effects |
| `actualizar_sesion_plan` | Existing payload/patch protections remain; resulting sports fields require matching evidence and current scope before mutation |
| Frontend Orchestrator mapping | Carries session receipt unchanged; does not infer compliance from returned pool |
| Scientific rules | Execute on a detached copy. Cannot mutate returned prescriptions or their survivors |
| Week integrity regeneration | Re-enters the validated forced generator; a failed replacement aborts instead of retaining the earlier offending session |
| Focus external-day transformation | Server-owned source/day context renders a non-prescriptive external slot; completed survivors remain exact snapshot objects |
| New rest/past slots | Server-rendered fixed non-sports content; a client label cannot smuggle arbitrary exercise text |
| `guardar_plan_semana` | Sports admission after content transformations, before identity admission. Removes arbitrary client metadata, diagnostic notes and ephemeral receipt |
| `[PLAN:]` client consumer | Still delegates to weekly save; unsigned new sports prescriptions cannot bypass its final gate |
| Serialization | Signed evidence authenticates original structured source; post-signing changes to sports fields reject |

There are no new `weekly_plan` writers. The existing `planPersistence` insert/CAS authority and completion adapter remain in place. Closure/summary/completion change no new prescription content. Completed and explicitly server-selected survivors retain legacy content and identity; they are not retroactively certified as 2E.2-generated sessions. Conversation/team advice outside weekly prescription admission is not certified as structured execution by this phase.

## Tests and deployment limits

`structuredSession.test.mjs` covers schema/parser, every structure against the exact pool, restricted and unknown-safety movements, Focus/supervision, variants, substitutions, rendering, same-snapshot isolation and retry. Retry traversal tests isolate the unchanged duplication decision; another test exercises real Jaccard rejection of an identical session.

`sessionAuthority.test.mjs` exercises real generation/receipts, tampering, expiry, secret absence, read failures, scope revocation, real forced/Coach action ASTs and real weekly/pending/patch rejection gates. `sessionContractIntegration.test.mjs` now executes structured normal-Builder output for all 22 advertised stimuli and retains transport/UI failure tests. Canonical-restriction tests follow the shared server adapter. Existing planning tests retain all identity/CAS assertions; their sports seam assumes approval for old persistence fixtures, with adversarial real sports gates tested separately. The legacy prose-pending expectation is replaced by a rejection assertion, not removed silently.

Deploy frontend and backend together. Old clients and old textual pending proposals lack receipts and will reject. Unsupported adaptations fail closed; no claim is made that every previously available free-text workflow still succeeds. Forced changes to another discipline need a compatible explicit stimulus; no silent remapping. Small restricted pools can legitimately exhaust the single duplication retry. Static renderer wording may influence the unchanged Jaccard heuristic. Parallel days do not reserve movements; week-level physiological optimization and cross-session duplication are not newly guaranteed.

Receipts are valid for 30 minutes and are not one-use DB records. A newer restriction inside that interval is not folded into A; current scope revocation is checked, but global restriction freshness/atomicity is not claimed. Secret rotation or catalog changes may invalidate in-flight receipts. No live Anthropic/Supabase/deployment test was performed; automated route tests use isolated I/O. No commit or push belongs to this phase execution.


## Weekly release hardening — 2026-09-06

Weekly business dates use Atlantic/Canary; physiology/other unrelated clocks are unchanged.
The server signs a seven-day calendar only after validating scope, declared availability and
frequency ceiling. Available means permitted, never required. TRAIN, RECOVERY, REST and
UNAVAILABLE are distinct. Final rendered content must preserve the signed states and is
validated against current availability/frequency before identity admission. Unsupported
sports and unresolved availability fail closed; no legacy text fallback is permitted.

Frequency ceiling is six TRAIN days, reduced to five when the existing seven-day completed
session / declared days ratio is at least 0.85. This is not a volume/intensity load model.
Weekly rest is deterministically protected and frequency safety is binding, but accumulated-load/Readiness-driven rest prescription remains pending.

GENERATION_SAFETY_BOUND caps reject representation outliers, never clamp: per-entry sets
100, reps 1000, effort duration 28800 seconds, distance 100000 meters, rest 3600 seconds.
Set-multiplied and whole-session totals are bounded at 10000 reps, 28800 effort seconds,
and 100000 meters. These are coarse corruption guards, not prescriptions or clinical maxima.
SPORT_PRESCRIPTION_RULE checks only canonical provable structure semantics: two/three
main movements for couplet/triplet; no repeated sets or pauses in continuous main blocks.
Typical duration metadata is not promoted to a hard sport limit. Full AMRAP/EMOM timing,
intensity, %1RM, equipment and individualized safe dosing remain outside this representation.
Invalid dose/composition gets at most one retry under the original immutable contract.

Before new prescription writes, reread canonical restrictions; any material snapshot change
requires regeneration. The weekly fail-open LLM classifier is removed. This is a final
read/check, not atomic cross-table restriction versioning (2E.2-B remains separate).
CAS/identity infrastructure is unchanged. Structured IDs still render into text and are not
persisted as dedicated fields. Exposure remains ranking plus limited duplicate rejection;
no new date-window, intraweek reservation or load authority is claimed.
