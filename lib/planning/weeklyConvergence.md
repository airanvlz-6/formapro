# B2 transformation audit (before identity admission)

- Orchestrator/Planner/Session Builder, duplicate retry, forced discipline and integrity correction: NEW_PRESCRIPTION; all are unadmitted proposal content. UUID assignment happens after final server preparation.
- Scientific rules: all ten current rules append validator notes (METADATA_ONLY) to unadmitted proposal objects. They cannot overwrite a completed snapshot survivor.
- Completed merge: PRESERVE_EXISTING_PRESCRIPTION from the exact generation snapshot, mandatory in current AND future weeks. Calendar day only reserves its occupied slot, never establishes identity. Missing completed objects are restored.
- Future objects explicitly selected by a server adapter snapshot index: PRESERVE_EXISTING_PRESCRIPTION. No client survivor index/ID is trusted.
- Focus whitelist external reconstruction: NEW_PRESCRIPTION. No reliable adaptation signal exists in this flow. Completed objects bypass reconstruction. Explicit untouched snapshot survivors can be retained by server code.
- Omitted future sessions: DROP_PRESCRIPTION. IDs are never recycled.
- Rest and Sin registrar objects: NEW_PRESCRIPTION when newly constructed; no special identity exemptions.
- Week normalization/defaults: METADATA_ONLY; the target is resolved against the pre-generation context. Current/future semantics otherwise remain.
- Forced-discipline event currently records generation before save. Move sports success audit after committed; unsuccessful proposals must not create plan-change events.

Snapshot transport: server-signed, user-bound exact current/next-week snapshots captured before generation. Save verifies the envelope and never rereads a newer revision. No client-provided snapshot or revision is accepted without server attestation. This is provenance, not a new authentication mechanism. Missing/invalid context rejects.

No-op: compare the final week write fields and calendar-ordered session content before UUID/time assignment, ignoring only session identity and write timestamps/revision. Equality suppresses the entire mutation; it does not establish identity for individual rebuilt sessions when another part of the week changes.


## Implementation and closure audit

- beginWeeklyGeneration reads exact current/next snapshots before any generator.
  The HMAC token is bound to the user and uses the existing server-only service-role
  secret with a distinct domain. Verification rejects tampering, another user and
  a previous calendar week. Tokens never enter LLM prompts. No DB table/cache/RPC is
  added. Token size scales with snapshot JSON; key rotation invalidates old tokens.
- Both Orchestrator and Coach PLAN parser carry that context. Existing transport
  retries are unchanged; the explicit post-save verification/re-save is removed.
  The parser suppresses LLM success text if persistence is unconfirmed.
- Weekly save has no weekly_plan read or direct write. It verifies the captured
  snapshot, restores completed objects, performs Focus reconstruction, validates
  existing restrictions, eliminates no-op, admits UUIDs and calls the strict gate.
- No current Focus transform has an explicit same-prescription adaptation signal.
  Rebuilt future external objects are conservatively NEW. The server helper supports
  explicitly retained snapshot indices; request JSON cannot select those indices.
- Future-week regeneration no longer advances the cycle as if it were a new week.
  Cycle/outcome/log/events and forced-discipline success audit run after committed.
  SDK-returned errors and exceptions from these effects are surfaced as warnings.
- Fresh AST and text audit: sports INSERT and UPDATE only in planPersistence;
  account-code dynamic UPDATE and account-deletion DELETE remain administrative.
  All other local weekly_plan accesses are reads. Visible RPC call sites are mode
  changes/physiology paths, not a weekly persistence fallback; remote definitions
  and triggers are not available for verification.
- legacyPlanMutation.ts removed after consumer search. Its generic validation runner
  moved to planValidationPipeline.ts and still cannot issue persistence receipts.

REAL_DB_CAS_TEST: NOT EXECUTED. No Supabase test configuration, local SQL migrations,
container setup or verified isolated DB mechanism exists in this checkout. No
production data was touched. Unit and installed SDK tests do not prove real DB
concurrency, deployed constraints, triggers or multitable atomicity.

Remaining limits: existing transport retries on a lost HTTP response; secondary
writes are non-atomic; admin bypasses; signing-key rotation; snapshots without valid
IDs/revision reject when a mutation is attempted. No exactly-once guarantee.
Next work is canonical execution admission/linkage/audit in a separate phase,
not further weekly identity reuse or a broad account-authority migration.
