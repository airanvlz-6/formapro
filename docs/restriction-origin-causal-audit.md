# Restriction origin and causal feasibility audit

Base: `34daaeba5aff9847105b497581fe58535f07634b`. No functional repair.

## Evidence boundary

Production supplies two identical flag projections per discipline, not canonical IDs, sources, constraint levels, areas or original event scope. It demonstrates running_recovery rejected with MOVEMENT_POOL_EMPTY on X/D and box_technique rejected with INTENT_POOL_EMPTY on J/V/S. Both methods survive the strategic and temporal stages.

Local tests replay exactly the observed flags. They use empty area/exercise exclusions and no additional state or dose constraints. These are explicitly controlled missing inputs, not a claim to possess the complete normalized production input. The flags alone suffice to reproduce the two reported codes. No clinical statement or source scope is inferred from them.

## A. Source, identity, normalization and propagation

The actual chain is:

1. getCanonicalRestrictions reads active athlete_state_events and athlete_coaching_notes for the athlete. Notes must have status pending/considerada and constraint_level hard/reassessment.
2. projectCanonicalRestrictions drops expired notes, converts flags using strict `=== true`, retains id/movement/issue/constraint_level/valid_until/source, and sorts by id then serialized projection. It does not merge or deduplicate.
3. restrictions and reassessments are partitions by constraint_level. The diagnostic concatenates the partitions. It does not duplicate one note merely because both arrays exist.
4. loadWeeklyPlanningContext reads that snapshot once. prepareSessionTrainingContext assigns that same restrictionsSnapshot to each managed discipline without a restriction-scope filter.
5. evaluatePools unions flags with activeRestrictionFlags: for each flag, any true note activates it. This union has no discipline, movement, pattern or area condition. Separately, a Set of normalized movement names excludes exact movement IDs. Areas are applied through catalog avoid_with metadata.

Answers A1–A7:

- A1: identical visible flags do not establish identical canonical restrictions. Two distinct IDs and two occurrences of the same ID are indistinguishable in the supplied log. Both are reproduced in normalization tests.
- A2: at this weekly adapter boundary Box and Carrera receive the same canonical snapshot, hence the same source notes. Four emitted entries are two per-discipline projections; they do not imply four source rows.
- A3/A4: no note deduplication occurs before feasibility. Sorting is not deduplication. The movement exclusion Set and flag union are idempotent, but they do not collapse the diagnostic entries.
- A5: there is no scopeKind, scopeDiscipline, pattern scope, authority or deduplicationKey in CanonicalNote or in its SELECT. `source` identifies a writer, not an authority/event ID. `status` is filtered upstream but not retained. `type` and `domain` exist in writer payloads, but this reader does not select or normalize them.
- A6: the canonical path does not represent an original bounded scope and therefore cannot prove whether a specific production restriction was promoted from one. Structurally, per-note flags are applied across managed disciplines regardless of the movement anchor. That mechanism is proven; its legitimacy for these source events is not.
- A7: the equivalent rule is the unscoped flag union shared by each discipline. Exact movement exclusions remain exact-ID exclusions. A movement anchor does not scope that note's flags.

Two creation paths must be distinguished. In app/api/chat/route.ts, the pending-action modification path inserts hard notes with source modification_ledger, domain null and flags derived from PERFIL_PROHIBICIONES_POR_ZONA using the event body_area. It does not perform a note lookup/deduplication at that insert. Repeated distinct confirmations can therefore create different rows with identical flags. This does not demonstrate that it happened in this run. The conversation note path does look up an active note by movement, updates it if found, and otherwise inserts source conversation. It does not establish deduplication for the separate modification path. No originating event ID is retained by CanonicalNote.

The new origin diagnostic will expose existing UUID id, allowlisted source and constraint_level per projected discipline. It cannot recover discarded status/type or an original scope that this canonical representation never modeled. Different IDs would establish different rows, not necessarily different underlying causes; equal IDs would establish repeated projection of the same row. Across disciplines equal IDs are expected and are not themselves a duplication bug.

## B. Running pool

For recuperacion_activa/carrera the catalog pool before area/exercise restrictions has exactly two IDs: regenerativo and rodaje_z1. Both satisfy run. For each, the current restriction evidence is:

| ID | impact | jump | deep_flexion |
|---|---|---|---|
| regenerativo | incompatible | compatible | unknown |
| rodaje_z1 | incompatible | compatible | unknown |

Actual evaluation filters areas and exact exclusions, evaluates all active flags, then intersects the survivors with the intent pattern. The diagnostic counterfactual `afterPattern` before flags has two members; it is not the production order.

With observed flags: initial 2, pattern-compatible before flags 2, after flags 0, final intentMovementIds 0. removedByImpact includes both, removedByJump is empty, removedByDeepFlexion includes both due to unknown evidence. These reasons overlap and must not be added as disjoint counts. No other active flag is present in the supplied projection.

B1: two candidates. B2: impact is explicitly incompatible, deep flexion is unknown. B3: impact alone removes both. B4: disabling only impact still leaves both blocked by unknown deep flexion, so feasibility stays false. B5: additionally disabling deep flexion restores both while jump remains true in the controlled input. This proves the code's mechanism; it does not authorize lifting either production flag.

## C. Box intent pool

There is one admitted strategic intent tuple for box_technique / tecnica / squat / deload per relevant day. There is no separate catalog of candidate intent IDs filtered through six stages. INTENT_POOL_EMPTY refers to intentMovementIds, not the number of strategy intent objects.

