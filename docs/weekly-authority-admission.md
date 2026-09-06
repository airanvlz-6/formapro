# 2E.3A.4 — Weekly authority and session admission

## Audit before implementation

Baseline: `fc5fc9bd006afbc221c633689b5ca4fc5496cc73`.

| Evidence | Producer → consumer/verifier | Authentication, expiry and replay boundary | Bound before this phase |
| --- | --- | --- | --- |
| Generation token | `beginWeeklyGeneration` → Planner/Builder/save `resolveWeeklyGeneration` | HMAC `forge-week-generation-v1:`, user and captured current/next-week DB snapshots. Expires when the current Canary week changes. No active-generation register. | User, weeks and original snapshots/revisions. No chosen day/discipline/stimulus/intent/option or weekly contract digest. |
| Weekly contract v1 | `buildAllowedWeeklyPlanContract` → `composeBoundedWeek` / `validateWeeklySelection` | Pure deterministic SHA-256 context digest; immutable contract through at most two Planner attempts. Not itself an authenticated HTTP receipt. | Week, scope, daily option spaces, state/discipline/stimulus/intent and context. Selection restricted to day/optionId. No downstream binding. |
| Calendar receipt | `issueWeeklyCalendar` → weekly save `assertWeeklyCalendar` | HMAC `forge-week-calendar-v1:`, user/week, 30-minute TTL. Current scope/availability/frequency read at save; protected slot comparison. | Week, day, state and type. No stimulus, intent, optionId, contract/context digest or snapshot revision. |
| Session receipt / AllowedTrainingContract HMAC | `generateTrainingSession` → `verifySessionReceipt`, sports admission and session edits | One HMAC `forge-session-contract-v1:` over user, expiry, complete contract and structured proposal. 30-minute TTL, deterministic revalidation and rendering. There is no separate AllowedTrainingContract HMAC. | User, week/day, scope, discipline, stimulus, restrictions, movement/structure pools; explicit intent for contract v2. No weekly selection/contract binding. |
| Scope freshness | `assertCurrentPrescriptionScope` at session save/edit | Current profile and active training sources; checks discipline remains managed. No token/TTL. | Current ownership, not old weekly option identity. |
| Restriction freshness | `assertFreshSessionRestrictions` at save/edit | Authenticates session receipt, rereads `getCanonicalRestrictions`, compares state/areas/restrictions/reassessments/active; ignores only asOfDate in this existing comparison. | Any material change, stricter or relaxed, rejects. No weekly digest. |
| Prescription identity | `preparePrescriptionSessions` / `admitWeeklyCandidate` → `hasPrescriptionIdentityProof` | Process-local WeakMap proof: JSON cannot forge it. New IDs and exact server-selected survivor indices. | Exact candidate and original snapshot, not sports authority. |
| Strict mutation / CAS | `validatePlanMutation` → `createPlan` / `mutatePlanWithCAS` | Process-local WeakSet proof; create unique constraint, existing-row id/user/revision predicate and revision increment. No HTTP receipt or TTL. | Candidate, target and expected revision. Does not substitute for calendar/session evidence. |

## One versioned calendar mechanism

The existing HMAC envelope and 30-minute TTL remain. Calendar `protocolVersion: 2` is explicit **inside the authenticated payload**; the HMAC domain remains unchanged for legacy compatibility. `verifyWeeklyCalendarReceipt` is the only calendar cryptographic verifier.

The payload adds:

* `contractVersion`, `policyVersion`, `contractDigest`, `contextDigest`, `prescriptionScope`;
* `generationDigest`, binding the existing generation token without copying its snapshots into another client payload;
* `snapshotDigest`, covering the original persisted id/revision and complete sessions, including protected/completed content;
* `planning: { today, empezarHoy }`, preserving the original planning anchor;
* `admittedSlots`: canonical `day`, `targetDate`, `optionId`, `state`, `discipline`, `stimulusId`, `intent`, and the existing protected marker; existing survivors also have `protectedSessionDigest`.

Week and scope live once at the receipt root. Non-executable/protected slots do not invent a stimulus or intent. The receipt does not include medical snapshots, coaching text or complete profiles. Existing opaque user binding remains necessary for cross-user replay protection; receipts are never diagnostic logs.

`issueWeeklyCalendar` resolves each selected ID again through `validateWeeklySelection` against the server contract, compares calendar state/type, and constructs slots from those canonical options. It does not sign client copies of the sports tuple. A current-context check before returning the receipt catches changes during Planner composition.

## Builder and save converge

The weekly HTTP Builder always supplies a weekly proof object, even when the client omitted the receipt; omission therefore fails closed. The UI transports the calendar receipt, optionId, contract/context digests and target date. Discipline, stimulus, state, intent and supported title/focus fields are comparison-only. Mismatches reject before composition. The server reconstructs the request from the signed slot.

REST, UNAVAILABLE (including external/past days) and protected survivors return `WEEKLY_SLOT_NOT_EXECUTABLE`. Pending RECOVERY that is newly admitted can compose only its exact recovery stimulus and intent. Protected prior prescriptions are retained, not sent through Builder again.

