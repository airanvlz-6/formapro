# Phase 2D.3A.1: identity and sports writer convergence

A infrastructure, B1 focused writers and B2 weekly create/regenerate now share
strict PlanMutation and planPersistence. Weekly UPSERT and the legacy writer bridge
have been removed. planValidationPipeline retains internal content validation only;
it cannot issue receipts. Known sports writers converge; account administration
remains outside. This does not introduce canonical execution or DB changes.

## Server preparation and identity

1. Resolve an authorized DB snapshot in the server adapter (before proposal generation for weekly writes).
2. Determine whether there is a real change **before** generating IDs/timestamps.
3. For create/regenerate, call `preparePrescriptionSessions` with explicit `new`
   content or `survivor` snapshot indices. Indices reference the provided snapshot,
   never a calendar-slot heuristic. For new entries any supplied ID is overwritten.
4. Prepare the complete candidate with revision 1 for create or the snapshot
   revision for existing mutations. Include snapshot id/user on existing candidates.
5. Call strict `validatePlanMutation`, with `expectedRevision` for existing plans.
6. Only pass the opaque returned `mutation` receipt to `createPlan` or
   `mutatePlanWithCAS`. Rejected/failed validation has no receipt.

The identity proof is a process-local WeakMap capability, tied to the prepared
sessions and DB snapshot contents. JSON and structured clones cannot forge it.
This is **not** verification that the server caller actually read an authorized DB
snapshot: that responsibility stays in the server adapter. Do not deserialize
request data into trusted snapshot input. Complete candidate content is plain JSON.
No IDs are generated in validation or persistence. Proofs/receipts do not survive
process boundaries; prepare/validate/persist within the same server operation.

For patch/replace/completion/rest closure all session IDs and their order are
preserved. Summary cannot change session content. For weekly regeneration, retained
objects are copied from the snapshot and reconstructed decisions get new UUIDs,
even on the same day with identical content. Completed prescriptions cannot be
omitted or rebuilt. B2's explicit survivor policy is documented in weeklyConvergence.md.

UUID validation accepts canonical hyphenated hexadecimal UUID syntax and checks
uniqueness case-insensitively. New IDs are crypto.randomUUID (v4). The deployed CHECK
DDL is absent locally; equivalence with any additional DB version/variant restriction
cannot be certified here. No DB inspection or migration was performed.

## Revision and persistence

Revisions are positive JS safe integers. The candidate retains the snapshot
revision; only persistence computes +1. An existing revision at MAX_SAFE_INTEGER
rejects because its successor cannot be represented safely. This does not support
the entire PostgreSQL bigint domain: the SDK parses JSON numbers with JSON.parse.

Create uses INSERT revision 1. Existing mutations use one PATCH with id,
user_codigo and expected revision filters; no upsert, reread, retries or fallback.
Only explicit operation-specific top-level fields are sent. id, created_at,
user identity and arbitrary derived top-level fields are not forwarded in UPDATE.
Session JSON metadata is preserved as part of the validated prescription objects;
field-level content authority still belongs to the preparing server adapter.

PlanDatabase uses the installed SDK's own `from` type; actual adapter call sites
with SupabaseClient are compile-checked. A handwritten recursive fluent interface
exceeded TypeScript's generic instantiation depth and is not used. Tests use the
installed SDK with intercepted fetch, exercising its
actual select/maybeSingle and error decoding. They do not contact PostgreSQL or
prove real concurrency, trigger behavior, unique keys or deployed CHECK constraints.

## Results and retry boundary

- committed: exactly one returned row with expected identity and revision.
- conflict: UPDATE returns null without an error, or INSERT returns SQLSTATE 23505.
  Zero-row conflict does not distinguish stale revision, deletion or user change.
  Unique conflict reports the DB error; it does not guess which constraint failed.
- error: local invalid receipt, or structured SQLSTATE classes 22/23/40/42 or 57014
  accompanied by an HTTP error response. No commit is claimed.
- unknown: all thrown exceptions, SDK-wrapped transport errors/status 0, gateway
  responses, unclassified errors, PGRST116/multiple rows, missing create row,
  or unexpected returned identity/revision. No rollback or commit is claimed.

Classification is conservative; it does not detect timeouts from message text.
All unknown results need explicit reconciliation, never automatic replay. CAS
protects one statement from a stale revision; it does not guarantee exactly-once
delivery, freshness of a prior proposal or atomicity with secondary writes.
No-op detection stays outside the adapter. Calling it twice is not an idempotency
API. B1 delivers conflict/error/unknown with HTTP 200, ok:false, explicit code,
persistenceStatus, commitConfirmed:false and retryable:false. The existing apiCall
returns these bodies once. General frontend retries remain unchanged. A lost
HTTP response before this envelope reaches the browser can still trigger existing
transport retries; B1 does not claim end-to-end exactly-once execution.


## B1 no-ops and effects

Candidates keep the exact snapshot revision and all existing session IDs. Persistence
alone increments revision on a real write. Completion repetition, unchanged patch,
identical pending prescription, unchanged summary and zero changed rest flags never
write the plan. Existing response conventions remain (unchanged patch returns 400).
Pending no-op deliberately remains unresolved and does not generate a timestamp.

W5/W6 history is independent of the plan. W6 history can be recorded before a CAS
conflict and remains recorded; plan-dependent events run only after confirmation.
Pending audit, operational effects and resolution follow committed. W7 effects use
the committed candidate when rest flags change; with no rest change, normal closure
can proceed from the snapshot without inventing a commit. W8 insight generation
follows the confirmed summary change. None of these secondary writes is atomic
with the plan. Existing partial-success warnings remain.

## B2 closure boundary

Weekly generation captures signed current/next-week snapshots before proposals.
Save verifies the same user-bound context and rejects contexts from a previous
week. It never reloads a fresh revision. The signing key uses the existing server
service-role secret with domain separation; the token is not sent to the model.
The model receives snapshot content to supersede older conversational context.

Create uses INSERT; regenerate uses expectedRevision from that snapshot. Completed
objects are mandatory survivors, including future weeks; Focus cannot reconstruct
them. Explicit server-selected future survivors preserve their objects. Other
reconstructed future prescriptions get new UUIDs only after whole-week no-op
comparison. Calendar occupancy and global equality do not grant identity.

All known sports writes now use the common adapter. The account-code reassignment
and deletion paths remain administrative exceptions. No external DB function or
trigger exhaustiveness is claimed. REAL_DB_CAS_TEST: NOT EXECUTED; no configured,
verified isolated DB test mechanism was found. SDK transport contracts are tested.