The method/adapter already admitted the tuple before feasibility. The tecnica/box catalog contains seven candidates:

| ID | Pattern | Active-flag result |
|---|---|---|
| goblet_squat | squat | unknown impact, jump, deep_flexion |
| kb_goblet_squat | squat | unknown impact, jump, deep_flexion |
| back_squat_pausa | squat | unknown impact, jump, deep_flexion |
| tempo_squat | squat | unknown impact, jump, deep_flexion |
| turkish_get_up | core_antirotacion | unknown impact, jump, deep_flexion |
| ring_row | horizontal_pull | allowed |
| plank | core_antiextension | allowed |

C1: one strategic intent; seven movement candidates, four matching squat before restriction compatibility. C2: flags leave two movements; the subsequent exact-pattern intersection leaves zero. C3: all four squat candidates have unknown evidence for each of the three active flags, not an explicit true incompatibility. `restrictionFiltering.unknown` and `.incompatible` are the real structured fields; no invented per-intent rejection codes are required.

C4: deep flexion is sufficient to reject those candidates under the unknown-is-not-admitted rule, but is not the sole blocker. C5: impact and jump each independently remain blockers. C6: with restrictions empty there are seven allowed movements and four squat matches and the method is feasible. Thus this is not a method↔pattern↔stimulus catalog absence independent of restrictions. It is a restriction-compatibility evidence gap for these candidate IDs under the present policy. Whether they *should* be compatible cannot be established from missing evidence alone.

## D. Causal ablations

Numbers below are allowed movement count / intentMovementIds count. All use the same controlled context containing the production-observed flags. They are not falsely labeled a full production snapshot.

| Case | running_recovery | box_technique |
|---|---|---|
| D1 observed flags | false; MOVEMENT_POOL_EMPTY; 0/0 | false; INTENT_POOL_EMPTY; 2/0 |
| D2 one duplicate projection removed, same flags | false; MOVEMENT_POOL_EMPTY; 0/0 | false; INTENT_POOL_EMPTY; 2/0 |
| D3 original scope only | not executable: original scope unavailable | not executable: original scope unavailable |
| D4 running impact=false only | false; MOVEMENT_POOL_EMPTY; 0/0 | unchanged false; INTENT_POOL_EMPTY; 2/0 |
| D5 box deep_flexion=false only | unchanged false; MOVEMENT_POOL_EMPTY; 0/0 | false; INTENT_POOL_EMPTY; 2/0 |
| D6 box impact=false and jump=false | unchanged false; MOVEMENT_POOL_EMPTY; 0/0 | false; INTENT_POOL_EMPTY; 2/0 |
| D7 box restrictions empty | unchanged false; MOVEMENT_POOL_EMPTY; 0/0 | true; no errors; 7/4 |

Additional necessary running control: impact=false and deep_flexion=false, jump remains true → true, no errors, 2/2. D3 is deliberately not simulated using an invented scope. D2 proves multiplicity of the same flags does not explain this rejection, even if a source duplication is later confirmed.

## E. Classification and minimal conclusion

- R1 DUPLICATE_RESTRICTION: not demonstrated in production; missing canonical identity. No deduplication in this reader is demonstrated.
- R2 SCOPE_EXPANSION: unscoped propagation is demonstrated; *improper* expansion from a limited source scope is not, because that original scope has not been supplied or represented here.
- R3 LEGITIMATE_GLOBAL_RESTRICTION: global effective application is demonstrated, legitimacy of the original global decision remains unproven.
- R4 FEASIBILITY_OVERFILTER: conservative rejection on unknown compatibility is demonstrated. The claim that those movements should remain compatible is not demonstrated, so this bug classification is not asserted.
- R5 METHOD_INTENT_CATALOG_GAP: ruled out in the stated sense of no compatible intents independently of restrictions; the empty-restriction control is feasible with four matches.

Minimal demonstrated mechanism: the observed flags suffice to eliminate running movements and all squat-matching Box candidates. For Box the missing negative compatibility evidence, not a missing method or calendar day, explains the empty intent movement pool. Duplicate flag multiplicity is not causal. No clinical prohibition is declared erroneous.

Minimal proposed next step: capture WEEKLY_RESTRICTION_ORIGIN_DETAIL and correlate IDs/source with the source event's explicit intended scope. If a bounded scope is demonstrated, repair its representation/propagation rather than disabling valid global flags. If scope is legitimately global, audit and explicitly model compatibility evidence for the affected catalog IDs before considering an admission change. Do not remove flags, weaken unknown handling, or change box_technique automatically. No such repair is implemented.

## Diagnostic-only delivery

WEEKLY_RESTRICTION_ORIGIN_DETAIL adds id (validated UUID), source (modification_ledger/conversation only), constraint_level (hard/reassessment only), discipline and bounded emission metadata. Missing/unknown identity fields are omitted. It uses already loaded canonical notes; no new DB reads, no feasibility reevaluation and no contract/digest/receipt changes. Scope/status/authority/createdFromType/deduplicationKey are not fabricated. Raw movement text, clinical text, user identifiers, prompts and tokens are never emitted.

The new group is limited to 32 records plus one truncation summary; including existing groups the maximum is 128 log calls per diagnostic emission. Production must deploy the separate diagnostic commit before these identities can be observed. No deployment or push is performed by this audit.

Validation: 36 focused tests passed (canonical restriction projection, remaining diagnostic and causal ablations), including the existing enabled/disabled/throwing logger comparison of unchanged outcomes and feasibility call counts. TypeScript, lint of modified/new code files and diff-check passed. No functional authority file was modified.
