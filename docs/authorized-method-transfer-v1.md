# Deterministic method transfer v1

## Scope

The resolver is connected to the strategic Weekly Contract path. No production equivalence is introduced: METHOD_TRANSFER_RELATIONS ships empty. Existing deload still offers only running_recovery and box_technique. Tests use explicitly synthetic relations between cataloged methods; they are engine fixtures, not sports recommendations. The legacy substitutionEngine is not used.

## Domain relation

MethodTransferRelation lives beside TRANSFER_METHODS in lib/sports/goalTransferModel.ts:

- id: bounded catalog identifier, not user prose.
- fromAdaptationId and fromDiscipline: explicit source demand and discipline; source must exist in the method catalog.
- toMethodId: exact existing target method.
- transferKind: EQUIVALENT, MAINTENANCE or PARTIAL.
- applicableStrategies and applicablePhases: required nonempty allowlists of existing IDs/enums. V1 has no implicit wildcard.
- requiredAvailabilityPermission: SAME_DISCIPLINE or CROSS_TRAINING; validated against source/target disciplines.
- priority: nonnegative safe integer; ties use relation ID.

The model does not infer method similarity, create arbitrary secondary demands or accept relations from a request/LLM. Relation IDs, kinds, strategy/phase and source adaptation are revalidated when an intent enters a training contract.

## Resolver and integration

lib/planning/authorizedMethodCandidates.ts exports resolveAuthorizedMethodCandidates. buildAllowedWeeklyPlanContract calls it for each nonfixed day when a structured strategy exists, before coverage validation, Planner selection and signing. Generic stimulus-only planning keeps its previous path.

1. Enumerate exact methods using the existing discipline/stimulus/strategicIntents order and the unchanged feasibility function.
2. If any exact method for a demand is viable on that day, do not expand that demand. Viability on another day does not suppress an otherwise authorized fallback on this day.
3. For remaining active demands, consider declared relations in priority/ID order; filter strategy, phase, managed scope and explicit day permissions.
4. Deduplicate by source adaptation + target method + target discipline + transfer provenance. Identical equivalent relations select the first deterministic relation ID. Different provenance is preserved.
5. Evaluate each target method/pattern using evaluateTrainingFeasibility with the same restrictions, exposure and intent validation. Unknown compatibility remains inadmissible.
6. Return only viable options. Never expand from the target to another target: one hop, at most 128 relation rows and 256 expanded method-pattern candidates per day. Oversized/conflicting catalogs fail closed; no silent candidate truncation.

Exact option IDs and serialized contracts remain unchanged when no transfers are admitted. New option IDs include source adaptation and relation ID, preventing a transferred option from colliding with an exact one. Input context digest and existing receipt contract digest bind the authorized options through normal freshness verification.

## Availability boundary

SAME_DISCIPLINE requires both the ordinary day permission and the domain relation's matching source/target discipline. Global management of two disciplines never grants cross-training.

CanonicalTransferPermissions is a separate, server-owned, serializable future interface: version=1, source=canonical_availability, and directed day/fromDiscipline/toDiscipline grants. No current adapter produces it and no request or UI field is forwarded. Without it CROSS_TRAINING is ineligible, even if both disciplines are managed.

Unit fixtures demonstrate explicit grants in the resolver/Weekly Contract, including feasibility under the resulting effective day permission. This does not claim end-to-end production cross-training: there is no current canonical persistence/confirmation authority for those grants, and receipt/calendar adapters continue enforcing existing availability. A future rollout must wire that canonical authority and effective availability consistently through fresh reads, receipts and final calendar validation before enabling cross-discipline relations. This version changes neither onboarding nor daily availability semantics.

## Intent, coverage and Builder

Legacy StrategicIntent remains unchanged and means EXACT. A transferred intent adds transfer={relationId,fromAdaptationId,provenance}; adaptationId/stimulus/pattern describe the actual target method, not a falsely claimed original stimulus.

Coverage treats TRANSFER_EQUIVALENT as satisfying its source adaptation. TRANSFER_MAINTENANCE and TRANSFER_PARTIAL cannot satisfy that full coverage group. They may provide executable work while the original demand remains DEFERRED. A partial target does not masquerade as exact coverage of its own target adaptation either. When transfers are present, strategy.transferCoverage records available EXACT/TRANSFER_* statuses and deferred demands. This is domain availability accounting; daily diagnostics identify the selected option's actual provenance.

The signed weekly slot already serializes the complete intent; the receipt also preserves strategy coverage. Builder reads that slot and revalidates it through the existing training contract. It does not search for alternatives. A direct unsigned transfer request fails with TRANSFER_REQUIRES_WEEKLY_AUTHORITY before reads/LLM. Altered signed provenance fails the existing slot comparison. Session receipts retain the authorized training intent through the existing mechanism.

No clinical restrictions, unknown policy, GoalResolution, StrategyResolution, temporal logic, generation cap or REST scoring changed. No prompt changes were needed: the Planner already chooses exact option IDs, and the Builder already composes within the canonical intent and allowed IDs. No schema migration is required.

## Diagnostics

WEEKLY_TRANSFER_CANDIDATE_DETAIL is flat JSON containing catalog adaptationId/methodId/discipline, EXACT or TRANSFER_* provenance, transferKind, availabilityPermission, strategyEligible, phaseEligible, feasibilityResult and allowlisted errorCodesCsv. Filtered relations are NOT_EVALUATED or carry a structured scope/permission denial. No names, raw clinical data, user IDs, tokens or prompts are included. Logger failure cannot change candidates. With an empty relation catalog there are no new candidate logs; existing diagnostics remain intact.

## Verification

authorizedMethodCandidates.test.mjs covers T1–T14, including byte-identical viable exact results, real feasibility of a synthetic fallback, all candidates rejected, strategy/phase filtering, explicit vs absent cross-training grants, unknown rejection, deduplication/order/cycles/bounds, full vs partial coverage, direct unsigned rejection and the real Planner→receipt→Builder path. The preceding audit tests are retained as regressions with the empty production relation catalog. The test runtime's export wrapper permits observing feasibility calls across the newly extracted module; it is test-only.

Limitations: no reviewed production relation yet; no production cross-training permission authority; no multi-hop search; no arbitrary adaptation substitution; no claim that five available days imply a safe executable option. Activating a sports relation requires a domain justification and tests for its method, phase, safety evidence, coverage and dose semantics.

Validation: 17 resolver/authority tests passed (T1–T14 plus logger and receipt invalidation checks); complete suite 1435/1435 passed; TypeScript and diff-check passed. Lint introduces no new findings: touched files retain 22 preexisting errors (allowedWeeklyPlanContract 2, sessionAuthority 19, trainingContractTestRuntime 1), identical to the base. New engine/tests and other touched files are lint-clean.
