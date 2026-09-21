# Chat: structured provider boundary

BUG #1 identity and longitudinal grounding are validated in Production. BUG #2
was demonstrated as two generation parsing failures before review. This change
is local; no Production acceptance is claimed.

## Domain and wire contracts

The domain remains answer, grounding [{fact,value}], evidence [{quote,kind}],
interpretation, decision and optional actions. Existing factual checks and action
authorities remain responsible for those values.

Anthropic's structured-output subset requires closed objects and does not support
recursive schemas. An arbitrary JSON value and open nested prescription payload
cannot faithfully be represented by a fixed finite closed schema. A dynamically
compiled schema containing athlete values would also be inappropriate. Therefore
the static wire schema uses grounding [{fact,valueJson}] and actionsJson [string].
Each string contains one complete JSON value/action. This preserves nested arrays,
objects, nulls, scalars, arbitrary discipline/movement identifiers and all current
adapt_session (TRAIN/REST), record_performed and record_response payloads.

The remaining wire fields retain their domain types. All wire fields are required,
all schema objects set additionalProperties:false. No athlete data enters schemas.
Actions absent in a domain response are represented as actionsJson:[] by the model.
Forge decodes the strings, then uses the unchanged domain validators. Bad embedded
metadata becomes unverified; bad action entries remain invalid candidates and are
rejected by action authority. Neither invalid leaf can authorize a write or learning.
Neither invalid leaf automatically discards a separately reviewed answer.

This is a transport codec, not provider validation of embedded JSON semantics:
Structured Outputs guarantees the outer shape in normal completion; Forge must
still parse the embedded strings and verify their contents. JSON escaping increases
output size. No token budget, model or timeout was increased.

Generation and both repair attempts use COACH_GENERATION_FORMAT through
output_config.format on the existing raw-fetch Messages API. Review uses the
separate COACH_REVIEW_FORMAT: {supported:boolean,unsupportedClaims:string[]}.
Legacy action/learning calls do not accidentally receive the Generation schema.
No additional provider request is introduced. Initial schema compilation can add
latency; malformed/truncated outputs and provider refusals remain possible.

Reference: https://platform.claude.com/docs/en/build-with-claude/structured-outputs

## Parsing and repair

parseCoachObject accepts a complete object document with exterior whitespace or
one entire triple-backtick block labelled json (or unlabelled). It does not search
for braces, strip surrounding prose, append missing delimiters or repair syntax.
Arrays, null and scalar roots fail. A legacy domain object is also accepted for
defensive compatibility; free prose is no longer accepted as answer.

The parsed and decoded object is shared with metadata validation: no second parse
of the original fenced transport. Review uses the same strict document parser but
its own schema and unchanged semantic admission checks.

Repair is still limited to two generations. Closed error codes select concrete
instructions without including the failed response or raw exception messages.
Both attempts use the same schema. Transport exceptions retain existing behavior;
this change does not introduce HTTP retries or increase the 120-second timeout.

## Post-answer validator classification

| Class | Conditions | Outcome |
|---|---|---|
| A: format/integrity | Unparseable/non-object document, empty/invalid answer, oversized answer or executable tags | Retry within existing two attempts, then existing fallback |
| A: review unavailable | Review provider failure, unparseable/invalid review | Existing retry/fallback; factual approval cannot be assumed |
| B: metadata | Invalid schema, mismatched canonical value, invalid evidence | extractionVerified=false; preserve answer for mandatory independent review; no learning from rejected extraction |
| B: factual assertions | Review rejects unsupported factual assertions, invented execution/recovery or unconfirmed saved-state claims | Existing retry/fallback; no factual review bypass |
| C: sports conflicts | Availability, discipline, restrictions, equipment, unknown movement, load or divergence from plan | No new answer veto; action authority can reject candidate while reviewed coaching survives |
| D: mutation | Scope/identity/target, action review, integrity, freshness, receipts/CAS, DB failure | Existing rejected/unknown action result; retain answer and existing unconfirmed-save notice |
| D: optional learning/history | Failed verification, learning persistence or history CAS | Existing pipeline failure metadata; retain answer |

No sport-conflict validator needed to be changed from terminal to nonterminal:
these action failures were already isolated by applyChatCoachActions/runChatCoach.
Their existing behavior is now tested with wire-decoded answers. Review remains
model-based, so a semantic misclassification by the real reviewer is still possible;
synthetic tests do not establish real-model semantic accuracy.

After answerGroundedChat returns, action execution, learning verification/persistence
and history writes are individually contained. Unexpected programming exceptions
in the remaining unguarded result formatting/bookkeeping can still reach the outer
catch. They are not intentional sports-policy vetoes and were not broadly swallowed.

## Diagnostics and scope

Existing CHAT_GROUNDING_OPERATION, CHAT_COACH_OPERATION and CHAT_COACHING_PIPELINE
remain. response.parse covers normalization plus decoding; answer/metadata/review
operations distinguish later validation. Pipeline actions failures and mutation
flags distinguish mutation rejection from coachingResponseProduced. Only the closed
CHAT_RESPONSE_OBJECT_REQUIRED code is added. No payload, schema, prompt, response
or raw error is logged. The completion format is supplied even when tracing is off.

Weekly, Session, grounding, action vocabulary/validators, ownership, receipts, CAS,
identity, history limit, persistence, provider, model and timeout remain unchanged.
The acceptance tests compare diagnostics ON/OFF outputs, exceptions, requests and
DB effects, including schema selection by the real route adapter with synthetic HTTP.

No real provider or Production reproduction was executed during local validation.

## Local validation (2026-09-21)

- Complete suite: 2628 passed, zero failed/skipped.
- Final Chat/Coach/diagnostics selection: 116 passed, zero failed/skipped. This
  includes the final additional malformed-value/undefined-fact regression and its
  metadata hardening, added after the complete suite had started.
- TypeScript --noEmit and git diff --check: passed.
- Diagnostics ON/OFF: results, exceptions, requests (including provider schemas)
  and DB effects compared; broken log sinks also covered.
- Source comparison: grounding and factual-review prompt unchanged; no changes to
  Weekly, Session, shared sports authorities, actions or persistence implementations.
- Privacy review: static schemas, no new content logging; only a closed error code.