The Builder reuses the freshly loaded per-discipline context and invokes the existing deterministic `buildAllowedTrainingContract` with the canonical tuple and explicit intent, producing v2. The existing session restriction read remains, and any change relative to the admitted context rejects. There is no pool expansion or replacement option.

The existing session HMAC now additionally binds `weekly: { calendarReceipt, optionId }`. Session verification invokes the same calendar verifier and slot resolver, checks exact discipline/stimulus/intent/state and scope, and then runs existing contract validation/rendering. Weekly save requires the exact calendar receipt used for each new executable session. It cannot combine sessions from alternative calendar selections, accept an unbound session, or replace a signed executable day with REST.

Save calls the same current-weekly-context verification, preserves the existing per-session restriction read immediately before persistence, and uses unchanged identity admission and CAS. Receipts are transient and stripped from persisted session content. Other session v1/v2 routes retain their existing compatibility; they do not acquire new weekly privileges.

## Freshness and replay

`assertFreshWeeklyAuthority` authenticates first, verifies the generation-token digest when supplied, reads the current target weekly row, and compares the snapshot digest. This read is for freshness only: the original signed snapshot remains the source of identity and expected CAS revision.

It then reuses `loadWeeklyPlanningContext`, which contains the previous read-only preparation logic, and rebuilds the pure weekly contract. Context and contract digests must remain identical. Reads are bounded per discipline/admission, not per enumerated option. Builder reuses those contexts rather than reading all sources/history again to construct its contract.

Scope, restrictions (including relaxed ones), normalized availability (including added days), external context, exposure context, frequency result, fixed/protected days and existing contract/policy versions are covered. The movement catalog has no independent version in this baseline; current enumeration and session feasibility use the deployed real catalog. No catalog version or new policy was invented.

Weekly context digest retains the previous phase's exact serialization, including canonical restriction `asOfDate`: equality is conservative and can require replanning even when a change would still permit the old option. No existing date/timezone calculation was changed.

The user's clarified replay boundary is **contract/context/revision**, not the most recent Planner call. Two proposals under the same immutable contract/context/revision may coexist within TTL. Their sessions cannot be mixed. Once one persists, the changed snapshot/revision rejects the other's old evidence; CAS remains the final protection against a concurrent write after the freshness read. Cross-table context reads are not an atomic DB transaction, matching the existing restriction freshness limitation. No durable revocation state or migration is introduced.

Legacy calendar receipts remain verifiable for legacy calendar callers but fail the new weekly Builder/save with `WEEKLY_RECEIPT_UPGRADE_REQUIRED`. Legacy session contracts v1 and unbound v2 retain existing non-weekly admission; both fail `WEEKLY_SESSION_CHAIN_MISMATCH` if presented as new weekly evidence. In-flight old weekly proposals require regeneration.

## Diagnostics

Search server logs for `WEEKLY_AUTHORITY_REJECTED`. Structured fields are only `code` and `protocolVersion: 2`. Typical codes are `WEEKLY_SLOT_MISMATCH`, `WEEKLY_SLOT_NOT_EXECUTABLE`, `WEEKLY_CONTEXT_STALE`, `WEEKLY_REVISION_STALE`, `WEEKLY_GENERATION_MISMATCH`, and `WEEKLY_RECEIPT_UPGRADE_REQUIRED`. Existing cryptographic envelope errors remain machine-readable. No receipt, hash value, profile identifier, restriction note or chat text is logged by the new diagnostic.

The weekly UI's Builder-result log now prints only success/code instead of the complete response, which contains the session receipt and contract.

## Regression evidence

`weeklyAuthorityBinding.test.mjs` uses real Planner preparation, canonical ID selection, calendar HMAC, current-state readers, Builder, contract v2, session HMAC, actual save-route statements, identity gate and persistence adapter with a local fake database. No production service or credential is used.

Production fixture: week 2026-09-07; box Tuesday/Thursday/Saturday; running Monday/Wednesday/Friday/Sunday; impact/jump/deep-flexion prohibited, axial load not prohibited. Thursday `box/fuerza_maxima/stimulus_only` reaches exactly `bench_press`, persists through the real route with six REST days and revision 1. The old infeasible stimuli remain excluded by unchanged phase 3 tests.

Tampering/replay tests cover option, day, date, week, state, discipline, stimulus, intent, contract/context digest, generation token, user, raw HMAC payload, supported UI fields, expiry, protocol/policy version, changed restrictions/scope/availability/revision/protected state, alternative-receipt mixing and legacy evidence. All Builder rejections assert zero LLM calls. Save rejection tests assert zero writes. Actual route tests for every catalog stimulus now obtain a real weekly receipt first.

Validation on this change: targeted receipt/Builder integration 113/113; calendar/availability/diagnostics 50/50; planning 377/377; sports 268/268; full lib 829/829. `npx tsc --noEmit --incremental false` and `git diff --check` pass. The new binding suite adds 44 tests. No production access, database migration or push.
